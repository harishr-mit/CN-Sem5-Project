# NoBu Shooter — Project Phases

**Audience:** the project owner and any agent implementing the next phase.
**Status:** Phases 1 and 2 done (2026-10-09; Phase 2 plan, decisions D1–D7 and deviations in `docs/PHASE2_PLAN.md`). The separate bug-fix run on branch `game` (keys, leave match, one lab spawn point) was merged on 2026-10-10. Phase 2.5 (gameplay + textures, added by the owner) done 2026-10-10. Phase 3 (sync models) done 2026-10-10 (plan, decisions D1–D10 and deviations in `docs/PHASE3_PLAN.md`). Phase 4 (Presenter mode + polish) done 2026-10-11 (plan, decisions D1–D11 and deviations in `docs/PHASE4_PLAN.md`). Phase 5 (realistic transport + standalone emulator) done 2026-10-12 (plan, decisions D1–D15 and deviations in `docs/PHASE5_PLAN.md`). Phase 6 (lockstep + final verification) done 2026-10-12 (plan, decisions D1–D12 and deviations X1–X8 in `docs/PHASE6_PLAN.md`). **All six phases are complete.** What remains is the owner's rehearsal on the presentation laptop (`docs/REHEARSAL.md`). Phase 7 (multiplayer readiness, LAN: the game edition, private rooms, asset tiers) done 2026-10-12 (plan, decisions D1–D16 and deviations in `docs/PHASE7_PLAN.md`); its option B (internet play) is future scope.
**Replaces:** `ROADMAP.md` (draft of 2026-10-09). The v1 build spec is archived at `docs/archive/SPEC-v1.md`. `GAMERULES.md` remains the source of truth for gameplay.

The project moves in six phases, plus Phase 2.5 inserted by the owner on 2026-10-10 (and Phase 7, multiplayer readiness, added by the owner on 2026-10-12 and done the same day). Each phase ends with something you can **show** (a demo checkpoint) and something you can **check** (exit criteria). After Phase 6, all four goals below are met.

---

## Goals

| # | Goal | What the audience should see |
|---|---|---|
| G1 | **Sync models: snapshot vs state** | The same movement under the same network conditions, rendered by different synchronisation strategies side by side, with measured bandwidth, latency and error |
| G2 | **Prediction and reconciliation** | Instant local movement, a lagging authoritative ghost, and visible, measured corrections that disappear when the network is clean |
| G3 | **A standalone network emulator** | A separate proxy process that impairs any WebSocket or UDP app and has its own dashboard. The game is one client of it, not a dependency |
| G4 | **A smooth, impressive demo** | A guided presenter flow, no dead time, nothing broken on screen, and art that is easy to re-texture |

## Overview

| Phase | Theme | Demo checkpoint (what you can show at the end) | Goals | Status |
|---|---|---|---|---|
| 0 | v1 build | Game, emulator and Network Lab boot; visually good, but key numbers are wrong | — | done (before 2026-10-09) |
| 1 | **Correct core netcode** | Prediction/reconciliation demo with honest numbers: 0 corrections on a clean network, corrections under loss, A/B shows 17 ms vs 236 ms | G2 | **done 2026-10-09** |
| 2 | **Compare view + scripted movers** | 2–4 synchronised panes plus a ground-truth reference pane, with moving targets that make interpolation visible | G1 foundation, G2 | **done 2026-10-09** |
| 2.5 | **Gameplay + textures** | Textured survivor avatars with colour rings and a local-player marker, four rotating maps, ammo + reload, five power-ups, sound effects | G4 (and netcode material for G1/G2) | **done 2026-10-10** |
| 3 | **Sync models: snapshot vs state** | Full snapshots vs delta snapshots vs state sync with extrapolation, side by side, with a live bandwidth chart | G1 | **done 2026-10-10** |
| 4 | **Presenter mode + polish** | A guided, keyboard-driven talk track (N = next step), polished arena and UI | G4 | **done 2026-10-11** |
| 5 | **Realistic transport + standalone emulator** | Real UDP between Node "network players", emulator and server. The emulator dashboard works with no game running | G3 | **done 2026-10-12** |
| 6 | **Lockstep + final verification** | Deterministic lockstep freezing under 2–5 % loss beside snapshot sync. Full rehearsal and docs | G1, all | **done 2026-10-12** |
| 7 | **Multiplayer readiness** (owner 2026-10-12) | Players on other machines on the LAN open the game in a browser and join a quick match or a private room; operator tools stay in the demo | — | done 2026-10-12 (`docs/PHASE7_PLAN.md`) |

Each phase builds on the previous one. Phases 4 and 5 are independent of each other and can be swapped if the presentation date requires it.

### Rules for every phase

1. Before starting, add the phase tasks to `log.md` as `[ ]` and set them to `[~]` while working on them.
2. The phase is finished only when all of these pass:
   - `npm test`
   - `npm run typecheck`
   - `npm run smoke`
   - a browser check of the demo checkpoint (from Phase 4 on, `npm run shots`)
3. Update the docs the phase touches (`docs/PROTOCOL.md`, `docs/DEMO_SCRIPT.md`, `docs/ASSUMPTIONS.md`, `README.md`).
4. Leave no running processes and no bound ports (TCP 5173, 8080, 9000, 9001; from Phase 5 also UDP 8081 and 9100).
5. Suggested: commit and tag the end of each phase (`phase-1`, `phase-2`, …) so every stage can be checked out and demoed on its own.

---

## Phase 0 — v1 build (done, for reference)

Built from `docs/archive/SPEC-v1.md` and `GAMERULES.md` by earlier agents:

- shared deterministic simulation
- authoritative 60 Hz server with bots
- WebSocket emulator with a control port
- Phaser + React client with the Network Lab, packet strip, packet inspector and A/B view

In the 2026-10-09 audit, the app looked good, but the core demo claims were false. Those findings became Phase 1.

---

## Phase 1 — Correct core netcode ✅ (2026-10-09)

**Goal:** every number and effect the prediction/reconciliation demo relies on is true and covered by a test.

### Fixed

