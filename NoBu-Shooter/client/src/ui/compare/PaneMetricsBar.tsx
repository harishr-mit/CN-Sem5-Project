import React from 'react';
import type { LocalMetrics } from '../../net/NetClient.js';

interface PaneMetricsBarProps {
  metrics: LocalMetrics;
  accent: string;
  /** Drop the less important numbers on narrow panes. */
  compact: boolean;
  /** Mover numbers only make sense while movers exist. */
  showMovers: boolean;
}

const cell: React.CSSProperties = { whiteSpace: 'nowrap' };
const label: React.CSSProperties = { color: 'var(--c-text-muted)' };

/** Per-pane numbers under the canvas (PHASES.md C4). The dock has the rest. */
export const PaneMetricsBar: React.FC<PaneMetricsBarProps> = ({ metrics: m, accent, compact, showMovers }) => (
  <div
    style={{
      height: 30,
      display: 'flex',
      alignItems: 'center',
      gap: compact ? 10 : 14,
      padding: '0 10px',
      overflow: 'hidden',
      background: 'rgba(0,0,0,0.5)',
      borderTop: '1px solid var(--c-border)',
      fontFamily: 'var(--font-mono)',
      fontSize: compact ? '0.66rem' : '0.74rem',
    }}
  >
    <span style={cell}>
      <span style={label}>IN→SCR </span>
      <b style={{ color: accent }}>{m.inputToScreenMs} ms</b>
    </span>
    {!compact && (
      <span style={cell}>
        <span style={label}>ACK </span>{m.ackDelayMs} ms
      </span>
    )}
    <span style={cell}>
      <span style={label}>RTT </span>{m.rttMs} ms
    </span>
    <span style={cell}>
      <span style={label}>CORR </span>{m.correctionsPerSec}/s
    </span>
    {!compact && (
      <span style={cell}>
        <span style={label}>↓ </span>{m.bwDownKbps} kbps
      </span>
    )}
    {showMovers && (
      <>
        <span style={cell}>
          <span style={label}>LAG </span>
          {m.moverSamples > 0 ? `${m.moverLagMs}±${m.moverWobbleMs} ms` : '–'}
        </span>
        <span style={cell}>
          <span style={label}>FROZEN </span>
          {m.moverSamples > 0 ? `${m.moverFrozenPct}%` : '–'}
        </span>
      </>
    )}
  </div>
);
