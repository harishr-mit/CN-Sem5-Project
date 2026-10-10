/**
 * presets.ts — one-click comparisons for the Compare view (PHASES.md C5).
 * Each preset changes one setting between its panes (docs/PHASE2_PLAN.md D6).
 */

import NET from '@nobu/shared/config/net';
import { MOVER_PATTERNS } from '@nobu/shared/sim';
import { DEFAULT_SYNC, type SyncSpec } from '@nobu/shared/sync';
import type { PredictionToggle } from '../net/NetClient.js';
import type { ComparePreset, PaneId, PaneSpec } from './types.js';

/** Toggles of a default client (what Quick Match starts with). */
export const DEFAULT_TOGGLES: PredictionToggle = {
  prediction: true,
  reconciliation: true,
  interpolation: true,
  redundancy: NET.redundancyDefault,
  ghost: true,
};

export function makePane(
  id: PaneId, title: string, changes: Partial<PredictionToggle> = {}, sync: SyncSpec = DEFAULT_SYNC,
): PaneSpec {
  return { id, title, toggles: { ...DEFAULT_TOGGLES, ...changes }, sync: { ...sync } };
}

const FULL: SyncSpec = { model: 'full' };
const DELTA: SyncSpec = { model: 'delta' };
const STATE10: SyncSpec = { model: 'state', hz: 10 };
const STATE30: SyncSpec = { model: 'state', hz: 30 };

export const COMPARE_PRESETS: readonly ComparePreset[] = [
  {
    id: 'prediction',
    title: 'Prediction off vs on',
    label: 'Prediction',
    caption: 'Same keys, same 90 ms link. Left waits for the server before moving; right moves at once and the amber ghost shows the server.',
    panes: [
      // Reconciliation and the ghost mean nothing without prediction.
      makePane('A', 'PREDICTION OFF', { prediction: false, reconciliation: false, ghost: false }),
      makePane('B', 'PREDICTION ON'),
    ],
    reference: false,
    network: { name: 'Transatlantic' },
    movers: ['circle'],
  },
  {
    id: 'interpolation',
    title: 'Interpolation off vs on',
    label: 'Interpolation',
    caption: '50 ms ± 30 ms jitter. Left draws each snapshot as it lands (movers stutter); right draws 100 ms in the past and glides — a steady extra lag buys smoothness.',
    panes: [
      makePane('A', 'INTERPOLATION OFF', { interpolation: false }),
      makePane('B', 'INTERPOLATION ON'),
    ],
    reference: true,
    network: { name: 'Jitter 50±30', config: { latencyMs: 50, jitterMs: 30 } },
    movers: [...MOVER_PATTERNS],
  },
  {
    id: 'redundancy',
    title: 'Redundancy off vs on',
    label: 'Redundancy',
    caption: '10 % loss. Left sends each input once, so lost inputs cause corrections; right repeats unacknowledged inputs and stays clean.',
    panes: [
      makePane('A', 'REDUNDANCY OFF', { redundancy: false }),
      makePane('B', 'REDUNDANCY ON', { redundancy: true }),
    ],
    reference: false,
    network: { name: 'Loss 10 %', config: { latencyMs: 50, lossPct: 10 } },
    movers: [],
  },
  // ── Phase 3: sync models (docs/PHASE3_PLAN.md D9) ──────────────
  {
    id: 'sync',
    title: 'Sync models: full vs delta vs state',
    label: 'Sync',
    caption: 'Nightmare: 400 kbps cap, 12 % burst loss. Full needs ≈ 450 kbps here, so its queue grows (give it ~15 s): ack delay and lag climb. Delta sends only what changed (≈ 1/5 of the bytes) and stays responsive. State draws movers with no delay but overshoots at every turn.',
    panes: [
      makePane('A', 'FULL SNAPSHOTS', {}, FULL),
      makePane('B', 'DELTA SNAPSHOTS', {}, DELTA),
      makePane('C', 'STATE + EXTRAPOLATION', {}, STATE10),
    ],
    // No REF pane: 3 panes leave a grid cell for the dock (table + bandwidth chart);
    // the truth rings in each pane still show where the movers really are.
    reference: false,
    network: { name: 'Nightmare' },
    movers: [...MOVER_PATTERNS],
  },
  {
    id: 'bandwidth',
    title: 'Bandwidth: full vs delta',
    label: 'Bandwidth',
    caption: 'A clean 300 kbps link, no loss. Full snapshots need ≈ 400 kbps, so the link queues and drops them: lag climbs and movers stutter. Delta needs ≈ 80 kbps for the same picture.',
    panes: [
      makePane('A', 'FULL SNAPSHOTS', {}, FULL),
      makePane('B', 'DELTA SNAPSHOTS', {}, DELTA),
    ],
    reference: false,
    network: { name: 'Cap 300 kbps', config: { latencyMs: 40, bandwidthKbps: 300 } },
    movers: [...MOVER_PATTERNS],
  },
  {
    id: 'staterate',
    title: 'State sync: 10 Hz vs 30 Hz',
    label: 'State Hz',
    caption: 'Transatlantic. Both panes extrapolate (no interpolation delay). At 10 Hz the movers overshoot every turn and get pulled back (off-path %); 30 Hz overshoots far less but costs 3× the bytes.',
    panes: [
      makePane('A', 'STATE 10 HZ', {}, STATE10),
      makePane('B', 'STATE 30 HZ', {}, STATE30),
    ],
    reference: true,
    network: { name: 'Transatlantic' },
    movers: ['zigzag', 'reversal'],
  },
];

/** Starting point for Custom: n default panes, network and movers left as they are. */
export function customPreset(count: number, from?: ComparePreset): ComparePreset {
  const ids: PaneId[] = ['A', 'B', 'C', 'D'];
  const panes = ids.slice(0, Math.max(2, Math.min(4, count))).map((id, i) => {
    const prev = from?.panes[i];
    return prev ? { ...prev, toggles: { ...prev.toggles }, sync: { ...prev.sync } } : makePane(id, `PANE ${id}`);
  });
  return {
    id: 'custom',
    title: 'Custom',
    caption: 'Click a pane to select it, then toggle P / C / I / G, or cycle its sync model with Y (or the chips in its header).',
    panes,
    reference: from?.reference ?? false,
    network: null,
    movers: from?.movers ?? [],
  };
}
