/**
 * NetClient — transport, handshake, input generation, prediction,
 * reconciliation, snapshot buffer, clock estimation and metrics.
 * SPEC.md §10.
 *
 * Headless by design: no Phaser, React or store imports. The transport and
 * clock are injectable so the same class runs in the browser, in the
 * headless test harness and (later) in Node network players. UI code
 * subscribes with `on(...)` (see bindStore.ts).
 */

import { encodeClient, decodeServer } from '@nobu/shared/protocol';
import { stepPlayer } from '@nobu/shared/sim';
import type {
  MsgSnap, PlayerSnap, ProjectileSnap, InputEntry,
  MsgWelcome, MsgPong, GameEvent, ClientMsg,
} from '@nobu/shared/protocol';
import GAME from '@nobu/shared/config/game';
import NET from '@nobu/shared/config/net';

// ── Types ──────────────────────────────────────────────────────
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'timeout' | 'error';

export interface PredictionToggle {
  prediction: boolean;
  reconciliation: boolean;
  interpolation: boolean;
  redundancy: boolean;
  ghost: boolean;
}

export interface SnapshotEntry {
  st: number;
  /** Local time the snapshot arrived. */
  arrivedAt: number;
  players: PlayerSnap[];
  projectiles: ProjectileSnap[];
}

export interface LocalMetrics {
  rttMs: number;
  jitterMs: number;
  snapshotHz: number;
  pendingInputs: number;
  correctionsPerSec: number;
  lastErrorPx: number;
  /** Largest correction in the last second (0 when there was none). */
  recentErrorPx: number;
  avgErrorPx: number;
  maxErrorPx: number;
  inputToScreenMs: number;
  ackDelayMs: number;
  bwUpKbps: number;
  bwDownKbps: number;
  snapsMissed: number;
  duplicatesIgnored: number;
  reorderedIgnored: number;
  serverTickHz: number;
  serverTickMs: number;
}

export interface CorrectionEvent {
  fromX: number; fromY: number;
  toX: number; toY: number;
  errorPx: number;
}

export interface RenderState {
  players: PlayerSnap[];
  projectiles: ProjectileSnap[];
}

/** Minimal message transport (WebSocket in the browser, in-process in tests). */
export interface ClientTransport {
  send(text: string): void;
  close(): void;
}
export interface TransportHandlers {
  onOpen(): void;
  onMessage(text: string): void;
  onClose(): void;
  onError(): void;
}
export type TransportFactory = (url: string, handlers: TransportHandlers) => ClientTransport;

export const browserWebSocketTransport: TransportFactory = (url, h) => {
  const ws = new WebSocket(url);
  ws.onopen = () => h.onOpen();
  ws.onmessage = (evt) => h.onMessage(evt.data as string);
  ws.onclose = () => h.onClose();
  ws.onerror = () => h.onError();
  return {
    send: (text) => { if (ws.readyState === WebSocket.OPEN) ws.send(text); },
    close: () => ws.close(),
  };
};

export interface NetClientOptions {
  /** Base URL of the emulator (or server), e.g. ws://127.0.0.1:9000 */
  url: string;
  name: string;
  room?: 'main' | 'lab';
  /** Prefix for the emulator session label; a random suffix keeps it unique. */
  labelPrefix?: string;
  transport?: TransportFactory;
  /** Monotonic local clock in ms. */
  now?: () => number;
}

interface Listeners {
  status: (s: ConnectionStatus) => void;
  welcome: (playerId: number) => void;
  snap: (snap: MsgSnap) => void;
  event: (ev: GameEvent) => void;
  correction: (ev: CorrectionEvent) => void;
  fire: () => void;
}

const MOVE_CFG = {
  speed: GAME.player.speed,
  radius: GAME.player.radius,
  arenaW: GAME.arena.width,
  arenaH: GAME.arena.height,
  obstacles: GAME.obstacles as unknown as { x: number; y: number; w: number; h: number }[],
  hz: GAME.sim.hz,
};

