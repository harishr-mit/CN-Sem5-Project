/**
 * movers.test.ts — scripted lab movers and spectators (PHASES.md C3, C6).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { moverPath, MOVER_PATTERNS, type MoverCfg, type MoverPattern } from '../shared/src/sim/movers.js';
import { closestPointOnRect } from '../shared/src/sim/geometry.js';
import { Room } from '../server/src/game/room.js';
import { GameServer } from '../server/src/core.js';
import GAME from '../shared/src/config/game.js';
import GAME_JSON from '../shared/src/config/game.json';
import type { MsgSnap, MsgWelcome } from '../shared/src/protocol/messages.js';

const CFG: MoverCfg = { speed: GAME.lab.moverSpeed, stopGo: GAME.lab.stopGo };
const R = GAME.player.radius;
const HZ = GAME.sim.hz;

/** Sample a pattern every tick for `seconds` of server time. */
function samples(pattern: MoverPattern, seconds: number): { x: number; y: number }[] {
  return Array.from({ length: seconds * HZ + 1 }, (_, i) => moverPath(pattern, i / HZ, CFG));
}

function moverSnaps(snap: MsgSnap) {
  return snap.players.filter((p) => p.mover !== undefined);
}

describe('Mover paths (shared/src/sim/movers.ts)', () => {
  it('game.ts mirrors game.json (both are imported in different places)', () => {
    expect(GAME).toEqual(GAME_JSON);
  });

  it('are pure: the same time always gives the same position', () => {
    for (const p of MOVER_PATTERNS) {
      for (const t of [0, 0.5, 3.25, 1234.567]) expect(moverPath(p, t, CFG)).toEqual(moverPath(p, t, CFG));
    }
  });

  it('are continuous: no step between ticks is longer than speed / hz', () => {
    for (const p of MOVER_PATTERNS) {
      const pts = samples(p, 60);
      for (let i = 1; i < pts.length; i++) {
        const step = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        expect(step).toBeLessThanOrEqual(CFG.speed / HZ + 1e-9);
      }
    }
  });

  it('move at the configured speed (stop–go: only during its move phase)', () => {
    const travelled = (p: MoverPattern, seconds: number) => {
      const pts = samples(p, seconds);
      let d = 0;
      for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      return d;
    };
    for (const p of ['circle', 'zigzag', 'reversal'] as const) {
      expect(travelled(p, 10)).toBeGreaterThan(CFG.speed * 10 * 0.99);
    }
    const cycleSec = (CFG.stopGo.moveMs + CFG.stopGo.stopMs) / 1000;
    const stopGo = travelled('stopgo', cycleSec * 4);
    expect(stopGo).toBeCloseTo(CFG.speed * (CFG.stopGo.moveMs / 1000) * 4, 0);
  });

  it('keep clear of obstacles and arena edges', () => {
    for (const p of MOVER_PATTERNS) {
      for (const pt of samples(p, 30)) {
        expect(pt.x).toBeGreaterThanOrEqual(R + 4);
        expect(pt.y).toBeGreaterThanOrEqual(R + 4);
        expect(pt.x).toBeLessThanOrEqual(GAME.arena.width - R - 4);
        expect(pt.y).toBeLessThanOrEqual(GAME.arena.height - R - 4);
        for (const o of GAME.maps.neon.obstacles) {
          const c = closestPointOnRect(pt, o);
          expect(Math.hypot(pt.x - c.x, pt.y - c.y)).toBeGreaterThanOrEqual(R + 4);
        }
      }
    }
  });

  it('keep clear of the lab spawn, which is clear of obstacles too (GAMERULES.md §14)', () => {
    const spawn = GAME.rooms.lab.spawn;
    expect(GAME_JSON.rooms.lab.spawn).toEqual(spawn);
    // Same clearance as the main spawn points (docs/PHASE2_PLAN.md §3)
    for (const p of MOVER_PATTERNS) {
      for (const pt of samples(p, 30)) expect(Math.hypot(pt.x - spawn.x, pt.y - spawn.y)).toBeGreaterThanOrEqual(108);
    }
    for (const o of GAME.maps.neon.obstacles) {
      const c = closestPointOnRect(spawn, o);
      expect(Math.hypot(spawn.x - c.x, spawn.y - c.y)).toBeGreaterThanOrEqual(R + 4);
    }
  });

  it('use separate lanes: two movers never overlap', () => {
    const paths = MOVER_PATTERNS.map((p) => samples(p, 30).filter((_, i) => i % 3 === 0));
    for (let a = 0; a < paths.length; a++) {
      for (let b = a + 1; b < paths.length; b++) {
        let min = Infinity;
        for (const pa of paths[a]) for (const pb of paths[b]) min = Math.min(min, Math.hypot(pa.x - pb.x, pa.y - pb.y));
        expect(min).toBeGreaterThan(2 * R + 8);
      }
    }
  });
});

