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

* **Last updated:** 2026-10-12 (Claude Opus 5.5) — **Phases 1, 2, 2.5, 3 and 4 of `PHASES.md` complete.** Phase 4 (T33 = T69–T75, done 2026-10-11): **Presenter mode** — landing buttons PRESENTER — QUICK MATCH (12 steps, Invincible on) and PRESENTER — COMPARE (the 6 Compare presets), keys `N` / `B` / `H` + END, caption bar with expected numbers and a step timer; arena polish (remote aim chevrons, death ✕, respawn pulse for all, camera bloom at quality high with fps auto-off); Lab sections fold and are remembered, UI Scale 100/115/130 %; emulator `queueMs` + `reordered`, packet strip with queue bar, real-timeline overtakes and a legend; `npm run shots` (local Chrome via `playwright-core` 1.48.2 devDependency, output `NoBu-Shooter/artifacts/shots/`, git-ignored) + `docs/VISUAL_CHECKLIST.md`. 162 tests, typecheck, smoke (6 steps), shots (40/40, 0 console errors) and both presenter scripts pass. Keys: `R` reload, `Space` dash, `C` reconciliation, `M` mute, `Y` sync model, `N`/`B`/`H` presenter. Owner revision after Phase 4 (T76–T82, 2026-10-11): SYNC MODEL in two groups, developer Give power-up, Presenter ∞ match clock, ⟲ RESTART and map switching (both presenters), countdown teleport fix; then (T83–T85) one power-up per player refilled every 7 s, 2-minute matches, and the camera glow removed entirely (T86; it caused the arena haze); 163 tests. **Phase 5 done 2026-10-12 (T34 = T88–T94; plan `docs/PHASE5_PLAN.md`, D1–D15, deviations X1–X8):** server UDP adapter `:8081` beside WS `:8080` (same core; `--host` / `NOBU_HOST`, default all interfaces); app-level fragments ≤ 1200 B (`shared/src/net/fragment.ts`); emulator rebuilt around **routes** (`ws:9000`, `udp:9100`, or any ports, from `--route` or added at runtime), byte payloads, no game dependency, per-route per-direction defaults, 64 sessions/route, UDP idle 30 s; **dashboard** at `http://127.0.0.1:9001/` (self-contained page; control port 127.0.0.1 only + Origin allowlist); `npm run emulator` (dashboard only), `udp-echo` / `udp-send` tools, `emulator/README.md`; **network players** `npm run swarm` / `npm run demo -- --swarm N` (bot brain in `shared/src/sim/botBrain.ts`, names UDP-n); the game impairs only `ws:9000`; Presenter Quick Match **Q13** (13 steps). Owner extras: purple piercing rounds (T96), README quickstart + Command Reference (T97). **196 tests**, typecheck, smoke (7 steps incl. a UDP network player under Nightmare), `npm run shots` (23 screens × 2, 0 console errors). Ports: TCP 5173/8080/9000/9001, UDP 8081/9100. Candidate **Phase 7** (multiplayer readiness, not scheduled) in `PHASES.md`. **Phase 6 done 2026-10-12 (T35 = T99–T106; plan `docs/PHASE6_PLAN.md`, D1–D12, deviations X1–X8): all six phases complete.**
  - **Lockstep** (lab room / Compare only): the server relays the keys it consumed per tick (`ls` records, keyframes in the stream, 256-tick ring, hash every 30 ticks). `LockstepClient` plays out 2 ticks behind, stalls, catches up ≤ 3 ticks per frame, NACKs (Rd off) or uses a redundant window (Rd on). `LOCKSTEP_LAB_ONLY` elsewhere.
  - Compare preset **Snapshot vs Lockstep** = Presenter **C7**; greyed P/C/I/G; STALLED / LONGEST / BEHIND / NACKED / DESYNC metrics.
  - The hash check found Chrome vs Node `Math.cos` / `Math.sin` 1-bit differences → movers use a deterministic `dsin` / `dcos` (`shared/src/sim/dtrig.ts`).
  - Dress rehearsal (fresh copy + timed run-through, ≈ 60 fps) → `docs/REHEARSAL.md`. Talk order changed: network players start at **Q13** (`npm run swarm -- --n 3`).
  - **222 tests**, typecheck, smoke (**8 steps**, step 8 = lockstep over real sockets), `npm run shots` (**25 screens × 2**, 0 console errors).
  - **Remaining:** the owner's rehearsal on the presentation laptop (`docs/REHEARSAL.md` §3–§4).
  - **Phase 7 done 2026-10-12 (T107–T114; plan `docs/PHASE7_PLAN.md`, D1–D16, deviations X1–X10):** LAN play in the browser. **Game edition** (`npm run dev` HMR on 5173 + `/ws` proxy, `npm run build` → `dist/game` with a bundle guard, `npm start` = one port 8080 for page + `/ws`): fixed best settings (Delta, prediction + reconciliation + interpolation, redundancy off), no Lab / Compare / Presenter / emulator / State / Lockstep code; game server (`--game`) refuses operator messages. **Private rooms** (two-word codes like BLUE FOX, host START, 60 s grace, 32 max) and a 10 s **join window** in `main` (Presenter skips it) in every edition. **Ping** chip. **Graphics Quality** tiers: `npm run assets` → `assets-build/{low,medium,high}` (WebP / OGG; 191 / 359 / 645 kB, was ≈ 4.7 MB; `stone_beige` 2.2 MB → 141 kB); raw frames moved to `assets-src/`. Latin-only fonts. Game build 3.2 MB (demo build was 16 MB), JS brotli 332 kB. **267 tests**, typecheck, smoke **10 steps**, shots **34 × 2**. Ports: demo as before; game 8080 (+5173 in dev). Option B (internet: TLS, M4 hardening, browser datagrams + redundancy) is future scope. Remaining: the owner's check from a second machine.
  - Branch `phase7`: pre-implementation commit `879d0f0` by the agent (owner-requested); the implementation is uncommitted.
* **Project:** NoBu Shooter — real-time multiplayer arena shooter demonstrating client-side prediction, server reconciliation, snapshot-vs-state sync models, and a standalone network emulator (latency, jitter, loss, bandwidth, duplication, reordering) controlled from an in-game Network Lab. Repo: https://github.com/harishr-mit/CN-Sem5-Project (`main` holds everything as of T49; earlier work branches: `game`, `game-phase2plus`).
* **Plan:** `PHASES.md` — six phases, each with a demo checkpoint and exit criteria. `GAMERULES.md` = gameplay rules. v1 spec archived at `docs/archive/SPEC-v1.md`.
* **Architecture:** Browser (Phaser + React) ⇄ Emulator (:9000 data, :9001 control) ⇄ Authoritative server (:8080). Server core is transport-agnostic (`server/src/core.ts`); `NetClient` is headless (injectable transport/clock).
* **Assets:** `NoBu-Shooter/assets/` (`README.md` inventory, `CREDITS.md` licences — the survivor avatar is CC-BY 3.0 and must stay credited).
* **Commands (from repo root or `NoBu-Shooter/`):** `npm run demo` (`NOBU_MAPS=plaza` picks the map), `npm test` (163 tests incl. end-to-end netcode harness, sync models, presenter scripts), `npm run typecheck`, `npm run smoke` (bot under Nightmare incl. ammo/reload/pads + lab spectator/movers + full vs delta NetClients), `npm run shots` (`-- --fast`, `-- --only=name`; screenshots of 20 screens × 2 viewports), `npm run pack-assets` (player atlas).
* **Verification tooling:** `npm run shots` (repo, Phase 4) drives the installed Chrome through the project-local `playwright-core` devDependency. Ad-hoc checks (presenter walk-through, Lab scroll, strip, bloom benchmark, view-switch stress) were scratchpad scripts that `require` the repo's `playwright-core`; they are not in the repo. Headless Chrome on the dev laptop renders with the real Intel UHD GPU (ANGLE/D3D11), so its fps numbers are meaningful.
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
* [x] T33: **Phase 4** — Presenter mode, arena/lab/strip polish, texture manifest, `npm run shots` (PHASES.md P1–P7)
* [x] T34: **Phase 5** — UDP adapters, emulator UDP mode, network-player swarm, emulator dashboard + README (PHASES.md U1–U7)
* [x] T35: **Phase 6** — Lockstep (S4), final docs, rehearsal (PHASES.md L1–L5)
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

* [x] T68: Phase 4 implementation plan (`docs/PHASE4_PLAN.md`) + owner decisions; PHASES.md Phase 4 synced
* [x] T69: Phase 4 step 1 — presenter core (`client/src/presenter/`: types, scripts, controller), NetClient `setToggles` + `toggles`/`sync`/`dev` events, NetworkLab follows them (plan tests 1–3) — owner approved the plan 2026-10-11
* [x] T70: Phase 4 step 2 — Presenter UI (`PresenterBar`, N/B/H, END), App views, CompareView `presetId`, Landing buttons (P1, P6)
* [x] T71: Phase 4 step 3 — arena polish: death markers, respawn pulse for all, aim chevrons, camera bloom (Quick Match, quality high, auto-degrade) (P2)
* [x] T72: Phase 4 step 4 — Lab collapsible sections + UI scale setting (P4)
* [x] T73: Phase 4 step 5 — emulator `queueMs` + `reordered`; strip queue bar, overtakes, legend (P5, plan test 5)
* [x] T74: Phase 4 step 6 — `npm run shots` (playwright-core devDependency, `artifacts/` ignored, root proxy) + `docs/VISUAL_CHECKLIST.md` (P7)
* [x] T75: Phase 4 step 7 — shots review, docs, phase exit

* [x] T76: Owner revision (Phase 4 follow-up) — Quick Match SYNC MODEL regrouped as SNAPSHOTS (Full | Delta) and STATE SYNC (10 | 30 Hz), still one active (owner chose "regroup UI"); Compare SYNC chip tooltip
* [x] T77: Developer "give power-up" (Lab → Developer; `dev.give`, server applies it like a pickup + PICKUP event)
* [x] T78: Presenter: endless match (`dev.endless`, clock frozen, `match.endless` → HUD ∞; off on END / when the last human leaves)
* [x] T79: Presenter: RESTART on both bars (Quick: new match + step 1; Compare: C1 + panes back to the spawn + charts cleared) (`dev.restart`)
* [x] T80: Presenter: map switching on both bars (`dev.map` → restart on that map; lab room too); lab spawn clear on every map
* [x] T81: Owner question — truth ring "in front of" the drones: answer (intended: the drawn drone lags behind the true position) + clearer TRUTH tooltip
* [x] T82: Tests, docs, verification (typecheck, tests, smoke, shots, presenter check)

