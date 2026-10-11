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
import { loadSettings, saveSettings, applyUiScale, onSettingsChange, type UserSettings } from './settings.js';
import { setSoundPrefs } from '../game/audio.js';
import { useGameStore } from './store.js';
import { isTypingTarget } from '../game/input.js';
import { DEV_TOOLS } from '../dev.js';
import { PresenterController } from '../presenter/controller.js';
import { PRESENTER_SCRIPTS } from '../presenter/scripts.js';
import type { PresenterScript } from '../presenter/types.js';
import { PresenterBar } from './presenter/PresenterBar.js';
import { quickStage, compareStage } from './presenter/stages.js';
import type { MapId } from '@nobu/shared/protocol';

const EMULATOR_DATA_URL = 'ws://127.0.0.1:9000';

export const App: React.FC = () => {
  const [view, setView] = useState<'landing' | 'game' | 'compare'>('landing');
  const [playerName, setPlayerName] = useState('PILOT_01');
  const [isLabOpen, setIsLabOpen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 900 : true));
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isControlsOpen, setIsControlsOpen] = useState(false);

  // Presenter mode (PHASES.md P1): which script runs, its controller, caption shown
  const [presenterId, setPresenterId] = useState<PresenterScript['id'] | null>(null);
  const [presenter, setPresenter] = useState<PresenterController | null>(null);
  const [presenterVersion, setPresenterVersion] = useState(0);
  const [presenterHidden, setPresenterHidden] = useState(false);
  const [presetRequest, setPresetRequest] = useState<{ id: string; seq: number } | undefined>(undefined);
  // Compare presenter: RESTART / map switch requests, and the lab map reported back
  const [restartRequest, setRestartRequest] = useState<{ map?: MapId; seq: number } | undefined>(undefined);
  const [compareMap, setCompareMap] = useState<MapId | null>(null);
  const emulatorStatus = useGameStore((s) => s.emulatorStatus);

  // Clients
  const [netClient, setNetClient] = useState<NetClient | null>(null);
  const [emulatorClient, setEmulatorClient] = useState<EmulatorClient | null>(null);

  const handleStartQuickMatch = (name: string) => {
    setPlayerName(name);

    // Initialize network clients
    // Saved ghost preference and sync model (Network Lab, `Y`)
    const initialSettings = loadSettings();
    const net = new NetClient({ url: EMULATOR_DATA_URL, name, room: 'main', sync: initialSettings.syncModel });
    const emu = new EmulatorClient('ws://127.0.0.1:9001');
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

  const handleStartPresenter = (id: PresenterScript['id'], name: string) => {
    setPresenterHidden(false);
    setPresetRequest(undefined);
    setRestartRequest(undefined);
    setPresenterId(id);
    if (PRESENTER_SCRIPTS[id].view === 'game') handleStartQuickMatch(name);
    else handleStartCompare(name);
  };

  // Leave the match: the effects below disconnect the client (the server
  // removes the player) and close the emulator control socket.
  const handleLeaveMatch = () => {
    setPresenterId(null);
    setIsSettingsOpen(false);
    setIsControlsOpen(false);
    setIsInspectorOpen(false);
    setNetClient(null);
    setEmulatorClient(null);
    setView('landing');
  };

  // Projector UI scale (Settings), applied to every view
  useEffect(() => {
    applyUiScale(loadSettings().uiScale);
    return onSettingsChange((s) => applyUiScale(s.uiScale));
  }, []);

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
      } else if (e.code === 'KeyM' && !e.repeat) {
        // Mute / unmute sound effects (GAMERULES.md §18), remembered
        const s = loadSettings();
        const next = { ...s, muted: !s.muted };
        saveSettings(next);
        setSoundPrefs(next.soundVolume / 100, next.muted);
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

  // Presenter controller: lives while its script and view's clients live.
  // stop() switches Invincible back off when leaving (END, Leave Match, Exit).
  useEffect(() => {
    if (!presenterId) return;
    const script = PRESENTER_SCRIPTS[presenterId];
    let stage;
    if (script.view === 'game') {
      if (!netClient || !emulatorClient) return;
      stage = quickStage(netClient, emulatorClient, DEV_TOOLS);
    } else {
      let presetSeq = 0;
      let restartSeq = 0;
      stage = compareStage(
        (id) => setPresetRequest({ id, seq: ++presetSeq }),
        (map) => setRestartRequest({ map, seq: ++restartSeq }),
      );
    }
    const c = new PresenterController(script, stage);
    c.onChange = () => setPresenterVersion((v) => v + 1);
    c.start();
    setPresenter(c);
    return () => {
      c.stop();
      setPresenter(null);
    };
  }, [presenterId, netClient, emulatorClient]);

  // Commands sent before the emulator control socket is open are lost: re-apply the step
  useEffect(() => {
    if (emulatorStatus === 'connected' && presenter?.script.view === 'game') presenter.reapply();
  }, [emulatorStatus, presenter]);

  // Presenter keys: N next, B back, H hide the caption (D4). Normal keys keep working.
  useEffect(() => {
    if (!presenter) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.code === 'KeyN') presenter.next();
      else if (e.code === 'KeyB') presenter.prev();
      else if (e.code === 'KeyH') setPresenterHidden((h) => !h);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [presenter]);

  const presenterBar = presenter && !presenterHidden ? (
    <PresenterBar
      controller={presenter}
      version={presenterVersion}
      notice={DEV_TOOLS ? null : presenter.script.view === 'game'
        ? 'Invincible, the stopped match clock, RESTART and map switching need npm run demo — this run uses normal 2-minute matches.'
        : 'Map switching needs npm run demo; RESTART here only resets the panes and charts.'}
      currentMap={() => (presenter.script.view === 'game' ? netClient?.mapId ?? null : compareMap)}
      onEnd={() => {
        if (presenter.script.view === 'game') handleLeaveMatch();
        else { setPresenterId(null); setView('landing'); }
      }}
    />
  ) : null;

  const handleSettingsChange = (newSettings: UserSettings) => {
    netClient?.setToggles({ ghost: newSettings.showGhost });
    setSoundPrefs(newSettings.soundVolume / 100, newSettings.muted);
  };

  if (view === 'landing') {
    return (
      <Landing
        onStartQuickMatch={handleStartQuickMatch}
        onStartCompare={handleStartCompare}
        onStartPresenter={handleStartPresenter}
      />
    );
  }

  if (view === 'compare') {
    return (
      <CompareView
        playerName={playerName}
        presetRequest={presetRequest}
        restartRequest={restartRequest}
        onMapChange={setCompareMap}
        footer={presenterBar}
        onExit={() => {
          setPresenterId(null);
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
              netClient={netClient}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onOpenControls={() => setIsControlsOpen(true)}
              onLeave={handleLeaveMatch}
            />
          </div>

          {/* Presenter caption (in the flow, so it never covers the arena) */}
          {presenterBar}

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
