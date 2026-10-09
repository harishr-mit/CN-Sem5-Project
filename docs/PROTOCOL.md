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
- `room`: `"main"` (full match with bots) or `"lab"` (sandbox for A/B testing).
- `nonce`: Unique client-generated session identifier for idempotent handshake retry.

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
- `f`: Fire flag (`1` = fire pressed, `0` = idle).
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
- `playerId`: Unique positive integer assigned to the client.
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
      "score": 4
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
- `ack`: Highest input sequence processed for the recipient client.
- `events`: Array of redundant event entries covering the last 500 ms; deduplicated via `eid`.

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
- `PLAYER_FIRE`: `{ type, playerId, projectileId }`
- `PROJECTILE_SPAWN`: `{ type, projectileId, x, y }`
- `PROJECTILE_HIT`: `{ type, projectileId, target: "player"|"obstacle"|"boundary", x, y }`
- `PLAYER_DEATH`: `{ type, victim, killer, x, y }`
- `PLAYER_RESPAWN`: `{ type, playerId, x, y }`
- `SCORE_UPDATE`: `{ type, playerId }` (scores themselves are state: `players[].score`)
- `MATCH_START`: `{ type }`
- `MATCH_END`: `{ type }` (results are state: `match.results` during `ENDED`)

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

