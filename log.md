Shared context for every agent working in this directory. Read this file **before** starting work and update it **as** you work.

## Status Legend

|Marker|Meaning|
|-|-|
|`\[ ]` TODO|Planned, not started|
|`\[\~]` WORKING|In progress (set *before* starting the task)|
|`\[x]` DONE|Completed and verified|
|`\[!]` FAILED|Attempted but failed or interrupted; add a note on why|

## Rules for Agents

1. **Read first.** Check "Current Status" and the latest log entries to learn context and what is in flight.
2. **Plan as TODOs.** Add your tasks under "Task List" as `\[ ]` before touching any files.
3. **Mark `\[\~]` before starting** a task, and `\[x]` immediately after finishing it. Never batch updates at the end.
4. **Log every change** (file created/edited/deleted/moved) in the "Change Log" with timestamp, agent/model name, and files touched.
5. **On failure, don't delete.** Mark the task `\[!]` and record the error, last successful step, and any partial changes so the next agent can diagnose and resume.
6. **Recovering from an interrupted run:** any task still `\[\~]` when you start means the previous agent stopped midway. Inspect the files listed in its log entry (`git status` / `git diff`), then either finish it or mark it `\[!]` with notes.
7. Keep entries append-only, newest first in the Change Log. Don't rewrite history.

## Current Status

