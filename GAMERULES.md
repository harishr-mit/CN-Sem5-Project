# NetPlay Lab — Multiplayer Arena Game Rules

## 1. Game Objective

NetPlay Lab is a real-time multiplayer top-down arena game.

Each player controls one character inside a bounded arena. Players can move and fire projectiles at other players.

The objective is to obtain the highest number of eliminations before the three-minute match timer expires.

### Match duration

**3 minutes (180 seconds)**

### Winning condition

When the timer reaches zero:

1. The match ends.
2. Players can no longer move or fire.
3. The final scores are calculated.
4. The player with the highest score wins.
5. If multiple players have the same highest score, the match ends in a tie between those players.

There is no score penalty for dying.

---

# 2. Players

Each connected client represents one player.

A player has:

* unique player ID
* position `(x, y)`
* movement state
* alive/dead state
* respawn state
* score
* shooting cooldown
* connection state

Example:

```text
Player A
Position: (420, 260)
State: Alive
Score: 4
```

The server is authoritative over all of these values.

The client may send **intent/input**, but the server decides the resulting game state.

---

# 3. Arena

The game takes place in a fixed 2D rectangular arena.

Example:

```text
┌──────────────────────────────────────┐
│                                      │
│     ● Player A                       │
│                                      │
│                 ███                  │
│                 ███                  │
│                                      │
│                         ● Player B   │
│                                      │
│       ███                            │
│       ███                    ●       │
│                                      │
└──────────────────────────────────────┘
```

The arena contains:

* outer boundaries
* static rectangular obstacles
* player spawn locations

The arena geometry remains unchanged during a match.

---

# 4. Player Movement

Players move in four directions:

```text
          UP
           ↑
           │
LEFT ←──── ● ────→ RIGHT
           │
           ↓
         DOWN
```

Diagonal movement may be supported by combining horizontal and vertical input.

For example:

```text
UP + RIGHT = diagonal movement
```

The server should normalize diagonal movement so that moving diagonally does not make the player faster than moving horizontally or vertically.

### Suggested movement speed

Start with:

```text
Player speed = 200 pixels/second
```

The exact value can be tuned during implementation.

The important point is that movement speed remains constant.

---

# 5. Movement Collision

Players cannot leave the arena.

If movement would place the player outside the arena boundary, the server clamps the position to the valid area.

Example:

```text
Before:

┌──────────────┐
│          ● → │
└──────────────┘

After:

┌──────────────┐
│           ●  │
└──────────────┘
```

Players also cannot pass through static obstacles.

Example:

```text
       Player
          ●
          ↓
       ┌─────┐
       │     │
       │     │
       └─────┘
```

The player stops at the obstacle rather than passing through it.

### Recommended collision model

Use simple shapes:

* player → circle
* projectile → small circle
* obstacle → rectangle

This keeps collision detection easy to implement and deterministic.

---

# 6. Shooting

Every living player can fire a projectile.

Shooting is **linear**.

When the player fires:

1. The server obtains the player's current position.
2. The firing direction is determined.
3. A projectile is created.
4. The projectile travels in a straight line.
5. The projectile does not change direction.
6. The projectile disappears when it hits a collidable object.
7. If the object hit is another player, that player is eliminated.

Example:

```text
Player
  ● ────────────────► ●
                     Target
```

No projectile physics such as gravity, acceleration, bouncing, or homing is required.

---

# 7. Projectile Collision

A projectile can collide with:

* another player
* an arena obstacle
* the arena boundary

The first valid collision determines what happens.

### Player collision

```text
Projectile ─────► Player
                    X
                 eliminated
```

The projectile disappears immediately.

The hit player dies.

The shooter receives one point.

### Obstacle collision

```text
Projectile ─────► █████
                   obstacle
```

The projectile disappears.

No player is affected.

### Arena boundary

If a projectile reaches the edge of the arena, it disappears.

---

# 8. One-Hit Elimination

Players have **one hit point**.

A successful projectile collision immediately eliminates the player.

There is no health system in the initial version.

Therefore:

```text
1 projectile hit
        ↓
     player dies
        ↓
     shooter +1
```

This is deliberately simple because it makes the relationship between network events and game-state changes easy to observe.

---

# 9. Shooting Cooldown

Players should not be able to fire continuously without restriction.

Use a small firing cooldown.

Suggested initial value:

```text
Fire cooldown = 300 ms
```

Therefore, a player can fire approximately:

```text
1 shot every 0.3 seconds
```

The server should enforce this cooldown.

If a client sends a fire request while its cooldown has not expired, the server ignores the request.

This prevents clients from artificially increasing their firing rate.

---

# 10. Player Death

When a player is hit:

```text
Alive
  │
  │ projectile collision
  ▼
Dead
```

The server should:

1. mark the player as dead
2. remove/disable the player's collision
3. prevent movement
4. prevent shooting
5. increment the shooter's score
6. begin the respawn countdown

