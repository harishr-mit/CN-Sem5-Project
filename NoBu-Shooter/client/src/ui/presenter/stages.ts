/**
 * stages.ts — how the Presenter controller drives each view
 * (docs/PHASE4_PLAN.md §3.1–§3.3).
 */

import { sameSync } from '@nobu/shared/sync';
import type { NetClient } from '../../net/NetClient.js';
import type { EmulatorClient } from '../../net/EmulatorClient.js';
import type { PresenterStage } from '../../presenter/types.js';

/** Quick Match: the match's NetClient and the emulator (every session, like presets 1–5). */
export function quickStage(net: NetClient, emu: EmulatorClient, devTools: boolean): PresenterStage {
  return {
    applyNetwork: (n) => emu.applyPreset(n.name, 'all', n.config),
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
  };
}

/** Compare: the controller only selects presets (each one carries its network, panes and movers). */
export function compareStage(selectPreset: (id: string) => void): PresenterStage {
  const none = () => {};
  return {
    applyNetwork: none,
    setToggles: none,
    setSync: none,
    setInvincible: none,
    nudge: none,
    setComparePreset: selectPreset,
  };
}
