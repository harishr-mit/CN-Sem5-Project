import { describe, it, expect } from 'vitest';
import { Room } from '../server/src/game/room.js';
import GAME from '../shared/src/config/game.json';

type Internals = {
  state: {
    matchState: string;
    players: Map<number, { x: number; y: number; alive: boolean; bot: boolean }>;
  };
};

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

  it('lab room is always RUNNING, even with a single player (GAMERULES.md §14)', () => {
    const room = new Room('lab', () => {}, () => {});
    const id = room.addPlayer('Solo', false);
    room.tick();
    const internals = room as unknown as Internals;
    expect(internals.state.matchState).toBe('RUNNING');
    expect(internals.state.players.get(id)!.alive).toBe(true);
  });

  it('perturb never pushes a player into an obstacle', () => {
    const room = new Room('lab', () => {}, () => {});
    const id = room.addPlayer('Nudge', false);
    const p = (room as unknown as Internals).state.players.get(id)!;
    const center = GAME.obstacles[0]; // { x: 600, y: 310, w: 80, h: 100 }
    p.x = center.x - 40;
    p.y = center.y + center.h / 2;
    room.receivePerturb(id, 60, 0); // would land inside the block
    const r = GAME.player.radius;
    const insideX = p.x > center.x - r && p.x < center.x + center.w + r;
    const insideY = p.y > center.y - r && p.y < center.y + center.h + r;
    expect(insideX && insideY).toBe(false);
  });

  it('lab room spawns every player at the fixed lab spawn, so Compare panes start together (GAMERULES.md §14)', () => {
    const room = new Room('lab', () => {}, () => {});
    const a = room.addPlayer('Twin_A', false);
    const b = room.addPlayer('Twin_B', false);
    const players = (room as unknown as Internals).state.players;
    const spawn = GAME.rooms.lab.spawn;
    for (const id of [a, b]) {
      expect(players.get(id)!.x).toBe(spawn.x);
      expect(players.get(id)!.y).toBe(spawn.y);
    }
  });

  it('bots keep moving (no lock-on through walls, no getting stuck)', () => {
    const room = new Room('main', () => {}, () => {});
    room.addPlayer('Human', false);
    const internals = room as unknown as Internals;
    // Countdown (3 s) then 20 s of play
    for (let i = 0; i < 200; i++) room.tick();
    expect(internals.state.matchState).toBe('RUNNING');

    const bots = [...internals.state.players.values()].filter(p => p.bot);
    expect(bots.length).toBe(3);
    for (let window = 0; window < 4; window++) {
      const start = bots.map(b => ({ x: b.x, y: b.y, alive: b.alive }));
      for (let i = 0; i < 300; i++) room.tick(); // 5 s
      const moved = bots.filter((b, i) =>
        !start[i].alive || !b.alive || Math.hypot(b.x - start[i].x, b.y - start[i].y) > 40);
      expect(moved.length).toBe(bots.length);
    }
  });
});
