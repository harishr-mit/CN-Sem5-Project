/**
 * emulator-routes.test.ts — runtime routes, route-scoped config, control-port
 * safety and the standalone emulator (docs/PHASE5_PLAN.md tests 5, 6, 7, 9).
 * Real sockets on 127.0.0.1 with ephemeral ports; nothing is exposed.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import http from 'http';
import net from 'net';
import { WebSocket, WebSocketServer } from 'ws';
import { createEmulator, parseRouteArg, type Emulator } from '../emulator/src/emulator.js';
import { previewOf } from '../emulator/src/pipeline.js';
import { sanitizePatch } from '../emulator/src/presets.js';

const LOCAL = '127.0.0.1';

/** A WS echo server on an ephemeral port. */
async function echoServer(): Promise<{ port: number; close: () => Promise<void> }> {
  const wss = new WebSocketServer({ port: 0, host: LOCAL });
  wss.on('connection', (ws) => ws.on('message', (data, isBinary) => ws.send(data, { binary: isBinary })));
  await new Promise<void>((r) => wss.once('listening', () => r()));
  const port = (wss.address() as net.AddressInfo).port;
  return { port, close: () => new Promise((r) => wss.close(() => r())) };
}

/** A control-API client that collects events. */
async function control(port: number, origin?: string): Promise<{ ws: WebSocket; events: Record<string, unknown>[]; send: (cmd: object) => void; next: (pred: (e: Record<string, unknown>) => boolean) => Promise<Record<string, unknown>> }> {
  const ws = new WebSocket(`ws://${LOCAL}:${port}`, origin ? { origin } : {});
  const events: Record<string, unknown>[] = [];
  const waiters: { pred: (e: Record<string, unknown>) => boolean; resolve: (e: Record<string, unknown>) => void }[] = [];
  ws.on('message', (raw) => {
    const e = JSON.parse(raw.toString()) as Record<string, unknown>;
    const w = waiters.find((x) => x.pred(e));
    if (w) { waiters.splice(waiters.indexOf(w), 1); w.resolve(e); } else events.push(e);
  });
  await new Promise<void>((res, rej) => { ws.once('open', () => res()); ws.once('error', rej); });
  return {
    ws, events,
    send: (cmd) => ws.send(JSON.stringify(cmd)),
    next: (pred) => new Promise((res, rej) => {
      const found = events.find(pred);
      if (found) { events.splice(events.indexOf(found), 1); return res(found); }
      waiters.push({ pred, resolve: res });
      setTimeout(() => rej(new Error('timed out waiting for a control event')), 3000);
    }),
  };
}

function wsClient(url: string): Promise<WebSocket> {
  const ws = new WebSocket(url);
  return new Promise((res, rej) => { ws.once('open', () => res(ws)); ws.once('error', rej); });
}

const until = async (cond: () => boolean, ms = 3000) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('condition not met in time');
    await new Promise((r) => setTimeout(r, 10));
  }
};

