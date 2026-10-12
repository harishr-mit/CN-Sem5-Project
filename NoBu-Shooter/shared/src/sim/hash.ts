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

/** An entity's position for hashWorld. */
export interface HashEntity {
  id: number;
  x: number;
  y: number;
}

/**
 * hashWorld — FNV-1a over the IEEE 754 bits of every entity's id, x and y,
 * sorted by id (docs/PHASE6_PLAN.md D6). Players and movers are hashed the
 * same way. Two worlds hash equal only if every position is bit-identical.
 * Returns an unsigned 32-bit integer.
 */
export function hashWorld(entities: Iterable<HashEntity>): number {
  const list = [...entities].sort((a, b) => a.id - b.id);
  const view = new DataView(new ArrayBuffer(8));
  let hash = 2166136261;
  const feed = (v: number) => {
    view.setFloat64(0, v, true);
    for (let i = 0; i < 8; i++) {
      hash ^= view.getUint8(i);
      hash = Math.imul(hash, 16777619);
    }
  };
  for (const e of list) { feed(e.id); feed(e.x); feed(e.y); }
  return hash >>> 0;
}
