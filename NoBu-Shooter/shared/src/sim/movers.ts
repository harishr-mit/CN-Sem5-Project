/**
 * movers.ts — scripted lab-room movers (PHASES.md C3).
 * Pure: every path is a function of server time only, so the server, the
 * tests and every client agree on where a mover is at any moment (clients
 * use this to measure how far their drawn mover is from the truth).
 * Paths are continuous (no teleports) and keep clear of the obstacles in
 * game.json (checked by tests/movers.test.ts).
 * Only operations with exact IEEE results (+ − × ÷, sqrt, dsin / dcos): a
 * browser and the server must compute the same bits (lockstep, Phase 6).
 */

import type { Vec2 } from './geometry.js';
import { dcos, dsin } from './dtrig.js';

export type MoverPattern = 'circle' | 'zigzag' | 'reversal' | 'stopgo';

export const MOVER_PATTERNS: readonly MoverPattern[] = ['circle', 'zigzag', 'reversal', 'stopgo'];

export function isMoverPattern(v: unknown): v is MoverPattern {
  return typeof v === 'string' && (MOVER_PATTERNS as readonly string[]).includes(v);
}

export interface MoverCfg {
  /** Path speed in px/s while moving. */
  speed: number;
  stopGo: { moveMs: number; stopMs: number };
}

// ── Path geometry (arena 1280×720, see game.json obstacles) ────────
const CIRCLE = { x: 640, y: 360, r: 120 };

/** Zigzag: x 360 → 920 in 40 px steps, y alternating 530 / 560 (50 px legs). */
const ZIGZAG: Vec2[] = Array.from({ length: 15 }, (_, i) => ({ x: 360 + 40 * i, y: i % 2 === 0 ? 530 : 560 }));
const REVERSAL: Vec2[] = [{ x: 360, y: 175 }, { x: 920, y: 175 }];
const STOPGO: Vec2[] = [{ x: 400, y: 250 }, { x: 400, y: 470 }];

/** Math.hypot is not guaranteed bit-exact across engines; sqrt is. */
function segLen(a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function polylineLength(pts: Vec2[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += segLen(pts[i - 1], pts[i]);
  return len;
}

const LENGTHS = new Map<Vec2[], number>([ZIGZAG, REVERSAL, STOPGO].map((p) => [p, polylineLength(p)]));

/** Point at arc length `d` travelling out and back along a polyline forever. */
function pingPong(pts: Vec2[], d: number): Vec2 {
  const len = LENGTHS.get(pts)!;
  let s = d % (2 * len);
  if (s < 0) s += 2 * len;
  if (s > len) s = 2 * len - s;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const seg = segLen(a, b);
    if (s <= seg || i === pts.length - 1) {
      const u = seg > 0 ? Math.min(1, s / seg) : 0;
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
    }
    s -= seg;
  }
  return { ...pts[pts.length - 1] };
}

/** Distance travelled after `tSec` when moving `moveMs`, then pausing `stopMs`, repeatedly. */
function stopGoDistance(tSec: number, cfg: MoverCfg): number {
  const move = cfg.stopGo.moveMs / 1000;
  const cycle = move + cfg.stopGo.stopMs / 1000;
  const n = Math.floor(tSec / cycle);
  const rest = tSec - n * cycle;
  return (n * move + Math.min(rest, move)) * cfg.speed;
}

/** Position of a mover `tSec` seconds of server time after the room started. */
export function moverPath(pattern: MoverPattern, tSec: number, cfg: MoverCfg): Vec2 {
  switch (pattern) {
    case 'circle': {
      const angle = (cfg.speed * tSec) / CIRCLE.r;
      return { x: CIRCLE.x + CIRCLE.r * dcos(angle), y: CIRCLE.y + CIRCLE.r * dsin(angle) };
    }
    case 'zigzag':
      return pingPong(ZIGZAG, cfg.speed * tSec);
    case 'reversal':
      return pingPong(REVERSAL, cfg.speed * tSec);
    case 'stopgo':
      return pingPong(STOPGO, stopGoDistance(tSec, cfg));
  }
}