const SIM_STEP_MS = 1000 / GAME.sim.hz;
const SNAP_EVERY_TICKS = Math.round(GAME.sim.hz / NET.snapshotHz);
const METRICS_INTERVAL_MS = 200; // 5 Hz (SPEC.md §12)
const SEEN_EVENTS_MAX = 1024;
const LATENCY_SAMPLES = 30;
const RTT_DISPLAY_SAMPLES = 6; // ~3 s, responsive to preset changes

function mean(a: number[]): number {
  return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
}
function pushCapped(a: number[], v: number, cap: number): void {
  a.push(v);
  if (a.length > cap) a.shift();
}

// ── NetClient ─────────────────────────────────────────────────
export class NetClient {
  readonly label: string;
  private readonly url: string;
  private readonly playerName: string;
  private readonly roomName: 'main' | 'lab';
  private readonly nonce: string;
  private readonly transportFactory: TransportFactory;
  private readonly now: () => number;
  private transport: ClientTransport | null = null;
  /** Bumped on every connect/disconnect so callbacks from an old transport are ignored. */
  private generation = 0;

  private listeners: { [K in keyof Listeners]: Set<Listeners[K]> } = {
    status: new Set(), welcome: new Set(), snap: new Set(),
    event: new Set(), correction: new Set(), fire: new Set(),
  };

  // Connection state
  private connected = false;
  private playerId: number | null = null;
  private status: ConnectionStatus = 'connecting';

  // Prediction state
  private predictedX = 0;
  private predictedY = 0;
  private smoothOffsetX = 0;
  private smoothOffsetY = 0;
  private pendingInputs: InputEntry[] = [];
  private seq = 0;
  private lastSentSeq = 0;
  private lastLife = -1;

  // Snapshot buffer / clock
  private snapBuffer: SnapshotEntry[] = [];
  private latestSnap: MsgSnap | null = null;
  private latestAppliedTick = -1;
  private clockOffset = 0;
  private clockInitialized = false;

  // Event de-duplication (bounded)
  private seenEids = new Set<number>();
  private seenEidOrder: number[] = [];

  // Metric raw data
  private rttSamples: number[] = [];
  private pingId = 0;
  private pingTs = new Map<number, number>();
  private correctionTimes: number[] = [];
  private correctionErrors: { t: number; px: number }[] = [];
  private snapshotTimes: number[] = [];
  private snapsMissed = 0;
  private duplicatesIgnored = 0;
  private reorderedIgnored = 0;
  private bytesSent = 0;
  private bytesRecv = 0;
  private bwHistory: { t: number; up: number; down: number }[] = [];
  private inputCreatedAt = new Map<number, number>();
  private unpresentedInputAt: number | null = null;
  private lastFrameMs = SIM_STEP_MS;
  private inputToScreenSamples: number[] = [];
  private ackDelaySamples: number[] = [];

  toggles: PredictionToggle = {
    prediction: true,
    reconciliation: true,
    interpolation: true,
    redundancy: NET.redundancyDefault,
    ghost: true,
  };

  /** Latest authoritative position of the local player (ghost). */
  authX = 0;
  authY = 0;

  // Current keys + aim (set by the scene / input source)
  keys = 0;
  aimAngle = 0;
  fireDown = false;

  private localFireCooldown = 0;
  private helloTimer: ReturnType<typeof setInterval> | null = null;
  private giveUpTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private metricsTimer: ReturnType<typeof setInterval> | null = null;
  private lastReceivedTime = 0;

  metrics: LocalMetrics = {
    rttMs: 0, jitterMs: 0, snapshotHz: 0, pendingInputs: 0,
    correctionsPerSec: 0, lastErrorPx: 0, recentErrorPx: 0, avgErrorPx: 0, maxErrorPx: 0,
    inputToScreenMs: 0, ackDelayMs: 0, bwUpKbps: 0, bwDownKbps: 0, snapsMissed: 0,
    duplicatesIgnored: 0, reorderedIgnored: 0, serverTickHz: 0, serverTickMs: 0,
  };