* **Last updated:** 2026-10-10 (Claude Opus 5.5) — **Phases 1, 2 and 2.5 of `PHASES.md` complete**, plus the owner's Phase 2.5 revision 2 (T58–T60: random power-up spots capped at ⌊players/2⌋, weighted kinds, 1 + 1 magazines, infinite pistol reloads, Piercing + Dash instead of Ammo, ring rules, developer Invincible switch under `npm run demo` only). Keys: `R` reload, `Space` dash, `C` reconciliation, `M` mute. **Phase 3 (T32 = T61–T67) complete** (2026-10-10): sync models full / delta / state (10 or 30 Hz) per connection, switchable live; Compare presets Sync / Bandwidth / State Hz with a live bandwidth chart; Quick Match Network Lab SYNC MODEL (`Y`, default Full). 130 tests, smoke (6 steps) and browser check pass. **Next: Phase 4 (T33).**
* **Project:** NoBu Shooter — real-time multiplayer arena shooter demonstrating client-side prediction, server reconciliation, snapshot-vs-state sync models, and a standalone network emulator (latency, jitter, loss, bandwidth, duplication, reordering) controlled from an in-game Network Lab. Repo: https://github.com/harishr-mit/CN-Sem5-Project (`main` holds everything as of T49; earlier work branches: `game`, `game-phase2plus`).
* **Plan:** `PHASES.md` — six phases, each with a demo checkpoint and exit criteria. `GAMERULES.md` = gameplay rules. v1 spec archived at `docs/archive/SPEC-v1.md`.
* **Architecture:** Browser (Phaser + React) ⇄ Emulator (:9000 data, :9001 control) ⇄ Authoritative server (:8080). Server core is transport-agnostic (`server/src/core.ts`); `NetClient` is headless (injectable transport/clock).
* **Assets:** `NoBu-Shooter/assets/` (`README.md` inventory, `CREDITS.md` licences — the survivor avatar is CC-BY 3.0 and must stay credited).
* **Commands (from repo root or `NoBu-Shooter/`):** `npm run demo` (`NOBU_MAPS=plaza` picks the map), `npm test` (130 tests incl. end-to-end netcode harness and sync models), `npm run typecheck`, `npm run smoke` (bot under Nightmare incl. ammo/reload/pads + lab spectator/movers + full vs delta NetClients), `npm run pack-assets` (player atlas).
* **Verification tooling:** no Playwright MCP is attached to agents; browser checks were done with `playwright-core` installed in the session scratchpad (NOT the repo) driving local Chrome (`channel: 'chrome'`). Phase 4 adds `npm run shots` to the repo.
* **Blockers / Notes:** none. Dev-mode React StrictMode prints harmless "closed before established" WebSocket warnings in the Compare view (documented in `docs/ASSUMPTIONS.md` #18). Task IDs T37–T39 were used twice (Phase 2 on `game-phase2plus`, bug fixes on `game`); the bug fixes are listed as T46–T48.

## Task List

* [x] T01: Reconcile this task list against `SPEC.md` and `GAMERULES.md`; add/adjust tasks
* [x] T02: Project scaffold: `package.json`, workspace layout, base configs
* [x] T03: Shared deterministic simulation module (used by server and client)
* [x] T04: Authoritative game server (websocket)
* [x] T05: Network emulator (latency, jitter, loss, bandwidth limit, duplication, reordering) + control/stats websocket
* [x] T06: Client: Phaser game view, input, rendering
* [x] T07: Client: prediction + server reconciliation
* [x] T08: Client: React UI — neon theme, Network Lab (sliders, presets `1`–`5`, `Tab` toggle, packet-flow strip, A/B compare)
* [x] T09: Unit + integration tests (`npm test`) — 18/18 pass (5 suites: sim, protocol, reconciliation, emulator, rules)
* [x] T10: Headless bot smoke test — 260 snapshots, 749 acks, 60 Hz tick rate, PASSED under Nightmare preset
* [x] T11: `docs/PROTOCOL.md` — wire protocol reference (created)
* [x] T12: `docs/DEMO_SCRIPT.md` — step-by-step demo walkthrough (created)
* [x] T13: `docs/ASSUMPTIONS.md` — implementation decisions (created)
* [x] T14: Fix blank page on QuickMatch click (Canvas addColorStop syntax error in Sparkline / NetworkLab)
* [x] T15: Update .gitignore to ignore all dependencies (node_modules, pycache, etc.), build artifacts, caches, and envs
* [x] T16: Configure root package.json postinstall hook for seamless dependency installation
* [x] T17: Add comprehensive Quickstart Guide block to README.md for freshly cloned machines
* [x] T18: Fix aim angle coordinate mismatch — use `ptr.worldX/Y` instead of `ptr.x/y` in ArenaScene (Bug 2B)
* [x] T19: Guard projectile trail against `proj.dx/dy` being undefined → NaN draw calls (Bug 3A)
* [x] T20: Remove duplicate `updateMetrics()` call from ArenaScene game loop — let NetworkLab drive it (Bug 6A)
* [x] T21: Fix key input stickiness — move key polling into `update()`, add `shutdown` cleanup (Bug 2A)
* [x] T22: UI responsive resizing — `min-height:0` on arena container, `clamp()` panel width, ResizeObserver (Bugs 1A+1B)
* [x] T23: Emulator UX + slider sync — show helpful offline message, sync sliders from emulator state events (Bugs 4A+4B)
* [x] T24: Add SettingsPanel.tsx (Escape toggle, sensitivity, graphics quality, localStorage) (Bug 5A)
* [x] T25: Add ControlsOverlay.tsx (F1/? toggle, in-game keybinding reference) (Bug 5B)
* [x] T26: Analysis + improvement plan against demo goals (snapshot vs state, prediction/reconciliation, standalone emulator, polish) — Claude Opus 5.5 → `ROADMAP.md` (now `PHASES.md`)
* [x] T27: Phase 1 netcode correctness — R1–R4 (input send bug, clock offset/interpolation, Input→Screen + ack delay, aim/prediction-off render)
* [x] T28: NetClient headless refactor + real GameServer+NetClient+Pipeline harness (`tests/netcode.test.ts`) — R5, R6
* [x] T29: Bots LOS/strafe/unstick, hybrid server loop (0.9 % CPU), demo.mjs process cleanup — R7–R9
* [x] T30: Small fixes batch — R10 (presets, per-session stats, strip, slider merge, perturb, lab RUNNING, particles, typecheck)
* [x] T31: **Phase 2** — Compare view + reference pane + scripted movers + comparison presets (PHASES.md C1–C6)
* [x] T32: **Phase 3** — Sync models: full / delta / state+extrapolation, bandwidth chart (PHASES.md S0–S5) — done 2026-10-10 as T61–T67
* [ ] T33: **Phase 4** — Presenter mode, arena/lab/strip polish, texture manifest, `npm run shots` (PHASES.md P1–P7)
* [ ] T34: **Phase 5** — UDP adapters, emulator UDP mode, network-player swarm, emulator dashboard + README (PHASES.md U1–U7)
* [ ] T35: **Phase 6** — Lockstep (S4), final docs, rehearsal (PHASES.md L1–L5)
* [x] T36: Docs: archive SPEC.md → `docs/archive/SPEC-v1.md`, ROADMAP.md → `PHASES.md`, remove duplicate `NoBu-Shooter/docs/` and stale root `tests/`, update README/PROTOCOL/DEMO_SCRIPT/ASSUMPTIONS
* [x] T37: Quick Phase 1 verification + Phase 2 implementation plan (`docs/PHASE2_PLAN.md`)
* [x] T38: Phase 2 docs — PHASES.md / PHASE2_PLAN.md reflect the approved decisions D1–D7
* [x] T39: Phase 2 step 1 — shared movers, Room movers + spectators, `lab` message, protocol validators (plan tests 1–4)
* [x] T40: Phase 2 step 2 — NetClient `spectate`, `serverNow()`, truth clock, RemoteErrorTracker metrics (plan tests 5–6)
* [x] T41: Phase 2 step 3 — compare core (types, presets, layout, InputDriver) + emulator ad-hoc preset (plan tests 7–9)
* [x] T42: Phase 2 step 4 — ArenaScene options: shared input, mover look, trails, truth markers, pane colours
* [x] T43: Phase 2 step 5 — UI: EmulatorControls extraction, CompareView/ComparePane/PaneMetricsBar/CompareDock, App/Landing, delete ABCompare
* [x] T44: Phase 2 step 6 — smoke extension, browser check (1280×720, 1920×1080), docs (PROTOCOL, DEMO_SCRIPT, ASSUMPTIONS, GAMERULES, README), exit

* [x] T45: Esc/F1 menus didn't scroll (inherited `pointer-events: none`); add Back to main menu to the Esc menu
* [x] T46 (`T37` on branch `game`): Bug — `D` key does not move right (arrow keys work). Root cause on this machine: Vimium (Chrome Profile 15) maps `d`; game input hardened anyway (page-level `KeyboardEvent.code` tracker)
* [x] T47 (`T38` on branch `game`): Bug — no way back to the landing page once a match has started (+ HUD buttons and Settings/Controls modals were unclickable)
* [x] T48 (`T39` on branch `game`): Bug — A/B compare panes don't mirror each other; emulator parameters not applied correctly to both panes
* [x] T49: Merge `origin/game` (bug fixes T46–T48, never merged) into `main` (Phase 2 + T45); reconcile overlaps, verify startup/tests/smoke/browser, commit

* [x] T50: Create `NoBu-Shooter/assets/` (texture drop folder + wanted-asset list in its README) ahead of Phase 4 P3
* [x] T51: Prune and rename the owner-supplied assets in `NoBu-Shooter/assets/` (keep only what the game will use); update its README/CREDITS
* [x] T52: **Phase 2.5 A0+A1** — asset pipeline (Vite serves `assets/`, preload manifest with fallback) + player look (survivor body/feet anims, colour ring, local shoulder marker, shield bubble, FX, drone target) — GAMERULES §17
* [x] T53: **Phase 2.5 A3** — weapons + ammo + reload (`R`, input flag `r`, predicted ammo, HUD) — GAMERULES §6, §6a
* [x] T54: **Phase 2.5 A4** — power-ups (pads, 5 kinds, server pickups, speed in prediction, HUD) — GAMERULES §6b
* [x] T55: **Phase 2.5 A2** — maps `neon`/`warehouse`/`plaza`/`overgrown`, rotation, map id in snapshot — GAMERULES §3, §15
* [x] T56: **Phase 2.5 A5** — sound (event map, distance volume, mute `M`, Settings volume, audio unlock) — GAMERULES §18
* [x] T57: Owner revision: GAMERULES/PHASES/README/docs for Phase 2.5, AGENTS.md docs-sync rule, reconciliation key `R` → `C`, process the second batch of owner assets (sounds, pickup icons), CREDITS
* [x] T58: Rings — none in Compare; in Quick Match the ghost (G) replaces the local player's colour ring while shown
* [x] T59: Power-up rework — random spawn spots, cap ⌊players/2⌋, 10 s refill, weighted kinds (rifle rarest, speed commonest), power weapons = 1+1 magazines then pistol, pistol infinite reserve; Ammo replaced by Piercing + Dash (owner choice)
* [x] T60: Developer toggle (only under `npm run demo`): invincible

* [x] T61: Phase 3 implementation plan (`docs/PHASE3_PLAN.md`) + owner decisions; PHASES.md Phase 3 synced
* [x] T62: Phase 3 step 1 — shared sync core (`shared/src/sync/`), protocol `snapDelta`/`state`/`sync`/`snapAck`/`input.sa` + validators, `net.json` keys (plan tests 1–4) (owner approved the plan 2026-10-10)
* [x] T63: Phase 3 step 2 — server: Room hands snapshot objects to core, velocities, per-connection encoders, acks, metrics (plan test 5)
* [x] T64: Phase 3 step 3 — NetClient decoders/acks/`setSync`, wire-byte bandwidth, new metrics, `extrapolate.ts` (plan tests 6–9)
* [x] T65: Phase 3 step 4 — Compare: `PaneSpec.sync`, SYNC chip + `Y`, three presets, dock columns, `BandwidthChart` (plan test 10)
* [x] T66: Phase 3 step 5 — Quick Match: Network Lab SYNC MODEL row, `Y`, settings, ControlsOverlay
* [x] T67: Phase 3 step 6 — smoke extension, browser check, measurements, docs, phase exit

*Add new tasks at the bottom with the next free ID. Never reuse or renumber IDs.*


## Change Log

<!-- Newest first. Copy the template below for each entry. -->

### 2026-10-10 — Claude (Opus 5.5) — Phase 3 implementation (T32, T62–T67)

* **Task:** Owner approved `docs/PHASE3_PLAN.md` (D1–D10) and asked for the whole phase. Vimium: the agent's browser checks use a fresh Chrome profile (no extensions); the owner was told how to exclude `localhost:5173` in Vimium's options.
* **Status:** DONE — typecheck clean, **130/130 tests**, `npm run smoke` PASSED (3 runs; step 6: delta decoded exactly over real sockets, 0 missing bases, ack delay ≈ 335 ms vs full ≈ 550–610 ms). Browser check (scratchpad `playwright-core` 1.48.2 in `scratchpad/pw/`, NOT the repo; local Chrome, fresh profile; the check script started `npm run demo` and killed its process tree): Compare presets Sync / Bandwidth / State Hz / Interpolation at 1920×1080 and 1280×720 (fresh pages), 59–60 fps, no top-bar/pane-header overflow, 0 console errors; Quick Match `Y` cycles live with one join and no leave in the server log. Numbers in `PHASES.md` Phase 3 Result and `docs/ASSUMPTIONS.md` #57. Ports 5173/8080/9000/9001 free afterwards.
* **T62 (step 1, shared) — DONE:** created `shared/src/sync/{types,diff,delta,state,index}.ts` (sync specs + cycle, field/list diff-patch with `del` for removed optional fields, `DeltaEncoder` (ack ring, 500 ms base age, fallback count after the first ack) / `DeltaDecoder` (32-entry ring, missing-base count), `StateEncoder` / `stateToSnap`, `createEncoder`); `shared/src/protocol/messages.ts` (`hello.sync`, `input.sa`, `MsgSync`, `MsgSnapAck`, `MsgSnapDelta`, `MsgState`, `FieldPatch`/`EntityPatch`, validators); `shared/src/config/net.{json,ts}` (`delta`, `state`); `shared/package.json` (`./sync` export); tests `tests/sync.test.ts` (new, 12) and `tests/protocol.test.ts` (+1). 118/118 tests, node typecheck clean.
  - Deviation from plan §2: removed optional fields are listed in a `del` array, not sent as `null` — `match.results` is legitimately `null`.
* **T63 (step 2, server) — DONE:** `server/src/game/room.ts` (send callbacks take the `MsgSnap` object + a velocity table; `prevPos` per tick, `velocities()` with teleports > 30 px/tick → 0; `encodeServer` import removed), `server/src/core.ts` (`Connection.sync` + `encoder`, `hello.sync` (ignored for spectators), `sync` (same spec keeps the encoder), `snapAck`, `input.sa`, `sendSnapshot()` + traffic metrics), `server/src/metrics.ts` (`sync` traffic per model incl. 28 B/msg, `deltaFallbacks`), `tests/rules.test.ts` (callback type), `tests/sync.test.ts` (+2 GameServer tests: delta decodes to the spectator's world every tick, State 10 Hz with mover speed 200 px/s, live switch keeps the player, `sa` acks). 120/120 tests.
* **T64 (step 3, client) — DONE:** created `client/src/net/extrapolate.ts` (`Extrapolator`: dt clamped to [−100, 250] ms, settle out of walls (players only), blend offset with 100 ms half-life, snap on teleport/≥ 64 px, projectiles along their direction); `client/src/net/NetClient.ts` (`sync` option + `setSync()` + `sync` getter, hello carries non-full sync, `snapDelta`/`state` handling via `DeltaDecoder`/`stateToSnap`, acks on `input.sa` or `snapAck` from `sendInputs()` (now always runs its ack check), wire-byte bandwidth (+28 B/msg, D8), new metrics `msgBytesDown`, `fullFallbacksPerSec`, `deltaMissingBase`, `snapsLostPerSec`, `moverOffPathPct`, snapshots-missed per model interval, State render path, no interp delay in prediction-off Input→Screen for State); `client/src/net/remoteError.ts` (off-path % + `distanceToPath`); `shared/src/config/net.{json,ts}` (`state.extrapolateBackMs`); tests `tests/extrapolate.test.ts` (new, 6), `tests/netcode.test.ts` (harness `syncs` option + `bytesDown`; +4 Phase 3 tests). 130/130 tests, typecheck clean (node + client).
  - Bug found and fixed while testing: with dt clamped at 0, a state slightly newer than the render clock made every update look like a backward jump; at 30 Hz the blend offsets piled up (mover lag 122 ms at 30 Hz vs 77 ms at 10 Hz). With back-projection (≤ 100 ms): harness at 50 ms one-way — Full lag 150 ms, State 10 Hz 53 ms (27 % off-path), State 30 Hz 50 ms (3 % off-path).
  - Measured (harness, Nightmare, 3 panes + 4 movers): loss is applied before the bandwidth cap, so Full's ≈ 451 kbps arrives at the cap as ≈ 400 kbps and its queue builds slowly — ack delay Full ≈ 700 ms vs Delta ≈ 310–360 ms after ≈ 15 s (≈ 400 vs 310 ms at 10 s). Plan test 9 now averages the last 10 s of a 20 s run. Delta stayed exact with 0 missing bases; fallbacks did not occur (plan test 9 expected > 0 — dropped: 12 % burst loss never starves acks for 500 ms).
  - Deviation: Delta's byte share measured in the harness lab scene with 4 players + 4 movers is checked ≤ 40 % (sync.test GameServer test < 40 % too).
* **T65 (step 4, Compare) — DONE:** `client/src/compare/types.ts` (`PaneSpec.sync` required, `ComparePreset.label`), `client/src/compare/presets.ts` (`makePane(..., sync)`, short labels, presets **sync** (Full/Delta/State 10, Nightmare, all movers, REF), **bandwidth** (Full vs Delta, 40 ms + 300 kbps cap, all movers), **staterate** (State 10 vs 30, Transatlantic, zigzag + reversal, REF); Custom copies sync), new `client/src/ui/compare/BandwidthChart.tsx` (canvas, DPR-aware, one line per pane, dashed cap line, values at the right), `client/src/ui/compare/CompareDock.tsx` (rewritten: SYNC, MSG B, LOST/s, FALLBK/s (delta panes), OFF-PATH columns; chart + lag sparklines layout by width), `client/src/ui/compare/ComparePane.tsx` (SYNC chip, `I` greyed for State), `client/src/ui/compare/CompareView.tsx` (`setSync` per pane before connect, `Y` on the selected pane, 30 s bandwidth history, cap from the emulator's `defaults.bandwidthKbps`), `tests/compare.test.ts` (preset tests for the new presets + Custom sync copy).
* **T66 (step 5, Quick Match) — DONE:** `client/src/ui/settings.ts` (`syncModel`, validated on load), `client/src/ui/App.tsx` (NetClient gets the saved sync), `client/src/ui/NetworkLab.tsx` (SYNC MODEL [Y] row with four chips + hint + B/msg, `Y` hotkey, interpolation label "n/a in State"), `client/src/ui/ControlsOverlay.tsx` (`Y`). Typecheck clean.
* **T67 (step 6, verification + docs) — DONE:** created `scripts/sync-clients.ts` (smoke step 6: full + delta `NetClient`s through the emulator + direct spectator in `main`); edited `scripts/smoke.mjs` (6 steps).
  - **Bug found by the smoke test and fixed (plan deviation Y2):** with the 500 ms base-age limit, late acks under Nightmare forced full fallbacks, which filled the 400 kbps queue and delayed the next acks — delta ended up with a worse ack delay than full (685 vs 656 ms, only 116 deltas in 8 s). `shared/src/sync/delta.ts` now keeps an unconfirmed-event log (repeated in deltas and fallbacks until acked, capped at 512) and allows 1 s bases; `net.{json,ts}` delta `32 / 1000 / 64`; `tests/sync.test.ts` fallback test now runs a 2 s outage and checks no event is lost.
  - Browser fixes: Sync preset without REF (3 panes + REF filled the 2×2 grid, so the dock/chart vanished even at 1920; Y4), compact dock columns by context and tighter top bar below 1400 px (1280 overflowed by 97 px; Y6), short labels Sync / Bandwidth / State Hz. A shifted 1280 screenshot turned out to be a headless artifact of resizing a live page (probe: scrollX 0, scrollWidth = viewport); 1280 checks use a fresh page.
  - **Docs:** `docs/PROTOCOL.md` (`hello.sync`, `input.sa`, §2.8 `sync`, §2.9 `snapAck`, §3.2a `snapDelta`, §3.2b `state`, §3.5 sync models + sizes), `docs/DEMO_SCRIPT.md` (controls `Y`, §7 Nightmare → `Y` to Delta with measured numbers, §8 Custom, new §11 Sync models), `docs/ASSUMPTIONS.md` (#49–#59), `docs/PHASE3_PLAN.md` (status implemented, §10 deviations Y1–Y7, superseded details marked), `PHASES.md` (status, overview, Phase 3 Result, DoD G1 note), `GAMERULES.md` (Network Lab keys incl. `Y`, §13 sync models don't change gameplay), `README.md` (status, intro, test/smoke descriptions, controls `Y`, Compare presets, Vimium `y` + 127.0.0.1 rule, repo tree), `log.md`. `NoBu-Shooter/assets/README.md` unchanged (no asset changes).
  - **Notes:** No dependency was added to the repo (`playwright-core` lives in the session scratchpad only); `.gitignore` unchanged. Edits to `.mjs`/`.ts` files with CRLF working copies were rewritten with LF by the edit scripts; git (`core.autocrlf=true`) normalises them, diffs stay line-accurate.

### 2026-10-10 — Claude (Opus 5.5) — T61: Phase 3 implementation plan

* **Task:** Owner: plan the implementation of Phase 3 and prepare to implement; wait for confirmation before building.
* **Status:** DONE (plan only — no source files changed). Implementation T62–T67 waits for owner approval.
* **Owner answers (asked mid-run):** Quick Match gets a sync switch in the Network Lab, default **Full**; Compare gets **three** presets (Sync models / Bandwidth / State rate); State sync **10 Hz default, switchable to 30 Hz** per pane.
* **Measured (scratchpad script `measure-snaps.ts` driving a real `Room` in-process; nothing added to the repo):** lab 3 pane players + 4 movers: Full 1.85 kB / 451 kbps (incl. 28 B/msg), ideal field-level delta 355 B / 92 kbps (19 %); 2 panes: 401 vs 82 kbps; main room, human firing nonstop: 2.47 kB / 600 kbps vs 761 B / 189 kbps (31 %). Rounding positions to 0.1 px only moves delta 19 % → 17 %, so the plan keeps exact values (reconciliation stays bit-exact).
* **Files:** `docs/PHASE3_PLAN.md` (created: starting point, decisions D1–D10, protocol, shared sync core, server/client/Compare/Quick Match design, build order, tests 1–10, exit checklist, risks), `PHASES.md` (status line, Phase 3: plan link, S0/S1/S3/S4 wording per the owner's answers, checkpoint names the preset), `log.md` (T61–T67, Current Status, this entry).
* **Notes:** Found while reading `room.ts`: a snapshot's `events` is the room's live array (later `emitEvent` calls push into it), so delta bases must copy it — recorded in the plan §3. No processes were started except the one-off measurement script (exited).

### 2026-10-10 — Claude (Opus 5.5) — T58–T60: rings, power-up rework, developer toggle

* **Task:** Owner: no colour rings in Compare; the ghost (original-position circle) toggleable in Quick Match and replacing the local colour ring while shown; power-ups at random spots; rifle rarer, Speed more often; power-up weapons revert after 1 + 1 magazines (or the timer); pistol reloads forever; at most players/2 power-ups at a time; replace Ammo (owner chose **both Dash and Piercing**, refill **10 s**); a developer toggle only in `npm run demo` making the player invincible.
* **Status:** DONE — typecheck clean, **105/105 tests**, `npm run smoke` PASSED (4 players → max 2 power-ups). Browser (scratchpad playwright-core + local Chrome, demo started and stopped by the check script): Developer section present, Invincible → HUD `DEV: INVINCIBLE`, tag `[DEV]`, alive after 4 s among bots; pistol reserve `∞`; ghost on → no cyan ring, `G` off → cyan ring; Compare without colour rings; `Space` doesn't scroll; 0 console errors; all assets loaded. Ports free, no leftover processes.
* **Shared:** `config/game.json` + regenerated `game.ts` (`powerups`: 6 kinds, `weights`, `perPlayers`, 10 s `respawnMs`, spot rules incl. `hudKeepOut`, `piercingMs`, `dashMs`, `dash`; maps lost `pickupPoints`; `MapDef` too). `sim/combat.ts` rewritten (reserve/INFINITE_RESERVE, 1 + 1 magazines → pistol, piercing, dash burst/cooldown, `stepCombat(..., dash, moving)`). New `sim/powerups.ts` (`powerupCap`, `pickPowerupKind`, `isValidPowerupSpot`, `randomPowerupSpot`). `protocol/messages.ts`: input `d`, `MsgDev`, `SelfCombatSnap = CombatState`, `PlayerSnap.invincible`, `ProjectileSnap.pierce`, pickup ids unique.
* **Server:** `game/room.ts` (pickups list + cap + refill timer replace pads, piercing projectiles, dash input, invincible hits, `setDev` gated by `NOBU_DEV`), `game/state.ts` (`PickupState`, `pickups`, `pickupRespawnTicks`, `nextPickupId`, `invincible`, `pierce`), `core.ts` (`dev` message). `scripts/demo.mjs` sets `NOBU_DEV=1` / `VITE_NOBU_DEV=1`.
* **Client:** `net/NetClient.ts` (dash request + sticky `d`, `setDevInvincible` re-sent on welcome, `combatView` reserve/pierce/dash/invincible), `game/PlayerView.ts` (`ring` flag), `game/ArenaScene.ts` (ring rules, `Space` dash, piercing tint, `[DEV]` tag), `game/MapView.ts` (pad rings removed), new `dev.ts`, `ui/NetworkLab.tsx` (Developer section), `ui/Hud.tsx` (reserve, PIERCING/DASH/DEV chips, LAST MAGAZINE), `ui/ControlsOverlay.tsx`, `ui/Landing.tsx`, `styles/global.css`.
* **Assets:** new `sprites/pickups/piercing.png`, `dash.png` (SVG badges rendered with headless Chrome; sources in the scratchpad `assets-original-3/`); `pickups/ammo.png` removed (backed up there).
* **Tests:** `combat.test.ts` (reserve, 1 + 1 magazines for rifle and shotgun, manual reload, piercing, dash timing, cap + weights), `maps.test.ts` (random spots valid + reachable, HUD keep-out; pads removed), `rules.test.ts` (random power-ups/cap/10 s refill/new cap after joins, dev refused without NOBU_DEV + invincible hits; bot-movement check now uses the furthest distance in the window — a bot that circled back failed the old end-to-start check), `netcode.test.ts` (dash predicted with 0 corrections), `protocol.test.ts` (`d`, `dev`, full `me`). `scripts/headless-bot.mjs` wording.
* **Docs:** `GAMERULES.md` (revision 2 note, controls `Space`, §3, §4 `reserve`, §6 table, §6a, §6b rewritten, §13 `d`, §15 regenerated, §16, §17 rings/power-ups, new §19 developer toggle), `docs/PROTOCOL.md` (`d`, `dev`, `me`, `pierce`, `invincible`, pickups), `docs/ASSUMPTIONS.md` (#43–#48), `docs/DEMO_SCRIPT.md` §10, `README.md`, `PHASES.md` (revision 2 note), `NoBu-Shooter/assets/{README,CREDITS}.md`, `log.md`.

### 2026-10-10 — Claude (Opus 5.5) — Phase 2.5: gameplay + textures (T52–T56)

* **Task:** Owner: implement all of Phase 2.5 (not just T52); shotgun = 3 bullets with a decent spread.
* **Status:** DONE — typecheck clean, **96/96 tests** (was 64), `npm run smoke` PASSED (Nightmare; new checks: own ammo reached 0 and reloaded, bot shots, 4 pads filled, map id). Browser (scratchpad `playwright-core` 1.48.2 + local Chrome; NOT in the repo): Quick Match neon/warehouse/plaza/overgrown at 60 fps, 0 console errors, all assets loaded, fire 1.2 s → 8/8 → 4/8, `R` → 8/8; Compare 2 panes and 4 panes + REF at 60 fps (1920×1080), Phase 2 numbers unchanged (A frozen 69 % / lag 78 ms vs B 4 % / 158 ms). Demo stopped after every check; ports 5173/8080/9000/9001 free.
* **Shared:** `shared/src/config/game.json` + `game.ts` (regenerated mirror + helpers `mapDef`, `MapId`, `WeaponId`, `PowerupKind`): `weapons` (shotgun 3 pellets, 20°, 600 ms), `powerups`, `maps` (neon + 3 new mirrored layouts with props, spawns, pads), rooms `powerups`/`map`; removed `player.fireCooldownMs`, `projectile.lifetimeMs`, top-level `obstacles`/`spawnPoints`. New `shared/src/sim/combat.ts` (per-input weapon/ammo/reload/power-up step; exported from `sim/index.ts`). `shared/src/protocol/messages.ts`: input `r`, `PlayerSnap.aim/weapon/reloading/shield/fast`, `SelfCombatSnap` (`snap.me`), `PickupSnap` (`snap.pickups`), `match.map`, events `RELOAD_START`/`PICKUP`/`SHIELD_HIT`, event `weapon`/`kind`.
* **Server:** `game/room.ts` (per-map geometry, map rotation at COUNTDOWN + `NOBU_MAPS` override, combat per consumed input, `fireShot` pellets, shield absorbs hits, pads: fill/pickup/respawn, snapshot fields), `game/state.ts` (`combat`, `aim`, `shield`, `PadState`, `map`, `pads`), `game/spawn.ts` (map spawn points), `bots.ts` (per-map line of sight + wander), `metrics.ts` (reloads/pickups/shieldBlocks).
* **Client:** `net/NetClient.ts` (per-map prediction geometry, combat prediction + replay, sticky `r`, `fire(weapon)`/`reload`/`dryFire` events, `combatView`, `requestReload`, aim interpolation, PICKUP adoption); new `game/assets.ts` (manifest, fallbacks, animations), `game/MapView.ts`, `game/PlayerView.ts`, `game/audio.ts`, `game/playerColors.ts`; `game/ArenaScene.ts` rewritten around them (Compare behaviour kept); `game/GameContainer.tsx` (Compare `noAudio`); `ui/Hud.tsx` (weapon panel, ammo correction flash, map name, coloured scoreboard, "SPAWN PROTECTED"), `ui/App.tsx` (`M`, sound prefs), `ui/SettingsPanel.tsx` (mute), `ui/settings.ts` (`muted`), `ui/ControlsOverlay.tsx` (R, M, power-ups), `ui/Landing.tsx` (hint + Credits modal), `styles/global.css`; `client/vite.config.ts` (`publicDir: ../assets`).
* **Assets/tools:** new `scripts/pack-assets.mjs` + `npm run pack-assets` (NoBu-Shooter and root `package.json`), dev dependency `pngjs@^7.0.0` (local, `NoBu-Shooter/package.json` + lock); generated `assets/packed/player.{png,json}` (245 frames, 2048×1024, per-frame pivots — checked on a preview sheet). `scripts/headless-bot.mjs` fires, reloads and checks the new fields.
* **Tests:** new `tests/combat.test.ts` (8), `tests/maps.test.ts` (17: symmetry, clearance, reachability), `tests/rules.test.ts` (+5: rotation, reload, shotgun, pads tie/respawn, shield), `tests/netcode.test.ts` (+2 weapon-prediction harness; `makeHarness` gained `room`/`noBots`), `tests/protocol.test.ts` (new fields, `r`), `tests/{sim,movers}.test.ts` (neon obstacles path).
* **Docs:** `GAMERULES.md` (revision note → implemented; §6 shotgun row; §6a reload prediction; §15 = actual game.json + `NOBU_MAPS`; §17 atlas), `PHASES.md` (2.5 done + result, Phase 3 next + baseline), `docs/PROTOCOL.md`, `docs/ASSUMPTIONS.md` (#33 updated, #36–#42), `docs/DEMO_SCRIPT.md` (§10), `README.md` (controls, maps, tests, pack-assets), `NoBu-Shooter/assets/{README,CREDITS}.md`, `log.md`.
* **Notes:** Snapshots grew +36 % (≈ 1.58 → 2.14 kB, ≈ 510 kbps), above Nightmare's 400 kbps cap — Quick Match under Nightmare queues more until Phase 3. Sound trims not checked by ear; 8 human players not measured (bots fill to 4). `npm install` printed an `allow-scripts` notice for esbuild's postinstall (pre-existing, nothing changed). Stopping a backgrounded `npm run demo` via the task tool left `demo.mjs` orphaned once on Windows (stopped by PID; children exited via parent-watch) — later checks spawned and killed the launcher directly.

### 2026-10-10 — Claude (Opus 5.5) — T57: Phase 2.5 rules/docs, `R` → `C`, second asset batch

* **Task:** Owner: (1) update the rules and every other doc for reload, power-ups, more maps, per-player colours + local marker, sound; add an AGENTS.md rule to keep docs in sync with requirement changes; (2) `R` = reload, `C` = reconciliation toggle; (3) unnamed assets are CC0; (4) do the texture/gameplay work (T52–T56) before Phase 3. Use and rename the new sounds/assets; respawn, power-up end and UI click stay silent.
* **Status:** DONE — typecheck clean, **64/64 tests**. No processes left running (headless Chrome renders exited; checked no `chrome.exe` with a scratchpad profile remained). Gameplay itself (T52–T56) is not implemented yet.
* **Code:** reconciliation hotkey `R` → `C` in `client/src/ui/NetworkLab.tsx` (handler + label), `client/src/ui/compare/CompareView.tsx` (handler + comment), `client/src/ui/compare/ComparePane.tsx` (chip label/tooltip), `client/src/ui/ControlsOverlay.tsx`, `client/src/compare/presets.ts` (Custom caption). `R` is unbound until T53.
* **Docs:** `GAMERULES.md` (revision note; §1 objective + controls `R`/`M`; §3 maps table + rotation/symmetry rules; §4 new player fields + appearance; §5 speed multiplier; §6 weapons table; new §6a ammo/reload, §6b power-ups; §7 shield + pellet lifetime; §8 shield bubble; §12 bots reload; §13 input `r`; §14 rooms; §15 *Phase 2.5 additions* block; §16 rewritten; new §17 look, §18 sound), `PHASES.md` (status, overview row 2.5, new Phase 2.5 section A0–A6 with checkpoint/exit criteria, Phase 3 S0 covers new state, Phase 4 P3 moved to A0, DoD G4), `README.md` (controls `R`/`M`/`C`, Compare row, repo tree `assets/`, Vimium note, new Credits section), `docs/DEMO_SCRIPT.md` (`R` → `C` ×4), `docs/ASSUMPTIONS.md` (#31–#35), `AGENTS.md` (new "Requirements & Docs Sync" section), `NoBu-Shooter/assets/README.md` (rewritten inventory incl. sounds/pickups), `NoBu-Shooter/assets/CREDITS.md` (all rows filled; owner: unnamed = CC0).
* **Assets (second batch):** sounds trimmed/normalised to mono 16-bit WAV with Python `wave` (stdlib) → `sfx/{shoot_handgun,shoot_rifle,reload_handgun,reload_rifle,reload_shotgun,hit,pickup}.wav`; renamed `sfx/death.ogg`, `sfx/dry_fire.mp3`. Pickup icons rendered with local Chrome headless (`--screenshot`, transparent background, scratchpad profile) → `sprites/pickups/{shield,rapid_fire,ammo}.png` (cropped from `qubodup_ringicons.svg`), `spread_shot.png` (from `spread.png`), `speed.png` (bolt projected from `speed.obj`). Unused: the ring sheet's health/signal/target icons. Originals moved to the session scratchpad (`assets-original-2/`, temporary).
* **Notes:** Sound trims were chosen from loudness envelopes, not by listening — check them by ear in T56. No shotgun shot sound was supplied; the rifle shot at 0.7× rate stands in (§18). Weapon/power-up numbers are agent guesses (ASSUMPTIONS #33).

### 2026-10-10 — Claude (Opus 5.5) — T51: Prune and rename owner assets

* **Task:** Owner pasted assets (457 files, 28 MB) and asked to remove what is not needed and rename the rest; also wants reload, powerups, more maps, per-player colours with a local-player marker, and asked about SFX.
* **Status:** DONE — 262 files kept (~11 MB). Originals backed up in the session scratchpad (`scratchpad/assets-original/`, temporary). No code changes.
* **Kept + renamed:** Top-Down Survivor (Riley Gombart, CC-BY 3.0) handgun/rifle/shotgun × idle/move/shoot/reload → `sprites/player/body/<weapon>/<anim>/NN.png`; feet idle/run/strafe_left/strafe_right → `sprites/player/feet/<anim>/NN.png`; fx → `fx/{bullet,muzzle_flash_strip4,shield_bubble,spark_strip9}.png`; floors → `textures/floors/{stone_cracked,stone_beige,brick_herringbone}.png` (`stone_beige` downscaled 2048 → 1024 with .NET System.Drawing, 6.8 → 2.2 MB); RC Art Rough Props + Metal Box → `textures/props/*.png`; bullseye → `sprites/drone_target.png`.
* **Removed:** survivor flashlight + knife sets, all `meleeattack` anims (no melee), `feet/walk` (one move speed); `FloorTilesNormal/Spacular`, `MarbleBeigeNormal` (lighting maps, no diffuse use); `brickfloor2` (duplicate style of herringbone); RC `glass panel`, `GlassBreak*` (destructible obstacles out of scope), `RoughProps all.png` (sheet duplicate), RC info/links txt (source recorded in CREDITS.md).
* **Files:** `NoBu-Shooter/assets/**` (above), `NoBu-Shooter/assets/README.md` (rewritten: inventory + still-wanted pickups/SFX), `NoBu-Shooter/assets/CREDITS.md` (licences; 8 rows TODO for the owner), `log.md` (T51–T56).
* **Notes:** Reload, ammo, power-ups and multiple weapons are listed under GAMERULES §16 "Deliberately NOT included", and `R` is the reconciliation toggle; T53/T54 wait for the owner. `.gitignore` unchanged (assets are tracked).

### 2026-10-10 — Claude (Opus 5.5) — T50: Texture drop folder

* **Task:** Owner: before Phase 3, create `NoBu-Shooter/assets/` and list the textures wanted plus where to get them; the owner adds the files.
* **Status:** DONE — folders and docs only, no code changes. Wiring the files into the game is still Phase 4 P3 (manifest + procedural fallback).
* **Files:** created `NoBu-Shooter/assets/README.md` (rules, 9 wanted files mapped to the `// TEXTURE:` markers in `ArenaScene.ts`), `NoBu-Shooter/assets/CREDITS.md` (licence table), `NoBu-Shooter/assets/{sprites,fx,textures}/.gitkeep`; edited `PHASES.md` P3 (path `client/public/assets/` → `NoBu-Shooter/assets/`), `log.md`.
* **Notes:** Assets are tracked in git (not dependencies); `.gitignore` unchanged. Remote players use 8 colours, so the player sprite should be grey/white and tinted at runtime.

### 2026-10-10 — Claude (Opus 5.5) — T49: Merge branch `game` (bug fixes T46–T48) into `main`

* **Task:** Owner: the bug-fix commit `818e7c4` on `game` ("bug fix run 09-10-2026") was never merged; Phase 2 (`game-phase2plus`, PR #3) and T45 were built without it. Fetch, merge `game` into `main`, make the overlaps coherent, verify startup, commit.
* **Status:** DONE — typecheck clean, **64/64 tests**, smoke PASSED (Nightmare 61 Hz; 4 movers exactly on their paths), `npm run demo` starts all four services, browser check 23/23 (scratchpad `playwright-core` 1.48.2 + local Chrome, NOT in the repo) + Esc menu scroll at 1280×380. Demo stopped; ports 5173/8080/9000/9001 clear; no node / headless Chrome left.
* **Git:** `git fetch --all --prune`; T45 (uncommitted on `game-phase2plus`) stashed (`stash@{0}`, also saved as a patch in the session scratchpad); local `main` fast-forwarded 31ba8fe → 18a29b0 (= `origin/main`); `git merge --no-ff --no-commit origin/game` → 14 conflicts, resolved by hand; T45 folded back in; one merge commit on local `main` (not pushed).
* **Resolution (what was kept from `game`):**
  - T46 keys: `client/src/game/input.ts` (page-level tracker by `KeyboardEvent.code`) now drives Quick Match in `ArenaScene`; Phaser keyboard disabled in `GameContainer` (`input: { keyboard: false }`); `pointerupoutside` releases fire. The A/B-only parts (shared `PointerState`, `hidePlayersOf`, absolute-rAF tick stepping) were dropped: Phase 2's `InputDriver` + `dimOthers` already cover them. `InputDriver` now reuses `movementCode` / `keysFromCodes` / `isTypingTarget`.
  - Hotkeys in `NetworkLab`, `EmulatorControls`, `CompareView` (and movement in `InputDriver`) use `isTypingTarget`: a focused slider/checkbox no longer swallows `Tab`, `1`–`5`, `P`/`R`/`I`/`G` or movement (arrows no longer nudge the slider). Main still had this bug.
  - T47 leave: `Hud` ◄ LEAVE MATCH + clickable action bar + ◄ BACK TO MENU on the connection overlay; `store.resetSession()`; Esc/F1 only in the match view. Merged with T45: one handler (`handleLeaveMatch`, T45's duplicate `handleExitToMenu` dropped), one prop (`onLeave`), one Esc-menu button **◄ LEAVE MATCH — BACK TO MAIN MENU** at the end of the menu (T45 placement), T45's fixed/scrollable modal layout in `SettingsPanel` and `ControlsOverlay`.
  - T48: `EmulatorClient` stale-socket guard (StrictMode) kept as is. Lab fixed spawn kept but **moved (640, 520) → (880, 360)**: the old point lies on Phase 2's zigzag mover lane (≈ 32 px); the new one is ≥ 108 px from every mover path and clear of obstacles (new test in `tests/movers.test.ts`). `RoomCfg` now has `movers` + `spawn`. `ABCompare.tsx` stays deleted; `NetworkLab`'s `compareClients` mode dropped (Compare has its own dock).
* **Files:** `NoBu-Shooter/client/src/game/{ArenaScene.ts,GameContainer.tsx,input.ts}` (input.ts: `PointerState` removed, header updated), `client/src/compare/InputDriver.ts`, `client/src/net/EmulatorClient.ts`, `client/src/ui/{App,ControlsOverlay,EmulatorControls,Hud,NetworkLab,SettingsPanel}.tsx`, `client/src/ui/compare/CompareView.tsx`, `client/src/ui/store.ts`, `server/src/game/room.ts`, `shared/src/config/game.{json,ts}`, tests `input.test.ts` (new from `game`), `movers.test.ts` (+lab spawn clearance), `netcode.test.ts` (twin tests renamed for Compare), `rules.test.ts`; docs `README.md` (64 tests, leave row, Compare row moved back inside the controls table — it sat after the "Latencies" line and rendered as stray text), `GAMERULES.md` §14 + §15 (rooms block synced with `game.json`: movers, `lab` block, spawn), `PHASES.md` (stray `@@` in the title from `818e7c4`; status + Phase 2 row → done), `docs/ASSUMPTIONS.md` (#18 + new #28–#30), `docs/DEMO_SCRIPT.md` §8, `docs/PROTOCOL.md` (lab spawn), `docs/PHASE2_PLAN.md` §9, `log.md` (T45 entry restored from the stash, T46–T48 renumbered, this entry).
* **Notes:** The browser probe must send `ping`s — the server drops silent connections after 5 s (`NET.timeoutMs`); the first run's failures were the probe, not the game. The Phase 2 entry below mentions a PHASES.md "Result table"; it was never committed (not in `127fc29`, `7ff1aaa` or `origin/main`) and was not reconstructed.

### 2026-10-10 — Claude (Opus 5.5) — T45: Esc/F1 menus didn't scroll; add Back to main menu

* **Task:** Owner report: no way back to the main menu from Quick Match; the Esc and F1 menus couldn't be scrolled
* **Status:** DONE — client typecheck clean, 57/57 tests, browser-verified at 1280×600 (F1 scrolls 0 → 168 px with the wheel; the Esc menu shows the new button; clicking it returns to the landing page, the server logs the player leaving, and a second Quick Match starts normally; no console errors). Demo stopped, ports clear.
* **Cause:** both modals use the `.overlay` class, which sets `pointer-events: none` (meant for HUD text overlays). It is inherited, so wheel events went through the modal to the game. The Settings modal also had no height limit or scroll. There was no back-to-menu button anywhere in Quick Match (none had been removed).
* **Files:** `NoBu-Shooter/client/src/ui/SettingsPanel.tsx` (overlay `pointerEvents: 'auto'`, `position: fixed`, modal `maxHeight: 100%` + `overflowY: auto`; new `onExitToMenu` prop and **◄ BACK TO MAIN MENU** button), `NoBu-Shooter/client/src/ui/ControlsOverlay.tsx` (same overlay/scroll fix), `NoBu-Shooter/client/src/ui/App.tsx` (`handleExitToMenu`: closes modals, drops the clients, whose effect cleanups disconnect them, then shows the landing page), `docs/DEMO_SCRIPT.md` §8 step 1, `README.md` controls table.

### 2026-10-09 — Claude (Opus 5.5) — Phase 2 implementation (T31, T38–T44)

* **Task:** Implement Phase 2 per `docs/PHASE2_PLAN.md` (owner approved D1–D7)
* **Status:** DONE — 57/57 tests, typecheck clean, smoke PASSED (Nightmare + spectator step), browser check at 1280×720 and 1920×1080, 60 fps with 4 panes + REF, all ports clear
* **T38 (docs):** `PHASES.md` (status, Phase 2 C1–C6 rewritten to D1–D7, demo checkpoint, exit criteria + fps; S4 and P1 notes), `docs/PHASE2_PLAN.md` (status approved, §1 heading, new §10 Deviations)
* **T39 (step 1, server/shared):** created `shared/src/sim/movers.ts` (`moverPath`, 4 patterns), `tests/movers.test.ts` (12 tests); edited `shared/src/sim/index.ts`, `shared/src/config/game.json` + `game.ts` (`rooms.*.movers`, `lab.moverSpeed`, `lab.stopGo`), `shared/src/protocol/messages.ts` (`hello.spectate`, `welcome.spectator`, `PlayerSnap.mover`, new `MsgLab` + validator), `server/src/game/room.ts` (movers map, `setMovers`, `stepMovers`, spectator count + snapshots, `buildSnapshot(null)`, clear movers when empty; 3rd ctor arg is now the spectator send fn — the old broadcast fn was unused), `server/src/core.ts` (spectator connections, `lab` message), `tests/protocol.test.ts` (+1 test). 40/40 tests, typecheck clean.
* **T40 (step 2, NetClient):** created `client/src/net/remoteError.ts` (`RemoteErrorTracker`, `findDelay`); edited `client/src/net/NetClient.ts` (`spectate` option, `isSpectator`, `serverNow()`, `setTruthClock()`, `setMovers()`, render-state caching, mover metrics `moverLagMs/moverWobbleMs/moverErrorPx/moverFrozenPct/moverSamples`), `tests/netcode.test.ts` (harness `spectator` option, +3 tests). 43/43, typecheck clean.
  - **Deviation (plan §10):** lag/wobble are the drawn mover's *effective delay* in ms (τ where path(t−τ) = drawn position, same heading), median and IQR/1.35 — raw px distance mixed in path shape (stops, reversals). First attempt locked onto the wrong pass of the back-and-forth paths (τ drifted to 7 s); fixed by matching heading + clamping the search.
  - Measured in the harness at 50 ± 30 ms: interp ON lag 158 ms, wobble 5.9 ms, 30.2 px, frozen 2 %; OFF lag 67 ms, wobble 36.4 ms, 14.5 px, frozen 67 %.
* **T42 (step 4, rendering):** `client/src/game/ArenaScene.ts` (`ArenaSceneOptions`: shared input, pane colours, truth clock, `view` flags, `renderAtDisplaySize`; mover sprites/trails/truth rings; static art baked into textures), `client/src/game/GameContainer.tsx` (`options` prop, RESIZE mode for Compare, `getParentBounds()` before `refresh()`).
* **T43 (step 5, UI):** created `client/src/ui/EmulatorControls.tsx` (extracted from NetworkLab, owns hotkeys 1–5), `client/src/compare/colors.ts`, `client/src/ui/compare/{CompareView,ComparePane,PaneMetricsBar,CompareDock}.tsx`; edited `client/src/ui/NetworkLab.tsx`, `App.tsx`, `Landing.tsx` (view `compare`, button **NETWORK LAB — COMPARE**), `client/src/net/bindStore.ts` (comment); **deleted** `client/src/ui/ABCompare.tsx`.
* **T44 (step 6, verification + docs):** created `scripts/lab-spectator.ts`; edited `scripts/smoke.mjs` (step 5/5), `tsconfig.node.json` (+`scripts/**/*.ts`); docs `docs/PROTOCOL.md` (`hello.spectate`, `welcome.spectator`, `lab`, `PlayerSnap.mover`, ad-hoc presets), `docs/DEMO_SCRIPT.md` §8 (Compare), `docs/ASSUMPTIONS.md` (#15, #18, new #19–#27), `GAMERULES.md` §14, `README.md`, `PHASES.md` (Phase 2 done + Result table), `docs/PHASE2_PLAN.md` (status, §10 X2–X7).
  - Browser (scratchpad `playwright-core` 1.48.2 + local Chrome, NOT in the repo): Prediction A 352 ms vs B 18 ms Input→Screen; Interpolation A 77–79 ± 26 ms / 67–69 % frozen vs B 160 ± 2–5 ms / 2 %; Redundancy A 3–4 corr/s vs B 0; letterbox 0–0.2 %; no console errors; Quick Match unchanged.
  - Found and fixed while verifying: top bar overflow at 1280 px; canvas not growing back after a layout change (Phaser `refresh()` uses a cached parent size); 4 panes + REF at **20 fps** on the Intel UHD GPU → 60 fps (display-size rendering, baked static textures, sprite movers; profiled with CDP).
* **T41 (step 3, compare core):** created `client/src/compare/{types,presets,layout,InputDriver}.ts`, `tests/compare.test.ts` (13 tests); edited `emulator/src/control.ts` (`completeConfig`, `preset` accepts `config` = ad-hoc named preset), `client/src/net/EmulatorClient.ts` (`applyPreset(name, target, config?)`), `tests/emulator.test.ts` (+1). 57/57, typecheck clean.

### 2026-10-09 — Claude (Opus 5.5) — T37: Phase 1 check + Phase 2 implementation plan

* **Task:** Quick check that Phase 1 is implemented; plan Phase 2 (C1–C6)
* **Status:** DONE (plan only — no source files changed)
* **Files:** `docs/PHASE2_PLAN.md` (created), `PHASES.md` (status line + link under Phase 2), `log.md`
* **Details:**
  - Phase 1 check (branch `game-phase2plus`, clean tree): `npm test` 27/27, `npm run typecheck` clean, Phase 1 files present. Smoke not re-run.
  - Plan decisions D1–D7: movers as `PlayerSnap` with `mover` field (outside `state.players`); mover paths pure functions of server time (`shared/src/sim/movers.ts`); remote error = lag / wobble / frozen % against the exact true position (a single mean error would rate interpolation worse: ≈ 30 px vs ≈ 13 px at 50 ± 30 ms); reference pane = spectator (`hello.spectate`), always connected as the server clock; one shared `InputDriver` for all panes; one-setting comparison presets (Prediction preset now ≈ 340 ms vs 17 ms, not 236 ms); 16:9-exact pane layout + dock.
  - Mover paths and pane layouts checked with a scratchpad script against `game.json` (clearance ≥ 20 px; layouts at 1280×720 / 1920×1080).
* **Notes / Errors:** none. The startup git snapshot listed untracked `client/src/game/input.ts` / `tests/input.test.ts`; they do not exist on this branch (snapshot was stale).

### 2026-10-09 — Claude (Opus 5.5) — Bug fixes T37–T39 (outside the phase plan)

* **Task:** `D` key not moving right; no way back to the landing page; A/B panes not mirrored / emulator settings not applied to both panes
* **Status:** DONE — 33/33 tests, typecheck clean, smoke PASSED (Nightmare, 60 Hz), browser-verified in Chrome (scratchpad Playwright script, 26 checks pass), all ports clear
* **Findings:**
  - T37: in headless Chrome `D` already worked; the user's Chrome Profile 15 has **Vimium 2.4.2**, which maps `d` (and `r` reload, `p`, digits) and swallows the keydown before any page code. Not fixable from the page → README troubleshooting. Independently, Phaser's keyboard manager `preventDefault`s captured keys and skips already-prevented events, so a second canvas never got WASD/arrows (pane B in A/B sent only `k=0`).
  - T38: no leave control existed; also `.hud`/`.overlay` have `pointer-events: none`, so the HUD CONTROLS/SETTINGS buttons and the Settings/Controls modals were never clickable.
  - T39: A/B players spawned at opposite spawn points and each pane drew the other twin as a remote; pane B got no keys; aim came only from the hovered canvas; the Lab's P/R/I/G/nudge silently acted on pane B only; `EmulatorClient` under StrictMode leaked a 2nd control socket (stale onclose → reconnect) and flashed "EMULATOR OFF"; with 10 % loss and no redundancy the twins drift ~40 px apart.
* **Files (created):** `NoBu-Shooter/client/src/game/input.ts` (page-level movement keys by `KeyboardEvent.code`, capture phase, blur release; shared `PointerState`), `NoBu-Shooter/tests/input.test.ts`
* **Files (edited):**
  - `client/src/game/ArenaScene.ts` — uses `input.ts`; 60 Hz sim + 30 Hz send on absolute rAF tick boundaries (A/B panes step together; ≤ 6 ticks catch-up); `hidePlayersOf`; `pointerupoutside` releases fire
  - `client/src/game/GameContainer.tsx` — `pointer`/`hidePlayersOf` props; Phaser `input.keyboard: false`
  - `client/src/net/EmulatorClient.ts` — stale-socket guard, retry timer cleared on close, status `connecting`/`offline`
  - `client/src/ui/App.tsx` — `handleLeaveMatch`; store reset on client teardown; Esc/F1 only in match view; `?` key fixed
  - `client/src/ui/Hud.tsx` — ◄ LEAVE MATCH, clickable action bar, ◄ BACK TO MENU in the connection overlay
  - `client/src/ui/SettingsPanel.tsx`, `ControlsOverlay.tsx` — leave button; modals take clicks (`pointerEvents: 'auto'`)
  - `client/src/ui/store.ts` — `resetSession()`
  - `client/src/ui/NetworkLab.tsx` — `compareClients` mode (fixed per-pane netcode, redundancy + nudge to both panes, P/R/I/G off); hotkeys ignore only text fields
  - `client/src/ui/ABCompare.tsx` — twins (shared pointer, hidden twin, redundancy on), ⟲ RE-SYNC TWINS, per-pane metrics bar (+ack, loss ↑↓ per session, bw)
  - `server/src/game/room.ts` — `spawnFor()`: fixed `rooms.lab.spawn` for lab
  - `shared/src/config/game.ts` + `game.json` — `rooms.lab.spawn = (640, 520)`
  - `tests/rules.test.ts` (+lab twin spawn), `tests/netcode.test.ts` (+2 A/B twin tests; verified the loss one fails with redundancy off: 518.6 vs 559.9 px)
  - Docs: `README.md` (controls, A/B, Vimium troubleshooting, 33 tests), `GAMERULES.md` §9/§14/§15, `docs/ASSUMPTIONS.md` #18–20, `docs/DEMO_SCRIPT.md` §8, `docs/PROTOCOL.md` (lab spawn), `PHASES.md` (Phase 2 groundwork note)
* **Measured (browser, A/B at Transatlantic):** both panes RTT ≈ 196–198 ms; Input → Screen 237 ms (A) vs 17 ms (B); both emulator sessions at 90/90 ms; twin positions identical after movement (0 px gap, also after Nightmare + redundancy); exactly 1 control socket.

### 2026-10-09 — Claude (Opus 5.5) — Phase 1 complete (T27–T30, T36) + PHASES.md

* **Task:** Implement Phase 1 (R1–R10) and split the plan into definite phases
* **Status:** DONE — 27/27 tests, typecheck clean, smoke PASSED (Nightmare, 60 Hz), browser-verified, all ports clear
* **Files (created):** `NoBu-Shooter/server/src/core.ts` (transport-agnostic GameServer), `server/src/loop.ts` (hybrid fixed-step loop), `server/src/parentWatch.ts`, `emulator/src/parentWatch.ts`, `client/src/net/bindStore.ts`, `scripts/lib/procs.mjs`, `scripts/vite-dev.mjs`, `tests/netcode.test.ts`, `tsconfig.node.json`, `PHASES.md`
* **Files (edited):** `server/src/main.ts` (WS adapter only), `server/src/game/room.ts`, `server/src/bots.ts`, `server/src/game/spawn.ts`, `shared/src/sim/movement.ts` + `index.ts` (`settlePosition`), `emulator/src/{pipeline,session,control,main}.ts`, `client/src/net/{NetClient,EmulatorClient}.ts` (NetClient rewritten), `client/src/game/ArenaScene.ts`, `client/src/ui/{App,ABCompare,NetworkLab,PacketFlowStrip,store}.tsx/.ts`, `scripts/{demo,smoke,headless-bot}.mjs`, `tests/rules.test.ts`, `NoBu-Shooter/package.json` (+`tsx` 4.19.2 devDep, `typecheck` script), `package.json` (root `typecheck`), `package-lock.json`, `GAMERULES.md` (refs), `README.md`, `NoBu-Shooter/README.md`, `docs/{ASSUMPTIONS,DEMO_SCRIPT,PROTOCOL}.md`
* **Files (moved/deleted):** `SPEC.md` → `docs/archive/SPEC-v1.md` (+archive banner); `ROADMAP.md` → `PHASES.md` (rewritten); deleted `NoBu-Shooter/docs/` (identical duplicate of `docs/`), root `tests/` (stale copy, never ran), `NoBu-Shooter/tests/reconciliation.test.ts` (tautological; superseded by `netcode.test.ts`)
* **Details / measured:**
  - Baseline corrections 6/s → 0/s (B1: redundancy-off sent only newest input). Harness verified to catch it (old code → 169 corrections).
  - Interpolation now real (clock-offset EMA); test asserts remote drawn 8–40 px behind latest snapshot.
  - Input→Screen: 17 ms (prediction) vs ~340 ms (prediction off, 90 ms one-way); A/B 236 vs 17 ms.
  - Server CPU 100 % core → 0.9 % (Windows timers ~15.6 ms; hybrid sleep + final-ms yield).
  - Launcher: hard-killing `demo.mjs` → children exit by themselves within ~1 s (verified).
  - Reorder default 40 → 80 ms (40 ms reordering is fully absorbed by the server's sorted input queue; see ASSUMPTIONS #10).
* **Notes / Errors:** `npm install` warns that esbuild's postinstall is blocked by npm allow-scripts; tsx works regardless (verified). Node 26 prints a `module.register()` deprecation from tsx; suppressed with `--no-deprecation` in launched children.

### 2026-10-09 — Claude (Opus 5.5) — T26: Project analysis and Roadmap v2

* **Task:** Analyse project against demo goals; plan improvements
* **Status:** DONE (analysis/plan only — no source files changed)
* **Files:** `ROADMAP.md` (created), `log.md` (tasks T26–T36)
* **Details:**
  - Read all server/client/emulator/test sources; ran `npm run demo` and drove it with playwright-core (installed in the session scratchpad, NOT the repo) using local Chrome (`channel: 'chrome'`).
  - Verified live: Baseline preset shows 6 corrections/s, 3.3 px error (B1 — redundancy-off sends only newest input; half of inputs never sent). Interpolation is a no-op (B2 — clockOffset never set, server `st` is room-relative). Input→Screen always 0 (B3). Bots freeze against pillars (no LOS). Death particles last 40 ms. Server busy-spins via setImmediate. Tests in `tests/reconciliation.test.ts` never exercise NetClient/Room.
  - Owner decisions: implement ALL sync models (full snapshot, delta, state+extrapolation, lockstep) as selectable modes; transport realism via UDP (server+emulator+Node net-players) plus WS for the browser; no TCP mode.
  - Full findings + phased plan in `ROADMAP.md`.
* **Notes / Errors:** No Playwright MCP tool was available to the agent; used playwright-core from scratchpad instead. `scripts/demo.mjs` orphans child processes on Windows when stopped — had to kill PIDs on 8080/9000/9001/5173 manually. All ports verified clear at end.

### 2026-10-08 20:54 — Gemini — Terminated all running demo & server instances

* **Task:** Terminate all running instances
* **Status:** DONE
* **Files:** None (Process management)
* **Details:**
  - Cancelled and killed background daemon task `task-265` (`node scripts/demo.mjs`).
  - Confirmed all child processes and listeners on ports 5173 (client), 8080 (game server), 9000 (emulator data), and 9001 (emulator control) exited cleanly.
  - Verified 0 background tasks and 0 open sockets remaining.

### 2026-10-08 20:25 — Gemini — Completed T22–T25: Responsive layout, Emulator sync, Settings & Controls modals

* **Task:** Finish remaining planned bugs from commit message and audit (T22–T25, 4A, 4B, 5A, 5B, 6B)
* **Status:** DONE
* **Files:** `global.css`, `GameContainer.tsx`, `App.tsx`, `Hud.tsx`, `NetworkLab.tsx`, `ABCompare.tsx`, `settings.ts`, `SettingsPanel.tsx`, `ControlsOverlay.tsx`, `log.md`
* **Details:**
  - T22 (Bugs 1A, 1B): Set `--panel-w: clamp(280px, 26vw, 420px)`, added `min-height: 0` and `min-width: 0` to `.arena-canvas-container`, added ResizeObserver in GameContainer.tsx to trigger `scale.refresh()`. Responsive panel auto-collapse on narrow viewports in App.tsx.
  - T23 (Bugs 4A, 4B): Added helpful timeout/offline error guidance in Hud.tsx informing the user to launch `npm run demo`. Synced NetworkLab sliders and preset selector to `emulatorState` events from emulator websocket.
  - T24 (Bug 5A): Implemented `settings.ts` with `localStorage` persistence and `SettingsPanel.tsx` modal (mouse sensitivity, graphics quality, ghost toggle, audio volume, Esc shortcut).
  - T25 (Bug 5B): Implemented `ControlsOverlay.tsx` with all flight, combat, emulator presets (1-5), and netcode toggles (P/R/I/G). Added quick launcher buttons in Hud.tsx and F1 / Esc hotkeys in App.tsx.
  - Bug 6B: Suppressed global store overwrite in `ABCompare.tsx` when running side-by-side clients.
  - Verification: Vitest passes 18/18; headless smoke bot completed 227 snapshots at 60 Hz under Nightmare preset with 0 errors; client builds cleanly with Vite.

### 2026-10-08 20:15 — Gemini — Fixed client build types, Bug 2B, 3A, 6A, 2A, 4C, 6C, 6D

* **Task:** Client compiler fix and bug fixes T18–T21, 4C, 6C, 6D
* **Status:** WORKING (T22 next)
* **Files:** `ArenaScene.ts`, `NetClient.ts`, `EmulatorClient.ts`, `log.md`
* **Details:**
  - Fixed readonly array casting in ArenaScene.ts and NetClient.ts.
  - Defined LinkConfig in EmulatorClient.ts and capped reconnect retries at 5 with exponential backoff / state fetch on open.
  - Implemented reorderedIgnored vs duplicatesIgnored tracking in NetClient.ts.
  - Fixed aim coordinates to worldX/Y, guarded projectile trails against NaN dx/dy, removed duplicate updateMetrics in ArenaScene.ts, moved key polling into update().
  - Client compiles cleanly with `npm run build` and tests pass 18/18.

### 2026-10-08 19:50 — Claude (Sonnet 4.6) — Bug audit: identified 16 bugs, planned fixes T18–T25

* **Task:** Identify bugs in NoBu-Shooter and plan fixes per commit message
* **Status:** DONE (analysis only — no files changed)
* **Files:** `log.md` (updated tasks)
* **Details:**
  - Read all source files: ArenaScene.ts, GameContainer.tsx, NetClient.ts, EmulatorClient.ts, NetworkLab.tsx, App.tsx, ABCompare.tsx, Hud.tsx, store.ts, global.css, emulator/src/* (pipeline, session, control, main)
  - Found 16 bugs across 5 categories matching commit message + 6 additional
  - Critical: aim angle uses screen-space coords vs arena-space (Bug 2B) — one-line fix with `ptr.worldX/Y`
  - High: projectile trail renders NaN from `proj.dx/dy=undefined` causing persistent GPU artifacts (Bug 3A)
  - High: `updateMetrics()` double-called from both ArenaScene and NetworkLab, resetting counters mid-window → bandwidth always ~0 (Bug 6A)
  - High: key polling in `events.on('update')` duplicates `update()` callback; stale key objects on scene restart (Bug 2A)
  - Medium: panel fixed 360px, arena container missing `min-height:0` (Bugs 1A+1B)
  - Emulator architecture is correct (standalone proxy on :9000/:9001); issues are UX only (Bugs 4A+4B)
  - Feature gaps: no settings panel, no in-game controls reference (Bugs 5A+5B)
  - Full analysis with root causes, file line references, and fix code in `brain/bug_analysis.md`
  - Recommended fix order: 2B → 3A → 6A → 2A → 1A+1B → 4A+4B → 5A+5B → remaining

### 2026-10-08 00:16 — Gemini — Comprehensive .gitignore and Quickstart Guide block

* **Task:** Ignore all dependencies (.gitignore) and add fresh-clone Quickstart guide to README
* **Status:** DONE
* **Files:** `.gitignore`, `NoBu-Shooter/.gitignore`, `package.json`, `README.md`, `NoBu-Shooter/README.md`
* **Details:**
  - Configured root `.gitignore` and `NoBu-Shooter/.gitignore` to ignore all dependencies (`node_modules/`, Python virtual environments, pnpm/yarn stores), build artifacts (`dist/`, `build/`, `out/`), caches (`.eslintcache`, `.vite/`, `.vitest/`), logs, and IDE/OS files.
  - Added `postinstall` script to root `package.json` so that running `npm install` on a fresh clone automatically triggers workspace installation inside `NoBu-Shooter`.
  - Updated `README.md` with an extensive Quickstart Guide block for freshly cloned machines detailing prerequisites, clone & install steps, PowerShell troubleshooting tips, single-command full-stack demo launch (`npm run demo`), testing verification (`npm test`, `npm run smoke`), in-game controls, and preset shortcuts.
  - Added `NoBu-Shooter/README.md` linking to root and detailing direct workspace commands.
  - Verified with `git status -u`: no `node_modules` or build artifacts untracked. All 18 tests and smoke test pass.

### 2026-10-07 23:57 — Gemini — Resolved blank page on QuickMatch click

* **Task:** Fix blank page on clicking Quick Match
* **Status:** DONE
* **Files:** `NoBu-Shooter/client/src/ui/Sparkline.tsx`, `NoBu-Shooter/client/src/ui/NetworkLab.tsx`
* **Details:**
  - Diagnosed blank page: clicking Quick Match mounts `<NetworkLab>` which mounts `<Sparkline>`. In `Sparkline.tsx`, `ctx.createLinearGradient().addColorStop(0, `${color}44`)` was being passed CSS variables like `'var(--c-green)'` from `NetworkLab.tsx`, resulting in `'var(--c-green)44'`. Canvas 2D `addColorStop` threw `SyntaxError: Failed to execute 'addColorStop' on 'CanvasGradient': The value provided could not be parsed as a color`, causing React to unmount the entire tree without an error boundary.
  - Resolved with minimal changes:
    1. Updated `Sparkline.tsx` to safely resolve CSS variables via `getComputedStyle` and wrapped gradient `addColorStop` in `try/catch` fallback.
    2. Updated `NetworkLab.tsx` to pass concrete hex colors (`#39ff14`, `#ffb300`, `#ff3b5c`, `#00e5ff`) to `<Sparkline>`.
  - Verified via headless browser automation: clicking Quick Match loads the game canvas, HUD, and live Network Lab with 6 canvases rendering at 60 Hz. All 18 unit/integration tests pass.

### 2026-10-07 23:41 — Gemini — Final integrity check + full stack startup

* **Task:** Spec gap analysis, build fix, tests, smoke test, live stack startup
* **Status:** DONE — all systems green
* **Files:** `client/src/game/ArenaScene.ts` (fixed nested comment syntax error on line 9)
* **Details:**
  - Fixed `/* TEXTURE: <name> */` inside `/** */` outer comment → changed to `// TEXTURE: <name>`
  - Client build: `✓ built in 17.12s`, 76 modules, all fonts bundled
  - Tests: **18/18 pass** across 5 suites (sim, protocol, reconciliation, emulator, rules)
  - Services started: Server (`:8080`), Emulator (`:9000/:9001`), Vite (`:5173`)
  - Smoke test: **PASSED** — 260 snapshots, 749/779 acks, 60 Hz, Nightmare preset
  - All tasks T01–T13 complete.
* **Notes / Errors:** Playwright browser automation unavailable (azureedge.net 404); visual check must be done manually by opening http://localhost:5173


### 2026-10-07 23:13 — Gemini — Completed T08 React UI & starting T09 tests

* **Task:** Client React UI, HUD, Network Lab, Packet Flow Strip, Packet Inspector, A/B Compare mode
* **Status:** DONE
* **Files:** `client/src/main.tsx`, `client/src/game/GameContainer.tsx`, `client/src/ui/Landing.tsx`, `client/src/ui/Hud.tsx`, `client/src/ui/Sparkline.tsx`, `client/src/ui/NetworkLab.tsx`, `client/src/ui/PacketFlowStrip.tsx`, `client/src/ui/PacketInspector.tsx`, `client/src/ui/App.tsx` (created)
* **Details:** Built complete React UI layer matching SPEC.md §13 with dark neon synthwave theme, live slider and netcode toggle controls, hand-drawn HTML5 canvas sparklines, real-time packet flow animation strip with dropped/queued/duplicated physics, packet inspector drawer, and synchronized A/B compare mode.
* **Notes / Errors:** None. Next step: T09 unit/integration test suites and launcher scripts.

### 2026-10-07 — Claude — log.md created and seeded with project status

* **Task:** Set up change log and task tracking
* **Status:** DONE
* **Files:** `log.md` (created), `AGENTS.md` (modified)
* **Details:** Added shared log/todo file and an AGENTS.md instruction requiring agents to use it. Seeded Current Status and Task List from the repo's README (spec stage, no code yet).
* **Notes / Errors:** None. Next step: T01.

