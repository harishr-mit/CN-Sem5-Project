/**
 * udp-transport.ts — NetClient transport over UDP for Node (network players,
 * smoke, tests). Never imported by browser code (docs/PHASE5_PLAN.md D9).
 *
 * URL: udp://host:port (query ignored). Messages larger than one datagram are
 * fragmented and reassembled (shared/src/net/fragment.ts). UDP has no
 * handshake: onOpen fires once the socket is bound, and NetClient's hello
 * retries cover a lost hello or welcome.
 */

import dgram from 'dgram';
import type { AddressInfo } from 'net';
import { Fragmenter, Reassembler } from '../../shared/src/net/fragment.js';
import type { TransportFactory } from '../../client/src/net/NetClient.js';

export interface UdpTransportStats {
  datagramsOut: number;
  datagramsIn: number;
  /** Payload bytes + 28 per datagram, like the emulator's accounting. */
  wireBytesIn: number;
  wireBytesOut: number;
  fragmentsIn: number;
  messagesReassembled: number;
  /** Messages lost because a fragment never came. */
  messagesDropped: number;
}

export interface UdpTransportHandle {
  readonly stats: UdpTransportStats;
  /** Local address "host:port" once bound (what the emulator sees as the peer). */
  localAddress(): string | null;
}

export interface UdpTransportOptions {
  /** Local bind address (default: loopback for a loopback target, else all). */
  bindHost?: string;
  /** Called with the handle when a transport is created (one per connect()). */
  onCreate?: (h: UdpTransportHandle) => void;
  now?: () => number;
}

export function udpTransport(opts: UdpTransportOptions = {}): TransportFactory {
  const now = opts.now ?? Date.now;
  return (url, h) => {
    const u = new URL(url);
    const host = u.hostname.replace(/^\[|\]$/g, '');
    const port = Number(u.port);
    const v6 = host.includes(':');
    const sock = dgram.createSocket(v6 ? 'udp6' : 'udp4');
    const fragmenter = new Fragmenter();
    const reassembler = new Reassembler();
    const stats: UdpTransportStats = {
      datagramsOut: 0, datagramsIn: 0, wireBytesIn: 0, wireBytesOut: 0,
      fragmentsIn: 0, messagesReassembled: 0, messagesDropped: 0,
    };
    let open = false;
    let closed = false;

    const sync = () => {
      stats.fragmentsIn = reassembler.fragmentsIn;
      stats.messagesReassembled = reassembler.messagesReassembled;
      stats.messagesDropped = reassembler.messagesDropped;
    };
    // Lost fragments are counted even when nothing else arrives
    const purge = setInterval(() => { reassembler.purge(now()); sync(); }, 250);
    purge.unref();

    sock.on('message', (msg, rinfo) => {
      if (closed || rinfo.port !== port) return;
      stats.datagramsIn++;
      stats.wireBytesIn += msg.length + 28;
      const text = reassembler.push(msg, now());
      sync();
      if (text !== null) h.onMessage(text);
    });
    sock.on('error', () => { /* ICMP unreachable etc.: UDP carries on */ });
    const loopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';
    const bindHost = opts.bindHost ?? (loopback ? (v6 ? '::1' : '127.0.0.1') : undefined);
    sock.bind(0, bindHost, () => {
      if (closed) return;
      open = true;
      h.onOpen();
    });

    opts.onCreate?.({
      stats,
      localAddress: () => {
        if (!open) return null;
        const a = sock.address() as AddressInfo;
        return `${a.address}:${a.port}`;
      },
    });

    return {
      send: (text) => {
        if (!open || closed) return;
        for (const d of fragmenter.split(text)) {
          stats.datagramsOut++;
          stats.wireBytesOut += d.length + 28;
          sock.send(d, port, host);
        }
      },
      close: () => {
        if (closed) return;
        closed = true;
        clearInterval(purge);
        // Let a final message (bye) leave before the socket goes away
        setTimeout(() => { try { sock.close(); } catch { /* closed */ } h.onClose(); }, 20);
      },
    };
  };
}
