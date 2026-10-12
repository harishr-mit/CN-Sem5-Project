import React from 'react';
import { syncLabel, type SyncSpec } from '@nobu/shared/sync';
import type { LocalMetrics } from '../../net/NetClient.js';
import { Sparkline } from '../Sparkline.js';
import { BandwidthChart } from './BandwidthChart.js';

export interface DockRow {
  id: string;
  title: string;
  color: string;
  metrics: LocalMetrics;
  sync: SyncSpec;
  /** Mover lag history (ms) for the sparkline. */
  lagHistory: number[];
  /** ↓ wire kbps history for the bandwidth chart. */
  bwHistory: number[];
}

interface CompareDockProps {
  caption: string;
  rows: DockRow[];
  showMovers: boolean;
  /** The emulator's bandwidth cap (kbps), 0 = none. */
  capKbps: number;
  /** Seconds covered by bwHistory. */
  bwSpanSec: number;
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
  /** Only meaningful for delta panes ('–' elsewhere). */
  deltaOnly?: boolean;
  /** Only meaningful for lockstep panes ('–' elsewhere). */
  lockstepOnly?: boolean;
  /** Not meaningful for lockstep panes (no prediction, no snapshots to ack). */
  notLockstep?: boolean;
}

const COLUMNS: Column[] = [
  { key: 'is', head: 'IN→SCREEN', value: (m) => m.inputToScreenMs, fmt: (v) => `${v} ms` },
  { key: 'ack', head: 'ACK', value: (m) => m.ackDelayMs, fmt: (v) => `${v} ms`, notLockstep: true },
  { key: 'rtt', head: 'RTT', value: (m) => m.rttMs, fmt: (v) => `${v} ms` },
  { key: 'corr', head: 'CORR/s', value: (m) => m.correctionsPerSec, fmt: (v) => `${v}`, notLockstep: true },
  // Lockstep (docs/PHASE6_PLAN.md D7)
  { key: 'stall', head: 'STALLED', value: (m) => m.lsStalledPct, fmt: (v) => `${v}%`, lockstepOnly: true },
  { key: 'stalls', head: 'STALLS/s', value: (m) => m.lsStallsPerSec, fmt: (v) => `${v}`, lockstepOnly: true },
  { key: 'longest', head: 'LONGEST', value: (m) => m.lsLongestStallMs, fmt: (v) => `${v} ms`, lockstepOnly: true },
  { key: 'behind', head: 'BEHIND', value: (m) => m.lsBehindMs, fmt: (v) => `${v} ms`, lockstepOnly: true },
  { key: 'resent', head: 'NACKED', value: (m) => m.lsNackedTicks, fmt: (v) => `${v}`, lockstepOnly: true },
  { key: 'desync', head: 'DESYNC', value: (m) => m.lsDesyncs, fmt: (v) => `${v}`, lockstepOnly: true },
  { key: 'bw', head: '↓ KBPS', value: (m) => m.bwDownKbps, fmt: (v) => `${v}` },
  { key: 'msg', head: 'MSG B', value: (m) => m.msgBytesDown, fmt: (v) => `${v}` },
  { key: 'lost', head: 'LOST/s', value: (m) => m.snapsLostPerSec, fmt: (v) => `${v}` },
  { key: 'fb', head: 'FALLBK/s', value: (m) => m.fullFallbacksPerSec, fmt: (v) => `${v}`, deltaOnly: true },
  { key: 'lag', head: 'MOVER LAG', value: (m) => m.moverLagMs, fmt: (v, m) => `${v} ± ${m.moverWobbleMs} ms`, movers: true },
  { key: 'frz', head: 'FROZEN', value: (m) => m.moverFrozenPct, fmt: (v) => `${v}%`, movers: true },
  { key: 'off', head: 'OFF-PATH', value: (m) => m.moverOffPathPct, fmt: (v) => `${v}%`, movers: true },
  { key: 'err', head: 'DISTANCE', value: (m) => m.moverErrorPx, fmt: (v) => `${v} px`, movers: true },
];

