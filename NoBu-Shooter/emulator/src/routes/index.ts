/**
 * routes/index.ts — RouteManager: the emulator's routes and sessions.
 * docs/PHASE5_PLAN.md D4, D6, D7, D15.
 *
 * A route listens on one port (WS or UDP) and forwards every client to one
 * target through its own impaired session. Routes are added from the CLI or
 * at runtime (control API / dashboard) and each owns its defaults (per
 * direction) and active preset; new sessions on a route start from that
 * route's defaults.
 *
 * Config targets: "all" (every route + the defaults for routes added later),
 * a route id ("ws:9000"), a session id ("s3") or a session label.
 */

import { DEFAULT_LINK_CONFIG, type LinkConfig, type PacketEvent } from '../pipeline.js';
import { Session, type Proto, type SendFn } from '../session.js';
import { startWsRoute } from './ws.js';
import { startUdpRoute } from './udp.js';

export interface RouteSpec {
  proto: Proto;
  /** Listen address; undefined = all interfaces (D15). */
  host?: string;
  /** 0 = any free port (tests). */
  port: number;
  /** ws: "ws://host:port"; udp: "host:port" (or "udp://host:port"). */
  target: string;
}

export interface RouteInfo {
  id: string;
  proto: Proto;
  /** Listen address as given ("" = all interfaces). */
  host: string;
  port: number;
  target: string;
  /** Defaults of the up link (client → target) for new sessions. */
  defaults: LinkConfig;
  /** Defaults of the down link (target → client). */
  defaultsDown: LinkConfig;
  preset: string;
  sessions: number;
  /** UDP datagrams / WS connections refused because the route was full. */
  refused: number;
}

/** What a route adapter needs from the manager. */
export interface RouteContext {
  /** Open a session for a new client; null when the route is full. */
  openSession(opts: { label: string; peer: string; toTarget: SendFn; toClient: SendFn; onClose: () => void }): Session | null;
  closeSession(session: Session): void;
  /** Count a refused client (route full). */
  refused(): void;
  readonly udpIdleMs: number;
}

/** A started listener. */
export interface RouteHandle {
  port: number;
  close(): Promise<void>;
}

interface RouteRecord {
  id: string;
  spec: RouteSpec;
  port: number;
  defaults: DirConfigs;
  preset: string;
  sessions: Set<Session>;
  refused: number;
  handle: RouteHandle | null;
}

export interface RouteManagerOptions {
  seed: number;
  /** UDP sessions with no payload for this long are closed (D7). */
  udpIdleMs?: number;
  /** At most this many sessions per route (D7). */
  maxSessionsPerRoute?: number;
}

/** Separate configs for the two directions. */
interface DirConfigs { up: LinkConfig; down: LinkConfig }
const both = (c: LinkConfig): DirConfigs => ({ up: { ...c }, down: { ...c } });
const copyDir = (d: DirConfigs): DirConfigs => ({ up: { ...d.up }, down: { ...d.down } });
function patchDir(d: DirConfigs, direction: 'up' | 'down' | 'both', patch: Partial<LinkConfig>): void {
  if (direction !== 'down') Object.assign(d.up, patch);
  if (direction !== 'up') Object.assign(d.down, patch);
}

type Target =
  | { kind: 'all' }
  | { kind: 'route'; route: RouteRecord }
  | { kind: 'session'; session: Session };

export class RouteManager {
  readonly sessions = new Map<string, Session>();
  private readonly routes = new Map<string, RouteRecord>();
  private readonly closers = new Map<Session, () => void>();
  /** Labels given to UDP peers (`session.label`), kept for a re-created session. */
  private readonly peerLabels = new Map<string, string>();
  /** Defaults (per direction) for routes added later; set by target "all". */
  private dirDefaults: DirConfigs = both(DEFAULT_LINK_CONFIG);
  /** Preset last applied to "all", or "Custom". */
  preset = 'Baseline';
  /** Up-link defaults for routes added later (the down link: defaultsDown). */
  get defaults(): LinkConfig { return { ...this.dirDefaults.up }; }
  get defaultsDown(): LinkConfig { return { ...this.dirDefaults.down }; }
  private seed: number;
  readonly udpIdleMs: number;
  readonly maxSessionsPerRoute: number;

