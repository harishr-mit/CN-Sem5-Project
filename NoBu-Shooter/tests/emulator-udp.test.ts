/**
 * emulator-udp.test.ts — the emulator's UDP routes and the whole UDP path
 * (docs/PHASE5_PLAN.md tests 2 and 4; PHASES.md U3, U7).
 * Real sockets on 127.0.0.1 with ephemeral ports.
 */

import { describe, it, expect, afterEach } from 'vitest';
import dgram from 'dgram';
import type { AddressInfo } from 'net';
import { performance } from 'perf_hooks';
import { createEmulator, type Emulator } from '../emulator/src/emulator.js';
import { DEFAULT_LINK_CONFIG, type PacketEvent } from '../emulator/src/pipeline.js';
import { GameServer } from '../server/src/core.js';
import { startUdpServer, type UdpServerHandle } from '../server/src/udp.js';
import { NetClient } from '../client/src/net/NetClient.js';
import { ALL_MODELS } from '../client/src/net/allModels.js';
import { udpTransport, type UdpTransportHandle } from '../scripts/lib/udp-transport.js';

const LOCAL = '127.0.0.1';

const until = async (cond: () => boolean, ms = 4000) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('condition not met in time');
    await new Promise((r) => setTimeout(r, 10));
  }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A UDP socket on 127.0.0.1 that records what it receives (optionally echoing). */
async function udpEnd(echo = false, port = 0) {
  const sock = dgram.createSocket('udp4');
  const got: Buffer[] = [];
  sock.on('message', (m, r) => {
    got.push(m);
    if (echo) sock.send(m, r.port, r.address);
  });
  await new Promise<void>((r) => sock.bind(port, LOCAL, () => r()));
  return {
    sock, got,
    port: (sock.address() as AddressInfo).port,
    send: (data: Buffer | string, to: number) => sock.send(typeof data === 'string' ? Buffer.from(data) : data, to, LOCAL),
    close: () => new Promise<void>((r) => sock.close(() => r())),
  };
}

/** A free UDP port (bound then released). */
async function freeUdpPort(): Promise<number> {
  const e = await udpEnd();
  const p = e.port;
  await e.close();
  return p;
}

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const c of cleanups.reverse()) await c();
  cleanups.length = 0;
});

async function emulatorWithUdpRoute(targetPort: number, opts: { udpIdleMs?: number; maxSessionsPerRoute?: number } = {}) {
  const emu = await createEmulator({ controlPort: 0, seed: 99, ...opts });
  cleanups.push(() => emu.close());
  const route = await emu.routes.add({ proto: 'udp', host: LOCAL, port: 0, target: `${LOCAL}:${targetPort}` });
  return { emu, route };
}