describe('Emulator routes (PHASE5_PLAN D4, D6, D15)', () => {
  let emu: Emulator;
  let echo: Awaited<ReturnType<typeof echoServer>>;
  const sockets: WebSocket[] = [];

  beforeEach(async () => {
    echo = await echoServer();
    emu = await createEmulator({ controlPort: 0, seed: 7 });
  });
  afterEach(async () => {
    for (const s of sockets) s.terminate();
    sockets.length = 0;
    await emu.close();
    await echo.close();
  });

  it('starts with no routes; route.add / route.remove work at runtime', async () => {
    const c = await control(emu.control.port);
    sockets.push(c.ws);
    const first = await c.next((e) => e.evt === 'state');
    expect(first.routes).toEqual([]);

    c.send({ cmd: 'route.add', proto: 'ws', host: LOCAL, port: 0 + await freePort(), target: `ws://${LOCAL}:${echo.port}` });
    const ack = await c.next((e) => e.evt === 'ack');
    const id = ack.id as string;
    expect(id).toMatch(/^ws:\d+$/);
    expect(emu.routes.list().map((r) => r.id)).toEqual([id]);

    // Traffic flows through the new route
    const client = await wsClient(`ws://${LOCAL}:${id.split(':')[1]}/?label=probe`);
    sockets.push(client);
    const reply = new Promise<string>((r) => client.once('message', (d) => r(d.toString())));
    client.send('hello through the route');
    expect(await reply).toBe('hello through the route');
    expect([...emu.routes.sessions.values()].map((s) => s.label)).toEqual(['probe']);

    c.send({ cmd: 'route.remove', id });
    await c.next((e) => e.evt === 'ack' && e.cmd === 'route.remove');
    expect(emu.routes.list()).toEqual([]);
    expect(emu.routes.sessions.size).toBe(0);
    await until(() => client.readyState === WebSocket.CLOSED);
  });

  it('a port in use gives an error event and no route', async () => {
    const blocker = net.createServer();
    await new Promise<void>((r) => blocker.listen(0, LOCAL, () => r()));
    const port = (blocker.address() as net.AddressInfo).port;
    const c = await control(emu.control.port);
    sockets.push(c.ws);
    c.send({ cmd: 'route.add', proto: 'ws', host: LOCAL, port, target: `ws://${LOCAL}:${echo.port}` });
    const err = await c.next((e) => e.evt === 'error');
    expect(err.cmd).toBe('route.add');
    expect(String(err.msg)).toMatch(/EADDRINUSE|in use/i);
    expect(emu.routes.list()).toEqual([]);
    await new Promise<void>((r) => blocker.close(() => r()));

    c.send({ cmd: 'route.add', proto: 'udp', port: 9100, target: 'not a target' });
    expect((await c.next((e) => e.evt === 'error')).msg).toMatch(/host:port/);
  });

  it('a preset on one route leaves the other route alone; "all" reaches both; new sessions inherit their route', async () => {
    const a = await emu.routes.add({ proto: 'ws', host: LOCAL, port: 0, target: `ws://${LOCAL}:${echo.port}` });
    const b = await emu.routes.add({ proto: 'ws', host: LOCAL, port: 0, target: `ws://${LOCAL}:${echo.port}` });
    const ca = await wsClient(`ws://${LOCAL}:${a.port}/?label=A`);
    const cb = await wsClient(`ws://${LOCAL}:${b.port}/?label=B`);
    sockets.push(ca, cb);
    await until(() => emu.routes.sessions.size === 2);
    const byLabel = (l: string) => [...emu.routes.sessions.values()].find((s) => s.label === l)!;

    const c = await control(emu.control.port);
    sockets.push(c.ws);
    c.send({ cmd: 'preset', target: a.id, name: 'Nightmare' });
    await c.next((e) => e.evt === 'state' && (e.routes as { id: string; preset: string }[]).some((r) => r.id === a.id && r.preset === 'Nightmare'));
    expect(byLabel('A').upLink.config.lossPct).toBe(12);
    // state reports the configured loss, not the measured one (both are called lossPct)
    const reported = JSON.parse(JSON.stringify(byLabel('A').getState()));
    expect(reported.up.lossPct).toBe(12);
    expect(reported.stats.up.lossPct).toBe(0);
    expect(byLabel('B').upLink.config.lossPct).toBe(0);
    expect(emu.routes.getRoute(b.id)!.preset).toBe('Baseline');

    // A new session on route A starts from A's defaults
    const ca2 = await wsClient(`ws://${LOCAL}:${a.port}/?label=A2`);
    sockets.push(ca2);
    await until(() => emu.routes.sessions.size === 3);
    expect(byLabel('A2').downLink.config.bandwidthKbps).toBe(400);

    // set on a route merges and marks it Custom
    c.send({ cmd: 'set', target: b.id, direction: 'up', patch: { latencyMs: 33, bogus: 1, lossPct: -5 } });
    await c.next((e) => e.evt === 'state' && (e.routes as { id: string; preset: string }[]).some((r) => r.id === b.id && r.preset === 'Custom'));
    expect(byLabel('B').upLink.config.latencyMs).toBe(33);
    expect(byLabel('B').downLink.config.latencyMs).toBe(0);
    expect(byLabel('B').upLink.config.lossPct).toBe(0);

    // "all" reaches every route and every session
    c.send({ cmd: 'preset', target: 'all', name: 'Transatlantic' });
    await c.next((e) => e.evt === 'state' && e.preset === 'Transatlantic');
    for (const l of ['A', 'A2', 'B']) expect(byLabel(l).upLink.config.latencyMs).toBe(90);
    expect(emu.routes.list().every((r) => r.preset === 'Transatlantic')).toBe(true);

    // unknown targets are reported, not ignored
    c.send({ cmd: 'reset', target: 'ws:1' });
    expect((await c.next((e) => e.evt === 'error')).msg).toMatch(/unknown target/);
  });

  it('a direction-only change on a route reaches only that direction of later sessions', async () => {
    const r = await emu.routes.add({ proto: 'ws', host: LOCAL, port: 0, target: `ws://${LOCAL}:${echo.port}` });
    expect(emu.routes.setConfig(r.id, 'up', { lossPct: 20 })).toBe(true);
    const info = emu.routes.getRoute(r.id)!;
    expect(info.defaults.lossPct).toBe(20);
    expect(info.defaultsDown.lossPct).toBe(0);
    const client = await wsClient(`ws://${LOCAL}:${r.port}/?label=late`);
    sockets.push(client);
    await until(() => emu.routes.sessions.size === 1);
    const s = [...emu.routes.sessions.values()][0];
    expect(s.upLink.config.lossPct).toBe(20);
    expect(s.downLink.config.lossPct).toBe(0);
    // "all" + down only: global defaults for routes added later
    emu.routes.setConfig('all', 'down', { latencyMs: 70 });
    const later = await emu.routes.add({ proto: 'ws', host: LOCAL, port: 0, target: `ws://${LOCAL}:${echo.port}` });
    expect(later.defaults.latencyMs).toBe(0);
    expect(later.defaultsDown.latencyMs).toBe(70);
  });

  it('WS routes forward binary frames byte-for-byte and text as text', async () => {
    const r = await emu.routes.add({ proto: 'ws', host: LOCAL, port: 0, target: `ws://${LOCAL}:${echo.port}` });
    const client = await wsClient(`ws://${LOCAL}:${r.port}/`);
    sockets.push(client);
    const bytes = Buffer.from([0, 1, 2, 0xff, 0xfe, 0x80, 0x7f, 10, 13]);
    const got = new Promise<{ data: Buffer; isBinary: boolean }>((res) => client.once('message', (d, isBinary) => res({ data: d as Buffer, isBinary })));
    client.send(bytes, { binary: true });
    const echoed = await got;
    expect(echoed.isBinary).toBe(true);
    expect(Buffer.compare(echoed.data, bytes)).toBe(0);

    const gotText = new Promise<{ data: Buffer; isBinary: boolean }>((res) => client.once('message', (d, isBinary) => res({ data: d as Buffer, isBinary })));
    client.send('ünïcödé ✓');
    const t = await gotText;
    expect(t.isBinary).toBe(false);
    expect(t.data.toString('utf8')).toBe('ünïcödé ✓');
  });

  it('binds each route on its own host; the control port stays on 127.0.0.1 (D7, D15)', async () => {
    const all = await emu.routes.add({ proto: 'ws', port: 0, target: `ws://${LOCAL}:${echo.port}` });
    const local = await emu.routes.add({ proto: 'udp', host: LOCAL, port: 0, target: `${LOCAL}:9` });
    expect(all.host).toBe('');
    expect(local.host).toBe(LOCAL);
    // The all-interfaces route answers on loopback too
    const client = await wsClient(`ws://${LOCAL}:${all.port}/`);
    sockets.push(client);
    const addr = (emu.control as unknown as { http: http.Server }).http.address() as net.AddressInfo;
    expect(addr.address).toBe(LOCAL);
  });
});

