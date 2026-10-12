/**
 * TouchControls.tsx — the on-screen controls of the touch UI (owner revision
 * of Phase 7, R5–R8; only when isTouchUi()):
 * - a movement joystick in the bottom-left corner (Settings → Joystick size);
 *   aiming and shooting stay as they were: touch the arena;
 * - a DASH button just above the joystick, only while the Dash power-up is
 *   on — it pops in when the power-up is picked up;
 * - on the right: RELOAD and MENU (the menu holds everything non-critical:
 *   settings, mute, leave, and the demo's tools).
 * In landscape these float over the arena; in portrait they sit in the
 * control pad under it (CSS, `.touch-pad`).
 */

import React, { useEffect, useRef, useState } from 'react';
import type { NetClient } from '../net/NetClient.js';
import { joystickKeys, setVirtualKeys } from '../game/input.js';
import { loadSettings, onSettingsChange } from './settings.js';
import { JOYSTICK_PX } from './touch.js';

/** The movement stick: pointer events on its own element, so the arena's touches (aim / fire) are separate. */
const Joystick: React.FC<{ size: number }> = ({ size }) => {
  const base = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState({ x: 0, y: 0, active: false });
  const pointer = useRef<number | null>(null);

  useEffect(() => () => setVirtualKeys(0), []);

  const update = (e: React.PointerEvent) => {
    const el = base.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const radius = r.width / 2;
    let dx = (e.clientX - (r.left + radius)) / radius;
    let dy = (e.clientY - (r.top + radius)) / radius;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    setThumb({ x: dx, y: dy, active: true });
    setVirtualKeys(joystickKeys(dx, dy));
  };
  const release = (e: React.PointerEvent) => {
    if (pointer.current !== e.pointerId) return;
    pointer.current = null;
    setThumb({ x: 0, y: 0, active: false });
    setVirtualKeys(0);
  };

  const thumbPx = size * 0.42;
  return (
    <div
      ref={base}
      className={`touch-joystick ${thumb.active ? 'active' : ''}`}
      id="touch-joystick"
      style={{ width: size, height: size }}
      onPointerDown={(e) => {
        if (pointer.current !== null) return;
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => { if (pointer.current === e.pointerId) update(e); }}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <div
        className="touch-joystick-thumb"
        style={{
          width: thumbPx, height: thumbPx,
          transform: `translate(${thumb.x * (size - thumbPx) / 2}px, ${thumb.y * (size - thumbPx) / 2}px)`,
        }}
      />
    </div>
  );
};

/** DASH: shown only while the Dash power-up is on; a pop-in animation when it appears. */
const DashButton: React.FC<{ net: NetClient; size: number }> = ({ net, size }) => {
  const [state, setState] = useState({ on: false, ready: false });
  const [pop, setPop] = useState(0);
  useEffect(() => {
    let was = false;
    const id = setInterval(() => {
      const cv = net.combatView;
      const on = cv.dashMsLeft > 0;
      if (on && !was) setPop((n) => n + 1); // picked up: replay the reveal
      was = on;
      setState({ on, ready: cv.dashReady });
    }, 100);
    return () => clearInterval(id);
  }, [net]);
  if (!state.on) return null;
  const d = Math.round(size * 0.55);
  return (
    <button
      key={pop}
      className={`touch-btn touch-dash ${state.ready ? 'ready' : 'cooling'}`}
      id="touch-dash"
      style={{ width: d, height: d, bottom: size + 18, left: (size - d) / 2 + 16 }}
      onPointerDown={(e) => { e.preventDefault(); net.requestDash(); }}
    >
      DASH
    </button>
  );
};

export const TouchControls: React.FC<{ net: NetClient; onMenu: () => void }> = ({ net, onMenu }) => {
  const [size, setSize] = useState(() => JOYSTICK_PX[loadSettings().joystickSize]);
  useEffect(() => onSettingsChange((s) => setSize(JOYSTICK_PX[s.joystickSize])), []);

  return (
    <div className="touch-pad" id="touch-pad">
      <div className="touch-left">
        <DashButton net={net} size={size} />
        <Joystick size={size} />
      </div>
      <div className="touch-right">
        <button className="touch-btn touch-menu" id="touch-menu" onClick={onMenu} aria-label="Menu">☰ MENU</button>
        <button
          className="touch-btn touch-reload"
          id="touch-reload"
          onPointerDown={(e) => { e.preventDefault(); net.requestReload(); }}
        >
          RELOAD
        </button>
      </div>
    </div>
  );
};

export interface TouchMenuItem {
  id: string;
  label: string;
  onClick: () => void;
}

/** The touch UI's menu: the keyboard-only actions as buttons (plus the edition's own, e.g. the demo's Lab). */
export const TouchMenu: React.FC<{ items: TouchMenuItem[]; onClose: () => void }> = ({ items, onClose }) => (
  <div className="touch-menu-overlay" id="touch-menu-sheet" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="touch-menu-sheet">
      <div className="touch-menu-title font-display">MENU</div>
      {items.map((it) => (
        <button key={it.id} id={`touch-menu-${it.id}`} className="touch-menu-item" onClick={() => { onClose(); it.onClick(); }}>
          {it.label}
        </button>
      ))}
      <button className="touch-menu-item resume" id="touch-menu-resume" onClick={onClose}>RESUME</button>
    </div>
  </div>
);
