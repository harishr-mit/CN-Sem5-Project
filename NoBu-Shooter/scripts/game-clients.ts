/**
 * game-clients.ts — smoke steps 9 and 10 (docs/PHASE7_PLAN.md §4): the game
 * edition as `npm start` runs it (one port: the built page + the game
 * WebSocket), checked over real sockets.
 *
 *   --base http://127.0.0.1:8090   the running game server (--game --static dist/game)
 *   --step 9    the page and its files (compression, caching), operator
 *               messages refused, and a quick match through the join window
 *               with a NetClient built like the game's (Delta, no optional models)
 *   --step 10   a private room: create → code, a second player joins by code,
 *               a guest's START is ignored, the host's starts the match with bots
 * Exit code 0 = pass. Run by scripts/smoke.mjs (node --import tsx).
 */

import { WebSocket } from 'ws';
import { performance } from 'perf_hooks';
import { request } from 'http';
import { NetClient, type TransportFactory } from '../client/src/net/NetClient.js';
import type { MsgSnap } from '../shared/src/protocol/messages.js';
import { formatCode } from '../shared/src/rooms/codes.js';
import GAME from '../shared/src/config/game.js';

const arg = (name: string) => { const i = process.argv.indexOf(name); return i !== -1 ? process.argv[i + 1] : undefined; };
const BASE = arg('--base') ?? 'http://127.0.0.1:8090';
const STEP = Number(arg('--step') ?? 9);
const WS_URL = BASE.replace(/^http/, 'ws') + '/ws';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function check(ok: unknown, what: string): void {
  if (!ok) {
    console.error(`  ✘ ${what}`);
    process.exit(1);
  }
  console.log(`  ✔ ${what}`);
}

function get(path: string, headers: Record<string, string> = {}): Promise<{ status: number; headers: Record<string, unknown>; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = request(BASE + path, { headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

const wsTransport: TransportFactory = (url, h) => {
  const ws = new WebSocket(url);
  ws.on('open', () => h.onOpen());
  ws.on('message', (raw) => h.onMessage(raw.toString()));
  ws.on('close', () => h.onClose());
  ws.on('error', () => h.onError());
  return {
    send: (text) => { if (ws.readyState === WebSocket.OPEN) ws.send(text); },
    close: () => ws.close(),
  };
};

/** A raw WebSocket player: every message it gets, and helpers. */
async function rawPlayer(room: string, name: string) {
  const ws = new WebSocket(WS_URL);
  const inbox: Record<string, unknown>[] = [];
  ws.on('message', (d) => inbox.push(JSON.parse(d.toString())));
  await new Promise<void>((r, j) => { ws.on('open', () => r()); ws.on('error', j); });
  ws.send(JSON.stringify({ t: 'hello', v: 1, name, room, nonce: name }));
  const until = async (pred: () => boolean, ms = 5000) => {
    const end = performance.now() + ms;
    while (!pred() && performance.now() < end) await sleep(20);
    return pred();
  };
  await until(() => inbox.some((m) => m.t === 'welcome' || m.t === 'error'));
  const welcome = inbox.find((m) => m.t === 'welcome');
  // Keep the connection alive (the server times out silent clients)
  const ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ t: 'ping', id: 1, ct: 0 })), 500);
  return {
    ws, inbox, welcome, until,
    send: (m: object) => ws.send(JSON.stringify(m)),
    errors: () => inbox.filter((m) => m.t === 'error').map((m) => m.code),
    close: () => { clearInterval(ping); ws.close(); },
  };
}