| ID | Problem | Fix |
|---|---|---|
| R1 | With redundancy off, only the newest input was sent, so half of all inputs never reached the server. The result was 6 corrections/s on a perfect network | Send every input created since the last send |
| R2 | Interpolation never ran (clock offset never estimated) | EMA clock offset, re-anchoring, interpolation, ≤ 100 ms extrapolation, respawns not lerped |
| R3 | Input → Screen was always 0 ms | Measured: with prediction, input → presented frame; without, ack delay + interpolation delay + 1 frame. New ack-delay metric |
| R4 | Aim used the server position; the ghost showed with prediction off | Aim recomputed every frame from the rendered position. Prediction off renders the local player like a remote one; ghost hidden |
| R5 | `NetClient` wrote straight into the UI store | Headless `NetClient`: injectable transport and clock, `on(...)` events, `bindStore.ts` adapter, StrictMode-safe reconnects |
| R6 | Tests never exercised `NetClient` or `Room` | `tests/netcode.test.ts`: real `GameServer` + `NetClient` + emulator `Pipeline` on fake timers. Verified to catch R1 (169 corrections with the old code) |
| R7 | Bots froze against pillars | Line-of-sight check, strafing in a distance band, unsticking. A test verifies the old code fails |
| R8 | The server busy-spun a full CPU core | Hybrid loop (sleep one OS timer quantum, then yield). Measured **0.9 % CPU at 60–61 Hz** on Windows |
| R9 | `npm run demo` left orphan processes on Windows | Single-process children, a port check before start, tree kill on exit, children exit if the launcher dies (verified with a hard kill) |
| R10 | Small fixes | See the list below |

R10 covered:

- Presets are now complete configs, so the Burst switch no longer stays on.
- The emulator reports the active preset, the session label and windowed loss per session.
- New Loss ↑/↓ and Server-tick tiles.
- The packet strip no longer freezes after 300 events, shows only your own session, and draws impairment chips.
- Slider changes are merged rather than dropped.
- Perturb respects obstacles.
- The lab room is always `RUNNING`.
- Death and hit particles are visible.
- The "/s" metrics are real 1 s windows.
- `npm run typecheck` covers server and emulator code (they were never type-checked before).

### Measured in the browser (local Chrome, `npm run demo`)

| Scenario | Before | After |
|---|---|---|
| Baseline, moving | 6 corrections/s, 3.3 px | **0 /s, 0 px** |
| Transatlantic (90 ms one-way), moving | — | 0 corrections, RTT ≈ 190 ms, Input → Screen 17 ms |
| Same, prediction off | Input → Screen "0 ms" | **≈ 340 ms** |
| 10 % loss, redundancy off | — | ≈ 2–3 corrections/s, ≈ 7 px; Loss tile ↑9 % ↓6 % |
| A/B at Transatlantic | both "0 ms" | **Pane A 236 ms vs pane B 17 ms** |
| Server CPU | 100 % of one core | 0.9 % |

### Exit criteria — met

27 tests pass (including 9 harness tests and 3 new rules tests), typecheck is clean, smoke passes under Nightmare (server at 61 Hz), the browser check was done, and all ports were freed.

### Carried forward (deliberately not in Phase 1)

| Issue | Goes to |
|---|---|
| Nightmare caps bandwidth at 400 kbps, but full snapshots need about 380–450 kbps, causing bufferbloat (ack delay ≈ 700 ms) | Phase 3 (delta snapshots are the fix *and* the lesson) |
| A/B panes are letterboxed with large empty areas | Phase 2 |
| Lab panel needs scrolling at 1600×900; no name tags in the arena | Phase 4 (name tags in 2.5; Lab fixed in Phase 4) |
| In dev mode, StrictMode prints 3 harmless "WebSocket closed before established" warnings | accepted (dev only) |

---

## Phase 2 — Compare view + scripted movers

**Goal:** a flexible side-by-side comparison screen. It is the stage on which every later comparison (sync models, toggles, transports) is shown.

**Implementation plan:** `docs/PHASE2_PLAN.md` (decisions D1–D7 approved 2026-10-09). The table below reflects those decisions.

### Scope

