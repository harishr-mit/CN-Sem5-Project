# Experimental Multiplayer Networking Under Adverse Network Conditions

> **Computer Networks --- IT23501 Project**

A software-based networking project that uses a real-time multiplayer
game as the application and a standalone network emulator as the
experimental environment.

The project is designed around a simple idea:

> **Build a multiplayer application → deliberately make the network
> worse → observe the effects → measure them → progressively improve the
> networking behavior.**

The game is the **demonstration application**.\
The network emulator is the **experimental apparatus**.\
The measured results are the **evaluation**.

------------------------------------------------------------------------

## 1. Project Overview

The project starts with a small real-time multiplayer arena shooter using an authoritative
client-server architecture. The game is intentionally simple so that networking behavior,
not game complexity, remains the primary focus.

A standalone network emulator is placed between the application and its
destination:

``` text
┌──────────────┐
│   Client A   │
│ Multiplayer  │
│    Game      │
└──────┬───────┘
       │
       │ Local network endpoint
       ▼
┌──────────────────────────┐
│    Network Emulator      │
│                          │
│  • Latency               │
│  • Jitter                │
│  • Packet loss           │
│  • Bandwidth limitation  │
│  • Duplication           │
│  • Reordering            │
└────────────┬─────────────┘
             │
             ▼
      ┌──────────────┐
      │ Game Server  │
      │ Authoritative│
      │ Game State   │
      └──────────────┘
```

The emulator is intentionally designed as an independent application
rather than as game-specific code.

This means the same emulator can eventually be placed between other
compatible network applications running on the same machine or local
network.

------------------------------------------------------------------------

## 2. Project Question

The primary question is:

> **How do real-time multiplayer applications behave under controlled
> adverse network conditions?**

The project will experimentally investigate the effects of:

-   latency
-   jitter
-   packet loss
-   bandwidth limitation
-   packet duplication
-   packet reordering

The initial project does **not** compare TCP and UDP as a project topic.

A transport protocol will be selected as an implementation mechanism
based on the application and emulator architecture. Transport choice is
an implementation detail, not the research comparison.

------------------------------------------------------------------------

## 3. Project Phases

### Phase 1 --- Multiplayer Game

Build the minimum viable real-time multiplayer arena shooter.

The game is a **2D top-down free-for-all arena**. Players move around a
bounded arena, avoid static obstacles, and fire simple linear projectiles at
other players.

The complete gameplay rules are maintained separately in **`GAMERULES.md`**.
The README defines the networking-oriented scope and the core gameplay
requirements that affect the architecture.

Initial goals:

-   2+ connected players
-   bounded 2D arena
-   player movement
-   static obstacle collision
-   simple linear projectiles
-   projectile collision with players, obstacles, and arena boundaries
-   one-hit player elimination
-   automatic respawn with a short cooldown
-   player scoring
-   three-minute time-limited matches
-   authoritative server simulation
-   basic game-state synchronization
-   connection/disconnection handling
-   basic network statistics

### Core Game Rules

The initial game should implement these rules:

-   **Match duration:** 3 minutes (180 seconds)
-   **Game mode:** free-for-all
-   **Players:** 2+ players; initial target is 2–8 players
-   **Movement:** four-directional movement with optional diagonal input
-   **Arena:** fixed rectangular play area with static obstacles
-   **Player collision:** players cannot leave the arena or pass through obstacles
-   **Shooting:** players fire straight-line projectiles
-   **Projectile behavior:** a projectile disappears after hitting a player,
    obstacle, arena boundary, or reaching its maximum lifetime
-   **Player health:** one hit
-   **Elimination:** one projectile collision kills the target
-   **Scoring:** the shooter receives +1 point for a confirmed elimination
-   **Self-hit:** a player's own projectile cannot eliminate its owner
-   **Fire rate:** firing is controlled by a server-enforced cooldown
-   **Respawn:** eliminated players automatically respawn after a short delay
-   **Spawn protection:** a short configurable protection period may be used
    after respawn
