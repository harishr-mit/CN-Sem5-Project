# NoBu Shooter — Build Specification

**Audience:** the implementing agent. Read this file and `GAMERULES.md` completely before writing code.

- `GAMERULES.md` is the single source of truth for gameplay rules and game constants (`game.json`).
- This file is the single source of truth for architecture, protocol, netcode, emulator, metrics and UI (and `net.json`, Appendix A).
- Do not restate rules in code comments or docs; reference these two files.

---

## 1. Mission

NoBu Shooter is a **demo**. It is a small 2D multiplayer arena shooter whose real purpose is to show three things clearly, live, in under 60 seconds:

1. **Client-side prediction and server reconciliation.** The local player moves instantly while the server stays authoritative. When prediction and server disagree, the correction is visible, measurable and explained.
2. **A standalone network emulator.** Latency, jitter, packet loss, bandwidth limits, duplication and reordering can be turned on and off live from the UI, and their effect on the game is obvious.
3. **A first impression that looks impressive.** A person who opens the page must think "this looks great" before they read anything.

The networking is the point. The game only exists to make the networking visible. The UI is part of the deliverable, not decoration.

### Non-goals (do not build)

Experiment-sweep runner, CSV/JSON sweep pipelines, Wireshark integration or documentation, Python, pytest, Electron, raw UDP (only the optional P2 adapter in §2), TCP-vs-UDP comparison, matchmaking, accounts, persistence, lag compensation, predicted projectiles, delta compression, binary protocol, anti-cheat beyond §9.5, mobile or touch support.

---

## 2. Priorities

If time or budget runs short, drop P2 first, then P1 from the bottom. **Never drop P0.**

**P0 — must exist**
- Shared deterministic simulation; authoritative server; the full protocol in §8
- Client-side prediction and server reconciliation, with error smoothing
- Snapshot interpolation of remote entities
- Input redundancy (toggleable) and sequence/ack handling for duplicate, stale and reordered packets
- Handshake with retry, heartbeat, timeouts
- Perturb button (forces a visible correction)
- Complete game rules from `GAMERULES.md`, including bots
- Standalone emulator with latency, jitter, loss, bandwidth, duplication, reordering, live control API, stats stream and packet-event stream
- Network Lab panel: sliders, presets, toggles, live metrics, sparklines
- Packet-flow strip, ghost overlay, landing screen, HUD, overlays, visual effects (§13)
- `npm run demo` one-command startup; core tests (§14)

**P1**
- A/B compare mode (§13.8)
- Packet inspector drawer (§13.7)
- Burst-loss model
- Per-session emulator targeting in the UI
- Client reconnect flow
- Playwright screenshot checks

**P2**
- UDP adapter for the emulator (the pipeline is already transport-agnostic)
- "Export metrics" button (JSON/CSV of the last 5 minutes)
- Sound effects (WebAudio synth, mute toggle)
- Interpolation-delay slider
- `?direct=1` bypass of the emulator

---

## 3. Working rules for the agent

1. **Do not ask questions.** When something is unclear, choose the simplest option consistent with this spec, and record it as one line in `docs/ASSUMPTIONS.md`.
2. **Follow the build order in §6.** The demo must run (`npm run demo`) at the end of every milestone. Run `npm test` and `npm run smoke` at every milestone.
3. **Reserve real effort for the UI.** M1 already includes a styled shell. M5 must get at least a third of the total effort.
4. **No network access at runtime.** No CDNs, no remote fonts, no remote images. Bundle fonts with `@fontsource/*`. Generate every graphic procedurally (Phaser Graphics / canvas). Pin exact dependency versions.
5. **Verify visually.** If Playwright and a browser are available, take screenshots (landing, in-game, Lab panel with an active preset, A/B mode) and check them against the acceptance list in §13.9. If not available, state that in the final message and do the checklist by review.
6. **Do not build non-goals.** Do not widen scope when ahead of schedule; spend the time on polish and tests.
7. **Final message:** what was built, how to run it (3 commands max), what was cut and why, and the contents of `docs/ASSUMPTIONS.md`.

---

## 4. Locked decisions

| Topic | Decision | Reason |
|---|---|---|
| Language / repo | TypeScript (strict), Node ≥ 20, ES modules, npm workspaces monorepo | Client and server must run the *same* movement code. Two languages would create phantom prediction errors. |
| Client | Browser app: Vite + Phaser 3 (WebGL) for the arena, React 18 + zustand for panels | Zero install for the viewer; best visual result for the effort |
| Server | Node + `ws` | Shares `shared/sim` with the client |
| Emulator | Node + `ws`, game-agnostic: forwards opaque messages | Reusable; no game knowledge |
| Transport | WebSocket text frames carrying one JSON message each. **Each frame is treated as a datagram by the emulator.** The client and server talk through a `Transport` interface so that a UDP transport can replace it. | A browser cannot open UDP sockets. See the caveat below. |
| Simulation | Fixed timestep, 60 Hz, one input = one step | Makes reconciliation replay well-defined (§7) |
| Snapshots | 30 Hz, state-based, one per client | Smooth enough with interpolation; bandwidth is visibly affected by the emulator |
| Protocol | JSON, readable keys for snapshots, short keys for inputs | Easy to debug; inputs are the hot upstream path |
| Tests | vitest (plus Playwright, P1) | One toolchain |
| Ports | client 5173, server 8080, emulator data 9000, emulator control 9001 | Fixed so scripts and docs agree |

**Transport caveat (state this in the Network Lab "About" tooltip and in `docs/PROTOCOL.md`).** The links between browser, emulator and server are loopback TCP connections, which never lose packets themselves. The emulator is the **only** place where messages are dropped, delayed, duplicated or reordered, and it does so *per message* before forwarding, so the application observes UDP-like behavior. Head-of-line blocking from a real TCP link is intentionally absent.

