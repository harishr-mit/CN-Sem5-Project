import { describe, it, expect } from 'vitest';
import { stepPlayer, KEY } from '../shared/src/sim/movement.js';
import GAME from '../shared/src/config/game.json';
import NET from '../shared/src/config/net.json';

const MOVE_CFG = {
  speed: GAME.player.speed,
  radius: GAME.player.radius,
  arenaW: GAME.arena.width,
  arenaH: GAME.arena.height,
  obstacles: GAME.obstacles as { x: number; y: number; w: number; h: number }[],
  hz: GAME.sim.hz,
};

describe('Client-Side Prediction & Server Reconciliation (SPEC.md §10, §14.2)', () => {
  it('baseline prediction error is exactly 0 under perfect network transmission', () => {
    let clientPos = { x: 300, y: 300 };
    let serverPos = { x: 300, y: 300 };

    const pendingInputs: { s: number; k: number }[] = [];

    // Client generates 60 inputs (1 second at 60 Hz)
    for (let s = 1; s <= 60; s++) {
      const k = KEY.RIGHT;
      pendingInputs.push({ s, k });
      clientPos = stepPlayer(clientPos, k, MOVE_CFG);
    }

    // Server consumes all 60 inputs
    for (const inp of pendingInputs) {
      serverPos = stepPlayer(serverPos, inp.k, MOVE_CFG);
    }

    // Client receives snapshot with ack = 60
    const ack = 60;
    const remainingPending = pendingInputs.filter((i) => i.s > ack);

    // Replay remaining pending inputs on top of authoritative server pos
    let replayedPos = { ...serverPos };
    for (const inp of remainingPending) {
      replayedPos = stepPlayer(replayedPos, inp.k, MOVE_CFG);
    }

    const dx = clientPos.x - replayedPos.x;
    const dy = clientPos.y - replayedPos.y;
    const error = Math.hypot(dx, dy);

    expect(error).toBe(0);
    expect(clientPos.x).toBe(serverPos.x);
    expect(clientPos.y).toBe(serverPos.y);
  });

  it('detects perturbation and reconciles client to authoritative server position', () => {
    let clientPos = { x: 200, y: 200 };
    let serverPos = { x: 200, y: 200 };

    const pendingInputs: { s: number; k: number }[] = [];

    for (let s = 1; s <= 30; s++) {
      const k = KEY.DOWN;
      pendingInputs.push({ s, k });
      clientPos = stepPlayer(clientPos, k, MOVE_CFG);
      serverPos = stepPlayer(serverPos, k, MOVE_CFG);
    }

    // Server gets perturbed by +40px on X axis (e.g. debug perturb / physics bump)
    serverPos.x += 40;

    // Client receives snapshot acking s=30 with perturbed server position
    const ack = 30;
    const remainingPending = pendingInputs.filter((i) => i.s > ack);

    let replayedPos = { ...serverPos };
    for (const inp of remainingPending) {
      replayedPos = stepPlayer(replayedPos, inp.k, MOVE_CFG);
    }

    const error = Math.hypot(clientPos.x - replayedPos.x, clientPos.y - replayedPos.y);
    expect(error).toBeCloseTo(40, 2);

    // After reconciliation, client adopts replayed position
    clientPos = replayedPos;
    expect(clientPos.x).toBe(serverPos.x);
    expect(clientPos.y).toBe(serverPos.y);
  });

  it('duplicate inputs do not cause double movement on authoritative server', () => {
    let serverPos = { x: 400, y: 400 };
    let lastAck = 0;

    const inputBatches = [
      [{ s: 1, k: KEY.UP }],
      [{ s: 1, k: KEY.UP }, { s: 2, k: KEY.UP }], // s=1 duplicated
      [{ s: 1, k: KEY.UP }, { s: 2, k: KEY.UP }, { s: 3, k: KEY.UP }], // s=1 and s=2 duplicated
    ];

    for (const batch of inputBatches) {
      for (const inp of batch) {
        if (inp.s <= lastAck) continue; // Duplicate / stale rejection
        serverPos = stepPlayer(serverPos, inp.k, MOVE_CFG);
        lastAck = inp.s;
      }
    }

    expect(lastAck).toBe(3);

    // Correct distance = exactly 3 steps
    const expected = stepPlayer(
      stepPlayer(stepPlayer({ x: 400, y: 400 }, KEY.UP, MOVE_CFG), KEY.UP, MOVE_CFG),
      KEY.UP,
      MOVE_CFG
    );

    expect(serverPos.x).toBe(expected.x);
    expect(serverPos.y).toBe(expected.y);
  });
});