-   **Winner:** player with the highest score when the timer expires
-   **Tie:** equal highest scores produce a draw
-   **Authority:** the server is authoritative over movement resolution,
    projectiles, collisions, deaths, respawns, scores, and match timing

The detailed constants and gameplay rules belong in `GAMERULES.md`, rather
than being duplicated throughout the networking documentation.

**The networking is the project, not the game.**

------------------------------------------------------------------------

### Phase 2 --- Standalone Network Emulator

Build the emulator as an independent application.

The emulator should:

1.  listen on a configurable local endpoint
2.  receive application traffic
3.  apply configured network impairments
4.  forward the resulting traffic to the destination
5.  perform the same process in the reverse direction

Conceptually:

``` text
Application
    │
    ▼
localhost:EMULATOR_PORT
    │
    ▼
┌───────────────────┐
│ Network Emulator  │
└───────────────────┘
    │
    ▼
localhost:DEST_PORT
```

The emulator must not contain game-specific logic.

### Reusability Goal

The emulator should be usable as a general-purpose **local traffic
impairment proxy** for compatible applications.

For example:

``` text
Any Compatible App
       │
       ▼
127.0.0.1:9000
       │
       ▼
Network Emulator
       │
       ▼
127.0.0.1:8000
       │
       ▼
Target Application
```

The exact supported transport modes and proxy behavior will be finalized
during implementation.

------------------------------------------------------------------------

### Phase 3 --- Core Synchronization and Controlled Experiments

Phase 3 is a **core implementation phase**, not an optional extension.

The client-server architecture should provide responsive local movement while
preserving server authority. The synchronization layer should therefore
include:

-   client-side prediction
-   server reconciliation
-   sequence numbers for client inputs
-   authoritative server snapshots
-   detection of acknowledged/pending inputs
-   correction of client state when prediction differs from server state
-   measurement of prediction error and correction frequency

The basic movement flow should be:

```text
Client
  │
  ├── input ───────────────► Server
  │
  ├── predict locally
  │
  │                         ┌──────────────┐
  │                         │ Authoritative│
  │                         │ simulation   │
  │                         └──────┬───────┘
  │                                │
  │◄──────── authoritative state ──┘
  │
  ├── acknowledge inputs
  ├── discard acknowledged inputs
  ├── reconcile with server state
  └── replay remaining inputs
```

This makes client-side prediction and server reconciliation fundamental parts
of the game networking model. They are required before the controlled
experiments are considered complete.

After the synchronization layer is working, run repeatable experiments by
changing one network condition at a time.

Collect measurements and export them as CSV/JSON.

Example:

```text
Experiment:
Latency sweep

0 ms
25 ms
50 ms
100 ms
150 ms
200 ms
300 ms
```

Measure:

-   round-trip time
-   packet count
-   packet loss
-   effective throughput
-   update frequency
-   prediction error
-   state divergence
-   reconciliation/correction frequency
-   input-to-response delay
-   client responsiveness
-   server processing time
-   server tick rate
-   gameplay events such as shots, hits, deaths, and respawns

### Phase 4 --- Advanced Synchronization

After the core prediction/reconciliation system and experiments are stable,
additional synchronization techniques may be investigated.

Possible extensions:

-   snapshot interpolation
-   delta/state-change synchronization
-   more sophisticated snapshot delivery
-   comparison of different synchronization strategies

These are optional extensions. **Client-side prediction and server
reconciliation are not optional; they belong to the core project.**

The architecture should remain modular enough to add these techniques without
rewriting the game, server, or emulator.

------------------------------------------------------------------------

# 4. Proposed Technology Stack

## Client / Game

### Phaser 3 + TypeScript

Phaser is a JavaScript/TypeScript game framework designed for
browser-based games.

It fits the team better than Godot because the project team already has
JavaScript/React experience. Phaser officially supports JavaScript and
TypeScript.

Why Phaser:

