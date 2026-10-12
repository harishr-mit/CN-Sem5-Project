# Rehearsal — timing sheet and presentation-laptop checklist

**Audience:** the presenter, preparing the talk on the presentation laptop.
**Origin:** `PHASES.md` Phase 6, L5; `docs/PHASE6_PLAN.md` D12. The agent did a dress rehearsal on the development laptop on 2026-10-12 (§1–§2). The presentation laptop is another machine, so its checks (§3) are for the owner to do there and fill in (§4).

---

## 1. Dress rehearsal on the development laptop (2026-10-12)

Windows 11, Node v26.4.0, npm 11.17.0, Google Chrome (headless, the real GPU), 1920 × 1080.

### 1.1 Cold start from a fresh copy

The working tree (tracked + new files, no `node_modules`) was copied into an empty folder and run from there, as a fresh clone would be. The copy was deleted afterwards.

| Step | Command | Result | Time |
|---|---|---|---|
| Install | `npm install` (root; its `postinstall` installs `NoBu-Shooter/`) | 282 packages, from the npm cache | 15 s |
| Tests | `npm test` | 222 / 222 | 12 s |
| Type check | `npm run typecheck` | clean | 7 s |
| Smoke | `npm run smoke` | 8 / 8 steps passed (lockstep: Rd off stalled 21.9 %, Rd on 3.1 %, 0 desyncs) | 47 s |
| Demo start | `npm run demo` → all six ports listening | ready | < 1 s after Vite was warm; ≈ 5 s for the first page (Vite's first transform) |
| First Presenter screen | landing → **Presenter — Quick Match** | arena + bar | 2.4 s |

- npm 11 prints `npm warn allow-scripts … esbuild (postinstall: node install.js)`. Harmless: esbuild's binary comes from its platform package, and every check above passed without that script.
- Without an npm cache (a laptop that never installed this project), `npm install` downloads ≈ 300 packages: allow a few minutes and a network connection, **the day before**.

### 1.2 Timed run-through of both Presenter scripts

A headless Chrome pressed through both scripts, walking in a square the whole time, and measured each step. **Dwell** = how long the step was shown: the minimum for its effect to appear. Talk for longer if you like. Every step held 60 fps; there were no console errors and 0 desyncs.

**Presenter — Quick Match** (run with `--swarm 3` from the start, see the note below the table):

| Step | Dwell | fps | Frames > 50 ms | On screen at the end of the dwell |
|---|---|---|---|---|
| Q1 Baseline | 8 s | 60.0 | 0 | RTT 17 ms, 0 corrections/s, Input → Screen 18 ms |
| Q2 Server delay, no prediction | 10 s | 60.0 | 0 | RTT 213 ms, Input → Screen 370 ms |
| Q3 Prediction | 8 s | 60.0 | 0 | Input → Screen 18 ms, 0 corrections/s |
| Q4 Packet loss | 10 s | 60.0 | 0 | ≈ 7 px corrections |
| Q5 Input redundancy | 8 s | 60.0 | 0 | 0 corrections/s |
| Q6 Reconciliation off | 10 s | 60.0 | 0 | the ghost drifts |
| Q7 Jitter, no interpolation | 8 s | 60.0 | 0 | jitter ≈ 80 ms, bots stutter |
| Q8 Interpolation | 8 s | 60.0 | 0 | bots glide |
| Q9 Nudge | 6 s | 60.0 | 0 | one 40 px correction |
| Q10 Nightmare: full | **15 s** | 59.9 | 0 | ack ≈ 650–770 ms, ↓ ≈ 380–400 kbps (at the cap) |
| Q11 Nightmare: delta | **12–15 s** | 60.0 | 0 | without network players: ack ≈ 320–350 ms, ↓ ≈ 60–120 kbps (after ≈ 10 s; the full queue drains first) |
| Q12 Nightmare: state | 10 s | 60.0 | 0 | ↓ ≈ 290 kbps, snapshot rate 10 Hz |
| Q13 Network players | 12 s | 60.0 | 0 | your RTT 13 ms, 0 corrections; `UDP-n` stutter; their frag-lost ≈ 10–12/s |

**Start the network players at Q13, not before.** In the run above the network players had been in the match from the start. That makes the match bigger: three UDP shooters, plus a bot that stays because the Presenter stops the match clock. Full snapshots need ≈ 816 kbps on a clean link instead of ≈ 475. Under Nightmare's 400 kbps cap, even Delta then stayed at ≈ 386 kbps with ack ≈ 720 ms at Q11, so the Delta talking point fails. Without network players, Q11 shows the expected ≈ 320–350 ms (measured separately). So run `npm run demo` for the talk. At Q13, start `npm run swarm -- --n 3` in a second terminal: the bar shows "3 network player session(s)" within ≈ 1 s (verified).

**Presenter — Compare:**

| Step | Dwell | fps | Frames > 50 ms | On screen at the end of the dwell (dock) |
|---|---|---|---|---|
| C1 Prediction | 10 s | 59.9 | 0 | Input → Screen 350 vs 18 ms |
| C2 Interpolation | 12 s | 59.9 | 0 | mover lag 78 ± 32 ms, frozen 68 % vs 160 ± 6 ms, 2 % |
| C3 Redundancy | 10 s | 60.0 | 0 | corrections A > B (loss is random; give it 10 s) |
| C4 Sync (Nightmare) | **15 s** | 59.4 | 1 (117 ms, at the step change) | ack 592 / 306 / 372 ms, ↓ 427 / 93 / 205 kbps, off-path 6 / 5 / 32 % |
| C5 Bandwidth | **15 s** | 60.0 | 0 | ack 562 vs 145 ms, ↓ 297 vs 77 kbps |
| C6 State Hz | 12 s | 59.1 | 1 (133 ms, at the step change) | off-path 31 % vs 13 %, ↓ 112 vs 331 kbps |
| C7 Snapshot vs Lockstep | 12 s | 59.9 | 0 | stalled – / 25.5 % / 4.2 %, longest – / 295 / 37 ms, Input → Screen 18 / 210 / 204 ms, ↓ 428 / 40 / 111 kbps, desync 0 / 0 |

- The two long frames happen once, at the moment a Compare pane is created (C4: 2 → 3 panes) or removed (C6: 3 → 2). That is Phaser building or tearing down a canvas, before the step's effect starts. Nothing stutters during a step.
- Whole run-through: ≈ 3 min 45 s of dwell, plus loading. A relaxed talk over the same steps takes ≈ 20–25 min (≈ 1 min per step, longer at Q10–Q13 and C4–C7).

### 1.3 Also checked

- `npm run shots` (both viewports, 1280 × 720 and 1920 × 1080): see `log.md` T106.
- Lockstep across engines: the server (Node) and the browser (Chrome) replay the same world bit for bit. The first browser check found Chrome and Node computing `Math.cos` / `Math.sin` 1 bit apart. The fix is in `docs/ASSUMPTIONS.md` #99, and after it a 60 s browser run showed 0 desyncs.

---

## 2. Run order for the talk

1. **The day before**, on the presentation laptop: §3 completely, including one full run-through.
2. Before the talk: close other apps, plug in power, set the display, and close everything that uses ports 5173 / 8080 / 8081 / 9000 / 9001 / 9100.
3. `npm run demo` (one terminal). Wait for the "ready" lines, then open `http://localhost:5173`.
4. **Presenter — Quick Match**: Q1 → Q12. At **Q13**, run `npm run swarm -- --n 3` in a second terminal, wait for the bar's "3 network player session(s)", and show **OPEN DASHBOARD ↗**.
5. **END**, then **Presenter — Compare**: C1 → C7 (C4, C5 ≈ 15 s each; C7 ≈ 10 s).
6. Optional: `docs/DEMO_SCRIPT.md` §13a (the emulator on its own, three terminals).
7. Ctrl+C in both terminals. Everything stops and the ports are freed.

**If something fails:**

| Symptom | Do this |
|---|---|
| "port in use" at start | Something is still running from before: close the other terminal, or find the process: `netstat -ano \| findstr :9000` → `taskkill /PID <pid> /F` |
| A key does nothing (`D`, `N`, `Y`, digits) | A browser extension (Vimium) takes it: exclude `localhost:5173` or use a clean browser profile (README → Troubleshooting) |
| Q13 bar stays amber | The network players aren't running: `npm run swarm -- --n 3` (second terminal) |
| Numbers far from the EXPECT line | Give the step its dwell (§1.2); Nightmare steps need ≈ 15 s. Q10–Q12 with network players already running are bigger (§1.2 note) — ⟲ RESTART helps only partly; better restart the demo without them |
| A lockstep pane shows DESYNC > 0 | Shouldn't happen (0 in every check). It resyncs itself; note the browser and its version and tell the developer |
| Everything is slow / < 55 fps | Plug in power, close other tabs, Settings (`Esc`) → UI Scale 100 %; check §3 GPU line |
| Firewall prompt on first start | Allow on *private* networks (Node listens on all interfaces for the data ports), or cancel — the demo works on this machine either way |

---

## 3. Checklist for the presentation laptop

Tick each line there; write numbers into §4.

**Setup**
- [ ] Node ≥ 20 (`node --version`; developed on v26.4.0) and npm ≥ 10.
- [ ] Google Chrome installed (the demo and `npm run shots` use it; Edge works for the demo itself).
- [ ] Fresh clone (or the release zip), then `npm install` at the repo root, **with internet**, the day before. Note the time.
- [ ] `npm test` → all pass. `npm run typecheck` → clean.
- [ ] `npm run smoke` → "SMOKE TEST COMPLETE" (8 steps; ≈ 50 s).
- [ ] Ports 5173, 8080, 8081, 9000, 9001, 9100 free (`netstat -ano | findstr ":9000 :8080 :5173"`).
- [ ] First `npm run demo`: Windows Firewall prompt answered (see §2).

**Browser and display**
- [ ] Vimium or similar keyboard extensions excluded for `localhost:5173` (or a clean profile).
- [ ] Display / projector resolution noted. At 1280 × 720, or with a projector far away: Settings (`Esc`) → **UI Scale 115 / 130 %**.
- [ ] Browser zoom 100 % (Ctrl+0).
- [ ] `chrome://gpu` shows hardware acceleration (WebGL: hardware accelerated).

**Run-through** (§2 run order, the whole talk once)
- [ ] Every step at ≥ 55 fps (the HUD / Compare panes; or Chrome DevTools → Rendering → Frame rendering stats).
- [ ] Q10–Q11 numbers close to §1.2 (Q11 ack ≈ 300–400 ms).
- [ ] Q13: the bar shows 3 network player sessions within a few seconds of `npm run swarm -- --n 3`.
- [ ] C7: B freezes visibly, C is smooth, DESYNC 0 on both.
- [ ] Optional: `npm run shots` (≈ 5 min) and a look at `NoBu-Shooter/artifacts/shots/` against `docs/VISUAL_CHECKLIST.md`.
- [ ] Ctrl+C everything; ports free again.

---

## 4. Presentation laptop — numbers (to fill in)

| Item | Value |
|---|---|
| Date, machine, OS | |
| Node / npm / Chrome versions | |
| `npm install` time | |
| `npm run smoke` result / time | |
| Display resolution, UI scale used | |
| Lowest fps seen (which step) | |
| Q11 ack delay after 15 s | |
| C7 stalled % (B / C), desyncs | |
| Total run-through time | |
| Problems and fixes | |
