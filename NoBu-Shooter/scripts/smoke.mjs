/**
 * smoke.mjs — headless bot smoke test through the emulator.
 * SPEC.md §14.5:
 * 1. Spawns server and emulator
 * 2. Applies "Nightmare" preset to emulator via control port (9001)
 * 3. Runs headless bot for 10s through emulator data port (9000)
 * 4. Asserts snapshots arrive, ack advances, and exits cleanly.
 */

import { spawn } from 'child_process';
import { WebSocket } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const rootDir = resolve(dirname(__filename), '..');

console.log('\x1b[36m%s\x1b[0m', '═══════════════════════════════════════════════════════════════');
console.log('\x1b[36m%s\x1b[0m', '  NOBU SHOOTER — SMOKE TEST (HEADLESS BOT UNDER NIGHTMARE)    ');
console.log('\x1b[36m%s\x1b[0m', '═══════════════════════════════════════════════════════════════\n');

const children = [];

function startChild(name, cmd, args) {
  const proc = spawn(cmd, args, {
    cwd: rootDir,
    stdio: 'pipe',
    shell: true,
  });

  proc.stderr.on('data', (d) => {
    // Only log actual fatal errors
    const str = d.toString();
    if (str.includes('Error:') || str.includes('Unhandled')) {
      console.error(`[${name} ERR]`, str);
    }
  });

  children.push(proc);
  return proc;
}

function cleanup() {
  for (const c of children) {
    try { c.kill(); } catch { /* ignore */ }
  }
}

process.on('SIGINT', () => { cleanup(); process.exit(1); });
process.on('SIGTERM', () => { cleanup(); process.exit(1); });

async function runSmoke() {
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

  // 1. Start Server
  console.log('[smoke] 1/4 Launching game server (port 8080)...');
  startChild('SERVER', npxCmd, ['tsx', 'server/src/main.ts']);

  // 2. Start Emulator
  console.log('[smoke] 2/4 Launching network emulator (ports 9000/9001)...');
  startChild('EMULATOR', npxCmd, [
    'tsx',
    'emulator/src/main.ts',
    '--listen', '9000',
    '--target', 'ws://127.0.0.1:8080',
    '--control', '9001',
    '--seed', '42',
  ]);

  // 3. Connect to Control port and apply Nightmare preset with retry
  console.log('[smoke] 3/4 Configuring emulator with "Nightmare" preset...');
  let configured = false;
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      await new Promise((resolve, reject) => {
        const ctrlWs = new WebSocket('ws://127.0.0.1:9001');
        ctrlWs.on('open', () => {
          ctrlWs.send(JSON.stringify({ cmd: 'preset', target: 'all', name: 'Nightmare' }));
          setTimeout(() => {
            ctrlWs.close();
            resolve();
          }, 400);
        });
        ctrlWs.on('error', reject);
      });
      configured = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  if (!configured) {
    throw new Error('Timed out connecting to emulator control port (9001)');
  }

  // 4. Run headless bot for 10 seconds
  console.log('[smoke] 4/4 Starting headless bot (10s duration)...');
  const botProc = spawn('node', ['scripts/headless-bot.mjs', '--duration', '10'], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true,
  });

  botProc.on('close', (code) => {
    cleanup();
    if (code === 0) {
      console.log('\n\x1b[32m✔ SMOKE TEST COMPLETE: All assertions passed under Nightmare conditions.\x1b[0m\n');
      process.exit(0);
    } else {
      console.error(`\n\x1b[31m✘ SMOKE TEST FAILED: Bot exited with code ${code}.\x1b[0m\n`);
      process.exit(code || 1);
    }
  });
}

runSmoke().catch((err) => {
  console.error('[smoke] Unexpected error:', err);
  cleanup();
  process.exit(1);
});
