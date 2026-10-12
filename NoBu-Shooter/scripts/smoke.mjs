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
 * 8. Lockstep (PHASES.md L2, docs/PHASE6_PLAN.md D11): the game route at
 *    50 ms + 5 % loss, two lockstep lab players (Rd off / on) and a direct
 *    spectator; every shown world equals the server's, 0 desyncs, Rd on
 *    stalls less (scripts/lockstep-clients.ts)
 * 9. The game edition (docs/PHASE7_PLAN.md §4): `npm run build`, then the game
 *    server as `npm start` runs it (--game --static dist/game) on 8090,
 *    127.0.0.1 only: the page, compression and caching, operator messages
 *    refused, a quick match (starts at once) with the game's client (Delta,
 *    no optional models)
 * 10. A private room on that server: create, join by code, no bots by
 *    default, host options (map, bots on), guest START ignored, host START,
 *    back to the lobby after the match (scripts/game-clients.ts)
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

await assertPortsFree([8080, 8090, 9000, 9001]);
await assertUdpPortsFree([8081, 9100]);

const quiet = (name) => (l, isErr) => {
  if (isErr && /Error|Unhandled/.test(l)) console.error(`[${name} ERR] ${l}`);
};

const children = [];
const cleanup = cleanupOnExit(children);
// The automated run binds this machine only (docs/PHASE5_PLAN.md D15)
process.env.NOBU_HOST = '127.0.0.1';

console.log('[smoke] 1/10 Launching game server (ws 8080, udp 8081)...');
children.push(spawnTs('SERVER', 'server/src/main.ts', [], { cwd: rootDir, onLine: quiet('SERVER') }));

console.log('[smoke] 2/10 Launching network emulator (routes ws:9000, udp:9100; control 9001)...');
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

console.log('[smoke] 3/10 Configuring emulator with "Nightmare" preset (all routes)...');
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

console.log('[smoke] 4/10 Starting headless bot (10s duration)...');
let code = await run(spawnNode('BOT', ['scripts/headless-bot.mjs', '--duration', '10', '--min-tick-hz', '55'], { cwd: rootDir, onLine: echo }));
if (code !== 0) fail('Bot exited with an error', code);

console.log('[smoke] 5/10 Lab spectator + scripted movers (direct to the server)...');
code = await run(spawnTs('SPECTATOR', 'scripts/lab-spectator.ts', [], { cwd: rootDir, onLine: echo }));
if (code !== 0) fail('Lab spectator check failed', code);

console.log('[smoke] 6/10 Sync models: full vs delta NetClients under Nightmare + direct spectator...');
code = await run(spawnTs('SYNC', 'scripts/sync-clients.ts', [], { cwd: rootDir, onLine: echo }));
if (code !== 0) fail('Sync-model check failed', code);

console.log('[smoke] 7/10 One UDP network player through udp:9100 under Nightmare (10 s)...');
code = await run(spawnTs('SWARM', 'scripts/swarm.ts', ['--n', '1', '--duration', '10', '--quiet'], { cwd: rootDir, onLine: echo }));
if (code !== 0) fail('UDP network player check failed', code);

console.log('[smoke] 8/10 Lockstep: two lab players (Rd off / on) at 50 ms + 5 % loss + direct spectator...');
code = await run(spawnTs('LOCKSTEP', 'scripts/lockstep-clients.ts', [], { cwd: rootDir, onLine: echo }));
if (code !== 0) fail('Lockstep check failed', code);

console.log('[smoke] 9/10 Game edition: npm run build, then the game server on 8090 (one port: page + /ws)...');
code = await run(spawnNode('BUILD', ['scripts/build.mjs'], { cwd: rootDir, onLine: echo }));
if (code !== 0) fail('npm run build failed', code);
const GAME_PORT = 8090;
children.push(spawnTs('GAME', 'server/src/main.ts', ['--game', '--static', 'dist/game', '--port', String(GAME_PORT)], { cwd: rootDir, onLine: quiet('GAME') }));
if (!(await waitForPort(GAME_PORT))) fail('The game server did not start', 1);
const base = `http://127.0.0.1:${GAME_PORT}`;
code = await run(spawnTs('GAME9', 'scripts/game-clients.ts', ['--base', base, '--step', '9'], { cwd: rootDir, onLine: echo }));
if (code !== 0) fail('Game edition check failed', code);

console.log('[smoke] 10/10 Private room on the game server: create, join by code, host START...');
code = await run(spawnTs('GAME10', 'scripts/game-clients.ts', ['--base', base, '--step', '10'], { cwd: rootDir, onLine: echo }));
if (code !== 0) fail('Private room check failed', code);

cleanup();
console.log('\n\x1b[32m✔ SMOKE TEST COMPLETE: All assertions passed under Nightmare conditions.\x1b[0m\n');
process.exit(0);
