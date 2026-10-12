/**
 * touch.ts — phones and tablets (owner revision of Phase 7, R5–R8). The touch
 * UI (joystick, dash / reload / menu buttons, the portrait layout) appears
 * only on touch devices: a coarse pointer (a finger), or `?touch=1` on the
 * page address (`?touch=0` turns it off; handy for testing on a desktop).
 * The decision is made once per page load and marked on <html> as the class
 * `touch-ui`, which the CSS uses for the layout (landscape and portrait).
 */

let cached: boolean | null = null;

/** Whether this page shows the touch UI (pure parts: tests pass the inputs). */
export function decideTouchUi(search: string, coarsePointer: boolean, maxTouchPoints: number): boolean {
  const forced = new URLSearchParams(search).get('touch');
  if (forced === '1') return true;
  if (forced === '0') return false;
  return coarsePointer && maxTouchPoints > 0;
}

export function isTouchUi(): boolean {
  if (cached !== null) return cached;
  if (typeof window === 'undefined') return (cached = false);
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  cached = decideTouchUi(window.location.search, coarse, navigator.maxTouchPoints ?? 0);
  return cached;
}

/** Mark <html> for the touch layout (call once at start-up, both editions). */
export function applyTouchClass(): void {
  if (typeof document !== 'undefined' && isTouchUi()) document.documentElement.classList.add('touch-ui');
}

export type JoystickSize = 'small' | 'medium' | 'large';
export const JOYSTICK_SIZES: readonly JoystickSize[] = ['small', 'medium', 'large'];
/** Joystick base diameter in CSS px per size (Settings → Joystick size). */
export const JOYSTICK_PX: Record<JoystickSize, number> = { small: 104, medium: 132, large: 164 };
export const isJoystickSize = (v: unknown): v is JoystickSize => v === 'small' || v === 'medium' || v === 'large';