  constructor(opts: NetClientOptions) {
    this.url = opts.url;
    this.playerName = opts.name;
    this.roomName = opts.room ?? 'main';
    this.transportFactory = opts.transport ?? browserWebSocketTransport;
    this.now = opts.now ?? (() => performance.now());
    this.nonce = Math.random().toString(36).slice(2);
    this.label = `${opts.labelPrefix ?? opts.name}-${this.nonce.slice(0, 4)}`;
  }

  // ── Events ─────────────────────────────────────────────────
  on<K extends keyof Listeners>(type: K, fn: Listeners[K]): () => void {
    this.listeners[type].add(fn);
    return () => { this.listeners[type].delete(fn); };
  }

  private emit<K extends keyof Listeners>(type: K, ...args: Parameters<Listeners[K]>): void {
    for (const fn of this.listeners[type]) (fn as (...a: Parameters<Listeners[K]>) => void)(...args);
  }

  private setStatus(s: ConnectionStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.emit('status', s);
  }

  // ── Connection ─────────────────────────────────────────────
  connect(): void {
    const sep = this.url.includes('?') ? '&' : '?';
    const url = `${this.url}${sep}label=${encodeURIComponent(this.label)}`;
    this.setStatus('connecting');
    const gen = ++this.generation;
    const live = () => gen === this.generation;
    this.transport = this.transportFactory(url, {
      onOpen: () => {
        if (!live()) return;
        this.lastReceivedTime = this.now();
        this.startHello();
      },
      onMessage: (text) => {
        if (!live()) return;
        this.bytesRecv += text.length;
        this.lastReceivedTime = this.now();
        if (this.connected && this.status !== 'connected') this.setStatus('connected');
        const msg = decodeServer(text);
        if (msg) this.handleServerMsg(msg.t, msg as unknown as Record<string, unknown>);
      },
      onClose: () => {
        if (!live()) return;
        this.connected = false;
        this.stopTimers();
        if (this.status !== 'timeout' && this.status !== 'error') this.setStatus('disconnected');
      },
      onError: () => { if (live()) this.setStatus('error'); },
    });
  }

  /** Clean disconnect. The client can connect() again afterwards (as a new player). */
  disconnect(): void {
    this.generation++;
    if (this.transport) {
      if (this.connected) this.send({ t: 'bye' });
      this.transport.close();
      this.transport = null;
    }
    this.stopTimers();
    this.connected = false;
    this.playerId = null;
    this.lastLife = -1;
    this.pendingInputs = [];
    this.inputCreatedAt.clear();
    this.snapBuffer = [];
    this.latestSnap = null;
    this.latestAppliedTick = -1;
    this.clockInitialized = false;
  }

  private send(msg: ClientMsg): void {
    if (!this.transport) return;
    const text = encodeClient(msg);
    this.transport.send(text);
    this.bytesSent += text.length;
  }

  private startHello(): void {
    const sendHello = () => this.send({
      t: 'hello', v: 1, name: this.playerName, room: this.roomName, nonce: this.nonce,
    });
    sendHello();
    this.helloTimer = setInterval(sendHello, NET.helloRetryMs);
    this.giveUpTimer = setTimeout(() => {
      if (!this.connected) {
        if (this.helloTimer) clearInterval(this.helloTimer);
        this.setStatus('timeout');
      }
    }, NET.connectGiveUpMs);
  }

  private stopTimers(): void {
    for (const t of [this.helloTimer, this.pingTimer, this.metricsTimer]) if (t) clearInterval(t);
    if (this.giveUpTimer) clearTimeout(this.giveUpTimer);
    this.helloTimer = this.pingTimer = this.metricsTimer = this.giveUpTimer = null;
  }

  private handleServerMsg(type: string, msg: Record<string, unknown>): void {
    switch (type) {
      case 'welcome': this.onWelcome(msg as unknown as MsgWelcome); break;
      case 'snap': this.onSnapReceived(msg as unknown as MsgSnap); break;
      case 'pong': this.onPong(msg as unknown as MsgPong); break;
      case 'error':
        console.warn('[client] Server error:', msg['code'], msg['msg']);
        this.setStatus('error');
        break;
    }
  }

