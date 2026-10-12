# Phase 6 Implementation Plan — Lockstep + final verification

**Audience:** the project owner and the agent who implements Phase 6.
**Status:** drafted 2026-10-12 (`log.md` T98), approved by the owner the same day, **implemented 2026-10-12** (T99–T106; deviations in §8, exit checklist in §5). Owner answers folded in:
- the pane's **Rd chip picks how lost bundles are recovered**: off = resend on request (NACK), on = a redundant window (D4);
- the Compare preset is **Full / Lockstep / Lockstep + Rd** (D8);
- **no prediction** of your own player in a lockstep pane (D5);
- the presentation laptop is **another machine**: the agent rehearses here and writes a checklist to repeat there (D12).

**Scope:** `PHASES.md` → Phase 6, items L1–L5. This file says *how* to build them. `PHASES.md` stays the source for *what* and the exit criteria.

---

## 0. Starting point

Checked on 2026-10-12, branch `phase6` at `d1ef4cd` (Phase 5 merged, clean tree).

**Baseline before Phase 6 (T98, Node v26.4.0):** `npm run typecheck` clean; `npm test` **196/196**; `npm run smoke` PASSED (7 steps; delta 33 % of full bytes, ack delay 356 vs 724 ms; the UDP network player passed). Ports free before and after; no processes left; no dependency needed for Phase 6.

**Already in place:**

- **The lab room is a deterministic subset of the game:**
  - Players only move. There is no firing, no bots, no power-ups, and the room is always `RUNNING`.
  - Each tick, the server consumes each player's queued inputs (one, or two when there is a backlog) and applies `stepPlayer(pos, keys, moveCfg)` to each, in order (`server/src/game/room.ts` `tick()`).
  - Movers are a pure function of the tick: `moverPath(pattern, tick / 60)`.
  - Everything else that changes positions is a server-side event: join, leave, nudge (`settlePosition`), RESTART / map (respawn), mover changes.
