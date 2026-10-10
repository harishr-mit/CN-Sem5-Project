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
import { MOVER_PATTERNS } from '../shared/src/sim/movers.js';
import NET from '../shared/src/config/net.js';
import type { SyncSpec } from '../shared/src/sync/types.js';
import type { MsgSnap } from '../shared/src/protocol/messages.js';

const fakeClock: Clock = {
  now: () => Date.now(),
  setTimer: (ms, cb) => { setTimeout(cb, ms); },
};

interface Harness {
  server: GameServer;
  clients: NetClient[];
  /** Wire bytes (payload + 28) each client received, since connect. */
  bytesDown: number[];
  /** Direct (unimpaired) spectator connection, when requested. */
  spectator: NetClient | null;
  corrections: number[];
  /** Advance one 60 Hz frame: clients step/send/render, server ticks, timers run. */
  frame(): void;
  run(frames: number, keysFor?: (frame: number, clientIndex: number) => number): void;
}

let frameNo = 0;

function makeHarness(
  link: Partial<LinkConfig>, clientCount = 1, seed = 7,
  opts: { spectator?: boolean; room?: 'main' | 'lab'; noBots?: boolean; syncs?: SyncSpec[] } = {},
): Harness {
  const server = new GameServer(() => Date.now());
  // Main room without bots: two harness clients start a match on their own
  if (opts.noBots) (server.getRoom('main') as unknown as { roomCfg: { bots: boolean } }).roomCfg.bots = false;
  const clients: NetClient[] = [];
  const corrections: number[] = [];
  const bytesDown: number[] = [];

  let spectator: NetClient | null = null;
  if (opts.spectator) {
    // Direct to the server, like the Compare reference pane (no emulator)
    const direct: TransportFactory = (_url, h) => {
      const conn = server.addConnection((text) => h.onMessage(text), () => h.onClose());
      setTimeout(() => h.onOpen(), 0);
      return { send: (text) => server.handleMessage(conn, text), close: () => server.removeConnection(conn) };
    };
    spectator = new NetClient({ url: 'ws://direct', name: 'REF', room: 'lab', transport: direct, now: () => Date.now(), spectate: true });
    spectator.connect();
  }

  for (let i = 0; i < clientCount; i++) {
    const pipeline = new Pipeline(seed + i, fakeClock);
    const up = new LinkState({ ...DEFAULT_LINK_CONFIG, ...link });
    const down = new LinkState({ ...DEFAULT_LINK_CONFIG, ...link });

    // In-process transport routed through the emulator pipeline both ways
    bytesDown.push(0);
    const transport: TransportFactory = (_url, h) => {
      const conn = server.addConnection(
        (text) => pipeline.process({ data: text, size: text.length + 28 }, down,
          (p) => { bytesDown[i] += p.data.length + 28; h.onMessage(p.data); }, () => {}, 's', 'down'),
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
      url: 'ws://harness', name: `T${i}`, room: opts.room ?? 'lab', transport, now: () => Date.now(),
      ...(opts.syncs?.[i] ? { sync: opts.syncs[i] } : {}),
    });
    client.on('correction', (ev) => corrections.push(ev.errorPx));
    client.connect();
    clients.push(client);
  }

  const h: Harness = {
    server, clients, corrections, spectator, bytesDown,
    frame() {
      for (const c of clients) c.simStep();
      if (frameNo % 2 === 0) for (const c of clients) c.sendInputs(); // 30 Hz
      server.tick();
      for (const c of spectator ? [...clients, spectator] : clients) {
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
  if (spectator) expect(spectator.isConnected).toBe(true);
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

describe('Netcode harness: Compare panes are twins (same lab spawn, same keys)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    frameNo = 0;
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** Pane A = all netcode off, pane B = all on; both get the same keys every frame. */
  function twinsEndTogether(link: Partial<LinkConfig>): { a: { x: number; y: number }; b: { x: number; y: number } } {
    const h = makeHarness(link, 2);
    const [a, b] = h.clients;
    a.toggles = { ...a.toggles, prediction: false, reconciliation: false, interpolation: false, ghost: false };
    for (const c of h.clients) c.toggles.redundancy = true;
    const room = h.server.rooms.get('lab') as unknown as {
      state: { players: Map<number, { x: number; y: number }> };
    };
    const pos = (c: NetClient) => {
      const p = room.state.players.get(c.myPlayerId!)!;
      return { x: p.x, y: p.y };
    };
    expect(pos(a)).toEqual(pos(b)); // same lab spawn
    h.run(360, (f) => scriptedKeys(f));
    h.run(120);
    return { a: pos(a), b: pos(b) };
  }

  it('same keys from the same spawn give identical server paths (60 ms ± 20 ms)', () => {
    const { a, b } = twinsEndTogether({ latencyMs: 60, jitterMs: 20 });
    expect(a).toEqual(b);
  });

  // Without redundancy each link drops different inputs and the twins drift
  // apart: that is what the Redundancy comparison preset shows.
  it('stay identical under 10 % loss with input redundancy on', () => {
    const { a, b } = twinsEndTogether({ lossPct: 10 });
    expect(a).toEqual(b);
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

describe('Netcode harness: spectator reference and mover metrics (PHASES.md C2, C4)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    frameNo = 0;
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** Harness with movers on and every client measuring against the spectator's clock. */
  function moverHarness(link: Partial<LinkConfig>, clientCount: number): Harness {
    const h = makeHarness(link, clientCount, 7, { spectator: true });
    const ref = h.spectator!;
    for (const c of h.clients) c.setTruthClock(() => ref.serverNow());
    ref.setMovers([...MOVER_PATTERNS]);
    h.run(30);
    return h;
  }

  it('the spectator adds no player and draws exactly the server positions', () => {
    const h = makeHarness({ latencyMs: 30 }, 1, 7, { spectator: true });
    const ref = h.spectator!;
    ref.toggles.interpolation = false;
    ref.setMovers([...MOVER_PATTERNS]);
    const lab = h.server.rooms.get('lab')!;
    expect(lab.playerCount).toBe(1);
    expect(ref.myPlayerId).toBeNull();

    h.run(60, () => KEY.RIGHT);
    // Stop on a frame whose server tick sent a snapshot
    while (ref.latestSnapshot!.tick !== lab.buildSnapshot(null).tick) h.frame();
    const truth = lab.buildSnapshot(null).players.map(({ id, x, y }) => ({ id, x, y }));
    const drawn = ref.getInterpolatedState().players.map(({ id, x, y }) => ({ id, x, y }));
    expect(truth).toHaveLength(5); // 1 player + 4 movers
    expect(drawn).toEqual(truth);
    expect(ref.pendingCount).toBe(0); // never sends input
  });

  it('clean link: interpolation draws movers ~interpDelay behind, smoothly; without it they freeze every other frame', () => {
    const h = moverHarness({}, 2);
    const [on, off] = h.clients;
    off.toggles.interpolation = false;
    h.run(300);
    const a = on.metrics;
    const b = off.metrics;
    expect(a.moverSamples).toBeGreaterThan(100);
    expect(b.moverSamples).toBeGreaterThan(100);

    expect(a.moverLagMs).toBeGreaterThan(NET.interpDelayMs - 15);
    expect(a.moverLagMs).toBeLessThan(NET.interpDelayMs + 15);
    expect(a.moverFrozenPct).toBeLessThan(5);
    expect(a.moverErrorPx).toBeGreaterThan(10); // ≈ 100 ms × 200 px/s, a little less around stops
    expect(a.moverErrorPx).toBeLessThan(26);

    expect(b.moverLagMs).toBeLessThan(30); // newest snapshot: 0–33 ms old
    expect(b.moverFrozenPct).toBeGreaterThanOrEqual(40); // 30 Hz snapshots, 60 Hz frames
    expect(b.moverFrozenPct).toBeLessThanOrEqual(60);
  });

  it('50 ms ± 30 ms jitter: interpolation trades a larger, steady lag for no freezing (demo checkpoint)', () => {
    const h = moverHarness({ latencyMs: 50, jitterMs: 30 }, 2);
    const [on, off] = h.clients;
    off.toggles.interpolation = false;
    h.run(300);
    const a = on.metrics;
    const b = off.metrics;
    expect(a.moverSamples).toBeGreaterThan(100);
    expect(b.moverSamples).toBeGreaterThan(50);

    expect(a.moverLagMs).toBeGreaterThan(b.moverLagMs); // the price of smoothness
    expect(b.moverWobbleMs).toBeGreaterThan(2 * a.moverWobbleMs);
    expect(b.moverFrozenPct).toBeGreaterThanOrEqual(a.moverFrozenPct + 30);
  });
});

describe('Netcode harness: weapon prediction (GAMERULES.md §6a)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    frameNo = 0;
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** Fire for 10 s (with a manual reload half way), idle 2 s; client 0 only. */
  function shootThenSettle(h: Harness) {
    for (let f = 0; f < 300 && h.clients[0].latestSnapshot?.match.state !== 'RUNNING'; f++) h.frame();
    expect(h.clients[0].latestSnapshot?.match.state).toBe('RUNNING');
    h.run(90); // spawn protection, first snapshots of the match
    const c = h.clients[0];
    c.aimAngle = Math.PI / 2;
    let shots = 0;
    const off = c.on('fire', () => { shots++; });
    for (let f = 0; f < 600; f++) {
      c.fireDown = f < 560;
      if (f === 280) c.requestReload();
      h.frame();
    }
    c.fireDown = false;
    h.run(150);
    off();
    return { c, shots };
  }

  it('clean link: predicted ammo and reload match the server exactly (0 corrections)', () => {
    const h = makeHarness({ latencyMs: 40 }, 2, 7, { room: 'main', noBots: true });
    const { c, shots } = shootThenSettle(h);
    expect(shots).toBeGreaterThan(20);
    expect(c.combatView.corrections).toBe(0);
    expect(c.predictedCombat).toEqual(c.latestSnapshot?.me);
  });

  it('clean link: dashing is predicted exactly (no position corrections)', () => {
    const h = makeHarness({ latencyMs: 40 }, 2, 7, { room: 'main', noBots: true });
    for (let f = 0; f < 300 && h.clients[0].latestSnapshot?.match.state !== 'RUNNING'; f++) h.frame();
    h.run(60);
    const c = h.clients[0];
    // Grant Dash on the server (as a pickup would) and let the client learn it
    const room = h.server.getRoom('main') as unknown as { state: { players: Map<number, { combat: { dashTicks: number } }> } };
    room.state.players.get(c.myPlayerId!)!.combat.dashTicks = 590;
    h.run(30);
    expect(c.predictedCombat.dashTicks).toBeGreaterThan(0);
    const before = h.corrections.length;
    const start = { ...c.predicted };
    let dashes = 0;
    let bursts = 0;
    for (let f = 0; f < 300; f++) {
      c.keys = Math.floor(f / 75) % 2 === 0 ? KEY.RIGHT : KEY.LEFT;
      if (f % 40 === 0) { c.requestDash(); dashes++; }
      h.frame();
      if (c.predictedCombat.dashBurstTicks === 8) bursts++; // first input after a dash started
    }
    h.run(120);
    expect(dashes).toBeGreaterThan(5);
    expect(bursts).toBe(3); // 5 s with a 2 s cooldown: dashes at 0, ~2 and ~4 s
    expect(Math.hypot(c.predicted.x - start.x, c.predicted.y - start.y)).toBeGreaterThan(0);
    expect(h.corrections.length - before).toBe(0);
    expect(c.predicted).toEqual({ x: c.authX, y: c.authY });
  });

  it('20 % loss, redundancy off: lost shots are corrected, and the state converges', () => {
    const h = makeHarness({ latencyMs: 40, lossPct: 20 }, 2, 7, { room: 'main', noBots: true });
    const { c } = shootThenSettle(h);
    expect(c.combatView.corrections).toBeGreaterThan(0);
    expect(c.predictedCombat).toEqual(c.latestSnapshot?.me);
  });
});

describe('Netcode harness: sync models (PHASES.md Phase 3, docs/PHASE3_PLAN.md §6)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    frameNo = 0;
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const FULL: SyncSpec = { model: 'full' };
  const DELTA: SyncSpec = { model: 'delta' };
  const STATE10: SyncSpec = { model: 'state', hz: 10 };
  const STATE30: SyncSpec = { model: 'state', hz: 30 };

  /** The world every viewer of the lab room shares, compared keyed by id. */
  function world(s: MsgSnap) {
    const byId = <T extends { id: number }>(a: T[]) => [...a].sort((x, y) => x.id - y.id);
    return { tick: s.tick, st: s.st, match: s.match, players: byId(s.players), projectiles: byId(s.projectiles), pickups: s.pickups };
  }

  /** Lab with movers, a spectator (truth + clock) and one client per sync spec. */
  function syncHarness(link: Partial<LinkConfig>, syncs: SyncSpec[], movers = [...MOVER_PATTERNS]) {
    const h = makeHarness(link, syncs.length, 7, { spectator: true, syncs });
    const ref = h.spectator!;
    for (const c of h.clients) c.setTruthClock(() => ref.serverNow());
    ref.setMovers(movers);
    const truth = new Map<number, MsgSnap>();
    ref.on('snap', (s) => truth.set(s.tick, s));
    const seen = h.clients.map(() => [] as MsgSnap[]);
    h.clients.forEach((c, i) => c.on('snap', (s) => seen[i].push(s)));
    h.run(30);
    return { h, truth, seen };
  }

  it('clean link: every model shows the server\'s world exactly, with zero corrections; live switch keeps the player', () => {
    const { h, truth, seen } = syncHarness({ latencyMs: 30 }, [FULL, DELTA, STATE10]);
    h.run(360, scriptedKeys);
    h.run(60);
    expect(h.corrections).toEqual([]);
    for (let i = 0; i < 3; i++) {
      expect(seen[i].length).toBeGreaterThan(i === 2 ? 40 : 150);
      for (const s of seen[i]) if (truth.has(s.tick)) expect(world(s)).toEqual(world(truth.get(s.tick)!));
    }
    // Live switch: same player, no respawn, still exact
    const [full] = h.clients;
    const id = full.myPlayerId;
    const life = full.latestSnapshot!.players.find((p) => p.id === id)!.life;
    full.setSync(DELTA);
    seen[0].length = 0;
    h.run(120, scriptedKeys);
    h.run(60);
    expect(full.myPlayerId).toBe(id);
    expect(full.latestSnapshot!.players.find((p) => p.id === id)!.life).toBe(life);
    expect(h.server.rooms.get('lab')!.playerCount).toBe(3);
    for (const s of seen[0]) if (truth.has(s.tick)) expect(world(s)).toEqual(world(truth.get(s.tick)!));
    expect(h.corrections).toEqual([]);
  });

  it('bytes: delta ≤ 40 % of full, state 10 Hz ≤ 45 %, state 30 Hz ≥ full (lab, 4 players + 4 movers)', () => {
    const { h } = syncHarness({ latencyMs: 20 }, [FULL, DELTA, STATE10, STATE30]);
    const start = [...h.bytesDown];
    h.run(600, scriptedKeys);
    const [full, delta, s10, s30] = h.bytesDown.map((b, i) => b - start[i]);
    expect(delta / full).toBeLessThanOrEqual(0.4);
    expect(s10 / full).toBeLessThanOrEqual(0.45);
    expect(s30).toBeGreaterThanOrEqual(full);
  });

  it('50 ms one-way: state draws movers ≥ 60 ms more current than full; 30 Hz overshoots less than 10 Hz', () => {
    const { h } = syncHarness({ latencyMs: 50 }, [FULL, STATE10, STATE30], ['zigzag', 'reversal']);
    h.run(480);
    vi.advanceTimersByTime(250);
    const [full, s10, s30] = h.clients.map((c) => c.metrics);
    expect(full.moverSamples).toBeGreaterThan(0);
    expect(s10.moverSamples).toBeGreaterThan(0);
    expect(s10.moverLagMs).toBeLessThan(full.moverLagMs - 60);
    expect(s30.moverLagMs).toBeLessThan(full.moverLagMs - 60);
    expect(s10.moverOffPathPct).toBeGreaterThan(0);
    expect(s30.moverOffPathPct).toBeLessThan(s10.moverOffPathPct);
    expect(full.moverOffPathPct).toBeLessThanOrEqual(2);
  });

  it('Nightmare (400 kbps, 12 % burst loss): delta stays exact and fast; full queues (20 s)', () => {
    const nightmare: Partial<LinkConfig> = {
      latencyMs: 120, jitterMs: 50, lossPct: 12, lossModel: 'burst', burstLen: 4,
      duplicatePct: 3, reorderPct: 5, bandwidthKbps: 400,
    };
    const { h, truth, seen } = syncHarness(nightmare, [FULL, DELTA, STATE10]);
    // Loss is applied before the bandwidth cap, so 12 % loss leaves Full (≈ 451 kbps) just above
    // 400 kbps: its queue takes ≈ 10–15 s to build up (measured: ack delay ≈ 700 vs ≈ 350 ms at 20 s)
    h.run(600, scriptedKeys);
    // The queue repeatedly overflows its 400 ms limit and drains: average one reading per second
    const ack = [0, 0, 0];
    for (let sec = 0; sec < 10; sec++) {
      h.run(60, (f) => scriptedKeys(f + sec * 60));
      h.clients.forEach((c, i) => { ack[i] += c.metrics.ackDelayMs / 10; });
    }
    const [, delta] = h.clients;
    for (const c of h.clients) expect(c.connectionStatus).toBe('connected');
    expect(seen[1].length).toBeGreaterThan(450); // 600 sent, minus ≈ 12 % burst loss
    for (const s of seen[1]) if (truth.has(s.tick)) expect(world(s)).toEqual(world(truth.get(s.tick)!));
    expect(delta.metrics.deltaMissingBase).toBe(0);
    expect(ack[0]).toBeGreaterThan(ack[1] + 150);
    expect(ack[2]).toBeLessThan(ack[0]);
  });
});
