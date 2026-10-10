/**
 * maps.test.ts — hand-made maps keep the layout rules of GAMERULES.md §3.
 */

import { describe, it, expect } from 'vitest';
import GAME, { MAP_IDS, mapDef } from '../shared/src/config/game.js';
import { closestPointOnRect, circleOverlapsRect } from '../shared/src/sim/geometry.js';
import { randomPowerupSpot, isValidPowerupSpot } from '../shared/src/sim/powerups.js';
import { mulberry32 } from '../shared/src/sim/prng.js';

const W = GAME.arena.width;
const H = GAME.arena.height;
const R = GAME.player.radius;
const CLEARANCE = 24;

type Pt = { x: number; y: number };
const key = (p: Pt) => `${p.x},${p.y}`;

describe('Maps (GAMERULES.md §3)', () => {
  it('the rotation lists every map once and the lab room is fixed to neon', () => {
    expect([...GAME.maps.rotation].sort()).toEqual([...MAP_IDS].sort());
    expect(new Set(GAME.maps.rotation).size).toBe(GAME.maps.rotation.length);
    expect(GAME.rooms.lab.map).toBe('neon');
    expect(mapDef('nope').id).toBe('neon');
  });

  it('power-ups never spawn under the HUD (keep-out zones)', () => {
    const rng = mulberry32(3);
    for (const id of MAP_IDS) {
      const map = mapDef(id);
      for (const z of GAME.powerups.hudKeepOut) expect(isValidPowerupSpot(map, { x: z.x + z.w / 2, y: z.y + z.h / 2 })).toBe(false);
      for (let i = 0; i < 300; i++) {
        const p = randomPowerupSpot(rng, map, [], [])!;
        for (const z of GAME.powerups.hudKeepOut) {
          const inside = p.x > z.x && p.x < z.x + z.w && p.y > z.y && p.y < z.y + z.h;
          expect(inside).toBe(false);
        }
      }
    }
  });

  for (const id of MAP_IDS) {
    describe(id, () => {
      const map = mapDef(id);

      it('has 8 spawn points and obstacles inside the arena', () => {
        expect(map.spawnPoints).toHaveLength(8);
        for (const o of map.obstacles) {
          expect(o.x).toBeGreaterThanOrEqual(0);
          expect(o.y).toBeGreaterThanOrEqual(0);
          expect(o.x + o.w).toBeLessThanOrEqual(W);
          expect(o.y + o.h).toBeLessThanOrEqual(H);
        }
      });

      it('is left–right mirror-symmetric (obstacles, spawns)', () => {
        const rects = new Set(map.obstacles.map((o) => `${o.x},${o.y},${o.w},${o.h}`));
        for (const o of map.obstacles) expect(rects.has(`${W - o.x - o.w},${o.y},${o.w},${o.h}`)).toBe(true);
        for (const pts of [map.spawnPoints]) {
          const set = new Set(pts.map(key));
          for (const p of pts) expect(set.has(key({ x: W - p.x, y: p.y }))).toBe(true);
        }
      });

      it(`keeps spawns ≥ ${CLEARANCE} px from obstacles and inside the arena`, () => {
        for (const p of map.spawnPoints) {
          expect(p.x).toBeGreaterThanOrEqual(R);
          expect(p.y).toBeGreaterThanOrEqual(R);
          expect(p.x).toBeLessThanOrEqual(W - R);
          expect(p.y).toBeLessThanOrEqual(H - R);
          for (const o of map.obstacles) {
            const c = closestPointOnRect(p, o);
            expect(Math.hypot(p.x - c.x, p.y - c.y)).toBeGreaterThanOrEqual(CLEARANCE);
          }
        }
      });

      it('has no enclosed pockets: every spawn and every random power-up spot is reachable', () => {
        const cell = 4;
        const cols = Math.floor(W / cell);
        const rows = Math.floor(H / cell);
        const free = (cx: number, cy: number) => {
          const c = { x: cx * cell + cell / 2, y: cy * cell + cell / 2 };
          if (c.x < R || c.y < R || c.x > W - R || c.y > H - R) return false;
          return !map.obstacles.some((o) => circleOverlapsRect(c, R, o));
        };
        const toCell = (p: Pt) => [Math.floor(p.x / cell), Math.floor(p.y / cell)] as const;
        const seen = new Uint8Array(cols * rows);
        const [sx, sy] = toCell(map.spawnPoints[0]);
        expect(free(sx, sy)).toBe(true);
        const queue = [sx + sy * cols];
        seen[queue[0]] = 1;
        while (queue.length) {
          const i = queue.pop()!;
          const x = i % cols, y = (i - x) / cols;
          for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
            const j = nx + ny * cols;
            if (!seen[j] && free(nx, ny)) { seen[j] = 1; queue.push(j); }
          }
        }
        // 200 power-up spots from the server's sampler (GAMERULES.md §6b)
        const rng = mulberry32(11);
        const spots: Pt[] = [];
        for (let i = 0; i < 200; i++) {
          const p = randomPowerupSpot(rng, map, [], []);
          expect(p).not.toBeNull();
          expect(isValidPowerupSpot(map, p!)).toBe(true);
          spots.push(p!);
        }
        for (const p of [...map.spawnPoints, ...spots]) {
          const [x, y] = toCell(p);
          expect(seen[x + y * cols], `${id} ${key(p)} reachable`).toBe(1);
        }
      });
    });
  }
});
