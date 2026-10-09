/**
 * room.ts — the authoritative game room.
 * One Room instance per room name ('main' | 'lab').
 * SPEC.md §9, GAMERULES.md §2–§14.
 */

import { stepPlayer, settlePosition, mulberry32, sweptCircleRect, sweptCircleCircle, segmentIntersectsRect, moverPath, MOVER_PATTERNS } from '@nobu/shared/sim';
import type { Rect, Vec2, MoverPattern, MoverCfg } from '@nobu/shared/sim';
import type {
  InputEntry, MsgSnap, PlayerSnap, ProjectileSnap,
  MatchState, GameEvent, MatchResults, ScoreEntry,
} from '@nobu/shared/protocol';
import { encodeServer } from '@nobu/shared/protocol';
import GAME from '@nobu/shared/config/game.js';
import NET from '@nobu/shared/config/net.js';
import { BotController } from '../bots.js';
import { pickSpawnPoint } from './spawn.js';
import type { PlayerState, ProjectileState, RoomState } from './state.js';
import { Metrics } from '../metrics.js';
import { performance } from 'perf_hooks';

// ─── constants ────────────────────────────────────────────────
const SIM_HZ = GAME.sim.hz;
const SNAP_HZ = NET.snapshotHz;
const SNAP_EVERY = Math.round(SIM_HZ / SNAP_HZ); // 2 ticks
const OBSTACLES = GAME.obstacles as readonly Rect[] as Rect[];
const ARENA_W = GAME.arena.width;
const ARENA_H = GAME.arena.height;
const P_RADIUS = GAME.player.radius;
const PROJ_RADIUS = GAME.projectile.radius;
const PROJ_SPEED = GAME.projectile.speed;
const PROJ_LIFETIME_TICKS = Math.round(GAME.projectile.lifetimeMs * SIM_HZ / 1000);
const RESPAWN_TICKS = Math.round(GAME.player.respawnDelayMs * SIM_HZ / 1000);
const PROTECT_TICKS = Math.round(GAME.player.spawnProtectionMs * SIM_HZ / 1000);
const FIRE_COOLDOWN_TICKS = Math.round(GAME.player.fireCooldownMs * SIM_HZ / 1000);
const COUNTDOWN_TICKS = Math.round(GAME.match.countdownMs * SIM_HZ / 1000);
const RUNNING_TICKS = Math.round(GAME.match.durationMs * SIM_HZ / 1000);
const ENDED_TICKS = Math.round(GAME.match.endedMs * SIM_HZ / 1000);
const MIN_PARTICIPANTS = GAME.match.minParticipants;
const MAX_PARTICIPANTS = GAME.match.maxParticipants;
const TARGET_BOTS = GAME.bots.targetParticipants;
const BOT_NAMES: readonly string[] = GAME.bots.names;
const EVENT_REDUNDANCY_TICKS = Math.round(NET.eventRedundancyMs * SIM_HZ / 1000);
const MAX_INPUTS_PER_MSG = NET.maxInputsPerMessage;
const BACKLOG_THRESHOLD = NET.inputBacklogCatchup.threshold;
const BACKLOG_MAX_PER_TICK = NET.inputBacklogCatchup.maxPerTick;

const MOVE_CFG = {
  speed: GAME.player.speed,
  radius: P_RADIUS,
  arenaW: ARENA_W,
  arenaH: ARENA_H,
  obstacles: OBSTACLES,
  hz: SIM_HZ,
};

const MOVER_CFG: MoverCfg = { speed: GAME.lab.moverSpeed, stopGo: GAME.lab.stopGo };

type SendFn = (playerId: number, msg: string) => void;
/** Sends to every spectator connection in the room. */
type SpectatorFn = (msg: string) => void;

/** A scripted lab mover (PHASES.md C3). Position = moverPath(pattern, tick / SIM_HZ). */
interface MoverState {
  id: number;
  pattern: MoverPattern;
  x: number;
  y: number;
}

let nextPlayerId = 1;

export class Room {
  readonly name: string;
  readonly roomCfg: { bots: boolean; firing: boolean; timed: boolean; movers: boolean };

  private state: RoomState;
  private botCtrl: BotController;
  private botSeqMap = new Map<number, number>();
  private rng = mulberry32(GAME.bots.seed + 1); // separate from bot rng
  readonly metrics = new Metrics();

