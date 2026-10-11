/**
 * smoke.mjs — headless smoke test through the real emulator (SPEC.md §14.5).
 * 1. Starts the server (WS + UDP) and the emulator (routes ws:9000 + udp:9100),
 *    everything bound to 127.0.0.1 so the test exposes nothing
 * 2. (same)
 * 3. Applies the "Nightmare" preset to all routes via the control port
 * 4. Runs the headless bot for 10 s through the emulator's WS route
 *    and asserts snapshots keep arriving, ack advances, tick rate ≥ 55 Hz
 * 5. Joins the lab room as a spectator (direct to the server), turns on the
 *    scripted movers and checks them against moverPath (PHASES.md C2, C3)
 * 6. Sync models (PHASES.md Phase 3): full + delta NetClients through the
 *    emulator (still Nightmare) and a direct spectator; delta must decode to
 *    the server's world exactly with far fewer bytes (scripts/sync-clients.ts)
 * 7. One UDP network player (PHASES.md U4, exit criterion of Phase 5) through
 *    the emulator's udp:9100 route under Nightmare for 10 s: snapshots keep
 *    arriving (fragments reassembled), acks advance, and the emulator lists
 *    its session (scripts/swarm.ts --duration)
 * All child processes are stopped (and ports freed) on every exit path.
 */

import { WebSocket } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import {
  spawnTs, spawnNode, assertPortsFree, assertUdpPortsFree, waitForPort, waitForUdpPort, cleanupOnExit,
} from './lib/procs.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

console.log('\x1b[36m%s\x1b[0m', '═══════════════════════════════════════════════════════════════');
console.log('\x1b[36m%s\x1b[0m', '  NOBU SHOOTER — SMOKE TEST (HEADLESS CLIENTS UNDER NIGHTMARE) ');
console.log('\x1b[36m%s\x1b[0m', '═══════════════════════════════════════════════════════════════\n');

await assertPortsFree([8080, 9000, 9001]);
await assertUdpPortsFree([8081, 9100]);

const quiet = (name) => (l, isErr) => {
  if (isErr && /Error|Unhandled/.test(l)) console.error(`[${name} ERR] ${l}`);
};

const children = [];
const cleanup = cleanupOnExit(children);
// The automated run binds this machine only (docs/PHASE5_PLAN.md D15)
process.env.NOBU_HOST = '127.0.0.1';

console.log('[smoke] 1/7 Launching game server (ws 8080, udp 8081)...');
children.push(spawnTs('SERVER', 'server/src/main.ts', [], { cwd: rootDir, onLine: quiet('SERVER') }));

console.log('[smoke] 2/7 Launching network emulator (routes ws:9000, udp:9100; control 9001)...');
children.push(spawnTs('EMULATOR', 'emulator/src/main.ts', [
  '--route', 'ws:127.0.0.1:9000=ws://127.0.0.1:8080',
  '--route', 'udp:127.0.0.1:9100=127.0.0.1:8081',
  '--control', '9001', '--seed', '42',
], { cwd: rootDir, onLine: quiet('EMULATOR') }));

const up = await Promise.all([waitForPort(8080), waitForPort(9001), waitForPort(9000), waitForUdpPort(8081), waitForUdpPort(9100)]);
if (!up.every(Boolean)) {
  console.error('[smoke] Services did not start in time');
  cleanup();
  process.exit(1);
}

console.log('[smoke] 3/7 Configuring emulator with "Nightmare" preset (all routes)...');
await new Promise((resolveP, reject) => {
  const ctrl = new WebSocket('ws://127.0.0.1:9001');
  ctrl.on('open', () => {
    ctrl.send(JSON.stringify({ cmd: 'preset', target: 'all', name: 'Nightmare' }));
    setTimeout(() => { ctrl.close(); resolveP(); }, 300);
  });
  ctrl.on('error', reject);
});

/** Run one step's child process; resolves with its exit code. */
function run(child) {
  children.push(child);
  return new Promise((r) => child.on('exit', (code) => r(code ?? 1)));
}
function fail(msg, code) {
  cleanup();
  console.error(`\n\x1b[31m✘ SMOKE TEST FAILED: ${msg} (exit code ${code}).\x1b[0m\n`);
  process.exit(code || 1);
}
const echo = (l) => console.log(l);

console.log('[smoke] 4/7 Starting headless bot (10s duration)...');
let code = await run(spawnNode('BOT', ['scripts/headless-bot.mjs', '--duration', '10', '--min-tick-hz', '55'], { cwd: rootDir, onLine: echo }));
if (code !== 0) fail('Bot exited with an error', code);

console.log('[smoke] 5/7 Lab spectator + scripted movers (direct to the server)...');
code = await run(spawnTs('SPECTATOR', 'scripts/lab-spectator.ts', [], { cwd: rootDir, onLine: echo }));
if (code !== 0) fail('Lab spectator check failed', code);

console.log('[smoke] 6/7 Sync models: full vs delta NetClients under Nightmare + direct spectator...');
code = await run(spawnTs('SYNC', 'scripts/sync-clients.ts', [], { cwd: rootDir, onLine: echo }));
if (code !== 0) fail('Sync-model check failed', code);

console.log('[smoke] 7/7 One UDP network player through udp:9100 under Nightmare (10 s)...');
code = await run(spawnTs('SWARM', 'scripts/swarm.ts', ['--n', '1', '--duration', '10', '--quiet'], { cwd: rootDir, onLine: echo }));
if (code !== 0) fail('UDP network player check failed', code);

cleanup();
console.log('\n\x1b[32m✔ SMOKE TEST COMPLETE: All assertions passed under Nightmare conditions.\x1b[0m\n');
process.exit(0);
