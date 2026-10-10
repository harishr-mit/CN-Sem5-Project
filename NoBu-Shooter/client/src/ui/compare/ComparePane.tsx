import React from 'react';
import { GameContainer } from '../../game/GameContainer.js';
import type { ArenaSceneOptions } from '../../game/ArenaScene.js';
import type { NetClient, LocalMetrics, PredictionToggle } from '../../net/NetClient.js';
import { PaneMetricsBar } from './PaneMetricsBar.js';
import { PANE_CHROME_PX } from '../../compare/layout.js';
import { syncLabel, type SyncSpec } from '@nobu/shared/sync';

const CHIPS: { key: keyof PredictionToggle; label: string; hint: string }[] = [
  { key: 'prediction', label: 'P', hint: 'Prediction [P]' },
  { key: 'reconciliation', label: 'C', hint: 'Reconciliation [C]' },
  { key: 'interpolation', label: 'I', hint: 'Interpolation [I]' },
  { key: 'redundancy', label: 'Rd', hint: 'Input redundancy' },
  { key: 'ghost', label: 'G', hint: 'Ghost [G]' },
];

interface ComparePaneProps {
  id: string;
  title: string;
  color: string;
  netClient: NetClient;
  options: ArenaSceneOptions;
  canvasW: number;
  canvasH: number;
  metrics: LocalMetrics;
  showMovers: boolean;
  /** Reference pane: direct to the server, no toggles. */
  reference?: boolean;
  toggles?: PredictionToggle;
  /** Sync model of this pane (PHASES.md Phase 3). */
  sync?: SyncSpec;
  selected?: boolean;
  onSelect?: () => void;
  onToggle?: (key: keyof PredictionToggle) => void;
  /** Cycle the sync model (Full → Delta → State 10 → State 30). */
  onCycleSync?: () => void;
}

export const ComparePane: React.FC<ComparePaneProps> = ({
  id, title, color, netClient, options, canvasW, canvasH, metrics,
  showMovers, reference, toggles, sync, selected, onSelect, onToggle, onCycleSync,
}) => (
  <div
    onMouseDown={onSelect}
    style={{
      width: canvasW,
      height: canvasH + PANE_CHROME_PX,
      display: 'flex',
      flexDirection: 'column',
      // An outline takes no layout space, so the canvas stays exactly the size layoutPanes gave it
      outline: `1px solid ${selected ? color : 'var(--c-border)'}`,
      boxShadow: selected ? `0 0 12px ${color}55` : 'none',
      boxSizing: 'border-box',
      background: 'var(--c-bg)',
    }}
  >
    {/* Header: 26 px */}
    <div
      style={{
        height: 26,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '0 8px',
        background: 'rgba(10, 8, 26, 0.9)',
        borderBottom: `1px solid ${color}66`,
        overflow: 'hidden',
      }}
    >
      <span className="font-display" style={{ color, fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
        {id} · {title}
      </span>
      {reference ? (
        <span className="font-mono" style={{ fontSize: '0.62rem', color: 'var(--c-text-muted)', whiteSpace: 'nowrap' }}>
          DIRECT TO SERVER · TRUTH
        </span>
      ) : (
        <span style={{ display: 'flex', gap: 3 }}>
          {sync && (
            <button
              title="Sync model [Y]: Full → Delta → State 10 Hz → State 30 Hz"
              className="cmp-sync-chip"
              onClick={(e) => { e.stopPropagation(); onCycleSync?.(); }}
              style={{
                height: 18,
                padding: '0 6px',
                marginRight: 4,
                fontFamily: 'var(--font-mono)',
                fontSize: '0.62rem',
                cursor: 'pointer',
                borderRadius: 3,
                whiteSpace: 'nowrap',
                color: color,
                background: 'transparent',
                border: `1px solid ${color}`,
              }}
            >
              {syncLabel(sync)}
            </button>
          )}
          {CHIPS.map((c) => {
            const on = toggles?.[c.key] ?? false;
            // State sync extrapolates; interpolation doesn't apply (docs/PHASE3_PLAN.md D6)
            const inert = c.key === 'interpolation' && sync?.model === 'state';
            return (
              <button
                key={c.key}
                title={inert ? 'Interpolation: not used with State sync (it extrapolates)' : c.hint}
                disabled={inert}
                onClick={(e) => { e.stopPropagation(); onToggle?.(c.key); }}
                style={{
                  opacity: inert ? 0.3 : 1,
                  minWidth: 22,
                  height: 18,
                  padding: '0 4px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.62rem',
                  cursor: inert ? 'default' : 'pointer',
                  borderRadius: 3,
                  color: on ? '#07070f' : 'var(--c-text-muted)',
                  background: on ? color : 'transparent',
                  border: `1px solid ${on ? color : 'var(--c-border)'}`,
                }}
              >
                {c.label}
              </button>
            );
          })}
        </span>
      )}
    </div>

    {/* Canvas host: exactly arena-shaped, so Phaser FIT adds no bars */}
    <div style={{ width: canvasW, height: canvasH, position: 'relative', background: '#07070f' }}>
      <GameContainer netClient={netClient} options={options} id={`game-canvas-${id.toLowerCase()}`} />
    </div>

    <PaneMetricsBar metrics={metrics} accent={color} compact={canvasW < 640} showMovers={showMovers} />
  </div>
);
