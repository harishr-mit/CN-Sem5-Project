/**
 * fragment.test.ts — UDP datagram discipline (docs/PHASE5_PLAN.md D2, test 1).
 */

import { describe, it, expect } from 'vitest';
import { Fragmenter, Reassembler } from '../shared/src/net/fragment.js';
import NET from '../shared/src/config/net.js';
import { mulberry32 } from '../shared/src/sim/prng.js';

const MAX = NET.udp.maxDatagram;

function message(bytes: number, seed = 1): string {
  const rng = mulberry32(seed);
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789{}":,ÆØÅ✓ü';
  let s = '{"t":"snap","d":"';
  while (Buffer.byteLength(s) < bytes) s += alphabet[Math.floor(rng() * alphabet.length)];
  return s + '"}';
}

describe('Fragmenter / Reassembler (PHASE5_PLAN D2)', () => {
  it('round-trips 1 B – 10 kB messages, multi-byte UTF-8 included; every datagram ≤ 1200 B', () => {
    const f = new Fragmenter();
    const r = new Reassembler();
    for (const size of [1, 100, 1199, 1200, 1201, 2100, 2400, 5000, 10_000]) {
      const text = size === 1 ? '{' : message(size, size);
      const parts = f.split(text);
      for (const p of parts) expect(p.length).toBeLessThanOrEqual(MAX);
      if (Buffer.byteLength(text) <= MAX) expect(parts).toHaveLength(1);
      else expect(parts.length).toBeGreaterThan(1);
      let out: string | null = null;
      for (const p of parts) out = r.push(p, 0) ?? out;
      expect(out).toBe(text);
    }
    expect(r.messagesDropped).toBe(0);
  });

  it('a 2.1 kB full snapshot needs 2 fragments with a readable ASCII header', () => {
    const parts = new Fragmenter().split(message(2100));
    expect(parts).toHaveLength(2);
    expect(parts[0].toString('ascii', 0, 8)).toMatch(/^~0\.0\/2\|/);
    expect(parts[1].toString('ascii', 0, 8)).toMatch(/^~0\.1\/2\|/);
  });

  it('accepts fragments in any order and ignores duplicates', () => {
    const f = new Fragmenter();
    const r = new Reassembler();
    const text = message(5000, 9);
    const parts = f.split(text);
    const shuffled = [parts[3], parts[0], parts[0], parts[4], parts[2], parts[1], parts[1]].filter(Boolean);
    const outs = shuffled.map((p) => r.push(p, 10)).filter((x) => x !== null);
    expect(outs).toEqual([text]);
    // A late duplicate of a completed message does not start a new one
    expect(r.push(parts[2], 20)).toBeNull();
    r.purge(10_000);
    expect(r.messagesDropped).toBe(0);
  });

  it('a missing fragment drops the whole message after reassemblyMs, and it is counted', () => {
    const f = new Fragmenter();
    const r = new Reassembler();
    const parts = f.split(message(3000));
    expect(r.push(parts[0], 0)).toBeNull();
    expect(r.push(parts[2], 10)).toBeNull();
    expect(r.pendingCount).toBe(1);
    r.purge(NET.udp.reassemblyMs - 1);
    expect(r.pendingCount).toBe(1);
    r.purge(NET.udp.reassemblyMs + 1);
    expect(r.pendingCount).toBe(0);
    expect(r.messagesDropped).toBe(1);
    // The late fragment cannot resurrect it as a complete message
    expect(r.push(parts[1], NET.udp.reassemblyMs + 2)).toBeNull();
  });

  it('keeps at most maxPending incomplete messages (oldest dropped first)', () => {
    const f = new Fragmenter();
    const r = new Reassembler();
    const firsts = Array.from({ length: NET.udp.maxPending + 3 }, (_, i) => f.split(message(2500, i + 1))[0]);
    for (const p of firsts) r.push(p, 0);
    expect(r.pendingCount).toBe(NET.udp.maxPending);
    expect(r.messagesDropped).toBe(3);
  });

  it('plain JSON passes through; garbage and a message starting with "~" are handled', () => {
    const r = new Reassembler();
    expect(r.push(Buffer.from('{"t":"pong"}'), 0)).toBe('{"t":"pong"}');
    expect(r.push(Buffer.from('~zz.9/2|x'), 0)).toBeNull();
    expect(r.push(Buffer.from('~nope'), 0)).toBeNull();
    expect(r.malformed).toBe(2);
    const tilde = '~ not json but must survive';
    const parts = new Fragmenter().split(tilde);
    expect(parts).toHaveLength(1);
    expect(r.push(parts[0], 0)).toBe(tilde);
  });

  it('loss amplification: at 10 % datagram loss a 2-fragment message arrives ≈ 81 % of the time', () => {
    const rng = mulberry32(42);
    const f = new Fragmenter();
    const r = new Reassembler();
    const N = 4000;
    let got = 0;
    const text = message(2100, 3);
    for (let i = 0; i < N; i++) {
      for (const p of f.split(text)) if (rng() >= 0.1 && r.push(p, i * 1000) !== null) got++;
    }
    expect(got / N).toBeGreaterThan(0.78);
    expect(got / N).toBeLessThan(0.84);
  });
});
