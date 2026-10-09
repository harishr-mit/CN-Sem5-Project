/**
 * netcode.test.ts — end-to-end netcode harness (SPEC.md §14.2).
 *
 * Runs the real GameServer, the real NetClient and the emulator Pipeline in
 * one process on fake timers with a seeded RNG. Nothing here re-implements
 * prediction or reconciliation, so a bug in NetClient or Room shows up.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GameServer } from '../server/src/core.js';
import { NetClient, type TransportFactory } from '../client/src/net/NetClient.js';
import { Pipeline, LinkState, DEFAULT_LINK_CONFIG, type LinkConfig, type Clock } from '../emulator/src/pipeline.js';
import { KEY } from '../shared/src/sim/movement.js';
import NET from '../shared/src/config/net.js';

const fakeClock: Clock = {
  now: () => Date.now(),
  setTimer: (ms, cb) => { setTimeout(cb, ms); },
};

interface Harness {
  server: GameServer;
  clients: NetClient[];
  corrections: number[];
  /** Advance one 60 Hz frame: clients step/send/render, server ticks, timers run. */
  frame(): void;
  run(frames: number, keysFor?: (frame: number, clientIndex: number) => number): void;
}

let frameNo = 0;

function makeHarness(link: Partial<LinkConfig>, clientCount = 1, seed = 7): Harness {
  const server = new GameServer(() => Date.now());
  const clients: NetClient[] = [];
  const corrections: number[] = [];

  for (let i = 0; i < clientCount; i++) {
    const pipeline = new Pipeline(seed + i, fakeClock);
    const up = new LinkState({ ...DEFAULT_LINK_CONFIG, ...link });
    const down = new LinkState({ ...DEFAULT_LINK_CONFIG, ...link });

    // In-process transport routed through the emulator pipeline both ways
    const transport: TransportFactory = (_url, h) => {
      const conn = server.addConnection(
        (text) => pipeline.process({ data: text, size: text.length + 28 }, down,
          (p) => h.onMessage(p.data), () => {}, 's', 'down'),
        () => h.onClose(),
      );
      setTimeout(() => h.onOpen(), 0);
      return {
        send: (text) => pipeline.process({ data: text, size: text.length + 28 }, up,
          (p) => server.handleMessage(conn, p.data), () => {}, 's', 'up'),
        close: () => server.removeConnection(conn),
      };
    };

    const client = new NetClient({
      url: 'ws://harness', name: `T${i}`, room: 'lab', transport, now: () => Date.now(),
    });
    client.on('correction', (ev) => corrections.push(ev.errorPx));
    client.connect();
    clients.push(client);
  }

  const h: Harness = {
    server, clients, corrections,
    frame() {
      for (const c of clients) c.simStep();
      if (frameNo % 2 === 0) for (const c of clients) c.sendInputs(); // 30 Hz
      server.tick();
      for (const c of clients) {
        c.getInterpolatedState();
        c.framePresented(1000 / 60);
      }
      // 16, 17, 17 ms … keeps timers on whole milliseconds, averages 60 Hz
      vi.advanceTimersByTime(frameNo % 3 === 0 ? 16 : 17);
      frameNo++;
    },
    run(frames, keysFor) {
      for (let f = 0; f < frames; f++) {
        clients.forEach((c, i) => { c.keys = keysFor ? keysFor(f, i) : 0; });
        h.frame();
      }
    },
  };

  // Connect and let the welcome + first snapshots arrive (keys idle)
  h.run(90);
  for (const c of clients) expect(c.isConnected).toBe(true);
  return h;
}

/** 6 s of scripted movement with wall and corner contact, then stop. */
function scriptedKeys(f: number): number {
  const phase = Math.floor(f / 45) % 8;
  return [
    KEY.RIGHT, KEY.DOWN, KEY.LEFT, KEY.UP,
    KEY.RIGHT | KEY.DOWN, KEY.LEFT | KEY.UP, KEY.UP, KEY.LEFT | KEY.DOWN,
  ][phase];
}

/** Move for 6 s, then idle 2 s so every input is acked; return final error. */
function moveThenSettle(h: Harness): number {
  h.run(360, scriptedKeys);
  h.run(120);
  const c = h.clients[0];
  return Math.hypot(c.predicted.x - c.authX, c.predicted.y - c.authY);
}

