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

