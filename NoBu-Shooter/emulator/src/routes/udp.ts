/**
 * routes/udp.ts — UDP route (PHASES.md U3, docs/PHASE5_PLAN.md §2.1).
 *
 * NAT-like: one session per client source address. Each session gets its own
 * upstream socket (an ephemeral port) towards the target, so the target sees
 * one peer per client and its replies come back to the right client.
 * Payloads are forwarded byte-for-byte; the emulator never reassembles or
 * parses them (each datagram is one packet).
 */

import dgram from 'dgram';
import { parseHostPort, type RouteContext, type RouteHandle, type RouteSpec } from './index.js';
import type { Session } from '../session.js';

interface Peer {
  session: Session;
  upstream: dgram.Socket;
}

const isV6 = (host: string | undefined) => !!host && host.includes(':');

export async function startUdpRoute(spec: RouteSpec, ctx: RouteContext): Promise<RouteHandle> {
  const target = parseHostPort(spec.target)!;
  const sock = dgram.createSocket(isV6(spec.host) ? 'udp6' : 'udp4');
  const peers = new Map<string, Peer>();
  let closed = false;

  const openPeer = (key: string, address: string, port: number): Peer | null => {
    const upstream = dgram.createSocket(isV6(target.host) ? 'udp6' : 'udp4');
    // ICMP "port unreachable" (target not up yet) surfaces as an error on some
    // platforms; the session stays, as a real NAT mapping would.
    upstream.on('error', () => {});
    const session = ctx.openSession({
      label: `udp ${key}`,
      peer: key,
      toTarget: (data) => { if (!closed) upstream.send(data as Buffer, target.port, target.host); },
      toClient: (data) => { if (!closed) sock.send(data as Buffer, port, address); },
      onClose: () => {
        peers.delete(key);
        try { upstream.close(); } catch { /* already closed */ }
      },
    });
    if (!session) {
      upstream.close();
      return null;
    }
    upstream.on('message', (msg, rinfo) => {
      // Only the target's replies belong to this session
      if (rinfo.port === target.port) session.fromTarget(msg, true);
    });
    const peer = { session, upstream };
    peers.set(key, peer);
    return peer;
  };

  sock.on('message', (msg, rinfo) => {
    if (closed) return;
    const key = `${rinfo.address}:${rinfo.port}`;
    const peer = peers.get(key) ?? openPeer(key, rinfo.address, rinfo.port);
    if (!peer) { ctx.refused(); return; }
    peer.session.fromClient(msg, true);
  });
  sock.on('error', (err) => console.error(`[emulator] udp route error: ${err.message}`));

  const port = await new Promise<number>((resolve, reject) => {
    const onError = (err: Error) => { try { sock.close(); } catch { /* not bound */ } reject(err); };
    sock.once('error', onError);
    sock.bind(spec.port, spec.host, () => {
      sock.off('error', onError);
      resolve(sock.address().port);
    });
  });

  // Idle sessions are closed (D7); a new datagram opens a fresh one.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const p of [...peers.values()]) {
      if (now - p.session.lastActivity > ctx.udpIdleMs) ctx.closeSession(p.session);
    }
  }, Math.min(1000, Math.max(50, ctx.udpIdleMs / 4)));
  sweep.unref();

  return {
    port,
    close: () => new Promise<void>((resolve) => {
      closed = true;
      clearInterval(sweep);
      for (const p of [...peers.values()]) ctx.closeSession(p.session);
      sock.close(() => resolve());
    }),
  };
}
