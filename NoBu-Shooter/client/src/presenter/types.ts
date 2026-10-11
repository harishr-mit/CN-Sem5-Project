/**
 * types.ts — Presenter mode data model (PHASES.md P1, docs/PHASE4_PLAN.md §3.1).
 * No React or Phaser here, so scripts and the controller are unit-testable.
 */

import type { PredictionToggle } from '../net/NetClient.js';
import type { SyncSpec } from '@nobu/shared/sync';
import type { MapId } from '@nobu/shared/protocol';
import type { CompareNetwork } from '../compare/types.js';

/** Complete Quick Match state of one step (D2: nothing leaks from the previous step). */
export interface QuickStepState {
  /** Emulator conditions: a named preset, or an ad-hoc one completed from the defaults. */
  network: CompareNetwork;
  /**
   * The network players' route (`udp:9100`, `npm run swarm`; docs/PHASE5_PLAN.md
   * D11). Every step sets it — Baseline except Q13 — so going back restores it.
   */
  swarmNetwork: CompareNetwork;
  toggles: PredictionToggle;
  sync: SyncSpec;
  /** Run once each time the step is entered (not when it is re-applied). */
  nudge?: { dx: number; dy: number };
}

export interface PresenterStep {
  /** Stable id (Q1…, C1…), pinned by tests and DEMO_SCRIPT.md. */
  id: string;
  title: string;
  /** One or two sentences: what to do and what to watch. */
  caption: string;
  /** The numbers to expect (measured earlier; see DEMO_SCRIPT.md). */
  expect: string;
  /** Quick Match script steps. */
  quick?: QuickStepState;
  /** Compare script steps: the id of a Compare preset. */
  compare?: { preset: string };
}

export interface PresenterScript {
  id: 'quick' | 'compare';
  title: string;
  /** Which view the script drives. */
  view: 'game' | 'compare';
  /** Switch the developer Invincible toggle on while presenting (D3). */
  invincible: boolean;
  /** Stop the match clock while presenting (owner, 2026-10-11): a 2-minute match would end mid-talk. */
  endless: boolean;
  steps: PresenterStep[];
}

/** What the controller drives. The views implement it (QuickMatch: NetClient + EmulatorClient; Compare: its preset). */
export interface PresenterStage {
  applyNetwork(network: CompareNetwork): void;
  /** Conditions of the network players' route only (the browser's route is applyNetwork). */
  applySwarmNetwork(network: CompareNetwork): void;
  setToggles(toggles: PredictionToggle): void;
  setSync(sync: SyncSpec): void;
  setInvincible(on: boolean): void;
  nudge(dx: number, dy: number): void;
  setComparePreset(id: string): void;
  /** Stop / restart the room's match clock. */
  setEndless(on: boolean): void;
  /** Reset the game to its starting case, optionally on another map. */
  restartGame(map?: MapId): void;
}
