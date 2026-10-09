/**
 * presets.ts — one-click comparisons for the Compare view (PHASES.md C5).
 * Each preset changes one setting between its panes (docs/PHASE2_PLAN.md D6).
 */

import NET from '@nobu/shared/config/net';
import { MOVER_PATTERNS } from '@nobu/shared/sim';
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

export function makePane(id: PaneId, title: string, changes: Partial<PredictionToggle> = {}): PaneSpec {
  return { id, title, toggles: { ...DEFAULT_TOGGLES, ...changes } };
}

export const COMPARE_PRESETS: readonly ComparePreset[] = [
  {
    id: 'prediction',
    title: 'Prediction off vs on',
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
    caption: '10 % loss. Left sends each input once, so lost inputs cause corrections; right repeats unacknowledged inputs and stays clean.',
    panes: [
      makePane('A', 'REDUNDANCY OFF', { redundancy: false }),
      makePane('B', 'REDUNDANCY ON', { redundancy: true }),
    ],
    reference: false,
    network: { name: 'Loss 10 %', config: { latencyMs: 50, lossPct: 10 } },
    movers: [],
  },
];

/** Starting point for Custom: n default panes, network and movers left as they are. */
export function customPreset(count: number, from?: ComparePreset): ComparePreset {
  const ids: PaneId[] = ['A', 'B', 'C', 'D'];
  const panes = ids.slice(0, Math.max(2, Math.min(4, count))).map((id, i) => {
    const prev = from?.panes[i];
    return prev ? { ...prev, toggles: { ...prev.toggles } } : makePane(id, `PANE ${id}`);
  });
  return {
    id: 'custom',
    title: 'Custom',
    caption: 'Click a pane to select it, then toggle P / R / I / G (or the chips in its header).',
    panes,
    reference: from?.reference ?? false,
    network: null,
    movers: from?.movers ?? [],
  };
}
