import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from './store.js';
import { mapDef } from '@nobu/shared/config/game';
import type { NetClient, CombatView } from '../net/NetClient.js';
import { soundPrefs } from '../game/audio.js';
import { playerColor, cssColor } from '../game/playerColors.js';
import { formatCode } from '@nobu/shared/rooms/codes.js';
import { roomLink } from '../net/serverUrl.js';
import type { MsgSnap } from '@nobu/shared/protocol';

const WEAPON_LABEL: Record<string, string> = { handgun: 'HANDGUN', rifle: 'RIFLE', shotgun: 'SHOTGUN' };

/**
 * Weapon panel (GAMERULES.md §6–§6b): predicted ammo, reload bar, power-up
 * timers. Polls the NetClient at 10 Hz; flashes amber when the server
 * corrects the predicted ammo (a lost shot or reload).
 */
const WeaponPanel: React.FC<{ net: NetClient }> = ({ net }) => {
  const [cv, setCv] = useState<CombatView>(() => net.combatView);
  const [muted, setMuted] = useState(soundPrefs.muted);
  const [flash, setFlash] = useState(false);
  const lastCorrections = useRef(cv.corrections);
  useEffect(() => {
    const id = setInterval(() => {
      const next = net.combatView;
      if (next.corrections !== lastCorrections.current) {
        lastCorrections.current = next.corrections;
        setFlash(true);
        setTimeout(() => setFlash(false), 600);
      }
      setCv(next);
      setMuted(soundPrefs.muted);
    }, 100);
    return () => clearInterval(id);
  }, [net]);

  const chips: { label: string; color: string }[] = [];
  if (cv.weaponMsLeft > 0) chips.push({ label: `${WEAPON_LABEL[cv.weapon]} ${(cv.weaponMsLeft / 1000).toFixed(1)}s`, color: 'var(--c-amber)' });
  if (cv.speedMsLeft > 0) chips.push({ label: `SPEED ${(cv.speedMsLeft / 1000).toFixed(1)}s`, color: '#ffd400' });
  if (cv.pierceMsLeft > 0) chips.push({ label: `PIERCING ${(cv.pierceMsLeft / 1000).toFixed(1)}s`, color: '#b388ff' });
  if (cv.dashMsLeft > 0) chips.push({ label: `DASH ${cv.dashReady ? '[SPACE]' : '…'} ${(cv.dashMsLeft / 1000).toFixed(1)}s`, color: '#2fd6ff' });
  if (cv.shield) chips.push({ label: 'SHIELD', color: 'var(--c-green)' });
  if (cv.invincible) chips.push({ label: 'DEV: INVINCIBLE', color: 'var(--c-red)' });

  return (
    <div className="hud-weapon" id="hud-weapon">
      {chips.length > 0 && (
        <div className="hud-weapon-chips">
          {chips.map((c) => (
            <span key={c.label} className="hud-chip" style={{ color: c.color, borderColor: c.color }}>{c.label}</span>
          ))}
        </div>
      )}
      <div className="hud-weapon-name">{WEAPON_LABEL[cv.weapon] ?? cv.weapon}{muted ? '  ·  MUTED [M]' : ''}</div>
      <div className={`hud-ammo ${flash ? 'hud-ammo-corrected' : ''} ${cv.ammo === 0 ? 'hud-ammo-empty' : ''}`} id="hud-ammo"
        title="Predicted ammo; flashes amber when the server corrects it">
        {cv.ammo}<span className="hud-ammo-mag">/{cv.magazine}</span>
        <span className="hud-ammo-reserve" title="Spare rounds (the pistol reloads forever)">{cv.reserve === null ? '∞' : `+${cv.reserve}`}</span>
      </div>
      <div className="hud-reload">
        {cv.reload !== null
          ? <><div className="hud-reload-bar" style={{ width: `${Math.round(cv.reload * 100)}%` }} /><span>RELOADING</span></>
          : <span className="hud-reload-hint">{cv.ammo < cv.magazine && cv.reserve !== 0 ? '[R] RELOAD' : cv.reserve === 0 ? 'LAST MAGAZINE' : ''}</span>}
      </div>
    </div>
  );
};