describe('Movers in the Room (server/src/game/room.ts)', () => {
  it('are deterministic and sit exactly on moverPath(pattern, tick / hz)', () => {
    const a = new Room('lab', () => {}, () => {});
    const b = new Room('lab', () => {}, () => {});
    a.setMovers([...MOVER_PATTERNS]);
    b.setMovers([...MOVER_PATTERNS]);
    for (let i = 0; i < 600; i++) { a.tick(); b.tick(); }

    const sa = a.buildSnapshot(null);
    const sb = b.buildSnapshot(null);
    const ma = moverSnaps(sa);
    expect(ma).toHaveLength(4);
    expect(ma.map(({ x, y, mover }) => ({ x, y, mover }))).toEqual(moverSnaps(sb).map(({ x, y, mover }) => ({ x, y, mover })));
    for (const m of ma) expect({ x: m.x, y: m.y }).toEqual(moverPath(m.mover!, sa.tick / HZ, CFG));
  });

  it('do not count as players, and only rooms with movers enabled accept them', () => {
    const lab = new Room('lab', () => {}, () => {});
    expect(lab.setMovers(['circle', 'zigzag'])).toBe(true);
    for (let i = 0; i < 7; i++) lab.addPlayer(`P${i}`);
    expect(lab.playerCount).toBe(7);
    expect(lab.isFull()).toBe(false);
    const ids = new Set(lab.buildSnapshot(null).players.map((p) => p.id));
    expect(ids.size).toBe(9); // 7 players + 2 movers, no id clashes

    const main = new Room('main', () => {}, () => {});
    expect(main.setMovers(['circle'])).toBe(false);
    expect(moverSnaps(main.buildSnapshot(null))).toHaveLength(0);
  });

  it('replacing the set removes and adds movers; existing movers keep their id', () => {
    const room = new Room('lab', () => {}, () => {});
    room.setMovers(['circle', 'reversal']);
    const circleId = moverSnaps(room.buildSnapshot(null)).find((m) => m.mover === 'circle')!.id;
    room.setMovers(['circle', 'stopgo']);
    const movers = moverSnaps(room.buildSnapshot(null));
    expect(movers.map((m) => m.mover).sort()).toEqual(['circle', 'stopgo']);
    expect(movers.find((m) => m.mover === 'circle')!.id).toBe(circleId);
  });

  it('are cleared when the last player and spectator leave', () => {
    const room = new Room('lab', () => {}, () => {});
    const id = room.addPlayer('P');
    room.addSpectator();
    room.setMovers(['circle']);
    room.removePlayer(id);
    expect(room.activeMovers).toEqual(['circle']); // the spectator is still watching
    room.removeSpectator();
    expect(room.activeMovers).toEqual([]);
  });
});

describe('Spectators (GameServer, hello.spectate)', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  function connect(server: GameServer) {
    const inbox: Record<string, unknown>[] = [];
    const conn = server.addConnection((text) => inbox.push(JSON.parse(text)), () => {});
    return { conn, inbox };
  }

  it('get a welcome and snapshots but no player; their input is ignored', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const server = new GameServer(() => 0);
    const lab = server.rooms.get('lab')!;
    const { conn, inbox } = connect(server);
    server.handleMessage(conn, JSON.stringify({ t: 'hello', v: 1, name: 'REF', room: 'lab', nonce: 'n1', spectate: true }));

    const welcome = inbox.find((m) => m['t'] === 'welcome') as unknown as MsgWelcome;
    expect(welcome.spectator).toBe(true);
    expect(welcome.playerId).toBe(0);
    expect(lab.playerCount).toBe(0);
    expect(lab.spectatorCount).toBe(1);

    // A repeated hello is answered with the same welcome, not a second join
    server.handleMessage(conn, JSON.stringify({ t: 'hello', v: 1, name: 'REF', room: 'lab', nonce: 'n1', spectate: true }));
    expect(lab.spectatorCount).toBe(1);

    server.handleMessage(conn, JSON.stringify({ t: 'input', inputs: [{ s: 1, k: 8, a: 0, f: 0 }] }));
    server.handleMessage(conn, JSON.stringify({ t: 'lab', movers: ['circle'] }));
    for (let i = 0; i < 4; i++) server.tick();
    const snaps = inbox.filter((m) => m['t'] === 'snap') as unknown as MsgSnap[];
    expect(snaps.length).toBeGreaterThanOrEqual(2);
    const last = snaps[snaps.length - 1];
    expect(last.ack).toBe(0);
    expect(moverSnaps(last).map((m) => m.mover)).toEqual(['circle']);
    expect(lab.playerCount).toBe(0);

    server.removeConnection(conn);
    expect(lab.spectatorCount).toBe(0);
  });

  it('a `lab` message in the main room changes nothing', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const server = new GameServer(() => 0);
    const { conn } = connect(server);
    server.handleMessage(conn, JSON.stringify({ t: 'hello', v: 1, name: 'P', room: 'main', nonce: 'n2' }));
    server.handleMessage(conn, JSON.stringify({ t: 'lab', movers: ['circle'] }));
    expect(server.rooms.get('main')!.activeMovers).toEqual([]);
  });
});
