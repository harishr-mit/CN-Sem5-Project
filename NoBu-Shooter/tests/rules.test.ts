import { describe, it, expect } from 'vitest';
import { Room } from '../server/src/game/room.js';
import GAME from '../shared/src/config/game.json';
import { mapDef } from '../shared/src/config/game.js';
import { isValidPowerupSpot } from '../shared/src/sim/powerups.js';

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
    const center = GAME.maps.neon.obstacles[0]; // { x: 600, y: 310, w: 80, h: 100 }
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
      // Furthest distance from the window's start (a bot may circle back)
      const far = bots.map(() => 0);
      for (let i = 0; i < 300; i++) { // 5 s
        room.tick();
        bots.forEach((b, k) => { far[k] = Math.max(far[k], Math.hypot(b.x - start[k].x, b.y - start[k].y)); });
      }
      const moved = bots.filter((b, i) => !start[i].alive || !b.alive || far[i] > 40);
      expect(moved.length).toBe(bots.length);
    }
  });
});

// ── Phase 2.5: maps, weapons, reload, power-ups (GAMERULES.md §3, §6–§6b) ──

type Combat = { weapon: string; ammo: number; reloadTicks: number; speedTicks: number };
type FullInternals = {
  roomCfg: { bots: boolean };
  state: {
    matchState: string;
    map: string;
    endedTicksLeft: number;
    pickups: { id: number; x: number; y: number; kind: string }[];
    events: { type: string; playerId?: number; victim?: number; kind?: string }[];
    projectiles: Map<number, { ownerId: number; x: number; y: number; dx: number; dy: number }>;
    players: Map<number, { id: number; x: number; y: number; alive: boolean; protectionTicksLeft: number; shield: boolean; invincible: boolean; combat: Combat }>;
  };
};

/** A main room without bots, two humans, ticked into RUNNING. */
function runningMain() {
  const room = new Room('main', () => {}, () => {});
  const it = room as unknown as FullInternals;
  it.roomCfg.bots = false;
  const a = room.addPlayer('A', false);
  const b = room.addPlayer('B', false);
  for (let i = 0; i < 200 && it.state.matchState !== 'RUNNING'; i++) room.tick();
  expect(it.state.matchState).toBe('RUNNING');
  for (const p of it.state.players.values()) p.protectionTicksLeft = 0;
  return { room, it, a, b };
}

let seqs = new Map<number, number>();
function input(room: Room, id: number, f: 0 | 1, r?: 1, a = 0): void {
  const s = (seqs.get(id) ?? 0) + 1;
  seqs.set(id, s);
  room.receiveInput(id, [{ s, k: 0, a, f, ...(r ? { r } : {}) }]);
  room.tick();
}

