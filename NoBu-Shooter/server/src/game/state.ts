/**
 * state.ts — server-side mutable game state types.
 * All state lives in Room and is authoritative.
 */

import type { MatchState, GameEvent, InputEntry } from '@nobu/shared/protocol';

export interface PlayerState {
  id: number;
  name: string;
  bot: boolean;
  x: number;
  y: number;
  alive: boolean;
  /** Incremented on every (re)spawn so clients can detect teleports. */
  life: number;
  respawnTicksLeft: number;
  protectionTicksLeft: number;
  fireCooldownTicks: number;
  score: number;
  /** Input queue sorted by sequence. */
  inputQueue: InputEntry[];
  lastConsumedSeq: number;
  /** Did the player disconnect (leave)? Their score stays in history. */
  left: boolean;
}

export interface ProjectileState {
  id: number;
  ownerId: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  ticksLeft: number;
}

export interface RoomState {
  matchState: MatchState;
  tick: number;
  serverTime: number; // ms since server start
  countdownTicksLeft: number;
  runningTicksLeft: number;
  endedTicksLeft: number;
  players: Map<number, PlayerState>;
  projectiles: Map<number, ProjectileState>;
  events: GameEvent[];
  nextEid: number;
  nextProjectileId: number;
  /** Players who left but whose scores are retained. */
  leftPlayers: { id: number; name: string; score: number }[];
}
