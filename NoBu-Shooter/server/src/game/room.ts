/**
 * room.ts — the authoritative game room.
 * One Room instance per room: 'main' (quick match), 'lab' (demo sandbox) and
 * private rooms named by their code (docs/PHASE7_PLAN.md D9), which play by
 * the 'main' rules as their host's options shape them (R2: map, max players,
 * bots, power-ups, always-on power-ups) and wait in a lobby for the host's
 * START, before every match.
 * SPEC.md §9, GAMERULES.md §2–§14.
 */

import {
  stepPlayer, settlePosition, mulberry32, sweptCircleRect, sweptCircleCircle, segmentIntersectsRect, moverPath, MOVER_PATTERNS,
  initialCombat, copyCombat, stepCombat, speedMultiplier, pelletAngles, applyPowerup, makePermanent, isOn, WEAPONS,
  powerupCap, pickPowerupKind, randomPowerupSpot, hashWorld,
} from '@nobu/shared/sim';
import type { Rect, Vec2, MoverPattern, MoverCfg, MoveCfg } from '@nobu/shared/sim';
import type {
  InputEntry, MsgSnap, PlayerSnap, ProjectileSnap, PickupSnap,
  MatchState, GameEvent, MatchResults, ScoreEntry, WeaponId, MsgDev,
} from '@nobu/shared/protocol';
import { defaultRoomOptions, spawnableKinds, alwaysOnKinds, botsFor, canStartWith, type RoomOptions } from '@nobu/shared/rooms/options.js';
import { LockstepLog, type Velocity, type VelocityTable, type Keyframe, type LockstepRecord } from '@nobu/shared/sync';
import GAME, { mapDef, isMapId, type MapDef, type MapId, type PowerupKind } from '@nobu/shared/config/game.js';
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
const HASH_EVERY_TICKS = NET.lockstep.hashEveryTicks;
/** Developer switches (dev message) are honoured only under `npm run demo` (read per call, so tests can set it). */
const devMode = (): boolean => typeof process !== 'undefined' && process.env.NOBU_DEV === '1';

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
/** Parked seats kept per room (the oldest go first; only a never-closing quick match gets near it). */
const MAX_SEATS = 256;

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

export type RoomKind = 'main' | 'lab' | 'private';

export interface RoomInit {
  /** Default: the name's own config ('main', 'lab'); any other name is a private room. */
  kind?: RoomKind;
}

export class Room {
  readonly name: string;
  readonly kind: RoomKind;
  readonly roomCfg: RoomCfg;
  /** Private rooms: the human who may START (the creator, then the longest-connected human). */
  private host: number | null = null;
  /** Private rooms: the host's match options (null elsewhere). */
  private opts: RoomOptions | null = null;

  private state: RoomState;
  private botCtrl: BotController;
  private botSeqMap = new Map<number, number>();
  /** Persistent identities (hello `pid`): token → the player id, name and score it left with; and id → token for live humans. */
  private seats = new Map<string, { id: number; score: number; name: string }>();
  private tokens = new Map<number, string>();
  private rng = mulberry32(GAME.bots.seed + 1); // separate from bot rng
  private pickupRng = mulberry32(GAME.bots.seed + 2);
  readonly metrics = new Metrics();

  /** Current map geometry (changes only at COUNTDOWN, GAMERULES.md §3). */
  private map: MapDef;
  private moveCfg: MoveCfg;
  private rotation: MapId[];
  private matchesStarted = 0;
  /** Presenter mode (dev): the match clock is stopped. Cleared when the last human leaves. */
  private endless = false;

  /** Scripted movers, keyed by pattern. Kept out of `players` (no player cap, no inputs). */
  private movers = new Map<MoverPattern, MoverState>();
  private spectators = 0;
  /** Player and mover positions at the start of the current tick (velocities for state sync). */
  private prevPos = new Map<number, Vec2>();

  /**
   * Lockstep (docs/PHASE6_PLAN.md D3, D9): rooms whose world only changes by
   * movement inputs (the lab) record, per tick, the keys each player consumed.
   * Anything else that moves something raises `keyframeNeeded`, and the next
   * tick's record carries a keyframe instead. Null for other rooms.
   */
  private readonly lsLog: LockstepLog | null;
  private keyframeNeeded = true;

