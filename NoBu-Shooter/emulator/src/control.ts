/**
 * control.ts — the emulator's control API and dashboard (never impaired).
 * SPEC.md §11.4, docs/PHASE5_PLAN.md D5, D7, D12.
 *
 * One HTTP server on the control port (127.0.0.1 by default):
 *   GET /, /app.js, /style.css  → the dashboard (emulator/dashboard/, fixed allowlist)
 *   WebSocket upgrade           → the control API (JSON commands / events)
 * Browsers must come from an allowlisted Origin; Node tools send none.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';
import type { PacketEvent } from './pipeline.js';
import { DEFAULT_LINK_CONFIG } from './pipeline.js';
import { PRESETS, completeConfig, sanitizePatch } from './presets.js';
import type { RouteManager, RouteSpec } from './routes/index.js';

export { PRESETS, completeConfig } from './presets.js';

/** The only files the dashboard server answers with (no path joins from the URL). */
const DASHBOARD_FILES: Record<string, { file: string; type: string }> = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/index.html': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/app.js': { file: 'app.js', type: 'text/javascript; charset=utf-8' },
  '/style.css': { file: 'style.css', type: 'text/css; charset=utf-8' },
};
const DASHBOARD_DIR = fileURLToPath(new URL('../dashboard/', import.meta.url));

const RESTRICTED_PAGE = `<!doctype html><meta charset="utf-8"><title>Restricted</title>
<body style="font-family:system-ui;background:#0a081a;color:#e8e8ff;padding:2rem;max-width:34rem;margin:auto">
<h1 style="color:#ff5a8c">Restricted</h1>
<p>The emulator dashboard is a developer tool and is available on the host machine only.</p>
<p>To play, open the game on port <b>8080</b> of this same address.</p>`;

const LOOPBACK = /^(localhost|\[::1\]|127(\.\d{1,3}){3})$/;

export interface ControlOptions {
  port: number;
  /** Default 127.0.0.1 (D7). */
  host?: string;
  /** Extra browser origins allowed to use the control API. */
  allowOrigins?: string[];
}

export class ControlServer {
  private readonly http: Server;
  private readonly wss: WebSocketServer;
  private readonly routes: RouteManager;
  private readonly opts: ControlOptions;
  private readonly controlClients = new Set<WebSocket>();
  private readonly packetSubscribers = new Set<WebSocket>();
  private packetBuffer: PacketEvent[] = [];
  private timers: ReturnType<typeof setInterval>[] = [];
  private stateQueued = false;
  /** Actual port (after listen). */
  port = 0;

  constructor(routes: RouteManager, opts: ControlOptions) {
    this.routes = routes;
    this.opts = opts;
    this.http = createServer((req, res) => void this.serveStatic(req, res));
    this.wss = new WebSocketServer({
      server: this.http,
      verifyClient: ({ origin, req }: { origin?: string; req: IncomingMessage }) => this.hostAllowed(req.headers.host) && this.originAllowed(origin),
    });
    this.wss.on('connection', (ws) => this.onClient(ws));
    routes.onChange = () => this.queueState();
    routes.onPacketEvent = (ev) => this.onPacketEvent(ev);
  }

  async listen(): Promise<number> {
    const host = this.opts.host ?? '127.0.0.1';
    this.port = await new Promise<number>((resolve, reject) => {
      this.http.once('error', reject);
      this.http.listen(this.opts.port, host, () => {
        this.http.off('error', reject);
        const a = this.http.address();
        resolve(typeof a === 'object' && a ? a.port : this.opts.port);
      });
    });
    this.timers.push(setInterval(() => this.broadcastStats(), 500));
    this.timers.push(setInterval(() => this.flushPacketEvents(), 100));
    return this.port;
  }

  close(): Promise<void> {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    for (const ws of this.controlClients) ws.terminate();
    this.wss.close();
    return new Promise((resolve) => {
      this.http.close(() => resolve());
      this.http.closeAllConnections?.();
    });
  }

