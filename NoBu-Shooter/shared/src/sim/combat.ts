/**
 * combat.ts — deterministic weapon, ammo, reload and power-up timers.
 * GAMERULES.md §6, §6a, §6b.
 *
 * Pure: no Math.random, Date.now, DOM or Node APIs. Like stepPlayer, the
 * server and the client's prediction advance this state once per *consumed
 * input* (not per server tick), so replaying the unacknowledged inputs on top
 * of the server's state reproduces the server exactly. A lost input that the
 * client fired with therefore shows up as an ammo correction.
 *
 * Order inside one input (both ends):
 *   1. movement with speedMultiplier(state) (the caller does this),
 *   2. stepCombat(): power-up timers, reload progress, reload request,
 *      firing, cooldown, dash.
 */

import GAME, { type WeaponId, type PowerupKind } from '../config/game.js';

const HZ = GAME.sim.hz;
const ticks = (ms: number) => Math.round((ms * HZ) / 1000);

export interface WeaponStats {
  magazine: number;
  cooldownTicks: number;
  reloadTicks: number;
  pellets: number;
  spreadRad: number;
  lifetimeTicks: number;
}

export const WEAPONS: Readonly<Record<WeaponId, WeaponStats>> = Object.fromEntries(
  (['handgun', 'rifle', 'shotgun'] as const).map((id) => {
    const w = GAME.weapons[id];
    return [id, {
      magazine: w.magazine,
      cooldownTicks: ticks(w.fireCooldownMs),
      reloadTicks: ticks(w.reloadMs),
      pellets: w.pellets,
      spreadRad: (w.spreadDeg * Math.PI) / 180,
      lifetimeTicks: ticks(w.lifetimeMs),
    }];
  }),
) as Record<WeaponId, WeaponStats>;

export const DEFAULT_WEAPON: WeaponId = GAME.weapons.default;
/** Reserve rounds of the default weapon: unlimited reloads (GAMERULES.md §6a). */
export const INFINITE_RESERVE = -1;
export const WEAPON_POWERUP_TICKS = ticks(GAME.powerups.weaponMs);
export const SPEED_POWERUP_TICKS = ticks(GAME.powerups.speedMs);
export const PIERCING_POWERUP_TICKS = ticks(GAME.powerups.piercingMs);
export const DASH_POWERUP_TICKS = ticks(GAME.powerups.dashMs);
export const DASH_BURST_TICKS = ticks(GAME.powerups.dash.burstMs);
export const DASH_COOLDOWN_TICKS = ticks(GAME.powerups.dash.cooldownMs);

/** The predicted part of a player's state (everything here is per-input). */
export interface CombatState {
  weapon: WeaponId;
  /** Remaining inputs of a power-up weapon; 0 for the default weapon. */
  weaponTicks: number;
  ammo: number;
  /** Spare rounds outside the magazine; INFINITE_RESERVE (-1) for the default weapon. */
  reserve: number;
  /** > 0 while reloading. */
  reloadTicks: number;
  cooldownTicks: number;
  /** > 0 while the Speed power-up is active. */
  speedTicks: number;
  /** > 0 while the Piercing power-up is active: shots pass through obstacles. */
  pierceTicks: number;
  /** > 0 while the Dash power-up is active (dashes allowed). */
  dashTicks: number;
  /** > 0 during a dash burst. */
  dashBurstTicks: number;
  /** > 0 until the next dash is allowed. */
  dashCooldownTicks: number;
}

export function initialCombat(): CombatState {
  return {
    weapon: DEFAULT_WEAPON,
    weaponTicks: 0,
    ammo: WEAPONS[DEFAULT_WEAPON].magazine,
    reserve: INFINITE_RESERVE,
    reloadTicks: 0,
    cooldownTicks: 0,
    speedTicks: 0,
    pierceTicks: 0,
    dashTicks: 0,
    dashBurstTicks: 0,
    dashCooldownTicks: 0,
  };
}

export function copyCombat(s: CombatState): CombatState {
  return { ...s };
}

const KEYS = Object.keys(initialCombat()) as (keyof CombatState)[];
export function sameCombat(a: CombatState, b: CombatState): boolean {
  return KEYS.every((k) => a[k] === b[k]);
}

export function speedMultiplier(s: CombatState): number {
  return (s.speedTicks > 0 ? GAME.powerups.speedMultiplier : 1) *
    (s.dashBurstTicks > 0 ? GAME.powerups.dash.multiplier : 1);
}

/**
 * Pellet directions for one shot: `pellets` angles spread evenly over
 * `spreadRad`, centred on the aim (a fixed fan, so no shared RNG needed).
 */
export function pelletAngles(weapon: WeaponId, aim: number): number[] {
  const w = WEAPONS[weapon];
  if (w.pellets <= 1) return [aim];
  const step = w.spreadRad / (w.pellets - 1);
  return Array.from({ length: w.pellets }, (_, i) => aim - w.spreadRad / 2 + i * step);
}

