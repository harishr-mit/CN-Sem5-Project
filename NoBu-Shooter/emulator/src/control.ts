/**
 * control.ts — emulator control WebSocket server.
 * SPEC.md §11.4, §11.5.
 *
 * Accepts commands from the UI on port 9001 (never impaired).
 */

import { WebSocket, WebSocketServer } from 'ws';
import type { Session } from './session.js';
import type { LinkConfig, PacketEvent } from './pipeline.js';
import { DEFAULT_LINK_CONFIG } from './pipeline.js';

// ── Presets per SPEC.md §11.5 ────────────────────────────────
// Every preset is a complete LinkConfig so switching presets never leaves
// settings from the previous one behind (e.g. burst loss after Nightmare).
const preset = (p: Partial<LinkConfig>): LinkConfig => ({ ...DEFAULT_LINK_CONFIG, ...p });

export const PRESETS: Record<string, LinkConfig> = {
  Baseline: preset({}),
  'Café Wi-Fi': preset({ latencyMs: 25, jitterMs: 15, lossPct: 1 }),
  'Mobile 4G': preset({ latencyMs: 45, jitterMs: 25, lossPct: 2, bandwidthKbps: 5000 }),
  Transatlantic: preset({ latencyMs: 90, jitterMs: 8, lossPct: 0.5 }),
  Nightmare: preset({
    latencyMs: 120, jitterMs: 50, lossPct: 12, lossModel: 'burst', burstLen: 4,
    duplicatePct: 3, reorderPct: 5, bandwidthKbps: 400,
  }),
};

// ─── Control server ───────────────────────────────────────────
export class ControlServer {
  private wss: WebSocketServer;
  private sessions: Map<string, Session>;
  private defaults: LinkConfig = { ...DEFAULT_LINK_CONFIG };
  /** Name of the preset last applied to "all", or "Custom" after a manual change. */
  private activePreset = 'Baseline';
  private controlClients = new Set<WebSocket>();

  getDefaults(): LinkConfig {
    return { ...this.defaults };
  }

  // Packet event subscribers
  private packetSubscribers = new Set<WebSocket>();
  private packetBuffer: PacketEvent[] = [];
  private lastFlush = 0;

  constructor(port: number, sessions: Map<string, Session>) {
    this.sessions = sessions;
    this.wss = new WebSocketServer({ port });

    this.wss.on('connection', (ws: WebSocket) => {
      this.controlClients.add(ws);
      // Send full state on connect
      this.sendState(ws);

      ws.on('message', (raw: Buffer | string) => {
        try {
          const cmd = JSON.parse(raw.toString()) as Record<string, unknown>;
          this.handleCmd(ws, cmd);
        } catch { /* ignore */ }
      });

      ws.on('close', () => {
        this.controlClients.delete(ws);
        this.packetSubscribers.delete(ws);
      });
    });

    // Stats every 500 ms
    setInterval(() => this.broadcastStats(), 500);
    // Packet events every 100 ms
    setInterval(() => this.flushPacketEvents(), 100);

    console.log(`[emulator] Control listening on ws://127.0.0.1:${port}`);
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
    for (const ws of this.packetSubscribers) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    }
  }

  private handleCmd(ws: WebSocket, cmd: Record<string, unknown>): void {
    switch (cmd['cmd']) {
      case 'get':
        this.sendState(ws);
        break;

      case 'set': {
        const target = cmd['target'] as string ?? 'all';
        const direction = (cmd['direction'] as string ?? 'both') as 'up' | 'down' | 'both';
        const patch = cmd['patch'] as Partial<LinkConfig> ?? {};

        if (target === 'all') {
          Object.assign(this.defaults, patch);
          this.activePreset = 'Custom';
          for (const session of this.sessions.values()) {
            session.applyConfig(direction, patch);
          }
        } else {
          const session = this.findSession(target);
          if (session) session.applyConfig(direction, patch);
        }
        this.broadcastState();
        break;
      }

      case 'preset': {
        const name = cmd['name'] as string;
        const preset = PRESETS[name];
        if (!preset) return;
        const target = cmd['target'] as string ?? 'all';

        if (target === 'all') {
          this.defaults = { ...preset };
          this.activePreset = name;
          for (const session of this.sessions.values()) {
            session.applyConfig('both', preset);
          }
        } else {
          const session = this.findSession(target);
          if (session) session.applyConfig('both', preset);
        }
        this.broadcastState();
        break;
      }

      case 'reset': {
        const target = cmd['target'] as string ?? 'all';
        const baseConfig = { ...DEFAULT_LINK_CONFIG };
        if (target === 'all') {
          this.defaults = { ...DEFAULT_LINK_CONFIG };
          this.activePreset = 'Baseline';
          for (const session of this.sessions.values()) {
            session.applyConfig('both', baseConfig);
          }
        } else {
          const session = this.findSession(target);
          if (session) session.applyConfig('both', baseConfig);
        }
        this.broadcastState();
        break;
      }

      case 'seed': {
        const val = cmd['value'] as number;
        for (const session of this.sessions.values()) session.reseed(val);
        break;
      }

      case 'subscribe': {
        if (cmd['packets']) {
          this.packetSubscribers.add(ws);
        } else {
          this.packetSubscribers.delete(ws);
        }
        break;
      }
    }
  }

  private findSession(target: string): Session | undefined {
    return this.sessions.get(target) ??
      [...this.sessions.values()].find(s => s.label === target);
  }

  private stateMessage(): string {
    return JSON.stringify({
      evt: 'state',
      sessions: [...this.sessions.values()].map(s => s.getState()),
      defaults: this.defaults,
      preset: this.activePreset,
      presets: Object.keys(PRESETS),
    });
  }

  private sendState(ws: WebSocket): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(this.stateMessage());
  }

  private broadcastState(): void {
    const msg = this.stateMessage();
    for (const ws of this.controlClients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    }
  }

  private broadcastStats(): void {
    const now = Date.now();
    const msg = JSON.stringify({
      evt: 'stats',
      t: now,
      sessions: [...this.sessions.values()].map(s => ({
        id: s.id,
        label: s.label,
        up: s.upLink.getStats(now),
        down: s.downLink.getStats(now),
      })),
    });
    for (const ws of this.controlClients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    }
  }

  /** Called when a new session is created so control clients get updated state. */
  onNewSession(): void {
    this.broadcastState();
  }
}
