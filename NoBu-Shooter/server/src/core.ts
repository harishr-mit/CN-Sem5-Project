/**
 * core.ts — transport-agnostic game server core.
 * SPEC.md §9.2. Owns rooms and connections; adapters (WebSocket today, UDP
 * later) feed it raw text messages and give it a `send` callback per peer.
 * Also used in-process by the netcode test harness.
 */

import { decodeClient, encodeServer } from '@nobu/shared/protocol';
import type { MsgInput, MsgSnap, ServerMsg, MsgPerturb, MsgLab, MsgDev } from '@nobu/shared/protocol';
import {
  createEncoder, DEFAULT_SYNC, normalizeSync, sameSync, sameSyncModel, LockstepEncoder,
  type SyncEncoder, type SyncSpec, type VelocityTable,
} from '@nobu/shared/sync';
import NET from '@nobu/shared/config/net.js';
import GAME from '@nobu/shared/config/game.js';
import { Room } from './game/room.js';
import { newCode, formatCode } from '@nobu/shared/rooms/codes.js';

/**
 * `demo` (default): everything, as `npm run demo` needs it. `game` (`npm run
 * dev` / `npm start`, docs/PHASE7_PLAN.md D3, D6): players only — no `dev`,
 * `perturb`, `lab`, spectators or lab room, and every connection on Delta.
 */
export type ServerMode = 'demo' | 'game';

export interface GameServerOptions {
  mode?: ServerMode;
  /** `main`'s join window (default GAME.match.joinWindowMs / NOBU_JOIN_WINDOW_MS). */
  joinWindowMs?: number;
  /** Most private rooms at once (default GAME.privateRooms.max). */
  maxPrivateRooms?: number;
  /** A private room without humans is removed after this long (default GAME.privateRooms.emptyGraceMs). */
  emptyGraceMs?: number;
  /** Code picker (tests: deterministic). */
  random?: () => number;
}

const GAME_SYNC: SyncSpec = { model: 'delta' };

export interface Connection {
  readonly id: number;
  send: (text: string) => void;
  close: () => void;
  playerId: number | null;
  /** Spectators receive snapshots but have no player. */
  spectator: boolean;
  /** Sync model of this connection and its encoder (spectators: always full). PHASES.md Phase 3. */
  sync: SyncSpec;
  encoder: SyncEncoder;
  /** Lockstep connections (lab only): what to send instead of snapshots (docs/PHASE6_PLAN.md D9). */
  lockstep: LockstepEncoder | null;
  room: Room | null;
  nonce: string | null;
  lastMsg: number;
  msgCount: number;
  msgCountWindow: number;
}

let nextConnId = 1;

export class GameServer {
  readonly rooms = new Map<string, Room>();
  readonly mode: ServerMode;
  private readonly connections = new Set<Connection>();
  private readonly now: () => number;
  private readonly opts: GameServerOptions;
  /** Private rooms without humans: when they became empty (removed after the grace period). */
  private readonly emptySince = new Map<string, number>();

  constructor(now: () => number = Date.now, opts: GameServerOptions = {}) {
    this.now = now;
    this.opts = opts;
    this.mode = opts.mode ?? 'demo';
    this.getRoom('main');
    if (this.mode === 'demo') this.getRoom('lab');
  }

  /** Private rooms currently open. */
  get privateRoomCount(): number {
    let n = 0;
    for (const r of this.rooms.values()) if (r.kind === 'private') n++;
    return n;
  }

  getRoom(name: string): Room {
    let room = this.rooms.get(name);
    if (!room) {
      room = new Room(
        name,
        (playerId, snap, vel) => {
          for (const conn of this.connections) {
            if (conn.room === room && conn.playerId === playerId) {
              if (conn.lockstep) this.sendLockstep(conn, room!, snap.ack);
              else this.sendSnapshot(conn, snap, vel);
              break;
            }
          }
        },
        (snap) => {
          const text = encodeServer(snap);
          for (const conn of this.connections) if (conn.room === room && conn.spectator) conn.send(text);
        },
        { ...(this.opts.joinWindowMs !== undefined ? { joinWindowMs: this.opts.joinWindowMs } : {}) },
      );
      this.rooms.set(name, room);
    }
    return room;
  }

