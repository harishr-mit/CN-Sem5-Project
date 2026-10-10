/**
 * extrapolate.ts — the State sync renderer (dead reckoning,
 * docs/PHASE3_PLAN.md D6). Headless and pure, so it is unit-tested.
 *
 * Remote entities are drawn at the estimated current server time with no
 * interpolation delay: position = last state + velocity × dt, dt clamped to
 * [-backMs, maxMs], then pushed out of obstacles. A state can be slightly
 * newer than the render clock (jitter, clock estimate); projecting it back
 * keeps every position on one time base — clamping at 0 instead made each
 * new state look like a backward jump, and at 30 Hz those jumps piled up
 * into extra lag. When a newer state replaces the
 * old one, the jump between the two extrapolations becomes an offset that
 * decays with a half-life (error blending), so corrections slide instead of
 * snapping. Overshoot at a reversal and the pull back afterwards are the
 * model's visible cost (rubber-banding).
 */

import type { PlayerSnap, ProjectileSnap } from '@nobu/shared/protocol';
import type { Velocity } from '@nobu/shared/sync';

export interface StateSample {
  /** Server time of the state (ms). */
  st: number;
  players: PlayerSnap[];
  projectiles: ProjectileSnap[];
  vel: ReadonlyMap<number, Velocity>;
}

export interface ExtrapolateCfg {
  /** Never extrapolate further than this past the state (ms); then hold. */
  maxMs: number;
  /** How far a state may be projected back when it is newer than the render time (ms). */
  backMs: number;
  /** Half-life of the blend offset (ms). */
  blendHalfLifeMs: number;
  /** Projectile speed (px/s); projectiles fly straight along (dx, dy). */
  projectileSpeed: number;
  /** A correction this large is a teleport: snap instead of blending. */
  snapPx: number;
  /** Keeps a player position out of walls (settlePosition with the map's geometry). */
  settle?: (pos: { x: number; y: number }) => { x: number; y: number };
}

interface Offset { x: number; y: number }

export class Extrapolator {
  private sample: StateSample | null = null;
  /** The sample used for the last frame, and that frame's server time. */
  private drawnSample: StateSample | null = null;
  private drawnAt = 0;
  private offsets = new Map<number, Offset>();

  constructor(private cfg: ExtrapolateCfg) {}

  /** The newest state. Older or equal states are ignored. */
  push(sample: StateSample): void {
    if (this.sample && sample.st <= this.sample.st) return;
    this.sample = sample;
  }

  get current(): StateSample | null {
    return this.sample;
  }

  reset(): void {
    this.sample = null;
    this.drawnSample = null;
    this.offsets.clear();
  }

  /** Where one player would be at `serverMs` from `s`, before blending. */
  rawPlayer(s: StateSample, p: PlayerSnap, serverMs: number): { x: number; y: number } {
    if (!p.alive) return { x: p.x, y: p.y };
    const v = s.vel.get(p.id);
    if (!v || (v.vx === 0 && v.vy === 0)) return { x: p.x, y: p.y };
    const dt = this.dt(s, serverMs);
    const pos = { x: p.x + v.vx * dt, y: p.y + v.vy * dt };
    return this.cfg.settle && !p.mover ? this.cfg.settle(pos) : pos;
  }

  /** Render state at `serverMs` (the estimated current server time). */
  render(serverMs: number): { players: PlayerSnap[]; projectiles: ProjectileSnap[] } {
    const s = this.sample;
    if (!s) return { players: [], projectiles: [] };

    // Decay the offsets over the time since the last frame
    const prev = this.drawnSample;
    const decay = prev ? Math.pow(0.5, Math.max(0, serverMs - this.drawnAt) / this.cfg.blendHalfLifeMs) : 1;
    for (const o of this.offsets.values()) { o.x *= decay; o.y *= decay; }

    // A new state: carry the jump between the old and new extrapolation (at the last frame's time) as an offset
    if (prev && prev !== s) {
      const before = new Map(prev.players.map((p) => [p.id, p]));
      for (const p of s.players) {
        const old = before.get(p.id);
        if (!old || old.life !== p.life || old.alive !== p.alive) { this.offsets.delete(p.id); continue; }
        const a = this.rawPlayer(prev, old, this.drawnAt);
        const b = this.rawPlayer(s, p, this.drawnAt);
        const o = this.offsets.get(p.id) ?? { x: 0, y: 0 };
        o.x += a.x - b.x;
        o.y += a.y - b.y;
        if (Math.hypot(o.x, o.y) >= this.cfg.snapPx) this.offsets.delete(p.id);
        else this.offsets.set(p.id, o);
      }
    }
    for (const id of [...this.offsets.keys()]) if (!s.players.some((p) => p.id === id)) this.offsets.delete(id);

    const players = s.players.map((p) => {
      const pos = this.rawPlayer(s, p, serverMs);
      const o = this.offsets.get(p.id);
      return o ? { ...p, x: pos.x + o.x, y: pos.y + o.y } : { ...p, x: pos.x, y: pos.y };
    });
    const step = this.cfg.projectileSpeed * this.dt(s, serverMs);
    const projectiles = s.projectiles.map((pr) => ({ ...pr, x: pr.x + pr.dx * step, y: pr.y + pr.dy * step }));

    this.drawnSample = s;
    this.drawnAt = serverMs;
    return { players, projectiles };
  }

  /** Seconds to project state `s` to `serverMs`, clamped to [-backMs, maxMs]. */
  private dt(s: StateSample, serverMs: number): number {
    return Math.min(Math.max(serverMs - s.st, -this.cfg.backMs), this.cfg.maxMs) / 1000;
  }

  /** Current blend offset of an entity (tests). */
  offsetOf(id: number): Offset {
    return { ...(this.offsets.get(id) ?? { x: 0, y: 0 }) };
  }
}
