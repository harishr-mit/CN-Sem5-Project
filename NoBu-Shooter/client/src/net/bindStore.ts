/**
 * bindStore.ts — connects a headless NetClient to the zustand UI store.
 * Only the "main" client of a view is bound; Compare panes are not, so they
 * don't overwrite each other's HUD state.
 */

import type { NetClient } from './NetClient.js';
import { useGameStore } from '../ui/store.js';

export function bindStore(net: NetClient): () => void {
  const store = useGameStore.getState();
  store.setConnectionStatus(net.connectionStatus);
  if (net.myPlayerId !== null) store.setPlayerId(net.myPlayerId);
  const offs = [
    net.on('status', (s) => useGameStore.getState().setConnectionStatus(s)),
    net.on('welcome', (id) => useGameStore.getState().setPlayerId(id)),
    net.on('snap', (snap) => useGameStore.getState().setSnap(snap)),
    net.on('event', (ev) => useGameStore.getState().addEvent(ev)),
  ];
  return () => offs.forEach((off) => off());
}
