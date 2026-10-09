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

* **Last updated:** 2026-10-09 (Claude Opus 5.5) — **Phases 1 and 2 of `PHASES.md` complete.** Next: Phase 3 (T32). Phase 2 plan, decisions and deviations: `docs/PHASE2_PLAN.md`.
* **Project:** NoBu Shooter — real-time multiplayer arena shooter demonstrating client-side prediction, server reconciliation, snapshot-vs-state sync models, and a standalone network emulator (latency, jitter, loss, bandwidth, duplication, reordering) controlled from an in-game Network Lab. Repo: https://github.com/harishr-mit/CN-Sem5-Project (working branch `game`).
* **Plan:** `PHASES.md` — six phases, each with a demo checkpoint and exit criteria. `GAMERULES.md` = gameplay rules. v1 spec archived at `docs/archive/SPEC-v1.md`.
* **Architecture:** Browser (Phaser + React) ⇄ Emulator (:9000 data, :9001 control) ⇄ Authoritative server (:8080). Server core is transport-agnostic (`server/src/core.ts`); `NetClient` is headless (injectable transport/clock).
* **Commands (from repo root or `NoBu-Shooter/`):** `npm run demo`, `npm test` (57 tests incl. end-to-end netcode harness), `npm run typecheck`, `npm run smoke` (bot under Nightmare + lab spectator/movers check).
* **Verification tooling:** no Playwright MCP is attached to agents; browser checks were done with `playwright-core` installed in the session scratchpad (NOT the repo) driving local Chrome (`channel: 'chrome'`). Phase 4 adds `npm run shots` to the repo.
* **Blockers / Notes:** none. Dev-mode React StrictMode prints harmless "closed before established" WebSocket warnings in the Compare view (documented in `docs/ASSUMPTIONS.md` #18). The owner committed mid-Phase-2 work as `127fc29` ("credit exhausted - broken commit"); the Phase 2 work after it is uncommitted at the end of this run.

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
* [ ] T32: **Phase 3** — Sync models: full / delta / state+extrapolation, bandwidth chart (PHASES.md S0–S5)
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

*Add new tasks at the bottom with the next free ID. Never reuse or renumber IDs.*


## Change Log

<!-- Newest first. Copy the template below for each entry. -->

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

