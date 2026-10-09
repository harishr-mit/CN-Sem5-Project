/**
 * Shared sim barrel export.
 */
export { stepPlayer, settlePosition, KEY, type MoveCfg } from './movement.js';
export { mulberry32 } from './prng.js';
export { hashState } from './hash.js';
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
