/**
 * lockstep.ts — the client half of deterministic lockstep (PHASES.md L1,
 * docs/PHASE6_PLAN.md D4–D7). Headless like NetClient.
 *
 * Holds the lab world and replays the server's tick records in order with
 * the shared movement code (applyRecord). Playout runs on a local estimate of
 * the server's tick, `bufferTicks` behind it:
 *  - the next record is there → apply it (up to `maxCatchUpTicks` per frame);
 *  - it isn't → the world stays frozen: a **stall**, counted and timed;
 *  - a keyframe further on can replace the missing ticks (a jump).
 * Every `hashEveryTicks` the server's hash is compared with ours; a mismatch
 * is a **desync**: counted, and a fresh keyframe is requested.
 * Rd off: gaps are asked for again (`lsNack`), retried after 1.5 × RTT.
 */

import {
  applyRecord, worldFromKeyframe, worldHash, type LabWorld, type LockstepRecord, type MsgLs,
} from '@nobu/shared/sync';
import GAME from '@nobu/shared/config/game';
import NET from '@nobu/shared/config/net';

const TICK_MS = 1000 / GAME.sim.hz;
/** Window of the stall statistics. */
const STATS_WINDOW_MS = NET.metricsWindowMs;

export interface LockstepClientOptions {
  /** Redundant window (true) or resend on request (false). */
  rd: boolean;
  bufferTicks?: number;
  maxCatchUpTicks?: number;
  /** Called on a hash mismatch (tests, console). */
  onDesync?: (tick: number, ours: number, theirs: number) => void;
}

export interface LockstepStats {
  /** % of frames in the window that showed a frozen world waiting for a tick. */
  stalledPct: number;
  /** Stalls that began in the last second. */
  stallsPerSec: number;
  /** Longest stall in the window (ms; a stall still going counts). */
  longestStallMs: number;
  /** Stalls since the start. */
  stalls: number;
  /** Server's estimated tick − shown tick. */
  behindTicks: number;
  behindMs: number;
  /** Ticks asked for again (NACK, incl. retries). */
  nackedTicks: number;
  /** Records received that we already had (redundant window, resends, duplicates). */
  duplicateRecords: number;
  /** Jumps to a keyframe over missing ticks (resyncs). */
  resyncs: number;
  /** Hash mismatches (must stay 0). */
  desyncs: number;
  /** Hash checks passed. */
  hashChecks: number;
  /** Frames that applied more than one tick (catching up). */
  catchUpFrames: number;
}

/** A frame's outcome. */
export interface LockstepFrame {
  /** Ticks applied this frame. */
  applied: number;
  /** The world was frozen waiting for a missing tick. */
  stalled: boolean;
}

export class LockstepClient {
  rd: boolean;
  private readonly bufferTicks: number;
  private readonly maxCatchUp: number;
  private readonly onDesync?: LockstepClientOptions['onDesync'];

  private world: LabWorld | null = null;
  /** Received records not yet applied (k > world.tick), by tick. */
  private held = new Map<number, LockstepRecord>();
  /** Server hashes still to compare (tick → hash), for ticks not yet applied. */
  private hashes = new Map<number, number>();
  /** Waiting for a keyframe after a desync: plain records are useless until then. */
  private needKey = false;
  private keyAskedAt = -Infinity;

  // Server tick clock: offset = server ms − local ms (EMA, like NetClient's)
  private offset = 0;
  private clockReady = false;
  private newestTick = -1;

  // NACK (Rd off): open gap and when it was last asked for
  private nackFrom = -1;
  private nackTo = -1;
  private nackAt = -Infinity;
  private pendingNack: { from: number; to: number; key?: true } | null = null;

  // Stall bookkeeping
  private frames: { t: number; stalled: boolean }[] = [];
  private stallStarts: number[] = [];
  private stallSpans: { start: number; end: number }[] = [];
  private stallSince: number | null = null;
  readonly stats: LockstepStats = {
    stalledPct: 0, stallsPerSec: 0, longestStallMs: 0, stalls: 0, behindTicks: 0, behindMs: 0,
    nackedTicks: 0, duplicateRecords: 0, resyncs: 0, desyncs: 0, hashChecks: 0, catchUpFrames: 0,
  };

