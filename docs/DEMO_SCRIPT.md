# NoBu Shooter — Live Demo Walkthrough Script

Follow these steps for a complete, 60-second end-to-end demonstration of the netcode and network impairment simulator.

Reference: `PHASES.md` (this script grows with each phase; Phase 4 turns it into Presenter mode). Expected numbers below were measured on 2026-10-09 (Windows laptop, local Chrome).

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

---

## 10-Step Walkthrough

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
2. Observe the **Packet Flow Strip** at the bottom:
   - Cyan upstream and magenta downstream dots flowing through the emulator.
   - Lost packets burst and drop in red.
   - Bandwidth queue limit causes orange queue drops.
   - Duplications split dots into twins.
3. Note the **bufferbloat**: the 400 kbps cap is below what full snapshots need (~380–450 kbps), so the emulator queue fills, ack delay climbs to ~700 ms and the orange queue-drop count rises. (Phase 3's delta snapshots fix exactly this.)
4. Switch **Input Redundancy ON**: corrections from upstream loss mostly disappear, although the queueing delay remains.

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
6. **Custom**: choose 2–4 panes, click a pane to select it and toggle `P` / `C` / `I` / `G` (or the chips in its header). `Tab` opens the network drawer; `1`–`5` still apply the emulator presets to every emulated pane.

### 9. Real-Time Metrics & Inspector
1. Click **▼ INSPECT PACKETS** on the packet strip to open the packet drawer.
2. Observe real-time JSON frames, sizes, and fate codes (delivered, loss drop, queue drop).
3. Review the live 12-second Sparkline graphs in the Lab for RTT, Loss %, Pending Inputs, and Correction Error.

### 10. Weapons, Power-ups and Maps (Phase 2.5)
Rehearsal tip: `NOBU_MAPS=warehouse npm run demo` starts on a chosen map (the rotation is `neon → warehouse → plaza → overgrown`, one map per match).
1. In Quick Match, hold fire: the HUD (bottom-right) counts the handgun down from 8/8 (`∞` spare), the magazine reloads itself at 0, and `R` reloads early (amber bar, reload sound).
2. Power-ups appear at random spots, at most one per two players (2 in a 4-player match), a new one 10 s after each pickup. Walk over one: **Rapid Fire** (rifle, rare) or **Spread Shot** (shotgun, 3 pellets) — 10 s or two magazines, then back to the pistol; **Shield** (green bubble absorbs one hit); **Speed** (×1.5, pulsing ring); **Piercing** (violet bullets through walls); **Dash** (`Space`). A chip shows what is active.
   - Rehearsal: under `npm run demo` the Network Lab has a **Developer → Invincible** switch, so you can talk without being shot (your tag reads `[DEV]`).
3. Press `4` (Transatlantic) and pick up **Speed**: the first moves after the pickup are predicted at normal speed, so a small correction line appears — pickups are decided by the server and are never predicted.
4. Press `5` (Nightmare), turn **Input Redundancy OFF** and hold fire: some shots are lost on the way up; the server never fired them, so the ammo counter **flashes amber** as the prediction is corrected (occasional flashes; at 20 % loss the netcode harness sees several per 10 s of firing). Turn redundancy ON: the flashes stop.
5. Note the bandwidth under Nightmare: full snapshots of a 4-player match are ≈ 510 kbps, above the 400 kbps cap, so the ack delay grows — the motivation for Phase 3's delta snapshots.

