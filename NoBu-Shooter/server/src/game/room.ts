/**
 * room.ts — the authoritative game room.
 * One Room instance per room name ('main' | 'lab').
 * SPEC.md §9, GAMERULES.md §2–§14.
 */

import {
  stepPlayer, settlePosition, mulberry32, sweptCircleRect, sweptCircleCircle, segmentIntersectsRect, moverPath, MOVER_PATTERNS,
  initialCombat, copyCombat, stepCombat, speedMultiplier, pelletAngles, applyPowerup, WEAPONS,
  powerupCap, pickPowerupKind, randomPowerupSpot,
} from '@nobu/shared/sim';
import type { Rect, Vec2, MoverPattern, MoverCfg, MoveCfg } from '@nobu/shared/sim';
import type {
  InputEntry, MsgSnap, PlayerSnap, ProjectileSnap, PickupSnap,
  MatchState, GameEvent, MatchResults, ScoreEntry, WeaponId,
} from '@nobu/shared/protocol';
import type { Velocity, VelocityTable } from '@nobu/shared/sync';
import GAME, { mapDef, isMapId, type MapDef, type MapId } from '@nobu/shared/config/game.js';
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
const ARENA_W = GAME.arena.width;
const ARENA_H = GAME.arena.height;
const P_RADIUS = GAME.player.radius;
const PROJ_RADIUS = GAME.projectile.radius;
const PROJ_SPEED = GAME.projectile.speed;
const RESPAWN_TICKS = Math.round(GAME.player.respawnDelayMs * SIM_HZ / 1000);
const PROTECT_TICKS = Math.round(GAME.player.spawnProtectionMs * SIM_HZ / 1000);
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
const PICKUP_REACH = P_RADIUS + GAME.powerups.radius;
const PICKUP_RESPAWN_TICKS = Math.round(GAME.powerups.respawnMs * SIM_HZ / 1000);
/** A move longer than this in one tick is a teleport (respawn, perturb), not velocity. */
const MAX_STEP_PX = 30;
/** Developer switches (dev message) are honoured only under `npm run demo`. */
const DEV_MODE = typeof process !== 'undefined' && process.env.NOBU_DEV === '1';

function moveCfgFor(map: MapDef): MoveCfg {
  return {
    speed: GAME.player.speed,
    radius: P_RADIUS,
    arenaW: ARENA_W,
    arenaH: ARENA_H,
    obstacles: [...map.obstacles],
    hz: SIM_HZ,
  };
}

/**
 * Map rotation for timed rooms (GAMERULES.md §3). `NOBU_MAPS=plaza,neon`
 * overrides it (dev / rehearsal: play a chosen map without waiting).
 */
function mapRotation(): MapId[] {
  const env = typeof process !== 'undefined' ? process.env.NOBU_MAPS : undefined;
  const fromEnv = (env ?? '').split(',').map((m) => m.trim()).filter(isMapId);
  return fromEnv.length > 0 ? fromEnv : [...GAME.maps.rotation];
}

const MOVER_CFG: MoverCfg = { speed: GAME.lab.moverSpeed, stopGo: GAME.lab.stopGo };

/**
 * Hands one player's snapshot to the connection layer, whose sync encoder
 * decides what goes on the wire (docs/PHASE3_PLAN.md D2). `vel` holds every
 * entity's velocity over the last tick (used by state sync only).
 */
type SendFn = (playerId: number, snap: MsgSnap, vel: VelocityTable) => void;
/** Sends to every spectator connection in the room (always full snapshots). */
type SpectatorFn = (snap: MsgSnap) => void;

/** A scripted lab mover (PHASES.md C3). Position = moverPath(pattern, tick / SIM_HZ). */
interface MoverState {
  id: number;
  pattern: MoverPattern;
  x: number;
  y: number;
}

let nextPlayerId = 1;

interface RoomCfg {
  bots: boolean;
  firing: boolean;
  timed: boolean;
  movers: boolean;
  /** Power-up pads (GAMERULES.md §6b). */
  powerups: boolean;
  /** Fixed map (lab); otherwise the rotation. */
  map?: string;
  /** Fixed spawn for every player (lab); otherwise GAMERULES.md §9 selection. */
  spawn?: { x: number; y: number };
}

export class Room {
  readonly name: string;
  readonly roomCfg: RoomCfg;

  private state: RoomState;
  private botCtrl: BotController;
  private botSeqMap = new Map<number, number>();
  private rng = mulberry32(GAME.bots.seed + 1); // separate from bot rng
  private pickupRng = mulberry32(GAME.bots.seed + 2);
  readonly metrics = new Metrics();

