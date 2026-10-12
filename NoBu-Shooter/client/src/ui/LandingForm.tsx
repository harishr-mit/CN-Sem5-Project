/**
 * LandingForm.tsx — the landing page both editions share (docs/PHASE7_PLAN.md
 * D2): title, callsign, QUICK MATCH, CREATE ROOM / JOIN ROOM (D9) and the
 * credits (the survivor art is CC-BY 3.0 and must stay credited). Each
 * edition adds its own buttons below (`extras`) and its key hint.
 */

import React, { useState } from 'react';
import { normalizeCode } from '@nobu/shared/rooms/codes.js';
import { roomFromUrl } from '../net/serverUrl.js';

interface LandingFormProps {
  subtitle: string;
  /** Join `main` (quick match), `new` (create a private room) or a room code. */
  onPlay: (name: string, room: string) => void;
  quickMatchLabel?: string;
  /** Edition buttons under the form; gets the current callsign. */
  extras?: (name: string) => React.ReactNode;
  controlsHint: React.ReactNode;
}

const cleanName = (name: string) => name.trim() || 'PILOT_01';

export const LandingForm: React.FC<LandingFormProps> = ({ subtitle, onPlay, quickMatchLabel = 'QUICK MATCH (vs bots)', extras, controlsHint }) => {
  const [name, setName] = useState(() => 'PILOT_' + Math.floor(100 + Math.random() * 900));
  // A share link (?room=blue-fox) fills in the code
  const [code, setCode] = useState(() => (typeof window !== 'undefined' ? roomFromUrl(window.location) ?? '' : ''));
  const [codeError, setCodeError] = useState<string | null>(null);
  const [showCredits, setShowCredits] = useState(false);

  const join = () => {
    const canonical = normalizeCode(code);
    if (!canonical) {
      setCodeError('A room code is two words, e.g. BLUE FOX');
      return;
    }
    onPlay(cleanName(name), canonical);
  };

  return (
    <div className="landing" id="landing-screen">
      <div className="landing-bg">
        <div className="landing-grid" />
      </div>

      <div className="landing-content">
        <div>
          <h1 className="landing-title text-glow-cyan">NOBU SHOOTER</h1>
          <p className="landing-sub" style={{ marginTop: '8px' }}>{subtitle}</p>
        </div>

        <div className="landing-form">
          <input
            id="player-name-input"
            type="text"
            maxLength={14}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onPlay(cleanName(name), code && normalizeCode(code) ? normalizeCode(code)! : 'main'); }}
            placeholder="CALLSIGN"
            autoFocus
          />

          <button id="quick-match-btn" className="btn-primary" style={{ width: '100%' }} onClick={() => onPlay(cleanName(name), 'main')}>
            {quickMatchLabel}
          </button>

          {/* Private rooms (D9): create one and share its code, or join with a code */}
          <div className="landing-row landing-rooms">
            <button
              id="create-room-btn"
              className="btn-ghost"
              onClick={() => onPlay(cleanName(name), 'new')}
              title="A private room: you get a two-word code to share, and you start the match"
            >
              CREATE ROOM
            </button>
            <div className="landing-join">
              <input
                id="room-code-input"
                type="text"
                maxLength={20}
                value={code}
                onChange={(e) => { setCode(e.target.value); setCodeError(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') join(); }}
                placeholder="ROOM CODE"
                aria-label="Room code"
              />
              <button id="join-room-btn" className="btn-ghost" onClick={join}>JOIN</button>
            </div>
          </div>
          {codeError && <div className="landing-error" id="room-code-error">{codeError}</div>}

          {extras?.(cleanName(name))}

          <p className="landing-controls-hint">{controlsHint}</p>

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
