/**
 * The game server (docs/PHASE7_PLAN.md D3, D6, D7; plan test 5): operator
 * messages refused, Delta only, and the built game served on the WebSocket's
 * own port.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { request } from 'http';
import { gunzipSync, brotliDecompressSync } from 'zlib';
import type { AddressInfo } from 'net';
import { WebSocket } from 'ws';
import { GameServer } from '../server/src/core.js';
import { createGameHttp, type GameHttp } from '../server/src/http.js';

type Msg = Record<string, unknown> & { t: string };

function join_(s: GameServer, hello: Record<string, unknown>) {
  const inbox: Msg[] = [];
  const conn = s.addConnection((text) => inbox.push(JSON.parse(text)), () => {});
  s.handleMessage(conn, JSON.stringify({ t: 'hello', v: 1, name: 'P', room: 'main', nonce: `n${conn.id}`, ...hello }));
  const errors = () => inbox.filter((m) => m.t === 'error').map((m) => m.code);
  return { conn, inbox, errors, send: (m: object) => s.handleMessage(conn, JSON.stringify(m)) };
}

describe('Game mode (operator messages, fixed Delta)', () => {
  it('every connection is on Delta, whatever hello asks; sync to another model → SYNC_FIXED', () => {
    const s = new GameServer(() => 0, { mode: 'game' });
    const a = join_(s, { sync: { model: 'full' } });
    expect(a.conn.sync).toEqual({ model: 'delta' });
    a.send({ t: 'sync', model: 'state', hz: 10 });
    expect(a.conn.sync).toEqual({ model: 'delta' });
    expect(a.errors()).toContain('SYNC_FIXED');
    a.send({ t: 'sync', model: 'delta' });
    expect(a.errors().filter((c) => c === 'SYNC_FIXED')).toHaveLength(1);
  });

  it('refuses dev, perturb and lab → NOT_ALLOWED, and nothing changes', () => {
    process.env.NOBU_DEV = '1'; // even if someone set it, the game server ignores operator messages
    try {
      const s = new GameServer(() => 0, { mode: 'game', joinWindowMs: 10_000 });
      const a = join_(s, {});
      const room = s.getRoom('main');
      a.send({ t: 'dev', invincible: true });
      a.send({ t: 'perturb', dx: 40, dy: 0 });
      a.send({ t: 'lab', movers: ['circle'] });
      a.send({ t: 'start' }); // main never starts early on the game server
      expect(a.errors().filter((c) => c === 'NOT_ALLOWED')).toHaveLength(3);
      expect(room.matchState).toBe('WAITING');
      s.tick(); s.tick();
      const snap = [...a.inbox].reverse().find((m) => m.t === 'snapDelta' || m.t === 'snap') as Msg | undefined;
      expect(snap).toBeDefined();
      const me = room.buildSnapshot(a.conn.playerId).players.find((p) => p.id === a.conn.playerId)!;
      expect(me.invincible).toBeUndefined();
    } finally {
      delete process.env.NOBU_DEV;
    }
  });

  it('has no lab room and no spectators', () => {
    const s = new GameServer(() => 0, { mode: 'game' });
    expect(s.rooms.has('lab')).toBe(false);
    expect(join_(s, { room: 'lab' }).errors()).toEqual(['NOT_ALLOWED']);
    expect(join_(s, { spectate: true }).errors()).toEqual(['NOT_ALLOWED']);
    expect(s.rooms.has('lab')).toBe(false);
  });

  it('private rooms work on the game server', () => {
    const s = new GameServer(() => 0, { mode: 'game' });
    const a = join_(s, { room: 'new' });
    const code = a.inbox.find((m) => m.t === 'welcome')!.code as string;
    const b = join_(s, { room: code });
    expect(b.errors()).toEqual([]);
    expect(b.conn.sync).toEqual({ model: 'delta' });
  });

  it('the demo server keeps everything (default mode)', () => {
    const s = new GameServer(() => 0);
    expect(s.rooms.has('lab')).toBe(true);
    const a = join_(s, { sync: { model: 'full' } });
    expect(a.conn.sync).toEqual({ model: 'full' });
    a.send({ t: 'perturb', dx: 40, dy: 0 });
    expect(a.errors()).toEqual([]);
  });
});

// ── Static files + WebSocket on one port ───────────────────────

interface Res { status: number; headers: Record<string, string | string[] | undefined>; body: Buffer }

function get(port: number, path: string, headers: Record<string, string> = {}, method = 'GET'): Promise<Res> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('Game server port: static files + WebSocket (D6, D7)', () => {
  let dir: string;
  let srv: GameHttp;
  let port: number;
  const game = new GameServer(Date.now, { mode: 'game' });
  const INDEX = '<!doctype html><title>NoBu</title>' + 'x'.repeat(2000);
  const JS = 'console.log("hello");'.repeat(200);

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'nobu-static-'));
    mkdirSync(join(dir, 'site', 'assets'), { recursive: true });
    mkdirSync(join(dir, 'site', 'high'), { recursive: true });
    writeFileSync(join(dir, 'site', 'index.html'), INDEX);
    writeFileSync(join(dir, 'site', 'assets', 'index-abc123.js'), JS);
    writeFileSync(join(dir, 'site', 'high', 'x.webp'), Buffer.from([1, 2, 3, 4]));
    writeFileSync(join(dir, 'secret.txt'), 'outside the root');
    srv = createGameHttp(game, { staticDir: join(dir, 'site') });
    await new Promise<void>((r) => srv.http.listen(0, '127.0.0.1', () => r()));
    port = (srv.http.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await srv.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('serves index.html for /, revalidated', async () => {
    const r = await get(port, '/');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('text/html');
    expect(r.headers['cache-control']).toBe('no-cache');
    expect(r.body.toString()).toBe(INDEX);
  });

  it('caches hashed assets for a year and compresses text (brotli, else gzip)', async () => {
    const br = await get(port, '/assets/index-abc123.js', { 'Accept-Encoding': 'gzip, deflate, br' });
    expect(br.headers['cache-control']).toContain('immutable');
    expect(br.headers['content-encoding']).toBe('br');
    expect(br.body.length).toBeLessThan(JS.length / 5);
    expect(brotliDecompressSync(br.body).toString()).toBe(JS);
    const gz = await get(port, '/assets/index-abc123.js', { 'Accept-Encoding': 'gzip' });
    expect(gz.headers['content-encoding']).toBe('gzip');
    expect(gunzipSync(gz.body).toString()).toBe(JS);
    const plain = await get(port, '/assets/index-abc123.js');
    expect(plain.headers['content-encoding']).toBeUndefined();
    expect(plain.body.toString()).toBe(JS);
  });

  it('sends images as they are with their type; HEAD has no body', async () => {
    const r = await get(port, '/high/x.webp', { 'Accept-Encoding': 'br' });
    expect(r.headers['content-type']).toBe('image/webp');
    expect(r.headers['content-encoding']).toBeUndefined();
    expect([...r.body]).toEqual([1, 2, 3, 4]);
    const h = await get(port, '/high/x.webp', {}, 'HEAD');
    expect(h.status).toBe(200);
    expect(h.headers['content-length']).toBe('4');
    expect(h.body.length).toBe(0);
  });

  it('404 for missing files and anything outside the root', async () => {
    expect((await get(port, '/nope.js')).status).toBe(404);
    expect((await get(port, '/../secret.txt')).status).toBe(404);
    expect((await get(port, '/%2e%2e/secret.txt')).status).toBe(404);
    expect((await get(port, '/assets/..%2f..%2fsecret.txt')).status).toBe(404);
    expect((await get(port, '/%E0%A4%A')).status).toBe(404);
    expect((await get(port, '/assets')).status).toBe(404); // a directory
  });

  it('refuses other methods', async () => {
    expect((await get(port, '/', {}, 'POST')).status).toBe(405);
  });

  it('accepts the game WebSocket on /ws (and /) of the same port', async () => {
    for (const path of ['/ws', '/']) {
      const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
      const welcome = await new Promise<Msg>((resolve, reject) => {
        ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', v: 1, name: 'WS', room: 'main', nonce: 'w' })));
        ws.on('message', (d) => { const m = JSON.parse(d.toString()) as Msg; if (m.t === 'welcome') resolve(m); });
        ws.on('error', reject);
      });
      expect(welcome.room).toBe('main');
      ws.close();
    }
    const bad = new WebSocket(`ws://127.0.0.1:${port}/elsewhere`);
    await expect(new Promise((resolve, reject) => { bad.on('open', resolve); bad.on('error', reject); })).rejects.toBeTruthy();
  });
});