  /** Routes or sessions were added / removed / renamed. */
  onChange?: () => void;
  onPacketEvent?: (ev: PacketEvent) => void;

  constructor(opts: RouteManagerOptions) {
    this.seed = opts.seed;
    this.udpIdleMs = opts.udpIdleMs ?? 30_000;
    this.maxSessionsPerRoute = opts.maxSessionsPerRoute ?? 64;
  }

  /** Start a route. Rejects (and leaves nothing open) if the spec is invalid or the bind fails. */
  async add(spec: RouteSpec): Promise<RouteInfo> {
    validateSpec(spec);
    if (spec.port !== 0 && this.routes.has(`${spec.proto}:${spec.port}`)) {
      throw new Error(`route ${spec.proto}:${spec.port} already exists`);
    }
    const rec: RouteRecord = {
      id: '', spec: { ...spec }, port: spec.port,
      defaults: copyDir(this.dirDefaults), preset: this.preset,
      sessions: new Set(), refused: 0, handle: null,
    };
    const ctx = this.contextFor(rec);
    const handle = spec.proto === 'ws' ? await startWsRoute(spec, ctx) : await startUdpRoute(spec, ctx);
    rec.handle = handle;
    rec.port = handle.port;
    rec.id = `${spec.proto}:${handle.port}`;
    if (this.routes.has(rec.id)) {
      await handle.close();
      throw new Error(`route ${rec.id} already exists`);
    }
    this.routes.set(rec.id, rec);
    console.log(`[emulator] Route ${rec.id} on ${spec.host || 'all interfaces'} → ${spec.target}`);
    this.onChange?.();
    return this.info(rec);
  }

  /** Stop a route: its sessions are closed, then its listener. */
  async remove(id: string): Promise<boolean> {
    const rec = this.routes.get(id);
    if (!rec) return false;
    this.routes.delete(id);
    for (const s of [...rec.sessions]) this.closeSession(s);
    await rec.handle?.close();
    console.log(`[emulator] Route ${id} removed`);
    this.onChange?.();
    return true;
  }

  async closeAll(): Promise<void> {
    for (const id of [...this.routes.keys()]) await this.remove(id);
  }

  list(): RouteInfo[] {
    return [...this.routes.values()].map((r) => this.info(r));
  }

  getRoute(id: string): RouteInfo | null {
    const rec = this.routes.get(id);
    return rec ? this.info(rec) : null;
  }

  // ── Config ────────────────────────────────────────────────────

  /** Merge a patch (already sanitised) into the target's config. False if the target is unknown. */
  setConfig(target: string, direction: 'up' | 'down' | 'both', patch: Partial<LinkConfig>): boolean {
    const t = this.resolve(target);
    if (!t) return false;
    if (t.kind === 'session') {
      t.session.applyConfig(direction, patch);
      return true;
    }
    const recs = t.kind === 'all' ? [...this.routes.values()] : [t.route];
    if (t.kind === 'all') {
      patchDir(this.dirDefaults, direction, patch);
      this.preset = 'Custom';
    }
    for (const r of recs) {
      patchDir(r.defaults, direction, patch);
      r.preset = 'Custom';
      for (const s of r.sessions) s.applyConfig(direction, patch);
    }
    return true;
  }

  /** Apply a complete config under a preset name. False if the target is unknown. */
  applyPreset(target: string, name: string, config: LinkConfig): boolean {
    const t = this.resolve(target);
    if (!t) return false;
    if (t.kind === 'session') {
      t.session.applyConfig('both', config);
      return true;
    }
    if (t.kind === 'all') {
      this.dirDefaults = both(config);
      this.preset = name;
    }
    for (const r of t.kind === 'all' ? [...this.routes.values()] : [t.route]) {
      r.defaults = both(config);
      r.preset = name;
      for (const s of r.sessions) s.applyConfig('both', config);
    }
    return true;
  }

