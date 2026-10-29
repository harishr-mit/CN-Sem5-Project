/**
 * http.ts — the game server's TCP port: WebSocket connections to the
 * GameServer and, with a static root (`npm start`), the built game
 * (docs/PHASE7_PLAN.md D6, D7). Used by main.ts and by the tests.
 *
 * WebSocket upgrades are accepted on `/ws` (the game's address,
 * client/src/net/serverUrl.ts) and on `/` (the demo, the emulator, tools).
 *
 * `remoteGame`: the demo launcher's second, game-mode server. A request whose
 * Host header is not this machine (a tablet on a forwarded port or the LAN)
 * gets that one — players only, no lab, no operator messages — while local
 * requests keep the demo server (shared/src/net/localHost.ts).
 */

import { createServer, type Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type { GameServer } from './core.js';
import { createStaticHandler } from './static.js';
import { isLocalHost } from '@nobu/shared/net/localHost.js';

export interface GameHttp {
  http: Server;
  wss: WebSocketServer;
  close: () => Promise<void>;
}

export function createGameHttp(game: GameServer, opts: { staticDir?: string; remoteGame?: GameServer } = {}): GameHttp {
  const serveStatic = opts.staticDir ? createStaticHandler(opts.staticDir) : null;
  const http = createServer((req, res) => {
    if (serveStatic?.(req, res)) return;
    res.writeHead(serveStatic ? 405 : 426, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(serveStatic ? 'Method not allowed' : 'NoBu Shooter game server: connect with a WebSocket. To play, open the game page (npm start serves it on this port; npm run dev on 5173).');
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  http.on('upgrade', (req, socket, head) => {
    const path = (req.url ?? '/').split('?')[0];
    if (path !== '/ws' && path !== '/') {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws: WebSocket, req) => {
    const target = opts.remoteGame && !isLocalHost(req.headers.host) ? opts.remoteGame : game;
    const conn = target.addConnection(
      (text) => { if (ws.readyState === WebSocket.OPEN) ws.send(text); },
      () => ws.close()
    );
    ws.on('message', (raw: Buffer | string) => target.handleMessage(conn, raw.toString()));
    ws.on('close', () => target.removeConnection(conn));
    ws.on('error', (err) => console.error('[server] WebSocket error:', err.message));
  });

  const close = () => new Promise<void>((done) => {
    for (const client of wss.clients) client.terminate();
    wss.close();
    http.close(() => done());
    http.closeAllConnections?.();
  });
  return { http, wss, close };
}
