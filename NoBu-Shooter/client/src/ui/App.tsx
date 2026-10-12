/**
 * App.tsx — the demo edition (`npm run demo`): the shared landing form and
 * match view (docs/PHASE7_PLAN.md D2) plus the Network Lab, packet strip and
 * inspector, Compare and Presenter. The game edition is play/PlayApp.tsx.
 */
import React, { useState, useEffect } from 'react';
import { NetClient } from '../net/NetClient.js';
import { ALL_MODELS } from '../net/allModels.js';
import { EmulatorClient } from '../net/EmulatorClient.js';
import { demoServiceUrl } from '../net/serverUrl.js';
import { Landing } from './Landing.js';
import { MatchView } from './MatchView.js';
import { DEMO_CONTROLS } from './demoControls.js';
import { NetworkLab } from './NetworkLab.js';
import { PacketFlowStrip } from './PacketFlowStrip.js';
import { PacketInspector } from './PacketInspector.js';
import { CompareView } from './compare/CompareView.js';
import { loadSettings, applyUiScale, onSettingsChange, type UserSettings } from './settings.js';
import { useGameStore } from './store.js';
import { isTypingTarget } from '../game/input.js';
import { DEV_TOOLS } from '../dev.js';
import NET from '@nobu/shared/config/net';
import { PresenterController } from '../presenter/controller.js';
import { PRESENTER_SCRIPTS } from '../presenter/scripts.js';
import type { PresenterScript } from '../presenter/types.js';
import { PresenterBar } from './presenter/PresenterBar.js';
import { quickStage, compareStage } from './presenter/stages.js';
import type { MapId } from '@nobu/shared/protocol';

/** Players go through the emulator's data route on the page's host (D5); its control port is this machine only. */
const emulatorDataUrl = () => demoServiceUrl(window.location, NET.ports.emulatorData);
const EMULATOR_CONTROL_URL = `ws://127.0.0.1:${NET.ports.emulatorControl}`;

export const App: React.FC = () => {
  const [view, setView] = useState<'landing' | 'game' | 'compare'>('landing');
  const [playerName, setPlayerName] = useState('PILOT_01');
  const [isLabOpen, setIsLabOpen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 900 : true));
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);

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

  /** Quick match (`main`), a new private room (`new`) or a room code (D9). */
  const handlePlay = (name: string, room: string) => {
    setPlayerName(name);

    // Initialize network clients
    // Saved ghost preference and sync model (Network Lab, `Y`)
    const initialSettings = loadSettings();
    const net = new NetClient({ models: ALL_MODELS, url: emulatorDataUrl(), name, room, sync: initialSettings.syncModel });
    const emu = new EmulatorClient(EMULATOR_CONTROL_URL);
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
    if (PRESENTER_SCRIPTS[id].view === 'game') handlePlay(name, 'main');
    else handleStartCompare(name);
  };

  // Leave the match: the effects below disconnect the client (the server
  // removes the player) and close the emulator control socket.
  const handleLeaveMatch = () => {
    setPresenterId(null);
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
    // Presenter Quick Match never waits for the join window (D10; honoured under npm run demo)
    const offWelcome = script.view === 'game' && netClient ? netClient.on('welcome', () => netClient.start()) : () => {};
    return () => {
      offWelcome();
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
  };

  if (view === 'landing') {
    return (
      <Landing
        onPlay={handlePlay}
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
    <MatchView
      netClient={netClient}
      onLeave={handleLeaveMatch}
      edition="demo"
      extraControls={DEMO_CONTROLS}
      onSettingsChange={handleSettingsChange}
      below={<>
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
      </>}
      side={
        /* Network Lab Collapsible Panel */
        <NetworkLab
          netClient={netClient}
          emulatorClient={emulatorClient}
          isOpen={isLabOpen}
          onToggleOpen={() => setIsLabOpen((open) => !open)}
        />
      }
    />
  );
};
