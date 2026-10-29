# NoBu Shooter — Wire Protocol Specification

Version: 1.0  
Source of truth: `shared/src/protocol/messages.ts` (types + validators). Originally specified in `docs/archive/SPEC-v1.md` §8.

---

## 1. Overview & Transport Caveat

Every message is UTF-8 JSON carrying exactly one message, with a type field `"t"`. Two transports carry the same messages to the same server core (`server/src/core.ts`; Phase 5):

| Transport | Who | Path | One message = |
|---|---|---|---|
| **WebSocket** | the browser (and the Node smoke clients) | client → emulator route `ws:9000` → server `:8080` | one text frame |
| **UDP** | network players (`npm run swarm`), tests | client → emulator route `udp:9100` → server `:8081` | one datagram, or several **fragments** (§1.1) |
| **WebSocket, game edition** (Phase 7) | players' browsers (`npm start` / `npm run dev`) | client → server `/ws` on the port that served the page (8080; `npm run dev`: Vite's 5173 forwards `/ws` to 8080) | one text frame |

The server accepts WebSocket upgrades on `/ws` and `/` (any other path: 404); messages are at most 64 kB. With `--static <dir>` (`npm start`) the same port also serves the built game over HTTP (§6).

> **Transport caveat (WebSocket):** the browser's links are loopback TCP connections, and TCP never drops or reorders. The standalone **Network Emulator** is the only place that drops, delays, duplicates or reorders. It treats every frame as a datagram, so the game sees UDP-like behaviour without head-of-line blocking. Over the **UDP** transport the datagrams are real; on loopback the emulator is still the only source of loss.

The protocol was built for datagrams from the start:
- `hello` is retried until a `welcome` arrives, and a repeated `hello` gets the same `welcome`;
- inputs carry sequence numbers and optional redundancy;
- delta snapshots fall back to full ones when their base was lost;
- a silent peer times out after `timeoutMs` (5 s).

### 1.1 UDP datagram discipline (fragments)

Every UDP datagram is at most **1200 bytes** (`net.json` `udp.maxDatagram`), a safe size below common path MTUs. A message whose UTF-8 encoding is larger is split by the sender (`shared/src/net/fragment.ts`) into fragments with an ASCII header:

```text
~<msgId>.<index>/<count>|<bytes of the message>        e.g.  ~k2.0/3|{"t":"snap","tick":…
```

- `msgId` is base 36, per sender; `count` ≤ 64. A JSON message always starts with `{`, so a leading `~` marks a fragment. A message that fits but starts with `~` is sent as a 1-fragment message.
- The receiver keeps one reassembler per peer. It accepts fragments in any order and ignores duplicates and late fragments of an already completed message.
- A message is **dropped** if a fragment is still missing after `udp.reassemblyMs` (250 ms), or when more than `udp.maxPending` (8) messages are incomplete.
- Fragmentation is used in both directions on UDP only. The emulator does **not** reassemble: it impairs every fragment on its own.

Losing one fragment therefore loses the whole message: at loss rate p, a k-fragment message arrives with probability (1 − p)^k.
- **Full snapshots** in a 4-player match are ≈ 2–4.5 kB, i.e. 2–4 fragments (more projectiles and events during a fight). At 10 % loss, ≈ 19–34 % of them are lost.
- **Delta and state messages** usually fit one datagram.

---

## 2. Client → Server Messages

