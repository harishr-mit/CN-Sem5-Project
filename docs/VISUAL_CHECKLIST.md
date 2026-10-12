# Visual Checklist — reviewing `npm run shots`

**Audience:** whoever reviews the screenshots before a demo or a phase exit (PHASES.md Phase 4 exit criteria, P7).

## Running it

```bash
npm run shots              # from the repo root or NoBu-Shooter/; ≈ 5 min
npm run shots -- --fast    # shorter waits (Nightmare screens 5 s instead of 15 s)
npm run shots -- --only=compare,presenter   # only screens whose name contains one of these
```

The script starts `npm run demo -- --swarm 2` itself (two UDP network players for the Phase 5 screens; TCP 5173/8080/9000/9001 and UDP 8081/9100 must be free), drives the locally installed Google Chrome through `playwright-core` (a devDependency of `NoBu-Shooter`; no browser download — set `NOBU_CHROME=<path to chrome.exe or msedge.exe>` if Chrome is elsewhere), and stops the demo when it ends. Output (git-ignored):

```text
NoBu-Shooter/artifacts/shots/
  index.json                 run summary: both viewports, failures
  1280x720/  01-landing.png … 25-dashboard-swarm-nightmare.png, index.json
  1920x1080/ (same 25 screens)
```

Before each screen the script resets every emulator route to Baseline (control API), so no screen inherits a preset from the previous one (Phase 5; before that a Nightmare screen leaked into the following ones). Each `index.json` row has `fps` (requestAnimationFrame over 2 s), `errors` (console errors and page errors — the run fails on any), `notes` (`[arena] …` notices, if any), `warnings` (count; React StrictMode's "closed before established" WebSocket warnings in Compare are expected, `docs/ASSUMPTIONS.md` #18), `labScrolls`, `pageOverflowX/Y`.

## What to check on every shot

1. **No unstyled elements** — no browser-default buttons, serif text, blue links or white boxes.
2. **No overlap** — text doesn't run into other text or controls; buttons aren't covered; nothing is cut off at the window edge (`pageOverflowX/Y` false).
3. **Readable at 1280 × 720** — every label can be read at 100 % zoom; metric values aren't truncated.
4. **Captions don't hide the effect** — the Presenter bar and the Compare dock never cover the arena area being described.
5. **Colours mean the same everywhere** — cyan = you / upstream, magenta = downstream, amber = ghost / corrections / queue, red = loss, pane colours match the dock rows.

## Per screen

| # | Screen | Also check |
|---|---|---|
| 01 | landing | Buttons: Quick Match; the Phase 7 room row (**CREATE ROOM**, ROOM CODE field, **JOIN**) on one line; Compare, Presenter — Quick Match, Presenter — Compare, **EMULATOR DASHBOARD ↗**; controls hint fits in two lines. |
| 02 | credits | Modal centred, CC-BY avatar credit present, CLOSE visible. |
| 03 | quick-match | HUD **PING** chip next to SETTINGS; Lab open with default sections and **no Lab scroll** (`labScrolls: false`); SYNC MODEL in two groups (SNAPSHOTS: FULL/DELTA, STATE SYNC: 10/30 Hz), one chip lit; aim chevrons in front of the bots' rings; arena crisp (no glow or haze); packet strip legend visible next to INSPECT PACKETS. |
| 04 | quick-nightmare | Strip: EMULATOR chips list the Nightmare impairments; **queue bar** amber/red with `QUEUE ↓… ms`; dots crowd inside the box; red lost dots fall. |
| 05 | quick-inspector | Drawer readable; doesn't cover the Lab. |
| 06 | quick-settings | UI Scale row (100 / 115 / 130 %), **Graphics Quality** row (LOW / MEDIUM / HIGH, HIGH lit), ghost toggle present (demo), Leave Match at the end; no blur artefacts. |
| 07 | quick-controls | `Y`, Network Lab and presenter keys and power-ups listed. |
| 08 | quick-lab-all-open | Every section open: the Lab scrolls (expected), section titles have carets, nothing overlaps; Developer shows Invincible and six GIVE POWER-UP chips with icons. |
| 09 | quick-ui-130 | UI 30 % larger, Lab wider; at 1920 × 1080 still no Lab scroll; strip side column doesn't collide with SERVER. |
| 10–15 | compare-<preset> | Pane headers (title, sync chip, P/C/I/Rd/G chips) fit; dock table + bandwidth chart visible; caption above the table; Sync/Bandwidth after ≈ 15 s show the gap between Full and Delta. |
| 16 | compare-lockstep | Phase 6. Three panes FULL / LOCKSTEP / LOCKSTEP+RD; on B and C the P / C / I / G chips are greyed, Rd lit only on C; pane bars show STALLED / MAX / BEHIND / DESYNC (no CORR, no FROZEN); dock columns STALLED, LONGEST, DESYNC with **DESYNC 0** everywhere, B stalled ≫ C; bandwidth chart: A ≈ 400 kbps, B ≈ 40, C ≈ 110. |
| 17 | compare-custom-4-ref | Four panes + REF fit the grid without letterboxing; dock still visible (or in the empty cell). |
| 18 | compare-lab-drawer | Drawer overlays (panes not resized); all impairment sliders visible (sections never collapse here). |
| 19 | presenter-quick-1 | Presenter bar between arena and strip: `1 / 13`, title, caption, EXPECT line, timer, MAP buttons (current map lit), ◄ B / N ► / ⟲ RESTART / END; HUD timer ∞; Lab shows `[DEV]` Invincible on (under `npm run demo`). |
| 20 | presenter-quick-10-nightmare | Step `10 / 13`, timer ≈ 0:15; queue bar filled; Lab sync = FULL, preset = Nightmare. |
| 21 | presenter-quick-13-swarm | Step `13 / 13`; caption about network players; **OPEN DASHBOARD ↗** and a green "2 network player session(s) on udp:9100" (amber hint if none); `UDP-1` / `UDP-2` in the arena and on the leaderboard; Lab preset Baseline (your link is clean). |
| 22 | presenter-compare-1 | Bar under the Compare grid with MAP buttons (NEON lit) and RESTART; dock without its own caption (it is in the bar); Prediction preset selected. |
| 23 | presenter-compare-7 | Step `7 / 7`, Lockstep preset selected; EXPECT line with stalled / In→Screen / kbps / desync 0; the bar's caption doesn't cover the dock table. |
| 24 | dashboard | The emulator's own page: CONNECTED; routes `ws:9000` and `udp:9100` (all interfaces), REMOVE buttons visible (below 1400 px the panels stack, so no table scrolls sideways); sessions `UDP-1`, `UDP-2` with kbps; target = route udp:9100; charts drawing; packet log rows with fragment headers (`~id.i/n|…`). `pageOverflowY` true is expected (a scrolling page). |
| 25 | dashboard-swarm-nightmare | After NIGHTMARE on `udp:9100`: preset button lit, sliders at 120 ms / 50 ms / 12 % burst / 400 kbps; loss and queue charts rising; packet log shows `lost` and `queue drop` with whole-ms delays. The shot resets the route to Baseline afterwards. |
| 26 | game-landing | Phase 7, the game edition (`npm run build`, served on 8090). Only QUICK MATCH, the room row and CREDITS — no Compare, Presenter or dashboard; subtitle "Top-down arena shooter • …"; game-only controls hint. |
| 27 | game-waiting | "WAITING FOR PLAYERS", "Match starts in N s · 1 player connected", "Bots fill the empty slots"; PING chip; no Lab, no packet strip. |
| 28 | game-room-host | PRIVATE ROOM, the code in large letters (e.g. WARM RAM), the share link with COPY, "1 in the room: … (host)", **START MATCH** button. |
| 29 | game-room-guest | The same lobby seen by the guest: 2 in the room, the host marked, **no START** — "Waiting for … to start · bots fill the empty slots". Its fps is ≈ half (the host page renders an arena too, in the same headless browser). |
| 30 | game-match | A running match in a private room: timer, map name, leaderboard with 2 humans + 2 bots, PING chip; nothing of the demo's tools. |
| 31 | game-settings | Graphics Quality row; **no ghost toggle** (demo only); Leave Match. |
| 32 | game-controls | Only PILOT & COMBAT, POWER-UPS and SYSTEM SHORTCUTS — no Network Lab, netcode or Presenter keys. |
| 33 | game-quality-low | Graphics Quality Low: players, crates, floor and shields the **same size** as in 30 (only softer); no missing textures (no procedural fallbacks). |
| 34 | game-room-not-found | "CANNOT JOIN" with "No room JOLLY ZEBRA. Check the code, or create a new room." and BACK TO MENU. |

The dashboard with **no routes** (`npm run emulator`) isn't in the shots (they run the demo). Check it by hand, or see the scratch check in `log.md` T92: empty-state text, the add-route form, an error for a duplicate route, no horizontal scroll at 420 px.

## Recording the review

Write findings into the `log.md` change-log entry of the run (fixed, or listed with a reason). The last full review is in `log.md` under T113 (Phase 7); before that T106 (Phase 6), T94 (Phase 5) and T75.
