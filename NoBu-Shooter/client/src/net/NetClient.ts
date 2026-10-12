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

import { encodeClient, decodeServer, validateLs } from '@nobu/shared/protocol';
import {
  stepPlayer, settlePosition, moverPath, initialCombat, copyCombat, sameCombat, stepCombat, speedMultiplier, isOn, PERMANENT, WEAPONS,
} from '@nobu/shared/sim';
import type { MoverCfg, MoveCfg, CombatState } from '@nobu/shared/sim';
import type {
  MsgSnap, PlayerSnap, ProjectileSnap, InputEntry,
  MsgWelcome, MsgPong, GameEvent, ClientMsg, MoverPattern, WeaponId, MapId,
  MsgSnapDelta, MsgState, StateHz,
} from '@nobu/shared/protocol';
import {
  DeltaDecoder, stateToSnap, normalizeSync, sameSync, sameSyncModel, DEFAULT_SYNC, type SyncSpec, type Velocity,
  type LabWorld, type MsgLs,
} from '@nobu/shared/sync';
import GAME, { mapDef, type PowerupKind } from '@nobu/shared/config/game';
import NET from '@nobu/shared/config/net';
import type { RoomOptions } from '@nobu/shared/rooms/options.js';
import { RemoteErrorTracker, type DrawnEntity } from './remoteError.js';
import type { Extrapolator, ExtrapolateCfg } from './extrapolate.js';
import type { LockstepClient, LockstepClientOptions } from './lockstep.js';

/** A power-up timer in ms for the HUD; a permanent (always-on) one is Infinity. */
const msLeft = (ticks: number): number => (ticks === PERMANENT ? Infinity : ticks * TICK_MS);

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
  /** State sync only: velocities (px/s) and the send rate. */
  vel?: ReadonlyMap<number, Velocity>;
  hz?: StateHz;
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
  /** Wire kbps: payload + 28 B per message, like the emulator (docs/PHASE3_PLAN.md D8). */
  bwUpKbps: number;
  bwDownKbps: number;
  /** Average wire size of the world messages (snap / snapDelta / state) of the last second (bytes). */
  msgBytesDown: number;
  /** Delta sync: complete snapshots received in the last second although deltas were flowing (fallbacks). */
  fullFallbacksPerSec: number;
  /** Delta sync: deltas dropped because their base was unknown (since connect). */
  deltaMissingBase: number;
  /** World messages lost or skipped in the last second (gaps in the tick sequence). */
  snapsLostPerSec: number;
  snapsMissed: number;
  duplicatesIgnored: number;
  reorderedIgnored: number;
  serverTickHz: number;
  serverTickMs: number;
  /** Lab movers vs their exact true path (needs a truth clock, see setTruthClock):
   *  median delay, its spread (IQR / 1.35), mean distance and frozen frames. */
  moverLagMs: number;
  moverWobbleMs: number;
  moverErrorPx: number;
  moverFrozenPct: number;
  /** Frames a moving mover was drawn off its path (extrapolation overshoot), %. */
  moverOffPathPct: number;
  /** Delay samples behind the mover metrics (0 = no data). */
  moverSamples: number;
  /** Lockstep (docs/PHASE6_PLAN.md D7): % of frames frozen waiting for a tick (10 s), stalls begun in the last second, longest stall (ms, 10 s). */
  lsStalledPct: number;
  lsStallsPerSec: number;
  lsLongestStallMs: number;
  /** Lockstep: how far the shown world is behind the server's tick. */
  lsBehindTicks: number;
  lsBehindMs: number;
  /** Lockstep: ticks asked for again (NACK), records received twice, keyframe jumps, hash checks passed, desyncs (must stay 0). */
  lsNackedTicks: number;
  lsDuplicateRecords: number;
  lsResyncs: number;
  lsHashChecks: number;
  lsDesyncs: number;
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