  constructor(opts: LockstepClientOptions) {
    this.rd = opts.rd;
    this.bufferTicks = opts.bufferTicks ?? NET.lockstep.bufferTicks;
    this.maxCatchUp = opts.maxCatchUpTicks ?? NET.lockstep.maxCatchUpTicks;
    this.onDesync = opts.onDesync;
  }

  /** The world as last applied (null until the first keyframe). */
  get current(): LabWorld | null { return this.world; }

  /** Newest tick such that every record up to it is held or applied (the ack). −1 = none. */
  get ackTick(): number {
    if (!this.world || this.needKey) return -1;
    let k = this.world.tick;
    while (this.held.has(k + 1)) k++;
    return k;
  }

  /** The server's tick estimated for local time `now`. */
  serverTick(now: number): number {
    return this.clockReady ? (now + this.offset) / TICK_MS : -1;
  }

  /** One `ls` message (already validated). */
  receive(msg: MsgLs, now: number): void {
    // Clock: msg.tick is the server's newest tick at send time (tick × TICK_MS = its server time)
    if (msg.tick > this.newestTick) {
      this.newestTick = msg.tick;
      const sample = msg.tick * TICK_MS - now;
      if (!this.clockReady) { this.offset = sample; this.clockReady = true; }
      else this.offset += (sample - this.offset) * NET.clockSmoothing;
    }
    const base = this.world?.tick ?? -1;
    for (const rec of msg.recs) {
      if ((this.world && !this.needKey && rec.k <= base) || this.held.has(rec.k)) {
        this.stats.duplicateRecords++;
        continue;
      }
      this.held.set(rec.k, rec);
      if (rec.h !== undefined) this.hashes.set(rec.k, rec.h);
    }
    // No world yet (or after a desync): start from the newest keyframe held
    if (!this.world || this.needKey) this.adoptNewestKey();
    this.trackGap(now);
  }

  /** Start (or restart) from the newest keyframe held. */
  private adoptNewestKey(): void {
    let best: LockstepRecord | null = null;
    for (const r of this.held.values()) if (r.key && (!best || r.k > best.k)) best = r;
    if (!best) return;
    const restarted = this.world !== null;
    this.world = worldFromKeyframe(best.key!, best.k);
    this.needKey = false;
    this.dropUpTo(best.k);
    if (restarted) this.stats.resyncs++;
    this.checkHash();
  }

  private dropUpTo(k: number): void {
    for (const t of this.held.keys()) if (t <= k) this.held.delete(t);
    for (const t of this.hashes.keys()) if (t < k) this.hashes.delete(t);
  }

  /** Rd off: remember the first hole (between the ack and the next held record). */
  private trackGap(now: number): void {
    if (this.rd || !this.world || this.needKey) { this.nackFrom = this.nackTo = -1; return; }
    const ack = this.ackTick;
    let next = Infinity;
    for (const t of this.held.keys()) if (t > ack && t < next) next = t;
    if (next === Infinity) { this.nackFrom = this.nackTo = -1; return; }
    const from = ack + 1;
    const to = next - 1;
    if (from !== this.nackFrom || to !== this.nackTo) {
      // A new hole: ask now
      this.nackFrom = from;
      this.nackTo = to;
      this.queueNack(from, to, now);
    }
  }

  private queueNack(from: number, to: number, now: number): void {
    this.pendingNack = { from, to };
    this.nackAt = now;
    this.stats.nackedTicks += to - from + 1;
  }

  /**
   * The lsNack to send now, if any: a new hole, a hole still open after
   * `nackRetryRtt` × RTT, or a keyframe request after a desync.
   */
  takeNack(now: number, rttMs: number): { from: number; to: number; key?: true } | null {
    if (this.needKey && now - this.keyAskedAt > Math.max(NET.lockstep.nackRetryMinMs, rttMs * NET.lockstep.nackRetryRtt)) {
      this.keyAskedAt = now;
      return { from: 0, to: 0, key: true };
    }
    if (!this.pendingNack && this.nackFrom >= 0 &&
        now - this.nackAt > Math.max(NET.lockstep.nackRetryMinMs, rttMs * NET.lockstep.nackRetryRtt)) {
      this.queueNack(this.nackFrom, this.nackTo, now);
    }
    const n = this.pendingNack;
    this.pendingNack = null;
    return n;
  }

