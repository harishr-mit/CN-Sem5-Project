/**
 * Where the client connects (docs/PHASE7_PLAN.md D5, plan test 6) and the
 * NetClient without the optional sync models (D4, plan test 9).
 */
import { describe, it, expect } from 'vitest';
import { gameServerUrl, demoServiceUrl, serverOverride, roomFromUrl, roomLink, type PageLocation } from '../client/src/net/serverUrl.js';
import { NetClient, type TransportFactory } from '../client/src/net/NetClient.js';
import { ALL_MODELS } from '../client/src/net/allModels.js';
import { GameServer } from '../server/src/core.js';

const page = (href: string): PageLocation & { origin: string; pathname: string } => {
  const u = new URL(href);
  return { protocol: u.protocol, host: u.host, hostname: u.hostname, search: u.search, origin: u.origin, pathname: u.pathname };
};

describe('Server address (serverUrl.ts)', () => {
  it('the game connects to /ws on the host that served the page', () => {
    expect(gameServerUrl(page('http://192.168.1.5:8080/'))).toBe('ws://192.168.1.5:8080/ws');
    expect(gameServerUrl(page('http://localhost:5173/'))).toBe('ws://localhost:5173/ws');
    expect(gameServerUrl(page('https://nobu.example.org/'))).toBe('wss://nobu.example.org/ws');
  });

  it('?server= overrides it (host:port or a full URL); junk is ignored', () => {
    expect(gameServerUrl(page('http://192.168.1.5:8080/?server=192.168.1.5:9000'))).toBe('ws://192.168.1.5:9000');
    expect(gameServerUrl(page('https://a.example/?server=b.example:443'))).toBe('wss://b.example:443');
    expect(gameServerUrl(page('http://h:8080/?server=ws://10.0.0.2:9000'))).toBe('ws://10.0.0.2:9000');
    expect(serverOverride(page('http://h:8080/?server=javascript:alert(1)'))).toBeNull();
    expect(serverOverride(page('http://h:8080/?server=a b'))).toBeNull();
    expect(gameServerUrl(page('http://h:8080/?server=a%20b'))).toBe('ws://h:8080/ws');
  });

  it('the demo reaches its emulator and server on the page host', () => {
    expect(demoServiceUrl(page('http://localhost:5173/'), 9000)).toBe('ws://localhost:9000');
    expect(demoServiceUrl(page('http://192.168.1.5:5173/'), 8080)).toBe('ws://192.168.1.5:8080');
    expect(demoServiceUrl(page('http://[::1]:5173/'), 9000)).toBe('ws://[::1]:9000');
  });

  it('room share links', () => {
    expect(roomFromUrl(page('http://h:8080/?room=blue-fox'))).toBe('blue-fox');
    expect(roomFromUrl(page('http://h:8080/'))).toBeNull();
    expect(roomLink(page('http://192.168.1.5:8080/?room=old'), 'blue-fox')).toBe('http://192.168.1.5:8080/?room=blue-fox');
    expect(roomLink(page('http://h:8080/?server=h%3A9000'), 'blue-fox')).toBe('http://h:8080/?server=h%3A9000&room=blue-fox');
  });
});

/** A NetClient wired straight to an in-process GameServer. */
function harness(models: boolean, sync?: { model: 'full' | 'delta' | 'state'; hz?: 10 | 30 }) {
  let t = 0;
  const server = new GameServer(() => t);
  const transport: TransportFactory = (_url, h) => {
    const conn = server.addConnection((text) => queueMicrotask(() => h.onMessage(text)), () => h.onClose());
    queueMicrotask(() => h.onOpen());
    return { send: (text) => server.handleMessage(conn, text), close: () => server.removeConnection(conn) };
  };
  const client = new NetClient({
    url: 'ws://test', name: 'T', room: 'main', transport, now: () => t,
    ...(models ? { models: ALL_MODELS } : {}),
    ...(sync ? { sync } : {}),
  });
  const run = async (ms: number) => {
    for (let i = 0; i < ms / (1000 / 60); i++) {
      t += 1000 / 60;
      server.tick();
      await Promise.resolve();
    }
  };
  return { server, client, run };
}

describe('NetClient without the optional sync models (D4)', () => {
  it('supports Full and Delta only; State / Lockstep requests are refused locally', () => {
    const { client } = harness(false);
    expect(client.supports({ model: 'full' })).toBe(true);
    expect(client.supports({ model: 'delta' })).toBe(true);
    expect(client.supports({ model: 'state', hz: 10 })).toBe(false);
    expect(client.supports({ model: 'lockstep' })).toBe(false);
    client.setSync({ model: 'state', hz: 10 });
    expect(client.sync.model).toBe('full');
    client.setSync({ model: 'delta' });
    expect(client.sync.model).toBe('delta');
  });

  it('a State model asked at construction falls back to the default', () => {
    expect(harness(false, { model: 'state', hz: 10 }).client.sync.model).toBe('full');
    expect(harness(true, { model: 'state', hz: 10 }).client.sync.model).toBe('state');
  });

  it('plays a Delta match end to end without the modules', async () => {
    const { client, run, server } = harness(false, { model: 'delta' });
    const snaps: number[] = [];
    client.on('snap', (snap) => snaps.push(snap.tick));
    client.connect();
    await run(2000);
    expect(client.isConnected).toBe(true);
    expect(client.myPlayerId).not.toBeNull();
    // ≈ 30 snapshots a second, decoded from deltas, every one newer than the last
    expect(snaps.length).toBeGreaterThan(40);
    expect(snaps.every((tick, i) => i === 0 || tick > snaps[i - 1])).toBe(true);
    const conn = [...(server as unknown as { connections: Set<{ sync: unknown; encoder: { fallbacks: number } }> }).connections][0];
    expect(conn.sync).toEqual({ model: 'delta' });
    client.disconnect();
  });
});
