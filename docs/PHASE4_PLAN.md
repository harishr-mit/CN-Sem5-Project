# Phase 4 Implementation Plan — Presenter mode + polish

**Audience:** the project owner and the agent who implements Phase 4.
**Status:** **draft, awaiting owner approval** (2026-10-10, `log.md` T68). Owner answers already folded in: **two separate presenter scripts** (Quick Match and Compare, D1); Presenter switches on **Invincible** in Quick Match (D3); **glow in Quick Match only** (D6); `playwright-core` as a **local devDependency**, screenshots **git-ignored** (D10).
**Scope:** `PHASES.md` → Phase 4, items P1–P7 (P3 moved to Phase 2.5). This file says *how* to build them. `PHASES.md` stays the source for *what* and the exit criteria.

---

## 0. Starting point

Checked on 2026-10-10, branch `phase4` at `6e0e7c7` (Phase 3 merged, clean tree; 130 tests, smoke and browser check passed in Phase 3).

**Already done by earlier phases** (so Phase 4 doesn't redo it):

- **Name tags** in the player's colour, the **same colour** in arena, scoreboard and kill feed (`playerColors.ts`, Phase 2.5).
- **Aim** is visible: the survivor sprite rotates to the aim angle (Phase 2.5).
- **Death particles** and a **respawn pulse for the local player** (`ArenaScene`).
- A frame-rate check in `ArenaScene` (`avgFps < 45` sets `bloomEnabled = false` with a `TODO`: there is no bloom yet). `NET.fpsDegrade = { minFps: 45, forSeconds: 3 }` exists. Settings has a **Graphics Quality** (low / medium / high) that nothing reads yet.
- The emulator **already targets one session by label** (`EmulatorClient.applyPreset(name, target, config)`).

**Gaps found while reading the code:**

- `NetworkLab` keeps its own copy of the toggles, sync model and Invincible state (initialised from the `NetClient`). Anything that changes them from outside (Presenter) would leave the Lab showing stale switches.
- `CompareView` owns its preset state internally; nothing outside can select a preset.
- The emulator's packet events don't say whether a packet was **reordered**, and its stats don't report **queue depth** — P5 needs both.
- The Lab panel is one long scrolling column: presets, sliders, sync model, netcode toggles, developer, 10 metric tiles, 4 sparklines.

---

## 1. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **Two presenter scripts** (owner choice): **Quick Match** (12 steps, `DEMO_SCRIPT.md` §1–§7) and **Compare** (6 steps, §8 + §11). Each is started from its own landing button: **PRESENTER — QUICK MATCH** and **PRESENTER — COMPARE**. | Each track can be run, rehearsed or skipped on its own; the order inside a track follows the walkthrough. |
| D2 | **Every step is a complete state**, like the emulator presets: network, all five netcode toggles, sync model (Quick Match); preset id (Compare). Going back (`B`) re-applies the earlier step exactly. | Nothing leaks from the step you came from, so `N`/`B` in any order always show the same thing. |
| D3 | **Quick Match presenter switches Invincible on** (owner choice) through the existing developer switch, so bots can't kill the presenter mid-sentence. The `[DEV]` tag stays visible. Without `npm run demo` (no developer tools), the bar says so once and the script still runs. | Reuses Phase 2.5's honest, visible switch; no new server code. |
| D4 | **Keys:** `N` next step, `B` previous step, `H` hide/show the caption; an **END** button on the bar leaves Presenter (back to the landing page). `Esc` keeps its usual meaning (Settings menu in Quick Match). All normal keys keep working (presets `1`–`5`, `P`/`C`/`I`/`G`/`Y`, movement). A manual change lasts until the next `N`/`B`. | One hand on the keyboard; the presenter can still improvise. `N`, `B`, `H` are free (Vimium maps `b`/`H`, covered by the README's Vimium note). |
| D5 | **Presenter bar**: a caption overlay at the bottom of the arena (above the packet strip in Quick Match, over the dock in Compare): step `3 / 12`, title, one or two sentences of "what to watch", expected numbers, and a step timer (some effects need ≈ 15 s to build up). `H` hides it. | The talk track is on screen; the timer answers "is it there yet?". |
| D6 | **Glow in Quick Match only** (owner choice): Phaser's built-in WebGL **bloom on the camera** (one full-screen pass, cheaper than per-object glow), on at Graphics Quality *high*, off at *medium*/*low*, and switched off automatically after `fpsDegrade.forSeconds` (3 s) below `minFps` (45). Compare never uses it. | The dev laptop's Intel UHD GPU; Compare already spends its budget on 4–5 canvases. |
| D7 | **Arena polish (P2):** a **death marker** (an ✕ in the victim's colour where they died, fading over the respawn delay), the **respawn pulse for every player** (today only the local one), and a small **aim chevron** in front of remote players' rings (Quick Match, readable when a sprite is small or the projector is dim). No new assets. | Makes deaths, respawns and aim readable from the back of a room. |
| D8 | **Lab panel (P4):** each section is collapsible (click its title), open/closed state remembered. Defaults: Presets, Sync model, Netcode toggles and Metrics open; Impairment sliders, Developer and Sparklines closed — which fits 1920 × 1080 without scrolling. At heights below 800 px the metric tiles switch to a compact 3-column layout. A **UI scale** setting (100 / 115 / 130 %, Settings) scales all React UI for projectors (CSS variable on `:root`), not the arena. | Meets "no scroll at 1920 × 1080, compact at 1280 × 720" without removing anything. |
| D9 | **Packet strip (P5):** the emulator reports **queue depth** per session and direction (`queueMs` = how long a packet arriving now would wait for the bandwidth cap) and marks **reordered** packets in its events (`reordered: true`). The strip draws a **queue bar** inside the EMULATOR box (amber, ms label), draws reordered dots with a white outline that visibly **overtake** later dots, and gets a one-line **legend** (up, down, lost, queue drop, duplicate, reordered). | Bufferbloat and reordering become visible instead of inferred. Additive fields only. |
| D10 | **`npm run shots` (P7)** (owner choice): `playwright-core` as a **devDependency of `NoBu-Shooter`** (project-local, `channel: 'chrome'`, no browser download). The script starts the demo itself, uses a **fresh page per viewport** (resizing a live headless page produced shifted screenshots in Phase 3), captures every screen at 1280 × 720 and 1920 × 1080 into `NoBu-Shooter/artifacts/shots/<w>x<h>/`, writes `index.json` (fps, console errors per shot), fails on console errors, and always stops the demo process tree. `artifacts/` is git-ignored. | Reproducible from a fresh clone; no global installs; generated files stay out of git. |
| D11 | **Landing (P6):** buttons **Quick Match**, **Compare**, **Presenter — Quick Match**, **Presenter — Compare**, and **Emulator dashboard** shown disabled with "Phase 5". Controls hint gains `Y` and `N`/`B`/`H`. | Matches P6; the dashboard arrives in Phase 5. |

---

## 2. Presenter scripts (data — `client/src/presenter/scripts.ts`)

Network entries are complete emulator configs (named presets or ad-hoc configs, as in Compare). Toggles not listed are at their defaults (prediction, reconciliation, interpolation, ghost on; redundancy off); sync is Full unless listed.

**Quick Match (12 steps, Invincible on):**

| # | Title | Network | Changes | What to watch |
|---|---|---|---|---|
| Q1 | Baseline | Baseline | — | 0 corrections/s, Input → Screen ≈ 17 ms |
| Q2 | Server delay, no prediction | 100 ms one-way | prediction off | Input → Screen ≈ 300+ ms: you wait for the server |
| Q3 | Prediction | 100 ms one-way | — | Instant movement, 0 corrections; the amber ghost trails behind |
| Q4 | Packet loss | 50 ms, 10 % loss | — | ≈ 2–3 corrections/s, amber correction lines |
| Q5 | Input redundancy | 50 ms, 10 % loss | redundancy on | Corrections drop to 0 |
| Q6 | Reconciliation off | 50 ms, 10 % loss | reconciliation off | The ghost drifts away and never comes back |
| Q7 | Jitter, no interpolation | 40 ± 50 ms | interpolation off | Bots stutter |
| Q8 | Interpolation | 40 ± 50 ms | — | Bots glide, drawn ≈ 100 ms in the past |
| Q9 | Misprediction | 50 ms | on enter: one **nudge** (+40 px) | One smooth correction with an amber vector |
| Q10 | Nightmare: full snapshots | Nightmare | — | Give it ≈ 15 s: ack delay ≈ 650–700 ms, ↓ at the 400 kbps cap |
| Q11 | Nightmare: delta snapshots | Nightmare | sync Delta | ≈ 130 kbps, ≈ 500 B/msg, ack delay ≈ 325 ms |
| Q12 | Nightmare: state sync | Nightmare | sync State 10 | ≈ 190 kbps; bots extrapolated, no interpolation delay |

**Compare (6 steps):** C1 Prediction · C2 Interpolation · C3 Redundancy · C4 Sync · C5 Bandwidth · C6 State Hz — each applies the Compare preset of the same name (with its network, movers and reference pane) and shows the preset caption plus the expected numbers from `DEMO_SCRIPT.md` §8 / §11.

---

## 3. Design

### 3.1 Presenter core (`client/src/presenter/`, no React or Phaser — unit-testable)

| File | Contents |
|---|---|
| `types.ts` | `PresenterStep` (`id`, `title`, `caption`, `expect`, and either `quick: { network, toggles, sync, actions? }` or `compare: { preset }`), `PresenterScript` (`id`, `title`, `view`, `steps`), `Stage` interface (`applyNetwork`, `setToggles`, `setSync`, `setInvincible`, `perturb`, `setComparePreset`). |
| `scripts.ts` | `QUICK_SCRIPT`, `COMPARE_SCRIPT` (§2). |
| `controller.ts` | `PresenterController(script, stage)`: `index`, `step`, `next()`, `prev()`, `goTo(i)`, `enteredAt` (step timer); applies the complete step state each time (D2). |

### 3.2 Making the UI follow outside changes

- `NetClient` gets `setToggles(partial)` and emits `toggles`, `sync` and `dev` events (from `setToggles`, `setSync`, `setDevInvincible`). `NetworkLab` listens instead of keeping a private copy, so Presenter changes show up in the Lab switches.
- `CompareView` takes an optional `presetId` prop (Presenter) and applies that preset whenever it changes.

### 3.3 UI and integration

- `App`: views `presentQuick` and `presentCompare` reuse the Quick Match and Compare views with a `presenter` prop; `PresenterBar` (`client/src/ui/presenter/PresenterBar.tsx`) renders the caption, counter, timer and key hints; one key handler for `N` / `B` / `H` (ignored in text fields).
- `Landing`: the buttons of D11.

### 3.4 Arena (P2, `ArenaScene`, `PlayerView`)

- Death markers: pooled sprites (texture baked once), fed by `PLAYER_DEATH` events.
- Respawn pulse for remote players at their respawn position (from the interpolated snapshot when `alive` flips back).
- Aim chevron: one baked triangle per `PlayerView`, Quick Match only.
- Bloom: `cameras.main.postFX.addBloom(...)` when WebGL and quality *high* and not Compare; the existing fps check removes it (D6) and logs once.

### 3.5 Lab panel (P4)

- `LabSection` component (title button + body), open state in `settings.ts` (`labSections`), defaults per D8.
- `uiScale` in `settings.ts` (100 | 115 | 130), applied as `--ui-scale` on `:root`; font sizes in `global.css` that use rem follow it.

### 3.6 Emulator + strip (P5)

- `emulator/src/pipeline.ts`: `LinkState.getStats()` adds `queueMs = max(0, freeAt − now)`; `PacketEvent` adds `reordered?: true`.
- `PacketFlowStrip`: queue bar, outlined reordered dots that hold back for `reorderDelayMs` (so later dots pass them), legend row.

### 3.7 `npm run shots` (P7)

- `NoBu-Shooter/scripts/shots.mjs` + `npm run shots` (also proxied from the root `package.json`).
- Screens per viewport: landing, credits, Quick Match (Lab open), Quick Match under Nightmare after 15 s, settings, controls, Compare × 7 presets (incl. Custom), Presenter Quick step 1 and Nightmare step, Presenter Compare step 1. ≈ 15 shots × 2 viewports; `--fast` shortens the waits.
- `docs/VISUAL_CHECKLIST.md`: what to check on each shot (no unstyled elements, no overlap, readable at 1280 × 720, captions not covering the effect being described).

---

## 4. Build order

| Step | log.md | Work | Done when |
|---|---|---|---|
| 1 | T69 | Presenter core (§3.1) + `NetClient` events + `NetworkLab` listening (§3.2) | Tests 1–3 pass; Lab still works by hand |
| 2 | T70 | Presenter UI + `App` views + `CompareView` `presetId` + Landing (P1, P6) | Both scripts run end to end in the browser |
| 3 | T71 | Arena polish + bloom with auto-degrade (P2) | Quick Match ≥ 55 fps with bloom; Compare unchanged |
| 4 | T72 | Lab sections + UI scale (P4) | No Lab scroll at 1920 × 1080; usable at 1280 × 720 |
| 5 | T73 | Emulator `queueMs` / `reordered` + strip (P5) | Test 5 passes; queue bar visible under Nightmare |
| 6 | T74 | `npm run shots` + `.gitignore` + devDependency (P7) | Shots for both viewports, 0 console errors |
| 7 | T75 | Checklist review of the shots, docs, phase exit (§6) | Exit checklist met |

---

## 5. Tests

| # | File | What it checks |
|---|---|---|
| 1 | `tests/presenter.test.ts` | Every step is complete (network, all 5 toggles, sync for Quick Match; an existing preset id for Compare); every named network exists in the emulator presets; step ids unique. |
| 2 | `tests/presenter.test.ts` | Controller with a fake `Stage`: `N`/`B` stay in range; applying step *k* after *k + 1* gives exactly the same stage state as applying *k* first (no leakage); `actions` (nudge) run only on entering the step; Invincible is set in the Quick script. |
| 3 | `tests/netcode.test.ts` or a new client test | `setToggles` / `setSync` / `setDevInvincible` emit their events once per change. |
| 4 | `tests/compare.test.ts` | Each Compare script step maps to a preset; the presets still change one setting each (unchanged). |
| 5 | `tests/emulator.test.ts` | `queueMs` grows when offered load exceeds the cap and drains to 0; reordered packets carry `reordered: true`; existing pipeline behaviour unchanged. |
| — | `npm run shots` | The browser check of the phase (both viewports, fps and console errors in `index.json`). |

---

## 6. Exit checklist

- [ ] `npm test`, `npm run typecheck`, `npm run smoke` pass.
- [ ] `npm run shots` passes; every shot reviewed against `docs/VISUAL_CHECKLIST.md`; findings fixed or listed.
- [ ] **Demo checkpoint**: both presenter scripts pressed through with `N` only — every effect appears on cue (the Nightmare steps after ≈ 15 s), `B` returns to identical states, `H` hides the caption.
- [ ] Quick Match ≥ 55 fps with bloom on the dev laptop; Compare 4 panes + REF still ≥ 55 fps.
- [ ] No Lab scroll at 1920 × 1080 with default sections.
- [ ] Docs: `docs/DEMO_SCRIPT.md` (Presenter section; steps = the scripts), `README.md` (landing buttons, `N`/`B`/`H`, UI scale, `npm run shots`), `docs/PROTOCOL.md` (emulator `queueMs`, `reordered`), `docs/ASSUMPTIONS.md`, `GAMERULES.md` (presenter keys are not game actions), `PHASES.md`, `log.md`.
- [ ] No processes left; ports 5173/8080/9000/9001 free; `artifacts/` ignored and nothing generated is tracked. Suggested tag: `phase-4`.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Bloom costs too much on the Intel UHD GPU | Single camera pass, quality *high* only, automatic switch-off after 3 s below 45 fps (D6); measured in the exit checklist. |
| Presenter and manual changes fight (a key press during a step) | Manual changes are allowed and last until the next `N`/`B` (D4); every step re-applies a complete state (D2). |
| Invincible needs `npm run demo` | The bar shows "Invincible needs npm run demo" once; the script still runs (D3). |
| Two scripts drift from `DEMO_SCRIPT.md` | `DEMO_SCRIPT.md` gets a Presenter section generated from the same step titles; test 1 pins the step ids. |
| `playwright-core` version vs installed Chrome | Use the version already proven in Phases 1–3 (1.48.2) with `channel: 'chrome'`; the script prints a clear message if Chrome isn't found. |

## 8. Not in Phase 4

- Different network conditions per Compare pane (the emulator supports it; no step needs it yet).
- Recording a demo video; slide export.
- The emulator dashboard itself (Phase 5).

## 9. Deviations from this plan

*(Filled in while implementing.)*
