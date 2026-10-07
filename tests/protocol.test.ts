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
      match: { state: 'RUNNING', timeLeftMs: 120000, results: null },
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
        },
      ],
      projectiles: [],
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
    expect(decodeClient(JSON.stringify({ t: 'hello', v: 999 }))).toBeNull(); // bad version
    expect(decodeClient(JSON.stringify({ t: 'input', inputs: 'not-an-array' }))).toBeNull();
  });
});