/** Comparison table, live bandwidth chart and mover-lag sparklines (PHASES.md C4, S4). */
export const CompareDock: React.FC<CompareDockProps> = ({ caption, rows, showMovers, capKbps, bwSpanSec, width, height }) => {
  const anyDelta = rows.some((r) => r.sync.model === 'delta');
  const anyNonFull = rows.some((r) => r.sync.model !== 'full');
  const anyLockstep = rows.some((r) => r.sync.model === 'lockstep');
  const columns = COLUMNS.filter((c) => (showMovers || !c.movers) && (anyDelta || !c.deltaOnly) && (anyLockstep || !c.lockstepOnly)
    // With lockstep panes the table is about stalls: the lost-snapshot and distance columns make room
    && !(anyLockstep && ['lost', 'err', 'msg'].includes(c.key)));
  const compact = width < 700;
  const wide = width >= 1000;
  // Narrow docks keep the columns the comparison is about: bytes and delay for sync models,
  // latency and mover lag for the Phase 2 toggles
  const shown = compact
    ? columns.filter((c) => (anyLockstep ? ['is', 'bw', 'stall', 'longest', 'desync']
      : anyNonFull ? ['ack', 'bw', 'lag', 'off'] : ['is', 'rtt', 'corr', 'lag', 'frz']).includes(c.key))
    : wide ? columns : columns.filter((c) => !['err', 'rtt', ...(anyLockstep ? ['off', 'stalls'] : [])].includes(c.key));
  const noData = (c: Column, r: DockRow) =>
    (c.movers === true && r.metrics.moverSamples === 0) || (c.deltaOnly === true && r.sync.model !== 'delta')
    || (c.lockstepOnly === true && r.sync.model !== 'lockstep') || (c.notLockstep === true && r.sync.model === 'lockstep');

  // Best (lowest) value per column among rows with data; highlight only if rows differ
  const best = new Map<string, number>();
  for (const c of shown) {
    const vals = rows.filter((r) => !noData(c, r)).map((r) => c.value(r.metrics));
    if (vals.length > 1 && Math.min(...vals) !== Math.max(...vals)) best.set(c.key, Math.min(...vals));
  }

  // Bottom area: the bandwidth chart whenever sync models differ (or there is room), lag sparklines for movers
  const showChart = anyNonFull || !showMovers || wide;
  const showLag = showMovers && (wide || !anyNonFull);

  return (
    <div
      id="cmp-dock"
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
      {caption && <div style={{ fontSize: compact ? '0.74rem' : '0.86rem', color: 'var(--c-text)', lineHeight: 1.25 }}>{caption}</div>}

      <table style={{ borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: compact ? '0.66rem' : '0.76rem' }}>
        <thead>
          <tr style={{ color: 'var(--c-text-muted)', textAlign: 'right' }}>
            <th style={{ textAlign: 'left', fontWeight: 400, paddingRight: 8 }}>PANE</th>
            <th style={{ textAlign: 'left', fontWeight: 400, padding: '0 6px' }}>SYNC</th>
            {shown.map((c) => (
              <th key={c.key} style={{ fontWeight: 400, padding: '0 6px', whiteSpace: 'nowrap' }}>{c.head}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ textAlign: 'right' }}>
              <td style={{ textAlign: 'left', color: r.color, paddingRight: 8, whiteSpace: 'nowrap' }}>
                {r.id} {wide ? r.title : ''}
              </td>
              <td style={{ textAlign: 'left', padding: '2px 6px', whiteSpace: 'nowrap', color: r.color }}>{syncLabel(r.sync)}</td>
              {shown.map((c) => {
                const empty = noData(c, r);
                const v = c.value(r.metrics);
                const isBest = !empty && best.get(c.key) === v;
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
                    {empty ? '–' : c.fmt(v, r.metrics)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {height >= 170 && (showChart || showLag) && (
        <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>
          {showChart && (
            <div style={{ flex: '2 1 320px', minWidth: 0 }}>
              <BandwidthChart
                series={rows.map((r) => ({ id: r.id, color: r.color, data: r.bwHistory }))}
                capKbps={capKbps}
                spanSec={bwSpanSec}
                height={Math.max(60, Math.min(160, height - 40 - 22 * (rows.length + 1)))}
              />
            </div>
          )}
          {showLag && (
            <div style={{ flex: '1 1 160px', display: 'flex', flexDirection: showChart ? 'column' : 'row', flexWrap: 'wrap', gap: showChart ? 2 : 10, minWidth: 0 }}>
              {rows.map((r) => (
                <div key={r.id} style={showChart ? undefined : { flex: '1 1 140px', minWidth: 120, maxWidth: 260 }}>
                  <Sparkline
                    data={r.lagHistory}
                    color={r.color}
                    min={0}
                    height={showChart ? 22 : 34}
                    label={`${r.id} mover lag (ms)`}
                    currentValue={r.metrics.moverSamples > 0 ? r.metrics.moverLagMs : '–'}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
