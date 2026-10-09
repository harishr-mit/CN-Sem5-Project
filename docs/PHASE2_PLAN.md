# Phase 2 Implementation Plan — Compare view + scripted movers

**Audience:** the project owner and the agent who implements Phase 2.
**Status:** approved by the owner on 2026-10-09; implementation in progress (`log.md` T38–T44). Deviations found while building are recorded in §10.
**Scope:** `PHASES.md` → Phase 2, items C1–C6. This file says *how* to build them. `PHASES.md` stays the source for *what* and the exit criteria.

---

## 0. Starting point

Checked on 2026-10-09, branch `game-phase2plus` (clean tree):

- Phase 1 is in place. `npm test` gives 27/27, `npm run typecheck` is clean, and `core.ts`, `loop.ts`, `bindStore.ts` and `tests/netcode.test.ts` exist. Smoke was not re-run for this check.
- **The current A/B view** (`client/src/ui/ABCompare.tsx`):
  - It has two fixed panes. Both players join the `lab` room.
  - Each pane's Phaser scene polls the keyboard and runs its own 60 Hz loop, so the two panes can sample different keys on the same tick.
  - The metrics bar shows three numbers.
  - The shared `NetworkLab` is bound to pane B, so its P/R/I/G toggles only affect B.
  - Phaser `Scale.FIT` letterboxes each pane heavily: about 750×950 px cells for a 16:9 arena.
- **What we can reuse:**
  - `GameServer` (`server/src/core.ts`) does not depend on the transport.
  - `NetClient` is headless and takes an injectable transport and clock.
  - The emulator control port can already target one session by label.
  - The netcode harness runs a real server, client and pipeline on fake timers.

---

## 1. Decisions (approved 2026-10-09)

These are the choices this plan makes. Each one changes what gets built. The owner approved all of them, including D3, which changes what C4 measures. `PHASES.md` Phase 2 has been updated to match.

