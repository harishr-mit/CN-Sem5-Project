/**
 * hash.ts — deterministic state hash for golden vector tests.
 * SPEC.md §7.3
 */

/** FNV-1a hash of two float64 values. Returns a hex string. */
export function hashState(x: number, y: number): string {
  // Convert floats to their IEEE 754 bit representation using DataView.
  const buf = new ArrayBuffer(16);
  const view = new DataView(buf);
  view.setFloat64(0, x, true);
  view.setFloat64(8, y, true);

  let hash = 2166136261;
  for (let i = 0; i < 16; i++) {
    hash ^= view.getUint8(i);
    hash = Math.imul(hash, 16777619);
    hash >>>= 0;
  }
  return hash.toString(16).padStart(8, '0');
}
