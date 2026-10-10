/**
 * extrapolate.test.ts — the State sync renderer (docs/PHASE3_PLAN.md D6, §6 test 7).
 */

import { describe, it, expect } from 'vitest';
import { Extrapolator, type StateSample, type ExtrapolateCfg } from '../client/src/net/extrapolate.js';
import { settlePosition } from '../shared/src/sim/movement.js';
import { circleOverlapsRect } from '../shared/src/sim/geometry.js';
import type { PlayerSnap } from '../shared/src/protocol/messages.js';
import GAME, { mapDef } from '../shared/src/config/game.js';

const CFG: ExtrapolateCfg = { maxMs: 250, backMs: 100, blendHalfLifeMs: 100, projectileSpeed: 600, snapPx: 64 };

function player(id: number, x: number, y: number, extra: Partial<PlayerSnap> = {}): PlayerSnap {
  return {
    id, name: `P${id}`, bot: true, x, y, alive: true, life: 1, protectMs: 0, respawnMs: 0, score: 0,
    aim: 0, weapon: 'handgun', reloading: false, shield: false, fast: false, ...extra,
  };
}

function sample(st: number, players: PlayerSnap[], vel: [number, number, number][]): StateSample {
  return { st, players, projectiles: [], vel: new Map(vel.map(([id, vx, vy]) => [id, { vx, vy }])) };
}

/** A state stream of one entity moving along `path`, sent every `everyMs`. */
function stream(path: (ms: number) => { x: number; y: number; vx: number; vy: number }, everyMs: number, endMs: number) {
  const ex = new Extrapolator(CFG);
  const errors: number[] = [];
  let next = 0;
  for (let t = 0; t <= endMs; t += 1000 / 60) {
    while (next <= t) {
      const p = path(next);
      ex.push(sample(next, [player(1, p.x, p.y)], [[1, p.vx, p.vy]]));
      next += everyMs;
    }
    const drawn = ex.render(t).players[0];
    const truth = path(t);
    errors.push(Math.hypot(drawn.x - truth.x, drawn.y - truth.y));
  }
  return errors;
}

describe('Extrapolator (State sync renderer)', () => {
  it('straight line at constant speed: error 0 at any render time up to the clamp', () => {
    const line = (ms: number) => ({ x: 100 + 0.2 * ms, y: 300, vx: 200, vy: 0 });
    expect(Math.max(...stream(line, 100, 3000))).toBeLessThan(1e-9);
    const ex = new Extrapolator(CFG);
    ex.push(sample(1000, [player(1, 100, 300)], [[1, 200, 0]]));
    expect(ex.render(1250).players[0].x).toBeCloseTo(150, 9); // 250 ms ahead
    expect(ex.render(1400).players[0].x).toBeCloseTo(150, 9); // clamped: holds after 250 ms
    expect(ex.render(950).players[0].x).toBeCloseTo(90, 9);   // newer than the render time: projected back
  });

  it('reversal: the error is bounded by speed × update interval and shrinks at 30 Hz', () => {
    // Back and forth along x at 200 px/s, turning every 1.535 s (between state times)
    const reversal = (ms: number) => {
      const period = 3070;
      const ph = ((ms % period) + period) % period;
      const fwd = ph < period / 2;
      const d = fwd ? ph : period - ph;
      return { x: 300 + 0.2 * d, y: 300, vx: fwd ? 200 : -200, vy: 0 };
    };
    const at10 = Math.max(...stream(reversal, 100, 6000));
    const at30 = Math.max(...stream(reversal, 1000 / 30, 6000));
    expect(at10).toBeGreaterThan(5); // overshoot is real
    expect(at10).toBeLessThanOrEqual(200 * 0.1 * 2 + 2); // overshoot + pull-back ≤ 2 intervals of travel
    expect(at30).toBeLessThan(at10);
  });

  it('a correction is blended: the offset halves every 100 ms', () => {
    const ex = new Extrapolator(CFG);
    ex.push(sample(0, [player(1, 0, 0)], [[1, 100, 0]]));
    ex.render(100); // drawn at x = 10
    ex.push(sample(100, [player(1, 0, 0)], [[1, 0, 0]])); // it really stopped at 0
    const first = ex.render(100);
    expect(first.players[0].x).toBeCloseTo(10, 6); // no jump
    expect(ex.render(200).players[0].x).toBeCloseTo(5, 6);
    expect(ex.render(300).players[0].x).toBeCloseTo(2.5, 6);
  });

  it('teleports (life change) and large corrections snap instead of blending', () => {
    const ex = new Extrapolator(CFG);
    ex.push(sample(0, [player(1, 0, 0)], [[1, 100, 0]]));
    ex.render(100);
    ex.push(sample(100, [player(1, 500, 500, { life: 2 })], [[1, 0, 0]]));
    expect(ex.render(100).players[0]).toMatchObject({ x: 500, y: 500 });
    ex.push(sample(200, [player(1, 600, 500, { life: 2 })], [[1, 0, 0]])); // 100 px jump ≥ snapPx
    expect(ex.render(200).players[0].x).toBe(600);
  });

  it('never draws a player inside an obstacle', () => {
    const obstacles = mapDef('neon').obstacles;
    const cfgGeo = { speed: GAME.player.speed, radius: GAME.player.radius, arenaW: GAME.arena.width, arenaH: GAME.arena.height, obstacles: [...obstacles], hz: GAME.sim.hz };
    const ex = new Extrapolator({ ...CFG, settle: (p) => settlePosition(p, cfgGeo) });
    const o = obstacles[0];
    // Running straight at the obstacle's left face
    ex.push(sample(0, [player(1, o.x - 40, o.y + o.h / 2)], [[1, 400, 0]]));
    for (const t of [50, 100, 150, 200, 250]) {
      const drawn = ex.render(t).players[0];
      expect(circleOverlapsRect(drawn, GAME.player.radius - 1e-6, o)).toBe(false);
    }
  });

  it('dead players and projectiles', () => {
    const ex = new Extrapolator(CFG);
    ex.push({
      st: 0,
      players: [player(1, 10, 10, { alive: false })],
      projectiles: [{ id: 9, owner: 1, x: 0, y: 0, dx: 0.6, dy: 0.8 }],
      vel: new Map([[1, { vx: 300, vy: 0 }]]),
    });
    const r = ex.render(100);
    expect(r.players[0]).toMatchObject({ x: 10, y: 10 });
    expect(r.projectiles[0].x).toBeCloseTo(36, 9); // 600 px/s × 0.1 s × 0.6
    expect(r.projectiles[0].y).toBeCloseTo(48, 9);
  });
});