  private onWelcome(msg: MsgWelcome): void {
    if (this.connected || msg.nonce !== this.nonce) return; // repeated welcome
    if (this.helloTimer) clearInterval(this.helloTimer);
    if (this.giveUpTimer) clearTimeout(this.giveUpTimer);
    this.helloTimer = this.giveUpTimer = null;
    this.connected = true;
    this.playerId = msg.playerId;

    this.pingTimer = setInterval(() => {
      const id = this.pingId++;
      const ct = this.now();
      this.pingTs.set(id, ct);
      if (this.pingTs.size > 20) this.pingTs.delete(this.pingTs.keys().next().value as number);
      this.send({ t: 'ping', id, ct });
      // Watchdog (SPEC.md §10.7): nothing received for timeoutMs
      if (this.now() - this.lastReceivedTime > NET.timeoutMs) this.setStatus('disconnected');
    }, NET.pingIntervalMs);
    this.metricsTimer = setInterval(() => this.updateMetrics(), METRICS_INTERVAL_MS);

    this.setStatus('connected');
    this.emit('welcome', msg.playerId);
  }

  private onPong(msg: MsgPong): void {
    const sent = this.pingTs.get(msg.id);
    if (sent == null) return;
    this.pingTs.delete(msg.id);
    pushCapped(this.rttSamples, this.now() - sent, Math.round(NET.metricsWindowMs / NET.pingIntervalMs));
    this.metrics.serverTickHz = Math.round(msg.tickHz);
    this.metrics.serverTickMs = Math.round(msg.tickMs * 100) / 100;
  }

  // ── Snapshots ──────────────────────────────────────────────
  private onSnapReceived(snap: MsgSnap): void {
    const now = this.now();

    // SPEC.md §8.3: ignore any snapshot not newer than the latest applied
    if (snap.tick <= this.latestAppliedTick) {
      if (snap.tick === this.latestAppliedTick) this.duplicatesIgnored++;
      else this.reorderedIgnored++;
      return;
    }
    if (this.latestAppliedTick !== -1) {
      const gap = Math.round((snap.tick - this.latestAppliedTick) / SNAP_EVERY_TICKS) - 1;
      if (gap > 0) this.snapsMissed += gap;
    }
    this.latestAppliedTick = snap.tick;
    this.latestSnap = snap;
    this.snapshotTimes.push(now);

    // Clock offset: EMA of (server time − local arrival time) (SPEC.md §10.5)
    const sample = snap.st - now;
    if (!this.clockInitialized) {
      this.clockOffset = sample;
      this.clockInitialized = true;
    } else {
      this.clockOffset += (sample - this.clockOffset) * NET.clockSmoothing;
    }

    this.snapBuffer.push({ st: snap.st, arrivedAt: now, players: snap.players, projectiles: snap.projectiles });
    if (this.snapBuffer.length > NET.snapshotBufferSize) this.snapBuffer.shift();

    // Events are cosmetic and repeated for eventRedundancyMs: de-duplicate by eid
    for (const ev of snap.events) {
      if (this.seenEids.has(ev.eid)) continue;
      this.seenEids.add(ev.eid);
      this.seenEidOrder.push(ev.eid);
      if (this.seenEidOrder.length > SEEN_EVENTS_MAX) this.seenEids.delete(this.seenEidOrder.shift()!);
      this.emit('event', ev);
    }

    if (this.playerId !== null) this.reconcile(snap, now);
    this.emit('snap', snap);
  }

