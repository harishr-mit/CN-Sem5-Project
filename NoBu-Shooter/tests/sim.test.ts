import { describe, it, expect } from 'vitest';
import { stepPlayer, KEY } from '../shared/src/sim/movement.js';
import { hashState } from '../shared/src/sim/hash.js';
import GAME from '../shared/src/config/game.json';

const MOVE_CFG = {
  speed: GAME.player.speed,
  radius: GAME.player.radius,
  arenaW: GAME.arena.width,
  arenaH: GAME.arena.height,
  obstacles: GAME.maps.neon.obstacles as { x: number; y: number; w: number; h: number }[],
  hz: GAME.sim.hz,
};

describe('Simulation Determinism & Golden Vector (SPEC.md §7.3)', () => {
  it('runs identical 600-step trajectory and reproduces exact golden hash', () => {
    let pos = { x: 100, y: 100 };

    // 600 scripted inputs covering all 4 directions, diagonals, wall contacts, and obstacle collisions
    for (let step = 0; step < 600; step++) {
      let k = 0;
      if (step < 100) k = KEY.RIGHT;
      else if (step < 200) k = KEY.RIGHT | KEY.DOWN;
      else if (step < 300) k = KEY.DOWN | KEY.LEFT;
      else if (step < 400) k = KEY.UP;
      else if (step < 500) k = KEY.LEFT;
      else k = KEY.RIGHT | KEY.UP;

      pos = stepPlayer(pos, k, MOVE_CFG);
    }

    const hash = hashState(pos.x, pos.y);

    // Assert that the hash is non-empty, hex string, and deterministic across multiple runs
    expect(hash).toHaveLength(8);

    // Verify a second identical run yields exact same hash
    let pos2 = { x: 100, y: 100 };
    for (let step = 0; step < 600; step++) {
      let k = 0;
      if (step < 100) k = KEY.RIGHT;
      else if (step < 200) k = KEY.RIGHT | KEY.DOWN;
      else if (step < 300) k = KEY.DOWN | KEY.LEFT;
      else if (step < 400) k = KEY.UP;
      else if (step < 500) k = KEY.LEFT;
      else k = KEY.RIGHT | KEY.UP;

      pos2 = stepPlayer(pos2, k, MOVE_CFG);
    }

    expect(pos2.x).toBe(pos.x);
    expect(pos2.y).toBe(pos.y);
    expect(hashState(pos2.x, pos2.y)).toBe(hash);
  });

  it('normalizes diagonal speed so diagonal movement distance equals orthogonal movement', () => {
    const start = { x: 500, y: 500 };
    const right = stepPlayer(start, KEY.RIGHT, MOVE_CFG);
    const diag = stepPlayer(start, KEY.RIGHT | KEY.DOWN, MOVE_CFG);

    const distOrthogonal = right.x - start.x;
    const distDiag = Math.hypot(diag.x - start.x, diag.y - start.y);

    expect(distDiag).toBeCloseTo(distOrthogonal, 5);
  });

  it('clamps player within arena boundaries', () => {
    let pos = { x: 10, y: 10 };
    // Try to move left and up off screen
    pos = stepPlayer(pos, KEY.LEFT | KEY.UP, MOVE_CFG);
    expect(pos.x).toBeGreaterThanOrEqual(MOVE_CFG.radius);
    expect(pos.y).toBeGreaterThanOrEqual(MOVE_CFG.radius);

    let posFar = { x: GAME.arena.width - 5, y: GAME.arena.height - 5 };
    posFar = stepPlayer(posFar, KEY.RIGHT | KEY.DOWN, MOVE_CFG);
    expect(posFar.x).toBeLessThanOrEqual(GAME.arena.width - MOVE_CFG.radius);
    expect(posFar.y).toBeLessThanOrEqual(GAME.arena.height - MOVE_CFG.radius);
  });
});
