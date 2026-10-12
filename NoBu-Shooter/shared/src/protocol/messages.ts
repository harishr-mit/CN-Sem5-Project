/**
 * messages.ts — Wire protocol type definitions.
 * SPEC.md §8. Every type has a validator function.
 * Both client and server import from here.
 */

import { isMoverPattern, type MoverPattern } from '../sim/movers.js';
import { isPowerupKind, isMapId, type WeaponId, type PowerupKind, type MapId } from '../config/game.js';
import type { CombatState } from '../sim/combat.js';
import { isSyncModel, isStateHz, isSyncSpec, type SyncSpec, type SyncModel, type StateHz } from '../sync/types.js';

export type { MoverPattern, WeaponId, PowerupKind, MapId, SyncSpec, SyncModel, StateHz };

// ───────────────────────────────────────────────────────────────
// Client → Server
// ───────────────────────────────────────────────────────────────

export interface InputEntry {
  /** Sequence number, monotonically increasing per client. */
  s: number;
  /** Key bitmask: up=1, down=2, left=4, right=8. */
  k: number;
  /** Aim angle in radians, quantized to 0.001. */
  a: number;
  /** Fire flag: 0 or 1 (held). */
  f: 0 | 1;
  /** Reload request (GAMERULES.md §6a). Omitted when 0. */
  r?: 0 | 1;
  /** Dash request (Dash power-up, GAMERULES.md §6b). Omitted when 0. */
  d?: 0 | 1;
}

export interface MsgHello {
  t: 'hello';
  v: 1;
  name: string;
  room: 'main' | 'lab';
  nonce: string;
  /** Join as a spectator: receive snapshots, no player (Compare reference pane). */
  spectate?: boolean;
  /** Sync model for this connection (default full; spectators always get full). PHASES.md Phase 3. */
  sync?: SyncSpec;
}

export interface MsgInput {
  t: 'input';
  inputs: InputEntry[];
  /** Delta sync: newest snapshot tick the client has decoded (snapshot ack). */
  sa?: number;
}

/** Switch this connection's sync model live (docs/PHASE3_PLAN.md D1). */
export interface MsgSync {
  t: 'sync';
  model: SyncModel;
  /** State only: send rate. */
  hz?: StateHz;
  /** Lockstep only: redundant window (true) or resend on request. */
  rd?: boolean;
}

/** Delta sync: snapshot ack, sent when no input message carries `sa`. */
export interface MsgSnapAck {
  t: 'snapAck';
  tick: number;
}

export interface MsgPing {
  t: 'ping';
  id: number;
  /** Client timestamp in ms. */
  ct: number;
}

export interface MsgPerturb {
  t: 'perturb';
  dx: number;
  dy: number;
}

export interface MsgBye {
  t: 'bye';
}

/**
 * Developer switches; honoured only when the server runs under `npm run demo`
 * (NOBU_DEV=1). Every field is optional, at least one is present. `invincible`
 * and `give` act on the sender's player; `endless`, `restart` and `map` act on
 * the sender's room (Presenter mode) and may also come from a spectator.
 */
export interface MsgDev {
  t: 'dev';
  invincible?: boolean;
  /** Give this power-up now, exactly as if it had been picked up. */
  give?: PowerupKind;
  /** Stop the match clock (a timed match never ends) — or start it again. */
  endless?: boolean;
  /** Restart: timed rooms begin a new match (countdown, scores 0); the lab puts everyone back on its spawn. */
  restart?: true;
  /** Switch to this map and restart. */
  map?: MapId;
}

/** Select the active scripted movers (rooms with movers enabled only). */
export interface MsgLab {
  t: 'lab';
  movers: MoverPattern[];
}

/**
 * Lockstep (docs/PHASE6_PLAN.md D3, D4): ask for ticks `from`..`to` again
 * (resend on request, Rd off), or with `key` for a fresh keyframe (after a
 * hash mismatch; `from` / `to` are then 0).
 */
export interface MsgLsNack {
  t: 'lsNack';
  from: number;
  to: number;
  key?: true;
}

export type ClientMsg = MsgHello | MsgInput | MsgPing | MsgPerturb | MsgBye | MsgLab | MsgDev | MsgSync | MsgSnapAck | MsgLsNack;

// ───────────────────────────────────────────────────────────────
// Server → Client
// ───────────────────────────────────────────────────────────────

export interface MsgWelcome {
  t: 'welcome';
  v: number;
  playerId: number;
  room: string;
  simHz: number;
  snapshotHz: number;
  serverTime: number;
  nonce: string;
  /** Present for spectators, whose playerId is 0. */
  spectator?: boolean;
}

