/**
 * EmulatorClient — WebSocket client for the emulator control port (9001).
 * Manages presets, live config changes and stats subscriptions.
 * SPEC.md §11.4.
 */

import { useGameStore } from '../ui/store.js';

export interface LinkConfig {
  latencyMs: number;
  jitterMs: number;
  jitterDist: 'normal' | 'uniform';
  lossPct: number;
  lossModel: 'random' | 'burst';
  burstLen: number;
  duplicatePct: number;
  reorderPct: number;
  reorderDelayMs: number;
  bandwidthKbps: number;
  queueLimitMs: number;
  allowJitterReorder: boolean;
}

export interface EmulatorStats {
  id: string;
  /** Session label (NetClient.label) — used to find "my" session. */
  label?: string;
  up: Record<string, number>;
  down: Record<string, number>;
}

export interface PacketEvent {
  sid: string;
  dir: 'up' | 'down';
  size: number;
  preview: string;
  fate: 'delivered' | 'dropped-loss' | 'dropped-queue' | 'duplicated';
  delayMs: number;
  t: number;
}

export class EmulatorClient {
  private ws: WebSocket | null = null;
  private url: string;
  private retryCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  onStats?: (sessions: EmulatorStats[]) => void;
  onPacketEvent?: (items: PacketEvent[]) => void;
  onState?: (state: unknown) => void;

  constructor(url: string) {
    this.url = url;
  }

  connect(): void {
    this.closed = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    useGameStore.getState().setEmulatorStatus('connecting');

    const ws = new WebSocket(this.url);
    this.ws = ws;
    // Callbacks from a socket that was closed or replaced are ignored. Without
    // this, React StrictMode's connect → close → connect left the first
    // socket's onclose scheduling a reconnect, leaking a second control socket
    // (duplicate packet events) and flashing "EMULATOR OFF".
    const live = () => this.ws === ws;

    ws.onopen = () => {
      if (!live()) return;
      this.retryCount = 0;
      useGameStore.getState().setEmulatorStatus('connected');
      // Subscribe to packet events
      this.send({ cmd: 'subscribe', packets: true });
      // Fetch latest state immediately on connect (Bug 4B fix)
      this.getState();
    };

    ws.onmessage = (evt) => {
      if (!live()) return;
      try {
        const msg = JSON.parse(evt.data as string) as Record<string, unknown>;
        if (msg['evt'] === 'stats') {
          const sessions = msg['sessions'] as EmulatorStats[];
          this.onStats?.(sessions);
          useGameStore.getState().setEmulatorStats(sessions);
        } else if (msg['evt'] === 'state') {
          this.onState?.(msg);
          useGameStore.getState().setEmulatorState(msg);
        } else if (msg['evt'] === 'packets') {
          this.onPacketEvent?.(msg['items'] as PacketEvent[]);
          useGameStore.getState().addPacketEvents(msg['items'] as PacketEvent[]);
        }
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      if (!live()) return;
      this.ws = null;
      useGameStore.getState().setEmulatorStatus('offline');
      // Cap reconnect retries (Bug 6C fix)
      if (!this.closed && this.retryCount < 5) {
        this.retryCount++;
        this.retryTimer = setTimeout(() => this.connect(), 3000);
      }
    };

    ws.onerror = () => {
      if (live()) useGameStore.getState().setEmulatorStatus('error');
    };
  }

  /** Close for good (no reconnect), e.g. when leaving a view. */
  close(): void {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const ws = this.ws;
    this.ws = null; // marks it stale before its onclose fires
    ws?.close();
    useGameStore.getState().setEmulatorStatus('offline');
  }

  private send(msg: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /** A named emulator preset, or an ad-hoc one when `config` is given (completed from the defaults). */
  applyPreset(name: string, target = 'all', config?: Partial<LinkConfig>): void {
    this.send({ cmd: 'preset', target, name, ...(config ? { config } : {}) });
  }

  setConfig(patch: Partial<LinkConfig>, direction: 'up' | 'down' | 'both' = 'both', target = 'all'): void {
    this.send({ cmd: 'set', target, direction, patch });
  }

  reset(target = 'all'): void {
    this.send({ cmd: 'reset', target });
  }

  getState(): void {
    this.send({ cmd: 'get' });
  }

  setPacketSubscription(active: boolean): void {
    this.send({ cmd: 'subscribe', packets: active });
  }
}
