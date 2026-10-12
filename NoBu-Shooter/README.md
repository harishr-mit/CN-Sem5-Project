# NoBu Shooter

Monorepo workspace for NoBu Shooter.

For complete project documentation, architecture overview, and guides, see the [Root README](../README.md).

## Quick Commands (inside `NoBu-Shooter/`)

```bash
# Install dependencies
npm install

# Run full stack demo (Server + Emulator + Client); dashboard at http://127.0.0.1:9001/
npm run demo
npm run demo -- --swarm 3      # plus 3 network players over UDP

# The game edition for players on this machine and the LAN (no emulator or demo tools):
npm run build                  # → dist/game
npm start                      # page + game on :8080; players open http://<this machine's IP>:8080
npm run dev                    # the same with hot reload on :5173 (also reachable from the LAN)
npm run assets                 # regenerate the art/sound tiers in assets-build/ (demo, dev and build do it)

# Network players beside a running demo (--n, --sync, --room, --direct, --duration)
npm run swarm

# The emulator on its own (dashboard only; add routes there) + generic UDP tools
npm run emulator
npm run udp-echo -- --port 7000
npm run udp-send -- --to 9100

# Run all test suites
npm test

# Type-check server, emulator, shared, tests and client
npm run typecheck

# Run the headless smoke test (through the emulator, Nightmare preset; incl. one UDP network player, two lockstep players,
# and the built game on its own server: a quick match through the join window and a private room)
npm run smoke

# Screenshot every screen at 1280×720 and 1920×1080 (local Chrome; output in artifacts/shots/)
npm run shots
```

Every command, with its options: [Command Reference](../README.md#-command-reference). The emulator: [`emulator/README.md`](emulator/README.md). Project phases and status: [`../PHASES.md`](../PHASES.md).
