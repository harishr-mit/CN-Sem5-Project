/**
 * main.ts — NoBu Shooter authoritative game server (WebSocket adapter).
 * SPEC.md §9. Game logic lives in core.ts / game/room.ts; this file only
 * bridges WebSocket connections to the GameServer and runs the tick loop.
 *
 * Ports: server data 8080 (ws). Clients normally connect via the emulator.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import NET from '@nobu/shared/config/net.js';
import GAME from '@nobu/shared/config/game.js';
import { GameServer } from './core.js';
import { startFixedLoop } from './loop.js';
import { exitWithParent } from './parentWatch.js';

const game = new GameServer();

const httpServer = createServer();
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws: WebSocket) => {
  const conn = game.addConnection(
    (text) => { if (ws.readyState === WebSocket.OPEN) ws.send(text); },
    () => ws.close()
  );
  ws.on('message', (raw: Buffer | string) => game.handleMessage(conn, raw.toString()));
  ws.on('close', () => game.removeConnection(conn));
  ws.on('error', (err) => console.error('[server] WebSocket error:', err.message));
});

const PORT = NET.ports.server;
httpServer.listen(PORT, async () => {
  console.log(`[server] Listening on ws://127.0.0.1:${PORT}`);
  let lastTimeoutCheck = 0;
  await startFixedLoop(GAME.sim.hz, () => game.tick(), () => {
    const t = Date.now();
    if (t - lastTimeoutCheck >= 250) {
      lastTimeoutCheck = t;
      game.checkTimeouts();
    }
  });
});

exitWithParent(() => {
  wss.close();
  httpServer.close();
});
