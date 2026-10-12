/**
 * options.ts — a private room's match options, set by its host in the lobby
 * (owner revision of Phase 7, docs/PHASE7_PLAN.md R2; GAMERULES.md §14a).
 * Shared by the server (validation, rules) and the client (the lobby form).
 */

import GAME, { isMapId, POWERUP_KINDS, type MapId, type PowerupKind } from '../config/game.js';

/** A fixed map, or the normal rotation (one map per match). */
export type MapChoice = MapId | 'rotation';
/** At most one weapon can be always on: Rapid Fire (rifle) and Spread Shot (shotgun) exclude each other. */
export type WeaponChoice = 'none' | 'rapid_fire' | 'spread_shot';

/** Power-ups every player has for the whole match (they then never spawn as pickups). */
export interface AlwaysOn {
  weapon: WeaponChoice;
  /** Every life starts shielded (owner, 2026-10-12): it breaks on a hit, back at the next spawn. */
  shield: boolean;
  speed: boolean;
  piercing: boolean;
  dash: boolean;
}

export interface RoomOptions {
  map: MapChoice;
  /** Most players in the room (humans, plus bots when `bots` is on). */
  maxPlayers: number;
  /** Fill the empty slots up to `maxPlayers` with bots (default off: only the players who joined). */
  bots: boolean;
  /** Seconds between power-up spawns; 0 = no power-ups spawn. */
  powerupEveryS: number;
  /** Most power-ups on the map at once. */
  powerupMax: number;
  alwaysOn: AlwaysOn;
}

const P = GAME.privateRooms;
export const MAP_CHOICES: readonly MapChoice[] = [...GAME.maps.rotation, 'rotation'];
export const WEAPON_CHOICES: readonly WeaponChoice[] = ['none', 'rapid_fire', 'spread_shot'];
export const POWERUP_INTERVALS_S: readonly number[] = P.powerupIntervalsS;
export const MAX_PLAYERS_RANGE = { min: P.maxPlayersRange[0], max: P.maxPlayersRange[1] };
export const POWERUP_MAX_RANGE = { min: P.powerupMaxRange[0], max: P.powerupMaxRange[1] };
/** The toggles besides the weapon, in display order. */
export const ALWAYS_ON_TOGGLES = ['shield', 'speed', 'piercing', 'dash'] as const;

export function defaultRoomOptions(): RoomOptions {
  const d = P.defaults;
  return {
    map: d.map as MapChoice,
    maxPlayers: d.maxPlayers,
    bots: d.bots,
    powerupEveryS: d.powerupEveryS,
    powerupMax: d.powerupMax,
    alwaysOn: { weapon: 'none', shield: false, speed: false, piercing: false, dash: false },
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/** A complete, valid options object (a fresh copy), or null. */
export function validateRoomOptions(raw: unknown): RoomOptions | null {
  if (!isObj(raw)) return null;
  const { map, maxPlayers, bots, powerupEveryS, powerupMax, alwaysOn } = raw;
  if (!(map === 'rotation' || isMapId(map))) return null;
  if (!isInt(maxPlayers, MAX_PLAYERS_RANGE.min, MAX_PLAYERS_RANGE.max)) return null;
  if (typeof bots !== 'boolean') return null;
  if (typeof powerupEveryS !== 'number' || !POWERUP_INTERVALS_S.includes(powerupEveryS)) return null;
  if (!isInt(powerupMax, POWERUP_MAX_RANGE.min, POWERUP_MAX_RANGE.max)) return null;
  if (!isObj(alwaysOn) || !WEAPON_CHOICES.includes(alwaysOn['weapon'] as WeaponChoice)) return null;
  for (const k of ALWAYS_ON_TOGGLES) if (typeof alwaysOn[k] !== 'boolean') return null;
  return {
    map, maxPlayers, bots, powerupEveryS, powerupMax,
    alwaysOn: {
      weapon: alwaysOn['weapon'] as WeaponChoice,
      shield: alwaysOn['shield'] as boolean,
      speed: alwaysOn['speed'] as boolean,
      piercing: alwaysOn['piercing'] as boolean,
      dash: alwaysOn['dash'] as boolean,
    },
  };
}

/**
 * The power-ups that can still spawn: an always-on power-up never does, and
 * an always-on weapon stops both weapon pickups (a second weapon would
 * replace the permanent one).
 */
export function spawnableKinds(o: RoomOptions): PowerupKind[] {
  const a = o.alwaysOn;
  return POWERUP_KINDS.filter((k) => {
    if (k === 'rapid_fire' || k === 'spread_shot') return a.weapon === 'none';
    return !a[k];
  });
}

/** Bots a private room adds for its match: its empty slots, if its host turned bots on. */
export function botsFor(humans: number, o: RoomOptions): number {
  return o.bots ? Math.max(0, o.maxPlayers - humans) : 0;
}

/** A private room can start with at least `minParticipants`, counting the bots it will add. */
export function canStartWith(humans: number, o: RoomOptions): boolean {
  return humans > 0 && humans + botsFor(humans, o) >= GAME.match.minParticipants;
}

/** The always-on power-ups as kinds (for the combat state and the UI). */
export function alwaysOnKinds(a: AlwaysOn): PowerupKind[] {
  const kinds: PowerupKind[] = [];
  if (a.weapon !== 'none') kinds.push(a.weapon);
  for (const k of ALWAYS_ON_TOGGLES) if (a[k]) kinds.push(k);
  return kinds;
}
