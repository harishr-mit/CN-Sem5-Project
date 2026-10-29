/**
 * TouchControls.tsx — the on-screen controls of the touch UI (owner revision
 * of Phase 7, R5–R8 and the second touch revision; only when isTouchUi()):
 * - two floating sticks (popular mobile-shooter layout): the left half of the
 *   screen is MOVE, the right half is AIM. A stick appears wherever the finger
 *   lands and vanishes on release; the aim stick aims over 360° and auto-fires
 *   while held past its dead zone. Settings → Joystick size sets both;
 * - on the right edge: DASH (only while the Dash power-up is on, it pops in
 *   when picked up), RELOAD and MENU (settings, mute, leave, the demo's tools).
 * Landscape floats over the arena; portrait uses the control pad under it,
 * styled like a handheld (CSS, `.touch-pad`).
 */

import React, { useEffect, useRef, useState } from 'react';
import type { NetClient } from '../net/NetClient.js';
import { aimStick, joystickKeys, setVirtualKeys } from '../game/input.js';
import { loadSettings, onSettingsChange } from './settings.js';
import { JOYSTICK_PX } from './touch.js';

/**
 * One floating stick on its half of the screen. Pointer events on its own
 * zone, with pointer capture, so the two sticks work with two fingers at once.
 * `onStick` gets the thumb offset as a fraction of the radius (y down).
 */
const FloatingStick: React.FC<{
  kind: 'move' | 'aim';
  size: number;
  onStick: (dx: number, dy: number) => void;
  onEnd: () => void;
}> = ({ kind, size, onStick, onEnd }) => {
  const zone = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  const [st, setSt] = useState({ ox: 0, oy: 0, x: 0, y: 0, active: false });
  const origin = useRef({ x: 0, y: 0 });

  useEffect(() => onEnd, []); // eslint-disable-line react-hooks/exhaustive-deps

  const move = (e: React.PointerEvent) => {
    const radius = size / 2;
    let dx = (e.clientX - origin.current.x) / radius;
    let dy = (e.clientY - origin.current.y) / radius;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    setSt((s) => ({ ...s, x: dx, y: dy }));
    onStick(dx, dy);
  };
  const release = (e: React.PointerEvent) => {
    if (pointer.current !== e.pointerId) return;
    pointer.current = null;
    setSt((s) => ({ ...s, x: 0, y: 0, active: false }));
    onEnd();
  };

  const thumbPx = size * 0.42;
  return (
    <div
      ref={zone}
      className={`touch-zone touch-zone-${kind}`}
      id={`touch-zone-${kind}`}
      onPointerDown={(e) => {
        if (pointer.current !== null) return;
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        const r = e.currentTarget.getBoundingClientRect();
        origin.current = { x: e.clientX, y: e.clientY };
        setSt({ ox: e.clientX - r.left, oy: e.clientY - r.top, x: 0, y: 0, active: true });
      }}
      onPointerMove={(e) => { if (pointer.current === e.pointerId) move(e); }}
      onPointerUp={release}
      onPointerCancel={release}
    >
      {!st.active && <div className="touch-zone-hint">{kind === 'move' ? 'MOVE' : 'AIM · FIRE'}</div>}
      {st.active && (
        <div
          className={`touch-joystick touch-joystick-${kind} active`}
          id={`touch-joystick-${kind}`}
          style={{ width: size, height: size, left: st.ox - size / 2, top: st.oy - size / 2 }}
        >
          <div
            className="touch-joystick-thumb"
            style={{
              width: thumbPx, height: thumbPx,
              transform: `translate(${st.x * (size - thumbPx) / 2}px, ${st.y * (size - thumbPx) / 2}px)`,
            }}
          />
        </div>
      )}
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
      style={{ width: d, height: d }}
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
      <FloatingStick
        kind="move"
        size={size}
        onStick={(dx, dy) => setVirtualKeys(joystickKeys(dx, dy))}
        onEnd={() => setVirtualKeys(0)}
      />
      <FloatingStick
        kind="aim"
        size={size}
        onStick={(dx, dy) => {
          const a = aimStick(dx, dy);
          if (a.fire) net.aimAngle = a.angle;
          net.fireDown = a.fire;
        }}
        onEnd={() => { net.fireDown = false; }}
      />
      <div className="touch-right">
        <DashButton net={net} size={size} />
        <button
          className="touch-btn touch-reload"
          id="touch-reload"
          onPointerDown={(e) => { e.preventDefault(); net.requestReload(); }}
        >
          RELOAD
        </button>
        <button className="touch-btn touch-menu" id="touch-menu" onClick={onMenu} aria-label="Menu">☰ MENU</button>
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
