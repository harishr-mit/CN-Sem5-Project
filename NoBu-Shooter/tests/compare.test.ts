/**
 * compare.test.ts — Compare view core: layout, shared input, presets
 * (PHASES.md C1, C5; docs/PHASE2_PLAN.md tests 7–9).
 */

import { describe, it, expect } from 'vitest';
import { layoutPanes, PANE_CHROME_PX, PANE_GAP_PX } from '../client/src/compare/layout.js';
import { InputDriver, type DrivenClient, type FrameScheduler } from '../client/src/compare/InputDriver.js';
import { COMPARE_PRESETS, DEFAULT_TOGGLES, customPreset } from '../client/src/compare/presets.js';
import type { ComparePreset } from '../client/src/compare/types.js';
import { KEY } from '../shared/src/sim/movement.js';
import GAME from '../shared/src/config/game.js';
import NET from '../shared/src/config/net.js';

const ASPECT = GAME.arena.width / GAME.arena.height;
/** Compare chrome: 44 px top bar + 8 px padding around the grid. */
const viewport = (w: number, h: number) => ({ w: w - 16, h: h - 44 - 16 });

describe('layoutPanes (no letterboxing)', () => {
  for (const [W, H] of [[1280, 720], [1920, 1080]]) {
    for (const n of [2, 3, 4]) {
      it(`${W}×${H}, ${n} panes: arena-shaped canvases that fit, scale ≥ 0.35`, () => {
        const { w, h } = viewport(W, H);
        const l = layoutPanes(w, h, n);
        expect(l.rows * l.cols).toBeGreaterThanOrEqual(n);
        // The canvas host is exactly the arena's shape, so FIT adds no bars
        // (≤ 2 px of rounding, far below the 10 % exit criterion).
        expect(Math.abs(l.canvasW / l.canvasH - ASPECT)).toBeLessThan(0.01 * ASPECT);
        expect(Math.abs(l.canvasW - l.canvasH * ASPECT)).toBeLessThanOrEqual(2);
        expect(l.canvasW / GAME.arena.width).toBeGreaterThanOrEqual(0.35);
        expect(l.gridW).toBeLessThanOrEqual(w);
        expect(l.gridH + l.dockH).toBeLessThanOrEqual(h);
        expect(l.gridH).toBe(l.rows * (l.canvasH + PANE_CHROME_PX) + PANE_GAP_PX * (l.rows - 1));
      });
    }
  }

  it('two panes go side by side and leave room for the dock', () => {
    const { w, h } = viewport(1920, 1080);
    const l = layoutPanes(w, h, 2);
    expect([l.rows, l.cols]).toEqual([1, 2]);
    expect(l.dockH).toBeGreaterThan(300);
  });
});

describe('InputDriver (one keyboard, identical inputs for every pane)', () => {
  class FakeScheduler implements FrameScheduler {
    cb: ((t: number) => void) | null = null;
    request(cb: (t: number) => void) { this.cb = cb; return 1; }
    cancel() { this.cb = null; }
    frame(t: number) { this.cb?.(t); }
  }
  class FakeClient implements DrivenClient {
    keys = 0;
    stepped: number[] = [];
    sends = 0;
    simStep() { this.stepped.push(this.keys); }
    sendInputs() { this.sends++; }
  }
  const key = (type: string, code: string) => Object.assign(new Event(type), { code });

  it('gives every client the same keys on every step and flushes them together', () => {
    const sched = new FakeScheduler();
    const source = new EventTarget();
    const driver = new InputDriver(sched, source);
    const clients = [new FakeClient(), new FakeClient(), new FakeClient()];
    driver.setClients(clients);
    driver.start();

    let t = 0;
    const frames = (n: number) => { for (let i = 0; i < n; i++) { sched.frame(t); t += 1000 / 60; } };
    frames(10);
    source.dispatchEvent(key('keydown', 'KeyD'));
    source.dispatchEvent(key('keydown', 'ArrowUp'));
    frames(30);
    source.dispatchEvent(key('keyup', 'KeyD'));
    frames(20);
    source.dispatchEvent(new Event('blur'));
    frames(5);
    driver.stop();

    const [a, b, c] = clients;
    expect(a.stepped.length).toBeGreaterThan(55);
    expect(b.stepped).toEqual(a.stepped);
    expect(c.stepped).toEqual(a.stepped);
    expect(a.stepped).toContain(KEY.RIGHT | KEY.UP);
    expect(a.stepped).toContain(KEY.UP);
    expect(a.stepped[a.stepped.length - 1]).toBe(0); // blur released everything
    const sendEvery = Math.round(GAME.sim.hz / NET.inputSendHz);
    for (const cl of clients) expect(cl.sends).toBe(Math.floor(a.stepped.length / sendEvery));

    // Stopped: no more steps or key handling
    const before = a.stepped.length;
    source.dispatchEvent(key('keydown', 'KeyW'));
    sched.frame(t + 100);
    expect(a.stepped.length).toBe(before);
    expect(driver.keys).toBe(0);
  });

  it('runs at the sim rate regardless of the display rate (144 Hz frames)', () => {
    const sched = new FakeScheduler();
    const driver = new InputDriver(sched, new EventTarget());
    const client = new FakeClient();
    driver.setClients([client]);
    driver.start();
    for (let i = 0; i <= 144; i++) sched.frame(i * (1000 / 144));
    driver.stop();
    expect(client.stepped.length).toBeGreaterThanOrEqual(59);
    expect(client.stepped.length).toBeLessThanOrEqual(60);
  });
});

