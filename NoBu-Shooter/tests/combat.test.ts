/**
 * combat.test.ts — weapons, ammo, reload and power-up timers (GAMERULES.md §6–§6b).
 */

import { describe, it, expect } from 'vitest';
import {
  initialCombat, stepCombat, pelletAngles, applyPowerup, speedMultiplier, WEAPONS, INFINITE_RESERVE,
  WEAPON_POWERUP_TICKS, SPEED_POWERUP_TICKS, PIERCING_POWERUP_TICKS, DASH_BURST_TICKS, DASH_COOLDOWN_TICKS,
  type CombatState,
} from '../shared/src/sim/combat.js';
import { powerupCap, pickPowerupKind } from '../shared/src/sim/powerups.js';
import { mulberry32 } from '../shared/src/sim/prng.js';
import GAME from '../shared/src/config/game.json';

/** Hold fire for `n` inputs; returns the number of shots. */
function hold(s: CombatState, n: number, reload = false): number {
  let shots = 0;
  for (let i = 0; i < n; i++) if (stepCombat(s, true, reload).fired) shots++;
  return shots;
}

describe('Combat step (shared/src/sim/combat.ts)', () => {
  it('starts with a full handgun magazine', () => {
    const s = initialCombat();
    expect(s.weapon).toBe('handgun');
    expect(s.ammo).toBe(GAME.weapons.handgun.magazine);
  });

  it('fires at the weapon cooldown (handgun: one shot per 300 ms = 18 inputs)', () => {
    const s = initialCombat();
    expect(hold(s, 18)).toBe(1);
    expect(hold(s, 18)).toBe(1);
    expect(s.ammo).toBe(GAME.weapons.handgun.magazine - 2);
  });

  it('empties the magazine, reloads automatically, then fires again', () => {
    const s = initialCombat();
    const w = WEAPONS.handgun;
    // 8 shots take 7 cooldowns + 1 input
    expect(hold(s, (w.magazine - 1) * w.cooldownTicks + 1)).toBe(w.magazine);
    expect(s.ammo).toBe(0);
    expect(s.reloadTicks).toBe(w.reloadTicks);
    // Fire is blocked (dry) for the whole reload
    let dry = 0;
    for (let i = 0; i < w.reloadTicks - 1; i++) if (stepCombat(s, true, false).dryFire) dry++;
    expect(dry).toBe(w.reloadTicks - 1);
    expect(stepCombat(s, true, false).fired).toBe('handgun'); // reload done this input, fires
    expect(s.ammo).toBe(w.magazine - 1);
  });

  it('manual reload only when the magazine is not full; R during a reload does nothing', () => {
    const s = initialCombat();
    expect(stepCombat(s, false, true).reloadStarted).toBe(false);
    hold(s, 1);
    expect(stepCombat(s, false, true).reloadStarted).toBe(true);
    const left = s.reloadTicks;
    expect(stepCombat(s, false, true).reloadStarted).toBe(false);
    expect(s.reloadTicks).toBe(left - 1);
    for (let i = 0; i < left - 1; i++) stepCombat(s, false, false);
    expect(s.reloadTicks).toBe(0);
    expect(s.ammo).toBe(WEAPONS.handgun.magazine);
  });

  it('shotgun: 3 pellets in a fixed fan centred on the aim', () => {
    const angles = pelletAngles('shotgun', 1);
    expect(angles).toHaveLength(GAME.weapons.shotgun.pellets);
    expect(angles).toHaveLength(3);
    const spread = (GAME.weapons.shotgun.spreadDeg * Math.PI) / 180;
    expect(angles[0]).toBeCloseTo(1 - spread / 2, 9);
    expect(angles[1]).toBeCloseTo(1, 9);
    expect(angles[2]).toBeCloseTo(1 + spread / 2, 9);
    expect(pelletAngles('handgun', 0.3)).toEqual([0.3]);
  });

  it('weapon power-ups: full magazine, last 10 s of inputs, then back to a full handgun', () => {
    const s = initialCombat();
    hold(s, 1);
    applyPowerup(s, 'rapid_fire');
    expect(s.weapon).toBe('rifle');
    expect(s.ammo).toBe(GAME.weapons.rifle.magazine);
    expect(s.weaponTicks).toBe(WEAPON_POWERUP_TICKS);
    let expired = false;
    for (let i = 0; i < WEAPON_POWERUP_TICKS; i++) expired = stepCombat(s, false, false).weaponExpired || expired;
    expect(expired).toBe(true);
    expect(s.weapon).toBe('handgun');
    expect(s.ammo).toBe(GAME.weapons.handgun.magazine);
  });

  it('rifle fires every 100 ms (6 inputs)', () => {
    const s = initialCombat();
    applyPowerup(s, 'rapid_fire');
    expect(hold(s, 60)).toBe(10);
  });

  it('the pistol reloads forever (infinite reserve)', () => {
    const s = initialCombat();
    expect(s.reserve).toBe(INFINITE_RESERVE);
    const w = WEAPONS.handgun;
    for (let mag = 0; mag < 5; mag++) {
      expect(hold(s, (w.magazine - 1) * w.cooldownTicks + 1)).toBe(w.magazine);
      for (let i = 0; i < w.reloadTicks; i++) stepCombat(s, false, false);
      expect(s.ammo).toBe(w.magazine);
      expect(s.weapon).toBe('handgun');
    }
  });

  for (const [kind, weapon] of [['rapid_fire', 'rifle'], ['spread_shot', 'shotgun']] as const) {
    it(`${weapon}: 1 + 1 magazines, then back to the pistol before the timer runs out`, () => {
      const s = initialCombat();
      applyPowerup(s, kind);
      expect(s.reserve).toBe(WEAPONS[weapon].magazine);
      let shots = 0;
      let expired = false;
      let inputs = 0;
      while (!expired && inputs < WEAPON_POWERUP_TICKS) {
        const r = stepCombat(s, true, false);
        if (r.fired) shots++;
        expired = r.weaponExpired;
        inputs++;
      }
      expect(expired).toBe(true);
      expect(inputs).toBeLessThan(WEAPON_POWERUP_TICKS); // ran dry first
      expect(shots).toBe(2 * WEAPONS[weapon].magazine);
      expect(s.weapon).toBe('handgun');
      expect(s.ammo).toBe(WEAPONS.handgun.magazine);
    });
  }

  it('a manual reload of a power-up weapon takes only the missing rounds from the reserve', () => {
    const s = initialCombat();
    applyPowerup(s, 'rapid_fire');
    hold(s, 1);
    stepCombat(s, false, true);
    for (let i = 0; i < WEAPONS.rifle.reloadTicks; i++) stepCombat(s, false, false);
    expect(s.ammo).toBe(WEAPONS.rifle.magazine);
    expect(s.reserve).toBe(WEAPONS.rifle.magazine - 1);
  });

  it('speed and piercing last their time; shield is a flag', () => {
    const s = initialCombat();
    applyPowerup(s, 'speed');
    expect(speedMultiplier(s)).toBe(GAME.powerups.speedMultiplier);
    for (let i = 0; i < SPEED_POWERUP_TICKS; i++) stepCombat(s, false, false);
    expect(speedMultiplier(s)).toBe(1);

    applyPowerup(s, 'piercing');
    expect(stepCombat(s, true, false).pierce).toBe(true);
    for (let i = 0; i < PIERCING_POWERUP_TICKS + 20; i++) stepCombat(s, false, false);
    expect(stepCombat(s, true, false).pierce).toBe(false);
    expect(applyPowerup(s, 'shield')).toEqual({ shield: true });
  });

  it('dash: needs the power-up and a direction; a short burst, then a cooldown', () => {
    const s = initialCombat();
    expect(stepCombat(s, false, false, true, true).dashed).toBe(false); // no power-up
    applyPowerup(s, 'dash');
    expect(stepCombat(s, false, false, true, false).dashed).toBe(false); // standing still
    expect(stepCombat(s, false, false, true, true).dashed).toBe(true);
    expect(speedMultiplier(s)).toBe(GAME.powerups.dash.multiplier);
    for (let i = 0; i < DASH_BURST_TICKS; i++) stepCombat(s, false, false, false, true);
    expect(speedMultiplier(s)).toBe(1);
    let next = -1;
    for (let i = 0; i < DASH_COOLDOWN_TICKS; i++) if (stepCombat(s, false, false, true, true).dashed) { next = i; break; }
    // Cooldown counts from the dash start: allowed again DASH_COOLDOWN_TICKS inputs later
    expect(next + 1 + DASH_BURST_TICKS).toBe(DASH_COOLDOWN_TICKS);
  });

  it('power-up cap: one per two players; draws follow the weights (rifle rarest, speed most common)', () => {
    expect([1, 2, 3, 4, 5, 8].map(powerupCap)).toEqual([0, 1, 1, 2, 2, 4]);
    const rng = mulberry32(5);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 20000; i++) { const k = pickPowerupKind(rng); counts[k] = (counts[k] ?? 0) + 1; }
    const w = GAME.powerups.weights as Record<string, number>;
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    for (const k of GAME.powerups.kinds) expect(counts[k] / 20000).toBeCloseTo(w[k] / total, 1);
    expect(counts.rapid_fire).toBeLessThan(counts.speed / 2);
  });
});
