import React, { useState, useEffect, useRef } from 'react';
import type { EmulatorClient } from '../net/EmulatorClient.js';
import { useGameStore } from './store.js';

export const EMULATOR_PRESETS = [
  { name: 'Baseline', key: '1' },
  { name: 'Café Wi-Fi', key: '2' },
  { name: 'Mobile 4G', key: '3' },
  { name: 'Transatlantic', key: '4' },
  { name: 'Nightmare', key: '5' },
];

interface EmulatorControlsProps {
  emulatorClient: EmulatorClient;
  /** Hotkeys 1–5 apply the emulator presets (default on). */
  hotkeys?: boolean;
}

/**
 * Emulator preset chips + impairment sliders. Shared by the in-game Network
 * Lab and the Compare view's drawer. The emulator's state broadcast is the
 * single source of truth for the slider values.
 */
export const EmulatorControls: React.FC<EmulatorControlsProps> = ({ emulatorClient, hotkeys = true }) => {
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

  // Hotkeys 1–5 select a preset
  useEffect(() => {
    if (!hotkeys) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const preset = EMULATOR_PRESETS.find((p) => p.key === e.key);
      if (preset) handleApplyPreset(preset.name);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hotkeys, emulatorClient]);

  return (
    <>
    {/* Section 2: Presets */}
    <div className="lab-section">
      <div className="lab-section-title">PRESETS (HOTKEYS 1–5)</div>
      <div className="presets-row">
        {EMULATOR_PRESETS.map((p) => (
          <button
            key={p.name}
            id={`preset-btn-${p.key}`}
            className={`preset-chip ${activePreset === p.name ? 'active' : ''}`}
            onClick={() => handleApplyPreset(p.name)}
          >
            [{p.key}] {p.name}
          </button>
        ))}
        {/* "Custom" after a slider change, or an ad-hoc preset name (e.g. from Compare) */}
        {!EMULATOR_PRESETS.some((p) => p.name === activePreset) && (
          <div className="preset-chip active" style={{ borderColor: 'var(--c-amber)', color: 'var(--c-amber)' }}>
            {activePreset.toUpperCase()}
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
    </>
  );
};