/** The local player's weapon state for the HUD (GAMERULES.md §6–§6b). */
export interface CombatView {
  weapon: WeaponId;
  ammo: number;
  magazine: number;
  /** Spare rounds; null = unlimited (the default weapon). */
  reserve: number | null;
  /** Reload progress 0–1, or null when not reloading. */
  reload: number | null;
  /** Remaining power-up weapon time (ms), 0 for the default weapon. */
  weaponMsLeft: number;
  speedMsLeft: number;
  pierceMsLeft: number;
  dashMsLeft: number;
  /** A dash is available now (Dash active, not cooling down). */
  dashReady: boolean;
  shield: boolean;
  /** Developer invincibility is on (server-confirmed). */
  invincible: boolean;
  /** Times the server corrected the predicted ammo/weapon state (monotonic). */
  corrections: number;
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

/**
 * The optional sync models (docs/PHASE7_PLAN.md D4): State (extrapolation)
 * and Lockstep. The demo, Compare, tests and tools pass all of them
 * (`allModels.ts`); the game passes none, so its bundle has neither, and
 * offers Full and Delta only.
 */
export interface SyncModules {
  extrapolator: (cfg: ExtrapolateCfg) => Extrapolator;
  lockstep: (opts: LockstepClientOptions) => LockstepClient;
}

export interface NetClientOptions {
  /** Base URL of the emulator (or server), e.g. ws://127.0.0.1:9000 */
  url: string;
  name: string;
  /** `main`, `lab`, `new` (create a private room) or a room code (docs/PHASE7_PLAN.md D9). */
  room?: string;
  /** State / Lockstep support; without it only Full and Delta work. */
  models?: SyncModules;
  /** Prefix for the emulator session label; a random suffix keeps it unique. */
  labelPrefix?: string;
  transport?: TransportFactory;
  /** Monotonic local clock in ms. */
  now?: () => number;
  /** Join as a spectator: snapshots only, no player (Compare reference pane). */
  spectate?: boolean;
  /** Sync model (PHASES.md Phase 3); default full. Spectators always get full. */
  sync?: SyncSpec;
}

interface Listeners {
  status: (s: ConnectionStatus) => void;
  welcome: (playerId: number) => void;
  snap: (snap: MsgSnap) => void;
  event: (ev: GameEvent) => void;
  correction: (ev: CorrectionEvent) => void;
  /** A predicted shot of the local player (prediction on only). */
  fire: (weapon: WeaponId) => void;
  /** A predicted reload start (prediction on only). */
  reload: (weapon: WeaponId) => void;
  /** Fire pressed with an empty magazine or during a reload (cosmetic click). */
  dryFire: () => void;
  /** The netcode toggles changed (`setToggles`), e.g. by the Presenter. */
  toggles: (t: PredictionToggle) => void;
  /** The sync model changed (`setSync`). */
  sync: (spec: SyncSpec) => void;
  /** The developer Invincible switch changed (`setDevInvincible`). */
  dev: (invincible: boolean) => void;
}

function moveCfgFor(map: MapId): MoveCfg {
  return {
    speed: GAME.player.speed,
    radius: GAME.player.radius,
    arenaW: GAME.arena.width,
    arenaH: GAME.arena.height,
    obstacles: [...mapDef(map).obstacles],
    hz: GAME.sim.hz,
  };
}

function withSpeed(cfg: MoveCfg, mult: number): MoveCfg {
  return mult === 1 ? cfg : { ...cfg, speed: cfg.speed * mult };
}

const TICK_MS = 1000 / GAME.sim.hz;

const MOVER_CFG: MoverCfg = { speed: GAME.lab.moverSpeed, stopGo: GAME.lab.stopGo };

const SIM_STEP_MS = 1000 / GAME.sim.hz;
const SNAP_EVERY_TICKS = Math.round(GAME.sim.hz / NET.snapshotHz);
const METRICS_INTERVAL_MS = 200; // 5 Hz (SPEC.md §12)
const SEEN_EVENTS_MAX = 1024;
const LATENCY_SAMPLES = 30;
/** Per-message overhead the emulator counts (UDP/IP headers, docs/ASSUMPTIONS.md #3). */
const WIRE_OVERHEAD_BYTES = 28;
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
  /** The room asked for in hello; after the welcome, the room joined (a code for private rooms). */
  private roomName: string;
  private readonly models: SyncModules | null;
  /** Private rooms: the code and whether this client is the host (welcome; the host can change later). */
  private roomCode: string | null = null;
  /** The server's last fatal error (e.g. ROOM_NOT_FOUND), for the UI; null if none. */
  private fatalError: { code: string; msg: string } | null = null;
  private readonly spectating: boolean;
  private readonly nonce: string;
  private readonly transportFactory: TransportFactory;
  private readonly now: () => number;
  private transport: ClientTransport | null = null;
  /** Bumped on every connect/disconnect so callbacks from an old transport are ignored. */
  private generation = 0;

  private listeners: { [K in keyof Listeners]: Set<Listeners[K]> } = {
    status: new Set(), welcome: new Set(), snap: new Set(),
    event: new Set(), correction: new Set(), fire: new Set(),
    reload: new Set(), dryFire: new Set(),
    toggles: new Set(), sync: new Set(), dev: new Set(),
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

  // Map geometry for prediction (from the snapshot, GAMERULES.md §3)
  private map: MapId;
  private moveCfg: MoveCfg;
  /** Firing allowed in this room (the lab room is movement-only). */
  private readonly armed: boolean;

  // Weapon / ammo prediction (shared/src/sim/combat.ts)
  private combat: CombatState = initialCombat();
  private serverCombat: CombatState = initialCombat();
  private combatCorrections = 0;
  private reloadRequested = false;
  private dashRequested = false;
  private prevFireDown = false;
  /** Developer switch (npm run demo); re-sent after every (re)connect. */
  private devInvincible = false;
  /** Presenter: stopped match clock (npm run demo); re-sent after every (re)connect. */
  private devEndless = false;
  /** A PICKUP for us arrived with this snapshot: its state change is not a misprediction. */
  private pickupArrived = false;

  // Sync model (PHASES.md Phase 3)
  private syncSpec: SyncSpec;
  private deltaDecoder = new DeltaDecoder();
  private lastAckSent = -1;
  private extrapolator: Extrapolator | null = null;
  /** World messages of the last second: wire size, and whether it was a delta fallback. */
  private worldMsgs: { t: number; bytes: number; fallback: boolean }[] = [];
  private lostTimes: { t: number; n: number }[] = [];
  private lastMsgBytes = 0;

  // Lockstep (lab only, docs/PHASE6_PLAN.md D5): the replayed world replaces snapshots
  private lockstep: LockstepClient | null = null;
  /** Inputs acknowledged by an `ls` message: shown once the world reaches that tick (Input → Screen). */
  private lsInputMarks: { tick: number; createdAt: number }[] = [];
  /** Tick of the world behind latestSnap (−1 = none yet). */
  private lsViewTick = -1;
  /** The model before lockstep, restored if the server refuses it. */
  private syncBeforeLockstep: SyncSpec = DEFAULT_SYNC;

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

  // Remote error vs the movers' true path (PHASES.md C4)
  private truthClock: (() => number | null) | null = null;
  private remoteError = new RemoteErrorTracker();
  private lastRender: RenderState | null = null;
  private lastRenderAt = 0;

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
    msgBytesDown: 0, fullFallbacksPerSec: 0, deltaMissingBase: 0, snapsLostPerSec: 0,
    moverLagMs: 0, moverWobbleMs: 0, moverErrorPx: 0, moverFrozenPct: 0, moverOffPathPct: 0, moverSamples: 0,
    lsStalledPct: 0, lsStallsPerSec: 0, lsLongestStallMs: 0, lsBehindTicks: 0, lsBehindMs: 0,
    lsNackedTicks: 0, lsDuplicateRecords: 0, lsResyncs: 0, lsHashChecks: 0, lsDesyncs: 0,
  };

