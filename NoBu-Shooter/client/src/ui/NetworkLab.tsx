import React, { useState, useEffect, useRef } from 'react';
import type { NetClient } from '../net/NetClient.js';
import type { EmulatorClient } from '../net/EmulatorClient.js';
import { useGameStore } from './store.js';
import { Sparkline } from './Sparkline.js';
import { isTypingTarget } from '../game/input.js';

interface NetworkLabProps {
  /** Client whose metrics the tiles show (pane B in A/B compare). */
  netClient: NetClient;
  emulatorClient: EmulatorClient;
  isOpen: boolean;
  onToggleOpen: () => void;
  /**
   * A/B compare: every pane's client. Prediction / reconciliation /
   * interpolation are fixed per pane (that is the comparison), so those
   * toggles and their hotkeys are hidden; redundancy and the nudge apply to
   * every pane so the twins stay mirrored.
   */
  compareClients?: NetClient[];
}

const PRESETS = [
  { name: 'Baseline', key: '1' },
  { name: 'Café Wi-Fi', key: '2' },
  { name: 'Mobile 4G', key: '3' },
  { name: 'Transatlantic', key: '4' },
  { name: 'Nightmare', key: '5' },
];

export const NetworkLab: React.FC<NetworkLabProps> = ({
  netClient,
  emulatorClient,
  isOpen,
  onToggleOpen,
  compareClients,
}) => {
  const isCompare = !!compareClients;
  const emulatorStatus = useGameStore((s) => s.emulatorStatus);
  const emulatorStats = useGameStore((s) => s.emulatorStats);

  // Active preset tracking
  const [activePreset, setActivePreset] = useState<string>('Baseline');

  // Slider states (one-way values)
  const [latencyMs, setLatencyMs] = useState(0);
  const [jitterMs, setJitterMs] = useState(0);
  const [lossPct, setLossPct] = useState(0);
  const [bandwidthKbps, setBandwidthKbps] = useState(0); // 0 = unlimited
  const [dupPct, setDupPct] = useState(0);
  const [reorderPct, setReorderPct] = useState(0);
  const [burstLoss, setBurstLoss] = useState(false);

  // Netcode toggles
  const [toggles, setToggles] = useState({ ...netClient.toggles });

  // Sparkline history buffers (60 samples ~ 12s at 5 Hz)
  const [rttHistory, setRttHistory] = useState<number[]>(() => new Array(60).fill(0));
  const [lossHistory, setLossHistory] = useState<number[]>(() => new Array(60).fill(0));
  const [pendingHistory, setPendingHistory] = useState<number[]>(() => new Array(60).fill(0));
  const [errorHistory, setErrorHistory] = useState<number[]>(() => new Array(60).fill(0));

  // Live metrics display
  const [metrics, setMetrics] = useState({ ...netClient.metrics });
  const [flashCorrection, setFlashCorrection] = useState(false);

  // Throttle config sends to 10 Hz; patches made meanwhile are merged so a
  // quick change to two sliders doesn't lose the first one.
  const pendingConfigTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPatch = useRef<Record<string, unknown>>({});

  const sendConfigPatch = (patch: Record<string, unknown>) => {
    setActivePreset('Custom');
    pendingPatch.current = { ...pendingPatch.current, ...patch };
    if (pendingConfigTimer.current) return;
    pendingConfigTimer.current = setTimeout(() => {
      emulatorClient.setConfig(pendingPatch.current);
      pendingPatch.current = {};
      pendingConfigTimer.current = null;
    }, 100);
  };

  // Sliders follow from the emulator's state broadcast (single source of truth).
  const handleApplyPreset = (name: string) => {
    setActivePreset(name);
    emulatorClient.applyPreset(name);
  };

  // Sync sliders and preset when emulatorState updates (Bug 4B fix)
  const emulatorState = useGameStore((s) => s.emulatorState) as {
    preset?: string;
    defaults?: {
      latencyMs?: number;
      jitterMs?: number;
      lossPct?: number;
      bandwidthKbps?: number;
      duplicatePct?: number;
      reorderPct?: number;
      lossModel?: string;
    };
  } | null;

  useEffect(() => {
    const defaults = emulatorState?.defaults;
    if (!defaults) return;
    if (typeof defaults.latencyMs === 'number') setLatencyMs(defaults.latencyMs);
    if (typeof defaults.jitterMs === 'number') setJitterMs(defaults.jitterMs);
    if (typeof defaults.lossPct === 'number') setLossPct(defaults.lossPct);
    if (typeof defaults.bandwidthKbps === 'number') setBandwidthKbps(defaults.bandwidthKbps);
    if (typeof defaults.duplicatePct === 'number') setDupPct(defaults.duplicatePct);
    if (typeof defaults.reorderPct === 'number') setReorderPct(defaults.reorderPct);
    if (defaults.lossModel !== undefined) setBurstLoss(defaults.lossModel === 'burst');
    if (emulatorState?.preset) setActivePreset(emulatorState.preset);
  }, [emulatorState]);

  // Keyboard hotkeys for presets and toggles per SPEC.md §13.2
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger when typing in a text field (sliders/checkboxes are fine)
      if (isTypingTarget(e.target)) return;

      if (e.key === 'Tab') {
        e.preventDefault();
        onToggleOpen();
      } else if (e.key === '1') {
        handleApplyPreset('Baseline');
      } else if (e.key === '2') {
        handleApplyPreset('Café Wi-Fi');
      } else if (e.key === '3') {
        handleApplyPreset('Mobile 4G');
      } else if (e.key === '4') {
        handleApplyPreset('Transatlantic');
      } else if (e.key === '5') {
        handleApplyPreset('Nightmare');
      } else if (isCompare) {
        // Per-pane netcode is fixed in A/B compare
      } else if (e.key === 'p' || e.key === 'P') {
        toggleNetcode('prediction');
      } else if (e.key === 'r' || e.key === 'R') {
        toggleNetcode('reconciliation');
      } else if (e.key === 'i' || e.key === 'I') {
        toggleNetcode('interpolation');
      } else if (e.key === 'g' || e.key === 'G') {
        toggleNetcode('ghost');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onToggleOpen, toggles, isCompare]);

  const toggleNetcode = (key: keyof typeof toggles) => {
    setToggles((prev) => {
      const value = !prev[key];
      // Each client keeps its own other toggles (A/B panes differ on purpose)
      for (const c of compareClients ?? [netClient]) c.toggles = { ...c.toggles, [key]: value };
      return { ...prev, [key]: value };
    });
    // Latency averages from the previous mode would be misleading
    if (key === 'prediction' || key === 'interpolation') netClient.resetLatencySamples();
  };

  const handleNudge = () => {
    for (const c of compareClients ?? [netClient]) c.perturb(40, 0);
  };

  // This client's own emulator session (ground-truth loss, SPEC.md §12)
  const mySession = emulatorStats.find((s) => s.label === netClient.label);
  const lossUp = mySession?.up['lossPctWindow'] ?? 0;
  const lossDown = mySession?.down['lossPctWindow'] ?? 0;
  const lossRef = useRef({ up: 0, down: 0 });
  lossRef.current = { up: lossUp, down: lossDown };

  // 5 Hz sampling for metrics and sparklines (NetClient computes the metrics)
  useEffect(() => {
    const timer = setInterval(() => {
      const m = { ...netClient.metrics };
      setMetrics(m);

      // Flash the corrections tile on a correction larger than 8 px
      if (m.recentErrorPx > 8) {
        setFlashCorrection(true);
        setTimeout(() => setFlashCorrection(false), 300);
      }

      const loss = Math.max(lossRef.current.up, lossRef.current.down);
      setRttHistory((h) => [...h.slice(1), m.rttMs]);
      setLossHistory((h) => [...h.slice(1), loss]);
      setPendingHistory((h) => [...h.slice(1), m.pendingInputs]);
      setErrorHistory((h) => [...h.slice(1), m.recentErrorPx]);
    }, 200);

    return () => clearInterval(timer);
  }, [netClient]);

  // Status chip styling
  const statusClass =
    emulatorStatus === 'connected' ? 'live' : emulatorStatus === 'offline' ? 'offline' : 'warn';

  // RTT color thresholds
  const rttColor =
    metrics.rttMs < 60 ? '#39ff14' : metrics.rttMs < 150 ? '#ffb300' : '#ff3b5c';

  return (
    <div
      className={`lab-panel ${isOpen ? '' : 'collapsed'}`}
      id="network-lab-panel"
      style={{ position: 'relative' }}
    >
      {/* Toggle button on the panel edge */}
      <button
        onClick={onToggleOpen}
        title="Toggle Network Lab (Tab)"
        style={{
          position: 'absolute',
          left: '-28px',
          top: '12px',
          width: '28px',
          height: '44px',
          background: 'var(--c-bg-panel)',
          border: '1px solid var(--c-border)',
          borderRight: 'none',
          borderTopLeftRadius: '6px',
          borderBottomLeftRadius: '6px',
          color: 'var(--c-cyan)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '12px',
          zIndex: 10,
        }}
      >
        {isOpen ? '►' : '◄'}
      </button>

      <div className="lab-panel-inner">
        {/* Section 1: Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="font-display" style={{ fontSize: '1rem', letterSpacing: '0.1em', color: 'var(--c-cyan)' }}>
              NETWORK LAB
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--c-text-muted)' }}>
              HOTKEY: [TAB] TOGGLE • [1–5] PRESETS
            </div>
          </div>
          <div className="status-chip">
            <div className={`status-dot ${statusClass}`} />
            <span style={{ fontSize: '0.7rem' }}>
              {emulatorStatus === 'connected' ? 'LIVE' : emulatorStatus === 'offline' ? 'EMULATOR OFF' : 'CONNECTING'}
            </span>
          </div>
        </div>

        {/* Section 2: Presets */}
        <div className="lab-section">
          <div className="lab-section-title">PRESETS (HOTKEYS 1–5)</div>
          <div className="presets-row">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                id={`preset-btn-${p.key}`}
                className={`preset-chip ${activePreset === p.name ? 'active' : ''}`}
                onClick={() => handleApplyPreset(p.name)}
              >
                [{p.key}] {p.name}
              </button>
            ))}
            {activePreset === 'Custom' && (
              <div className="preset-chip active" style={{ borderColor: 'var(--c-amber)', color: 'var(--c-amber)' }}>
                CUSTOM
              </div>
            )}
          </div>
        </div>

        {/* Section 3: Sliders */}
        <div className="lab-section">
          <div className="lab-section-title">IMPAIRMENT CONTROLS</div>

          {/* Latency */}
          <div className="slider-row">
            <label htmlFor="slider-latency">
              <span>One-way Latency</span>
              <span className="value">{latencyMs} ms</span>
            </label>
            <input
              id="slider-latency"
              type="range"
              min={0}
              max={500}
              step={5}
              value={latencyMs}
              onChange={(e) => {
                const val = Number(e.target.value);
                setLatencyMs(val);
                sendConfigPatch({ latencyMs: val });
              }}
            />
            <div style={{ fontSize: '0.65rem', color: 'var(--c-text-dim)' }}>
              Expected RTT ≈ {latencyMs * 2 + 16} ms
            </div>
          </div>

          {/* Jitter */}
          <div className="slider-row">
            <label htmlFor="slider-jitter">
              <span>Jitter (±)</span>
              <span className="value">{jitterMs} ms</span>
            </label>
            <input
              id="slider-jitter"
              type="range"
              min={0}
              max={200}
              step={2}
              value={jitterMs}
              onChange={(e) => {
                const val = Number(e.target.value);
                setJitterMs(val);
                sendConfigPatch({ jitterMs: val });
              }}
            />
          </div>

          {/* Loss */}
          <div className="slider-row">
            <label htmlFor="slider-loss">
              <span>Packet Loss</span>
              <span className="value" style={{ color: lossPct > 5 ? 'var(--c-red)' : 'var(--c-cyan)' }}>
                {lossPct} %
              </span>
            </label>
            <input
              id="slider-loss"
              type="range"
              min={0}
              max={50}
              step={1}
              value={lossPct}
              onChange={(e) => {
                const val = Number(e.target.value);
                setLossPct(val);
                sendConfigPatch({ lossPct: val });
              }}
            />
          </div>

          {/* Bandwidth Limit */}
          <div className="slider-row">
            <label htmlFor="slider-bandwidth">
              <span>Bandwidth Limit</span>
              <span className="value">{bandwidthKbps === 0 ? 'Unlimited' : `${bandwidthKbps} kbps`}</span>
            </label>
            <input
              id="slider-bandwidth"
              type="range"
              min={0}
              max={10000}
              step={100}
              value={bandwidthKbps}
              onChange={(e) => {
                const val = Number(e.target.value);
                setBandwidthKbps(val);
                sendConfigPatch({ bandwidthKbps: val });
              }}
            />
          </div>

          {/* Duplication */}
          <div className="slider-row">
            <label htmlFor="slider-dup">
              <span>Duplication</span>
              <span className="value">{dupPct} %</span>
            </label>
            <input
              id="slider-dup"
              type="range"
              min={0}
              max={20}
              step={1}
              value={dupPct}
              onChange={(e) => {
                const val = Number(e.target.value);
                setDupPct(val);
                sendConfigPatch({ duplicatePct: val });
              }}
            />
          </div>

          {/* Reordering */}
          <div className="slider-row">
            <label htmlFor="slider-reorder">
              <span>Reordering</span>
              <span className="value">{reorderPct} %</span>
            </label>
            <input
              id="slider-reorder"
              type="range"
              min={0}
              max={30}
              step={1}
              value={reorderPct}
              onChange={(e) => {
                const val = Number(e.target.value);
                setReorderPct(val);
                sendConfigPatch({ reorderPct: val });
              }}
            />
          </div>

          {/* Burst loss toggle */}
          <div className="toggle-row">
            <label htmlFor="toggle-burst-loss">Gilbert-Elliott Burst Loss</label>
            <label className="toggle">
              <input
                id="toggle-burst-loss"
                type="checkbox"
                checked={burstLoss}
                onChange={(e) => {
                  const val = e.target.checked;
                  setBurstLoss(val);
                  sendConfigPatch({ lossModel: val ? 'burst' : 'random' });
                }}
              />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>

        {/* Section 4: Netcode Toggles */}
        <div className="lab-section">
          <div className="lab-section-title">{isCompare ? 'A/B NETCODE (FIXED PER PANE)' : 'NETCODE TOGGLES'}</div>

          {isCompare ? (
            <div style={{ fontSize: '0.72rem', lineHeight: 1.5, color: 'var(--c-text-muted)', marginBottom: '6px' }}>
              <div><span style={{ color: 'var(--c-red)' }}>Pane A</span> — prediction, reconciliation, interpolation <strong>OFF</strong></div>
              <div><span style={{ color: 'var(--c-cyan)' }}>Pane B</span> — all <strong>ON</strong> (+ amber ghost)</div>
              <div style={{ marginTop: '4px' }}>Presets and sliders impair both panes' links identically.</div>
            </div>
          ) : (
            <>
              <div className="toggle-row">
                <label htmlFor="toggle-pred">Prediction [P]</label>
                <label className="toggle">
                  <input
                    id="toggle-pred"
                    type="checkbox"
                    checked={toggles.prediction}
                    onChange={() => toggleNetcode('prediction')}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              <div className="toggle-row">
                <label htmlFor="toggle-recon">Reconciliation [R]</label>
                <label className="toggle">
                  <input
                    id="toggle-recon"
                    type="checkbox"
                    checked={toggles.reconciliation}
                    onChange={() => toggleNetcode('reconciliation')}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              <div className="toggle-row">
                <label htmlFor="toggle-interp">Snapshot Interpolation [I]</label>
                <label className="toggle">
                  <input
                    id="toggle-interp"
                    type="checkbox"
                    checked={toggles.interpolation}
                    onChange={() => toggleNetcode('interpolation')}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
            </>
          )}

          <div className="toggle-row">
            <label htmlFor="toggle-redundancy">Input Redundancy{isCompare ? ' (both panes)' : ''}</label>
            <label className="toggle">
              <input
                id="toggle-redundancy"
                type="checkbox"
                checked={toggles.redundancy}
                onChange={() => toggleNetcode('redundancy')}
              />
              <span className="toggle-slider" />
            </label>
          </div>

          {!isCompare && (
            <div className="toggle-row">
              <label htmlFor="toggle-ghost">Ghost Overlay (Authoritative) [G]</label>
              <label className="toggle">
                <input
                  id="toggle-ghost"
                  type="checkbox"
                  checked={toggles.ghost}
                  onChange={() => toggleNetcode('ghost')}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          )}
        </div>

        {/* Section 5: Metric Tiles */}
        <div className="lab-section">
          <div className="lab-section-title">LIVE METRICS (5 HZ){isCompare ? ' — PANE B' : ''}</div>
          <div className="metrics-grid">
            {/* RTT */}
            <div className={`metric-tile ${metrics.rttMs > 150 ? 'alert' : metrics.rttMs > 60 ? 'warn' : ''}`}>
              <div className="metric-value" style={{ color: rttColor }}>
                {metrics.rttMs} <span style={{ fontSize: '0.8rem' }}>ms</span>
              </div>
              <div className="metric-label">ROUND TRIP TIME</div>
            </div>

            {/* Jitter */}
            <div className="metric-tile">
              <div className="metric-value">
                {metrics.jitterMs} <span style={{ fontSize: '0.8rem' }}>ms</span>
              </div>
              <div className="metric-label">JITTER</div>
            </div>

            {/* Pending Inputs */}
            <div className="metric-tile">
              <div className="metric-value" style={{ color: metrics.pendingInputs > 15 ? 'var(--c-amber)' : 'inherit' }}>
                {metrics.pendingInputs}
              </div>
              <div className="metric-label">PENDING INPUTS</div>
            </div>

            {/* Corrections / sec */}
            <div className={`metric-tile ${flashCorrection ? 'alert' : ''}`}>
              <div className="metric-value" style={{ color: metrics.correctionsPerSec > 0 ? 'var(--c-amber)' : 'inherit' }}>
                {metrics.correctionsPerSec} <span style={{ fontSize: '0.8rem' }}>/s</span>
              </div>
              <div className="metric-label">CORRECTIONS</div>
            </div>

            {/* Last Error px */}
            <div className="metric-tile">
              <div className="metric-value">
                {metrics.lastErrorPx.toFixed(1)} <span style={{ fontSize: '0.8rem' }}>px</span>
              </div>
              <div className="metric-label">LAST ERROR</div>
            </div>

            {/* Input to screen */}
            <div className="metric-tile">
              <div className="metric-value">
                {metrics.inputToScreenMs.toFixed(0)} <span style={{ fontSize: '0.8rem' }}>ms</span>
              </div>
              <div className="metric-label">INPUT → SCREEN · ACK {metrics.ackDelayMs} ms</div>
            </div>

            {/* Snapshot Rate */}
            <div className="metric-tile">
              <div className="metric-value">
                {metrics.snapshotHz} <span style={{ fontSize: '0.8rem' }}>Hz</span>
              </div>
              <div className="metric-label">SNAPSHOT RATE</div>
            </div>

            {/* Bandwidth Up/Down */}
            <div className="metric-tile">
              <div className="metric-value" style={{ fontSize: '1rem' }}>
                ↑{metrics.bwUpKbps} ↓{metrics.bwDownKbps} <span style={{ fontSize: '0.7rem' }}>kbps</span>
              </div>
              <div className="metric-label">BANDWIDTH</div>
            </div>

            {/* Loss up/down (emulator ground truth, last 1 s) */}
            <div className={`metric-tile ${Math.max(lossUp, lossDown) > 5 ? 'alert' : ''}`}>
              <div className="metric-value" style={{ fontSize: '1rem' }}>
                ↑{lossUp} ↓{lossDown} <span style={{ fontSize: '0.7rem' }}>%</span>
              </div>
              <div className="metric-label">LOSS (EMULATOR)</div>
            </div>

            {/* Server tick */}
            <div className="metric-tile">
              <div className="metric-value" style={{ fontSize: '1rem' }}>
                {metrics.serverTickHz} <span style={{ fontSize: '0.7rem' }}>Hz</span> · {metrics.serverTickMs.toFixed(2)} <span style={{ fontSize: '0.7rem' }}>ms</span>
              </div>
              <div className="metric-label">SERVER TICK</div>
            </div>
          </div>
        </div>

        {/* Section 6: Sparklines */}
        <div className="lab-section">
          <div className="lab-section-title">REAL-TIME SPARKLINE TRACES (12S)</div>
          <Sparkline
            data={rttHistory}
            color={rttColor}
            label="RTT (ms)"
            currentValue={`${metrics.rttMs} ms`}
            min={0}
          />
          <Sparkline
            data={lossHistory}
            color="#ff3b5c"
            label="Loss %"
            currentValue={`${lossHistory[lossHistory.length - 1] || 0} %`}
            min={0}
            max={50}
          />
          <Sparkline
            data={pendingHistory}
            color="#00e5ff"
            label="Pending Inputs"
            currentValue={metrics.pendingInputs}
            min={0}
          />
          <Sparkline
            data={errorHistory}
            color="#ffb300"
            label="Correction Error (px)"
            currentValue={`${metrics.recentErrorPx.toFixed(1)} px`}
            min={0}
          />
        </div>

        {/* Section 7: Footer */}
        <div className="lab-footer">
          <button
            id="perturb-btn"
            className="btn-ghost"
            style={{
              width: '100%',
              marginBottom: '10px',
              borderColor: 'var(--c-amber)',
              color: 'var(--c-amber)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8rem',
            }}
            onClick={handleNudge}
          >
            ⚡ {isCompare ? 'NUDGE BOTH PANES' : 'NUDGE ME'} (SERVER MISPREDICT +40PX)
          </button>

          <p style={{ marginBottom: '6px' }}>
            <strong>Note:</strong> Bots are simulated inside the server; their traffic bypasses the emulator.
          </p>

          <p title="docs/PROTOCOL.md §1: The links between browser, emulator, and server are loopback TCP connections. The emulator is the ONLY place where messages are dropped, delayed, duplicated, or reordered per message before forwarding, providing realistic UDP datagram semantics.">
            <strong>About transport:</strong> Frames routed through standalone impairment engine acting as datagram proxy.
          </p>
        </div>
      </div>
    </div>
  );
};
