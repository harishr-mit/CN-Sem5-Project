# NoBu Shooter — Live Demo Walkthrough Script

**The final talk track is the next section** (Phase 6): the two Presenter scripts plus the standalone emulator, with timings from the dress rehearsal (`docs/REHEARSAL.md`). Sections 1–14 below are the detailed walkthrough and reference for each topic.

Reference: `PHASES.md` (this script grows with each phase). Since Phase 4 the same walkthrough runs as **Presenter mode** from the landing page — §12 lists its steps, which come from `client/src/presenter/scripts.ts` (the step ids there are pinned by `tests/presenter.test.ts`). Expected numbers below were measured on 2026-10-09 (Windows laptop, local Chrome); §7 and §11 on 2026-10-10 (Phase 3), §7's queue figures on 2026-10-11 (Phase 4). Bandwidth figures count wire bytes (payload + 28 B per message, like the emulator).

---

## Controls Quick Reference

| Action | Controls |
|---|---|
| Movement | `W`, `A`, `S`, `D` or Arrow Keys |
| Aim | Mouse cursor |
| Fire | Left Mouse Button (hold) |
| Reload | `R` (automatic when the magazine is empty; the pistol reloads forever) |
| Dash | `Space` (with the Dash power-up) |
| Mute sound | `M` |
| Toggle Network Lab | `Tab` |
| Presets | Keys `1`, `2`, `3`, `4`, `5` |
| Prediction Toggle | `P` |
| Reconciliation Toggle | `C` |
| Interpolation Toggle | `I` |
| Ghost Overlay Toggle | `G` |
| Sync model | `Y` — Quick Match (Network Lab): Full → Delta → State 10 → State 30; Compare (the selected pane): the same, then **Lockstep** (§14) |
| Presenter mode | `N` next step, `B` previous step, `H` hide the caption; bar buttons **⟲ RESTART**, map, **END** (§12) |
| Projector | Settings (`Esc`) → **UI Scale** 100 / 115 / 130 % |
| Emulator dashboard | Landing **EMULATOR DASHBOARD ↗**, Lab **DASHBOARD ↗**, or `http://127.0.0.1:9001/` (§13) |
| Network players | `npm run demo -- --swarm 3`, or `npm run swarm` beside a running demo (§13) |

---

## Final talk track (Phase 6)

Run order and timings from the dress rehearsal on 2026-10-12 (`docs/REHEARSAL.md` §1.2: every step at 60 fps, 0 console errors). **Dwell** = the minimum time on a step for its effect to show; talk as long as you like. Start with `npm run demo` (no network players yet).

| Part | Steps | Dwell | Talk | The point |
|---|---|---|---|---|
| 1. Prediction & reconciliation | Q1 Baseline → Q2 delay without prediction → Q3 prediction | 8 / 10 / 8 s | ≈ 3 min | Latency alone never causes corrections; prediction hides it (Input → Screen 370 → 18 ms) |
| 2. Loss | Q4 loss → Q5 input redundancy → Q6 reconciliation off | 10 / 8 / 10 s | ≈ 3 min | Lost inputs cause corrections; repeating unacknowledged inputs removes them; without reconciliation the error stays |
| 3. Jitter | Q7 no interpolation → Q8 interpolation | 8 / 8 s | ≈ 2 min | Interpolation buys smoothness with a fixed 100 ms lag |
| 4. Misprediction | Q9 nudge | 6 s | ≈ 1 min | One smooth correction, amber vector |
| 5. Bandwidth | Q10 Nightmare full → Q11 delta → Q12 state | **15 / 12–15 / 10 s** | ≈ 4 min | Under a cap, bytes become latency; delta sends ≈ 1/5; state extrapolates and overshoots |
| 6. Realistic transport | Q13 — first run `npm run swarm -- --n 3` in a second terminal | 12 s | ≈ 2 min | UDP players on a lossy route, your link clean; fragments; **OPEN DASHBOARD ↗** |
| 7. Side by side | **END** → Presenter — Compare: C1 Prediction, C2 Interpolation, C3 Redundancy | 10 / 12 / 10 s | ≈ 3 min | The same comparisons, measured next to each other |
| 8. Sync models | C4 Sync, C5 Bandwidth, C6 State Hz | **15 / 15** / 12 s | ≈ 3 min | Full vs delta vs state at the same time; the bandwidth chart |
| 9. Lockstep | C7 Snapshot vs Lockstep | 12 s | ≈ 2 min | Inputs instead of the world: exact and ≈ 1/10 of the bytes, but every lost tick freezes the world (B); redundancy makes it smooth again at the price of input delay (C); DESYNC 0 (§14) |
| 10. Optional | §13a the emulator on its own (three terminals) | — | ≈ 2 min | The emulator works in front of any app |

