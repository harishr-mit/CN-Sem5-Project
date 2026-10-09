# NoBu Shooter — Project Phases

**Audience:** the project owner and any agent implementing the next phase.
**Status:** Phase 1 done (2026-10-09). Next: Phase 2.
**Replaces:** `ROADMAP.md` (draft of 2026-10-09). The v1 build spec is archived at `docs/archive/SPEC-v1.md`. `GAMERULES.md` remains the source of truth for gameplay.

The project moves in six phases. Each phase ends with something you can **show** (a demo checkpoint) and something you can **check** (exit criteria). After Phase 6, all four goals below are met.

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
| 2 | **Compare view + scripted movers** | 2–4 synchronised panes plus a ground-truth reference pane, with moving targets that make interpolation visible | G1 foundation, G2 | next |
| 3 | **Sync models: snapshot vs state** | Full snapshots vs delta snapshots vs state sync with extrapolation, side by side, with a live bandwidth chart | G1 | planned |
| 4 | **Presenter mode + polish** | A guided, keyboard-driven talk track (N = next step), polished arena, texture-ready assets | G4 | planned |
| 5 | **Realistic transport + standalone emulator** | Real UDP between Node "network players", emulator and server. The emulator dashboard works with no game running | G3 | planned |
| 6 | **Lockstep + final verification** | Deterministic lockstep freezing under 2–5 % loss beside snapshot sync. Full rehearsal and docs | G1, all | planned |

Each phase builds on the previous one. Phases 4 and 5 are independent of each other and can be swapped if the presentation date requires it.

### Rules for every phase

1. Before starting, add the phase tasks to `log.md` as `[ ]` and set them to `[~]` while working on them.
2. The phase is finished only when all of these pass:
   - `npm test`
   - `npm run typecheck`
   - `npm run smoke`
   - a browser check of the demo checkpoint (from Phase 4 on, `npm run shots`)
3. Update the docs the phase touches (`docs/PROTOCOL.md`, `docs/DEMO_SCRIPT.md`, `docs/ASSUMPTIONS.md`, `README.md`).
4. Leave no running processes and no bound ports (5173, 8080, 9000, 9001).
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
| Lab panel needs scrolling at 1600×900; no name tags in the arena | Phase 4 |
| In dev mode, StrictMode prints 3 harmless "WebSocket closed before established" warnings | accepted (dev only) |

---

## Phase 2 — Compare view + scripted movers

**Goal:** a flexible side-by-side comparison screen. It is the stage on which every later comparison (sync models, toggles, transports) is shown.

### Scope