  /**
   * Advance the playout for a frame drawn at `now`: apply every tick up to
   * the server's tick − buffer (at most maxCatchUp), or stall.
   */
  frame(now: number): LockstepFrame {
    let applied = 0;
    let stalled = false;
    const world = this.world;
    if (world && this.clockReady) {
      const target = Math.floor(this.serverTick(now)) - this.bufferTicks;
      while (this.world!.tick < target && applied < this.maxCatchUp) {
        if (this.needKey) { stalled = true; break; }
        const next = this.held.get(this.world!.tick + 1);
        if (next) {
          this.world = applyRecord(this.world, next);
          this.held.delete(next.k);
          this.checkHash();
          applied++;
          continue;
        }
        // A keyframe further on (not past the target) replaces the missing ticks
        const jump = this.lowestKeyUpTo(target);
        if (jump) {
          this.world = worldFromKeyframe(jump.key!, jump.k);
          this.dropUpTo(jump.k);
          this.stats.resyncs++;
          this.checkHash();
          applied++;
          continue;
        }
        stalled = true;
        break;
      }
      if (applied > 1) this.stats.catchUpFrames++;
    }
    if (this.world && (stalled || applied > 0)) this.trackGap(now);
    this.recordFrame(now, stalled);
    return { applied, stalled };
  }

  private lowestKeyUpTo(target: number): LockstepRecord | null {
    let best: LockstepRecord | null = null;
    for (const r of this.held.values()) {
      if (r.key && r.k > this.world!.tick && r.k <= target && (!best || r.k < best.k)) best = r;
    }
    return best;
  }

  /** Compare with the server's hash of this tick, if one came (docs/PHASE6_PLAN.md D6). */
  private checkHash(): void {
    const w = this.world!;
    const theirs = this.hashes.get(w.tick);
    if (theirs === undefined) return;
    this.hashes.delete(w.tick);
    const ours = worldHash(w);
    if (ours === theirs) { this.stats.hashChecks++; return; }
    this.stats.desyncs++;
    this.onDesync?.(w.tick, ours, theirs);
    // Keep showing the (wrong) world, frozen, until a fresh keyframe arrives
    this.needKey = true;
    this.keyAskedAt = -Infinity;
    this.held.clear();
    this.hashes.clear();
  }

  private recordFrame(now: number, stalled: boolean): void {
    this.frames.push({ t: now, stalled });
    if (stalled && this.stallSince === null) {
      this.stallSince = now;
      this.stallStarts.push(now);
      this.stats.stalls++;
    } else if (!stalled && this.stallSince !== null) {
      this.stallSpans.push({ start: this.stallSince, end: now });
      this.stallSince = null;
    }
  }

  /** Refresh the window statistics (call at the metrics rate). */
  updateStats(now: number): LockstepStats {
    const s = this.stats;
    this.frames = this.frames.filter((f) => now - f.t < STATS_WINDOW_MS);
    this.stallStarts = this.stallStarts.filter((t) => now - t < 1000);
    this.stallSpans = this.stallSpans.filter((sp) => now - sp.end < STATS_WINDOW_MS);
    s.stalledPct = this.frames.length ? Math.round(1000 * this.frames.filter((f) => f.stalled).length / this.frames.length) / 10 : 0;
    s.stallsPerSec = this.stallStarts.length;
    const spans = this.stallSpans.map((sp) => sp.end - sp.start);
    if (this.stallSince !== null) spans.push(now - this.stallSince);
    s.longestStallMs = Math.round(Math.max(0, ...spans));
    if (this.world && this.clockReady) {
      const behind = Math.max(0, this.serverTick(now) - this.world.tick);
      s.behindTicks = Math.round(behind * 10) / 10;
      s.behindMs = Math.round(behind * TICK_MS);
    }
    return s;
  }
}