Total ≈ 20–25 min (≈ 3 min 45 s of dwell; the rest is talk). Why the network players start only at Q13: with them in the match from the start, full snapshots grow from ≈ 475 to ≈ 800 kbps, and at Nightmare even Delta then stays at the cap (Q11 ack ≈ 720 instead of ≈ 330 ms) — `docs/REHEARSAL.md` §1.2.

---

## Walkthrough

### 1. Baseline Conditions
1. Start the project: `npm run demo`
2. Open `http://localhost:5173` in your browser.
3. Click **QUICK MATCH (vs bots)**.
4. Move with `WASD` and shoot with Left Mouse Button against bots.
5. **Observation**: 0 corrections/s and 0.0 px error while moving — prediction matches the server exactly. RTT ≈ 15–20 ms even on loopback (Windows timer granularity + the 30 Hz input/snapshot cadence); Input → Screen ≈ 17 ms (one frame).

### 2. Client-Side Prediction vs Server Delay
1. Press `Tab` to open the **Network Lab**.
2. Press `P` (or flip the Prediction toggle) to turn **Prediction OFF**.
3. Drag the **One-way Latency** slider to `100 ms` (simulates 200 ms RTT).
4. Try moving with `WASD`.
   - **Observation**: Notice the heavy delay between pressing a key and your avatar moving. Input → Screen jumps to ≈ 300+ ms (ack delay + 100 ms interpolation delay).
5. Press `P` to turn **Prediction ON**.
   - **Observation**: Movement is instantly responsive again (Input → Screen ≈ 17 ms) with still 0 corrections — latency alone never causes mispredictions. The amber dashed **Ghost** (authoritative server position) visibly trails behind the solid avatar.

### 3. Packet Loss & Input Redundancy
1. Leave Latency at `50 ms`.
2. Drag the **Packet Loss** slider to `10%` (Input Redundancy defaults to **OFF**).
3. Move around obstacles and boundaries.
   - **Observation**: When input packets drop, the authoritative server misses steps. The client prediction temporarily diverges, triggering reconciliations (amber correction lines appear; expect ≈ 2–3 corrections/s of ≈ 7 px each). The **Loss** tile shows the emulator's measured loss for *your* session (≈ ↑10 % ↓10 %).
4. Toggle **Input Redundancy** to **ON** in the Netcode Toggles.
   - **Observation**: Corrections drop back to zero! Subsequent packets carry the backlog of unacknowledged inputs, recovering from loss without position snaps.
5. Turn Input Redundancy back **OFF** for the subsequent steps.

### 4. Jitter & Snapshot Interpolation
1. Set Latency to `40 ms` and drag **Jitter** to `50 ms`.
2. Turn **Snapshot Interpolation OFF** (press `I`).
   - **Observation**: Remote bots and projectiles appear jittery and stutter as arrival times vary.
3. Turn **Snapshot Interpolation ON** (press `I`).
   - **Observation**: Bot movement becomes smooth: remote entities are drawn ~100 ms in the past, linearly interpolated between the two surrounding snapshots.

