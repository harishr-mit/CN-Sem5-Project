/**
 * sync.test.ts — Phase 3 sync core (docs/PHASE3_PLAN.md §6 tests 1–3):
 * field diff/patch, delta encoder/decoder over a lossy, reordering,
 * duplicating channel with acks fed back, and the state encoder.
 */

import { describe, it, expect } from 'vitest';
import {
  diffFields, patchFields, diffList, patchList, DeltaEncoder, DeltaDecoder, StateEncoder, stateToSnap,
  createEncoder, nextSync, syncLabel, normalizeSync, SYNC_CYCLE,
} from '../shared/src/sync/index.js';
import { mulberry32 } from '../shared/src/sim/prng.js';
import type { MsgSnap, MsgSnapDelta, PlayerSnap, ProjectileSnap, GameEvent } from '../shared/src/protocol/messages.js';
import { initialCombat } from '../shared/src/sim/combat.js';
import GAME from '../shared/src/config/game.js';

// ── A random world that changes like a room does ─────────────────────────
class World {
  tick = 0;
  st = 0;
  players: PlayerSnap[] = [];
  projectiles: ProjectileSnap[] = [];
  pickups: MsgSnap['pickups'] = [];
  events: GameEvent[] = [];
  me = initialCombat();
  timeLeftMs = 180_000;
  results: MsgSnap['match']['results'] = null;
  private nextId = 1;
  private nextEid = 1;
  readonly emitted: number[] = [];

  constructor(private rnd: () => number) {
    for (let i = 0; i < 5; i++) this.addPlayer(i === 4);
  }

  private addPlayer(mover = false): void {
    const id = this.nextId++;
    this.players.push({
      id, name: `P${id}`, bot: mover, x: this.rnd() * 1280, y: this.rnd() * 720, alive: true, life: 1,
      protectMs: 0, respawnMs: 0, score: 0, aim: 0, weapon: 'handgun', reloading: false, shield: false, fast: false,
      ...(mover ? { mover: 'circle' as const } : {}),
    });
    this.emit('PLAYER_JOIN', id);
  }

  emit(type: GameEvent['type'], playerId?: number): void {
    const eid = this.nextEid++;
    this.events.push({ eid, type, tick: this.tick, ...(playerId !== undefined ? { playerId } : {}) });
    this.emitted.push(eid);
  }

  step(): void {
    const r = this.rnd;
    this.tick += 2;
    this.st += 1000 / 30;
    this.timeLeftMs -= 1000 / 30;
    for (const p of this.players) {
      if (r() < 0.8) { p.x += r() * 6 - 3; p.y += r() * 6 - 3; }
      if (r() < 0.1) p.aim = r() * 6.28;
      if (r() < 0.03) p.shield = !p.shield;
      if (r() < 0.03) p.weapon = (['handgun', 'rifle', 'shotgun'] as const)[Math.floor(r() * 3)];
      if (r() < 0.02) { if (p.invincible) delete p.invincible; else p.invincible = true; }
      if (r() < 0.02) { p.alive = !p.alive; p.life++; this.emit('PLAYER_DEATH', p.id); }
    }
    if (r() < 0.05 && this.players.length > 2) {
      const gone = this.players.splice(Math.floor(r() * this.players.length), 1)[0];
      this.emit('PLAYER_LEAVE', gone.id);
    }
    if (r() < 0.05 && this.players.length < 8) this.addPlayer(r() < 0.3);
    for (const pr of this.projectiles) { pr.x += pr.dx * 10; pr.y += pr.dy * 10; }
    this.projectiles = this.projectiles.filter(() => r() > 0.08);
    if (r() < 0.4) {
      const a = r() * 6.28;
      this.projectiles.push({ id: this.nextId++, owner: 1, x: r() * 1280, y: r() * 720, dx: Math.cos(a), dy: Math.sin(a), ...(r() < 0.2 ? { pierce: true as const } : {}) });
      this.emit('PROJECTILE_SPAWN');
    }
    if (r() < 0.05) this.pickups = r() < 0.5 ? [] : [{ id: this.nextId++, x: r() * 1280, y: r() * 720, kind: 'speed' }];
    if (r() < 0.3) { this.me = { ...this.me, ammo: Math.floor(r() * 8) }; }
    if (r() < 0.01) this.results = this.results ? null : { scoreboard: [{ id: 1, name: 'P1', score: 3, left: false }], winners: [1] };
    // Events are kept for 500 ms (15 snapshots), like Room.pruneEvents
    this.events = this.events.filter((e) => e.tick >= this.tick - 30);
  }