---

## 5. Repository layout and commands

```text
nobu-shooter/
├── package.json                 npm workspaces: shared, server, emulator, client
├── README.md                    short, human-facing
├── SPEC.md  GAMERULES.md
├── shared/src/
│   ├── config/    game.json  net.json  (copied verbatim from GAMERULES.md §15 and Appendix A)
│   ├── sim/       movement.ts  geometry.ts  prng.ts  hash.ts     (pure, deterministic)
│   └── protocol/  messages.ts  codec.ts                          (types + encode/decode + validation)
├── server/src/    main.ts  room.ts  game/  bots.ts  net/  metrics.ts
├── emulator/src/  main.ts  pipeline.ts  session.ts  control.ts  adapters/ws.ts
├── client/src/    main.tsx  net/  game/  ui/  styles/
├── scripts/       demo.mjs  smoke.mjs  headless-bot.mjs
├── tests/         (or per-workspace __tests__)
└── docs/          PROTOCOL.md  DEMO_SCRIPT.md  ASSUMPTIONS.md
```

Commands that must work from the repository root after `npm install`:

| Command | Effect |
|---|---|
| `npm run demo` | Starts server, emulator and client dev server; prints the URL |
| `npm test` | Runs all vitest suites |
| `npm run smoke` | Runs the headless bot through the emulator for 10 s and asserts basic health (§14) |

The emulator CLI: `node emulator --listen 9000 --target ws://127.0.0.1:8080 --control 9001 --seed 1`.

---

## 6. Build order and checkpoints

Build vertically. The core networking concept must work end-to-end before the full game exists.

| Milestone | Scope | Checkpoint (must pass before moving on) |
|---|---|---|
| **M0 Scaffold** | Workspaces, scripts, `game.json`, `net.json`, `shared/sim` skeleton, `Transport` interface, lint/format | `npm install && npm test` passes (even if few tests) |
| **M1 Vertical slice (P0)** | Server: hello/welcome/input/snap/ping/pong, one room, players move in the arena with obstacles. Emulator: latency + loss + minimal control API. Client: Phaser arena, prediction + reconciliation, ghost overlay, RTT/corrections readout, **styled shell** (dark theme, fonts, Lab panel with latency/loss sliders) | Open the page, move with WASD, drag the latency slider to 200 ms: own player still moves instantly, ghost lags behind. Sim determinism and reconciliation tests pass. |
| **M2 Game** | Projectiles, hits, death, respawn, scoring, match state machine, bots, multiple clients, scoreboard | Two browser tabs plus bots play a full match; rules tests pass |
| **M3 Emulator complete** | Jitter, bandwidth, duplication, reordering, burst loss (P1), per-session targets, stats stream, packet events | Emulator unit tests pass; Lab shows live loss/throughput numbers that match the configured values |
| **M4 Netcode complete** | Interpolation, redundancy, all toggles (§10.6), event redundancy, error smoothing, perturb, heartbeats, timeouts, reconnect (P1) | Under the "Nightmare" preset the game stays playable and corrections are visible (redundancy defaults off); switching redundancy on makes them largely disappear |
| **M5 UI and Network Lab** | Full art direction (§13), packet-flow strip, landing screen, HUD, overlays, FX, presets, all metrics tiles and sparklines | Screenshot review against §13.9 |
| **M6 P1/P2 extras** | A/B compare, packet inspector, others by priority | Features work in the demo |
| **M7 Docs and verification** | `docs/PROTOCOL.md`, `docs/DEMO_SCRIPT.md`, `docs/ASSUMPTIONS.md`, Definition of Done (§15) | Every checkbox in §15 verified |

---

## 7. Shared simulation (`shared/src/sim`)

This code runs identically on the client (prediction) and the server (authority). It must be **pure and deterministic**:

- no `Math.random`, `Date.now`, DOM or Node APIs; randomness comes from a seeded PRNG (`mulberry32`) passed in;
- movement uses only `+ − × ÷`, `Math.sqrt` and the constant `Math.SQRT1_2`. **No trig in the movement path** (aim is never used by predicted state; it is only used by the server to spawn projectiles);
- floating-point `number` (float64) everywhere. Never round positions in state or in snapshots; JSON round-trips doubles exactly.

### 7.1 Time step

`dt = 1 / sim.hz = 1/60`. **One input equals exactly one `stepPlayer` call.** The client generates one input per 60 Hz step; the server consumes inputs one per tick (§9.3). Server state therefore depends only on *which inputs were consumed in which order*, not on wall-clock timing.

### 7.2 `stepPlayer(pos, keys, cfg) → pos`

Key bitmask: `up = 1, down = 2, left = 4, right = 8`.

```text
dirX = (right ? 1 : 0) - (left ? 1 : 0)
dirY = (down  ? 1 : 0) - (up   ? 1 : 0)
if dirX != 0 and dirY != 0: dirX *= SQRT1_2; dirY *= SQRT1_2
x += dirX * speed * dt;  resolveObstacles(x, y);  clampToArena(x, y)
y += dirY * speed * dt;  resolveObstacles(x, y);  clampToArena(x, y)
```

`resolveObstacles`: iterate obstacles in array order; for each rectangle find the closest point `c` on the rectangle to the circle center `p`. If `|p − c| < radius`: when `|p − c| > 0` push the center out along `(p − c)/|p − c|` by `radius − |p − c|`; when the center is inside the rectangle push it out along the axis of least penetration. Make two passes over the obstacle list.

### 7.3 Golden vectors

`hash.ts` provides `hashState(x, y)`. A test runs a scripted 600-input sequence (including wall and corner contacts) and compares the final position to a stored golden value. Any later change to movement must update the golden value deliberately.

