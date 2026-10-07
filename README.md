# NoBu Shooter

A real-time multiplayer arena shooter demonstrating client-side prediction, server reconciliation, and an active network impairment emulator (latency, jitter, packet loss, bandwidth limit, duplication, reordering) controlled live from an in-game **Network Lab**.

> The game is the demo application; the networking is the point.

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

This single command starts:
- **Game Server** on `ws://localhost:8080` (authoritative physics & tick loop)
- **Network Emulator** on `ws://localhost:9000` (proxy) and `ws://localhost:9001` (control/telemetry)
- **Vite Web Client** on `http://localhost:5173`

Once started, open your browser to:
👉 **[http://localhost:5173](http://localhost:5173)**

Click **Quick Match** or **Practice vs Bots** to jump into the arena!

---

### 4. Running Tests & Smoke Verification

Ensure your environment passes all test suites and the headless end-to-end simulation:

```bash
# Run unit and integration tests (18 tests across sim, protocol, reconciliation, emulator, rules)
npm test

# Run the automated headless bot smoke test through the emulator under Nightmare preset
npm run smoke
```

---

## 🎮 Controls & Shortcuts

| Action | Control |
|---|---|
| **Movement** | `W`, `A`, `S`, `D` or Arrow Keys |
| **Aim** | Mouse cursor |
| **Shoot** | Hold Left Click |
| **Toggle Network Lab** | `Tab` |
| **Network Presets** | Keys `1` through `5` |
| **Preset 1** | Perfect LAN (0 ms latency, 0% loss) |
| **Preset 2** | Good Broadband (35 ms, 0% loss) |
| **Preset 3** | Bad Wi-Fi (85 ms ± 20 ms jitter, 2% loss) |
| **Preset 4** | Congested 4G (180 ms ± 40 ms jitter, 6% loss) |
| **Preset 5** | Nightmare (320 ms ± 100 ms jitter, 15% loss, 3% dup, reorder) |
| **A/B Compare Mode** | Click **A/B Compare** button in Network Lab header |

---

## 📁 Repository Structure

```text
CN-Sem5-Project/
├── .gitignore              # Ignores all node_modules, build artifacts, envs, caches
├── README.md               # Quickstart guide & documentation overview
├── package.json            # Root workspace scripts & postinstall hook
├── log.md                  # Development & task tracking log
├── docs/                   # Specifications and protocol documentation
│   ├── PROTOCOL.md         # Wire protocol specifications (binary format, opcodes)
│   ├── DEMO_SCRIPT.md      # Step-by-step walkthrough for project demonstrations
│   └── ASSUMPTIONS.md      # Architecture design decisions & assumptions
└── NoBu-Shooter/           # Primary application workspace
    ├── client/             # Phaser 3 + React HUD & Network Lab UI (Vite)
    ├── emulator/           # Standalone bidirectional network impairment proxy
    ├── server/             # Authoritative 60 Hz headless WebSocket game server
    ├── shared/             # Deterministic simulation, math, and protocol codec
    ├── scripts/            # Demo launcher and headless bot smoke test
    └── tests/              # Vitest unit & integration test suites
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
│ Sparklines & A/B Mode  │                   │ Deterministic Sim Loop │
└────────────────────────┘                   └────────────────────────┘
```

---

## 🛠️ Troubleshooting & FAQ

- **Port in use (`EADDRINUSE: 8080` / `9000` / `9001` / `5173`)**:
  Ensure any prior demo process was stopped. You can find and terminate processes holding these ports (e.g., in Windows PowerShell: `Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | Stop-Process -Force`).
- **Dependencies not found after pulling**:
  Run `npm install` at root, or run `cd NoBu-Shooter && npm install`.
- **Canvas render error or blank page**:
  Hard refresh the browser (`Ctrl + F5`) to clear Vite cache. Ensure your browser supports WebGL / HTML5 Canvas.
