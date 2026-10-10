# NoBu Shooter — Wire Protocol Specification

Version: 1.0  
Source of truth: `shared/src/protocol/messages.ts` (types + validators). Originally specified in `docs/archive/SPEC-v1.md` §8.

---

## 1. Overview & Transport Caveat

All messages on the wire are UTF-8 JSON text frames carrying exactly one message per frame with a discriminatory type field `"t"`.

> **Transport Caveat**: The links between the browser, emulator, and authoritative game server are loopback TCP connections. TCP never drops or reorders packets at the socket layer. The standalone **Network Emulator** is the sole subsystem that drops, delays, duplicates, or reorders frames. By intercepting frames prior to forwarding, the application observes authentic UDP datagram semantics without head-of-line blocking.

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
- `name`: Callsign string (truncated to 12 chars by the server, GAMERULES.md §4).
- `room`: `"main"` (full match with bots) or `"lab"` (movement-only sandbox used by the Compare view; every lab player spawns at the same point, `rooms.lab.spawn`, so all panes' players start together).
- `nonce`: Unique client-generated session identifier for idempotent handshake retry.
- `spectate` (optional, boolean): join as a **spectator** — the connection receives snapshots but gets no player, doesn't count toward the room's player cap, and its `input`/`perturb` messages are ignored. The Compare view's reference pane uses this, connecting directly to the server (no emulator).
- `sync` (optional, Phase 3): the connection's **sync model**, `{ "model": "full" | "delta" | "state", "hz"?: 10 | 30 }` (`hz` only for `state`, default 10). Omitted = `full`. Spectators always get full snapshots. It can be changed later with `sync` (§2.8). See §3.5 for what each model sends.

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
- `sa` (optional, delta sync only): the newest snapshot tick the client has decoded — the **snapshot ack** the server's delta encoder uses as the next base (§3.5). When no input message goes out in a 30 Hz send step (dead, waiting, or idle), the client sends `snapAck` instead (§2.9).
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

### 2.6 `dev` (Developer Switches)
Honoured only when the server runs with `NOBU_DEV=1` (`npm run demo`); ignored otherwise (`GAMERULES.md` §19). The client re-sends it after every reconnect.
```json
{ "t": "dev", "invincible": true }
```

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
- Switches this connection's sync model live: the player stays in the match (same id, no respawn). The server builds a new encoder, so the next message is self-contained (a full `snap`, or a `state`). The same model again is ignored (the delta base is kept). Ignored for spectators. `hz` is only valid for `state` (10 or 30).

### 2.9 `snapAck` (Snapshot Ack, Delta Sync)
```json
{ "t": "snapAck", "tick": 4182 }
```
- Same meaning as `input.sa`, sent only when no input message carries it. Ticks are non-negative integers; older acks than the newest one are ignored.

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
- `spectator` (only for spectators): `true`.
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
- `tick`: Monotonic simulation tick. Snapshots with `tick <= lastAppliedTick` are dropped.
- `ack`: Highest input sequence processed for the recipient client (`0` in spectator snapshots).
- `players[].mover` (optional): set only on scripted lab movers (`"circle"`, `"zigzag"`, `"reversal"`, `"stopgo"`). Movers look like remote players (`bot: true`, `alive: true`, `life: 1`, `score: 0`) so interpolation treats them like any other remote entity. Their position is exactly `moverPath(pattern, tick / 60)` from `shared/src/sim/movers.ts`, so clients can compute the true position at any server time.
- `match.map`: the map being played (`neon`, `warehouse`, `plaza`, `overgrown`; `GAMERULES.md` §3). It changes only at `COUNTDOWN`; the client switches its art and its prediction geometry when it does.
- `players[]`: `aim` (radians, sprite rotation), `weapon` (`handgun` | `rifle` | `shotgun`), `reloading`, `shield` (Shield power-up), `fast` (Speed power-up), `invincible: true` (developer toggle; omitted when off). Movers send `aim: 0`, `weapon: "handgun"` and `false` flags.
- `projectiles[].pierce: true` (omitted when false): fired under the Piercing power-up, passes through obstacles.
- `pickups`: power-ups on the map, at random spots; `id` is unique per room (a new id for every power-up). At most ⌊participants / 2⌋; empty outside `RUNNING` and always empty in `lab`. Pickups are never predicted.
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

### 3.5 Sync models (Phase 3)

| Model | Messages | Lab, 3 panes + 4 movers (wire kbps) | Main room, 4 players firing |
|---|---|---|---|
| `full` | `snap` every 2 ticks (30 Hz) | ≈ 1.85 kB, ≈ 451 kbps | ≈ 2.5 kB, ≈ 600 kbps |
| `delta` | `snapDelta` against the newest acknowledged snapshot (if ≤ 1 s old, from a 32-snapshot ring), else `snap` (fallback) | ≈ 0.25–0.35 kB, ≈ 60–92 kbps (15–19 %) | ≈ 0.6–0.8 kB, ≈ 140–190 kbps |
| `state` 10 / 30 | `state` at 10 or 30 Hz | ≈ 2.0 kB: ≈ 160 / ≈ 480 kbps | — |

Wire kbps include 28 bytes per message (the emulator's accounting). Measured in the harness and in the browser (`docs/ASSUMPTIONS.md` #49–#59).

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

The emulator never parses game messages; each WebSocket frame is one packet (accounted as payload bytes + 28 bytes UDP/IP header).

### 5.1 Data port (`ws://127.0.0.1:9000`)
Clients connect here instead of to the server. Every connection becomes a **session** with its own upstream connection to `--target` and independent `up` (client → server) / `down` links. The query parameter `?label=` is stored as the session's display name. `NetClient` uses a unique label (`<name>-<4 chars>`) so the UI can find its own session in the stats.

### 5.2 Control port (`ws://127.0.0.1:9001`, never impaired)

UI → emulator:

| Command | Meaning |
|---|---|
| `{ "cmd": "get" }` | Reply with a `state` message |
| `{ "cmd": "set", "target", "direction", "patch" }` | Merge `patch` into the link config. `target`: `"all"` (also the default for new sessions), a session id or a label. `direction`: `"both"`, `"up"` or `"down"` |
| `{ "cmd": "preset", "target", "name" }` | Apply a complete preset (`Baseline`, `Café Wi-Fi`, `Mobile 4G`, `Transatlantic`, `Nightmare`); fields not in the preset get defaults |
| `{ "cmd": "preset", "target", "name", "config" }` | **Ad-hoc preset**: `config` (a partial link config) is completed from the defaults (unknown keys and wrong types are ignored) and applied like a named preset; `name` is reported as the active preset. Used by the Compare view, e.g. `{ "name": "Jitter 50±30", "config": { "latencyMs": 50, "jitterMs": 30 } }` |
| `{ "cmd": "reset", "target" }` | Back to zero impairment |
| `{ "cmd": "seed", "value" }` | Reseed the RNG |
| `{ "cmd": "subscribe", "packets": true }` | Start/stop the packet-event stream |

Emulator → UI:

| Event | Contents |
|---|---|
| `{ "evt": "state", "sessions", "defaults", "preset", "presets" }` | On connect and on every change. `preset` is the name of the preset last applied to `all`, or `"Custom"` after a manual change |
| `{ "evt": "stats", "t", "sessions": [{ "id", "label", "up", "down" }] }` | Every 500 ms. Per direction: cumulative `pktsIn`, `pktsDelivered`, `pktsDroppedLoss`, `pktsDroppedQueue`, `pktsDuplicated`, `pktsReordered`, `lossPct`; last-second `throughputKbps`, `lossPctWindow`, `pktsInWindow`, `deliveredWindow` |
| `{ "evt": "packets", "items": [{ "sid", "dir", "size", "preview", "fate", "delayMs", "t" }] }` | Every 100 ms while subscribed; the newest ≤ 60 events. `fate`: `delivered`, `dropped-loss`, `dropped-queue`, `duplicated` |

Link config fields (defaults): `latencyMs` 0, `jitterMs` 0, `jitterDist` `"normal"`, `lossPct` 0, `lossModel` `"random"` (or `"burst"`, Gilbert-Elliott), `burstLen` 4, `duplicatePct` 0, `reorderPct` 0, `reorderDelayMs` **80**, `bandwidthKbps` 0 (unlimited), `queueLimitMs` 400, `allowJitterReorder` false. The reorder delay must exceed the input send interval + one tick (~50 ms) for reordered inputs to act like loss (see `docs/ASSUMPTIONS.md` #10).

