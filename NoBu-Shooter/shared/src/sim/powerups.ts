/**
 * powerups.ts — where and which power-ups appear (GAMERULES.md §6b).
 * Pure given the RNG: the server draws from a seeded PRNG, tests replay it.
 */

import GAME, { POWERUP_KINDS, type MapDef, type PowerupKind } from '../config/game.js';
import { closestPointOnRect, type Vec2 } from './geometry.js';

const P = GAME.powerups;
const W = GAME.arena.width;
const H = GAME.arena.height;

/** At most one power-up per `perPlayers` participants (4 players → 2). */
export function powerupCap(participants: number): number {
  return Math.floor(participants / P.perPlayers);
}

/** Weighted draw: rifle (Rapid Fire) is rarest, Speed the most common. */
export function pickPowerupKind(rng: () => number): PowerupKind {
  const weights = P.weights as Record<PowerupKind, number>;
  const total = POWERUP_KINDS.reduce((a, k) => a + weights[k], 0);
  let r = rng() * total;
  for (const k of POWERUP_KINDS) {
    r -= weights[k];
    if (r < 0) return k;
  }
  return POWERUP_KINDS[POWERUP_KINDS.length - 1];
}

/** A spot clear of the edges, the HUD zones and obstacles (every such spot is walkable on our maps). */
export function isValidPowerupSpot(map: MapDef, p: Vec2): boolean {
  const m = P.edgeMarginPx;
  if (p.x < m || p.y < m || p.x > W - m || p.y > H - m) return false;
  // Never under the HUD (score, timer, scoreboard, button bar, weapon panel)
  const r = P.radius;
  if (P.hudKeepOut.some((z) => p.x > z.x - r && p.x < z.x + z.w + r && p.y > z.y - r && p.y < z.y + z.h + r)) return false;
  return map.obstacles.every((o) => {
    const c = closestPointOnRect(p, o);
    return Math.hypot(p.x - c.x, p.y - c.y) >= P.obstacleClearancePx;
  });
}

/**
 * A random spot for a new power-up: valid, away from the other power-ups and
 * not on top of a player. Relaxes the distance rules if the map is crowded;
 * null only if no valid spot was found at all.
 */
export function randomPowerupSpot(
  rng: () => number,
  map: MapDef,
  pickups: readonly Vec2[],
  players: readonly Vec2[],
): Vec2 | null {
  const far = (p: Vec2, list: readonly Vec2[], d: number) => list.every((q) => Math.hypot(p.x - q.x, p.y - q.y) >= d);
  let fallback: Vec2 | null = null;
  for (let i = 0; i < 60; i++) {
    const p = { x: Math.round(P.edgeMarginPx + rng() * (W - 2 * P.edgeMarginPx)), y: Math.round(P.edgeMarginPx + rng() * (H - 2 * P.edgeMarginPx)) };
    if (!isValidPowerupSpot(map, p)) continue;
    if (far(p, pickups, P.minSeparationPx) && far(p, players, P.playerClearancePx)) return p;
    fallback ??= p;
  }
  return fallback;
}