* [x] T83: Owner: power-up cap = number of participants (was ⌊n/2⌋), refill 7 s (was 10 s), match 2 min (was 3 min)
* [x] T84: Bug: "fuzzy layer / haze over the whole arena, sometimes" — investigate (suspect: camera bloom; auto-off re-enabled by unrelated settings saves) and fix
* [x] T85: Tests, docs, verification

* [x] T86: Owner: remove the camera glow entirely (with the Graphics Quality setting and the fps auto-off that existed only for it)

* [x] T87: Phase 5 implementation plan (`docs/PHASE5_PLAN.md`) + owner decisions; PHASES.md Phase 5 synced
* [x] T88: Phase 5 step 1 — emulator core: byte payloads, local PRNG, endpoint sessions, `RouteManager` + WS routes, `--route`, route-scoped targets/defaults; game client targets `ws:9000` (plan tests 5, 6, 9)
* [x] T89: Phase 5 step 2 — `shared/src/net/fragment.ts`, server UDP adapter :8081, Node UDP transport, `net.json` ports (plan tests 1, 3)
* [x] T90: Phase 5 step 3 — emulator UDP routes, idle timeout, session cap, `session.label`, runtime `route.add`/`remove`, control-port safety (plan tests 2, 4, 7)
* [x] T91: Phase 5 step 4 — `botBrain` extraction, `npm run swarm`, `npm run demo -- --swarm N`, UDP port checks
* [x] T92: Phase 5 step 5 — emulator dashboard page + static serving + `npm run emulator` + Landing / Lab links
* [x] T93: Phase 5 step 6 — Presenter Q13 + `swarmNetwork`; `udp-echo` / `udp-send` tools; `emulator/README.md` (plan test 8)
* [x] T94: Phase 5 step 7 — smoke step 7, shots, docs, phase exit
* [x] T95: Owner revision of the Phase 5 plan (network binding: only the control port stays local; server UDP + data routes reachable like today's WS ports, configurable host) + "multiplayer readiness" candidate phase in PHASES.md + Phase 5 preparation (baseline checks)
* [x] T96: Owner: bullets look more purple while the Piercing power-up is on
* [x] T97: Owner: README quickstart update + list of runnable commands (demo, swarm, emulator, ...)

* [x] T98: Phase 6 implementation plan (`docs/PHASE6_PLAN.md`) + owner decisions; PHASES.md Phase 6 synced; baseline checks
* [x] T99: Phase 6 step 1 — shared: lockstep sync model types, `ls` / `lsNack` messages + validators, `hashWorld`, `applyRecord`, `LockstepEncoder`, `net.json` (plan tests 1–3)
* [x] T100: Phase 6 step 2 — server: lab input log, keyframes, record ring, lockstep connections, `LOCKSTEP_LAB_ONLY` (plan test 4)
* [x] T101: Phase 6 step 3 — client: `LockstepClient` (playout, stalls, catch-up, NACK, hash check), NetClient integration, metrics (plan tests 5–7)
* [x] T102: Phase 6 step 4 — Compare: preset "Snapshot vs Lockstep" (Full / Lockstep / Lockstep + Rd), SYNC cycle, greyed chips, metrics bar / dock; Presenter C7 (plan test 8)
* [x] T103: Phase 6 step 5 — smoke step 8, shots (`compare-lockstep`, `presenter-compare-7`), measured numbers
* [x] T104: Phase 6 step 6 — final docs (L4): DEMO_SCRIPT final talk track, README, PROTOCOL, ASSUMPTIONS, GAMERULES, VISUAL_CHECKLIST
* [x] T105: Phase 6 step 7 — rehearsal (L5): fresh-copy cold start, timed headless Presenter run-through, `docs/REHEARSAL.md` checklist for the presentation laptop; fix anything that stutters
* [x] T106: Phase 6 step 8 — phase exit + Definition of Done

* [x] T107: Phase 7 scoping discussion with the owner: record the decisions so far in PHASES.md (Phase 7 section), GAMERULES.md (planned join window), assets/README.md (planned quality tiers), README.md, log.md. No code.
* [x] T108: Phase 7 implementation plan (`docs/PHASE7_PLAN.md`, D1–D16) + owner decisions (rooms with codes, OGG, stone_beige, raw frames) synced to PHASES / GAMERULES / assets README; pre-implementation commit
* [x] T109: Phase 7 step 1 — assets: raw frames → `assets-src/`, `build-assets` (sharp + ffmpeg-static; WebP, OGG, tiers, budgets), publicDir → `assets-build/`, Graphics Quality + progressive swap, latin fonts (plan tests 7–8)
* [x] T110: Phase 7 step 2 — server: join window + `start`, private rooms + codes + host, game mode, static server, flags (plan tests 1–5)
* [x] T111: Phase 7 step 3 — client shared: `serverUrl`, pluggable sync models, `MatchView` / `LandingForm`, rooms UI, waiting overlay, ping, Presenter `start` (plan tests 6, 9)
* [x] T112: Phase 7 step 4 — game edition: `client/play`, `vite.play.config.ts`, `npm run dev` / `build` / `start`, bundle guard (plan test 10)
* [x] T113: Phase 7 step 5 — verification: smoke steps 9–10, shots, LAN check, bundle numbers
* [x] T114: Phase 7 step 6 — docs + phase exit

*Add new tasks at the bottom with the next free ID. Never reuse or renumber IDs.*


## Change Log

<!-- Newest first. Copy the template below for each entry. -->

### 2026-10-12 — Claude (Opus 5.5) — Phase 7 implementation (T109–T114)

* **Task:** Owner: implement Phase 7 (option A) after the pre-implementation commit; ask for critical decisions, fix bugs found, add tests. No question needed asking mid-run.
* **Status:** DONE. Plan deviations X1–X10 in `docs/PHASE7_PLAN.md` §8. Remaining: the owner's check from a second machine on the same network. Nothing committed by the agent after the pre-implementation commit `879d0f0`.
* **Dependencies:** `sharp@0.33.5`, `ffmpeg-static@5.2.0` (NoBu-Shooter devDependencies, local; owner-approved). No global installs.

* **T109 (step 1, assets) — DONE:**
  * **Dependencies (owner-approved, local devDependencies):** `sharp@0.33.5` (prebuilt win32 binary), `ffmpeg-static@5.2.0` (downloads `ffmpeg.exe` into node_modules on install; npm 11 lists both under "allow-scripts", the binaries were present and work). `.gitignore` (NoBu-Shooter): `assets-build/`.
  * Raw player frames `git mv` → `NoBu-Shooter/assets-src/player/` (pack-assets input; output unchanged, verified by re-packing).
  * `scripts/build-assets.mjs` (`npm run assets`, root too): WebP / OGG tiers into `assets-build/{low,medium,high}`, the atlas re-packed per frame with fresh padding, budgets, incremental stamp, manifest. Config `client/src/game/assetTiers.json`. Served art + sound: **high 645 kB, medium 359 kB, low 191 kB** (was ≈ 4.7 MB loaded, 16 MB built); `stone_beige` 2.2 MB → 141 kB; atlas 1.6 MB → 288 kB; sounds 432 → ≈ 100 kB.
  * Client: `game/tiers.ts` (pure mapping), `assets.ts` rewritten (tier URLs, `invScale`, `loadTier`, `swapTier`, runtime map art included), draw sites scaled (player sprites, floor tile, muzzle), `ArenaScene` starts on low and upgrades by scene restart (state reset in `init`), Compare panes fixed at medium; Settings → Graphics Quality (`Choice` component shared with UI Scale; `demoRows` prop hides the ghost row in the game); `vite.config.ts` publicDir → `assets-build`; `demo.mjs` runs the assets step (`buildAssets` in `scripts/lib/procs.mjs`); latin-only fonts (`styles/fonts.ts`).
  * Checked in Chrome (scratch Playwright): low → high upgrade, high → low → medium → high live, sizes unchanged, 0 console errors. `tests/assets.test.ts` (9 tests). 231 tests, typecheck clean.
* **T110 (step 2, server) — DONE:**
  * Shared: `shared/src/rooms/codes.ts` (40 adjectives × 40 animals = 1 600 two-word codes, `normalizeCode` / `formatCode` / `newCode`; package export `./rooms/*`); protocol: `hello.room` string (`main` / `lab` / `new` / code, made canonical by the validator), `MsgStart`, welcome `code` / `host`, `MatchSnap.waitMsLeft` / `code` / `hostId`, errors `ROOM_NOT_FOUND` / `ROOM_LIMIT` / `NOT_ALLOWED` / `SYNC_FIXED`; `game.json` + `game.ts`: `match.joinWindowMs` 10000, `privateRooms` { max 32, emptyGraceMs 60000 }.
  * `room.ts`: `kind` main / lab / private (private = main rules), join window in WAITING (ends early at 4 humans; `NOBU_JOIN_WINDOW_MS` override), `start()` (host in private rooms; `main` only under NOBU_DEV), host handover, snapshot fields.
  * `core.ts`: `GameServerOptions` (mode demo / game, joinWindowMs, maxPrivateRooms, emptyGraceMs, random), `roomFor` (create / join / errors), empty-room sweep in `checkTimeouts`, game mode (Delta only + SYNC_FIXED; dev / perturb / lab / spectate / lab room → NOT_ALLOWED; `start` in main never). **Bug found while testing:** `start` in `main` would have been honoured on a game server started with NOBU_DEV=1 — now blocked in the core, and `main.ts` refuses to run `--game` with NOBU_DEV.
  * `http.ts` (new: HTTP + WebSocket on `/ws` and `/`, 64 kB max message, used by main.ts and tests), `static.ts` (new: D7), `main.ts` flags `--game` / `--static` / `--port` / `--udp` (+ `NOBU_MODE`, `PORT`), LAN addresses printed.
  * Tests: `tests/rooms.test.ts` (18), `tests/gamemode.test.ts` (11); vitest env `NOBU_JOIN_WINDOW_MS=0`, smoke and shots set it too. 260 tests, typecheck clean.
* **T111 (step 3, client shared) — DONE:**
  * `NetClient`: optional `models` (`SyncModules`: extrapolator + lockstep factories; `net/allModels.ts` = `ALL_MODELS`, passed by the demo, Compare, tests and tools), `supports()`, `room` is a string (code after the welcome), `code`, `isHost`, `serverError`, `start()`; a refused hello stops retrying; SYNC_FIXED / NOT_ALLOWED after the welcome are not fatal.
  * `net/serverUrl.ts` (game `/ws` on the page host, `?server=` override, demo services on the page host, `?room=` links). Demo + Compare no longer hard-code 127.0.0.1 for the data route / server (control port stays local).
  * Shared UI: `ui/LandingForm.tsx` (callsign, QUICK MATCH, CREATE ROOM, JOIN ROOM with code check, credits), `ui/MatchView.tsx` (arena + HUD + Settings + Controls + Esc / F1 / M + connect life cycle); `Landing.tsx` and `App.tsx` rebuilt on them; `Hud.tsx`: ping chip, join-window overlay, private-room lobby (code, link, COPY, players, START for the host), room error texts, `offlineHint`; `ControlsOverlay` takes edition groups (`ui/demoControls.ts`); Presenter Quick Match sends `start` on welcome.
  * Tests: `tests/serverUrl.test.ts` (7, incl. a Delta match with no optional models).
* **T112 (step 4, game edition) — DONE:**
  * `client/play/index.html` + `client/play/main.tsx` (entry in the play root — **bug found:** with the entry under `src/` the dev server couldn't resolve `../src/...` from the `client/play` root, though `vite build` could), `src/play/PlayApp.tsx`, `client/vite.play.config.ts` (root `client/play`, `host: true`, `/ws` proxy → 8080, out `dist/game`); `client/tsconfig.json` includes `play`.
  * Scripts: `scripts/dev.mjs` (`npm run dev`), `scripts/build.mjs` (`npm run build`, bundle guard + size report — the guard lives here instead of a vitest test, deviation X1), `scripts/start.mjs` (`npm start`), `vite-dev.mjs --game`; root + NoBu-Shooter `package.json` scripts. Both `index.html` files get an inline SVG favicon (the demo's `/favicon.svg` never existed: a 404 per page load).
  * **Fonts bug:** `global.css` imported every `@fontsource` subset itself; now Latin-only there (no separate fonts file).
  * Demo key groups moved out of `ControlsOverlay` into `ui/demoControls.ts` (their text had been in the game bundle).
  * Build: **JS 1 689 kB (brotli 332 kB), CSS 27 kB (brotli 5 kB), fonts 142 kB, art + sound 191 / 359 / 645 kB, 3.2 MB on disk** (demo build before Phase 7: 16 MB, JS 1 798 kB / gzip 443 kB). No demo marker in the game JS.
  * Checked in Chrome via the LAN address 192.168.0.9: `npm start` (join window → match, ping, no Lab; create room → code + link, second player joins by typed code, only the host has START, bots fill; bad / unknown code messages; `?room=` prefill) and `npm run dev` (HMR in place, `/ws` proxy).
* **T113 (step 5, verification):**
  * `npm run shots`: **34 screens × 2, 0 console errors** (game-room-guest at ≈ 30 fps: two arenas render in one headless browser; noted in the checklist). Reviewed 26–34 against `docs/VISUAL_CHECKLIST.md`: OK.
  * Demo with the real window (no env override): Quick Match waits 10 s, counts down, plays; Presenter Quick Match starts at once (∞). `npm start`: only TCP 8080 listening (UDP closed); `--game` with NOBU_DEV=1 refused.
  * Final: **267 tests**, typecheck clean, smoke 10/10. All processes stopped, ports 5173/8080/8081/8090/9000/9001/9100 free. ESLint has no config in this repo (pre-existing), not run.
  * `scripts/game-clients.ts` + smoke steps 9–10 (build; game server on 127.0.0.1:8090 with a 3 s join window; page / brotli / immutable / 404 outside the build; NOT_ALLOWED / SYNC_FIXED; quick match WAITING → COUNTDOWN → RUNNING with the game's client, 180 deltas; private room create / join by code / guest START ignored / host START / bots / ROOM_NOT_FOUND). **Smoke: 10/10 PASSED.**
  * `scripts/shots.mjs`: builds the game, serves it on 127.0.0.1:8090 (10-min join window), 9 game screens (26–34); `screen.url`.
* **T114 (step 6, docs) — DONE:** README (status, §3 join window + rooms, new §4 "Play with friends on your network", command tables, controls, structure, architecture, troubleshooting), NoBu-Shooter/README, PROTOCOL (§1 transport row, hello rooms, §2.6a `start`, welcome / match fields, errors, new §6 game server), GAMERULES (revision 3, §2 join window + private rooms implemented, §12, §14, §15 constants, §17 Graphics Quality + ping, §18 OGG, §19), ASSUMPTIONS #110–#125 (+ #91 wording), DEMO_SCRIPT (§1 join window, §12 Presenter skip, new §15 LAN), VISUAL_CHECKLIST (rows 01/03/06/07, 26–34), assets/README (served files and tiers), emulator/README (in front of the game edition), PHASES (Phase 7 done, items, DoD), PHASE7_PLAN (status, deviations X1–X10).

### 2026-10-12 — Claude (Opus 5.5) — T108: Phase 7 implementation plan + pre-implementation commit

* **Task:** Owner: plan Phase 7 (option A), then make the pre-implementation commit before implementing.
* **Owner answers:** 10 s join window OK; Presenter skips it; `sharp` + `ffmpeg-static` as local dev dependencies OK; command names `dev` / `build` / `start` OK; ping-only HUD; **private rooms joined with a short, memorable room id** (new, M6 now in); compress `stone_beige.png` to the size of the other floors; convert all sounds to OGG; the raw player frames should not be served by any edition (demo included).
* **Decisions taken without asking (plan §1):** two client editions from one code base (`client/play` entry + shared `MatchView` / `LandingForm`); pluggable sync models in `NetClient` (game bundle without lockstep / extrapolation); `/ws` on the page's host + `?server=` override; one server binary with `--game` / `--static` / `--port` / `--udp`; Node-only static server with brotli/gzip and immutable caching; two-word room codes (`BLUE FOX`), host START, 32 rooms max, 60 s grace; WebP textures + OGG sounds generated into git-ignored `assets-build/{high,medium,low}` with budgets (≤ 300 kB per file, `stone_beige` ≤ 160 kB); masters stay in `assets/`; progressive tier upgrade by scene restart; latin-only font subsets; bundle guard test.
* **Baseline measured:** demo `vite build` (scratchpad output, deleted) = 16 MB on disk: JS 1,798 kB (gzip 443 kB), CSS 80 kB, fonts ≈ 3 MB (all subsets), raw frames 7.6 MB, atlas 1.6 MB, `stone_beige` 2.2 MB, sounds 432 kB.
* **Status:** DONE (plan + docs; no code changed). No processes left, no dependency changes.
* **Files:** created `docs/PHASE7_PLAN.md`; edited `PHASES.md` (status, overview row, Phase 7 decisions: join window details, private rooms, assets; M6 → in), `GAMERULES.md` §2 (join window details, private rooms — planned), `NoBu-Shooter/assets/README.md` (tier plan: WebP / OGG, budgets, raw frames move), `log.md` (T108–T114, status, this entry).

### 2026-10-12 — Claude (Opus 5.5) — T107: Phase 7 scoping (owner decisions recorded, no code)

* **Task:** Owner discussion of how players would download and play the game (native vs web client, dedicated vs listen server, P2P), then Phase 7 scope.
* **Owner decisions:** option A (LAN, browser, laptops/PCs only; no phones); option B (internet) is future scope. Players connect straight to the server; the operator can put the game-agnostic emulator in front by hand. WebSocket transport. Game edition with the best measured settings (Delta, prediction + reconciliation + smoothing, interpolation 100 ms, input redundancy off) and no demo tools in its bundle. Commands `npm run dev` (HMR) / `npm run build` / `npm start`. Bots fill empty slots after a **join window** before the match (all editions). Ping-only HUD. Graphics Quality setting with lower-resolution / lower-bitrate asset tiers. Demo, emulator and game share one code base. Future option B: TLS / `wss://`, M4 hardening, a browser datagram transport (WebRTC DataChannel or WebTransport), and input redundancy back on with it (owner asked to record this).
* **Found while checking:** no Graphics Quality setting exists any more (the bloom it controlled went in T86); Vite's `publicDir` is the whole `assets/` folder, so a build would also copy the ≈ 7.6 MB of raw `sprites/player/**` frames that only feed `pack-assets`; with bots on, one human starts the countdown at once (`room.ts` `checkMatchTransition`).
* **Status:** DONE (docs only). No processes started, no dependency changes.
* **Files:** `PHASES.md` (status line, intro, overview row 7, Phase 7 section rewritten: owner decisions, best-settings table, editions table, items M1–M9, future option B; out-of-scope datagram bullet points to option B), `GAMERULES.md` §2 (planned join window), `NoBu-Shooter/assets/README.md` (planned quality tiers), `README.md` (status line, firewall note), `docs/ASSUMPTIONS.md` #91 (Phase 7 wording), `log.md` (T107, Current Status, this entry).

### 2026-10-12 — Claude (Opus 5.5) — Phase 6 implementation (T35, T99–T106)

* **Task:** Owner approved `docs/PHASE6_PLAN.md` (committed as `b51bf23` on branch `phase6`): implement Phase 6; ask critical decisions mid-run; fix bugs found; add tests. No decision needed asking (the 75 ms fallback of risk 4 wasn't needed).
* **T99 (step 1) — DONE:**
  - `shared/src/sync/types.ts`: `lockstep` model, `rd`, `COMPARE_SYNC_CYCLE`, `sameSyncModel`, `nextSync(s, cycle)`, labels `LOCKSTEP` / `LOCKSTEP+RD`.
  - New `shared/src/sync/lockstep.ts`: `LockstepLog` ring, `LockstepEncoder`, `applyRecord`, `worldFromKeyframe`, `worldHash`, `labMoveCfg`. Exported from `sync/index.ts`; `createEncoder` passes lockstep through.
  - `shared/src/sim/hash.ts` `hashWorld`.
  - `shared/src/protocol/messages.ts`: `MsgLs`, `MsgLsNack`, `LockstepRecord`, `Keyframe`, `validateLs`, `lsNack` / `sync.rd` validation, error code `LOCKSTEP_LAB_ONLY`.
  - `shared/src/config/net.{json,ts}` `lockstep` block.
* **T100 (step 2) — DONE:**
  - `server/src/game/room.ts`: lab rooms log consumed keys per tick; `markKeyframe` on join / leave / perturb / restart / map / movers; hash every 30 ticks; `labKeyframe()`, `labHash()`, `tickNumber`, `lockstepLog`.
  - `server/src/core.ts`: `Connection.lockstep`; `setSync(conn, spec, room)` with `LOCKSTEP_LAB_ONLY`; an rd-only change keeps the encoder; `sendLockstep`; `snapAck` / `input.sa` → `onAck`; `lsNack` → `onNack`.
  - `server/src/metrics.ts` counts lockstep traffic.
  - New `tests/lockstep.test.ts` (14: replay ≡ `Room.tick()` over 2 000 ticks, encoder modes, ring, server keyframe triggers, NACK / key request).
  - `tests/protocol.test.ts` (+3), `tests/sync.test.ts` (+1).
* **T101 (step 3) — DONE:**
  - New `client/src/net/lockstep.ts` `LockstepClient`.
  - `client/src/net/NetClient.ts`: lockstep path (`ls` → replay; synthetic snapshot per shown tick; no prediction; `lsNack`; Rd chip → `sync.rd`; `LOCKSTEP_LAB_ONLY` reverts locally; `ls*` metrics; `isLockstep` / `lockstepWorld`).
  - `tests/netcode.test.ts`: harness exposes the emulator links, +5 lockstep tests (L2 under random then burst loss, outage → resync + RESTART / map keyframes, clean link, Quick Match refusal, live switch + Rd).
  - Also: `client/src/ui/settings.ts` (no stored lockstep), `NetworkLab.tsx` hint.
* **T102 (step 4) — DONE:**
  - `client/src/compare/presets.ts`: preset `lockstep` (A Full, B Lockstep, C Lockstep + Rd; 50 ms + 5 %; all movers).
  - `ui/compare/CompareView.tsx`: Compare cycle; toggles via `setToggles` (X8); `paneSync`.
  - `ComparePane.tsx` greyed P / C / I / G with tooltips; `PaneMetricsBar.tsx` lockstep bar; `CompareDock.tsx` lockstep columns.
  - `game/ArenaScene.ts`: no ghost in lockstep.
  - `presenter/scripts.ts`: C7 expect.
  - Tests: `tests/compare.test.ts` (+1), `tests/presenter.test.ts` (C1–C7).
* **Bug found by the hash check (X1) — FIXED:**
  - The first browser check showed 1 desync per lockstep pane in 30 s. Chrome and Node 26 compute `Math.cos` / `Math.sin` 1 bit apart for 13 631 of 400 000 of the circle drone's angles (scratch check).
  - New `shared/src/sim/dtrig.ts` (`dsin` / `dcos`: fdlibm kernels + Cody-Waite reduction, only + − × ÷ / `Math.round`). `shared/src/sim/movers.ts` uses them and `Math.sqrt` instead of `Math.hypot`. `sim/index.ts` exports them.
  - After the fix: 0 of 400 000 values differ between the engines; 0 desyncs in a 60 s browser run. `tests/movers.test.ts` +2.
* **T103 (step 5) — DONE:**
  - New `scripts/lockstep-clients.ts`; `scripts/smoke.mjs` step 8 (wrapped without top-level await: tsx compiles scripts to CJS).
  - Smoke: Rd off stalled 28.8 % / Rd on 4.6 %, 0 desyncs.
  - `scripts/shots.mjs`: screens `compare-lockstep`, `presenter-compare-7`.
  - Browser (1600×900, 60 s): stalled 12–21 % vs 2–4 %, 440 / 38 / 107 kbps, 60 fps, 0 errors.
* **T104 (step 6) — DONE:**
  - `docs/DEMO_SCRIPT.md`: final talk track with timings at the top, controls, §12 C7, new §14 Lockstep.
  - `docs/PROTOCOL.md`: `hello.sync`, `input.sa`, `sync.rd`, §2.10 `lsNack`, error codes, §3.5 row, §3.6 `ls`.
  - `docs/ASSUMPTIONS.md` #2 updated, new #97–#109.
  - `GAMERULES.md` §14 lockstep note.
  - `README.md`: intro, status, Compare / Presenter / tests / smoke text, controls, tree, architecture bullet; Q13 run order.
  - `NoBu-Shooter/README.md` smoke line; `docs/VISUAL_CHECKLIST.md` (25 screens, rows 16 and 23).
  - `NoBu-Shooter/assets/README.md` unchanged (no asset changes).
* **T105 (step 7) — DONE:** the dress rehearsal (`docs/REHEARSAL.md`).
  - Fresh copy via `git ls-files -co --exclude-standard` in the scratchpad: `npm install` 15 s (npm cache; npm 11 warns about esbuild's install script — harmless), 222 tests 12 s, typecheck 7 s, smoke 47 s. The copy was deleted.
  - Timed headless run-through of all 20 Presenter steps at 1920×1080: ≈ 60 fps everywhere, 0 console errors. Two single long frames (117 / 133 ms) at the C4 / C6 step changes (a pane created / removed).
  - **Finding:** with `--swarm 3` from the start, Q11 (Nightmare + Delta) showed ack ≈ 720 ms / 386 kbps; without network players ≈ 320–350 ms / 60–120 kbps.
  - So the talk starts the network players at Q13 (X7, ASSUMPTIONS #109): `client/src/ui/presenter/PresenterBar.tsx` hint now says `npm run swarm -- --n 3`. Verified: they appear in 0.9 s.
* **T106 (step 8) — DONE:**
  - `npm run shots`, full run: the first attempt was killed by my own 590 s `timeout` at screen 23 of the 1920 pass (the run is now ≈ 12 min). The missing screens were re-run with `--only`: all 25 × 2 captured, 0 console errors.
  - 1280 screens read 56–57 fps in the long run vs 60 fps when re-run (machine load, not the code).
  - Reviewed 16 / 23 against the checklist: OK. Dashboard OVERFLOW-Y as before.
  - `PHASES.md`: Phase 6 done + result, overview, status, DoD G1 / G2 / G4 / fresh clone ticked, new owner box for the presentation-laptop rehearsal.
  - `docs/PHASE6_PLAN.md`: implemented, exit checklist ticked, deviations X1–X8.
  - Final: 222/222 tests, typecheck clean, smoke 8/8 PASSED; ports free; no processes left; no new dependency (`.gitignore` unchanged, nothing to add).
* **Files:**
  - **Created:** `shared/src/sync/lockstep.ts`, `shared/src/sim/dtrig.ts`, `client/src/net/lockstep.ts`, `scripts/lockstep-clients.ts`, `tests/lockstep.test.ts`, `docs/REHEARSAL.md`.
  - **Edited (code):** `shared/src/sync/{types,index}.ts`, `shared/src/sim/{hash,movers,index}.ts`, `shared/src/protocol/messages.ts`, `shared/src/config/net.{json,ts}`, `server/src/{core,metrics}.ts`, `server/src/game/room.ts`, `client/src/net/NetClient.ts`, `client/src/compare/presets.ts`, `client/src/ui/compare/{CompareView,ComparePane,PaneMetricsBar,CompareDock}.tsx`, `client/src/ui/{NetworkLab.tsx,settings.ts}`, `client/src/ui/presenter/PresenterBar.tsx`, `client/src/presenter/scripts.ts`, `client/src/game/ArenaScene.ts`, `scripts/{smoke,shots}.mjs`.
  - **Edited (tests):** `tests/{netcode,protocol,sync,compare,presenter,movers}.test.ts`.
  - **Edited (docs):** `README.md`, `NoBu-Shooter/README.md`, `PHASES.md`, `GAMERULES.md`, `docs/{DEMO_SCRIPT,PROTOCOL,ASSUMPTIONS,VISUAL_CHECKLIST,PHASE6_PLAN}.md`, `log.md`.

### 2026-10-12 — Claude (Opus 5.5) — T98: Phase 6 implementation plan + preparation

* **Task:** Owner: "prepare and plan for the implementation of phase 6" (ask critical decisions, fix bugs found, add tests).
* **Owner answers (asked):** (1) lockstep recovery follows the pane's **Rd chip** — off: the client NACKs a gap and the server resends (world freezes ≈ one round trip per loss, head-of-line blocking), on: every message repeats all unacknowledged ticks; (2) Compare preset **Full / Lockstep / Lockstep + Rd**; (3) **no prediction** of the own player in a lockstep pane; (4) the **presentation laptop is another machine**.
* **Decisions taken without asking (in the plan):** server-relayed lockstep (the server never waits; it relays the inputs it *consumed* per tick, so a replay is bit-identical); keyframes ride inside the tick stream (join / leave / nudge / restart / map / movers); reuse `snapAck` / `input.sa` for the lockstep ack + new `lsNack`; a 256-tick ring, resync by keyframe beyond it; playout buffer 2 ticks + catch-up ≤ 3 ticks/frame; `hashWorld` every 30 ticks → desync counter + automatic resync; lab only (`LOCKSTEP_LAB_ONLY` elsewhere), Compare's SYNC cycle only; dress rehearsal here from a fresh copy of the working tree (the work is uncommitted) + `docs/REHEARSAL.md` for the presentation laptop.
* **Status:** DONE (plan only; no code changed). Baseline: Node v26.4.0, typecheck clean, 196/196 tests, smoke PASSED (7 steps); ports free before and after, no processes left. No dependency changes.
* **Files:** created `docs/PHASE6_PLAN.md`; edited `PHASES.md` (status line, Phase 6 plan pointer + owner answers, L1 / L3 / L5 rewritten), `log.md` (T98–T106, status, this entry).

### 2026-10-12 — Claude (Opus 5.5) — Phase 5 implementation (T34, T88–T94, T96–T97)

* **Task:** Owner approved `docs/PHASE5_PLAN.md` (committed as `a82f534` on branch `phase5`): implement Phase 5; ask critical decisions mid-run; fix bugs found; add tests; make bullets more purple while Piercing is on (T96); update the README quickstart + a list of commands (T97).
* **T88 (step 1) — DONE:** emulator rebuilt around routes. Created `emulator/src/prng.ts` (local mulberry32), `emulator/src/presets.ts` (PRESETS, `sanitizePatch`, `completeConfig`), `emulator/src/routes/index.ts` (`RouteManager`: routes with own defaults/preset, targets all / route id / session id / label, 64 sessions per route, UDP idle 30 s, `session.label` by peer), `emulator/src/routes/ws.ts` (WS route, binary-safe), `emulator/src/routes/udp.ts` (UDP route, one session + upstream socket per source address), `emulator/src/emulator.ts` (`createEmulator`, `parseRouteArg`), `emulator/dashboard/` (placeholders until step 5). Rewritten: `emulator/src/session.ts` (endpoint-based, shared by WS and UDP), `emulator/src/control.ts` (HTTP server on 127.0.0.1 serving the dashboard allowlist + WS control API with Origin allowlist, `route.add` / `route.remove` / `session.label`, `error` / `ack` events, per-route state), `emulator/src/main.ts` (CLI `--route`, alias `--listen/--target`, `--control-host`, `--allow-origin`, `--udp-idle-ms`, `--max-sessions`; no routes = dashboard only). `emulator/src/pipeline.ts`: `Packet.data: Buffer | string` + `binary`, `previewOf` (ASCII or hex), local PRNG. `emulator/package.json`: `@nobu/shared` removed. Client: `client/src/net/EmulatorClient.ts` (`GAME_ROUTE` `ws:9000` default target, `routeView` = its route's defaults/preset, `SWARM_ROUTE`, `DASHBOARD_URL`), `CompareView.tsx` + `ui/presenter/stages.ts` (no explicit `'all'`). `shared/src/config/net.{json,ts}`: `ports.serverUdp` 8081, `ports.emulatorUdp` 9100, `udp` block. `scripts/lib/procs.mjs`: `udpPortInUse`, `assertUdpPortsFree`, `waitForUdpPort`. `scripts/demo.mjs` rewritten (both routes, UDP port checks, `--swarm N`). Tests: new `tests/emulator-routes.test.ts` (11), `tests/emulator.test.ts` / `tests/netcode.test.ts` adapted to the opaque payload type. 174/174 tests, typecheck clean.
  - **Bug found and fixed:** a WS route on a busy port crashed the process (ws re-emits the http `EADDRINUSE` on the `WebSocketServer` before any listener) instead of returning an error → listener attached before `listen`.
  - **Deviation:** `Packet.data` is `Buffer | string` (plan: `Buffer`) — adapters send bytes, the in-process harness and old tests keep text; the pipeline treats both as opaque.
* **T89 (step 2) — DONE:** created `shared/src/net/fragment.ts` (`Fragmenter`, `Reassembler`: `~<id>.<i>/<n>|` headers, ≤ 1200 B, 250 ms / 8 pending, duplicates and late fragments of completed messages ignored, counters) + `./net/*` export in `shared/package.json`; `server/src/udp.ts` (`startUdpServer`: one Connection per address, fragments both ways, address forgotten on close); `server/src/main.ts` (UDP adapter on 8081, `--host` / `NOBU_HOST` for both adapters, default all interfaces); `scripts/lib/udp-transport.ts` (Node `TransportFactory` over UDP with fragment stats, binds loopback for a loopback target). Tests: new `tests/fragment.test.ts` (7, incl. loss amplification ≈ 81 % for 2 fragments at 10 %), `tests/server-udp.test.ts` (4).
* **T90 (step 3) — DONE:** the UDP route, idle timeout, session cap, `session.label`, runtime routes and control safety were built in step 1; this step added `tests/emulator-udp.test.ts` (8: byte-identical in-order delivery, received set = pipeline's delivered set at seeded 30 % loss, two peers → two sessions with per-session config and replies, idle close + label kept, session cap refusal, client before target, NetClient → emulator UDP → server UDP with 0 corrections on a clean link, 10 % loss: fragmented full snapshots lost ≈ 19 % vs deltas mostly single datagrams). 193/193 tests (3 repeated runs of the socket tests stable), typecheck clean.
* **T91 (step 4) — DONE:** `shared/src/sim/botBrain.ts` (the bot code moved verbatim from `server/src/bots.ts`, reading a minimal `BotView` {x, y, alive, protectionTicksLeft}; optional seed), `server/src/bots.ts` now re-exports it (server bot tests unchanged); `scripts/swarm.ts` (N NetClients over UDP, own socket each, bot brain fed with the player's own view, one 60 Hz loop, `session.label` UDP-n via control, status table every 2 s, `--sync/--hz/--room/--direct/--emulator/--server/--control/--duration/--quiet/--verbose`, self-check after `--duration`, exits with the launcher); npm scripts `emulator`, `swarm`, `udp-echo`, `udp-send` (NoBu-Shooter + root proxies; `demo` proxy now passes `--` args). `server/src/main.ts` log shows `0.0.0.0:<port> (all interfaces; this machine: 127.0.0.1:<port>)`. Live check (scratchpad launcher: server + emulator + `swarm --n 3 --duration 10`): PASS, 299–300 world messages each, all reassembled, 0 lost, sessions named UDP-1…3 on `udp:9100`.
  - **Finding (not a bug):** full snapshots in a 4-way fight are ≈ 3 kB (2.7 fragments on average), larger than the 2.1 kB measured in Phase 2.5 (more projectiles and events). `--verbose` showed the few clean-link corrections (3–7 px) happen at the moment the player dies (death is not predicted) — the same for browser players.
* **T96 — DONE:** `client/src/game/ArenaScene.ts`: piercing rounds were tinted lavender with a multiply tint, which on the yellow `fx/bullet.png` came out olive. Now the core is tint-filled light purple (`C_PIERCE_CORE` 0xd8a8ff), with a purple halo and a 3 px purple trail (`C_PIERCE_SHOT` 0xa23cff); the procedural fallback is purple too.
* **T92 (step 5) — DONE:** `emulator/dashboard/{index.html,style.css,app.js}` (self-contained: routes table + add form with "this machine only", sessions table, target all / route / session + direction, presets, a control per link field, 60 s canvas charts (kbps, loss, queue), packet log with filters / pause / clear; reconnects; untrusted labels and payloads rendered with textContent only). `client/src/ui/Landing.tsx` (EMULATOR DASHBOARD button enabled → new tab), `client/src/ui/NetworkLab.tsx` (DASHBOARD ↗ link, notes on network players and the Lab's route scope), `global.css`. Browser check (scratchpad, headless Chrome via the repo's playwright-core; emulator alone + `udp-echo`): route added from the dashboard, duplicate refused with an error, 20 % up-link loss → `udp-send` 22.7 % lost, 34 "lost" rows in the packet log, route removed, 0 console errors, no horizontal scroll at 420 px.
  - **Bugs found by that check and fixed:** (1) a direction-only change on a route was stored in its single default config, so sessions that joined later got it in both directions (42 % round-trip loss instead of ≈ 20 %) → routes and the global defaults keep separate up/down configs (`defaults` + new `defaultsDown` in `state`; `Session` takes `configDown`), new test in `tests/emulator-routes.test.ts`; (2) 153 px horizontal overflow at 420 px (routes table not in a scroll box); (3) a `favicon.ico` 404 in the console (inline empty icon).
* **T93 (step 6) — DONE:** Presenter Q13 "Network players over UDP" (`client/src/presenter/{types,scripts,controller}.ts`: `swarmNetwork` on every Quick step, Baseline except Q13 = 120 ± 40 ms, 10 % loss; `PresenterStage.applySwarmNetwork`), `client/src/ui/presenter/stages.ts` (→ `udp:9100`), `PresenterBar.tsx` (OPEN DASHBOARD ↗ + count of `udp:9100` sessions, or an amber "start network players" hint), CSS; `tests/presenter.test.ts` (13 steps, swarm network on every step, Q13 test; 18 tests). `emulator/tools/udp-echo.mjs`, `emulator/tools/udp-send.mjs` (Node built-ins only), `emulator/README.md` (U6: start, three-terminal no-game example, other tools, routes/sessions, pipeline, CLI, control API, safety, Wireshark note, code map).
* **T94 (step 7) — DONE:** `scripts/smoke.mjs` rewritten (7 steps; server with `NOBU_HOST=127.0.0.1` and emulator routes bound to 127.0.0.1; UDP port checks; step 7 = `swarm --n 1 --duration 10` under Nightmare: PASS, 220 world messages, fragments reassembled, 6 lost to fragment loss, ack delay ≈ 500 ms). `scripts/shots.mjs`: demo with `--swarm 2`, UDP port checks, screens 20 `presenter-quick-13-swarm`, 22 `dashboard`, 23 `dashboard-swarm-nightmare`, an `after` hook, and an emulator reset (all routes → Baseline) before every screen. Final checks: typecheck clean, **196/196 tests**, smoke PASSED, `npm run shots` full run 46/46 with 0 console errors (then a partial re-run after the reset change, 0 errors), reviewed against `docs/VISUAL_CHECKLIST.md`. Final live check (scratchpad: demo `--swarm 2` + headless Chrome): bind addresses as in D15 (`netstat`: 9001 on 127.0.0.1 only; 8080 / 9000 on 0.0.0.0 + [::]; UDP 8081 / 9100 on 0.0.0.0), Lab key `5` → `ws:9000`=Nightmare while `udp:9100` stays Baseline, purple piercing rounds seen in a screenshot, 0 console errors.
  - **Bugs found and fixed in this step:** (1) packet-log `delayMs` of queue drops unrounded (`403.086669921875 ms`; `emulator/src/pipeline.ts` since Phase 1) → rounded + test in `tests/emulator.test.ts`; (2) dashboard routes table scrolled sideways at 1280 px, hiding REMOVE → panels stack below 1400 px, long preset names clipped with a tooltip; (3) `state.sessions[].up/down` merged config and stats, and the stats' `lossPct` (measured) overwrote the configured `lossPct` (since Phase 1; it mattered once the dashboard showed per-session settings) → `up`/`down` = config, `stats` = counters (`emulator/src/session.ts`, test in `tests/emulator-routes.test.ts`); (4) shots screens inherited the previous screen's emulator preset (e.g. "UI 130 %" under Nightmare) → reset before each screen.
  - **Expected flags, not findings:** `LAB SCROLLS` on `quick-lab-all-open` (every section open) and on `quick-ui-130` at 1280 × 720 (the checklist requires no scroll at 1920 × 1080 only); `OVERFLOW-Y` on the dashboard (a scrolling page).
  - **Docs:** `README.md` (status, intro, launch section with both routes / dashboard / `--swarm`, Presenter 13 steps, new quickstart step 4 "Try the emulator on its own", tests/smoke text, new **Command Reference** (T97), controls rows, repository tree, architecture, troubleshooting), `NoBu-Shooter/README.md` (commands), `emulator/README.md` (new), `docs/PROTOCOL.md` (§1 two transports + §1.1 fragments; §5 rewritten: routes/sessions, control API with route commands, `ack`/`error`, per-direction defaults, Origin allowlist, bind addresses, §5.3 server UDP adapter), `docs/DEMO_SCRIPT.md` (controls rows, Q13 row, new §13 standalone emulator + network players with measurements), `docs/ASSUMPTIONS.md` (#3, #5, #8 updated; #85–#96), `GAMERULES.md` (§2 Q13, §12 network players, §17 purple piercing rounds), `docs/VISUAL_CHECKLIST.md` (23 screens, rows 01/18–23, reset note), `NoBu-Shooter/assets/README.md` (bullet tint fill), `PHASES.md` (Phase 5 done + result, overview, status line, rule 4, DoD G3 ticked, G4 note), `docs/PHASE5_PLAN.md` (implemented, exit checklist ticked, deviations X1–X8).
* **T97 — DONE:** README quickstart updated (launch with `--swarm`, step 4 "Try the emulator on its own", troubleshooting) and a **Command Reference** (run the game, network players, the emulator on its own, check and build) — see T94 docs.
* **Dependencies:** none added, nothing installed globally; `npm install` only re-synced `package-lock.json` (one line: `@nobu/shared` removed from the emulator workspace). `.gitignore` reviewed: no new generated paths (`artifacts/` already ignored).

### 2026-10-12 — Claude (Opus 5.5) — T95: Phase 5 plan revision (bind addresses) + multiplayer candidate phase + preparation

* **Task:** Owner: "I plan to turn this into a proper multiplayer game; doesn't the security rule restrict that?" Answer: the control-port lockdown does not (players never need the emulator's control port, and it matters more with remote players), but two other parts of the T87 plan would have: the server UDP adapter bound to 127.0.0.1 and emulator data routes defaulting to 127.0.0.1. Owner: "yes please, update the plan and prepare for phase 5 (wait for my approval)".
* **Plan changes (`docs/PHASE5_PLAN.md`):** owner-revision line in the status; G6 notes the data ports stay reachable; new "Not Phase 5 gaps" paragraph (hard-coded `ws://127.0.0.1` in `App.tsx` / `CompareView.tsx`, Vite local-only, Lab + dev commands open to any client); D1 control port "this machine only"; **D7** now locks down only the control port (stays local even after multiplayer); **D9** server UDP on the same interfaces as WS; new **D15** bind addresses (`--host` / `NOBU_HOST` for the server, per-route `listen.host` defaulting to all interfaces, `--route ws:127.0.0.1:9000=…` for local-only, tests bind 127.0.0.1); §2 rows, tests 3 and 6, exit checklist (bind check with `netstat`), two new risks (Windows Firewall prompt, UDP reflection until Phase 7 M4), §7 multiplayer pointer; §0 baseline.
* **PHASES.md:** intro + overview row for the **candidate Phase 7 — Multiplayer readiness** (not scheduled), new section with M1–M6 (server address in the client, serving the client, operator-only controls, TLS + UDP return-routability challenge + per-IP limits, browser datagrams, many players); Phase 5 plan pointer D1–D15 + revision note; U1 bind note.
* **Other docs:** `docs/PROTOCOL.md` §5 planned note (only the control port is local), `README.md` planned note (control port local, Phase 7 candidate).
* **Preparation (baseline):** Node v26.4.0; `npm run typecheck` clean; `npm test` 163/163; `npm run smoke` PASSED (delta 46 % of full bytes, ack delay 311 vs 711 ms); TCP 5173/8080/9000/9001 and UDP 8081/9100 free before and after; no node processes left. No dependency changes, no installs. Nothing committed; Phase 5 code not started (waiting for owner approval).
* **Status:** DONE.

### 2026-10-12 — Claude (Opus 5.5) — T87: Phase 5 implementation plan

* **Task:** Owner: "plan the implementation of phase 5; ask for any decisions along the way".
* **Owner answers (asked):** (1) messages over 1200 B → **app-level fragments** (full snapshots are 1.3–2.1 kB, so U2's "trim events" cannot work); (2) the in-game Lab / Presenter impair **only the browser's route**; (3) dashboard = **self-contained page**, plus an entry point that opens the dashboard with **no data routes**, from which the emulator can be set to listen/forward between **any two ports** (made it fully game-agnostic: new U8 runtime routes, byte payloads, no `@nobu/shared` import); (4) network players: **demo flag + Presenter step**, playing like the server bots.
* **Decisions taken without asking (in the plan):** one emulator process for both routes; route ids `ws:9000` / `udp:9100` used as control targets with per-route defaults; control/dashboard bound to 127.0.0.1 with an `Origin` allowlist and a static-file allowlist (it can now open listeners, so it must not be an open proxy); 64 sessions per route and 30 s UDP idle timeout; swarm names `UDP-n` (no protocol change) and `session.label` via control; bot decision code extracted to `shared/src/sim/botBrain.ts`; Node UDP transport kept out of the browser bundle (`scripts/lib/udp-transport.ts`); no new dependencies.
* **Status:** DONE (plan only; no code changed). Nothing run, no processes or ports used.
* **Files:** created `docs/PHASE5_PLAN.md`; edited `PHASES.md` (status line, rule 4 ports, Phase 5 plan pointer + owner answers, U2–U5 / U7 rewritten, new U8, demo checkpoint), `README.md` (planned notes: Presenter 13th step, emulator routes / dashboard / swarm), `docs/PROTOCOL.md` §5 (planned-changes note), `docs/DEMO_SCRIPT.md` §12 (13th step planned), `GAMERULES.md` (§2 Presenter note, §12 network players planned), `log.md` (T87–T94, status, this entry).

### 2026-10-11 — Claude (Opus 5.5) — T86: camera glow removed

* **Task:** Owner: "remove the glow entirely — it only makes things look worse".
* **Status:** DONE — typecheck clean, **163/163 tests**, `npm run shots` 40/40 with 0 console errors; ports free, nothing running.
* **Code:** `client/src/game/ArenaScene.ts` (bloom, `applyQuality`, settings listener, map-change re-check and the fps auto-off removed; unused imports dropped), `client/src/ui/settings.ts` (`graphicsQuality` removed — its only effect was the glow; old saved values are ignored), `client/src/ui/SettingsPanel.tsx` (Graphics Quality row removed), `shared/src/config/net.{json,ts}` (`fpsDegrade` removed — only the glow used it), `scripts/shots.mjs` (BLOOM OFF flag removed; `[arena]` notes still recorded), `client/src/ui/PacketFlowStrip.tsx` (comment).
* **Docs:** `GAMERULES.md` §17 (no camera glow), `README.md` (Projector row), `docs/DEMO_SCRIPT.md` (controls), `docs/VISUAL_CHECKLIST.md` (rows 03, 06, notes), `docs/ASSUMPTIONS.md` (#63/#83 marked, #84), `docs/PHASE4_PLAN.md` (D6 superseded), `PHASES.md` (P2 row, owner-changes note), `NoBu-Shooter/assets/README.md`, `log.md`.

### 2026-10-11 — Claude (Opus 5.5) — T83–T85: power-up cap / refill, 2-minute matches, arena haze

* **Task:** Owner: max power-ups = number of players; power-up spawn every 7 s; a normal match lasts 2 min everywhere. Bug: a fuzzy haze sometimes covers the whole arena (owner suspects the graphics / fps auto-reduction).
* **Owner answers (asked):** haze fix = "glow on Neon only"; the agent may stop the owner's running `npm run demo` (it held ports 5173/8080/9000/9001 and ran the old server rules) — stopped by its process tree (PIDs 25628 → 25928 server, 11300 emulator, 21080 vite); the owner restarts it to get the new rules.
* **Status:** DONE — typecheck clean, **163/163 tests**, `npm run smoke` PASSED (4 players → 4 power-ups), `npm run shots` 40/40 with 0 console errors (timer starts at 2:00, 4 power-ups, no bloom auto-off), haze screenshots compared (Warehouse at quality high now identical to low; Neon keeps its glow). Ports free afterwards, nothing left running.
* **T83:** `shared/src/config/game.json` + mirror `game.ts` (`match.durationMs` 120000, `powerups.perPlayers` 1, `powerups.respawnMs` 7000); `shared/src/sim/powerups.ts` (cap comment; spot fallback now avoids overlapping another power-up, ≥ 4 × radius); tests `combat.test.ts` (cap = participants), `rules.test.ts` (2 players → 2, refill 7 s one at a time, 4 players → 4), new `maps.test.ts` test (8 valid non-overlapping spots on every map, 25 seeds).
* **T84 (haze):** cause = the Phase 4 camera bloom (no brightness threshold: a blurred copy of the whole frame over textured floors), intermittent because every settings save cleared the fps auto-off. `client/src/game/ArenaScene.ts`: glow only on untextured maps (`mapDef(map).floor === null`, i.e. Neon), re-decided when the map changes; only a change of Graphics Quality resets the auto-off.
* **T85 (docs):** `GAMERULES.md` (§2 120 s, Presenter text, demo shortcut default, §6b one per participant / 7 s, §15 constants, §16 2-minute match, §17 glow Neon only), `README.md` (power-ups row, Graphics row, maps sentence), `docs/DEMO_SCRIPT.md` (§10 power-ups, controls row), `docs/PROTOCOL.md` (pickups cap), `docs/ASSUMPTIONS.md` (#43 note, #82, #83), `PHASES.md` (owner changes note), client texts (`ControlsOverlay.tsx` power-ups heading, `App.tsx` notice, `presenter/types.ts` comment), `server/src/game/room.ts` comment, `log.md`.

### 2026-10-11 — Claude (Opus 5.5) — Owner revision after Phase 4 (T76–T82)

* **Task:** Owner: (game) SYNC MODEL should read as "full or delta, state 10 vs 30"; a give-power-up option in dev mode. (Presenter) infinite match timer; a restart/reset on both presenters; map switching that resets the game. (Question) the truth ring sits in front of the Compare drones — shouldn't it trail them?
* **Owner answer (asked):** SYNC MODEL — "Regroup UI": keep one active choice (a connection receives exactly one stream), shown as two labelled groups.
* **Decisions taken without asking:** endless / restart / map use the existing developer channel (`dev` message, honoured only under `npm run demo` like Invincible) — they change the room for everyone in it; the presenter already needs `npm run demo` for Invincible. Map switching keeps the current presenter step (the game restarts, the talk goes on); RESTART goes back to step 1.
* **Status:** DONE — typecheck clean, **162/162 tests**, `npm run smoke` PASSED, `npm run shots` 40/40 with 0 console errors (final run before the last pane fix; Compare + Presenter re-shot after it, 22/22 clean), scratchpad browser check of every change PASSED repeatedly (sync groups, give power-up, ∞ clock, RESTART → step 1 on the same map with a clean countdown, map switching keeps the step, clock back after END, Compare map + RESTART), the Phase 4 presenter walk-through still passes. Ports free, no processes left. No dependency changes.
* **T76 (SYNC MODEL groups):** `client/src/ui/NetworkLab.tsx` (`SYNC_GROUPS`: SNAPSHOTS · interpolated — FULL, DELTA; STATE SYNC · extrapolated — 10 Hz, 30 Hz; one chip lit; hint line gets `sync-hint`), `client/src/ui/compare/ComparePane.tsx` (SYNC chip tooltip explains the one-of choice), `client/src/styles/global.css` (`.sync-groups`).
* **T77 (give power-up):** `shared/src/protocol/messages.ts` (`MsgDev` fields all optional: `invincible`, `give`, `endless`, `restart`, `map`; validator rejects empty / wrong types; `MatchSnap.endless?`), `server/src/game/room.ts` (`devMode()` read per call so tests can set NOBU_DEV; `devCommand(playerId | null, cmd)`; `givePowerup` = `applyPowerup` + `PICKUP` event, alive + RUNNING + power-up rooms only), `server/src/core.ts` (`dev` → `devCommand`, spectators allowed for room commands), `client/src/net/NetClient.ts` (`devGive`, `setDevEndless` (re-sent on welcome), `devRestart(map?)`), `client/src/ui/NetworkLab.tsx` (Developer → GIVE POWER-UP chips with the pickup icons), CSS.
* **T78 (endless):** `room.ts` (`endless` flag stops the RUNNING countdown; snapshot `match.endless`; cleared when the last human leaves), `client/src/ui/Hud.tsx` (∞ in a mono span, no time-critical blink, tooltip), presenter `types.ts` / `scripts.ts` (`endless`: Quick true, Compare false), `controller.ts` (on at start, off at stop), `ui/presenter/stages.ts`.
* **T79 / T80 (RESTART, map switching):** `room.ts` (`restart(map?)`: timed rooms → `startCountdown(map ?? current)` without moving the rotation; lab → `setMap` + every player `respawnPlayer` (new life)), `controller.ts` (`restart()` → `restartGame()` + step 1; `switchMap(map)` → `restartGame(map)`, step re-applied, timer restarted, no one-off actions), `ui/presenter/PresenterBar.tsx` (MAP · restarts the game: 2 × 2 map chips with the current map lit; ⟲ RESTART next to END), `ui/App.tsx` (Compare `restartRequest` / `onMapChange`, new notice text without `npm run demo`), `ui/compare/CompareView.tsx` (restart → reference `devRestart(map)`, latency averages + lag/bandwidth charts cleared; reports the lab map), `game/assets.ts` (`loadMapArt`: a map's floor + props at runtime) + `game/MapView.ts` (loads them the first time a map without art is shown — Compare panes preloaded none).
  - **Bug found by the browser check and fixed:** after a Compare map switch the panes drew Warehouse's geometry with Neon's glass fallback (no floor/props) → runtime map-art loading above.
  - **Bug found (pre-existing since Phase 1) and fixed:** a Quick Match RESTART showed a 1180 px correction line. `startCountdown` marked players dead, the tick's respawn step revived them at once with `life = 1` at another spawn, and `startMatch` moved them again — a player who had not died kept `life = 1`, so the client treated the teleport as a misprediction (hidden behind the results overlay in normal play). Countdown now keeps players alive at their spawn with `life + 1` (movement is ignored outside RUNNING), and GO starts them there. New harness test (`tests/netcode.test.ts`: restart under 50 ms + 10 % loss, main and lab → no correction ≥ 64 px) and rules test (alive at spawn, new life, no move at GO). GAMERULES §2 updated.
* **T81 (truth ring question):** answered (intended: the drawn drone trails its true-position ring by the mover lag; State sync can overshoot ahead at turns); `CompareView.tsx` TRUTH tooltip says so; ASSUMPTIONS #79.
* **T82 (tests, verification, docs):** tests — `tests/protocol.test.ts` (dev validator), `tests/rules.test.ts` (+9: refused without NOBU_DEV, give, endless + snapshot, endless cleared, restart same map, map + rotation, lab restart/map from a spectator, lab spawn clear on every map, countdown behaviour), `tests/presenter.test.ts` (+4: endless on/off, RESTART for both scripts, map switch keeps the step), `tests/netcode.test.ts` (+2). Fixed on the way: `client/src/game/GameContainer.tsx` Compare panes get `scale.min` (a removed pane resized to 0 × 0 for one frame before Phaser's deferred destroy → intermittent `Framebuffer status: Incomplete Attachment`; instrumented 5/8 runs → 0/8); `client/src/ui/PacketFlowStrip.tsx` halo without `shadowBlur` (Nightmare shots tripped the bloom auto-off twice); `global.css` ≤ 800 px hides the sync hint and keeps metric values on one line (Lab scrolled at 1280 × 720 under Nightmare).
  - **Docs:** `docs/PROTOCOL.md` (§2.6 dev fields table, `match.endless`), `GAMERULES.md` (§2 countdown + Presenter clock/restart/map, §19 give power-up + room commands), `README.md` (Presenter paragraph, Developer and Sync model and Presenter rows), `docs/DEMO_SCRIPT.md` (controls, §10 give power-up, §12 RESTART / map / ∞), `docs/VISUAL_CHECKLIST.md` (rows 03, 08, 18, 20), `docs/ASSUMPTIONS.md` (#71 corrected, #73–#81), `PHASES.md` (owner revision note under Phase 4), `NoBu-Shooter/assets/README.md` (runtime map art for Compare, pickup icons reused), `log.md`.

### 2026-10-11 — Claude (Opus 5.5) — Phase 4 implementation (T33, T69–T75)

* **Task:** Owner: "tell me if you need anything before implementing; ask decisions mid-run; then implement Phase 4" — taken as approval of `docs/PHASE4_PLAN.md` (D1–D11). Nothing was needed up front (the open decisions were answered in T68; the only install, `playwright-core`, is a local devDependency the owner already approved).
* **Status:** DONE — typecheck clean, **147/147 tests**, `npm run smoke` PASSED (6 steps; delta 32 % of full bytes, ack delay 364 vs 646 ms), `npm run shots` 40/40 screens with 0 console errors (final full run after all fixes), both Presenter scripts pressed through with `N` only (scratchpad check: every step's toggles / sync / emulator preset correct, Invincible on, `B` identical, `H` hides, END → landing, 0 console errors). Ports 5173/8080/9000/9001 free, no node/Chrome processes left. No global installs; `.gitignore` gained `artifacts/`.
* **T69 (step 1, presenter core) — DONE:** created `client/src/presenter/{types,scripts,controller}.ts` (Quick 12 steps Q1–Q12 with Invincible, Compare 6 steps C1–C6 = the Compare presets; controller applies a complete state on every step change, nudge only on entering, `reapply()` for a late emulator connection, Invincible off on `stop()`); `client/src/net/NetClient.ts` (`setToggles(patch)`, events `toggles` / `sync` / `dev`, `devInvincibleOn`); `client/src/ui/NetworkLab.tsx` (switches mirror the NetClient events instead of private copies); `client/src/ui/App.tsx` (ghost setting via `setToggles`); new `tests/presenter.test.ts` (13: plan tests 1–4). typecheck clean, **143/143 tests**.
* **T70 (step 2, Presenter UI) — DONE:** created `client/src/ui/presenter/PresenterBar.tsx` (counter, title, caption, EXPECT line, step timer, ◄ B / N ► / END; buttons don't take focus so `Space` can't re-press them) and `client/src/ui/presenter/stages.ts` (Quick: NetClient + emulator `applyPreset(name, 'all', config)`; Compare: preset request); `client/src/ui/App.tsx` (`presenterId`, controller lifecycle with `stop()` on END / Leave / Exit, re-apply when the emulator control socket connects, `N`/`B`/`H` by `KeyboardEvent.code`, bar in the layout flow); `client/src/ui/compare/CompareView.tsx` (`presetRequest` + `footer` props; dock caption hidden while presenting — it is in the bar); `client/src/ui/compare/CompareDock.tsx` (empty caption → no row); `client/src/ui/Landing.tsx` (PRESENTER — QUICK MATCH / COMPARE, disabled EMULATOR DASHBOARD · PHASE 5, hint with P/C/I/G, Y, N/B/H); `client/src/styles/global.css` (landing row, presenter bar). Browser (scratchpad script, repo `playwright-core`, local Chrome, demo started/stopped by the script): Quick Q1→Q12 with `N` — Lab switches, sync chips and emulator preset follow every step, Invincible on throughout, `B` to Q11 identical, `H` hides, END → landing; Compare C1→C6 select the six presets; 0 console errors.
  - **Plan deviation Z1:** the bar sits in the layout flow (between arena and packet strip; under the Compare grid) instead of overlaying, so it never covers the HUD buttons, the weapon panel or the effect it describes; `H` gives the space back.
  - **Install:** `playwright-core` **1.48.2** (exact pin) added as a devDependency of `NoBu-Shooter` now (owner-approved D10, needed for the step checks), `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`, no browser download. `.gitignore`: added `artifacts/` (NoBu-Shooter); `node_modules/` already ignored.
* **T71 (step 3, arena polish) — DONE:** `client/src/game/PlayerView.ts` (baked `aim-chevron`, `PlayerLook.chevron`), `client/src/game/ArenaScene.ts` (death ✕ in the victim's colour fading over `respawnDelayMs`, pooled; respawn pulse rings for every player via life/alive tracking; chevrons for remote players in Quick Match; camera bloom `postFX.addBloom(0xffffff, 2, 2, 1, 0.7, 1)` in Quick Match at quality high on WebGL, follows Settings live; auto-off after `fpsDegrade.forSeconds` below `minFps` with one `console.info`), `client/src/ui/settings.ts` (`onSettingsChange` listeners).
  - **Measured** (headless Chrome uses the laptop's Intel UHD via ANGLE D3D11, 1920×1080): no bloom 60 fps; bloom with 4 blur steps 28–32 fps (auto-off fired), 2 steps 38, **1 step 57–60** → 1 step kept. Compare 4 panes + REF 60 fps (no bloom there).
  - **Bug found and fixed (pre-existing, Phase 2.5):** leaving a match after sounds had played threw `TypeError: Cannot read properties of null (reading 'disconnect')` in Phaser's `WebAudioSound.destroy` — `BaseSound.destroy()` emits STOP before marking the sound removed, and our STOP handler destroyed it re-entrantly. `client/src/game/audio.ts` now destroys in a microtask.
* **T72 (step 4, Lab + UI scale) — DONE:** new `client/src/ui/LabSection.tsx` (title button with a CSS caret, open state remembered in `labSections`, summary of the value while closed; `collapsible={false}` = plain section); `client/src/ui/EmulatorControls.tsx` (`collapsible` prop: Quick Match Lab yes, Compare drawer no); `client/src/ui/NetworkLab.tsx` (sections presets, impairment, sync, toggles, dev, metrics, sparklines, notes; NUDGE button always visible); `client/src/ui/settings.ts` (`uiScale` 100/115/130, `labSections` with D8 defaults, validated on load, `applyUiScale` → `--ui-scale`); `client/src/ui/SettingsPanel.tsx` (UI Scale row); `client/src/ui/App.tsx` (applies the scale at start and on change); `client/src/styles/global.css` (`--ui-scale` drives the root font size and the Lab width; section toggle styles; ≤ 920 px tighter rows; ≤ 800 px 3-column metric tiles).
  - **Measured** (scratchpad check, default sections): Lab `scrollHeight` = `clientHeight` (no scroll) at 1920×1080 (100/115/130 %), 1600×900 and 1280×720 (100 %); only 1280×720 at 130 % scrolls (75 px) — acceptable for the projector scale on the smallest screen.
* **T73 (step 5, emulator + strip) — DONE:** `emulator/src/pipeline.ts` (`getStats().queueMs` = max(0, freeAt − now); `PacketEvent.reordered: true` on deliveries held back by the reorder stage — absent otherwise); `client/src/net/EmulatorClient.ts` (`reordered?`); `client/src/ui/PacketFlowStrip.tsx` rewritten: every packet is replayed on its real timeline (enters the box at the event's `t`, crosses it for `delayMs`) a smoothed, adaptive lag behind real time (2 s worst arrival + travel, 250–2200 ms) — so held-back packets are visibly overtaken and a full queue shows as dots crowding the box; white ring = reordered; duplicate = split flash at the box entry (the two delivered copies are ordinary dots, no extra fake dots any more); box top line = title + impairment chips, bottom line = `QUEUE ↓ms` + bar to the queue limit (red above 75 %, limit marker); side column with a 7-item legend and the INSPECT button (fixes the SERVER/INSPECT overlap at 130 %); `client/src/styles/global.css` (strip flex row, legend). `tests/emulator.test.ts` +4 (plan test 5: queue grows over the cap and drains to 0; 0 without a cap; reordered marks only on overtaken deliveries; no marks / strict order without reordering). **147/147 tests**, typecheck clean. Browser: Nightmare at 1920×1080, 1280×720 and 130 % — queue ≈ 105–165 ms early, ≈ 390 ms (red) after ≈ 6 s at 130 %, rings visible, 0 console errors.
* **T74 (step 6, shots) — DONE:** new `NoBu-Shooter/scripts/shots.mjs` (starts `scripts/demo.mjs`, local Chrome via `playwright-core` `channel: 'chrome'` or `NOBU_CHROME`, fresh browser context per screen, 20 screens × 1280×720 / 1920×1080 → `artifacts/shots/<w>x<h>/NN-name.png` + `index.json` with fps, console errors, `[arena]` notes, warnings count, Lab scroll and page overflow; `--fast`, `--only=`; non-zero exit on any console error; demo tree always stopped via `cleanupOnExit`); `npm run shots` in `NoBu-Shooter/package.json` and the root `package.json` (proxy with `--` so flags pass through); new `docs/VISUAL_CHECKLIST.md`; `client/src/ui/ControlsOverlay.tsx` (Presenter keys section).
  - **Found by the shots and fixed:** Settings / Controls modals at 1920×1080 ran at 29–31 fps — their full-screen `backdrop-filter: blur(8px)` re-blurred the live bloomed WebGL arena every frame, and 3 s of that would have switched bloom off for the rest of the match. `SettingsPanel.tsx` / `ControlsOverlay.tsx` now use a solid 90 % backdrop (51–55 fps, bloom stays on).
  - First `--fast` run: 40/40 screens, 0 console errors; Lab scrolls only with every section open, and at 130 % on 1280×720 (both expected).
* **T75 (step 7, review + docs + exit) — DONE:** full `npm run shots` reviewed against `docs/VISUAL_CHECKLIST.md` (landing, credits, Quick Match incl. Nightmare / inspector / settings / controls / Lab all-open / UI 130 %, six Compare presets, Custom 4 + REF, Compare drawer, Presenter Quick 1 + 10 and Compare 1, both viewports).
  - **Findings fixed:** (1) the closed IMPAIRMENT CONTROLS title wrapped to two lines at 1280 because of its long summary → titles never wrap, the summary truncates (`global.css`); (2) Q10's expected numbers (Phase 3's ≈ 650–700 ms ack) did not match this run's map/fight (queue ≈ 100–170 ms, ack ≈ 540–700 ms, ↓ ≈ 290–420 kbps) → `presenter/scripts.ts` shows the measured ranges; (3) **WebGL context exhaustion** (pre-existing since Phase 2): one presenter run logged `Framebuffer status: Incomplete Attachment`; a stress script (Quick Match ↔ Compare × 8) reproduced Chrome's "Too many active WebGL contexts. Oldest context will be lost" from round 6 — Phaser never releases its context on `destroy`. `client/src/game/GameContainer.tsx` now calls `WEBGL_lose_context` 0.5 s after `game.destroy(true)`; the stress run then showed no warning and no error in 8 rounds.
  - **Accepted, listed:** the Lab scrolls with every section open and at 130 % on 1280×720 (by design); the Controls overlay scrolls internally (unchanged); React StrictMode "closed before established" WebSocket warnings in Compare (dev only, ASSUMPTIONS #18); the strip runs ≈ 0.3–1 s behind real time (jitter buffer, ASSUMPTIONS #68); Nightmare queue depth varies per match.
  - **Docs:** `README.md` (status, Chrome prerequisite for shots, Presenter mode paragraph, 147 tests, `npm run shots`, controls rows Graphics/projector, Lab sections, Presenter; repo tree; Vimium `n`/`b`/`H`; shots troubleshooting), `NoBu-Shooter/README.md` (`npm run shots`), `docs/DEMO_SCRIPT.md` (header, controls, §7 strip + queue numbers, §9, new §12 Presenter tables), `docs/PROTOCOL.md` (stats `queueMs`, packet `t`/`delayMs` meaning, `reordered`), `docs/ASSUMPTIONS.md` (#60–#72), `GAMERULES.md` (§1 presenter keys not game actions, §17 chevrons/death marker/pulse/glow, §19 Presenter switches Invincible), `NoBu-Shooter/assets/README.md` ("Drawn in code": no asset changes), `PHASES.md` (status, overview, Phase 4 Result, gap table, DoD G4 note), `docs/PHASE4_PLAN.md` (implemented, Q10 range, exit checklist ticked, deviations Z1–Z7), `docs/VISUAL_CHECKLIST.md` (new), `log.md`.
* **Notes for the next agent:** scratchpad scripts (`check-presenter.mjs`, `check-lab.mjs`, `check-strip.mjs`, `bloom-bench.mjs`, `stress-views.mjs`, patch scripts) were temporary and are not in the repo. Bash heredocs containing some quote/backtick mixes failed in this environment ("unexpected EOF"); writing Python patch scripts to the scratchpad and running them worked. Suggested tag after the owner's review: `phase-4`.

### 2026-10-10 — Claude (Opus 5.5) — T68: Phase 4 implementation plan

* **Task:** Owner (after committing Phase 3 on `phase3`, merged as PR #6; now on branch `phase4`): plan Phase 4 and prepare everything; ask about critical decisions.
* **Status:** DONE (plan only — no source files changed). Implementation T69–T75 waits for owner approval.
* **Owner answers (asked mid-run):** two separate presenter scripts (Quick Match and Compare, each with its own landing button); Presenter switches on Invincible in Quick Match; glow in Quick Match only; `playwright-core` as a local devDependency of `NoBu-Shooter`, screenshots git-ignored.
* **Findings while reading the code:** name tags, consistent colours and rotating aim already exist (Phase 2.5); `ArenaScene` has an fps check with a `bloomEnabled` TODO and Settings has an unused Graphics Quality; `NetworkLab` keeps private copies of toggles / sync / Invincible (Presenter changes would show stale switches → `NetClient` events in step 1); `CompareView` can't be driven from outside (→ `presetId` prop); the emulator reports neither queue depth nor reordering (→ `queueMs`, `reordered`); Phaser 3.87 has built-in WebGL bloom; `Esc` already opens Settings, so Presenter ends with a bar button instead.
* **Files:** `docs/PHASE4_PLAN.md` (created: starting point, D1–D11, both scripts as tables, design, build order, tests, exit checklist, risks), `PHASES.md` (status line, Phase 4: plan link, P1/P2/P4–P7 per the owner's answers, checkpoint), `log.md` (T68–T75, Current Status, this entry).

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

