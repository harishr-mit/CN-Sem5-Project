import React, { useState } from 'react';
import { DASHBOARD_URL } from '../net/EmulatorClient.js';

interface LandingProps {
  onStartQuickMatch: (name: string) => void;
  onStartCompare: (name: string) => void;
  onStartPresenter: (script: 'quick' | 'compare', name: string) => void;
}

export const Landing: React.FC<LandingProps> = ({ onStartQuickMatch, onStartCompare, onStartPresenter }) => {
  const [name, setName] = useState(() => {
    return 'PILOT_' + Math.floor(100 + Math.random() * 900);
  });
  const [showCredits, setShowCredits] = useState(false);

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
            id="compare-btn"
            className="btn-ghost"
            style={{ width: '100%', borderColor: 'var(--c-violet)', color: 'var(--c-violet)' }}
            onClick={() => onStartCompare(name.trim() || 'PILOT_01')}
          >
            NETWORK LAB — COMPARE
          </button>

          {/* Presenter mode (PHASES.md P1): scripted steps, N / B / H */}
          <div className="landing-row">
            <button
              id="presenter-quick-btn"
              className="btn-ghost landing-presenter"
              onClick={() => onStartPresenter('quick', name.trim() || 'PILOT_01')}
              title="12 scripted steps in a Quick Match: N next, B back, H hide the caption"
            >
              PRESENTER — QUICK MATCH
            </button>
            <button
              id="presenter-compare-btn"
              className="btn-ghost landing-presenter"
              onClick={() => onStartPresenter('compare', name.trim() || 'PILOT_01')}
              title="The six Compare presets as steps: N next, B back, H hide the caption"
            >
              PRESENTER — COMPARE
            </button>
          </div>

          <button
            id="dashboard-btn"
            className="btn-ghost landing-dashboard"
            onClick={() => window.open(DASHBOARD_URL, '_blank', 'noopener')}
            title="The emulator's own page (new tab): routes, sessions, impairments, live charts and a packet log. Works without the game."
          >
            EMULATOR DASHBOARD <span>↗</span>
          </button>

          <p className="landing-controls-hint">
            WASD / ARROWS: Move • MOUSE: Aim • CLICK: Fire • R: Reload • SPACE: Dash • M: Mute • TAB: Network Lab • 1–5: Presets
            • P / C / I / G: Netcode toggles • Y: Sync model • PRESENTER: N next • B back • H hide
          </p>

          <button id="credits-btn" className="landing-credits-link" onClick={() => setShowCredits(true)}>
            CREDITS
          </button>
        </div>
      </div>

      {showCredits && (
        <div className="credits-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowCredits(false); }}>
          <div className="credits-modal" id="credits-modal">
            <h2 className="font-display text-glow-cyan">CREDITS</h2>
            <p>Art and sound in <code>NoBu-Shooter/assets</code> (full list: <code>assets/CREDITS.md</code>).</p>
            <ul>
              <li>
                Player avatar: <b>“Animated Top Down Survivor Player”</b> by <b>Riley Gombart</b> —{' '}
                <a href="https://opengameart.org/node/38111" target="_blank" rel="noreferrer">OpenGameArt</a>,{' '}
                <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">CC-BY 3.0</a>
              </li>
              <li>
                Props and drone target: <b>“RC Art – Rough Props”</b> by <b>Reactorcore</b> —{' '}
                <a href="https://opengameart.org/content/rough-industrial-combat-props" target="_blank" rel="noreferrer">OpenGameArt</a>
              </li>
              <li>Pickup icons: ring icons by <b>qubodup</b> (CC0); Spread Shot and Speed badges made for this project</li>
              <li>Floors, effects and sound effects: CC0</li>
              <li>Fonts: Orbitron, Rajdhani, JetBrains Mono (SIL Open Font License)</li>
            </ul>
            <button className="btn-ghost" onClick={() => setShowCredits(false)}>CLOSE</button>
          </div>
        </div>
      )}
    </div>
  );
};
