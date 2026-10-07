import React, { useState, useEffect, useRef } from 'react';
import type { NetClient } from '../net/NetClient.js';
import type { EmulatorClient } from '../net/EmulatorClient.js';
import { useGameStore } from './store.js';
import { Sparkline } from './Sparkline.js';

interface NetworkLabProps {
  netClient: NetClient;
  emulatorClient: EmulatorClient;
  isOpen: boolean;
  onToggleOpen: () => void;
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
}) => {
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

  // Throttle timer for config sends (10 Hz max)
  const pendingConfigTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Send config patch to emulator (throttled)
  const sendConfigPatch = (patch: Record<string, unknown>) => {
    setActivePreset('Custom');
    if (pendingConfigTimer.current) clearTimeout(pendingConfigTimer.current);
    pendingConfigTimer.current = setTimeout(() => {
      emulatorClient.setConfig(patch);
    }, 100);
  };

  const handleApplyPreset = (name: string) => {
    setActivePreset(name);
    emulatorClient.applyPreset(name);
    // Sync slider visual state to preset constants
    if (name === 'Baseline') {
      setLatencyMs(0); setJitterMs(0); setLossPct(0); setBandwidthKbps(0); setDupPct(0); setReorderPct(0); setBurstLoss(false);
    } else if (name === 'Café Wi-Fi') {
      setLatencyMs(25); setJitterMs(15); setLossPct(1); setBandwidthKbps(0); setDupPct(0); setReorderPct(0); setBurstLoss(false);
    } else if (name === 'Mobile 4G') {
      setLatencyMs(45); setJitterMs(25); setLossPct(2); setBandwidthKbps(5000); setDupPct(0); setReorderPct(0); setBurstLoss(false);
    } else if (name === 'Transatlantic') {
      setLatencyMs(90); setJitterMs(8); setLossPct(0.5); setBandwidthKbps(0); setDupPct(0); setReorderPct(0); setBurstLoss(false);
    } else if (name === 'Nightmare') {
      setLatencyMs(120); setJitterMs(50); setLossPct(12); setBandwidthKbps(400); setDupPct(3); setReorderPct(5); setBurstLoss(true);
    }
  };

  // Keyboard hotkeys for presets and toggles per SPEC.md §13.2
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

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
  };

  // 5 Hz sampling for metrics and sparklines
  useEffect(() => {
    const timer = setInterval(() => {
      netClient.updateMetrics();
      const m = { ...netClient.metrics };
      setMetrics(m);

      // Flash correction tile if error > 8px
      if (m.lastErrorPx > 8) {
        setFlashCorrection(true);
        setTimeout(() => setFlashCorrection(false), 300);
      }

      // Emulator ground-truth loss if available
      let currentLoss = m.snapsMissed;
      if (emulatorStats.length > 0) {
        const s = emulatorStats[0];
        const upIn = s.up['in'] || 0;
        const upDrop = s.up['dropped'] || 0;
        const downIn = s.down['in'] || 0;
        const downDrop = s.down['dropped'] || 0;
        const totalIn = upIn + downIn;
        const totalDrop = upDrop + downDrop;
        if (totalIn > 0) currentLoss = Math.round((totalDrop / totalIn) * 100);
      }

      setRttHistory((h) => [...h.slice(1), m.rttMs]);
      setLossHistory((h) => [...h.slice(1), currentLoss]);
      setPendingHistory((h) => [...h.slice(1), m.pendingInputs]);
      setErrorHistory((h) => [...h.slice(1), m.lastErrorPx]);
    }, 200);

    return () => clearInterval(timer);
  }, [netClient, emulatorStats]);

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
              <div className="metric-label">INPUT → SCREEN</div>
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
            currentValue={`${metrics.lastErrorPx.toFixed(1)} px`}
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

          <p title="SPEC.md §4: The links between browser, emulator, and server are loopback TCP connections. The emulator is the ONLY place where messages are dropped, delayed, duplicated, or reordered per message before forwarding, providing realistic UDP datagram semantics.">
            <strong>About transport:</strong> Frames routed through standalone impairment engine acting as datagram proxy.
          </p>
        </div>
      </div>
    </div>
  );
};
