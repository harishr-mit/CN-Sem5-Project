import React, { useState, useEffect } from 'react';
import { NetClient } from '../net/NetClient.js';
import { EmulatorClient } from '../net/EmulatorClient.js';
import { bindStore } from '../net/bindStore.js';
import { Landing } from './Landing.js';
import { GameContainer } from '../game/GameContainer.js';
import { Hud } from './Hud.js';
import { NetworkLab } from './NetworkLab.js';
import { PacketFlowStrip } from './PacketFlowStrip.js';
import { PacketInspector } from './PacketInspector.js';
import { CompareView } from './compare/CompareView.js';
import { SettingsPanel } from './SettingsPanel.js';
import { ControlsOverlay } from './ControlsOverlay.js';
import { loadSettings, type UserSettings } from './settings.js';
import { useGameStore } from './store.js';
import { isTypingTarget } from '../game/input.js';

const EMULATOR_DATA_URL = 'ws://127.0.0.1:9000';

export const App: React.FC = () => {
  const [view, setView] = useState<'landing' | 'game' | 'compare'>('landing');
  const [playerName, setPlayerName] = useState('PILOT_01');
  const [isLabOpen, setIsLabOpen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 900 : true));
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isControlsOpen, setIsControlsOpen] = useState(false);

  // Clients
  const [netClient, setNetClient] = useState<NetClient | null>(null);
  const [emulatorClient, setEmulatorClient] = useState<EmulatorClient | null>(null);

  const handleStartQuickMatch = (name: string) => {
    setPlayerName(name);

    // Initialize network clients
    const net = new NetClient({ url: EMULATOR_DATA_URL, name, room: 'main' });
    const emu = new EmulatorClient('ws://127.0.0.1:9001');

    // Apply saved ghost preference
    const initialSettings = loadSettings();
    net.toggles.ghost = initialSettings.showGhost;

    setNetClient(net);
    setEmulatorClient(emu);
    emu.connect();

    setView('game');
  };

  const handleStartCompare = (name: string) => {
    setPlayerName(name);
    setView('compare');
  };

  // Leave the match: the effects below disconnect the client (the server
  // removes the player) and close the emulator control socket.
  const handleLeaveMatch = () => {
    setIsSettingsOpen(false);
    setIsControlsOpen(false);
    setIsInspectorOpen(false);
    setNetClient(null);
    setEmulatorClient(null);
    setView('landing');
  };

  // Keyboard shortcut listener for Escape and F1 / ? (match view only, so a
  // stray Esc on the landing page doesn't open settings in the next match)
  useEffect(() => {
    if (view !== 'game') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      if (e.key === 'Escape') {
        if (isControlsOpen) {
          setIsControlsOpen(false);
        } else {
          setIsSettingsOpen((prev) => !prev);
        }
      } else if (e.key === 'F1' || e.key === '?') {
        e.preventDefault();
        setIsControlsOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isControlsOpen, view]);

  // Bind the main client to the HUD store; clean up on unmount
  useEffect(() => {
    if (!netClient) return;
    const unbind = bindStore(netClient);
    netClient.connect();
    return () => {
      unbind();
      netClient.disconnect();
      // Next match starts from a clean HUD (no old scoreboard / kill feed / packets)
      useGameStore.getState().resetSession();
    };
  }, [netClient]);

  useEffect(() => () => emulatorClient?.close(), [emulatorClient]);

  const handleSettingsChange = (newSettings: UserSettings) => {
    if (netClient) {
      netClient.toggles.ghost = newSettings.showGhost;
    }
  };

  if (view === 'landing') {
    return (
      <Landing
        onStartQuickMatch={handleStartQuickMatch}
        onStartCompare={handleStartCompare}
      />
    );
  }

  if (view === 'compare') {
    return (
      <CompareView
        playerName={playerName}
        onExit={() => {
          setView('landing');
        }}
      />
    );
  }

  if (!netClient || !emulatorClient) return null;

  return (
    <div className="app-root" id="nobu-shooter-app">
      <div className="app-main">
        {/* Arena + HUD + Packet Strip + Drawer */}
        <div className="arena-wrapper">
          <div className="arena-canvas-container">
            <GameContainer netClient={netClient} id="game-canvas" />
            <Hud
              onOpenSettings={() => setIsSettingsOpen(true)}
              onOpenControls={() => setIsControlsOpen(true)}
              onLeave={handleLeaveMatch}
            />
          </div>

          {/* Packet Flow Strip (YOU ── [EMULATOR] ── SERVER) */}
          <PacketFlowStrip
            isInspectorOpen={isInspectorOpen}
            sessionLabel={netClient.label}
            onToggleInspector={() => setIsInspectorOpen((open) => !open)}
          />

          {/* Packet Inspector Drawer (P1) */}
          <PacketInspector
            isOpen={isInspectorOpen}
            onClose={() => setIsInspectorOpen(false)}
          />
        </div>

        {/* Network Lab Collapsible Panel */}
        <NetworkLab
          netClient={netClient}
          emulatorClient={emulatorClient}
          isOpen={isLabOpen}
          onToggleOpen={() => setIsLabOpen((open) => !open)}
        />
      </div>

      {/* Settings Modal (Esc) */}
      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSettingsChange={handleSettingsChange}
        onLeave={handleLeaveMatch}
      />

      {/* Controls Overlay Modal (F1 / ?) */}
      <ControlsOverlay
        isOpen={isControlsOpen}
        onClose={() => setIsControlsOpen(false)}
      />
    </div>
  );
};