  /** SPEC.md §10.4 */
  private reconcile(snap: MsgSnap, now: number): void {
    const me = snap.players.find(p => p.id === this.playerId);
    if (!me) return;

    this.authX = me.x;
    this.authY = me.y;
    this.recordAck(snap.ack, now);

    // Step 2: life change = hard reset (spawn / respawn teleport, not a correction)
    if (me.life !== this.lastLife) {
      this.lastLife = me.life;
      this.predictedX = me.x;
      this.predictedY = me.y;
      this.smoothOffsetX = 0;
      this.smoothOffsetY = 0;
      this.pendingInputs = [];
      return;
    }

    // Step 3: drop acknowledged inputs
    this.pendingInputs = this.pendingInputs.filter(i => i.s > snap.ack);

    if (!this.toggles.reconciliation) return;

    // Steps 4–5: replay pending inputs on top of the authoritative state
    const before = { x: this.predictedX, y: this.predictedY };
    let pos = { x: me.x, y: me.y };
    for (const inp of this.pendingInputs) pos = stepPlayer(pos, inp.k, MOVE_CFG);

    // With prediction off nothing was predicted, so there is nothing to correct.
    if (!this.toggles.prediction) {
      this.predictedX = pos.x;
      this.predictedY = pos.y;
      return;
    }

    // Steps 6–9
    const dx = before.x - pos.x;
    const dy = before.y - pos.y;
    const error = Math.sqrt(dx * dx + dy * dy);
    if (error > NET.reconcile.epsilonPx) {
      this.correctionTimes.push(now);
      this.correctionErrors.push({ t: now, px: error });
      if (this.correctionErrors.length > 200) this.correctionErrors.shift();
      this.metrics.lastErrorPx = Math.round(error * 10) / 10;

      const shownFromX = before.x + this.smoothOffsetX;
      const shownFromY = before.y + this.smoothOffsetY;
      if (error >= NET.reconcile.snapThresholdPx) {
        this.smoothOffsetX = 0;
        this.smoothOffsetY = 0;
      } else {
        this.smoothOffsetX += dx;
        this.smoothOffsetY += dy;
      }
      this.emit('correction', { fromX: shownFromX, fromY: shownFromY, toX: pos.x, toY: pos.y, errorPx: error });
    }
    this.predictedX = pos.x;
    this.predictedY = pos.y;
  }

  /** Ack delay (input creation → server ack seen) and, with prediction off, Input → Screen. */
  private recordAck(ack: number, now: number): void {
    let newestCreated: number | undefined;
    for (const [s, t] of this.inputCreatedAt) {
      if (s > ack) break; // Map iterates in insertion (= sequence) order
      newestCreated = t;
      this.inputCreatedAt.delete(s);
    }
    if (newestCreated === undefined) return;
    const ackDelay = now - newestCreated;
    pushCapped(this.ackDelaySamples, ackDelay, LATENCY_SAMPLES);
    if (!this.toggles.prediction) {
      const interp = this.toggles.interpolation ? NET.interpDelayMs : 0;
      pushCapped(this.inputToScreenSamples, ackDelay + interp + this.lastFrameMs, LATENCY_SAMPLES);
    }
  }

  // ── Simulation / input ─────────────────────────────────────
  /** Call from the fixed 60 Hz sim loop: samples one input and predicts. */
  simStep(): void {
    if (!this.connected || this.playerId === null) return;

    const snap = this.latestSnap;
    const me = snap?.players.find(p => p.id === this.playerId);
    const matchRunning = snap?.match.state === 'RUNNING';
    const isAlive = me?.alive ?? false;

    // Decay smoothing offset (half-life smoothHalfLifeMs)
    const alpha = Math.pow(0.5, SIM_STEP_MS / NET.reconcile.smoothHalfLifeMs);
    this.smoothOffsetX *= alpha;
    this.smoothOffsetY *= alpha;
    if (this.localFireCooldown > 0) this.localFireCooldown -= SIM_STEP_MS;

    if (!matchRunning || !isAlive) return;

    const fire: 0 | 1 = (this.fireDown && this.localFireCooldown <= 0) ? 1 : 0;
    if (fire) {
      this.localFireCooldown = GAME.player.fireCooldownMs;
      this.emit('fire');
    }

    const inp: InputEntry = {
      s: ++this.seq,
      k: this.keys,
      a: Math.round(this.aimAngle * 1000) / 1000,
      f: fire,
    };
    const now = this.now();
    this.pendingInputs.push(inp);
    this.inputCreatedAt.set(inp.s, now);
    if (this.unpresentedInputAt === null) this.unpresentedInputAt = now;

    if (this.toggles.prediction) {
      const pos = stepPlayer({ x: this.predictedX, y: this.predictedY }, inp.k, MOVE_CFG);
      this.predictedX = pos.x;
      this.predictedY = pos.y;
    }
  }

