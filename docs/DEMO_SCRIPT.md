# NoBu Shooter — Live Demo Walkthrough Script

Follow these steps for a complete, 60-second end-to-end demonstration of the netcode and network impairment simulator.

Reference: `PHASES.md` (this script grows with each phase; Phase 4 turns it into Presenter mode). Expected numbers below were measured on 2026-10-09 (Windows laptop, local Chrome).

---

## Controls Quick Reference

| Action | Controls |
|---|---|
| Movement | `W`, `A`, `S`, `D` or Arrow Keys |
| Aim | Mouse cursor |
| Fire | Left Mouse Button |
| Toggle Network Lab | `Tab` |
| Presets | Keys `1`, `2`, `3`, `4`, `5` |
| Prediction Toggle | `P` |
| Reconciliation Toggle | `R` |
| Interpolation Toggle | `I` |
| Ghost Overlay Toggle | `G` |

---

## 9-Step Walkthrough

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
1. With 10% packet loss and Input Redundancy OFF, toggle **Reconciliation OFF** (press `R`).
2. Move across the arena.
   - **Observation**: The client predicts movement locally but never corrects to the server. The amber dashed ghost permanently drifts away from your avatar.
3. Turn **Reconciliation ON** (press `R`).
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

### 8. A/B Compare Mode
1. Click the home button or reload to return to the landing page.
2. Click **NETWORK LAB — A/B COMPARE**.
3. **Observation**: Two identical game viewports render side-by-side receiving synchronized keyboard inputs:
   - **Pane A (Server-Only)**: Delayed, sluggish, showing true lag.
   - **Pane B (Predict + Reconcile)**: Crisp, instant, silky smooth.
   - Under each pane, live readouts contrast *Input → Screen* latency. Press `4` (Transatlantic, 90 ms one-way): expect ≈ 236 ms (A) vs ≈ 17 ms (B).

### 9. Real-Time Metrics & Inspector
1. Click **▼ INSPECT PACKETS** on the packet strip to open the packet drawer.
2. Observe real-time JSON frames, sizes, and fate codes (delivered, loss drop, queue drop).
3. Review the live 12-second Sparkline graphs in the Lab for RTT, Loss %, Pending Inputs, and Correction Error.
