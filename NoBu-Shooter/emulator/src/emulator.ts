/**
 * emulator.ts — builds a running emulator: routes + control API/dashboard.
 * Used by main.ts (CLI) and in-process by the tests.
 */

import { ControlServer } from './control.js';
import { RouteManager, type RouteSpec, parseHostPort } from './routes/index.js';
import type { Proto } from './session.js';

export interface EmulatorOptions {
  controlPort: number;
  controlHost?: string;
  allowOrigins?: string[];
  seed?: number;
  udpIdleMs?: number;
  maxSessionsPerRoute?: number;
  routes?: RouteSpec[];
}

export interface Emulator {
  routes: RouteManager;
  control: ControlServer;
  close(): Promise<void>;
}

export async function createEmulator(opts: EmulatorOptions): Promise<Emulator> {
  const routes = new RouteManager({
    seed: opts.seed ?? 1,
    udpIdleMs: opts.udpIdleMs,
    maxSessionsPerRoute: opts.maxSessionsPerRoute,
  });
  const control = new ControlServer(routes, { port: opts.controlPort, host: opts.controlHost, allowOrigins: opts.allowOrigins });
  await control.listen();
  try {
    for (const r of opts.routes ?? []) await routes.add(r);
  } catch (err) {
    await routes.closeAll();
    await control.close();
    throw err;
  }
  return {
    routes,
    control,
    close: async () => {
      await routes.closeAll();
      await control.close();
    },
  };
}

/**
 * Parse a CLI route: `<proto>:[host:]<port>=<target>`, e.g.
 * `ws:9000=ws://127.0.0.1:8080`, `udp:127.0.0.1:9100=127.0.0.1:8081`,
 * `udp:[::1]:9100=[::1]:8081`. No host = all interfaces (D15).
 */
export function parseRouteArg(arg: string): RouteSpec {
  const eq = arg.indexOf('=');
  if (eq < 0) throw new Error(`route "${arg}": expected <proto>:[host:]<port>=<target>`);
  const left = arg.slice(0, eq);
  const target = arg.slice(eq + 1);
  const m = /^(ws|udp):(?:(\[[^\]]+\]|[^:]+):)?(\d{1,5})$/.exec(left);
  if (!m) throw new Error(`route "${arg}": expected <proto>:[host:]<port>=<target>`);
  const proto = m[1] as Proto;
  const host = m[2]?.replace(/^\[|\]$/g, '');
  const port = Number(m[3]);
  if (proto === 'udp' && !parseHostPort(target)) throw new Error(`route "${arg}": udp target must be host:port`);
  return { proto, port, target, ...(host ? { host } : {}) };
}