export interface PlayerSnap {
  id: number;
  name: string;
  bot: boolean;
  x: number;
  y: number;
  alive: boolean;
  life: number;
  /** Spawn protection remaining in ms. */
  protectMs: number;
  /** Respawn remaining in ms. */
  respawnMs: number;
  score: number;
  /** Aim angle in radians (sprite rotation). */
  aim: number;
  weapon: WeaponId;
  reloading: boolean;
  /** Shield power-up active (GAMERULES.md §6b). */
  shield: boolean;
  /** Speed power-up active. */
  fast: boolean;
  /** Developer invincibility (npm run demo only); omitted when off. */
  invincible?: true;
  /** Set only on scripted lab movers (PHASES.md C3). */
  mover?: MoverPattern;
}

/**
 * The receiving player's own combat state, exact to the input (sent only to
 * that player). The client replays its unacknowledged inputs on top of it
 * (shared/src/sim/combat.ts), like its position.
 */
export type SelfCombatSnap = CombatState;

/** A power-up waiting at a random spot (GAMERULES.md §6b). */
export interface PickupSnap {
  /** Unique per room (a new id for every power-up that appears). */
  id: number;
  x: number;
  y: number;
  kind: PowerupKind;
}

export interface ProjectileSnap {
  id: number;
  owner: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  /** Fired under the Piercing power-up: passes through obstacles. Omitted when false. */
  pierce?: true;
}

export type MatchState = 'WAITING' | 'COUNTDOWN' | 'RUNNING' | 'ENDED';

export interface MatchSnap {
  state: MatchState;
  /** Map being played (GAMERULES.md §3). */
  map: MapId;
  timeLeftMs: number;
  /** Presenter mode: the match clock is stopped (`timeLeftMs` frozen); absent otherwise. */
  endless?: true;
  results: MatchResults | null;
}

export interface ScoreEntry {
  id: number;
  name: string;
  score: number;
  left: boolean;
}

export interface MatchResults {
  scoreboard: ScoreEntry[];
  winners: number[];
}

export type EventType =
  | 'PLAYER_JOIN'
  | 'PLAYER_LEAVE'
  | 'PLAYER_FIRE'
  | 'PROJECTILE_SPAWN'
  | 'PROJECTILE_HIT'
  | 'PLAYER_DEATH'
  | 'PLAYER_RESPAWN'
  | 'SCORE_UPDATE'
  | 'MATCH_START'
  | 'MATCH_END'
  | 'RELOAD_START'
  | 'PICKUP'
  | 'SHIELD_HIT';

export interface GameEvent {
  eid: number;
  type: EventType;
  tick: number;
  victim?: number;
  killer?: number;
  playerId?: number;
  projectileId?: number;
  target?: 'player' | 'obstacle' | 'boundary';
  x?: number;
  y?: number;
  /** PLAYER_FIRE, RELOAD_START: the weapon used. */
  weapon?: WeaponId;
  /** PICKUP: the power-up collected. */
  kind?: PowerupKind;
}

export interface MsgSnap {
  t: 'snap';
  tick: number;
  /** Server time in ms (monotonic). */
  st: number;
  /** Highest input sequence consumed for this client. */
  ack: number;
  match: MatchSnap;
  players: PlayerSnap[];
  projectiles: ProjectileSnap[];
  /** Power-ups on the map (empty in the lab room). */
  pickups: PickupSnap[];
  /** The receiving player's combat state (absent for spectators). */
  me?: SelfCombatSnap;
  events: GameEvent[];
}

/**
 * Changes of one record: changed or added fields, plus `del` = optional
 * fields that were removed (e.g. `invincible`). Absent fields are unchanged.
 */
export type FieldPatch<T> = { [K in keyof T]?: T[K] } & { del?: string[] };
/** An entity in a delta: a patch of the base's entity with this id, or a complete record if the base has none. */
export type EntityPatch<T extends { id: number }> = { id: number } & FieldPatch<Omit<T, 'id'>>;

/**
 * Delta snapshot (docs/PHASE3_PLAN.md D3): the changes since snapshot `base`,
 * which the client acknowledged. Applying it to that base gives the full
 * snapshot of `tick`, except `events`, which holds only the events newer than
 * the base (so an event repeats until a snapshot containing it is acknowledged).
 */
