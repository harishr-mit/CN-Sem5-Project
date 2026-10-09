/**
 * input.ts — page-level movement keys.
 *
 * One keyboard tracker for the whole page instead of Phaser's per-game one
 * (Quick Match; Compare's InputDriver reuses the key mapping and text-field
 * rule below):
 *  - Keys are matched by physical position (`KeyboardEvent.code`), so WASD
 *    works on any layout and while an IME is active (where `keyCode` is 229).
 *  - It listens on `window` in the capture phase and does not skip events that
 *    another handler already `preventDefault`-ed. Phaser's own keyboard
 *    manager does skip them, and it `preventDefault`s every captured key, so
 *    with two canvases on the page only the first one ever saw WASD/arrows.
 *
 * Browser extensions that consume keys before the page (e.g. Vimium maps `d`,
 * `r`, `p` and digits) still win; see docs/ASSUMPTIONS.md.
 */

import { KEY } from '@nobu/shared/sim';

/** Movement bit per physical key code. */
const MOVE_BITS: Record<string, number> = {
  KeyW: KEY.UP, ArrowUp: KEY.UP,
  KeyS: KEY.DOWN, ArrowDown: KEY.DOWN,
  KeyA: KEY.LEFT, ArrowLeft: KEY.LEFT,
  KeyD: KEY.RIGHT, ArrowRight: KEY.RIGHT,
};

/** Fallback for events without a `code` (some virtual keyboards). */
const KEY_TO_CODE: Record<string, string> = {
  w: 'KeyW', a: 'KeyA', s: 'KeyS', d: 'KeyD',
  arrowup: 'ArrowUp', arrowdown: 'ArrowDown', arrowleft: 'ArrowLeft', arrowright: 'ArrowRight',
};

/** The movement-key code for a keyboard event, or null if it isn't one. */
export function movementCode(e: { code?: string; key?: string }): string | null {
  if (e.code && MOVE_BITS[e.code] !== undefined) return e.code;
  const fallback = e.key ? KEY_TO_CODE[e.key.toLowerCase()] : undefined;
  return fallback ?? null;
}

/** Key bitmask (SPEC.md §7.2) for a set of held movement-key codes. */
export function keysFromCodes(codes: Iterable<string>): number {
  let k = 0;
  for (const c of codes) k |= MOVE_BITS[c] ?? 0;
  return k;
}

const NON_TEXT_INPUTS = new Set(['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file', 'image']);

/** True when the event target is a field the user types into (keys belong to it, not the game). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(target.type);
  return target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target.isContentEditable;
}

// ── Page-level keyboard tracker (reference counted) ────────────
const held = new Set<string>();
let users = 0;

function onKeyDown(e: KeyboardEvent): void {
  if (isTypingTarget(e.target)) return;
  const code = movementCode(e);
  if (!code) return;
  held.add(code);
  // Keep arrows from scrolling the page or nudging a focused slider
  if (code.startsWith('Arrow')) e.preventDefault();
}

function onKeyUp(e: KeyboardEvent): void {
  const code = movementCode(e);
  if (code) held.delete(code);
}

/** Keys released while the page had no focus never send keyup: forget them. */
function releaseAll(): void {
  held.clear();
}

function onVisibility(): void {
  if (document.visibilityState !== 'visible') releaseAll();
}

/** Start tracking (idempotent per caller). Returns the matching release function. */
export function acquireKeyboard(): () => void {
  if (users++ === 0) {
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', onVisibility);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--users === 0) {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', releaseAll);
      document.removeEventListener('visibilitychange', onVisibility);
      releaseAll();
    }
  };
}

/** Current movement bitmask from the physical keyboard. */
export function movementKeys(): number {
  return keysFromCodes(held);
}
