/**
 * dev.mjs — `npm run dev`: the game edition for development
 * (docs/PHASE7_PLAN.md D8). No emulator, no demo tools.
 *   1. Game server (--game)     ws://…:8080 (all interfaces), Delta only
 *   2. Vite dev server (HMR)    http://…:5173 on this machine AND the LAN;
 *                               /ws is forwarded to the game server
 * Open http://localhost:5173 here, or http://<this machine's IP>:5173 from
 * another machine on the same network. Ctrl+C stops both.
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { networkInterfaces } from 'os';
import { spawnTs, spawnNode, assertPortsFree, waitForPort, cleanupOnExit, buildAssets } from './lib/procs.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORTS = { server: 8080, client: 5173 };

const lan = () => Object.values(networkInterfaces()).flat().filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => a.address);

const line = '═══════════════════════════════════════════════════════════════';
console.log(`\x1b[36m${line}\n  NOBU SHOOTER — GAME (development, hot reload)\n${line}\x1b[0m`);

await assertPortsFree(Object.values(PORTS));
buildAssets(rootDir);
// The game server refuses to run with developer tools on
delete process.env.NOBU_DEV;
delete process.env.VITE_NOBU_DEV;

const children = [
  spawnTs('SERVER', 'server/src/main.ts', ['--game', '--port', String(PORTS.server)], { cwd: rootDir, color: '\x1b[32m' }),
  spawnNode('CLIENT', ['scripts/vite-dev.mjs', '--game'], { cwd: rootDir, color: '\x1b[35m' }),
];
const cleanup = cleanupOnExit(children, () => console.log('\nShutting down...'));
children.forEach((c) => c.on('exit', (code) => {
  console.log(`[${c.name}] exited with code ${code}`);
  cleanup();
  process.exit(code ?? 1);
}));

const ok = (await Promise.all(Object.values(PORTS).map((p) => waitForPort(p)))).every(Boolean);
if (!ok) {
  console.error('\x1b[31m✘ A service did not start in time.\x1b[0m');
  cleanup();
  process.exit(1);
}

console.log(`\n\x1b[36m${'─'.repeat(63)}\x1b[0m`);
console.log('\x1b[1m\x1b[32m✔ Game (dev) ready!\x1b[0m Open in a browser:');
console.log(`\x1b[1m\x1b[36m  ► http://localhost:${PORTS.client}\x1b[0m   (this machine)`);
for (const ip of lan()) console.log(`\x1b[1m\x1b[36m  ► http://${ip}:${PORTS.client}\x1b[0m   (other machines on this network)`);
console.log('  Client edits appear at once (hot reload); server edits need a restart (Ctrl+C, npm run dev).');
console.log('  First run on Windows: allow Node.js on "Private networks" when the firewall asks.');
console.log('  Press Ctrl+C to stop.');
console.log(`\x1b[36m${'─'.repeat(63)}\x1b[0m\n`);