- **The shared code the client needs to repeat it:** `stepPlayer`, `settlePosition` and `moverPath` are shared and use no trig on the movement path (ASSUMPTIONS #2), so a client repeating the same steps gets the same IEEE doubles. `shared/src/sim/hash.ts` has an FNV-1a hash of doubles.
- **The sync-model plumbing:**
  - per-connection encoders (`shared/src/sync/`, `GameServer.sendSnapshot`);
  - `hello.sync` and the live `sync` message;
  - the client acks snapshots with `snapAck` / `input.sa`;
  - the Compare SYNC chip and `Y`;
  - `PaneMetricsBar`, `CompareDock`, `BandwidthChart`.
- **Presenter Compare script** (C1–C6 = the presets) and `npm run shots`.

**Gaps:**

| # | Gap | Consequence |
|---|---|---|
| G1 | The server never records *which* inputs it consumed per tick | Needed: a per-tick input log (L1). |
| G2 | `SyncEncoder.encode(snap, vel)` works on snapshots | Lockstep sends tick records, not snapshots → a separate path in `GameServer` (D3). |
| G3 | `SYNC_CYCLE` is shared by Quick Match and Compare | Lockstep must be in Compare's cycle only (D1). |
| G4 | No hash over a whole world | Needed for desync detection (D6). |
| G5 | The rehearsal must happen on another laptop (owner) | The agent can rehearse only here → a timing sheet and a checklist for the presentation laptop (D12). |

---

## 1. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **Lockstep is a fourth sync model, `lockstep`, for the lab room only** (Compare), movement only, as `PHASES.md` L1 says. `hello.sync` / `sync` with `lockstep` outside the lab are refused with `error LOCKSTEP_LAB_ONLY`, and the connection keeps its model. Compare's SYNC chip / `Y` cycle: Full → Delta → State 10 → State 30 → **Lockstep**. The Quick Match Lab doesn't offer it (combat, bots and pickups are not in the deterministic subset). Spectators stay on Full. | The lab is the deterministic subset; making the match deterministic is out of scope. |
| D2 | **Server-relayed lockstep.** The server stays the clock and the authority, and it never waits for a player: a late input means that player doesn't move that tick, as today. What it relays is the **input log**: for every tick, the input keys it *consumed* for each player, in order (0, 1 or 2 per player). A client that replays the log with the shared movement code reproduces the server bit for bit. The client **waits (stalls) when the next tick's record hasn't arrived**. That is the lockstep lesson: correctness needs every tick, so one missing tick freezes the whole world. | Peer-to-peer lockstep, where everybody waits for the slowest player, would need peers and a pause protocol; the relay shows the same freeze with the existing server. |
| D3 | **Tick records and keyframes** (`shared/src/sync/lockstep.ts`).<br>A record is `{ k: tick, in: { [playerId]: keys[] }, key?: Keyframe }`.<br>A **keyframe** is the complete lab state at the start of a tick: map, players `{id, name, x, y, life}`, mover patterns. The server attaches one on the tick a connection starts, and on every tick where something *not* driven by relayed inputs changed the world: join, leave, nudge, RESTART / map, mover set. Because keyframes travel *inside* the tick stream, the same recovery (D4) covers them.<br>Messages:<br>• server → client `ls` `{ t, recs: Record[], h?: [tick, hash] }`, every 2 ticks (30 Hz, like snapshots);<br>• client → server: the existing **`snapAck` / `input.sa`** carry the newest *contiguous* tick, plus a new **`lsNack`** `{ from, to }`.<br>The server keeps a ring of the last 256 ticks (≈ 4 s). A client further behind gets a fresh keyframe (a *resync*, counted). | One small message type; the existing ack paths are reused. |
| D4 | **Recovery follows the pane's Rd chip** (owner choice). The chip already controls input redundancy; for a lockstep pane it also sets the sync spec `{ model: 'lockstep', rd: true }`, sent again whenever it changes.<br>• **Rd off — resend on request:** each record is sent once. The client sees a gap (a record newer than the next one it needs) and sends `lsNack` for the missing range. If the gap is still open after 1.5 × RTT, it sends it again. Cost per loss ≈ one round trip of frozen world: head-of-line blocking, as with TCP.<br>• **Rd on — redundant window:** every message repeats every record after the client's ack (at most 60 ticks; beyond that a keyframe). Cost per loss ≈ one send interval (≈ 33 ms), mostly absorbed by the playout buffer. | The owner's choice: one preset shows both the problem and the fix. |
| D5 | **The client: `LockstepClient`** (`client/src/net/lockstep.ts`, headless like `NetClient`). It holds the lab world (players, map, movers) and applies records in order with the shared `stepPlayer` / `settlePosition` / `moverPath`.<br>• **Playout:** one tick per 1000/60 ms of local time, kept `NET.lockstep.bufferTicks` = 2 behind the newest received tick (one send interval, so batching alone never stalls).<br>• **Stall:** if the next tick's record is missing, the world is drawn frozen and the stall is counted.<br>• **Catch-up:** with more than the buffer waiting (after a stall, or server ticks running slightly faster than 60 Hz), it advances up to `maxCatchUpTicks` = 3 ticks per frame. That shows as a brief fast-forward.<br>• **Own player:** **not predicted** (owner). You move when your input comes back in a record, about one round trip + buffer later, so Input → Screen shows the cost. The P / C / I / G chips are greyed out on a lockstep pane, with a tooltip; Rd stays live (D4).<br>Rendering uses the simulated world directly, with no interpolation: it is already 60 Hz. | Pure lockstep, honestly measured; the contrast with Phase 1's prediction is the point. |
| D6 | **Determinism is checked, not assumed.** Every 30 ticks the server sends `h: [tick, hash]`: FNV-1a over every player's `id, x, y` (sorted by id) and every mover's position (`hashWorld` in `shared/src/sim/hash.ts`). The client compares at that tick. A mismatch counts a **desync**, logs it, and asks for a keyframe (a resync), so a bug can't leave a pane wrong for good. Expected: 0 desyncs, always (tests + smoke). | The lesson "lockstep never diverges, it only waits" must be measurable. A silent drift would invalidate the demo. |
| D7 | **Lockstep pane metrics** (`LocalMetrics` + `PaneMetricsBar` + dock):<br>• **Stalled** = % of frames frozen waiting for a tick (last 10 s);<br>• **stalls/s** and the **longest stall** (ms);<br>• **behind** = ticks / ms behind the server's newest tick;<br>• Input → Screen (≈ RTT + buffer);<br>• ↓ kbps (inputs only, tiny);<br>• **resent** ticks (NACK) and **desyncs** (must be 0).<br>On a lockstep pane, corrections and ack delay show "–". The mover metrics still work, and *frozen %* captures the stalls. | The stall counter `PHASES.md` L1 asks for, plus what makes the comparison readable. |
| D8 | **Compare preset `lockstep` — "Snapshot vs Lockstep"** (owner choice): network 50 ms one-way, 5 % random loss; all four movers; no REF pane (3 panes + dock). Each neighbour differs by one setting:<br>• **A** FULL (default toggles);<br>• **B** LOCKSTEP (Rd off);<br>• **C** LOCKSTEP + Rd.<br>Expected: A carries on; B freezes in bursts (stalled ≈ 5–15 %, stalls of ≈ 100–200 ms); C is smooth again but Input → Screen ≈ RTT + 33 ms. ↓ kbps: A ≈ 100+, B / C ≈ 5–10. The numbers are measured during implementation and pinned in `DEMO_SCRIPT.md`. **Presenter — Compare gains C7** = this preset. | One click demonstrates the L3 checkpoint, the fix, and lockstep's bandwidth advantage. |
| D9 | **Server side:**<br>• `Room` keeps the input log for lab rooms: consumed keys per player per tick, plus a `keyframeNeeded` flag raised by join / leave / nudge / restart / map / movers. It also keeps the ring of records (D3).<br>• `GameServer`: lockstep connections get a `LockstepEncoder` (per connection: acked tick, mode, NACK queue) and an `ls` message every 2 ticks instead of a snapshot.<br>• Wire bytes are counted like the other models (`metrics.recordSync('lockstep', …)`). | Keeps `SyncEncoder` for snapshot models untouched. |
| D10 | **Final docs (L4):**<br>• `docs/DEMO_SCRIPT.md` becomes the **final talk track**: Quick Match Q1–Q13, then Compare C1–C7, then §13 (the emulator on its own), each with its timing from D12. The older walkthrough sections stay as reference.<br>• `README.md` (architecture final, Lockstep in the Compare row, commands), `docs/PROTOCOL.md` (`ls`, `lsNack`, the lockstep sync spec, `LOCKSTEP_LAB_ONLY`), `docs/ASSUMPTIONS.md`, `GAMERULES.md` (lab room note), `docs/VISUAL_CHECKLIST.md`, `PHASES.md` (Definition of Done). | `PHASES.md` L4. |
| D11 | **Smoke step 8 and shots.**<br>• **Smoke step 8:** three lab clients through the emulator at 50 ms + 5 % loss — lockstep Rd off, lockstep Rd on, and a direct spectator. Every hash check passes (0 desyncs), each client's world at the hash ticks equals the spectator's snapshot positions, and stalls are > 0 with Rd off and fewer with Rd on.<br>• **Shots:** `compare-lockstep` and `presenter-compare-7`. | The exit criteria need the real sockets too. |
| D12 | **Rehearsal (L5)**, on another laptop (owner choice). The agent does a **dress rehearsal here**:<br>(1) **Fresh-clone cold start:** copy the tracked + new files (`git ls-files -co --exclude-standard`; the work isn't committed yet) into the scratchpad, `npm install` there (project-local; deleted afterwards), then `npm test`, `typecheck`, `smoke`, `shots`. Install and first-start times are timed.<br>(2) **Headless run-through:** a scratch script presses through both Presenter scripts and measures, per step, how long until the expected effect shows (e.g. the Nightmare queue, the lockstep stalls) and the fps. Anything under 55 fps, or with a visible hitch, is investigated and fixed.<br>(3) **`docs/REHEARSAL.md`:** the timing sheet plus a **checklist for the presentation laptop** (Node ≥ 20, Chrome, Vimium exclusion, free ports, firewall prompt, display / UI scale, run order, what to do if something fails), for the owner to repeat there and fill in. | The owner's laptop isn't reachable from here; the checklist makes the real rehearsal quick. |

---

## 2. Design

### 2.1 Shared (`shared/src/`)

| File | Contents |
|---|---|
| `sync/types.ts` | `SyncModel` + `'lockstep'`; `SyncSpec.rd?: boolean` (lockstep only); `COMPARE_SYNC_CYCLE` (with Lockstep) next to `SYNC_CYCLE` (without); `syncLabel` → `LOCKSTEP` / `LOCKSTEP+RD`. |
| `sync/lockstep.ts` | Types `LockstepRecord`, `Keyframe`, `LabWorld`; `applyRecord(world, rec, map)`, the one function the server's records and the client's replay must agree on (the server keeps using its own `tick()`; the tests prove they match); `LockstepEncoder` (ack, mode, NACK queue, window cap, resync). |
| `sim/hash.ts` | `hashWorld(players, movers)`. |
| `protocol/messages.ts` | `MsgLs`, `MsgLsNack`, validators; `hello.sync` / `sync` accept `lockstep` + `rd`. |
| `config/net.{json,ts}` | `lockstep: { bufferTicks: 2, maxCatchUpTicks: 3, ringTicks: 256, windowMaxTicks: 60, hashEveryTicks: 30, nackRetryRtt: 1.5 }`. |

### 2.2 Server

| File | Change |
|---|---|
| `server/src/game/room.ts` | Lab rooms: record consumed keys per player in `tick()`; `markKeyframe()` from join / leave / perturb / restart / map / setMovers; the ring of `LockstepRecord`s; `labKeyframe()`. |
| `server/src/core.ts` | `setSync` accepts lockstep in the lab only (else `LOCKSTEP_LAB_ONLY`); lockstep connections get a `LockstepEncoder`; on `snapAck` / `input.sa` → `encoder.onAck`; `lsNack` → `encoder.onNack`; every 2 ticks the room hands its new records to `GameServer`, which sends `ls` per lockstep connection. |

### 2.3 Client

| File | Change |
|---|---|
| `client/src/net/lockstep.ts` | `LockstepClient` (D5, D6): `receive(msg, now)`, `frame(now)` → world + stall state, `ackTick`, `nacks()`, metrics. |
| `client/src/net/NetClient.ts` | `sync.model === 'lockstep'`: route `ls` to the `LockstepClient`, send acks (`sa`) and `lsNack`, render from it, prediction off for the own player, the D7 metrics. |
| `client/src/compare/presets.ts`, `ui/compare/*` | Preset `lockstep` (D8), SYNC chip cycle, greyed chips, metrics bar / dock columns. |
| `client/src/presenter/scripts.ts` | C7. |

---

## 3. Build order

| Step | log.md | Work | Done when |
|---|---|---|---|
| 1 | T99 | Shared: types, messages + validators, `hashWorld`, `applyRecord`, `LockstepEncoder`, `net.json` | Tests 1–3 pass |
| 2 | T100 | Server: input log, keyframes, ring, lockstep connections, `LOCKSTEP_LAB_ONLY` | Test 4 passes |
| 3 | T101 | Client: `LockstepClient`, `NetClient` integration, metrics | Tests 5–7 (harness) pass |
| 4 | T102 | Compare: preset, cycle, chips, metrics bar / dock; Presenter C7 | Test 8 passes; the preset works in the browser |
| 5 | T103 | Smoke step 8; shots (`compare-lockstep`, `presenter-compare-7`); measure D8's numbers | Smoke and shots pass |
| 6 | T104 | Final docs (L4, D10) | Every doc describes the final state |
| 7 | T105 | Rehearsal (L5, D12): fresh-clone cold start, headless run-through with timings, `docs/REHEARSAL.md`; fix anything that stutters | Timing sheet + checklist written |
| 8 | T106 | Phase exit + Definition of Done (§5) | All checked |

---

## 4. Tests

| # | File | What it checks |
|---|---|---|
| 1 | `tests/lockstep.test.ts` | `applyRecord` reproduces `Room.tick()` exactly. A lab room with 3 players and 4 movers gets 2 000 ticks of random inputs, including backlog ticks with 2 inputs, nudges, joins, leaves and a map switch. A replay of its records from the first keyframe equals the room's positions bit for bit at every tick, and `hashWorld` agrees. |
| 2 | `tests/lockstep.test.ts` | `LockstepEncoder`, Rd off: each record goes once, and a NACK resends exactly the range asked for. Rd on: every message carries everything after the ack, capped at 60 ticks. Too far behind → a keyframe. Acks never move backwards. |
| 3 | `tests/protocol.test.ts` | `ls`, `lsNack`, `sync` / `hello` with `lockstep` + `rd`: validators accept the good ones and reject the bad ones. |
| 4 | `tests/rules.test.ts` or `lockstep.test.ts` | Server: lockstep in the main room → `LOCKSTEP_LAB_ONLY` and the model is unchanged. In the lab, the records equal the consumed inputs (`lastConsumedSeq` follows), and keyframes appear on join / leave / perturb / restart / map / movers. |
| 5 | `tests/netcode.test.ts` | **L2: bit-identical under loss.** Real `GameServer` + `NetClient`s + emulator `Pipeline`, fake timers. Two lockstep clients (Rd off and on) at 50 ms, plus 5 % random and 10 % burst loss with duplication and reordering. Both stall (Rd off more) but their worlds equal the spectator's at every hash tick, and there are 0 desyncs. |
| 6 | `tests/netcode.test.ts` | Recovery: a 2 s outage → resync by keyframe, then identical again. A RESTART and a map switch mid-stream → keyframes, still identical. |
| 7 | `tests/netcode.test.ts` | Clean link: 0 stalls after start-up, behind ≈ buffer + one-way delay, the own player moves ≈ RTT + buffer after the key (no prediction). |
| 8 | `tests/compare.test.ts`, `tests/presenter.test.ts` | Preset `lockstep`: 3 panes, neighbours differ in one setting, network 50 ms + 5 %. The Compare cycle includes Lockstep and the Quick Match one doesn't. C7 = the preset. |
| — | `npm run smoke` | Step 8 (D11). |
| — | `npm run shots` | The new screens; the visual checklist rows. |

---

## 5. Exit checklist

- [x] `npm test` (222), `npm run typecheck`, `npm run smoke` (8 steps), `npm run shots` (25 screens × 2) pass.
- [x] **L3 demo:** the Snapshot vs Lockstep preset shows A carrying on, B freezing in bursts (stalled ≈ 15–30 %, freezes up to ≈ 300–650 ms), C smooth (≈ 3–5 %) with Input → Screen ≈ 200–215 ms. Numbers in `DEMO_SCRIPT.md` §14.
- [x] 0 desyncs in every test, the smoke test and the browser checks (after X1).
- [x] Final docs (D10). `DEMO_SCRIPT.md` opens with the final talk track and its timings.
- [x] Rehearsal (D12): the fresh-copy cold start passed; timing sheet + presentation-laptop checklist in `docs/REHEARSAL.md`; every step at ≈ 60 fps, the two single long frames explained (a Compare pane created / removed at a step change).
- [x] `PHASES.md` Definition of Done ticked as far as this machine can prove. The presentation-laptop rehearsal (`docs/REHEARSAL.md` §3–§4) is the owner's last box.
- [x] No processes left; TCP 5173/8080/9000/9001 and UDP 8081/9100 free; the fresh copy deleted; no new dependency. Suggested tag: `phase-6`.

## 6. Risks

| Risk | Mitigation |
|---|---|
| Browser and Node compute different doubles | Same operations in the same order through one shared function; no trig on the path; the hash check (D6) turns any drift into a visible desync with automatic resync; test 1 pins the server ≡ replay equality. |
| The server ticks slightly faster than 60 Hz (the hybrid loop catches up) | Catch-up of up to 3 ticks per frame keeps the buffer at 2. This is counted as catch-up, not as stalls. |
| Keyframes for every join / leave make the stream heavy | Lab joins are rare (pane changes). A keyframe is ≈ 100–300 B. Measured in the smoke test. |
| The freezes at 5 % loss are too short to see | Rd off costs a full round trip per loss (≈ 100+ ms at 50 ms one-way). If they're still subtle in the browser check, the preset goes to 75 ms (asked, not silently changed). |
| The fresh-clone install needs the network | `npm install` is served from the npm cache when possible; the copy is deleted afterwards. If it needs downloads, they go into the copy only. |
| Rehearsal numbers differ on the presentation laptop | `docs/REHEARSAL.md` lists what to measure there and the acceptable ranges. |

## 7. Not in Phase 6

- Lockstep in Quick Match (combat, bots and pickups are not deterministic-replayable today).
- Peer-to-peer lockstep, rollback netcode (GGPO-style).
- Phase 7 (multiplayer readiness) items.

## 8. Deviations from this plan

| # | Deviation | Why |
|---|---|---|
| X1 | **Deterministic sine / cosine for the movers** (`shared/src/sim/dtrig.ts`), and `Math.sqrt` instead of `Math.hypot` in their paths. Not in the plan. | The first browser check showed 1 desync per lockstep pane: Chrome and Node 26 differ in the last bit of `Math.cos` / `Math.sin` for ≈ 3.4 % of the circle drone's angles (risk 1 in §6, which assumed "no trig on the path" — true for players, not for movers). The hash check did exactly its job. After the fix: 0 of 400 000 values differ between the engines, 0 desyncs. |
| X2 | **The hash rides on the record** (`h` on every 30th tick's record), not on the message (`ls.h: [tick, hash]`). The message field `t` is called `tick` (`t` is the message type). | A hash on the record is recovered with it (NACK or window); one on the message would be lost with it. |
| X3 | **The base keyframe repeats until acknowledged in both modes**, and a key request resets the server's ack (stale acks from before it don't count). | Simpler and safer than NACKing a lost start: a lost base costs one send interval. |
| X4 | **Lockstep bytes ≈ 35–40 kbps (Rd off) and ≈ 90–120 kbps (Rd on)**, not the planned 5–10 kbps. | JSON records + 28 B per message at 30 Hz; still ≈ 1/10 of full snapshots. A binary encoding was not needed for the demo (`docs/ASSUMPTIONS.md` #105). |
| X5 | **Stalls at 5 % loss are larger than planned** (≈ 15–30 % of frames, freezes up to ≈ 400 ms, vs the planned 5–15 % and 100–200 ms). The 75 ms fallback (risk 4) was not needed. | One loss costs a full NACK round trip (send interval + RTT + resend interval); bursts of two losses chain. Clearly visible, which is the point. |
| X6 | **Rehearsal: `npm run shots` ran in the working tree, not in the fresh copy.** The fresh copy ran install, tests, typecheck, smoke and the timed Presenter run-through in Chrome (which starts the demo from that copy). | The run-through already exercised the cold demo in a browser; shots (≈ 12 min for both viewports) then ran once, in the tree being committed. |
| X7 | **Talk order: network players start at Q13** (`npm run swarm -- --n 3` in a second terminal), no longer with the demo. | Found by the rehearsal: started with the demo they grow the match (full ≈ 816 vs ≈ 475 kbps), and under Nightmare Delta then stays at the cap (Q11 ack ≈ 720 instead of ≈ 330 ms). The Q13 hint, README and DEMO_SCRIPT say so (`docs/REHEARSAL.md` §1.2). |
| X8 | **Compare pane toggles go through `NetClient.setToggles`** (they were assigned directly). | Needed so the Rd chip also switches a lockstep pane's recovery on the server; found while wiring D4. |
