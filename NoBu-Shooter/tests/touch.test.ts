/**
 * Touch UI pieces that don't need a browser (owner revision of Phase 7,
 * R5–R6): when the touch UI shows, the joystick → keys mapping, and that the
 * joystick's keys reach the same movement bitmask as the keyboard.
 */
import { describe, it, expect } from 'vitest';
import { decideTouchUi, JOYSTICK_PX, isJoystickSize } from '../client/src/ui/touch.js';
import { joystickKeys, aimStick, setVirtualKeys, movementKeys } from '../client/src/game/input.js';
import { KEY } from '../shared/src/sim/movement.js';
import { canStartWith, botsFor, defaultRoomOptions } from '../shared/src/rooms/options.js';

describe('touch UI decision', () => {
  it('a coarse pointer with touch points → touch UI; a mouse → none', () => {
    expect(decideTouchUi('', true, 5)).toBe(true);
    expect(decideTouchUi('', false, 0)).toBe(false);
    expect(decideTouchUi('', true, 0)).toBe(false); // e.g. a TV remote
    expect(decideTouchUi('', false, 10)).toBe(false); // a touch laptop used with a mouse
  });
  it('?touch=1 / ?touch=0 override it', () => {
    expect(decideTouchUi('?touch=1', false, 0)).toBe(true);
    expect(decideTouchUi('?room=blue-fox&touch=0', true, 5)).toBe(false);
  });
  it('joystick sizes', () => {
    expect(JOYSTICK_PX.small).toBeLessThan(JOYSTICK_PX.medium);
    expect(JOYSTICK_PX.medium).toBeLessThan(JOYSTICK_PX.large);
    expect(isJoystickSize('huge')).toBe(false);
  });
});

describe('joystick → movement keys', () => {
  it('nothing inside the dead zone', () => {
    expect(joystickKeys(0, 0)).toBe(0);
    expect(joystickKeys(0.1, -0.1)).toBe(0);
  });
  it('8 directions like WASD (y grows down)', () => {
    expect(joystickKeys(1, 0)).toBe(KEY.RIGHT);
    expect(joystickKeys(-1, 0)).toBe(KEY.LEFT);
    expect(joystickKeys(0, -1)).toBe(KEY.UP);
    expect(joystickKeys(0, 1)).toBe(KEY.DOWN);
    expect(joystickKeys(0.7, -0.7)).toBe(KEY.RIGHT | KEY.UP);
    expect(joystickKeys(-0.7, 0.7)).toBe(KEY.LEFT | KEY.DOWN);
    expect(joystickKeys(0.95, 0.2)).toBe(KEY.RIGHT); // within 22.5° of right
    expect(joystickKeys(0.8, 0.5)).toBe(KEY.RIGHT | KEY.DOWN);
  });
  it('the joystick feeds the same bitmask the game reads', () => {
    setVirtualKeys(KEY.LEFT | KEY.UP);
    expect(movementKeys()).toBe(KEY.LEFT | KEY.UP);
    setVirtualKeys(0);
    expect(movementKeys()).toBe(0);
  });
});

describe('aim stick', () => {
  it('no fire inside the dead zone', () => {
    expect(aimStick(0.1, 0.1).fire).toBe(false);
  });
  it('aims over 360° (y down) and fires past the dead zone', () => {
    expect(aimStick(1, 0)).toEqual({ angle: 0, fire: true });
    expect(aimStick(0, 1).angle).toBeCloseTo(Math.PI / 2);
    expect(aimStick(-1, 0).angle).toBeCloseTo(Math.PI);
    expect(aimStick(0.5, -0.5).angle).toBeCloseTo(-Math.PI / 4);
  });
});

describe('room start rule (shared by the lobby and the server)', () => {
  it('needs 2 participants, counting bots', () => {
    const o = defaultRoomOptions();
    expect(canStartWith(1, o)).toBe(false);
    expect(canStartWith(2, o)).toBe(true);
    expect(canStartWith(1, { ...o, bots: true })).toBe(true);
    expect(botsFor(1, { ...o, bots: true, maxPlayers: 6 })).toBe(5);
    expect(botsFor(3, o)).toBe(0);
  });
});
