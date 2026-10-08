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

  onStats?: (sessions: EmulatorStats[]) => void;
  onPacketEvent?: (items: PacketEvent[]) => void;
  onState?: (state: unknown) => void;

  constructor(url: string) {
    this.url = url;
  }

  connect(): void {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.retryCount = 0;
      useGameStore.getState().setEmulatorStatus('connected');
      // Subscribe to packet events
      this.send({ cmd: 'subscribe', packets: true });
      // Fetch latest state immediately on connect (Bug 4B fix)
      this.getState();
    };

    this.ws.onmessage = (evt) => {
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

    this.ws.onclose = () => {
      useGameStore.getState().setEmulatorStatus('offline');
      // Cap reconnect retries (Bug 6C fix)
      if (this.retryCount < 5) {
        this.retryCount++;
        setTimeout(() => this.connect(), 3000);
      }
    };

    this.ws.onerror = () => {
      useGameStore.getState().setEmulatorStatus('error');
    };
  }

  private send(msg: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  applyPreset(name: string, target = 'all'): void {
    this.send({ cmd: 'preset', target, name });
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