  // Send callbacks injected at construction
  private sendFn: SendFn;
  private spectatorFn: SpectatorFn;

  constructor(
    name: string,
    sendFn: SendFn,
    spectatorFn: SpectatorFn,
    init: RoomInit = {},
  ) {
    this.name = name;
    const configs = GAME.rooms as Record<string, RoomCfg>;
    this.kind = init.kind ?? (name === 'main' || name === 'lab' ? name : 'private');
    this.roomCfg = configs[this.kind === 'private' ? 'main' : name] ?? {
      bots: false, firing: false, timed: false, movers: false, powerups: false,
    };
    if (this.kind === 'private') this.opts = defaultRoomOptions();
    this.sendFn = sendFn;
    this.spectatorFn = spectatorFn;
    this.rotation = this.roomCfg.map && isMapId(this.roomCfg.map) ? [this.roomCfg.map]
      : this.opts ? this.rotationFor(this.opts) : mapRotation();
    this.map = mapDef(this.rotation[0]);
    this.moveCfg = moveCfgFor(this.map);
    this.botCtrl = new BotController(this.map);
    const rc = this.roomCfg;
    this.lsLog = !rc.firing && !rc.bots && !rc.timed && !rc.powerups ? new LockstepLog() : null;

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
  /** Human players (not bots, not movers). */
  get humanCount(): number {
    let n = 0;
    for (const p of this.state.players.values()) if (!p.bot) n++;
    return n;
  }
  /** Private rooms: the host's player id (null in other rooms, or with no humans). */
  get hostId(): number | null { return this.host; }
  get matchState(): MatchState { return this.state.matchState as MatchState; }
  get spectatorCount(): number { return this.spectators; }
  get activeMovers(): MoverPattern[] { return [...this.movers.keys()]; }
  get mapId(): MapId { return this.map.id; }
  get tickNumber(): number { return this.state.tick; }
  /** The lockstep tick records (lab rooms only, else null). */
  get lockstepLog(): LockstepLog | null { return this.lsLog; }

  /** The complete lab world after the latest tick (lockstep keyframe). */
  labKeyframe(): Keyframe {
    return {
      map: this.map.id,
      players: [...this.state.players.values()].map((p) => ({ id: p.id, name: p.name, x: p.x, y: p.y, life: p.life })),
      movers: [...this.movers.values()].map((m) => ({ id: m.id, pattern: m.pattern })),
    };
  }

  /** Something not driven by relayed inputs changed the world: the next record is a keyframe. */
  private markKeyframe(): void {
    this.keyframeNeeded = true;
  }

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
    this.markKeyframe();
    return true;
  }

  /** A private room: its options (a copy). */
  get options(): RoomOptions | null { return this.opts ? structuredClone(this.opts) : null; }

  /** No room for another human: a private room counts humans against its max players (bots make way). */
  isFull(): boolean {
    if (this.opts) return this.humanCount >= this.opts.maxPlayers;
    return this.state.players.size >= MAX_PARTICIPANTS;
  }

