/**
 * CompareView — 2–4 emulated panes plus an optional reference pane, all
 * driven by one keyboard (PHASES.md C1–C5, docs/PHASE2_PLAN.md §4).
 *
 * Owns the NetClients (one per pane + one spectator that talks to the server
 * directly), the EmulatorClient and the shared InputDriver. React StrictMode
 * mounts this twice in development, so every effect here is idempotent.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import NET from '@nobu/shared/config/net';
import { MOVER_PATTERNS } from '@nobu/shared/sim';
import type { MoverPattern } from '@nobu/shared/protocol';
import { NetClient, type LocalMetrics, type PredictionToggle } from '../../net/NetClient.js';
import { EmulatorClient } from '../../net/EmulatorClient.js';
import type { ArenaSceneOptions } from '../../game/ArenaScene.js';
import { InputDriver } from '../../compare/InputDriver.js';
import { isTypingTarget } from '../../game/input.js';
import { COMPARE_PRESETS, customPreset } from '../../compare/presets.js';
import { layoutPanes } from '../../compare/layout.js';
import { PANE_COLORS, REFERENCE_COLOR } from '../../compare/colors.js';
import { PANE_IDS, type ComparePreset, type CompareNetwork, type PaneId } from '../../compare/types.js';
import { EmulatorControls } from '../EmulatorControls.js';
import { useGameStore } from '../store.js';
import { ComparePane } from './ComparePane.js';
import { CompareDock, type DockRow } from './CompareDock.js';

const EMULATOR_DATA_URL = `ws://127.0.0.1:${NET.ports.emulatorData}`;
const EMULATOR_CONTROL_URL = `ws://127.0.0.1:${NET.ports.emulatorControl}`;
const SERVER_URL = `ws://127.0.0.1:${NET.ports.server}`;
const BODY_PAD = 8;
const GAP = 8;
const HISTORY = 60;
const MOVER_LABEL: Record<MoverPattern, string> = {
  circle: 'CIRCLE', zigzag: 'ZIGZAG', reversal: 'REVERSE', stopgo: 'STOP-GO',
};

interface CompareViewProps {
  playerName: string;
  onExit: () => void;
}

type MetricsMap = Record<string, LocalMetrics>;

const barBtn = (active: boolean, color = 'var(--c-cyan)'): React.CSSProperties => ({
  padding: '3px 7px',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.68rem',
  cursor: 'pointer',
  borderRadius: 4,
  whiteSpace: 'nowrap',
  color: active ? '#07070f' : color,
  background: active ? color : 'transparent',
  border: `1px solid ${active ? color : 'var(--c-border)'}`,
});

export const CompareView: React.FC<CompareViewProps> = ({ playerName, onExit }) => {
  // ── Long-lived objects (created once) ───────────────────────────
  const [driver] = useState(() => new InputDriver());
  const [emulator] = useState(() => new EmulatorClient(EMULATOR_CONTROL_URL));
  const [reference] = useState(
    () => new NetClient({ url: SERVER_URL, name: 'REFERENCE', room: 'lab', labelPrefix: 'REF', spectate: true }),
  );
  const [clients] = useState<Record<PaneId, NetClient>>(() => {
    const make = (id: PaneId) => new NetClient({ url: EMULATOR_DATA_URL, name: `${playerName}_${id}`.slice(0, 12), room: 'lab', labelPrefix: id });
    return { A: make('A'), B: make('B'), C: make('C'), D: make('D') };
  });

  // ── UI state ────────────────────────────────────────────────────
  const [preset, setPreset] = useState<ComparePreset>(COMPARE_PRESETS[0]);
  const [showRef, setShowRef] = useState(COMPARE_PRESETS[0].reference);
  const [movers, setMovers] = useState<MoverPattern[]>(COMPARE_PRESETS[0].movers);
  const [networkRequest, setNetworkRequest] = useState<{ network: CompareNetwork | null }>({ network: COMPARE_PRESETS[0].network });
  const [selected, setSelected] = useState<PaneId>('B');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showTrails, setShowTrails] = useState(true);
  const [showTruth, setShowTruth] = useState(true);
  const [refReady, setRefReady] = useState(false);
  const [body, setBody] = useState({ w: 0, h: 0 });
  const [metrics, setMetrics] = useState<MetricsMap>({});
  const [lagHistory, setLagHistory] = useState<Record<string, number[]>>({});
  const emulatorStatus = useGameStore((s) => s.emulatorStatus);

  const paneIds = useMemo(() => preset.panes.map((p) => p.id), [preset]);
  const activeKey = paneIds.join('');

  // ── Scene options (stable objects; `view` is mutated below) ─────
  const sceneOptions = useMemo(() => {
    const colors = () => {
      const m = new Map<number, number>();
      for (const id of PANE_IDS) {
        const pid = clients[id].myPlayerId;
        if (pid !== null) m.set(pid, PANE_COLORS[id].num);
      }
      return m;
    };
    const make = (dimOthers: boolean): ArenaSceneOptions => ({
      renderAtDisplaySize: true,
      input: driver,
      playerColors: colors,
      truthClock: () => reference.serverNow(),
      view: { dimOthers, moverTrails: true, truthMarkers: true },
    });
    return { panes: make(true), reference: make(false) };
  }, [clients, driver, reference]);

  useEffect(() => {
    for (const o of [sceneOptions.panes, sceneOptions.reference]) {
      o.view!.moverTrails = showTrails;
      o.view!.truthMarkers = showTruth;
    }
  }, [sceneOptions, showTrails, showTruth]);

  // ── Wiring ──────────────────────────────────────────────────────
  // Truth clock for the mover metrics: the spectator's direct connection.
  useEffect(() => {
    for (const id of PANE_IDS) clients[id].setTruthClock(() => reference.serverNow());
  }, [clients, reference]);

  // Pane toggles follow the preset
  useEffect(() => {
    for (const spec of preset.panes) {
      const c = clients[spec.id];
      const old = c.toggles;
      c.toggles = { ...spec.toggles };
      if (old.prediction !== spec.toggles.prediction || old.interpolation !== spec.toggles.interpolation) {
        c.resetLatencySamples();
      }
    }
  }, [preset, clients]);

  // Connect the active panes, disconnect the removed ones
  const live = useRef(new Set<PaneId>());
  useEffect(() => {
    for (const id of PANE_IDS) {
      const wanted = paneIds.includes(id);
      if (wanted && !live.current.has(id)) { clients[id].connect(); live.current.add(id); }
      if (!wanted && live.current.has(id)) { clients[id].disconnect(); live.current.delete(id); }
    }
    driver.setClients(paneIds.map((id) => clients[id]));
  }, [activeKey, clients, driver, paneIds]);

  // Spectator, emulator and input loop live as long as the view
  useEffect(() => {
    const offWelcome = reference.on('welcome', () => setRefReady(true));
    const offStatus = reference.on('status', (s) => { if (s !== 'connected') setRefReady(false); });
    reference.connect();
    emulator.connect();
    driver.start();
    return () => {
      offWelcome();
      offStatus();
      driver.stop();
      reference.disconnect();
      emulator.close();
      for (const id of PANE_IDS) clients[id].disconnect();
      live.current.clear();
      setRefReady(false);
    };
  }, [reference, emulator, driver, clients]);

  // Movers: sent once the spectator has joined, and again on every change
  useEffect(() => {
    if (refReady) reference.setMovers(movers);
  }, [refReady, movers, reference]);

  // Network: apply the preset's conditions once the emulator is reachable
  useEffect(() => {
    const net = networkRequest.network;
    if (emulatorStatus === 'connected' && net) emulator.applyPreset(net.name, 'all', net.config);
  }, [emulatorStatus, networkRequest, emulator]);

  // Layout: measure the body area
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => setBody({ w: el.clientWidth - 2 * BODY_PAD, h: el.clientHeight - 2 * BODY_PAD });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Metrics at 5 Hz (NetClient computes them at 5 Hz)
  useEffect(() => {
    const timer = setInterval(() => {
      const next: MetricsMap = {};
      for (const id of PANE_IDS) next[id] = { ...clients[id].metrics };
      next['REF'] = { ...reference.metrics };
      setMetrics(next);
      setLagHistory((prev) => {
        const out: Record<string, number[]> = {};
        for (const id of PANE_IDS) {
          const m = clients[id].metrics;
          out[id] = [...(prev[id] ?? new Array(HISTORY).fill(0)).slice(1 - HISTORY), m.moverSamples > 0 ? m.moverLagMs : 0];
        }
        return out;
      });
    }, 200);
    return () => clearInterval(timer);
  }, [clients, reference]);

  // ── Actions ─────────────────────────────────────────────────────
  const applyPreset = useCallback((p: ComparePreset) => {
    setPreset(p);
    setShowRef(p.reference);
    setMovers(p.movers);
    setNetworkRequest({ network: p.network });
    if (!p.panes.some((x) => x.id === selected)) setSelected(p.panes[0].id);
  }, [selected]);

  const toggleSetting = useCallback((id: PaneId, key: keyof PredictionToggle) => {
    const next = customPreset(preset.panes.length, preset);
    const pane = next.panes.find((p) => p.id === id);
    if (!pane) return;
    pane.toggles = { ...pane.toggles, [key]: !pane.toggles[key] };
    setPreset(next);
  }, [preset]);

  const setCount = (n: number) => setPreset(customPreset(n, preset));

  const toggleMover = (m: MoverPattern) =>
    setMovers((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));

  // Hotkeys: Tab = drawer; P/R/I/G = toggle on the selected pane; T = truth rings
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const k = e.key.toLowerCase();
      if (e.key === 'Tab') { e.preventDefault(); setDrawerOpen((o) => !o); }
      else if (k === 'p') toggleSetting(selected, 'prediction');
      else if (k === 'r') toggleSetting(selected, 'reconciliation');
      else if (k === 'i') toggleSetting(selected, 'interpolation');
      else if (k === 'g') toggleSetting(selected, 'ghost');
      else if (k === 't') setShowTruth((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, toggleSetting]);

  // ── Render ──────────────────────────────────────────────────────
  const cells = preset.panes.length + (showRef ? 1 : 0);
  const layout = layoutPanes(body.w, body.h, cells);
  const emptyCell = layout.rows * layout.cols > cells;
  const cellH = layout.canvasH + 56;
  const showMovers = movers.length > 0;
  const emptyMetrics = clients.A.metrics;

  const dockRows: DockRow[] = preset.panes.map((p) => ({
    id: p.id,
    title: p.title,
    color: PANE_COLORS[p.id].css,
    metrics: metrics[p.id] ?? emptyMetrics,
    lagHistory: lagHistory[p.id] ?? new Array(HISTORY).fill(0),
  }));

  const dock = (w: number, h: number) => (
    <CompareDock caption={preset.caption} rows={dockRows} showMovers={showMovers} width={w} height={h} />
  );

  return (
    <div id="compare-view" style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--c-bg)', overflow: 'hidden' }}>
      {/* Top bar: 44 px */}
      <div
        style={{
          height: 44, flex: '0 0 44px', boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px',
          borderBottom: '1px solid var(--c-border)', background: 'rgba(10, 8, 26, 0.9)',
          overflowX: 'auto', overflowY: 'hidden',
        }}
      >
        <button className="btn-ghost" onClick={onExit} title="Exit Compare" style={{ padding: '3px 10px', whiteSpace: 'nowrap' }}>◄ EXIT</button>
        <span style={{ width: 1, height: 20, background: 'var(--c-border)' }} />
        {COMPARE_PRESETS.map((p) => (
          <button key={p.id} id={`cmp-preset-${p.id}`} title={p.title} style={barBtn(preset.id === p.id)} onClick={() => applyPreset(p)}>
            {p.title.replace(' off vs on', '')}
          </button>
        ))}
        <button id="cmp-preset-custom" style={barBtn(preset.id === 'custom', 'var(--c-amber)')} onClick={() => applyPreset(customPreset(preset.panes.length, preset))}>Custom</button>
        <span style={{ width: 1, height: 20, background: 'var(--c-border)' }} />
        <span style={{ color: 'var(--c-text-muted)', fontSize: '0.68rem' }}>PANES</span>
        {[2, 3, 4].map((n) => (
          <button key={n} style={barBtn(preset.panes.length === n, 'var(--c-amber)')} onClick={() => setCount(n)}>{n}</button>
        ))}
        <button id="cmp-ref-toggle" title="Show the reference pane (spectator, direct to the server)" style={barBtn(showRef, REFERENCE_COLOR.css)} onClick={() => setShowRef((v) => !v)}>REF</button>
        <span style={{ width: 1, height: 20, background: 'var(--c-border)' }} />
        <span style={{ color: 'var(--c-text-muted)', fontSize: '0.68rem' }}>MOVE</span>
        {MOVER_PATTERNS.map((m) => (
          <button key={m} style={barBtn(movers.includes(m), '#c6b5ff')} onClick={() => toggleMover(m)}>{MOVER_LABEL[m]}</button>
        ))}
        <button title="Dots at the last drawn positions" style={barBtn(showTrails, '#c6b5ff')} onClick={() => setShowTrails((v) => !v)}>TRAILS</button>
        <button title="Ring at the exact true position [T]" style={barBtn(showTruth, '#c6b5ff')} onClick={() => setShowTruth((v) => !v)}>TRUTH</button>
        <span style={{ flex: 1 }} />
        <button id="cmp-lab-toggle" style={barBtn(drawerOpen, 'var(--c-violet)')} onClick={() => setDrawerOpen((o) => !o)}>LAB [TAB]</button>
      </div>

      {/* Body: pane grid + dock */}
      <div ref={bodyRef} style={{ flex: 1, minHeight: 0, padding: BODY_PAD, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: GAP }}>
        {layout.canvasW > 0 && (
          <>
            <div
              id="cmp-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${layout.cols}, ${layout.canvasW}px)`,
                gridAutoRows: `${cellH}px`,
                gap: GAP,
                justifyContent: 'center',
              }}
            >
              {preset.panes.map((p) => (
                <ComparePane
                  key={p.id}
                  id={p.id}
                  title={p.title}
                  color={PANE_COLORS[p.id].css}
                  netClient={clients[p.id]}
                  options={sceneOptions.panes}
                  canvasW={layout.canvasW}
                  canvasH={layout.canvasH}
                  metrics={metrics[p.id] ?? emptyMetrics}
                  showMovers={showMovers}
                  toggles={p.toggles}
                  selected={selected === p.id}
                  onSelect={() => setSelected(p.id)}
                  onToggle={(key) => toggleSetting(p.id, key)}
                />
              ))}
              {showRef && (
                <ComparePane
                  key="REF"
                  id="REF"
                  title="REFERENCE"
                  color={REFERENCE_COLOR.css}
                  netClient={reference}
                  options={sceneOptions.reference}
                  canvasW={layout.canvasW}
                  canvasH={layout.canvasH}
                  metrics={metrics['REF'] ?? emptyMetrics}
                  showMovers={false}
                  reference
                />
              )}
              {emptyCell && dock(layout.canvasW, cellH)}
            </div>
            {!emptyCell && layout.dockH > 0 && dock(layout.gridW, layout.dockH)}
          </>
        )}
      </div>

      {/* Network Lab drawer: overlays, so opening it never resizes the panes */}
      <div
        id="cmp-drawer"
        style={{
          position: 'absolute', top: 44, right: 0, bottom: 0,
          width: 'min(360px, 92vw)', boxSizing: 'border-box',
          transform: drawerOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.18s ease',
          background: 'var(--c-bg-panel)', backdropFilter: 'blur(var(--panel-blur))',
          borderLeft: '1px solid var(--c-border)',
          padding: 14, overflowY: 'auto', zIndex: 20,
          visibility: drawerOpen ? 'visible' : 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <div className="font-display" style={{ fontSize: '0.95rem', color: 'var(--c-cyan)', letterSpacing: '0.1em' }}>NETWORK LAB</div>
            <div style={{ fontSize: '0.62rem', color: 'var(--c-text-muted)' }}>
              AFFECTS ALL EMULATED PANES • [1–5] PRESETS • {emulatorStatus === 'connected' ? 'EMULATOR LIVE' : 'EMULATOR OFFLINE'}
            </div>
          </div>
          <button className="btn-ghost" onClick={() => setDrawerOpen(false)} style={{ padding: '2px 10px' }}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-m)' }}>
          <EmulatorControls emulatorClient={emulator} />
        </div>
      </div>
    </div>
  );
};
