/**
 * colors.ts — one colour per Compare pane, used in the pane header, the
 * dock and (as that pane's player) in the other panes (PHASE2_PLAN.md §4.4).
 */

import type { PaneId } from './types.js';

export interface PaneColor {
  /** CSS colour for the UI. */
  css: string;
  /** Phaser tint for the arena. */
  num: number;
}

export const PANE_COLORS: Record<PaneId, PaneColor> = {
  A: { css: '#ff3b5c', num: 0xff3b5c },
  B: { css: '#00e5ff', num: 0x00e5ff },
  C: { css: '#ffb300', num: 0xffb300 },
  D: { css: '#39ff14', num: 0x39ff14 },
};

export const REFERENCE_COLOR: PaneColor = { css: '#e8eaf6', num: 0xe8eaf6 };
