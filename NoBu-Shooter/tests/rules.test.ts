import { describe, it, expect } from 'vitest';
import { Room } from '../server/src/game/room.js';

describe('Gameplay Rules & Authority (SPEC.md §14.4, GAMERULES.md)', () => {
  it('adds human player and auto-populates bots up to target count', () => {
    const messages: string[] = [];
    const room = new Room('main', (pid, msg) => messages.push(msg), (msg) => messages.push(msg));

    const p1 = room.addPlayer('Ace', false);
    expect(p1).toBeGreaterThan(0);

    for (let i = 0; i < 10; i++) {
      room.tick();
    }

    // Main room target participants is 4 bots/players
    expect(room.playerCount).toBe(4);
  });

  it('ignores duplicate or stale inputs and advances ack sequentially', () => {
    const room = new Room('lab', () => {}, () => {});
    const p1 = room.addPlayer('Tester', false);

    room.receiveInput(p1, [
      { s: 1, k: 8, a: 0, f: 0 },
      { s: 2, k: 8, a: 0, f: 0 },
      { s: 3, k: 8, a: 0, f: 0 },
    ]);

    room.receiveInput(p1, [
      { s: 1, k: 8, a: 0, f: 0 },
      { s: 2, k: 8, a: 0, f: 0 },
    ]);

    room.tick();
    room.tick();
    room.tick();

    const snap = room.buildSnapshot(p1);
    expect(snap.ack).toBe(3);
  });

  it('enforces fire cooldown between successive shots', () => {
    const room = new Room('main', () => {}, () => {});
    const p1 = room.addPlayer('Shooter', false);

    // Fast forward into running match state
    const roomInternal = room as unknown as { state: { matchState: string; runningTicksLeft: number; players: Map<number, { alive: boolean; fireCooldownTicks: number }> } };
    roomInternal.state.matchState = 'RUNNING';
    roomInternal.state.runningTicksLeft = 6000;
    const player = roomInternal.state.players.get(p1)!;
    player.alive = true;
    player.fireCooldownTicks = 0;

    // Send first fire input
    room.receiveInput(p1, [{ s: 1, k: 0, a: 0, f: 1 }]);
    room.tick();

    const projsAfterFirst = (room as unknown as { state: { projectiles: Map<number, unknown> } }).state.projectiles.size;
    expect(projsAfterFirst).toBe(1);

    // Send immediate second fire on next tick while cooldown is active
    room.receiveInput(p1, [{ s: 2, k: 0, a: 0, f: 1 }]);
    room.tick();

    // Still exactly 1 projectile because cooldown blocked the second
    const projsAfterSecond = (room as unknown as { state: { projectiles: Map<number, unknown> } }).state.projectiles.size;
    expect(projsAfterSecond).toBe(1);
  });

  it('teleports server position when receivePerturb is invoked', () => {
    const room = new Room('lab', () => {}, () => {});
    const p1 = room.addPlayer('NudgeTarget', false);

    const player = (room as unknown as { state: { players: Map<number, { x: number; y: number; alive: boolean }> } }).state.players.get(p1)!;
    player.alive = true;
    const startX = player.x;

    room.receivePerturb(p1, 40, 0);
    expect(player.x).toBe(startX + 40);
  });
});