The dead player should remain represented in the game state so that the client can display a respawn indicator.

---

# 11. Respawning

Players automatically respawn after a short cooldown.

Suggested value:

```text
Respawn delay = 2 seconds
```

Example:

```text
Player dies
    │
    ▼
  2-second
 countdown
    │
    ▼
Respawn
```

During the respawn period:

* player cannot move
* player cannot shoot
* player cannot score
* player cannot be hit

After the countdown:

1. the server selects a valid spawn location
2. the player is moved there
3. the player becomes alive
4. movement is enabled
5. shooting is enabled

---

# 12. Spawn Locations

The arena should contain several predefined spawn locations.

Example:

```text
┌──────────────────────────────────────┐
│                                      │
│   S1                              S2 │
│                                      │
│                                      │
│                ███                   │
│                                      │
│                                      │
│   S3                              S4 │
│                                      │
└──────────────────────────────────────┘
```

A respawning player should not simply appear at the same location every time.

The server should select a valid spawn location.

The selected location must:

* be inside the arena
* not overlap an obstacle
* not overlap another player
* preferably not place the player immediately beside an opponent

For the initial implementation, a simple random valid spawn point is sufficient.

---

# 13. Spawn Protection

I recommend adding a very short spawn-protection period.

Suggested value:

```text
Spawn protection = 1 second
```

During this period:

* the player can move
* the player can optionally shoot
* incoming projectiles cannot eliminate the player

This prevents an unfortunate situation where:

```text
Player respawns
      ↓
Player appears
      ↓
Previously fired projectile hits them
      ↓
Player immediately dies again
```

However, **spawn protection should be clearly visible** in the UI.

For example:

```text
RESPAWNING...
2

SPAWN PROTECTED
0.7s
```

If you want the simplest possible implementation, spawn protection can be omitted initially and added later.

---

# 14. Scoring

Every successful elimination gives the shooter:

```text
+1 point
```

Example:

```text
Player A shoots Player B

Player A: 3 → 4
Player B: 7 → 7
```

There is no penalty for dying.

There is no score for:

* hitting an obstacle
* firing a projectile
* surviving
* damaging another player

Only confirmed eliminations award points.

---

# 15. Self-Kills

A player's projectile should **not** be able to kill its own shooter.

This can be handled by recording the projectile's owner:

```text
Projectile
├── ID
├── position
├── direction
├── speed
└── owner_id
```

During collision detection:

```text
if collided_player.id == projectile.owner_id:
    ignore collision
```

This also gives the protocol a useful piece of state for debugging.

---

# 16. Friendly Fire

Because the game is a free-for-all arena, every player is considered an opponent.

Therefore:

```text
Player A → Player B = valid
Player B → Player C = valid
Player C → Player A = valid
```

There are no teams in the initial version.

---

# 17. Projectile Lifetime

A projectile should not exist forever if it somehow does not collide.

Suggested maximum lifetime:

```text
Projectile lifetime = 2 seconds
```

If the projectile survives for two seconds without hitting anything, it is removed.

This prevents abandoned projectiles from accumulating.

The projectile therefore disappears when the first of these occurs:

```text
             ┌─ hits player
             │
Projectile ──┼─ hits obstacle
             │
             ├─ hits arena boundary
             │
             └─ reaches 2-second lifetime
```

---

# 18. Match Timer

The match lasts exactly:

```text
180 seconds
```

The server owns the official timer.

The client only displays it.

Example:

```text
┌─────────────────────────────┐
│          02:17              │
│                             │
│  P1: 5       P2: 3          │
│                             │
│       ●                     │
│            ███              │
│                    ●        │
│                             │
└─────────────────────────────┘
```

The client should not be able to change the timer.

---

# 19. Match Start

Before the match begins:

```text
WAITING FOR PLAYERS
```

Once the required number of players is connected:

```text
3
2
1
GO!
```

The match begins.

A minimum of **2 players** should be required.

The server records the official match start time.

---

# 20. Match End

When 180 seconds have elapsed:

```text
MATCH OVER
```

The server:

1. stops accepting movement inputs
2. stops accepting firing requests
3. stops spawning new projectiles
4. calculates final scores
5. determines the winner/tied winners
6. broadcasts the final scoreboard

Example:

```text
╔══════════════════════════╗
║       MATCH OVER         ║
╠══════════════════════════╣
║                          ║
║  Player A       12       ║
║  Player B        9       ║
║  Player C        5       ║
║  Player D        4       ║
║                          ║
║       WINNER: A          ║
╚══════════════════════════╝
```

---

# 21. Tie Condition

If two or more players have the same highest score:

```text
Player A = 8
Player B = 8
Player C = 5
```

The result is:

```text
DRAW
A and B
```

There is no sudden-death round in the initial version.

This keeps the match deterministic and prevents the project from requiring another gameplay phase.

---

# 22. Disconnects

If a player disconnects:

1. the server removes them from the active game
2. their player entity disappears
3. their projectiles are removed
4. their score is retained in the server's match record
5. they are no longer eligible to score

If they reconnect, they should initially be treated as a new player unless a reconnect mechanism is explicitly implemented later.

---

# 23. Minimum Player Count

Recommended:

```text
Minimum: 2 players
Maximum: 8 players
```

The game should be designed so that the networking architecture supports more players, but **2–4 players is sufficient for development and demonstration**.

The maximum can be increased later if performance allows.

---

# 24. Server Authority

The server is the final authority over:

* player positions
* collisions
* projectile positions
* projectile collisions
* deaths
* respawns
* scores
* timers
* match state

The client sends inputs such as:

```json
{
  "type": "player_input",
  "sequence": 42,
  "input": {
    "up": false,
    "down": false,
    "left": false,
    "right": true
  }
}
```

And:

```json
{
  "type": "fire",
  "sequence": 43,
  "direction": {
    "x": 1,
    "y": 0
  }
}
```

The client does **not** send:

```json
{
  "position": {
    "x": 500,
    "y": 200
  }
}
```

as an authoritative command.

Instead:

```text
Client
  │
  │ input
  ▼
Server
  │
  ├── validate
  ├── simulate
  ├── collision detection
  ├── update state
  └── broadcast state
```

This is particularly important for your networking experiments because it gives you a clear authoritative state against which you can measure client-side divergence.

---

# 25. Game Tick

The server should run the game simulation at a fixed tick rate.

Suggested initial value:

```text
Server tick rate = 30 Hz
```

Therefore:

```text
30 game updates / second
```

The server repeatedly performs:

```text
Receive inputs
      ↓
Validate inputs
      ↓
Update player movement
      ↓
Update projectiles
      ↓
Detect collisions
      ↓
Process deaths
      ↓
Process respawns
      ↓
Update scores
      ↓
Broadcast state
      ↓
Next tick
```

This fixed simulation loop will also make later experiments easier to reproduce.

---

# 26. Network-Relevant Events

The game should expose clear events that can be measured by the project.

Important events include:

```text
PLAYER_JOIN
PLAYER_LEAVE
PLAYER_INPUT
PLAYER_MOVE
PLAYER_FIRE
PROJECTILE_SPAWN
PROJECTILE_HIT
PLAYER_DEATH
PLAYER_RESPAWN
SCORE_UPDATE
MATCH_START
MATCH_END
```

These events give the emulator/measurement system useful things to correlate with network conditions.

---

# 27. Example Complete Gameplay Sequence

Suppose there are three players:

```text
A = 2 points
B = 4 points
C = 1 point
```

Player A fires at Player B.

```text
A
● ─────────────────► ●
                     B
```

The projectile reaches B.

Server detects:

```text
Projectile owner = A
Collision target = B
```

The server performs:

```text
B.state = DEAD
A.score += 1
B.respawn_timer = 2 seconds
Projectile = destroyed
```

Score becomes:

```text
A = 3
B = 4
C = 1
```

After two seconds:

```text
B.state = ALIVE
B.position = valid_spawn_location
```

B continues playing.

---

# 28. Important Rule: The Server Decides the Hit

The client should not simply announce:

```text
"I hit B."
```

Instead, the client announces:

```text
"I fired in this direction."
```

The server simulates the projectile and determines whether a collision occurred.

This gives you a clean authoritative architecture:

```text
CLIENT
  │
  │ fire input
  ▼
SERVER
  │
  │ create projectile
  │
  │ simulate projectile
  │
  │ collision detection
  │
  ├──── miss ────► continue
  │
  └──── hit ─────► death + score
```

---

# 29. Initial Game Constants

The first implementation can use these values:

| Rule                | Initial value |
| ------------------- | ------------: |
| Match duration      |         180 s |
| Server tick rate    |         30 Hz |
| Player speed        |      200 px/s |
| Fire cooldown       |        300 ms |
| Projectile speed    |      600 px/s |
| Projectile lifetime |           2 s |
| Respawn delay       |           2 s |
| Spawn protection    |           1 s |
| Player health       |         1 hit |
| Points per kill     |             1 |
| Minimum players     |             2 |
| Suggested maximum   |             8 |

These values should be treated as **configuration**, rather than hard-coded game logic.

---

# 30. What We Should Deliberately NOT Add Initially

To keep the project focused, the first version should avoid:

* multiple weapons
* weapon damage values
* ammunition
* reload mechanics
* power-ups
* teams
* different player classes
* complex physics
* grenades
* bouncing projectiles
* moving obstacles
* destructible environments
* maps with procedural generation
* matchmaking
* player progression
* inventories

The core game should remain:

```text
MOVE
  +
SHOOT
  +
COLLIDE
  +
DIE
  +
RESPAWN
  +
SCORE
  +
3-MINUTE MATCH
```

That gives us enough gameplay to make the networking experiments meaningful without allowing the game itself to consume the majority of the project development time.