---

## 8. Wire protocol

All messages are JSON text frames, one message per frame, with a type field `t`. Define every type in `shared/src/protocol/messages.ts` with a validator; the server and emulator tolerate unknown fields and reject malformed messages without crashing. Generate `docs/PROTOCOL.md` from these definitions.

### 8.1 Client → server

| Message | Fields | Notes |
|---|---|---|
| `hello` | `v: 1`, `name`, `room: "main" \| "lab"`, `nonce` | Resent every 250 ms until `welcome` arrives (loss-tolerant handshake). The server answers a repeated `nonce` with the same `welcome`. |
| `input` | `inputs: [{ s, k, a, f }]` | `s` = sequence (integer, +1 per input), `k` = key bitmask, `a` = aim angle in radians **quantized to 0.001 before use on both sides**, `f` = fire flag (0/1). Contains the inputs to send per §10.3. |
| `ping` | `id`, `ct` | `ct` = client time in ms |
| `perturb` | `dx`, `dy` | Debug only (`debug.allowPerturb`). Teleports the player's **server** position by `(dx, dy)` with collision resolution, causing a real misprediction. |
| `bye` | — | Clean disconnect |

### 8.2 Server → client

| Message | Fields |
|---|---|
| `welcome` | `v`, `playerId`, `room`, `simHz`, `snapshotHz`, `serverTime`, `nonce` |
| `snap` | See §8.3 |
| `pong` | `id`, `ct` (echoed), `st` (server time, ms), `tickHz`, `tickMs` (avg tick processing time), `tickMsMax` |
| `error` | `code` (`ROOM_FULL`, `BAD_VERSION`, `BAD_MESSAGE`), `msg` |

### 8.3 Snapshot

The server builds one world snapshot per snapshot interval and sends each client a copy with that client's own `ack`.

```json
{
  "t": "snap",
  "tick": 12345,
  "st": 205750.2,
  "ack": 8812,
  "match": { "state": "RUNNING", "timeLeftMs": 133400, "results": null },
  "players": [
    { "id": 3, "name": "NOVA", "bot": true, "x": 412.5, "y": 220.0,
      "alive": true, "life": 4, "protectMs": 0, "respawnMs": 0, "score": 5 }
  ],
  "projectiles": [ { "id": 77, "owner": 3, "x": 500.0, "y": 220.0, "dx": 1, "dy": 0 } ],
  "events": [ { "eid": 991, "type": "PLAYER_DEATH", "tick": 12340, "victim": 5, "killer": 3, "x": 300, "y": 120 } ]
}
```

- `tick` is monotonic. Clients **ignore any snapshot whose `tick` is not newer** than the latest applied (this handles reordered and duplicated snapshots).
- `ack` is the highest input sequence the server has consumed for *this* client.
- `results` is `null` except during `ENDED`: `{ "scoreboard": [{ "id", "name", "score", "left" }], "winners": [ids] }`.
- **State is authoritative; events are cosmetic.** Scores, alive/dead, respawn and match state are always in the state fields, so a client that lost packets still ends up correct. Events drive only VFX, the kill feed and sound.
- Each snapshot repeats all events from the last `eventRedundancyMs` (500 ms). Each event has a unique `eid`; clients de-duplicate by `eid`.
- Event types: `PLAYER_JOIN, PLAYER_LEAVE, PLAYER_FIRE, PROJECTILE_SPAWN, PROJECTILE_HIT, PLAYER_DEATH, PLAYER_RESPAWN, SCORE_UPDATE, MATCH_START, MATCH_END`. (`PLAYER_INPUT` and `PLAYER_MOVE` exist as server-side counters in metrics only; they are not sent on the wire.) `PROJECTILE_HIT` carries `target: "player" | "obstacle" | "boundary"` and the impact `x, y`.

### 8.4 Sizes

Expected: input message ≈ 33 bytes per input; snapshot with 8 players ≈ 1.3 KB. The UI shows measured bandwidth so that the bandwidth limiter has a visible effect.

---

## 9. Server

### 9.1 Loop

A fixed-timestep loop with a drift-corrected accumulator based on `process.hrtime.bigint()`, targeting 60 ticks/s. If the loop falls more than 5 ticks behind, skip ahead and count a `tickOverrun`. Track achieved tick rate and per-tick processing time (average and max over 1 s); report both in `pong`.

Each tick runs in this order:

1. bots generate inputs (same format as human inputs),
2. consume inputs (§9.3) and apply `stepPlayer`, fire handling (`GAMERULES.md` §6),
3. step projectiles with swept collision (`GAMERULES.md` §7),
4. process deaths and scores,
5. decrement cooldowns, respawn and protection timers; process respawns,
6. advance the match state machine,
7. every `sim.hz / snapshotHz` ticks (every 2nd tick) send snapshots.

### 9.2 Connections

- A connection becomes a player on the first valid `hello`. The server sends `welcome`.
- A connection with no message for `timeoutMs` (5 s) is removed (`PLAYER_LEAVE`).
- Bad version, full room or malformed message → `error`. The server never crashes on bad input.

### 9.3 Input handling (the rules that make reconciliation correct)

Each human player has an input queue keyed by `s`, and a `lastConsumed` sequence number.

