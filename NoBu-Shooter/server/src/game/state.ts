/**
 * state.ts — server-side mutable game state types.
 * All state lives in Room and is authoritative.
 */

import type { MatchState, GameEvent, InputEntry, MapId, PowerupKind } from '@nobu/shared/protocol';
import type { CombatState } from '@nobu/shared/sim';

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
  /** Weapon, ammo, reload, cooldown and power-up timers (advanced per input, shared/src/sim/combat.ts). */
  combat: CombatState;
  /** Last aim angle (sprite rotation for other clients). */
  aim: number;
  /** Shield power-up: absorbs the next hit (GAMERULES.md §6b). */
  shield: boolean;
  /** Developer invincibility (npm run demo only). */
  invincible: boolean;
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
  /** Piercing power-up: passes through obstacles. */
  pierce: boolean;
}

/** A power-up on the map, at a random spot (GAMERULES.md §6b). */
export interface PickupState {
  id: number;
  x: number;
  y: number;
  kind: PowerupKind;
}

export interface RoomState {
  matchState: MatchState;
  /** Map being played (GAMERULES.md §3). */
  map: MapId;
  pickups: PickupState[];
  /** Counts down to the next power-up while below the cap (0 = idle). */
  pickupRespawnTicks: number;
  nextPickupId: number;
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
