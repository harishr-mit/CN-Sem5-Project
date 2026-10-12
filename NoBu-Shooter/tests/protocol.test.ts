import { describe, it, expect } from 'vitest';
import { encodeClient, decodeClient, encodeServer, decodeServer } from '../shared/src/protocol/codec.js';
import { validateLs, type MsgLs } from '../shared/src/protocol/messages.js';

describe('Wire Protocol Serialization & Validation (SPEC.md §8)', () => {
  it('encodes and decodes valid client hello message', () => {
    const raw = encodeClient({
      t: 'hello',
      v: 1,
      name: 'ACE_01',
      room: 'main',
      nonce: 'abc123nonce',
    });

    const parsed = decodeClient(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.t).toBe('hello');
    if (parsed?.t === 'hello') {
      expect(parsed.name).toBe('ACE_01');
      expect(parsed.room).toBe('main');
      expect(parsed.nonce).toBe('abc123nonce');
    }
  });

  it('encodes and decodes valid client input message', () => {
    const raw = encodeClient({
      t: 'input',
      inputs: [
        { s: 101, k: 5, a: 1.571, f: 0 },
        { s: 102, k: 1, a: 1.571, f: 1 },
      ],
    });

    const parsed = decodeClient(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.t).toBe('input');
    if (parsed?.t === 'input') {
      expect(parsed.inputs).toHaveLength(2);
      expect(parsed.inputs[0].s).toBe(101);
      expect(parsed.inputs[1].f).toBe(1);
    }
  });

  it('encodes and decodes valid server snapshot message', () => {
    const raw = encodeServer({
      t: 'snap',
      tick: 400,
      st: 13340.5,
      ack: 99,
      match: { state: 'RUNNING', map: 'neon', timeLeftMs: 120000, results: null },
      players: [
        {
          id: 1,
          name: 'P1',
          bot: false,
          x: 200,
          y: 300,
          alive: true,
          life: 4,
          protectMs: 0,
          respawnMs: 0,
          score: 3,
          aim: 0.5,
          weapon: 'shotgun',
          reloading: false,
          shield: true,
          fast: false,
        },
      ],
      projectiles: [],
      pickups: [{ id: 7, x: 440, y: 360, kind: 'dash' }],
      me: { weapon: 'shotgun', weaponTicks: 300, ammo: 4, reserve: 5, reloadTicks: 0, cooldownTicks: 10, speedTicks: 0, pierceTicks: 0, dashTicks: 200, dashBurstTicks: 0, dashCooldownTicks: 30 },
      events: [],
    });

    const parsed = decodeServer(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.t).toBe('snap');
    if (parsed?.t === 'snap') {
      expect(parsed.tick).toBe(400);
      expect(parsed.players[0].name).toBe('P1');
    }
  });

  it('safely rejects malformed or invalid client messages without throwing', () => {
    expect(decodeClient('not json')).toBeNull();
    expect(decodeClient(JSON.stringify({ t: 'unknown_type' }))).toBeNull();
    expect(decodeClient(JSON.stringify({ t: 'hello', v: 999 }))).toBeNull();
    expect(decodeClient(JSON.stringify({ t: 'input', inputs: 'not-an-array' }))).toBeNull();
    // Reload flag (GAMERULES.md §6a): optional, 0 or 1
    expect(decodeClient(JSON.stringify({ t: 'input', inputs: [{ s: 1, k: 0, a: 0, f: 0, r: 1 }] }))).not.toBeNull();
    expect(decodeClient(JSON.stringify({ t: 'input', inputs: [{ s: 1, k: 0, a: 0, f: 0, r: 2 }] }))).toBeNull();
    expect(decodeClient(JSON.stringify({ t: 'input', inputs: [{ s: 1, k: 8, a: 0, f: 0, d: 1 }] }))).not.toBeNull();
    expect(decodeClient(JSON.stringify({ t: 'dev', invincible: true }))).toEqual({ t: 'dev', invincible: true });
    expect(decodeClient(JSON.stringify({ t: 'dev', invincible: 'yes' }))).toBeNull();
    // Owner revision 2026-10-11: give / endless / restart / map (all optional, at least one)
    expect(decodeClient(JSON.stringify({ t: 'dev', give: 'speed' }))).toEqual({ t: 'dev', give: 'speed' });
    expect(decodeClient(JSON.stringify({ t: 'dev', give: 'ammo' }))).toBeNull();
    expect(decodeClient(JSON.stringify({ t: 'dev', endless: false }))).toEqual({ t: 'dev', endless: false });
    expect(decodeClient(JSON.stringify({ t: 'dev', restart: true, map: 'plaza' }))).toEqual({ t: 'dev', restart: true, map: 'plaza' });
    expect(decodeClient(JSON.stringify({ t: 'dev', restart: false }))).toBeNull();
    expect(decodeClient(JSON.stringify({ t: 'dev', map: 'moon' }))).toBeNull();
    expect(decodeClient(JSON.stringify({ t: 'dev' }))).toBeNull();
    expect(decodeClient(JSON.stringify({ t: 'dev', other: 1 }))).toBeNull();
  });

  it('validates hello.spectate and the lab message (PHASES.md C2, C3)', () => {
    const hello = { t: 'hello', v: 1, name: 'REF', room: 'lab', nonce: 'n' };
    expect(decodeClient(JSON.stringify({ ...hello, spectate: true }))).not.toBeNull();
    expect(decodeClient(JSON.stringify(hello))).not.toBeNull();
    expect(decodeClient(JSON.stringify({ ...hello, spectate: 'yes' }))).toBeNull();

    const lab = decodeClient(JSON.stringify({ t: 'lab', movers: ['circle', 'zigzag', 'circle'] }));
    expect(lab).toEqual({ t: 'lab', movers: ['circle', 'zigzag'] }); // duplicates dropped
    expect(decodeClient(JSON.stringify({ t: 'lab', movers: [] }))).toEqual({ t: 'lab', movers: [] });
    expect(decodeClient(JSON.stringify({ t: 'lab', movers: ['spiral'] }))).toBeNull();
    expect(decodeClient(JSON.stringify({ t: 'lab', movers: 'circle' }))).toBeNull();
    expect(decodeClient(JSON.stringify({ t: 'lab' }))).toBeNull();
  });

  it('validates the Phase 3 sync messages (docs/PHASE3_PLAN.md §2)', () => {
    const hello = { t: 'hello', v: 1, name: 'A', room: 'lab', nonce: 'n' };
    expect(decodeClient(JSON.stringify({ ...hello, sync: { model: 'delta' } }))).not.toBeNull();
    expect(decodeClient(JSON.stringify({ ...hello, sync: { model: 'state', hz: 30 } }))).not.toBeNull();
    expect(decodeClient(JSON.stringify({ ...hello, sync: { model: 'rollback' } }))).toBeNull(); // lockstep is valid since Phase 6
    expect(decodeClient(JSON.stringify({ ...hello, sync: { model: 'state', hz: 20 } }))).toBeNull();
    expect(decodeClient(JSON.stringify({ ...hello, sync: 'delta' }))).toBeNull();

    expect(decodeClient(JSON.stringify({ t: 'sync', model: 'full' }))).toEqual({ t: 'sync', model: 'full' });
    expect(decodeClient(JSON.stringify({ t: 'sync', model: 'state', hz: 10, x: 1 }))).toEqual({ t: 'sync', model: 'state', hz: 10 });
    expect(decodeClient(JSON.stringify({ t: 'sync', model: 'state', hz: '10' }))).toBeNull();
    expect(decodeClient(JSON.stringify({ t: 'sync' }))).toBeNull();

    expect(decodeClient(JSON.stringify({ t: 'snapAck', tick: 42 }))).toEqual({ t: 'snapAck', tick: 42 });
    expect(decodeClient(JSON.stringify({ t: 'snapAck', tick: -1 }))).toBeNull();
    expect(decodeClient(JSON.stringify({ t: 'snapAck', tick: 1.5 }))).toBeNull();
    expect(decodeClient(JSON.stringify({ t: 'snapAck' }))).toBeNull();

    const input = { t: 'input', inputs: [{ s: 1, k: 0, a: 0, f: 0 }] };
    expect(decodeClient(JSON.stringify({ ...input, sa: 12 }))).not.toBeNull();
    expect(decodeClient(JSON.stringify({ ...input, sa: 'x' }))).toBeNull();
  });
});

