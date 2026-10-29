/**
 * Remote access (second touch revision): a forwarded port reaches the server
 * from 127.0.0.1, so the Host header decides — local Host = the demo server,
 * any other Host = the game-mode server (players only); the demo's other
 * ports answer "restricted".
 */
import { describe, it, expect, afterAll } from 'vitest';
import type { AddressInfo } from 'net';
import { request } from 'http';
import { WebSocket } from 'ws';
import { GameServer } from '../server/src/core.js';
import { createGameHttp } from '../server/src/http.js';
import { ControlServer } from '../emulator/src/control.js';
import { RouteManager } from '../emulator/src/routes/index.js';
import { isLocalHost } from '../shared/src/net/localHost.js';

describe('isLocalHost', () => {
  it('this machine only', () => {
    for (const h of ['localhost:5173', '127.0.0.1:8080', '127.0.0.1', '[::1]:9001', undefined]) expect(isLocalHost(h)).toBe(true);
    for (const h of ['abc-5173.euw.devtunnels.ms', '192.168.1.20:8080', 'localhost.evil.com', '127.0.0.1.evil.com']) expect(isLocalHost(h)).toBe(false);
  });
});

function firstMessage(port: number, host: string, hello: object): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { Host: host } });
    const got: Record<string, unknown>[] = [];
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', v: 1, name: 'T', room: 'main', nonce: 'n1', ...hello })));
    ws.on('message', (d) => {
      got.push(JSON.parse(d.toString()));
      if (got.length >= 3) { ws.close(); resolve(got); }
    });
    ws.on('error', reject);
    setTimeout(() => { ws.close(); resolve(got); }, 600);
  });
}

describe('8080 in the demo: local → demo server, remote → game server', () => {
  const demo = new GameServer(Date.now);
  const remote = new GameServer(Date.now, { mode: 'game' });
  const srv = createGameHttp(demo, { remoteGame: remote });
  let port = 0;
  const ready = new Promise<void>((r) => srv.http.listen(0, '127.0.0.1', () => { port = (srv.http.address() as AddressInfo).port; r(); }));
  afterAll(() => srv.close());

  // Spectating is demo-only: the game server answers NOT_ALLOWED, the demo server welcomes
  it('a remote Host lands on the game server', async () => {
    await ready;
    const got = await firstMessage(port, 'abc.devtunnels.ms', { spectate: true });
    expect(got.some((m) => m.t === 'error' && m.code === 'NOT_ALLOWED')).toBe(true);
  });

  it('a local Host keeps the demo server', async () => {
    await ready;
    const got = await firstMessage(port, `localhost:${port}`, { spectate: true });
    expect(got.some((m) => m.t === 'error')).toBe(false);
    expect(got.some((m) => m.t === 'welcome')).toBe(true);
  });
});

describe('9001: the emulator dashboard is local-only by Host', () => {
  it('a tunnel Host gets the restricted page, localhost the dashboard', async () => {
    const control = new ControlServer(new RouteManager({ seed: 1 }), { port: 0 });
    const port = await control.listen();
    const get = (host: string) => new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, path: '/', headers: { Host: host } }, (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: b }));
      });
      req.on('error', reject);
      req.end();
    });
    try {
      const remote = await get('abc-9001.devtunnels.ms');
      expect(remote.status).toBe(403);
      expect(remote.body).toContain('Restricted');
      expect((await get(`127.0.0.1:${port}`)).status).toBe(200);
    } finally {
      await control.close();
    }
  });
});
