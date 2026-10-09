# NoBu Shooter — Implementation Decisions & Assumptions

Decisions that are not obvious from the code, one line each with the reason. Originally required by the v1 spec (`docs/archive/SPEC-v1.md` §3); kept for all later phases (`PHASES.md`).

---

### Architectural & Simulation Assumptions

1. **Monorepo Layout**: Built with npm workspaces under `./NoBu-Shooter` (`shared`, `server`, `emulator`, `client`) with root convenience proxies so commands like `npm run demo`, `npm test`, and `npm run smoke` operate smoothly from either root or project directory.
2. **Fixed Timestep & Determinism**: The game simulation strictly runs at 60 Hz (`dt = 1/60`) using integer key masks and normalized diagonal vectors (`Math.SQRT1_2`) without trig in the player movement path to prevent phantom prediction discrepancies.
3. **Transport Semantics**: WebSockets transport JSON messages where each text frame is treated as an independent datagram by the network emulator pipeline, with 28 simulated header bytes added for bandwidth calculation.
4. **Art and Asset Pipeline**: In accordance with the prompt ("do not generate textures and models, leave them as references and add comments to mark the spot"), all game visuals are rendered procedurally via Phaser 3 Graphics with explicit `/* TEXTURE: <name> */` comments marking integration points for future custom sprites.
5. **Bot Execution Model**: Bots are simulated server-side and feed identical input structures into room authority without network latency; their *input* bypasses the emulator, but their *state* reaches each client through it like any remote player. (Phase 5 adds UDP network players whose own traffic is impaired.)
6. **Reconciliation Error Smoothing**: Prediction errors below `epsilonPx` (0.01 px) are ignored; errors between 0.01 px and 64 px are exponentially decayed via `smoothHalfLifeMs` (80 ms); errors exceeding 64 px execute an instantaneous snap.
7. **Event Redundancy**: Server snapshots redundantly retransmit game events from the preceding 500 ms; clients track and deduplicate events by unique `eid`.
8. **Browser Port Alignment**: Client Vite dev server runs on port 5173, Game Server on port 8080, Emulator Data on port 9000, and Emulator Control on port 9001.

### Phase 1 decisions (2026-10-09)

9. **Input sending (redundancy off)**: every input is sent exactly once, in the next 30 Hz message after it is created (2 inputs per message). Sending only the newest input — the v1 behaviour — silently dropped half the inputs and caused corrections on a perfect network.
10. **Reorder delay default 80 ms**: a reordered input packet only acts like loss if it arrives after a newer input was already consumed, which needs a delay above the send interval + one tick (~50 ms). With the v1 default (40 ms) the server's sorted input queue absorbed reordering completely, so the effect could not be demonstrated. Covered by `tests/netcode.test.ts`.
11. **Interpolated alive/dead state**: remote players' alive flag comes from the interpolated snapshot pair (not the latest snapshot), so a remote player doesn't vanish ~100 ms before the projectile that killed them reaches them on screen. Respawns (life change) are never interpolated across the arena.
12. **Input → Screen definition**: prediction on = time from the input sample to the presentation of the next frame (sample → render + one frame). Prediction off = ack delay (input creation → snapshot acknowledging it) + interpolation delay (if on) + one frame. "Ack delay" is shown alongside.
13. **Server loop on Windows**: OS timers fire every ~15.6 ms on Windows (measured for both `setTimeout` and `Atomics.wait`), so the loop sleeps one timer quantum and yields with `setImmediate` only for the final ~1 ms before each tick: ~1 % CPU instead of a fully spun core, tick rate unchanged (60–61 Hz).
14. **Process lifetime**: services run as single node processes (`node --import tsx`, Vite via its JS API) and exit by themselves when the launcher's PID (`NOBU_PARENT_PID`) disappears, because Windows does not kill children with their parent.
15. **Emulator session labels**: each `NetClient` connects with a unique label (`<name>-<4 random chars>`), which the UI uses to pick *its own* session from the emulator stats (loss tiles, packet strip). Session RNGs share the CLI seed, which keeps Compare panes under comparable random conditions.
16. **Presets are complete configs**: applying a preset replaces the whole link config (missing fields take defaults), so no setting leaks from the previous preset (e.g. burst loss after Nightmare).
17. **Lab room**: always `RUNNING` with any number of players (GAMERULES.md §14); no spawn protection because firing is disabled there.
18. **Dev-mode warnings**: React StrictMode mounts the Compare view twice in development, producing harmless "WebSocket is closed before the connection is established" warnings (one per pane client, the spectator and the emulator control client); `NetClient` ignores callbacks from the discarded connection (generation counter). Production builds don't double-mount.

### Phase 2 decisions (2026-10-09, `docs/PHASE2_PLAN.md` D1–D7)

19. **Movers are `PlayerSnap` entries** with a `mover` field, kept outside the room's player map (no player cap, no inputs, ids from the player id counter). Interpolation — and later sync models — treat them like any remote player.
20. **Mover paths are pure functions of server time** (`shared/src/sim/movers.ts`, `position = moverPath(pattern, tick / 60)`), continuous (no teleports), 200 px/s, and clear of obstacles by ≥ 20 px (tested). Any client can compute the exact true position at any server time.
21. **True server time comes from the spectator**: Compare always opens a direct (unimpaired) spectator connection; its clock offset (`serverNow() = now + EMA(st − arrival)`) is the truth clock for every pane. Expected error ±1–2 ms (snapshot send times jitter with the Windows timer and the hybrid server loop; the EMA averages it out).
22. **Remote error = delay, not distance**: for each drawn mover, τ is the delay at which the true path passes through the drawn position *heading the same way* (a back-and-forth path passes each point twice). Lag = median τ, wobble = interquartile range / 1.35 (= std-dev for normal noise, robust to rare glitches such as a buffer underrun), plus mean distance (px) and frozen frames (true position moved > 0.5 px, drawn < 0.1 px) over a 2 s window. Raw distance depends on the path's shape (stops, reversals) and would rate interpolation as worse. Measured at 50 ± 30 ms (browser): interpolation off ≈ 75 ± 26 ms, 60–70 % frozen; on ≈ 160 ± 3 ms, 2 % frozen.
23. **Frozen % depends on the display**: at 60 Hz with 30 Hz snapshots, a pane without interpolation repeats every other frame (≈ 50 %, more under jitter); a 144 Hz monitor would show ≈ 79 %.
24. **One shared input driver**: in Compare, `InputDriver` owns the keyboard and a single fixed 60 Hz loop that gives every pane's client the same keys on the same step and flushes all inputs together at 30 Hz. Panes' Phaser scenes only render. Firing is not driven (the lab room rejects it).
25. **Comparison presets change one setting**; their network conditions are complete emulator configs (named or ad-hoc presets), so nothing carries over. "Prediction off vs on" keeps interpolation on in both panes.
26. **Pane layout**: `layoutPanes` tries every rows × cols grid and keeps the largest canvas; canvases are exactly 16:9, so there's no letterboxing (measured 0–0.2 %); leftover space (or an empty grid cell) holds the dock. The network drawer overlays the panes so opening it never resizes them.
27. **Compare rendering performance**: each pane renders at its displayed size (`Phaser.Scale.RESIZE` + camera zoom) instead of a full 1280×720 frame shrunk by CSS; static art (grid, walls) is baked into textures once; mover bodies, trail dots and truth rings are pooled sprites. Phaser re-tessellates every `Graphics` object each frame, which had made 5 panes CPU-bound at 20 fps on the dev laptop's Intel UHD GPU; now 60 fps with 4 panes + reference at 1920×1080. Quick Match keeps `FIT` (unchanged look).

