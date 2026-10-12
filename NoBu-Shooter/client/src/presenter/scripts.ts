/**
 * scripts.ts — the two Presenter scripts (PHASES.md P1, docs/PHASE4_PLAN.md §2).
 * They follow docs/DEMO_SCRIPT.md: Quick Match = §1–§7, Compare = §8 + §11.
 * Expected numbers come from the measurements recorded there.
 */

import type { SyncSpec } from '@nobu/shared/sync';
import type { PredictionToggle } from '../net/NetClient.js';
import type { CompareNetwork } from '../compare/types.js';
import { COMPARE_PRESETS, DEFAULT_TOGGLES } from '../compare/presets.js';
import type { PresenterScript, PresenterStep } from './types.js';

const FULL: SyncSpec = { model: 'full' };
const DELTA: SyncSpec = { model: 'delta' };
const STATE10: SyncSpec = { model: 'state', hz: 10 };

const BASELINE: CompareNetwork = { name: 'Baseline' };
const DELAY_100: CompareNetwork = { name: '100 ms one-way', config: { latencyMs: 100 } };
const LOSS_10: CompareNetwork = { name: '50 ms + 10 % loss', config: { latencyMs: 50, lossPct: 10 } };
const JITTER_50: CompareNetwork = { name: '40 ± 50 ms jitter', config: { latencyMs: 40, jitterMs: 50 } };
const DELAY_50: CompareNetwork = { name: '50 ms one-way', config: { latencyMs: 50 } };
const NIGHTMARE: CompareNetwork = { name: 'Nightmare' };
/** Q13: what the network players get (docs/PHASE5_PLAN.md D11). */
export const SWARM_LOSSY: CompareNetwork = { name: 'Network players: 120 ± 40 ms, 10 % loss', config: { latencyMs: 120, jitterMs: 40, lossPct: 10 } };

function quick(
  id: string, title: string, caption: string, expect: string,
  network: CompareNetwork, changes: Partial<PredictionToggle> = {}, sync: SyncSpec = FULL,
  nudge?: { dx: number; dy: number }, swarmNetwork: CompareNetwork = BASELINE,
): PresenterStep {
  return {
    id, title, caption, expect,
    quick: {
      network, swarmNetwork: { ...swarmNetwork }, toggles: { ...DEFAULT_TOGGLES, ...changes }, sync: { ...sync },
      ...(nudge ? { nudge } : {}),
    },
  };
}