  addConnection(send: (text: string) => void, close: () => void): Connection {
    const t = this.now();
    const sync = this.mode === 'game' ? GAME_SYNC : DEFAULT_SYNC;
    const conn: Connection = {
      id: nextConnId++, send, close,
      playerId: null, spectator: false, room: null, nonce: null,
      sync, encoder: createEncoder(sync), lockstep: null,
      lastMsg: t, msgCount: 0, msgCountWindow: t,
    };
    this.connections.add(conn);
    return conn;
  }

  /** Remove a connection (socket closed, timed out or said bye). Idempotent. */
  removeConnection(conn: Connection): void {
    if (!this.connections.delete(conn)) return;
    if (conn.playerId !== null && conn.room) {
      conn.room.removePlayer(conn.playerId);
      console.log(`[server] Player ${conn.playerId} left ${conn.room.name}`);
      if (conn.room.kind === 'private' && conn.room.humanCount === 0) this.emptySince.set(conn.room.name, this.now());
    }
    if (conn.spectator && conn.room) conn.room.removeSpectator();
    conn.playerId = null;
    conn.spectator = false;
    conn.room = null;
  }

  /** One fixed simulation tick for every room. */
  tick(): void {
    for (const room of this.rooms.values()) room.tick();
  }

  /** Drop connections silent for longer than `timeoutMs` (SPEC.md §9.2), and empty private rooms. */
  checkTimeouts(): void {
    const t = this.now();
    const grace = this.opts.emptyGraceMs ?? GAME.privateRooms.emptyGraceMs;
    for (const [name, since] of this.emptySince) {
      const room = this.rooms.get(name);
      if (!room || room.humanCount > 0) { this.emptySince.delete(name); continue; }
      if (t - since >= grace) {
        this.rooms.delete(name);
        this.emptySince.delete(name);
        console.log(`[server] Private room ${formatCode(name)} closed (empty)`);
      }
    }
    for (const conn of [...this.connections]) {
      if (t - conn.lastMsg > NET.timeoutMs) {
        console.log(`[server] Timeout: player ${conn.playerId}`);
        this.removeConnection(conn);
        conn.close();
      }
    }
  }