  snapshot(): MsgSnap {
    return {
      t: 'snap', tick: this.tick, st: this.st, ack: this.tick * 3,
      match: { state: 'RUNNING', map: 'neon', timeLeftMs: this.timeLeftMs, results: this.results },
      players: this.players.map((p) => ({ ...p })),
      projectiles: this.projectiles.map((p) => ({ ...p })),
      pickups: this.pickups.map((p) => ({ ...p })),
      me: { ...this.me },
      events: this.events, // live array, like Room.buildSnapshot
    };
  }
}

/** Snapshot content compared keyed by id, without events. */
function canon(s: MsgSnap) {
  const byId = <T extends { id: number }>(a: T[]) => [...a].sort((x, y) => x.id - y.id);
  return { tick: s.tick, st: s.st, ack: s.ack, match: s.match, players: byId(s.players), projectiles: byId(s.projectiles), pickups: s.pickups, me: s.me };
}

/** A one-way channel with loss, duplication and random delay (= reordering), stepped per snapshot. */
class Channel<T> {
  private queue: { at: number; msg: T }[] = [];
  constructor(private rnd: () => number, private loss: number, private dup = 0, private maxDelay = 3) {}
  send(msg: T, now: number): void {
    const copies = this.rnd() < this.dup ? 2 : 1;
    for (let i = 0; i < copies; i++) {
      if (this.rnd() < this.loss) continue;
      this.queue.push({ at: now + 1 + Math.floor(this.rnd() * this.maxDelay), msg });
    }
  }
  receive(now: number): T[] {
    const due = this.queue.filter((q) => q.at <= now).map((q) => q.msg);
    this.queue = this.queue.filter((q) => q.at > now);
    return due;
  }
}

function runStream(seed: number, loss: number, steps: number, ackLoss = loss) {
  const rnd = mulberry32(seed);
  const world = new World(mulberry32(seed + 100));
  const enc = new DeltaEncoder();
  const dec = new DeltaDecoder();
  const down = new Channel<string>(rnd, loss, loss > 0 ? 0.05 : 0, 4);
  const up = new Channel<number>(rnd, ackLoss, 0, 3);
  const truth = new Map<number, MsgSnap>();
  const decoded: MsgSnap[] = [];
  const eids = new Set<number>();
  let deltaBytes = 0;
  let fullBytes = 0;

  for (let i = 0; i < steps; i++) {
    world.step();
    const snap = world.snapshot();
    truth.set(snap.tick, JSON.parse(JSON.stringify(snap)) as MsgSnap);
    const text = JSON.stringify(enc.encode(snap));
    deltaBytes += text.length;
    fullBytes += JSON.stringify(snap).length;
    down.send(text, i);
    for (const t of down.receive(i)) {
      const msg = JSON.parse(t) as MsgSnap | MsgSnapDelta;
      let out: MsgSnap | null;
      if (msg.t === 'snap') { dec.store(msg); out = msg; }
      else out = dec.decode(msg);
      if (!out) continue;
      decoded.push(out);
      for (const e of out.events) eids.add(e.eid);
      up.send(dec.newestTick, i);
    }
    for (const tick of up.receive(i)) enc.onAck(tick);
  }
  return { world, enc, dec, truth, decoded, eids, deltaBytes, fullBytes };
}

// ── 1. Field diff/patch ──────────────────────────────────────────────────
describe('diffFields / patchFields', () => {
  it('round-trips random records, including removed optional fields and nested values', () => {
    const rnd = mulberry32(3);
    for (let i = 0; i < 500; i++) {
      const make = () => {
        const o: Record<string, unknown> = { id: 1, x: rnd() * 100, name: rnd() < 0.5 ? 'a' : 'b', alive: rnd() < 0.5 };
        if (rnd() < 0.5) o['invincible'] = true;
        if (rnd() < 0.5) o['results'] = rnd() < 0.5 ? null : { winners: [Math.floor(rnd() * 3)] };
        return o;
      };
      const a = make();
      const b = make();
      const d = diffFields(a, b);
      expect(d === null ? a : patchFields(a, d)).toEqual(b);
    }
  });

  it('returns null when nothing changed and keeps a legitimate null value', () => {
    expect(diffFields({ x: 1, results: null }, { x: 1, results: null })).toBeNull();
    const d = diffFields({ x: 1, results: { w: 1 } } as Record<string, unknown>, { x: 1, results: null });
    expect(d).toEqual({ results: null });
    expect(patchFields({ x: 1, results: { w: 1 } } as Record<string, unknown>, d!)).toEqual({ x: 1, results: null });
    expect(diffFields({ x: 1, invincible: true } as Record<string, unknown>, { x: 1 })).toEqual({ del: ['invincible'] });
  });

  it('diffs id-keyed lists: changed, new and gone entities', () => {
    const base = [{ id: 1, x: 0 }, { id: 2, x: 0 }, { id: 3, x: 0 }];
    const next = [{ id: 1, x: 0 }, { id: 3, x: 5 }, { id: 4, x: 9 }];
    const d = diffList(base, next);
    expect(d.changed).toEqual([{ id: 3, x: 5 }, { id: 4, x: 9 }]);
    expect(d.gone).toEqual([2]);
    expect(patchList(base, d.changed, d.gone)).toEqual(next);
  });
});