### 5. Server Reconciliation Drift
1. With 10% packet loss and Input Redundancy OFF, toggle **Reconciliation OFF** (press `C`).
2. Move across the arena.
   - **Observation**: The client predicts movement locally but never corrects to the server. The amber dashed ghost permanently drifts away from your avatar.
3. Turn **Reconciliation ON** (press `C`).
   - **Observation**: The avatar smoothly snaps back to align with the authoritative server state.

### 6. Perturbation ("Nudge Me")
1. In the Network Lab footer, click **⚡ NUDGE ME (SERVER MISPREDICT +40PX)**.
2. **Observation**: The server instantaneously offsets the player by 40 px. The client detects the discrepancy on the next snapshot and smoothly corrects while drawing an amber correction vector.

### 7. The Nightmare Preset
1. Press `5` on your keyboard (or click **[5] NIGHTMARE**).
   - Impairments active: 120 ms latency, 50 ms jitter, 12% burst loss, 3% duplication, 5% reordering, 400 kbps bandwidth limit.
2. Observe the **Packet Flow Strip** at the bottom (legend on its right):
   - Cyan upstream and magenta downstream dots, each crossing the EMULATOR box for as long as the emulator actually held it (the strip replays real timings ≈ 1 s behind).
   - Lost packets burst and drop in red; packets refused by a full queue drop in amber.
   - Duplicates show a split flash at the box entry; both copies then travel on.
   - **Reordered** packets carry a white ring and are visibly overtaken by later ones.
   - The **queue bar** at the bottom of the box shows how long a packet arriving now would wait for the 400 kbps cap (`QUEUE ↓… ms`, red above 75 % of the 400 ms limit).
3. Note the **bufferbloat**: full snapshots of a 4-player match need ≈ 350–600 kbps (it depends on the map and the fight), at or above the 400 kbps cap, so the queue bar fills (≈ 100–200 ms after 15 s, more in a big fight), the ack delay climbs to ≈ 550–700 ms and amber queue drops appear.
4. Press `Y` (Network Lab → **SYNC MODEL** → DELTA). You stay in the match; the server now sends only what changed since the last snapshot you acknowledged. **Expect** after ≈ 15 s: ↓ ≈ 130 kbps instead of ≈ 400, ≈ 500 B per message instead of ≈ 1.9 kB, ack delay ≈ 325 ms instead of ≈ 660 ms (measured 2026-10-10). Press `Y` again for **STATE 10** (≈ 190 kbps, remote players extrapolated) and twice more to get back to FULL.
5. Switch **Input Redundancy ON**: corrections from upstream loss mostly disappear, although the queueing delay remains (with Full).

### 8. Compare View
1. Click **◄ LEAVE MATCH** (bottom-left of the arena), or press `Esc` and click **◄ LEAVE MATCH — BACK TO MAIN MENU** (end of the settings menu), to return to the landing page.
2. Click **NETWORK LAB — COMPARE**. Every pane is driven by the same keyboard (one shared input loop), so all panes send identical inputs, and every pane's player spawns at the same point (`rooms.lab.spawn`). Each comparison preset changes exactly **one** setting.
3. **Prediction** (default; Transatlantic, 90 ms one-way). Move with WASD.
   - **Pane A (prediction off)** waits for the server; **pane B (prediction on)** moves at once with the amber ghost trailing.
   - **Expect** Input → Screen ≈ 350 ms (A) vs ≈ 18 ms (B). (Interpolation stays on in both panes now; the old A/B view also turned it off in A, which gave ≈ 236 ms.)