### 2.1 `hello` (Handshake Initiation)
Resent every 250 ms until an authoritative `welcome` message is received.
```json
{
  "t": "hello",
  "v": 1,
  "name": "PILOT_01",
  "room": "main",
  "nonce": "a8f3c9b"
}
```
- `v`: Protocol version (`number`, must be 1).
- `name`: Callsign string (truncated to 12 chars by the server, GAMERULES.md §4). Made unique within the room, case-insensitively: a second `ALEX` is `ALEX 2` (the welcome's player entry and snapshots carry the final name).
- `pid` (optional, string `[A-Za-z0-9_-]{8,64}`): the player's **persistent identity**, a random secret the client keeps in `localStorage` (`client/src/net/playerToken.ts`). A room that has seen it gives back the same player id and score on a rejoin (GAMERULES.md §4a). Never sent to other players. Malformed → the message is dropped. Ignored in the `lab` room.
- `room`: one of
  - `"main"`: the quick match (bots fill it; it starts as soon as a human is in, `GAMERULES.md` §2);
  - `"lab"`: the movement-only sandbox used by the Compare view (demo only; every lab player spawns at the same point, `rooms.lab.spawn`, so all panes' players start together);
  - `"new"` (Phase 7): create a **private room**; the welcome carries its `code`;
  - a **room code** (Phase 7), e.g. `"blue-fox"`: join that private room. Codes are an adjective and an animal from fixed lists (`shared/src/rooms/codes.ts`, 1 600 codes); the server accepts any case and a space, a dash or nothing between the words (`"Blue Fox"`, `"BLUEFOX"`) and uses the canonical `blue-fox`. No such room → `error ROOM_NOT_FOUND`; too many rooms → `ROOM_LIMIT` (32).
- `nonce`: Unique client-generated session identifier for idempotent handshake retry.
- `spectate` (optional, boolean): join as a **spectator** — the connection receives snapshots but gets no player, doesn't count toward the room's player cap, and its `input`/`perturb` messages are ignored. The Compare view's reference pane uses this, connecting directly to the server (no emulator).
- `sync` (optional, Phase 3; ignored by the game server, which keeps everyone on `delta`): the connection's **sync model**, `{ "model": "full" | "delta" | "state" | "lockstep", "hz"?: 10 | 30, "rd"?: boolean }` (`hz` only for `state`, default 10; `rd` only for `lockstep`, default false). Omitted = `full`. Spectators always get full snapshots. `lockstep` is accepted in the lab room only (else `error LOCKSTEP_LAB_ONLY`, and the player joins with `full`). It can be changed later with `sync` (§2.8). See §3.5 for what each model sends.

### 2.2 `input` (Player Movement & Fire)
Flushed at 30 Hz. Contains one or more 60 Hz input samples.
```json
{
  "t": "input",
  "inputs": [
    {
      "s": 1204,
      "k": 9,
      "a": 1.571,
      "f": 0
    }
  ]
}
```
- `s`: Monotonic sequence number (incremented by 1 per 60 Hz tick).
- `k`: Key bitmask (`1` = UP, `2` = DOWN, `4` = LEFT, `8` = RIGHT).
- `a`: Aim angle in radians, quantized to 0.001 rad.
- `f`: Fire flag (`1` = fire held, `0` = idle). Sent while the button is held; the server and the client's prediction both apply the weapon's cooldown and magazine (`shared/src/sim/combat.ts`).
- `d` (optional, omitted when 0): dash request (Dash power-up). Sent on the input after `Space` and repeated during the predicted burst; the server ignores it without the power-up, without a movement key, during a burst or on cooldown.
- `r` (optional, omitted when 0): reload request (`GAMERULES.md` §6a). The client sets it on the input after `R` and repeats it on every input of its predicted reload, so a lost input can't cancel the reload; the server ignores it while reloading or with a full magazine.
- `sa` (optional, delta and lockstep only): delta — the newest snapshot tick the client has decoded, the **snapshot ack** the server's delta encoder uses as the next base (§3.5); lockstep — the newest tick up to which the client holds **every** record (§3.6). When no input message goes out in a 30 Hz send step (dead, waiting, or idle), the client sends `snapAck` instead (§2.9).
- *Redundancy off (default)*: every input is sent exactly once — the message carries all inputs created since the previous message (normally 2, since inputs are created at 60 Hz and sent at 30 Hz).
- *Redundancy on*: the message carries all unacknowledged inputs, newest last, at most 10. Lost or late messages are then covered by the next one.
- The server consumes one input per tick in sequence order, ignores `s <= lastConsumed` (duplicates/stale) and skips gaps; `ack` in the next snapshot is the last consumed `s`.

### 2.3 `ping` (RTT Measurement)
Sent at 2 Hz.
```json
{
  "t": "ping",
  "id": 42,
  "ct": 1728345600123
}
```
- `id`: Monotonic ping identifier.
- `ct`: Client timestamp in milliseconds.

### 2.4 `perturb` (Debug Teleport)
Forces server-side misprediction to demonstrate reconciliation.
```json
{
  "t": "perturb",
  "dx": 40,
  "dy": 0
}
```
- `dx`, `dy`: Displacement vector applied immediately by the authoritative server.

### 2.5 `bye` (Graceful Disconnect)
```json
{
  "t": "bye"
}
```

### 2.6 `dev` (Developer Switches and Presenter Commands)
Honoured only when the server runs with `NOBU_DEV=1` (`npm run demo`); ignored otherwise (`GAMERULES.md` §19). Every field is optional; at least one must be present (an empty or unknown-only `dev` is rejected as a bad message).
```json
{ "t": "dev", "invincible": true }
{ "t": "dev", "give": "speed" }
{ "t": "dev", "endless": true }
{ "t": "dev", "restart": true, "map": "plaza" }
```
| Field | Acts on | Meaning |
|---|---|---|
| `invincible` (bool) | the sender's player | Hits never kill (re-sent by the client after every reconnect) |
| `give` (power-up kind) | the sender's player | Apply that power-up now, exactly like a pickup, with a `PICKUP` event at the player's position (alive player, running match, rooms with power-ups) |
| `endless` (bool) | the room | Presenter: stop / restart the match clock; while stopped, snapshots carry `match.endless: true` and a frozen `timeLeftMs`. Cleared when the last human leaves; re-sent by the client after a reconnect |
| `restart` (`true`) | the room | Presenter: timed rooms begin a new match on the same map through the countdown (scores 0); the lab puts every player back on its spawn (new `life`) |
| `map` (map id) | the room | Presenter: like `restart`, on that map (the rotation index does not move) |

Room commands may also come from a spectator (the Compare reference pane); player switches need a player.

### 2.6a `start` (Start the Match Now, Phase 7)
```json
{ "t": "start" }
```
- In a **private room** that is `WAITING` (its lobby): honoured from the room's **host** only (the creator; when the host leaves, the longest-connected human), and only with at least 2 participants counting the bots its options add. The countdown begins; bots fill the empty slots only if the host turned bots on. Ignored from anyone else, in any other state and in `main` (which starts by itself).

### 2.6b `roomOptions` (Room Options, owner revision of Phase 7)
```json
{ "t": "roomOptions", "options": {
  "map": "plaza", "maxPlayers": 4, "bots": false, "powerupEveryS": 7, "powerupMax": 4,
  "alwaysOn": { "weapon": "rapid_fire", "shield": false, "speed": true, "piercing": false, "dash": false } } }
```
- The **complete** set of a private room's match options (`GAMERULES.md` §14a, `shared/src/rooms/options.ts`): `map` = a map id or `"rotation"`; `maxPlayers` 2–8; `bots` = fill empty slots; `powerupEveryS` ∈ {0, 3, 5, 7, 10, 15} (0 = none); `powerupMax` 1–8; `alwaysOn.weapon` ∈ `none` / `rapid_fire` / `spread_shot`, plus the `shield`, `speed`, `piercing`, `dash` flags. Anything else invalid → `BAD_MESSAGE`.
- Honoured from the host, while the room is in its lobby; ignored otherwise (no error). Applied at once: the next map is set, players move to spawn points, bots are added / removed, preview power-ups are placed, and everyone's combat state gets the always-on power-ups. Snapshots carry the options in `match.options`.

### 2.7 `lab` (Scripted Movers)
Selects the active scripted movers (PHASES.md C3). Accepted only in rooms with `movers: true` in `game.json` (only `lab`); ignored elsewhere. Any connection in the room may send it, spectators included.
```json
{
  "t": "lab",
  "movers": ["circle", "zigzag", "reversal", "stopgo"]
}
```
- `movers`: the complete set to show (an empty array turns them all off). Unknown names make the message invalid; duplicates are dropped.
- Movers are cleared when the room has no players and no spectators left.

---

### 2.8 `sync` (Switch the Sync Model, Phase 3)
```json
{ "t": "sync", "model": "state", "hz": 30 }
```
- Switches this connection's sync model live: the player stays in the match (same id, no respawn). The server builds a new encoder, so the next message is self-contained (a full `snap`, a `state`, or an `ls` starting with a keyframe). The same model again is ignored (the delta base is kept). Ignored for spectators. `hz` is only valid for `state` (10 or 30).
- `{ "t": "sync", "model": "lockstep", "rd": true }` (Phase 6, lab room only): `rd` picks how lost ticks are recovered — `false` = resend on request (`lsNack`, §2.10), `true` = a redundant window (§3.6). The client sends it whenever its **Rd** chip changes; a lockstep connection that only changes `rd` keeps its encoder. Outside the lab: `error LOCKSTEP_LAB_ONLY` and the model stays.

### 2.9 `snapAck` (Snapshot Ack, Delta Sync)
```json
{ "t": "snapAck", "tick": 4182 }
```
- Same meaning as `input.sa`, sent only when no input message carries it. Ticks are non-negative integers; older acks than the newest one are ignored.

### 2.10 `lsNack` (Lockstep: Ask Again, Phase 6)
```json
{ "t": "lsNack", "from": 4180, "to": 4183 }
{ "t": "lsNack", "from": 0, "to": 0, "key": true }
```
- Rd off: the client holds a record newer than the next one it needs, so ticks `from`..`to` were lost; the server sends them again with its next `ls`. The client asks again if the hole is still open after 1.5 × RTT (at least 50 ms). Ticks it already acknowledged are never resent; a tick the server's 256-tick ring no longer holds → a fresh keyframe (a resync).
- `key: true` (after a hash mismatch, §3.6): start over from a fresh keyframe; acks from before the request don't count.
- `from ≤ to`, both non-negative integers, at most 256 ticks apart.

## 3. Server → Client Messages

### 3.1 `welcome` (Handshake Acknowledgment)
```json
{
  "t": "welcome",
  "v": 1,
  "playerId": 3,
  "room": "main",
  "simHz": 60,
  "snapshotHz": 30,
  "serverTime": 41200.5,
  "nonce": "a8f3c9b"
}
```
- `playerId`: Unique positive integer assigned to the client (`0` for spectators).
- `room`: the room joined — `main`, `lab`, or the private room's code.
- `spectator` (only for spectators): `true`.
- `code`, `host` (private rooms only, Phase 7): the room code (`"blue-fox"`, shown as `BLUE FOX`) and whether this player is the host. The host can change later; snapshots carry the current one (`match.hostId`).
- `simHz`: Authoritative simulation tick frequency (60 Hz).
- `snapshotHz`: World state broadcast frequency (30 Hz).

### 3.2 `snap` (World State Snapshot)
Broadcast at 30 Hz.
```json
{
  "t": "snap",
  "tick": 45120,
  "st": 75200.0,
  "ack": 1204,
  "match": {
    "state": "RUNNING",
    "map": "warehouse",
    "timeLeftMs": 142000,
    "results": null
  },
  "players": [
    {
      "id": 3,
      "name": "PILOT_01",
      "bot": false,
      "x": 350.2,
      "y": 210.5,
      "alive": true,
      "life": 0,
      "protectMs": 0,
      "respawnMs": 0,
      "score": 4,
      "aim": 0.785,
      "weapon": "rifle",
      "reloading": false,
      "shield": false,
      "fast": true
    }
  ],
  "projectiles": [
    {
      "id": 99,
      "owner": 3,
      "x": 420.0,
      "y": 210.5,
      "dx": 1.0,
      "dy": 0.0
    }
  ],
  "pickups": [
    { "id": 17, "x": 812, "y": 233, "kind": "dash" }
  ],
  "me": {
    "weapon": "rifle",
    "weaponTicks": 412,
    "ammo": 23,
    "reserve": 30,
    "reloadTicks": 0,
    "cooldownTicks": 3,
    "speedTicks": 140,
    "pierceTicks": 0,
    "dashTicks": 0,
    "dashBurstTicks": 0,
    "dashCooldownTicks": 0
  },
  "events": [
    {
      "eid": 881,
      "type": "PROJECTILE_HIT",
      "tick": 45118,
      "target": "obstacle",
      "x": 450.0,
      "y": 210.5
    }
  ]
}
```

While a Presenter has stopped the match clock (`dev.endless`, §2.6), `match` also carries `"endless": true` and `timeLeftMs` stays frozen.

- `tick`: Monotonic simulation tick. Snapshots with `tick <= lastAppliedTick` are dropped.
- `ack`: Highest input sequence processed for the recipient client (`0` in spectator snapshots).
- `players[].mover` (optional): set only on scripted lab movers (`"circle"`, `"zigzag"`, `"reversal"`, `"stopgo"`). Movers look like remote players (`bot: true`, `alive: true`, `life: 1`, `score: 0`) so interpolation treats them like any other remote entity. Their position is exactly `moverPath(pattern, tick / 60)` from `shared/src/sim/movers.ts`, so clients can compute the true position at any server time.
- (A Phase 7 `match.waitMsLeft` — a quick-match join window — was removed with that window the same day.)
- `match.code`, `match.hostId`, `match.options` (Phase 7, private rooms only): the room code, the host's player id (who may `start` and send `roomOptions`) and the current room options (§2.6b). In a private room's lobby `pickups` also carries preview power-ups (where they can appear) and players are `alive` on spawn points (they can't move until the match).
- Always-on power-ups (room options) appear in the receiver's combat state (`me`) as timers of **−1** (permanent): `weaponTicks`, `speedTicks`, `pierceTicks`, `dashTicks`; a permanent weapon has `reserve` −1 (unlimited reloads).
- `match.map`: the map being played (`neon`, `warehouse`, `plaza`, `overgrown`; `GAMERULES.md` §3). It changes only at `COUNTDOWN`; the client switches its art and its prediction geometry when it does.
- `players[]`: `aim` (radians, sprite rotation), `weapon` (`handgun` | `rifle` | `shotgun`), `reloading`, `shield` (Shield power-up), `fast` (Speed power-up), `invincible: true` (developer toggle; omitted when off). Movers send `aim: 0`, `weapon: "handgun"` and `false` flags.
- `projectiles[].pierce: true` (omitted when false): fired under the Piercing power-up, passes through obstacles.
- `pickups`: power-ups on the map, at random spots; `id` is unique per room (a new id for every power-up). At most one per participant (`powerups.perPlayers` = 1); empty outside `RUNNING` and always empty in `lab`. Pickups are never predicted.
- `me` (absent for spectators): the recipient's own weapon state (`CombatState`, `shared/src/sim/combat.ts`), exact to the acknowledged input (`*Ticks` count inputs, 60 per second; `reserve: -1` = unlimited). The client replays its unacknowledged inputs on top of it, like its position.
- `events`: Array of redundant event entries covering the last 500 ms; deduplicated via `eid`.
- Size: these Phase 2.5 fields make a 4-player main-room snapshot ≈ 2.1 kB (≈ 1.6 kB before), ≈ 510 kbps at 30 Hz — the full-snapshot baseline for Phase 3 (`docs/ASSUMPTIONS.md` #40).
- Sent by the **full** sync model, to spectators, and by the delta model at start-up and as a fallback (§3.5). A delta fallback may carry, besides the last 500 ms of events, older events the client has not confirmed yet.

### 3.2a `snapDelta` (Delta Snapshot, Phase 3)
```json
{
  "t": "snapDelta", "tick": 4184, "base": 4180, "st": 69733.3, "ack": 4183,
  "players": [ { "id": 3, "x": 512.25, "y": 300.5 }, { "id": 9, "aim": 1.2, "del": ["invincible"] } ],
  "gone": [7],
  "events": [ { "eid": 812, "type": "PICKUP", "tick": 4183, "playerId": 3, "kind": "speed" } ]
}
```
- The changes from snapshot `base` (one the client acknowledged) to snapshot `tick`. Applying them to the base gives exactly the full snapshot of `tick` (`shared/src/sync/delta.ts`, `applyDelta`), except `events`.
- `players` / `projectiles`: one entry per entity that changed, `{ id, …changed fields }`; `del` lists optional fields that disappeared (`invincible`, `mover`, `pierce`). An id the base doesn't have is a new entity and comes complete. `gone` / `projGone`: ids that disappeared. Values are exact (no rounding), so reconciliation stays bit-exact.
- `match`, `me`: changed fields only (same `del` rule); `me: null` = no longer present. `pickups`: the whole list, only when it changed. Fields with no change are omitted.
- `events`: every event the client has not confirmed (newer than the base), so an event repeats until an acknowledged snapshot contained it — even beyond the room's 500 ms window.
- The client keeps the last 64 decoded snapshots; a delta whose base it doesn't have is dropped and counted (never half-applied). Loss, duplication and reordering are harmless because each delta names its base.

### 3.2b `state` (State Sync, Phase 3)
```json
{ "t": "state", "hz": 10, "tick": 4182, "st": 69700.0, "ack": 4181,
  "players": [ { "id": 3, "x": 510.2, "y": 300.5, "vx": 200, "vy": 0, "...": "every snap field" } ],
  "...": "match, projectiles, pickups, me, events as in snap" }
```
- A complete `snap` body plus each player's (and mover's) velocity `vx`, `vy` in px/s, measured over the last server tick (a move > 30 px in one tick — respawn, perturb — counts as 0). Sent every 6th tick at 10 Hz or every snapshot tick at 30 Hz; `hz` says which.
- The client extrapolates remote entities from it with no interpolation delay (`client/src/net/extrapolate.ts`); projectiles move along `dx`, `dy` at the projectile speed.

### 3.3 `pong` (RTT Echo & Server Health)
```json
{
  "t": "pong",
  "id": 42,
  "ct": 1728345600123,
  "st": 75201.2,
  "tickHz": 60.0,
  "tickMs": 0.45,
  "tickMsMax": 1.2
}
```

### 3.4 `error` (Failure Response)
```json
{
  "t": "error",
  "code": "ROOM_FULL",
  "msg": "Maximum room capacity reached"
}
```
- Codes: `ROOM_FULL`, `BAD_VERSION`, `BAD_MESSAGE` (the client stops), and `LOCKSTEP_LAB_ONLY` (Phase 6: a lockstep request outside the lab room; not fatal — the connection keeps its previous model and the client switches back to it).
- Phase 7: `ROOM_NOT_FOUND` (no private room with that code — it may have closed 60 s after its last human left) and `ROOM_LIMIT` (the server has `privateRooms.max` rooms) answer a `hello`; the client stops retrying and shows the reason. On the game server, `NOT_ALLOWED` answers an operator message (`dev`, `perturb`, `lab`, `spectate`, the `lab` room) and `SYNC_FIXED` a `sync` to anything but `delta`; after the welcome both are not fatal (the request is just refused).

### 3.5 Sync models (Phase 3)

| Model | Messages | Lab, 3 panes + 4 movers (wire kbps) | Main room, 4 players firing |
|---|---|---|---|
| `full` | `snap` every 2 ticks (30 Hz) | ≈ 1.85 kB, ≈ 451 kbps | ≈ 2.5 kB, ≈ 600 kbps |
| `delta` | `snapDelta` against the newest acknowledged snapshot (if ≤ 1 s old, from a 32-snapshot ring), else `snap` (fallback) | ≈ 0.25–0.35 kB, ≈ 60–92 kbps (15–19 %) | ≈ 0.6–0.8 kB, ≈ 140–190 kbps |
| `state` 10 / 30 | `state` at 10 or 30 Hz | ≈ 2.0 kB: ≈ 160 / ≈ 480 kbps | — |

| `lockstep` (lab only) | `ls` every 2 ticks: the consumed inputs per tick (§3.6) | ≈ 35–40 kbps Rd off, ≈ 90–120 kbps Rd on (at 50 ms + 5 % loss) | not available |

Wire kbps include 28 bytes per message (the emulator's accounting). Measured in the harness and in the browser (`docs/ASSUMPTIONS.md` #49–#59, #97–#108).

### 3.6 `ls` (Lockstep Tick Records, Phase 6)
```json
{ "t": "ls", "tick": 4184, "ack": 812,
  "recs": [
    { "k": 4183, "in": { "17": [8] } },
    { "k": 4184, "in": { "17": [8, 9], "18": [0] } }
  ] }
```
Sent instead of snapshots to a lockstep connection (lab room only), every 2 ticks (30 Hz).
- `tick`: the server's newest tick (the client's clock: tick × 1000/60 ms is the server time). `ack`: the receiver's newest consumed input sequence (drops its pending inputs, measures Input → Screen).
- `recs`: tick records, oldest first. A record `{ k, in?, key?, h? }` says what happened in tick `k`:
  - `in`: the **movement keys the server consumed** for each player id in that tick, in order (0, 1, or 2 when it worked off a backlog); a player without an entry didn't move. Applying them with `stepPlayer` to the world after tick `k − 1`, then putting every mover at `moverPath(pattern, k / 60)`, gives the server's world after tick `k` exactly (`applyRecord`, `shared/src/sync/lockstep.ts`).
  - `key`: a **keyframe** — the complete lab world after tick `k`: `{ map, players: [{ id, name, x, y, life }], movers: [{ id, pattern }] }`. It replaces the world (and `in`). The server attaches one to the next tick after anything inputs don't explain: a join, a leave, a nudge (`perturb`), a RESTART or map change (`dev`), a mover change (`lab`).
  - `h`: every 30 ticks, the server's `hashWorld` after tick `k` (FNV-1a over the IEEE bits of every player's and mover's id, x, y, sorted by id; an unsigned 32-bit integer). A client whose hash differs counts a **desync** and sends `lsNack { key: true }`.
- **Start / resync:** the first message (and the one after a resync) carries a *base* — a keyframe of the current tick — which repeats in every message until the client acks that tick.
- **Rd off:** every record is sent once; holes come back via `lsNack` (§2.10). **Rd on:** every message carries every record after the client's ack (at most 60); further behind → a resync.
- The client plays the ticks out 2 ticks behind its estimate of the server's tick; a missing tick freezes the world (a **stall**), and afterwards it catches up with up to 3 ticks per frame. A keyframe further on replaces missing ticks.

---

## 4. Game Events Reference

Every event also carries `eid` (unique, used for de-duplication) and `tick`. Events drive cosmetics and the kill feed only; everything that matters is also in the snapshot state:
- `PLAYER_JOIN`: `{ type, playerId }`
- `PLAYER_LEAVE`: `{ type, playerId }`
- `PLAYER_FIRE`: `{ type, playerId, projectileId, weapon, x, y }` (once per shot; `projectileId` = the first pellet)
- `PROJECTILE_SPAWN`: `{ type, projectileId, x, y }`
- `PROJECTILE_HIT`: `{ type, projectileId, target: "player"|"obstacle"|"boundary", x, y }`
- `PLAYER_DEATH`: `{ type, victim, killer, x, y }`
- `PLAYER_RESPAWN`: `{ type, playerId, x, y }`
- `SCORE_UPDATE`: `{ type, playerId }` (scores themselves are state: `players[].score`)
- `MATCH_START`: `{ type }`
- `MATCH_END`: `{ type }` (results are state: `match.results` during `ENDED`)
- `RELOAD_START`: `{ type, playerId, weapon }` (manual or automatic)
- `PICKUP`: `{ type, playerId, kind, x, y }`
- `SHIELD_HIT`: `{ type, victim, killer, x, y }` (the Shield power-up absorbed a hit)

---

## 5. Emulator (game-agnostic proxy)

The emulator never parses or reassembles application messages, and it imports nothing from the game; `emulator/README.md` describes using it with any app. Each WebSocket frame or UDP datagram is one packet, accounted as payload bytes + 28 bytes (a UDP/IP header). Payloads are forwarded byte for byte: WS text stays text, WS binary stays binary.

### 5.1 Routes and sessions

A **route** listens on one port and forwards every client to one target. Its id is `<proto>:<port>`:

| Route (`npm run demo`) | Listens on | Target |
|---|---|---|
| `ws:9000` | all interfaces, TCP 9000 | `ws://127.0.0.1:8080` |
| `udp:9100` | all interfaces, UDP 9100 | `127.0.0.1:8081` |

Routes come from the command line (`--route <proto>:[host:]<port>=<target>`, repeatable; the old `--listen <port> --target <ws-url>` = one WS route) or are added and removed at runtime through the control API (§5.2), which is what the dashboard does. `npm run emulator` starts with none.

Every client gets a **session** with independent `up` (client → target) and `down` (target → client) links:
- **WS route:** one session per connection, with its own upstream connection to the target (path and query passed on). `?label=` names the session; `NetClient` uses a unique label (`<name>-<4 chars>`) so the game can find its own session.
- **UDP route:** one session per client source address `ip:port` (NAT-like), with its own upstream UDP socket on an ephemeral port, so the target sees one peer per client and replies reach the right client. A session ends after `--udp-idle-ms` (30 s) without traffic; a later datagram opens a new one (its label is remembered). Default label `udp <ip:port>`; network players rename theirs `UDP-n` with `session.label`.
- **Limits:** at most `--max-sessions` (64) per route; further clients are refused and counted in the route's `refused`.

**Defaults and presets per route:** each route keeps defaults for its up and down links and an active preset name. A new session starts from its route's defaults. The global defaults (target `all`) apply to routes added later.

**Bind addresses** (`docs/PHASE5_PLAN.md` D7, D15):
- **Control port:** 127.0.0.1 only (`--control-host` to override, with a warning).
- **Data routes:** all interfaces by default, so other machines can join; `--route udp:127.0.0.1:9100=…` or the dashboard's *this machine only* binds a route locally.
- **Server:** listens on all interfaces for WS `:8080` and UDP `:8081`; `--host` / `NOBU_HOST` sets the address.

### 5.2 Control API (`http://127.0.0.1:9001`, never impaired)

One HTTP server:
- `GET /`, `/app.js`, `/style.css` serve the dashboard (a fixed list of files; anything else is 404).
- A WebSocket upgrade on the same port opens the control API. Browser pages are accepted only from an allowlisted `Origin`: `http://127.0.0.1:9001`, `http://localhost:9001`, `http://localhost:5173`, `http://127.0.0.1:5173`, plus `--allow-origin <url>`. Clients without an `Origin` (Node tools) are accepted.

**Targets** of `set` / `preset` / `reset`:
- `"all"`: every route, plus the defaults for routes added later;
- a route id (`"ws:9000"`): its defaults and its sessions;
- a session id (`"s3"`) or a session label: that session only.

The game sends **`ws:9000`** wherever it used to send `"all"` (Network Lab, Compare, Presenter), so its presets never reach the network players. Presenter step Q13 targets `udp:9100`. An unknown target is answered with an `error` event.

UI → emulator:

| Command | Meaning |
|---|---|
| `{ "cmd": "get" }` | Reply with a `state` message |
| `{ "cmd": "set", "target", "direction", "patch" }` | Merge `patch` into the link config (unknown keys, wrong types, negative or non-finite numbers are dropped; percentages capped at 100). `direction`: `"both"`, `"up"` or `"down"` — for a route or `all`, the defaults of that direction only. Marks the route(s) `Custom` |
| `{ "cmd": "preset", "target", "name" }` | Apply a complete preset (`Baseline`, `Café Wi-Fi`, `Mobile 4G`, `Transatlantic`, `Nightmare`) to both directions; fields not in the preset get defaults |
| `{ "cmd": "preset", "target", "name", "config" }` | **Ad-hoc preset**: `config` (a partial link config) is completed from the defaults (unknown keys and wrong types are ignored) and applied like a named preset; `name` is reported as the active preset. Used by the Compare view and the Presenter, e.g. `{ "name": "Jitter 50±30", "config": { "latencyMs": 50, "jitterMs": 30 } }` |
| `{ "cmd": "reset", "target" }` | Back to zero impairment (preset `Baseline`) |
| `{ "cmd": "seed", "value" }` | Reseed every session's RNG |
| `{ "cmd": "subscribe", "packets": true }` | Start/stop the packet-event stream |
| `{ "cmd": "route.add", "proto", "port", "target", "host"? }` | Start a route (Phase 5). `proto` `"ws"` (target `ws://…`) or `"udp"` (target `host:port`); `host` omitted = all interfaces. Answered with `ack` (`id`) or `error` (bad spec, port in use, route exists); a failed bind leaves nothing open |
| `{ "cmd": "route.remove", "id" }` | Close a route's sessions and its listener; `ack` or `error` |
| `{ "cmd": "session.label", "peer" \| "session", "label", "route"? }` | Rename the session of client address `peer` (`"127.0.0.1:53114"`) or id `session`, optionally only within `route`; 1–40 characters |

Emulator → UI:

| Event | Contents |
|---|---|
| `{ "evt": "state", "routes", "sessions", "defaults", "defaultsDown", "preset", "presets", "presetConfigs", "control" }` | On connect and on every change. `routes[]`: `id`, `proto`, `host` (`""` = all interfaces), `port`, `target`, `defaults` (up link), `defaultsDown`, `preset` (name, or `"Custom"` after a manual change), `sessions` (count), `refused`. `sessions[]`: `id`, `label`, `route`, `proto`, `peer`, `ageMs`, `up` / `down` (the link configs), `stats` (`{ up, down }` counters at that moment; kept apart because both have a `lossPct`: configured vs measured). `defaults` / `defaultsDown` / `preset`: the global ones (target `all`) |
| `{ "evt": "stats", "t", "sessions": [{ "id", "label", "route", "up", "down" }], "routes": [{ "id", "sessions", "refused" }] }` | Every 500 ms. Per direction: cumulative `pktsIn`, `pktsDelivered`, `pktsDroppedLoss`, `pktsDroppedQueue`, `pktsDuplicated`, `pktsReordered`, `lossPct`; last-second `throughputKbps`, `lossPctWindow`, `pktsInWindow`, `deliveredWindow`; current **`queueMs`** (Phase 4): how long a packet arriving now would wait for the bandwidth cap before it starts transmitting (0 without a cap; packets that would wait longer than `queueLimitMs` are tail-dropped as `dropped-queue`) |
| `{ "evt": "packets", "items": [{ "sid", "dir", "size", "preview", "fate", "delayMs", "t", "reordered"? }] }` | Every 100 ms while subscribed; the newest ≤ 60 events. `fate`: `delivered`, `dropped-loss`, `dropped-queue`, `duplicated`. `t` = when the packet reached the emulator (ms since epoch); `delayMs` = how long it was held, in whole ms (queue + latency + jitter + reorder hold; for `dropped-queue`, the queue wait it was refused). `preview`: the first 64 characters as text, or `hex …` for non-printable bytes. **`reordered: true`** (Phase 4) marks a delivery the reorder stage held back by `reorderDelayMs`, so packets sent after it overtook it |
| `{ "evt": "ack", "cmd", "id" }` | `route.add` / `route.remove` succeeded |
| `{ "evt": "error", "cmd", "msg" }` | A command was refused (unknown target, bad route, port in use, …) |

Link config fields (defaults): `latencyMs` 0, `jitterMs` 0, `jitterDist` `"normal"`, `lossPct` 0, `lossModel` `"random"` (or `"burst"`, Gilbert-Elliott), `burstLen` 4, `duplicatePct` 0, `reorderPct` 0, `reorderDelayMs` **80**, `bandwidthKbps` 0 (unlimited), `queueLimitMs` 400, `allowJitterReorder` false. The reorder delay must exceed the input send interval + one tick (~50 ms) for reordered inputs to act like loss (see `docs/ASSUMPTIONS.md` #10).

### 5.3 Server UDP adapter (`:8081`)

`server/src/udp.ts` gives every remote `address:port` its own connection in the `GameServer` core, with fragments both ways (§1.1). `bye` or 5 s of silence removes the connection, and its address is forgotten; a later datagram from it starts a new connection (a new `hello` is needed). The Node client transport is `scripts/lib/udp-transport.ts` (`udp://host:port`); it is never part of the browser bundle.

## 6. The game server (Phase 7)

`npm run dev` and `npm start` run the same server (`server/src/main.ts`) with `--game` (docs/PHASE7_PLAN.md D3, D6, D7):

| | Demo server (`npm run demo`) | Game server (`--game`) |
|---|---|---|
| Rooms | `main`, `lab`, private rooms | `main`, private rooms (`lab` → `NOT_ALLOWED`) |
| Sync models | any, per connection (`hello.sync`, `sync`) | `delta` for everyone (`sync` → `SYNC_FIXED`) |
| `dev`, `perturb`, `lab`, spectators | yes (`dev` only with `NOBU_DEV=1`) | `NOT_ALLOWED`; refuses to start at all with `NOBU_DEV=1` |
| `start`, `roomOptions` | private-room hosts | private-room hosts |
| UDP `:8081` | yes | only with `--udp` |
| HTTP | 426 (WebSocket only) | with `--static <dir>`: the built game (below) |

**Static files** (`--static`, `server/src/static.ts`, Node built-ins only): `GET` / `HEAD` only (others → 405); paths are resolved inside the directory, symlinks included (no `..`; anything else → 404); `/` → `index.html`. Vite's hashed files under `/assets/` get `Cache-Control: public, max-age=31536000, immutable`, everything else `no-cache`. HTML, JS, CSS, JSON and SVG are compressed with brotli (or gzip, by `Accept-Encoding`) once and kept in memory; images (WebP) and sounds (OGG) are sent as they are. The art lives under `/low/`, `/medium/` and `/high/` (Graphics Quality tiers, `npm run assets`).

**Client address:** the game connects to `ws(s)://<page host>/ws` (`wss` when the page is `https`); `?server=host:port` (or a full `ws://` URL) on the page address overrides it — e.g. to route players through the standalone emulator. A share link `?room=blue-fox` fills in the JOIN ROOM code.