describe('Phase 2.5 rules: maps, weapons, reload, power-ups', () => {
  it('main rotates maps at every COUNTDOWN; lab is always neon with no power-ups', () => {
    const { room, it } = runningMain();
    expect(it.state.map).toBe(GAME.maps.rotation[0]);
    expect(room.buildSnapshot(null).match.map).toBe(GAME.maps.rotation[0]);
    it.state.matchState = 'ENDED';
    it.state.endedTicksLeft = 1;
    room.tick();
    expect(it.state.matchState).toBe('COUNTDOWN');
    expect(it.state.map).toBe(GAME.maps.rotation[1]);

    const lab = new Room('lab', () => {}, () => {});
    const id = lab.addPlayer('L', false);
    lab.tick();
    const snap = lab.buildSnapshot(id);
    expect(snap.match.map).toBe('neon');
    expect(snap.pickups).toEqual([]);
    expect(snap.me?.weapon).toBe('handgun');
  });

  it('a shot uses a round; R reloads (RELOAD_START) and refills after reloadMs', () => {
    seqs = new Map();
    const { room, it, a } = runningMain();
    const me = it.state.players.get(a)!;
    input(room, a, 1);
    expect(me.combat.ammo).toBe(GAME.weapons.handgun.magazine - 1);
    input(room, a, 0, 1);
    expect(it.state.events.some((e) => e.type === 'RELOAD_START' && e.playerId === a)).toBe(true);
    const reloadTicks = Math.round(GAME.weapons.handgun.reloadMs * GAME.sim.hz / 1000);
    for (let i = 0; i < reloadTicks; i++) input(room, a, 0);
    expect(me.combat.ammo).toBe(GAME.weapons.handgun.magazine);
  });

  it('the shotgun fires 3 projectiles per shot', () => {
    seqs = new Map();
    const { room, it, a } = runningMain();
    it.state.players.get(a)!.combat.weapon = 'shotgun';
    it.state.players.get(a)!.combat.ammo = GAME.weapons.shotgun.magazine;
    it.state.projectiles.clear();
    input(room, a, 1, undefined, Math.PI / 2);
    const mine = [...it.state.projectiles.values()].filter((p) => p.ownerId === a);
    expect(mine).toHaveLength(3);
  });

  it('power-ups: ⌊players / 2⌋ at random valid spots; lowest id wins a tie; a new one 10 s after a pickup', () => {
    seqs = new Map();
    const { room, it, a, b } = runningMain();
    const map = mapDef(it.state.map);
    expect(it.state.pickups).toHaveLength(1); // 2 players → 1
    for (const pk of it.state.pickups) expect(isValidPowerupSpot(map, pk)).toBe(true);
    const pk = it.state.pickups[0];
    pk.kind = 'speed';
    for (const id of [a, b]) { const p = it.state.players.get(id)!; p.x = pk.x; p.y = pk.y; }
    room.tick();
    expect(it.state.pickups).toHaveLength(0);
    expect(it.state.players.get(Math.min(a, b))!.combat.speedTicks).toBeGreaterThan(0);
    expect(it.state.players.get(Math.max(a, b))!.combat.speedTicks).toBe(0);
    expect(it.state.events.some((e) => e.type === 'PICKUP' && e.kind === 'speed')).toBe(true);
    for (const id of [a, b]) it.state.players.get(id)!.x = 30;
    const respawn = Math.round(GAME.powerups.respawnMs * GAME.sim.hz / 1000);
    for (let i = 0; i < respawn - 1; i++) room.tick();
    expect(it.state.pickups).toHaveLength(0);
    room.tick();
    expect(it.state.pickups).toHaveLength(1);
    expect(it.state.pickups[0].id).not.toBe(pk.id);
    expect(isValidPowerupSpot(map, it.state.pickups[0])).toBe(true);

    // Two more players: the cap rises to 2, the second one arrives 10 s later
    room.addPlayer('C', false);
    room.addPlayer('D', false);
    for (const p of it.state.players.values()) p.x = 30;
    for (let i = 0; i < respawn + 1; i++) room.tick();
    expect(it.state.pickups).toHaveLength(2);
  });

  it('developer invincibility: refused without npm run demo; when on, hits never kill', () => {
    seqs = new Map();
    const { room, it, a, b } = runningMain();
    expect(room.setDev(b, true)).toBe(false); // NOBU_DEV is not set in tests
    const shooter = it.state.players.get(a)!;
    const target = it.state.players.get(b)!;
    it.state.pickups = [];
    shooter.x = 200; shooter.y = 40;
    target.x = 320; target.y = 40;
    target.invincible = true;
    input(room, a, 1);
    for (let i = 0; i < 20; i++) room.tick();
    expect(target.alive).toBe(true);
    expect(room.buildSnapshot(a).players.find((p) => p.id === b)?.invincible).toBe(true);
  });

  it('a shield absorbs one hit (SHIELD_HIT), the next one kills', () => {
    seqs = new Map();
    const { room, it, a, b } = runningMain();
    const shooter = it.state.players.get(a)!;
    const target = it.state.players.get(b)!;
    it.state.pickups = [];
    shooter.x = 200; shooter.y = 40;
    target.x = 320; target.y = 40;
    target.shield = true;
    input(room, a, 1);
    for (let i = 0; i < 20; i++) room.tick();
    expect(target.alive).toBe(true);
    expect(target.shield).toBe(false);
    expect(it.state.events.some((e) => e.type === 'SHIELD_HIT' && e.victim === b)).toBe(true);
    for (let i = 0; i < 18; i++) input(room, a, 1);
    for (let i = 0; i < 20; i++) room.tick();
    expect(target.alive).toBe(false);
    expect(target.combat.weapon).toBe('handgun');
  });
});
