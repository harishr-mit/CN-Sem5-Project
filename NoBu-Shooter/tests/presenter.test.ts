/**
 * presenter.test.ts — Presenter scripts and controller (PHASES.md P1,
 * docs/PHASE4_PLAN.md tests 1–4), plus the NetClient events the Network Lab
 * follows (test 3).
 */

import { describe, it, expect } from 'vitest';
import { QUICK_SCRIPT, COMPARE_SCRIPT, PRESENTER_SCRIPTS } from '../client/src/presenter/scripts.js';
import { PresenterController } from '../client/src/presenter/controller.js';
import type { PresenterStage } from '../client/src/presenter/types.js';
import { COMPARE_PRESETS, DEFAULT_TOGGLES } from '../client/src/compare/presets.js';
import { NetClient, type PredictionToggle } from '../client/src/net/NetClient.js';
import type { CompareNetwork } from '../client/src/compare/types.js';
import type { SyncSpec } from '../shared/src/sync/index.js';
import { PRESETS } from '../emulator/src/control.js';

/** Records the latest state of everything a step can set, plus a call log. */
class FakeStage implements PresenterStage {
  network: CompareNetwork | null = null;
  toggles: PredictionToggle | null = null;
  sync: SyncSpec | null = null;
  invincible = false;
  preset: string | null = null;
  nudges: { dx: number; dy: number }[] = [];
  applyNetwork(n: CompareNetwork) { this.network = structuredClone(n); }
  setToggles(t: PredictionToggle) { this.toggles = { ...t }; }
  setSync(s: SyncSpec) { this.sync = { ...s }; }
  setInvincible(on: boolean) { this.invincible = on; }
  nudge(dx: number, dy: number) { this.nudges.push({ dx, dy }); }
  setComparePreset(id: string) { this.preset = id; }
  snapshot() {
    return JSON.stringify({ n: this.network, t: this.toggles, s: this.sync, p: this.preset, i: this.invincible });
  }
}

describe('Presenter scripts (plan test 1)', () => {
  it('Quick Match has 12 steps and Compare 6, with unique ids', () => {
    expect(QUICK_SCRIPT.steps.map((s) => s.id)).toEqual(['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9', 'Q10', 'Q11', 'Q12']);
    expect(COMPARE_SCRIPT.steps.map((s) => s.id)).toEqual(['C1', 'C2', 'C3', 'C4', 'C5', 'C6']);
    for (const script of Object.values(PRESENTER_SCRIPTS)) {
      const ids = script.steps.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const s of script.steps) {
        expect(s.title.length).toBeGreaterThan(0);
        expect(s.caption.length).toBeGreaterThan(0);
        expect(s.expect.length).toBeGreaterThan(0);
      }
    }
  });

  it('every Quick Match step is complete: network, all five toggles, sync model', () => {
    for (const s of QUICK_SCRIPT.steps) {
      expect(s.quick, s.id).toBeDefined();
      expect(s.compare).toBeUndefined();
      expect(Object.keys(s.quick!.toggles).sort()).toEqual(Object.keys(DEFAULT_TOGGLES).sort());
      expect(['full', 'delta', 'state']).toContain(s.quick!.sync.model);
      const net = s.quick!.network;
      // A named network must exist in the emulator; an ad-hoc one carries its config
      if (!net.config) expect(PRESETS[net.name], `${s.id}: ${net.name}`).toBeDefined();
    }
  });

  it('every Compare step maps to an existing Compare preset, in order (plan test 4)', () => {
    const ids = COMPARE_PRESETS.map((p) => p.id);
    expect(COMPARE_SCRIPT.steps.map((s) => s.compare?.preset)).toEqual(ids);
    for (const s of COMPARE_SCRIPT.steps) expect(s.quick).toBeUndefined();
  });

  it('follows DEMO_SCRIPT.md: prediction off in Q2, redundancy on only in Q5, Delta then State at Nightmare', () => {
    const byId = Object.fromEntries(QUICK_SCRIPT.steps.map((s) => [s.id, s.quick!]));
    expect(byId['Q2'].toggles.prediction).toBe(false);
    expect(QUICK_SCRIPT.steps.filter((s) => s.quick!.toggles.redundancy).map((s) => s.id)).toEqual(['Q5']);
    expect(byId['Q6'].toggles.reconciliation).toBe(false);
    expect(byId['Q7'].toggles.interpolation).toBe(false);
    expect(byId['Q9'].nudge).toEqual({ dx: 40, dy: 0 });
    expect(['Q10', 'Q11', 'Q12'].map((id) => byId[id].network.name)).toEqual(['Nightmare', 'Nightmare', 'Nightmare']);
    expect(['Q10', 'Q11', 'Q12'].map((id) => byId[id].sync.model)).toEqual(['full', 'delta', 'state']);
  });
});