| # | Decision | Why |
|---|---|---|
| D1 | **Movers are server entities in the `lab` room.** They are sent as ordinary `PlayerSnap` entries with `bot: true` and a new optional `mover` field. They are stored outside `state.players`, so they do not count toward the 8-player cap. | Movers are exactly "remote entities". Interpolation, extrapolation and the Phase 3 delta/state encoders handle them with no special case. |
| D2 | **Mover paths are pure functions of server time**: `moverPath(pattern, tSec)` in `shared/src/sim/movers.ts`. The server sets each mover's position to `moverPath(pattern, tick / 60)`. | Movers are deterministic by construction (C6), and the client can compute the **exact** true position at any moment. |
| D3 | **Remote error is measured against the exact true position and reported as three numbers: *lag* (mean px), *wobble* (std-dev px) and *frozen frames* (%).** It is not a single "error" number. | See the note below this table. A single number would show interpolation as *worse* and contradict the demo checkpoint. |
| D4 | **The reference pane is a *spectator*.** It connects directly to the server (new `hello.spectate`), does not join as a player, and draws the newest snapshot as-is. Compare always opens this connection. The "Reference pane" switch only controls whether it is **shown**. | The pane shows where every pane's player and every mover *really* is. The connection also gives an accurate server clock for D3, even when the pane is hidden. |
| D5 | **One shared input driver steps every emulated pane with identical inputs.** Phaser scenes in Compare stop polling keys and stop running their own simulation loop. | Every pane sends the same input sequence, so the comparison is fair. "Keyboard and mouse drive all panes" (C1). |
| D6 | **Each comparison preset changes one setting.** "Prediction off vs on" keeps interpolation **on** in both panes. The old A/B view also turned interpolation off in pane A. | It is a clean experiment. Side effect: pane A's Input → Screen at Transatlantic becomes about 340 ms instead of 236 ms. `DEMO_SCRIPT.md` gets the new number. The old combination can still be built as a Custom layout. |
| D7 | **No letterboxing.** Panes use the grid that makes them largest, and each canvas box is sized to exactly 16:9, so Phaser `FIT` adds no bars. The space left over goes to a *compare dock* below the panes (Phase 3's bandwidth chart will go there too). In Compare, the Network Lab is an overlay drawer opened with `Tab`, so panes don't resize when it opens. | Meets the exit criterion of ≤ 10 % bars by construction. The leftover space is put to use instead of shown as empty bars. |

**Why D3 is needed.** Take 50 ms ± 30 ms jitter and a mover at 200 px/s:

- With interpolation **off**, the pane draws the newest snapshot. That snapshot is on average about 50 ms (latency) + 17 ms (half a snapshot interval) old, so the mover is drawn **≈ 13 px** behind its true position. The gap jumps around.
- With interpolation **on**, the pane renders about 100 ms + 50 ms in the past, so the mover is drawn **≈ 30 px** behind. The gap stays almost constant.

A single mean-error number would therefore rate interpolation as worse, the opposite of what the audience sees.

What interpolation really trades is a fixed lag for smoothness. Three numbers make that visible:

| Metric | Interp **off** (expected) | Interp **on** (expected) |
|---|---|---|
| Lag (mean distance from true position) | ≈ 13 px | ≈ 30 px |
| Wobble (std-dev of that distance) | high (≈ 5–8 px) | ≈ 1–2 px |
| Frozen frames (true position moved > 1 px, drawn position moved < 0.1 px) | **≥ 50 %** (30 Hz snapshots on a 60 Hz display, more under jitter) | **≈ 0 %** |

The tests in §6 pin these values down. Frozen % depends on the display's refresh rate: a 144 Hz monitor shows about 79 % with interpolation off. `ASSUMPTIONS.md` records this.

---

## 2. Protocol changes (all optional fields, `v` stays 1)

| Message | Change | Validation and server behaviour |
|---|---|---|
| `hello` (C→S) | `spectate?: boolean` | If present, it must be a boolean. A spectator gets a `welcome` but no player. It does not count toward `isFull()`. Its `input` and `perturb` messages are ignored. |
| `welcome` (S→C) | `spectator?: true`. `playerId` is `0` for spectators (real ids start at 1). | — |
| `lab` (C→S, **new**) | `{ t: 'lab', movers: MoverPattern[] }` | Accepted only in rooms with `movers: true` in `game.json` (only `lab`). Unknown pattern names are rejected. The list replaces the set of active movers. Any connection in the room may send it, spectators included. |
| `snap` → `PlayerSnap` | `mover?: MoverPattern` | Present only on mover entries. Movers have `bot: true`, `alive: true`, `life: 1`, `score: 0` and `protectMs: 0`. |
| Spectator snapshots | `ack: 0` | `Room.sendSnapshots()` also sends `buildSnapshot(null)` to each spectator connection in the room. |

**Emulator control port: ad-hoc presets.**

- `{ cmd: 'preset', name, config }` with a `config` object builds `{ ...DEFAULT_LINK_CONFIG, ...config }`, applies it to `all`, and reports `preset: name`. Without `config`, the command behaves as today.
- This lets a comparison preset set "50 ms ± 30 ms" as one complete configuration, so no settings from the previous preset carry over (the R10 lesson). The lab shows the preset's name instead of "Custom".

All of these go into `docs/PROTOCOL.md` §2, §3 and §5.2.

---

## 3. Movers (C3)

`shared/src/sim/movers.ts` exports:

- `type MoverPattern = 'circle' | 'zigzag' | 'reversal' | 'stopgo'`
- `MOVER_PATTERNS`
- `moverPath(pattern, tSec): Vec2`

Each path is continuous (no teleports, so `life` never changes) and loops forever. The speed is 200 px/s, the same as a player. Put the speed and the stop/go timings in `game.json` under `lab: { moverSpeed, stopGo: { moveMs, stopMs } }`. The shapes stay in code.

| Pattern | Path | What it shows | Obstacle/edge clearance (checked) |
|---|---|---|---|
| `circle` | Centre (640, 360), radius 120. One lap takes 3.8 s | Smooth curve. Extrapolation cuts corners | 40 px |
| `zigzag` | x 360 ↔ 920, y between 530 and 560. Legs about 40 px long, so it turns every ~0.25 s. Runs out and back | Frequent direction changes (Phase 3: state sync overshoots) | 20 px |
| `reversal` | y = 175, x 360 ↔ 920, instant 180° turns at each end | Sudden reversal (extrapolation overshoots by up to 100 ms × 200 px/s) | 24 px |
| `stopgo` | x = 400, y 250 ↔ 470. Moves 1 s, stops 0.75 s | Stops and starts | 69 px |

The lanes do not overlap: they are at least 50 px apart centre to centre, and the sprites need 32 px. Every path is at least 108 px from any spawn point. All numbers were checked with a script against `game.json`, and a test (§6) keeps them true.

**Server (`room.ts`):**

- Add `private movers = new Map<number, { id: number; pattern: MoverPattern; x: number; y: number }>()`.
- Add `setMovers(patterns)`. New ids come from the same `nextPlayerId` counter as players, so they never clash.
- In `tick()`, after players move, set each mover's position to `moverPath(pattern, tick / SIM_HZ)`.
- `buildSnapshot()` appends the movers to `players`.
- When the room has no players and no spectators left, clear the movers.
- Movers start off. Comparison presets turn them on.

---

## 4. Client design

### 4.1 `NetClient` additions (headless, so harness-testable)

```ts
interface NetClientOptions { /* … */ spectate?: boolean }
get isSpectator(): boolean
/** now + clockOffset; null before the first snapshot. */
serverNow(): number | null
/** Ground truth for remote-error metrics; usually the spectator's serverNow(). */
setTruthClock(clock: (() => number | null) | null): void
// LocalMetrics gains: moverLagPx, moverWobblePx, moverFrozenPct
```

- **Spectator:** `simStep()`, `sendInputs()` and reconciliation do nothing.
- **Remote error:** `getInterpolatedState()` keeps the state it returns. `framePresented()` then compares each mover in that state with `moverPath(mover, truthClock() / 1000)` and feeds a `RemoteErrorTracker`. The tracker lives in `client/src/net/remoteError.ts`, is pure, uses a rolling 2 s window, and is read at 5 Hz like the other metrics.
- **Accuracy of the true position:** the spectator's clock offset averages out the snapshot send times, which jitter because of Windows' 15.6 ms timer and the hybrid loop. Expected error is ±1–2 px. Record this in `ASSUMPTIONS.md`.

### 4.2 Compare core (`client/src/compare/`, no React or Phaser, unit-testable)

| File | Contents |
|---|---|
| `types.ts` | `PaneSpec { id: 'A'\|'B'\|'C'\|'D'; title; toggles: Partial<PredictionToggle>; sync?: 'full' }`. The `sync` field is a placeholder for Phase 3. `ComparePreset { id; title; caption; panes: PaneSpec[]; reference: boolean; network: { name; config }; movers: MoverPattern[] }` |
| `presets.ts` | The comparison presets (table below) |
| `layout.ts` | `layoutPanes(W, H, n, chromePx)` → `{ rows, cols, canvasW, canvasH, dockH }`. It tries every rows × cols grid with n panes and keeps the one with the largest canvas scale. The canvas is exactly 16:9. |
| `InputDriver.ts` | Shared keyboard: `keydown`/`keyup` for WASD and the arrow keys, cleared on window `blur` so keys don't stick. Shared pointer in arena coordinates, reported by whichever scene the mouse is over. One `requestAnimationFrame` loop with a fixed 60 Hz step: each step sets `keys` and calls `simStep()` on every emulated client; every second step calls `sendInputs()` on all of them. `start()` and `stop()` must be safe under StrictMode. |

Layout results, computed with the planned chrome (44 px top bar, 56 px per-pane header + metrics, 44 px collapsed drawer rail):

| Screen | 2 panes | 3–4 panes |
|---|---|---|
| 1280×720 | 1×2 grid, canvas 610×343, dock ≈ 260 px | 2×2 grid, canvas 487×274 |
| 1920×1080 | 1×2 grid, canvas 930×523, dock ≈ 440 px | 2×2 grid, canvas 807×454 |

### 4.3 Comparison presets (C5)

| Preset | Panes (only the changed toggles are listed) | Network | Movers | Reference pane | What the audience sees |
|---|---|---|---|---|---|
| **Prediction off vs on** (default; replaces A/B) | A: prediction, reconciliation, ghost off · B: all on | Transatlantic | circle | hidden | Input → Screen ≈ 340 ms vs ≈ 17 ms |
| **Interpolation off vs on** (demo checkpoint) | A: interpolation off · B: on | ad-hoc "Jitter 50±30" (50 ms, 30 ms jitter) | all four | shown | A: frozen ≥ 50 %, high wobble · B: frozen ≈ 0 %, larger but steady lag. Mover trails: bunched dots vs evenly spaced dots |
| **Redundancy off vs on** | A: redundancy off · B: on | ad-hoc "Loss 10 %" (50 ms, 10 % loss) | off | hidden | ≈ 2–3 corrections/s vs ≈ 0 |
| **Custom** | 2–4 panes, edited live with the chips on each pane header | unchanged | unchanged | switch | — |

### 4.4 Rendering (`ArenaScene` options, set through `GameContainer`)

```ts
interface ArenaSceneOptions {
  netClient: NetClient;
  input?: InputDriver;            // set ⇒ no key polling, no simStep/sendInputs in update()
  playerColors?: () => ReadonlyMap<number, number>; // pane colour per player id
  dimOthers?: boolean;            // sibling panes' players at 30 % alpha
  moverTrails?: boolean;          // last ~24 drawn positions as dots
  truthMarkers?: boolean;         // faint dashed ring at the exact true position (T toggles it)
}
```

- **Movers** look different from players: a hollow violet "drone" ring.
- **Trails** show stutter even in a still screenshot: bunched dots with interpolation off, evenly spaced dots with it on.
- **The truth marker** shows lag directly: the drawn mover visibly trails the dashed ring.
- **Pane colours:** A red, B cyan, C amber, D green, reference white. In the reference pane, every player is drawn in its pane's colour. In its own pane, a player stays cyan, as today.
- With no options set, the Quick Match view behaves exactly as now.

### 4.5 UI

- **`EmulatorControls.tsx`:** take the preset chips, sliders, burst switch and status chip out of `NetworkLab.tsx` into this component. `NetworkLab` uses it unchanged. Compare uses it in its overlay drawer.
- **`ui/compare/CompareView.tsx`** contains:
  - a top bar: exit, preset buttons, pane count (2/3/4), Reference switch, mover chips, current emulator preset;
  - the pane grid from `layoutPanes`;
  - the dock;
  - the drawer, opened with `Tab`.

  It owns the `NetClient`s (one per pane plus the spectator), the `EmulatorClient` and the `InputDriver`. Keys `1`–`5` still select emulator presets.
- **`ComparePane.tsx`:**
  - header: letter, title, toggle chips P / R / I / Rd / G;
  - canvas host sized exactly to the layout;
  - `PaneMetricsBar`.

  Clicking a pane selects it, and the P/R/I/G keys then apply to that pane.
- **`PaneMetricsBar.tsx` (C4):** Input → Screen, ack delay, RTT, corrections/s, ↓ kbps, mover lag ± wobble, frozen %.
- **`CompareDock.tsx`:** one table that compares the panes (best value highlighted) and a lag sparkline per pane (reuse `Sparkline.tsx`).
- **`App.tsx` and `Landing.tsx`:**
  - The view becomes `'compare'` and the button is renamed **NETWORK LAB — COMPARE**.
  - **Delete `ABCompare.tsx`.**

---

## 5. Build order

Each step ends with `npm test` and `npm run typecheck` green. Mark each one in `log.md` as you start and finish it.

| Step | Work | Done when |
|---|---|---|
| 1 | Shared + server: `movers.ts`, `game.json` (`rooms.lab.movers`, `lab.*`), messages and validators, `Room` movers and spectators, the `lab` message in `core.ts` | Tests 1–4 in §6 pass |
| 2 | `NetClient`: `spectate`, `serverNow()`, truth clock, `RemoteErrorTracker`, new metrics | Tests 5–6 pass |
| 3 | Compare core: `types`, `presets`, `layout`, `InputDriver`; emulator ad-hoc `preset` + `config` | Tests 7–9 pass |
| 4 | Rendering: `ArenaScene` options, mover look, trails, truth markers, pane colours | Quick Match is unchanged in the browser (regression check) |
| 5 | UI: extract `EmulatorControls`; `CompareView`, `ComparePane`, `PaneMetricsBar`, `CompareDock`; wire up `App`/`Landing`; delete `ABCompare`; CSS | All three presets work by hand in the browser |
| 6 | Smoke extension, browser check, docs, phase exit (§7) | Exit checklist met |

---

## 6. Tests (C6)

| # | File | What it checks |
|---|---|---|
| 1 | `tests/movers.test.ts` | `moverPath` is pure: the same input gives the same output. Paths are continuous: a step between ticks is at most speed/60 + 1e-9. Every path keeps ≥ radius + 4 px from obstacles and arena edges. Measured speed is 200 px/s while moving. |
| 2 | `tests/movers.test.ts` | Two separate `Room`s with the same movers, ticked N times, have identical positions, equal **exactly** to `moverPath(p, tick/60)`. Movers do not count in `isFull()` or `playerCount`. `lab` is ignored in `main`. Removing a pattern removes its entity. |
| 3 | `tests/protocol.test.ts` | Validators: `hello.spectate` must be a boolean; `lab.movers` must be an array of known names. |
| 4 | `tests/netcode.test.ts` | A spectator gets `welcome` with `spectator: true`, adds no player, and its `input` is ignored. With interpolation off, its render state equals the room's positions **exactly** at the last snapshot tick. |
| 5 | `tests/netcode.test.ts` | Remote-error semantics on a clean link at exactly 60 frames/s. Interpolation on: lag ≈ 20 px (100 ms × 200 px/s, ±6) and frozen < 5 %. Interpolation off: frozen 40–60 % and lag < 10 px. |
| 6 | `tests/netcode.test.ts` | At 50 ms ± 30 ms: wobble with interpolation off > 2 × wobble with it on, and frozen % off ≥ frozen % on + 30 points. (This is the demo checkpoint as a test.) |
| 7 | `tests/compare.test.ts` | `layoutPanes` at 1280×720 and 1920×1080 for n = 2, 3, 4, with the drawer open and closed: letterbox ≤ 10 % (0 by construction), canvas scale ≥ 0.35, aspect within 1 % of 16:9. |
| 8 | `tests/compare.test.ts` | `InputDriver` with fake clients and a fake RAF: every client gets the same `keys` before each `simStep()`, the same number of steps, and `sendInputs()` every second step. |
| 9 | `tests/compare.test.ts` | Every preset has 2–4 panes, unique ids, and a complete network config. The Interpolation preset differs only in `interpolation`. |

**Smoke (`scripts/smoke.mjs`):** after the bot run, open a direct spectator connection to `:8080` in `lab`, send `lab` with all four patterns, and assert that 1 s of snapshots contains 4 movers at `moverPath(tick/60)`. This checks the real WebSocket adapter.

---

## 7. Exit checklist

The phase rules from `PHASES.md` apply, plus these:

- [ ] `npm test`, `npm run typecheck` and `npm run smoke` pass.
- [ ] Browser check (scratchpad `playwright-core` with local Chrome, `channel: 'chrome'`, as in Phase 1) at **1280×720 and 1920×1080**:
  - each preset, with screenshots;
  - pane letterbox measured as canvas rect vs host rect, ≤ 10 %;
  - the **demo checkpoint**: Interpolation off vs on at 50 ± 30 ms. Movers stutter on the left (bunched trail, frozen ≥ 50 %) and glide on the right (even trail, frozen ≈ 0 %). Values recorded in `log.md`.
- [ ] Frame rate with 4 panes + spectator ≥ 55 fps on the dev laptop (record it).
- [ ] Docs updated:
  - `PROTOCOL.md` (§2 messages);
  - `DEMO_SCRIPT.md` (§8 becomes "Compare view", with the new 340 ms figure and the interpolation demo);
  - `ASSUMPTIONS.md` (D1–D7, how the true position is computed, refresh-rate note);
  - `GAMERULES.md` §14 (the lab room has movers and spectators);
  - `README.md` (Compare);
  - `PHASES.md` (status, and the C4 wording updated to match D3).
- [ ] No processes left running and ports 5173/8080/9000/9001 are free. Suggested: tag `phase-2`.

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| Four Phaser games (WebGL contexts) plus one hidden client may load the presentation laptop | Measure fps (exit checklist). Fallback: `Phaser.CANVAS` for panes, or the hidden spectator renders nothing (it has no scene at all). A single Phaser game with several cameras is the bigger fix, deferred to Phase 4 if needed. |
| The server clock estimate depends on server loop timing (Windows 15.6 ms timer) | The offset is averaged (EMA); test 5 pins lag on a clean link. If a pane shows unexpected lag on a clean link, check this first. |
| Movers belong to the whole room: two browser tabs in Compare overwrite each other's mover choice | Accepted (one presenter). Documented. |
| StrictMode in dev mounts Compare twice, giving more "closed before established" warnings (now 3–5 clients) | Accepted, dev only (`ASSUMPTIONS.md` #18). Update the count. |
| Extracting `EmulatorControls` could break the Quick Match lab | Step 4/5 regression check in the browser; the slider-sync code moves unchanged. |

## 9. Not in Phase 2

- Different network conditions per pane (the emulator already supports `target: <label>`). Candidate for Phase 4's presenter steps.
- The packet strip in Compare, name tags (Phase 4).
- Choosing a sync model per pane (Phase 3; `PaneSpec.sync` is reserved).
- Presenter hotkeys for comparison presets (Phase 4).
- An "align players" lab command that puts every pane's player on the same spawn point. It would show that prediction does not change when inputs reach the server. Easy to add later; optional.

## 10. Deviations from this plan

| # | Where | Change | Why |
|---|---|---|---|
| X1 | D3 / §4.1 / tests 5–6 | **Lag and wobble are measured as the drawn mover's effective delay in ms**, not as px distance. For each frame, τ is the delay at which the true path passes through the drawn position while heading the same way the drawn mover last moved. Lag is the median τ; wobble is the interquartile range / 1.35 (equal to the std-dev for normal noise, but not swamped by a rare glitch). The px distance is still reported (`moverErrorPx`), as is frozen %. | Raw distance depends on the shape of the path: at a stop or a reversal it swings between 0 and 30 px even with perfect interpolation, which would have hidden the network effect. Delay in ms is independent of the path and reads naturally: 50 ms network + 100 ms interpolation ≈ 150 ms. Harness at 50 ± 30 ms: interp on 158 ms ± 5.9, 30 px, 2 % frozen; off 67 ms ± 36, 14.5 px, 67 % frozen. |
