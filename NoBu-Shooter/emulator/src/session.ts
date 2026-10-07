/**
 * session.ts — one emulator session (client connection).
 * Each session maintains independent up/down links.
 * SPEC.md §11.1.
 */

import { WebSocket } from 'ws';
import { Pipeline, LinkState, DEFAULT_LINK_CONFIG, wallClock } from './pipeline.js';
import type { Packet, LinkConfig, PacketEvent } from './pipeline.js';

let nextSessionId = 1;

export class Session {
  readonly id: string;
  readonly label: string;
  readonly clientWs: WebSocket;
  private upstreamWs: WebSocket;

  readonly upLink: LinkState;
  readonly downLink: LinkState;

  private pipeline: Pipeline;

  onPacketEvent?: (ev: PacketEvent) => void;

  constructor(
    clientWs: WebSocket,
    upstreamWs: WebSocket,
    label: string,
    seed: number,
    defaultConfig?: Partial<LinkConfig>
  ) {
    this.id = `s${nextSessionId++}`;
    this.label = label;
    this.clientWs = clientWs;
    this.upstreamWs = upstreamWs;
    this.pipeline = new Pipeline(seed, wallClock);

    const baseCfg: LinkConfig = { ...DEFAULT_LINK_CONFIG, ...defaultConfig };
    this.upLink = new LinkState(baseCfg);
    this.downLink = new LinkState(baseCfg);

    this.setupBridge();
  }

  handleClientMessage(raw: Buffer | string): void {
    const data = raw.toString();
    const pkt: Packet = { data, size: data.length + 28 };
    this.pipeline.process(
      pkt, this.upLink,
      (p) => {
        if (this.upstreamWs.readyState === WebSocket.OPEN) {
          this.upstreamWs.send(p.data);
        }
      },
      (ev) => this.onPacketEvent?.(ev),
      this.id, 'up'
    );
  }

  private setupBridge(): void {
    // Client → Server (upstream)
    this.clientWs.on('message', (raw: Buffer | string) => {
      this.handleClientMessage(raw);
    });

    // Server → Client (downstream)
    this.upstreamWs.on('message', (raw: Buffer | string) => {
      const data = raw.toString();
      const pkt: Packet = { data, size: data.length + 28 };
      this.pipeline.process(
        pkt, this.downLink,
        (p) => {
          if (this.clientWs.readyState === WebSocket.OPEN) {
            this.clientWs.send(p.data);
          }
        },
        (ev) => this.onPacketEvent?.(ev),
        this.id, 'down'
      );
    });

    this.clientWs.on('close', () => this.upstreamWs.close());
    this.upstreamWs.on('close', () => this.clientWs.close());
    this.clientWs.on('error', () => this.upstreamWs.close());
    this.upstreamWs.on('error', () => this.clientWs.close());
  }

  applyConfig(direction: 'up' | 'down' | 'both', patch: Partial<LinkConfig>): void {
    if (direction === 'up' || direction === 'both') {
      Object.assign(this.upLink.config, patch);
    }
    if (direction === 'down' || direction === 'both') {
      Object.assign(this.downLink.config, patch);
    }
  }

  getState() {
    return {
      id: this.id,
      label: this.label,
      up: { ...this.upLink.config, ...this.upLink.getStats(Date.now()) },
      down: { ...this.downLink.config, ...this.downLink.getStats(Date.now()) },
    };
  }

  reseed(seed: number): void {
    this.pipeline.reseed(seed);
  }
}