4. **Interpolation** (50 ms ± 30 ms jitter, all four movers, reference pane on). This is the Phase 2 demo checkpoint. Watch the violet drones:
   - **Pane A (interpolation off)** draws each snapshot as it lands: the drones stutter and their trail dots bunch up.
   - **Pane B (interpolation on)** draws ~100 ms in the past: the drones glide with evenly spaced trail dots, but sit visibly behind their dashed **truth ring** (press `T` to toggle the rings).
   - **Expect** in the dock: mover lag ≈ 75 ± 26 ms, frozen frames ≈ 60–70 % (A) vs ≈ 160 ± 3 ms, ≈ 2 % (B). Talking point: 160 ms ≈ 50 ms network + 100 ms interpolation delay — interpolation buys smoothness with a fixed, predictable lag. (Distance alone would mislead: ≈ 15 px vs ≈ 30 px.)
   - The **REF** pane is a spectator connected straight to the server: it shows where every pane's player and every drone really is. The panes' players sit on top of each other there: the server received the same inputs from every pane, so prediction, reconciliation and interpolation change only what each pane *draws*. (Under loss without redundancy they can drift apart: that is the Redundancy preset.)
5. **Redundancy** (50 ms, 10 % loss). **Expect** ≈ 2–4 corrections/s (A, redundancy off) vs 0 (B).
6. **Custom**: choose 2–4 panes, click a pane to select it and toggle `P` / `C` / `I` / `G`, or cycle its sync model with `Y` (or the chips in its header). `Tab` opens the network drawer; `1`–`5` still apply the emulator presets to every emulated pane. The Phase 3 presets are in §11.

### 9. Real-Time Metrics & Inspector
1. Click **▼ INSPECT PACKETS** on the packet strip (below its legend) to open the packet drawer.
2. Observe real-time JSON frames, sizes, and fate codes (delivered, loss drop, queue drop).
3. Review the live 12-second Sparkline graphs in the Lab for RTT, Loss %, Pending Inputs, and Correction Error (open the **Real-time sparkline traces** section — Lab sections fold by their titles and the Lab remembers which are open).

### 10. Weapons, Power-ups and Maps (Phase 2.5)
Rehearsal tip: `NOBU_MAPS=warehouse npm run demo` starts on a chosen map (the rotation is `neon → warehouse → plaza → overgrown`, one map per match).
1. In Quick Match, hold fire: the HUD (bottom-right) counts the handgun down from 8/8 (`∞` spare), the magazine reloads itself at 0, and `R` reloads early (amber bar, reload sound).
2. Power-ups appear at random spots, at most one per player (4 in a 4-player match), a new one 7 s after each pickup. Walk over one: **Rapid Fire** (rifle, rare) or **Spread Shot** (shotgun, 3 pellets) — 10 s or two magazines, then back to the pistol; **Shield** (green bubble absorbs one hit); **Speed** (×1.5, pulsing ring); **Piercing** (violet bullets through walls); **Dash** (`Space`). A chip shows what is active.
   - Rehearsal: under `npm run demo` the Network Lab has a **Developer → Invincible** switch, so you can talk without being shot (your tag reads `[DEV]`), and **Give power-up** buttons, so you can show any power-up without hunting for it.
3. Press `4` (Transatlantic) and pick up **Speed**: the first moves after the pickup are predicted at normal speed, so a small correction line appears — pickups are decided by the server and are never predicted.
4. Press `5` (Nightmare), turn **Input Redundancy OFF** and hold fire: some shots are lost on the way up; the server never fired them, so the ammo counter **flashes amber** as the prediction is corrected (occasional flashes; at 20 % loss the netcode harness sees several per 10 s of firing). Turn redundancy ON: the flashes stop.
5. Note the bandwidth under Nightmare: full snapshots of a 4-player match are ≈ 510 kbps, above the 400 kbps cap, so the ack delay grows — press `Y` for delta snapshots (§7 step 4).

