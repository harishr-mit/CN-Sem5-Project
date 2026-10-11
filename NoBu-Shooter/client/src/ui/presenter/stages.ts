/**
 * stages.ts — how the Presenter controller drives each view
 * (docs/PHASE4_PLAN.md §3.1–§3.3).
 */

import { sameSync } from '@nobu/shared/sync';
import type { NetClient } from '../../net/NetClient.js';
import { SWARM_ROUTE, type EmulatorClient } from '../../net/EmulatorClient.js';
import type { MapId } from '@nobu/shared/protocol';
import type { PresenterStage } from '../../presenter/types.js';

/**
 * Quick Match: the match's NetClient and the emulator — the game's own route
 * (like presets 1–5) and, separately, the network players' route.
 */
export function quickStage(net: NetClient, emu: EmulatorClient, devTools: boolean): PresenterStage {
  return {
    applyNetwork: (n) => emu.applyPreset(n.name, undefined, n.config),
    // An emulator without the UDP route answers with an error event: harmless
    applySwarmNetwork: (n) => emu.applyPreset(n.name, SWARM_ROUTE, n.config),
    setToggles: (t) => net.setToggles(t),
    setSync: (s) => {
      if (sameSync(s, net.sync)) return;
      net.setSync(s);
      net.resetLatencySamples();
    },
    // The server honours the developer switch only under `npm run demo` (D3)
    setInvincible: (on) => { if (devTools) net.setDevInvincible(on); },
    nudge: (dx, dy) => net.perturb(dx, dy),
    setComparePreset: () => {},
    // Room commands, honoured only under `npm run demo` like Invincible
    setEndless: (on) => { if (devTools) net.setDevEndless(on); },
    restartGame: (map) => { if (devTools) net.devRestart(map); },
  };
}

/**
 * Compare: the controller selects presets (each one carries its network, panes
 * and movers); a restart / map switch goes to the CompareView, which resets its
 * panes and asks the lab room (through the reference pane) to start over.
 */
export function compareStage(selectPreset: (id: string) => void, restart: (map?: MapId) => void): PresenterStage {
  const none = () => {};
  return {
    applyNetwork: none,
    applySwarmNetwork: none,
    setToggles: none,
    setSync: none,
    setInvincible: none,
    nudge: none,
    setComparePreset: selectPreset,
    setEndless: none, // the lab room has no match clock
    restartGame: restart,
  };
}
