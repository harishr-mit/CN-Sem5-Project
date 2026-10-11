/**
 * demo.mjs — launches the complete NoBu Shooter stack.
 *   1. Authoritative game server   ws://127.0.0.1:8080, udp 127.0.0.1:8081
 *   2. Network emulator            routes ws:9000 → :8080 and udp:9100 → :8081,
 *                                  dashboard + control http://127.0.0.1:9001
 *   3. Client (Vite dev server)    http://localhost:5173
 *   4. Optional: `--swarm N` network players over UDP (scripts/swarm.ts)
 *
 * Ctrl+C stops everything and frees all ports. If this launcher is killed
 * outright, the children notice within ~1 s and exit by themselves.
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import {
  spawnTs, spawnNode, assertPortsFree, assertUdpPortsFree, waitForPort, waitForUdpPort, cleanupOnExit,
} from './lib/procs.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORTS = { server: 8080, emuData: 9000, emuControl: 9001, client: 5173 };
const UDP_PORTS = { serverUdp: 8081, emuUdp: 9100 };

const args = process.argv.slice(2);
const swarmIdx = args.indexOf('--swarm');
const swarmN = swarmIdx !== -1 ? Math.max(0, parseInt(args[swarmIdx + 1] ?? '3', 10) || 0) : 0;

const line = '═══════════════════════════════════════════════════════════════';
console.log(`\x1b[36m${line}\n  NOBU SHOOTER — NETWORK MECHANICS DEMO ENVIRONMENT\n${line}\x1b[0m`);

await assertPortsFree(Object.values(PORTS));
await assertUdpPortsFree(Object.values(UDP_PORTS));
// Developer tools (invincibility toggle in the Network Lab) exist only in the
// demo: the server honours `dev` messages and the client shows the switch.
process.env.NOBU_DEV = '1';
process.env.VITE_NOBU_DEV = '1';
console.log('Starting services...\n');

const children = [
  spawnTs('SERVER', 'server/src/main.ts', [], { cwd: rootDir, color: '\x1b[32m' }),
  spawnTs('EMULATOR', 'emulator/src/main.ts', [
    '--route', `ws:${PORTS.emuData}=ws://127.0.0.1:${PORTS.server}`,
    '--route', `udp:${UDP_PORTS.emuUdp}=127.0.0.1:${UDP_PORTS.serverUdp}`,
    '--control', String(PORTS.emuControl),
    '--seed', '1',
  ], { cwd: rootDir, color: '\x1b[33m' }),
  spawnNode('CLIENT', ['scripts/vite-dev.mjs'], { cwd: rootDir, color: '\x1b[35m' }),
];

const cleanup = cleanupOnExit(children, () => console.log('\nShutting down all services...'));

// If any service dies, stop the rest instead of leaving a half-working demo.
const watchExit = (c) => c.on('exit', (code) => {
  console.log(`[${c.name}] exited with code ${code}`);
  cleanup();
  process.exit(code ?? 1);
});
children.forEach(watchExit);

const ok = (await Promise.all([
  ...Object.values(PORTS).map((p) => waitForPort(p)),
  ...Object.values(UDP_PORTS).map((p) => waitForUdpPort(p)),
])).every(Boolean);
if (!ok) {
  console.error('\x1b[31m✘ A service did not start in time.\x1b[0m');
  cleanup();
  process.exit(1);
}

if (swarmN > 0) {
  const swarm = spawnTs('SWARM', 'scripts/swarm.ts', ['--n', String(swarmN)], { cwd: rootDir, color: '\x1b[34m' });
  children.push(swarm);
  // The swarm is optional: if it stops, the demo keeps running.
  swarm.on('exit', (code) => console.log(`[SWARM] exited with code ${code}`));
}

console.log(`\n\x1b[36m${'─'.repeat(63)}\x1b[0m`);
console.log('\x1b[1m\x1b[32m✔ Demo Ready!\x1b[0m Open in your browser:');
console.log(`\x1b[1m\x1b[36m  ► http://localhost:${PORTS.client}\x1b[0m\n`);
console.log('Services:');
console.log(`  • Client UI:            http://localhost:${PORTS.client}`);
console.log(`  • Emulator dashboard:   http://127.0.0.1:${PORTS.emuControl}/`);
console.log(`  • Emulator routes:      ws:${PORTS.emuData} → ws://127.0.0.1:${PORTS.server}, udp:${UDP_PORTS.emuUdp} → 127.0.0.1:${UDP_PORTS.serverUdp}`);
console.log(`  • Game server:          ws://127.0.0.1:${PORTS.server}, udp 127.0.0.1:${UDP_PORTS.serverUdp}`);
if (swarmN > 0) console.log(`  • Network players:      ${swarmN} over UDP (UDP-1 … UDP-${swarmN})`);
else console.log('  • Network players:      none (npm run demo -- --swarm 3, or npm run swarm in another terminal)');
console.log('  Press Ctrl+C to stop everything.');
console.log(`\x1b[36m${'─'.repeat(63)}\x1b[0m\n`);
