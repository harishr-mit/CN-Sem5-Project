/**
 * demoControls.ts — the demo's own keys for the Controls overlay (F1):
 * Network Lab, netcode toggles and Presenter. Kept out of ControlsOverlay so
 * the game edition's bundle doesn't carry them (docs/PHASE7_PLAN.md D16).
 */
import type { ExtraControls } from './ControlsOverlay.js';

export const DEMO_CONTROLS: ExtraControls = {
  beforeSystem: [
    {
      category: 'NETWORK LAB & PRESETS',
      items: [
        { keys: ['TAB'], desc: 'Toggle Network Lab panel' },
        { keys: ['1'], desc: 'Preset: Baseline (LAN, 0ms, 0% loss)' },
        { keys: ['2'], desc: 'Preset: Café Wi-Fi (25ms, 15ms jitter, 1% loss)' },
        { keys: ['3'], desc: 'Preset: Mobile 4G (45ms, 25ms jitter, 2% loss)' },
        { keys: ['4'], desc: 'Preset: Transatlantic (90ms, 8ms jitter, 0.5% loss)' },
        { keys: ['5'], desc: 'Preset: Nightmare (120ms, 50ms jitter, 12% loss)' },
      ],
    },
    {
      category: 'NETCODE ENGINE TOGGLES',
      items: [
        { keys: ['P'], desc: 'Toggle Client-Side Prediction' },
        { keys: ['C'], desc: 'Toggle Server Reconciliation' },
        { keys: ['I'], desc: 'Toggle Snapshot Interpolation' },
        { keys: ['G'], desc: 'Toggle Ghost Player (Server True Position)' },
        { keys: ['Y'], desc: 'Cycle sync model: Full → Delta → State 10 Hz → State 30 Hz (live)' },
      ],
    },
  ],
  last: [
    {
      category: 'PRESENTER MODE (landing page buttons)',
      items: [
        { keys: ['N'], desc: 'Next step (applies its network, toggles and sync model)' },
        { keys: ['B'], desc: 'Previous step (exactly the same state again)' },
        { keys: ['H'], desc: 'Hide / show the caption bar' },
        { keys: ['END'], desc: 'Button on the bar: leave Presenter mode' },
      ],
    },
  ],
};