-   JavaScript/TypeScript based
-   lightweight for a 2D game
-   easy to integrate with a web-style UI
-   large ecosystem
-   straightforward rendering/input model
-   easy to expose networking metrics visually

Official Phaser documentation:

https://phaser.io/

------------------------------------------------------------------------

### Electron

The game client will be packaged as an Electron desktop application.

Why Electron?

A normal browser application cannot directly open arbitrary UDP sockets.
Electron allows us to keep the JavaScript/TypeScript frontend while
giving the application access to Node.js networking capabilities.

This is especially useful because the project requires a real local
network client that can communicate with the standalone emulator.

Architecture:

``` text
┌───────────────────────────────────────┐
│              Electron                 │
│                                       │
│  ┌─────────────────────────────────┐  │
│  │ Phaser + TypeScript             │  │
│  │                                 │  │
│  │ Game rendering                  │  │
│  │ Input                           │  │
│  │ HUD / Network metrics           │  │
│  └───────────────┬─────────────────┘  │
│                  │                    │
│                  ▼                    │
│  ┌─────────────────────────────────┐  │
│  │ Node.js networking layer        │  │
│  │                                 │  │
│  │ UDP/TCP socket implementation   │  │
│  └─────────────────────────────────┘  │
└───────────────────────────────────────┘
```

React can optionally be used for menus, experiment configuration, and
dashboards, but it should not be introduced into the game-rendering path
unless it provides a clear benefit.

------------------------------------------------------------------------

## Server

### Python 3.12+

Use:

-   `asyncio`
-   `socket`
-   `dataclasses`
-   `json` initially
-   `logging`

The server will implement the authoritative game state and application
protocol.

Why Python:

-   team-friendly
-   excellent standard-library networking support
-   `asyncio` is well suited to multiple concurrent clients
-   fast enough for the scale of this project
-   keeps networking code explicit and easy to study

------------------------------------------------------------------------

## Network Emulator

### Python + asyncio

The emulator will be a separate Python application.

Responsibilities:

-   listen on configured local endpoints
-   forward packets
-   introduce configurable impairments
-   collect traffic statistics
-   expose configuration
-   log experiment data

Initial impairment modules:

``` text
Latency
Jitter
Packet Loss
Bandwidth Limiting
Packet Duplication
Packet Reordering
```

Each impairment should be independently configurable.

------------------------------------------------------------------------

## Packet Format

Start with a human-readable application protocol.

Initial development format:

``` json
{
  "type": "player_input",
  "sequence": 42,
  "timestamp": 1727000000,
  "payload": {
    "up": true,
    "down": false,
    "left": false,
    "right": true
  }
}
```

The exact protocol will be designed during implementation.

JSON is intentionally preferred during early development because packets
are easy to inspect while debugging and demonstrating the project.

If bandwidth becomes an experimental concern, a compact binary format
can be introduced later.

------------------------------------------------------------------------

## Packet Inspection

### Wireshark

Wireshark will be used to inspect actual packets and demonstrate:

-   packet flow
-   source/destination addresses
-   transport headers
-   application payloads
-   packet timing
-   retransmission/ordering behavior where applicable
-   effects of emulator-induced impairments

The application protocol should be documented sufficiently for packet
inspection during demonstrations.

------------------------------------------------------------------------

## Experiment Data

### CSV / JSON

Experiment results will be stored in machine-readable formats.

Example:

``` csv
experiment_id,latency_ms,jitter_ms,loss_percent,rtt_ms,throughput_kbps,packets_lost
exp_001,100,20,5,124,812,41
```

JSON may be used for configuration and richer experiment metadata.

------------------------------------------------------------------------

## Testing

### pytest

Use pytest for:

-   packet serialization/deserialization
-   protocol validation
-   server state transitions
-   emulator impairment behavior
-   routing/forwarding logic
-   experiment configuration validation

Network behavior should be tested independently from the game rendering
code.

------------------------------------------------------------------------

## Version Control

### Git + GitHub

Use Git for:

-   source control
-   feature branches
-   experiment versions
-   issue tracking
-   collaboration
-   documentation

Suggested branch naming:

``` text
main
develop

feature/game-client
feature/game-server
feature/network-emulator
feature/protocol
feature/experiments
feature/synchronization
```

------------------------------------------------------------------------

# 5. System Architecture

The complete target architecture is:

``` text
                      ┌────────────────────┐
                      │   Phaser Client    │
                      │   TypeScript       │
                      │   Electron         │
                      └─────────┬──────────┘
                                │
                                │ Application traffic
                                ▼
                     ┌─────────────────────┐
                     │  Network Emulator   │
                     │      Python         │
                     │                     │
                     │ latency             │
                     │ jitter              │
                     │ packet loss         │
                     │ bandwidth           │
                     │ duplication         │
                     │ reordering          │
                     └──────────┬──────────┘
                                │
                                │ Impaired traffic
                                ▼
                     ┌─────────────────────┐
                     │   Game Server       │
                     │      Python         │
                     │                     │
                     │ Authoritative state │
                     │ Player management   │
                     │ Game simulation     │
                     └─────────────────────┘
```

For multiple players:

``` text
Client A ──┐
           │
Client B ──┼──► Emulator ──► Server
           │
Client C ──┘
```

Depending on the final emulator architecture, the emulator may operate
as a shared proxy or as separately configured local endpoints.

------------------------------------------------------------------------

# 6. Game Networking Requirements

The game should expose enough state and events to make network effects visible
and measurable.

### Authoritative State

The server is authoritative over:

-   player position and movement resolution
-   projectile creation and simulation
-   projectile collisions
-   player death
-   respawn timing and location
-   scores
-   match timer
-   match state

Clients send **inputs or actions**, not authoritative state.

For example:

```json
{
  "type": "player_input",
  "sequence": 42,
  "timestamp": 1727000000,
  "payload": {
    "up": false,
    "down": false,
    "left": false,
    "right": true
  }
}
```

A fire action can similarly contain the player's input sequence and firing
direction.

### Prediction and Reconciliation

For local movement, the client should immediately simulate the result of
local input rather than waiting for a server response.

When an authoritative server state arrives, the client should:

1.  identify the latest acknowledged input
2.  replace the predicted state with the authoritative state
3.  discard acknowledged inputs
4.  replay still-pending local inputs
5.  continue normal prediction

This provides the core mechanism for studying how latency and packet loss
affect perceived responsiveness and correction behavior.

### Gameplay Events

The protocol should expose clear events such as:

```text
PLAYER_JOIN
PLAYER_LEAVE
PLAYER_INPUT
PLAYER_FIRE
PROJECTILE_SPAWN
PROJECTILE_HIT
PLAYER_DEATH
PLAYER_RESPAWN
SCORE_UPDATE
MATCH_START
MATCH_END
```

These events should be timestamped or sequence-tracked where useful so that
gameplay behavior can be correlated with emulator conditions.

------------------------------------------------------------------------

# 7. Core Game Networking Model

The server should be authoritative.

``` text
Client
  │
  │ input
  ▼
Server
  │
  │ validates/simulates
  ▼
Authoritative state
  │
  │ state update
  ▼
Client
```

The client should not be trusted as the final authority over game state.

For example:

``` text
Client:
"I moved to x=500"

Server:
"Your input says you moved right.
The authoritative state is x=480."

Client:
"Update local representation."
```

This architecture also gives the later synchronization techniques a
clear place to integrate.

------------------------------------------------------------------------

# 8. Planned Experiment Modes

## Mode 1 --- Baseline

Normal network conditions.

``` text
Client → Server
```

No artificial impairments.

Purpose:

-   establish baseline RTT
-   establish normal update rate
-   establish normal bandwidth
-   verify game correctness

------------------------------------------------------------------------

## Mode 2 --- Latency Experiment

Introduce increasing one-way delay.

Example:

