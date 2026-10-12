/**
 * lockstep.test.ts — deterministic lockstep (PHASES.md L1, L2;
 * docs/PHASE6_PLAN.md tests 1, 2 and 4).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { Room } from '../server/src/game/room.js';
import { GameServer, type Connection } from '../server/src/core.js';
import {
  LockstepLog, LockstepEncoder, applyRecord, worldHash, worldFromKeyframe,
  type LabWorld, type LockstepRecord, type Keyframe, type MsgLs,
} from '../shared/src/sync/index.js';
import { mulberry32 } from '../shared/src/sim/prng.js';
import { MOVER_PATTERNS } from '../shared/src/sim/movers.js';
import NET from '../shared/src/config/net.js';

const devBefore = process.env.NOBU_DEV;
afterEach(() => {
  if (devBefore === undefined) delete process.env.NOBU_DEV;
  else process.env.NOBU_DEV = devBefore;
});

/** Positions of every player and mover, by id. */
function positionsOf(world: LabWorld): Map<number, [number, number]> {
  const out = new Map<number, [number, number]>();
  for (const p of world.players.values()) out.set(p.id, [p.x, p.y]);
  for (const m of world.movers) out.set(m.id, [m.x, m.y]);
  return out;
}

/** The room's truth after the latest tick, as a world. */
function roomWorld(room: Room): LabWorld {
  return worldFromKeyframe(room.labKeyframe(), room.tickNumber);
}

describe('applyRecord reproduces Room.tick() (PHASE6_PLAN test 1)', () => {
  it('2 000 ticks of random inputs, backlogs, nudges, joins, leaves, movers and a map switch: bit-identical every tick', () => {
    process.env.NOBU_DEV = '1';
    const room = new Room('lab', () => {}, () => {});
    const rng = mulberry32(1234);
    const ids = [room.addPlayer('A'), room.addPlayer('B'), room.addPlayer('C')];
    const seq = new Map<number, number>(ids.map((id) => [id, 0]));
    room.setMovers([...MOVER_PATTERNS]);

    let world: LabWorld | null = null;
    let keyframes = 0;
    let hashesChecked = 0;
    let backlogTicks = 0;

    for (let t = 0; t < 2000; t++) {
      // Inputs: usually one per player, sometimes a burst that makes a backlog (2 per tick)
      for (const id of ids) {
        const n = rng() < 0.05 ? 6 : rng() < 0.15 ? 0 : 1;
        const inputs = [];
        for (let i = 0; i < n; i++) {
          const s = seq.get(id)! + 1;
          seq.set(id, s);
          inputs.push({ s, k: Math.floor(rng() * 16), a: 0, f: 0 as const });
        }
        if (inputs.length) room.receiveInput(id, inputs);
      }
      // Events between ticks
      if (t === 300) room.receivePerturb(ids[0], 40, -25);
      if (t === 600) ids.push(room.addPlayer('D'));
      if (t === 600) seq.set(ids[ids.length - 1], 0);
      if (t === 900) { room.removePlayer(ids[1]); ids.splice(1, 1); }
      if (t === 1100) room.setMovers(['circle', 'stopgo']);
      if (t === 1400) expect(room.devCommand(ids[0], { map: 'warehouse' })).toBe(true);
      if (t === 1700) expect(room.devCommand(null, { restart: true })).toBe(true);

      room.tick();
      const rec = room.lockstepLog!.get(room.tickNumber)!;
      expect(rec.k).toBe(room.tickNumber);
      if (rec.key) keyframes++;
      if (rec.in && Object.values(rec.in).some((k) => k.length === 2)) backlogTicks++;
      // The record must survive the wire unchanged
      world = applyRecord(world, JSON.parse(JSON.stringify(rec)) as LockstepRecord);

      const truth = roomWorld(room);
      expect(positionsOf(world)).toEqual(positionsOf(truth));
      expect(worldHash(world)).toBe(room.labHash());
      if (rec.h !== undefined) { expect(worldHash(world)).toBe(rec.h); hashesChecked++; }
    }
    expect(world!.map).toBe('warehouse'); // the restart kept the switched map
    // first record + perturb + join + leave + movers + map + restart
    expect(keyframes).toBe(7);
    expect(hashesChecked).toBe(Math.floor(2000 / NET.lockstep.hashEveryTicks));
    expect(backlogTicks).toBeGreaterThan(20);
  });

  it('a world one input off hashes differently', () => {
    const room = new Room('lab', () => {}, () => {});
    room.addPlayer('A');
    room.tick();
    const a = roomWorld(room);
    const b = roomWorld(room);
    [...b.players.values()][0].x += 1e-9;
    expect(worldHash(a)).not.toBe(worldHash(b));
  });

  it('only rooms without combat, bots, timers or power-ups keep a lockstep log', () => {
    expect(new Room('lab', () => {}, () => {}).lockstepLog).not.toBeNull();
    expect(new Room('main', () => {}, () => {}).lockstepLog).toBeNull();
  });
});

