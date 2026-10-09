/**
 * remoteError.ts — how far behind the truth remote entities are drawn.
 * PHASES.md C4, docs/PHASE2_PLAN.md D3 (+ §10).
 *
 * For entities whose true path is known (the lab movers), every presented
 * frame is compared with the exact true position at the same server time:
 *  - delay τ: how old the drawn position is, i.e. the τ for which
 *    path(t − τ) equals the drawn position while heading the same way as
 *    the drawn entity last moved (a back-and-forth path passes each point
 *    twice). Reported as its mean (lag) and standard deviation (wobble), in
 *    ms. Unlike a raw distance, it does not depend on the shape of the path
 *    (stops, reversals, corners). Both statistics are robust: lag is the
 *    median, wobble the interquartile range / 1.35 (equal to the standard
 *    deviation for normal noise), so a rare glitch doesn't swamp them.
 *  - error: the plain distance to the true position, in px.
 *  - frozen: frames where the entity really moved but was drawn in place.
 * Headless and pure (no DOM), so the netcode harness can test it.
 */

export type PathFn = (serverMs: number) => { x: number; y: number };

export interface DrawnEntity {
  id: number;
  x: number;
  y: number;
  path: PathFn;
}

export interface RemoteErrorStats {
  /** Median delay of the drawn position behind the truth (ms). */
  lagMs: number;
  /** Spread of that delay: interquartile range / 1.35 (ms). */
  wobbleMs: number;
  /** Mean distance to the true position while it moves (px). */
  errorPx: number;
  /** Frames drawn in place while the entity really moved (%). */
  frozenPct: number;
  /** Delay samples in the window (0 = no data). */
  samples: number;
}

const WINDOW_MS = 2000;
/** A drawn position this close to the path counts as lying on it. */
const MATCH_TOL_PX = 3;
const TAU_MIN_MS = -250;
const TAU_MAX_MS = 1500;
const LOCAL_SPAN_MS = 150;
/** Truth moved more than this since the last frame: the entity is moving. */
const MOVING_PX = 0.5;
/** Drawn moved less than this: the frame showed it in place. */
const FROZEN_PX = 0.1;
/** Forget an entity's last delay after this long unseen. */
const STALE_MS = 500;

interface Vec { x: number; y: number }

interface EntityState {
  seenAt: number;
  drawnX: number;
  drawnY: number;
  trueX: number;
  trueY: number;
  tau: number | null;
  /** Direction of the last visible drawn movement (null until it moved). */
  dir: Vec | null;
}

interface Match { tau: number; cost: number }

export class RemoteErrorTracker {
  private delays: { t: number; v: number }[] = [];
  private errors: { t: number; v: number }[] = [];
  private frames: { t: number; frozen: boolean }[] = [];
  private entities = new Map<number, EntityState>();

  /** Record one presented frame: `serverMs` is the true server time it shows. */
  sample(now: number, serverMs: number, drawn: readonly DrawnEntity[]): void {
    for (const e of drawn) {
      const truth = e.path(serverMs);
      let st = this.entities.get(e.id);
      if (st && now - st.seenAt > STALE_MS) st = undefined;

      let dir = st?.dir ?? null;
      if (st) {
        const drawnStep = Math.hypot(e.x - st.drawnX, e.y - st.drawnY);
        const trueStep = Math.hypot(truth.x - st.trueX, truth.y - st.trueY);
        if (trueStep > MOVING_PX) {
          this.frames.push({ t: now, frozen: drawnStep < FROZEN_PX });
          this.errors.push({ t: now, v: Math.hypot(e.x - truth.x, e.y - truth.y) });
        }
        if (drawnStep > MOVING_PX) dir = { x: (e.x - st.drawnX) / drawnStep, y: (e.y - st.drawnY) / drawnStep };
      }

      const tau = dir ? findDelay(e.path, serverMs, e.x, e.y, dir, st?.tau ?? null) : null;
      if (tau !== null) this.delays.push({ t: now, v: tau });
      this.entities.set(e.id, {
        seenAt: now, drawnX: e.x, drawnY: e.y, trueX: truth.x, trueY: truth.y,
        tau: tau ?? st?.tau ?? null, dir,
      });
    }
    this.prune(now);
  }

