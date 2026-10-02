# NoBu Shooter

A small real-time multiplayer arena shooter that demonstrates, live and visually:

- **client-side prediction and server reconciliation**,
- a **standalone network emulator** (latency, jitter, packet loss, bandwidth limit, duplication, reordering) controlled from an in-game **Network Lab**,
- a polished neon UI.

The game is the demo application; the networking is the point.

## Quick start

```bash
npm install
npm run demo      # starts server, emulator and client; open the printed URL
```

Other commands: `npm test` (unit and integration tests), `npm run smoke` (headless bot through the emulator).

## Controls

`WASD` / arrow keys move · mouse aims · hold left click to fire · `Tab` toggles the Network Lab · `1`–`5` apply network presets.

## Documents

| File | Purpose |
|---|---|
| `SPEC.md` | Build specification: architecture, protocol, netcode, emulator, UI, tests |
| `GAMERULES.md` | Gameplay rules and game constants |
| `docs/DEMO_SCRIPT.md` | Step-by-step demo walkthrough |
| `docs/PROTOCOL.md` | Wire protocol reference |

## Architecture

```text
 Browser (Phaser + React)  ──ws──►  Network Emulator  ──ws──►  Game Server (authoritative)
   prediction, reconcile            impairs each message         shared deterministic sim
        ▲                                  ▲
        └──── control + stats (ws) ────────┘      Network Lab sliders / packet-flow strip
```