// ── Encoder (test 2) ──────────────────────────────────────────

const KEY: Keyframe = { map: 'neon', players: [{ id: 1, name: 'A', x: 100, y: 100, life: 1 }], movers: [] };

function logWith(from: number, to: number): LockstepLog {
  const log = new LockstepLog();
  for (let k = from; k <= to; k++) log.push({ k, in: { 1: [k % 16] } });
  return log;
}
const ticks = (m: MsgLs | null) => (m ? m.recs.map((r) => r.k) : []);

describe('LockstepEncoder (PHASE6_PLAN test 2)', () => {
  it('starts with a keyframe of the newest tick and repeats it until acknowledged', () => {
    const log = logWith(1, 10);
    const enc = new LockstepEncoder(false);
    const m1 = enc.encode(log, () => KEY, 5)!;
    expect(m1.tick).toBe(10);
    expect(m1.ack).toBe(5);
    expect(m1.recs).toEqual([{ k: 10, key: KEY }]);
    log.push({ k: 11 }); log.push({ k: 12 });
    expect(ticks(enc.encode(log, () => KEY, 5))).toEqual([10, 11, 12]); // base again (not acked)
    enc.onAck(12);
    log.push({ k: 13 }); log.push({ k: 14 });
    expect(ticks(enc.encode(log, () => KEY, 5))).toEqual([13, 14]);
    expect(enc.stats.keyframes).toBe(1);
  });

  it('Rd off: every record once; a NACK resends exactly the range asked for', () => {
    const log = logWith(1, 10);
    const enc = new LockstepEncoder(false);
    enc.encode(log, () => KEY, 0);
    enc.onAck(10);
    for (let k = 11; k <= 20; k += 2) {
      log.push({ k }); log.push({ k: k + 1 });
      expect(ticks(enc.encode(log, () => KEY, 0))).toEqual([k, k + 1]);
    }
    enc.onAck(14);
    enc.onNack(15, 17);
    log.push({ k: 21 }); log.push({ k: 22 });
    expect(ticks(enc.encode(log, () => KEY, 0))).toEqual([15, 16, 17, 21, 22]);
    expect(enc.stats.resent).toBe(3);
    // Ticks the client already acknowledged are never resent
    enc.onNack(10, 14);
    log.push({ k: 23 });
    expect(ticks(enc.encode(log, () => KEY, 0))).toEqual([23]);
  });

  it('Rd on: every message carries everything after the ack, capped at the window (then a resync)', () => {
    const log = logWith(1, 4);
    const enc = new LockstepEncoder(true);
    enc.encode(log, () => KEY, 0);
    enc.onAck(4);
    for (let k = 5; k <= 4 + NET.lockstep.windowMaxTicks; k++) log.push({ k });
    const m = enc.encode(log, () => KEY, 0)!;
    expect(ticks(m)).toEqual(Array.from({ length: NET.lockstep.windowMaxTicks }, (_, i) => 5 + i));
    enc.onAck(30);
    log.push({ k: 65 });
    expect(ticks(enc.encode(log, () => KEY, 0))[0]).toBe(31);
    // Too far behind: a fresh keyframe instead of the window
    for (let k = 66; k <= 100; k++) log.push({ k });
    const r = enc.encode(log, () => KEY, 0)!;
    expect(r.recs).toEqual([{ k: 100, key: KEY }]);
    expect(enc.stats.resyncs).toBe(1);
  });

  it('a NACK for a tick the ring no longer holds → resync', () => {
    const log = new LockstepLog(32);
    for (let k = 1; k <= 10; k++) log.push({ k });
    const enc = new LockstepEncoder(false);
    enc.encode(log, () => KEY, 0);
    enc.onAck(10);
    for (let k = 11; k <= 60; k++) log.push({ k });
    enc.encode(log, () => KEY, 0);
    expect(log.oldest).toBe(29);
    enc.onNack(11, 12);
    const r = enc.encode(log, () => KEY, 0)!;
    expect(r.recs).toEqual([{ k: 60, key: KEY }]);
    expect(enc.stats.resyncs).toBe(1);
  });

  it('a key request starts over; stale acks from before it do not count', () => {
    const log = logWith(1, 10);
    const enc = new LockstepEncoder(false);
    enc.encode(log, () => KEY, 0);
    enc.onAck(10);
    log.push({ k: 11 }); log.push({ k: 12 });
    enc.encode(log, () => KEY, 0);
    enc.onNack(0, 0, true);
    enc.onAck(11); // in flight before the request
    log.push({ k: 13 }); log.push({ k: 14 });
    expect(enc.encode(log, () => KEY, 0)!.recs).toEqual([{ k: 14, key: KEY }]);
    log.push({ k: 15 }); log.push({ k: 16 });
    expect(ticks(enc.encode(log, () => KEY, 0))).toEqual([14, 15, 16]); // base still unacked
  });

  it('acks never move backwards', () => {
    const enc = new LockstepEncoder(true);
    enc.onAck(50);
    enc.onAck(40);
    expect(enc.ackTick).toBe(50);
  });

  it('the ring keeps the last N ticks', () => {
    const log = new LockstepLog(8);
    for (let k = 1; k <= 20; k++) log.push({ k });
    expect(log.newest).toBe(20);
    expect(log.oldest).toBe(13);
    expect(log.get(12)).toBeUndefined();
    expect(log.get(13)?.k).toBe(13);
  });
});

