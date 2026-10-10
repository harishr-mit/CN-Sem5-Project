/**
 * diff.ts — field-level diff/patch for flat records and id-keyed lists
 * (docs/PHASE3_PLAN.md §3). Values are compared exactly (no rounding, D4);
 * object values (match results) by their JSON.
 */

import type { FieldPatch, EntityPatch } from '../protocol/messages.js';

type Rec = Record<string, unknown>;

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Fields of `next` that differ from `base`, plus `del` for fields `next` no longer has. Null = no change. */
export function diffFields<T extends object>(base: T, next: T): FieldPatch<T> | null {
  const a = base as Rec;
  const b = next as Rec;
  const out: Rec = {};
  let changed = false;
  for (const k of Object.keys(b)) {
    if (!(k in a) || !sameValue(a[k], b[k])) { out[k] = b[k]; changed = true; }
  }
  const del = Object.keys(a).filter((k) => !(k in b));
  if (del.length) { out['del'] = del; changed = true; }
  return changed ? (out as FieldPatch<T>) : null;
}

/** Apply a FieldPatch to a copy of `base`. */
export function patchFields<T extends object>(base: T, patch: FieldPatch<T>): T {
  const out: Rec = { ...(base as Rec) };
  const p = patch as Rec;
  for (const k of Object.keys(p)) if (k !== 'del') out[k] = p[k];
  for (const k of (p['del'] as string[] | undefined) ?? []) delete out[k];
  return out as T;
}

export interface ListDiff<T extends { id: number }> {
  /** Changed entities (patches) and new ones (complete records). */
  changed: EntityPatch<T>[];
  gone: number[];
}

/** Id-keyed diff of two entity lists. */
export function diffList<T extends { id: number }>(base: readonly T[], next: readonly T[]): ListDiff<T> {
  const byId = new Map<number, T>();
  for (const e of base) byId.set(e.id, e);
  const changed: EntityPatch<T>[] = [];
  const present = new Set<number>();
  for (const e of next) {
    present.add(e.id);
    const b = byId.get(e.id);
    if (!b) { changed.push({ ...e } as unknown as EntityPatch<T>); continue; }
    const d = diffFields(b, e);
    if (d) changed.push({ id: e.id, ...d } as unknown as EntityPatch<T>);
  }
  const gone = base.filter((e) => !present.has(e.id)).map((e) => e.id);
  return { changed, gone };
}

/**
 * Apply a list diff: the base's order is kept, removed ids are dropped and
 * new entities appended (so the order can differ from the server's; every
 * consumer looks entities up by id).
 */
export function patchList<T extends { id: number }>(
  base: readonly T[], changed: readonly EntityPatch<T>[] = [], gone: readonly number[] = [],
): T[] {
  const patches = new Map<number, EntityPatch<T>>();
  for (const c of changed) patches.set(c.id, c);
  const goneSet = new Set(gone);
  const out: T[] = [];
  for (const e of base) {
    if (goneSet.has(e.id)) continue;
    const p = patches.get(e.id);
    if (p) { out.push(patchFields(e, p as unknown as FieldPatch<T>)); patches.delete(e.id); }
    else out.push(e);
  }
  // Ids the base doesn't have: complete records
  for (const p of patches.values()) out.push(patchFields({} as T, p as unknown as FieldPatch<T>));
  return out;
}
