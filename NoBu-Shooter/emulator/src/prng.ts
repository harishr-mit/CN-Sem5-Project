/**
 * prng.ts — mulberry32, a seeded 32-bit PRNG returning floats in [0, 1).
 * A local copy (same algorithm and sequence as shared/src/sim/prng.ts) so the
 * emulator has no dependency on the game (docs/PHASE5_PLAN.md D3).
 */
export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return function (): number {
    s = (s + 0x6d2b79f5) | 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}
