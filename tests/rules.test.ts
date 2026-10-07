import { describe, it, expect } from 'vitest';
import { Room } from '../server/src/game/room.js';

describe('Gameplay Rules & Authority (SPEC.md §14.4, GAMERULES.md)', () => {
  it('adds human player and auto-populates bots up to target count', () => {
    const messages: string[] = [];
    const room = new Room('main', (pid, msg) => messages.push(msg), (msg) => messages.push(msg));

    const p1 = room.addPlayer('Ace', false);
    expect(p1).toBeGreaterThan(0);

    // Run a few ticks to allow match and bot initialization
    for (let i = 0; i < 10; i++) {
      room.tick();
    }

    // Main room has bots enabled; should fill to target participants (8 total)
    expect(room.playerCount).toBe(8);
  });

  it('ignores duplicate or stale inputs and advances ack sequentially', () => {
    const room = new Room('lab', () => {}, () => {});
    const p1 = room.addPlayer('Tester', false);

    // Send inputs 1, 2, 3
    room.receiveInput(p1, [
      { s: 1, k: 8, a: 0, f: 0 },
      { s: 2, k: 8, a: 0, f: 0 },
      { s: 3, k: 8, a: 0, f: 0 },
    ]);

    // Resend duplicate inputs 1 and 2 (e.g. from network duplication)
    room.receiveInput(p1, [
      { s: 1, k: 8, a: 0, f: 0 },
      { s: 2, k: 8, a: 0, f: 0 },
    ]);

    // Advance 3 ticks
    room.tick();
    room.tick();
    room.tick();

    // Verify tick consumption without duplication
    const snap = room.buildSnapshot(p1);
    expect(snap.ack).toBe(3);
  });

  it('enforces fire cooldown between successive shots', () => {
    const room = new Room('lab', () => {}, () => {});
    const p1 = room.addPlayer('Shooter', false);

    // Ensure player is alive
    const player = (room as unknown as { state: { players: Map<number, { alive: boolean }> } }).state.players.get(p1)!;
    player.alive = true;

    // Send input with fire flag
    room.receiveInput(p1, [{ s: 1, k: 0, a: 0, f: 1 }]);
    room.tick();

    const projsAfterFirst = (room as unknown as { state: { projectiles: Map<number, unknown> } }).state.projectiles.size;
    expect(projsAfterFirst).toBe(1);

    // Send immediate fire on next tick (before cooldown expires)
    room.receiveInput(p1, [{ s: 2, k: 0, a: 0, f: 1 }]);
    room.tick();

    // Should still only have 1 projectile spawned (cooldown blocked second shot)
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
