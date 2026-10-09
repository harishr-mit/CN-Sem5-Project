/**
 * procs.mjs — child-process helpers for demo.mjs and smoke.mjs.
 *
 * Every service runs as ONE node process (no `shell: true`, no npx/tsx CLI
 * wrapper), so killing it actually frees its port. Children also get
 * NOBU_PARENT_PID and exit on their own if the launcher is killed outright
 * (see server/src/parentWatch.ts). On Windows we additionally kill the whole
 * tree with taskkill as a fallback.
 */

import { spawn, spawnSync } from 'child_process';
import net from 'net';

/** Spawn `node --import tsx <script> ...args` (TypeScript entry points). */
export function spawnTs(name, script, args, { cwd, color = '', onLine } = {}) {
  return spawnNode(name, ['--import', 'tsx', script, ...args], { cwd, color, onLine });
}

/** Spawn a plain node process with prefixed, line-buffered output. */
export function spawnNode(name, nodeArgs, { cwd, color = '', onLine } = {}) {
  const proc = spawn(process.execPath, ['--no-deprecation', ...nodeArgs], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NOBU_PARENT_PID: String(process.pid), FORCE_COLOR: '1' },
    windowsHide: true,
  });
  const pipe = (stream, isErr) => {
    let buf = '';
    stream.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? '';
      for (const l of lines) {
        if (!l.trim()) continue;
        if (onLine) onLine(l, isErr);
        else (isErr ? console.error : console.log)(`${color}[${name}${isErr ? ' ERR' : ''}]\x1b[0m ${l}`);
      }
    });
  };
  pipe(proc.stdout, false);
  pipe(proc.stderr, true);
  proc.name = name;
  return proc;
}

/** Kill a child and everything it started. Safe to call twice. */
export function killTree(proc) {
  if (!proc || proc.exitCode !== null || proc.killed) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } else {
    try { proc.kill('SIGTERM'); } catch { /* already gone */ }
  }
}

/**
 * Resolve true if something accepts connections on `port` (IPv4 or IPv6
 * loopback). A connect probe is used because on Windows a bind probe on
 * 127.0.0.1 succeeds even while another process listens on the wildcard.
 */
export function portInUse(port) {
  const probe = (host) => new Promise((resolve) => {
    const sock = net.connect({ port, host });
    const done = (v) => { sock.destroy(); resolve(v); };
    sock.setTimeout(500, () => done(false));
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
  });
  return Promise.all([probe('127.0.0.1'), probe('::1')]).then((r) => r.some(Boolean));
}

/** Exit with a helpful message if any of the ports is taken. */
export async function assertPortsFree(ports) {
  const busy = [];
  for (const p of ports) if (await portInUse(p)) busy.push(p);
  if (busy.length === 0) return;
  console.error(`\x1b[31m✘ Port(s) already in use: ${busy.join(', ')}\x1b[0m`);
  console.error('  Another demo is probably still running. Stop it, or free the ports:');
  if (process.platform === 'win32') {
    console.error(`  PowerShell: Get-NetTCPConnection -LocalPort ${busy.join(',')} -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`);
  } else {
    console.error(`  lsof -ti tcp:${busy.join(',tcp:')} | xargs kill`);
  }
  process.exit(1);
}

/** Wait until `port` accepts connections (or time out). */
export async function waitForPort(port, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await portInUse(port)) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

/** Kill all children on Ctrl+C, terminal close or normal exit. */
export function cleanupOnExit(children, onBeforeExit) {
  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    onBeforeExit?.();
    for (const c of children) killTree(c);
  };
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
    process.on(sig, () => { cleanup(); process.exit(0); });
  }
  process.on('exit', cleanup);
  return cleanup;
}
