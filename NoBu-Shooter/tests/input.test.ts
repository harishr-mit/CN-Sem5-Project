import { describe, it, expect } from 'vitest';
import { movementCode, keysFromCodes, isTypingTarget } from '../client/src/game/input.js';
import { KEY } from '../shared/src/sim/movement.js';

describe('Movement keys (client/src/game/input.ts)', () => {
  it('maps physical WASD and arrows to the SPEC.md §7.2 bitmask', () => {
    expect(keysFromCodes(['KeyD'])).toBe(KEY.RIGHT);
    expect(keysFromCodes(['ArrowRight'])).toBe(KEY.RIGHT);
    expect(keysFromCodes(['KeyW', 'KeyA'])).toBe(KEY.UP | KEY.LEFT);
    expect(keysFromCodes(['KeyS', 'ArrowDown'])).toBe(KEY.DOWN);
    expect(keysFromCodes(['KeyQ', 'Space'])).toBe(0);
  });

  it('uses the physical code, so D works on any layout and under an IME', () => {
    // AZERTY / IME composition: key is not "d", code is still KeyD
    expect(movementCode({ code: 'KeyD', key: 'Process' })).toBe('KeyD');
    expect(movementCode({ code: 'KeyW', key: 'z' })).toBe('KeyW');
    // No code (some virtual keyboards): fall back to key, either case
    expect(movementCode({ code: '', key: 'D' })).toBe('KeyD');
    expect(movementCode({ key: 'ArrowRight' })).toBe('ArrowRight');
    expect(movementCode({ code: 'KeyP', key: 'p' })).toBeNull();
  });

  it('isTypingTarget is false outside the DOM (and for non-elements)', () => {
    expect(isTypingTarget(null)).toBe(false);
  });
});