  constructor(opts: NetClientOptions) {
    this.url = opts.url;
    this.playerName = opts.name;
    this.roomName = opts.room ?? 'main';
    this.models = opts.models ?? null;
    this.spectating = opts.spectate ?? false;
    this.transportFactory = opts.transport ?? browserWebSocketTransport;
    this.now = opts.now ?? (() => performance.now());
    this.nonce = Math.random().toString(36).slice(2);
    this.label = `${opts.labelPrefix ?? opts.name}-${this.nonce.slice(0, 4)}`;
    const roomCfg = GAME.rooms[this.roomName === 'lab' ? 'lab' : 'main'] as { firing: boolean; map?: string };
    this.armed = roomCfg.firing;
    this.map = mapDef(roomCfg.map ?? GAME.maps.rotation[0]).id;
    this.moveCfg = moveCfgFor(this.map);
    this.syncSpec = normalizeSync(opts.sync ?? DEFAULT_SYNC);
    if (!this.supports(this.syncSpec)) this.syncSpec = DEFAULT_SYNC;
    if (this.syncSpec.model === 'lockstep') {
      if (this.roomName !== 'lab' || this.spectating) this.syncSpec = DEFAULT_SYNC;
      else {
        // The Rd chip picks the recovery (docs/PHASE6_PLAN.md D4)
        if (this.syncSpec.rd) this.toggles = { ...this.toggles, redundancy: true };
        this.syncSpec = { model: 'lockstep' };
        this.lockstep = this.newLockstep();
      }
    }
    this.extrapolator = this.models?.extrapolator({
      maxMs: NET.state.extrapolateMaxMs,
      backMs: NET.state.extrapolateBackMs,
      blendHalfLifeMs: NET.state.blendHalfLifeMs,
      projectileSpeed: GAME.projectile.speed,
      snapPx: NET.reconcile.snapThresholdPx,
      settle: (pos) => settlePosition(pos, this.moveCfg),
    }) ?? null;
  }

  /** Whether this client has the code for a sync model (State and Lockstep are optional, D4). */
  supports(spec: SyncSpec): boolean {
    if (spec.model === 'state') return this.models !== null;
    if (spec.model === 'lockstep') return this.models !== null;
    return true;
  }

  private newLockstep(): LockstepClient {
    return this.models!.lockstep({ rd: this.toggles.redundancy, onDesync: (t, a, b) => this.logDesync(t, a, b) });
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
        this.lastMsgBytes = text.length + WIRE_OVERHEAD_BYTES;
        this.bytesRecv += this.lastMsgBytes;
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
    this.combat = initialCombat();
    this.serverCombat = initialCombat();
    this.reloadRequested = false;
    this.inputCreatedAt.clear();
    this.snapBuffer = [];
    this.latestSnap = null;
    this.latestAppliedTick = -1;
    this.clockInitialized = false;
    this.lastRender = null;
    this.remoteError.reset();
    this.deltaDecoder = new DeltaDecoder();
    this.lastAckSent = -1;
    this.extrapolator?.reset();
    if (this.lockstep) this.lockstep = this.newLockstep();
    this.lsInputMarks = [];
    this.lsViewTick = -1;
  }

  private logDesync(tick: number, ours: number, theirs: number): void {
    console.warn(`[client] Lockstep desync at tick ${tick}: hash ${ours.toString(16)} ≠ server ${theirs.toString(16)}; asking for a keyframe`);
  }

  /** The spec on the wire: lockstep carries the Rd chip as its recovery mode. */
  private wireSync(): SyncSpec {
    return this.syncSpec.model === 'lockstep' ? normalizeSync({ model: 'lockstep', rd: this.toggles.redundancy }) : this.syncSpec;
  }

  private send(msg: ClientMsg): void {
    if (!this.transport) return;
    const text = encodeClient(msg);
    this.transport.send(text);
    this.bytesSent += text.length + WIRE_OVERHEAD_BYTES;
  }