export const QUICK_SCRIPT: PresenterScript = {
  id: 'quick',
  title: 'Presenter — Quick Match',
  view: 'game',
  invincible: true,
  endless: true,
  steps: [
    quick('Q1', 'Baseline',
      'No impairment. Move around: what you see is exactly what the server computes.',
      '0 corrections/s · 0.0 px error · Input → Screen ≈ 17 ms (one frame) · RTT ≈ 15–20 ms',
      BASELINE),
    quick('Q2', 'Server delay, no prediction',
      '100 ms each way and prediction OFF: every key press waits for the server before the player moves.',
      'Input → Screen ≈ 300+ ms (ack delay + 100 ms interpolation) · RTT ≈ 216 ms',
      DELAY_100, { prediction: false, reconciliation: false, ghost: false }),
    quick('Q3', 'Client-side prediction',
      'Same 100 ms link, prediction ON: the player moves at once; the amber dashed ghost is the server\'s position, trailing behind.',
      'Input → Screen ≈ 17 ms · still 0 corrections — latency alone never mispredicts',
      DELAY_100),
    quick('Q4', 'Packet loss',
      '50 ms and 10 % loss, input redundancy OFF. Lost inputs never reach the server, so the prediction is corrected (amber lines).',
      '≈ 2–3 corrections/s of ≈ 7 px · Loss tile ≈ ↑10 % ↓10 %',
      LOSS_10),
    quick('Q5', 'Input redundancy',
      'Same loss, redundancy ON: every input message repeats the unacknowledged inputs, so a lost message costs nothing.',
      'Corrections drop to 0/s',
      LOSS_10, { redundancy: true }),
    quick('Q6', 'Reconciliation off',
      'Loss again, reconciliation OFF: the client never accepts the server\'s correction. Move around and watch the ghost drift away for good.',
      'The ghost and the player separate and stay apart',
      LOSS_10, { reconciliation: false }),
    quick('Q7', 'Jitter, no interpolation',
      '40 ms ± 50 ms jitter, interpolation OFF: bots are drawn at each snapshot as it lands.',
      'Bots and bullets stutter',
      JITTER_50, { interpolation: false }),
    quick('Q8', 'Snapshot interpolation',
      'Interpolation ON: remote players are drawn 100 ms in the past, between two snapshots.',
      'Bots glide smoothly — a fixed 100 ms lag buys smoothness',
      JITTER_50),
    quick('Q9', 'Misprediction (nudge)',
      'The server just pushed you 40 px (a deliberate misprediction). Press B then N to nudge again.',
      'One smooth correction with an amber vector, then 0 corrections again',
      DELAY_50, {}, FULL, { dx: 40, dy: 0 }),
    quick('Q10', 'Nightmare: full snapshots',
      '120 ms ± 50, 12 % burst loss, 400 kbps cap. Full snapshots need ≈ 500 kbps, so the emulator queue fills (bufferbloat). Give it ≈ 15 s.',
      'Ack delay ≈ 550–700 ms · ↓ ≈ 350–420 kbps near the cap · queue bar ≈ 100–200 ms (varies with the map and the fight)',
      NIGHTMARE),
    quick('Q11', 'Nightmare: delta snapshots',
      'Same network, Delta sync: the server sends only what changed since the snapshot you acknowledged. Give it ≈ 15 s.',
      '↓ ≈ 130 kbps · ≈ 500 B/msg instead of ≈ 1.9 kB · ack delay ≈ 325 ms',
      NIGHTMARE, {}, DELTA),
    quick('Q12', 'Nightmare: state sync',
      'State sync at 10 Hz: positions + velocities, remote players extrapolated — no interpolation delay.',
      '↓ ≈ 190 kbps · bots most current but overshoot at turns',
      NIGHTMARE, {}, STATE10),
    quick('Q13', 'Network players over UDP',
      'Your link is clean again. The UDP-n players are real clients (npm run swarm) whose own UDP traffic now crosses a 120 ± 40 ms, 10 % loss link: they stutter, jump and aim at stale positions. Open the dashboard to see their sessions.',
      'Your corrections 0/s · UDP-n move in jumps · dashboard: udp:9100 sessions ≈ 10 % loss, full snapshots need 2–4 fragments so ≈ 20–34 % of them are lost',
      BASELINE, {}, FULL, undefined, SWARM_LOSSY),
  ],
};

/** Expected numbers per Compare preset (DEMO_SCRIPT.md §8, §11). */
const COMPARE_EXPECT: Record<string, string> = {
  prediction: 'Input → Screen ≈ 350 ms (A) vs ≈ 18 ms (B)',
  interpolation: 'Mover lag ≈ 75 ms, frozen ≈ 60–70 % (A) vs ≈ 160 ms, ≈ 2 % (B)',
  redundancy: '≈ 2–4 corrections/s (A) vs 0 (B)',
  sync: 'After ≈ 15 s: ack ≈ 740 / 310 / 360 ms · ↓ ≈ 400 / 60 / 160 kbps · off-path ≈ 0 / 0 / 33 %',
  bandwidth: 'Ack ≈ 560 vs 140 ms · lag ≈ 570 vs 150 ms · ↓ ≈ 300 vs 65 kbps',
  staterate: 'Off-path ≈ 30 % vs 10 % · ↓ ≈ 105 vs 320 kbps',
  lockstep: 'Stalled – / ≈ 15–30 % / ≈ 3–5 % · In→Screen ≈ 18 / 220–350 / 210 ms · ↓ ≈ 400 / 40 / 110 kbps · desync 0',
};

export const COMPARE_SCRIPT: PresenterScript = {
  id: 'compare',
  title: 'Presenter — Compare',
  view: 'compare',
  invincible: false,
  endless: false, // the lab room has no match clock
  steps: COMPARE_PRESETS.map((p, i) => ({
    id: `C${i + 1}`,
    title: p.title,
    caption: p.caption,
    expect: COMPARE_EXPECT[p.id] ?? '',
    compare: { preset: p.id },
  })),
};

export const PRESENTER_SCRIPTS: Record<PresenterScript['id'], PresenterScript> = {
  quick: QUICK_SCRIPT,
  compare: COMPARE_SCRIPT,
};
