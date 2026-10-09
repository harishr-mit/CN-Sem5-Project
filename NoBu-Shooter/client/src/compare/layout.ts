/**
 * layout.ts — pane grid for the Compare view (PHASES.md C1, PHASE2_PLAN.md D7).
 * Tries every rows × cols grid that holds n panes and keeps the one with the
 * largest canvas. Each canvas is exactly the arena's aspect ratio, so Phaser's
 * FIT scaling adds no letterbox bars; the height left over becomes the dock.
 */

import GAME from '@nobu/shared/config/game';

/** Pane header (26 px) + metrics bar (30 px). */
export const PANE_CHROME_PX = 56;
export const PANE_GAP_PX = 8;
/** Below this the dock is hidden and the space stays empty. */
export const MIN_DOCK_PX = 120;

export interface PaneLayout {
  rows: number;
  cols: number;
  /** Canvas size in CSS px (integer, arena aspect). */
  canvasW: number;
  canvasH: number;
  /** Size of the pane grid (canvases + chrome + gaps). */
  gridW: number;
  gridH: number;
  /** Height available for the dock below the grid (0 = hidden). */
  dockH: number;
}

export function layoutPanes(
  width: number,
  height: number,
  n: number,
  chromePx = PANE_CHROME_PX,
  gapPx = PANE_GAP_PX,
): PaneLayout {
  const aspect = GAME.arena.width / GAME.arena.height;
  let best: PaneLayout | null = null;
  for (let rows = 1; rows <= n; rows++) {
    const cols = Math.ceil(n / rows);
    const cellW = (width - gapPx * (cols - 1)) / cols;
    const cellH = (height - gapPx * (rows - 1)) / rows - chromePx;
    if (cellW <= 0 || cellH <= 0) continue;
    const canvasW = Math.floor(Math.min(cellW, cellH * aspect));
    const canvasH = Math.floor(canvasW / aspect);
    if (best && canvasW <= best.canvasW) continue;
    const gridW = cols * canvasW + gapPx * (cols - 1);
    const gridH = rows * (canvasH + chromePx) + gapPx * (rows - 1);
    const left = height - gridH - gapPx;
    best = { rows, cols, canvasW, canvasH, gridW, gridH, dockH: left >= MIN_DOCK_PX ? Math.floor(left) : 0 };
  }
  return best ?? { rows: 1, cols: n, canvasW: 0, canvasH: 0, gridW: 0, gridH: 0, dockH: 0 };
}