describe('Lockstep messages (docs/PHASE6_PLAN.md test 3)', () => {
  it('sync and hello accept lockstep with rd; bad rd is rejected', () => {
    expect(decodeClient(JSON.stringify({ t: 'sync', model: 'lockstep' }))).toEqual({ t: 'sync', model: 'lockstep' });
    expect(decodeClient(JSON.stringify({ t: 'sync', model: 'lockstep', rd: true }))).toEqual({ t: 'sync', model: 'lockstep', rd: true });
    expect(decodeClient(JSON.stringify({ t: 'sync', model: 'lockstep', rd: 'yes' }))).toBeNull();
    const hello = { t: 'hello', v: 1, name: 'A', room: 'lab', nonce: 'n' };
    expect(decodeClient(JSON.stringify({ ...hello, sync: { model: 'lockstep', rd: true } }))).not.toBeNull();
    expect(decodeClient(JSON.stringify({ ...hello, sync: { model: 'lockstep', rd: 1 } }))).toBeNull();
    expect(decodeClient(JSON.stringify({ ...hello, sync: { model: 'rollback' } }))).toBeNull();
  });

  it('lsNack: ticks, from <= to, a bounded span, key only true', () => {
    expect(decodeClient(JSON.stringify({ t: 'lsNack', from: 10, to: 12 }))).toEqual({ t: 'lsNack', from: 10, to: 12 });
    expect(decodeClient(JSON.stringify({ t: 'lsNack', from: 0, to: 0, key: true }))).toEqual({ t: 'lsNack', from: 0, to: 0, key: true });
    expect(decodeClient(JSON.stringify({ t: 'lsNack', from: 12, to: 10 }))).toBeNull();
    expect(decodeClient(JSON.stringify({ t: 'lsNack', from: -1, to: 3 }))).toBeNull();
    expect(decodeClient(JSON.stringify({ t: 'lsNack', from: 1.5, to: 3 }))).toBeNull();
    expect(decodeClient(JSON.stringify({ t: 'lsNack', from: 0, to: 100000 }))).toBeNull();
    expect(decodeClient(JSON.stringify({ t: 'lsNack', from: 0, to: 0, key: false }))).toBeNull();
  });

  it('validateLs accepts good tick records and rejects malformed ones', () => {
    const key = { map: 'neon', players: [{ id: 3, name: 'A', x: 1.5, y: 2, life: 1 }], movers: [{ id: 9, pattern: 'circle' }] };
    const good = { t: 'ls', tick: 20, ack: 7, recs: [{ k: 19, key }, { k: 20, in: { 3: [8, 1] }, h: 4294967295 }] };
    expect(validateLs(JSON.parse(encodeServer(good as MsgLs)))).toEqual(good);
    const bad: unknown[] = [
      { ...good, tick: -1 },
      { ...good, ack: 'x' },
      { ...good, recs: [{ k: 1.5 }] },
      { ...good, recs: [{ k: 1, in: { 3: [16] } }] },
      { ...good, recs: [{ k: 1, in: { x: [1] } }] },
      { ...good, recs: [{ k: 1, in: [[1]] }] },
      { ...good, recs: [{ k: 1, in: { 3: [1, 1, 1, 1, 1, 1, 1, 1, 1] } }] },
      { ...good, recs: [{ k: 1, h: -2 }] },
      { ...good, recs: [{ k: 1, key: { ...key, map: 'moon' } }] },
      { ...good, recs: [{ k: 1, key: { ...key, players: [{ id: 3, name: 'A', x: null, y: 2, life: 1 }] } }] },
      { ...good, recs: [{ k: 1, key: { ...key, movers: [{ id: 9, pattern: 'spiral' }] } }] },
      { ...good, recs: 'none' },
      { ...good, t: 'snap' },
    ];
    for (const b of bad) expect(validateLs(b), JSON.stringify(b)).toBeNull();
  });
});
