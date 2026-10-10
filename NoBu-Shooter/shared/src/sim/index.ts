/**
 * Shared sim barrel export.
 */
export { stepPlayer, settlePosition, KEY, type MoveCfg } from './movement.js';
export { mulberry32 } from './prng.js';
export {
  WEAPONS, DEFAULT_WEAPON, WEAPON_POWERUP_TICKS, SPEED_POWERUP_TICKS,
  INFINITE_RESERVE, PIERCING_POWERUP_TICKS, DASH_POWERUP_TICKS, DASH_BURST_TICKS, DASH_COOLDOWN_TICKS,
  initialCombat, copyCombat, sameCombat, speedMultiplier, pelletAngles, stepCombat, applyPowerup,
  type CombatState, type CombatStepResult, type WeaponStats,
} from './combat.js';
export { powerupCap, pickPowerupKind, isValidPowerupSpot, randomPowerupSpot } from './powerups.js';
export { hashState } from './hash.js';
export { moverPath, isMoverPattern, MOVER_PATTERNS, type MoverPattern, type MoverCfg } from './movers.js';
export {
  type Rect,
  type Vec2,
  closestPointOnRect,
  circleOverlapsRect,
  resolveCircleRect,
  clamp,
  dist,
  dist2,
  segmentIntersectsRect,
  sweptCircleRect,
  sweptCircleCircle,
} from './geometry.js';
