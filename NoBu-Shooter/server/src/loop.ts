/**
 * loop.ts — fixed-timestep loop without busy-spinning (SPEC.md §9.1).
 *
 * OS timers are coarse on Windows (~15.6 ms per setTimeout/Atomics.wait,
 * measured), so a plain setTimeout loop ticks in bursts and a setImmediate
 * loop burns a whole CPU core. Hybrid: measure the timer granularity once,
 * sleep with setTimeout while the next tick is further away than one timer
 * quantum, and yield with setImmediate only for the final stretch.
 */

import { performance } from 'perf_hooks';

const MAX_CATCHUP_TICKS = 5;

/** Measure how long `setTimeout(cb, 1)` really sleeps (median of a few samples). */
async function measureTimerGranularityMs(): Promise<number> {
  const samples: number[] = [];
  for (let i = 0; i < 7; i++) {
    const t0 = performance.now();
    await new Promise<void>((r) => setTimeout(r, 1));
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

export interface LoopHandle {
  stop(): void;
  /** Ticks skipped because the loop fell more than 5 ticks behind. */
  readonly overruns: number;
}

export async function startFixedLoop(hz: number, onTick: () => void, onIdle?: () => void): Promise<LoopHandle> {
  const tickMs = 1000 / hz;
  const granularity = await measureTimerGranularityMs();
  // Sleep only when the deadline is beyond one timer quantum (Windows: ~15.7 ms
  // quantum vs 16.7 ms tick, so we sleep ~94 % of the time and spin ~1 ms).
  const sleepIfAboveMs = granularity + 0.25;

  let running = true;
  let overruns = 0;
  let next = performance.now() + tickMs;

  const loop = () => {
    if (!running) return;
    const now = performance.now();

    if (now >= next) {
      let ticks = 0;
      while (now >= next && ticks <= MAX_CATCHUP_TICKS) {
        onTick();
        next += tickMs;
        ticks++;
      }
      if (now >= next) {
        // Fell too far behind (e.g. process was paused): skip ahead.
        overruns++;
        next = now + tickMs;
      }
      onIdle?.();
    }

    const remaining = next - performance.now();
    if (remaining > sleepIfAboveMs) setTimeout(loop, Math.max(1, remaining - granularity));
    else setImmediate(loop);
  };
  setImmediate(loop);

  return {
    stop() { running = false; },
    get overruns() { return overruns; },
  };
}
