# NoBu Shooter

A real-time multiplayer arena shooter demonstrating client-side prediction, server reconciliation, snapshot vs state synchronisation (full / delta snapshots, state sync with extrapolation), and an active network impairment emulator (latency, jitter, packet loss, bandwidth limit, duplication, reordering) controlled live from an in-game **Network Lab**.

> The game is the demo application; the networking is the point.

**Project status:** see [`PHASES.md`](PHASES.md) — the project is built in six phases (plus the owner's Phase 2.5), each ending with a demoable checkpoint. Phases 1 (correct core netcode), 2 (Compare view), 2.5 (gameplay + textures) and 3 (sync models: full vs delta snapshots vs state sync with extrapolation) are complete; Phase 4 (presenter mode) is next.

---

## 🚀 Quickstart Guide (Fresh Clone Setup)

Follow these steps to get NoBu Shooter up and running on a freshly cloned machine.

### 1. Prerequisites

- **Node.js**: `v20.0.0` or later ([Download Node.js](https://nodejs.org/))
- **npm**: `v9.0.0` or later (packaged with Node.js)
- A modern browser: Google Chrome, Microsoft Edge, Brave, or Mozilla Firefox.

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

Run the orchestrator script to concurrently start the Game Server, Network Emulator, and Vite Client:

```bash
npm run demo
```

This single command checks that the ports are free and starts:
- **Game Server** on `ws://localhost:8080` (authoritative physics & tick loop)
- **Network Emulator** on `ws://localhost:9000` (proxy) and `ws://localhost:9001` (control/telemetry)
- **Vite Web Client** on `http://localhost:5173`

Once started, open your browser to:
👉 **[http://localhost:5173](http://localhost:5173)**

Click **Quick Match (vs bots)** to play, or **Network Lab — Compare** to compare netcode settings side by side: 2–4 panes driven by one keyboard, an optional reference pane connected straight to the server, scripted moving targets, and one-click comparisons (prediction, interpolation, redundancy).

Quick Match rotates through four maps (`neon → warehouse → plaza → overgrown`, one per match), with ammo and reloads, six power-ups at random spots, survivor avatars and sound (`GAMERULES.md`). `npm run demo` also enables a developer **Invincible** switch in the Network Lab (not available any other way). To start on a particular map: `NOBU_MAPS=plaza npm run demo` (PowerShell: `$env:NOBU_MAPS='plaza'; npm run demo`).

Stop everything with `Ctrl+C` — all four ports are released. (If the launcher is killed some other way, its child processes notice within ~1 s and exit by themselves.)

---

### 4. Running Tests & Smoke Verification

Ensure your environment passes all test suites and the headless end-to-end simulation:

```bash
# Run unit and integration tests (130 tests: sim, protocol, emulator pipeline, game rules,
# weapons/ammo/reload, power-ups, map layouts, sync models (delta/state encoders, extrapolation),
# movement keys, movers/spectators, Compare layout/input/presets, and an end-to-end netcode
# harness: real server + client + emulator pipeline on fake timers, incl. the twin-pane check
# and full vs delta vs state under Nightmare)
npm test

# Type-check server, emulator, shared code, tests and client
npm run typecheck

# Run the automated headless bot smoke test through the emulator under Nightmare preset
# (also checks ammo, reload, bot shots, power-ups, the map id, the lab movers, and a
# delta-sync client that must decode the server's world exactly with far fewer bytes)
npm run smoke

# Re-pack the player animation atlas after changing frames in assets/sprites/player
npm run pack-assets
```

---

## 🎮 Controls & Shortcuts

| Action | Control |
|---|---|
| **Movement** | `W`, `A`, `S`, `D` (by physical key position, any layout) or Arrow Keys |
| **Aim** | Mouse cursor |
| **Shoot** | Hold Left Click |
| **Reload** | `R` (also automatic when the magazine is empty) |
| **Power-ups** | Walk over one (random spots, ≤ 1 per 2 players): Rapid Fire (rifle), Spread Shot (shotgun), Shield, Speed, Piercing, Dash (`Space`) |
| **Developer toggle** | `npm run demo` only: Network Lab → **Developer → Invincible** |
| **Mute sounds** | `M` (volume in Settings, `Esc`) |
| **Toggle Network Lab** | `Tab` |
| **Netcode toggles** | `P` prediction, `C` reconciliation (was `R` until 2026-10-10; `R` is now reload), `I` interpolation, `G` ghost (while shown it replaces your cyan ring) |
| **Sync model** | `Y` cycles Full → Delta → State 10 Hz → State 30 Hz, live (Network Lab → **SYNC MODEL**; remembered; default Full). Full = whole world every snapshot, Delta = only changes since the last acknowledged snapshot, State = records + velocity, extrapolated |
| **Controls / Settings** | `F1` / `Esc` |
| **Leave match** | **◄ LEAVE MATCH** (bottom-left of the arena), or `Esc` → **◄ LEAVE MATCH — BACK TO MAIN MENU** (end of the settings menu). Compare: **◄ EXIT** (top bar) |
| **Network Presets** | Keys `1` through `5` |
| **Preset 1** | Baseline (no impairment) |
| **Preset 2** | Café Wi-Fi (25 ms ± 15 ms jitter, 1% loss) |
| **Preset 3** | Mobile 4G (45 ms ± 25 ms jitter, 2% loss, 5 Mbps) |
| **Preset 4** | Transatlantic (90 ms ± 8 ms jitter, 0.5% loss) |
| **Preset 5** | Nightmare (120 ms ± 50 ms jitter, 12% burst loss, 3% dup, 5% reorder, 400 kbps) |
| **Compare view** | **Network Lab — Compare** on the landing page. Presets: Prediction, Interpolation, Redundancy, **Sync** (Full / Delta / State at Nightmare), **Bandwidth** (Full vs Delta at 300 kbps), **State Hz** (State 10 vs 30 Hz), Custom. Inside: `Tab` network drawer, `1`–`5` presets, click a pane then `P` / `C` / `I` / `G` to toggle its settings or `Y` to cycle its sync model, `T` truth rings. The dock shows a table and a live bandwidth chart with the emulator's cap |

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
│   └── archive/SPEC-v1.md  # Original v1 build spec (archived)
└── NoBu-Shooter/           # Primary application workspace
    ├── assets/             # Textures, sprites, FX and sound effects (inventory: assets/README.md, licences: assets/CREDITS.md)
    ├── client/             # Phaser 3 + React HUD & Network Lab UI (Vite)
    ├── emulator/           # Standalone bidirectional network impairment proxy
    ├── server/             # Authoritative 60 Hz headless WebSocket game server
    ├── shared/             # Deterministic simulation, protocol codec, sync models (full / delta / state)
    ├── scripts/            # Demo launcher, smoke test, headless bot
    └── tests/              # Vitest suites incl. the end-to-end netcode harness
```

---

## 🏗️ Architecture

```text
┌────────────────────────┐                   ┌────────────────────────┐
│  Browser (Phaser + UI) │ ────ws:9000─────► │    Network Emulator    │
│  Client-side Prediction│                   │ Latency/Jitter/Loss/Dup│
│  Server Reconciliation │ ◄───impaired───── │   Bandwidth Throttle   │
└────────────────────────┘                   └───────────┬────────────┘
            ▲                                            │
            │ ws:9001 (Control/Stats)                    │ ws:8080 (Clean)
            │                                            ▼
┌───────────┴────────────┐                   ┌────────────────────────┐
│ Network Lab (React HUD)│                   │   Game Server (Node.js)│
│ Live Sliders & Presets │                   │  Authoritative 60 Hz   │
│ Sparklines & Compare   │                   │ Deterministic Sim Loop │
└────────────────────────┘                   └────────────────────────┘
```

---

## 🛠️ Troubleshooting & FAQ

- **"Port(s) already in use" on start**:
  `npm run demo` checks ports 5173/8080/9000/9001 first and prints the command to free them. Usually a previous demo is still running. You can find and terminate processes holding these ports (e.g., in Windows PowerShell: `Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | Stop-Process -Force`).
- **Dependencies not found after pulling**:
  Run `npm install` at root, or run `cd NoBu-Shooter && npm install`.
- **`D` (or `P`, `R`, `C`, `1`–`5`) does nothing, while the arrow keys work**:
  A browser extension is consuming the key before the page sees it. **Vimium** does exactly this: it maps `d` (scroll half page down), `r` (reload!), `p` (open clipboard URL), `y` (copy URL — the sync-model key) and digits (count prefix). Exclude the demo in Vimium: click the Vimium toolbar icon on the demo tab and choose *Exclude*, or add `http://localhost:5173/*` and `http://127.0.0.1:5173/*` with an empty key list under Vimium Options → *Excluded URLs and keys*. A browser profile without such extensions works too.
- **Canvas render error or blank page**:
  Hard refresh the browser (`Ctrl + F5`) to clear Vite cache. Ensure your browser supports WebGL / HTML5 Canvas.

---

## 🎨 Credits

Art and sound in `NoBu-Shooter/assets/` (full list and licences: [`assets/CREDITS.md`](NoBu-Shooter/assets/CREDITS.md)):

- Player avatar: **"Animated Top Down Survivor Player"** by Riley Gombart — [OpenGameArt](https://opengameart.org/node/38111), CC-BY 3.0.
- Props and drone target: **"RC Art – Rough Props"** by Reactorcore — [OpenGameArt](https://opengameart.org/content/rough-industrial-combat-props), credited (CC0 / CC-BY 4.0).
- Pickup icons: **ring icons** by qubodup (CC0); Spread Shot and Speed badges made for this project from CC0 art.
- All other textures, effects and sounds: CC0.
