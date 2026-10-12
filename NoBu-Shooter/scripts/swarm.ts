/**
 * swarm.ts — network players (PHASES.md U4, docs/PHASE5_PLAN.md D8, D10).
 *
 *   npm run swarm -- --n 3
 *
 * Headless NetClients that join over UDP through the emulator's udp:9100
 * route, so their *own* traffic is impaired (unlike the server's bots). Each
 * has its own UDP socket, hence its own emulator session, which it names
 * UDP-<i> through the control API. They play with the server bots' decision
 * code (shared/src/sim/botBrain.ts), fed with what each of them sees:
 * its predicted self and the interpolated others.
 *
 * Options:
 *   --n <count>          players (default 3)
 *   --sync full|delta|state   sync model (default full; state = 10 Hz, --hz 30)
 *   --room main|lab      room (default main)
 *   --direct             straight to the server's UDP port (no impairment)
 *   --emulator host:port emulator UDP route (default 127.0.0.1:9100)
 *   --server host:port   server UDP port for --direct (default 127.0.0.1:8081)
 *   --control <url>      emulator control API (default ws://127.0.0.1:9001)
 *   --duration <s>       stop after s seconds and check the run (smoke); exit 1 if unhealthy
 *   --quiet              no status table
 *   --verbose            log every correction with its context (diagnostics)
 */

import { WebSocket } from 'ws';
import { performance } from 'perf_hooks';
import { NetClient } from '../client/src/net/NetClient.js';
import { ALL_MODELS } from '../client/src/net/allModels.js';
import { BotController, type BotView } from '../shared/src/sim/botBrain.js';
import { mapDef } from '../shared/src/config/game.js';
import NET from '../shared/src/config/net.js';
import type { SyncSpec } from '../shared/src/sync/types.js';
import { udpTransport, type UdpTransportHandle } from './lib/udp-transport.js';

const args = process.argv.slice(2);
const arg = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const flag = (name: string) => args.includes(`--${name}`);

const N = Math.max(1, Math.min(8, parseInt(arg('n', '3'), 10) || 3));
const SYNC = arg('sync', 'full');
const HZ = parseInt(arg('hz', '10'), 10) === 30 ? 30 : 10;
const ROOM = arg('room', 'main') === 'lab' ? 'lab' : 'main';
const DIRECT = flag('direct');
const TARGET = DIRECT ? arg('server', `127.0.0.1:${NET.ports.serverUdp}`) : arg('emulator', `127.0.0.1:${NET.ports.emulatorUdp}`);
const CONTROL = arg('control', `ws://127.0.0.1:${NET.ports.emulatorControl}`);
const ROUTE = `udp:${TARGET.split(':').pop()}`;
const DURATION_S = Number(arg('duration', '0'));
const QUIET = flag('quiet');
const VERBOSE = flag('verbose');

const syncSpec: SyncSpec = SYNC === 'delta' ? { model: 'delta' } : SYNC === 'state' ? { model: 'state', hz: HZ } : { model: 'full' };

interface Player {
  name: string;
  client: NetClient;
  transport: UdpTransportHandle | null;
  brain: BotController | null;
  brainMap: string | null;
  seq: Map<number, number>;
  labelled: boolean;
  worldMsgs: number;
  corrections: number;
  /** For the per-interval rates. */
  last: { corrections: number; dropped: number; t: number };
}

// ── Emulator control: name each session UDP-<i> (best effort) ─────────
let control: WebSocket | null = null;
const controlState: { sessions: { label: string; route: string; up: { pktsIn: number }; down: { pktsIn: number } }[] } = { sessions: [] };
function connectControl(): void {
  if (DIRECT) return;
  const ws = new WebSocket(CONTROL);
  ws.on('open', () => { control = ws; });
  ws.on('message', (raw) => {
    try {
      const m = JSON.parse(raw.toString()) as { evt: string; sessions?: typeof controlState.sessions };
      if (m.evt === 'state' && m.sessions) controlState.sessions = m.sessions;
    } catch { /* ignore */ }
  });
  ws.on('error', () => { /* no dashboard: labels stay "udp <addr>" */ });
  ws.on('close', () => { control = null; });
}
connectControl();

// ── Players ───────────────────────────────────────────────────────────
const players: Player[] = [];
for (let i = 1; i <= N; i++) {
  const name = `UDP-${i}`;
  const p: Player = {
    name, transport: null, brain: null, brainMap: null, seq: new Map(), labelled: false,
    worldMsgs: 0, corrections: 0, last: { corrections: 0, dropped: 0, t: performance.now() },
    client: new NetClient({ models: ALL_MODELS,
      url: `udp://${TARGET}`, name, room: ROOM, labelPrefix: name,
      transport: udpTransport({ onCreate: (h) => { p.transport = h; } }),
      now: () => performance.now(),
      sync: syncSpec,
    }),
  };
  p.client.on('snap', () => { p.worldMsgs++; });
  p.client.on('correction', (ev) => {
    p.corrections++;
    if (!VERBOSE) return;
    const me = p.client.latestSnapshot?.players.find((x) => x.id === p.client.myPlayerId);
    const cv = p.client.combatView;
    console.log(`[swarm] ${name} correction ${ev.errorPx.toFixed(1)} px (alive ${me?.alive}, fast ${me?.fast}, ` +
      `weapon ${me?.weapon}, speed ${cv.speedMsLeft} ms, dash ${cv.dashMsLeft} ms, match ${p.client.latestSnapshot?.match.state})`);
  });
  players.push(p);
  p.client.connect();
}

