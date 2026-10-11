/**
 * pipeline.ts — game-agnostic network impairment pipeline.
 * SPEC.md §11.2.
 *
 * Works on opaque Packet objects and an injected Clock. The WS and UDP route
 * adapters (routes/) feed it bytes; it never looks inside a payload except to
 * build a short preview for the packet log.
 */

import { mulberry32 } from './prng.js';

export interface Packet {
  /** Opaque payload: bytes from the route adapters, or text (tests, in-process harness). */
  data: Buffer | string;
  /** Wire bytes (payload + 28 to simulate the UDP/IP header). */
  size: number;
  /** WS only: the frame was binary (forwarded as binary again). */
  binary?: boolean;
}

const PREVIEW_CHARS = 64;

/**
 * Packet-log preview: text as is (first 64 chars); bytes as text when they are
 * printable ASCII, otherwise as hex ("hex 0a ff …").
 */
export function previewOf(data: Buffer | string): string {
  if (typeof data === 'string') return data.slice(0, PREVIEW_CHARS);
  const head = data.subarray(0, PREVIEW_CHARS);
  let printable = true;
  for (const b of head) {
    if (!((b >= 0x20 && b <= 0x7e) || b === 0x09 || b === 0x0a || b === 0x0d)) { printable = false; break; }
  }
  if (printable) return head.toString('latin1');
  const hex = [...data.subarray(0, 20)].map((b) => b.toString(16).padStart(2, '0')).join(' ');
  return `hex ${hex}${data.length > 20 ? ' …' : ''}`;
}

export interface LinkConfig {
  latencyMs: number;
  jitterMs: number;
  jitterDist: 'normal' | 'uniform';
  lossPct: number;
  lossModel: 'random' | 'burst';
  burstLen: number;
  duplicatePct: number;
  reorderPct: number;
  reorderDelayMs: number;
  bandwidthKbps: number;
  queueLimitMs: number;
  allowJitterReorder: boolean;
}

export const DEFAULT_LINK_CONFIG: LinkConfig = {
  latencyMs: 0,
  jitterMs: 0,
  jitterDist: 'normal',
  lossPct: 0,
  lossModel: 'random',
  burstLen: 4,
  duplicatePct: 0,
  reorderPct: 0,
  // Must exceed the input send interval + one tick (~50 ms) for a reordered
  // input packet to arrive after newer inputs were consumed (see netcode tests).
  reorderDelayMs: 80,
  bandwidthKbps: 0,
  queueLimitMs: 400,
  allowJitterReorder: false,
};

export type PacketFate = 'delivered' | 'dropped-loss' | 'dropped-queue' | 'duplicated';

export interface PacketEvent {
  sid: string;
  dir: 'up' | 'down';
  size: number;
  preview: string;
  fate: PacketFate;
  delayMs: number;
  t: number;
  /** Delivered late on purpose by the reorder stage (later packets overtake it). */
  reordered?: true;
}

export interface Clock {
  now(): number;
  setTimer(delayMs: number, cb: () => void): void;
}

/** Real wall-clock. */
export const wallClock: Clock = {
  now: () => Date.now(),
  setTimer: (ms, cb) => setTimeout(cb, ms),
};

