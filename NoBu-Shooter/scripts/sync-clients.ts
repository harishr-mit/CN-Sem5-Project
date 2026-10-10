/**
 * sync-clients.ts — smoke check for the Phase 3 sync models over real sockets
 * (docs/PHASE3_PLAN.md §6 smoke): two headless NetClients join the main room
 * through the emulator (whatever preset it has — smoke.mjs sets Nightmare),
 * one with full snapshots and one with delta snapshots, plus a spectator
 * connected directly to the server as the ground truth. Checks that every
 * world the delta client decoded equals the spectator's at the same tick, that
 * no delta lacked its base, and that delta needed far fewer bytes.
 * Exit code 0 = pass. Run by scripts/smoke.mjs (node --import tsx).
 */

import { WebSocket } from 'ws';
import { performance } from 'perf_hooks';
import { NetClient, type TransportFactory } from '../client/src/net/NetClient.js';
import NET from '../shared/src/config/net.js';
import type { MsgSnap } from '../shared/src/protocol/messages.js';
import type { SyncSpec } from '../shared/src/sync/types.js';

const DURATION_MS = 8000;

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

function client(name: string, sync: SyncSpec | undefined, direct = false): NetClient {
  const port = direct ? NET.ports.server : NET.ports.emulatorData;
  return new NetClient({
    url: `ws://127.0.0.1:${port}`, name, room: 'main', labelPrefix: name,
    transport: wsTransport, now: () => performance.now(),
    ...(direct ? { spectate: true } : {}), ...(sync ? { sync } : {}),
  });
}

const truth = new Map<number, MsgSnap>();
const ref = client('SYNC_REF', undefined, true);
ref.on('snap', (s) => truth.set(s.tick, s));
const full = client('SYNC_FULL', { model: 'full' });
const delta = client('SYNC_DELTA', { model: 'delta' });
const decoded: MsgSnap[] = [];
delta.on('snap', (s) => decoded.push(s));

let deltaMsgs = 0;
let fullBytes = 0;
let deltaBytes = 0;
// Count what arrives (wire bytes, like the emulator) by wrapping the message handlers
for (const [c, add] of [[full, (n: number) => { fullBytes += n; }], [delta, (n: number) => { deltaBytes += n; }]] as const) {
  const original = (c as unknown as { transportFactory: TransportFactory }).transportFactory;
  (c as unknown as { transportFactory: TransportFactory }).transportFactory = (url, h) => original(url, {
    ...h,
    onMessage: (text) => {
      add(text.length + 28);
      if (c === delta && text.startsWith('{"t":"snapDelta"')) deltaMsgs++;
      h.onMessage(text);
    },
  });
}

function finish(ok: boolean, msg: string): void {
  console.log(`[sync] ${ok ? 'PASS' : 'FAIL'}: ${msg}`);
  for (const c of [ref, full, delta]) c.disconnect();
  setTimeout(() => process.exit(ok ? 0 : 1), 100);
}

ref.connect();
full.connect();
delta.connect();

// The real client's loops: 60 Hz simulation, 30 Hz send, render + metrics
let step = 0;
const sim = setInterval(() => {
  step++;
  for (const c of [full, delta]) {
    c.keys = [1, 8, 2, 4][Math.floor(step / 45) % 4];
    c.simStep();
    if (step % 2 === 0) c.sendInputs();
    c.getInterpolatedState();
    c.framePresented(1000 / 60);
  }
}, 1000 / 60);

setTimeout(() => {
  clearInterval(sim);
  if (!full.isConnected || !delta.isConnected || !ref.isConnected) return finish(false, 'a client is not connected');
  let compared = 0;
  const byId = <T extends { id: number }>(a: T[]) => [...a].sort((x, y) => x.id - y.id);
  for (const s of decoded) {
    const t = truth.get(s.tick);
    if (!t) continue;
    compared++;
    const a = JSON.stringify([s.match, byId(s.players), byId(s.projectiles), s.pickups]);
    const b = JSON.stringify([t.match, byId(t.players), byId(t.projectiles), t.pickups]);
    if (a !== b) return finish(false, `delta world differs from the server's at tick ${s.tick}`);
  }
  const me = delta.latestSnapshot?.players.find((p) => p.id === delta.myPlayerId);
  console.log(`[sync] full ${Math.round(fullBytes / 1024)} kB, delta ${Math.round(deltaBytes / 1024)} kB (${Math.round((100 * deltaBytes) / fullBytes)} %), ` +
    `${deltaMsgs} deltas, ${compared} worlds compared, missing bases ${delta.metrics.deltaMissingBase}, ` +
    `ack delay full ${full.metrics.ackDelayMs} ms vs delta ${delta.metrics.ackDelayMs} ms`);
  if (deltaMsgs < 50) return finish(false, `only ${deltaMsgs} delta messages`);
  if (compared < 50) return finish(false, `only ${compared} decoded worlds could be compared`);
  if (delta.metrics.deltaMissingBase > 0) return finish(false, `${delta.metrics.deltaMissingBase} deltas without a base`);
  if (!me) return finish(false, 'the delta client is missing from its own world');
  if (deltaBytes > fullBytes * 0.6) return finish(false, 'delta did not save bandwidth');
  finish(true, 'delta decoded exactly over real sockets with far fewer bytes');
}, DURATION_MS);