``` text
0 ms
25 ms
50 ms
100 ms
150 ms
200 ms
300 ms
```

Observe:

-   responsiveness
-   RTT
-   player-state divergence
-   correction frequency

------------------------------------------------------------------------

## Mode 3 --- Packet Loss Experiment

Introduce increasing packet loss.

Example:

``` text
0%
1%
5%
10%
20%
30%
```

Observe:

-   missing updates
-   state divergence
-   recovery behavior
-   bandwidth
-   correction events

------------------------------------------------------------------------

## Mode 4 --- Jitter Experiment

Keep average latency approximately constant while varying delay
variance.

Example:

``` text
0 ms
10 ms
25 ms
50 ms
100 ms
```

Compare behavior with and without later interpolation techniques.

------------------------------------------------------------------------

## Mode 5 --- Bandwidth Experiment

Limit available bandwidth.

Example:

``` text
10 Mbps
5 Mbps
2 Mbps
1 Mbps
500 Kbps
100 Kbps
```

Observe:

-   update frequency
-   queueing
-   packet delay
-   throughput
-   responsiveness

------------------------------------------------------------------------

## Mode 6 --- Combined Impairments

Combine multiple impairments.

Example:

``` text
Latency:       100 ms
Jitter:         25 ms
Packet Loss:     5 %
Bandwidth:       1 Mbps
```

Purpose:

-   reproduce realistic adverse network conditions
-   evaluate overall application behavior

------------------------------------------------------------------------

# 9. Metrics

The project should distinguish between **network metrics** and
**application metrics**.

## Network Metrics

-   RTT
-   one-way configured delay
-   packets sent
-   packets received
-   packets dropped
-   packet duplication count
-   packet reordering count
-   throughput
-   effective bandwidth
-   update rate

## Application Metrics

-   player-state divergence
-   position error
-   prediction error
-   correction frequency
-   reconciliation frequency
-   input-to-response delay
-   pending input count
-   server tick rate
-   server processing time
-   client update frequency
-   projectile events
-   hit/death events
-   respawn events

Advanced synchronization techniques can introduce additional metrics.

------------------------------------------------------------------------

# 10. Advanced Synchronization Extensions

These techniques are intentionally separated from the core prediction and
reconciliation system.

### Snapshot Interpolation

Remote-player snapshots can be buffered and interpolated to make remote
movement appear smoother under jitter.

```text
Server
  │
  ├── Snapshot 1
  ├── Snapshot 2
  ├── Snapshot 3
  └── Snapshot 4
             │
             ▼
       Client interpolation
```

### Delta / State-Change Synchronization

Instead of transmitting the complete relevant state every time, the server
can transmit only changes.

```text
Δx = +4
Δy = 0
```

### Synchronization Strategy Comparison

If time permits, different synchronization strategies can be implemented and
measured under identical emulator configurations.

The purpose is to investigate how synchronization techniques affect
responsiveness, state divergence, correction behavior, bandwidth usage, and
perceived smoothness.

**Important:** client-side prediction and server reconciliation are core
requirements and are defined in Phase 3. They must not be treated as optional
extensions.

------------------------------------------------------------------------

# 11. Repository Structure

Proposed structure:

``` text
networked-game/
│
├── client/
│   ├── package.json
│   ├── src/
│   │   ├── game/
│   │   ├── networking/
│   │   ├── ui/
│   │   └── main/
│   └── electron/
│
├── server/
│   ├── app/
│   │   ├── game/
│   │   ├── networking/
│   │   ├── protocol/
│   │   └── metrics/
│   ├── server.py
│   └── requirements.txt
│
├── emulator/
│   ├── app/
│   │   ├── core/
│   │   ├── impairments/
│   │   ├── forwarding/
│   │   ├── metrics/
│   │   └── config/
│   ├── emulator.py
│   └── requirements.txt
│
├── experiments/
│   ├── configs/
│   ├── results/
│   └── analysis/
│
├── shared/
│   └── protocol/
│
├── tests/
│   ├── server/
│   ├── emulator/
│   └── protocol/
│
├── docs/
│   ├── architecture/
│   ├── protocol/
│   └── experiments/
│
├── .gitignore
├── README.md
├── GAMERULES.md
└── LICENSE
```

