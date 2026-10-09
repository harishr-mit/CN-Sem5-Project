import React from 'react';
import { useGameStore } from './store.js';

interface HudProps {
  onOpenSettings?: () => void;
  onOpenControls?: () => void;
  /** Leave the match and return to the landing page. */
  onLeave?: () => void;
}

const quickButtonStyle: React.CSSProperties = {
  background: 'rgba(10, 8, 26, 0.75)',
  border: '1px solid var(--c-border)',
  borderRadius: '4px',
  padding: '4px 10px',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.72rem',
  letterSpacing: '0.08em',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  backdropFilter: 'blur(4px)',
};

export const Hud: React.FC<HudProps> = ({ onOpenSettings, onOpenControls, onLeave }) => {
  const snap = useGameStore((s) => s.snap);
  const myPlayerId = useGameStore((s) => s.playerId);
  const killFeed = useGameStore((s) => s.killFeed);
  const connStatus = useGameStore((s) => s.connectionStatus);

  const myPlayer = snap?.players.find((p) => p.id === myPlayerId);
  const matchState = snap?.match.state ?? 'WAITING';
  const timeLeftMs = snap?.match.timeLeftMs ?? 0;

  // Format time MM:SS
  const totalSeconds = Math.max(0, Math.ceil(timeLeftMs / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  const isTimeCritical = matchState === 'RUNNING' && totalSeconds <= 10 && totalSeconds > 0;

  // Sorted scoreboard (top 5)
  const sortedPlayers = snap
    ? [...snap.players].sort((a, b) => b.score - a.score).slice(0, 5)
    : [];

  return (
    <div className="hud">
      {/* Timer */}
      {matchState !== 'WAITING' && (
        <div className={`hud-timer ${isTimeCritical ? 'timer-danger' : ''}`} id="hud-timer">
          {timeStr}
        </div>
      )}

      {/* Local Score */}
      <div className="hud-score" id="hud-score">
        <span style={{ fontSize: '0.9rem', color: 'var(--c-text-muted)', display: 'block' }}>
          SCORE
        </span>
        {myPlayer ? myPlayer.score : 0}
      </div>

      {/* Compact Scoreboard */}
      {sortedPlayers.length > 0 && (
        <div className="hud-scoreboard" id="hud-scoreboard">
          <div
            style={{
              fontSize: '0.65rem',
              color: 'var(--c-text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: '2px',
            }}
          >
            Leaderboard
          </div>
          {sortedPlayers.map((p, idx) => (
            <div
              key={p.id}
              className={`scoreboard-row ${p.id === myPlayerId ? 'self' : ''}`}
            >
              <span className="rank">{idx + 1}</span>
              <span className="name">{p.name}</span>
              <span className="score">{p.score}</span>
            </div>
          ))}
        </div>
      )}

      {/* Kill Feed */}
      <div className="hud-killfeed" id="hud-killfeed">
        {killFeed.map((kf) => (
          <div key={kf.id} className="kill-feed-entry">
            <span className="killer">{kf.killer}</span>
            <span style={{ color: 'var(--c-text-dim)', margin: '0 4px' }}>►</span>
            <span className="victim">{kf.victim}</span>
          </div>
        ))}
      </div>

      {/* In-Game State Overlays */}
      {matchState === 'WAITING' && (
        <div className="overlay">
          <div className="overlay-text text-glow-cyan">WAITING FOR PLAYERS</div>
          <div className="overlay-sub">Bots and competitors stand by...</div>
        </div>
      )}

      {matchState === 'COUNTDOWN' && (
        <div className="overlay">
          <div className="countdown-num">
            {totalSeconds > 0 ? totalSeconds : 'GO!'}
          </div>
        </div>
      )}

      {/* Death / Respawn Status */}
      {myPlayer && !myPlayer.alive && matchState === 'RUNNING' && (
        <div className="overlay">
          <div className="overlay-text" style={{ color: 'var(--c-red)' }}>
            ELIMINATED
          </div>
          <div className="overlay-sub">
            RESPAWNING IN {Math.max(0, Math.ceil(myPlayer.respawnMs / 1000))} s
          </div>
        </div>
      )}

      {/* Spawn Protection Banner */}
      {myPlayer && myPlayer.alive && myPlayer.protectMs > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: '80px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0, 229, 255, 0.15)',
            border: '1px solid var(--c-cyan)',
            borderRadius: '4px',
            padding: '4px 12px',
            color: 'var(--c-cyan)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}
        >
          SHIELD ACTIVE: {(myPlayer.protectMs / 1000).toFixed(1)}s
        </div>
      )}

      {/* Match Over Modal */}
      {matchState === 'ENDED' && (
        <div className="overlay" style={{ pointerEvents: 'all' }}>
          <div className="match-over">
            <div className="match-over-title">MATCH FINISHED</div>
            {snap?.match.results && (
              <>
                <div className="match-over-winner">
                  {snap.match.results.winners.length === 1
                    ? `WINNER: ${
                        snap.players.find((p) => p.id === snap?.match.results?.winners[0])?.name ||
                        'CHAMPION'
                      }`
                    : 'MATCH DRAW'}
                </div>

                <div className="match-over-scoreboard">
                  {snap.match.results.scoreboard.map((entry, idx) => (
                    <div
                      key={entry.id}
                      className={`match-over-row ${entry.left ? 'left-player' : ''}`}
                    >
                      <span className="pos">#{idx + 1}</span>
                      <span className="name">{entry.name}</span>
                      <span className="pts">{entry.score} PTS</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className="match-over-next">
              Next match starting in {Math.max(0, Math.ceil(timeLeftMs / 1000))} s
            </div>
          </div>
        </div>
      )}

      {/* Connection Loss / Connecting Overlay */}
      {connStatus !== 'connected' && (
        <div className="connecting-overlay">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', maxWidth: '420px', textAlign: 'center' }}>
            <div className="connecting-spinner" />
            <div
              className="font-display"
              style={{
                letterSpacing: '0.15em',
                color: connStatus === 'error' || connStatus === 'timeout' ? 'var(--c-red)' : 'var(--c-cyan)',
              }}
            >
              {connStatus === 'connecting' && 'CONNECTING TO SIMULATION...'}
              {connStatus === 'disconnected' && 'CONNECTION LOST — RECONNECTING...'}
              {connStatus === 'timeout' && 'CONNECTION TIMED OUT'}
              {connStatus === 'error' && 'COMMUNICATION ERROR'}
            </div>
            {(connStatus === 'timeout' || connStatus === 'error') && (
              <div style={{ fontSize: '0.82rem', color: 'var(--c-text-muted)', lineHeight: '1.5', fontFamily: 'var(--font-mono)' }}>
                Please ensure both the backend server and network emulator are running:
                <div style={{ marginTop: '6px', color: 'var(--c-cyan)', background: 'rgba(0,0,0,0.4)', padding: '6px 10px', borderRadius: '4px' }}>
                  npm run demo
                </div>
              </div>
            )}
            {onLeave && (
              <button id="hud-overlay-leave-btn" className="btn-ghost" onClick={onLeave} style={{ fontSize: '0.8rem' }}>
                ◄ BACK TO MENU
              </button>
            )}
          </div>
        </div>
      )}

      {/* Quick Action Floating Bar (.hud has pointer-events: none, so opt back in) */}
      <div
        style={{
          position: 'absolute',
          bottom: '12px',
          left: '12px',
          display: 'flex',
          gap: '8px',
          zIndex: 40,
          pointerEvents: 'auto',
        }}
      >
        {onLeave && (
          <button
            id="hud-leave-btn"
            onClick={onLeave}
            style={{ ...quickButtonStyle, color: 'var(--c-red)' }}
            title="Leave the match and return to the main menu"
          >
            <span>◄</span> LEAVE MATCH
          </button>
        )}
        {onOpenControls && (
          <button
            onClick={onOpenControls}
            style={{ ...quickButtonStyle, color: 'var(--c-cyan)' }}
            title="Controls Guide [F1]"
          >
            <span>?</span> CONTROLS [F1]
          </button>
        )}
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            style={{ ...quickButtonStyle, color: 'var(--c-text-muted)' }}
            title="Settings [Esc]"
          >
            <span>⚙</span> SETTINGS [ESC]
          </button>
        )}
      </div>
    </div>
  );
};