/** Ping (docs/PHASE7_PLAN.md D14): round-trip time, green < 60, amber < 150, red ≥ 150 ms. */
const PingChip: React.FC<{ net: NetClient }> = ({ net }) => {
  const [rtt, setRtt] = useState(net.metrics.rttMs);
  useEffect(() => {
    const t = setInterval(() => setRtt(net.metrics.rttMs), 1000);
    return () => clearInterval(t);
  }, [net]);
  const color = rtt <= 0 ? 'var(--c-text-muted)' : rtt < 60 ? 'var(--c-green)' : rtt < 150 ? 'var(--c-amber)' : 'var(--c-red)';
  return (
    <div id="hud-ping" style={{ ...quickButtonStyle, cursor: 'default', color }} title="Round-trip time to the server">
      PING {rtt > 0 ? `${rtt} ms` : '–'}
    </div>
  );
};

/**
 * WAITING (GAMERULES.md §2): `main` counts down its join window; a private
 * room shows its code and link, and its host gets START (docs/PHASE7_PLAN.md D9, D10).
 */
const WaitingOverlay: React.FC<{ snap: MsgSnap | null; myId: number | null; net?: NetClient }> = ({ snap, myId, net }) => {
  const [copied, setCopied] = useState(false);
  const humans = snap ? snap.players.filter((p) => !p.bot) : [];
  const code = snap?.match.code;
  if (!code) {
    const wait = snap?.match.waitMsLeft;
    return (
      <div className="overlay" id="hud-waiting">
        <div className="overlay-text text-glow-cyan">WAITING FOR PLAYERS</div>
        <div className="overlay-sub">
          {wait !== undefined
            ? <>Match starts in <b id="hud-wait-seconds" style={{ color: 'var(--c-cyan)' }}>{Math.max(0, Math.ceil(wait / 1000))} s</b> · {humans.length} player{humans.length === 1 ? '' : 's'} connected<br />Bots fill the empty slots</>
            : 'Bots and competitors stand by...'}
        </div>
      </div>
    );
  }
  const isHost = myId !== null && snap?.match.hostId === myId;
  const hostName = snap?.players.find((p) => p.id === snap.match.hostId)?.name ?? 'the host';
  const link = typeof window !== 'undefined' ? roomLink(window.location, code) : '';
  const copy = () => {
    void navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => {});
  };
  return (
    <div className="overlay" id="hud-room-lobby" style={{ pointerEvents: 'auto', background: 'rgba(5, 5, 15, 0.55)' }}>
      <div className="overlay-sub" style={{ letterSpacing: '0.2em' }}>PRIVATE ROOM</div>
      <div className="overlay-text text-glow-cyan" id="hud-room-code">{formatCode(code)}</div>
      <div className="overlay-sub" style={{ fontSize: '0.95rem' }}>
        Friends join with this code, or the link:{' '}
        <span className="font-mono" style={{ color: 'var(--c-cyan)' }}>{link}</span>{' '}
        <button className="btn-ghost" style={{ fontSize: '0.7rem', padding: '2px 8px' }} onClick={copy}>{copied ? 'COPIED' : 'COPY'}</button>
      </div>
      <div className="overlay-sub" style={{ fontSize: '1rem' }} id="hud-room-players">
        {humans.length} in the room: {humans.map((p) => p.name + (p.id === snap?.match.hostId ? ' (host)' : '')).join(', ')}
      </div>
      {isHost
        ? <button id="hud-room-start" className="btn-primary" style={{ minWidth: '240px' }} onClick={() => net?.start()}>START MATCH</button>
        : <div className="overlay-sub">Waiting for {hostName} to start · bots fill the empty slots</div>}
    </div>
  );
};

/** What a connection error means, for the player (the room code errors from the server, D9). */
function errorText(net: NetClient | undefined): string | null {
  const e = net?.serverError;
  if (!e) return null;
  switch (e.code) {
    case 'ROOM_NOT_FOUND': return `${e.msg}. Check the code, or create a new room.`;
    case 'ROOM_FULL': return 'That room is full (8 players).';
    case 'ROOM_LIMIT': return 'This server has too many rooms open right now. Try again later.';
    default: return e.msg || e.code;
  }
}

