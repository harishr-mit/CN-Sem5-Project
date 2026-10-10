import { describe, it, expect } from 'vitest';
import { encodeClient, decodeClient, encodeServer, decodeServer } from '../shared/src/protocol/codec.js';

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
});
