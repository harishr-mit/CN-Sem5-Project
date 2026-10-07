/**
 * demo.mjs — launches the complete NoBu Shooter stack.
 * SPEC.md §5:
 * Starts:
 *   1. Authoritative Game Server (ws://127.0.0.1:8080)
 *   2. Network Emulator (data: ws://127.0.0.1:9000, control: ws://127.0.0.1:9001)
 *   3. Client Vite Dev Server (http://localhost:5173)
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const rootDir = resolve(dirname(__filename), '..');

console.log('\x1b[36m%s\x1b[0m', '═══════════════════════════════════════════════════════════════');
console.log('\x1b[36m%s\x1b[0m', '  NOBU SHOOTER — NETWORK MECHANICS DEMO ENVIRONMENT           ');
console.log('\x1b[36m%s\x1b[0m', '═══════════════════════════════════════════════════════════════');
console.log('Starting services...\n');

const children = [];

function startProcess(name, cmd, args, color) {
  const proc = spawn(cmd, args, {
    cwd: rootDir,
    stdio: 'pipe',
    shell: true,
  });

  proc.stdout.on('data', (d) => {
    const lines = d.toString().trim().split('\n');
    for (const l of lines) {
      if (l.trim()) console.log(`${color}[${name}]\x1b[0m ${l}`);
    }
  });

  proc.stderr.on('data', (d) => {
    const lines = d.toString().trim().split('\n');
    for (const l of lines) {
      if (l.trim()) console.error(`${color}[${name} ERR]\x1b[0m ${l}`);
    }
  });

  proc.on('close', (code) => {
    console.log(`${color}[${name}]\x1b[0m exited with code ${code}`);
  });

  children.push(proc);
  return proc;
}

// 1. Game Server
const server = startProcess(
  'SERVER',
  'npx',
  ['tsx', 'server/src/main.ts'],
  '\x1b[32m' // Green
);

// 2. Network Emulator
const emulator = startProcess(
  'EMULATOR',
  'npx',
  ['tsx', 'emulator/src/main.ts', '--listen', '9000', '--target', 'ws://127.0.0.1:8080', '--control', '9001', '--seed', '1'],
  '\x1b[33m' // Yellow
);

// 3. Client Dev Server
const client = startProcess(
  'CLIENT',
  'npx',
  ['vite', 'client'],
  '\x1b[35m' // Magenta
);

function cleanup() {
  console.log('\nShutting down all services...');
  for (const c of children) {
    try {
      c.kill();
    } catch { /* ignore */ }
  }
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

setTimeout(() => {
  console.log('\n\x1b[36m%s\x1b[0m', '───────────────────────────────────────────────────────────────');
  console.log('\x1b[1m\x1b[32m✔ Demo Ready!\x1b[0m Open in your browser:');
  console.log('\x1b[1m\x1b[36m  ► http://localhost:5173\x1b[0m\n');
  console.log('Services:');
  console.log('  • Client UI:          http://localhost:5173');
  console.log('  • Emulator Data:      ws://127.0.0.1:9000');
  console.log('  • Emulator Control:   ws://127.0.0.1:9001');
  console.log('  • Game Server:        ws://127.0.0.1:8080');
  console.log('\x1b[36m%s\x1b[0m\n', '───────────────────────────────────────────────────────────────');
}, 2500);