/** What player p sees: its predicted self and the interpolated others. */
function viewOf(p: Player): Map<number, BotView> {
  const view = new Map<number, BotView>();
  for (const s of p.client.getInterpolatedState().players) {
    if (s.mover) continue;
    view.set(s.id, { x: s.x, y: s.y, alive: s.alive, protectionTicksLeft: s.protectMs > 0 ? 1 : 0 });
  }
  return view;
}

let step = 0;
const loop = setInterval(() => {
  step++;
  for (const p of players) {
    const c = p.client;
    const me = c.myPlayerId;
    const map = c.latestSnapshot?.match.map ?? null;
    if (me !== null && map) {
      if (!p.brain || p.brainMap !== map) {
        p.brain = new BotController(mapDef(map), 1000 + players.indexOf(p));
        p.brain.addBot(me);
        p.brainMap = map;
      }
      const input = p.brain.tick(viewOf(p), p.seq).get(me);
      if (input) {
        c.keys = input.k;
        c.aimAngle = input.a;
        c.fireDown = input.f === 1;
      }
    }
    c.simStep();
    if (step % 2 === 0) c.sendInputs();
    c.framePresented(1000 / 60);
    if (!p.labelled && control && c.isConnected && p.transport) {
      const peer = p.transport.localAddress();
      if (peer) {
        control.send(JSON.stringify({ cmd: 'session.label', peer, route: ROUTE, label: p.name }));
        p.labelled = true;
      }
    }
  }
}, 1000 / 60);

// ── Status table ──────────────────────────────────────────────────────
const fmt = (v: number, w: number) => String(Math.round(v)).padStart(w);
const status = setInterval(() => {
  if (QUIET) return;
  const lines: string[] = [];
  for (const p of players) {
    const m = p.client.metrics;
    const now = performance.now();
    const dt = Math.max(0.001, (now - p.last.t) / 1000);
    const dropped = p.transport?.stats.messagesDropped ?? 0;
    const corr = (p.corrections - p.last.corrections) / dt;
    const lost = (dropped - p.last.dropped) / dt;
    p.last = { corrections: p.corrections, dropped, t: now };
    const me = p.client.latestSnapshot?.players.find((x) => x.id === p.client.myPlayerId);
    lines.push(
      `${p.name.padEnd(6)} ${p.client.isConnected ? 'up  ' : 'down'} RTT ${fmt(m.rttMs, 4)} ms  ack ${fmt(m.ackDelayMs, 4)} ms  ` +
      `corr ${corr.toFixed(1).padStart(4)}/s  frag-lost ${lost.toFixed(1).padStart(4)}/s  ↓ ${fmt(m.bwDownKbps, 4)} kbps  score ${me?.score ?? 0}`,
    );
  }
  console.log(`[swarm] ${DIRECT ? 'direct' : ROUTE} · ${syncSpec.model}${syncSpec.model === 'state' ? ` ${HZ} Hz` : ''}\n  ${lines.join('\n  ')}`);
}, 2000);

console.log(`[swarm] ${N} network player(s) → udp://${TARGET}${DIRECT ? ' (direct, no emulator)' : ` (emulator route ${ROUTE})`}, room ${ROOM}, sync ${syncSpec.model}`);

// ── Stop ──────────────────────────────────────────────────────────────
let stopping = false;
function stop(code: number, msg?: string): void {
  if (stopping) return;
  stopping = true;
  if (msg) console.log(`[swarm] ${code === 0 ? 'PASS' : 'FAIL'}: ${msg}`);
  clearInterval(loop);
  clearInterval(status);
  for (const p of players) p.client.disconnect();
  control?.close();
  setTimeout(() => process.exit(code), 150);
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
// Exit with the launcher (scripts/demo.mjs passes its pid)
const parentPid = Number(process.env.NOBU_PARENT_PID);
if (parentPid) {
  setInterval(() => { try { process.kill(parentPid, 0); } catch { stop(0); } }, 1000).unref();
}

if (DURATION_S > 0) {
  setTimeout(() => {
    for (const p of players) {
      const m = p.client.metrics;
      const t = p.transport?.stats;
      console.log(`[swarm] ${p.name}: ${p.worldMsgs} world messages, ${t?.messagesReassembled ?? 0} reassembled, ` +
        `${t?.messagesDropped ?? 0} lost to fragments, ${t?.datagramsIn ?? 0} datagrams in / ${t?.datagramsOut ?? 0} out ` +
        `(${t && t.messagesReassembled ? (t.fragmentsIn / t.messagesReassembled).toFixed(1) : '1.0'} fragments per fragmented message), ` +
        `RTT ${Math.round(m.rttMs)} ms, ack delay ${Math.round(m.ackDelayMs)} ms, ${p.corrections} corrections`);
      if (!p.client.isConnected) return stop(1, `${p.name} is not connected`);
      if (p.worldMsgs < DURATION_S * 5) return stop(1, `${p.name} received only ${p.worldMsgs} world messages`);
      if (!(m.ackDelayMs > 0) || m.ackDelayMs > 5000) return stop(1, `${p.name} acks are not advancing (ack delay ${m.ackDelayMs} ms)`);
      if (syncSpec.model === 'full' && ROOM === 'main' && (t?.messagesReassembled ?? 0) === 0) {
        return stop(1, `${p.name} never reassembled a fragmented snapshot`);
      }
    }
    if (!DIRECT) {
      for (const p of players) {
        const s = controlState.sessions.find((x) => x.label === p.name && x.route === ROUTE);
        if (!s) return stop(1, `the emulator shows no ${ROUTE} session named ${p.name}`);
      }
    }
    stop(0, `${N} UDP network player(s) played for ${DURATION_S} s${DIRECT ? '' : ` through ${ROUTE}`}`);
  }, DURATION_S * 1000);
}
