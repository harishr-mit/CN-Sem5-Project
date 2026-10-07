/**
 * store.ts — zustand store for sharing game/network state to React UI.
 * Updated at 5 Hz by the game loop.
 */

import { create } from 'zustand';
import type { MsgSnap, GameEvent } from '@nobu/shared/protocol';
import type { EmulatorStats, PacketEvent } from '../net/EmulatorClient.js';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'timeout' | 'error';
export type EmulatorStatus = 'offline' | 'connecting' | 'connected' | 'error';

export interface KillFeedEntry {
  id: number;
  killer: string;
  victim: string;
  t: number;
}

interface GameState {
  connectionStatus: ConnectionStatus;
  emulatorStatus: EmulatorStatus;
  playerId: number | null;
  snap: MsgSnap | null;
  emulatorStats: EmulatorStats[];
  emulatorState: unknown;
  packetEvents: PacketEvent[];
  killFeed: KillFeedEntry[];
  events: GameEvent[];
  seenEventIds: Set<number>;
  nextKillId: number;

  // Actions
  setConnectionStatus: (s: ConnectionStatus) => void;
  setEmulatorStatus: (s: EmulatorStatus) => void;
  setPlayerId: (id: number) => void;
  setSnap: (snap: MsgSnap) => void;
  setEmulatorStats: (stats: EmulatorStats[]) => void;
  setEmulatorState: (state: unknown) => void;
  addPacketEvents: (evs: PacketEvent[]) => void;
  addEvent: (ev: GameEvent) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  connectionStatus: 'connecting',
  emulatorStatus: 'offline',
  playerId: null,
  snap: null,
  emulatorStats: [],
  emulatorState: null,
  packetEvents: [],
  killFeed: [],
  events: [],
  seenEventIds: new Set(),
  nextKillId: 1,

  setConnectionStatus: (s) => set({ connectionStatus: s }),
  setEmulatorStatus: (s) => set({ emulatorStatus: s }),
  setPlayerId: (id) => set({ playerId: id }),
  setSnap: (snap) => set({ snap }),
  setEmulatorStats: (stats) => set({ emulatorStats: stats }),
  setEmulatorState: (state) => set({ emulatorState: state }),

  addPacketEvents: (evs) => set(state => ({
    packetEvents: [...state.packetEvents.slice(-300), ...evs],
  })),

  addEvent: (ev) => {
    const state = get();
    if (ev.type === 'PLAYER_DEATH') {
      const snap = state.snap;
      const killer = snap?.players.find(p => p.id === ev.killer);
      const victim = snap?.players.find(p => p.id === ev.victim);
      if (killer && victim) {
        const entry: KillFeedEntry = {
          id: state.nextKillId,
          killer: killer.name,
          victim: victim.name,
          t: Date.now(),
        };
        set(s => ({
          killFeed: [...s.killFeed.slice(-4), entry],
          nextKillId: s.nextKillId + 1,
        }));
      }
    }
    set(s => ({ events: [...s.events.slice(-100), ev] }));
  },
}));
