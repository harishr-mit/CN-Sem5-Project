/**
 * metrics.ts — server-side event counters and tick performance.
 * SPEC.md §9.6.
 */

export interface MetricCounters {
  shots: number;
  hits: number;
  deaths: number;
  respawns: number;
  playerJoins: number;
  playerLeaves: number;
  playerInputs: number;
  playerMoves: number;
  matchStarts: number;
  matchEnds: number;
  scoreUpdates: number;
  reloads: number;
  pickups: number;
  shieldBlocks: number;
}

export interface TickPerf {
  /** Target tick rate (Hz). */
  targetHz: number;
  /** Achieved tick rate over the last second. */
  achievedHz: number;
  /** Average tick processing time (ms) over last second. */
  avgTickMs: number;
  /** Max tick processing time (ms) over last second. */
  maxTickMs: number;
  /** Count of tick overruns. */
  overruns: number;
}

/** Snapshot traffic per sync model (PHASES.md Phase 3); bytes = payload + 28 B per message. */
export interface SyncTraffic {
  msgs: number;
  bytes: number;
}

/** Same per-message overhead the emulator adds (docs/ASSUMPTIONS.md #3). */
export const WIRE_OVERHEAD_BYTES = 28;

export class Metrics {
  readonly counters: MetricCounters = {
    shots: 0, hits: 0, deaths: 0, respawns: 0,
    playerJoins: 0, playerLeaves: 0, playerInputs: 0,
    playerMoves: 0, matchStarts: 0, matchEnds: 0, scoreUpdates: 0,
    reloads: 0, pickups: 0, shieldBlocks: 0,
  };

  readonly sync: Record<'full' | 'delta' | 'state', SyncTraffic> & { deltaFallbacks: number } = {
    full: { msgs: 0, bytes: 0 },
    delta: { msgs: 0, bytes: 0 },
    state: { msgs: 0, bytes: 0 },
    deltaFallbacks: 0,
  };

  /** One snapshot-type message sent to a connection using `model`. */
  recordSync(model: 'full' | 'delta' | 'state', payloadBytes: number): void {
    this.sync[model].msgs++;
    this.sync[model].bytes += payloadBytes + WIRE_OVERHEAD_BYTES;
  }

  private tickTimes: number[] = [];
  private lastWindowStart = Date.now();
  private windowTickCount = 0;
  private _perf: TickPerf = { targetHz: 60, achievedHz: 0, avgTickMs: 0, maxTickMs: 0, overruns: 0 };

  recordTick(processingMs: number): void {
    this.tickTimes.push(processingMs);
    this.windowTickCount++;
    const now = Date.now();
    if (now - this.lastWindowStart >= 1000) {
      const times = this.tickTimes;
      this._perf.achievedHz = this.windowTickCount;
      this._perf.avgTickMs = times.reduce((a, b) => a + b, 0) / (times.length || 1);
      this._perf.maxTickMs = Math.max(...times, 0);
      this.tickTimes = [];
      this.windowTickCount = 0;
      this.lastWindowStart = now;
    }
  }

  get perf(): TickPerf {
    return { ...this._perf };
  }
}