// ── Server (test 4) ───────────────────────────────────────────

function connect(server: GameServer, room: 'main' | 'lab', sync?: object) {
  const inbox: Record<string, unknown>[] = [];
  const conn = server.addConnection((text) => inbox.push(JSON.parse(text)), () => {});
  server.handleMessage(conn, JSON.stringify({ t: 'hello', v: 1, name: 'T', room, nonce: 'n' + conn.id, ...(sync ? { sync } : {}) }));
  return { conn, inbox, ls: () => inbox.filter((m) => m.t === 'ls') as unknown as MsgLs[] };
}

describe('Server lockstep connections (PHASE6_PLAN test 4)', () => {
  it('lockstep outside the lab → LOCKSTEP_LAB_ONLY, and the model stays', () => {
    const server = new GameServer(() => 0);
    const { conn, inbox } = connect(server, 'main', { model: 'lockstep' });
    expect(inbox.some((m) => m.t === 'error' && m.code === 'LOCKSTEP_LAB_ONLY')).toBe(true);
    expect(conn.sync).toEqual({ model: 'full' });
    expect(conn.playerId).not.toBeNull(); // still joined
    server.handleMessage(conn, JSON.stringify({ t: 'sync', model: 'delta' }));
    server.handleMessage(conn, JSON.stringify({ t: 'sync', model: 'lockstep', rd: true }));
    expect(conn.sync).toEqual({ model: 'delta' });
    expect(conn.lockstep).toBeNull();
  });

  it('in the lab: ls instead of snapshots; records = the consumed inputs; acks and rd switch', () => {
    const server = new GameServer(() => 0);
    const a = connect(server, 'lab', { model: 'lockstep' });
    const room = server.getRoom('lab');
    expect(a.conn.lockstep).not.toBeNull();
    for (let i = 0; i < 4; i++) server.tick();
    expect(a.inbox.some((m) => m.t === 'snap')).toBe(false);
    const first = a.ls()[0];
    expect(first.recs[0].key?.players.map((p) => p.id)).toEqual([a.conn.playerId]);

    server.handleMessage(a.conn, JSON.stringify({ t: 'input', inputs: [{ s: 1, k: 8, a: 0, f: 0 }, { s: 2, k: 1, a: 0, f: 0 }], sa: room.tickNumber }));
    server.tick(); server.tick();
    const last = a.ls()[a.ls().length - 1];
    expect(last.recs.map((r) => r.k)).toEqual([room.tickNumber - 1, room.tickNumber]);
    expect(last.recs[0].in).toEqual({ [a.conn.playerId!]: [8] });
    expect(last.recs[1].in).toEqual({ [a.conn.playerId!]: [1] });
    expect(last.ack).toBe(2); // lastConsumedSeq follows

    // Rd on keeps the encoder (and its ack)
    const enc = a.conn.lockstep;
    server.handleMessage(a.conn, JSON.stringify({ t: 'sync', model: 'lockstep', rd: true }));
    expect(a.conn.lockstep).toBe(enc);
    expect(enc!.rd).toBe(true);
    expect(a.conn.sync).toEqual({ model: 'lockstep', rd: true });
    // Back to full: snapshots again
    server.handleMessage(a.conn, JSON.stringify({ t: 'sync', model: 'full' }));
    server.tick(); server.tick();
    expect(a.conn.lockstep).toBeNull();
    expect(a.inbox[a.inbox.length - 1].t).toBe('snap');
    expect(room.metrics.sync.lockstep.msgs).toBeGreaterThan(0);
  });

  it('keyframes on join, leave, perturb, restart, map and movers — and nowhere else', () => {
    process.env.NOBU_DEV = '1';
    const server = new GameServer(() => 0);
    const a = connect(server, 'lab', { model: 'lockstep', rd: true });
    const room = server.getRoom('lab');
    const log = room.lockstepLog!;
    const keyTicks = () => {
      const out: number[] = [];
      for (let k = log.oldest; k <= log.newest; k++) if (log.get(k)?.key) out.push(k);
      return out.length;
    };
    const run = (n: number) => { for (let i = 0; i < n; i++) server.tick(); };
    run(10);
    expect(keyTicks()).toBeGreaterThanOrEqual(1);
    let b: Connection | null = null;
    const cases: [string, () => void][] = [
      ['join', () => { b = connect(server, 'lab').conn; }],
      ['leave', () => server.removeConnection(b!)],
      ['perturb', () => server.handleMessage(a.conn, JSON.stringify({ t: 'perturb', dx: 30, dy: 0 }))],
      ['restart', () => server.handleMessage(a.conn, JSON.stringify({ t: 'dev', restart: true }))],
      ['map', () => server.handleMessage(a.conn, JSON.stringify({ t: 'dev', map: 'plaza' }))],
      ['movers', () => server.handleMessage(a.conn, JSON.stringify({ t: 'lab', movers: ['circle'] }))],
    ];
    for (const [name, what] of cases) {
      const before = keyTicks();
      what();
      run(5);
      expect(keyTicks(), name).toBe(before + 1);
    }
    // Inputs alone never make a keyframe
    const before = keyTicks();
    for (let s = 1; s <= 30; s++) {
      server.handleMessage(a.conn, JSON.stringify({ t: 'input', inputs: [{ s, k: 8, a: 0, f: 0 }] }));
      server.tick();
    }
    expect(keyTicks()).toBe(before);
  });

  it('lsNack resends (Rd off) and a key request makes a fresh keyframe', () => {
    const server = new GameServer(() => 0);
    const a = connect(server, 'lab', { model: 'lockstep' });
    const room = server.getRoom('lab');
    for (let i = 0; i < 10; i++) server.tick();
    server.handleMessage(a.conn, JSON.stringify({ t: 'snapAck', tick: room.tickNumber }));
    for (let i = 0; i < 10; i++) server.tick();
    const t = room.tickNumber;
    server.handleMessage(a.conn, JSON.stringify({ t: 'lsNack', from: t - 5, to: t - 3 }));
    server.tick(); server.tick();
    expect(a.ls()[a.ls().length - 1].recs.map((r) => r.k)).toEqual([t - 5, t - 4, t - 3, t + 1, t + 2]);
    server.handleMessage(a.conn, JSON.stringify({ t: 'lsNack', from: 0, to: 0, key: true }));
    server.tick(); server.tick();
    const last = a.ls()[a.ls().length - 1];
    expect(last.recs).toHaveLength(1);
    expect(last.recs[0].key).toBeDefined();
    expect(a.conn.lockstep!.stats.resyncs).toBe(1);
  });
});
