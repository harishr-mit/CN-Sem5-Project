import React from 'react';
import type { LocalMetrics } from '../../net/NetClient.js';

interface PaneMetricsBarProps {
  metrics: LocalMetrics;
  accent: string;
  /** Drop the less important numbers on narrow panes. */
  compact: boolean;
  /** Mover numbers only make sense while movers exist. */
  showMovers: boolean;
  /** Lockstep pane: stalls instead of corrections and ack delay (docs/PHASE6_PLAN.md D7). */
  lockstep?: boolean;
}

const cell: React.CSSProperties = { whiteSpace: 'nowrap' };
const label: React.CSSProperties = { color: 'var(--c-text-muted)' };

/** Per-pane numbers under the canvas (PHASES.md C4). The dock has the rest. */
export const PaneMetricsBar: React.FC<PaneMetricsBarProps> = ({ metrics: m, accent, compact, showMovers, lockstep }) => (
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
    {lockstep ? (
      <>
        <span style={cell} title="Frames frozen waiting for a missing tick (last 10 s)">
          <span style={label}>STALLED </span>
          <b style={{ color: m.lsStalledPct > 1 ? 'var(--c-amber)' : 'var(--c-text)' }}>{m.lsStalledPct}%</b>
        </span>
        <span style={cell} title="Longest freeze in the last 10 s">
          <span style={label}>MAX </span>{m.lsLongestStallMs} ms
        </span>
        {!compact && (
          <span style={cell} title="How far the shown world is behind the server's tick">
            <span style={label}>BEHIND </span>{m.lsBehindMs} ms
          </span>
        )}
        <span style={cell} title="Hash mismatches with the server (must stay 0)">
          <span style={label}>DESYNC </span>
          <b style={{ color: m.lsDesyncs > 0 ? 'var(--c-red)' : 'var(--c-green)' }}>{m.lsDesyncs}</b>
        </span>
      </>
    ) : (
      <>
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
      </>
    )}
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
        {/* Lockstep: STALLED already says how often the whole world is frozen */}
        {!lockstep && (
          <span style={cell}>
            <span style={label}>FROZEN </span>
            {m.moverSamples > 0 ? `${m.moverFrozenPct}%` : '–'}
          </span>
        )}
      </>
    )}
  </div>
);
