/**
 * controller.ts — steps through a Presenter script (docs/PHASE4_PLAN.md §3.1).
 *
 * Every step is a complete state (D2): entering a step applies its network,
 * all toggles and the sync model (Quick Match) or its Compare preset, so
 * `next` / `prev` in any order always show the same thing. Manual changes made
 * during a step last until the next `next` / `prev`.
 */

import type { MapId } from '@nobu/shared/protocol';
import type { PresenterScript, PresenterStage, PresenterStep } from './types.js';

export class PresenterController {
  private i = 0;
  private enteredAtMs = 0;
  private started = false;
  /** Called after every step change (UI re-render). */
  onChange?: (index: number, step: PresenterStep) => void;

  constructor(
    readonly script: PresenterScript,
    private readonly stage: PresenterStage,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get index(): number { return this.i; }
  get count(): number { return this.script.steps.length; }
  get step(): PresenterStep { return this.script.steps[this.i]; }
  /** When the current step was entered (for the step timer). */
  get enteredAt(): number { return this.enteredAtMs; }

  /** Begin at step 1 (Invincible on and the match clock stopped for scripts that want it). */
  start(): void {
    this.started = true;
    if (this.script.invincible) this.stage.setInvincible(true);
    if (this.script.endless) this.stage.setEndless(true);
    this.enter(0);
  }

  /** Leave Presenter mode; Invincible goes back off and the match clock runs again. */
  stop(): void {
    if (!this.started) return;
    this.started = false;
    if (this.script.invincible) this.stage.setInvincible(false);
    if (this.script.endless) this.stage.setEndless(false);
  }

  /** RESTART: the game back to its starting case and the talk back to step 1. */
  restart(): void {
    this.stage.restartGame();
    this.enter(0);
  }

  /**
   * Switch the map. The game restarts on it (fresh scores and positions); the
   * talk stays on the current step, whose state is applied again and whose
   * timer restarts — effects have to build up again. One-off actions don't run.
   */
  switchMap(map: MapId): void {
    this.stage.restartGame(map);
    this.applyState(this.step);
    this.enteredAtMs = this.now();
    this.onChange?.(this.i, this.step);
  }

  next(): boolean {
    if (this.i >= this.count - 1) return false;
    this.enter(this.i + 1);
    return true;
  }

  prev(): boolean {
    if (this.i <= 0) return false;
    this.enter(this.i - 1);
    return true;
  }

  goTo(index: number): boolean {
    if (!Number.isInteger(index) || index < 0 || index >= this.count) return false;
    this.enter(index);
    return true;
  }

  /**
   * Apply the current step's state again without its one-off actions — e.g.
   * once the emulator control socket connects, since commands sent before
   * that are lost. The step timer keeps running.
   */
  reapply(): void {
    this.applyState(this.step);
  }

  private enter(index: number): void {
    this.i = index;
    this.enteredAtMs = this.now();
    const step = this.step;
    this.applyState(step);
    if (step.quick?.nudge) this.stage.nudge(step.quick.nudge.dx, step.quick.nudge.dy);
    this.onChange?.(this.i, step);
  }

  private applyState(step: PresenterStep): void {
    if (step.quick) {
      this.stage.applyNetwork(step.quick.network);
      this.stage.setToggles({ ...step.quick.toggles });
      this.stage.setSync({ ...step.quick.sync });
    }
    if (step.compare) this.stage.setComparePreset(step.compare.preset);
  }
}
