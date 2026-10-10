/**
 * demo.mjs — launches the complete NoBu Shooter stack.
 *   1. Authoritative game server   ws://127.0.0.1:8080
 *   2. Network emulator            data ws://127.0.0.1:9000, control ws://127.0.0.1:9001
 *   3. Client (Vite dev server)    http://localhost:5173
 *
 * Ctrl+C stops everything and frees all four ports. If this launcher is
 * killed outright, the children notice within ~1 s and exit by themselves.
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { spawnTs, spawnNode, assertPortsFree, waitForPort, cleanupOnExit } from './lib/procs.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORTS = { server: 8080, emuData: 9000, emuControl: 9001, client: 5173 };

const line = '═══════════════════════════════════════════════════════════════';
console.log(`\x1b[36m${line}\n  NOBU SHOOTER — NETWORK MECHANICS DEMO ENVIRONMENT\n${line}\x1b[0m`);

await assertPortsFree(Object.values(PORTS));
// Developer tools (invincibility toggle in the Network Lab) exist only in the
// demo: the server honours `dev` messages and the client shows the switch.
process.env.NOBU_DEV = '1';
process.env.VITE_NOBU_DEV = '1';
console.log('Starting services...\n');

const children = [
  spawnTs('SERVER', 'server/src/main.ts', [], { cwd: rootDir, color: '\x1b[32m' }),
  spawnTs('EMULATOR', 'emulator/src/main.ts', [
    '--listen', String(PORTS.emuData),
    '--target', `ws://127.0.0.1:${PORTS.server}`,
    '--control', String(PORTS.emuControl),
    '--seed', '1',
  ], { cwd: rootDir, color: '\x1b[33m' }),
  spawnNode('CLIENT', ['scripts/vite-dev.mjs'], { cwd: rootDir, color: '\x1b[35m' }),
];

const cleanup = cleanupOnExit(children, () => console.log('\nShutting down all services...'));

// If any service dies, stop the rest instead of leaving a half-working demo.
for (const c of children) {
  c.on('exit', (code) => {
    console.log(`[${c.name}] exited with code ${code}`);
    cleanup();
    process.exit(code ?? 1);
  });
}

const ok = (await Promise.all(Object.values(PORTS).map((p) => waitForPort(p)))).every(Boolean);
if (!ok) {
  console.error('\x1b[31m✘ A service did not start in time.\x1b[0m');
  cleanup();
  process.exit(1);
}

console.log(`\n\x1b[36m${'─'.repeat(63)}\x1b[0m`);
console.log('\x1b[1m\x1b[32m✔ Demo Ready!\x1b[0m Open in your browser:');
console.log(`\x1b[1m\x1b[36m  ► http://localhost:${PORTS.client}\x1b[0m\n`);
console.log('Services:');
console.log(`  • Client UI:          http://localhost:${PORTS.client}`);
console.log(`  • Emulator Data:      ws://127.0.0.1:${PORTS.emuData}`);
console.log(`  • Emulator Control:   ws://127.0.0.1:${PORTS.emuControl}`);
console.log(`  • Game Server:        ws://127.0.0.1:${PORTS.server}`);
console.log('  Press Ctrl+C to stop everything.');
console.log(`\x1b[36m${'─'.repeat(63)}\x1b[0m\n`);
