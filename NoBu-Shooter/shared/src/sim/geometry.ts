/**
 * Geometry helpers — pure, deterministic, no DOM/Node.
 * All obstacles are axis-aligned rectangles.
 * Players are circles.
 * SPEC.md §7, GAMERULES.md §5.
 */

export interface Rect {
  x: number; // left edge
  y: number; // top edge
  w: number;
  h: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

/** Closest point on a rectangle to point p. */
export function closestPointOnRect(p: Vec2, r: Rect): Vec2 {
  return {
    x: Math.max(r.x, Math.min(r.x + r.w, p.x)),
    y: Math.max(r.y, Math.min(r.y + r.h, p.y)),
  };
}

/** True if circle (center c, radius cr) overlaps rectangle r. */
export function circleOverlapsRect(c: Vec2, cr: number, r: Rect): boolean {
  const cp = closestPointOnRect(c, r);
  const dx = c.x - cp.x;
  const dy = c.y - cp.y;
  return dx * dx + dy * dy < cr * cr;
}

/**
 * Push circle center out of rectangle r.
 * Algorithm per SPEC.md §7.2:
 *   - If center is outside: push along (center - closest_point) normalized.
 *   - If center is inside: push along axis of least penetration.
 */
export function resolveCircleRect(c: Vec2, cr: number, r: Rect): Vec2 {
  const cp = closestPointOnRect(c, r);
  const dx = c.x - cp.x;
  const dy = c.y - cp.y;
  const dist2 = dx * dx + dy * dy;

  if (dist2 >= cr * cr) return c; // no overlap

  if (dist2 > 1e-10) {
    // center outside rect — push along (c - cp)
    const dist = Math.sqrt(dist2);
    const pen = cr - dist;
    return { x: c.x + (dx / dist) * pen, y: c.y + (dy / dist) * pen };
  }

  // center inside rect — push along axis of least penetration
  const overlapLeft   = c.x - r.x;
  const overlapRight  = r.x + r.w - c.x;
  const overlapTop    = c.y - r.y;
  const overlapBottom = r.y + r.h - c.y;
  const minX = Math.min(overlapLeft, overlapRight);
  const minY = Math.min(overlapTop, overlapBottom);
  if (minX < minY) {
    const push = overlapLeft < overlapRight ? -(minX + cr) : (minX + cr);
    return { x: c.x + push, y: c.y };
  } else {
    const push = overlapTop < overlapBottom ? -(minY + cr) : (minY + cr);
    return { x: c.x, y: c.y + push };
  }
}

/** Clamp a value between lo and hi. */
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Euclidean distance squared. */
export function dist2(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** Euclidean distance. */
export function dist(a: Vec2, b: Vec2): number {
  return Math.sqrt(dist2(a, b));
}

/**
 * Test if a segment from p0 to p1 intersects rectangle r (expanded by margin).
 * Uses Liang-Barsky style parametric clipping against the expanded rect.
 * Returns true if the segment crosses the obstacle boundary.
 */
export function segmentIntersectsRect(
  p0: Vec2,
  p1: Vec2,
  r: Rect,
  margin = 0
): boolean {
  const rx = r.x - margin;
  const ry = r.y - margin;
  const rw = r.w + 2 * margin;
  const rh = r.h + 2 * margin;

  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;

  let tMin = 0;
  let tMax = 1;

  function clip(p: number, q: number): boolean {
    if (Math.abs(p) < 1e-10) return q >= 0;
    const t = q / p;
    if (p < 0) { if (t > tMax) return false; if (t > tMin) tMin = t; }
    else { if (t < tMin) return false; if (t < tMax) tMax = t; }
    return true;
  }

  if (!clip(-dx, p0.x - rx))        return false;
  if (!clip( dx, rx + rw - p0.x))   return false;
  if (!clip(-dy, p0.y - ry))        return false;
  if (!clip( dy, ry + rh - p0.y))   return false;

  return tMin <= tMax;
}

/**
 * Swept circle vs rectangle test.
 * Returns the t parameter [0,1] of the first intersection, or null.
 * Used by the projectile collision system (GAMERULES.md §7).
 */
export function sweptCircleRect(
  p0: Vec2,
  p1: Vec2,
  cr: number,
  r: Rect
): number | null {
  // Expand the rectangle by cr and do a segment intersection
  const expanded: Rect = { x: r.x - cr, y: r.y - cr, w: r.w + 2 * cr, h: r.h + 2 * cr };
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  let tMin = 0;
  let tMax = 1;

  function clip(p: number, q: number): boolean {
    if (Math.abs(p) < 1e-10) return q >= 0;
    const t = q / p;
    if (p < 0) { if (t > tMax) return false; if (t > tMin) tMin = t; }
    else { if (t < tMin) return false; if (t < tMax) tMax = t; }
    return true;
  }

  if (!clip(-dx, p0.x - expanded.x))              return null;
  if (!clip( dx, expanded.x + expanded.w - p0.x)) return null;
  if (!clip(-dy, p0.y - expanded.y))              return null;
  if (!clip( dy, expanded.y + expanded.h - p0.y)) return null;

  if (tMin > tMax) return null;
  return tMin;
}

/**
 * Swept circle vs circle test.
 * Returns t parameter [0,1] of first intersection, or null.
 */
export function sweptCircleCircle(
  p0: Vec2, p1: Vec2, r1: number,
  c: Vec2, r2: number
): number | null {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const fx = p0.x - c.x;
  const fy = p0.y - c.y;
  const r = r1 + r2;

  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const cc = fx * fx + fy * fy - r * r;

  const disc = b * b - 4 * a * cc;
  if (disc < 0) return null;

  const sqrtD = Math.sqrt(disc);
  const t1 = (-b - sqrtD) / (2 * a);
  const t2 = (-b + sqrtD) / (2 * a);

  if (t1 >= 0 && t1 <= 1) return t1;
  if (t2 >= 0 && t2 <= 1) return t2;
  return null;
}
