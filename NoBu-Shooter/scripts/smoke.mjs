/**
 * smoke.mjs — headless bot smoke test through the real emulator (SPEC.md §14.5).
 * 1. Starts the server and emulator
 * 2. Applies the "Nightmare" preset via the control port
 * 3. Runs the headless bot for 10 s through the emulator data port
 * 4. Asserts snapshots keep arriving, ack advances, tick rate ≥ 55 Hz
 * 5. Joins the lab room as a spectator (direct to the server), turns on the
 *    scripted movers and checks them against moverPath (PHASES.md C2, C3)
 * 6. Sync models (PHASES.md Phase 3): full + delta NetClients through the
 *    emulator (still Nightmare) and a direct spectator; delta must decode to
 *    the server's world exactly with far fewer bytes (scripts/sync-clients.ts)
 * All child processes are stopped (and ports freed) on every exit path.
 */

import { WebSocket } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { spawnTs, spawnNode, assertPortsFree, waitForPort, cleanupOnExit } from './lib/procs.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

console.log('\x1b[36m%s\x1b[0m', '═══════════════════════════════════════════════════════════════');
console.log('\x1b[36m%s\x1b[0m', '  NOBU SHOOTER — SMOKE TEST (HEADLESS BOT UNDER NIGHTMARE)    ');
console.log('\x1b[36m%s\x1b[0m', '═══════════════════════════════════════════════════════════════\n');

await assertPortsFree([8080, 9000, 9001]);

const quiet = (name) => (l, isErr) => {
  if (isErr && /Error|Unhandled/.test(l)) console.error(`[${name} ERR] ${l}`);
};

const children = [];
const cleanup = cleanupOnExit(children);

console.log('[smoke] 1/6 Launching game server (port 8080)...');
children.push(spawnTs('SERVER', 'server/src/main.ts', [], { cwd: rootDir, onLine: quiet('SERVER') }));

console.log('[smoke] 2/6 Launching network emulator (ports 9000/9001)...');
children.push(spawnTs('EMULATOR', 'emulator/src/main.ts', [
  '--listen', '9000', '--target', 'ws://127.0.0.1:8080', '--control', '9001', '--seed', '42',
], { cwd: rootDir, onLine: quiet('EMULATOR') }));

if (!(await waitForPort(8080)) || !(await waitForPort(9001)) || !(await waitForPort(9000))) {
  console.error('[smoke] Services did not start in time');
  cleanup();
  process.exit(1);
}

console.log('[smoke] 3/6 Configuring emulator with "Nightmare" preset...');
await new Promise((resolveP, reject) => {
  const ctrl = new WebSocket('ws://127.0.0.1:9001');
  ctrl.on('open', () => {
    ctrl.send(JSON.stringify({ cmd: 'preset', target: 'all', name: 'Nightmare' }));
    setTimeout(() => { ctrl.close(); resolveP(); }, 300);
  });
  ctrl.on('error', reject);
});

console.log('[smoke] 4/6 Starting headless bot (10s duration)...');
const bot = spawnNode('BOT', ['scripts/headless-bot.mjs', '--duration', '10', '--min-tick-hz', '55'], {
  cwd: rootDir,
  onLine: (l) => console.log(l),
});
children.push(bot);

bot.on('exit', (code) => {
  if (code !== 0) {
    cleanup();
    console.error(`\n\x1b[31m✘ SMOKE TEST FAILED: Bot exited with code ${code}.\x1b[0m\n`);
    process.exit(code || 1);
  }
  console.log('[smoke] 5/6 Lab spectator + scripted movers (direct to the server)...');
  const spectator = spawnTs('SPECTATOR', 'scripts/lab-spectator.ts', [], { cwd: rootDir, onLine: (l) => console.log(l) });
  children.push(spectator);
  spectator.on('exit', (scode) => {
    if (scode !== 0) {
      cleanup();
      console.error(`\n\x1b[31m✘ SMOKE TEST FAILED: Lab spectator check exited with code ${scode}.\x1b[0m\n`);
      process.exit(scode || 1);
    }
    console.log('[smoke] 6/6 Sync models: full vs delta NetClients under Nightmare + direct spectator...');
    const sync = spawnTs('SYNC', 'scripts/sync-clients.ts', [], { cwd: rootDir, onLine: (l) => console.log(l) });
    children.push(sync);
    sync.on('exit', (ycode) => {
      cleanup();
      if (ycode === 0) {
        console.log('\n\x1b[32m✔ SMOKE TEST COMPLETE: All assertions passed under Nightmare conditions.\x1b[0m\n');
        process.exit(0);
      }
      console.error(`\n\x1b[31m✘ SMOKE TEST FAILED: Sync-model check exited with code ${ycode}.\x1b[0m\n`);
      process.exit(ycode || 1);
    });
  });
});
