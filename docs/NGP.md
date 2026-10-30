# NGP — the NoBu Game Protocol

An RFC-style summary of the application-layer protocol between a NoBu Shooter client and the game server. It states the rules; `PROTOCOL.md` has every field of every message and is the reference. Constants come from `shared/src/config/net.json` and `game.json`.

## 1. Purpose and scope

NGP lets a client join a match, send its inputs and receive the state of the world in real time. It is an **application-layer** protocol: it sits above WebSocket (over TCP) or UDP and knows nothing about IP, ports or routes. The emulator forwards its bytes without reading them.

## 2. Layering

```text
 NGP messages (JSON text)             ← this document
 WebSocket frames  |  UDP datagrams (+ NGP fragments, §6)
 TCP               |  UDP
 IP  →  link (Ethernet / Wi-Fi / loopback)
```

| Binding | Used by | Unit of transfer | Server address |
|---|---|---|---|
| WebSocket over TCP | browsers, Node test clients | one text frame = one message | `ws://host:8080/` or `/ws` (demo: via emulator `:9000`) |
| UDP | network players (swarm), tests | one datagram, or several fragments = one message | `host:8081` (demo: via emulator `:9100`) |

A peer is one WebSocket connection, or one UDP `ip:port`.

## 3. Message format

- Every message is one UTF-8 JSON object with a string field `t` (the type). Nothing else is framed: the transport delimits messages (a frame, a datagram).
- A message is at most 64 kB (WebSocket limit); on UDP, anything over **1200 bytes** is fragmented (§6).
- A server that cannot parse a message or fails validation answers `error BAD_MESSAGE`. Unknown fields are ignored; wrong types are rejected (`validateClientMsg`, `shared/src/protocol/messages.ts`).
- Version: `hello.v` must be `1`, else `error BAD_VERSION`.

| Direction | Types |
|---|---|
| client → server | `hello`, `input`, `ping`, `snapAck`, `sync`, `start`, `roomOptions`, `bye`; demo only: `dev`, `perturb`, `lab`, `lsNack` |
| server → client | `welcome`, `snap`, `snapDelta`, `state`, `ls`, `pong`, `error` |

## 4. Session state machine

```text
 CLOSED ──hello──► HELLO_SENT ──welcome──► JOINED ──bye / 5 s silence──► CLOSED
              ▲  │ (resend every 250 ms,
              └──┘  give up after 10 s)
```

1. **Join.** The client sends `hello {v, name, room, nonce}` and **repeats it every 250 ms** until a `welcome` with the same `nonce` arrives; it gives up after 10 s. A `hello` repeated by a joined peer with the same `nonce` gets the same `welcome` again (idempotent). This replaces a handshake: it works over UDP, which has none. An optional `pid` (8–64 characters, `A-Za-z0-9_-`) is the client's stable identity: a peer that joins a room with a `pid` already seated there takes over its old connection and seat (a refresh or a dropped network keeps the player and score).
2. **Play.** The client sends `input` at 30 Hz and `ping` at 2 Hz. The server sends a snapshot every 2 ticks (30 Hz).
3. **Leave.** `bye`, a closed socket, or **5 s without any message** (`timeoutMs`) removes the peer. A later datagram from the same UDP address starts a new connection and needs a new `hello`.

## 5. Timing and limits

| Item | Value |
|---|---|
| Simulation tick | 60 Hz (server, and the client's prediction) |
| Snapshot rate | 30 Hz (every 2nd tick) |
| Input send rate | 30 Hz; each message carries ≥ 2 inputs (created at 60 Hz) |
| Ping interval | 500 ms |
| Hello retry / give up | 250 ms / 10 s |
| Peer timeout | 5 s |
| Rate limit | 120 messages per second per peer; excess is ignored |
| Inputs per message | at most 20 (redundancy window: at most 10) |
| Name length | 12 characters |

## 6. Reliability rules (the application provides what UDP doesn't)

| Problem | Rule |
|---|---|
| Lost `hello` / `welcome` | The client repeats `hello`; the server answers every repeat the same way (§4). |
| Lost, duplicated or reordered inputs | Each input has a sequence number `s`. The server ignores `s ≤ lastConsumed`, sorts the rest and skips gaps. With *redundancy* on, a message carries all unacknowledged inputs (≤ 10), so a lost message is covered by the next. |
| Input acknowledgement | Every snapshot carries `ack` = the last input the server consumed. The client drops inputs up to `ack` and replays the rest on top of the server position (reconciliation). |
| Lost, duplicated or reordered snapshots | Each carries its `tick`; the client drops any with `tick ≤` the newest applied one. A `snapDelta` names its `base`; if the client does not have that base it drops the delta, and the server falls back to a full `snap` when its newest acknowledged base is missing or older than 1 s. |
| Snapshot acknowledgement | `input.sa` (or `snapAck` when no input goes out) = newest snapshot tick decoded. |
| Events | Repeated until confirmed (500 ms window, or until acked in delta mode); the client de-duplicates by `eid`. |
| Message larger than 1200 B (UDP only) | The sender splits it into fragments `~<msgId>.<index>/<count>|<bytes>`; the receiver reassembles in any order, ignores duplicates, and drops the message if a fragment is missing after **250 ms** or more than 8 messages are incomplete. One lost fragment loses the message. |
| Congestion | None: NGP has no congestion control. Delta snapshots are the bandwidth answer; the emulator's cap shows what happens without it (queue, then tail drop). |

Over WebSocket, TCP already delivers every frame once, in order; the rules above still hold and cost nothing, so one implementation serves both bindings.

## 7. Errors

`error {code, msg}`. Fatal for the client: `ROOM_FULL`, `BAD_VERSION`, `BAD_MESSAGE`, `ROOM_NOT_FOUND`, `ROOM_LIMIT`. Not fatal (the request is refused, the connection stays): `LOCKSTEP_LAB_ONLY`, `NOT_ALLOWED`, `SYNC_FIXED`.

## 8. Security considerations

There is no encryption (no TLS) and no authentication: the protocol is for a trusted LAN. The server is authoritative, so a client can only send keys and aim, never a position. Limits: message size, message rate, room count (32), fragment count (≤ 64) and pending reassemblies (≤ 8). The game server refuses operator messages (`dev`, `perturb`, `lab`, spectating).
