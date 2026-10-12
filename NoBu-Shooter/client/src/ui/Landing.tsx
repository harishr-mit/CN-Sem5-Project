import React from 'react';
import { DASHBOARD_URL } from '../net/EmulatorClient.js';
import { LandingForm } from './LandingForm.js';

interface LandingProps {
  /** Quick match (`main`), a new private room (`new`) or a room code. */
  onPlay: (name: string, room: string) => void;
  onStartCompare: (name: string) => void;
  onStartPresenter: (script: 'quick' | 'compare', name: string) => void;
}

/** The demo's landing page: the shared form plus Compare, Presenter and the emulator dashboard. */
export const Landing: React.FC<LandingProps> = ({ onPlay, onStartCompare, onStartPresenter }) => (
  <LandingForm
    subtitle="Authoritative Server • Client-Side Prediction • Reconciliation • Network Impairment Lab"
    onPlay={onPlay}
    controlsHint={<>
      WASD / ARROWS: Move • MOUSE: Aim • CLICK: Fire • R: Reload • SPACE: Dash • M: Mute • TAB: Network Lab • 1–5: Presets
      • P / C / I / G: Netcode toggles • Y: Sync model • PRESENTER: N next • B back • H hide
    </>}
    extras={(name) => (
      <>
        <button
          id="compare-btn"
          className="btn-ghost"
          style={{ width: '100%', borderColor: 'var(--c-violet)', color: 'var(--c-violet)' }}
          onClick={() => onStartCompare(name)}
        >
          NETWORK LAB — COMPARE
        </button>

        {/* Presenter mode (PHASES.md P1): scripted steps, N / B / H */}
        <div className="landing-row">
          <button
            id="presenter-quick-btn"
            className="btn-ghost landing-presenter"
            onClick={() => onStartPresenter('quick', name)}
            title="12 scripted steps in a Quick Match: N next, B back, H hide the caption"
          >
            PRESENTER — QUICK MATCH
          </button>
          <button
            id="presenter-compare-btn"
            className="btn-ghost landing-presenter"
            onClick={() => onStartPresenter('compare', name)}
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
      </>
    )}
  />
);
