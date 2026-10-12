/**
 * RoomLobby.tsx — a private room's waiting page (docs/PHASE7_PLAN.md D9,
 * owner revision R2–R4): the code and share link, everyone who joined, the
 * match options (the host edits them, everyone else sees them), START for
 * the host and LEAVE for everyone. The panel is translucent and can be
 * hidden, because the arena behind it shows what the options do: the map,
 * the bots, where power-ups can appear and the always-on effects.
 */

import React, { useState } from 'react';
import type { MsgSnap } from '@nobu/shared/protocol';
import { formatCode } from '@nobu/shared/rooms/codes.js';
import {
  MAP_CHOICES, WEAPON_CHOICES, POWERUP_INTERVALS_S, MAX_PLAYERS_RANGE, POWERUP_MAX_RANGE, ALWAYS_ON_TOGGLES,
  defaultRoomOptions, canStartWith, type RoomOptions, type MapChoice, type WeaponChoice,
} from '@nobu/shared/rooms/options.js';
import { mapDef } from '@nobu/shared/config/game';
import type { NetClient } from '../net/NetClient.js';
import { roomLink } from '../net/serverUrl.js';
import { playerColor, cssColor } from '../game/playerColors.js';

const WEAPON_LABEL: Record<WeaponChoice, string> = { none: 'NONE', rapid_fire: 'RAPID FIRE', spread_shot: 'SPREAD SHOT' };
const TOGGLE_LABEL: Record<(typeof ALWAYS_ON_TOGGLES)[number], string> = {
  shield: 'SHIELD (every life)', speed: 'SPEED', piercing: 'PIERCING', dash: 'DASH',
};
const mapLabel = (m: MapChoice) => (m === 'rotation' ? 'ROTATION' : mapDef(m).name.toUpperCase());

/** A row of choice buttons. */
function Pick<T extends string | number>({ id, options, value, label, onPick, disabled }: {
  id: string; options: readonly T[]; value: T; label: (v: T) => string; onPick: (v: T) => void; disabled: boolean;
}): React.ReactElement {
  return (
    <div className="lobby-pick" id={id}>
      {options.map((v) => (
        <button key={String(v)} className={v === value ? 'on' : ''} disabled={disabled && v !== value} onClick={() => onPick(v)}>
          {label(v)}
        </button>
      ))}
    </div>
  );
}

function Stepper({ id, value, min, max, onChange, disabled }: {
  id: string; value: number; min: number; max: number; onChange: (v: number) => void; disabled: boolean;
}): React.ReactElement {
  return (
    <div className="lobby-stepper" id={id}>
      <button disabled={disabled || value <= min} onClick={() => onChange(value - 1)} aria-label="less">−</button>
      <span>{value}</span>
      <button disabled={disabled || value >= max} onClick={() => onChange(value + 1)} aria-label="more">+</button>
    </div>
  );
}

function Toggle({ id, on, label, onChange, disabled }: {
  id: string; on: boolean; label: string; onChange: (v: boolean) => void; disabled: boolean;
}): React.ReactElement {
  return (
    <button id={id} className={`lobby-toggle ${on ? 'on' : ''}`} disabled={disabled} onClick={() => onChange(!on)} aria-pressed={on}>
      <span className="dot" />{label}
    </button>
  );
}