  private startHello(): void {
    const sendHello = () => this.send({
      t: 'hello', v: 1, name: this.playerName, room: this.roomName, nonce: this.nonce,
      ...(this.spectating ? { spectate: true } : {}),
      ...(!this.spectating && this.syncSpec.model !== 'full' ? { sync: this.wireSync() } : {}),
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
      case 'snap': {
        const snap = msg as unknown as MsgSnap;
        // A complete snapshot while deltas were flowing = fallback (base lost or too old)
        this.recordWorldMsg(this.syncSpec.model === 'delta' && this.deltaDecoder.newestTick >= 0);
        this.deltaDecoder.store(snap);
        this.onSnapReceived(snap);
        break;
      }
      case 'snapDelta': {
        this.recordWorldMsg(false);
        const snap = this.deltaDecoder.decode(msg as unknown as MsgSnapDelta);
        if (snap) this.onSnapReceived(snap);
        break;
      }
      case 'state': {
        this.recordWorldMsg(false);
        const { snap, vel, hz } = stateToSnap(msg as unknown as MsgState);
        this.onSnapReceived(snap, vel, hz);
        break;
      }
      case 'ls': {
        const ls = this.lockstep ? validateLs(msg) : null;
        if (!ls) break;
        this.recordWorldMsg(false);
        this.onLockstepMsg(ls);
        break;
      }
      case 'pong': this.onPong(msg as unknown as MsgPong); break;
      case 'error':
        if (msg['code'] === 'LOCKSTEP_LAB_ONLY') {
          // Not fatal: the server kept the previous model (docs/PHASE6_PLAN.md D1)
          console.warn('[client] Lockstep refused (lab room only); back to', this.syncBeforeLockstep.model);
          this.leaveLockstep();
          this.syncSpec = this.syncBeforeLockstep;
          this.emit('sync', this.sync);
          break;
        }
        // Refusals of a single request on the game server keep the connection (docs/PHASE7_PLAN.md D3, D6)
        if (this.connected && (msg['code'] === 'SYNC_FIXED' || msg['code'] === 'NOT_ALLOWED')) {
          console.warn('[client] Refused by the server:', msg['code'], msg['msg']);
          break;
        }
        console.warn('[client] Server error:', msg['code'], msg['msg']);
        this.fatalError = { code: String(msg['code']), msg: String(msg['msg'] ?? '') };
        // A refused hello (no such room, room full…) won't change by asking again
        if (!this.connected) {
          if (this.helloTimer) clearInterval(this.helloTimer);
          if (this.giveUpTimer) clearTimeout(this.giveUpTimer);
          this.helloTimer = this.giveUpTimer = null;
        }
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
    this.playerId = msg.spectator ? null : msg.playerId;
    this.roomName = msg.room;
    this.roomCode = msg.code ?? null;

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
    if (this.devInvincible && this.playerId !== null) this.send({ t: 'dev', invincible: true });
    if (this.devEndless) this.send({ t: 'dev', endless: true });
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

  /** Bookkeeping for one world message (its bytes were already counted in onMessage). */
  private recordWorldMsg(fallback: boolean): void {
    this.worldMsgs.push({ t: this.now(), bytes: this.lastMsgBytes, fallback });
  }

  // ── Lockstep ───────────────────────────────────────────────
  private onLockstepMsg(msg: MsgLs): void {
    const now = this.now();
    this.snapshotTimes.push(now);
    this.lockstep!.receive(msg, now);
    // The inputs the server consumed up to msg.tick: ack delay now, Input → Screen when that tick is shown
    this.pendingInputs = this.pendingInputs.filter((i) => i.s > msg.ack);
    let newestCreated: number | undefined;
    for (const [s, t] of this.inputCreatedAt) {
      if (s > msg.ack) break;
      newestCreated = t;
      this.inputCreatedAt.delete(s);
    }
    if (newestCreated !== undefined) {
      pushCapped(this.ackDelaySamples, now - newestCreated, LATENCY_SAMPLES);
      this.lsInputMarks.push({ tick: msg.tick, createdAt: newestCreated });
      if (this.lsInputMarks.length > 64) this.lsInputMarks.shift();
    }
    this.flushNack();
  }

  /** Send the lsNack the lockstep client wants now, if any (Rd off, or a keyframe request). */
  private flushNack(): void {
    if (!this.lockstep || !this.connected) return;
    const nack = this.lockstep.takeNack(this.now(), this.metrics.rttMs || 100);
    if (nack) this.send({ t: 'lsNack', ...nack });
  }

  /** Advance the lockstep playout for this frame and expose the world as a snapshot. */
  private lockstepFrame(): RenderState {
    const now = this.now();
    const ls = this.lockstep!;
    ls.frame(now);
    const world = ls.current;
    if (!world) return { players: [], projectiles: [] };
    if (world.tick !== this.lsViewTick) {
      this.lsViewTick = world.tick;
      const snap = this.worldSnap(world);
      this.latestSnap = snap;
      if (world.map !== this.map) { this.map = world.map; this.moveCfg = moveCfgFor(this.map); }
      const me = this.playerId === null ? undefined : world.players.get(this.playerId);
      if (me) {
        // Not predicted (docs/PHASE6_PLAN.md D5): the own player is where the replay puts it
        this.authX = this.predictedX = me.x;
        this.authY = this.predictedY = me.y;
        this.smoothOffsetX = this.smoothOffsetY = 0;
        this.lastLife = me.life;
      }
      while (this.lsInputMarks.length && this.lsInputMarks[0].tick <= world.tick) {
        const mark = this.lsInputMarks.shift()!;
        pushCapped(this.inputToScreenSamples, now - mark.createdAt + this.lastFrameMs, LATENCY_SAMPLES);
      }
      this.emit('snap', snap);
    }
    return { players: this.latestSnap!.players, projectiles: [] };
  }

  /** The lab world as a snapshot, so views and HUD work unchanged. */
  private worldSnap(world: LabWorld): MsgSnap {
    const players: PlayerSnap[] = [];
    const base = {
      bot: false, alive: true, protectMs: 0, respawnMs: 0, score: 0, aim: 0,
      weapon: 'handgun' as WeaponId, reloading: false, shield: false, fast: false,
    };
    for (const p of world.players.values()) players.push({ ...base, id: p.id, name: p.name, x: p.x, y: p.y, life: p.life });
    for (const m of world.movers) {
      players.push({ ...base, id: m.id, name: m.pattern.toUpperCase(), bot: true, x: m.x, y: m.y, life: 1, mover: m.pattern });
    }
    return {
      t: 'snap', tick: world.tick, st: world.tick * TICK_MS, ack: 0,
      match: { state: 'RUNNING', map: world.map, timeLeftMs: 0, results: null },
      players, projectiles: [], pickups: [], events: [],
    };
  }

  private leaveLockstep(): void {
    this.lockstep = null;
    this.lsInputMarks = [];
    this.lsViewTick = -1;
  }

  /** The lockstep world being shown (tests, debug), or null. */
  get lockstepWorld(): LabWorld | null { return this.lockstep?.current ?? null; }
  get isLockstep(): boolean { return this.lockstep !== null; }

  // ── Snapshots ──────────────────────────────────────────────
  private onSnapReceived(snap: MsgSnap, vel?: ReadonlyMap<number, Velocity>, hz?: StateHz): void {
    const now = this.now();

    // SPEC.md §8.3: ignore any snapshot not newer than the latest applied
    if (snap.tick <= this.latestAppliedTick) {
      if (snap.tick === this.latestAppliedTick) this.duplicatesIgnored++;
      else this.reorderedIgnored++;
      return;
    }
    if (this.latestAppliedTick !== -1) {
      // State at 10 Hz arrives every 6 ticks; everything else every 2
      const every = hz ? Math.round(GAME.sim.hz / hz) : SNAP_EVERY_TICKS;
      const gap = Math.round((snap.tick - this.latestAppliedTick) / every) - 1;
      if (gap > 0) { this.snapsMissed += gap; this.lostTimes.push({ t: now, n: gap }); }
    }
    this.latestAppliedTick = snap.tick;
    this.latestSnap = snap;
    this.snapshotTimes.push(now);
    if (snap.match.map && snap.match.map !== this.map) {
      // New map (only at COUNTDOWN, when nobody moves)
      this.map = snap.match.map;
      this.moveCfg = moveCfgFor(this.map);
    }

    // Clock offset: EMA of (server time − local arrival time) (SPEC.md §10.5)
    const sample = snap.st - now;
    if (!this.clockInitialized) {
      this.clockOffset = sample;
      this.clockInitialized = true;
    } else {
      this.clockOffset += (sample - this.clockOffset) * NET.clockSmoothing;
    }

    this.snapBuffer.push({
      st: snap.st, arrivedAt: now, players: snap.players, projectiles: snap.projectiles,
      ...(vel ? { vel, hz } : {}),
    });
    if (vel) this.extrapolator?.push({ st: snap.st, players: snap.players, projectiles: snap.projectiles, vel });
    if (this.snapBuffer.length > NET.snapshotBufferSize) this.snapBuffer.shift();

    // Events are cosmetic and repeated for eventRedundancyMs: de-duplicate by eid
    for (const ev of snap.events) {
      if (this.seenEids.has(ev.eid)) continue;
      this.seenEids.add(ev.eid);
      this.seenEidOrder.push(ev.eid);
      if (this.seenEidOrder.length > SEEN_EVENTS_MAX) this.seenEids.delete(this.seenEidOrder.shift()!);
      if (ev.type === 'PICKUP' && ev.playerId === this.playerId) this.pickupArrived = true;
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
    if (snap.me) this.serverCombat = { ...snap.me };

    // Step 2: life change = hard reset (spawn / respawn teleport, not a correction)
    if (me.life !== this.lastLife) {
      this.lastLife = me.life;
      this.predictedX = me.x;
      this.predictedY = me.y;
      this.smoothOffsetX = 0;
      this.smoothOffsetY = 0;
      this.pendingInputs = [];
      this.combat = copyCombat(this.serverCombat);
      return;
    }

    // Step 3: drop acknowledged inputs
    this.pendingInputs = this.pendingInputs.filter(i => i.s > snap.ack);

    // Weapon state: replay the pending inputs on the server's state, always
    // (also with reconciliation off — an ammo counter that never heals would
    // only confuse). Speed changes movement, so the position replay below
    // uses the multiplier of each replayed input.
    const combat = copyCombat(this.serverCombat);
    const mults: number[] = [];
    for (const inp of this.pendingInputs) {
      mults.push(speedMultiplier(combat));
      stepCombat(combat, this.armed && inp.f === 1, this.armed && inp.r === 1, inp.d === 1, inp.k !== 0);
    }
    const pickup = this.pickupArrived;
    this.pickupArrived = false;
    if (snap.me && !sameCombat(combat, this.combat)) {
      // Power-ups are never predicted (GAMERULES.md §6b): adopt them silently
      if (!pickup && (combat.ammo !== this.combat.ammo || combat.weapon !== this.combat.weapon ||
          (combat.reloadTicks > 0) !== (this.combat.reloadTicks > 0))) this.combatCorrections++;
      this.combat = combat;
    }

    if (!this.toggles.reconciliation) return;

    // Steps 4–5: replay pending inputs on top of the authoritative state
    const before = { x: this.predictedX, y: this.predictedY };
    let pos = { x: me.x, y: me.y };
    this.pendingInputs.forEach((inp, i) => { pos = stepPlayer(pos, inp.k, withSpeed(this.moveCfg, mults[i])); });

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
      // State sync draws remote entities without the interpolation delay
      const interp = this.toggles.interpolation && this.syncSpec.model !== 'state' ? NET.interpDelayMs : 0;
      pushCapped(this.inputToScreenSamples, ackDelay + interp + this.lastFrameMs, LATENCY_SAMPLES);
    }
  }

  // ── Simulation / input ─────────────────────────────────────
  /** Call from the fixed 60 Hz sim loop: samples one input and predicts. */
  simStep(): void {
    if (!this.connected || this.playerId === null) return;

    const snap = this.latestSnap;
    const me = snap?.players.find(p => p.id === this.playerId);
    // Lockstep: the lab is always running; we can move once the replayed world has us
    const lsWorld = this.lockstep?.current ?? null;
    const matchRunning = this.lockstep ? lsWorld !== null : snap?.match.state === 'RUNNING';
    const isAlive = this.lockstep ? lsWorld?.players.has(this.playerId) === true : me?.alive ?? false;

    // Decay smoothing offset (half-life smoothHalfLifeMs)
    const alpha = Math.pow(0.5, SIM_STEP_MS / NET.reconcile.smoothHalfLifeMs);
    this.smoothOffsetX *= alpha;
    this.smoothOffsetY *= alpha;

    const pressed = this.fireDown && !this.prevFireDown;
    this.prevFireDown = this.fireDown;
    if (!matchRunning || !isAlive) { this.reloadRequested = false; this.dashRequested = false; return; }

    // Fire is sent while held: the server and the prediction both apply the
    // weapon's cooldown and magazine (shared/src/sim/combat.ts). Reload is
    // re-sent on every input of a predicted reload, so one lost input can't
    // cancel it (the server ignores it while already reloading or full).
    const fire: 0 | 1 = this.fireDown && this.armed ? 1 : 0;
    const reload = this.armed && (this.reloadRequested || this.combat.reloadTicks > 0);
    this.reloadRequested = false;
    // Dash: re-sent during the predicted burst, like reload (ignored while bursting/cooling down)
    const dash = (this.dashRequested && isOn(this.combat.dashTicks)) || this.combat.dashBurstTicks > 0;
    this.dashRequested = false;

    const inp: InputEntry = {
      s: ++this.seq,
      k: this.keys,
      a: Math.round(this.aimAngle * 1000) / 1000,
      f: fire,
      ...(reload ? { r: 1 as const } : {}),
      ...(dash ? { d: 1 as const } : {}),
    };
    const now = this.now();
    this.pendingInputs.push(inp);
    this.inputCreatedAt.set(inp.s, now);
    if (this.unpresentedInputAt === null) this.unpresentedInputAt = now;

    const mult = speedMultiplier(this.combat);
    const res = stepCombat(this.combat, fire === 1, reload, dash, inp.k !== 0);
    if (this.toggles.prediction && !this.lockstep) {
      const pos = stepPlayer({ x: this.predictedX, y: this.predictedY }, inp.k, withSpeed(this.moveCfg, mult));
      this.predictedX = pos.x;
      this.predictedY = pos.y;
      if (res.fired) this.emit('fire', res.fired);
      if (res.reloadStarted) this.emit('reload', this.combat.weapon);
    }
    if (res.dryFire && pressed) this.emit('dryFire');
  }

  /** Ask for a reload (R). Sent with the next input (GAMERULES.md §6a). */
  requestReload(): void {
    this.reloadRequested = true;
  }

  /** Ask for a dash (Space, Dash power-up). Sent with the next input. */
  requestDash(): void {
    this.dashRequested = true;
  }

  /** Developer invincibility; the server honours it only under `npm run demo`. */
  setDevInvincible(on: boolean): void {
    const changed = on !== this.devInvincible;
    this.devInvincible = on;
    if (this.connected && this.playerId !== null) this.send({ t: 'dev', invincible: on });
    if (changed) this.emit('dev', on);
  }

  get devInvincibleOn(): boolean {
    return this.devInvincible;
  }

  /** Developer: give this power-up now, as if picked up (npm run demo only). */
  devGive(kind: PowerupKind): void {
    if (this.connected && this.playerId !== null) this.send({ t: 'dev', give: kind });
  }

  /** Presenter: stop (or restart) the room's match clock (npm run demo only). */
  setDevEndless(on: boolean): void {
    this.devEndless = on;
    if (this.connected) this.send({ t: 'dev', endless: on });
  }

  /**
   * Presenter: restart the room's game, optionally on another map (npm run
   * demo only). Works from a spectator too (Compare's reference pane).
   */
  devRestart(map?: MapId): void {
    if (this.connected) this.send({ t: 'dev', restart: true, ...(map ? { map } : {}) });
  }

  /**
   * Change netcode toggles and tell listeners (the Network Lab follows, so
   * Presenter changes show up in its switches). Latency averages restart
   * when prediction or interpolation changes — the old ones would mislead.
   */
  setToggles(patch: Partial<PredictionToggle>): void {
    const next = { ...this.toggles, ...patch };
    const keys = Object.keys(next) as (keyof PredictionToggle)[];
    if (keys.every((k) => next[k] === this.toggles[k])) return;
    const resetLatency = next.prediction !== this.toggles.prediction || next.interpolation !== this.toggles.interpolation;
    const rdChanged = next.redundancy !== this.toggles.redundancy;
    this.toggles = next;
    if (resetLatency) this.resetLatencySamples();
    this.emit('toggles', { ...next });
    if (rdChanged && this.lockstep) {
      // Lockstep: the Rd chip also switches the recovery (docs/PHASE6_PLAN.md D4)
      this.lockstep.rd = next.redundancy;
      if (this.connected && !this.spectating) this.send({ t: 'sync', ...this.wireSync() });
      this.emit('sync', this.sync);
    }
  }

  /**
   * Call at inputSendHz (30 Hz) to flush inputs to the server (SPEC.md §10.3).
   * In delta sync it also acknowledges the newest decoded snapshot: on the
   * input message (`sa`), or alone (`snapAck`) when no input goes out.
   */
  sendInputs(): void {
    if (!this.connected) return;
    const ackTick = this.lockstep ? this.lockstep.ackTick
      : this.syncSpec.model === 'delta' ? this.deltaDecoder.newestTick : -1;
    const ack = ackTick > this.lastAckSent ? ackTick : null;

    let toSend: InputEntry[] = [];
    if (this.seq !== this.lastSentSeq) {
      toSend = this.toggles.redundancy
        // All unacknowledged inputs, newest last, at most redundancyMax
        ? this.pendingInputs.slice(-NET.redundancyMax)
        // Only the inputs created since the last send (every input is sent once)
        : this.pendingInputs.filter(i => i.s > this.lastSentSeq);
      this.lastSentSeq = this.seq;
    }

    if (toSend.length > 0) this.send({ t: 'input', inputs: toSend, ...(ack !== null ? { sa: ack } : {}) });
    else if (ack !== null) this.send({ t: 'snapAck', tick: ack });
    if (ack !== null) this.lastAckSent = ack;
    this.flushNack(); // a NACK retry is due at most every 1.5 × RTT
  }

  /**
   * Switch the sync model live (PHASES.md Phase 3). The server answers with a
   * self-contained message (full snapshot or state) in the new model.
   */
  setSync(spec: SyncSpec): void {
    const next = normalizeSync(spec);
    if (!this.supports(next)) { console.warn(`[client] The ${next.model} sync model is not part of this build`); return; }
    if (next.model === 'lockstep') {
      // Lab players only (docs/PHASE6_PLAN.md D1); `rd` is the Rd chip
      if (this.roomName !== 'lab' || this.spectating) { console.warn('[client] Lockstep is available in the lab room only'); return; }
      if (next.rd && !this.toggles.redundancy) this.setToggles({ redundancy: true });
    }
    if (sameSyncModel(next, this.syncSpec)) return;
    if (next.model === 'lockstep') {
      this.syncBeforeLockstep = this.syncSpec;
      this.lockstep = this.newLockstep();
    } else if (this.lockstep) {
      this.leaveLockstep();
    }
    this.syncSpec = next.model === 'lockstep' ? { model: 'lockstep' } : next;
    this.lastAckSent = -1;
    this.snapBuffer = [];
    this.extrapolator?.reset();
    this.remoteError.reset();
    if (this.connected && !this.spectating) this.send({ t: 'sync', ...this.wireSync() });
    this.emit('sync', this.sync);
  }

  /** The sync model; lockstep includes `rd` = the Rd chip. */
  get sync(): SyncSpec {
    return { ...this.wireSync() };
  }

  perturb(dx: number, dy: number): void {
    this.send({ t: 'perturb', dx, dy });
  }

  /** Select the active scripted movers (lab room only). */
  setMovers(movers: MoverPattern[]): void {
    this.send({ t: 'lab', movers });
  }

  /** Estimated current server time (ms), or null before the first snapshot. */
  serverNow(): number | null {
    return this.clockInitialized ? this.now() + this.clockOffset : null;
  }

  /**
   * Source of the true server time for the mover metrics — normally the
   * spectator's serverNow(), whose direct connection makes it accurate.
   */
  setTruthClock(clock: (() => number | null) | null): void {
    this.truthClock = clock;
    this.remoteError.reset();
  }

  // ── Rendering helpers ──────────────────────────────────────
  /**
   * Call once per rendered frame. With prediction on, Input → Screen is the
   * time from the first unrendered input to the presentation of this frame
   * (≈ one frame later). SPEC.md §12.
   */
  framePresented(frameMs: number): void {
    this.lastFrameMs = frameMs;
    this.sampleRemoteError();
    if (this.unpresentedInputAt === null) return;
    if (this.toggles.prediction && !this.lockstep) {
      pushCapped(this.inputToScreenSamples, this.now() - this.unpresentedInputAt + frameMs, LATENCY_SAMPLES);
    }
    this.unpresentedInputAt = null;
  }

  /** Remote entities interpolated around `now + clockOffset − interpDelay` (SPEC.md §10.5). */
  getInterpolatedState(): RenderState {
    const state = this.computeRenderState();
    this.lastRender = state;
    this.lastRenderAt = this.now();
    return state;
  }

  /** Compare the movers in the last rendered state with their true path. */
  private sampleRemoteError(): void {
    const state = this.lastRender;
    const truth = this.truthClock?.() ?? null;
    if (!state || truth === null) return;
    const now = this.now();
    // The truth clock reads "now"; the state was computed at lastRenderAt.
    const serverMs = truth - (now - this.lastRenderAt);
    const drawn: DrawnEntity[] = [];
    for (const p of state.players) {
      if (!p.mover || !p.alive) continue;
      const pattern = p.mover;
      drawn.push({ id: p.id, x: p.x, y: p.y, path: (ms) => moverPath(pattern, ms / 1000, MOVER_CFG) });
    }
    if (drawn.length) this.remoteError.sample(this.lastRenderAt, serverMs, drawn);
  }

  private computeRenderState(): RenderState {
    if (this.lockstep) return this.lockstepFrame();
    const latest = this.latestSnap;
    const buf = this.snapBuffer;
    // State sync: extrapolate from the newest state (no interpolation delay, docs/PHASE3_PLAN.md D6)
    if (buf.length > 0 && buf[buf.length - 1].vel && this.extrapolator?.current) {
      return this.extrapolator!.render(this.now() + this.clockOffset);
    }
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
      else {
        // Aim: shortest way round the circle
        const da = Math.atan2(Math.sin(hp.aim - lp.aim), Math.cos(hp.aim - lp.aim));
        players.push({ ...hp, x: lerp(lp.x, hp.x), y: lerp(lp.y, hp.y), aim: lp.aim + da * t });
      }
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
    if (this.lockstep) return { x: this.authX, y: this.authY };
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

    this.worldMsgs = this.worldMsgs.filter(w => now - w.t < 1000);
    this.lostTimes = this.lostTimes.filter(l => now - l.t < 1000);
    m.msgBytesDown = this.worldMsgs.length ? Math.round(mean(this.worldMsgs.map(w => w.bytes))) : 0;
    m.fullFallbacksPerSec = this.worldMsgs.filter(w => w.fallback).length;
    m.deltaMissingBase = this.deltaDecoder.missingBase;
    m.snapsLostPerSec = this.lostTimes.reduce((a, l) => a + l.n, 0);

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

    const re = this.remoteError.stats(now);
    m.moverLagMs = re.lagMs;
    m.moverWobbleMs = re.wobbleMs;
    m.moverErrorPx = re.errorPx;
    m.moverFrozenPct = re.frozenPct;
    m.moverOffPathPct = re.offPathPct;
    m.moverSamples = re.samples;

    if (this.lockstep) {
      const ls = this.lockstep.updateStats(now);
      m.lsStalledPct = ls.stalledPct;
      m.lsStallsPerSec = ls.stallsPerSec;
      m.lsLongestStallMs = ls.longestStallMs;
      m.lsBehindTicks = ls.behindTicks;
      m.lsBehindMs = ls.behindMs;
      m.lsNackedTicks = ls.nackedTicks;
      m.lsDuplicateRecords = ls.duplicateRecords;
      m.lsResyncs = ls.resyncs;
      m.lsHashChecks = ls.hashChecks;
      m.lsDesyncs = ls.desyncs;
    }
  }

  /** Reset the latency averages (e.g. after toggling prediction). */
  resetLatencySamples(): void {
    this.inputToScreenSamples = [];
    this.ackDelaySamples = [];
    this.remoteError.reset();
  }

  /** Weapon state to show: predicted with prediction on, the server's otherwise. */
  get combatView(): CombatView {
    const c = this.toggles.prediction ? this.combat : this.serverCombat;
    const w = WEAPONS[c.weapon];
    const me = this.latestSnap?.players.find((p) => p.id === this.playerId);
    return {
      weapon: c.weapon,
      ammo: c.ammo,
      magazine: w.magazine,
      reserve: c.reserve < 0 ? null : c.reserve,
      reload: c.reloadTicks > 0 ? 1 - c.reloadTicks / w.reloadTicks : null,
      // Always-on power-ups (a private room's options) never run out: Infinity
      weaponMsLeft: msLeft(c.weaponTicks),
      speedMsLeft: msLeft(c.speedTicks),
      pierceMsLeft: msLeft(c.pierceTicks),
      dashMsLeft: msLeft(c.dashTicks),
      dashReady: isOn(c.dashTicks) && c.dashCooldownTicks === 0 && c.dashBurstTicks === 0,
      shield: me?.shield ?? false,
      invincible: me?.invincible ?? false,
      corrections: this.combatCorrections,
    };
  }

  /** Predicted weapon state (tests). */
  get predictedCombat(): CombatState { return copyCombat(this.combat); }
  get mapId(): MapId { return this.map; }
  /** The room: `main`, `lab`, or a private room's code once welcomed (`new` before that). */
  get room(): string { return this.roomName; }
  /** Private rooms: the code (`blue-fox`), null elsewhere. */
  get code(): string | null { return this.roomCode; }
  /** Private rooms: this player may START the match (the host changes when one leaves). */
  get isHost(): boolean {
    const host = this.latestSnap?.match.hostId;
    return this.playerId !== null && host === this.playerId;
  }
  /** The server's fatal error, if the connection ended with one (e.g. `ROOM_NOT_FOUND`). */
  get serverError(): { code: string; msg: string } | null { return this.fatalError; }

  /**
   * START (docs/PHASE7_PLAN.md D9): a private room's host starts the match
   * from the lobby.
   */
  start(): void {
    if (this.connected) this.send({ t: 'start' });
  }

  /** A private room's host sets the match options (owner revision R2; the server ignores anyone else). */
  setRoomOptions(options: RoomOptions): void {
    if (this.connected) this.send({ t: 'roomOptions', options });
  }

  get isConnected(): boolean { return this.connected; }
  get isSpectator(): boolean { return this.spectating; }
  get myPlayerId(): number | null { return this.playerId; }
  get latestSnapshot(): MsgSnap | null { return this.latestSnap; }
  get connectionStatus(): ConnectionStatus { return this.status; }
  /** Authoritative and predicted positions (for tests and debug views). */
  get predicted(): { x: number; y: number } { return { x: this.predictedX, y: this.predictedY }; }
  get pendingCount(): number { return this.pendingInputs.length; }
}
