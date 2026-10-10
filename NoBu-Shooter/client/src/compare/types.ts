/**
 * types.ts — Compare view data model (PHASES.md C1, C5).
 * No React or Phaser here, so presets and layout are unit-testable.
 */

import type { PredictionToggle } from '../net/NetClient.js';
import type { LinkConfig } from '../net/EmulatorClient.js';
import type { MoverPattern } from '@nobu/shared/protocol';
import type { SyncSpec } from '@nobu/shared/sync';

export type PaneId = 'A' | 'B' | 'C' | 'D';

export const PANE_IDS: readonly PaneId[] = ['A', 'B', 'C', 'D'];

/** One emulated pane: its own NetClient and emulator session. */
export interface PaneSpec {
  id: PaneId;
  title: string;
  /** Complete toggle set, so switching presets never leaves one behind. */
  toggles: PredictionToggle;
  /** Sync model of this pane's connection (PHASES.md Phase 3). */
  sync: SyncSpec;
}

/**
 * Network conditions applied to every emulated pane. Without `config` it is
 * one of the emulator's named presets; with it, an ad-hoc preset completed
 * from the emulator defaults (nothing carries over from the previous one).
 */
export interface CompareNetwork {
  name: string;
  config?: Partial<LinkConfig>;
}

export interface ComparePreset {
  id: string;
  title: string;
  /** Short label for the top-bar button (default: the title). */
  label?: string;
  /** One sentence for the top bar: what to watch. */
  caption: string;
  panes: PaneSpec[];
  /** Show the reference (spectator) pane. */
  reference: boolean;
  /** null = leave the emulator as it is (Custom). */
  network: CompareNetwork | null;
  movers: MoverPattern[];
}
