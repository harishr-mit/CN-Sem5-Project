/**
 * core.ts — transport-agnostic game server core.
 * SPEC.md §9.2. Owns rooms and connections; adapters (WebSocket today, UDP
 * later) feed it raw text messages and give it a `send` callback per peer.
 * Also used in-process by the netcode test harness.
 */

import { decodeClient, encodeServer } from '@nobu/shared/protocol';
import type { MsgInput, MsgSnap, ServerMsg } from '@nobu/shared/protocol';
import { createEncoder, DEFAULT_SYNC, normalizeSync, sameSync, type SyncEncoder, type SyncSpec, type VelocityTable } from '@nobu/shared/sync';
import NET from '@nobu/shared/config/net.js';
import GAME from '@nobu/shared/config/game.js';
import { Room } from './game/room.js';

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
  room: Room | null;
  nonce: string | null;
  lastMsg: number;
  msgCount: number;
  msgCountWindow: number;
}

let nextConnId = 1;

export class GameServer {
  readonly rooms = new Map<string, Room>();
  private readonly connections = new Set<Connection>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
    this.getRoom('main');
    this.getRoom('lab');
  }

  getRoom(name: string): Room {
    let room = this.rooms.get(name);
    if (!room) {
      room = new Room(
        name,
        (playerId, snap, vel) => {
          for (const conn of this.connections) {
            if (conn.room === room && conn.playerId === playerId) { this.sendSnapshot(conn, snap, vel); break; }
          }
        },
        (snap) => {
          const text = encodeServer(snap);
          for (const conn of this.connections) if (conn.room === room && conn.spectator) conn.send(text);
        }
      );
      this.rooms.set(name, room);
    }
    return room;
  }

  addConnection(send: (text: string) => void, close: () => void): Connection {
    const t = this.now();
    const conn: Connection = {
      id: nextConnId++, send, close,
      playerId: null, spectator: false, room: null, nonce: null,
      sync: DEFAULT_SYNC, encoder: createEncoder(DEFAULT_SYNC),
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

  /** Drop connections silent for longer than `timeoutMs` (SPEC.md §9.2). */
  checkTimeouts(): void {
    const t = this.now();
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
        const room = this.getRoom(msg.room === 'lab' ? 'lab' : 'main');
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
        if (msg.sync) this.setSync(conn, msg.sync);
        conn.playerId = room.addPlayer(msg.name);
        conn.room = room;
        conn.nonce = msg.nonce;
        this.sendWelcome(conn, msg.nonce);
        console.log(`[server] Player ${conn.playerId} "${msg.name}" joined ${room.name}`);
        break;
      }

      case 'input':
        if (conn.playerId === null || !conn.room) return;
        if (msg.sa !== undefined) conn.encoder.onAck(msg.sa);
        conn.room.receiveInput(conn.playerId, (msg as MsgInput).inputs);
        break;

      case 'snapAck':
        conn.encoder.onAck(msg.tick);
        break;

      case 'sync':
        if (!conn.spectator) this.setSync(conn, msg);
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
        if (conn.playerId !== null && conn.room) {
          conn.room.receivePerturb(conn.playerId, msg.dx, msg.dy);
        }
        break;

      case 'lab':
        if (conn.room) conn.room.setMovers(msg.movers);
        break;

      case 'dev':
        if (conn.playerId !== null && conn.room) conn.room.setDev(conn.playerId, msg.invincible);
        break;

      case 'bye':
        this.removeConnection(conn);
        conn.close();
        break;
    }
  }

  /** Switch a connection's sync model; the same spec keeps the encoder (and its delta base). */
  private setSync(conn: Connection, spec: SyncSpec): void {
    const next = normalizeSync({ model: spec.model, ...(spec.hz ? { hz: spec.hz } : {}) });
    if (sameSync(next, conn.sync)) return;
    conn.sync = next;
    conn.encoder = createEncoder(next);
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
    }));
  }
}
