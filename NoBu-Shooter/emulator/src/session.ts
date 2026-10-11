/**
 * session.ts — one emulator session: one client (a WS connection or a UDP
 * source address) and its path to the route's target, with independent
 * up (client → target) and down (target → client) links.
 * SPEC.md §11.1. Transport-free: the route adapter (routes/ws.ts,
 * routes/udp.ts) hands in two send functions and feeds received payloads to
 * fromClient / fromTarget (docs/PHASE5_PLAN.md §2.1).
 */

import { Pipeline, LinkState, DEFAULT_LINK_CONFIG, wallClock } from './pipeline.js';
import type { Packet, LinkConfig, PacketEvent, Clock } from './pipeline.js';

let nextSessionId = 1;

/** Each frame/datagram is accounted with a UDP/IP header (SPEC.md §11.2). */
export const UDP_IP_HEADER_BYTES = 28;

export type Proto = 'ws' | 'udp';
export type SendFn = (data: Buffer | string, binary: boolean) => void;

export interface SessionOptions {
  label: string;
  /** Route id, e.g. "ws:9000". */
  route: string;
  proto: Proto;
  /** Client address "host:port" (UDP: the NAT-like session key). */
  peer: string;
  seed: number;
  /** Up-link config (and the down link's, unless configDown is given). */
  config: LinkConfig;
  configDown?: LinkConfig;
  /** Deliver a payload to the route's target (after the up link). */
  toTarget: SendFn;
  /** Deliver a payload to the client (after the down link). */
  toClient: SendFn;
  clock?: Clock;
}

export class Session {
  readonly id: string;
  label: string;
  readonly route: string;
  readonly proto: Proto;
  readonly peer: string;
  readonly createdAt: number;
  /** Last payload in either direction (UDP idle timeout). */
  lastActivity: number;

  readonly upLink: LinkState;
  readonly downLink: LinkState;

  private readonly pipeline: Pipeline;
  private readonly toTarget: SendFn;
  private readonly toClient: SendFn;
  private readonly clock: Clock;
  private closed = false;

  onPacketEvent?: (ev: PacketEvent) => void;

  constructor(opts: SessionOptions) {
    this.id = `s${nextSessionId++}`;
    this.label = opts.label;
    this.route = opts.route;
    this.proto = opts.proto;
    this.peer = opts.peer;
    this.clock = opts.clock ?? wallClock;
    this.createdAt = this.clock.now();
    this.lastActivity = this.createdAt;
    this.pipeline = new Pipeline(opts.seed, this.clock);
    this.toTarget = opts.toTarget;
    this.toClient = opts.toClient;
    this.upLink = new LinkState({ ...DEFAULT_LINK_CONFIG, ...opts.config });
    this.downLink = new LinkState({ ...DEFAULT_LINK_CONFIG, ...(opts.configDown ?? opts.config) });
  }

  /** A payload from the client: impaired on the up link, then sent to the target. */
  fromClient(data: Buffer | string, binary = false): void {
    this.forward(data, binary, this.upLink, 'up', this.toTarget);
  }

  /** A payload from the target: impaired on the down link, then sent to the client. */
  fromTarget(data: Buffer | string, binary = false): void {
    this.forward(data, binary, this.downLink, 'down', this.toClient);
  }

  /** Packets still in flight are dropped silently after this. */
  close(): void {
    this.closed = true;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  private forward(data: Buffer | string, binary: boolean, link: LinkState, dir: 'up' | 'down', send: SendFn): void {
    if (this.closed) return;
    this.lastActivity = this.clock.now();
    const bytes = typeof data === 'string' ? Buffer.byteLength(data) : data.length;
    const pkt: Packet = { data, size: bytes + UDP_IP_HEADER_BYTES, ...(binary ? { binary: true } : {}) };
    this.pipeline.process(
      pkt, link,
      (p) => { if (!this.closed) send(p.data, p.binary === true); },
      (ev) => this.onPacketEvent?.(ev),
      this.id, dir
    );
  }

  applyConfig(direction: 'up' | 'down' | 'both', patch: Partial<LinkConfig>): void {
    if (direction === 'up' || direction === 'both') Object.assign(this.upLink.config, patch);
    if (direction === 'down' || direction === 'both') Object.assign(this.downLink.config, patch);
  }

  /** Replace both links' configs (presets are complete configs). */
  setConfig(config: LinkConfig): void {
    this.upLink.config = { ...config };
    this.downLink.config = { ...config };
  }

  getState() {
    const now = this.clock.now();
    return {
      id: this.id,
      label: this.label,
      route: this.route,
      proto: this.proto,
      peer: this.peer,
      ageMs: now - this.createdAt,
      // Config and counters stay apart: both have a `lossPct` (configured vs measured)
      up: { ...this.upLink.config },
      down: { ...this.downLink.config },
      stats: { up: this.upLink.getStats(now), down: this.downLink.getStats(now) },
    };
  }

  getStats(now: number) {
    return {
      id: this.id,
      label: this.label,
      route: this.route,
      up: this.upLink.getStats(now),
      down: this.downLink.getStats(now),
    };
  }

  reseed(seed: number): void {
    this.pipeline.reseed(seed);
  }
}