  /** Scripted movers, keyed by pattern. Kept out of `players` (no player cap, no inputs). */
  private movers = new Map<MoverPattern, MoverState>();
  private spectators = 0;

  // Send callbacks injected at construction
  private sendFn: SendFn;
  private spectatorFn: SpectatorFn;

  constructor(
    name: string,
    sendFn: SendFn,
    spectatorFn: SpectatorFn
  ) {
    this.name = name;
    this.roomCfg = (GAME.rooms as Record<string, typeof this.roomCfg>)[name] ?? {
      bots: false, firing: false, timed: false, movers: false,
    };
    this.sendFn = sendFn;
    this.spectatorFn = spectatorFn;
    this.botCtrl = new BotController();

    this.state = {
      // Untimed rooms (lab) are a sandbox that is always RUNNING (GAMERULES.md §14).
      matchState: this.roomCfg.timed ? 'WAITING' : 'RUNNING',
      tick: 0,
      serverTime: 0,
      countdownTicksLeft: 0,
      runningTicksLeft: 0,
      endedTicksLeft: 0,
      players: new Map(),
      projectiles: new Map(),
      events: [],
      nextEid: 1,
      nextProjectileId: 1,
      leftPlayers: [],
    };
  }

  // ── Public API ───────────────────────────────────────────────

  get playerCount(): number { return this.state.players.size; }
  get spectatorCount(): number { return this.spectators; }
  get activeMovers(): MoverPattern[] { return [...this.movers.keys()]; }

  addSpectator(): void { this.spectators++; }

  removeSpectator(): void {
    this.spectators = Math.max(0, this.spectators - 1);
    this.clearMoversIfEmpty();
  }

  /**
   * Replace the set of active movers (lab rooms only). Returns false when the
   * room doesn't allow movers. New movers take ids from the player id counter
   * so they never clash with players.
   */
  setMovers(patterns: readonly MoverPattern[]): boolean {
    if (!this.roomCfg.movers) return false;
    const wanted = new Set(patterns);
    for (const pattern of [...this.movers.keys()]) {
      if (!wanted.has(pattern)) this.movers.delete(pattern);
    }
    for (const pattern of MOVER_PATTERNS) {
      if (wanted.has(pattern) && !this.movers.has(pattern)) {
        this.movers.set(pattern, { id: nextPlayerId++, pattern, x: 0, y: 0 });
      }
    }
    this.stepMovers();
    return true;
  }

  isFull(): boolean {
    return this.state.players.size >= MAX_PARTICIPANTS;
  }

  addPlayer(name: string, isBot = false): number {
    const id = nextPlayerId++;
    const spawnPos = pickSpawnPoint(this.state.players, this.rng);
    const p: PlayerState = {
      id, name: name.slice(0, GAME.player.maxNameLength), bot: isBot,
      x: spawnPos.x, y: spawnPos.y,
      alive: this.state.matchState === 'RUNNING',
      life: 0,
      respawnTicksLeft: 0,
      protectionTicksLeft: this.state.matchState === 'RUNNING' && this.roomCfg.firing ? PROTECT_TICKS : 0,
      fireCooldownTicks: 0,
      score: 0,
      inputQueue: [],
      lastConsumedSeq: 0,
      left: false,
    };
    this.state.players.set(id, p);
    if (isBot) {
      this.botCtrl.addBot(id);
      this.botSeqMap.set(id, 0);
    }
    this.emitEvent({ type: 'PLAYER_JOIN', playerId: id });
    this.metrics.counters.playerJoins++;
    this.checkMatchTransition();
    return id;
  }

  removePlayer(id: number): void {
    const p = this.state.players.get(id);
    if (!p) return;
    // Remove their projectiles immediately
    for (const [pid, proj] of this.state.projectiles) {
      if (proj.ownerId === id) this.state.projectiles.delete(pid);
    }
    this.state.leftPlayers.push({ id, name: p.name, score: p.score });
    this.state.players.delete(id);
    if (p.bot) {
      this.botCtrl.removeBot(id);
      this.botSeqMap.delete(id);
    }
    this.emitEvent({ type: 'PLAYER_LEAVE', playerId: id });
    this.metrics.counters.playerLeaves++;

    // If last human leaves, clear bots and return to WAITING
    const hasHumans = [...this.state.players.values()].some(pl => !pl.bot);
    if (!hasHumans && this.roomCfg.bots) {
      for (const [bid, bp] of this.state.players) {
        if (bp.bot) this.removePlayer(bid);
      }
      this.state.matchState = 'WAITING';
    }
    this.clearMoversIfEmpty();
  }