interface HudProps {
  /** The match client, for the predicted weapon state. */
  netClient?: NetClient;
  /**
   * What to tell the player when the server can't be reached: the demo names
   * `npm run demo`; the game asks the host to check the server.
   */
  offlineHint?: React.ReactNode;
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

const DEMO_OFFLINE_HINT = (
  <>
    Please ensure both the backend server and network emulator are running:
    <div style={{ marginTop: '6px', color: 'var(--c-cyan)', background: 'rgba(0,0,0,0.4)', padding: '6px 10px', borderRadius: '4px' }}>
      npm run demo
    </div>
  </>
);

export const Hud: React.FC<HudProps> = ({ netClient, onOpenSettings, onOpenControls, onLeave, offlineHint = DEMO_OFFLINE_HINT }) => {
  const snap = useGameStore((s) => s.snap);
  const myPlayerId = useGameStore((s) => s.playerId);
  const killFeed = useGameStore((s) => s.killFeed);
  const connStatus = useGameStore((s) => s.connectionStatus);

  const myPlayer = snap?.players.find((p) => p.id === myPlayerId);
  const matchState = snap?.match.state ?? 'WAITING';
  const timeLeftMs = snap?.match.timeLeftMs ?? 0;
  const mapName = snap ? mapDef(snap.match.map).name : '';

  // Format time MM:SS
  const totalSeconds = Math.max(0, Math.ceil(timeLeftMs / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  // Presenter mode stops the match clock (match.endless): show ∞ instead of a frozen time
  const endless = !!snap?.match.endless && matchState === 'RUNNING';
  const timeStr = endless ? '∞' : `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  const isTimeCritical = !endless && matchState === 'RUNNING' && totalSeconds <= 10 && totalSeconds > 0;

  // Sorted scoreboard (top 5)
  const sortedPlayers = snap
    ? [...snap.players].sort((a, b) => b.score - a.score).slice(0, 5)
    : [];

  return (
    <div className="hud">
      {/* Timer */}
      {matchState !== 'WAITING' && (
        <div
          className={`hud-timer ${isTimeCritical ? 'timer-danger' : ''}`} id="hud-timer"
          title={endless ? 'Match clock stopped (Presenter mode)' : undefined}
        >
          {/* The display font has no ∞, the fallback glyph is small: scale it up */}
          {endless ? <span className="hud-timer-endless">∞</span> : timeStr}
          {mapName && <div className="hud-map" id="hud-map">{mapName.toUpperCase()}</div>}
        </div>
      )}

      {netClient && myPlayer?.alive && matchState === 'RUNNING' && <WeaponPanel net={netClient} />}

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
              <span className="name" style={{ color: cssColor(playerColor(p.id, myPlayerId)) }}>{p.name}</span>
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
      {matchState === 'WAITING' && connStatus === 'connected' && <WaitingOverlay snap={snap} myId={myPlayerId} net={netClient} />}

      {matchState === 'COUNTDOWN' && (
        <div className="overlay">
          <div className="countdown-num">
            {totalSeconds > 0 ? totalSeconds : 'GO!'}
          </div>
          {mapName && <div className="overlay-sub">MAP: {mapName.toUpperCase()}</div>}
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
          SPAWN PROTECTED {(myPlayer.protectMs / 1000).toFixed(1)} s
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
              {connStatus === 'error' && (errorText(netClient) ? 'CANNOT JOIN' : 'COMMUNICATION ERROR')}
            </div>
            {(connStatus === 'timeout' || connStatus === 'error') && (
              <div id="hud-error-text" style={{ fontSize: '0.82rem', color: 'var(--c-text-muted)', lineHeight: '1.5', fontFamily: 'var(--font-mono)' }}>
                {errorText(netClient) ?? offlineHint}
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
        {netClient && connStatus === 'connected' && <PingChip net={netClient} />}
      </div>
    </div>
  );
};