export interface CombatStepResult {
  /** A shot was fired with this weapon (pelletAngles gives the directions). */
  fired: WeaponId | null;
  /** The shot pierces obstacles (Piercing power-up). */
  pierce: boolean;
  /** A reload started on this input (manual or automatic). */
  reloadStarted: boolean;
  /** Fire was held but blocked by an empty magazine or a reload. */
  dryFire: boolean;
  /** A power-up weapon ended on this input (time up or out of rounds). */
  weaponExpired: boolean;
  /** A dash burst started on this input. */
  dashed: boolean;
}

function equip(s: CombatState, weapon: WeaponId, weaponTicks: number): void {
  s.weapon = weapon;
  s.weaponTicks = weaponTicks;
  s.ammo = WEAPONS[weapon].magazine;
  // Power-up weapons: one spare magazine ("1 + 1"); the default weapon: unlimited
  s.reserve = weapon === DEFAULT_WEAPON ? INFINITE_RESERVE : WEAPONS[weapon].magazine;
  s.reloadTicks = 0;
  s.cooldownTicks = 0;
}

function canReload(s: CombatState): boolean {
  return s.reloadTicks === 0 && s.ammo < WEAPONS[s.weapon].magazine && s.reserve !== 0;
}

/**
 * Advance one input. `fire`, `reload`, `dash` are the input's flags (pass
 * false where the room doesn't allow firing); `moving` = any movement key
 * held (a dash needs a direction). Mutates `s`.
 */
export function stepCombat(s: CombatState, fire: boolean, reload: boolean, dash = false, moving = false): CombatStepResult {
  const res: CombatStepResult = { fired: null, pierce: false, reloadStarted: false, dryFire: false, weaponExpired: false, dashed: false };

  // Power-up timers
  if (s.weaponTicks > 0 && --s.weaponTicks === 0) {
    equip(s, DEFAULT_WEAPON, 0);
    res.weaponExpired = true;
  }
  if (s.speedTicks > 0) s.speedTicks--;
  if (s.pierceTicks > 0) s.pierceTicks--;
  if (s.dashTicks > 0) s.dashTicks--;
  if (s.dashBurstTicks > 0) s.dashBurstTicks--;
  if (s.dashCooldownTicks > 0) s.dashCooldownTicks--;

  const w = WEAPONS[s.weapon];

  // Reload progress (rounds come out of the reserve), then a new reload request
  if (s.reloadTicks > 0 && --s.reloadTicks === 0) {
    const take = s.reserve === INFINITE_RESERVE ? w.magazine - s.ammo : Math.min(s.reserve, w.magazine - s.ammo);
    s.ammo += take;
    if (s.reserve !== INFINITE_RESERVE) s.reserve -= take;
  }
  if (reload && canReload(s)) {
    s.reloadTicks = w.reloadTicks;
    res.reloadStarted = true;
  }

  // Fire
  if (fire) {
    if (s.reloadTicks > 0 || s.ammo <= 0) {
      res.dryFire = true;
    } else if (s.cooldownTicks === 0) {
      s.ammo--;
      s.cooldownTicks = w.cooldownTicks;
      res.fired = s.weapon;
      res.pierce = s.pierceTicks > 0;
      if (s.ammo === 0) {
        if (s.reserve === 0) {
          // Power-up weapon out of rounds: back to the default weapon
          equip(s, DEFAULT_WEAPON, 0);
          res.weaponExpired = true;
        } else {
          s.reloadTicks = w.reloadTicks; // automatic reload
          res.reloadStarted = true;
        }
      }
    }
  }
  if (s.cooldownTicks > 0) s.cooldownTicks--;

  // Dash (Dash power-up): a short burst, then a cooldown
  if (dash && moving && s.dashTicks > 0 && s.dashCooldownTicks === 0 && s.dashBurstTicks === 0) {
    s.dashBurstTicks = DASH_BURST_TICKS;
    s.dashCooldownTicks = DASH_COOLDOWN_TICKS;
    res.dashed = true;
  }
  return res;
}

/** Apply a collected power-up (server side; the client sees it in the next snapshot). */
export function applyPowerup(s: CombatState, kind: PowerupKind): { shield: boolean } {
  switch (kind) {
    case 'rapid_fire': equip(s, 'rifle', WEAPON_POWERUP_TICKS); return { shield: false };
    case 'spread_shot': equip(s, 'shotgun', WEAPON_POWERUP_TICKS); return { shield: false };
    case 'speed': s.speedTicks = SPEED_POWERUP_TICKS; return { shield: false };
    case 'piercing': s.pierceTicks = PIERCING_POWERUP_TICKS; return { shield: false };
    case 'dash': s.dashTicks = DASH_POWERUP_TICKS; s.dashCooldownTicks = 0; return { shield: false };
    case 'shield': return { shield: true };
  }
}
