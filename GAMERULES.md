# NoBu Shooter — Game Rules

**Audience:** the implementing agent. This file is the **single source of truth for gameplay rules and game constants**. Architecture, protocol, netcode, emulator and UI were specified in `docs/archive/SPEC-v1.md` (v1 build spec, archived); current goals and phases are in `PHASES.md`. Every rule below is a decision, not a suggestion. Do not add mechanics that are not listed here (see §16).

**Revision 2026-10-10 (owner):** weapons, ammo + reloading, power-ups, several hand-made maps, a textured player avatar and sound effects were added (§3, §4, §6, §6a, §6b, §17, §18). They were implemented in **Phase 2.5** (`PHASES.md`, tasks T52–T56 in `log.md`, done 2026-10-10) before Phase 3; the owner then set the shotgun to 3 pellets with a decent spread. **Revision 2 (2026-10-10, T58–T60):** power-ups appear at random spots, at most one per two players, weighted (rifle rarest, Speed most common); power-up weapons hold 1 + 1 magazines; the pistol reloads forever; Ammo was replaced by **Piercing** and **Dash**; a developer invincibility toggle exists only under `npm run demo` (§19).

Constants live in one file, `shared/src/config/game.json` (§15), imported by client, server and tests. Never hard-code a number from this document in game logic.

---

## 1. Objective

NoBu Shooter is a real-time, top-down, free-for-all arena shooter. Each player controls one character (a circle for collision), moves with the keyboard, aims with the mouse and fires straight-line projectiles from a magazine that must be reloaded. Power-ups that appear on the map grant a better weapon, a shield, speed, piercing rounds or a dash for a short time. One hit eliminates a player. The player with the most eliminations when the 180-second timer expires wins.

The game is deliberately simple. Its purpose is to make network effects (lag, loss, jitter) visible and measurable. Ammo, reloads and contested power-up pickups exist partly because they are good netcode material: client-predicted ammo that the server corrects, and pickups that two lagged players both "grab" but only one gets. Gameplay depth beyond §1–§18 is a non-goal.

### Controls

| Input | Action |
|---|---|
| `W` `A` `S` `D` (also arrow keys) | Move up / left / down / right. Diagonals are allowed by pressing two keys. |
| Mouse position | Aim. The aim angle is the angle from the player's position to the cursor. |
| Left mouse button (hold) | Fire. Holding fires repeatedly, limited by the weapon's server-enforced cooldown and magazine (§6). |
| `R` | Reload (§6a). Also automatic when the magazine is empty. |
| `Space` | Dash, while the Dash power-up is active (§6b). |
| `M` | Mute / unmute sound effects (§18). Client-only. |

`C`, `P`, `I`, `G`, `Tab`, `1`–`5` are Network Lab keys (README), not game actions. `C` toggles reconciliation (it was `R` before 2026-10-10).

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

A fixed rectangle of **1280 × 720** logical pixels on every map. The origin is the top-left corner; x grows right, y grows down. Each **map** contains:

- outer boundaries,
- static axis-aligned rectangular obstacles (`neon`: the 9 in §15),
- 8 predefined spawn points,
- power-ups at random spots (§6b), except in `lab`,
- a floor texture and an obstacle skin (cosmetic only, §17).

Arena geometry never changes during a match. Players and projectiles cannot leave it.

### Maps

| Map | Floor | Obstacles drawn as | Notes |
|---|---|---|---|
| `neon` | procedural grid | glowing dark glass | The original map (§15). Always used by the `lab` room, whose mover lanes and fixed spawn were laid out against it. |
| `warehouse` | `stone_cracked` | metal crates, storage boxes, cage | Hand-made |
| `plaza` | `stone_beige` | barrels, fuel tank, metal barrier | Hand-made |
| `overgrown` | `brick_herringbone` | electrical cabinets, barrels, storage boxes | Hand-made |