async function step9(): Promise<void> {
  console.log(`[game] ${BASE}: the built game and the game WebSocket on one port`);
  const index = await get('/', { 'Accept-Encoding': 'br' });
  check(index.status === 200, 'GET / → 200');
  const html = (await get('/')).body.toString();
  check(html.includes('id="root"'), 'it is the game page');
  const script = /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
  check(script, `the page loads its bundle (${script})`);
  const js = await get(script!, { 'Accept-Encoding': 'gzip, br' });
  check(js.status === 200 && js.headers['content-encoding'] === 'br', 'the bundle is served brotli-compressed');
  check(String(js.headers['cache-control']).includes('immutable'), 'the hashed bundle is cached for good');
  const art = await get('/low/packed/player.webp');
  check(art.status === 200 && art.headers['content-type'] === 'image/webp', 'art tiers are served (low/packed/player.webp)');
  check((await get('/../package.json')).status === 404, 'nothing outside the build is served');

  // Operator messages are refused on the game server
  const probe = await rawPlayer('main', 'PROBE');
  probe.send({ t: 'dev', invincible: true });
  probe.send({ t: 'perturb', dx: 40, dy: 0 });
  probe.send({ t: 'sync', model: 'full' });
  await probe.until(() => probe.errors().length >= 3);
  check(probe.errors().filter((c) => c === 'NOT_ALLOWED').length === 2 && probe.errors().includes('SYNC_FIXED'), 'dev / perturb refused (NOT_ALLOWED), sync fixed to Delta (SYNC_FIXED)');
  probe.close();
  const lab = await rawPlayer('lab', 'LAB');
  check(lab.errors().includes('NOT_ALLOWED'), 'no lab room on the game server');
  lab.close();
  await sleep(300);

  // A quick match through the join window, with the game's own client set-up
  const net = new NetClient({ url: WS_URL, name: 'SMOKE', room: 'main', sync: { model: 'delta' }, transport: wsTransport, now: () => performance.now() });
  const states: { state: string; wait?: number }[] = [];
  let deltas = 0;
  net.on('snap', (s: MsgSnap) => states.push({ state: s.match.state, wait: s.match.waitMsLeft }));
  const origin = (net as unknown as { transportFactory: TransportFactory }).transportFactory;
  (net as unknown as { transportFactory: TransportFactory }).transportFactory = (url, h) => origin(url, { ...h, onMessage: (t) => { if (t.startsWith('{"t":"snapDelta"')) deltas++; h.onMessage(t); } });
  net.connect();
  // The scene's loop, headless: one sim step per 1/60 s, inputs (with the snapshot ack) every other step
  let step = 0;
  const loop = setInterval(() => {
    net.simStep();
    if (++step % 2 === 0) net.sendInputs();
  }, 1000 / 60);
  const t0 = performance.now();
  while (performance.now() - t0 < 12_000 && !states.some((s) => s.state === 'RUNNING')) await sleep(50);
  clearInterval(loop);
  const waited = states.filter((s) => s.state === 'WAITING' && s.wait !== undefined);
  check(waited.length > 0 && waited[0].wait! > 0, `WAITING with the join window (first seen: ${Math.round(waited[0]?.wait ?? 0)} ms left)`);
  check(states.some((s) => s.state === 'COUNTDOWN'), 'then the countdown');
  check(states.some((s) => s.state === 'RUNNING'), 'then the match runs');
  check(net.sync.model === 'delta' && deltas > 10, `Delta snapshots (${deltas} deltas received)`);
  check(net.supports({ model: 'state', hz: 10 }) === false, 'the game client has no State / Lockstep code');
  net.disconnect();
}

async function step10(): Promise<void> {
  console.log(`[game] ${BASE}: a private room`);
  const host = await rawPlayer('new', 'HOST');
  const code = host.welcome?.code as string | undefined;
  check(code && host.welcome?.host === true, `CREATE ROOM → code ${code ? formatCode(code) : '?'}, and the creator is host`);
  const guest = await rawPlayer(formatCode(code!), 'GUEST');
  check(guest.welcome?.code === code && guest.welcome?.host === false, 'a second player joins with the code as shown (not host)');
  const snapOf = (p: Awaited<ReturnType<typeof rawPlayer>>) => {
    const s = [...p.inbox].reverse().find((m) => m.t === 'snap' || m.t === 'snapDelta');
    return s as Record<string, unknown> | undefined;
  };
  await guest.until(() => snapOf(guest) !== undefined);
  guest.send({ t: 'start' });
  await sleep(1500);
  const stillWaiting = !host.inbox.some((m) => (m.t === 'snap' || m.t === 'snapDelta') && JSON.stringify(m).includes('"COUNTDOWN"'));
  check(stillWaiting, "a guest's START is ignored (still waiting)");
  host.send({ t: 'start' });
  const started = await host.until(() => host.inbox.some((m) => JSON.stringify(m).includes('"RUNNING"')), 6000);
  check(started, "the host's START begins the countdown, then the match");
  // Full snapshot fallback or deltas: count players from the newest full snapshot the server sends on join of bots
  const sawBots = host.inbox.some((m) => JSON.stringify(m).includes('"bot":true'));
  check(sawBots, `bots fill the empty slots (target ${GAME.bots.targetParticipants})`);
  const missing = await rawPlayer('jolly-zebra', 'LOST');
  check(missing.errors().includes('ROOM_NOT_FOUND'), 'an unknown code → ROOM_NOT_FOUND');
  for (const p of [host, guest, missing]) p.close();
}

(STEP === 10 ? step10() : step9()).then(() => process.exit(0), (err) => {
  console.error(err);
  process.exit(1);
});