### 11. Sync Models: Snapshot vs State (Phase 3)
Open **NETWORK LAB — COMPARE**. Each pane's header shows its sync model (click it, or select the pane and press `Y`, to cycle). The dock shows a live **bandwidth chart** (↓ kbps per pane, last 30 s) with a dashed line at the emulator's cap. Give each preset ≈ 15 s.
1. **Sync** (Nightmare: 400 kbps, 12 % burst loss; all four drones). This is the Phase 3 demo checkpoint.
   - **Pane A (Full)** needs ≈ 450 kbps here: its line rides the cap, the queue fills, and its drones fall far behind their truth rings.
   - **Pane B (Delta)** sends only what changed: ≈ 250 B per message instead of ≈ 1.8 kB, far below the cap, and stays responsive.
   - **Pane C (State 10 Hz)** draws drones with no interpolation delay, so they are the most current — but they overshoot every turn and get pulled back (OFF-PATH %).
   - **Expect** (browser, 2026-10-10): ack delay ≈ 740 / 310 / 360 ms, mover lag ≈ 640 / 250 / 170 ms, ↓ ≈ 400 / 60 / 160 kbps, off-path ≈ 0 / 0 / 33 %. Talking point: the same picture for ≈ 1/6 of the bytes; under a bandwidth cap, bytes become latency.
2. **Bandwidth** (a clean 300 kbps link, no loss): Full vs Delta isolates queueing from loss. **Expect** ack delay ≈ 560 ms vs ≈ 140 ms, mover lag ≈ 570 ms vs ≈ 150 ms, ↓ ≈ 300 vs ≈ 65 kbps; Full also loses ≈ 7 snapshots/s to the full queue (LOST/s).
3. **State Hz** (Transatlantic; zigzag + reversal drones; REF on): State 10 Hz vs 30 Hz. Both extrapolate, so mover lag ≈ the one-way latency (≈ 100 ms vs ≈ 190 ms with interpolation). **Expect** off-path ≈ 30 % vs ≈ 10 % and ↓ ≈ 105 vs ≈ 320 kbps: more updates mean less rubber-banding but 3× the bytes.
4. Under heavy burst loss State 10 Hz can freeze briefly: it extrapolates at most 250 ms past the last state, then holds until the next one arrives.

### 12. Presenter Mode (Phase 4)
Start from the landing page. Each step sets everything at once (network, all netcode toggles, sync model — or, in Compare, a whole preset), so `N` and `B` always show the same thing; between steps every normal key still works and lasts until the next step. The caption bar (between the arena and the packet strip, or under the Compare grid) shows the step counter, what to watch, the expected numbers and a step timer — some effects need ≈ 15 s. `H` hides it; **END** goes back to the landing page.

- **⟲ RESTART** puts the game back to its starting case and the talk back to step 1: Quick Match begins a new match on the same map (3 s countdown, scores 0); Compare puts every pane's player back on the spawn and clears the charts.
- **Map** buttons (Neon, Warehouse, Plaza, Overgrown; the current one is lit) restart the game on that map; the talk stays on its step and the step timer restarts. In Compare the drones keep their paths, which were laid out for Neon — on the other maps they fly over some props.
- In Quick Match the **match clock is stopped** while presenting (the HUD shows ∞), so the match never ends mid-talk; END starts the clock again.
- These and Invincible need `npm run demo` (the bar says so otherwise).