- The `main` room plays the maps in `maps.rotation` order, advancing at every `COUNTDOWN` (the first match uses the first entry). The map id is part of the snapshot, so a late joiner draws the right map.
- Every map is hand-made and **left–right mirror-symmetric** (fair spawns), has no enclosed pockets, keeps every spawn point ≥ 24 px from obstacles, and keeps a clear line of fire across the middle. Each obstacle's collision box is its rectangle; the skin is drawn to fill that rectangle (props are tiled or stretched; collision never depends on art).

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
| `weapon` | `handgun`, `rifle` or `shotgun` (§6) |
| `weaponTicksLeft` | Remaining time of a power-up weapon; 0 for the handgun |
| `ammo` | Rounds left in the magazine |
| `reserve` | Spare rounds outside the magazine; unlimited (−1) for the handgun |
| `reloadTicksLeft` | > 0 while reloading |
| `shield` | `true` while a Shield power-up is active (§6b) |
| `speedTicksLeft` | > 0 while a Speed power-up is active |
| `score` | Eliminations this match |
| `bot` | `true` for server-controlled players |

The client sends **inputs**, never state. The server decides all resulting state (§13).

**Appearance (§17).** Every player uses the same avatar. Players are told apart by a colour ring under the feet and a coloured name tag; the local player also has a marker on the shoulders. The 16 px collision circle does not change with the sprite.

**Players do not collide with other players.** They can overlap. This is a deliberate simplification: it keeps client prediction free of other-player interactions, so prediction error is caused only by the network, not by gameplay.

---

## 5. Movement and collision

- Speed: 200 px/s (× `powerups.speedMultiplier` while Speed is active). One simulation step is 1/60 s, so a step moves 3.333… px.
- Diagonal movement is normalized (multiply both components by `Math.SQRT1_2`) so diagonal speed equals axis speed.
- Collision shapes: player = circle, projectile = small circle (radius 4), obstacle = rectangle.
- Players cannot leave the arena: the center is clamped to `[radius, width − radius]` × `[radius, height − radius]`.
- Players cannot pass through obstacles: after moving on each axis, push the circle out of any overlapping rectangle. The exact algorithm is in `docs/archive/SPEC-v1.md` §7 and is implemented once, in `shared/src/sim`, and used by both client and server.
- Dead players do not move, collide or block anything.

---

## 6. Shooting

- Each input message carries a `fire` flag and an `aim` angle (radians, quantized to 0.001).
- The **server** creates the projectile. The client never announces a hit.
- The server accepts a shot only if all of these hold: the player is alive, the room state is `RUNNING`, the room allows firing, `fireCooldownTicks == 0`, `reloadTicksLeft == 0` and `ammo > 0`. Otherwise the fire flag is silently ignored.
- Each accepted shot uses one round and starts the weapon's cooldown, counted in server ticks.
- **Weapons** (constants in `weapons`, §15):

  | Weapon | How you get it | Magazine | Cooldown | Reload | Projectiles per shot | Range (lifetime) |
  |---|---|---|---|---|---|---|
  | `handgun` | default; after death; when a weapon power-up ends | 8, unlimited reloads | 300 ms | 1200 ms | 1 | 2000 ms |
  | `rifle` | Rapid Fire power-up: 10 s **or** 1 + 1 magazines, whichever ends first | 30 (+ 30 spare) | 100 ms | 1500 ms | 1 | 2000 ms |
  | `shotgun` | Spread Shot power-up: 10 s **or** 1 + 1 magazines | 5 (+ 5 spare) | 700 ms | 1000 ms | 3 pellets, a fixed 20° fan (−10°, 0°, +10°) | 600 ms |

  Every pellet is an ordinary projectile (§7). The fan is fixed, not random, so client and server agree without sharing RNG state.
- On an accepted shot the projectile spawns at `playerCenter + dir × (playerRadius + projectileRadius + 1)`, where `dir = (cos aim, sin aim)`. Speed is 600 px/s. If the straight segment from the player center to the spawn point crosses an obstacle, the projectile is destroyed immediately (it hit the obstacle) — unless it is a piercing shot (§6b).
- Projectiles are linear. No gravity, acceleration, bounce or homing.
- **Lag compensation is not implemented.** The projectile starts from the shooter's *server* position and hits what is at the *server* positions. This is a documented limitation (`docs/archive/SPEC-v1.md` §16).