  /** Call at inputSendHz (30 Hz) to flush inputs to the server (SPEC.md §10.3). */
  sendInputs(): void {
    if (!this.connected || this.seq === this.lastSentSeq) return;

    const toSend = this.toggles.redundancy
      // All unacknowledged inputs, newest last, at most redundancyMax
      ? this.pendingInputs.slice(-NET.redundancyMax)
      // Only the inputs created since the last send (every input is sent once)
      : this.pendingInputs.filter(i => i.s > this.lastSentSeq);

    this.lastSentSeq = this.seq;
    if (toSend.length > 0) this.send({ t: 'input', inputs: toSend });
  }

  perturb(dx: number, dy: number): void {
    this.send({ t: 'perturb', dx, dy });
  }

  // ── Rendering helpers ──────────────────────────────────────
  /**
   * Call once per rendered frame. With prediction on, Input → Screen is the
   * time from the first unrendered input to the presentation of this frame
   * (≈ one frame later). SPEC.md §12.
   */
  framePresented(frameMs: number): void {
    this.lastFrameMs = frameMs;
    if (this.unpresentedInputAt === null) return;
    if (this.toggles.prediction) {
      pushCapped(this.inputToScreenSamples, this.now() - this.unpresentedInputAt + frameMs, LATENCY_SAMPLES);
    }
    this.unpresentedInputAt = null;
  }

  /** Remote entities interpolated around `now + clockOffset − interpDelay` (SPEC.md §10.5). */
  getInterpolatedState(): RenderState {
    const latest = this.latestSnap;
    const buf = this.snapBuffer;
    if (!this.toggles.interpolation || buf.length === 0) {
      return { players: latest?.players ?? [], projectiles: latest?.projectiles ?? [] };
    }

    const now = this.now();
    let renderST = now + this.clockOffset - NET.interpDelayMs;
    const oldest = buf[0];
    const newest = buf[buf.length - 1];

    // Clock drifted far outside the buffer (e.g. after a stall): re-anchor.
    if (renderST > newest.st + 200 || renderST < oldest.st - 200) {
      this.clockOffset = newest.st - newest.arrivedAt;
      renderST = now + this.clockOffset - NET.interpDelayMs;
    }

    if (renderST >= newest.st) {
      // Extrapolate from the last two snapshots by at most extrapolateMaxMs, then freeze.
      const prev = buf.length >= 2 ? buf[buf.length - 2] : null;
      if (!prev || newest.st === prev.st) return { players: newest.players, projectiles: newest.projectiles };
      const ahead = Math.min(renderST - newest.st, NET.extrapolateMaxMs);
      return this.blend(prev, newest, 1 + ahead / (newest.st - prev.st));
    }
    if (renderST <= oldest.st) return { players: oldest.players, projectiles: oldest.projectiles };

    for (let i = buf.length - 2; i >= 0; i--) {
      const lo = buf[i];
      if (lo.st <= renderST) {
        const hi = buf[i + 1];
        return this.blend(lo, hi, (renderST - lo.st) / (hi.st - lo.st));
      }
    }
    return { players: newest.players, projectiles: newest.projectiles };
  }

  /** t in [0,1] interpolates; t > 1 extrapolates. */
  private blend(lo: SnapshotEntry, hi: SnapshotEntry, t: number): RenderState {
    const lerp = (a: number, b: number) => a + (b - a) * t;
    const players: PlayerSnap[] = [];
    for (const hp of hi.players) {
      const lp = lo.players.find(p => p.id === hp.id);
      if (!lp) {
        // Not drawn until render time reaches its first snapshot
        if (t >= 1) players.push(hp);
        continue;
      }
      // Respawn teleport or death: don't slide across the arena
      if (lp.life !== hp.life || lp.alive !== hp.alive) players.push(t < 1 ? lp : hp);
      else players.push({ ...hp, x: lerp(lp.x, hp.x), y: lerp(lp.y, hp.y) });
    }
    const projectiles: ProjectileSnap[] = [];
    for (const hp of hi.projectiles) {
      const lp = lo.projectiles.find(p => p.id === hp.id);
      if (!lp) { if (t >= 1) projectiles.push(hp); continue; }
      projectiles.push({ ...hp, x: lerp(lp.x, hp.x), y: lerp(lp.y, hp.y) });
    }
    return { players, projectiles };
  }