  /**
   * Loopback-bound (the default): only a Host naming this machine is served. A
   * forwarded port arrives from 127.0.0.1 but carries the tunnel's Host, so
   * this is what keeps the dashboard off tablets (and blocks DNS rebinding).
   */
  private hostAllowed(host: string | undefined): boolean {
    if (!host || !['127.0.0.1', 'localhost', '::1'].includes(this.opts.host ?? '127.0.0.1')) return true;
    return LOOPBACK.test(host.trim().toLowerCase().replace(/:\d+$/, ''));
  }

  /** No Origin (Node tools) or an allowlisted browser origin (D7). */
  originAllowed(origin: string | undefined): boolean {
    if (!origin) return true;
    const allowed = new Set([
      `http://127.0.0.1:${this.port}`, `http://localhost:${this.port}`,
      'http://localhost:5173', 'http://127.0.0.1:5173',
      ...(this.opts.allowOrigins ?? []),
    ]);
    return allowed.has(origin.replace(/\/$/, ''));
  }

  private async serveStatic(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.hostAllowed(req.headers.host)) {
      res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(RESTRICTED_PAGE);
      return;
    }
    const path = (req.url ?? '/').split('?')[0];
    const entry = req.method === 'GET' ? DASHBOARD_FILES[path] : undefined;
    if (!entry) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found\n');
      return;
    }
    try {
      const body = await readFile(DASHBOARD_DIR + entry.file);
      res.writeHead(200, { 'Content-Type': entry.type, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(body);
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Dashboard files missing\n');
    }
  }

  private onClient(ws: WebSocket): void {
    this.controlClients.add(ws);
    this.send(ws, this.stateMessage());
    ws.on('message', (raw) => {
      let cmd: Record<string, unknown>;
      try { cmd = JSON.parse(raw.toString()) as Record<string, unknown>; } catch { return; }
      if (typeof cmd !== 'object' || cmd === null) return;
      void this.handleCmd(ws, cmd);
    });
    ws.on('close', () => {
      this.controlClients.delete(ws);
      this.packetSubscribers.delete(ws);
    });
    ws.on('error', () => ws.close());
  }

  onPacketEvent(ev: PacketEvent): void {
    if (this.packetSubscribers.size === 0) return;
    this.packetBuffer.push(ev);
    // Cap buffer to avoid memory growth
    if (this.packetBuffer.length > 1000) this.packetBuffer.splice(0, 500);
  }

  private flushPacketEvents(): void {
    if (this.packetSubscribers.size === 0 || this.packetBuffer.length === 0) return;
    // At most 60 items per batch; keep the newest so the UI shows what is
    // happening now rather than a growing backlog.
    const items = this.packetBuffer.slice(-60);
    this.packetBuffer = [];
    const msg = JSON.stringify({ evt: 'packets', items });
    for (const ws of this.packetSubscribers) this.send(ws, msg);
  }

  private async handleCmd(ws: WebSocket, cmd: Record<string, unknown>): Promise<void> {
    const name = cmd['cmd'];
    const target = typeof cmd['target'] === 'string' ? cmd['target'] : 'all';
    const fail = (msg: string) => this.send(ws, JSON.stringify({ evt: 'error', cmd: name, msg }));
    switch (name) {
      case 'get':
        this.send(ws, this.stateMessage());
        break;

      case 'set': {
        const d = cmd['direction'];
        const direction = d === 'up' || d === 'down' ? d : 'both';
        if (!this.routes.setConfig(target, direction, sanitizePatch(cmd['patch']))) return fail(`unknown target "${target}"`);
        this.broadcastState();
        break;
      }

      case 'preset': {
        // A named preset, or an ad-hoc one when `config` is given
        const pname = cmd['name'];
        if (typeof pname !== 'string') return fail('preset needs a name');
        const config = cmd['config'] !== undefined ? completeConfig(cmd['config']) : PRESETS[pname];
        if (!config) return fail(`unknown preset "${pname}"`);
        if (!this.routes.applyPreset(target, pname, config)) return fail(`unknown target "${target}"`);
        this.broadcastState();
        break;
      }

      case 'reset':
        if (!this.routes.applyPreset(target, 'Baseline', { ...DEFAULT_LINK_CONFIG })) return fail(`unknown target "${target}"`);
        this.broadcastState();
        break;

      case 'seed': {
        const v = cmd['value'];
        if (typeof v === 'number' && Number.isFinite(v)) this.routes.reseed(v);
        break;
      }

      case 'subscribe':
        if (cmd['packets']) this.packetSubscribers.add(ws);
        else this.packetSubscribers.delete(ws);
        break;

      case 'route.add': {
        const spec = parseRouteCmd(cmd);
        if (typeof spec === 'string') return fail(spec);
        try {
          const info = await this.routes.add(spec);
          this.send(ws, JSON.stringify({ evt: 'ack', cmd: name, id: info.id }));
        } catch (err) {
          return fail((err as Error).message);
        }
        break;
      }

      case 'route.remove': {
        const id = cmd['id'];
        if (typeof id !== 'string' || !(await this.routes.remove(id))) return fail(`unknown route "${String(id)}"`);
        this.send(ws, JSON.stringify({ evt: 'ack', cmd: name, id }));
        break;
      }

      case 'session.label': {
        // Find by session id or peer address ("127.0.0.1:53114"); optional route
        const who = cmd['peer'] ?? cmd['session'];
        const label = cmd['label'];
        const route = typeof cmd['route'] === 'string' ? cmd['route'] : undefined;
        if (typeof who !== 'string' || typeof label !== 'string' || label.length === 0 || label.length > 40) {
          return fail('session.label needs peer (or session) and a label of 1–40 characters');
        }
        if (!this.routes.labelSession(who, label, route)) return fail(`no session for "${who}"`);
        break;
      }

      default:
        fail(`unknown command "${String(name)}"`);
    }
  }

  private stateMessage(): string {
    return JSON.stringify({
      evt: 'state',
      sessions: [...this.routes.sessions.values()].map((s) => s.getState()),
      routes: this.routes.list(),
      defaults: this.routes.defaults,
      defaultsDown: this.routes.defaultsDown,
      preset: this.routes.preset,
      presets: Object.keys(PRESETS),
      presetConfigs: PRESETS,
      control: { port: this.port },
    });
  }

  private send(ws: WebSocket, msg: string): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }

  /** Coalesce state broadcasts from bursts of session changes. */
  private queueState(): void {
    if (this.stateQueued) return;
    this.stateQueued = true;
    setTimeout(() => { this.stateQueued = false; this.broadcastState(); }, 20).unref?.();
  }

  private broadcastState(): void {
    const msg = this.stateMessage();
    for (const ws of this.controlClients) this.send(ws, msg);
  }

  private broadcastStats(): void {
    if (this.controlClients.size === 0) return;
    const now = Date.now();
    const msg = JSON.stringify({
      evt: 'stats',
      t: now,
      sessions: [...this.routes.sessions.values()].map((s) => s.getStats(now)),
      routes: this.routes.list().map((r) => ({ id: r.id, sessions: r.sessions, refused: r.refused })),
    });
    for (const ws of this.controlClients) this.send(ws, msg);
  }
}

/** Validate a `route.add` command into a RouteSpec, or return an error message. */
function parseRouteCmd(cmd: Record<string, unknown>): RouteSpec | string {
  const proto = cmd['proto'];
  const port = cmd['port'];
  const target = cmd['target'];
  const host = cmd['host'];
  if (proto !== 'ws' && proto !== 'udp') return 'proto must be "ws" or "udp"';
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) return 'port must be 1–65535';
  if (typeof target !== 'string' || target.length === 0) return 'target is required';
  if (host !== undefined && host !== '' && typeof host !== 'string') return 'host must be a string';
  return { proto, port, target, ...(typeof host === 'string' && host !== '' ? { host } : {}) };
}
