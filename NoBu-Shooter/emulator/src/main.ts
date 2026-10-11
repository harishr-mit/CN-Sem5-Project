/**
 * main.ts — network emulator entry point (SPEC.md §11, docs/PHASE5_PLAN.md D4, D5).
 *
 *   node --import tsx emulator/src/main.ts [options]
 *
 *   --route <proto>:[host:]<port>=<target>   a route, repeatable:
 *        ws:9000=ws://127.0.0.1:8080          WebSocket, all interfaces
 *        udp:9100=127.0.0.1:8081              UDP, all interfaces
 *        udp:127.0.0.1:9100=127.0.0.1:8081    UDP, this machine only
 *   --listen <port> --target <ws-url>        old form: one WS route
 *   --control <port>      dashboard + control API (default 9001)
 *   --control-host <ip>   default 127.0.0.1 (anything else is reachable from other machines)
 *   --allow-origin <url>  extra browser origin for the control API, repeatable
 *   --udp-idle-ms <ms>    close UDP sessions idle this long (default 30000)
 *   --max-sessions <n>    sessions per route (default 64)
 *   --seed <n>            impairment RNG seed (default 1)
 *
 * With no route the emulator starts with only the dashboard; routes can be
 * added there (or with the control API's route.add) while it runs.
 */

import { createEmulator, parseRouteArg } from './emulator.js';
import type { RouteSpec } from './routes/index.js';
import { exitWithParent } from './parentWatch.js';

const args = process.argv.slice(2);
function getArg(name: string, def: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : def;
}
function getAll(name: string): string[] {
  const out: string[] = [];
  args.forEach((a, i) => { if (a === `--${name}` && args[i + 1]) out.push(args[i + 1]); });
  return out;
}

const controlPort = parseInt(getArg('control', '9001'), 10);
const controlHost = getArg('control-host', '127.0.0.1');

let routes: RouteSpec[];
try {
  routes = getAll('route').map(parseRouteArg);
  if (args.includes('--listen')) {
    routes.unshift({ proto: 'ws', port: parseInt(getArg('listen', '9000'), 10), target: getArg('target', 'ws://127.0.0.1:8080') });
  }
} catch (err) {
  console.error(`[emulator] ${(err as Error).message}`);
  process.exit(2);
}

if (controlHost !== '127.0.0.1' && controlHost !== 'localhost' && controlHost !== '::1') {
  console.warn(`[emulator] WARNING: the control API on ${controlHost} can be reached from other machines; anyone who reaches it can open routes.`);
}

try {
  const emu = await createEmulator({
    controlPort,
    controlHost,
    allowOrigins: getAll('allow-origin'),
    seed: parseInt(getArg('seed', '1'), 10),
    udpIdleMs: parseInt(getArg('udp-idle-ms', '30000'), 10),
    maxSessionsPerRoute: parseInt(getArg('max-sessions', '64'), 10),
    routes,
  });
  const shownHost = controlHost === '127.0.0.1' ? '127.0.0.1' : controlHost;
  console.log(`[emulator] Dashboard: http://${shownHost}:${emu.control.port}/`);
  console.log(`[emulator] Control  : ws://${shownHost}:${emu.control.port}`);
  if (routes.length === 0) console.log('[emulator] No routes yet: add one on the dashboard.');
  exitWithParent(() => { void emu.close(); });
  const stop = () => { void emu.close().finally(() => process.exit(0)); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
} catch (err) {
  console.error(`[emulator] Failed to start: ${(err as Error).message}`);
  process.exit(1);
}
