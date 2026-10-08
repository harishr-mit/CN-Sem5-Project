/**
 * NetClient — owns the WebSocket transport, handshake, input generation,
 * prediction, reconciliation, snapshot buffer and metrics.
 * No Phaser or React dependency. SPEC.md §10.
 */

import { encodeClient, decodeServer } from '@nobu/shared/protocol';
import { stepPlayer } from '@nobu/shared/sim';
import type {
  MsgSnap, PlayerSnap, ProjectileSnap, InputEntry,
  MatchState, MsgWelcome, MsgPong, GameEvent,
} from '@nobu/shared/protocol';
import type { Vec2 } from '@nobu/shared/sim';
import GAME from '@nobu/shared/config/game';
import NET from '@nobu/shared/config/net';
import { useGameStore } from '../ui/store.js';

// ── Types ──────────────────────────────────────────────────────
export interface PredictionToggle {
  prediction: boolean;
  reconciliation: boolean;
  interpolation: boolean;
  redundancy: boolean;
  ghost: boolean;
}

export interface SnapshotEntry {
  st: number;
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
  avgErrorPx: number;
  maxErrorPx: number;
  inputToScreenMs: number;
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

const MOVE_CFG = {
  speed: GAME.player.speed,
  radius: GAME.player.radius,
  arenaW: GAME.arena.width,
  arenaH: GAME.arena.height,
  obstacles: GAME.obstacles as unknown as { x: number; y: number; w: number; h: number }[],
  hz: GAME.sim.hz,
};

// ── NetClient ─────────────────────────────────────────────────
export class NetClient {
  private ws: WebSocket | null = null;
  private serverUrl: string;
  private playerName: string;
  private roomName: 'main' | 'lab';
  private nonce: string;

  // Connection state
  private connected = false;
  private playerId: number | null = null;
  private welcome: MsgWelcome | null = null;

  // Prediction state
  private predictedX = 0;
  private predictedY = 0;
  private smoothOffsetX = 0;
  private smoothOffsetY = 0;
  private pendingInputs: InputEntry[] = [];
  private seq = 0;
  private lastLife = -1;

  // Snapshot buffer
  private snapBuffer: SnapshotEntry[] = [];
  private latestSnap: MsgSnap | null = null;
  private latestAppliedTick = -1;

  // Clock sync
  private clockOffset = 0;
  private clockInitialized = false;

  // Metrics
  private rttSamples: number[] = [];
  private pingId = 0;
  private pingTs = new Map<number, number>();
  private correctionCount = 0;
  private correctionWindow = 0;
  private correctionErrors: number[] = [];
  private snapshotTimes: number[] = [];
  private lastSnapTick = -1;
  private snapsMissed = 0;
  private duplicatesIgnored = 0;
  private reorderedIgnored = 0;
  private bytesSent = 0;
  private bytesRecv = 0;
  private bwWindow = Date.now();

  // Input timing
  private inputCreatedAt = new Map<number, number>();

  // Toggles
  toggles: PredictionToggle = {
    prediction: true,
    reconciliation: true,
    interpolation: true,
    redundancy: NET.redundancyDefault,
    ghost: true,
  };

  // Callbacks
  onConnected?: (playerId: number) => void;
  onDisconnected?: () => void;
  onSnap?: (snap: MsgSnap) => void;
  onCorrection?: (ev: CorrectionEvent) => void;
  onEvent?: (ev: GameEvent) => void;
  onFire?: () => void; // local muzzle flash

  // Last authoritative position (ghost)
  authX = 0;
  authY = 0;

  // Current keys + aim (set by the Phaser scene)
  keys = 0;
  aimAngle = 0;
  fireDown = false;

  // Local fire cooldown (for muzzle flash only)
  private localFireCooldown = 0;

  private helloInterval: ReturnType<typeof setInterval> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private lastReceivedTime = 0;

  metrics: LocalMetrics = {
    rttMs: 0, jitterMs: 0, snapshotHz: 0, pendingInputs: 0,
    correctionsPerSec: 0, lastErrorPx: 0, avgErrorPx: 0, maxErrorPx: 0,
    inputToScreenMs: 0, bwUpKbps: 0, bwDownKbps: 0, snapsMissed: 0,
    duplicatesIgnored: 0, reorderedIgnored: 0, serverTickHz: 0, serverTickMs: 0,
  };

  constructor(
    serverUrl: string,
    playerName: string,
    roomName: 'main' | 'lab' = 'main'
  ) {
    this.serverUrl = serverUrl;
    this.playerName = playerName;
    this.roomName = roomName;
    this.nonce = Math.random().toString(36).slice(2);
  }