export interface MsgSnapDelta {
  t: 'snapDelta';
  tick: number;
  base: number;
  st: number;
  ack: number;
  match?: FieldPatch<MatchSnap>;
  players?: EntityPatch<PlayerSnap>[];
  /** Ids of players / movers no longer present. */
  gone?: number[];
  projectiles?: EntityPatch<ProjectileSnap>[];
  projGone?: number[];
  /** The whole list, only when it changed. */
  pickups?: PickupSnap[];
  /** Changed fields; null = no longer present. */
  me?: FieldPatch<SelfCombatSnap> | null;
  events?: GameEvent[];
}

/** A player in a state message: the full record plus its velocity (px/s) over the last tick. */
export interface StatePlayerSnap extends PlayerSnap {
  vx: number;
  vy: number;
}

/** State sync (docs/PHASE3_PLAN.md D5): complete records plus velocity, at `hz`. */
export interface MsgState extends Omit<MsgSnap, 't' | 'players'> {
  t: 'state';
  hz: StateHz;
  players: StatePlayerSnap[];
}

/** A player in a lockstep keyframe. */
export interface LsPlayer {
  id: number;
  name: string;
  x: number;
  y: number;
  life: number;
}

/** A scripted mover in a lockstep keyframe: its position is moverPath(pattern, tick / 60). */
export interface LsMover {
  id: number;
  pattern: MoverPattern;
}

/** The complete lab world after a tick (docs/PHASE6_PLAN.md D3). */
export interface Keyframe {
  map: MapId;
  players: LsPlayer[];
  movers: LsMover[];
}

/**
 * What happened in tick `k`: the movement keys the server consumed for each
 * player (by id, in order; absent = none), or a keyframe that replaces the
 * world after the tick (join, leave, nudge, restart, map, movers, resync).
 * `h` = hashWorld after the tick, every NET.lockstep.hashEveryTicks ticks.
 */
export interface LockstepRecord {
  k: number;
  in?: Record<string, number[]>;
  key?: Keyframe;
  h?: number;
}

/**
 * Lockstep tick records (server → client, every 2 ticks). `tick` = the
 * server's newest tick, `ack` = the receiver's newest consumed input
 * sequence at that tick.
 */
export interface MsgLs {
  t: 'ls';
  tick: number;
  ack: number;
  recs: LockstepRecord[];
}

export interface MsgPong {
  t: 'pong';
  id: number;
  ct: number;
  st: number;
  tickHz: number;
  tickMs: number;
  tickMsMax: number;
}

export interface MsgError {
  t: 'error';
  /** LOCKSTEP_LAB_ONLY: a lockstep sync request outside the lab room; the connection keeps its model. */
  code: 'ROOM_FULL' | 'BAD_VERSION' | 'BAD_MESSAGE' | 'LOCKSTEP_LAB_ONLY';
  msg: string;
}

export type ServerMsg = MsgWelcome | MsgSnap | MsgSnapDelta | MsgState | MsgLs | MsgPong | MsgError;