  reseed(seed: number): void {
    this.seed = seed;
    for (const s of this.sessions.values()) s.reseed(seed);
  }

  /** Name a session by id or by peer address ("127.0.0.1:53114"), optionally within one route. */
  labelSession(who: string, label: string, routeId?: string): boolean {
    let found = false;
    for (const s of this.sessions.values()) {
      if (routeId && s.route !== routeId) continue;
      if (s.id === who || s.peer === who) {
        s.label = label;
        this.peerLabels.set(`${s.route}|${s.peer}`, label);
        found = true;
      }
    }
    if (found) this.onChange?.();
    return found;
  }

  private resolve(target: string): Target | null {
    if (target === 'all') return { kind: 'all' };
    const route = this.routes.get(target);
    if (route) return { kind: 'route', route };
    const session = this.sessions.get(target) ?? [...this.sessions.values()].find((s) => s.label === target);
    return session ? { kind: 'session', session } : null;
  }

  // ── Sessions ──────────────────────────────────────────────────

  closeSession(session: Session): void {
    if (!this.sessions.delete(session.id)) return;
    session.close();
    for (const r of this.routes.values()) r.sessions.delete(session);
    const closer = this.closers.get(session);
    this.closers.delete(session);
    closer?.();
    this.onChange?.();
  }

  private contextFor(rec: RouteRecord): RouteContext {
    return {
      udpIdleMs: this.udpIdleMs,
      openSession: ({ label, peer, toTarget, toClient, onClose }) => {
        if (rec.sessions.size >= this.maxSessionsPerRoute) return null;
        const session = new Session({
          label: this.peerLabels.get(`${rec.id}|${peer}`) ?? label,
          route: rec.id, proto: rec.spec.proto, peer,
          seed: this.seed, config: rec.defaults.up, configDown: rec.defaults.down, toTarget, toClient,
        });
        session.onPacketEvent = (ev) => this.onPacketEvent?.(ev);
        rec.sessions.add(session);
        this.sessions.set(session.id, session);
        this.closers.set(session, onClose);
        console.log(`[emulator] New session ${session.id} "${session.label}" on ${rec.id} (${peer})`);
        this.onChange?.();
        return session;
      },
      closeSession: (s) => this.closeSession(s),
      refused: () => { rec.refused++; },
    };
  }

  private info(r: RouteRecord): RouteInfo {
    return {
      id: r.id, proto: r.spec.proto, host: r.spec.host ?? '', port: r.port, target: r.spec.target,
      defaults: { ...r.defaults.up }, defaultsDown: { ...r.defaults.down },
      preset: r.preset, sessions: r.sessions.size, refused: r.refused,
    };
  }
}

/** Split "host:port" / "udp://host:port" / "[::1]:port" into parts. */
export function parseHostPort(s: string): { host: string; port: number } | null {
  const m = /^(?:udp:\/\/)?(\[[^\]]+\]|[^:/\s]+):(\d{1,5})\/?$/.exec(s.trim());
  if (!m) return null;
  const port = Number(m[2]);
  if (port < 1 || port > 65535) return null;
  return { host: m[1].replace(/^\[|\]$/g, ''), port };
}

function validateSpec(spec: RouteSpec): void {
  if (spec.proto !== 'ws' && spec.proto !== 'udp') throw new Error('proto must be "ws" or "udp"');
  if (!Number.isInteger(spec.port) || spec.port < 0 || spec.port > 65535) throw new Error('listen port must be 0–65535');
  if (spec.host !== undefined && !/^[\w.:-]+$/.test(spec.host)) throw new Error('invalid listen host');
  if (spec.proto === 'ws') {
    let url: URL;
    try { url = new URL(spec.target); } catch { throw new Error('ws target must be a ws:// or wss:// URL'); }
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') throw new Error('ws target must be a ws:// or wss:// URL');
  } else if (!parseHostPort(spec.target)) {
    throw new Error('udp target must be host:port');
  }
}