describe('Emulator UDP routes (PHASE5_PLAN test 2)', () => {
  it('clean link: every datagram arrives byte-identical and in order', async () => {
    const target = await udpEnd();
    cleanups.push(target.close);
    const { route } = await emulatorWithUdpRoute(target.port);
    const client = await udpEnd();
    cleanups.push(client.close);
    const sent: Buffer[] = [];
    for (let i = 0; i < 200; i++) {
      const b = i % 2 ? Buffer.from(`#${i} hello`) : Buffer.from([i & 0xff, 0, 0xff, 0x80, i >> 8]);
      sent.push(b);
      client.send(b, route.port);
    }
    await until(() => target.got.length === 200);
    target.got.forEach((b, i) => expect(Buffer.compare(b, sent[i])).toBe(0));
  });

  it('seeded 30 % loss: the target receives exactly the datagrams the pipeline delivered', async () => {
    const target = await udpEnd();
    cleanups.push(target.close);
    const { emu, route } = await emulatorWithUdpRoute(target.port);
    emu.routes.applyPreset(route.id, 'loss30', { ...DEFAULT_LINK_CONFIG, lossPct: 30, latencyMs: 2 });
    const events: PacketEvent[] = [];
    const prev = emu.routes.onPacketEvent;
    emu.routes.onPacketEvent = (ev) => { events.push(ev); prev?.(ev); };
    const client = await udpEnd();
    cleanups.push(client.close);
    for (let i = 0; i < 400; i++) client.send(`#${i}`, route.port);
    await until(() => events.filter((e) => e.dir === 'up').length === 400);
    await sleep(50);
    const delivered = events.filter((e) => e.dir === 'up' && e.fate === 'delivered').map((e) => e.preview).sort();
    const dropped = events.filter((e) => e.dir === 'up' && e.fate === 'dropped-loss').length;
    const received = target.got.map((b) => b.toString()).sort();
    expect(received).toEqual(delivered);
    expect(dropped).toBeGreaterThan(80);
    expect(dropped).toBeLessThan(160);
  });

  it('two clients on one host get separate sessions; config and replies stay per session', async () => {
    const target = await udpEnd(true);
    cleanups.push(target.close);
    const { emu, route } = await emulatorWithUdpRoute(target.port);
    const a = await udpEnd();
    const b = await udpEnd();
    cleanups.push(a.close, b.close);
    a.send('from-a', route.port);
    b.send('from-b', route.port);
    await until(() => emu.routes.sessions.size === 2 && a.got.length === 1 && b.got.length === 1);
    expect(a.got[0].toString()).toBe('from-a');
    expect(b.got[0].toString()).toBe('from-b');
    const sessions = [...emu.routes.sessions.values()];
    expect(new Set(sessions.map((s) => s.peer))).toEqual(new Set([`${LOCAL}:${a.port}`, `${LOCAL}:${b.port}`]));

    // Name one by its peer address (the swarm does this) and impair only it
    expect(emu.routes.labelSession(`${LOCAL}:${a.port}`, 'UDP-1', route.id)).toBe(true);
    expect(emu.routes.setConfig('UDP-1', 'both', { lossPct: 100 })).toBe(true);
    for (let i = 0; i < 20; i++) { a.send(`a${i}`, route.port); b.send(`b${i}`, route.port); }
    await until(() => b.got.length === 21);
    await sleep(50);
    expect(a.got.length).toBe(1);
    const sa = sessions.find((s) => s.label === 'UDP-1')!;
    const sb = sessions.find((s) => s !== sa)!;
    expect(sa.upLink.getStats(Date.now()).pktsDroppedLoss).toBe(20);
    expect(sb.upLink.getStats(Date.now()).pktsDroppedLoss).toBe(0);
  });

  it('idle sessions close; the next datagram opens a new one with the same label', async () => {
    const target = await udpEnd();
    cleanups.push(target.close);
    const { emu, route } = await emulatorWithUdpRoute(target.port, { udpIdleMs: 150 });
    const c = await udpEnd();
    cleanups.push(c.close);
    c.send('one', route.port);
    await until(() => emu.routes.sessions.size === 1);
    const first = [...emu.routes.sessions.values()][0];
    emu.routes.labelSession(first.peer, 'kept');
    await until(() => emu.routes.sessions.size === 0, 2000);
    c.send('two', route.port);
    await until(() => emu.routes.sessions.size === 1);
    const second = [...emu.routes.sessions.values()][0];
    expect(second.id).not.toBe(first.id);
    expect(second.label).toBe('kept');
    await until(() => target.got.length === 2);
  });

  it('a full route refuses new peers (session cap) and counts them', async () => {
    const target = await udpEnd();
    cleanups.push(target.close);
    const { emu, route } = await emulatorWithUdpRoute(target.port, { maxSessionsPerRoute: 1 });
    const a = await udpEnd();
    const b = await udpEnd();
    cleanups.push(a.close, b.close);
    a.send('a', route.port);
    await until(() => emu.routes.sessions.size === 1);
    b.send('b', route.port);
    await until(() => emu.routes.getRoute(route.id)!.refused === 1);
    expect(emu.routes.sessions.size).toBe(1);
  });

  it('a client that starts before its target keeps its session (ICMP unreachable is survived)', async () => {
    const targetPort = await freeUdpPort();
    const { emu, route } = await emulatorWithUdpRoute(targetPort);
    const c = await udpEnd();
    cleanups.push(c.close);
    for (let i = 0; i < 5; i++) { c.send(`early${i}`, route.port); await sleep(10); }
    await sleep(50);
    const target = await udpEnd(false, targetPort);
    cleanups.push(target.close);
    c.send('late', route.port);
    await until(() => target.got.some((b) => b.toString() === 'late'));
    expect(emu.routes.sessions.size).toBe(1);
  });
});