  /** Nobody left to watch: start the next session with movers off. */
  private clearMoversIfEmpty(): void {
    if (this.state.players.size === 0 && this.spectators === 0) this.movers.clear();
  }

  receiveInput(playerId: number, inputs: InputEntry[]): void {
    const p = this.state.players.get(playerId);
    if (!p) return;
    // Rate limit: at most MAX_INPUTS_PER_MSG entries
    const limited = inputs.slice(-MAX_INPUTS_PER_MSG);
    for (const inp of limited) {
      if (inp.s <= p.lastConsumedSeq) continue; // stale/dup
      // Insert sorted
      const idx = p.inputQueue.findIndex(q => q.s > inp.s);
      if (idx === -1) p.inputQueue.push(inp);
      else p.inputQueue.splice(idx, 0, inp);
    }
    this.metrics.counters.playerInputs++;
  }

  receivePerturb(playerId: number, dx: number, dy: number): void {
    if (!NET.debug.allowPerturb) return;
    const p = this.state.players.get(playerId);
    if (!p || !p.alive) return;
    const pos = settlePosition({ x: p.x + dx, y: p.y + dy }, MOVE_CFG);
    p.x = pos.x;
    p.y = pos.y;
  }

  /** `playerId` null builds a spectator snapshot (ack 0). */
  buildSnapshot(playerId: number | null): MsgSnap {
    const { tick, serverTime, matchState, players, projectiles, events } = this.state;
    const player = playerId === null ? undefined : players.get(playerId);
    const matchSnap = {
      state: matchState as MatchState,
      timeLeftMs: matchState === 'RUNNING'
        ? (this.state.runningTicksLeft * 1000 / SIM_HZ)
        : matchState === 'COUNTDOWN'
        ? (this.state.countdownTicksLeft * 1000 / SIM_HZ)
        : matchState === 'ENDED'
        ? (this.state.endedTicksLeft * 1000 / SIM_HZ)
        : 0,
      results: matchState === 'ENDED' ? this._matchResults : null,
    };
    const projSnaps: ProjectileSnap[] = [...projectiles.values()].map(proj => ({
      id: proj.id,
      owner: proj.ownerId,
      x: proj.x, y: proj.y,
      dx: proj.dx, dy: proj.dy,
    }));
    const playerSnaps: PlayerSnap[] = [...players.values()].map(p => ({
      id: p.id,
      name: p.name,
      bot: p.bot,
      x: p.x, y: p.y,
      alive: p.alive,
      life: p.life,
      protectMs: p.protectionTicksLeft * 1000 / SIM_HZ,
      respawnMs: p.respawnTicksLeft * 1000 / SIM_HZ,
      score: p.score,
    }));
    // Movers look like remote players to clients, so interpolation (and later
    // sync models) handle them without special cases.
    for (const m of this.movers.values()) {
      playerSnaps.push({
        id: m.id, name: m.pattern.toUpperCase(), bot: true,
        x: m.x, y: m.y, alive: true, life: 1,
        protectMs: 0, respawnMs: 0, score: 0, mover: m.pattern,
      });
    }
    return {
      t: 'snap',
      tick,
      st: serverTime,
      ack: player?.lastConsumedSeq ?? 0,
      match: matchSnap,
      players: playerSnaps,
      projectiles: projSnaps,
      events,
    };
  }