The exact structure can evolve as implementation begins.

------------------------------------------------------------------------

# 12. Development Milestones

## Milestone 1 --- Repository Setup

-   initialize Git repository
-   create project structure
-   configure Python environment
-   configure TypeScript/Electron/Phaser client
-   establish basic development instructions

## Milestone 2 --- Basic Multiplayer Game

-   implement server
-   implement client connection
-   implement player identification
-   implement player movement
-   implement arena boundaries
-   implement obstacle collision
-   implement projectiles
-   implement projectile collision
-   implement player death
-   implement respawn
-   implement scoring
-   implement three-minute match lifecycle
-   implement authoritative game state
-   support multiple clients

## Milestone 3 --- Application Protocol and Core Synchronization

-   define message types
-   implement serialization
-   add sequence numbers
-   add timestamps where useful
-   document packet structure
-   implement authoritative snapshots
-   implement client-side prediction
-   implement server acknowledgements
-   implement server reconciliation
-   replay unacknowledged inputs after reconciliation
-   measure prediction error and corrections

## Milestone 4 --- Standalone Emulator

-   local endpoint configuration
-   forwarding
-   bidirectional traffic
-   configurable delay
-   configurable packet loss
-   logging

## Milestone 5 --- Additional Impairments

-   jitter
-   bandwidth limiting
-   duplication
-   reordering

## Milestone 6 --- Measurement

-   RTT
-   throughput
-   packet statistics
-   update rate
-   application metrics
-   CSV/JSON export

## Milestone 7 --- Experiments

-   baseline
-   latency sweep
-   loss sweep
-   jitter sweep
-   bandwidth sweep
-   combined impairments

## Milestone 8 --- Advanced Synchronization

Only if the core system is stable:

-   snapshot interpolation
-   delta/state-change synchronization
-   synchronization strategy comparison

Client-side prediction and server reconciliation are already completed in
Milestone 3 and are not part of this optional milestone.

------------------------------------------------------------------------

# 13. Definition of Done

The core project is considered complete when:

-   [ ] Two or more clients can connect to the server
-   [ ] Players can move within the arena
-   [ ] Players cannot pass through arena boundaries or obstacles
-   [ ] Players can fire linear projectiles
-   [ ] Projectiles collide with players and collidable objects
-   [ ] A single projectile hit eliminates a player
-   [ ] The shooter receives one point for an elimination
-   [ ] Eliminated players respawn after a configurable delay
-   [ ] Matches last three minutes
-   [ ] The final scoreboard determines the winner or draw
-   [ ] The server maintains authoritative state
-   [ ] Client-side prediction is implemented
-   [ ] Server reconciliation is implemented
-   [ ] Application traffic passes through the standalone emulator
-   [ ] Emulator configuration can be changed without modifying game code
-   [ ] Latency can be introduced
-   [ ] Jitter can be introduced
-   [ ] Packet loss can be introduced
-   [ ] Bandwidth can be limited
-   [ ] Packet duplication can be introduced
-   [ ] Packet reordering can be introduced
-   [ ] Network metrics are recorded
-   [ ] Application metrics are recorded
-   [ ] Prediction and correction metrics are recorded
-   [ ] Experiments produce CSV/JSON results
-   [ ] Traffic can be inspected using Wireshark
-   [ ] Server and emulator have automated tests
-   [ ] Experimental results are reproducible

Optional:

-   [ ] Snapshot interpolation
-   [ ] Delta/state-change synchronization
-   [ ] Comparison of synchronization strategies

------------------------------------------------------------------------

# 14. Project Demonstration

A final demonstration should tell a simple story.

### Step 1 --- Normal Network

Run the multiplayer game normally.

Show:

-   smooth movement
-   normal RTT
-   normal bandwidth

