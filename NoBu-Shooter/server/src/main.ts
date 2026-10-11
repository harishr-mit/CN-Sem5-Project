/**
 * main.ts — NoBu Shooter authoritative game server (WebSocket + UDP adapters).
 * SPEC.md §9. Game logic lives in core.ts / game/room.ts; this file only
 * bridges WebSocket connections and UDP peers (udp.ts) to the GameServer and
 * runs the tick loop.
 *
 * Ports: ws 8080, udp 8081. Clients normally connect via the emulator.
 * Bind address: `--host <ip>` or NOBU_HOST (default: all interfaces, so other
 * machines can join; docs/PHASE5_PLAN.md D15).
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import NET from '@nobu/shared/config/net.js';
import GAME from '@nobu/shared/config/game.js';
import { GameServer } from './core.js';
import { startFixedLoop } from './loop.js';
import { exitWithParent } from './parentWatch.js';
import { startUdpServer, type UdpServerHandle } from './udp.js';

const hostIdx = process.argv.indexOf('--host');
const HOST = (hostIdx !== -1 ? process.argv[hostIdx + 1] : undefined) || process.env.NOBU_HOST || undefined;
const where = (port: number, scheme: string) => HOST ? `${scheme}${HOST}:${port}` : `${scheme}0.0.0.0:${port} (all interfaces; this machine: 127.0.0.1:${port})`;

const game = new GameServer();
let udp: UdpServerHandle | null = null;

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
httpServer.listen(PORT, HOST, async () => {
  console.log(`[server] Listening on ${where(PORT, 'ws://')}`);
  try {
    udp = await startUdpServer(game, { port: NET.ports.serverUdp, host: HOST });
    console.log(`[server] Listening on ${where(udp.port, 'udp ')}`);
  } catch (err) {
    console.error(`[server] UDP adapter failed: ${(err as Error).message}`);
    process.exit(1);
  }
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
  void udp?.close();
  wss.close();
  httpServer.close();
});
