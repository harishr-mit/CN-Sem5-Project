import React, { useState, useEffect } from 'react';
import { NetClient } from '../net/NetClient.js';
import { EmulatorClient } from '../net/EmulatorClient.js';
import { Landing } from './Landing.js';
import { GameContainer } from '../game/GameContainer.js';
import { Hud } from './Hud.js';
import { NetworkLab } from './NetworkLab.js';
import { PacketFlowStrip } from './PacketFlowStrip.js';
import { PacketInspector } from './PacketInspector.js';
import { ABCompare } from './ABCompare.js';
import { useGameStore } from './store.js';

export const App: React.FC = () => {
  const [view, setView] = useState<'landing' | 'game' | 'ab-compare'>('landing');
  const [playerName, setPlayerName] = useState('PILOT_01');
  const [isLabOpen, setIsLabOpen] = useState(true);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);

  // Clients
  const [netClient, setNetClient] = useState<NetClient | null>(null);
  const [emulatorClient, setEmulatorClient] = useState<EmulatorClient | null>(null);

  const handleStartQuickMatch = (name: string) => {
    setPlayerName(name);

    // Initialize network clients
    const net = new NetClient('ws://127.0.0.1:9000?label=' + encodeURIComponent(name), name, 'main');
    const emu = new EmulatorClient('ws://127.0.0.1:9001');

    setNetClient(net);
    setEmulatorClient(emu);

    net.connect();
    emu.connect();

    setView('game');
  };

  const handleStartABCompare = (name: string) => {
    setPlayerName(name);
    setView('ab-compare');
  };

  // Cleanup on unmount or return to landing
  useEffect(() => {
    return () => {
      if (netClient) netClient.disconnect();
    };
  }, [netClient]);

  if (view === 'landing') {
    return (
      <Landing
        onStartQuickMatch={handleStartQuickMatch}
        onStartABCompare={handleStartABCompare}
      />
    );
  }

  if (view === 'ab-compare') {
    return (
      <ABCompare
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
            <Hud />
          </div>

          {/* Packet Flow Strip (YOU ── [EMULATOR] ── SERVER) */}
          <PacketFlowStrip
            isInspectorOpen={isInspectorOpen}
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
    </div>
  );
};
