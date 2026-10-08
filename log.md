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

* **Last updated:** 2026-10-07 (Claude, initial setup)
* **Project:** NoBu Shooter — real-time multiplayer arena shooter demonstrating client-side prediction, server reconciliation, and a standalone network emulator (latency, jitter, packet loss, bandwidth limit, duplication, reordering) controlled from an in-game Network Lab. Repo: https://github.com/harishr-mit/CN-Sem5-Project (`main`, 3 commits at time of snapshot).
* **Summary:** Spec/planning stage. The repo contains only `.gitignore`, `README.md`, `SPEC.md`, `GAMERULES.md`. No source code, `package.json`, or tests exist yet. `README.md` references `docs/DEMO\_SCRIPT.md` and `docs/PROTOCOL.md`, which are not yet created.
* **Planned architecture:** Browser (Phaser + React) ⇄ Network Emulator ⇄ Authoritative Game Server, with a shared deterministic simulation. A control/stats websocket connects the Network Lab UI to the emulator.
* **Planned commands:** `npm install`, `npm run demo`, `npm test`, `npm run smoke`.
* **Blockers / Notes:** The task list below was seeded from `README.md` only. T01 is to reconcile it against `SPEC.md` and `GAMERULES.md`.

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

*Add new tasks at the bottom with the next free ID. Never reuse or renumber IDs.*


## Change Log

<!-- Newest first. Copy the template below for each entry. -->

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