  handleMessage(conn: Connection, text: string): void {
    const t = this.now();

    // Rate limiting (SPEC.md §9.5)
    conn.msgCount++;
    if (t - conn.msgCountWindow >= 1000) {
      conn.msgCount = 1;
      conn.msgCountWindow = t;
    }
    if (conn.msgCount > NET.maxMessagesPerSecond) return;

    conn.lastMsg = t;
    const msg = decodeClient(text);
    const reply = (m: ServerMsg) => conn.send(encodeServer(m));

    if (!msg) {
      reply({ t: 'error', code: 'BAD_MESSAGE', msg: 'Invalid message' });
      return;
    }

    switch (msg.t) {
      case 'hello': {
        if (msg.v !== 1) {
          reply({ t: 'error', code: 'BAD_VERSION', msg: 'Expected v:1' });
          return;
        }
        // Repeated hello (welcome was lost): answer with the same welcome
        if (conn.room) {
          if (conn.nonce === msg.nonce) this.sendWelcome(conn, msg.nonce);
          return;
        }
        const room = this.roomFor(msg.room, reply);
        if (!room) return;
        if (msg.spectate && this.mode === 'game') {
          reply({ t: 'error', code: 'NOT_ALLOWED', msg: 'Spectating is not available on this server' });
          return;
        }
        if (msg.spectate) {
          conn.spectator = true;
          conn.room = room;
          conn.nonce = msg.nonce;
          room.addSpectator();
          this.sendWelcome(conn, msg.nonce);
          console.log(`[server] Spectator joined ${room.name}`);
          return;
        }
        if (room.isFull()) {
          reply({ t: 'error', code: 'ROOM_FULL', msg: 'Room is full' });
          return;
        }
        if (msg.sync && this.mode === 'demo') this.setSync(conn, msg.sync, room);
        conn.playerId = room.addPlayer(msg.name);
        this.emptySince.delete(room.name);
        conn.room = room;
        conn.nonce = msg.nonce;
        this.sendWelcome(conn, msg.nonce);
        console.log(`[server] Player ${conn.playerId} "${msg.name}" joined ${room.name}`);
        break;
      }

      case 'input':
        if (conn.playerId === null || !conn.room) return;
        if (msg.sa !== undefined) { conn.encoder.onAck(msg.sa); conn.lockstep?.onAck(msg.sa); }
        conn.room.receiveInput(conn.playerId, (msg as MsgInput).inputs);
        break;

      case 'snapAck':
        conn.encoder.onAck(msg.tick);
        conn.lockstep?.onAck(msg.tick);
        break;

      case 'lsNack':
        conn.lockstep?.onNack(msg.from, msg.to, msg.key === true);
        break;

      case 'sync':
        if (this.mode === 'game') {
          if (msg.model !== 'delta') reply({ t: 'error', code: 'SYNC_FIXED', msg: 'This server uses delta snapshots only' });
          break;
        }
        if (!conn.spectator && conn.room) this.setSync(conn, msg, conn.room);
        break;

      case 'start':
        // On the game server only a private room's host may start early (never `main`)
        if (this.mode === 'game' && conn.room?.kind !== 'private') break;
        if (conn.room && conn.room.start(conn.playerId)) {
          console.log(`[server] Match started early in ${conn.room.name} by player ${conn.playerId}`);
        }
        break;

      case 'ping': {
        const perf = conn.room?.metrics.perf;
        reply({
          t: 'pong', id: msg.id, ct: msg.ct, st: t,
          tickHz: perf?.achievedHz ?? 0,
          tickMs: perf?.avgTickMs ?? 0,
          tickMsMax: perf?.maxTickMs ?? 0,
        });
        break;
      }

      case 'perturb':
      case 'lab':
      case 'dev':
        if (this.mode === 'game') {
          reply({ t: 'error', code: 'NOT_ALLOWED', msg: `${msg.t} is not available on this server` });
          break;
        }
        this.handleOperator(conn, msg);
        break;

      case 'bye':
        this.removeConnection(conn);
        conn.close();
        break;
    }
  }

  /** Demo-only messages: the Network Lab's nudge, lab movers and developer / Presenter commands. */
  private handleOperator(conn: Connection, msg: MsgPerturb | MsgLab | MsgDev): void {
    switch (msg.t) {
      case 'perturb':
        if (conn.playerId !== null && conn.room) {
          conn.room.receivePerturb(conn.playerId, msg.dx, msg.dy);
        }
        break;

      case 'lab':
        if (conn.room) conn.room.setMovers(msg.movers);
        break;

      case 'dev':
        // Player switches need a player; room commands (Presenter) may come from a spectator
        if (conn.room) conn.room.devCommand(conn.playerId, msg);
        break;
    }
  }

