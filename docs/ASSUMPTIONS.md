# NoBu Shooter — Implementation Decisions & Assumptions

Per `SPEC.md` §3 Rule 1:
> "When something is unclear, choose the simplest option consistent with this spec, and record it as one line in `docs/ASSUMPTIONS.md`."

---

### Architectural & Simulation Assumptions

1. **Monorepo Layout**: Built with npm workspaces under `./NoBu-Shooter` (`shared`, `server`, `emulator`, `client`) with root convenience proxies so commands like `npm run demo`, `npm test`, and `npm run smoke` operate smoothly from either root or project directory.
2. **Fixed Timestep & Determinism**: The game simulation strictly runs at 60 Hz (`dt = 1/60`) using integer key masks and normalized diagonal vectors (`Math.SQRT1_2`) without trig in the player movement path to prevent phantom prediction discrepancies.
3. **Transport Semantics**: WebSockets transport JSON messages where each text frame is treated as an independent datagram by the network emulator pipeline, with 28 simulated header bytes added for bandwidth calculation.
4. **Art and Asset Pipeline**: In accordance with the prompt ("do not generate textures and models, leave them as references and add comments to mark the spot"), all game visuals are rendered procedurally via Phaser 3 Graphics with explicit `/* TEXTURE: <name> */` comments marking integration points for future custom sprites.
5. **Bot Execution Model**: Bots are simulated server-side and feed identical input structures into room authority without network latency; their traffic intentionally bypasses the external network emulator.
6. **Reconciliation Error Smoothing**: Prediction errors below `epsilonPx` (0.01 px) are ignored; errors between 0.01 px and 64 px are exponentially decayed via `smoothHalfLifeMs` (80 ms); errors exceeding 64 px execute an instantaneous snap.
7. **Event Redundancy**: Server snapshots redundantly retransmit game events from the preceding 500 ms; clients track and deduplicate events by unique `eid`.
8. **Browser Port Alignment**: Client Vite dev server runs on port 5173, Game Server on port 8080, Emulator Data on port 9000, and Emulator Control on port 9001.