| ID | Task |
|---|---|
| C1 | **Compare view** (replaces A/B): 2–4 panes. Each pane has its own `NetClient` and emulator session, plus a per-pane config of toggles (and the sync model from Phase 3). Panes fill the space without letterboxing. Keyboard and mouse drive all panes. |
| C2 | **Reference pane** (optional): connects *directly* to the server (bypassing the emulator), so the ground truth is on screen. |
| C3 | **Scripted movers** in the `lab` room: server entities with patterns (circle, zigzag, sudden reversal, stop–go). Their state reaches every pane through the emulator, so the differences between interpolation and extrapolation are obvious. Patterns and on/off are selectable from the Compare view. |
| C4 | **Per-pane metrics bar**: Input → Screen, ack delay, RTT, corrections/s, bandwidth ↓, and **remote error in px** (rendered mover position vs the reference pane's position at the same moment). |
| C5 | **Comparison presets** (one click): "Prediction off vs on", "Interpolation off vs on", "Redundancy off vs on", each with the right emulator preset. The old A/B view becomes the first of these. |
| C6 | Tests: the movers are deterministic; the reference pane matches server positions exactly. |

**Demo checkpoint:** open Compare and choose "Interpolation off vs on" at 50 ms ± 30 ms jitter. The movers stutter in the left pane and glide in the right one, and the remote-error number tells the same story.

**Exit criteria:** the phase rules above; at 1280×720 and 1920×1080 no pane has empty letterbox bars larger than 10 % of the pane.

---

## Phase 3 — Sync models: snapshot vs state (G1)

**Goal:** show the trade-offs between synchronisation strategies with measurements.

### Models

| Model | Server sends | Client does | What it demonstrates |
|---|---|---|---|
| **S1 Full snapshot + interpolation** (current) | The whole world, 30 Hz | Renders 100 ms in the past | Smooth and self-healing, but always behind and bandwidth-heavy |
| **S2 Delta snapshot** | Only what changed since the last snapshot the client *acked* (the client sends `snapAck`). Falls back to full when the base is too old | Rebuilds full state from its base | ~70–90 % less bandwidth. Under loss the base goes stale and costs rise. **Fits under Nightmare's 400 kbps cap where S1 doesn't** |
| **S3 State sync + extrapolation** (dead reckoning) | Position and velocity at a lower rate (e.g. 10 Hz) | Simulates remote entities forward from the last state, no interpolation delay; blends on update | Lowest latency for remote entities, but overshoot and rubber-banding on direction changes |

### Scope

| ID | Task |
|---|---|
| S0 | Sync-model interface (`shared/src/sync/`): a server encoder and client decoder pair, selected per connection in `hello` (`sync: "full" \| "delta" \| "state"`). |
| S1 | Protocol messages `snapDelta`, `state` and client `snapAck`, with validators. Documented in `docs/PROTOCOL.md`. |
| S2 | Delta encoder/decoder with baseline tracking and a full-snapshot fallback. |
| S3 | State encoder (position + velocity, configurable rate) and an extrapolating client renderer with error blending. |
| S4 | Compare view: a sync model per pane, plus a **live bandwidth chart** comparing panes (↓ kbps over time). |
| S5 | Tests: a delta round-trip equals the full snapshot (including under loss with the fallback); extrapolation error is 0 on straight lines and bounded on reversals; per-model bandwidth falls within an expected range. |

**Demo checkpoint:** three panes (Full / Delta / State) at the Nightmare preset. Delta stays responsive where Full builds a queue, and State reacts instantly but rubber-bands on the zigzag mover. The bandwidth chart shows the difference.

**Exit criteria:** the phase rules; measured delta bandwidth ≤ 40 % of full in the baseline lab scene (recorded in `docs/ASSUMPTIONS.md`).

---

## Phase 4 — Presenter mode + polish (G4)

**Goal:** a talk you can give with one hand on the keyboard, on an arena that looks finished.

| ID | Task |
|---|---|
| P1 | **Presenter mode**: a scripted sequence of steps (data file mirroring `docs/DEMO_SCRIPT.md`). Each step sets presets, toggles, the Compare layout and the sync model automatically, and shows a caption ("Watch the amber ghost lag behind…"). `N` / `B` move to the next or previous step; `H` hides the captions. |
| P2 | Arena: name tags, remote aim chevrons, death markers, a respawn pulse, glow/bloom (Phaser FX) with automatic degrade, and consistent player colours across the scoreboard and arena. |
| P3 | **Texture-ready assets**: a `preload()` manifest (`client/public/assets/manifest.json`). Each sprite key falls back to the current procedural drawing when its file is missing, so new textures drop in without code changes. The `// TEXTURE:` markers stay. |
| P4 | Lab panel: collapsible sections, no scroll at 1920×1080, compact at 1280×720, and a projector font-scale setting. |
| P5 | Packet strip: queue-depth bar, visible reorder overtakes, legend. |
| P6 | Landing page: Quick Match, Compare, Presenter, Emulator dashboard (Phase 5). |
| P7 | `npm run shots`: a Playwright script using the locally installed Chrome (`channel: 'chrome'`, no browser download) that captures every screen at 1280×720 and 1920×1080 into `artifacts/shots/`. |

**Demo checkpoint:** start Presenter mode and press `N` through the whole talk, with no mouse fiddling and every effect appearing on cue.

**Exit criteria:** the phase rules; `npm run shots` output reviewed against a short visual checklist (no unstyled elements, no overlap, readable at 1280×720).

---

## Phase 5 — Realistic transport + standalone emulator (G3)

**Goal:** real game networking uses UDP, so the server and emulator speak UDP too. The emulator becomes a tool in its own right.

```text
Browser (Phaser)  ──WS──►  Emulator :9000 (WS mode)  ──WS──►  Server :8080
Node net-players  ──UDP─►  Emulator :9100 (UDP mode) ──UDP─►  Server :8081
Emulator dashboard + control API: http/ws :9001 (never impaired)
```

Browsers cannot open UDP sockets, so the browser stays on WebSocket and the emulator treats each WS frame as a datagram. There is **no TCP mode**: impairing a byte stream is not meaningful, and TCP retransmission would hide the loss.

| ID | Task |
|---|---|
| U1 | Server UDP adapter on :8081, feeding the existing `GameServer` core (`server/src/core.ts`, already transport-agnostic). |
| U2 | Datagram discipline: every server → client datagram ≤ 1200 bytes (delta/state fit naturally; full snapshots trim events). |
| U3 | Emulator UDP mode: `--proto udp`, one session per source address (NAT-like), each with its own upstream socket, using the same `Pipeline` unchanged. |
| U4 | **Network players**: `npm run swarm -- --n 3` runs headless `NetClient`s over UDP through the emulator. They are remote players whose *own* traffic is impaired, which removes the "bots bypass the emulator" caveat. |
| U5 | **Emulator dashboard** served by the emulator on :9001: sessions, per-session and per-direction sliders, presets, live charts and a packet log. It works with no game running. |
| U6 | `emulator/README.md`: how to put the emulator in front of *any* WS or UDP app, with a two-terminal example using generic tools. Optional: capturing the loopback UDP traffic in Wireshark. |
| U7 | Tests: the UDP adapter delivers exactly what the pipeline decides; two clients on one host get separate sessions. |

**Demo checkpoint:** run the emulator and two generic UDP tools with no game, set 20 % loss on the dashboard, and watch messages vanish. Then start the swarm: the network players visibly lag and correct in the browser while the dashboard shows their sessions.

**Exit criteria:** the phase rules; the smoke test also runs one UDP network player under Nightmare.

---

## Phase 6 — Lockstep + final verification

**Goal:** complete the set of sync models and make the whole demo rehearsal-proof.

| ID | Task |
|---|---|
| L1 | **S4 Deterministic lockstep** (lab room only, movement only): the server relays every player's input per tick; clients simulate the world and *wait* when the next tick's input is missing. A stall counter goes in the pane metrics. |
| L2 | Tests: lockstep clients stay bit-identical under loss (they stall but never diverge). |
| L3 | Compare preset "Snapshot vs Lockstep": at 2–5 % loss, the lockstep pane freezes in bursts while the snapshot pane carries on. |
| L4 | Final docs: `README.md` (architecture with UDP and WS, all commands), `docs/PROTOCOL.md`, `docs/DEMO_SCRIPT.md` (final talk track = Presenter steps), `docs/ASSUMPTIONS.md`. |
| L5 | Full rehearsal on the presentation laptop: cold start from a fresh clone, `npm run demo`, the Presenter run-through, timing noted. Fix anything that stutters. |

**Demo checkpoint (final):** the complete Presenter run. It covers prediction and reconciliation, the four sync models side by side, the impairments shown live in the packet strip and dashboard, and the emulator used on its own.

### Definition of Done (all phases)

- [ ] G1: four sync models are selectable and comparable side by side with measured bandwidth, latency and error.
- [ ] G2: 0 corrections on a clean network; corrections under loss that converge; redundancy removes them (covered by tests and visible in the UI).
- [ ] G3: the emulator runs standalone (WS + UDP) with its own dashboard and README, and the game is just one client of it.
- [ ] G4: Presenter mode runs the whole talk; screenshots pass the visual checklist; textures drop in through the manifest.
- [ ] `npm run demo`, `npm test`, `npm run typecheck`, `npm run smoke` and `npm run shots` pass from a fresh clone.

---

## Out of scope

These are kept out unless the owner asks:

- a WebRTC DataChannel or WebTransport client (browser-native unreliable datagrams)
- lag compensation and predicted projectiles
- a TCP proxy mode
- matchmaking, accounts and persistence
- the gameplay items listed in `GAMERULES.md` §16