**Presenter — Quick Match** (13 steps; step 13 needs network players: start them **when you reach Q13** with `npm run swarm -- --n 3` in a second terminal — started with the demo (`--swarm 3`) they make the match bigger, and at Nightmare (Q10–Q12) even Delta then stays above the cap, see `docs/REHEARSAL.md`; turns on the developer **Invincible** switch so bots can't interrupt — `[DEV]` tag, needs `npm run demo`; turned off again on END). Walk around while you talk.

| Step | Title | Network | Changes from the defaults | Watch / expect |
|---|---|---|---|---|
| Q1 | Baseline | Baseline | — | 0 corrections/s, 0.0 px, Input → Screen ≈ 17 ms, RTT ≈ 15–20 ms |
| Q2 | Server delay, no prediction | 100 ms one-way | prediction, reconciliation, ghost off | Input → Screen ≈ 300+ ms; RTT ≈ 216 ms |
| Q3 | Client-side prediction | 100 ms one-way | — | Instant movement, still 0 corrections; the amber ghost trails |
| Q4 | Packet loss | 50 ms + 10 % loss | — | ≈ 2–3 corrections/s of ≈ 7 px; Loss tile ≈ ↑10 % ↓10 % |
| Q5 | Input redundancy | 50 ms + 10 % loss | redundancy on | Corrections drop to 0/s |
| Q6 | Reconciliation off | 50 ms + 10 % loss | reconciliation off | The ghost drifts away for good |
| Q7 | Jitter, no interpolation | 40 ± 50 ms | interpolation off | Bots and bullets stutter |
| Q8 | Snapshot interpolation | 40 ± 50 ms | — | Bots glide, drawn 100 ms in the past |
| Q9 | Misprediction (nudge) | 50 ms one-way | the server pushes you +40 px on entering | One smooth correction with an amber vector (`B` then `N` nudges again) |
| Q10 | Nightmare: full snapshots | Nightmare | — | After ≈ 15 s: ack delay ≈ 550–700 ms, ↓ ≈ 350–420 kbps, queue bar ≈ 100–200 ms |
| Q11 | Nightmare: delta snapshots | Nightmare | sync Delta | ↓ ≈ 130 kbps, ≈ 500 B/msg instead of ≈ 1.9 kB, ack delay ≈ 325 ms |
| Q12 | Nightmare: state sync | Nightmare | sync State 10 Hz | ↓ ≈ 190 kbps; bots most current but overshoot at turns |
| Q13 | Network players over UDP | Baseline (you) · network players' route `udp:9100`: 120 ± 40 ms, 10 % loss | — | Your corrections 0/s; the `UDP-n` players stutter, jump and aim at stale positions. **OPEN DASHBOARD ↗**: their sessions at ≈ 10 % loss; their full snapshots need 2–4 fragments, so ≈ 20–34 % are lost. The bar says how many are connected (or how to start them) |

**Presenter — Compare** (7 steps = the seven Compare presets of §8, §11 and §14, in order): C1 Prediction, C2 Interpolation, C3 Redundancy, C4 Sync, C5 Bandwidth, C6 State Hz, C7 Snapshot vs Lockstep. The bar shows the preset's caption and the expected numbers from §8 / §11 / §14 (the dock then shows only its table and chart). Give C4 and C5 ≈ 15 s, C7 ≈ 10 s.

Rehearsal: `npm run shots` (README) captures both scripts' first steps, the Nightmare step, step 13 with two network players and step C7; `docs/VISUAL_CHECKLIST.md` says what to look for. `docs/REHEARSAL.md` has the timing sheet and the checklist for the presentation laptop.

### 13. Standalone Emulator & Network Players (Phase 5)

**a) The emulator with no game** (`emulator/README.md`). Three terminals:

```bash
npm run udp-echo -- --port 7000
npm run emulator                        # open http://127.0.0.1:9001/
npm run udp-send -- --to 9100 --rate 5
```

1. On the dashboard, **ADD ROUTE**: UDP, listen `9100`, target `127.0.0.1:7000`. Every `#n hello` comes back (`✓ #12 back after 2 ms`).
2. Select the route, choose **UP ↑** and set **Loss** to 20 %: `udp-send` prints `✗ #17 never came back` for about one message in five, and the packet log lists them as `lost`.
3. With **BOTH**, a round trip survives only 0.8 × 0.8 = 64 % of the time.
4. Add **Latency 100 ms**: the round trip grows by ≈ 200 ms.
5. Stop `udp-send` (Ctrl+C) to see the summary, e.g. *sent 150, back 116, lost 34 (22.7 %)* (measured 2026-10-12).

Point: the emulator works on any WS or UDP app. The game is just one of its clients.

**b) Network players.** `npm run demo -- --swarm 3` adds `UDP-1…3`: headless game clients that play with the bots' brain but send their own traffic over UDP through `udp:9100`. With you, that makes 4 participants, so no server bots are added from the next countdown (Presenter ⟲ RESTART starts one at once).

