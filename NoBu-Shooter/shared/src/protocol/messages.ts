/**
 * messages.ts — Wire protocol type definitions.
 * SPEC.md §8. Every type has a validator function.
 * Both client and server import from here.
 */

import { isMoverPattern, type MoverPattern } from '../sim/movers.js';
import type { WeaponId, PowerupKind, MapId } from '../config/game.js';
import type { CombatState } from '../sim/combat.js';

export type { MoverPattern, WeaponId, PowerupKind, MapId };

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
}

export interface MsgInput {
  t: 'input';
  inputs: InputEntry[];
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

/** Developer switches; honoured only when the server runs under `npm run demo` (NOBU_DEV=1). */
export interface MsgDev {
  t: 'dev';
  invincible: boolean;
}

/** Select the active scripted movers (rooms with movers enabled only). */
export interface MsgLab {
  t: 'lab';
  movers: MoverPattern[];
}

export type ClientMsg = MsgHello | MsgInput | MsgPing | MsgPerturb | MsgBye | MsgLab | MsgDev;

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
  code: 'ROOM_FULL' | 'BAD_VERSION' | 'BAD_MESSAGE';
  msg: string;
}

export type ServerMsg = MsgWelcome | MsgSnap | MsgPong | MsgError;

// ───────────────────────────────────────────────────────────────
// Validators (basic, non-crashing)
// ───────────────────────────────────────────────────────────────

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
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
      return raw as unknown as MsgInput;
    }

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

    case 'dev':
      if (typeof raw['invincible'] !== 'boolean') return null;
      return { t: 'dev', invincible: raw['invincible'] };

    default:
      return null;
  }
}