// ── 2. Delta stream ──────────────────────────────────────────────────────
describe('Delta snapshots (D3)', () => {
  it('every decoded snapshot equals the server snapshot of that tick (clean link)', () => {
    const r = runStream(1, 0, 600);
    expect(r.decoded.length).toBeGreaterThanOrEqual(595); // the last few are still in flight
    for (const s of r.decoded) expect(canon(s)).toEqual(canon(r.truth.get(s.tick)!));
    expect(r.enc.fallbacks).toBe(0);
    expect(r.deltaBytes).toBeLessThan(r.fullBytes * 0.5);
  });

  it('survives 30 % loss, duplication and reordering: exact snapshots, no event lost', () => {
    for (const seed of [2, 5, 9]) {
      const r = runStream(seed, 0.3, 900);
      expect(r.decoded.length).toBeGreaterThan(500);
      for (const s of r.decoded) expect(canon(s)).toEqual(canon(r.truth.get(s.tick)!));
      expect(r.dec.missingBase).toBe(0);
      // Every event older than the last second was delivered
      const lastTick = r.world.tick;
      const old = r.world.emitted.filter((eid) => eid < r.world.emitted[r.world.emitted.length - 1] - 60);
      for (const eid of old) expect(r.eids.has(eid), `eid ${eid} (last tick ${lastTick})`).toBe(true);
    }
  });

  it('falls back to a full snapshot when acks stop for longer than 1 s, then resumes deltas; no event is lost', () => {
    const world = new World(mulberry32(11));
    const enc = new DeltaEncoder();
    const dec = new DeltaDecoder();
    const kinds: string[] = [];
    const eids = new Set<number>();
    for (let i = 0; i < 100; i++) {
      world.step();
      if (i % 7 === 0) world.emit('PICKUP', 1); // events throughout, also while the link is down
      const msg = enc.encode(world.snapshot());
      kinds.push(msg.t);
      // Snapshots 10..69 are lost and nothing is acknowledged (2 s, beyond the room's 500 ms of events)
      if (i >= 10 && i < 70) continue;
      const out = msg.t === 'snap' ? (dec.store(msg), msg) : dec.decode(msg);
      expect(out).not.toBeNull();
      for (const e of out!.events) eids.add(e.eid);
      enc.onAck(dec.newestTick);
    }
    expect(kinds[0]).toBe('snap');
    expect(kinds.slice(1, 11).every((k) => k === 'snapDelta')).toBe(true);
    // Base of snapshot 9 is > 1 s old from about snapshot 40 on
    const firstFallback = kinds.indexOf('snap', 1);
    expect(firstFallback).toBeGreaterThanOrEqual(38);
    expect(firstFallback).toBeLessThanOrEqual(42);
    expect(kinds.slice(firstFallback, 71).every((k) => k === 'snap')).toBe(true);
    expect(kinds.slice(72).every((k) => k === 'snapDelta')).toBe(true);
    expect(enc.fallbacks).toBeGreaterThan(20);
    // The encoder's event log re-sent what the room had already pruned
    for (const eid of world.emitted) expect(eids.has(eid), `eid ${eid}`).toBe(true);
  });
});