export const RoomLobby: React.FC<{ snap: MsgSnap; myId: number | null; net?: NetClient; onLeave?: () => void }> = ({ snap, myId, net, onLeave }) => {
  const [copied, setCopied] = useState(false);
  const [hidden, setHidden] = useState(false);
  const code = snap.match.code!;
  const o = snap.match.options ?? defaultRoomOptions();
  const isHost = myId !== null && snap.match.hostId === myId;
  const humans = snap.players.filter((p) => !p.bot && !p.mover);
  const bots = snap.players.filter((p) => p.bot && !p.mover);
  const hostName = snap.players.find((p) => p.id === snap.match.hostId)?.name ?? 'the host';
  const link = typeof window !== 'undefined' ? roomLink(window.location, code) : '';
  const canStart = canStartWith(humans.length, o);
  const set = (patch: Partial<RoomOptions>) => net?.setRoomOptions({ ...o, ...patch });
  const setAlways = (patch: Partial<RoomOptions['alwaysOn']>) => set({ alwaysOn: { ...o.alwaysOn, ...patch } });
  const ro = !isHost;

  const copy = () => {
    void navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => {});
  };

  if (hidden) {
    return (
      <div className="lobby-peek" id="hud-room-lobby">
        <button className="btn-ghost" id="lobby-show" onClick={() => setHidden(false)}>ROOM {formatCode(code)} · SHOW</button>
      </div>
    );
  }

  return (
    <div className="lobby" id="hud-room-lobby">
      <div className="lobby-head">
        <div>
          <div className="lobby-kicker">PRIVATE ROOM</div>
          <div className="lobby-code text-glow-cyan" id="hud-room-code">{formatCode(code)}</div>
        </div>
        <button className="btn-ghost lobby-hide" id="lobby-hide" onClick={() => setHidden(true)} title="See the map behind">HIDE</button>
      </div>
      <div className="lobby-link">
        Friends join with the code, or the link: <span className="font-mono">{link}</span>{' '}
        <button className="btn-ghost lobby-copy" onClick={copy}>{copied ? 'COPIED' : 'COPY'}</button>
      </div>

      <div className="lobby-section">
        <div className="lobby-label" id="hud-room-players">PLAYERS {humans.length + bots.length} / {o.maxPlayers}</div>
        <div className="lobby-players">
          {humans.map((p) => (
            <span key={p.id} className="lobby-player" style={{ borderColor: cssColor(playerColor(p.id, myId)), color: cssColor(playerColor(p.id, myId)) }}>
              {p.id === snap.match.hostId ? '★ ' : ''}{p.name}{p.id === myId ? ' (you)' : ''}
            </span>
          ))}
          {bots.map((p) => <span key={p.id} className="lobby-player bot">BOT {p.name}</span>)}
          {Array.from({ length: Math.max(0, o.maxPlayers - humans.length - bots.length) }, (_, i) => (
            <span key={`free${i}`} className="lobby-player free">open slot</span>
          ))}
        </div>
      </div>

      <div className="lobby-section">
        <div className="lobby-label">MATCH OPTIONS {ro && <span className="lobby-ro">— set by {hostName}</span>}</div>
        <div className="lobby-grid">
          <span>Map</span>
          <Pick id="lobby-map" options={MAP_CHOICES} value={o.map} label={mapLabel} disabled={ro} onPick={(map) => set({ map })} />
          <span>Max players</span>
          <Stepper id="lobby-max" value={o.maxPlayers} min={MAX_PLAYERS_RANGE.min} max={MAX_PLAYERS_RANGE.max} disabled={ro} onChange={(maxPlayers) => set({ maxPlayers })} />
          <span>Bots</span>
          <Toggle id="lobby-bots" on={o.bots} label="FILL EMPTY SLOTS" disabled={ro} onChange={(bots) => set({ bots })} />
          <span>Power-up every</span>
          <Pick id="lobby-powerup-every" options={POWERUP_INTERVALS_S} value={o.powerupEveryS} label={(s) => (s === 0 ? 'OFF' : `${s} s`)} disabled={ro} onPick={(powerupEveryS) => set({ powerupEveryS })} />
          <span>Most on the map</span>
          <Stepper id="lobby-powerup-max" value={o.powerupMax} min={POWERUP_MAX_RANGE.min} max={POWERUP_MAX_RANGE.max} disabled={ro || o.powerupEveryS === 0} onChange={(powerupMax) => set({ powerupMax })} />
          <span>Always on: weapon</span>
          <Pick id="lobby-always-weapon" options={WEAPON_CHOICES} value={o.alwaysOn.weapon} label={(w) => WEAPON_LABEL[w]} disabled={ro} onPick={(weapon) => setAlways({ weapon })} />
          <span>Always on</span>
          <div className="lobby-toggles">
            {ALWAYS_ON_TOGGLES.map((k) => (
              <Toggle key={k} id={`lobby-always-${k}`} on={o.alwaysOn[k]} label={TOGGLE_LABEL[k]} disabled={ro} onChange={(v) => setAlways({ [k]: v })} />
            ))}
          </div>
        </div>
        <div className="lobby-note">Always-on power-ups last the whole match and don't spawn as pickups (an always-on weapon stops both weapon pickups).</div>
      </div>

      <div className="lobby-actions">
        {isHost ? (
          <button id="hud-room-start" className="btn-primary" disabled={!canStart} onClick={() => net?.start()}
            title={canStart ? undefined : 'Needs at least 2 players: wait for a friend, or turn on bots'}>
            START MATCH
          </button>
        ) : (
          <div className="lobby-wait">Waiting for {hostName} to start</div>
        )}
        {onLeave && <button id="hud-room-leave" className="btn-ghost lobby-leave" onClick={onLeave}>◄ LEAVE</button>}
      </div>
      {isHost && !canStart && <div className="lobby-note" id="lobby-start-hint">Needs at least 2 players: wait for a friend, or turn on bots.</div>}
    </div>
  );
};