  stats(now: number): RemoteErrorStats {
    this.prune(now);
    const d = this.delays.map((s) => s.v).sort((a, b) => a - b);
    const err = this.errors.map((s) => s.v);
    const frozen = this.frames.filter((f) => f.frozen).length;
    return {
      lagMs: Math.round(quantile(d, 0.5)),
      wobbleMs: Math.round(((quantile(d, 0.75) - quantile(d, 0.25)) / 1.35) * 10) / 10,
      errorPx: err.length ? Math.round((err.reduce((a, b) => a + b, 0) / err.length) * 10) / 10 : 0,
      frozenPct: this.frames.length ? Math.round((frozen / this.frames.length) * 100) : 0,
      samples: d.length,
    };
  }

  reset(): void {
    this.delays = [];
    this.errors = [];
    this.frames = [];
    this.entities.clear();
  }

  private prune(now: number): void {
    const cutoff = now - WINDOW_MS;
    while (this.delays.length && this.delays[0].t < cutoff) this.delays.shift();
    while (this.errors.length && this.errors[0].t < cutoff) this.errors.shift();
    while (this.frames.length && this.frames[0].t < cutoff) this.frames.shift();
  }
}

/** Linear-interpolated quantile of a sorted array (0 when empty). */
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const i = Math.floor(pos);
  const frac = pos - i;
  return i + 1 < sorted.length ? sorted[i] + (sorted[i + 1] - sorted[i]) * frac : sorted[i];
}

/** Best match of the drawn position on the path within [lo, hi] (grid search, then refine). */
function searchDelay(path: PathFn, serverMs: number, x: number, y: number, lo: number, hi: number, step: number): Match {
  const cost = (tau: number) => {
    const p = path(serverMs - tau);
    return Math.hypot(p.x - x, p.y - y);
  };
  let best: Match = { tau: lo, cost: Infinity };
  for (let tau = lo; tau <= hi; tau += step) {
    const c = cost(tau);
    if (c < best.cost) best = { tau, cost: c };
  }
  for (let tau = best.tau - step; tau <= best.tau + step; tau += step / 10) {
    const c = cost(tau);
    if (c < best.cost) best = { tau, cost: c };
  }
  return best;
}

/** All separate places in [TAU_MIN_MS, TAU_MAX_MS] where the drawn position lies on the path. */
function allMatches(path: PathFn, serverMs: number, x: number, y: number): Match[] {
  const step = 5;
  const found: Match[] = [];
  let prev = Infinity;
  let falling = false;
  for (let tau = TAU_MIN_MS; tau <= TAU_MAX_MS + step; tau += step) {
    const p = path(serverMs - tau);
    const c = Math.hypot(p.x - x, p.y - y);
    if (c > prev && falling) {
      const m = searchDelay(path, serverMs, x, y, Math.max(TAU_MIN_MS, tau - 2 * step), tau, 1);
      if (m.cost < MATCH_TOL_PX && !found.some((f) => Math.abs(f.tau - m.tau) < 20)) found.push(m);
    }
    falling = c < prev;
    prev = c;
  }
  return found;
}

/** Direction the path is heading at server time `ms` (zero vector when standing still). */
function heading(path: PathFn, ms: number): Vec {
  const a = path(ms - 10);
  const b = path(ms + 10);
  return { x: b.x - a.x, y: b.y - a.y };
}

/**
 * The delay τ (ms) at which the path passes through the drawn position,
 * heading the way the drawn entity last moved (`dir`, a unit vector). Null
 * when the position isn't on the path or τ is ambiguous: the path stands
 * still there (any τ in the pause fits), or several passes fit and there is
 * no previous delay to choose by.
 */
export function findDelay(path: PathFn, serverMs: number, x: number, y: number, dir: Vec, prevTau: number | null): number | null {
  const fits = (m: Match) => {
    if (m.cost >= MATCH_TOL_PX) return false;
    const h = heading(path, serverMs - m.tau);
    const speed = Math.hypot(h.x, h.y);
    return speed >= MOVING_PX && (h.x * dir.x + h.y * dir.y) / speed > 0.2;
  };

  if (prevTau !== null) {
    const lo = Math.max(TAU_MIN_MS, prevTau - LOCAL_SPAN_MS);
    const hi = Math.min(TAU_MAX_MS, prevTau + LOCAL_SPAN_MS);
    if (lo < hi) {
      const local = searchDelay(path, serverMs, x, y, lo, hi, 2);
      if (fits(local)) return local.tau;
    }
  }
  const candidates = allMatches(path, serverMs, x, y).filter(fits);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].tau;
  if (prevTau === null) return null;
  candidates.sort((a, b) => Math.abs(a.tau - prevTau) - Math.abs(b.tau - prevTau));
  return candidates[0].tau;
}