  /**
   * One simulation tick. Called by the server loop.
   * Returns the processing time in ms.
   */
  tick(): number {
    const t0 = performance.now();
    this.state.tick++;
    this.state.serverTime += 1000 / SIM_HZ;

    // 1. Bots generate inputs
    if (this.roomCfg.bots) {
      const botInputs = this.botCtrl.tick(this.state.players, this.botSeqMap);
      for (const [id, inp] of botInputs) {
        const p = this.state.players.get(id);
        if (p) p.inputQueue.push(inp);
      }
    }

    // 2. Consume inputs + movement
    for (const p of this.state.players.values()) {
      let consumed = 0;
      const maxConsume = p.inputQueue.length > BACKLOG_THRESHOLD
        ? BACKLOG_MAX_PER_TICK : 1;

      while (p.inputQueue.length > 0 && consumed < maxConsume) {
        const inp = p.inputQueue[0];
        // Discard if stale (already consumed higher seq)
        if (inp.s <= p.lastConsumedSeq) { p.inputQueue.shift(); continue; }
        p.inputQueue.shift();
        p.lastConsumedSeq = inp.s;
        consumed++;

        if (this.state.matchState === 'RUNNING' && p.alive) {
          // Quantize aim per spec
          const aimQ = Math.round(inp.a * 1000) / 1000;
          const newPos = stepPlayer({ x: p.x, y: p.y }, inp.k, MOVE_CFG);
          p.x = newPos.x;
          p.y = newPos.y;
          this.metrics.counters.playerMoves++;

          // Fire
          if (
            inp.f &&
            this.roomCfg.firing &&
            p.fireCooldownTicks === 0
          ) {
            this.spawnProjectile(p, aimQ);
          }
        }
      }

      // Decrement cooldown
      if (p.fireCooldownTicks > 0) p.fireCooldownTicks--;
    }

    // 2b. Scripted movers follow their path in server time
    this.stepMovers();

    // 3. Step projectiles (swept collision)
    this.stepProjectiles();

    // 4–5. Deaths handled in stepProjectiles. Decrement timers.
    for (const p of this.state.players.values()) {
      if (!p.alive) {
        p.respawnTicksLeft--;
        if (p.respawnTicksLeft <= 0) {
          this.respawnPlayer(p);
        }
      } else {
        if (p.protectionTicksLeft > 0) p.protectionTicksLeft--;
      }
    }

    // 6. Match state machine
    this.stepMatchState();

    // 7. Send snapshots every SNAP_EVERY ticks
    if (this.state.tick % SNAP_EVERY === 0) {
      this.sendSnapshots();
    }

    // 8. Prune old events
    this.pruneEvents();

    const elapsed = performance.now() - t0;
    this.metrics.recordTick(elapsed);
    return elapsed;
  }

  // ── Internal helpers ─────────────────────────────────────────

  private emitEvent(partial: Partial<GameEvent> & { type: GameEvent['type'] }): void {
    const ev: GameEvent = {
      ...partial,
      eid: this.state.nextEid++,
      tick: this.state.tick,
    };
    this.state.events.push(ev);
  }

  private stepMovers(): void {
    const tSec = this.state.tick / SIM_HZ;
    for (const m of this.movers.values()) {
      const pos = moverPath(m.pattern, tSec, MOVER_CFG);
      m.x = pos.x;
      m.y = pos.y;
    }
  }

  private pruneEvents(): void {
    const cutoff = this.state.tick - EVENT_REDUNDANCY_TICKS;
    this.state.events = this.state.events.filter(e => e.tick >= cutoff);
  }

  private spawnProjectile(owner: PlayerState, aim: number): void {
    const cos = Math.cos(aim);
    const sin = Math.sin(aim);
    const spawnX = owner.x + cos * (P_RADIUS + PROJ_RADIUS + 1);
    const spawnY = owner.y + sin * (P_RADIUS + PROJ_RADIUS + 1);

    // If spawn point crosses an obstacle, destroy immediately
    const ownerPos = { x: owner.x, y: owner.y };
    const spawnPos = { x: spawnX, y: spawnY };
    for (const obs of OBSTACLES) {
      if (segmentIntersectsRect(ownerPos, spawnPos, obs)) return;
    }

    const id = this.state.nextProjectileId++;
    this.state.projectiles.set(id, {
      id, ownerId: owner.id,
      x: spawnX, y: spawnY,
      dx: cos, dy: sin,
      ticksLeft: PROJ_LIFETIME_TICKS,
    });
    owner.fireCooldownTicks = FIRE_COOLDOWN_TICKS;
    this.emitEvent({ type: 'PLAYER_FIRE', playerId: owner.id, projectileId: id });
    this.emitEvent({ type: 'PROJECTILE_SPAWN', projectileId: id, x: spawnX, y: spawnY });
    this.metrics.counters.shots++;
  }

