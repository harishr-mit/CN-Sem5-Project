# NoBu Shooter

A real-time multiplayer arena shooter demonstrating client-side prediction, server reconciliation, snapshot vs state synchronisation (full / delta snapshots, state sync with extrapolation), deterministic lockstep, and a **standalone network impairment emulator** (latency, jitter, packet loss, bandwidth limit, duplication, reordering) for WebSocket and UDP. You control it live from the in-game **Network Lab** or from its own **dashboard**, and it works in front of any app, not just this game.

> The game is the demo application; the networking is the point.

**Project status:** see [`PHASES.md`](PHASES.md) — the project is built in six phases (plus the owner's Phase 2.5), each ending with a demoable checkpoint, and **all six are complete**: 1 (correct core netcode), 2 (Compare view), 2.5 (gameplay + textures), 3 (sync models: full vs delta snapshots vs state sync with extrapolation), 4 (Presenter mode + polish), 5 (UDP transport, network players, standalone emulator with its dashboard) and 6 (deterministic lockstep in the Compare view, final talk track, rehearsal — `docs/REHEARSAL.md`). A candidate Phase 7 (multiplayer readiness) is described but not scheduled.

---

## 🚀 Quickstart Guide (Fresh Clone Setup)

Follow these steps to get NoBu Shooter up and running on a freshly cloned machine.

### 1. Prerequisites

- **Node.js**: `v20.0.0` or later ([Download Node.js](https://nodejs.org/))
- **npm**: `v9.0.0` or later (packaged with Node.js)
- A modern browser: Google Chrome, Microsoft Edge, Brave, or Mozilla Firefox.
- For `npm run shots` only: **Google Chrome** installed normally (the script drives it through the project-local `playwright-core`; no browser is downloaded). Another Chromium browser works via `NOBU_CHROME=<path to its .exe>`.

Verify your environment before starting:
```bash
node -v   # Should output >= v20.0.0
npm -v    # Should output >= v9.0.0
```

> **Windows PowerShell Users:** If PowerShell prevents script execution (`npm.ps1 cannot be loaded`), either run with `npm.cmd` (e.g. `npm.cmd install`, `npm.cmd run demo`) or enable script execution in PowerShell:
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
> ```

---

### 2. Clone & Install Dependencies

Clone the repository and install all dependencies:

```bash
# Clone the repository
git clone https://github.com/harishr-mit/CN-Sem5-Project.git
cd CN-Sem5-Project

# Install all monorepo dependencies (automatically runs workspace install)
npm install
```

*Note: You can also install directly inside the project directory if preferred:*
```bash
cd NoBu-Shooter && npm install
```

---

### 3. Launch the Demo

Run the orchestrator script to start the Game Server, the Network Emulator and the Vite client together:

```bash
npm run demo                 # the game, the emulator and its dashboard
npm run demo -- --swarm 3    # the same, plus 3 network players over UDP
```

This single command checks that the ports are free and starts:
- **Game Server:** WebSocket `:8080` and UDP `:8081` (authoritative 60 Hz simulation).
- **Network Emulator** with two routes:
  - `ws:9000 → :8080` for the browser;
  - `udp:9100 → :8081` for the network players.

  Its **dashboard** and control API are at `http://127.0.0.1:9001/` (only reachable from this machine).
- **Vite Web Client** on `http://localhost:5173`.
- With `--swarm N`: **N network players** (`UDP-1` … `UDP-N`). These are headless game clients that play like the bots, but their own traffic crosses the emulator over UDP.

Once started, open your browser to:
👉 **[http://localhost:5173](http://localhost:5173)**

Click **Quick Match (vs bots)** to play, or **Network Lab — Compare** to compare netcode settings side by side: 2–4 panes driven by one keyboard, an optional reference pane connected straight to the server, scripted moving targets, and one-click comparisons (prediction, interpolation, redundancy, sync models, bandwidth, state rate, snapshot vs lockstep).

**Presenter mode** (for giving the talk): **Presenter — Quick Match** runs 13 scripted steps in a match (baseline → server delay → prediction → loss → redundancy → reconciliation off → jitter → interpolation → nudge → Nightmare with full / delta / state sync → network players over UDP); **Presenter — Compare** steps through the seven Compare presets (C7 = Snapshot vs Lockstep). Each step sets the network, every netcode toggle and the sync model at once and shows a caption bar with what to watch, the expected numbers and a step timer. `N` next, `B` back (exactly the same state again), `H` hides the caption, **END** leaves. Every normal key still works in between. The bar also has **⟲ RESTART** (the game back to its starting case and the talk back to step 1) and **map** buttons (restart the game on that map; the talk stays on its step). In Quick Match the presenter stops the match clock (HUD ∞) and turns on the developer **Invincible** switch so bots can't interrupt; these, RESTART and the map buttons need `npm run demo`. The steps are listed in `docs/DEMO_SCRIPT.md` §12. Step 13 impairs only the network players' route, so it needs network players: start them **when you reach step 13**, with `npm run swarm -- --n 3` in a second terminal (the bar says when none are connected). Started from the beginning (`npm run demo -- --swarm 3`) they make the match bigger — full snapshots ≈ 800 instead of ≈ 475 kbps — and under Nightmare (steps 10–12) even Delta then stays above the 400 kbps cap (`docs/REHEARSAL.md`).

**Emulator dashboard** (landing page button, the Lab's **DASHBOARD ↗** link, or `http://127.0.0.1:9001/`) shows:
- every route and session, the browser's and the network players' side by side;
- presets and a control for every impairment, for all routes, one route or one session, in both directions or one;
- live charts and a packet log.

The in-game Network Lab changes only the game's own route (`ws:9000`).

Quick Match rotates through four maps (`neon → warehouse → plaza → overgrown`, one per 2-minute match), with ammo and reloads, six power-ups at random spots, survivor avatars and sound (`GAMERULES.md`). `npm run demo` also enables a developer **Invincible** switch in the Network Lab (not available any other way). To start on a particular map: `NOBU_MAPS=plaza npm run demo` (PowerShell: `$env:NOBU_MAPS='plaza'; npm run demo`).

Stop everything with `Ctrl+C`, which releases all six ports (TCP 5173, 8080, 9000, 9001; UDP 8081, 9100). If the launcher is killed some other way, its child processes notice within ~1 s and exit by themselves.

---

### 4. Try the emulator on its own (no game)

The emulator is a separate tool, and the game is just one of its clients. In three terminals:

```bash
npm run udp-echo -- --port 7000        # a UDP app that echoes what it gets
npm run emulator                       # dashboard only: open http://127.0.0.1:9001/
npm run udp-send -- --to 9100          # numbered messages through the emulator
```

1. On the dashboard, add a route: UDP, listen `9100`, target `127.0.0.1:7000`. Every message now comes back.
2. Set **Loss** to 20 %: `udp-send` reports the numbers that never come back, and the packet log shows them as lost.

`emulator/README.md` covers WebSocket apps, the command line, the control API and the safety rules.

---

### 5. Running Tests & Smoke Verification

Ensure your environment passes all test suites and the headless end-to-end simulation:

```bash
# Run unit and integration tests (222 tests: sim, protocol, emulator pipeline incl. queue
# depth and reorder marks, emulator routes (WS + UDP over real sockets, runtime routes,
# route-scoped presets, control-port safety, "imports nothing from the game"), UDP fragments,
# the server's UDP adapter, game rules, weapons/ammo/reload, power-ups, map layouts, sync models
# (delta/state encoders, extrapolation), movement keys, movers/spectators, Compare
# layout/input/presets, Presenter scripts + controller, developer/Presenter room commands,
# and an end-to-end netcode harness:
# real server + client + emulator pipeline on fake timers, incl. the twin-pane check and
# full vs delta vs state under Nightmare, NetClient over real UDP through the emulator, and
# lockstep: replay ≡ the server bit for bit over 2 000 ticks, the encoder, and two lockstep
# clients that stay identical to the server under random and burst loss with 0 desyncs)
npm test

# Type-check server, emulator, shared code, tests and client
npm run typecheck

# Run the automated headless smoke test through the emulator under the Nightmare preset
# (8 steps: a WS bot incl. ammo, reload, bot shots, power-ups and the map id; the lab movers;
# a delta-sync client that must decode the server's world exactly with far fewer bytes;
# one UDP network player through udp:9100 whose fragmented snapshots must reassemble;
# and two lockstep lab players at 50 ms + 5 % loss that must replay the server exactly)
npm run smoke

# Screenshot every screen at 1280×720 and 1920×1080 with local Chrome (starts and stops the
# demo itself; ≈ 5 min, `-- --fast` ≈ 3 min). Output: NoBu-Shooter/artifacts/shots/ (git-ignored),
# with fps and console errors per shot in index.json; fails on any console error.
# Review against docs/VISUAL_CHECKLIST.md
npm run shots

# Re-pack the player animation atlas after changing frames in assets/sprites/player
npm run pack-assets
```

---

## 📋 Command Reference

Run these from the repository root; from `NoBu-Shooter/` the same `npm run …` commands work too. Arguments go after `--`. In PowerShell, set environment variables first, e.g. `$env:NOBU_MAPS='plaza'; npm run demo`.

**Run the game**

| Command | What it does |
|---|---|
| `npm run demo` | Server (WS 8080, UDP 8081) + emulator (routes `ws:9000`, `udp:9100`; dashboard 9001) + client (5173). `Ctrl+C` stops everything |
| `npm run demo -- --swarm 3` | The same, plus 3 network players over UDP (`UDP-1…3`). For the Presenter talk, start them only at step 13 instead (`npm run swarm -- --n 3`, below) |
| `NOBU_MAPS=plaza npm run demo` | Start the rotation on a given map (`neon`, `warehouse`, `plaza`, `overgrown`) |
| `NOBU_HOST=127.0.0.1 npm run demo` | Bind the game server to this machine only (default: all interfaces, so others on the LAN can join) |

**Network players**

| Command | What it does |
|---|---|
| `npm run swarm` | 3 network players through the emulator's UDP route (needs the demo running) |
| `npm run swarm -- --n 5 --sync delta` | 5 players with delta snapshots (`--sync full\|delta\|state`, `--hz 30` for state) |
| `npm run swarm -- --room lab` | Join the movement-only lab room instead of the match |
| `npm run swarm -- --direct` | Straight to the server's UDP port, bypassing the emulator |
| `npm run swarm -- --duration 10` | Play 10 s, then check the run and exit (0 = healthy) |
| `npm run swarm -- --verbose` | Also log every prediction correction with its context (`--quiet`: no status table) |

**The emulator on its own** (details: [`NoBu-Shooter/emulator/README.md`](NoBu-Shooter/emulator/README.md))

| Command | What it does |
|---|---|
| `npm run emulator` | Dashboard + control API only, at `http://127.0.0.1:9001/`; add routes there |
| `npm run emulator -- --route udp:9100=127.0.0.1:7000` | Start with a route (repeatable; `ws:9200=ws://127.0.0.1:8080` for WebSocket; `udp:127.0.0.1:9100=…` = this machine only) |
| `npm run emulator -- --control 9101 --seed 7` | Another dashboard port; another impairment seed |
| `npm run udp-echo -- --port 7000` | A generic UDP app: prints and echoes every datagram |
| `npm run udp-send -- --to 9100 --rate 5` | A generic UDP client: numbered messages, reports which never come back (`--count`, `--text`) |

**Check and build**

| Command | What it does |
|---|---|
| `npm test` | All unit and integration tests (Vitest) |
| `npm run typecheck` | TypeScript check of server, emulator, shared code, scripts, tests and client |
| `npm run smoke` | Headless end-to-end smoke test under Nightmare (starts and stops its own server + emulator) |
| `npm run shots` | Screenshots of every screen at 1280×720 and 1920×1080 (`-- --fast`, `-- --only=dashboard,presenter`) |
| `npm run pack-assets` | Re-pack the player animation atlas |
| `npm install` | Install everything (root `postinstall` installs the `NoBu-Shooter` workspace) |

---

## 🎮 Controls & Shortcuts

| Action | Control |
|---|---|
| **Movement** | `W`, `A`, `S`, `D` (by physical key position, any layout) or Arrow Keys |
| **Aim** | Mouse cursor |
| **Shoot** | Hold Left Click |
| **Reload** | `R` (also automatic when the magazine is empty) |
| **Power-ups** | Walk over one (random spots, up to one per player, a new one every 7 s): Rapid Fire (rifle), Spread Shot (shotgun), Shield, Speed, Piercing, Dash (`Space`) |
| **Developer toggle** | `npm run demo` only: Network Lab → **Developer → Invincible**, and **Give power-up** (Rapid, Spread, Shield, Speed, Pierce, Dash — applied as if picked up) |
| **Mute sounds** | `M` (volume in Settings, `Esc`) |
| **Toggle Network Lab** | `Tab` |
| **Netcode toggles** | `P` prediction, `C` reconciliation (was `R` until 2026-10-10; `R` is now reload), `I` interpolation, `G` ghost (while shown it replaces your cyan ring) |
| **Sync model** | `Y` cycles Full → Delta → State 10 Hz → State 30 Hz, live (Network Lab → **SYNC MODEL**; remembered; default Full; Compare panes add **Lockstep**). Exactly one is active, shown in two groups: **Snapshots** (interpolated) — Full = whole world every snapshot, Delta = only changes since the last acknowledged snapshot — and **State sync** (extrapolated) — records + velocity at 10 or 30 Hz |
| **Controls / Settings** | `F1` / `Esc` |
| **Projector** | Settings → **UI Scale** 100 / 115 / 130 % (all panels and text, not the arena; remembered) |
| **Network Lab sections** | Click a section title to fold it; the Lab remembers. Defaults fit 1920 × 1080 and 1280 × 720 without scrolling |
| **Presenter mode** | Landing page **Presenter — Quick Match** (13 steps) / **Presenter — Compare** (7): `N` next step, `B` previous step, `H` hide the caption; bar buttons **⟲ RESTART**, **map** (Neon / Warehouse / Plaza / Overgrown — restarts the game there) and **END**; step 13 adds **OPEN DASHBOARD ↗** |
| **Emulator dashboard** | Landing page **EMULATOR DASHBOARD ↗**, Network Lab **DASHBOARD ↗**, or `http://127.0.0.1:9001/` (new tab). The Lab's presets change only the game's route; the dashboard reaches every route and session |
| **Leave match** | **◄ LEAVE MATCH** (bottom-left of the arena), or `Esc` → **◄ LEAVE MATCH — BACK TO MAIN MENU** (end of the settings menu). Compare: **◄ EXIT** (top bar) |
| **Network Presets** | Keys `1` through `5` |
| **Preset 1** | Baseline (no impairment) |
| **Preset 2** | Café Wi-Fi (25 ms ± 15 ms jitter, 1% loss) |
| **Preset 3** | Mobile 4G (45 ms ± 25 ms jitter, 2% loss, 5 Mbps) |
| **Preset 4** | Transatlantic (90 ms ± 8 ms jitter, 0.5% loss) |
| **Preset 5** | Nightmare (120 ms ± 50 ms jitter, 12% burst loss, 3% dup, 5% reorder, 400 kbps) |
| **Compare view** | **Network Lab — Compare** on the landing page. Presets: Prediction, Interpolation, Redundancy, **Sync** (Full / Delta / State at Nightmare), **Bandwidth** (Full vs Delta at 300 kbps), **State Hz** (State 10 vs 30 Hz), **Lockstep** (Full / Lockstep / Lockstep + Rd at 50 ms + 5 % loss), Custom. Inside: `Tab` network drawer, `1`–`5` presets, click a pane then `P` / `C` / `I` / `G` to toggle its settings or `Y` to cycle its sync model (… → Lockstep; on a lockstep pane only **Rd** applies: on = redundant window, off = resend on request), `T` truth rings. The dock shows a table and a live bandwidth chart with the emulator's cap |

Latencies are one-way, applied in each direction (RTT ≈ 2 × latency).

---

## 📁 Repository Structure

```text
CN-Sem5-Project/
├── .gitignore              # Ignores all node_modules, build artifacts, envs, caches
├── README.md               # Quickstart guide & documentation overview
├── PHASES.md               # Project goals and phased plan (current status)
├── GAMERULES.md            # Gameplay rules and game constants (revised 2026-10-10: weapons, reload, power-ups, maps, look, sound)
├── package.json            # Root workspace scripts & postinstall hook
├── log.md                  # Development & task tracking log (agents)
├── docs/
│   ├── PROTOCOL.md         # Wire protocol (JSON messages) and emulator control API
│   ├── DEMO_SCRIPT.md      # Step-by-step walkthrough with expected numbers
│   ├── ASSUMPTIONS.md      # Design decisions and their reasons
│   ├── PHASE2_PLAN.md      # Phase 2 implementation plan (Compare view, movers)
│   ├── PHASE3_PLAN.md      # Phase 3 implementation plan (sync models)
│   ├── PHASE4_PLAN.md      # Phase 4 implementation plan (Presenter mode, polish, shots)
│   ├── PHASE5_PLAN.md      # Phase 5 implementation plan (UDP, network players, emulator routes + dashboard)
│   ├── PHASE6_PLAN.md      # Phase 6 implementation plan (lockstep, final docs, rehearsal)
│   ├── REHEARSAL.md        # Timing sheet + checklist for the presentation laptop
│   ├── VISUAL_CHECKLIST.md # What to check on the `npm run shots` screenshots
│   └── archive/SPEC-v1.md  # Original v1 build spec (archived)
└── NoBu-Shooter/           # Primary application workspace
    ├── assets/             # Textures, sprites, FX and sound effects (inventory: assets/README.md, licences: assets/CREDITS.md)
    ├── artifacts/          # Generated by `npm run shots` (git-ignored)
    ├── client/             # Phaser 3 + React HUD & Network Lab UI (Vite); presenter/ = Presenter scripts + controller
    ├── emulator/           # Standalone WS + UDP impairment proxy: routes, dashboard/, tools/, README.md (no game dependency)
    ├── server/             # Authoritative 60 Hz headless game server (WebSocket + UDP adapters)
    ├── shared/             # Deterministic simulation, bot brain, protocol codec, sync models, UDP fragments
    ├── scripts/            # Demo launcher, smoke test, network players (swarm.ts), headless bot, screenshots
    └── tests/              # Vitest suites incl. the end-to-end netcode harness
```

---

## 🏗️ Architecture

```text
Browser (Phaser + React) ──WS──►  Emulator route ws:9000  ──WS──►  Game server :8080
Network players (Node)   ──UDP─►  Emulator route udp:9100 ──UDP─►  Game server :8081
                                   (one impaired session per client:
                                    loss · duplication · bandwidth + queue · latency/jitter · reordering)

Network Lab (in the game) ─┐
Emulator dashboard ────────┴──►  control API http/ws 127.0.0.1:9001 (never impaired)
```

- **One server core, two transports:** the server's game logic doesn't know about transports. The WS and UDP adapters feed the same `GameServer`.
- **The 1200-byte rule:** UDP datagrams stay at or under 1200 bytes, so larger messages (full snapshots, ≈ 2–4.5 kB in a fight) travel as fragments. The emulator impairs each fragment on its own, and one lost fragment loses the whole snapshot. That is a second reason why delta snapshots win on lossy links.
- **Browsers stay on WebSocket**, because they can't open UDP sockets. The emulator treats each WS frame as a datagram.
- **Four ways to keep a client in sync** (chosen per connection, live): **full** snapshots (interpolated), **delta** snapshots (changes against the last acknowledged one), **state** sync (records + velocity, extrapolated), and — lab room / Compare only — **lockstep**: the server relays the inputs it consumed per tick and the client replays them with the same movement code, bit for bit (checked by a world hash every 30 ticks). Lockstep sends ≈ 1/10 of the bytes but must wait for every tick: a lost one freezes the world until it is resent (Rd off) or covered by the next message (Rd on).

---

## 🛠️ Troubleshooting & FAQ

- **"Port(s) already in use" on start**:
  `npm run demo` checks TCP 5173/8080/9000/9001 and UDP 8081/9100 first and prints the command to free them. Usually a previous demo is still running. You can find and terminate processes holding these ports (e.g., in Windows PowerShell: `Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | Stop-Process -Force`).
- **Dependencies not found after pulling**:
  Run `npm install` at root, or run `cd NoBu-Shooter && npm install`.
- **`D` (or `P`, `R`, `C`, `1`–`5`) does nothing, while the arrow keys work**:
  A browser extension is consuming the key before the page sees it. **Vimium** does exactly this: it maps `d` (scroll half page down), `r` (reload!), `p` (open clipboard URL), `y` (copy URL — the sync-model key), `n` / `b` / `H` (find next, bookmarks, history back — the Presenter keys) and digits (count prefix). Exclude the demo in Vimium: click the Vimium toolbar icon on the demo tab and choose *Exclude*, or add `http://localhost:5173/*` and `http://127.0.0.1:5173/*` with an empty key list under Vimium Options → *Excluded URLs and keys*. A browser profile without such extensions works too.
- **`npm run shots` says it can't start Google Chrome**:
  Install Chrome, or point the script at another Chromium browser: `NOBU_CHROME="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" npm run shots` (PowerShell: `$env:NOBU_CHROME='…'; npm run shots`). The demo's ports must be free (stop `npm run demo` first).
- **Presenter step 13 says "No network players connected"**:
  Start the demo with `npm run demo -- --swarm 3`, or run `npm run swarm` in a second terminal while the demo runs.
- **The dashboard says OFFLINE**:
  The emulator isn't running (start `npm run demo` or `npm run emulator`). The control API accepts browser pages only from `http://127.0.0.1:9001` / `localhost:9001` and the game (`localhost:5173`); add others with `npm run emulator -- --allow-origin <url>`.
- **Friends on the LAN can't join / Windows asks about `node.exe`**:
  The game server and the emulator's data routes listen on all interfaces, so the first run may show a Windows Defender Firewall prompt; local play works whatever you answer. The client still connects to `127.0.0.1` (playing from another machine is the candidate Phase 7 in `PHASES.md`). Don't expose the UDP ports to the internet.
- **Canvas render error or blank page**:
  Hard refresh the browser (`Ctrl + F5`) to clear Vite cache. Ensure your browser supports WebGL / HTML5 Canvas.

---

## 🎨 Credits

Art and sound in `NoBu-Shooter/assets/` (full list and licences: [`assets/CREDITS.md`](NoBu-Shooter/assets/CREDITS.md)):

- Player avatar: **"Animated Top Down Survivor Player"** by Riley Gombart — [OpenGameArt](https://opengameart.org/node/38111), CC-BY 3.0.
- Props and drone target: **"RC Art – Rough Props"** by Reactorcore — [OpenGameArt](https://opengameart.org/content/rough-industrial-combat-props), credited (CC0 / CC-BY 4.0).
- Pickup icons: **ring icons** by qubodup (CC0); Spread Shot and Speed badges made for this project from CC0 art.
- All other textures, effects and sounds: CC0.