  /**
   * Where to draw the local player. Prediction on: predicted + smoothing
   * offset. Prediction off: exactly like a remote player (SPEC.md §10.6).
   */
  getLocalRenderPos(state: RenderState): { x: number; y: number } {
    if (this.toggles.prediction) {
      return { x: this.predictedX + this.smoothOffsetX, y: this.predictedY + this.smoothOffsetY };
    }
    const me = state.players.find(p => p.id === this.playerId);
    return me ? { x: me.x, y: me.y } : { x: this.authX, y: this.authY };
  }

  // ── Metrics (5 Hz, rolling windows) ────────────────────────
  private updateMetrics(): void {
    const now = this.now();
    const m = this.metrics;

    this.bwHistory.push({ t: now, up: this.bytesSent, down: this.bytesRecv });
    this.bytesSent = 0;
    this.bytesRecv = 0;
    while (this.bwHistory.length > 1 && now - this.bwHistory[0].t > 1000) this.bwHistory.shift();
    const spanSec = Math.max(METRICS_INTERVAL_MS, now - this.bwHistory[0].t + METRICS_INTERVAL_MS) / 1000;
    m.bwUpKbps = Math.round(this.bwHistory.reduce((a, b) => a + b.up, 0) * 8 / spanSec / 1000);
    m.bwDownKbps = Math.round(this.bwHistory.reduce((a, b) => a + b.down, 0) * 8 / spanSec / 1000);

    this.snapshotTimes = this.snapshotTimes.filter(t => now - t < 1000);
    this.correctionTimes = this.correctionTimes.filter(t => now - t < 1000);
    m.snapshotHz = this.snapshotTimes.length;
    m.correctionsPerSec = this.correctionTimes.length;

    const windowErrors = this.correctionErrors.filter(e => now - e.t < NET.metricsWindowMs).map(e => e.px);
    m.recentErrorPx = Math.round(Math.max(0, ...this.correctionErrors.filter(e => now - e.t < 1000).map(e => e.px)) * 10) / 10;
    m.avgErrorPx = Math.round(mean(windowErrors) * 10) / 10;
    m.maxErrorPx = Math.round(Math.max(0, ...windowErrors) * 10) / 10;

    const recentRtt = this.rttSamples.slice(-RTT_DISPLAY_SAMPLES);
    m.rttMs = Math.round(mean(recentRtt));
    let jitterSum = 0;
    for (let i = 1; i < this.rttSamples.length; i++) jitterSum += Math.abs(this.rttSamples[i] - this.rttSamples[i - 1]);
    m.jitterMs = this.rttSamples.length > 1 ? Math.round(jitterSum / (this.rttSamples.length - 1)) : 0;

    m.inputToScreenMs = Math.round(mean(this.inputToScreenSamples));
    m.ackDelayMs = Math.round(mean(this.ackDelaySamples));
    m.pendingInputs = this.pendingInputs.length;
    m.snapsMissed = this.snapsMissed;
    m.duplicatesIgnored = this.duplicatesIgnored;
    m.reorderedIgnored = this.reorderedIgnored;
  }

  /** Reset the latency averages (e.g. after toggling prediction). */
  resetLatencySamples(): void {
    this.inputToScreenSamples = [];
    this.ackDelaySamples = [];
  }

  get isConnected(): boolean { return this.connected; }
  get myPlayerId(): number | null { return this.playerId; }
  get latestSnapshot(): MsgSnap | null { return this.latestSnap; }
  get connectionStatus(): ConnectionStatus { return this.status; }
  /** Authoritative and predicted positions (for tests and debug views). */
  get predicted(): { x: number; y: number } { return { x: this.predictedX, y: this.predictedY }; }
  get pendingCount(): number { return this.pendingInputs.length; }
}