  /** Current map geometry (changes only at COUNTDOWN, GAMERULES.md §3). */
  private map: MapDef;
  private moveCfg: MoveCfg;
  private readonly rotation: MapId[];
  private matchesStarted = 0;

  /** Scripted movers, keyed by pattern. Kept out of `players` (no player cap, no inputs). */
  private movers = new Map<MoverPattern, MoverState>();
  private spectators = 0;
  /** Player and mover positions at the start of the current tick (velocities for state sync). */
  private prevPos = new Map<number, Vec2>();

  // Send callbacks injected at construction
  private sendFn: SendFn;
  private spectatorFn: SpectatorFn;

  constructor(
    name: string,
    sendFn: SendFn,
    spectatorFn: SpectatorFn
  ) {
    this.name = name;
    this.roomCfg = (GAME.rooms as Record<string, RoomCfg>)[name] ?? {
      bots: false, firing: false, timed: false, movers: false, powerups: false,
    };
    this.sendFn = sendFn;
    this.spectatorFn = spectatorFn;
    this.rotation = this.roomCfg.map && isMapId(this.roomCfg.map) ? [this.roomCfg.map] : mapRotation();
    this.map = mapDef(this.rotation[0]);
    this.moveCfg = moveCfgFor(this.map);
    this.botCtrl = new BotController(this.map);

    this.state = {
      // Untimed rooms (lab) are a sandbox that is always RUNNING (GAMERULES.md §14).
      matchState: this.roomCfg.timed ? 'WAITING' : 'RUNNING',
      map: this.map.id,
      pickups: [],
      pickupRespawnTicks: 0,
      nextPickupId: 1,
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
  get mapId(): MapId { return this.map.id; }

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
    const spawnPos = this.spawnFor();
    const p: PlayerState = {
      id, name: name.slice(0, GAME.player.maxNameLength), bot: isBot,
      x: spawnPos.x, y: spawnPos.y,
      alive: this.state.matchState === 'RUNNING',
      life: 0,
      respawnTicksLeft: 0,
      protectionTicksLeft: this.state.matchState === 'RUNNING' && this.roomCfg.firing ? PROTECT_TICKS : 0,
      combat: initialCombat(),
      aim: 0,
      shield: false,
      invincible: false,
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
    const pos = settlePosition({ x: p.x + dx, y: p.y + dy }, this.moveCfg);
    p.x = pos.x;
    p.y = pos.y;
  }

  /** `playerId` null builds a spectator snapshot (ack 0). */
  buildSnapshot(playerId: number | null): MsgSnap {
    const { tick, serverTime, matchState, players, projectiles, events } = this.state;
    const player = playerId === null ? undefined : players.get(playerId);
    const matchSnap = {
      state: matchState as MatchState,
      map: this.map.id,
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
      ...(proj.pierce ? { pierce: true as const } : {}),
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
      aim: p.aim,
      weapon: p.combat.weapon,
      reloading: p.combat.reloadTicks > 0,
      shield: p.shield,
      fast: p.combat.speedTicks > 0,
      ...(p.invincible ? { invincible: true as const } : {}),
    }));
    // Movers look like remote players to clients, so interpolation (and later
    // sync models) handle them without special cases.
    for (const m of this.movers.values()) {
      playerSnaps.push({
        id: m.id, name: m.pattern.toUpperCase(), bot: true,
        x: m.x, y: m.y, alive: true, life: 1,
        protectMs: 0, respawnMs: 0, score: 0,
        aim: 0, weapon: 'handgun', reloading: false, shield: false, fast: false,
        mover: m.pattern,
      });
    }
    const pickups: PickupSnap[] = [];
    if (matchState === 'RUNNING') for (const pk of this.state.pickups) pickups.push({ ...pk });
    const c = player?.combat;
    return {
      t: 'snap',
      tick,
      st: serverTime,
      ack: player?.lastConsumedSeq ?? 0,
      match: matchSnap,
      players: playerSnaps,
      projectiles: projSnaps,
      pickups,
      ...(c ? {
        me: copyCombat(c),
      } : {}),
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
    this.recordPrevPositions();

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
          p.aim = aimQ;
          // Movement, then weapon timers / reload / fire — the same per-input
          // order as the client's prediction (shared/src/sim/combat.ts).
          const mult = speedMultiplier(p.combat);
          const cfg = mult === 1 ? this.moveCfg : { ...this.moveCfg, speed: this.moveCfg.speed * mult };
          const newPos = stepPlayer({ x: p.x, y: p.y }, inp.k, cfg);
          p.x = newPos.x;
          p.y = newPos.y;
          this.metrics.counters.playerMoves++;

          const armed = this.roomCfg.firing;
          const res = stepCombat(p.combat, armed && inp.f === 1, armed && inp.r === 1, inp.d === 1, inp.k !== 0);
          if (res.fired) this.fireShot(p, aimQ, res.fired, res.pierce);
          if (res.reloadStarted) {
            this.emitEvent({ type: 'RELOAD_START', playerId: p.id, weapon: p.combat.weapon });
            this.metrics.counters.reloads++;
          }
        }
      }
    }

    // 2a. Power-ups: pickups (after movement), the cap and refills
    if (this.roomCfg.powerups && this.state.matchState === 'RUNNING') this.stepPickups();

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

  /** One accepted shot: one projectile per pellet (shotgun: a fixed fan, GAMERULES.md §6). */
  private fireShot(owner: PlayerState, aim: number, weapon: WeaponId, pierce: boolean): void {
    let firstId: number | undefined;
    for (const angle of pelletAngles(weapon, aim)) {
      const id = this.spawnProjectile(owner, angle, WEAPONS[weapon].lifetimeTicks, pierce);
      firstId ??= id ?? undefined;
    }
    this.emitEvent({ type: 'PLAYER_FIRE', playerId: owner.id, projectileId: firstId, weapon, x: owner.x, y: owner.y });
    this.metrics.counters.shots++;
  }

  /** Returns the projectile id, or null when the muzzle is inside an obstacle (destroyed at once). */
  private spawnProjectile(owner: PlayerState, aim: number, lifetimeTicks: number, pierce: boolean): number | null {
    const cos = Math.cos(aim);
    const sin = Math.sin(aim);
    const spawnX = owner.x + cos * (P_RADIUS + PROJ_RADIUS + 1);
    const spawnY = owner.y + sin * (P_RADIUS + PROJ_RADIUS + 1);

    // If spawn point crosses an obstacle, destroy immediately
    const ownerPos = { x: owner.x, y: owner.y };
    const spawnPos = { x: spawnX, y: spawnY };
    if (!pierce) {
      for (const obs of this.map.obstacles) {
        if (segmentIntersectsRect(ownerPos, spawnPos, obs)) return null;
      }
    }

    const id = this.state.nextProjectileId++;
    this.state.projectiles.set(id, {
      id, ownerId: owner.id,
      x: spawnX, y: spawnY,
      dx: cos, dy: sin,
      ticksLeft: lifetimeTicks,
      pierce,
    });
    this.emitEvent({ type: 'PROJECTILE_SPAWN', projectileId: id, x: spawnX, y: spawnY });
    return id;
  }

  /**
   * Power-ups (GAMERULES.md §6b): collect (lowest player id wins a same-tick
   * tie), keep at most ⌊participants / 2⌋ on the map, and add one at a random
   * spot `respawnMs` after the count drops below the cap.
   */
  private stepPickups(): void {
    const st = this.state;
    const byId = [...st.players.values()].filter((p) => p.alive).sort((a, b) => a.id - b.id);
    st.pickups = st.pickups.filter((pk) => {
      const taker = byId.find((p) => (p.x - pk.x) ** 2 + (p.y - pk.y) ** 2 < PICKUP_REACH * PICKUP_REACH);
      if (!taker) return true;
      if (applyPowerup(taker.combat, pk.kind).shield) taker.shield = true;
      this.emitEvent({ type: 'PICKUP', playerId: taker.id, kind: pk.kind, x: pk.x, y: pk.y });
      this.metrics.counters.pickups++;
      return false;
    });

    const cap = powerupCap(st.players.size);
    if (st.pickups.length > cap) st.pickups.splice(0, st.pickups.length - cap); // players left: drop the oldest
    if (st.pickups.length < cap) {
      if (st.pickupRespawnTicks <= 0) st.pickupRespawnTicks = PICKUP_RESPAWN_TICKS;
      else if (--st.pickupRespawnTicks === 0) this.spawnPickup();
    } else {
      st.pickupRespawnTicks = 0;
    }
  }

  private spawnPickup(): void {
    const others = [...this.state.players.values()].filter((p) => p.alive);
    const spot = randomPowerupSpot(this.pickupRng, this.map, this.state.pickups, others);
    if (!spot) return;
    this.state.pickups.push({ id: this.state.nextPickupId++, x: spot.x, y: spot.y, kind: pickPowerupKind(this.pickupRng) });
  }

  /** Match start: fill up to the cap at once; otherwise clear. */
  private resetPickups(fill: boolean): void {
    this.state.pickups = [];
    this.state.pickupRespawnTicks = 0;
    if (!this.roomCfg.powerups || !fill) return;
    const cap = powerupCap(this.state.players.size);
    for (let i = 0; i < cap; i++) this.spawnPickup();
  }

  /** Developer invincibility (only under `npm run demo`). Returns whether it was applied. */
  setDev(playerId: number, invincible: boolean): boolean {
    const p = this.state.players.get(playerId);
    if (!DEV_MODE || !p) return false;
    p.invincible = invincible;
    return true;
  }

  /** Switch the geometry (COUNTDOWN only, so nobody is moving). */
  private setMap(id: MapId): void {
    this.map = mapDef(id);
    this.moveCfg = moveCfgFor(this.map);
    this.state.map = this.map.id;
    this.botCtrl.setMap(this.map);
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

      // Test obstacles (expanded by proj radius); piercing shots ignore them
      for (const obs of proj.pierce ? [] : this.map.obstacles) {
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
          if (hitPlayer.invincible) {
            // Developer invincibility: the hit shows, nothing else happens
          } else if (hitPlayer.shield) {
            // Shield power-up absorbs the hit (GAMERULES.md §6b)
            hitPlayer.shield = false;
            this.emitEvent({ type: 'SHIELD_HIT', victim: hitPlayer.id, killer: proj.ownerId, x: hitX, y: hitY });
            this.metrics.counters.shieldBlocks++;
          } else {
            this.killPlayer(hitPlayer, proj.ownerId, hitX, hitY);
          }
        }
      }
    }

    for (const id of toRemove) this.state.projectiles.delete(id);
  }

  private killPlayer(victim: PlayerState, killerId: number, x: number, y: number): void {
    victim.alive = false;
    victim.respawnTicksLeft = RESPAWN_TICKS;
    victim.protectionTicksLeft = 0;
    // Death removes every power-up effect (GAMERULES.md §6b) and refills the handgun
    victim.combat = initialCombat();
    victim.shield = false;

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

  /** Lab: the fixed twin spawn. Otherwise GAMERULES.md §9. */
  private spawnFor(excludeId?: number): { x: number; y: number } {
    const fixed = this.roomCfg.spawn;
    return fixed ? { x: fixed.x, y: fixed.y } : pickSpawnPoint(this.state.players, this.rng, this.map.spawnPoints, excludeId);
  }

  private respawnPlayer(p: PlayerState): void {
    const pos = this.spawnFor(p.id);
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

    // Next map in the rotation (GAMERULES.md §3); the first match plays rotation[0]
    this.setMap(this.rotation[this.matchesStarted++ % this.rotation.length]);
    this.state.projectiles.clear();
    this.resetPickups(false);

    // Place all players at spawn points
    for (const p of this.state.players.values()) {
      const pos = this.spawnFor(p.id);
      p.x = pos.x; p.y = pos.y;
      p.alive = false; // can't move during countdown
      p.score = 0;
      p.life = 0;
      p.combat = initialCombat();
      p.shield = false;
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
      const pos = this.spawnFor(p.id);
      p.x = pos.x; p.y = pos.y;
      p.alive = true;
      p.life = 1;
      p.protectionTicksLeft = PROTECT_TICKS;
      p.combat = initialCombat();
      p.shield = false;
    }
    this.resetPickups(true);
    this.emitEvent({ type: 'MATCH_START' });
    this.metrics.counters.matchStarts++;
  }

  private endMatch(): void {
    this.state.matchState = 'ENDED';
    this.state.endedTicksLeft = ENDED_TICKS;

    // Remove all projectiles and power-ups
    this.state.projectiles.clear();
    this.resetPickups(false);

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

  private recordPrevPositions(): void {
    this.prevPos.clear();
    for (const p of this.state.players.values()) this.prevPos.set(p.id, { x: p.x, y: p.y });
    for (const m of this.movers.values()) this.prevPos.set(m.id, { x: m.x, y: m.y });
  }

  /** Velocity (px/s) of every player and mover over the last tick; teleports count as 0. */
  velocities(): Map<number, Velocity> {
    const vel = new Map<number, Velocity>();
    const add = (id: number, x: number, y: number) => {
      const prev = this.prevPos.get(id);
      const dx = prev ? x - prev.x : 0;
      const dy = prev ? y - prev.y : 0;
      vel.set(id, Math.hypot(dx, dy) > MAX_STEP_PX ? { vx: 0, vy: 0 } : { vx: dx * SIM_HZ, vy: dy * SIM_HZ });
    };
    for (const p of this.state.players.values()) add(p.id, p.x, p.y);
    for (const m of this.movers.values()) add(m.id, m.x, m.y);
    return vel;
  }

  private sendSnapshots(): void {
    let vel: Map<number, Velocity> | null = null;
    for (const player of this.state.players.values()) {
      if (player.bot) continue; // bots don't need snapshots
      vel ??= this.velocities();
      this.sendFn(player.id, this.buildSnapshot(player.id), vel);
    }
    if (this.spectators > 0) this.spectatorFn(this.buildSnapshot(null));
  }
}
