/**
 * EmulatorClient — WebSocket client for the emulator control port (9001).
 * Manages presets, live config changes and stats subscriptions.
 * SPEC.md §11.4.
 */

import type { LinkConfig } from '@nobu/shared/sim';
import { useGameStore } from '../ui/store.js';

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

  onStats?: (sessions: EmulatorStats[]) => void;
  onPacketEvent?: (items: PacketEvent[]) => void;
  onState?: (state: unknown) => void;

  constructor(url: string) {
    this.url = url;
  }

  connect(): void {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      useGameStore.getState().setEmulatorStatus('connected');
      // Subscribe to packet events
      this.send({ cmd: 'subscribe', packets: true });
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
      // Reconnect after delay
      setTimeout(() => this.connect(), 3000);
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
