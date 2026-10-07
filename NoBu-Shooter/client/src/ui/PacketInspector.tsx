import React, { useState } from 'react';
import { useGameStore } from './store.js';

interface PacketInspectorProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PacketInspector: React.FC<PacketInspectorProps> = ({ isOpen, onClose }) => {
  const packetEvents = useGameStore((s) => s.packetEvents);
  const [isPaused, setIsPaused] = useState(false);
  const [frozenPackets, setFrozenPackets] = useState<typeof packetEvents>([]);

  if (!isOpen) return null;

  const displayList = isPaused ? frozenPackets : packetEvents.slice(-100).reverse();

  const handleTogglePause = () => {
    if (!isPaused) {
      setFrozenPackets(packetEvents.slice(-100).reverse());
      setIsPaused(true);
    } else {
      setIsPaused(false);
    }
  };

  const getFateBadge = (fate: string) => {
    switch (fate) {
      case 'delivered':
        return <span className="chip chip-green">DELIVERED</span>;
      case 'dropped-loss':
        return <span className="chip chip-red">LOSS DROP</span>;
      case 'dropped-queue':
        return <span className="chip chip-amber">QUEUE DROP</span>;
      case 'duplicated':
        return <span className="chip chip-cyan">DUPLICATED</span>;
      default:
        return <span className="chip">{fate}</span>;
    }
  };

  return (
    <div
      id="packet-inspector-drawer"
      style={{
        position: 'absolute',
        bottom: '72px',
        left: 0,
        right: 0,
        height: '240px',
        background: 'rgba(7, 7, 15, 0.95)',
        borderTop: '1px solid var(--c-border)',
        backdropFilter: 'blur(16px)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 16px',
          borderBottom: '1px solid var(--c-border)',
          background: 'rgba(124, 77, 255, 0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className="font-display" style={{ fontSize: '0.85rem', color: 'var(--c-cyan)', letterSpacing: '0.1em' }}>
            PACKET INSPECTOR
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--c-text-muted)', fontFamily: 'var(--font-mono)' }}>
            LATEST {displayList.length} FRAMES
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            id="inspector-pause-btn"
            className="btn-ghost"
            style={{
              padding: '2px 10px',
              fontSize: '0.72rem',
              borderColor: isPaused ? 'var(--c-amber)' : 'var(--c-border)',
              color: isPaused ? 'var(--c-amber)' : 'var(--c-text)',
            }}
            onClick={handleTogglePause}
          >
            {isPaused ? '▶ RESUME STREAM' : '❚❚ FREEZE STREAM'}
          </button>
          <button
            id="inspector-close-btn"
            className="btn-icon"
            style={{ fontSize: '1rem', cursor: 'pointer' }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Table list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
          <thead>
            <tr style={{ color: 'var(--c-text-muted)', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <th style={{ padding: '6px 4px' }}>DIR</th>
              <th style={{ padding: '6px 4px' }}>FATE</th>
              <th style={{ padding: '6px 4px' }}>DELAY</th>
              <th style={{ padding: '6px 4px' }}>SIZE</th>
              <th style={{ padding: '6px 4px' }}>PAYLOAD PREVIEW</th>
            </tr>
          </thead>
          <tbody>
            {displayList.map((pkt, idx) => (
              <tr
                key={idx}
                style={{
                  borderBottom: '1px solid rgba(255,255,255,0.03)',
                  color: pkt.dir === 'up' ? 'var(--c-cyan)' : 'var(--c-magenta)',
                }}
              >
                <td style={{ padding: '4px' }}>
                  {pkt.dir === 'up' ? '▲ UP' : '▼ DOWN'}
                </td>
                <td style={{ padding: '4px' }}>{getFateBadge(pkt.fate)}</td>
                <td style={{ padding: '4px', color: 'var(--c-text)' }}>
                  {pkt.delayMs.toFixed(0)} ms
                </td>
                <td style={{ padding: '4px', color: 'var(--c-text-muted)' }}>
                  {pkt.size} B
                </td>
                <td
                  style={{
                    padding: '4px',
                    color: 'var(--c-text)',
                    maxWidth: '450px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={pkt.preview}
                >
                  {pkt.preview}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