describe('Control-port safety (PHASE5_PLAN D7, test 7)', () => {
  let emu: Emulator;
  beforeEach(async () => { emu = await createEmulator({ controlPort: 0, allowOrigins: ['http://presenter.local:8000'] }); });
  afterEach(async () => { await emu.close(); });

  it('refuses a foreign Origin; accepts none, the dashboard, the game and --allow-origin', async () => {
    const port = emu.control.port;
    await expect(control(port, 'http://evil.example')).rejects.toThrow(/403|Unexpected server response/);
    for (const origin of [undefined, `http://127.0.0.1:${port}`, `http://localhost:${port}`, 'http://localhost:5173', 'http://presenter.local:8000']) {
      const c = await control(port, origin);
      c.ws.close();
    }
  });

  it('serves only the dashboard files', async () => {
    const get = (path: string) => new Promise<{ status: number; body: string }>((res, rej) => {
      http.get({ host: LOCAL, port: emu.control.port, path }, (r) => {
        let body = '';
        r.on('data', (d) => { body += d; });
        r.on('end', () => res({ status: r.statusCode ?? 0, body }));
      }).on('error', rej);
    });
    const index = await get('/');
    expect(index.status).toBe(200);
    expect(index.body).toContain('<title>');
    expect((await get('/app.js')).status).toBe(200);
    expect((await get('/style.css')).status).toBe(200);
    for (const bad of ['/../package.json', '/%2e%2e/package.json', '/src/main.ts', '/dashboard/index.html', '/package.json']) {
      expect((await get(bad)).status).toBe(404);
    }
  });
});