describe('PresenterController (plan test 2)', () => {
  it('next / prev / goTo stay in range', () => {
    const c = new PresenterController(QUICK_SCRIPT, new FakeStage());
    c.start();
    expect(c.index).toBe(0);
    expect(c.prev()).toBe(false);
    for (let i = 1; i < c.count; i++) expect(c.next()).toBe(true);
    expect(c.index).toBe(c.count - 1);
    expect(c.next()).toBe(false);
    expect(c.goTo(99)).toBe(false);
    expect(c.goTo(-1)).toBe(false);
    expect(c.goTo(2)).toBe(true);
    expect(c.index).toBe(2);
  });

  for (const script of [QUICK_SCRIPT, COMPARE_SCRIPT]) {
    it(`${script.id}: arriving at step k gives the same state from any direction (no leakage)`, () => {
      for (let k = 0; k < script.steps.length; k++) {
        const direct = new FakeStage();
        const a = new PresenterController(script, direct);
        a.start();
        a.goTo(k);

        // Visit every other step first, then come back to k with prev / next
        const roundabout = new FakeStage();
        const b = new PresenterController(script, roundabout);
        b.start();
        b.goTo(script.steps.length - 1);
        while (b.index > k) b.prev();
        // …and the same from below
        const below = new FakeStage();
        const d = new PresenterController(script, below);
        d.start();
        while (d.index < k) d.next();

        expect(roundabout.snapshot(), `step ${k}`).toBe(direct.snapshot());
        expect(below.snapshot(), `step ${k}`).toBe(direct.snapshot());
      }
    });
  }

  it('a manual change lasts until the next step change', () => {
    const stage = new FakeStage();
    const c = new PresenterController(QUICK_SCRIPT, stage);
    c.start();
    stage.setToggles({ ...DEFAULT_TOGGLES, prediction: false }); // presenter presses P
    expect(stage.toggles!.prediction).toBe(false);
    c.next();
    c.prev();
    expect(stage.toggles!.prediction).toBe(true);
  });

  it('the nudge runs on entering Q9 only, not on reapply or other steps', () => {
    const stage = new FakeStage();
    const c = new PresenterController(QUICK_SCRIPT, stage);
    c.start();
    while (c.step.id !== 'Q8') c.next();
    expect(stage.nudges).toHaveLength(0);
    c.next();
    expect(c.step.id).toBe('Q9');
    expect(stage.nudges).toEqual([{ dx: 40, dy: 0 }]);
    c.reapply();
    expect(stage.nudges).toHaveLength(1);
    c.next();
    c.prev(); // back into Q9: nudges again
    expect(stage.nudges).toHaveLength(2);
  });

  it('Invincible is on during the Quick script (and off after stop); never touched by Compare', () => {
    const q = new FakeStage();
    const qc = new PresenterController(QUICK_SCRIPT, q);
    qc.start();
    expect(q.invincible).toBe(true);
    qc.next();
    expect(q.invincible).toBe(true);
    qc.stop();
    expect(q.invincible).toBe(false);

    const cs = new FakeStage();
    const cc = new PresenterController(COMPARE_SCRIPT, cs);
    cs.invincible = true; // whatever it was stays
    cc.start();
    cc.stop();
    expect(cs.invincible).toBe(true);
  });

  it('the step timer restarts on every step change, and onChange fires', () => {
    let t = 1000;
    const changes: string[] = [];
    const c = new PresenterController(QUICK_SCRIPT, new FakeStage(), () => t);
    c.onChange = (_i, s) => changes.push(s.id);
    c.start();
    expect(c.enteredAt).toBe(1000);
    t = 5000;
    c.reapply();
    expect(c.enteredAt).toBe(1000);
    c.next();
    expect(c.enteredAt).toBe(5000);
    expect(changes).toEqual(['Q1', 'Q2']);
  });
});

describe('NetClient change events (plan test 3)', () => {
  const make = () => new NetClient({
    url: 'ws://unused', name: 'T',
    transport: () => ({ send: () => {}, close: () => {} }),
  });

  it('setToggles emits once per real change, with the complete toggle set', () => {
    const c = make();
    const seen: PredictionToggle[] = [];
    c.on('toggles', (t) => seen.push(t));
    c.setToggles({ prediction: false });
    c.setToggles({ prediction: false }); // no change
    c.setToggles({ ...c.toggles });      // no change
    c.setToggles({ redundancy: true, ghost: false });
    expect(seen).toHaveLength(2);
    expect(seen[0]).toEqual({ ...DEFAULT_TOGGLES, prediction: false });
    expect(seen[1]).toEqual({ ...DEFAULT_TOGGLES, prediction: false, redundancy: true, ghost: false });
    expect(c.toggles).toEqual(seen[1]);
  });

  it('setSync and setDevInvincible emit once per change', () => {
    const c = make();
    const syncs: SyncSpec[] = [];
    const devs: boolean[] = [];
    c.on('sync', (s) => syncs.push(s));
    c.on('dev', (on) => devs.push(on));
    c.setSync({ model: 'full' });            // default: no change
    c.setSync({ model: 'delta' });
    c.setSync({ model: 'delta' });
    c.setSync({ model: 'state', hz: 30 });
    c.setDevInvincible(false);               // default: no change
    c.setDevInvincible(true);
    c.setDevInvincible(true);
    expect(syncs).toEqual([{ model: 'delta' }, { model: 'state', hz: 30 }]);
    expect(devs).toEqual([true]);
    expect(c.devInvincibleOn).toBe(true);
  });
});
