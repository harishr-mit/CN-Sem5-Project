/**
 * types.ts — sync model selection (PHASES.md Phase 3, docs/PHASE3_PLAN.md D1, D5).
 * No imports from the protocol, so messages.ts can use these types.
 */

/**
 * full = complete snapshots; delta = changes vs an acknowledged snapshot;
 * state = records + velocity, extrapolated; lockstep = the server relays the
 * inputs it consumed per tick and the client replays them (lab room only,
 * docs/PHASE6_PLAN.md D1).
 */
export type SyncModel = 'full' | 'delta' | 'state' | 'lockstep';
/** State sync send rates (Hz). */
export type StateHz = 10 | 30;

export interface SyncSpec {
  model: SyncModel;
  /** State only; defaults to NET.state.defaultHz. */
  hz?: StateHz;
  /** Lockstep only: recover lost ticks with a redundant window (true) or by resend on request (docs/PHASE6_PLAN.md D4). */
  rd?: boolean;
}

export const SYNC_MODELS: readonly SyncModel[] = ['full', 'delta', 'state', 'lockstep'];
export const STATE_RATES: readonly StateHz[] = [10, 30];
export const DEFAULT_STATE_HZ: StateHz = 10;
export const DEFAULT_SYNC: SyncSpec = { model: 'full' };

/** Order of Quick Match's SYNC MODEL / `Y` hotkey (no lockstep: the match is not deterministic-replayable). */
export const SYNC_CYCLE: readonly SyncSpec[] = [
  { model: 'full' },
  { model: 'delta' },
  { model: 'state', hz: 10 },
  { model: 'state', hz: 30 },
];

/** Order of Compare's SYNC chip / `Y` (the lab room): the Quick Match cycle plus Lockstep. */
export const COMPARE_SYNC_CYCLE: readonly SyncSpec[] = [...SYNC_CYCLE, { model: 'lockstep' }];

export function isSyncModel(v: unknown): v is SyncModel {
  return v === 'full' || v === 'delta' || v === 'state' || v === 'lockstep';
}

export function isStateHz(v: unknown): v is StateHz {
  return v === 10 || v === 30;
}

export function isSyncSpec(v: unknown): v is SyncSpec {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return isSyncModel(o['model']) && (o['hz'] === undefined || isStateHz(o['hz']))
    && (o['rd'] === undefined || typeof o['rd'] === 'boolean');
}

/** Canonical form: `hz` only (and always) on state; `rd` only on lockstep, and only when true. */
export function normalizeSync(s: SyncSpec): SyncSpec {
  if (s.model === 'state') return { model: 'state', hz: s.hz ?? DEFAULT_STATE_HZ };
  if (s.model === 'lockstep') return s.rd ? { model: 'lockstep', rd: true } : { model: 'lockstep' };
  return { model: s.model };
}

export function sameSync(a: SyncSpec, b: SyncSpec): boolean {
  const x = normalizeSync(a);
  const y = normalizeSync(b);
  return x.model === y.model && x.hz === y.hz && !!x.rd === !!y.rd;
}

/** Same model (and rate), ignoring lockstep's recovery mode (which follows the Rd chip). */
export function sameSyncModel(a: SyncSpec, b: SyncSpec): boolean {
  return sameSync({ ...a, rd: false }, { ...b, rd: false });
}

/** Next entry of `cycle` (Quick Match's by default; Compare passes COMPARE_SYNC_CYCLE). Lockstep's `rd` is not part of the cycle. */
export function nextSync(s: SyncSpec, cycle: readonly SyncSpec[] = SYNC_CYCLE): SyncSpec {
  const i = cycle.findIndex((c) => sameSyncModel(c, s));
  return { ...cycle[(i + 1) % cycle.length] };
}

export function syncLabel(s: SyncSpec): string {
  const n = normalizeSync(s);
  if (n.model === 'state') return `STATE ${n.hz}`;
  if (n.model === 'lockstep') return n.rd ? 'LOCKSTEP+RD' : 'LOCKSTEP';
  return n.model.toUpperCase();
}
