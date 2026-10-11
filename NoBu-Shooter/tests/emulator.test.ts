import { describe, it, expect } from 'vitest';
import { Pipeline, LinkState, DEFAULT_LINK_CONFIG, type Clock, type Packet } from '../emulator/src/pipeline.js';
import { completeConfig } from '../emulator/src/control.js';

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
      lossPct: 10,
      lossModel: 'random',
    });

    let droppedCount = 0;
    const dummyPacket: Packet = { data: '{"t":"ping"}', size: 40 };

    for (let i = 0; i < 10000; i++) {
      pipeline.process(
        dummyPacket,
        link,
        () => {},
        (ev) => {
          if (ev.fate === 'dropped-loss') droppedCount++;
        },
        'test-session',
        'up'
      );
      clock.advance(1);
    }

    const lossRate = (droppedCount / 10000) * 100;
    expect(lossRate).toBeGreaterThan(8.5);
    expect(lossRate).toBeLessThan(11.5);
  });

  it('measures duplication rate within ±1.5% of configured rate', () => {
    const clock = new VirtualClock();
    const pipeline = new Pipeline(54321, clock);
    const link = new LinkState({
      ...DEFAULT_LINK_CONFIG,
      duplicatePct: 5,
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
      clock.advance(5);
    }

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
      bandwidthKbps: 80,
      queueLimitMs: 200,
    });

    let queueDrops = 0;
    const largePacket: Packet = { data: 'x'.repeat(1000), size: 1028 };

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

    expect(queueDrops).toBeGreaterThan(0);
  });
});

describe('Emulator control: ad-hoc presets (preset + config)', () => {
  it('complete a partial config from the defaults and ignore bad keys', () => {
    const cfg = completeConfig({ latencyMs: 50, jitterMs: 30, lossModel: 7, bogus: 1 });
    expect(cfg).toEqual({ ...DEFAULT_LINK_CONFIG, latencyMs: 50, jitterMs: 30 });
    expect(completeConfig(null)).toEqual(DEFAULT_LINK_CONFIG);
  });
});

describe('Emulator: queue depth and reorder marks (PHASES.md P5, docs/PHASE4_PLAN.md test 5)', () => {
  const pkt = (i: number, size = 528): Packet => ({ data: `pkt_${i}`, size });

  it('queueMs grows while the offered load exceeds the cap, then drains to 0', () => {
    const clock = new VirtualClock();
    const pipeline = new Pipeline(42, clock);
    // 400 kbps = 50 B/ms; 528 B every 5 ms = 105 B/ms offered → the queue builds
    const link = new LinkState({ ...DEFAULT_LINK_CONFIG, bandwidthKbps: 400, queueLimitMs: 400 });
    expect(link.getStats(clock.now()).queueMs).toBe(0);

    const depth: number[] = [];
    for (let i = 0; i < 40; i++) {
      pipeline.process(pkt(i), link, () => {}, () => {}, 's', 'down');
      clock.advance(5);
      depth.push(link.getStats(clock.now()).queueMs);
    }
    expect(depth[39]).toBeGreaterThan(depth[5]);
    expect(depth[39]).toBeGreaterThan(100);
    expect(depth[39]).toBeLessThanOrEqual(400 + 11); // never deeper than the limit + one packet

    // Stop sending: the queue drains at the link rate
    clock.advance(depth[39] / 2);
    const half = link.getStats(clock.now()).queueMs;
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(depth[39]);
    clock.advance(depth[39]);
    expect(link.getStats(clock.now()).queueMs).toBe(0);
  });

  it('without a bandwidth cap the queue is always 0', () => {
    const clock = new VirtualClock();
    const pipeline = new Pipeline(1, clock);
    const link = new LinkState({ ...DEFAULT_LINK_CONFIG, latencyMs: 100 });
    for (let i = 0; i < 50; i++) { pipeline.process(pkt(i), link, () => {}, () => {}, 's', 'up'); clock.advance(1); }
    expect(link.getStats(clock.now()).queueMs).toBe(0);
  });

  it('marks reordered deliveries, and those arrive after packets sent later', () => {
    const clock = new VirtualClock();
    const pipeline = new Pipeline(7, clock);
    const link = new LinkState({ ...DEFAULT_LINK_CONFIG, latencyMs: 20, reorderPct: 20, reorderDelayMs: 80 });
    const arrived: number[] = [];
    const reorderedIds = new Set<number>();
    let otherFlags = 0;
    for (let i = 0; i < 300; i++) {
      pipeline.process(pkt(i), link,
        (p) => arrived.push(Number(p.data.slice(4))),
        (ev) => {
          if (ev.reordered) {
            expect(ev.fate).toBe('delivered');
            reorderedIds.add(arrived[arrived.length - 1]);
          } else if ('reordered' in ev) otherFlags++;
        },
        's', 'up');
      clock.advance(10);
    }
    clock.advance(1000);
    expect(arrived).toHaveLength(300);
    expect(otherFlags).toBe(0); // the field is absent, not false, on normal packets
    expect(reorderedIds.size).toBeGreaterThan(30);
    expect(reorderedIds.size).toBeLessThan(90);
    // Every reordered packet was overtaken: something sent after it arrived before it
    for (const id of reorderedIds) {
      const at = arrived.indexOf(id);
      expect(arrived.slice(0, at).some((x) => x > id), `packet ${id}`).toBe(true);
    }
  });

  it('existing behaviour unchanged: no reorder → no marks, strict order', () => {
    const clock = new VirtualClock();
    const pipeline = new Pipeline(3, clock);
    const link = new LinkState({ ...DEFAULT_LINK_CONFIG, latencyMs: 30, jitterMs: 10 });
    let marks = 0;
    const arrived: number[] = [];
    for (let i = 0; i < 100; i++) {
      pipeline.process(pkt(i), link, (p) => arrived.push(Number(p.data.slice(4))), (ev) => { if (ev.reordered) marks++; }, 's', 'down');
      clock.advance(4);
    }
    clock.advance(1000);
    expect(marks).toBe(0);
    expect(arrived).toEqual([...Array(100).keys()]);
  });
});
