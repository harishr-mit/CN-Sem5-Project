/**
 * main.ts — NoBu Shooter authoritative game server.
 * SPEC.md §9.
 *
 * Ports:
 *   server data: 8080 (ws)
 *
 * Listens for WebSocket connections from the network emulator (or directly
 * from clients during development).
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { decodeClient, encodeServer } from '@nobu/shared/protocol';
import type { MsgInput } from '@nobu/shared/protocol';
import NET from '@nobu/shared/config/net.js';
import GAME from '@nobu/shared/config/game.js';
import { Room } from './game/room.js';

// ─── Types ────────────────────────────────────────────────────
interface Connection {
  ws: WebSocket;
  playerId: number | null;
  room: Room | null;
  nonce: string | null;
  lastMsg: number;
  msgCount: number;
  msgCountWindow: number;
}

// ─── Rooms ────────────────────────────────────────────────────
const rooms = new Map<string, Room>();
const connections = new Map<WebSocket, Connection>();

function getRoom(name: string): Room {
  if (!rooms.has(name)) {
    rooms.set(name, new Room(
      name,
      (playerId, msg) => {
        for (const [ws, conn] of connections) {
          if (conn.playerId === playerId) { ws.send(msg); break; }
        }
      },
      (msg) => {
        for (const [ws] of connections) ws.send(msg);
      }
    ));
  }
  return rooms.get(name)!;
}

// ─── Server loop ──────────────────────────────────────────────
const SIM_HZ = GAME.sim.hz;
const TICK_MS = 1000 / SIM_HZ;
const TIMEOUT_MS = NET.timeoutMs;
const MAX_MSG_PER_S = NET.maxMessagesPerSecond;

function startLoop(): void {
  let lastNs = process.hrtime.bigint();
  let accumMs = 0;
  let skipCount = 0;
  const SKIP_THRESHOLD = 5;

  function loop() {
    const nowNs = process.hrtime.bigint();
    const elapsedMs = Number(nowNs - lastNs) / 1_000_000;
    lastNs = nowNs;
    accumMs += elapsedMs;

    // If too far behind, skip ahead
    const maxAccum = TICK_MS * (SKIP_THRESHOLD + 1);
    if (accumMs > maxAccum) {
      skipCount++;
      accumMs = TICK_MS;
    }

    while (accumMs >= TICK_MS) {
      for (const room of rooms.values()) {
        room.tick();
      }
      accumMs -= TICK_MS;
    }

    // Check timeouts
    const now = Date.now();
    for (const [ws, conn] of connections) {
      if (now - conn.lastMsg > TIMEOUT_MS) {
        console.log(`[server] Timeout: player ${conn.playerId}`);
        ws.terminate();
      }
    }

    setImmediate(loop);
  }

  setImmediate(loop);
}

// ─── WebSocket server ─────────────────────────────────────────
const httpServer = createServer();
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws: WebSocket) => {
  const conn: Connection = {
    ws, playerId: null, room: null,
    nonce: null, lastMsg: Date.now(),
    msgCount: 0, msgCountWindow: Date.now(),
  };
  connections.set(ws, conn);

  ws.on('message', (raw: Buffer | string) => {
    const text = raw.toString();
    const now = Date.now();

    // Rate limiting
    conn.msgCount++;
    if (now - conn.msgCountWindow >= 1000) {
      conn.msgCount = 1;
      conn.msgCountWindow = now;
    }
    if (conn.msgCount > MAX_MSG_PER_S) return; // drop excess

    conn.lastMsg = now;
    const msg = decodeClient(text);

    if (!msg) {
      ws.send(encodeServer({ t: 'error', code: 'BAD_MESSAGE', msg: 'Invalid message' }));
      return;
    }

    switch (msg.t) {
      case 'hello': {
        if (msg.v !== 1) {
          ws.send(encodeServer({ t: 'error', code: 'BAD_VERSION', msg: 'Expected v:1' }));
          return;
        }

        // If we already have this nonce, resend welcome
        if (conn.nonce === msg.nonce && conn.playerId !== null) {
          const room = conn.room!;
          const perf = room.metrics.perf;
          ws.send(encodeServer({
            t: 'welcome',
            v: 1,
            playerId: conn.playerId,
            room: room.name,
            simHz: GAME.sim.hz,
            snapshotHz: NET.snapshotHz,
            serverTime: Date.now(),
            nonce: msg.nonce,
          }));
          return;
        }

        const roomName = msg.room === 'lab' ? 'lab' : 'main';
        const room = getRoom(roomName);

        if (room.isFull()) {
          ws.send(encodeServer({ t: 'error', code: 'ROOM_FULL', msg: 'Room is full' }));
          return;
        }

        const playerId = room.addPlayer(msg.name);
        conn.playerId = playerId;
        conn.room = room;
        conn.nonce = msg.nonce;

        ws.send(encodeServer({
          t: 'welcome',
          v: 1,
          playerId,
          room: roomName,
          simHz: GAME.sim.hz,
          snapshotHz: NET.snapshotHz,
          serverTime: Date.now(),
          nonce: msg.nonce,
        }));

        console.log(`[server] Player ${playerId} "${msg.name}" joined ${roomName}`);
        break;
      }

      case 'input': {
        if (conn.playerId === null || conn.room === null) return;
        conn.room.receiveInput(conn.playerId, (msg as MsgInput).inputs);
        break;
      }

      case 'ping': {
        const perf = conn.room?.metrics.perf;
        ws.send(encodeServer({
          t: 'pong',
          id: msg.id,
          ct: msg.ct,
          st: Date.now(),
          tickHz: perf?.achievedHz ?? 0,
          tickMs: perf?.avgTickMs ?? 0,
          tickMsMax: perf?.maxTickMs ?? 0,
        }));
        break;
      }

      case 'perturb': {
        if (conn.playerId !== null && conn.room !== null) {
          conn.room.receivePerturb(conn.playerId, msg.dx, msg.dy);
        }
        break;
      }

      case 'bye': {
        if (conn.playerId !== null && conn.room !== null) {
          conn.room.removePlayer(conn.playerId);
        }
        ws.close();
        break;
      }
    }
  });

  ws.on('close', () => {
    const conn = connections.get(ws);
    if (conn?.playerId !== null && conn?.room) {
      conn.room.removePlayer(conn.playerId!);
    }
    connections.delete(ws);
  });

  ws.on('error', (err) => {
    console.error('[server] WebSocket error:', err.message);
  });
});

// ─── Start ────────────────────────────────────────────────────
const PORT = NET.ports.server;
httpServer.listen(PORT, () => {
  console.log(`[server] Listening on ws://127.0.0.1:${PORT}`);
  startLoop();
});

// Pre-create rooms
getRoom('main');
getRoom('lab');
