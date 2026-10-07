/**
 * messages.ts — Wire protocol type definitions.
 * SPEC.md §8. Every type has a validator function.
 * Both client and server import from here.
 */

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
  /** Fire flag: 0 or 1. */
  f: 0 | 1;
}

export interface MsgHello {
  t: 'hello';
  v: 1;
  name: string;
  room: 'main' | 'lab';
  nonce: string;
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

export type ClientMsg = MsgHello | MsgInput | MsgPing | MsgPerturb | MsgBye;

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
}

export interface ProjectileSnap {
  id: number;
  owner: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
}

export type MatchState = 'WAITING' | 'COUNTDOWN' | 'RUNNING' | 'ENDED';

export interface MatchSnap {
  state: MatchState;
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
  | 'MATCH_END';

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
      return raw as unknown as MsgHello;

    case 'input': {
      if (!Array.isArray(raw['inputs'])) return null;
      for (const inp of raw['inputs'] as unknown[]) {
        if (!isObj(inp)) return null;
        if (typeof inp['s'] !== 'number') return null;
        if (typeof inp['k'] !== 'number') return null;
        if (typeof inp['a'] !== 'number') return null;
        if (inp['f'] !== 0 && inp['f'] !== 1) return null;
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

    default:
      return null;
  }
}