### Step 2 --- Introduce Latency

Set:

``` text
Latency = 200 ms
```

Demonstrate the effect.

### Step 3 --- Introduce Packet Loss

Set:

``` text
Packet Loss = 10%
```

Demonstrate missing updates and state inconsistencies.

### Step 4 --- Add Jitter

Show unstable movement/update behavior.

### Step 5 --- Apply Combined Conditions

Use something like:

``` text
100 ms latency
25 ms jitter
5% packet loss
1 Mbps bandwidth
```

Observe the resulting application behavior.

### Step 6 --- Prediction and Reconciliation

Demonstrate local movement with client-side prediction and show how the
client reconciles when the authoritative server state differs.

### Step 8 --- Analyze

Show the recorded metrics and graphs.

### Optional Step 9 --- Advanced Synchronization

Enable an additional technique such as snapshot interpolation and demonstrate
how the application's behavior changes under the same adverse network
conditions.

------------------------------------------------------------------------

# 15. Academic Relevance

The project covers concepts from multiple parts of IT23501:

  Project Area                Relevant Concepts
  --------------------------- ------------------------------------
  Multiplayer client/server   Application layer
  Socket communication        Transport layer
  Packet transmission         Transport/network behavior
  Packet loss                 Reliability and network behavior
  Latency/jitter              Network performance
  Bandwidth                   Performance metrics
  Addressing                  Network layer
  Packet inspection           Protocol headers
  Network emulator            Controlled network experimentation
  Synchronization             Application-level networking
  Performance analysis        Network measurement

The project is intentionally application-driven while still exposing the
underlying networking mechanisms.

------------------------------------------------------------------------

# 16. Design Principles

### Networking over game complexity

Do not spend excessive time building game mechanics.

### Modular emulator

The emulator should not know what a "player" or "game packet" means.

### Reproducible experiments

The same configuration should produce a repeatable experiment.

### Observable behavior

Important network events should be measurable and, where useful, visible
in the UI.

### Layer separation

Keep game logic, protocol logic, server logic, emulator logic, and
experiment analysis separate.

### Extensibility

The core architecture should allow later synchronization techniques
without rewriting the entire project.

------------------------------------------------------------------------

# 17. Initial Setup

This section will be expanded as implementation begins.

Expected tools:

-   Node.js
-   npm
-   Python 3.12+
-   Git
-   Wireshark
-   VS Code or another suitable IDE

Client:

``` bash
cd client
npm install
npm run dev
```

Server:

``` bash
cd server
python -m venv .venv
```

Activate the virtual environment and install dependencies:

``` bash
pip install -r requirements.txt
```

Run:

``` bash
python server.py
```

Emulator:

``` bash
cd emulator
python -m venv .venv
pip install -r requirements.txt
python emulator.py
```

Exact commands will be finalized after the initial project scaffolding
is implemented.

------------------------------------------------------------------------

# 18. Future Possibilities

The architecture intentionally leaves room for:

-   advanced synchronization
-   multiple emulator instances
-   distributed clients
-   richer experiment dashboards
-   automated experiment sweeps
-   graphical network topology visualization
-   protocol decoding
-   experiment replay
-   additional network impairments
-   comparison of different synchronization strategies

The scope should remain controlled: the **core deliverable is the
multiplayer application + standalone network emulator + controlled
experiments**.

------------------------------------------------------------------------

## Working Title

**NetPlay Lab**

### Subtitle

**Experimental Analysis of Real-Time Multiplayer Networking Under
Controlled Network Conditions**

------------------------------------------------------------------------

## Core Project Statement

> **NetPlay Lab is a software-based experimental platform that
> demonstrates and measures the behavior of a real-time multiplayer
> application under controlled network impairments using a standalone,
> reusable network emulator.**

The project progresses from a working multiplayer arena shooter to core
client-side prediction and server reconciliation, then to controlled network
degradation and quantitative analysis. Additional synchronization techniques
remain optional extensions.
