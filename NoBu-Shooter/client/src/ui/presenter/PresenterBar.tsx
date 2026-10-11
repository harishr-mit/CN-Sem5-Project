/**
 * PresenterBar — the caption strip of Presenter mode (PHASES.md P1,
 * docs/PHASE4_PLAN.md D5): step counter, title, what to watch, the expected
 * numbers and a step timer, plus the game controls a talk needs (owner,
 * 2026-10-11): RESTART (game back to its starting case, step 1) and map
 * switching (restarts the game on that map). It sits in the layout flow
 * (below the arena or the Compare grid), so it never covers what it
 * describes; `H` hides it.
 */

import React, { useEffect, useState } from 'react';
import GAME, { mapDef, type MapId } from '@nobu/shared/config/game';
import type { PresenterController } from '../../presenter/controller.js';
import { DASHBOARD_URL, SWARM_ROUTE } from '../../net/EmulatorClient.js';
import { useGameStore } from '../store.js';

interface PresenterBarProps {
  controller: PresenterController;
  /** Bumped by the owner on every step change, so the bar re-renders. */
  version: number;
  /** One-off note (e.g. the developer switches need `npm run demo`). */
  notice?: string | null;
  /** Map being played (from the latest snapshot), or null before the first one. */
  currentMap: () => MapId | null;
  onEnd: () => void;
}

const MAPS = GAME.maps.rotation as readonly MapId[];

/** Buttons don't take focus: a focused button would be pressed again by Space (dash). */
const noFocus = (e: React.MouseEvent) => e.preventDefault();

function formatTimer(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const PresenterBar: React.FC<PresenterBarProps> = ({ controller, version, notice, currentMap, onEnd }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const step = controller.step;
  const index = controller.index;
  const last = index === controller.count - 1;
  const map = currentMap();
  // Steps about the network players (Q13): dashboard button + whether any are connected
  const swarmStep = !!step.quick && step.quick.swarmNetwork.name !== 'Baseline';
  const emuState = useGameStore((s) => s.emulatorState) as { sessions?: { route?: string }[] } | null;
  const swarmSessions = (emuState?.sessions ?? []).filter((s) => s.route === SWARM_ROUTE).length;

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
        {swarmStep && (
          <div className="presenter-swarm" id="presenter-swarm">
            <button
              id="presenter-dashboard" className="btn-ghost" onMouseDown={noFocus}
              onClick={() => window.open(DASHBOARD_URL, '_blank', 'noopener')}
              title="The emulator dashboard in a new tab"
            >
              OPEN DASHBOARD ↗
            </button>
            <span className={swarmSessions ? 'presenter-swarm-ok' : 'presenter-swarm-missing'}>
              {swarmSessions
                ? `${swarmSessions} network player session(s) on ${SWARM_ROUTE}`
                : 'No network players connected — start them with: npm run demo -- --swarm 3 (or npm run swarm)'}
            </span>
          </div>
        )}
      </div>
      <div className="presenter-game" id="presenter-maps">
        <div className="presenter-game-title" title="Switching the map restarts the game; the talk stays on this step">MAP · restarts the game</div>
        <div className="presenter-map-grid">
          {MAPS.map((id) => (
            <button
              key={id}
              id={`presenter-map-${id}`}
              className={`presenter-map ${map === id ? 'active' : ''}`}
              onMouseDown={noFocus}
              onClick={() => controller.switchMap(id)}
              title={`Restart the game on ${mapDef(id).name}`}
            >
              {mapDef(id).name}
            </button>
          ))}
        </div>
      </div>
      <div className="presenter-actions">
        <div className="presenter-nav">
          <button className="btn-ghost" onMouseDown={noFocus} disabled={index === 0} onClick={() => controller.prev()} title="Previous step [B]">◄ B</button>
          <button className="btn-ghost" onMouseDown={noFocus} disabled={last} onClick={() => controller.next()} title="Next step [N]">N ►</button>
        </div>
        <div className="presenter-nav">
          <button
            id="presenter-restart" className="btn-ghost presenter-restart" onMouseDown={noFocus}
            onClick={() => controller.restart()} title="Restart the game and go back to step 1"
          >
            ⟲ RESTART
          </button>
          <button id="presenter-end" className="btn-ghost presenter-end" onMouseDown={noFocus} onClick={onEnd} title="Leave Presenter mode">END</button>
        </div>
        <div className="presenter-hint">H hide · {last ? 'last step' : 'N next'}</div>
      </div>
    </div>
  );
};