  connect(): void {
    this.ws = new WebSocket(this.serverUrl);

    this.ws.onopen = () => {
      this.lastReceivedTime = Date.now();
      this.startHello();
    };

    this.ws.onmessage = (evt) => {
      const data = evt.data as string;
      this.bytesRecv += data.length;
      this.lastReceivedTime = Date.now();
      const msg = decodeServer(data);
      if (!msg) return;
      this.handleServerMsg(msg.t, msg as unknown as Record<string, unknown>);
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.stopIntervals();
      this.onDisconnected?.();
      useGameStore.getState().setConnectionStatus('disconnected');
    };

    this.ws.onerror = () => {
      useGameStore.getState().setConnectionStatus('error');
    };
  }

  disconnect(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send(encodeClient({ t: 'bye' }));
      this.ws.close();
    }
  }

  private send(msg: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(msg);
      this.bytesSent += msg.length;
    }
  }

  private startHello(): void {
    const sendHello = () => {
      this.send(encodeClient({
        t: 'hello', v: 1,
        name: this.playerName,
        room: this.roomName,
        nonce: this.nonce,
      }));
    };
    sendHello();
    this.helloInterval = setInterval(sendHello, NET.helloRetryMs);

    // Give up after connectGiveUpMs
    setTimeout(() => {
      if (!this.connected) {
        useGameStore.getState().setConnectionStatus('timeout');
      }
    }, NET.connectGiveUpMs);
  }

  private stopIntervals(): void {
    if (this.helloInterval) clearInterval(this.helloInterval);
    if (this.pingInterval) clearInterval(this.pingInterval);
  }

  private handleServerMsg(type: string, msg: Record<string, unknown>): void {
    switch (type) {
      case 'welcome':
        this.onWelcome(msg as unknown as MsgWelcome);
        break;
      case 'snap':
        this.onSnapReceived(msg as unknown as MsgSnap);
        break;
      case 'pong':
        this.onPong(msg as unknown as MsgPong);
        break;
      case 'error':
        console.warn('[client] Server error:', msg['code'], msg['msg']);
        useGameStore.getState().setConnectionStatus('error');
        break;
    }
  }

  private onWelcome(msg: MsgWelcome): void {
    if (this.connected && msg.nonce === this.nonce) return; // already welcomed
    if (this.helloInterval) clearInterval(this.helloInterval);
    this.connected = true;
    this.playerId = msg.playerId;
    this.welcome = msg;

    // Start ping heartbeat
    this.pingInterval = setInterval(() => {
      const id = this.pingId++;
      this.pingTs.set(id, Date.now());
      this.send(encodeClient({ t: 'ping', id, ct: Date.now() }));
    }, NET.pingIntervalMs);

    useGameStore.getState().setConnectionStatus('connected');
    useGameStore.getState().setPlayerId(msg.playerId);
    this.onConnected?.(msg.playerId);
  }

  private onPong(msg: MsgPong): void {
    const sent = this.pingTs.get(msg.id);
    if (sent == null) return;
    this.pingTs.delete(msg.id);
    const rtt = Date.now() - sent;
    this.rttSamples.push(rtt);
    if (this.rttSamples.length > 20) this.rttSamples.shift();

    // Compute jitter as mean absolute diff between consecutive RTTs
    const rttAvg = this.rttSamples.reduce((a, b) => a + b, 0) / this.rttSamples.length;
    let jitterSum = 0;
    for (let i = 1; i < this.rttSamples.length; i++) {
      jitterSum += Math.abs(this.rttSamples[i] - this.rttSamples[i - 1]);
    }
    const jitter = this.rttSamples.length > 1
      ? jitterSum / (this.rttSamples.length - 1) : 0;

    this.metrics.rttMs = Math.round(rttAvg);
    this.metrics.jitterMs = Math.round(jitter);
    this.metrics.serverTickHz = Math.round(msg.tickHz);
    this.metrics.serverTickMs = Math.round(msg.tickMs * 10) / 10;
  }

  private onSnapReceived(snap: MsgSnap): void {
    // SPEC.md §10.5: ignore snapshots not newer than last applied
    if (snap.tick <= this.latestAppliedTick) {
      if (snap.tick < this.lastSnapTick) {
        this.reorderedIgnored++;
      } else {
        this.duplicatesIgnored++;
      }
      return;
    }

    // Check for missed snaps
    if (this.lastSnapTick !== -1 && snap.tick > this.lastSnapTick + 3) {
      this.snapsMissed++;
    }
    this.lastSnapTick = snap.tick;
    this.latestAppliedTick = snap.tick;
    this.latestSnap = snap;

    // Update snapshot buffer for interpolation
    this.snapBuffer.push({ st: snap.st, players: snap.players, projectiles: snap.projectiles });
    if (this.snapBuffer.length > NET.snapshotBufferSize) this.snapBuffer.shift();

    // Track snapshot rate
    const now = Date.now();
    this.snapshotTimes.push(now);
    this.snapshotTimes = this.snapshotTimes.filter(t => now - t < 1000);
    this.metrics.snapshotHz = this.snapshotTimes.length;

    // Process events
    const seenEids = useGameStore.getState().seenEventIds;
    for (const ev of snap.events) {
      if (!seenEids.has(ev.eid)) {
        seenEids.add(ev.eid);
        this.onEvent?.(ev);
        useGameStore.getState().addEvent(ev);
      }
    }

    // Update store with latest snap
    useGameStore.getState().setSnap(snap);

    // Perform reconciliation
    if (this.playerId !== null) {
      this.reconcile(snap);
    }

    this.onSnap?.(snap);
  }

  /** SPEC.md §10.4 */
  private reconcile(snap: MsgSnap): void {
    const me = snap.players.find(p => p.id === this.playerId);
    if (!me) return;

    this.authX = me.x;
    this.authY = me.y;

    // Step 2: life change = hard reset (respawn teleport)
    if (me.life !== this.lastLife) {
      this.lastLife = me.life;
      this.predictedX = me.x;
      this.predictedY = me.y;
      this.smoothOffsetX = 0;
      this.smoothOffsetY = 0;
      // Drop all pending inputs older than ack
      this.pendingInputs = this.pendingInputs.filter(i => i.s > snap.ack);
      return;
    }

    // Step 3: drop acknowledged inputs
    this.pendingInputs = this.pendingInputs.filter(i => i.s > snap.ack);

    if (!this.toggles.reconciliation) return;

    // Step 4–5: replay pending inputs from server state
    const before = { x: this.predictedX, y: this.predictedY };
    let rx = me.x, ry = me.y;
    for (const inp of this.pendingInputs) {
      const pos = stepPlayer({ x: rx, y: ry }, inp.k, MOVE_CFG);
      rx = pos.x; ry = pos.y;
    }

    // Step 6: error
    const dx = before.x - rx;
    const dy = before.y - ry;
    const error = Math.sqrt(dx * dx + dy * dy);

    // Step 7–8
    if (error > NET.reconcile.epsilonPx) {
      this.correctionCount++;
      this.correctionErrors.push(error);
      if (this.correctionErrors.length > 100) this.correctionErrors.shift();
      this.metrics.lastErrorPx = Math.round(error * 10) / 10;

      const allErrors = this.correctionErrors;
      this.metrics.avgErrorPx = Math.round(allErrors.reduce((a, b) => a + b, 0) / allErrors.length * 10) / 10;
      this.metrics.maxErrorPx = Math.round(Math.max(...allErrors) * 10) / 10;

      if (error >= NET.reconcile.snapThresholdPx) {
        // Snap
        this.predictedX = rx;
        this.predictedY = ry;
        this.smoothOffsetX = 0;
        this.smoothOffsetY = 0;
      } else {
        // Smooth
        this.smoothOffsetX += before.x - rx;
        this.smoothOffsetY += before.y - ry;
        this.predictedX = rx;
        this.predictedY = ry;
      }

      this.onCorrection?.({
        fromX: before.x + this.smoothOffsetX,
        fromY: before.y + this.smoothOffsetY,
        toX: rx, toY: ry,
        errorPx: error,
      });
    } else {
      this.predictedX = rx;
      this.predictedY = ry;
    }
  }

  /**
   * Call from the fixed 60 Hz sim loop.
   * Generates one input, applies prediction.
   */
  simStep(localMs: number): void {
    if (!this.connected || this.playerId === null) return;

    const snap = this.latestSnap;
    const me = snap?.players.find(p => p.id === this.playerId);
    const matchRunning = snap?.match.state === 'RUNNING';
    const isAlive = me?.alive ?? false;

    // Decay smooth offset (half-life = smoothHalfLifeMs)
    const halfLife = NET.reconcile.smoothHalfLifeMs;
    const dt = 1000 / GAME.sim.hz;
    const alpha = Math.pow(0.5, dt / halfLife);
    this.smoothOffsetX *= alpha;
    this.smoothOffsetY *= alpha;

    // Local fire cooldown decay
    if (this.localFireCooldown > 0) this.localFireCooldown -= dt;

    if (!matchRunning || !isAlive) return;

    // Generate input
    const aimQ = Math.round(this.aimAngle * 1000) / 1000;
    const fire: 0 | 1 = (this.fireDown && this.localFireCooldown <= 0) ? 1 : 0;
    if (fire) {
      this.localFireCooldown = GAME.player.fireCooldownMs;
      this.onFire?.();
    }

    const inp: InputEntry = {
      s: ++this.seq,
      k: this.keys,
      a: aimQ,
      f: fire,
    };

    this.pendingInputs.push(inp);
    this.inputCreatedAt.set(inp.s, localMs);

    // Apply prediction
    if (this.toggles.prediction) {
      const pos = stepPlayer({ x: this.predictedX, y: this.predictedY }, inp.k, MOVE_CFG);
      this.predictedX = pos.x;
      this.predictedY = pos.y;
    }

    this.metrics.pendingInputs = this.pendingInputs.length;
  }

  /**
   * Call at inputSendHz (30 Hz) to flush inputs to the server.
   */
  sendInputs(): void {
    if (!this.connected || this.pendingInputs.length === 0) return;

    let toSend: InputEntry[];
    if (this.toggles.redundancy) {
      // All unacknowledged, newest last, max redundancyMax
      toSend = this.pendingInputs.slice(-NET.redundancyMax);
    } else {
      // Only the newest input
      toSend = [this.pendingInputs[this.pendingInputs.length - 1]];
    }

    this.send(encodeClient({ t: 'input', inputs: toSend }));
  }

  /** Update per-second metrics. Call at 5 Hz from the UI. */
  updateMetrics(): void {
    const now = Date.now();
    const windowSec = (now - this.bwWindow) / 1000;
    if (windowSec > 0) {
      this.metrics.bwUpKbps = Math.round(this.bytesSent * 8 / windowSec / 1000);
      this.metrics.bwDownKbps = Math.round(this.bytesRecv * 8 / windowSec / 1000);
      this.bytesSent = 0;
      this.bytesRecv = 0;
      this.bwWindow = now;
    }
    this.metrics.correctionsPerSec = this.correctionCount;
    this.correctionCount = 0;
    this.metrics.snapsMissed = this.snapsMissed;
    this.metrics.duplicatesIgnored = this.duplicatesIgnored;
  }

  perturb(dx: number, dy: number): void {
    this.send(encodeClient({ t: 'perturb', dx, dy }));
  }

  /** Rendered position for the local player (prediction + smooth offset). */
  get renderX(): number {
    if (!this.toggles.prediction && this.latestSnap) {
      const me = this.latestSnap.players.find(p => p.id === this.playerId);
      return me?.x ?? this.predictedX;
    }
    return this.predictedX + this.smoothOffsetX;
  }

  get renderY(): number {
    if (!this.toggles.prediction && this.latestSnap) {
      const me = this.latestSnap.players.find(p => p.id === this.playerId);
      return me?.y ?? this.predictedY;
    }
    return this.predictedY + this.smoothOffsetY;
  }

  /** Get interpolated state for remote entities. SPEC.md §10.5 */
  getInterpolatedState(localNowMs: number): { players: PlayerSnap[]; projectiles: ProjectileSnap[] } {
    if (!this.toggles.interpolation || this.snapBuffer.length < 2) {
      const snap = this.latestSnap;
      return {
        players: snap?.players ?? [],
        projectiles: snap?.projectiles ?? [],
      };
    }

    const renderST = localNowMs + this.clockOffset - NET.interpDelayMs;

    // Find surrounding snapshots
    let lo = this.snapBuffer[0];
    let hi = this.snapBuffer[this.snapBuffer.length - 1];
    for (let i = 0; i < this.snapBuffer.length - 1; i++) {
      if (this.snapBuffer[i].st <= renderST && this.snapBuffer[i + 1].st >= renderST) {
        lo = this.snapBuffer[i];
        hi = this.snapBuffer[i + 1];
        break;
      }
    }

    if (hi.st === lo.st) return { players: hi.players, projectiles: hi.projectiles };

    const t = Math.min(1, Math.max(0, (renderST - lo.st) / (hi.st - lo.st)));

    const interpolate = (loVal: number, hiVal: number) => loVal + (hiVal - loVal) * t;

    const players = hi.players.map(hp => {
      const lp = lo.players.find(p => p.id === hp.id);
      if (!lp) return hp;
      return { ...hp, x: interpolate(lp.x, hp.x), y: interpolate(lp.y, hp.y) };
    });

    const projectiles = hi.projectiles.map(hp => {
      const lp = lo.projectiles.find(p => p.id === hp.id);
      if (!lp) return hp;
      return { ...hp, x: interpolate(lp.x, hp.x), y: interpolate(lp.y, hp.y) };
    });

    return { players, projectiles };
  }

  get isConnected(): boolean { return this.connected; }
  get myPlayerId(): number | null { return this.playerId; }
  get latestSnapshot(): MsgSnap | null { return this.latestSnap; }
}
