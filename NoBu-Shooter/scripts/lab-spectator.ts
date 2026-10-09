/**
 * lab-spectator.ts — smoke check for the Compare reference connection
 * (PHASES.md C2, C3): joins the lab room as a spectator directly on the
 * server's WebSocket port, turns on every scripted mover and checks that the
 * snapshots carry them exactly at moverPath(pattern, tick / hz).
 * Exit code 0 = pass. Run by scripts/smoke.mjs (node --import tsx).
 */

import { WebSocket } from 'ws';
import { moverPath, MOVER_PATTERNS, type MoverCfg } from '../shared/src/sim/movers.js';
import GAME from '../shared/src/config/game.js';
import NET from '../shared/src/config/net.js';
import type { MsgSnap } from '../shared/src/protocol/messages.js';

const CFG: MoverCfg = { speed: GAME.lab.moverSpeed, stopGo: GAME.lab.stopGo };
const url = `ws://127.0.0.1:${NET.ports.server}`;
const ws = new WebSocket(url);
const snaps: MsgSnap[] = [];
let welcomed = false;

function finish(ok: boolean, msg: string): void {
  console.log(`[spectator] ${ok ? 'PASS' : 'FAIL'}: ${msg}`);
  ws.close();
  process.exit(ok ? 0 : 1);
}

ws.on('open', () => {
  ws.send(JSON.stringify({ t: 'hello', v: 1, name: 'SMOKE_REF', room: 'lab', nonce: 'smoke-ref', spectate: true }));
});

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString()) as { t: string; spectator?: boolean };
  if (msg.t === 'welcome') {
    if (!msg.spectator) finish(false, 'welcome without spectator flag');
    welcomed = true;
    ws.send(JSON.stringify({ t: 'lab', movers: MOVER_PATTERNS }));
    setTimeout(check, 1500);
  } else if (msg.t === 'snap' && welcomed) {
    snaps.push(msg as unknown as MsgSnap);
  }
});

ws.on('error', (e) => finish(false, `socket error: ${e.message}`));
setTimeout(() => finish(false, 'timed out'), 8000);

function check(): void {
  const withMovers = snaps.filter((s) => s.players.filter((p) => p.mover).length === MOVER_PATTERNS.length);
  if (withMovers.length < 10) finish(false, `only ${withMovers.length} snapshots carried all ${MOVER_PATTERNS.length} movers`);
  let worst = 0;
  for (const s of withMovers) {
    for (const p of s.players) {
      if (!p.mover) continue;
      const t = moverPath(p.mover, s.tick / GAME.sim.hz, CFG);
      worst = Math.max(worst, Math.hypot(p.x - t.x, p.y - t.y));
    }
    if (s.ack !== 0) finish(false, `spectator snapshot has ack ${s.ack}`);
  }
  if (worst > 1e-9) finish(false, `mover off its path by ${worst} px`);
  finish(true, `${withMovers.length} snapshots, 4 movers exactly on their paths, no player joined`);
}