// ───────────────────────────────────────────────────────────────
// Validators (basic, non-crashing)
// ───────────────────────────────────────────────────────────────

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isTick(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

/** The widest range one lsNack may ask for (the server's ring holds 256 ticks). */
const LS_NACK_MAX_SPAN = 256;
const LS_MAX_RECORDS = 300;
const LS_MAX_ENTITIES = 64;
const LS_MAX_KEYS = 8;

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isKeyframe(v: unknown): v is Keyframe {
  if (!isObj(v) || !isMapId(v['map'])) return false;
  const { players, movers } = v;
  if (!Array.isArray(players) || players.length > LS_MAX_ENTITIES) return false;
  if (!Array.isArray(movers) || movers.length > LS_MAX_ENTITIES) return false;
  for (const p of players as unknown[]) {
    if (!isObj(p) || !isTick(p['id']) || typeof p['name'] !== 'string') return false;
    if (!isFiniteNum(p['x']) || !isFiniteNum(p['y']) || !isTick(p['life'])) return false;
  }
  for (const m of movers as unknown[]) {
    if (!isObj(m) || !isTick(m['id']) || !isMoverPattern(m['pattern'])) return false;
  }
  return true;
}

function isLockstepRecord(v: unknown): v is LockstepRecord {
  if (!isObj(v) || !isTick(v['k'])) return false;
  if (v['h'] !== undefined && !(isTick(v['h']) && (v['h'] as number) <= 0xffffffff)) return false;
  if (v['key'] !== undefined && !isKeyframe(v['key'])) return false;
  const inputs = v['in'];
  if (inputs === undefined) return true;
  if (!isObj(inputs) || Array.isArray(inputs)) return false;
  const entries = Object.entries(inputs);
  if (entries.length > LS_MAX_ENTITIES) return false;
  for (const [id, keys] of entries) {
    if (!/^\d+$/.test(id) || !Array.isArray(keys) || keys.length > LS_MAX_KEYS) return false;
    if (!keys.every((k) => Number.isInteger(k) && k >= 0 && k <= 15)) return false;
  }
  return true;
}

/**
 * Lockstep tick records from the server. The client checks them before
 * replaying (a malformed record would break the replay for good).
 */
export function validateLs(raw: unknown): MsgLs | null {
  if (!isObj(raw) || raw['t'] !== 'ls' || !isTick(raw['tick']) || !isTick(raw['ack'])) return null;
  const recs = raw['recs'];
  if (!Array.isArray(recs) || recs.length > LS_MAX_RECORDS || !recs.every(isLockstepRecord)) return null;
  return raw as unknown as MsgLs;
}

export function validateClientMsg(raw: unknown): ClientMsg | null {
  if (!isObj(raw) || typeof raw['t'] !== 'string') return null;
  switch (raw['t']) {
    case 'hello':
      if (raw['v'] !== 1) return null;
      if (typeof raw['name'] !== 'string') return null;
      if (raw['room'] !== 'main' && raw['room'] !== 'lab') return null;
      if (typeof raw['nonce'] !== 'string') return null;
      if (raw['spectate'] !== undefined && typeof raw['spectate'] !== 'boolean') return null;
      if (raw['sync'] !== undefined && !isSyncSpec(raw['sync'])) return null;
      return raw as unknown as MsgHello;

    case 'input': {
      if (!Array.isArray(raw['inputs'])) return null;
      for (const inp of raw['inputs'] as unknown[]) {
        if (!isObj(inp)) return null;
        if (typeof inp['s'] !== 'number') return null;
        if (typeof inp['k'] !== 'number') return null;
        if (typeof inp['a'] !== 'number') return null;
        if (inp['f'] !== 0 && inp['f'] !== 1) return null;
        if (inp['r'] !== undefined && inp['r'] !== 0 && inp['r'] !== 1) return null;
        if (inp['d'] !== undefined && inp['d'] !== 0 && inp['d'] !== 1) return null;
      }
      if (raw['sa'] !== undefined && !isTick(raw['sa'])) return null;
      return raw as unknown as MsgInput;
    }

    case 'sync': {
      if (!isSyncModel(raw['model'])) return null;
      if (raw['hz'] !== undefined && !isStateHz(raw['hz'])) return null;
      if (raw['rd'] !== undefined && typeof raw['rd'] !== 'boolean') return null;
      const out: MsgSync = { t: 'sync', model: raw['model'] };
      if (raw['hz'] !== undefined) out.hz = raw['hz'];
      if (raw['rd'] !== undefined) out.rd = raw['rd'];
      return out;
    }

    case 'lsNack': {
      const { from, to, key } = raw;
      if (!isTick(from) || !isTick(to) || from > to || to - from > LS_NACK_MAX_SPAN) return null;
      if (key !== undefined && key !== true) return null;
      return key ? { t: 'lsNack', from, to, key: true } : { t: 'lsNack', from, to };
    }

    case 'snapAck':
      if (!isTick(raw['tick'])) return null;
      return { t: 'snapAck', tick: raw['tick'] };

    case 'ping':
      if (typeof raw['id'] !== 'number') return null;
      if (typeof raw['ct'] !== 'number') return null;
      return raw as unknown as MsgPing;

    case 'perturb':
      if (typeof raw['dx'] !== 'number') return null;
      if (typeof raw['dy'] !== 'number') return null;
      return raw as unknown as MsgPerturb;

    case 'bye':
      return { t: 'bye' };

    case 'lab': {
      const movers = raw['movers'];
      if (!Array.isArray(movers) || movers.length > 8) return null;
      if (!movers.every(isMoverPattern)) return null;
      return { t: 'lab', movers: [...new Set(movers)] };
    }

    case 'dev': {
      const out: MsgDev = { t: 'dev' };
      const { invincible, give, endless, restart, map } = raw;
      if (invincible !== undefined) { if (typeof invincible !== 'boolean') return null; out.invincible = invincible; }
      if (give !== undefined) { if (!isPowerupKind(give)) return null; out.give = give; }
      if (endless !== undefined) { if (typeof endless !== 'boolean') return null; out.endless = endless; }
      if (restart !== undefined) { if (restart !== true) return null; out.restart = true; }
      if (map !== undefined) { if (!isMapId(map)) return null; out.map = map; }
      return Object.keys(out).length > 1 ? out : null;
    }

    default:
      return null;
  }
}