  private stepProjectiles(): void {
    const speed = PROJ_SPEED / SIM_HZ;
    const toRemove: number[] = [];

    for (const proj of this.state.projectiles.values()) {
      if (proj.ticksLeft <= 0) { toRemove.push(proj.id); continue; }
      proj.ticksLeft--;

      const p0: Vec2 = { x: proj.x, y: proj.y };
      const p1: Vec2 = { x: proj.x + proj.dx * speed, y: proj.y + proj.dy * speed };

      // ── Nearest hit along segment ────────────────────────────
      let hitT = 1;
      let hitType: 'obstacle' | 'boundary' | 'player' | null = null;
      let hitPlayer: PlayerState | null = null;

      // Test obstacles (expanded by proj radius)
      for (const obs of OBSTACLES) {
        const t = sweptCircleRect(p0, p1, PROJ_RADIUS, obs);
        if (t !== null && t < hitT) { hitT = t; hitType = 'obstacle'; }
      }

      // Test arena boundary
      const bx0 = PROJ_RADIUS;
      const by0 = PROJ_RADIUS;
      const bx1 = ARENA_W - PROJ_RADIUS;
      const by1 = ARENA_H - PROJ_RADIUS;
      if (p1.x < bx0 || p1.x > bx1 || p1.y < by0 || p1.y > by1) {
        // Simple: if any boundary is hit
        const tBoundary = Math.min(
          p1.x < bx0 ? (bx0 - p0.x) / (p1.x - p0.x + 1e-10) : 1,
          p1.x > bx1 ? (bx1 - p0.x) / (p1.x - p0.x + 1e-10) : 1,
          p1.y < by0 ? (by0 - p0.y) / (p1.y - p0.y + 1e-10) : 1,
          p1.y > by1 ? (by1 - p0.y) / (p1.y - p0.y + 1e-10) : 1,
        );
        if (tBoundary >= 0 && tBoundary < hitT) { hitT = tBoundary; hitType = 'boundary'; }
      }

      // Test players
      for (const player of this.state.players.values()) {
        if (player.id === proj.ownerId) continue;
        if (!player.alive) continue;
        if (player.protectionTicksLeft > 0) continue;
        const t = sweptCircleCircle(p0, p1, PROJ_RADIUS, { x: player.x, y: player.y }, P_RADIUS);
        if (t !== null && t < hitT) {
          hitT = t;
          hitType = 'player';
          hitPlayer = player;
        }
      }

      // Move to hit point (or full step)
      proj.x = p0.x + (p1.x - p0.x) * hitT;
      proj.y = p0.y + (p1.y - p0.y) * hitT;

      if (hitType) {
        const hitX = proj.x;
        const hitY = proj.y;
        this.emitEvent({ type: 'PROJECTILE_HIT', projectileId: proj.id, target: hitType, x: hitX, y: hitY });
        toRemove.push(proj.id);

        if (hitType === 'player' && hitPlayer) {
          this.killPlayer(hitPlayer, proj.ownerId, hitX, hitY);
        }
      }
    }

    for (const id of toRemove) this.state.projectiles.delete(id);
  }

  private killPlayer(victim: PlayerState, killerId: number, x: number, y: number): void {
    victim.alive = false;
    victim.respawnTicksLeft = RESPAWN_TICKS;
    victim.protectionTicksLeft = 0;

    const killer = this.state.players.get(killerId);
    if (killer) {
      killer.score++;
      this.emitEvent({ type: 'SCORE_UPDATE', playerId: killerId });
      this.metrics.counters.scoreUpdates++;
    }

    this.emitEvent({ type: 'PLAYER_DEATH', victim: victim.id, killer: killerId, x, y });
    this.metrics.counters.deaths++;
    this.metrics.counters.hits++;
  }

  private respawnPlayer(p: PlayerState): void {
    const pos = pickSpawnPoint(this.state.players, this.rng, p.id);
    p.x = pos.x;
    p.y = pos.y;
    p.alive = true;
    p.life++;
    p.protectionTicksLeft = PROTECT_TICKS;
    p.respawnTicksLeft = 0;
    this.emitEvent({ type: 'PLAYER_RESPAWN', playerId: p.id, x: pos.x, y: pos.y });
    this.metrics.counters.respawns++;
  }

