/**
 * types.ts — sync model selection (PHASES.md Phase 3, docs/PHASE3_PLAN.md D1, D5).
 * No imports from the protocol, so messages.ts can use these types.
 */

/** full = complete snapshots; delta = changes vs an acknowledged snapshot; state = records + velocity, extrapolated. */
export type SyncModel = 'full' | 'delta' | 'state';
/** State sync send rates (Hz). */
export type StateHz = 10 | 30;

export interface SyncSpec {
  model: SyncModel;
  /** State only; defaults to NET.state.defaultHz. */
  hz?: StateHz;
}

export const SYNC_MODELS: readonly SyncModel[] = ['full', 'delta', 'state'];
export const STATE_RATES: readonly StateHz[] = [10, 30];
export const DEFAULT_STATE_HZ: StateHz = 10;
export const DEFAULT_SYNC: SyncSpec = { model: 'full' };

/** Order of the SYNC chip / `Y` hotkey. */
export const SYNC_CYCLE: readonly SyncSpec[] = [
  { model: 'full' },
  { model: 'delta' },
  { model: 'state', hz: 10 },
  { model: 'state', hz: 30 },
];

export function isSyncModel(v: unknown): v is SyncModel {
  return v === 'full' || v === 'delta' || v === 'state';
}

export function isStateHz(v: unknown): v is StateHz {
  return v === 10 || v === 30;
}

export function isSyncSpec(v: unknown): v is SyncSpec {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return isSyncModel(o['model']) && (o['hz'] === undefined || isStateHz(o['hz']));
}

/** Canonical form: `hz` only (and always) on state. */
export function normalizeSync(s: SyncSpec): SyncSpec {
  return s.model === 'state' ? { model: 'state', hz: s.hz ?? DEFAULT_STATE_HZ } : { model: s.model };
}

export function sameSync(a: SyncSpec, b: SyncSpec): boolean {
  const x = normalizeSync(a);
  const y = normalizeSync(b);
  return x.model === y.model && x.hz === y.hz;
}

export function nextSync(s: SyncSpec): SyncSpec {
  const i = SYNC_CYCLE.findIndex((c) => sameSync(c, s));
  return { ...SYNC_CYCLE[(i + 1) % SYNC_CYCLE.length] };
}

export function syncLabel(s: SyncSpec): string {
  const n = normalizeSync(s);
  return n.model === 'state' ? `STATE ${n.hz}` : n.model.toUpperCase();
}
