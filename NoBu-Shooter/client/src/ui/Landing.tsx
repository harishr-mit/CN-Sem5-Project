import React, { useState } from 'react';

interface LandingProps {
  onStartQuickMatch: (name: string) => void;
  onStartABCompare: (name: string) => void;
}

export const Landing: React.FC<LandingProps> = ({ onStartQuickMatch, onStartABCompare }) => {
  const [name, setName] = useState(() => {
    return 'PILOT_' + Math.floor(100 + Math.random() * 900);
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const trimmed = name.trim() || 'PILOT_01';
      onStartQuickMatch(trimmed);
    }
  };

  return (
    <div className="landing" id="landing-screen">
      <div className="landing-bg">
        <div className="landing-grid" />
      </div>

      <div className="landing-content">
        <div>
          <h1 className="landing-title text-glow-cyan">NOBU SHOOTER</h1>
          <p className="landing-sub" style={{ marginTop: '8px' }}>
            Authoritative Server • Client-Side Prediction • Reconciliation • Network Impairment Lab
          </p>
        </div>

        <div className="landing-form">
          <input
            id="player-name-input"
            type="text"
            maxLength={14}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="CALLSIGN"
            autoFocus
          />

          <button
            id="quick-match-btn"
            className="btn-primary"
            style={{ width: '100%' }}
            onClick={() => onStartQuickMatch(name.trim() || 'PILOT_01')}
          >
            QUICK MATCH (vs bots)
          </button>

          <button
            id="ab-compare-btn"
            className="btn-ghost"
            style={{ width: '100%', borderColor: 'var(--c-violet)', color: 'var(--c-violet)' }}
            onClick={() => onStartABCompare(name.trim() || 'PILOT_01')}
          >
            NETWORK LAB — A/B COMPARE
          </button>

          <p className="landing-controls-hint">
            WASD / ARROWS: Move • MOUSE: Aim • CLICK: Fire • TAB: Network Lab • 1–5: Presets
          </p>
        </div>
      </div>
    </div>
  );
};