  private checkMatchTransition(): void {
    const total = this.state.players.size;
    const minNeeded = this.roomCfg.bots ? 1 : MIN_PARTICIPANTS;
    if (this.state.matchState === 'WAITING' && total >= minNeeded) {
      this.startCountdown();
    }
  }

  private startCountdown(): void {
    this.state.matchState = 'COUNTDOWN';
    this.state.countdownTicksLeft = COUNTDOWN_TICKS;

    // Place all players at spawn points
    for (const p of this.state.players.values()) {
      const pos = pickSpawnPoint(this.state.players, this.rng, p.id);
      p.x = pos.x; p.y = pos.y;
      p.alive = false; // can't move during countdown
      p.score = 0;
      p.life = 0;
    }

    // Add bots if room supports them
    if (this.roomCfg.bots) {
      const humans = [...this.state.players.values()].filter(p => !p.bot).length;
      const needed = Math.max(0, TARGET_BOTS - humans);
      const existing = [...this.state.players.values()].filter(p => p.bot).length;
      const toAdd = needed - existing;
      for (let i = 0; i < toAdd; i++) {
        const name = BOT_NAMES[
          (this.state.players.size) % BOT_NAMES.length
        ];
        this.addPlayer(name, true);
      }
    }

    this.state.leftPlayers = [];
  }

  private startMatch(): void {
    this.state.matchState = 'RUNNING';
    this.state.runningTicksLeft = RUNNING_TICKS;
    for (const p of this.state.players.values()) {
      const pos = pickSpawnPoint(this.state.players, this.rng, p.id);
      p.x = pos.x; p.y = pos.y;
      p.alive = true;
      p.life = 1;
      p.protectionTicksLeft = PROTECT_TICKS;
      p.fireCooldownTicks = 0;
    }
    this.emitEvent({ type: 'MATCH_START' });
    this.metrics.counters.matchStarts++;
  }

  private endMatch(): void {
    this.state.matchState = 'ENDED';
    this.state.endedTicksLeft = ENDED_TICKS;

    // Remove all projectiles
    this.state.projectiles.clear();

    // Compute final scoreboard
    const all: ScoreEntry[] = [];
    for (const p of this.state.players.values()) {
      all.push({ id: p.id, name: p.name, score: p.score, left: false });
    }
    for (const lp of this.state.leftPlayers) {
      all.push({ id: lp.id, name: lp.name, score: lp.score, left: true });
    }
    all.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    const maxScore = all[0]?.score ?? 0;
    const winners = all.filter(e => e.score === maxScore && !e.left).map(e => e.id);

    // Store results in match snap
    this._matchResults = { scoreboard: all, winners };

    this.emitEvent({ type: 'MATCH_END' });
    this.metrics.counters.matchEnds++;
  }

  private _matchResults: MatchResults | null = null;

  private stepMatchState(): void {
    switch (this.state.matchState) {
      case 'WAITING': break;

      case 'COUNTDOWN':
        this.state.countdownTicksLeft--;
        if (this.state.countdownTicksLeft <= 0) this.startMatch();
        break;

      case 'RUNNING':
        if (this.roomCfg.timed) {
          this.state.runningTicksLeft--;
          if (this.state.runningTicksLeft <= 0) this.endMatch();
        }
        break;

      case 'ENDED':
        this.state.endedTicksLeft--;
        if (this.state.endedTicksLeft <= 0) {
          // Auto-restart
          this._matchResults = null;
          const hasHumans = [...this.state.players.values()].some(p => !p.bot);
          if (hasHumans) {
            this.startCountdown();
          } else {
            this.state.matchState = 'WAITING';
          }
        }
        break;
    }
  }

  private sendSnapshots(): void {
    for (const player of this.state.players.values()) {
      if (player.bot) continue; // bots don't need snapshots
      this.sendFn(player.id, encodeServer(this.buildSnapshot(player.id)));
    }
    if (this.spectators > 0) this.spectatorFn(encodeServer(this.buildSnapshot(null)));
  }
}
