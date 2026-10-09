import React from 'react';
import type { LocalMetrics } from '../../net/NetClient.js';
import { Sparkline } from '../Sparkline.js';

export interface DockRow {
  id: string;
  title: string;
  color: string;
  metrics: LocalMetrics;
  /** Mover lag history (ms) for the sparkline. */
  lagHistory: number[];
}

interface CompareDockProps {
  caption: string;
  rows: DockRow[];
  showMovers: boolean;
  width: number;
  height: number;
}

interface Column {
  key: string;
  head: string;
  value: (m: LocalMetrics) => number;
  fmt: (v: number, m: LocalMetrics) => string;
  /** Needs movers (and samples) to mean anything. */
  movers?: boolean;
}

const COLUMNS: Column[] = [
  { key: 'is', head: 'IN→SCREEN', value: (m) => m.inputToScreenMs, fmt: (v) => `${v} ms` },
  { key: 'ack', head: 'ACK', value: (m) => m.ackDelayMs, fmt: (v) => `${v} ms` },
  { key: 'rtt', head: 'RTT', value: (m) => m.rttMs, fmt: (v) => `${v} ms` },
  { key: 'corr', head: 'CORR/s', value: (m) => m.correctionsPerSec, fmt: (v) => `${v}` },
  { key: 'bw', head: '↓ KBPS', value: (m) => m.bwDownKbps, fmt: (v) => `${v}` },
  { key: 'lag', head: 'MOVER LAG', value: (m) => m.moverLagMs, fmt: (v, m) => `${v} ± ${m.moverWobbleMs} ms`, movers: true },
  { key: 'frz', head: 'FROZEN', value: (m) => m.moverFrozenPct, fmt: (v) => `${v}%`, movers: true },
  { key: 'err', head: 'DISTANCE', value: (m) => m.moverErrorPx, fmt: (v) => `${v} px`, movers: true },
];

/** Comparison table + mover-lag sparklines (the Phase 3 bandwidth chart goes here too). */
export const CompareDock: React.FC<CompareDockProps> = ({ caption, rows, showMovers, width, height }) => {
  const columns = COLUMNS.filter((c) => showMovers || !c.movers);
  const compact = width < 700;
  const shown = compact ? columns.filter((c) => !['ack', 'bw', 'err'].includes(c.key)) : columns;

  // Best (lowest) value per column among rows with data; highlight only if rows differ
  const best = new Map<string, number>();
  for (const c of shown) {
    const vals = rows
      .filter((r) => !c.movers || r.metrics.moverSamples > 0)
      .map((r) => c.value(r.metrics));
    if (vals.length > 1 && Math.min(...vals) !== Math.max(...vals)) best.set(c.key, Math.min(...vals));
  }

  return (
    <div
      style={{
        width,
        height,
        boxSizing: 'border-box',
        overflow: 'hidden',
        padding: compact ? '8px 10px' : '10px 14px',
        background: 'rgba(10, 8, 26, 0.85)',
        border: '1px solid var(--c-border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ fontSize: compact ? '0.74rem' : '0.86rem', color: 'var(--c-text)', lineHeight: 1.25 }}>{caption}</div>

      <table style={{ borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: compact ? '0.66rem' : '0.76rem' }}>
        <thead>
          <tr style={{ color: 'var(--c-text-muted)', textAlign: 'right' }}>
            <th style={{ textAlign: 'left', fontWeight: 400, paddingRight: 8 }}>PANE</th>
            {shown.map((c) => (
              <th key={c.key} style={{ fontWeight: 400, padding: '0 6px', whiteSpace: 'nowrap' }}>{c.head}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ textAlign: 'right' }}>
              <td style={{ textAlign: 'left', color: r.color, paddingRight: 8, whiteSpace: 'nowrap' }}>
                {r.id} {compact ? '' : r.title}
              </td>
              {shown.map((c) => {
                const noData = c.movers && r.metrics.moverSamples === 0;
                const v = c.value(r.metrics);
                const isBest = !noData && best.get(c.key) === v;
                return (
                  <td
                    key={c.key}
                    style={{
                      padding: '2px 6px',
                      whiteSpace: 'nowrap',
                      color: isBest ? 'var(--c-green)' : 'var(--c-text)',
                      fontWeight: isBest ? 700 : 400,
                    }}
                  >
                    {noData ? '–' : c.fmt(v, r.metrics)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {showMovers && height >= 200 && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', minHeight: 0 }}>
          {rows.map((r) => (
            <div key={r.id} style={{ flex: '1 1 140px', minWidth: 120, maxWidth: 260 }}>
              <Sparkline
                data={r.lagHistory}
                color={r.color}
                min={0}
                height={34}
                label={`${r.id} mover lag (ms)`}
                currentValue={r.metrics.moverSamples > 0 ? r.metrics.moverLagMs : '–'}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