  /**
   * The room a hello asks for (docs/PHASE7_PLAN.md D9): `main`, `lab` (demo
   * only), `new` = a private room with a fresh code, or an existing code.
   * Replies with the error and returns null when there is none.
   */
  private roomFor(name: string, reply: (m: ServerMsg) => void): Room | null {
    if (name === 'main') return this.getRoom('main');
    if (name === 'lab') {
      if (this.mode === 'demo') return this.getRoom('lab');
      reply({ t: 'error', code: 'NOT_ALLOWED', msg: 'The lab room is not available on this server' });
      return null;
    }
    if (name === 'new') {
      const max = this.opts.maxPrivateRooms ?? GAME.privateRooms.max;
      const code = this.privateRoomCount < max
        ? newCode(new Set(this.rooms.keys()), this.opts.random)
        : null;
      if (!code) {
        reply({ t: 'error', code: 'ROOM_LIMIT', msg: 'Too many rooms on this server; try again later' });
        return null;
      }
      const room = this.getRoom(code);
      this.emptySince.set(code, this.now());
      console.log(`[server] Private room ${formatCode(code)} created`);
      return room;
    }
    const room = this.rooms.get(name);
    if (!room || room.kind !== 'private') {
      reply({ t: 'error', code: 'ROOM_NOT_FOUND', msg: `No room ${formatCode(name)}` });
      return null;
    }
    return room;
  }

  /**
   * Switch a connection's sync model; the same spec keeps the encoder (and its
   * delta base). Lockstep only in a room that keeps a lockstep log (the lab),
   * else `LOCKSTEP_LAB_ONLY` and the model stays. A lockstep connection that
   * only changes `rd` keeps its encoder (docs/PHASE6_PLAN.md D1, D4).
   */
  private setSync(conn: Connection, spec: SyncSpec, room: Room): void {
    const next = normalizeSync({ model: spec.model, ...(spec.hz ? { hz: spec.hz } : {}), ...(spec.rd ? { rd: true } : {}) });
    if (sameSync(next, conn.sync)) return;
    if (next.model === 'lockstep') {
      if (!room.lockstepLog) {
        conn.send(encodeServer({ t: 'error', code: 'LOCKSTEP_LAB_ONLY', msg: 'Lockstep is available in the lab room only' }));
        return;
      }
      if (conn.lockstep && sameSyncModel(next, conn.sync)) conn.lockstep.rd = next.rd === true;
      else conn.lockstep = new LockstepEncoder(next.rd === true);
    } else {
      conn.lockstep = null;
    }
    conn.sync = next;
    conn.encoder = createEncoder(next);
  }

  /** One lockstep message: the tick records this connection still needs (docs/PHASE6_PLAN.md D3). */
  private sendLockstep(conn: Connection, room: Room, seqAck: number): void {
    const log = room.lockstepLog;
    if (!log || !conn.lockstep) return;
    const out = conn.lockstep.encode(log, () => room.labKeyframe(), seqAck);
    if (!out) return;
    const text = encodeServer(out);
    conn.send(text);
    room.metrics.recordSync('lockstep', text.length);
  }

  /** One player's snapshot through its connection's sync encoder (docs/PHASE3_PLAN.md D2). */
  private sendSnapshot(conn: Connection, snap: MsgSnap, vel: VelocityTable): void {
    const fallbacksBefore = conn.encoder.fallbacks;
    const out = conn.encoder.encode(snap, vel);
    if (!out) return;
    const text = encodeServer(out);
    conn.send(text);
    const metrics = conn.room?.metrics;
    if (!metrics) return;
    // Bytes count toward the connection's model (a delta fallback is delta traffic)
    metrics.recordSync(conn.sync.model, text.length);
    metrics.sync.deltaFallbacks += conn.encoder.fallbacks - fallbacksBefore;
  }

  private sendWelcome(conn: Connection, nonce: string): void {
    conn.send(encodeServer({
      t: 'welcome', v: 1,
      playerId: conn.playerId ?? 0,
      room: conn.room!.name,
      simHz: GAME.sim.hz,
      snapshotHz: NET.snapshotHz,
      serverTime: this.now(),
      nonce,
      ...(conn.spectator ? { spectator: true } : {}),
      ...(conn.room!.kind === 'private' ? { code: conn.room!.name, host: conn.playerId !== null && conn.room!.hostId === conn.playerId } : {}),
    }));
  }
}