### 6a. Ammo and reloading

- A reload starts when the player presses `R` (input flag `r`) with `ammo < magazine` and spare rounds left, or **automatically** when a shot empties the magazine. It takes the weapon's `reloadMs`; then the missing rounds move from `reserve` into the magazine.
- **The handgun's reserve is unlimited** (infinite reloads). A power-up weapon starts with one spare magazine (`reserve = magazine`, "1 + 1"); when its last round is fired with no reserve left, the player is back on the handgun with a full magazine — even if the 10 s are not over.
- While reloading the player can move but not fire. Pressing `R` during a reload does nothing. Only death or a weapon change ends a reload early.
- Pressing fire with an empty magazine or during a reload is a **dry fire**: the client plays a click (§18), the server ignores it.
- On (re)spawn: `handgun`, full magazine, no reload.
- The server owns `ammo` and `reloadTicksLeft`; they are sent only to their owner (`snap.me`, `docs/PROTOCOL.md`). The client **predicts** its own ammo counter and reload timer and reconciles them like position: a mismatch (e.g. a lost input it fired with) flashes the HUD ammo counter amber. The client repeats `r` on every input of its predicted reload, so one lost input cannot cancel a reload (the server ignores `r` while reloading or full).

### 6b. Power-ups

- **Where:** power-ups appear at **random spots** (room's seeded PRNG): ≥ 40 px from the arena edge, ≥ 24 px from every obstacle, outside the HUD zones (`powerups.hudKeepOut`: score, timer, scoreboard, button bar, weapon panel), and — when possible — ≥ 160 px from other power-ups and ≥ 80 px from alive players. Every such spot is reachable (`tests/maps.test.ts`).
- **How many:** at most **⌊participants / 2⌋** at a time (bots count; 4 players → 2, 8 → 4). At the start of `RUNNING` the map is filled to that cap at once. Whenever there are fewer, the next one appears **10 s** (`powerups.respawnMs`) later. If players leave and the cap drops, the oldest extra power-ups disappear. None during `COUNTDOWN`/`ENDED` and never in the `lab` room.
- **Which:** a weighted draw (`powerups.weights`): Speed 4, Dash 3, Spread Shot 2, Shield 2, Piercing 2, **Rapid Fire 1** (the rifle is the strongest, so the rarest).
- A pickup is a circle of radius 14 px. An alive player whose circle overlaps it collects it. The **server** decides; if several players overlap in the same tick, the lowest player id wins. Clients never predict a pickup (they show it only when the server confirms it), so under lag a player can run over a pickup and see it go to someone else — intended.
- Bots collect pickups they touch but do not seek them (and never dash).
- Effects:

  | Kind | Icon | Effect |
  |---|---|---|
  | `rapid_fire` | `pickups/rapid_fire` | Weapon → `rifle`: 10 s or 1 + 1 magazines, whichever ends first |
  | `spread_shot` | `pickups/spread_shot` | Weapon → `shotgun`: 10 s or 1 + 1 magazines |
  | `shield` | `pickups/shield` | Absorbs the next hit: the projectile is destroyed, the player survives, the shield is gone. Lasts until used or death |
  | `speed` | `pickups/speed` | Speed × 1.5 for 6 s |
  | `piercing` | `pickups/piercing` | For 8 s, shots pass through obstacles (still stopped by players and the arena edge) |
  | `dash` | `pickups/dash` | For 10 s, `Space` (input flag `d`) gives a 150 ms burst at × 3 speed in the direction of movement, then a 2 s cooldown. Needs a movement key held |

- A new weapon power-up replaces the current one (fresh 10 s and 1 + 1 magazines); the same one restarts them. When it ends the player gets the handgun with a full magazine. A second Shield while shielded does nothing (the pickup is still consumed); a second Speed, Piercing or Dash restarts its time.
- Death removes every power-up effect.
- Speed and Dash change movement, so client prediction uses the multiplier of each replayed input (`shared/src/sim/combat.ts`). Speed and Dash are *granted* only by the server, so the first inputs after the pickup are predicted at normal speed and then corrected — a small, intended reconciliation. A dash itself is predicted exactly (the client repeats `d` during its predicted burst, like `r`).

---

## 7. Projectiles

Each projectile has: `id`, `ownerId`, `x`, `y`, direction `(dx, dy)`, and `ticksLeft` (the weapon's lifetime: 2 s = 120 ticks, shotgun pellets 0.6 s = 36 ticks).

Each tick the server moves a projectile by `speed / 60` px along its direction and tests the **swept segment** (previous position → new position) against, in this order of priority, the **nearest** hit along the segment:

1. **Obstacles** (rectangle expanded by the projectile radius): projectile is destroyed.
2. **Arena boundary:** projectile is destroyed.
3. **Players:** a circle of radius `playerRadius + projectileRadius`. Ignored if the player is the projectile's owner, is dead, or is spawn-protected. On a valid hit the projectile is destroyed; if the player has a Shield, the shield is used up and nothing else happens; otherwise the player is eliminated (§8) and the owner scores (§10).

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

**Spawn protection is always on and always visible** (a pulsing shield bubble plus the text "SPAWN PROTECTED 0.7 s" for the local player). While protected, the player can move and fire, and cannot be eliminated. Incoming projectiles pass through them.

While dead, a player cannot move, fire, score or be hit.

---

## 9. Spawn selection

The same rule applies to the initial spawn, countdown placement and respawn. (The `lab` room uses one fixed spawn point instead; see §14.)

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
  - Aim and fire: if an alive, non-protected opponent is within `sightRange` and the straight segment to them is not blocked by an obstacle, aim at them with a random angular error of ±`aimErrorDeg`, after a `reactionMs` delay since first seeing them, and fire whenever the cooldown and magazine allow. Bots reload only automatically (empty magazine) and use the same weapon and power-up rules as humans.
- Bot traffic is server-local and **bypasses the network emulator**. The UI must say so in the Network Lab ("Bots are simulated inside the server").
- The bot RNG is seeded from `bots.seed` so behavior is reproducible in tests.

---

## 13. Server authority

The server is the final authority over positions, collisions, projectiles, hits, deaths, respawns, scores, timers and match state. Clients may only send intent:

```json
{ "t": "input", "inputs": [ { "s": 42, "k": 8, "a": 0.785, "f": 1 } ] }
```

`s` is the input sequence number, `k` the movement key bitmask, `a` the aim angle and `f` the fire flag. Optional `r: 1` asks for a reload (§6a) and `d: 1` for a dash (§6b). The client never sends a position, a hit, a score or a time as a command. The full protocol is in `docs/PROTOCOL.md`.

---

## 14. Rooms

| Room | Purpose | Bots | Firing | Timer / scoring |
|---|---|---|---|---|
| `main` | The game: map rotation, power-ups, weapons | per §12 | on | per §2 |
| `lab` | Movement-only sandbox used by the Compare view (`PHASES.md` Phase 2). Also holds the **scripted movers** (circle, zigzag, reversal, stop–go; selected with the `lab` message, not players, no player cap) and accepts **spectators** (snapshots only, no player) | off | rejected | state is always `RUNNING`; no timer, no deaths. Always the `neon` map, no power-ups |

In `lab`, §9 does not apply: every player spawns at `rooms.lab.spawn` (880, 360), clear of the mover lanes. The Compare panes' players are driven by the same input, so they must start from the same place (players don't collide with each other).

---

## 15. Game constants (`shared/src/config/game.json`)

Save this block verbatim. Derived tick counts use `ticks = Math.round(ms × sim.hz / 1000)`. Weapon, ammo, reload and power-up timers advance once per consumed input on both the server and the client's prediction (`shared/src/sim/combat.ts`), like movement.

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
    "maxNameLength": 12
  },
  "projectile": { "radius": 4, "speed": 600 },
  "weapons": {
    "default": "handgun",
    "handgun": { "magazine": 8,  "fireCooldownMs": 300, "reloadMs": 1200, "pellets": 1, "spreadDeg": 0,  "lifetimeMs": 2000 },
    "rifle":   { "magazine": 30, "fireCooldownMs": 100, "reloadMs": 1500, "pellets": 1, "spreadDeg": 0,  "lifetimeMs": 2000 },
    "shotgun": { "magazine": 5,  "fireCooldownMs": 700, "reloadMs": 1000, "pellets": 3, "spreadDeg": 20, "lifetimeMs": 600 }
  },
  "powerups": {
    "kinds": ["rapid_fire", "spread_shot", "shield", "speed", "piercing", "dash"],
    "weights": { "rapid_fire": 1, "spread_shot": 2, "shield": 2, "speed": 4, "piercing": 2, "dash": 3 },
    "radius": 14,
    "perPlayers": 2,
    "respawnMs": 10000,
    "obstacleClearancePx": 24,
    "edgeMarginPx": 40,
    "minSeparationPx": 160,
    "playerClearancePx": 80,
    "hudKeepOut": [
      { "id": "score",      "x": 0,    "y": 0,   "w": 120, "h": 90  },
      { "id": "timer",      "x": 540,  "y": 0,   "w": 200, "h": 90  },
      { "id": "scoreboard", "x": 1060, "y": 0,   "w": 220, "h": 150 },
      { "id": "buttons",    "x": 0,    "y": 640, "w": 440, "h": 80  },
      { "id": "weapon",     "x": 1060, "y": 600, "w": 220, "h": 120 }
    ],
    "weaponMs": 10000,
    "speedMs": 6000,
    "speedMultiplier": 1.5,
    "piercingMs": 8000,
    "dashMs": 10000,
    "dash": { "multiplier": 3, "burstMs": 150, "cooldownMs": 2000 }
  },
  "scoring": { "pointsPerKill": 1 },
  "maps": {
    "rotation": ["neon", "warehouse", "plaza", "overgrown"],
    "neon": {
      "name": "Neon",
      "floor": null,
      "obstacles": [
        { "id": "center",    "x": 600,  "y": 310, "w": 80,  "h": 100 },
        { "id": "pillarTL",  "x": 240,  "y": 140, "w": 80,  "h": 80  },
        { "id": "pillarTR",  "x": 960,  "y": 140, "w": 80,  "h": 80  },
        { "id": "pillarBL",  "x": 240,  "y": 500, "w": 80,  "h": 80  },
        { "id": "pillarBR",  "x": 960,  "y": 500, "w": 80,  "h": 80  },
        { "id": "wallL",     "x": 120,  "y": 330, "w": 120, "h": 60  },
        { "id": "wallR",     "x": 1040, "y": 330, "w": 120, "h": 60  },
        { "id": "barTop",    "x": 540,  "y": 100, "w": 200, "h": 24  },
        { "id": "barBottom", "x": 540,  "y": 596, "w": 200, "h": 24  }
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
      ]
    },
    "warehouse": {
      "name": "Warehouse",
      "floor": "stone_cracked",
      "obstacles": [
        { "id": "cage",     "x": 592,  "y": 312, "w": 96,  "h": 96,  "prop": "cage_storage" },
        { "id": "crateTL",  "x": 300,  "y": 150, "w": 96,  "h": 96,  "prop": "crate_metal" },
        { "id": "crateTR",  "x": 884,  "y": 150, "w": 96,  "h": 96,  "prop": "crate_metal" },
        { "id": "crateBL",  "x": 300,  "y": 474, "w": 96,  "h": 96,  "prop": "crate_metal" },
        { "id": "crateBR",  "x": 884,  "y": 474, "w": 96,  "h": 96,  "prop": "crate_metal" },
        { "id": "boxesL",   "x": 150,  "y": 280, "w": 80,  "h": 160, "prop": "box_storage" },
        { "id": "boxesR",   "x": 1050, "y": 280, "w": 80,  "h": 160, "prop": "box_storage" },
        { "id": "boxesTop", "x": 560,  "y": 100, "w": 160, "h": 80,  "prop": "box_storage" },
        { "id": "boxesBot", "x": 560,  "y": 540, "w": 160, "h": 80,  "prop": "box_storage" }
      ],
      "spawnPoints": [
        { "x": 70,   "y": 70  },
        { "x": 1210, "y": 70  },
        { "x": 70,   "y": 650 },
        { "x": 1210, "y": 650 },
        { "x": 640,  "y": 40  },
        { "x": 640,  "y": 680 },
        { "x": 50,   "y": 360 },
        { "x": 1230, "y": 360 }
      ]
    },
    "plaza": {
      "name": "Plaza",
      "floor": "stone_beige",
      "obstacles": [
        { "id": "tank",       "x": 599,  "y": 293, "w": 82,  "h": 134, "prop": "tank_fuel" },
        { "id": "barrierTL",  "x": 330,  "y": 180, "w": 72,  "h": 96,  "prop": "barrier_metal" },
        { "id": "barrierTR",  "x": 878,  "y": 180, "w": 72,  "h": 96,  "prop": "barrier_metal" },
        { "id": "barrierBL",  "x": 330,  "y": 444, "w": 72,  "h": 96,  "prop": "barrier_metal" },
        { "id": "barrierBR",  "x": 878,  "y": 444, "w": 72,  "h": 96,  "prop": "barrier_metal" },
        { "id": "barrelsTop", "x": 571,  "y": 110, "w": 138, "h": 68,  "prop": "barrel_oil" },
        { "id": "barrelsBot", "x": 571,  "y": 542, "w": 138, "h": 68,  "prop": "barrel_oil" },
        { "id": "toxicL",     "x": 150,  "y": 326, "w": 46,  "h": 68,  "prop": "barrel_toxic" },
        { "id": "toxicR",     "x": 1084, "y": 326, "w": 46,  "h": 68,  "prop": "barrel_toxic" }
      ],
      "spawnPoints": [
        { "x": 70,   "y": 70  },
        { "x": 1210, "y": 70  },
        { "x": 70,   "y": 650 },
        { "x": 1210, "y": 650 },
        { "x": 640,  "y": 45  },
        { "x": 640,  "y": 675 },
        { "x": 50,   "y": 360 },
        { "x": 1230, "y": 360 }
      ]
    },
    "overgrown": {
      "name": "Overgrown",
      "floor": "brick_herringbone",
      "obstacles": [
        { "id": "cabinets",  "x": 596,  "y": 304, "w": 88,  "h": 112, "prop": "cabinet_electric_1" },
        { "id": "rowTop",    "x": 530,  "y": 150, "w": 220, "h": 56,  "prop": "cabinet_electric_2" },
        { "id": "rowBot",    "x": 530,  "y": 514, "w": 220, "h": 56,  "prop": "cabinet_electric_2" },
        { "id": "boxesTL",   "x": 260,  "y": 120, "w": 80,  "h": 160, "prop": "box_storage" },
        { "id": "boxesTR",   "x": 940,  "y": 120, "w": 80,  "h": 160, "prop": "box_storage" },
        { "id": "boxesBL",   "x": 260,  "y": 440, "w": 80,  "h": 160, "prop": "box_storage" },
        { "id": "boxesBR",   "x": 940,  "y": 440, "w": 80,  "h": 160, "prop": "box_storage" },
        { "id": "toxicL",    "x": 120,  "y": 326, "w": 46,  "h": 68,  "prop": "barrel_toxic" },
        { "id": "toxicR",    "x": 1114, "y": 326, "w": 46,  "h": 68,  "prop": "barrel_toxic" }
      ],
      "spawnPoints": [
        { "x": 70,   "y": 70  },
        { "x": 1210, "y": 70  },
        { "x": 70,   "y": 650 },
        { "x": 1210, "y": 650 },
        { "x": 640,  "y": 60  },
        { "x": 640,  "y": 660 },
        { "x": 50,   "y": 360 },
        { "x": 1230, "y": 360 }
      ]
    }
  },
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
    "main": { "bots": true,  "firing": true,  "timed": true,  "movers": false, "powerups": true },
    "lab":  { "bots": false, "firing": false, "timed": false, "movers": true,  "powerups": false, "map": "neon", "spawn": { "x": 880, "y": 360 } }
  },
  "lab": {
    "moverSpeed": 200,
    "stopGo": { "moveMs": 1000, "stopMs": 750 }
  }
}
```

- `NOBU_MAPS=plaza,neon` (server environment) replaces `maps.rotation` for rehearsals; unknown names are ignored.
- Obstacles with a `prop` are drawn with that prop (pixel art tiled at 2×, `crate_metal` stretched); collision is always the rectangle.

---

## 16. Deliberately NOT included

Do not build: weapons other than the three in §6, weapon switching or inventories (the weapon comes only from power-ups), damage values, health bars or health packs, melee, power-ups other than the six in §6b, health or ammo pickups, teams, classes, player-vs-player body collision, grenades, bouncing or homing projectiles, moving or destructible obstacles, procedural or player-made maps, map voting, matchmaking, accounts, progression, sudden death, music, or a reconnect-to-same-player mechanism.

The game is: **move + shoot + reload + pick up + collide + die + respawn + score + 3-minute match, on a rotating set of hand-made maps.**

---

## 17. Look (client only)

Rendering never changes the simulation. All art lives in `NoBu-Shooter/assets/` (inventory and licences: `assets/README.md`, `assets/CREDITS.md`); any missing file falls back to the procedural drawing.

- **Players:** one avatar for everyone (Top-Down Survivor). The body animation follows the weapon (`handgun`, `rifle`, `shotgun`) and state (`idle`, `move`, `shoot`, `reload`); the feet follow the movement direction relative to the aim (`run`, `strafe_left`, `strafe_right`, `idle`). The frames are packed into one atlas (`assets/packed/`, `npm run pack-assets`), scaled so the body is about 54 px across, and rotated to the aim angle around the shoulders.
- **Identity:** a ring under the feet and the name tag in the player's colour (cyan for the local player, eight hues for the rest, the same colour on the scoreboard). The **local player** also carries cyan pips on the shoulders, drawn in code. **Exceptions:** while the ghost (authoritative position, `G`) is shown, it replaces the local player's colour ring; the Compare view draws no colour rings at all (its ghost and truth rings already mark positions).
- **Shields:** spawn protection and the Shield power-up both use the shield bubble; spawn protection is the player's colour and pulses, the Shield power-up is green and steady.
- **Power-ups:** the pickup icon at its spot, bobbing slightly. Piercing shots are tinted violet.
- **Maps:** floor texture tiled across the arena; obstacles drawn with the map's skin (§3).
- **Credits:** the CC-BY assets (survivor avatar; RC Art props) are credited on a Credits screen reachable from the landing page and in `README.md`.

---

## 18. Sound (client only)

Sounds are cosmetic. The client triggers them from its own predicted actions (own shots, dry fire, reload start) or from server events (everything else). Files: `assets/sfx/`.

| Event | Sound |
|---|---|
| A shot (own: predicted; others: projectile spawn) | `shoot_handgun`, `shoot_rifle`; shotgun = `shoot_rifle` at 0.7× playback rate |
| Reload starts | `reload_handgun`, `reload_rifle`, `reload_shotgun` |
| Dry fire | `dry_fire` |
| Shield absorbs a hit | `hit` |
| Elimination | `death` |
| Power-up collected | `pickup` |
| Respawn, power-up ends, UI clicks | silent (owner decision) |

- Other players' sounds get quieter with distance (linear, down to 0.3 at the far side of the arena). At most 8 sounds play at once.
- `M` mutes; volume and mute live in the Settings panel (`Esc`) and persist in `localStorage`.
- Browsers start audio only after a user gesture; the first click on the landing page unlocks it.

---

## 19. Developer toggle (demo only)

`npm run demo` starts the server with `NOBU_DEV=1` and the client with `VITE_NOBU_DEV=1`. Only then does the Network Lab show a **Developer** section with an **Invincible** switch (message `dev`, `docs/PROTOCOL.md`): hits on that player are still shown, but never kill or use up a shield. The player's name tag reads `[DEV]` for everyone and their HUD shows `DEV: INVINCIBLE`. Without `NOBU_DEV=1` (tests, smoke, any other way of running the server) the server ignores the message.

