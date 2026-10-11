/**
 * routes/ws.ts — WebSocket route: every client connection becomes a session
 * with its own upstream connection to the target. Each frame is one packet;
 * text frames stay text, binary frames stay binary (docs/PHASE5_PLAN.md D3).
 * The request path and query are passed upstream; `?label=` names the session.
 */

import { createServer } from 'http';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import type { RouteContext, RouteHandle, RouteSpec } from './index.js';
import type { Session } from '../session.js';

function toBuffer(raw: RawData): Buffer {
  if (Buffer.isBuffer(raw)) return raw;
  if (Array.isArray(raw)) return Buffer.concat(raw);
  return Buffer.from(raw);
}

export async function startWsRoute(spec: RouteSpec, ctx: RouteContext): Promise<RouteHandle> {
  const target = spec.target.replace(/\/$/, '');
  const http = createServer((_req, res) => {
    res.writeHead(426, { 'Content-Type': 'text/plain' });
    res.end('NoBu emulator WebSocket route: connect with a WebSocket client.\n');
  });
  const wss = new WebSocketServer({ server: http });
  // ws re-emits the http server's errors (e.g. EADDRINUSE on listen): the
  // listen promise below reports those, so they must not crash the process.
  let listening = false;
  wss.on('error', (err) => { if (listening) console.error(`[emulator] ws route error: ${err.message}`); });
  const clients = new Set<WebSocket>();

  wss.on('connection', (clientWs, req) => {
    clients.add(clientWs);
    const url = new URL(req.url ?? '/', 'http://localhost');
    const peer = `${req.socket.remoteAddress ?? '?'}:${req.socket.remotePort ?? 0}`;
    const label = url.searchParams.get('label') ?? 'client';

    const upstreamWs = new WebSocket(target + (req.url ?? '/'));
    upstreamWs.on('error', (err) => {
      console.error(`[emulator] ${peer} upstream error: ${err.message}`);
      clientWs.close();
    });
    const early: { data: Buffer; binary: boolean }[] = [];
    const earlyHandler = (raw: RawData, isBinary: boolean) => { early.push({ data: toBuffer(raw), binary: isBinary }); };
    clientWs.on('message', earlyHandler);
    clientWs.on('error', () => clientWs.close());

    let session: Session | null = null;
    clientWs.on('close', () => {
      clients.delete(clientWs);
      if (upstreamWs.readyState === WebSocket.CONNECTING) upstreamWs.terminate();
      else upstreamWs.close();
      if (session) ctx.closeSession(session);
    });

    upstreamWs.on('open', () => {
      if (clientWs.readyState !== WebSocket.OPEN) { upstreamWs.close(); return; }
      session = ctx.openSession({
        label, peer,
        toTarget: (data, binary) => { if (upstreamWs.readyState === WebSocket.OPEN) upstreamWs.send(data, { binary }); },
        toClient: (data, binary) => { if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data, { binary }); },
        onClose: () => { clientWs.close(); upstreamWs.close(); },
      });
      if (!session) {
        ctx.refused();
        clientWs.close(1013, 'route full');
        upstreamWs.close();
        return;
      }
      const s = session;
      clientWs.off('message', earlyHandler);
      clientWs.on('message', (raw, isBinary) => s.fromClient(toBuffer(raw), isBinary));
      upstreamWs.on('message', (raw, isBinary) => s.fromTarget(toBuffer(raw), isBinary));
      upstreamWs.on('close', () => clientWs.close());
      for (const m of early) s.fromClient(m.data, m.binary);
    });
  });

  const port = await new Promise<number>((resolve, reject) => {
    http.once('error', reject);
    http.listen(spec.port, spec.host, () => {
      http.off('error', reject);
      listening = true;
      const addr = http.address();
      resolve(typeof addr === 'object' && addr ? addr.port : spec.port);
    });
  });

  return {
    port,
    close: () => new Promise<void>((resolve) => {
      for (const c of clients) c.terminate();
      wss.close();
      http.close(() => resolve());
      http.closeAllConnections?.();
    }),
  };
}
