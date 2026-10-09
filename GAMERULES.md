# NoBu Shooter — Game Rules

**Audience:** the implementing agent. This file is the **single source of truth for gameplay rules and game constants**. Architecture, protocol, netcode, emulator and UI were specified in `docs/archive/SPEC-v1.md` (v1 build spec, archived); current goals and phases are in `PHASES.md`. Every rule below is a decision, not a suggestion. Do not add mechanics that are not listed here (see §16).

Constants live in one file, `shared/src/config/game.json` (§15), imported by client, server and tests. Never hard-code a number from this document in game logic.

---

## 1. Objective

NoBu Shooter is a real-time, top-down, free-for-all arena shooter. Each player controls one circular character, moves with the keyboard, aims with the mouse and fires straight-line projectiles. One hit eliminates a player. The player with the most eliminations when the 180-second timer expires wins.

The game is deliberately simple. Its purpose is to make network effects (lag, loss, jitter) visible and measurable. Gameplay depth is a non-goal.

### Controls

| Input | Action |
|---|---|
| `W` `A` `S` `D` (also arrow keys) | Move up / left / down / right. Diagonals are allowed by pressing two keys. |
| Mouse position | Aim. The aim angle is the angle from the player's position to the cursor. |
| Left mouse button (hold) | Fire. Holding fires repeatedly, limited by the server-enforced cooldown. |

---

## 2. Match lifecycle

A **room** runs one match at a time. The default room is `main`. A second room, `lab`, is a movement-only sandbox (§14).

```text
WAITING ──(participants >= 2)──► COUNTDOWN ──(3 s)──► RUNNING ──(180 s)──► ENDED ──(10 s)──► COUNTDOWN ...
   ▲                                                                                              │
   └────────────────────────(all human players gone)──────────────────────────────────────────────┘
```

| State | Behavior |
|---|---|
| `WAITING` | Fewer than `minParticipants` participants. Players cannot move or fire. UI shows "WAITING FOR PLAYERS". |
| `COUNTDOWN` | 3 s ("3, 2, 1, GO!"). All players are placed at spawn points. Movement and firing are ignored. |
| `RUNNING` | Normal play for exactly 180 s. The server owns the timer. |
| `ENDED` | Movement, firing and projectile spawning are ignored. Remaining projectiles are removed. Final scores are computed and broadcast. Lasts 10 s. |

- A **participant** is a human player or a bot. Bots count toward the 2-participant minimum (§12), so one human alone can play against bots.
- **Late join:** a human may join at any time. During `RUNNING` they spawn immediately with score 0. During `COUNTDOWN` or `ENDED` they join the next match flow normally.
- **Restart:** after `ENDED` the room automatically returns to `COUNTDOWN` with all scores reset to 0 and all players re-spawned. No lobby, no vote.
- **Demo shortcut:** `match.durationMs` is configuration. The default is 180 000. Setting it lower (for example 60 000 via a URL parameter `?match=60`) must work without code changes.
- When the last human leaves, the room removes all bots and returns to `WAITING`.

---

## 3. Arena

A fixed rectangle of **1280 × 720** logical pixels. The origin is the top-left corner; x grows right, y grows down. The arena contains:

- outer boundaries,
- 9 static axis-aligned rectangular obstacles (§15 gives exact coordinates),
- 8 predefined spawn points (§15).

Arena geometry never changes during a match. Players and projectiles cannot leave it.

---

## 4. Players

A player is a circle of radius 16 px. Server-side player state:

| Field | Meaning |
|---|---|
| `id` | Unique, assigned by the server on join |
| `name` | Display name, max 12 characters, sanitized |
| `x`, `y` | Center position |
| `alive` | `true` / `false` |
| `life` | Integer, incremented on every (re)spawn. Lets clients tell a respawn teleport from a misprediction. |
| `respawnTicksLeft` | Counts down while dead |
| `protectionTicksLeft` | Counts down while spawn-protected |
| `fireCooldownTicks` | Counts down after each shot |
| `score` | Eliminations this match |
| `bot` | `true` for server-controlled players |

The client sends **inputs**, never state. The server decides all resulting state (§13).

**Players do not collide with other players.** They can overlap. This is a deliberate simplification: it keeps client prediction free of other-player interactions, so prediction error is caused only by the network, not by gameplay.

---

## 5. Movement and collision

- Speed: 200 px/s. One simulation step is 1/60 s, so a step moves 3.333… px.
- Diagonal movement is normalized (multiply both components by `Math.SQRT1_2`) so diagonal speed equals axis speed.
- Collision shapes: player = circle, projectile = small circle (radius 4), obstacle = rectangle.
- Players cannot leave the arena: the center is clamped to `[radius, width − radius]` × `[radius, height − radius]`.
- Players cannot pass through obstacles: after moving on each axis, push the circle out of any overlapping rectangle. The exact algorithm is in `docs/archive/SPEC-v1.md` §7 and is implemented once, in `shared/src/sim`, and used by both client and server.
- Dead players do not move, collide or block anything.

