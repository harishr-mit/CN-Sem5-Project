/**
 * MatchView.tsx — the match screen both editions share (docs/PHASE7_PLAN.md
 * D2): arena + HUD, Settings (Esc), Controls (F1 / ?), `M` mute, and the
 * client's life cycle (bind to the HUD store, connect, disconnect). The demo
 * adds its tools around it (`below`: Presenter bar, packet strip, inspector;
 * `side`: Network Lab); the game adds nothing. On touch devices (ui/touch.ts)
 * it adds the joystick, the DASH / RELOAD / MENU buttons and the menu, in
 * both editions (owner revision R5–R8).
 */

import React, { useEffect, useState } from 'react';
import type { NetClient } from '../net/NetClient.js';
import { bindStore } from '../net/bindStore.js';
import { GameContainer } from '../game/GameContainer.js';
import { Hud } from './Hud.js';
import { SettingsPanel } from './SettingsPanel.js';
import { ControlsOverlay, type ExtraControls } from './ControlsOverlay.js';
import { loadSettings, saveSettings, type UserSettings } from './settings.js';
import { setSoundPrefs } from '../game/audio.js';
import { useGameStore } from './store.js';
import { isTypingTarget } from '../game/input.js';
import { isTouchUi } from './touch.js';
import { TouchControls, TouchMenu, type TouchMenuItem } from './TouchControls.js';

interface MatchViewProps {
  netClient: NetClient;
  onLeave: () => void;
  edition: 'demo' | 'game';
  /** Under the arena, in its column (demo: Presenter bar, packet strip, inspector). */
  below?: React.ReactNode;
  /** Beside the arena (demo: Network Lab). */
  side?: React.ReactNode;
  /** Extra reaction to a settings change (demo: the ghost toggle). Sound is handled here. */
  onSettingsChange?: (s: UserSettings) => void;
  /** HUD text when the server can't be reached. */
  offlineHint?: React.ReactNode;
  /** Edition keys for the Controls overlay (demo: ui/demoControls.ts). */
  extraControls?: ExtraControls;
  /** Touch UI: the edition's own menu entries (demo: Network Lab, packet inspector). */
  touchMenuItems?: TouchMenuItem[];
}

export const MatchView: React.FC<MatchViewProps> = ({ netClient, onLeave, edition, below, side, onSettingsChange, offlineHint, extraControls, touchMenuItems = [] }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isControlsOpen, setIsControlsOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const touch = isTouchUi();
  const matchState = useGameStore((st) => st.snap?.match.state ?? 'WAITING');
  const [muted, setMuted] = useState(() => loadSettings().muted);

  const toggleMute = () => {
    const s = loadSettings();
    const next = { ...s, muted: !s.muted };
    saveSettings(next);
    setSoundPrefs(next.soundVolume / 100, next.muted);
    setMuted(next.muted);
  };
  const menuItems: TouchMenuItem[] = [
    { id: 'settings', label: '⚙ SETTINGS', onClick: () => setIsSettingsOpen(true) },
    { id: 'mute', label: muted ? '🔈 SOUND ON' : '🔇 MUTE', onClick: toggleMute },
    ...touchMenuItems,
    { id: 'leave', label: '◄ LEAVE MATCH', onClick: onLeave },
  ];

  // Bind the client to the HUD store and connect; clean up when the match view goes
  useEffect(() => {
    const unbind = bindStore(netClient);
    netClient.connect();
    return () => {
      unbind();
      netClient.disconnect();
      // Next match starts from a clean HUD (no old scoreboard / kill feed / packets)
      useGameStore.getState().resetSession();
    };
  }, [netClient]);

  // Esc = settings, F1 / ? = controls, M = mute (GAMERULES.md §18)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === 'Escape') {
        if (isControlsOpen) setIsControlsOpen(false);
        else setIsSettingsOpen((prev) => !prev);
      } else if (e.key === 'F1' || e.key === '?') {
        e.preventDefault();
        setIsControlsOpen((prev) => !prev);
      } else if (e.code === 'KeyM' && !e.repeat) {
        toggleMute();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isControlsOpen]);

  const handleSettingsChange = (s: UserSettings) => {
    setSoundPrefs(s.soundVolume / 100, s.muted);
    setMuted(s.muted);
    onSettingsChange?.(s);
  };

  return (
    <div className="app-root" id="nobu-shooter-app">
      <div className="app-main">
        <div className="arena-wrapper">
          <div className="arena-canvas-container">
            <GameContainer netClient={netClient} id="game-canvas" />
            <Hud
              netClient={netClient}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onOpenControls={() => setIsControlsOpen(true)}
              onLeave={onLeave}
              touch={touch}
              {...(offlineHint !== undefined ? { offlineHint } : {})}
            />
          </div>
          {/* Touch controls while a match is on (the lobby / waiting page has its own buttons) */}
          {touch && matchState !== 'WAITING' && <TouchControls net={netClient} onMenu={() => setIsMenuOpen(true)} />}
          {below}
        </div>
        {side}
      </div>

      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSettingsChange={handleSettingsChange}
        onLeave={onLeave}
        demoRows={edition === 'demo'}
      />
      {isMenuOpen && <TouchMenu items={menuItems} onClose={() => setIsMenuOpen(false)} />}
      <ControlsOverlay isOpen={isControlsOpen} onClose={() => setIsControlsOpen(false)} {...(extraControls ? { extra: extraControls } : {})} />
    </div>
  );
};