/** Sample from approximately normal dist using Box-Muller. */
function sampleNormal(rng: () => number, sigma: number): number {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Per-direction link state. */
export class LinkState {
  config: LinkConfig;
  /** FIFO bandwidth: time when the link becomes free again. */
  freeAt = 0;
  /** Last release time for anti-reorder. */
  lastRelease = 0;
  /** Burst loss state (Gilbert-Elliott). */
  burstBad = false;

  // Stats
  pktsIn = 0;
  pktsDelivered = 0;
  pktsDroppedLoss = 0;
  pktsDroppedQueue = 0;
  pktsDuplicated = 0;
  pktsReordered = 0;
  bytesIn = 0;
  bytesDelivered = 0;
  /** Highest delivery index seen so far. */
  private deliveryIndex = 0;
  private deliveryCounter = 0;
  /** Rolling window: { t, bytes, delivered, dropped } */
  private window: { t: number; bytes: number; delivered: number; dropped: number }[] = [];
  private windowMs = 1000;

  constructor(cfg: LinkConfig) {
    this.config = { ...cfg };
  }

  private tick(now: number): void {
    const cutoff = now - this.windowMs;
    this.window = this.window.filter(e => e.t >= cutoff);
  }

  getStats(now: number) {
    this.tick(now);
    const w = this.window;
    const bytesW = w.reduce((a, e) => a + e.bytes, 0);
    const deliveredW = w.reduce((a, e) => a + e.delivered, 0);
    const droppedW = w.reduce((a, e) => a + e.dropped, 0);
    return {
      pktsIn: this.pktsIn,
      pktsDelivered: this.pktsDelivered,
      pktsDroppedLoss: this.pktsDroppedLoss,
      pktsDroppedQueue: this.pktsDroppedQueue,
      pktsDuplicated: this.pktsDuplicated,
      pktsReordered: this.pktsReordered,
      throughputKbps: Math.round(bytesW * 8 / this.windowMs),
      /** Cumulative loss % (loss + queue drops) since the session started. */
      lossPct: this.pktsIn > 0
        ? Math.round((this.pktsDroppedLoss + this.pktsDroppedQueue) / this.pktsIn * 1000) / 10
        : 0,
      /** Loss % over the last second (SPEC.md §11.3 rolling window). */
      lossPctWindow: w.length > 0 ? Math.round(droppedW / w.length * 1000) / 10 : 0,
      /**
       * Queue depth: how long a packet arriving now would wait for the
       * bandwidth cap before it starts transmitting (0 without a cap).
       */
      queueMs: Math.max(0, Math.round(this.freeAt - now)),
      pktsInWindow: w.length,
      deliveredWindow: deliveredW,
    };
  }

  recordIn(size: number, now: number): void {
    this.pktsIn++;
    this.bytesIn += size;
    this.window.push({ t: now, bytes: size, delivered: 0, dropped: 0 });
  }

  recordDropped(): void {
    const last = this.window[this.window.length - 1];
    if (last) last.dropped++;
  }

  recordDelivered(size: number, now: number): void {
    this.pktsDelivered++;
    this.bytesDelivered += size;
    const last = this.window[this.window.length - 1];
    if (last) last.delivered++;

    // Reorder detection
    this.deliveryCounter++;
    if (this.deliveryCounter < this.deliveryIndex) {
      this.pktsReordered++;
    } else {
      this.deliveryIndex = this.deliveryCounter;
    }
  }
}

export class Pipeline {
  private rng: () => number;
  private clock: Clock;

  constructor(seed: number, clock: Clock = wallClock) {
    this.rng = mulberry32(seed);
    this.clock = clock;
  }

  reseed(seed: number): void {
    this.rng = mulberry32(seed);
  }

  /**
   * Process a packet through the impairment pipeline.
   * Calls `deliver` at the scheduled time (or never, if dropped).
   * Returns the PacketEvent(s) emitted.
   */
  process(
    packet: Packet,
    link: LinkState,
    deliver: (pkt: Packet) => void,
    onEvent: (ev: PacketEvent) => void,
    sid: string,
    dir: 'up' | 'down'
  ): void {
    const now = this.clock.now();
    link.recordIn(packet.size, now);

    const preview = previewOf(packet.data);

    const emitEvent = (fate: PacketFate, delayMs: number, reordered = false) => {
      onEvent({ sid, dir, size: packet.size, preview, fate, delayMs, t: now, ...(reordered ? { reordered: true as const } : {}) });
    };

    // ── 1. LOSS ───────────────────────────────────────────────
    const cfg = link.config;
    let dropped = false;
    if (cfg.lossPct > 0) {
      if (cfg.lossModel === 'burst') {
        // Gilbert-Elliott two-state
        const p = cfg.lossPct / 100;
        const pBG = 1 / cfg.burstLen;
        const pGB = p * pBG / (1 - p);
        if (link.burstBad) {
          dropped = true;
          if (this.rng() < pBG) link.burstBad = false;
        } else {
          if (this.rng() < pGB) { link.burstBad = true; dropped = true; }
        }
      } else {
        dropped = this.rng() * 100 < cfg.lossPct;
      }
    }
    if (dropped) {
      link.pktsDroppedLoss++;
      link.recordDropped();
      emitEvent('dropped-loss', 0);
      return;
    }

    // ── 2. DUPLICATE ──────────────────────────────────────────
    const copies: Packet[] = [packet];
    if (cfg.duplicatePct > 0 && this.rng() * 100 < cfg.duplicatePct) {
      copies.push({ ...packet });
      link.pktsDuplicated++;
      emitEvent('duplicated', 0);
    }

    for (const copy of copies) {
      this.processCopy(copy, link, deliver, emitEvent, now, cfg);
    }
  }

  private processCopy(
    packet: Packet,
    link: LinkState,
    deliver: (pkt: Packet) => void,
    emitEvent: (fate: PacketFate, delayMs: number, reordered?: boolean) => void,
    now: number,
    cfg: LinkConfig
  ): void {
    // ── 3. BANDWIDTH ──────────────────────────────────────────
    let depart = now;
    if (cfg.bandwidthKbps > 0) {
      const start = Math.max(now, link.freeAt);
      const transmitMs = (packet.size * 8) / (cfg.bandwidthKbps * 1000) * 1000;
      const queueDelay = start - now;
      if (queueDelay > cfg.queueLimitMs) {
        link.pktsDroppedQueue++;
        link.recordDropped();
        emitEvent('dropped-queue', Math.round(queueDelay));
        return;
      }
      depart = start + transmitMs;
      link.freeAt = depart;
    }

    // ── 4. DELAY ─────────────────────────────────────────────
    let jitter = 0;
    if (cfg.jitterMs > 0) {
      jitter = cfg.jitterDist === 'normal'
        ? sampleNormal(this.rng, cfg.jitterMs)
        : (this.rng() * 2 - 1) * cfg.jitterMs;
    }
    const delayMs = Math.max(0, cfg.latencyMs + jitter);
    let release = depart + delayMs;

    // ── 5. ORDERING ───────────────────────────────────────────
    const isReorder = cfg.reorderPct > 0 && this.rng() * 100 < cfg.reorderPct;
    if (isReorder) {
      release += cfg.reorderDelayMs;
    } else if (!cfg.allowJitterReorder) {
      release = Math.max(release, link.lastRelease);
      link.lastRelease = release;
    }

    // ── 6. SCHEDULE ───────────────────────────────────────────
    const schedDelay = Math.max(0, release - now);
    const totalDelay = Math.round(release - now);

    link.recordDelivered(packet.size, now + schedDelay);

    this.clock.setTimer(schedDelay, () => {
      deliver(packet);
      emitEvent('delivered', totalDelay, isReorder);
    });
  }
}
