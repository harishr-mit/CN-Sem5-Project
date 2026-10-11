# Phase 5 Implementation Plan — Realistic transport + standalone emulator

**Audience:** the project owner and the agent who implements Phase 5.
**Status:** **implemented 2026-10-12** (`log.md` T88–T94; drafted as T87, revised as T95, approved by the owner the same day). Deviations in §8. Owner answers already folded in: **app-level fragmentation** for messages over 1200 B (D2); the in-game Lab and Presenter impair **only the game's own WS route** (D6); a **self-contained dashboard page**, plus an emulator entry point **with no routes** whose listen → target routes are added at runtime from the dashboard, between any two ports (D4, D5); network players get a **demo flag and a Presenter step** and play like the server bots (D8, D10). **Owner revision 2026-10-12 (T95):** the owner plans to turn the game into a real multiplayer game later, so only the emulator's **control port** is locked to this machine. The server's UDP port and the emulator's data routes accept connections from other machines, as the WS ports do today, and every bind address is configurable (D7, D9, D15). The multiplayer work itself is a candidate phase in `PHASES.md`, not Phase 5.
**Scope:** `PHASES.md` → Phase 5, items U1–U7, plus U8 (runtime routes, owner 2026-10-12). This file says *how* to build them. `PHASES.md` stays the source for *what* and the exit criteria.

---

## 0. Starting point

Checked on 2026-10-12, branch `phase4` at `845c39f` (Phase 4 + owner revisions; 163 tests, smoke and shots passed in T86).

**Baseline before Phase 5 (T95, 2026-10-12, Node v26.4.0):** `npm run typecheck` clean; `npm test` **163/163**; `npm run smoke` PASSED (6 steps; delta 165 kB vs full 355 kB = 46 %, ack delay 311 vs 711 ms under Nightmare). TCP 5173/8080/9000/9001 and UDP 8081/9100 free before and after; no processes left. `npm run shots` was not re-run (last pass: T86). No dependency is needed for Phase 5 (`dgram`, `http` are Node built-ins; `ws` is already a dependency).

**Already in place:**

- `server/src/core.ts` `GameServer` is transport-agnostic: an adapter calls `addConnection(send, close)`, `handleMessage(conn, text)` and `removeConnection(conn)`, and silent connections already time out (`NET.timeoutMs` 5 s). The WS adapter in `server/src/main.ts` is 20 lines.
- The protocol already works like datagrams: `hello` is retried (`helloRetryMs`), the welcome is re-sent, inputs carry sequence numbers and optional redundancy, and delta snapshots handle lost bases. Phases 1–3 test all of this under emulated loss.
- `emulator/src/pipeline.ts` (`Pipeline`, `LinkState`) works on opaque packets with an injected clock. It is unit-tested (`tests/emulator.test.ts`) and used in-process by the netcode harness.
- `NetClient` takes a `TransportFactory`, so a Node UDP transport plugs straight in (`scripts/sync-clients.ts` already drives headless `NetClient`s over Node WS).
- The Landing page has a disabled **EMULATOR DASHBOARD · PHASE 5** button.

**Gaps found while reading the code:**

