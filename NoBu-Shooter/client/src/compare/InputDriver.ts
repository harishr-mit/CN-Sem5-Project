/**
 * InputDriver.ts — one keyboard, one fixed-step loop, every Compare pane
 * (PHASES.md C1, PHASE2_PLAN.md D5).
 *
 * In Quick Match each ArenaScene polls the keys and steps its own NetClient.
 * In Compare that would let panes sample different keys on the same tick, so
 * this driver owns both: on every 60 Hz step it gives all clients the same
 * keys and steps them in the same order, and flushes their inputs together
 * at inputSendHz. Every pane therefore sends an identical input sequence.
 */

import GAME from '@nobu/shared/config/game';
import NET from '@nobu/shared/config/net';
import { KEY } from '@nobu/shared/sim';

export interface DrivenClient {
  keys: number;
  simStep(): void;
  sendInputs(): void;
}

export interface FrameScheduler {
  request(cb: (timeMs: number) => void): number;
  cancel(id: number): void;
}

/** Minimal event source (window in the browser, an EventTarget in tests). */
export interface KeySource {
  addEventListener(type: string, fn: (e: Event) => void): void;
  removeEventListener(type: string, fn: (e: Event) => void): void;
}

const STEP_MS = 1000 / GAME.sim.hz;
const SEND_EVERY = Math.max(1, Math.round(GAME.sim.hz / NET.inputSendHz));
/** After a stall (hidden tab) don't try to catch up more than this. */
const MAX_FRAME_MS = 250;

const KEY_BITS: Record<string, number> = {
  KeyW: KEY.UP, ArrowUp: KEY.UP,
  KeyS: KEY.DOWN, ArrowDown: KEY.DOWN,
  KeyA: KEY.LEFT, ArrowLeft: KEY.LEFT,
  KeyD: KEY.RIGHT, ArrowRight: KEY.RIGHT,
};

const rafScheduler: FrameScheduler = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (id) => cancelAnimationFrame(id),
};

function isTyping(target: EventTarget | null): boolean {
  const el = target as { tagName?: string } | null;
  return el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.tagName === 'SELECT';
}

export class InputDriver {
  /** Current key bitmask (up=1, down=2, left=4, right=8). */
  keys = 0;
  /** Last pointer position in arena coordinates, shared by every pane. */
  pointerX: number | null = null;
  pointerY: number | null = null;

  private clients: DrivenClient[] = [];
  private pressed = new Set<string>();
  private frameId: number | null = null;
  private lastTime: number | null = null;
  private accumMs = 0;
  private steps = 0;

  constructor(
    private readonly scheduler: FrameScheduler = rafScheduler,
    private readonly source: KeySource = window,
  ) {}

  setClients(clients: DrivenClient[]): void {
    this.clients = [...clients];
  }

  setPointer(x: number, y: number): void {
    this.pointerX = x;
    this.pointerY = y;
  }

  start(): void {
    if (this.frameId !== null) return;
    this.source.addEventListener('keydown', this.onKeyDown);
    this.source.addEventListener('keyup', this.onKeyUp);
    this.source.addEventListener('blur', this.onBlur);
    this.lastTime = null;
    this.frameId = this.scheduler.request(this.onFrame);
  }

  stop(): void {
    if (this.frameId !== null) this.scheduler.cancel(this.frameId);
    this.frameId = null;
    this.source.removeEventListener('keydown', this.onKeyDown);
    this.source.removeEventListener('keyup', this.onKeyUp);
    this.source.removeEventListener('blur', this.onBlur);
    this.onBlur();
  }

  /** One fixed simulation step for every client (public for tests). */
  step(): void {
    for (const c of this.clients) {
      c.keys = this.keys;
      c.simStep();
    }
    this.steps++;
    if (this.steps % SEND_EVERY === 0) for (const c of this.clients) c.sendInputs();
  }

  private onFrame = (time: number): void => {
    if (this.lastTime !== null) {
      this.accumMs += Math.min(MAX_FRAME_MS, time - this.lastTime);
      while (this.accumMs >= STEP_MS) {
        this.step();
        this.accumMs -= STEP_MS;
      }
    }
    this.lastTime = time;
    this.frameId = this.scheduler.request(this.onFrame);
  };

  private onKeyDown = (e: Event): void => {
    const code = (e as KeyboardEvent).code;
    if (!(code in KEY_BITS) || isTyping(e.target)) return;
    if (code.startsWith('Arrow')) e.preventDefault(); // don't scroll the page
    this.pressed.add(code);
    this.updateKeys();
  };

  private onKeyUp = (e: Event): void => {
    this.pressed.delete((e as KeyboardEvent).code);
    this.updateKeys();
  };

  /** Losing focus drops all keys, so nothing sticks (Bug 2A). */
  private onBlur = (): void => {
    this.pressed.clear();
    this.keys = 0;
  };

  private updateKeys(): void {
    let keys = 0;
    for (const code of this.pressed) keys |= KEY_BITS[code];
    this.keys = keys;
  }
}