describe('NetClient over UDP through the emulator (PHASE5_PLAN test 4)', () => {
  async function stack(lossPct: number) {
    const game = new GameServer();
    const udp: UdpServerHandle = await startUdpServer(game, { port: 0, host: LOCAL });
    const tick = setInterval(() => { game.tick(); game.checkTimeouts(); }, 1000 / 60);
    cleanups.push(async () => { clearInterval(tick); await udp.close(); });
    const { emu, route } = await emulatorWithUdpRoute(udp.port);
    emu.routes.applyPreset(route.id, 'test', { ...DEFAULT_LINK_CONFIG, latencyMs: 10, lossPct });
    return { game, route };
  }

  function client(port: number, sync: 'full' | 'delta', handles: UdpTransportHandle[]) {
    const c = new NetClient({ models: ALL_MODELS,
      url: `udp://${LOCAL}:${port}`, name: `UDP-${sync}`, room: 'main', labelPrefix: 'udp',
      transport: udpTransport({ onCreate: (h) => handles.push(h) }), now: () => performance.now(),
      sync: { model: sync },
    });
    cleanups.push(() => c.disconnect());
    return c;
  }

  /** The real client's loops: 60 Hz simulation, 30 Hz send, render + metrics. */
  function drive(clients: NetClient[], ms: number): Promise<void> {
    let step = 0;
    return new Promise((resolve) => {
      const t = setInterval(() => {
        step++;
        for (const c of clients) {
          c.keys = [1, 8, 2, 4][Math.floor(step / 45) % 4];
          c.simStep();
          if (step % 2 === 0) c.sendInputs();
          c.getInterpolatedState();
          c.framePresented(1000 / 60);
        }
      }, 1000 / 60);
      setTimeout(() => { clearInterval(t); resolve(); }, ms);
    });
  }

  it('clean link: joins over UDP, moves, 0 corrections, snapshots reassembled', async () => {
    const { route } = await stack(0);
    const handles: UdpTransportHandle[] = [];
    const c = client(route.port, 'full', handles);
    const corrections: number[] = [];
    c.on('correction', (ev) => corrections.push(ev.errorPx));
    c.connect();
    await until(() => c.isConnected, 4000);
    await drive([c], 2500);
    expect(c.latestSnapshot?.players.some((p) => p.id === c.myPlayerId)).toBe(true);
    expect(corrections.filter((e) => e > 1)).toEqual([]);
    expect(handles[0].stats.messagesReassembled).toBeGreaterThan(0);
    expect(handles[0].stats.messagesDropped).toBe(0);
  }, 15_000);

  it('10 % loss: fragmented full snapshots are lost more often than single-datagram deltas', async () => {
    const { route } = await stack(10);
    const hFull: UdpTransportHandle[] = [];
    const hDelta: UdpTransportHandle[] = [];
    const full = client(route.port, 'full', hFull);
    const delta = client(route.port, 'delta', hDelta);
    full.connect();
    delta.connect();
    await until(() => full.isConnected && delta.isConnected, 6000);
    await drive([full, delta], 4000);
    const f = hFull[0].stats;
    // Full snapshots of a 4-player match need 2 fragments: ≈ 19 % of them are lost (1 − 0.9²)
    const fullLoss = f.messagesDropped / (f.messagesDropped + f.messagesReassembled);
    expect(f.messagesReassembled).toBeGreaterThan(30);
    expect(fullLoss).toBeGreaterThan(0.1);
    expect(fullLoss).toBeLessThan(0.32);
    // Deltas mostly fit one datagram, so they see ≈ the raw 10 % loss
    expect(hDelta[0].stats.fragmentsIn).toBeLessThan(f.fragmentsIn / 3);
    expect(delta.isConnected && full.isConnected).toBe(true);
  }, 20_000);
});