- **Duplicate or stale** (`s <= lastConsumed`): ignore.
- **Gaps are allowed.** If `s = 5` never arrives, the server consumes `6` after `4` and sets `lastConsumed = 6`. This is the realistic source of misprediction under packet loss.
- **Out of order:** keep the queue sorted by `s`; consume in ascending order. An input that arrives *after* a higher sequence number has already been consumed is stale and is discarded. Consequently, **reordering behaves like loss** when input redundancy is off (the late packet's inputs are discarded), and is harmless when it is on (later packets repeat those inputs). **Duplication is always harmless.**
- **One input per tick per player.** If the queue is empty, the player does nothing that tick (no repeating of the last input).
- **Backlog catch-up:** if the queue holds more than `inputBacklogCatchup.threshold` (3) inputs, consume up to `inputBacklogCatchup.maxPerTick` (2) this tick. Never more.
- Inputs of dead players, or in states other than `RUNNING`, are consumed (so `ack` advances) but have no effect.
- `ack` in the next snapshot is the player's `lastConsumed`.

Result: with no loss, server position after consuming sequence `n` equals the client's predicted position after input `n` exactly, so baseline prediction error is zero.

### 9.4 Rooms, bots and rules

Implement `GAMERULES.md` §2–§12 exactly. Rooms are independent objects (`main` and `lab`); each connection chooses a room in `hello`.

### 9.5 Input sanity

The only anti-abuse measures are: one input per tick (plus bounded catch-up), the server-enforced fire cooldown, a maximum of 20 inputs per message, name sanitizing, and rate limiting to 120 messages/s per connection (excess dropped). Nothing more is required.

### 9.6 Logging and metrics

Typed server events (the ten wire events in §8.3 plus `PLAYER_INPUT` and `PLAYER_MOVE`, twelve in total) are counted in `metrics.ts` and logged at debug level. Log connections, state changes and errors at info level. No per-tick logging.

---

## 10. Client netcode (`client/src/net`, `client/src/game`)

### 10.1 Structure

- `NetClient`: owns the `Transport`, handshake, heartbeat, input generation, prediction, reconciliation, snapshot buffer, clock estimation and metrics. It has **no Phaser or React dependency** so it can be driven by the headless bot and by tests.
- Phaser scenes read from `NetClient` each frame. React panels read from a zustand store updated at 5 Hz.
- The sim loop is a fixed 60 Hz accumulator independent of render FPS. The rendered local position interpolates between the previous and current predicted position for smoothness on high-refresh displays.

### 10.2 Input generation

Each sim step the client samples keys, aim (angle from the *predicted* player position to the cursor, quantized to 0.001) and the fire button, then creates input `{ s: ++seq, k, a, f }`. It appends it to the **pending list** and, if prediction is on, immediately calls `stepPlayer`.

The client does not predict movement when the latest snapshot says the player is dead or the match state is not `RUNNING`.

### 10.3 Sending

Every `1 / inputSendHz` (30 Hz), send one `input` message:

- redundancy **on**: all pending (unacknowledged) inputs, newest last, at most `redundancyMax` (10);
- redundancy **off**: only inputs created since the last send.

Redundancy is the standard defence against input loss and reordering. **It defaults to OFF (`redundancyDefault: false` in `net.json`) on purpose.** The demo's subject is reconciliation, and redundancy masks input loss almost completely: in a prototype of these exact rules, corrections stayed at 0 even at 30 % loss with redundancy on, while 10 % loss with it off produced ~46 corrections in 20 s (average error ≈ 7 px). With the default off, loss and reordering visibly cause corrections; switching redundancy on is the demonstrable "fix".

### 10.4 Reconciliation (on every accepted snapshot)

```text
1. let me = snapshot.players[myId]
2. if me.life != lastLife: HARD RESET to (me.x, me.y), clear pending inputs,
   zero the smoothing offset, do NOT count it as a correction. (Respawn teleport.)
3. drop pending inputs with s <= snapshot.ack
4. before = current predicted position (head of prediction)
5. state = (me.x, me.y); for each remaining pending input: state = stepPlayer(state, input.k)
6. error = distance(before, state)
7. if error > reconcile.epsilonPx (0.01): count a correction; record error (px)
8. if error >= reconcile.snapThresholdPx (64): snap. else: smoothOffset += (before - state)
9. predicted = state; the smoothing offset decays exponentially with half-life smoothHalfLifeMs (80 ms)
   and is added to the rendered position only
```

Position rendered for the local player = `predicted + smoothOffset` (and the ghost, §13.4, shows the unsmoothed authoritative position).

### 10.5 Interpolation of remote entities

- Maintain a buffer (last 32 snapshots) of `{ st, players, projectiles }`.
- **Clock:** `clockOffset` is an exponential moving average (factor `clockSmoothing`, 0.05) of `snap.st − localArrivalTime`. `renderServerTime = localNow + clockOffset − interpDelayMs` (100 ms). If `renderServerTime` falls outside the buffer by more than 200 ms, reset the offset.
- Each remote player and projectile is rendered by interpolating linearly between the two snapshots surrounding `renderServerTime`. If only older samples exist, extrapolate by at most 100 ms and then freeze. An entity first seen in a snapshot newer than `renderServerTime` is not drawn until the render time reaches it.
- Alive/dead, score and match state use the **latest** snapshot (not interpolated).

### 10.6 Toggles (runtime, from the Lab panel)

| Toggle | Default | Behavior |
|---|---|---|
| Prediction | on | When **off**, the local player is rendered exactly like a remote player (via the snapshot buffer). Input lag becomes visible. |
| Reconciliation | on (needs prediction) | When **off**, predicted state is never replaced by the server state (except on `life` change). Divergence grows when inputs are lost; the ghost drifts away. |
| Interpolation | on | When **off**, remote entities are drawn at the latest snapshot position (stepped movement). |
| Input redundancy | **off** | When **on**, unacknowledged inputs are resent (§10.3). Corrections caused by loss and reordering largely disappear. |
| Ghost overlay | on | When off, the server-position ghost is hidden. |

Error smoothing is always on.

### 10.7 Handshake, heartbeat, reconnect

- Send `hello` every 250 ms until `welcome`; after 10 s show "Cannot reach server" with the hint to run `npm run demo`.
- Send `ping` every 500 ms. RTT = `now − ct` on `pong`. Jitter = mean absolute difference between consecutive RTT samples over the metrics window.
- If nothing is received for 5 s, show "Connection lost — reconnecting…" and (P1) re-run the handshake. The reconnecting client is a new player.

### 10.8 Fire feedback

No predicted projectiles. The client shows an instant local muzzle flash and recoil when firing is locally allowed (alive, `RUNNING`, local 300 ms cooldown elapsed). The projectile itself, hit effects, deaths and scores come from the server.

---

## 11. Network emulator (`emulator/`)

A separate process with **no game knowledge**. It treats each message as an opaque packet.

### 11.1 Architecture

- **Data port (9000):** accepts WebSocket connections. Each connection is a **session**; the emulator opens an upstream WebSocket to `--target` and forwards messages in both directions. The query parameter `?label=` is stored as an opaque display name.
- **Control port (9001):** a separate WebSocket that is **never impaired**. The UI talks to it (§11.4).
- The impairment **pipeline** (§11.2) is a pure module that works on `Packet { data, size }` and an injected `Clock` (`now()`, `setTimer()`) and a seeded RNG. A WebSocket adapter feeds it; a UDP adapter (P2) could feed it unchanged.
- Direction names: `up` = client → server, `down` = server → client. Each session has an independent `LinkConfig` per direction. The UI exposes both directions at once by default.

### 11.2 `LinkConfig` and pipeline

```ts
interface LinkConfig {
  latencyMs: number;            // one-way delay, default 0
  jitterMs: number;             // default 0
  jitterDist: "normal" | "uniform";  // normal: sigma = jitterMs; uniform: +/- jitterMs. Default "normal"
  lossPct: number;              // default 0
  lossModel: "random" | "burst";// default "random"
  burstLen: number;             // mean burst length in packets (burst model), default 4
  duplicatePct: number;         // default 0
  reorderPct: number;           // default 0
  reorderDelayMs: number;       // extra delay for reordered packets, default 40
  bandwidthKbps: number;        // 0 = unlimited
  queueLimitMs: number;         // max queueing delay before tail drop, default 400
  allowJitterReorder: boolean;  // default false
}
```

The pipeline, per packet, in this order (size = payload bytes + 28 header bytes, to resemble UDP/IP):

```text
1. LOSS        random: drop with probability lossPct. burst (Gilbert-Elliott): two states; in the
               bad state drop everything. P(bad->good) = 1/burstLen,
               P(good->bad) = p * P(bad->good) / (1 - p) with p = lossPct/100.
               Emit fate "dropped-loss".
2. DUPLICATE   with probability duplicatePct create a second copy; every copy continues independently.
3. BANDWIDTH   if bandwidthKbps > 0: FIFO link. start = max(now, link.freeAt);
               if start - now > queueLimitMs: drop (fate "dropped-queue");
               else depart = start + size*8 / (bandwidthKbps*1000) s; link.freeAt = depart.
               (No sleeping; compute departure times.)
4. DELAY       release = depart + max(0, latencyMs + jitterSample)
5. ORDERING    if the packet is selected for reordering (probability reorderPct):
                   release += reorderDelayMs; exempt from step-6 clamp; does not update lastRelease.
               else if !allowJitterReorder: release = max(release, link.lastRelease); link.lastRelease = release
6. SCHEDULE    deliver at `release` using the injected clock.
```

Jitter alone therefore never reorders packets unless `allowJitterReorder` is on. Reordering is its own, explicit impairment.

### 11.3 Statistics

Per session and direction, computed over a rolling 1 s window and cumulatively: packets in, delivered, dropped (loss), dropped (queue), duplicated, **reordered** (delivered packets whose arrival index is lower than the highest already delivered), bytes, throughput (kbps), mean applied delay (ms), current queue delay (ms). Loss % = dropped / in.

### 11.4 Control API (JSON over WebSocket on the control port)

UI → emulator:

| Message | Meaning |
|---|---|
| `{cmd:"get"}` | Reply with a `state` message |
| `{cmd:"set", target, direction, patch}` | Merge `patch` into `LinkConfig`. `target` = `"all"` (also the default for future sessions), a session id, or a label. `direction` = `"both" \| "up" \| "down"`. |
| `{cmd:"preset", target, name}` | Apply a preset (§11.5) |
| `{cmd:"reset", target}` | Back to zero impairment |
| `{cmd:"seed", value}` | Reseed the RNG |
| `{cmd:"subscribe", packets: boolean}` | Start/stop the packet-event stream |

Emulator → UI:

| Message | When |
|---|---|
| `{evt:"state", sessions:[{id,label,up,down}], defaults, presets}` | On connect and on every change |
| `{evt:"stats", t, sessions:[{id, up:{...}, down:{...}}]}` | Every 500 ms |
| `{evt:"packets", items:[{sid, dir, size, preview, fate, delayMs, t}]}` | Every 100 ms while subscribed; at most 60 items per batch (sampled). `fate` is `delivered`, `dropped-loss`, `dropped-queue` or `duplicated`. `preview` is the first 64 characters of the payload. |

Changes apply **live**: already-scheduled packets keep their release times; new packets use the new config. A new session inherits the `defaults` set by `target:"all"`.

### 11.5 Presets (one-way values, applied to both directions)

| Name | Latency | Jitter | Loss | Dup | Reorder | Bandwidth |
|---|---|---|---|---|---|---|
| Baseline | 0 | 0 | 0 % | 0 % | 0 % | unlimited |
| Café Wi-Fi | 25 ms | 15 ms | 1 % | 0 % | 0 % | unlimited |
| Mobile 4G | 45 ms | 25 ms | 2 % | 0 % | 0 % | 5000 kbps |
| Transatlantic | 90 ms | 8 ms | 0.5 % | 0 % | 0 % | unlimited |
| Nightmare | 120 ms | 50 ms | 12 % (burst, len 4) | 3 % | 5 % | 400 kbps |

The UI labels the latency slider "One-way latency" and shows "Expected RTT ≈ 2 × latency + processing".

### 11.6 Determinism

The RNG is `mulberry32(seed)`. With a fixed seed and a fixed virtual clock the pipeline output is reproducible; tests rely on this.

---

## 12. Metrics

Shown live in the Network Lab (§13.5), sampled at 5 Hz and averaged over `metricsWindowMs` (10 s) where noted.

| Metric | Measured by | Definition |
|---|---|---|
| RTT | client | `now − ct` from `ping`/`pong` (includes emulator delay and server processing) |
| Jitter | client | Mean absolute difference between consecutive RTT samples |
| Loss ↑ / ↓ | **emulator** (ground truth) | `dropped / in` per direction for this session. The client additionally shows `snapshots missed` from `tick` gaps. |
| Snapshot rate | client | Accepted snapshots per second |
| Bandwidth ↑ / ↓ | client | Bytes of sent/received messages per second, in kbps |
| Pending inputs | client | Inputs created but not yet acknowledged |
| Corrections / s | client | Reconciliations with `error > epsilonPx` per second (excluding `life` resets) |
| Last / avg / max error | client | Prediction error in px (§10.4 step 6) |
| Input → Screen (ms) | client | With prediction on: time from the input sample to the next render (≈ one sim step plus one frame). With prediction off: time from input creation to the first snapshot whose `ack` covers it plus the interpolation delay. Shown beside the *Ack delay* (creation → ack), which is the same in both modes. |
| Server tick Hz / ms | server (in `pong`) | Achieved tick rate; average and max tick processing time |
| Duplicates / reorders seen | client | Stale or duplicated snapshots ignored; out-of-order snapshots ignored |
| Game events | server counters | Shots, hits, deaths, respawns (shown in the kill feed; counters in the debug view) |

An optional "Export metrics" button (P2) saves the last 5 minutes of the 5 Hz samples as JSON and CSV. No other export is required.

---

## 13. UI and art direction

The UI is a primary deliverable. It must look **polished, cohesive and "game-like"**, not like a developer tool.

### 13.1 Look

- **Theme:** dark neon / synthwave-Tron. Page background `#07070f`. A faint grid floor under the arena with a slow pulse. Neon accents: cyan `#00e5ff` (local player), magenta `#ff2bd6`, violet `#7c4dff`, lime `#b6ff3b`, amber `#ffb300` (ghost and corrections), red `#ff3b5c` (loss, danger). Other players use distinct hues from a fixed 8-colour palette by `id`.
- **Typography:** bundled via `@fontsource`: a techno display face for titles (Orbitron) and a clean condensed face for UI text (Rajdhani), a monospace (JetBrains Mono) for numbers. No default browser fonts anywhere.
- **Arena:** obstacles are dark glass blocks with glowing violet edges. Arena boundary glows. Players are glowing circles with a chevron showing the aim direction and a name tag. Projectiles are bright cores with fading trails.
- **Effects (Phaser 3 WebGL):** bloom or glow post-FX on the arena camera; particle burst on every elimination; impact sparks on projectile hits; a pulsing ring on the respawn point; a rotating dashed shield ring during spawn protection; a restrained camera shake (small, ≤ 6 px, ≤ 150 ms) on the local player's death. If the measured FPS stays below 45 for 3 s, automatically disable bloom and reduce particles. If WebGL is unavailable, fall back to Canvas without post-FX.
- **Motion:** every value change in the panel animates (number tick, colour fade). Panels fade/slide in on load. Nothing blinks harshly.

### 13.2 Layout (target 1920×1080, usable down to 1280×720)

```text
┌─────────────────────────────────────────────────────┬──────────────────────┐
│  [TIMER 02:17]  [YOU 5]            [Scoreboard]      │   NETWORK LAB        │
│                                    [Kill feed]       │   status chip        │
│                  ARENA (1280x720 logical, scaled)    │   presets            │
│                                                      │   sliders            │
│                                                      │   toggles            │
│                                                      │   metric tiles       │
│                                                      │   sparklines         │
├─────────────────────────────────────────────────────┤                      │
│  PACKET FLOW STRIP: YOU ──► EMULATOR ──► SERVER      │                      │
└─────────────────────────────────────────────────────┴──────────────────────┘
```

The arena scales to fit (letterboxed, preserving aspect). The Lab panel is 360 px wide, collapsible with `Tab`, default open. Hotkeys: `Tab` toggle Lab, `1`–`5` presets, `G` ghost, `P` prediction, `R` reconciliation, `I` interpolation.

### 13.3 Screens and overlays

- **Landing screen:** the title "NOBU SHOOTER" in the display face with a glow; an animated background (drifting grid and a few glowing dots); a name input; the primary button **QUICK MATCH (vs bots)**; (P1) a second button **NETWORK LAB — A/B COMPARE**; a one-line controls hint. `Enter` starts. Transition into the game with a short fade.
- **In-game HUD:** timer (top center, turns red in the last 10 s), local score (large), compact scoreboard (top right, top 5, local player highlighted), kill feed (below the scoreboard, last 5, fading).
- **Overlays:** WAITING FOR PLAYERS; countdown "3, 2, 1, GO!" with large animated numerals; "RESPAWNING… 2" while dead; "SPAWN PROTECTED 0.7 s"; MATCH OVER with the final scoreboard, "WINNER: NAME" or "DRAW: A, B", and "Next match in 8 s"; "Connecting…" and "Connection lost — reconnecting…".

### 13.4 Prediction made visible

- **Ghost:** a dashed amber outline at the latest authoritative position of the local player (unsmoothed). It lags behind the solid player by roughly RTT/2 + snapshot interval. With prediction off the ghost is hidden (it would coincide).
- **Corrections:** on every counted correction, draw a short amber line from the old to the corrected position and a ring pulse sized by the error. Corrections larger than 8 px also flash the Lab "Corrections" tile.
- **Perturb button** (in the Lab, labelled "Nudge me (server)"): sends `perturb` with a 40 px vector so a visible correction happens on demand.
- **Pending-inputs bar:** a small bar under the local player's name (or in the Lab) showing the number of unacknowledged inputs.

### 13.5 Network Lab panel

A glass-style panel (`backdrop-filter` blur, subtle border glow). Sections, top to bottom:

1. **Header:** "NETWORK LAB", a connection status chip (LIVE / CONNECTING / EMULATOR OFFLINE), and the target selector ("All players" default, "Me", other labels; P1).
2. **Presets:** five chips (§11.5), active preset highlighted. Changing any slider switches the highlight to "Custom".
3. **Impairment sliders** (each with a live numeric readout and unit): One-way latency 0–500 ms; Jitter 0–200 ms; Packet loss 0–50 %; Bandwidth 50 kbps–10 Mbps plus "Unlimited"; Duplication 0–20 %; Reordering 0–30 %. A "Burst loss" switch (P1). Slider changes are sent to the emulator, throttled to 10 Hz.
4. **Netcode toggles:** Prediction, Reconciliation, Interpolation, Input redundancy, Ghost overlay (§10.6).
5. **Metric tiles** (§12): RTT, Jitter, Loss ↑/↓, Snapshot rate, Bandwidth ↑/↓, Pending inputs, Corrections/s, Last error, Input → Screen, Server tick. Colour thresholds for RTT: < 60 ms green, < 150 ms amber, otherwise red; similar sensible thresholds for the others.
6. **Sparklines** (hand-drawn canvas, no chart library): RTT, Loss %, Pending inputs, Correction error. Last ~12 s at 5 Hz.
7. **Footer:** the note "Bots are simulated inside the server; their traffic bypasses the emulator", an "About the transport" tooltip (§4 caveat), and the Perturb button.

### 13.6 Packet-flow strip (the hero visual of the emulator)

A 72 px strip under the arena: **YOU ● ─── [EMULATOR] ─── ● SERVER**. The emulator box shows chips for the active impairments (e.g. "LAT 100", "LOSS 5%", "BW 1M"). Two lanes: upper for upstream (cyan dots), lower for downstream (magenta dots), driven by the `packets` stream (sampled, drawn at most 40 dots/s):

- **Delivered:** the dot travels to the emulator box in ~120 ms, stays inside for its `delayMs` (jitter visibly jostles dots), then travels on to the destination in ~120 ms.
- **Dropped (loss):** the dot reaches the box, turns red, bursts and falls.
- **Dropped (queue):** the dot turns orange and is rejected at the box entrance; a queue-depth bar fills while bandwidth is limited.
- **Duplicated:** the dot splits in two.
- **Reordered:** a delayed dot is visibly overtaken by later dots.

### 13.7 Packet inspector (P1)

A drawer (toggle button on the strip) listing the latest ~100 packets from the `packets` stream: direction arrow, size, fate colour, applied delay, and the payload preview text. A "pause" button freezes the list. This replaces Wireshark for the demo; the protocol is plain JSON so it is also readable.

### 13.8 A/B compare mode (P1, the best single demo feature)

Opened from the landing page. Two arena panes side by side, each driven by the **same keyboard and mouse input**, each with its own `NetClient` and its own emulator session (labels `A` and `B`), both in the `lab` room (`GAMERULES.md` §14). Each pane has its own netcode toggle set. Defaults: **A = "Server-only" (prediction off, interpolation off)**, **B = "Predict + Reconcile" (all on)**. Under each pane show Input → Screen, Corrections/s and RTT. Both sessions are on the same emulator conditions by default; the Lab panel applies to both. Implementation: two Phaser game instances (each in its own container) sharing one input source.

### 13.9 Visual acceptance (check against screenshots)

- [ ] No default or unstyled browser elements (buttons, sliders, inputs, scrollbars are all themed)
- [ ] Bundled fonts render (title, UI and numbers); no layout shift when fonts load
- [ ] Arena has glow, grid floor and obstacle edge lighting; players and projectiles clearly readable against it
- [ ] Landing screen looks intentional (animated background, glowing title, clear primary button)
- [ ] Lab panel is aligned, consistently spaced and legible at 1280×720 and 1920×1080
- [ ] Packet-flow strip visibly reacts when loss or latency is changed
- [ ] Ghost and correction effects are visible at 200 ms latency
- [ ] Elimination, respawn and spawn-protection effects are visible and not distracting
- [ ] 60 FPS on a typical laptop with bloom enabled (auto-degrade otherwise)

---

## 14. Tests

Use vitest. Keep the suite small and meaningful; speed matters more than breadth.

1. **Sim determinism:** golden vector test (§7.3). Client and server import the same module; assert there is no second implementation.
2. **Reconciliation:** an in-process harness connects a `NetClient` to a server room through the emulator **pipeline** on a virtual clock with a seeded RNG. Assertions:
   - baseline (no impairment), and also 100 ms latency and 50 ms jitter with `allowJitterReorder` off: corrections = 0 and prediction error = 0 after settle;
   - 10 % loss, redundancy **off**: corrections > 0, and after inputs stop and the system settles the predicted position equals the authoritative position within `epsilonPx`;
   - 10 % loss, redundancy **on**: corrections are fewer than with redundancy off (expected: near 0);
   - 20 % duplication, redundancy off: corrections = 0 (no double movement);
   - 20 % reordering: redundancy **off** produces corrections (reorder acts as loss, §9.3) and still converges; redundancy **on** produces none.
3. **Emulator pipeline** (virtual clock, seeded RNG, ≥ 10 000 packets): measured loss within ±1 % of configured; delays within `latency ± 4σ` and never negative; order preserved when `reorderPct = 0`; throughput ≈ configured bandwidth when saturated and tail-drop occurs beyond `queueLimitMs`; duplication rate ≈ configured; burst model mean burst length ≈ `burstLen`.
4. **Rules:** self-hit ignored; spawn protection; fire cooldown; respawn timing; scoring; tie/draw; swept collision does not tunnel; no player-player collision; late join; bots fill to the target.
5. **Smoke (`npm run smoke`):** headless bot connects through the real emulator for 10 s on the Nightmare preset; asserts snapshots keep arriving, `ack` advances, the server tick rate stays ≥ 55 Hz and nothing crashes.
6. **Screenshots (P1):** Playwright captures landing, in-game and Lab views for §13.9.

---

## 15. Demo script and Definition of Done

### 15.1 Demo script (write it as `docs/DEMO_SCRIPT.md`, with the exact controls to use)

1. **Baseline.** Landing → Quick Match. Move and shoot against bots. Point out RTT ≈ 1–3 ms, zero corrections.
2. **Latency.** Prediction **off**, set latency to 100 ms: movement feels delayed. Turn prediction **on**: instant. The ghost trails the player.
3. **Loss.** Loss 10 % (redundancy is off by default): corrections appear (amber lines, Corrections/s > 0). Switch redundancy **on**: corrections nearly vanish. Switch it off again for the next steps.
4. **Jitter.** Jitter 50 ms, interpolation **off**: remote players stutter. Interpolation **on**: smooth.
5. **Reconciliation off.** With redundancy **off** and 10 % loss, turn reconciliation off: the ghost drifts away from the player. Turn it back on: the player is pulled back. (With redundancy on there is nothing to reconcile, which is why it is off by default.)
6. **Nudge.** Press "Nudge me (server)": a visible correction with a measured error.
7. **Combined.** Preset **Nightmare** (redundancy off): watch the packet-flow strip (loss, duplicates, queueing) and the corrections. Then enable redundancy and compare.
8. **A/B.** Open A/B compare under 150 ms latency: A feels laggy, B is instant.
9. **Metrics.** Walk through the tiles and sparklines.

### 15.2 Definition of Done (all must be true)

**Game**
- [ ] Two browser tabs plus bots play a full match under `GAMERULES.md` (movement, obstacles, projectiles, one-hit elimination, respawn with protection, scoring, countdown, 180 s timer, winner/draw, auto-restart)
- [ ] Server is authoritative; the client sends only inputs

**Core networking**
- [ ] Client-side prediction and server reconciliation work and are visible (ghost, correction effects, Corrections/s, error)
- [ ] Baseline prediction error is exactly 0; with redundancy off, loss and reordering produce corrections that converge; with redundancy on they largely disappear
- [ ] Duplicate, stale and reordered packets are handled without double movement
- [ ] Interpolation, input redundancy, handshake retry, heartbeat and timeouts work

**Emulator**
- [ ] Runs as a separate process with no game knowledge
- [ ] Latency, jitter, loss, bandwidth, duplication and reordering all work and are changeable live from the UI without touching game code
- [ ] Packet-flow strip reflects the live packets; stats match the configured values

**UI**
- [ ] §13.9 acceptance list satisfied (screenshots or review)
- [ ] Landing, HUD, overlays, Lab panel and presets implemented

**Delivery**
- [ ] `npm run demo`, `npm test` and `npm run smoke` all pass from a clean checkout
- [ ] `docs/PROTOCOL.md`, `docs/DEMO_SCRIPT.md` and `docs/ASSUMPTIONS.md` exist
- [ ] Final message lists anything cut

**Optional (priority order):** A/B compare, packet inspector, burst loss, reconnect, Playwright screenshots, UDP adapter, metrics export, sound, interpolation-delay slider.

---

## 16. Known limitations (document them in the UI "About" and in the docs)

- **No lag compensation:** shots are resolved against server positions. At high latency, hits on remote players feel late. This is a known, deliberate limitation.
- **No predicted projectiles:** shooting feedback is a local muzzle flash only.
- **Impairments are per message over loopback TCP** (§4 caveat).
- **Bots bypass the emulator.**
- Anti-abuse is minimal (§9.5). The demo is not hardened for the internet.
- Single-process server; no persistence.

---

## Appendix A — `shared/src/config/net.json`

Save verbatim.

```json
{
  "ports": { "client": 5173, "server": 8080, "emulatorData": 9000, "emulatorControl": 9001 },
  "snapshotHz": 30,
  "inputSendHz": 30,
  "redundancyMax": 10,
  "redundancyDefault": false,
  "maxInputsPerMessage": 20,
  "maxMessagesPerSecond": 120,
  "inputBacklogCatchup": { "threshold": 3, "maxPerTick": 2 },
  "interpDelayMs": 100,
  "extrapolateMaxMs": 100,
  "snapshotBufferSize": 32,
  "eventRedundancyMs": 500,
  "clockSmoothing": 0.05,
  "reconcile": { "epsilonPx": 0.01, "smoothHalfLifeMs": 80, "snapThresholdPx": 64 },
  "pingIntervalMs": 500,
  "helloRetryMs": 250,
  "connectGiveUpMs": 10000,
  "timeoutMs": 5000,
  "metricsWindowMs": 10000,
  "debug": { "allowPerturb": true, "perturbPx": 40 },
  "fpsDegrade": { "minFps": 45, "forSeconds": 3 }
}
```
