/**
 * PresenterBar — the caption strip of Presenter mode (PHASES.md P1,
 * docs/PHASE4_PLAN.md D5): step counter, title, what to watch, the expected
 * numbers and a step timer. It sits in the layout flow (below the arena or
 * the Compare grid), so it never covers what it describes; `H` hides it.
 */

import React, { useEffect, useState } from 'react';
import type { PresenterController } from '../../presenter/controller.js';

interface PresenterBarProps {
  controller: PresenterController;
  /** Bumped by the owner on every step change, so the bar re-renders. */
  version: number;
  /** One-off note (e.g. Invincible needs `npm run demo`). */
  notice?: string | null;
  onEnd: () => void;
}

/** Buttons don't take focus: a focused button would be pressed again by Space (dash). */
const noFocus = (e: React.MouseEvent) => e.preventDefault();

function formatTimer(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const PresenterBar: React.FC<PresenterBarProps> = ({ controller, version, notice, onEnd }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const step = controller.step;
  const index = controller.index;
  const last = index === controller.count - 1;

  return (
    <div className="presenter-bar" id="presenter-bar" data-step={step.id} data-version={version}>
      <div className="presenter-count">
        <div className="presenter-kicker">PRESENTER</div>
        <div className="presenter-num">{index + 1}<span> / {controller.count}</span></div>
        <div className="presenter-timer" title="Time in this step">{formatTimer(now - controller.enteredAt)}</div>
      </div>
      <div className="presenter-body">
        <div className="presenter-title">{step.title}</div>
        <div className="presenter-caption">{step.caption}</div>
        <div className="presenter-expect"><span>EXPECT</span> {step.expect}</div>
        {notice && <div className="presenter-notice">{notice}</div>}
      </div>
      <div className="presenter-actions">
        <div className="presenter-nav">
          <button className="btn-ghost" onMouseDown={noFocus} disabled={index === 0} onClick={() => controller.prev()} title="Previous step [B]">◄ B</button>
          <button className="btn-ghost" onMouseDown={noFocus} disabled={last} onClick={() => controller.next()} title="Next step [N]">N ►</button>
        </div>
        <div className="presenter-hint">H hide · {last ? 'last step' : 'N next'}</div>
        <button id="presenter-end" className="btn-ghost presenter-end" onMouseDown={noFocus} onClick={onEnd} title="Leave Presenter mode">END</button>
      </div>
    </div>
  );
};
