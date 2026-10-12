/**
 * start.mjs — `npm start`: the game for players on this machine and the LAN
 * (docs/PHASE7_PLAN.md D8). One process, one port: the game server (--game)
 * serves the built game (dist/game) and the game WebSocket on 8080.
 *
 *   npm start                     port 8080
 *   npm start -- --port 8000      another port
 *   npm start -- --udp            also open UDP 8081 (network players: npm run swarm)
 *
 * Run `npm run build` first. Ctrl+C stops it.
 */

import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import { existsSync } from 'fs';
import { spawnTs, assertPortsFree, cleanupOnExit } from './lib/procs.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(rootDir, 'dist', 'game');
const args = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const port = Number(portIdx !== -1 ? args[portIdx + 1] : process.env.PORT || 8080);

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('✘ No built game in NoBu-Shooter/dist/game. Run "npm run build" first.');
  process.exit(1);
}
await assertPortsFree([port]);
// The game server refuses to run with developer tools on
delete process.env.NOBU_DEV;

const line = '═══════════════════════════════════════════════════════════════';
console.log(`\x1b[36m${line}\n  NOBU SHOOTER — GAME SERVER\n${line}\x1b[0m`);

const server = spawnTs('SERVER', 'server/src/main.ts', ['--game', '--static', DIST, '--port', String(port), ...args.filter((a, i) => a === '--udp' || (a === '--host' && args[i + 1]) || args[i - 1] === '--host')], { cwd: rootDir, color: '\x1b[32m' });
const cleanup = cleanupOnExit([server], () => console.log('\nShutting down...'));
server.on('exit', (code) => {
  cleanup();
  process.exit(code ?? 1);
});
console.log('First run on Windows: allow Node.js on "Private networks" when the firewall asks. Ctrl+C stops the server.');
