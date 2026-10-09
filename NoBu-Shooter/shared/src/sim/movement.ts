/**
 * movement.ts — deterministic player movement step.
 * Pure: no Math.random, Date.now, DOM or Node APIs.
 * Used identically by client (prediction) and server (authority).
 * SPEC.md §7.2, GAMERULES.md §5.
 */

import type { Rect, Vec2 } from './geometry.js';
import { resolveCircleRect, clamp } from './geometry.js';

export interface MoveCfg {
  speed: number;      // px/s
  radius: number;     // player radius px
  arenaW: number;
  arenaH: number;
  obstacles: Rect[];
  hz: number;         // sim frequency
}

/**
 * Key bitmask — SPEC.md §7.2:
 *   up = 1, down = 2, left = 4, right = 8
 */
export const KEY = {
  UP:    1,
  DOWN:  2,
  LEFT:  4,
  RIGHT: 8,
} as const;

/**
 * stepPlayer — one tick of player movement.
 * Returns new {x, y}.
 */
export function stepPlayer(
  pos: Vec2,
  keys: number,
  cfg: MoveCfg
): Vec2 {
  const dt = 1 / cfg.hz;
  const up    = (keys & KEY.UP)    !== 0;
  const down  = (keys & KEY.DOWN)  !== 0;
  const left  = (keys & KEY.LEFT)  !== 0;
  const right = (keys & KEY.RIGHT) !== 0;

  let dirX = (right ? 1 : 0) - (left ? 1 : 0);
  let dirY = (down  ? 1 : 0) - (up   ? 1 : 0);

  // Normalize diagonal movement so diagonal speed === axis speed
  if (dirX !== 0 && dirY !== 0) {
    dirX *= Math.SQRT1_2;
    dirY *= Math.SQRT1_2;
  }

  let x = pos.x + dirX * cfg.speed * dt;
  let y = pos.y + dirY * cfg.speed * dt;

  // Resolve x-axis separately then y-axis (two passes each per SPEC.md §7.2)
  for (let pass = 0; pass < 2; pass++) {
    for (const obs of cfg.obstacles) {
      const resolved = resolveCircleRect({ x, y }, cfg.radius, obs);
      x = resolved.x;
      y = resolved.y;
    }
  }

  // Clamp to arena
  x = clamp(x, cfg.radius, cfg.arenaW - cfg.radius);
  y = clamp(y, cfg.radius, cfg.arenaH - cfg.radius);

  // Re-resolve after clamping (second pass to handle corner cases)
  for (let pass = 0; pass < 2; pass++) {
    for (const obs of cfg.obstacles) {
      const resolved = resolveCircleRect({ x, y }, cfg.radius, obs);
      x = resolved.x;
      y = resolved.y;
    }
  }
  x = clamp(x, cfg.radius, cfg.arenaW - cfg.radius);
  y = clamp(y, cfg.radius, cfg.arenaH - cfg.radius);

  return { x, y };
}

/**
 * settlePosition — push a (teleported) circle out of obstacles and into the
 * arena. Used for perturb (SPEC.md §8.1). Not part of stepPlayer, so the
 * golden movement vector is unaffected.
 */
export function settlePosition(pos: Vec2, cfg: MoveCfg): Vec2 {
  let { x, y } = pos;
  for (let pass = 0; pass < 2; pass++) {
    x = clamp(x, cfg.radius, cfg.arenaW - cfg.radius);
    y = clamp(y, cfg.radius, cfg.arenaH - cfg.radius);
    for (const obs of cfg.obstacles) {
      const resolved = resolveCircleRect({ x, y }, cfg.radius, obs);
      x = resolved.x;
      y = resolved.y;
    }
  }
  x = clamp(x, cfg.radius, cfg.arenaW - cfg.radius);
  y = clamp(y, cfg.radius, cfg.arenaH - cfg.radius);
  return { x, y };
}