// ── 3. Edge cases ────────────────────────────────────────────────────────
describe('Delta edge cases', () => {
  it('rejects a delta whose base is unknown, without applying anything', () => {
    const world = new World(mulberry32(4));
    const enc = new DeltaEncoder();
    world.step();
    enc.encode(world.snapshot());
    enc.onAck(world.tick);
    world.step();
    const delta = enc.encode(world.snapshot());
    expect(delta.t).toBe('snapDelta');
    const dec = new DeltaDecoder();
    expect(dec.decode(delta as MsgSnapDelta)).toBeNull();
    expect(dec.missingBase).toBe(1);
    expect(dec.newestTick).toBe(-1);
  });

  it('never uses an unacknowledged base', () => {
    const world = new World(mulberry32(6));
    const enc = new DeltaEncoder();
    for (let i = 0; i < 10; i++) { world.step(); expect(enc.encode(world.snapshot()).t).toBe('snap'); }
    enc.onAck(world.tick - 2); // the one before last
    world.step();
    const d = enc.encode(world.snapshot()) as MsgSnapDelta;
    expect(d.t).toBe('snapDelta');
    expect(d.base).toBe(world.tick - 4);
    enc.onAck(3); // older acks don't move the base back
    world.step();
    expect((enc.encode(world.snapshot()) as MsgSnapDelta).base).toBe(world.tick - 6);
  });

  it('includes events pushed into the live events array after a snapshot was encoded', () => {
    const world = new World(mulberry32(8));
    const enc = new DeltaEncoder();
    world.step();
    const first = world.snapshot();
    enc.encode(first);
    enc.onAck(first.tick);
    // Emitted between ticks (e.g. PLAYER_JOIN from a hello) into the same array
    world.emit('PLAYER_JOIN', 99);
    const eid = world.emitted[world.emitted.length - 1];
    expect(first.events.some((e) => e.eid === eid)).toBe(true); // the live-array gotcha
    world.step();
    const d = enc.encode(world.snapshot()) as MsgSnapDelta;
    expect(d.events?.some((e) => e.eid === eid)).toBe(true);
  });

  it('decodes a duplicated delta to the same snapshot', () => {
    const world = new World(mulberry32(10));
    const enc = new DeltaEncoder();
    const dec = new DeltaDecoder();
    world.step();
    const full = enc.encode(world.snapshot()) as MsgSnap;
    dec.store(full);
    enc.onAck(full.tick);
    world.step();
    const d = enc.encode(world.snapshot()) as MsgSnapDelta;
    const a = dec.decode(d)!;
    const b = dec.decode(d)!;
    expect(canon(b)).toEqual(canon(a));
  });
});

// ── State encoder ────────────────────────────────────────────────────────
describe('State sync (D5)', () => {
  it('sends every 3rd snapshot at 10 Hz and every snapshot at 30 Hz, with velocities', () => {
    const world = new World(mulberry32(12));
    const e10 = new StateEncoder(10);
    const e30 = new StateEncoder(30);
    let n10 = 0;
    let n30 = 0;
    for (let i = 0; i < 90; i++) {
      world.step();
      const snap = world.snapshot();
      const vel = new Map(snap.players.map((p) => [p.id, { vx: p.id * 10, vy: -p.id }]));
      const m10 = e10.encode(snap, vel);
      const m30 = e30.encode(snap, vel);
      if (m10) { n10++; expect(m10.tick % 6).toBe(0); expect(m10.hz).toBe(10); }
      if (m30) {
        n30++;
        const back = stateToSnap(JSON.parse(JSON.stringify(m30)));
        expect(canon(back.snap)).toEqual(canon(snap));
        for (const p of snap.players) expect(back.vel.get(p.id)).toEqual({ vx: p.id * 10, vy: -p.id });
        expect(back.hz).toBe(30);
      }
    }
    expect(n30).toBe(90);
    expect(n10).toBe(30);
  });

  it('createEncoder and the sync helpers', () => {
    const world = new World(mulberry32(13));
    world.step();
    const snap = world.snapshot();
    expect(createEncoder({ model: 'full' }).encode(snap, new Map())).toBe(snap);
    expect(createEncoder({ model: 'state' }).spec).toEqual({ model: 'state', hz: 10 });
    expect(normalizeSync({ model: 'delta', hz: 30 })).toEqual({ model: 'delta' });
    expect(SYNC_CYCLE.map(syncLabel)).toEqual(['FULL', 'DELTA', 'STATE 10', 'STATE 30']);
    expect(nextSync({ model: 'state', hz: 30 })).toEqual({ model: 'full' });
    expect(nextSync({ model: 'state' })).toEqual({ model: 'state', hz: 30 });
  });
});

// ── Server: per-connection encoders (docs/PHASE3_PLAN.md D1, D2) ─────────
import { GameServer } from '../server/src/core.js';
import { MOVER_PATTERNS } from '../shared/src/sim/movers.js';
import type { MsgState } from '../shared/src/protocol/messages.js';

