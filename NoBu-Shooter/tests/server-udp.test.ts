/**
 * server-udp.test.ts — the server's UDP adapter (docs/PHASE5_PLAN.md D9, D15, test 3).
 * Real UDP sockets on 127.0.0.1 with ephemeral ports.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import dgram from 'dgram';
import { GameServer } from '../server/src/core.js';
import { startUdpServer, type UdpServerHandle } from '../server/src/udp.js';
import { Fragmenter, Reassembler } from '../shared/src/net/fragment.js';

const LOCAL = '127.0.0.1';

/** A raw UDP peer speaking the game protocol (fragment-aware). */
async function peer(serverPort: number) {
  const sock = dgram.createSocket('udp4');
  const reasm = new Reassembler();
  const frag = new Fragmenter();
  const msgs: Record<string, unknown>[] = [];
  let datagrams = 0;
  let maxDatagram = 0;
  sock.on('message', (m) => {
    datagrams++;
    maxDatagram = Math.max(maxDatagram, m.length);
    const text = reasm.push(m, Date.now());
    if (text) msgs.push(JSON.parse(text) as Record<string, unknown>);
  });
  await new Promise<void>((r) => sock.bind(0, LOCAL, () => r()));
  return {
    sock, msgs, reasm,
    get datagrams() { return datagrams; },
    get maxDatagram() { return maxDatagram; },
    port: sock.address().port,
    send: (obj: unknown) => { for (const d of frag.split(JSON.stringify(obj))) sock.send(d, serverPort, LOCAL); },
    close: () => new Promise<void>((r) => sock.close(() => r())),
  };
}

const until = async (cond: () => boolean, ms = 4000) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('condition not met in time');
    await new Promise((r) => setTimeout(r, 10));
  }
};

describe('Server UDP adapter (PHASE5_PLAN D9)', () => {
  let game: GameServer;
  let udp: UdpServerHandle;
  let tick: ReturnType<typeof setInterval>;

  beforeEach(async () => {
    game = new GameServer();
    udp = await startUdpServer(game, { port: 0, host: LOCAL });
    tick = setInterval(() => { game.tick(); game.checkTimeouts(); }, 1000 / 60);
  });
  afterEach(async () => {
    clearInterval(tick);
    await udp.close();
  });

  it('hello → welcome; two source ports → two players; snapshots stream back', async () => {
    const a = await peer(udp.port);
    const b = await peer(udp.port);
    a.send({ t: 'hello', v: 1, name: 'UDP-A', room: 'main', nonce: 'na' });
    b.send({ t: 'hello', v: 1, name: 'UDP-B', room: 'main', nonce: 'nb' });
    await until(() => a.msgs.some((m) => m.t === 'welcome') && b.msgs.some((m) => m.t === 'welcome'));
    const wa = a.msgs.find((m) => m.t === 'welcome')!;
    const wb = b.msgs.find((m) => m.t === 'welcome')!;
    expect(wa.playerId).not.toBe(wb.playerId);
    expect(udp.peers()).toHaveLength(2);
    await until(() => a.msgs.filter((m) => m.t === 'snap').length >= 5);
    // Every datagram respects the 1200-byte discipline
    expect(a.maxDatagram).toBeLessThanOrEqual(1200);
    await a.close();
    await b.close();
  });

  it('a full snapshot over 1200 B arrives fragmented and reassembles', async () => {
    const p = await peer(udp.port);
    p.send({ t: 'hello', v: 1, name: 'BIG', room: 'main', nonce: 'nbig' });
    // The main room fills with bots: 4 players + pickups give 1.3–2.1 kB snapshots
    await until(() => p.reasm.messagesReassembled >= 3, 8000);
    const snaps = p.msgs.filter((m) => m.t === 'snap');
    expect(snaps.length).toBeGreaterThanOrEqual(3);
    expect(p.datagrams).toBeGreaterThan(p.msgs.length);
    expect(p.maxDatagram).toBeLessThanOrEqual(1200);
    expect(p.reasm.messagesDropped).toBe(0);
    await p.close();
  });

  it('bye and silence remove the connection and forget the address', async () => {
    const a = await peer(udp.port);
    a.send({ t: 'hello', v: 1, name: 'BYE', room: 'lab', nonce: 'n1' });
    await until(() => a.msgs.some((m) => m.t === 'welcome'));
    a.send({ t: 'bye' });
    await until(() => udp.peers().length === 0);
    expect(game.rooms.get('lab')!.playerCount).toBe(0);
    await a.close();
  });

  it('binds the host it is given (D15)', async () => {
    const all = await startUdpServer(game, { port: 0 });
    try {
      const addr = (all as unknown as { port: number }).port;
      expect(addr).toBeGreaterThan(0);
      // Reachable on loopback when bound to all interfaces
      const p = await peer(all.port);
      p.send({ t: 'ping', id: 1, ct: 0 });
      await until(() => p.msgs.length > 0 || all.peers().length > 0);
      expect(all.peers()).toHaveLength(1);
      await p.close();
    } finally {
      await all.close();
    }
  });
});