| # | Gap | Consequence |
|---|---|---|
| G1 | Full snapshots are **1.3–2.1 kB** (ASSUMPTIONS #40, #62) | U2's "trim events" cannot reach 1200 B → owner chose fragmentation (D2). |
| G2 | The emulator has **one WS route fixed at launch** (`--listen` / `--target`) | It cannot proxy UDP, or anything chosen later → runtime routes (D4). |
| G3 | `Packet.data` is a `string` and every frame goes through `toString()` | Binary WS frames and binary UDP payloads get corrupted → payloads become bytes (D3). |
| G4 | `pipeline.ts` imports `mulberry32` from `@nobu/shared` | The "standalone" emulator depends on the game's package → inline the PRNG (D3). |
| G5 | Control commands with `target: 'all'` set one global default and reach every session | Once swarm sessions exist, a Lab preset would overwrite their dashboard settings → route-scoped targets (D6). |
| G6 | The control port (`new WebSocketServer({ port })`) binds **all interfaces** and accepts any `Origin` | Once it can open ports and forward to any host, it would be an open proxy for the LAN or any web page → localhost bind + Origin allowlist (D7). The data ports (server WS `:8080`, emulator `:9000`) also bind all interfaces today; that stays, because other machines will need to reach them (D15). |
| G7 | `assertPortsFree` / `waitForPort` (`scripts/lib/procs.mjs`) only check TCP | The demo, smoke and shots must also check UDP 8081 / 9100. |
| G8 | Server bots (`server/src/bots.ts`) use the server's `PlayerState` | The swarm cannot reuse them as they are → extract the decision code (D10). |

**Not Phase 5 gaps (recorded for the multiplayer candidate phase in `PHASES.md`):** the client has `ws://127.0.0.1:…` hard-coded (`client/src/ui/App.tsx`, `client/src/ui/compare/CompareView.tsx`); the Vite dev server only listens on this machine; any client can change the emulator through the Lab and, under `npm run demo`, send developer commands. None of these is changed in Phase 5, and nothing in Phase 5 makes them harder to change later.

---

## 1. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **Topology** (as in `PHASES.md`): browser ⇄ emulator WS route `ws:9000` ⇄ server WS `:8080`; network players ⇄ emulator UDP route `udp:9100` ⇄ server UDP `:8081`; dashboard + control API on `http/ws :9001` (never impaired, this machine only, D7). **One emulator process** serves both routes, so one dashboard shows browser and network-player sessions side by side. No TCP mode (out of scope). | The demo shows both transports through the same impairment code. |
| D2 | **Datagram discipline: app-level fragmentation** (owner choice). Shared module `shared/src/net/fragment.ts`: a message whose UTF-8 encoding is over **1200 B** is split into fragments of at most 1200 B (header included). Fragments are ASCII-headed so the packet log stays readable: `~<msgId>.<index>/<count>|<bytes>` (JSON messages always start with `{`, so a leading `~` marks a fragment). The receiver reassembles by `(peer, msgId)`. A message is **dropped** if any fragment is still missing after 250 ms, or when more than 8 messages are pending. Duplicate fragments are ignored and out-of-order fragments are accepted. Used in **both directions** on UDP only (WS frames are unaffected). **The emulator does not reassemble:** it impairs each fragment as its own datagram. | Real UDP games stay under the path MTU. Losing one fragment loses the whole message: a 2-fragment full snapshot at 10 % loss arrives ≈ 81 % of the time. Delta and state messages usually fit in one datagram, so delta gains a second advantage over full on UDP. This becomes a demo talking point and a test. |
| D3 | **Emulator payloads are bytes, and the emulator has no game dependency.** `Packet.data: Buffer`. WS frames keep their text/binary flag. UDP payloads pass through untouched. `preview` = printable ASCII as text, otherwise hex. `mulberry32` is copied into `emulator/src/prng.ts`, and `@nobu/shared` is removed from `emulator/package.json`. A test asserts that `emulator/src` imports nothing from the game. | Answers the owner's "game-agnostic" requirement: the emulator proxies any WS or UDP app byte-for-byte. |
| D4 | **Runtime routes** (owner request, U8). A *route* = `{ id, proto: 'ws' \| 'udp', listen: { host, port }, target }`, with `id = "<proto>:<port>"` (e.g. `ws:9000`, `udp:9100`). Routes are created from the **CLI** (`--route ws:9000=ws://127.0.0.1:8080`, `--route udp:9100=127.0.0.1:8081`, repeatable; the old `--listen` / `--target` stay as an alias for one WS route) **or at runtime from the dashboard / control API** (`route.add`, `route.remove`). Removing a route closes its listener and sessions. A failed bind (port in use, permission) is reported back as an error event and leaves nothing half-open. **Each route owns its defaults and active preset**: new sessions on a route start from that route's defaults. | The emulator can sit between any two ports chosen at runtime, not only game client ↔ game server. |
| D5 | **Entry points.** `npm run emulator` (root and `NoBu-Shooter/`) starts the emulator with **no routes**: only the dashboard and control API on `http://127.0.0.1:9001`. It prints the URL, and you add routes from the dashboard. Options: `--control <port>`, `--route …`, `--seed`. `npm run demo` starts it with the two game routes. The dashboard needs the control port (it is served from it); that is the only socket open before you add a route. | The owner's "open the dashboard without connecting any data sockets". |
| D6 | **The game impairs only its own route** (owner choice). `EmulatorClient` targets `ws:9000` (derived from `NET.ports.emulatorData`) wherever it sends `all` today (Lab presets, sliders, reset, Compare's network presets, Presenter steps). Per-pane session targets in Compare are unchanged. `all` still exists on the control API and means every route (the dashboard offers it). Control `state` reports per-route `defaults` / `preset`. The Lab reads its own route's preset. | Network players keep whatever the dashboard (or Presenter step Q13) gives them. A Lab preset no longer wipes it. |
| D7 | **Control-port safety — the control port only** (owner revision, T95). The dashboard + control server binds **127.0.0.1** (`--control-host` to override, with a printed warning). WebSocket upgrades are accepted only with **no `Origin`** (Node tools) or an allowlisted one: `http://127.0.0.1:<control>`, `http://localhost:<control>`, `http://localhost:5173`, `http://127.0.0.1:5173`, plus `--allow-origin <url>`. The static server only serves the files in `emulator/dashboard/` (fixed allowlist, no path joins from the URL). This lockdown **stays when the game goes multiplayer**: the emulator is the operator's tool, and remote players must never reach it. **Data routes are not locked down** (D15). Two limits protect a route that other machines can reach: at most **64 sessions per route**, and UDP sessions idle for 30 s (`--udp-idle-ms`) are closed. | A control API that can open listeners and forward to any host must not be reachable from the LAN, or from a random web page in the presenter's browser (browsers send `Origin` on WS; non-browsers can't be stopped by Origin, hence the localhost bind). A data route only forwards to the target its operator chose, so exposing it is as safe as exposing that target. |
| D8 | **Network players = `npm run swarm -- --n 3`** (`scripts/swarm.ts`). One Node process runs N headless `NetClient`s, each with **its own UDP socket** (so its own source port and its own emulator session). Defaults: room `main`, sync Full, via the emulator `udp:9100`. Options: `--sync delta\|state`, `--room lab`, `--direct` (straight to `:8081`, no impairment), `--duration <s>` (smoke), `--quiet`. Names `UDP-1`… `UDP-n` (no protocol change). After connecting, each player names its emulator session through the control API (`session.label` by peer address), so the dashboard shows `UDP-2`, not `udp 127.0.0.1:53114`. The terminal prints one line per player every 2 s: RTT, ack delay, corrections/s, fragments lost/s, ↓ kbps. **`npm run demo -- --swarm 3`** starts it together with the demo. | Their *own* traffic is impaired, which removes the "bots bypass the emulator" caveat (ASSUMPTIONS #5). Network players count as humans in the bot formula (GAMERULES §12). Three of them + the presenter = 4 participants, so from the next countdown no server bots are added (`bots.targetParticipants` 4) and every opponent is a network player. Bots already in a running match stay until it ends, as for any human who joins mid-match, and Presenter ⟲ RESTART starts that countdown at once. |
| D9 | **Server UDP adapter** `server/src/udp.ts` on **:8081** (`NET.ports.serverUdp`), on the same interfaces as the WS server (all, today; D15). One `Connection` per remote `address:port`; `close()` forgets the address; fragmentation via D2; the existing timeouts clean up silent peers. Started by `server/src/main.ts` beside the WS adapter. **NetClient's Node UDP transport** goes in `scripts/lib/udp-transport.ts` (a `TransportFactory` using `dgram` + D2; `onOpen` fires once the socket is bound, since `hello` retries cover loss). It is never imported by browser code. | Same `GameServer` core for both transports (U1). |
| D10 | **Swarm players play like the server bots** (owner choice: move, aim, shoot). The decision code in `server/src/bots.ts` moves to `shared/src/sim/botBrain.ts` and works on a minimal view (`id, x, y, alive, aim`). The server `BotController` becomes a thin wrapper, and the existing bot tests must pass unchanged. A swarm player feeds the brain **its own view**: predicted self + interpolated remote players, so it aims where *it* sees others. Its inputs go through `NetClient` (prediction, reconciliation, redundancy as configured). | One AI, two homes. A lagging network player visibly aims at stale positions, which is the effect being demonstrated. |
| D11 | **Presenter — Quick Match gains step Q13 "Network players"** (owner choice). Browser link: Baseline. Network players' route `udp:9100`: ad-hoc *120 ms ± 40 ms, 10 % loss*. Caption: watch `UDP-n` stutter and jump while you stay smooth; the dashboard shows their sessions at ≈ 10 % loss and ≈ 19 % on full snapshots (fragments). The bar gets an **OPEN DASHBOARD** button. **Every** Quick step gets a `swarmNetwork` field (Baseline except Q13), so `B` from Q13 restores it (Phase 4 D2: complete steps). With no `udp:9100` session connected, the bar says "start network players: `npm run demo -- --swarm 3`" and the step still runs. Compare script unchanged. | The demo checkpoint becomes part of the talk. |
| D12 | **Dashboard UI** (owner choice: self-contained page): `emulator/dashboard/{index.html,app.js,style.css}`, plain JS + canvas, no build, no CDN, and the same neon palette as the game (its own CSS). Panels: **Routes** (table + add form: proto, listen host/port, target; remove), **Sessions** (per route: label, proto, peer, age, ↑/↓ kbps, loss %, queue ms), **Controls** (target = all / route / session; direction both / up / down; a slider for every `LinkConfig` field; presets), **Charts** (selected target, last 60 s: ↑/↓ kbps, loss %, queue ms), **Packet log** (newest 500; filter by session, direction, fate; pause; payload preview). Reconnects by itself if the control socket drops. The Landing button is enabled and opens `http://127.0.0.1:9001/` in a new tab; the Lab gets a small "dashboard ↗" link. | Works with no game running (G3). One page, no new dependencies. |
| D13 | **Generic tools for the no-game demo (U6):** `emulator/tools/udp-echo.mjs` (prints each datagram and echoes it back) and `emulator/tools/udp-send.mjs` (sends `#<n> <text>` at a rate and prints the replies and the gaps/loss %), using only Node built-ins. Root scripts `npm run udp-echo -- --port 7000` and `npm run udp-send -- --to 9100`. For WS, `emulator/README.md` shows `npx wscat` (project-local npx, AGENTS.md) and `ncat`/`socat` for people who have them. Wireshark: a docs-only note (loopback capture needs Npcap on Windows, which the agent does not install; filter `udp.port in {9100 8081}`). | The demo checkpoint ("two generic UDP tools, no game") with no global installs. |
| D14 | **Ports** in `net.json`: `serverUdp` 8081, `emulatorUdp` 9100. `procs.mjs` gets `assertUdpPortsFree` (bind test) and the demo / smoke / shots check all six ports. PHASES rule 4 grows to 5173, 8080, 8081, 9000, 9001, 9100. | G7. |
| D15 | **Bind addresses** (owner revision, T95; ready for multiplayer). **Server:** `--host` / `NOBU_HOST` sets the address for both WS `:8080` and UDP `:8081`. The default stays all interfaces (today's WS behaviour), and UDP follows WS. **Emulator data routes:** each route has a `listen.host`. The default is all interfaces (today's `:9000` behaviour), and that applies to `npm run demo`'s routes and to routes added from the CLI or the dashboard. `--route ws:127.0.0.1:9000=…` or the dashboard's "this machine only" option binds one route locally. The routes table shows each route's bind address. **Tests and smoke** bind 127.0.0.1 explicitly, so automated runs expose nothing. Route ids stay `<proto>:<port>` (one route per protocol and port). | Other machines can join through the emulator, or straight to the server, without code changes. The control port alone stays local (D7). |

---

## 2. Design

### 2.1 Emulator (`emulator/src/`)

| File | Change |
|---|---|
| `prng.ts` | New: `mulberry32` (copied from shared, D3). |
| `pipeline.ts` | `Packet.data: Buffer`; `preview()` helper (ASCII or hex, 48 chars); import the local PRNG. Behaviour otherwise unchanged (existing tests). |
| `session.ts` | `Session` is built from an **endpoint pair** `{ toClient(buf, binary?), toTarget(buf, binary?), close() }` plus `route`, `peer`, `proto`. WS and UDP share the pipeline, stats and config code. |
| `routes/ws.ts` | The current `main.ts` WS bridge, as a route (http server + `WebSocketServer`, upstream per client, early-message buffer, `?label=`), binary-safe. |
| `routes/udp.ts` | `dgram` listener; `Map<peer, UdpSession>`; per session an upstream socket bound to an ephemeral port and `connect()`ed to the target; down datagrams are sent back to the peer address; idle timeout; 64-session cap; label `udp <peer>` until renamed. |
| `routes/index.ts` | `RouteManager`: `add(spec) → Promise<Route>`, `remove(id)`, `list()`, per-route `defaults` / `activePreset`, `resolveTarget('all' \| routeId \| sessionId \| label)`. |
| `control.ts` | Runs on an `http` server that serves `dashboard/` (fixed allowlist) and upgrades WS with the Origin check (D7). New commands: `route.add`, `route.remove`, `session.label`. `set` / `preset` / `reset` resolve targets through `RouteManager` (D6). `state` adds `routes[]` (id, proto, listen, target, defaults, preset, session count) and per-session `route`, `proto`, `peer`. Error event `{ evt: 'error', cmd, msg }`. |
| `main.ts` | CLI parsing (`--route` repeatable, `<proto>:[host:]<port>=<target>`, the `--listen`/`--target` alias, `--control`, `--control-host`, `--allow-origin`, `--udp-idle-ms`, `--seed`); no routes = dashboard only (D5); route bind host per D15. |

### 2.2 Server, shared, swarm

| File | Change |
|---|---|
| `shared/src/net/fragment.ts` | `fragment(text, max = 1200): Buffer[]`, `Reassembler` (`push(buf, now) → string \| null`, `purge(now)`, counters `fragmentsIn`, `messagesDropped`). |
| `shared/src/config/net.{json,ts}` | `ports.serverUdp`, `ports.emulatorUdp`, `udp: { maxDatagram: 1200, reassemblyMs: 250, maxPending: 8 }`. |
| `server/src/udp.ts` | Adapter (D9). |
| `server/src/main.ts` | Starts the UDP adapter; `--host` / `NOBU_HOST` for both adapters (D15); logs both ports and the bind address. |
| `shared/src/sim/botBrain.ts` + `server/src/bots.ts` | Extraction (D10). |
| `scripts/lib/udp-transport.ts` | Node UDP `TransportFactory` (D9). |
| `scripts/swarm.ts` | Network players (D8): a 60 Hz sim / 30 Hz send loop as in `sync-clients.ts`, `botBrain` per player, the status table, `session.label` via control. |
| `scripts/demo.mjs`, `scripts/lib/procs.mjs` | Emulator started with both routes; `--swarm N`; UDP port checks (D14). |

### 2.3 Client

| File | Change |
|---|---|
| `client/src/net/EmulatorClient.ts` | Default target `ws:<emulatorData>` (D6); reads its route's `preset` / `defaults` from `state`; `labelSession(peer, label)`. |
| `client/src/ui/compare/CompareView.tsx`, `NetworkLab.tsx`, `ui/presenter/stages.ts` | `'all'` → the game's route (through `EmulatorClient`). |
| `client/src/presenter/{types,scripts,controller}.ts` | `swarmNetwork` on every Quick step; Q13 (D11); `Stage.applySwarmNetwork`. |
| `client/src/ui/presenter/PresenterBar.tsx` | OPEN DASHBOARD button; "no network players" hint. |
| `client/src/ui/Landing.tsx`, `NetworkLab.tsx` | Dashboard button enabled; "dashboard ↗" link. |

### 2.4 Dashboard (`emulator/dashboard/`)

As in D12. It talks only to the control API, so everything it does can also be scripted (documented in `docs/PROTOCOL.md` §5 and `emulator/README.md`).

---

## 3. Build order

| Step | log.md | Work | Done when |
|---|---|---|---|
| 1 | T88 | Emulator core: bytes, local PRNG, endpoint sessions, `RouteManager` with WS routes, CLI `--route`, route-scoped targets/defaults, control `state.routes`; game client targets `ws:9000` (§2.1, §2.3 first row) | Tests 5, 6, 9 pass; existing emulator/netcode tests unchanged; the game works by hand through `ws:9000` |
| 2 | T89 | `fragment.ts` + server UDP adapter + Node UDP transport + `net.json` ports | Tests 1, 3 pass |
| 3 | T90 | Emulator UDP routes, idle timeout, session cap, `session.label`, runtime `route.add`/`remove`, control safety (D7) | Tests 2, 4, 7 pass |
| 4 | T91 | `botBrain` extraction, `npm run swarm`, `demo --swarm N`, UDP port checks | Bot tests unchanged; 3 network players play in the browser through `udp:9100` |
| 5 | T92 | Dashboard page + static serving + `npm run emulator` + Landing / Lab links | Dashboard works with only `npm run emulator` running: add a UDP route, impair it, watch the log |
| 6 | T93 | Presenter Q13 + `swarmNetwork`; `udp-echo` / `udp-send`; `emulator/README.md` (U6) | Test 8 passes; the no-game demo works with the two tools |
| 7 | T94 | Smoke step 7, shots (dashboard, Landing, Q13), docs, phase exit (§5) | Exit checklist met |

---

## 4. Tests

| # | File | What it checks |
|---|---|---|
| 1 | `tests/fragment.test.ts` | Round trip of 1 B–10 kB messages, including multi-byte UTF-8 names; every fragment ≤ 1200 B; any fragment order and duplicates → one message; a missing fragment → dropped after 250 ms and counted; the pending cap holds. |
| 2 | `tests/emulator-udp.test.ts` (real sockets on 127.0.0.1, ephemeral ports) | Clean link: every datagram arrives byte-identical, in order. Seeded 30 % loss: the set of datagrams received equals the set the pipeline reported `delivered` (U7: "delivers exactly what the pipeline decides"). Two clients on one host → two sessions with separate stats; a per-session config reaches only that session (U7). Down datagrams return to the right peer. Idle timeout closes the session. |
| 3 | `tests/server-udp.test.ts` | `hello` → `welcome` over UDP; two source ports → two players; a 2 kB full snapshot arrives fragmented and reassembles; a silent peer times out and its address is forgotten; the adapter binds the host it is given (D15). |
| 4 | `tests/netcode.test.ts` (+) | `NetClient` + UDP transport → emulator `udp` route → server UDP adapter: 0 corrections on a clean link; at 10 % loss full snapshots arrive ≈ 1 − 0.9^k of the time (k = fragments) while delta arrives ≈ 90 %. |
| 5 | `tests/emulator.test.ts` (+) | Bytes in = bytes out (binary WS frames intact); `preview` is ASCII or hex; pipeline behaviour unchanged. |
| 6 | `tests/emulator-routes.test.ts` | `route.add` / `remove` at runtime; port in use → error event and no route; a route binds its `listen.host` (all interfaces by default, 127.0.0.1 when asked; D15) while the control port stays on 127.0.0.1; a preset on `ws:9000` leaves `udp:9100` sessions alone; `all` reaches both; new sessions inherit their route's defaults. |
| 7 | `tests/emulator-routes.test.ts` | Control upgrade refused for a foreign `Origin`, accepted with none / allowlisted; the static server answers only allowlisted dashboard files (`/../package.json` → 404). |
| 8 | `tests/presenter.test.ts` (+) | Q13 is complete; every Quick step has `swarmNetwork`; the no-leakage test covers the new field. |
| 9 | `tests/emulator.test.ts` (+) | `emulator/src/**` imports nothing from `@nobu/*`, `../shared`, `../server` or `../client` (standalone, D3). |
| — | `npm run smoke` | New step 7/7: `swarm --n 1 --duration 10` over UDP under Nightmare: snapshots keep arriving (fragments reassembled), acks advance, and the emulator reports one `udp:9100` session with traffic both ways. |
| — | `npm run shots` | New screens: Landing (dashboard enabled), dashboard with the demo + 2 network players, dashboard with no routes, Presenter Q13. `docs/VISUAL_CHECKLIST.md` rows added. |

---

## 5. Exit checklist

- [x] `npm test`, `npm run typecheck`, `npm run smoke` (incl. the UDP network player under Nightmare), `npm run shots` pass.
- [x] **Demo checkpoint, part 1 (no game):** `npm run emulator` → dashboard → add route `udp:9100 → 127.0.0.1:7000`; `npm run udp-echo -- --port 7000` and `npm run udp-send -- --to 9100`; set 20 % loss on the dashboard → numbered messages visibly go missing, and the packet log shows the drops.
- [x] **Demo checkpoint, part 2:** `npm run demo -- --swarm 3` → in Quick Match the three `UDP-n` players move and fight; at Q13 (or a dashboard preset on `udp:9100`) they stutter and correct while the browser player stays smooth, and the dashboard lists their sessions beside the browser's.
- [x] A Lab preset in Quick Match changes only `ws:9000` sessions.
- [x] Bind addresses as in D15: control `:9001` on 127.0.0.1 only; `:8080`, `:8081`, `:9000`, `:9100` on all interfaces under `npm run demo` (checked with `netstat -ano`).
- [x] Docs: `docs/PROTOCOL.md` (§1 transports, §5 routes / control API / fragments, server UDP), `emulator/README.md` (new, U6), `README.md` (architecture diagram, `npm run emulator` / `swarm` / `udp-*`, dashboard, ports), `docs/DEMO_SCRIPT.md` (new section + Q13), `docs/ASSUMPTIONS.md` (#5 rewritten, new entries), `GAMERULES.md` (Presenter 13 steps; network players are ordinary participants), `docs/VISUAL_CHECKLIST.md`, `PHASES.md`, `log.md`.
- [x] No processes left; TCP 5173/8080/9000/9001 and UDP 8081/9100 free; no new dependency. Suggested tag: `phase-5`.

## 6. Risks

| Risk | Mitigation |
|---|---|
| Windows `dgram` quirks: `ECONNRESET` on a UDP socket after an ICMP port-unreachable (target not up yet) | Catch socket `error` events per session and keep the session alive; test 2 starts the client before the target. |
| The swarm (N × 60 Hz `NetClient` + bot brain) costs CPU on the demo laptop | One process, one shared timer; measure 3 players (target < 10 % of one core) and record it in ASSUMPTIONS. |
| Fragment loss makes Full over UDP look broken under Nightmare | That is the lesson. The caption says so, and `--sync delta` shows the fix. Smoke uses Full deliberately to prove reassembly works. |
| Route-scoped targets break the Phase 2–4 Compare / Presenter flows | Step 1 changes only `all` → `ws:9000` in the client; the full test suite, the presenter tests and the shots must stay green before step 2. |
| An allowlisted Origin is still too broad for someone running the dashboard on a shared machine | Localhost bind by default; changing the host prints a warning; documented in `emulator/README.md`. |
| Windows Defender Firewall asks about `node.exe` the first time a port is opened to other machines | Same as today's `:8080` / `:9000`. Localhost use works whatever the answer. If the owner declined earlier, LAN players can't connect: the README says how to allow it. The agent never changes firewall rules. |
| A UDP server reachable from outside can be abused for reflection (a spoofed `hello` makes the server stream snapshots to a victim for up to `timeoutMs`) | Phase 5 targets this machine and the LAN. A return-routability challenge before streaming, plus per-IP limits, is item M4 of the multiplayer candidate phase (`PHASES.md`). Until then, don't expose `:8081` / `:9100` to the internet. |
| Old `docs/` describe a fixed `--listen/--target` emulator | The alias keeps those commands working; the docs move to `--route` in step 7. |

## 7. Not in Phase 5

- A TCP proxy mode (out of scope, `PHASES.md`).
- Browser UDP (WebRTC / WebTransport): out of scope; the browser stays on WS.
- Saving routes and settings between emulator runs (a `--route` list in a script covers the demo).
- Lockstep (Phase 6).
- Multiplayer readiness (`PHASES.md` candidate phase, owner 2026-10-12): configurable server address in the client, serving the client to other machines, operator-only Lab / Presenter / developer commands, TLS, UDP return-routability challenge. Phase 5 only keeps the doors open for it (D15).

## 8. Deviations from this plan

| # | Plan | Built | Why |
|---|---|---|---|
| X1 | D3: `Packet.data: Buffer` | `Buffer \| string` (+ `binary` flag) | The route adapters pass bytes; the in-process netcode harness and the Phase 1–4 tests pass text. The pipeline treats both as opaque, and the preview handles both (ASSUMPTIONS #85). |
| X2 | D4: each route owns "its defaults" | Defaults **per direction** (`defaults` + `defaultsDown` in `state`), also for `all` | The browser check showed "up only, 20 %" reaching later sessions in both directions (ASSUMPTIONS #87). |
| X3 | §2.1: `state.sessions[].up/down` = config + stats (as before) | `up` / `down` = config only, `stats` = counters | The two objects share the key `lossPct` (configured vs measured), so the merged form showed the measured loss as the setting (pre-existing; found in the final check). |
| X4 | D8: names via control | as planned, plus `--verbose` (logs each correction with its context) | Used to explain the clean-link corrections (at death, not a transport fault). |
| X5 | §4: shots add Landing, dashboard, dashboard without routes, Q13 | Q13, dashboard, dashboard under Nightmare (shots run the demo with `--swarm 2`); the no-route dashboard was checked by a scratch browser script | The shots always run the demo; a second emulator-only run wasn't worth the extra minutes. A screen can now undo its change after the shot (`after` hook). |
| X6 | — (not in the plan) | Fixes found by the checks: a WS route on a busy port crashed the emulator (EADDRINUSE re-emitted by `ws`); queue-drop `delayMs` unrounded since Phase 1; dashboard overflow at 420 px and a sideways-scrolling routes table at 1280 px; favicon 404 | `log.md` T88, T92, T94; ASSUMPTIONS #94. |
| X7 | Snapshot size "1.3–2.1 kB" (G1) | Measured ≈ 3 kB on average in a 4-way fight (2.7 fragments), up to ≈ 4.5 kB (4 fragments) | More projectiles and projectile-hit events than in the Phase 2.5 measurement; docs say "2–4 fragments". |
| X8 | — | Owner additions: purple piercing rounds (T96), README quickstart + command reference (T97) | Asked for during the run. |