describe('Comparison presets (one setting each)', () => {
  const changedKeys = (preset: ComparePreset) => {
    const [a, b] = preset.panes;
    return (Object.keys(a.toggles) as (keyof typeof a.toggles)[]).filter((k) => a.toggles[k] !== b.toggles[k]).sort();
  };
  const byId = Object.fromEntries(COMPARE_PRESETS.map((p) => [p.id, p])) as Record<string, ComparePreset>;

  it('have 2–4 panes with unique ids and complete toggles', () => {
    for (const p of [...COMPARE_PRESETS, customPreset(4)]) {
      expect(p.panes.length).toBeGreaterThanOrEqual(2);
      expect(p.panes.length).toBeLessThanOrEqual(4);
      expect(new Set(p.panes.map((x) => x.id)).size).toBe(p.panes.length);
      for (const pane of p.panes) expect(Object.keys(pane.toggles).sort()).toEqual(Object.keys(DEFAULT_TOGGLES).sort());
    }
  });

  it('each change exactly one setting between their panes', () => {
    // Reconciliation and the ghost only exist on top of prediction
    expect(changedKeys(byId['prediction'])).toEqual(['ghost', 'prediction', 'reconciliation']);
    expect(changedKeys(byId['interpolation'])).toEqual(['interpolation']);
    expect(changedKeys(byId['redundancy'])).toEqual(['redundancy']);
    // Phase 3 presets: identical toggles, only the sync model (or its rate) differs
    for (const id of ['sync', 'bandwidth', 'staterate']) {
      const p = byId[id];
      expect(changedKeys(p)).toEqual([]);
      for (const pane of p.panes) expect(pane.toggles).toEqual(p.panes[0].toggles);
      expect(new Set(p.panes.map((x) => JSON.stringify(x.sync))).size).toBe(p.panes.length);
    }
    expect(byId['sync'].panes.map((x) => x.sync)).toEqual([{ model: 'full' }, { model: 'delta' }, { model: 'state', hz: 10 }]);
    expect(byId['bandwidth'].panes.map((x) => x.sync.model)).toEqual(['full', 'delta']);
    expect(byId['staterate'].panes.map((x) => x.sync)).toEqual([{ model: 'state', hz: 10 }, { model: 'state', hz: 30 }]);
    // Phase 2 presets stay on full snapshots
    for (const id of ['prediction', 'interpolation', 'redundancy']) {
      for (const pane of byId[id].panes) expect(pane.sync).toEqual({ model: 'full' });
    }
  });

  it('set the network the demo needs', () => {
    expect(byId['prediction'].network).toEqual({ name: 'Transatlantic' });
    expect(byId['interpolation'].network?.config).toEqual({ latencyMs: 50, jitterMs: 30 });
    expect(byId['interpolation'].movers).toHaveLength(4);
    expect(byId['interpolation'].reference).toBe(true);
    expect(byId['redundancy'].network?.config).toEqual({ latencyMs: 50, lossPct: 10 });
    // Phase 3: Full must exceed the cap, so every mover is on (docs/PHASE3_PLAN.md D9)
    expect(byId['sync'].network).toEqual({ name: 'Nightmare' });
    expect(byId['sync'].movers).toHaveLength(4);
    expect(byId['sync'].reference).toBe(false); // 3 cells: the dock gets the 4th
    expect(byId['bandwidth'].network?.config).toEqual({ latencyMs: 40, bandwidthKbps: 300 });
    expect(byId['bandwidth'].movers).toHaveLength(4);
    expect(byId['staterate'].network).toEqual({ name: 'Transatlantic' });
    expect(byId['staterate'].movers).toEqual(['zigzag', 'reversal']);
  });

  it('Custom keeps the previous panes and adds default ones', () => {
    const from = COMPARE_PRESETS[1];
    const custom = customPreset(3, from);
    expect(custom.panes.map((p) => p.id)).toEqual(['A', 'B', 'C']);
    expect(custom.panes[0].toggles).toEqual(from.panes[0].toggles);
    expect(custom.panes[0].toggles).not.toBe(from.panes[0].toggles); // copied
    expect(custom.panes[2].toggles).toEqual(DEFAULT_TOGGLES);
    expect(custom.panes[2].sync).toEqual({ model: 'full' });
    const fromSync = customPreset(2, byId['staterate']);
    expect(fromSync.panes[1].sync).toEqual({ model: 'state', hz: 30 });
    expect(fromSync.panes[1].sync).not.toBe(byId['staterate'].panes[1].sync); // copied
    expect(custom.network).toBeNull();
    expect(custom.movers).toEqual(from.movers);
  });
});