---

## 6. Shooting

- Each input message carries a `fire` flag and an `aim` angle (radians, quantized to 0.001).
- The **server** creates the projectile. The client never announces a hit.
- The server accepts a shot only if all of these hold: the player is alive, the room state is `RUNNING`, the room allows firing, and `fireCooldownTicks == 0`. Otherwise the fire flag is silently ignored.
- Fire cooldown: 300 ms (18 ticks), counted in server ticks.
- On an accepted shot the projectile spawns at `playerCenter + dir × (playerRadius + projectileRadius + 1)`, where `dir = (cos aim, sin aim)`. Speed is 600 px/s. If the straight segment from the player center to the spawn point crosses an obstacle, the projectile is destroyed immediately (it hit the obstacle).
- Projectiles are linear. No gravity, acceleration, bounce or homing.
- **Lag compensation is not implemented.** The projectile starts from the shooter's *server* position and hits what is at the *server* positions. This is a documented limitation (`docs/archive/SPEC-v1.md` §16).

---

## 7. Projectiles

Each projectile has: `id`, `ownerId`, `x`, `y`, direction `(dx, dy)`, and `ticksLeft` (lifetime 2 s = 120 ticks).

Each tick the server moves a projectile by `speed / 60` px along its direction and tests the **swept segment** (previous position → new position) against, in this order of priority, the **nearest** hit along the segment:

1. **Obstacles** (rectangle expanded by the projectile radius): projectile is destroyed.
2. **Arena boundary:** projectile is destroyed.
3. **Players:** a circle of radius `playerRadius + projectileRadius`. Ignored if the player is the projectile's owner, is dead, or is spawn-protected. On a valid hit the projectile is destroyed, the player is eliminated (§8) and the owner scores (§10).

Projectiles pass through spawn-protected players and dead players without being destroyed. A projectile is also destroyed when `ticksLeft` reaches 0. If its owner disconnects, the projectile is removed immediately.

A swept test is required: at low tick rates a point test would let projectiles skip through players or thin walls.

---

## 8. Elimination, respawn and spawn protection

**One hit point.** A valid projectile hit kills immediately.

On death the server:

1. sets `alive = false`,
2. disables the player's collision and hit-testing,
3. ignores their movement and fire inputs (inputs are still consumed so sequence numbers advance),
4. awards the owner +1 (§10),
5. starts `respawnTicksLeft = 120` (2 s).

The dead player stays in the state with `alive = false` and a visible respawn countdown.

When `respawnTicksLeft` reaches 0 the server picks a spawn point (§9), moves the player there, sets `alive = true`, increments `life` and sets `protectionTicksLeft = 60` (1 s).

**Spawn protection is always on and always visible** (a rotating shield ring plus the text "SPAWN PROTECTED 0.7 s" for the local player). While protected, the player can move and fire, and cannot be eliminated. Incoming projectiles pass through them.

While dead, a player cannot move, fire, score or be hit.

---

## 9. Spawn selection

The same rule applies to the initial spawn, countdown placement and respawn.

1. Candidates are the 8 spawn points.
2. Discard any candidate within 64 px of any other participant that is alive.
3. Among the rest, choose the candidate that **maximizes the distance to the nearest alive opponent**. Break ties with the seeded PRNG.
4. If every candidate was discarded, ignore step 2 and use step 3 on all 8.

---

## 10. Scoring

- Each confirmed elimination gives the shooter **+1**.
- There is no penalty for dying. There is no score for shooting, hitting obstacles or surviving.
- Scores are part of the authoritative state (not only events), so a client that missed a packet still shows the correct scoreboard.

---

## 11. Win condition, tie and disconnects

When the timer reaches 0:

1. The room enters `ENDED`.
2. The server computes the final scoreboard, sorted by score descending (ties sorted by name).
3. The winner is the player with the highest score. If two or more players share the highest score (including everyone at 0), the result is a **DRAW** between them. There is no sudden death.
4. The final scoreboard and winner list are included in the snapshots during `ENDED`.

**Disconnects.** When a human disconnects (clean close, or no packet for 5 s):

1. the player entity disappears,
2. their projectiles are removed,
3. their score is kept in the match record and shown greyed-out with "(left)" on the final scoreboard,
4. they cannot score further.

A reconnecting client is treated as a **new player**.

**Capacity.** Maximum 8 participants. A ninth join is rejected with the error code `ROOM_FULL`.

---

## 12. Bots

Bots exist so that a single viewer sees a living arena and so that the 2-participant minimum is met.