describe('GameServer sync models', () => {
  function join(server: GameServer, name: string, extra: Record<string, unknown> = {}) {
    const inbox: Record<string, unknown>[] = [];
    const conn = server.addConnection((text) => inbox.push(JSON.parse(text)), () => {});
    server.handleMessage(conn, JSON.stringify({ t: 'hello', v: 1, name, room: 'lab', nonce: name, ...extra }));
    return { conn, inbox, send: (m: unknown) => server.handleMessage(conn, JSON.stringify(m)) };
  }
  /** World content shared by every viewer: match, players (by id), projectiles, pickups. */
  const world = (s: MsgSnap) => {
    const c = canon(s);
    return { tick: c.tick, st: c.st, match: c.match, players: c.players, projectiles: c.projectiles, pickups: c.pickups };
  };

  it('sends full, delta and state per connection; delta decodes to the spectator\'s truth', () => {
    let now = 0; // advances with the ticks (the server rate-limits per second)
    const server = new GameServer(() => now);
    const ref = join(server, 'REF', { spectate: true, sync: { model: 'delta' } }); // spectators ignore sync
    const full = join(server, 'F');
    const delta = join(server, 'D', { sync: { model: 'delta' } });
    const state = join(server, 'S', { sync: { model: 'state' } });
    ref.send({ t: 'lab', movers: MOVER_PATTERNS });
    const dec = new DeltaDecoder();
    let seq = 0;
    const counts: Record<string, number> = {};
    for (let tick = 0; tick < 300; tick++) {
      seq++;
      for (const c of [full, delta, state]) c.send({ t: 'input', inputs: [{ s: seq, k: tick % 120 < 60 ? 8 : 4, a: 0, f: 0 }] });
      server.tick();
      now += 1000 / 60;
      for (const m of delta.inbox.splice(0)) {
        counts[`D:${m.t}`] = (counts[`D:${m.t}`] ?? 0) + 1;
        const out = m.t === 'snap' ? (dec.store(m as unknown as MsgSnap), m as unknown as MsgSnap) : m.t === 'snapDelta' ? dec.decode(m as unknown as MsgSnapDelta) : null;
        if (!out) continue;
        const truth = ref.inbox.find((r) => r.t === 'snap' && r.tick === out.tick) as unknown as MsgSnap;
        expect(world(out)).toEqual(world(truth));
        delta.send({ t: 'snapAck', tick: dec.newestTick });
      }
      for (const m of full.inbox.splice(0)) counts[`F:${m.t}`] = (counts[`F:${m.t}`] ?? 0) + 1;
      for (const m of state.inbox.splice(0)) {
        counts[`S:${m.t}`] = (counts[`S:${m.t}`] ?? 0) + 1;
        if (m.t !== 'state') continue;
        const st = m as unknown as MsgState;
        expect(st.hz).toBe(10);
        for (const p of st.players.filter((x) => x.mover && x.mover !== 'stopgo')) {
          expect(Math.hypot(p.vx, p.vy)).toBeCloseTo(GAME.lab.moverSpeed, 0);
        }
      }
    }
    expect(ref.inbox.every((m) => m.t !== 'snapDelta' && m.t !== 'state')).toBe(true);
    expect(counts['F:snap']).toBe(150);
    expect(counts['D:snap']).toBe(1); // only the first, before any ack
    expect(counts['D:snapDelta']).toBe(149);
    expect(counts['S:state']).toBe(50);
    const traffic = server.getRoom('lab').metrics.sync;
    expect(traffic.delta.bytes).toBeLessThan(traffic.full.bytes * 0.4);
    expect(traffic.deltaFallbacks).toBe(0);
  });

  it('switches a connection live without touching its player; acks also ride on input.sa', () => {
    const server = new GameServer(() => 0);
    const c = join(server, 'A');
    const id = (c.inbox[0] as { playerId: number }).playerId;
    for (let i = 0; i < 4; i++) server.tick();
    c.send({ t: 'sync', model: 'delta' });
    c.inbox.length = 0;
    for (let i = 0; i < 4; i++) {
      server.tick();
      const last = c.inbox[c.inbox.length - 1] as { tick: number } | undefined;
      c.send({ t: 'input', inputs: [{ s: i + 1, k: 0, a: 0, f: 0 }], ...(last ? { sa: last.tick } : {}) });
    }
    expect(c.inbox.map((m) => m.t)).toEqual(['snap', 'snapDelta']);
    c.send({ t: 'sync', model: 'state', hz: 30 });
    c.inbox.length = 0;
    server.tick(); server.tick();
    expect(c.inbox.map((m) => m.t)).toEqual(['state']);
    const players = (c.inbox[0] as unknown as MsgState).players;
    expect(players.some((p) => p.id === id)).toBe(true);
    expect(server.getRoom('lab').playerCount).toBe(1);
  });
});
