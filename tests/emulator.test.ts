import { describe, it, expect } from 'vitest';
import { Pipeline, LinkState, DEFAULT_LINK_CONFIG, type Clock, type Packet } from '../emulator/src/pipeline.js';

class VirtualClock implements Clock {
  currentTime = 1000;
  timers: { at: number; cb: () => void }[] = [];

  now(): number {
    return this.currentTime;
  }

  setTimer(delayMs: number, cb: () => void): void {
    this.timers.push({ at: this.currentTime + delayMs, cb });
    this.timers.sort((a, b) => a.at - b.at);
  }

  advance(ms: number): void {
    const target = this.currentTime + ms;
    while (this.timers.length > 0 && this.timers[0].at <= target) {
      const next = this.timers.shift()!;
      this.currentTime = next.at;
      next.cb();
    }
    this.currentTime = target;
  }
}

describe('Network Emulator Pipeline (SPEC.md §11, §14.3)', () => {
  it('measures packet loss within ±1.5% of configured rate over 10,000 packets', () => {
    const clock = new VirtualClock();
    const pipeline = new Pipeline(12345, clock);
    const link = new LinkState({
      ...DEFAULT_LINK_CONFIG,
      lossPct: 10, // 10%
      lossModel: 'random',
    });

    let deliveredCount = 0;
    let droppedCount = 0;

    const dummyPacket: Packet = { data: '{"t":"ping"}', size: 40 };

    for (let i = 0; i < 10000; i++) {
      pipeline.process(
        dummyPacket,
        link,
        () => { deliveredCount++; },
        (ev) => {
          if (ev.fate === 'dropped-loss') droppedCount++;
        },
        'test-session',
        'up'
      );
      clock.advance(1);
    }

    const lossRate = (droppedCount / 10000) * 100;
    // Assert 10% ± 1.5%
    expect(lossRate).toBeGreaterThan(8.5);
    expect(lossRate).toBeLessThan(11.5);
  });

  it('measures duplication rate within ±1.5% of configured rate', () => {
    const clock = new VirtualClock();
    const pipeline = new Pipeline(54321, clock);
    const link = new LinkState({
      ...DEFAULT_LINK_CONFIG,
      duplicatePct: 5, // 5%
    });

    let duplicatedFates = 0;
    const dummyPacket: Packet = { data: '{"t":"ping"}', size: 40 };

    for (let i = 0; i < 10000; i++) {
      pipeline.process(
        dummyPacket,
        link,
        () => {},
        (ev) => {
          if (ev.fate === 'duplicated') duplicatedFates++;
        },
        'test-session',
        'up'
      );
      clock.advance(1);
    }

    const dupRate = (duplicatedFates / 10000) * 100;
    expect(dupRate).toBeGreaterThan(3.5);
    expect(dupRate).toBeLessThan(6.5);
  });

  it('strictly preserves packet ordering when reorderPct = 0 and allowJitterReorder = false', () => {
    const clock = new VirtualClock();
    const pipeline = new Pipeline(999, clock);
    const link = new LinkState({
      ...DEFAULT_LINK_CONFIG,
      latencyMs: 50,
      jitterMs: 25,
      reorderPct: 0,
      allowJitterReorder: false,
    });

    const receivedOrder: number[] = [];

    for (let i = 0; i < 200; i++) {
      const idx = i;
      pipeline.process(
        { data: `pkt_${idx}`, size: 30 },
        link,
        (pkt) => {
          receivedOrder.push(parseInt(pkt.data.replace('pkt_', ''), 10));
        },
        () => {},
        'session-1',
        'up'
      );
      clock.advance(5); // 5ms between packets
    }

    // Flush all pending timers
    clock.advance(5000);

    expect(receivedOrder).toHaveLength(200);
    for (let i = 0; i < receivedOrder.length; i++) {
      expect(receivedOrder[i]).toBe(i);
    }
  });

  it('enforces bandwidth queue delay and tail drops beyond queueLimitMs', () => {
    const clock = new VirtualClock();
    const pipeline = new Pipeline(777, clock);
    const link = new LinkState({
      ...DEFAULT_LINK_CONFIG,
      bandwidthKbps: 80, // 10 KB/s = 10 bytes/ms
      queueLimitMs: 200,
    });

    let queueDrops = 0;
    const largePacket: Packet = { data: 'x'.repeat(1000), size: 1028 }; // ~1028 bytes takes ~102ms to transmit

    // Fire 5 large packets instantaneously
    for (let i = 0; i < 5; i++) {
      pipeline.process(
        largePacket,
        link,
        () => {},
        (ev) => {
          if (ev.fate === 'dropped-queue') queueDrops++;
        },
        'session-bw',
        'up'
      );
    }

    // Packet 1: 0ms queue
    // Packet 2: ~103ms queue
    // Packet 3: ~206ms queue (> 200ms queueLimitMs -> dropped-queue!)
    expect(queueDrops).toBeGreaterThan(0);
  });
});
