/**
 * lockstep-clients.ts — smoke check for lockstep over real sockets
 * (docs/PHASE6_PLAN.md D11, PHASES.md L2): the emulator's game route is set
 * to 50 ms one-way + 5 % loss, then two headless lockstep players join the
 * lab room through it — Rd off (resend on request) and Rd on (redundant
 * window) — plus a spectator connected directly to the server as the truth,
 * with all four movers running. Checks that every world either player showed
 * equals the spectator's at the same tick, that every hash check passed
 * (0 desyncs), that both stalled at times and Rd on stalled less.
 * Exit code 0 = pass. Run by scripts/smoke.mjs (node --import tsx).
 */

import { WebSocket } from 'ws';
import { performance } from 'perf_hooks';
import { NetClient, type TransportFactory } from '../client/src/net/NetClient.js';
import { MOVER_PATTERNS } from '../shared/src/sim/movers.js';
import NET from '../shared/src/config/net.js';
import type { MsgSnap } from '../shared/src/protocol/messages.js';

const DURATION_MS = 12000;
const GAME_ROUTE = `ws:${NET.ports.emulatorData}`;

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

/** Apply the preset's network to the game route (docs/PHASE6_PLAN.md D8). */
function setNetwork(): Promise<void> {
  return new Promise((resolve, reject) => {
    const ctrl = new WebSocket(`ws://127.0.0.1:${NET.ports.emulatorControl}`);
    ctrl.on('open', () => {
      ctrl.send(JSON.stringify({ cmd: 'preset', target: GAME_ROUTE, name: 'Lockstep 50 ms + 5 %', config: { latencyMs: 50, lossPct: 5 } }));
      setTimeout(() => { ctrl.close(); resolve(); }, 300);
    });
    ctrl.on('error', reject);
  });
}

function client(name: string, opts: { rd?: boolean; direct?: boolean }): NetClient {
  const port = opts.direct ? NET.ports.server : NET.ports.emulatorData;
  return new NetClient({
    url: `ws://127.0.0.1:${port}`, name, room: 'lab', labelPrefix: name,
    transport: wsTransport, now: () => performance.now(),
    ...(opts.direct ? { spectate: true } : { sync: { model: 'lockstep', ...(opts.rd ? { rd: true } : {}) } }),
  });
}

const truth = new Map<number, Map<number, string>>();
const ref = client('LS_REF', { direct: true });
ref.on('snap', (s) => truth.set(s.tick, new Map(s.players.map((p) => [p.id, `${p.x},${p.y}`]))));
const nack = client('LS_NACK', {});
const rd = client('LS_RD', { rd: true });
const players = [nack, rd];
const shown: MsgSnap[][] = [[], []];
players.forEach((c, i) => c.on('snap', (s) => shown[i].push(s)));
let bytes = [0, 0];
players.forEach((c, i) => {
  const original = (c as unknown as { transportFactory: TransportFactory }).transportFactory;
  (c as unknown as { transportFactory: TransportFactory }).transportFactory = (url, h) => original(url, {
    ...h, onMessage: (text) => { bytes[i] += text.length + 28; h.onMessage(text); },
  });
});

function finish(ok: boolean, msg: string): void {
  console.log(`[lockstep] ${ok ? 'PASS' : 'FAIL'}: ${msg}`);
  for (const c of [ref, ...players]) c.disconnect();
  setTimeout(() => process.exit(ok ? 0 : 1), 100);
}

ref.on('welcome', () => ref.setMovers([...MOVER_PATTERNS]));
// Top-level await is not available here (tsx compiles scripts to CommonJS)
void setNetwork().then(() => {
  ref.connect();
  for (const c of players) c.connect();
  setTimeout(check, DURATION_MS);
}, (err) => finish(false, `emulator control: ${String(err)}`));

// The real client's loops: 60 Hz simulation, 30 Hz send, render + metrics
let step = 0;
const sim = setInterval(() => {
  step++;
  for (const c of players) {
    c.keys = [1, 8, 2, 4][Math.floor(step / 45) % 4];
    c.simStep();
    if (step % 2 === 0) c.sendInputs();
    c.getInterpolatedState();
    c.framePresented(1000 / 60);
  }
  if (step === 120) bytes = [0, 0]; // count after the start-up
}, 1000 / 60);

function check(): void {
  clearInterval(sim);
  if (!players.every((c) => c.isConnected) || !ref.isConnected) return finish(false, 'a client is not connected');
  const compared = [0, 0];
  for (let i = 0; i < 2; i++) {
    for (const s of shown[i]) {
      const t = truth.get(s.tick);
      if (!t) continue;
      compared[i]++;
      const mine = new Map(s.players.map((p) => [p.id, `${p.x},${p.y}`]));
      if (mine.size !== t.size || [...t].some(([id, xy]) => mine.get(id) !== xy)) {
        return finish(false, `${i ? 'Rd' : 'NACK'} player's world differs from the server's at tick ${s.tick}`);
      }
    }
  }
  const [m0, m1] = players.map((c) => c.metrics);
  const secs = (DURATION_MS - 2000) / 1000;
  console.log(`[lockstep] Rd off: stalled ${m0.lsStalledPct} %, longest ${m0.lsLongestStallMs} ms, NACKed ${m0.lsNackedTicks} ticks, ` +
    `${Math.round(bytes[0] * 8 / secs / 1000)} kbps; Rd on: stalled ${m1.lsStalledPct} %, longest ${m1.lsLongestStallMs} ms, ` +
    `${Math.round(bytes[1] * 8 / secs / 1000)} kbps; worlds compared ${compared.join(' / ')}, hash checks ${m0.lsHashChecks} / ${m1.lsHashChecks}, ` +
    `desyncs ${m0.lsDesyncs} / ${m1.lsDesyncs}, In→Screen ${m0.inputToScreenMs} / ${m1.inputToScreenMs} ms`);
  if (m0.lsDesyncs + m1.lsDesyncs > 0) return finish(false, 'a hash check failed (desync)');
  if (compared.some((n) => n < 100)) return finish(false, `only ${compared.join(' / ')} worlds could be compared`);
  if (m0.lsHashChecks < 5 || m1.lsHashChecks < 5) return finish(false, 'too few hash checks');
  if (m0.lsStalledPct <= 0) return finish(false, 'Rd off never stalled at 5 % loss (is the network applied?)');
  if (m1.lsStalledPct >= m0.lsStalledPct) return finish(false, 'Rd on did not stall less than Rd off');
  finish(true, 'both lockstep players replayed the server\'s world exactly; Rd on stalled less');
}