- When a `COUNTDOWN` begins, the room adds bots until `participants == bots.targetParticipants` (default 4). Humans who join mid-match are added on top (up to 8) without removing bots. At the next `COUNTDOWN` the bot count is recomputed as `max(0, targetParticipants − humans)`.
- Bots are real participants in the simulation. They produce **inputs** (same format as humans) and are processed by the same code path. They are labelled `BOT` in the UI and use names from `bots.names`.
- **Behavior (simple, deterministic given a seed):**
  - Wander: every ~1.5 s choose a random spawn point or arena point as target and move toward it. If position changes by less than 20 px in 1 s, choose a new target.
  - Aim and fire: if an alive, non-protected opponent is within `sightRange` and the straight segment to them is not blocked by an obstacle, aim at them with a random angular error of ±`aimErrorDeg`, after a `reactionMs` delay since first seeing them, and fire whenever the cooldown allows.
- Bot traffic is server-local and **bypasses the network emulator**. The UI must say so in the Network Lab ("Bots are simulated inside the server").
- The bot RNG is seeded from `bots.seed` so behavior is reproducible in tests.

---

## 13. Server authority

The server is the final authority over positions, collisions, projectiles, hits, deaths, respawns, scores, timers and match state. Clients may only send intent:

```json
{ "t": "input", "inputs": [ { "s": 42, "k": 8, "a": 0.785, "f": 1 } ] }
```

`s` is the input sequence number, `k` the movement key bitmask, `a` the aim angle and `f` the fire flag. The client never sends a position, a hit, a score or a time as a command. The full protocol is in `docs/PROTOCOL.md`.

---

## 14. Rooms

| Room | Purpose | Bots | Firing | Timer / scoring |
|---|---|---|---|---|
| `main` | The game | per §12 | on | per §2 |
| `lab` | Movement-only sandbox used by the Compare view (`PHASES.md` Phase 2). Also holds the **scripted movers** (circle, zigzag, reversal, stop–go; selected with the `lab` message, not players, no player cap) and accepts **spectators** (snapshots only, no player) | off | rejected | state is always `RUNNING`; no timer, no deaths |

---

## 15. Game constants (`shared/src/config/game.json`)

Save this block verbatim. Derived tick counts use `ticks = Math.round(ms × sim.hz / 1000)`.

```json
{
  "sim": { "hz": 60 },
  "match": {
    "durationMs": 180000,
    "countdownMs": 3000,
    "endedMs": 10000,
    "minParticipants": 2,
    "maxParticipants": 8
  },
  "arena": { "width": 1280, "height": 720 },
  "player": {
    "radius": 16,
    "speed": 200,
    "respawnDelayMs": 2000,
    "spawnProtectionMs": 1000,
    "fireCooldownMs": 300,
    "maxNameLength": 12
  },
  "projectile": { "radius": 4, "speed": 600, "lifetimeMs": 2000 },
  "scoring": { "pointsPerKill": 1 },
  "obstacles": [
    { "id": "center",   "x": 600,  "y": 310, "w": 80,  "h": 100 },
    { "id": "pillarTL", "x": 240,  "y": 140, "w": 80,  "h": 80  },
    { "id": "pillarTR", "x": 960,  "y": 140, "w": 80,  "h": 80  },
    { "id": "pillarBL", "x": 240,  "y": 500, "w": 80,  "h": 80  },
    { "id": "pillarBR", "x": 960,  "y": 500, "w": 80,  "h": 80  },
    { "id": "wallL",    "x": 120,  "y": 330, "w": 120, "h": 60  },
    { "id": "wallR",    "x": 1040, "y": 330, "w": 120, "h": 60  },
    { "id": "barTop",   "x": 540,  "y": 100, "w": 200, "h": 24  },
    { "id": "barBottom","x": 540,  "y": 596, "w": 200, "h": 24  }
  ],
  "spawnPoints": [
    { "x": 80,   "y": 80  },
    { "x": 1200, "y": 80  },
    { "x": 80,   "y": 640 },
    { "x": 1200, "y": 640 },
    { "x": 640,  "y": 52  },
    { "x": 640,  "y": 668 },
    { "x": 60,   "y": 360 },
    { "x": 1220, "y": 360 }
  ],
  "spawnMinSeparationPx": 64,
  "bots": {
    "targetParticipants": 4,
    "names": ["NOVA", "ECHO", "VOLT", "ZERO", "ARC", "FLUX", "NYX", "KILO"],
    "aimErrorDeg": 8,
    "reactionMs": 300,
    "sightRange": 700,
    "seed": 1337
  },
  "rooms": {
    "main": { "bots": true,  "firing": true,  "timed": true  },
    "lab":  { "bots": false, "firing": false, "timed": false }
  }
}
```

---

## 16. Deliberately NOT included

Do not build: multiple weapons, damage values, ammo, reloading, power-ups, teams, classes, player-vs-player body collision, grenades, bouncing or homing projectiles, moving or destructible obstacles, procedural maps, matchmaking, accounts, progression, inventories, sudden death, health bars, or a reconnect-to-same-player mechanism.

The game is: **move + shoot + collide + die + respawn + score + 3-minute match.**
