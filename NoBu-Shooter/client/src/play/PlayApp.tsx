/**
 * PlayApp.tsx — the game edition (docs/PHASE7_PLAN.md D1–D3): the shared
 * landing form and match view, nothing else. One fixed set of the best
 * netcode settings from the Phase 3–6 measurements: Delta snapshots,
 * prediction + reconciliation + interpolation on, input redundancy off (over
 * TCP it only adds bytes), no ghost. No Network Lab, Compare, Presenter or
 * emulator; the NetClient gets no optional sync models (D4), so State and
 * Lockstep are not in this bundle.
 */

import React, { useEffect, useState } from 'react';
import { NetClient } from '../net/NetClient.js';
import { gameServerUrl } from '../net/serverUrl.js';
import { playerToken } from '../net/playerToken.js';
import { LandingForm } from '../ui/LandingForm.js';
import { MatchView } from '../ui/MatchView.js';
import { loadSettings, applyUiScale, onSettingsChange } from '../ui/settings.js';

const OFFLINE_HINT = (
  <>
    The game server can't be reached. If you are hosting, check that <b>npm start</b> (or <b>npm run dev</b>) is
    running and that your firewall lets other machines in. If you are joining, check the address.
  </>
);

export const PlayApp: React.FC = () => {
  const [net, setNet] = useState<NetClient | null>(null);

  // UI scale (Settings), applied to every view
  useEffect(() => {
    applyUiScale(loadSettings().uiScale);
    return onSettingsChange((s) => applyUiScale(s.uiScale));
  }, []);

  const play = (name: string, room: string) => {
    const client = new NetClient({ url: gameServerUrl(window.location), name, room, sync: { model: 'delta' }, pid: playerToken() });
    client.toggles = { ...client.toggles, prediction: true, reconciliation: true, interpolation: true, redundancy: false, ghost: false };
    setNet(client);
  };

  if (!net) {
    return (
      <LandingForm
        subtitle="Top-down arena shooter • Quick match or a private room with friends"
        onPlay={play}
        controlsHint="WASD / ARROWS: Move • MOUSE: Aim • CLICK: Fire • R: Reload • SPACE: Dash • M: Mute • ESC: Settings • F1: Controls"
      />
    );
  }

  return <MatchView netClient={net} onLeave={() => setNet(null)} edition="game" offlineHint={OFFLINE_HINT} />;
};