1. Open the dashboard: it lists the browser's session on `ws:9000` and three `UDP-n` sessions on `udp:9100`.
2. Select `udp:9100` and press **Nightmare**. In the arena the UDP players stutter and teleport, while your own link (and the Lab's numbers) stay clean: the Lab changes only `ws:9000`.
3. The swarm terminal prints, every 2 s, each player's RTT, ack delay, corrections/s and **frag-lost/s**: snapshots lost because one of their 2–4 fragments was lost.
4. `npm run swarm -- --sync delta` in another terminal shows the difference: deltas fit one datagram.

Measured (2026-10-12):
- **Clean link:** 300 snapshots in 10 s per player, all reassembled, ≈ 2.7 fragments each, RTT ≈ 15 ms.
- **Nightmare** (smoke step 7): ≈ 22 world messages/s still arrive, ≈ 3 % of the fragmented ones are lost to fragment loss, ack delay ≈ 500 ms.
- The few corrections on a clean link happen at the moment the player dies (death isn't predicted).

### 14. Lockstep: Snapshot vs Lockstep (Phase 6)

Open **NETWORK LAB — COMPARE** and click **Lockstep** (or Presenter — Compare, step **C7**). Network: 50 ms one-way, 5 % random loss; all four drones; no REF pane. Move with WASD.

How lockstep works here: the server stays the authority and never waits. Every tick it relays the movement keys it *consumed* for each player; a lockstep client replays them with the same movement code and gets the server's world **bit for bit**. Joins, leaves, nudges, a RESTART or a map change arrive as keyframes in the same stream. Every 30 ticks the server sends a hash of its world; a lockstep pane compares it (**DESYNC** must stay 0). The catch: the client needs **every** tick in order, so one missing tick freezes the whole world.

- **Pane A (Full snapshots)** carries on as usual (interpolated, your player predicted).
- **Pane B (Lockstep, Rd off)**: a lost tick is asked for again (NACK), so each loss freezes the whole pane for about a round trip, then it fast-forwards (up to 3 ticks per frame) to catch up. Watch **STALLED %** and **MAX**.
- **Pane C (Lockstep + Rd)**: every message repeats the ticks not yet acknowledged, so a loss is covered by the next message: smooth again. But your own player still moves only after the key has been to the server and back (lockstep doesn't predict): **IN→SCR** ≈ RTT + playout buffer.
- P / C / I / G are greyed out on lockstep panes (nothing is predicted or interpolated); **Rd** stays live and switches the recovery.

**Expect** (browser, 2026-10-12, 1600×900 and the `npm run shots` screens): stalled – / ≈ 15–30 % / ≈ 3–5 %, longest stall ≈ – / 300–650 ms / 40–70 ms, Input → Screen ≈ 18 / 220–350 / 200–215 ms, ↓ ≈ 400–460 / ≈ 40 / ≈ 100–120 kbps, desyncs 0 / 0. Smoke step 8 (Node clients, real sockets): stalled 28.8 % vs 4.6 %, 33 vs 89 kbps, 0 desyncs.

Talking points:
1. Lockstep sends **inputs**, not the world: ≈ 1/10 of the bytes of full snapshots, and the world is exact everywhere — no interpolation, no extrapolation, no corrections.
2. The price is **waiting**. It can't show tick n + 1 before it has it: loss becomes freezes (B), and without prediction your own input takes a round trip to appear (B, C).
3. Redundancy turns loss back into a small, constant delay (C) — the same trade as input redundancy in Phase 1, paid in bytes (C ≈ 2.5 × B).
4. Determinism must be **checked**: during Phase 6 the hash check caught Chrome and Node computing `Math.cos` / `Math.sin` one bit apart for ≈ 3 % of the drone's angles. The movers now use a sine / cosine built only from + − × ÷ (exactly defined by IEEE 754), and the desync counter stays at 0.