| ID | Task |
|---|---|
| C1 | **Compare view** (replaces A/B): 2–4 panes. Each pane has its own `NetClient` and emulator session, plus a per-pane config of toggles (and, from Phase 3, a sync model). **One shared input driver** steps every pane with the same keys on the same tick, so all panes send identical input sequences. Each canvas is sized to exactly 16:9 in the grid that makes panes largest, so there is no letterboxing; the leftover space becomes a **compare dock** (comparison table, sparklines, later the Phase 3 bandwidth chart). The Network Lab opens as an overlay drawer (`Tab`). |
| C2 | **Reference pane**: a *spectator* connection (`hello.spectate`) made *directly* to the server, bypassing the emulator. It joins no player and draws the newest snapshot as-is, so the ground truth for every pane's player and every mover is on screen. Compare always opens this connection, because it also serves as the server clock for C4; the switch only shows or hides the pane. |
| C3 | **Scripted movers** in the `lab` room: circle, zigzag, sudden reversal, stop–go. Their paths are pure functions of server time (`shared/src/sim/movers.ts`), so they are deterministic and any client can compute their exact true position. They are sent as ordinary `PlayerSnap` entries with a `mover` field, so interpolation (and Phase 3's encoders) treat them like any remote player; they don't count toward the player cap. A `lab` message selects the active patterns from the Compare view. |
| C4 | **Per-pane metrics bar**: Input → Screen, ack delay, RTT, corrections/s, bandwidth ↓, and **remote error** measured against the movers' exact true position: **lag** (how old the drawn position is, median ms), **wobble** (spread of that delay, ms), distance (px) and **frozen frames** (%). A single mean distance would rate interpolation as *worse* (≈ 30 px vs ≈ 14 px at 50 ± 30 ms), although it is visibly smoother — what interpolation buys is smoothness at the price of a fixed lag (harness: 158 ms ± 6 with it, 67 ms ± 36 and 67 % frozen frames without). See `docs/PHASE2_PLAN.md` §10 X1. |
| C5 | **Comparison presets** (one click), each changing **one** setting: "Prediction off vs on" (Transatlantic; interpolation stays on in both panes, so pane A shows ≈ 340 ms Input → Screen vs ≈ 17 ms), "Interpolation off vs on" (50 ms ± 30 ms jitter, all movers, reference pane shown), "Redundancy off vs on" (50 ms, 10 % loss), and Custom. Their network conditions are applied as complete emulator configs (ad-hoc named presets), so nothing carries over from the previous preset. |
| C6 | Tests: movers are deterministic, continuous and clear of obstacles; the spectator/reference matches server positions exactly; the lag/wobble/frozen metrics behave as described in C4 (the demo checkpoint as a test); pane layout has no letterboxing; the input driver feeds every pane identically; the smoke test sees movers over a real WebSocket. |

**Demo checkpoint:** open Compare and choose "Interpolation off vs on" at 50 ms ± 30 ms jitter. The movers stutter in the left pane and glide in the right one: their trails are bunched on the left and evenly spaced on the right, frozen frames read ≥ 50 % vs ≈ 0 %, wobble is high vs low (≈ 36 ms vs ≈ 6 ms) — and the lag is larger on the right (≈ 150 ms = 50 ms network + 100 ms interpolation delay), which is the price of that smoothness.

**Exit criteria:** the phase rules above; at 1280×720 and 1920×1080 no pane has empty letterbox bars larger than 10 % of the pane; Compare with 4 panes runs at ≥ 55 fps on the dev laptop.

---

## Phase 2.5 — Gameplay + textures (owner request) ✅ (2026-10-10)

**Goal:** the game looks and plays like a finished shooter before the sync-model work, so Phase 3's encoders are built against the final game state (weapons, ammo, pickups, map id) instead of being reworked later.

Rules: `GAMERULES.md` revision 2026-10-10 (§3 maps, §6 weapons, §6a ammo/reload, §6b power-ups, §17 look, §18 sound). Assets: `NoBu-Shooter/assets/` (`README.md` = inventory, `CREDITS.md` = licences). The `lab` room and the Compare view stay movement-only on the `neon` map, so the Phase 2 demos are unchanged.

| ID | Task | log.md |
|---|---|---|
| A0 | **Asset pipeline** (was Phase 4 P3): Vite serves `NoBu-Shooter/assets/`; a `preload()` manifest loads textures, animations and sounds; every key falls back to the procedural drawing (or silence) when its file is missing. The `// TEXTURE:` markers stay. | T52 |
| A1 | **Player look**: survivor body + feet animations per weapon/state, rotated to aim; colour ring + coloured name tag; cyan shoulder marker for the local player; shield bubble for spawn protection; bullet, muzzle flash, spark FX; drone target for movers. | T52 |
| A2 | **Maps**: `maps` config (`neon` + `warehouse`, `plaza`, `overgrown`), floor + obstacle skins, rotation per match, map id in the snapshot; tests for clearance and symmetry. | T55 |
| A3 | **Weapons, ammo, reload**: `weapons` config, input flag `r`, server ammo/reload/cooldown, shotgun fan, client-predicted ammo with reconciliation, HUD ammo + reload bar; key `R` (reconciliation moved to `C`). | T53 |
| A4 | **Power-ups**: pads, seeded spawns, server-decided pickups, five effects, speed in prediction, HUD timers, pickup icons. | T54 |
| A5 | **Sound**: event → sound map (§18), distance volume, voice cap, mute `M`, Settings volume, audio unlock on first click. Respawn, power-up end and UI clicks are silent. | T56 |
| A6 | Protocol + docs + credits: `docs/PROTOCOL.md` (input `r`, player fields, pickups, map id), README controls/credits, Credits screen, `docs/DEMO_SCRIPT.md`, `docs/ASSUMPTIONS.md`. | T52–T56 |

Suggested order: A0 + A1 → A2 → A3 → A4 → A5 (A6 alongside each).

**Demo checkpoint:** Quick Match on each map in turn: distinct-looking players with colour rings and your marker, reload with `R`, grab Rapid Fire / Spread Shot and see the rifle/shotgun animations and sounds. Under Transatlantic, run over a contested pickup and watch the server give it to the other player; the HUD ammo counter corrects itself when a predicted shot is rejected.

**Exit criteria:** the phase rules; Quick Match stays at ≥ 55 fps on the dev laptop with 8 players and textures; snapshot size growth from the new fields recorded in `docs/ASSUMPTIONS.md` (it feeds the Phase 3 bandwidth baseline); smoke passes under Nightmare with bots firing and reloading.

**Result (met):** 96 tests (new: `combat`, `maps`, Phase 2.5 rules, weapon-prediction harness — 0 ammo corrections on a clean link, corrections that converge at 20 % loss), typecheck clean, smoke passes under Nightmare with the new ammo/reload/bot-shot/pad/map checks. Browser (local Chrome): Quick Match on all four maps at 60 fps (4 players), no console errors, every asset loaded; Compare 2 panes and 4 panes + REF at 60 fps at 1920×1080 with unchanged Phase 2 numbers. Snapshot growth +36 % (ASSUMPTIONS #40). Owner change during the phase: shotgun = 3 pellets with a 20° spread. Not measured: 8 human players (bots fill to 4).

**Revision 2 (owner, 2026-10-10, T58–T60):** power-ups at random spots, capped at ⌊players / 2⌋ with a 10 s refill and weighted kinds; power-up weapons = 1 + 1 magazines; pistol reloads forever; Ammo replaced by Piercing + Dash; no colour rings in Compare, ghost replaces the local ring in Quick Match; developer Invincible switch under `npm run demo` only. 105 tests, smoke and a browser check pass.

---

## Phase 3 — Sync models: snapshot vs state (G1)

**Goal:** show the trade-offs between synchronisation strategies with measurements.

**Implementation plan:** `docs/PHASE3_PLAN.md` (decisions D1–D10; owner answers of 2026-10-10 included: Quick Match sync switch with default Full, three comparison presets, State at 10 Hz switchable to 30 Hz). Deviations Y1–Y7 in its §10.

### Models

| Model | Server sends | Client does | What it demonstrates |
|---|---|---|---|
| **S1 Full snapshot + interpolation** (current) | The whole world, 30 Hz | Renders 100 ms in the past | Smooth and self-healing, but always behind and bandwidth-heavy |
| **S2 Delta snapshot** | Only what changed since the last snapshot the client *acked* (the client sends `snapAck`). Falls back to full when the base is too old | Rebuilds full state from its base | ~70–90 % less bandwidth. Under loss the base goes stale and costs rise. **Fits under Nightmare's 400 kbps cap where S1 doesn't** |
| **S3 State sync + extrapolation** (dead reckoning) | Complete entity records plus velocity at 10 Hz (default) or 30 Hz, switchable per connection | Simulates remote entities forward from the last state, no interpolation delay; blends on update | Lowest latency for remote entities, but overshoot and rubber-banding on direction changes |

### Scope

| ID | Task |
|---|---|
| S0 | Sync-model interface (`shared/src/sync/`): a server encoder and client decoder pair, selected per connection in `hello` (`sync: "full" \| "delta" \| "state"`, State with `hz` 10 or 30) and switchable live with a `sync` message (spectators always get Full). Encoders cover the Phase 2.5 state too (`players[].aim/weapon/reloading/shield/fast`, `me`, `pickups`, `match.map`). Baseline: full snapshots ≈ 2.1 kB / ≈ 510 kbps in a 4-player match. |
| S1 | Protocol messages `snapDelta`, `state`, client `sync` and `snapAck` (acks also ride on `input.sa`), with validators. Documented in `docs/PROTOCOL.md`. |
| S2 | Delta encoder/decoder with baseline tracking and a full-snapshot fallback. |
| S3 | State encoder (position + velocity, configurable rate) and an extrapolating client renderer with error blending. |
| S4 | Compare view: a sync model per pane (`PaneSpec.sync`, reserved in Phase 2; SYNC chip / `Y` cycles Full → Delta → State 10 → State 30), plus a **live bandwidth chart** comparing panes (↓ wire kbps over time, with the emulator's cap line) in the compare dock. Three comparison presets: **Sync models** (Full / Delta / State 10 at Nightmare), **Bandwidth** (Full vs Delta on a clean 300 kbps link), **State rate** (State 10 vs 30 Hz at Transatlantic). Quick Match: a SYNC MODEL row in the Network Lab (`Y`), default Full (owner, 2026-10-10). |
| S5 | Tests: a delta round-trip equals the full snapshot (including under loss with the fallback); extrapolation error is 0 on straight lines and bounded on reversals; per-model bandwidth falls within an expected range. |

**Demo checkpoint:** the "Sync" preset — three panes (Full / Delta / State 10) at the Nightmare preset with all four movers (no REF pane, so the dock with the bandwidth chart fits). Delta stays responsive where Full builds a queue, and State reacts instantly but rubber-bands on the zigzag mover. The bandwidth chart shows the difference.

**Exit criteria:** the phase rules; measured delta bandwidth ≤ 40 % of full in the baseline lab scene (recorded in `docs/ASSUMPTIONS.md`).

**Result (met, 2026-10-10):** 130 tests (new: `sync` 14 — diff/patch, delta streams at 30 % loss with reordering and duplication, fallbacks after a 2 s outage with no event lost, state encoder, GameServer per-connection encoders; `extrapolate` 6; netcode harness +4 — every model shows the server's world exactly with 0 corrections, live switch keeps the player, delta ≤ 40 % / state 10 Hz ≤ 45 % / state 30 Hz ≥ full bytes, state draws movers ≥ 60 ms more current, Nightmare full queues while delta stays exact), typecheck clean, smoke passes (new step: full + delta `NetClient`s under Nightmare, every decoded delta world equals the spectator's, 0 missing bases). Browser (local Chrome, 1920 × 1080 and 1280 × 720, 60 fps, 0 console errors): **Sync** at Nightmare — ack delay Full ≈ 740 ms / Delta ≈ 310 ms / State 10 ≈ 360 ms, mover lag ≈ 640 / 250 / 170 ms, ↓ ≈ 400 / 60 / 160 kbps, off-path 0 / 0 / 33 %; **Bandwidth** (300 kbps) — ack ≈ 560 vs 140 ms, lag ≈ 570 vs 150 ms; **State Hz** — off-path ≈ 35 % vs 8 %, ↓ ≈ 105 vs 320 kbps; Quick Match under Nightmare — `Y` to Delta lowers the ack delay ≈ 660 → 325 ms and ↓ ≈ 410 → 130 kbps without leaving the match. Phase 2 numbers unchanged (Interpolation preset: frozen 67 % vs 3 %).

---

## Phase 4 — Presenter mode + polish (G4)

**Goal:** a talk you can give with one hand on the keyboard, on an arena that looks finished.

**Implementation plan:** `docs/PHASE4_PLAN.md` (decisions D1–D11, approved 2026-10-11; owner answers of 2026-10-10 included: two separate presenter scripts, Invincible on during Quick Match presenter steps, glow in Quick Match only, `playwright-core` as a local devDependency with git-ignored screenshots). Name tags, consistent player colours and rotating aim already exist from Phase 2.5.

| ID | Task |
|---|---|
| P1 | **Presenter mode**: two scripted step sequences (data files mirroring `docs/DEMO_SCRIPT.md`), each started from its own landing button (owner): **Quick Match** (12 steps: baseline → prediction → loss/redundancy → reconciliation → jitter/interpolation → nudge → Nightmare with Full / Delta / State) and **Compare** (6 steps: the six comparison presets). Each step is a complete state (network, toggles, sync model or Compare preset) and shows a caption with what to watch, the expected numbers and a step timer. `N` / `B` move to the next or previous step; `H` hides the caption; an END button leaves. In Quick Match the presenter switches on the developer **Invincible** toggle (owner; needs `npm run demo`). Per-pane network conditions: not in Phase 4. |
| P2 | Arena: remote aim chevrons, death markers, a respawn pulse for every player, and camera bloom (Phaser FX) in **Quick Match only** (owner), on at Graphics Quality *high* and switched off automatically below 45 fps — *removed again on 2026-10-11 (owner: the glow made things look worse), together with Graphics Quality and the fps auto-off.* Name tags and consistent colours: done in Phase 2.5. |
| P3 | ~~Texture-ready assets~~ — moved to Phase 2.5 (A0). |
| P4 | Lab panel: collapsible sections (remembered), no scroll at 1920×1080, compact at 1280×720, and a projector UI-scale setting (100 / 115 / 130 %). |
| P5 | Packet strip: queue-depth bar (emulator reports `queueMs`), visible reorder overtakes (emulator marks `reordered`), legend. |
| P6 | Landing page: Quick Match, Compare, Presenter — Quick Match, Presenter — Compare, Emulator dashboard (disabled until Phase 5). |
| P7 | `npm run shots`: a script using `playwright-core` (local devDependency of `NoBu-Shooter`, owner) with the locally installed Chrome (`channel: 'chrome'`, no browser download) that starts the demo, captures every screen at 1280×720 and 1920×1080 into `NoBu-Shooter/artifacts/shots/` (git-ignored, owner), records fps and console errors, and stops the demo. |

**Demo checkpoint:** start each Presenter script and press `N` through it, with no mouse fiddling and every effect appearing on cue.

**Exit criteria:** the phase rules; `npm run shots` output reviewed against a short visual checklist (no unstyled elements, no overlap, readable at 1280×720).

**Result (met, 2026-10-11):** 147 tests (new: `presenter` 13 — complete steps, existing presets/networks, no leakage between steps in any direction, nudge only on entering, Invincible on/off, NetClient change events; `emulator` +4 — queue depth grows over the cap and drains, reorder marks only on overtaken packets), typecheck clean, smoke passes (6 steps; delta 32 % of full, ack delay 364 vs 646 ms). `npm run shots`: 20 screens × 1280×720 / 1920×1080, 0 console errors, reviewed against `docs/VISUAL_CHECKLIST.md` (two findings fixed: a wrapping Lab title, the Q10 expected numbers). Demo checkpoint: both scripts pressed through with `N` only (local Chrome) — every step applies its network, toggles and sync model; `B` returns to identical states; `H` hides the bar; END returns to the landing page. Quick Match 57–60 fps **with bloom** at 1920×1080 on the laptop's Intel UHD (one blur step; four steps gave 28–32 fps); Compare 4 panes + REF 60 fps. Lab without scrolling at 1920×1080 (100/115/130 %), 1600×900 and 1280×720 with default sections. Strip under Nightmare: queue bar ≈ 100–400 ms, reordered packets overtaken. Fixed on the way: leaving a match after sounds played threw (Phaser sound teardown, since 2.5); switching views 6 times exhausted Chrome's 16 WebGL contexts (since Phase 2); full-screen modal blur halved the fps under bloom. Details: `log.md` T69–T75, `docs/ASSUMPTIONS.md` #60–#72.

**Owner revision (2026-10-11, T76–T82):** Presenter — Quick Match stops the match clock (HUD ∞); both presenter bars have ⟲ RESTART (game to its starting case, step 1) and map buttons (restart the game on that map; the lab room in Compare too); developer **Give power-up**; SYNC MODEL shown as two groups (Snapshots: Full / Delta — State sync: 10 / 30 Hz), still one choice. Found and fixed on the way: the countdown teleport showed as a huge correction for players who hadn't died (since Phase 1); a removed Compare pane resized to 0 × 0 for one frame (intermittent WebGL framebuffer error); the strip's dot glow cost enough under Nightmare to switch the bloom off. 162 tests, smoke, `npm run shots` (40/40, 0 console errors). Details: `docs/ASSUMPTIONS.md` #73–#81.

**Owner changes (2026-10-11, T83–T85):** one power-up per player (was ⌊players / 2⌋), a new one every 7 s (was 10 s), 2-minute matches (was 3); the arena "haze" was the camera bloom over textured floors; the owner then had the glow **removed entirely** (with the Graphics Quality setting and the fps auto-off that existed only for it). `docs/ASSUMPTIONS.md` #82–#84.

---

## Phase 5 — Realistic transport + standalone emulator (G3)

**Goal:** real game networking uses UDP, so the server and emulator speak UDP too. The emulator becomes a tool in its own right.

**Implementation plan:** `docs/PHASE5_PLAN.md` (decisions D1–D15, drafted 2026-10-12, revised the same day, approved and implemented 2026-10-12; deviations in its §8). Owner answers of 2026-10-12 included: messages over 1200 B are split into **app-level fragments** (U2); the in-game Lab and Presenter impair **only the game's own WS route**; the dashboard is a **self-contained page**, and the emulator can start **with no routes** and get any listen → target route (WS or UDP, any ports) from the dashboard at runtime (U8, new); network players play like the server bots, start with `npm run demo -- --swarm 3` too, and get a Presenter step. **Revision (owner, 2026-10-12):** because the game is meant to become a real multiplayer game, only the emulator's control port (`:9001`) is locked to this machine. The server's WS and UDP ports and the emulator's data routes accept connections from other machines, as `:8080` / `:9000` do today, and every bind address is configurable (plan D7, D15).

```text
Browser (Phaser)  ──WS──►  Emulator :9000 (WS mode)  ──WS──►  Server :8080
Node net-players  ──UDP─►  Emulator :9100 (UDP mode) ──UDP─►  Server :8081
Emulator dashboard + control API: http/ws :9001 (never impaired, localhost only)
```

Browsers cannot open UDP sockets, so the browser stays on WebSocket and the emulator treats each WS frame as a datagram. There is **no TCP mode**: impairing a byte stream is not meaningful, and TCP retransmission would hide the loss.

| ID | Task |
|---|---|
| U1 | Server UDP adapter on :8081, feeding the existing `GameServer` core (`server/src/core.ts`, already transport-agnostic). It listens on the same interfaces as the WS server; `--host` / `NOBU_HOST` sets both. |
| U2 | Datagram discipline: every UDP datagram ≤ 1200 bytes. Full snapshots (1.3–2.1 kB) cannot be trimmed that far, so larger messages are split into **app-level fragments** and reassembled by the receiver (owner, 2026-10-12). The emulator impairs each fragment on its own, so one lost fragment loses the whole message; delta and state usually fit in one datagram. |
| U3 | Emulator UDP routes (`--route udp:9100=127.0.0.1:8081`): one session per source address (NAT-like), each with its own upstream socket, using the same `Pipeline`. Payloads are bytes, and the emulator no longer imports anything from the game. |
| U4 | **Network players**: `npm run swarm -- --n 3` (or `npm run demo -- --swarm 3`) runs headless `NetClient`s over UDP through the emulator. They play like the server bots (move, aim, shoot) from their own lagged view. They are remote players whose *own* traffic is impaired, which removes the "bots bypass the emulator" caveat. Presenter — Quick Match gains step Q13 "Network players" (owner). |
| U5 | **Emulator dashboard** served by the emulator on :9001 as a self-contained page (owner): routes, sessions, per-route / per-session and per-direction sliders, presets, live charts and a packet log. It works with no game running. The Landing button opens it. The in-game Lab and Presenter impair only the game's own route (owner). |
| U6 | `emulator/README.md`: how to put the emulator in front of *any* WS or UDP app, with a two-terminal example using generic tools. Optional: capturing the loopback UDP traffic in Wireshark. |
| U7 | Tests: the UDP adapter delivers exactly what the pipeline decides; two clients on one host get separate sessions; fragments reassemble and a lost fragment drops the message; routes added at runtime; the emulator imports nothing from the game. |
| U8 | **Runtime routes** (owner, 2026-10-12): `npm run emulator` starts only the dashboard + control API, with no data routes; routes (`ws` or `udp`, any listen port → any target) are added and removed from the dashboard or control API while it runs. `npm run demo` starts it with the two game routes. |

**Demo checkpoint:** run the emulator alone (`npm run emulator`), add a UDP route on the dashboard, put two generic UDP tools on either side of it (`npm run udp-send` / `udp-echo`, no game), set 20 % loss, and watch messages vanish. Then start the swarm: the network players visibly lag and correct in the browser while the dashboard shows their sessions.

**Exit criteria:** the phase rules; the smoke test also runs one UDP network player under Nightmare.

**Result (met, 2026-10-12):**
- **Tests:** 196 (new: `emulator-routes` 12, `emulator-udp` 8 over real sockets, `fragment` 7, `server-udp` 4, presenter Q13, an emulator queue-drop test). They include U7's "the UDP route delivers exactly what the pipeline decides" (seeded 30 % loss) and "two clients on one host get separate sessions", plus NetClient → emulator UDP → server UDP with 0 corrections on a clean link and fragmented full snapshots lost ≈ 19 % vs deltas at 10 % loss. Typecheck clean.
- **Smoke:** 7 steps; step 7 = one UDP network player under Nightmare: 220 world messages in 10 s, fragments reassembled, 6 lost to fragment loss, ack delay ≈ 500 ms.
- **`npm run shots`:** 23 screens × 2 viewports (new: Presenter Q13 with two network players, the dashboard, the dashboard under Nightmare), 0 console errors.
- **Demo checkpoint, part 1** (scratch browser check): emulator alone → route added on the dashboard → `udp-echo` / `udp-send` → 20 % loss → 22.7 % of the messages never came back, and the packet log showed them.
- **Demo checkpoint, part 2:** `swarm --n 3` through `udp:9100`: 300 snapshots each in 10 s, sessions named `UDP-1…3` on the dashboard.
- **Owner additions during the phase:** runtime routes between any ports (U8, `npm run emulator`); only the control port is local; purple piercing rounds (T96); README quickstart + command reference (T97).
- **Found and fixed on the way:**
  - a WS route on a busy port crashed the emulator instead of reporting the error;
  - a direction-only change on a route reached later sessions in both directions;
  - queue-drop delays were reported unrounded (since Phase 1);
  - dashboard layout at 420 px and 1280 px.
- Details: `log.md` T88–T97, `docs/ASSUMPTIONS.md` #85–#96.

---

## Phase 6 — Lockstep + final verification ✅ (2026-10-12)

**Goal:** complete the set of sync models and make the whole demo rehearsal-proof.

**Implementation plan:** `docs/PHASE6_PLAN.md` (decisions D1–D12, approved and implemented 2026-10-12; deviations X1–X8). Owner answers of 2026-10-12:
- the pane's **Rd chip** chooses how a lost tick is recovered: off = resend on request (a freeze of about one round trip), on = a redundant window;
- the preset has **three panes**: Full / Lockstep / Lockstep + Rd;
- your own player is **not predicted** in a lockstep pane;
- the **presentation laptop is another machine**, so the agent rehearses here and writes a checklist (`docs/REHEARSAL.md`) for the owner to repeat there.

| ID | Task |
|---|---|
| L1 | **S4 Deterministic lockstep** (lab room only, movement only): the server relays every player's input per tick (the inputs it consumed); clients simulate the world and *wait* when the next tick's input is missing. Your own player is not predicted. Lost ticks are recovered by a resend on request (Rd off) or a redundant window (Rd on). A periodic state hash proves the clients never diverge. A stall counter goes in the pane metrics. |
| L2 | Tests: lockstep clients stay bit-identical under loss (they stall but never diverge). |
| L3 | Compare preset "Snapshot vs Lockstep" (50 ms, 5 % loss, three panes: Full / Lockstep / Lockstep + Rd): the lockstep pane freezes in bursts while the snapshot pane carries on, and redundancy makes lockstep smooth again at the cost of input delay. Presenter — Compare gains it as step C7. |
| L4 | Final docs: `README.md` (architecture with UDP and WS, all commands), `docs/PROTOCOL.md`, `docs/DEMO_SCRIPT.md` (final talk track = Presenter steps), `docs/ASSUMPTIONS.md`. |
| L5 | Full rehearsal: the presentation laptop is another machine (owner). The agent does a dress rehearsal on the dev laptop: a cold start from a fresh copy (`npm install`, test, typecheck, smoke, shots), a timed headless run-through of both Presenter scripts, and a fix for anything that stutters. It writes `docs/REHEARSAL.md` (timing sheet + checklist) for the owner to repeat on the presentation laptop. |

**Demo checkpoint (final):** the complete Presenter run. It covers prediction and reconciliation, the four sync models side by side, the impairments shown live in the packet strip and dashboard, and the emulator used on its own.

### Result (2026-10-12)

- **L1 Lockstep** in the lab room:
  - Records of consumed keys per tick, with keyframes inside the stream, a 256-tick ring and a hash every 30 ticks (`shared/src/sync/lockstep.ts`, `server/src/game/room.ts`, `server/src/core.ts`).
  - On the client, `LockstepClient` handles playout 2 ticks behind, stalls, catch-up of up to 3 ticks per frame, NACK and the hash check (`client/src/net/lockstep.ts`). `NetClient` routes `ls` to it.
  - The Rd chip picks the recovery.
  - `LOCKSTEP_LAB_ONLY` elsewhere.
- **L2 Tests:**
  - `applyRecord` reproduces `Room.tick()` bit for bit over 2 000 ticks with backlogs, nudges, joins, leaves, movers, a map switch and a restart.
  - The encoder (both modes, window cap, ring, key requests) and the server keyframe triggers are covered.
  - Two lockstep clients through the emulator pipeline stay identical to the server at 50 ms + 5 % random loss, then 10 % burst loss with duplication and reordering: 0 desyncs (Rd off stalled 21 %, Rd on 1.8 %).
  - Also covered: a 2 s outage → resync; a clean link → no stalls; Input → Screen ≈ RTT + buffer.
  - Smoke step 8 runs the same check over real sockets.
  - 222 tests.
- **L3** The Compare preset **Snapshot vs Lockstep** is also Presenter step C7.
  - Measured in the browser: stalled – / ≈ 15–30 % / ≈ 3–5 %, freezes up to ≈ 300–650 ms vs 40–70 ms, Input → Screen 18 / ≈ 220–350 / ≈ 205 ms, ↓ ≈ 430 / 40 / 110 kbps, 0 desyncs.
  - On lockstep panes P / C / I / G are greyed out; the bar and the dock show STALLED, LONGEST, BEHIND, NACKED and DESYNC.
- **Found by the hash check (X1):** Chrome and Node disagree on the last bit of `Math.cos` / `Math.sin` for ≈ 3 % of angles. The movers now use a deterministic sine / cosine built from + − × ÷ only.
- **L4** Final docs:
  - `DEMO_SCRIPT.md` opens with the final talk track and its timings; §14 covers Lockstep.
  - `PROTOCOL.md` has `ls`, `lsNack` and the lockstep sync spec.
  - Also updated: `README.md`, `ASSUMPTIONS.md` #97–#109, `GAMERULES.md` §14 and `VISUAL_CHECKLIST.md` (25 screens).
- **L5** Dress rehearsal on the development laptop:
  - From a fresh copy: install 15 s, tests, typecheck, smoke 47 s.
  - A timed run-through of all 20 Presenter steps: ≈ 60 fps, 0 console errors.
  - It found that network players started with the demo spoil the Nightmare steps, so they now start at Q13 (X7).
  - `docs/REHEARSAL.md` holds the timing sheet and the presentation-laptop checklist.
- Details: `log.md` T99–T106.

---

## Phase 7 — Multiplayer readiness (LAN)

**Status:** **done 2026-10-12** (T108–T114; plan, decisions D1–D16 and deviations in `docs/PHASE7_PLAN.md`). Option A (LAN) is complete; option B (internet play) stays future scope, below.

**Demo checkpoint:** `npm run build` + `npm start` on the host; another machine on the same network opens `http://<host IP>:8080`, plays a quick match (join window, then bots), and a private room created on one browser is joined by code from another and started by its host. The page shows a ping and none of the demo's tools.

**Exit criteria (met):** 267 tests, typecheck, smoke 10 steps (steps 9–10: the built game on its own server — page, compression, refusals, a quick match through the join window with the game's client, a private room created / joined / started), `npm run shots` incl. 9 game screens, `npm run build`'s bundle guard (no demo code in the game JS); checked by hand from this laptop's LAN address (`npm start` and `npm run dev`). The owner's check from a second machine is the remaining step (it can't be done from one laptop).

**Goal:** turn the demo into a game that players on other machines can join, without handing them the operator's tools.

**What Phase 5 already prepares:** a transport-agnostic server with WS and UDP ports reachable from other machines (configurable bind address), and an emulator whose data routes can face the LAN while its control port stays local (`docs/PHASE5_PLAN.md` D7, D15).

### Owner decisions (2026-10-12)

- **Target: LAN play in the browser** ("option A": the operator's machine serves the game; players open its address, nothing to install) — on laptops and PCs, and since the owner revision on **phones and tablets** too (touch UI, below). Internet play ("option B") is future scope, below.
- **Players connect straight to the game server**, not through the emulator. The emulator is game-agnostic, so the operator can still put it in front by hand (a route from a public port to the server's port). Behind it every player appears to come from `127.0.0.1`, so nothing may trust "localhost" as proof of being the operator.
- **Transport: WebSocket** (TCP), as today.
- **The game uses one fixed set of the best settings**, chosen from the Phase 3–6 measurements:

  | Setting | Game | Evidence |
  |---|---|---|
  | Sync model | **Delta** (full snapshots stay as its fallback keyframe) | ≈ 1/5 of Full's bytes, off-path 0 %, best ack delay under a cap (Nightmare ≈ 310 vs 740 ms). State 10 overshoots (≈ 33 % off-path); lockstep stalls under loss and adds ≈ RTT + buffer (Input → Screen ≈ 204 vs 18 ms) |
  | Prediction + reconciliation + smoothing | **on** | G2: 0 corrections on a clean network |
  | Remote-player interpolation | **on**, 100 ms | Phase 1 default |
  | Input redundancy | **off** | Over WebSocket TCP already resends lost packets, so redundancy only adds bytes. Turned back on with a datagram transport (future option B) |

  No sync-model or netcode toggles, no Network Lab, Compare, Presenter, emulator client, lockstep / state clients or developer tools in the game's bundle.
- **Editions and commands** (names proposed, confirmed by the owner):

  | Edition | Command | What it is |
  |---|---|---|
  | Demo | `npm run demo` | unchanged: server + built-in emulator + client with Lab, Compare, Presenter |
  | Emulator | `npm run emulator` | unchanged: the standalone, game-agnostic emulator (WS + UDP routes, dashboard) |
  | Game, development | `npm run dev` | game server + Vite dev server with hot reload (HMR), reachable on the LAN |
  | Game, production | `npm run build`, then `npm start` | `build` makes the bundle; `start` runs one Node process that serves the bundle and the game WebSocket on one port |
- **One code base:** the demo and the game share the simulation, rules, maps, arena scene, effects, assets, HUD and netcode. The editions differ only in their entry point and in which tools they mount. A texture, effect or rule is changed once.
- **The game server refuses operator messages** (`dev`, `perturb`, `lab`, Presenter controls); `NOBU_DEV` is never set for it.
- **Quick match starts at once** (owner revision, 2026-10-12): the 10 s join window first built here was removed — late join already covers a slow joiner.
- **Private rooms with short codes** (owner, M6): CREATE ROOM gives a two-word code (`BLUE FOX`) that others type in JOIN ROOM or open as a link (`?room=blue-fox`). The room waits in a lobby for its host's START and returns there after each match. In every edition.
- **HUD:** the game shows the ping (round-trip time) only.
- **Graphics Quality setting** (low / medium / high): lower-resolution textures and lower-bitrate sounds at low, the full files at high; a match starts on low and upgrades in the background (`NoBu-Shooter/assets/README.md`).
- **Assets:** textures served as WebP and all sounds as OGG, generated from the masters in `assets/`; `stone_beige.png` (2.2 MB) served at ≤ 160 kB like the other floors; the raw player frames (7.6 MB, only used by `pack-assets`) move out of the served folder, for every edition.

### Owner revision (2026-10-12, after the first implementation; `docs/PHASE7_PLAN.md` R1–R9)

- **R1 Quick match:** no waiting time; it starts at once with bots (the join window was removed).
- **R2 Room options** (private rooms, set by the host in the lobby; owner: host only): **map** (default **Neon**, or rotation), **max players** (2–8, default **4**), **bots** (*fill empty slots*, default **off** — only the players who joined), **power-up interval** (off / 3–15 s) and **max on the map** (1–8), **always-on power-ups** (one weapon + Shield / Speed / Piercing / Dash; an always-on one never spawns; always-on Shield = every life starts shielded). The arena behind the lobby shows them live.
- **R3 Lobby:** lists everyone who joined; **LEAVE** on every waiting page; the room returns to its lobby after each match.
- **R4 Neon stays as drawn** (owner): it has no textures by design; "the dev loads without textures" was the Neon look, not a loading bug (every texture loads in dev — checked).
- **R5–R8 Phones and tablets** (both editions, only on touch devices): scaling for landscape and portrait (portrait = arena on top, controls below); touch aims and fires as before; a **joystick** bottom-left (size in Settings); a **DASH** button above it only with the Dash power-up, with a reveal animation; **RELOAD** and a **MENU** button on the right, the menu holding the non-critical actions (settings, mute, leave; the demo's Lab, inspector, Presenter bar).
- **R9** docs, tests, smoke, shots (touch screens).

### Items

| ID | Item | Decision |
|---|---|---|
| M1 | **Server address in the client:** it was `ws://127.0.0.1:…`, hard-coded (`App.tsx`, `CompareView.tsx`). The game derives it from the page's host (`/ws`, `?server=` override); the demo keeps its emulator route, on the page's host too (`net/serverUrl.ts`). | done |
| M2 | **Serving the client to other machines:** a production build (`vite build`) served by the game server (`npm start`); the dev server reachable on the LAN (`npm run dev`). | done |
| M3 | **Operator-only controls:** the game server refuses the operator messages; the Lab, Presenter and dev tools exist only in the demo. The emulator's control port stays local, as it is from Phase 5. | done (simplified as above) |
| M4 | **Transport hardening:** `wss://` (TLS); a UDP return-routability challenge before any snapshot is streamed (so a spoofed `hello` can't turn the server into a reflector); per-IP connection and rate limits. | future option B |
| M5 | **Browser datagrams:** WebTransport or a WebRTC DataChannel. | future option B |
| M6 | **Many players:** private rooms joined by a short two-word code, alongside the quick-match room. A room list is not planned. | done |
| M7 | **Game edition:** separate entry point, fixed best settings, ping HUD, game commands. | done |
| M8 | **Join window** before a match (all editions). | done, then removed (R1) |
| M9 | **Asset quality tiers** behind a Graphics Quality setting. | done |
| M10 | **Room options + lobby** (R2–R3). | done |
| M11 | **Touch UI** for phones and tablets (R5–R8). | done |

### Future scope: option B (internet play)

- A public host (cloud server or VPS), a domain and a TLS certificate: browsers require `https://` pages to use `wss://`, not `ws://` ("mixed content").
- M4 hardening: per-IP limits, and the UDP return-routability challenge.
- **A datagram transport for browsers** (M5: WebRTC DataChannel or WebTransport). Unreliable datagrams pay off on the lossy internet, not on a LAN, where loss is close to zero. The server core doesn't care about the transport, so this is one more adapter, the way UDP was in Phase 5.
- **Input redundancy back on with that transport.** Over WebSocket it stays off, because TCP already resends lost packets and redundancy would only add bytes. Over datagrams it pays: Q5 showed 0 corrections under loss with redundancy on.

### Definition of Done (all phases)

- [x] G1: four sync models are selectable and comparable side by side with measured bandwidth, latency and error. *(Full, delta, state in Phase 3; lockstep in Phase 6 — Compare only, the lab room.)*
- [x] G2: 0 corrections on a clean network; corrections under loss that converge; redundancy removes them (covered by tests and visible in the UI). *(Phase 1; re-measured in the Phase 6 rehearsal: Q1 0/s, Q4 ≈ 7 px corrections, Q5 0/s.)*
- [x] G3: the emulator runs standalone (WS + UDP) with its own dashboard and README, and the game is just one client of it. *(Phase 5: `npm run emulator`, runtime routes, no game dependency.)*
- [x] G4: Presenter mode runs the whole talk; screenshots pass the visual checklist; textures and sounds drop in through the manifest (Phase 2.5). *(Q1–Q13 and C1–C7; timed run-through at ≈ 60 fps, `docs/REHEARSAL.md`.)*
- [x] `npm run demo`, `npm test`, `npm run typecheck`, `npm run smoke` and `npm run shots` pass from a fresh clone. *(Fresh copy on the development laptop, 2026-10-12: install, test, typecheck, smoke and the demo in Chrome; shots in the working tree — `docs/PHASE6_PLAN.md` X6.)*
- [ ] The owner's rehearsal on the presentation laptop (`docs/REHEARSAL.md` §3–§4).
- [x] Phase 7: players on the LAN join in a browser (quick match or private room) from the game edition, which carries none of the demo's tools. *(Checked from this laptop's LAN address; a second machine is the owner's check.)*

---

## Out of scope

These are kept out unless the owner asks:

- a WebRTC DataChannel or WebTransport client (browser-native unreliable datagrams) — future option B of Phase 7
- lag compensation and predicted projectiles
- a TCP proxy mode
- matchmaking, accounts and persistence
- the gameplay items listed in `GAMERULES.md` §16
