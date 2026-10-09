import React, { useState, useEffect, useRef } from 'react';
import type { NetClient } from '../net/NetClient.js';
import type { EmulatorClient } from '../net/EmulatorClient.js';
import { useGameStore } from './store.js';
import { Sparkline } from './Sparkline.js';
import { EmulatorControls } from './EmulatorControls.js';
import { isTypingTarget } from '../game/input.js';

interface NetworkLabProps {
  netClient: NetClient;
  emulatorClient: EmulatorClient;
  isOpen: boolean;
  onToggleOpen: () => void;
}


export const NetworkLab: React.FC<NetworkLabProps> = ({
  netClient,
  emulatorClient,
  isOpen,
  onToggleOpen,
}) => {
  const emulatorStatus = useGameStore((s) => s.emulatorStatus);
  const emulatorStats = useGameStore((s) => s.emulatorStats);

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

  // Keyboard hotkeys for presets and toggles per SPEC.md §13.2
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger while typing in a text field (sliders and checkboxes are fine)
      if (isTypingTarget(e.target)) return;

      if (e.key === 'Tab') {
        e.preventDefault();
        onToggleOpen();
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
  }, [onToggleOpen, toggles]);

  const toggleNetcode = (key: keyof typeof toggles) => {
    setToggles((prev) => {
      const updated = { ...prev, [key]: !prev[key] };
      netClient.toggles = updated;
      return updated;
    });
    // Latency averages from the previous mode would be misleading
    if (key === 'prediction' || key === 'interpolation') netClient.resetLatencySamples();
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

        {/* Sections 2–3: presets + impairment sliders */}
        <EmulatorControls emulatorClient={emulatorClient} />

        {/* Section 4: Netcode Toggles */}
        <div className="lab-section">
          <div className="lab-section-title">NETCODE TOGGLES</div>

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

          <div className="toggle-row">
            <label htmlFor="toggle-redundancy">Input Redundancy</label>
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
        </div>

        {/* Section 5: Metric Tiles */}
        <div className="lab-section">
          <div className="lab-section-title">LIVE METRICS (5 HZ)</div>
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
            onClick={() => netClient.perturb(40, 0)}
          >
            ⚡ NUDGE ME (SERVER MISPREDICT +40PX)
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