  /**
   * A human's name made unique in this room, case-insensitively: a second ALEX
   * becomes "ALEX 2". Live players and parked seats of other tokens count.
   */
  private uniqueName(name: string, token: string | undefined): string {
    const max = GAME.player.maxNameLength;
    const taken = new Set<string>();
    for (const q of this.state.players.values()) taken.add(q.name.toLowerCase());
    for (const [t, seat] of this.seats) if (t !== token) taken.add(seat.name.toLowerCase());
    const base = name.slice(0, max);
    if (!taken.has(base.toLowerCase())) return base;
    for (let n = 2; ; n++) {
      const suffix = ` ${n}`;
      const candidate = base.slice(0, max - suffix.length) + suffix;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
  }

  /**
   * `token`: the player's persistent identity (hello `pid`). Whoever rejoins
   * with a token this room has seen gets the same player id (so the same
   * colour) and the score they left with; seats last as long as the room.
   */
  addPlayer(name: string, isBot = false, token?: string): number {
    const seat = !isBot && token ? this.seats.get(token) : undefined;
    const id = seat && !this.state.players.has(seat.id) ? seat.id : nextPlayerId++;
    const spawnPos = this.spawnFor();
    const p: PlayerState = {
      id, name: isBot ? name.slice(0, GAME.player.maxNameLength) : this.uniqueName(name, token), bot: isBot,
      x: spawnPos.x, y: spawnPos.y,
      // In a private room's lobby players stand on the map (they can't move before the match)
      alive: this.state.matchState === 'RUNNING' || this.inLobby,
      life: 0,
      respawnTicksLeft: 0,
      protectionTicksLeft: this.state.matchState === 'RUNNING' && this.roomCfg.firing ? PROTECT_TICKS : 0,
      combat: this.freshCombat(),
      aim: 0,
      shield: this.spawnShield,
      invincible: false,
      score: seat?.score ?? 0,
      inputQueue: [],
      lastConsumedSeq: 0,
      left: false,
    };
    this.state.players.set(id, p);
    if (seat) this.state.leftPlayers = this.state.leftPlayers.filter((lp) => lp.id !== id); // back: no longer "left"
    if (!isBot && token) { this.tokens.set(id, token); this.seats.set(token, { id, score: p.score, name: p.name }); }
    if (isBot) {
      this.botCtrl.addBot(id);
      this.botSeqMap.set(id, 0);
    } else if (this.kind === 'private') {
      if (this.host === null) this.host = id;
      this.fitBots();
      // A new lobby previews where power-ups can appear
      if (this.inLobby && this.state.pickups.length === 0) this.resetPickups(true);
    }
    this.emitEvent({ type: 'PLAYER_JOIN', playerId: id });
    this.markKeyframe();
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
    const token = this.tokens.get(id);
    if (token) { // park the seat: the same token gets this id, name slot and score back
      this.seats.set(token, { id, score: p.score, name: p.name });
      this.tokens.delete(id);
      if (this.seats.size > MAX_SEATS) this.seats.delete(this.seats.keys().next().value as string); // oldest first (a long-lived quick match)
    }
    this.state.players.delete(id);
    if (p.bot) {
      this.botCtrl.removeBot(id);
      this.botSeqMap.delete(id);
    }
    this.emitEvent({ type: 'PLAYER_LEAVE', playerId: id });
    this.markKeyframe();
    this.metrics.counters.playerLeaves++;

    // The host left: the longest-connected human takes over (players keep join order)
    if (this.host === id) {
      this.host = null;
      for (const pl of this.state.players.values()) if (!pl.bot) { this.host = pl.id; break; }
    }

    // If last human leaves, clear bots and return to WAITING
    const hasHumans = [...this.state.players.values()].some(pl => !pl.bot);
    if (!hasHumans && this.roomCfg.bots) {
      for (const [bid, bp] of this.state.players) {
        if (bp.bot) this.removePlayer(bid);
      }
      this.state.matchState = 'WAITING';
    }
    // A presenter who closed the tab must not leave the room without a clock
    if (!hasHumans) this.endless = false;
    this.clearMoversIfEmpty();
  }

  /** Nobody left to watch: start the next session with movers off. */
  private clearMoversIfEmpty(): void {
    if (this.state.players.size === 0 && this.spectators === 0 && this.movers.size > 0) {
      this.movers.clear();
      this.markKeyframe();
    }
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
    this.markKeyframe();
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
      ...(this.endless && this.roomCfg.timed ? { endless: true as const } : {}),
      ...(this.opts ? { code: this.name, options: this.opts, ...(this.host !== null ? { hostId: this.host } : {}) } : {}),
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
      fast: isOn(p.combat.speedTicks),
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
    // Running matches; and a private room's lobby, which previews where power-ups can appear
    if (matchState === 'RUNNING' || this.inLobby) for (const pk of this.state.pickups) pickups.push({ ...pk });
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

    // 2. Consume inputs + movement (lockstep rooms log the keys that moved each player)
    const consumedKeys = this.lsLog ? new Map<number, number[]>() : null;
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
          if (consumedKeys) {
            const list = consumedKeys.get(p.id);
            if (list) list.push(inp.k);
            else consumedKeys.set(p.id, [inp.k]);
          }

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

    // 6a. Lockstep record of this tick (before the sends below read it)
    if (this.lsLog && consumedKeys) this.recordLockstep(consumedKeys);

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

  /** One tick's lockstep record: consumed keys, or a keyframe; plus the world hash every HASH_EVERY_TICKS. */
  private recordLockstep(consumedKeys: Map<number, number[]>): void {
    const rec: LockstepRecord = { k: this.state.tick };
    if (this.keyframeNeeded) {
      rec.key = this.labKeyframe();
      this.keyframeNeeded = false;
    } else if (consumedKeys.size > 0) {
      rec.in = Object.fromEntries(consumedKeys);
    }
    if (this.state.tick % HASH_EVERY_TICKS === 0) rec.h = this.labHash();
    this.lsLog!.push(rec);
  }

  /** hashWorld over every player and mover (docs/PHASE6_PLAN.md D6). */
  labHash(): number {
    return hashWorld([...this.state.players.values(), ...this.movers.values()]);
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
   * tie), keep at most ⌊participants / perPlayers⌋ (one per participant) on the map, and add one at a random
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

    const cap = this.pickupCap;
    if (st.pickups.length > cap) st.pickups.splice(0, st.pickups.length - cap); // players left: drop the oldest
    if (st.pickups.length < cap) {
      if (st.pickupRespawnTicks <= 0) st.pickupRespawnTicks = this.pickupEveryTicks;
      else if (--st.pickupRespawnTicks === 0) this.spawnPickup();
    } else {
      st.pickupRespawnTicks = 0;
    }
  }

  private spawnPickup(): void {
    const others = [...this.state.players.values()].filter((p) => p.alive);
    const spot = randomPowerupSpot(this.pickupRng, this.map, this.state.pickups, others);
    if (!spot) return;
    const kind = pickPowerupKind(this.pickupRng, this.opts ? spawnableKinds(this.opts) : undefined);
    if (!kind) return;
    this.state.pickups.push({ id: this.state.nextPickupId++, x: spot.x, y: spot.y, kind });
  }

  /** Most power-ups on the map: one per participant in `main`; the host's choice in a private room (0 when spawning is off). */
  private get pickupCap(): number {
    if (!this.opts) return powerupCap(this.state.players.size);
    return this.opts.powerupEveryS === 0 || spawnableKinds(this.opts).length === 0 ? 0 : this.opts.powerupMax;
  }

  /** Ticks between spawns: 7 s in `main`; the host's choice in a private room. */
  private get pickupEveryTicks(): number {
    return this.opts ? Math.round(this.opts.powerupEveryS * SIM_HZ) : PICKUP_RESPAWN_TICKS;
  }

  /** Match start: fill up to the cap at once; otherwise clear. */
  private resetPickups(fill: boolean): void {
    this.state.pickups = [];
    this.state.pickupRespawnTicks = 0;
    if (!this.roomCfg.powerups || !fill) return;
    const cap = this.pickupCap;
    for (let i = 0; i < cap; i++) this.spawnPickup();
  }

  /** Developer invincibility (only under `npm run demo`). Returns whether it was applied. */
  setDev(playerId: number, invincible: boolean): boolean {
    const p = this.state.players.get(playerId);
    if (!devMode() || !p) return false;
    p.invincible = invincible;
    return true;
  }

  /**
   * Developer / Presenter commands (`dev` message, only under `npm run demo`).
   * `playerId` is null for a spectator, which may use the room commands only.
   * Returns whether anything was applied.
   */
  devCommand(playerId: number | null, cmd: Omit<MsgDev, 't'>): boolean {
    if (!devMode()) return false;
    const p = playerId === null ? undefined : this.state.players.get(playerId);
    let applied = false;
    if (cmd.invincible !== undefined && p) { p.invincible = cmd.invincible; applied = true; }
    if (cmd.give && p) applied = this.givePowerup(p, cmd.give) || applied;
    if (cmd.endless !== undefined) { this.endless = cmd.endless; applied = true; }
    if (cmd.map || cmd.restart) { this.restart(cmd.map); applied = true; }
    return applied;
  }

  get isEndless(): boolean { return this.endless; }

  /**
   * Give a power-up as if picked up (same effect, same PICKUP event, so the
   * client adopts the change instead of treating it as a misprediction).
   * Only for an alive player in a running match of a room with power-ups.
   */
  private givePowerup(p: PlayerState, kind: PowerupKind): boolean {
    if (!this.roomCfg.powerups || this.state.matchState !== 'RUNNING' || !p.alive) return false;
    if (applyPowerup(p.combat, kind).shield) p.shield = true;
    this.emitEvent({ type: 'PICKUP', playerId: p.id, kind, x: p.x, y: p.y });
    return true;
  }

  /**
   * Presenter restart, optionally on another map. Timed rooms begin a new
   * match through the usual countdown (scores 0, spawn points, power-ups
   * refilled); the rotation index is not advanced by an explicit map. Untimed
   * rooms (lab) switch the map at once and put every player back on the spawn.
   */
  private restart(map?: MapId): void {
    this._matchResults = null;
    if (this.roomCfg.timed) {
      // Same map unless one is given; the rotation index never moves for a restart
      this.startCountdown(map ?? this.map.id);
      return;
    }
    if (map) this.setMap(map);
    this.state.projectiles.clear();
    for (const p of this.state.players.values()) this.respawnPlayer(p);
    this.markKeyframe();
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
    // Death removes every power-up effect (GAMERULES.md §6b) and refills the handgun —
    // except a private room's always-on ones, which the next life has again
    victim.combat = this.freshCombat();
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
    if (this.spawnShield) p.shield = true;
    this.emitEvent({ type: 'PLAYER_RESPAWN', playerId: p.id, x: pos.x, y: pos.y });
    this.metrics.counters.respawns++;
  }

  /**
   * WAITING → COUNTDOWN (GAMERULES.md §2). Rooms without bots need
   * `minParticipants`; `main` starts as soon as a human is in (bots fill
   * the rest); a private room waits in its lobby for its host's START.
   */
  private checkMatchTransition(): void {
    if (this.state.matchState !== 'WAITING' || this.kind === 'private') return;
    if (!this.roomCfg.bots) {
      if (this.state.players.size >= MIN_PARTICIPANTS) this.startCountdown();
      return;
    }
    if (this.humanCount > 0) this.startCountdown();
  }

  /** The bots a private room has during its match: the empty slots, if its host turned bots on. */
  private botTarget(): number {
    if (!this.opts) return Math.max(0, TARGET_BOTS - this.humanCount);
    return botsFor(this.humanCount, this.opts);
  }

  /** Whether a private room can start: at least `minParticipants`, counting the bots it will add. */
  get canStart(): boolean {
    return this.opts !== null && canStartWith(this.humanCount, this.opts);
  }

  /**
   * START (`start` message): a private room's host, in the lobby, when there
   * are enough participants. Returns whether the countdown began.
   */
  start(playerId: number | null): boolean {
    if (this.kind !== 'private' || this.state.matchState !== 'WAITING') return false;
    if (playerId === null || playerId !== this.host || !this.canStart) return false;
    this.startCountdown();
    return true;
  }

  /**
   * The host's options (`roomOptions` message), in the lobby only. They show
   * at once: the map, the bots, preview power-ups and the always-on effects.
   * Returns whether they were applied.
   */
  setOptions(playerId: number | null, options: RoomOptions): boolean {
    if (!this.opts || this.state.matchState !== 'WAITING' || playerId === null || playerId !== this.host) return false;
    const mapChanged = options.map !== this.opts.map;
    this.opts = structuredClone(options);
    if (mapChanged) {
      this.rotation = this.rotationFor(this.opts);
      this.matchesStarted = 0;
    }
    this.refreshLobby();
    return true;
  }

  private rotationFor(o: RoomOptions): MapId[] {
    return o.map === 'rotation' ? mapRotation() : [o.map];
  }

  private get inLobby(): boolean {
    return this.kind === 'private' && this.state.matchState === 'WAITING';
  }

  /** A new life's combat state, with the room's always-on power-ups. */
  private freshCombat() {
    const c = initialCombat();
    return this.opts ? makePermanent(c, alwaysOnKinds(this.opts.alwaysOn)) : c;
  }

  /** Every life starts shielded when the Shield is always on. */
  private get spawnShield(): boolean {
    return this.opts?.alwaysOn.shield === true;
  }

  /** Add or remove bots to match `botTarget` (lobby and countdown). */
  private fitBots(): void {
    let bots = [...this.state.players.values()].filter((p) => p.bot);
    const target = this.botTarget();
    while (bots.length > target) {
      this.removePlayer(bots[bots.length - 1].id);
      bots = bots.slice(0, -1);
    }
    for (let i = bots.length; i < target; i++) {
      this.addPlayer(BOT_NAMES[this.state.players.size % BOT_NAMES.length], true);
    }
  }

  /**
   * A private room's lobby shows what the options do: the next map with
   * everyone on a spawn point, the bots, preview power-ups (where they could
   * appear) and the always-on effects. Nobody can move until the match.
   */
  private refreshLobby(): void {
    if (!this.inLobby) return;
    const next = this.rotation[this.matchesStarted % this.rotation.length];
    if (next !== this.map.id) this.setMap(next);
    this.state.projectiles.clear();
    this.fitBots();
    for (const p of this.state.players.values()) {
      const pos = this.spawnFor(p.id);
      p.x = pos.x; p.y = pos.y;
      p.alive = true;
      p.respawnTicksLeft = 0;
      p.protectionTicksLeft = 0;
      p.combat = this.freshCombat();
      p.shield = this.spawnShield;
    }
    this.resetPickups(true);
  }

  /** After a private room's match: back to its lobby (the host may change the options, then START). */
  private enterLobby(): void {
    this.state.matchState = 'WAITING';
    this._matchResults = null;
    for (const p of this.state.players.values()) { p.score = 0; p.life++; }
    this.state.leftPlayers = [];
    this.resetSeatScores();
    this.refreshLobby();
  }

  /** `map` (Presenter) replaces the next rotation map without advancing the rotation. */
  private startCountdown(map?: MapId): void {
    this.state.matchState = 'COUNTDOWN';
    this.state.countdownTicksLeft = COUNTDOWN_TICKS;

    // Next map in the rotation (GAMERULES.md §3); the first match plays rotation[0]
    this.setMap(map ?? this.rotation[this.matchesStarted++ % this.rotation.length]);
    this.state.projectiles.clear();
    this.resetPickups(false);

    // Place all players at spawn points (GAMERULES.md §2). They stay alive and
    // visible there — movement and firing are ignored outside RUNNING — and get
    // a new life number, so every client treats the move as a respawn, not a
    // misprediction. (Before 2026-10-11 they were marked dead here, and the
    // respawn step revived them at once with life 1 at another spawn point: a
    // player who hadn't died in the previous match saw a huge correction.)
    for (const p of this.state.players.values()) {
      const pos = this.spawnFor(p.id);
      p.x = pos.x; p.y = pos.y;
      p.alive = true;
      p.life++;
      p.respawnTicksLeft = 0;
      p.protectionTicksLeft = 0;
      p.score = 0;
      p.combat = this.freshCombat();
      p.shield = this.spawnShield;
    }

    // Bots: `main` fills to bots.targetParticipants (never removing any); a
    // private room fills its empty slots only if its host turned bots on
    if (this.opts) this.fitBots();
    else if (this.roomCfg.bots) {
      const existing = [...this.state.players.values()].filter(p => p.bot).length;
      const toAdd = this.botTarget() - existing;
      for (let i = 0; i < toAdd; i++) {
        const name = BOT_NAMES[
          (this.state.players.size) % BOT_NAMES.length
        ];
        this.addPlayer(name, true);
      }
    }

    this.state.leftPlayers = [];
    this.resetSeatScores();
  }

  /** Scores restart with every match, so parked seats forget theirs too. */
  private resetSeatScores(): void {
    for (const seat of this.seats.values()) seat.score = 0;
  }

  private startMatch(): void {
    this.state.matchState = 'RUNNING';
    this.state.runningTicksLeft = RUNNING_TICKS;
    // Everyone starts where the countdown placed them (no second teleport at GO)
    for (const p of this.state.players.values()) {
      p.alive = true;
      p.protectionTicksLeft = PROTECT_TICKS;
      p.combat = this.freshCombat();
      p.shield = this.spawnShield;
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
        if (this.roomCfg.timed && !this.endless) {
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
          if (hasHumans && this.kind === 'private') {
            this.enterLobby();
          } else if (hasHumans) {
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
