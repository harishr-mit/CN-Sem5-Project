/**
 * serverUrl.ts — where the client connects (docs/PHASE7_PLAN.md D5, M1).
 *
 * The page's own host is the one address that works both on this machine
 * and from another machine on the LAN, so both editions derive their
 * WebSocket URLs from it instead of a hard-coded 127.0.0.1:
 * - the game: `ws(s)://<page host>/ws` — the server that served the page
 *   (`npm start`), or Vite's proxy to it (`npm run dev`);
 * - the demo: the emulator / server ports on the page's host name.
 * `?server=host:port` (or a full ws:// / wss:// URL) overrides the game's
 * address, e.g. to put the standalone emulator in front of the server.
 */

/** The parts of `window.location` used here (tests pass plain objects). */
export interface PageLocation {
  protocol: string;
  host: string;
  hostname: string;
  search: string;
}

const HOST_PORT = /^[A-Za-z0-9.-]+(:\d{1,5})?$|^\[[0-9A-Fa-f:.]+\](:\d{1,5})?$/;

function wsScheme(loc: PageLocation): 'ws' | 'wss' {
  return loc.protocol === 'https:' ? 'wss' : 'ws';
}

/** `?server=` as a WebSocket URL, or null when absent or malformed. */
export function serverOverride(loc: PageLocation): string | null {
  const raw = new URLSearchParams(loc.search).get('server')?.trim();
  if (!raw) return null;
  if (/^wss?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      return HOST_PORT.test(u.host) ? `${u.protocol}//${u.host}${u.pathname === '/' ? '' : u.pathname}` : null;
    } catch {
      return null;
    }
  }
  return HOST_PORT.test(raw) ? `${wsScheme(loc)}://${raw}` : null;
}

/** The game's WebSocket URL. */
export function gameServerUrl(loc: PageLocation): string {
  return serverOverride(loc) ?? `${wsScheme(loc)}://${loc.host}/ws`;
}

/** A demo service (emulator data / control, server) on the page's host. */
export function demoServiceUrl(loc: PageLocation, port: number): string {
  const host = loc.hostname.includes(':') && !loc.hostname.startsWith('[') ? `[${loc.hostname}]` : loc.hostname || '127.0.0.1';
  return `ws://${host}:${port}`;
}

/** `?room=blue-fox` from a share link, or null. */
export function roomFromUrl(loc: PageLocation): string | null {
  const raw = new URLSearchParams(loc.search).get('room')?.trim();
  return raw ? raw.slice(0, 40) : null;
}

/** The share link for a private room: this page with `?room=<code>` (and `?server=` kept). */
export function roomLink(loc: PageLocation & { origin: string; pathname: string }, code: string): string {
  const params = new URLSearchParams();
  const server = new URLSearchParams(loc.search).get('server');
  if (server) params.set('server', server);
  params.set('room', code);
  return `${loc.origin}${loc.pathname}?${params.toString()}`;
}
