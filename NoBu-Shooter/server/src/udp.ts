/**
 * udp.ts — UDP adapter for the GameServer core (PHASES.md U1, docs/PHASE5_PLAN.md D9).
 *
 * One Connection per remote address:port. Messages larger than one datagram
 * travel as fragments (shared/src/net/fragment.ts) in both directions. A peer
 * that goes silent is removed by GameServer.checkTimeouts(); its address is
 * then forgotten, and a later datagram from it starts a new connection.
 * Binds the same interfaces as the WS adapter (D15): `host` undefined = all.
 */

import dgram from 'dgram';
import { Fragmenter, Reassembler } from '@nobu/shared/net/fragment.js';
import type { Connection, GameServer } from './core.js';

export interface UdpServerOptions {
  port: number;
  /** Bind address; undefined = all IPv4 interfaces. */
  host?: string;
}

export interface UdpServerHandle {
  port: number;
  /** Connected peers ("address:port"). */
  peers(): string[];
  close(): Promise<void>;
}

interface Peer {
  conn: Connection;
  reassembler: Reassembler;
}

export async function startUdpServer(game: GameServer, opts: UdpServerOptions, now: () => number = Date.now): Promise<UdpServerHandle> {
  const sock = dgram.createSocket(opts.host?.includes(':') ? 'udp6' : 'udp4');
  const peers = new Map<string, Peer>();
  let closed = false;

  sock.on('message', (msg, rinfo) => {
    if (closed) return;
    const key = `${rinfo.address}:${rinfo.port}`;
    let peer = peers.get(key);
    if (!peer) {
      const fragmenter = new Fragmenter();
      const conn = game.addConnection(
        (text) => {
          if (closed) return;
          for (const d of fragmenter.split(text)) sock.send(d, rinfo.port, rinfo.address);
        },
        () => { peers.delete(key); },
      );
      peer = { conn, reassembler: new Reassembler() };
      peers.set(key, peer);
    }
    const text = peer.reassembler.push(msg, now());
    if (text !== null) game.handleMessage(peer.conn, text);
  });

  const port = await new Promise<number>((resolve, reject) => {
    sock.once('error', reject);
    sock.bind(opts.port, opts.host, () => {
      sock.off('error', reject);
      resolve(sock.address().port);
    });
  });
  // e.g. ICMP port unreachable after a client vanished: keep serving the others
  sock.on('error', (err) => console.error(`[server] UDP error: ${err.message}`));

  return {
    port,
    peers: () => [...peers.keys()],
    close: () => new Promise((resolve) => {
      closed = true;
      for (const p of [...peers.values()]) game.removeConnection(p.conn);
      peers.clear();
      sock.close(() => resolve());
    }),
  };
}
