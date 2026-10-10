# Phase 3 Implementation Plan — Sync models: snapshot vs state

**Audience:** the project owner and the agent who implements Phase 3.
**Status:** approved by the owner on 2026-10-10 and **implemented** the same day (`log.md` T62–T67). Owner answers folded in: Quick Match gets a sync switch in the Network Lab, default Full (D10); three comparison presets (D9); State at 10 Hz by default, switchable to 30 Hz per pane (D5). Deviations found while building are in §10; results are in `PHASES.md` → Phase 3 → Result.
**Scope:** `PHASES.md` → Phase 3, items S0–S5. This file says *how* to build them. `PHASES.md` stays the source for *what* and the exit criteria.

---

## 0. Starting point

Checked on 2026-10-10, branch `phase2.5` at `656fd69` (clean tree). Phases 1, 2 and 2.5 are done (105 tests, smoke and browser check passing per `log.md`).

**What the code does today:**

- `Room.buildSnapshot(playerId)` builds one `MsgSnap` per human player every 2 ticks (30 Hz). `Room.sendSnapshots()` turns it into JSON (`encodeServer`) and hands the string to `core.ts`. Spectators share one snapshot.
- A snapshot repeats **everything** each time: every `PlayerSnap` field, including the ones that hardly ever change (`name`, `bot`, `weapon`, `shield`, …), plus all events from the last 500 ms (`NET.eventRedundancyMs`).
- `NetClient.onSnapReceived` keeps a 32-entry buffer, interpolates remote entities 100 ms in the past, reconciles the local player against `players[me]` + `ack` + `me`, and de-duplicates events by `eid`.
- Bandwidth metrics count payload characters only. The emulator counts payload + 28 bytes per message (`ASSUMPTIONS.md` #3).
- The emulator caps bandwidth **per session and per direction**. Each Compare pane has its own session, so each pane gets its own cap.
- `PaneSpec.sync?: 'full'` is reserved in `client/src/compare/types.ts`. The Compare dock has a comment where the bandwidth chart goes.
- The remote-error tracker already searches delays down to −250 ms (`remoteError.ts`), so a mover drawn *ahead* of the truth (extrapolation) can be measured.

**Measured for this plan** (a scratchpad script driving a real `Room` in-process, 30 s per scene; nothing added to the repo):

| Scene | Full snapshot | Ideal delta (changed fields vs the previous snapshot) | State, 10 Hz (est.) |
|---|---|---|---|
| Lab, 3 pane players + 4 movers (7 entities), moving | 1.85 kB, **451 kbps** | 355 B, **92 kbps (19 %)** | ≈ 2.0 kB, ≈ 165 kbps |
| Lab, 2 pane players + 4 movers | 1.64 kB, 401 kbps | 314 B, 82 kbps (19 %) | ≈ 1.8 kB, ≈ 145 kbps |
| Main, 4 players, the human firing nonstop | 2.47 kB, 600 kbps | 761 B, 189 kbps (31 %) | — |

*kbps include the emulator's 28 B per message. The main-room figure is higher than `ASSUMPTIONS.md` #40 (2.14 kB) because the script fires every tick.*

Two findings drive the design:

1. **Rounding positions barely matters.** Rounding to 0.1 px would bring delta from 19 % to 17 %. The savings come from leaving out fields that didn't change. So positions stay exact (D4), and reconciliation stays bit-exact.
2. **The Nightmare checkpoint holds.** With 3 panes and all four movers, Full needs 451 kbps on a 400 kbps link, so its queue fills. Delta needs 92 kbps, and State at 10 Hz about 165 kbps. Both fit.

---

## 1. Decisions (proposed)

| # | Decision | Why |
|---|---|---|
| D1 | **One sync model per connection.** `hello.sync` sets it at join. A new `sync` message switches it live (the server swaps the encoder; the next message is self-contained). Spectators always get Full. | A live switch means Quick Match never has to rejoin (rejoining would reset the score). The reference pane must show the plain truth. |
| D2 | **Encoders run in `core.ts`, one per connection.** `Room` keeps building one `MsgSnap` object per player every 2 ticks, but hands over the **object** instead of a JSON string. The connection's encoder turns it into a `snap`, `snapDelta` or `state` message, or into nothing (State at 10 Hz skips 2 of every 3). | Game logic stays the same for every model; one place decides what goes on the wire. Every model sees the same world at the same ticks, which keeps the comparison fair. |
| D3 | **Delta = field-level diff against the newest base the client has acknowledged**, provided that base is still in the server's ring and at most 500 ms old (= `eventRedundancyMs`). Otherwise the server sends a full `snap` (a *fallback*, counted). Acks ride on the input message (`sa`), with a standalone `snapAck` when no input goes out (dead, waiting, spectating). Events: every event newer than the base, so an event is repeated until the client acknowledges a snapshot that contains it. | This is the standard Quake 3 scheme. It survives loss, duplication and reordering, because each delta names its base explicitly. The 500 ms limit means events can't slip through the gap between a stale base and a fallback. **Superseded (§10 Y2):** bases up to 1 s, with an encoder-side log of unconfirmed events. |
| D4 | **No rounding.** All models send exact values. | Measured above: rounding saves 2 points. Rounded own positions would cause a tiny correction on every snapshot (error > `epsilonPx`). |
| D5 | **State = complete entity records plus velocity** (`vx`, `vy` in px/s, taken from the entity's movement in the last tick) at **10 Hz (default) or 30 Hz**, chosen per connection. It is not delta-compressed. | It is the classic dead-reckoning model. Its selling point is latency, not bytes, and keeping the encodings separate keeps the lessons separate. 10 vs 30 Hz shows the trade-off: more updates mean less overshoot but more bytes (owner choice). |
| D6 | **Extrapolating renderer** (client, State only). Remote entities are drawn at the client's estimate of current server time (`serverNow()`), with **no interpolation delay**. Position = last state + v·dt, with dt clamped to [0, 250 ms], then pushed out of obstacles (`settlePosition`). When a new state arrives, the jump between the old and new extrapolation is turned into an offset that decays with a 100 ms half-life (error blending). Projectiles are extrapolated along their direction. The pane's Interpolation toggle does nothing in State mode and is greyed out. | Remote lag ≈ one-way latency instead of latency + 100 ms. The cost is overshoot and rubber-banding at reversals, which is exactly what the demo shows. |
| D7 | **Full and Delta draw the same picture** (both interpolate). | The comparison isolates bytes and behaviour under loss and queues: the same picture for about 1/5 of the bytes. |
| D8 | **Bandwidth metrics count wire bytes** (payload + 28 B per message, the emulator's own accounting) everywhere: pane bars, dock, chart and the Network Lab tile. | The chart's cap line (the emulator's `bandwidthKbps`) and the measured kbps then use the same units. Phase 1/2 displays rise by ≈ 7 kbps (30 messages/s × 28 B). |
| D9 | **Compare:** `PaneSpec.sync`, a SYNC chip in each pane header that cycles FULL → DELTA → STATE 10 → STATE 30 (or `Y` on the selected pane), and **three presets**, each changing one setting (owner choice): **"Sync models"** (Full / Delta / State 10, Nightmare, all movers, REF on — the PHASES checkpoint); **"Bandwidth"** (Full vs Delta on a clean 300 kbps link, all movers); **"State rate"** (State 10 vs State 30 Hz, Transatlantic, zigzag + reversal movers, REF on). The dock gets new columns and a live **bandwidth chart** (§4.4). | The owner chose all three presets. With all four movers, 2 panes already need ≈ 401 kbps in Full, so the 300 kbps preset shows queueing without loss mixed in. |
| D10 | **Quick Match:** a SYNC MODEL row in the Network Lab (FULL / DELTA / STATE 10 / STATE 30), hotkey `Y` to cycle it, **default Full** (owner choice). | Phase 1/2.5 numbers and the Nightmare bufferbloat lesson stay unchanged by default. One key shows Delta fixing it live. |

**Hotkey `Y`** ("sYnc") is the only free letter that doesn't clash with the game, the Lab or Phase 4's planned `N` / `B` / `H`. Vimium maps `y` to "copy URL", which is harmless; the README's Vimium note will list it.

---

## 2. Protocol changes (all additive, `v` stays 1)

Client → server:

| Message / field | Shape | Notes |
|---|---|---|
| `hello.sync` | `{ model: 'full' \| 'delta' \| 'state', hz?: 10 \| 30 }` | Optional. Default `{ model: 'full' }`. Ignored for spectators. |
| `sync` (new) | `{ t: 'sync', model, hz? }` | Live switch. Re-sent after every (re)connect, like `dev`. |
| `input.sa` | `number` | Optional. Newest snapshot tick the client has decoded. |
| `snapAck` (new) | `{ t: 'snapAck', tick }` | Sent in the 30 Hz send step only when no input message went out and the acked tick changed. |

Server → client:

| Message | Shape | Notes |
|---|---|---|
| `snap` | unchanged | Full model, spectators, and delta fallbacks. |
| `snapDelta` (new) | `{ t, tick, base, st, ack, match?, players?, gone?, projectiles?, projGone?, pickups?, me?, events? }` | `players` / `projectiles`: changed entries as `{ id, …changed fields }`, with `null` meaning "optional field removed" (`invincible`, `mover`, `pierce`); new entities are sent complete. `gone` / `projGone`: removed ids. `match` and `me`: changed fields only. `pickups`: the whole list, only when it changed. `events`: every event newer than the base. |
| `state` (new) | `MsgSnap` body plus `players[].vx/vy`, `t: 'state'`, `hz` | Complete records. `hz` tells the client the update interval (for the snapshots-missed count and the extrapolation clamp). |

Validators: `validateClientMsg` gets `sync`, `snapAck`, `hello.sync` and `input.sa`. `decodeServer` stays a light check, as today. The client decoder rejects a `snapDelta` whose base it doesn't have (counted, never applied).

---

## 3. Shared sync core — `shared/src/sync/` (pure, no I/O)

| File | Contents |
|---|---|
| `types.ts` | `SyncModel`, `SyncSpec`, `isSyncSpec()`, `DEFAULT_SYNC`, labels. |
| `diff.ts` | `diffFields(a, b)` and `patchFields(base, d)` for flat records (deep compare only for `results`); `diffList` / `patchList` keyed by `id`. |
| `delta.ts` | `DeltaEncoder` (server: ring of the last 16 snapshots it sent — 32 as built, plus an unconfirmed-event log, §10 Y2 — `onAck(tick)`, `encode(snap)` → `MsgSnap \| MsgSnapDelta`, fallback counter) and `DeltaDecoder` (client: ring of 32 decoded snapshots, `decode(msg)` → `MsgSnap \| null`, `newestTick` for acks, missing-base counter). |
| `state.ts` | `StateEncoder` (every 3rd or every snapshot; adds `vx` / `vy` from the previous tick's positions, which `Room` supplies on the snapshot object as a side table, not on the wire for Full/Delta). `stateToSnap()` on the client. |
| `index.ts` | `createEncoder(spec)`, re-exports. Exported as `@nobu/shared/sync`. |

**Gotcha found while reading `room.ts`:** the snapshot's `events` is the room's live array, which `emitEvent` later pushes into. Anything kept as a base must copy it (`events.slice()`); `players`, `projectiles` and `pickups` are already fresh arrays.

---

## 4. Server and client design

### 4.1 Server (`room.ts`, `core.ts`, `game/state.ts`)

- `Room` constructor callbacks take `MsgSnap` objects instead of strings: `sendFn(playerId, snap)` and `spectatorFn(snap)`. `core.ts` encodes: spectators get `encodeServer(snap)` once per tick, as today; players get `encodeServer(conn.encoder.encode(snap))`.
- Velocities: `PlayerState` and `MoverState` get `prevX` / `prevY`, set at the start of each tick. `buildSnapshot` attaches a non-wire `vel: Map<id, {vx, vy}>`, which only the State encoder reads.
- `Connection` gets `encoder` and `sync`. `hello` / `sync` messages replace the encoder. `input.sa` and `snapAck` call `encoder.onAck()`.
- `Metrics`: bytes sent per model and delta fallbacks (shown by `npm run smoke`).

### 4.2 `NetClient`

- `sync: SyncSpec` (option + `setSync()`, which sends `sync` when connected and is re-sent after `welcome`).
- `handleServerMsg`: `snap` → as today; `snapDelta` → `DeltaDecoder.decode` → the same `onSnapReceived`; `state` → `stateToSnap` plus velocities kept in the buffer entry → `onSnapReceived`. Ordering, duplicates, reconciliation and events don't change.
- Every decoded snapshot (full or delta) goes into the decoder ring, so later deltas can use it as a base. In delta mode, `sendInputs()` adds `sa` or sends `snapAck`.
- Snapshots-missed uses the interval of the incoming model (`state.hz`), not a fixed 2 ticks; otherwise State at 10 Hz would count 2 misses per message.
- Bandwidth: wire bytes (D8). New metrics: `syncModel`, `msgBytesDown` (average), `fullFallbacks` (full `snap`s received while in delta mode, per second), `deltaNoBase`, `snapsLostPerSec`, `moverOffPathPct` (frames where the drawn mover lies on no point of its path within 3 px — overshoot / rubber-band, which lag cannot capture).
- Rendering: `computeRenderState()` uses `extrapolate.ts` when the newest entry is a State message, otherwise the current interpolation.

### 4.3 `client/src/net/extrapolate.ts` (pure, unit-tested)

`extrapolateState(entry, serverMs, blend, geometry)` returns positions for players and projectiles. It keeps a per-id blend offset that is updated when a new state replaces the old one and decays with `NET.state.blendHalfLifeMs`. Config in `net.json`: `state: { defaultHz: 10, rates: [10, 30], extrapolateMaxMs: 250, blendHalfLifeMs: 100 }`, `delta: { ringSize: 16, maxBaseAgeMs: 500, clientRingSize: 32 }` (as built: `extrapolateBackMs: 100` added, delta `32 / 1000 / 64` — §10 Y2, Y3).

### 4.4 Compare

- `types.ts`: `PaneSpec.sync: SyncSpec` (required, default Full); `makePane(id, title, toggles, sync)`.
- `presets.ts`: the three new presets (D9), added after the Phase 2 ones. Each pane's sync is applied with `client.setSync()` in the same effect that applies toggles. A preset test checks that each preset changes exactly one setting.
- `ComparePane`: SYNC chip, cycled by click or `Y` on the selected pane; the `I` chip is disabled for State panes.
- `CompareDock`: new columns **SYNC**, **MSG B**, **LOST/s**, **FALLBK/s** (delta panes only), **OFF-PATH %** (movers). New **`BandwidthChart.tsx`**: a canvas line chart with one line per pane in its pane colour, ↓ wire kbps over the last 30 s (5 Hz samples), current values at the right-hand end, and a dashed line at the emulator's current bandwidth cap (from the emulator state; no line when uncapped). In a wide dock it sits beside the table; in a short dock it replaces the lag sparklines.

### 4.5 Quick Match

- `NetworkLab`: a SYNC MODEL row (four chips) under the netcode toggles, plus `Y` to cycle it. The choice is stored in the game store and `settings.ts` (localStorage, default Full) and applied with `netClient.setSync()`.
- `ControlsOverlay`: `Y`. HUD: unchanged (the Lab shows the model and kbps).

---

## 5. Build order

Each step ends with `npm test` and `npm run typecheck` green and is marked in `log.md`.

| Step | log.md | Work | Done when |
|---|---|---|---|
| 1 | T62 | Shared sync core (§3), protocol types and validators (§2), `@nobu/shared/sync` export, `net.json` keys | Tests 1–4 pass |
| 2 | T63 | Server: room → object hand-off, velocities, per-connection encoders, `sync` / `snapAck` / `sa`, metrics | Test 5 passes; existing harness tests unchanged |
| 3 | T64 | `NetClient`: decoders, acks, `setSync`, wire-byte bandwidth, new metrics; `extrapolate.ts` | Tests 6–9 pass |
| 4 | T65 | Compare: `PaneSpec.sync`, SYNC chip + `Y`, three presets, dock columns, `BandwidthChart` | Test 10 passes; presets work by hand |
| 5 | T66 | Quick Match: Network Lab SYNC row, `Y`, settings, ControlsOverlay | Switching live keeps the player in the match (browser) |
| 6 | T67 | Smoke extension, browser check, measurements, docs (§7) | Exit checklist met |

---

## 6. Tests (S5)

| # | File | What it checks |
|---|---|---|
| 1 | `tests/sync.test.ts` | `diffFields` / `patchFields` round-trip on random records, including optional fields that appear or disappear (`null`), nested `results`, and no change → empty diff. |
| 2 | `tests/sync.test.ts` | Delta stream: random snapshot sequences (players join and leave, movers, projectiles, pickups, `me`, match changes, events) through `DeltaEncoder` → a lossy, reordering, duplicating channel → `DeltaDecoder`, with acks fed back over a lossy channel. Every decoded snapshot equals the server's full snapshot of that tick (compared keyed by id); fallbacks happen when acks stop for more than 500 ms (1 s as built, §10 Y2); no event is lost at 30 % loss. |
| 3 | `tests/sync.test.ts` | A delta whose base the decoder doesn't have is rejected and counted, never half-applied. The encoder never picks an un-acked or too-old base. Stored bases are not affected by later `emitEvent` calls (the live-array gotcha). |
| 4 | `tests/protocol.test.ts` | Validators: `sync`, `snapAck`, `hello.sync`, `input.sa` (types, unknown model, bad `hz`). |
| 5 | `tests/netcode.test.ts` | Harness, lab scene (3 clients with Full / Delta / State + 4 movers + spectator): each client's decoded snapshots match the spectator's at the same tick; 0 corrections in every model on a clean link; switching model live keeps the player (same id, no respawn). |
| 6 | `tests/netcode.test.ts` | Bytes: Delta ≤ 40 % of Full in the lab scene (expected ≈ 19 %); State 10 Hz ≤ 45 % of Full; State 30 Hz ≥ Full. |
| 7 | `tests/extrapolate.test.ts` | Straight line at constant speed → error exactly 0 at any render time up to the clamp; reversal → maximum error ≤ speed × (1/hz + jitter) + 2 px; the blend offset halves every 100 ms; an extrapolated position is never inside an obstacle; freezes after 250 ms without data. |
| 8 | `tests/netcode.test.ts` | Remote error at 50 ms one-way: State mover lag < Full mover lag − 60 ms (≈ 50 vs ≈ 150 ms); State 30 Hz off-path % < State 10 Hz on zigzag + reversal. |
| 9 | `tests/netcode.test.ts` | Nightmare (400 kbps, 12 % burst loss) for 10 s: Delta decodes correctly throughout, with fallbacks > 0 and missing bases = 0; Full's ack delay > Delta's ack delay + 150 ms (the queue). |
| 10 | `tests/compare.test.ts` | Each new preset changes exactly one setting between panes (sync or rate), has a complete network config and the movers it needs; `PaneSpec.sync` defaults to Full. |

**Smoke (`scripts/smoke.mjs` / `headless-bot.mjs`):** a second bot connects with `sync: delta` under Nightmare and checks that it received `snapDelta` messages, decoded them without missing bases, received fewer bytes than the Full bot, and has a sane world (its own id, map, 4 participants).

---

## 7. Exit checklist

The phase rules from `PHASES.md` apply, plus:

- [ ] `npm test`, `npm run typecheck` and `npm run smoke` pass.
- [ ] Browser check (scratchpad `playwright-core` + local Chrome, as before) at 1280×720 and 1920×1080, with screenshots of all three new presets:
  - **demo checkpoint**: "Sync models" at Nightmare. Full's ack delay and mover lag climb (queue) while Delta stays responsive. State's movers react first but rubber-band on the zigzag (off-path % > 0). The chart shows Full above the 400 kbps cap line and Delta well below it. Values recorded in `log.md`.
  - Quick Match: `Y` cycles the models live without leaving the match; under Nightmare, Delta lowers the ack delay compared with Full.
  - 3 panes + REF + chart at ≥ 55 fps.
- [ ] Exit criterion: measured Delta ≤ 40 % of Full in the baseline lab scene, recorded in `docs/ASSUMPTIONS.md`.
- [ ] Docs: `docs/PROTOCOL.md` (§2 messages, sizes), `docs/DEMO_SCRIPT.md` (new "Sync models" section; §7 Nightmare note now points to `Y` → Delta), `docs/ASSUMPTIONS.md` (D1–D10 as numbered entries, measured sizes), `GAMERULES.md` (controls table `Y`; network rates note), `README.md` (controls, Compare presets, Vimium `y`), `PHASES.md` (status, Phase 3 result), `log.md`.
- [ ] No processes left running and ports 5173/8080/9000/9001 free. Suggested: tag `phase-3`.

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| Delta bugs are silent: a wrong patch looks like "slightly off" positions | Test 5 compares every decoded snapshot with the spectator's truth in the real harness; smoke checks it over real sockets. |
| Full pane under Nightmare drops snapshots from a 400 ms queue, and the watchdog could fire if nothing arrives for 5 s | Not expected (the queue drops some packets, not all), but test 9 runs 10 s and asserts the status stays `connected`. |
| Fewer movers or panes shrink Full below the cap, so the checkpoint fails silently | The presets set all four movers; the caption says why. The chart's cap line makes it visible either way. |
| An extrapolated player overshoots into or through a wall | Positions are settled out of obstacles, and extrapolation stops after 250 ms. |
| The change of bandwidth units (D8) changes documented Phase 1 numbers slightly | Re-measure and update `DEMO_SCRIPT.md` where kbps are quoted. |
| Phase 5's 1200-byte datagram limit (U2): Full and State messages are ≈ 2 kB | Out of scope here; noted for Phase 5 (delta fits; full fallbacks trim events there). |

## 9. Not in Phase 3

- Rounding or binary encoding (bit-packing). JSON stays readable in the packet inspector; it would be a separate, later lesson.
- Priority accumulator or per-entity rates for State sync (Fiedler-style bandwidth budgets).
- Deriving projectile positions from their spawn (saves another ≈ 6 points in the main room).
- Lockstep (Phase 6), presenter steps for the new presets (Phase 4).

## 10. Deviations from this plan

| # | Where | Change | Why |
|---|---|---|---|
| Y1 | §2 | Removed optional fields are listed in a `del` array instead of being sent as `null`. | `match.results` is legitimately `null`; a `null` marker would have been ambiguous. |
| Y2 | D3, §3 | **The delta encoder keeps its own log of unconfirmed events**, and the base may be up to **1 s** old (ring 32, client ring 64) instead of 500 ms (ring 16 / 32). | With 500 ms, the smoke test under Nightmare fell into a loop: late acks → full fallbacks → 400 kbps queue fills → later acks. The delta client then had a *worse* ack delay than full (685 vs 656 ms). With the log, events stay reliable for any base age, and delta keeps sending deltas (≈ 335 ms vs ≈ 550–610 ms). |
| Y3 | D6 | dt is clamped to **[−100, 250] ms**, not [0, 250]: a state newer than the render clock is projected back. | Clamping at 0 turned every new state into a backward jump; at 30 Hz the blend offsets piled up into extra lag (122 ms at 30 Hz vs 77 ms at 10 Hz). Now State 10 / 30 Hz read 53 / 50 ms vs Full 150 ms at 50 ms one-way. Config `NET.state.extrapolateBackMs`. |
| Y4 | D9 | The **Sync** preset has **no REF pane**. | With 3 panes + REF the 2 × 2 grid is full and the dock (table + bandwidth chart) disappears, at 1920 × 1080 too. Each pane still draws the truth rings. |
| Y5 | §6 test 9 | Nightmare harness test runs 20 s and averages the ack delay over the last 10 s; it no longer expects delta fallbacks. | The emulator applies loss before the bandwidth cap, so full's ≈ 451 kbps reaches the 400 kbps cap as ≈ 400 kbps and its queue takes 10–15 s to build. With 1 s bases, 12 % burst loss never starves acks long enough for a fallback. |
| Y6 | §4.4 | Narrow docks pick columns by context: ACK, ↓ KBPS, MOVER LAG, OFF-PATH when sync models differ. Top-bar buttons tighten below 1400 px. Short preset labels **Sync**, **Bandwidth**, **State Hz**. | At 1280 × 720 the compact table had dropped exactly the columns the sync presets are about, and the top bar overflowed by 97 px. |
| Y7 | §6 smoke | The smoke step is `scripts/sync-clients.ts`: real `NetClient`s (full + delta) through the emulator plus a direct spectator in the main room; every decoded delta world is compared with the spectator's. | Uses the real client code over real sockets instead of a hand-written decoder in the bot. |
