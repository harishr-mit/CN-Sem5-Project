/**
 * main.ts — Network emulator entry point.
 * SPEC.md §11.
 *
 * CLI: node emulator --listen 9000 --target ws://127.0.0.1:8080 --control 9001 --seed 1
 *
 * Data port (9000): client connections go through the impairment pipeline to the target.
 * Control port (9001): the UI talks here to configure impairments live.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { Session } from './session.js';
import { ControlServer } from './control.js';
import { DEFAULT_LINK_CONFIG } from './pipeline.js';

// ─── CLI args ─────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name: string, def: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : def;
}

const listenPort = parseInt(getArg('listen', '9000'), 10);
const target = getArg('target', 'ws://127.0.0.1:8080');
const controlPort = parseInt(getArg('control', '9001'), 10);
const seed = parseInt(getArg('seed', '1'), 10);

// ─── Session registry ─────────────────────────────────────────
const sessions = new Map<string, Session>();

// ─── Control server ───────────────────────────────────────────
const control = new ControlServer(controlPort, sessions);

// ─── Data server ─────────────────────────────────────────────
const httpServer = createServer();
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (clientWs: WebSocket, req) => {
  const url = new URL(req.url ?? '/', `http://localhost`);
  const label = url.searchParams.get('label') ?? 'client';

  console.log(`[emulator] New session "${label}" → ${target}`);

  // Connect upstream to the game server
  const upstreamWs = new WebSocket(target + req.url);
  const pendingEarlyMsgs: (Buffer | string)[] = [];

  const earlyHandler = (raw: Buffer | string) => {
    pendingEarlyMsgs.push(raw);
  };
  clientWs.on('message', earlyHandler);

  upstreamWs.on('open', () => {
    clientWs.off('message', earlyHandler);
    const session = new Session(
      clientWs, upstreamWs, label, seed,
      control.getDefaults()
    );

    // Route packet events to control server
    session.onPacketEvent = (ev) => control.onPacketEvent(ev);

    sessions.set(session.id, session);
    control.onNewSession();

    // Replay any buffered early messages
    for (const msg of pendingEarlyMsgs) {
      session.handleClientMessage(msg);
    }

    clientWs.on('close', () => {
      sessions.delete(session.id);
      control.onNewSession();
    });
  });

  upstreamWs.on('error', (err) => {
    console.error(`[emulator] Upstream error: ${err.message}`);
    clientWs.close();
  });
});

httpServer.listen(listenPort, () => {
  console.log(`[emulator] Data   port: ws://127.0.0.1:${listenPort} → ${target}`);
  console.log(`[emulator] Control port: ws://127.0.0.1:${controlPort}`);
});