describe('Netcode harness: prediction + reconciliation through the emulator (SPEC.md §14.2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    frameNo = 0;
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('baseline: zero corrections and zero error (every input reaches the server)', () => {
    const h = makeHarness({});
    const err = moveThenSettle(h);
    expect(h.corrections.length).toBe(0);
    expect(err).toBe(0);
  });

  it('100 ms latency + 50 ms jitter (no jitter reordering): zero corrections', () => {
    const h = makeHarness({ latencyMs: 100, jitterMs: 50 });
    const err = moveThenSettle(h);
    expect(h.corrections.length).toBe(0);
    expect(err).toBe(0);
  });

  it('10 % loss, redundancy off: corrections happen and converge', () => {
    const h = makeHarness({ lossPct: 10 });
    const err = moveThenSettle(h);
    expect(h.corrections.length).toBeGreaterThan(0);
    expect(err).toBeLessThanOrEqual(NET.reconcile.epsilonPx);
  });

  it('10 % loss, redundancy on: far fewer corrections than with it off', () => {
    const off = makeHarness({ lossPct: 10 });
    moveThenSettle(off);
    const offCount = off.corrections.length;

    frameNo = 0;
    const on = makeHarness({ lossPct: 10 });
    on.clients[0].toggles.redundancy = true;
    const err = moveThenSettle(on);
    expect(on.corrections.length).toBeLessThan(Math.max(1, offCount / 4));
    expect(err).toBeLessThanOrEqual(NET.reconcile.epsilonPx);
  });

  it('20 % duplication, redundancy off: no double movement, zero corrections', () => {
    const h = makeHarness({ duplicatePct: 20 });
    moveThenSettle(h);
    expect(h.corrections.length).toBe(0);
  });

  // A reordered input packet only hurts if it arrives after a *newer* input was
  // already consumed. With a short reorder delay (< send interval + one tick
  // ≈ 50 ms) the server's sorted queue absorbs it, like jitter; longer delays
  // act as loss. The emulator default (80 ms) is chosen so the effect shows.
  it('20 % reordering (80 ms): acts as loss with redundancy off (converges), harmless with it on', () => {
    const off = makeHarness({ reorderPct: 20, reorderDelayMs: 80 });
    expect(moveThenSettle(off)).toBeLessThanOrEqual(NET.reconcile.epsilonPx);
    expect(off.corrections.length).toBeGreaterThan(0);

    frameNo = 0;
    const on = makeHarness({ reorderPct: 20, reorderDelayMs: 80 });
    on.clients[0].toggles.redundancy = true;
    moveThenSettle(on);
    expect(on.corrections.length).toBe(0);
  });

  it('20 % reordering with a short (20 ms) delay is absorbed by the sorted input queue', () => {
    const h = makeHarness({ reorderPct: 20, reorderDelayMs: 20 });
    moveThenSettle(h);
    expect(h.corrections.length).toBe(0);
  });
});

describe('Netcode harness: interpolation and latency metrics (SPEC.md §10.5, §12)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    frameNo = 0;
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('remote players are drawn ~interpDelay behind the latest snapshot, between snapshots', () => {
    const h = makeHarness({ latencyMs: 40, jitterMs: 10 }, 2);
    const [viewer, mover] = h.clients;
    // Put the mover in open space (y = 460 has no obstacles for x 400..800)
    // and bump `life` so its client treats it as a teleport, not a correction.
    const room = h.server.rooms.get('lab') as unknown as {
      state: { players: Map<number, { x: number; y: number; life: number }> };
    };
    const mp = room.state.players.get(mover.myPlayerId!)!;
    mp.x = 400; mp.y = 460; mp.life++;
    h.run(10);
    // Mover walks right for 1.5 s, viewer stands still
    h.run(90, (_f, i) => (i === 1 ? KEY.RIGHT : 0));

    const latest = viewer.latestSnapshot!.players.find(p => p.id === mover.myPlayerId)!;
    const drawn = viewer.getInterpolatedState().players.find(p => p.id === mover.myPlayerId)!;
    const lagPx = latest.x - drawn.x;
    // 200 px/s × ~100 ms interpolation delay ≈ 20 px (allow for jitter/clock EMA)
    expect(lagPx).toBeGreaterThan(8);
    expect(lagPx).toBeLessThan(40);
  });

  it('Input → Screen: ~1 frame with prediction, ≈ ack delay + interp delay without', () => {
    const h = makeHarness({ latencyMs: 50 }, 2);
    const [predicted, serverOnly] = h.clients;
    serverOnly.toggles.prediction = false;
    h.run(180, () => KEY.RIGHT);
    vi.advanceTimersByTime(250); // let the 5 Hz metrics tick

    expect(predicted.metrics.inputToScreenMs).toBeGreaterThan(0);
    expect(predicted.metrics.inputToScreenMs).toBeLessThan(40);
    // ack delay ≥ RTT (100 ms); + 100 ms interpolation + a frame
    expect(serverOnly.metrics.ackDelayMs).toBeGreaterThanOrEqual(100);
    expect(serverOnly.metrics.inputToScreenMs).toBeGreaterThan(200);
  });
});