describe('Emulator payloads and standalone package (PHASE5_PLAN D3, tests 5, 9)', () => {
  it('previews text as text and bytes as ASCII or hex', () => {
    expect(previewOf('{"t":"ping"}')).toBe('{"t":"ping"}');
    expect(previewOf(Buffer.from('#12 hello'))).toBe('#12 hello');
    expect(previewOf(Buffer.from([0, 255, 16]))).toBe('hex 00 ff 10');
    expect(previewOf('x'.repeat(100))).toHaveLength(64);
  });

  it('sanitises config patches (known keys, right types, sane ranges)', () => {
    expect(sanitizePatch({ latencyMs: 50, lossPct: 150, jitterDist: 'weird', lossModel: 'burst', burstLen: 0, x: 1, jitterMs: NaN }))
      .toEqual({ latencyMs: 50, lossPct: 100, lossModel: 'burst', burstLen: 1 });
  });

  it('parses CLI routes', () => {
    expect(parseRouteArg('ws:9000=ws://127.0.0.1:8080')).toEqual({ proto: 'ws', port: 9000, target: 'ws://127.0.0.1:8080' });
    expect(parseRouteArg('udp:127.0.0.1:9100=127.0.0.1:8081')).toEqual({ proto: 'udp', host: '127.0.0.1', port: 9100, target: '127.0.0.1:8081' });
    expect(parseRouteArg('udp:[::1]:9100=[::1]:8081')).toEqual({ proto: 'udp', host: '::1', port: 9100, target: '[::1]:8081' });
    expect(() => parseRouteArg('tcp:9000=x')).toThrow();
    expect(() => parseRouteArg('udp:9100=nowhere')).toThrow();
  });

  it('emulator/src imports nothing from the game', () => {
    const root = resolve(__dirname, '../emulator/src');
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|mjs|js)$/.test(f)) files.push(p);
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) {
      const imports = [...readFileSync(f, 'utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const i of imports) expect(i, `${f} imports ${i}`).not.toMatch(/@nobu|shared|server|client/);
    }
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../emulator/package.json'), 'utf8')) as { dependencies: Record<string, string> };
    expect(Object.keys(pkg.dependencies)).toEqual(['ws']);
  });
});

/** A currently free TCP port on 127.0.0.1. */
function freePort(): Promise<number> {
  return new Promise((res) => {
    const s = net.createServer();
    s.listen(0, LOCAL, () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => res(p));
    });
  });
}
