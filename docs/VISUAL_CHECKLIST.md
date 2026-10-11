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
  1280x720/  01-landing.png … 23-dashboard-swarm-nightmare.png, index.json
  1920x1080/ (same 23 screens)
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
| 01 | landing | Five buttons: Quick Match, Compare, Presenter — Quick Match, Presenter — Compare, **EMULATOR DASHBOARD ↗** (enabled since Phase 5); controls hint fits in two lines. |
| 02 | credits | Modal centred, CC-BY avatar credit present, CLOSE visible. |
| 03 | quick-match | Lab open with default sections and **no Lab scroll** (`labScrolls: false`); SYNC MODEL in two groups (SNAPSHOTS: FULL/DELTA, STATE SYNC: 10/30 Hz), one chip lit; aim chevrons in front of the bots' rings; arena crisp (no glow or haze); packet strip legend visible next to INSPECT PACKETS. |
| 04 | quick-nightmare | Strip: EMULATOR chips list the Nightmare impairments; **queue bar** amber/red with `QUEUE ↓… ms`; dots crowd inside the box; red lost dots fall. |
| 05 | quick-inspector | Drawer readable; doesn't cover the Lab. |
| 06 | quick-settings | UI Scale row (100 / 115 / 130 %), Leave Match at the end; no blur artefacts. |
| 07 | quick-controls | `Y`, presenter keys and power-ups listed. |
| 08 | quick-lab-all-open | Every section open: the Lab scrolls (expected), section titles have carets, nothing overlaps; Developer shows Invincible and six GIVE POWER-UP chips with icons. |
| 09 | quick-ui-130 | UI 30 % larger, Lab wider; at 1920 × 1080 still no Lab scroll; strip side column doesn't collide with SERVER. |
| 10–15 | compare-<preset> | Pane headers (title, sync chip, P/C/I/Rd/G chips) fit; dock table + bandwidth chart visible; caption above the table; Sync/Bandwidth after ≈ 15 s show the gap between Full and Delta. |
| 16 | compare-custom-4-ref | Four panes + REF fit the grid without letterboxing; dock still visible (or in the empty cell). |
| 17 | compare-lab-drawer | Drawer overlays (panes not resized); all impairment sliders visible (sections never collapse here). |
| 18 | presenter-quick-1 | Presenter bar between arena and strip: `1 / 13`, title, caption, EXPECT line, timer, MAP buttons (current map lit), ◄ B / N ► / ⟲ RESTART / END; HUD timer ∞; Lab shows `[DEV]` Invincible on (under `npm run demo`). |
| 19 | presenter-quick-10-nightmare | Step `10 / 13`, timer ≈ 0:15; queue bar filled; Lab sync = FULL, preset = Nightmare. |
| 20 | presenter-quick-13-swarm | Step `13 / 13`; caption about network players; **OPEN DASHBOARD ↗** and a green "2 network player session(s) on udp:9100" (amber hint if none); `UDP-1` / `UDP-2` in the arena and on the leaderboard; Lab preset Baseline (your link is clean). |
| 21 | presenter-compare-1 | Bar under the Compare grid with MAP buttons (NEON lit) and RESTART; dock without its own caption (it is in the bar); Prediction preset selected. |

| 22 | dashboard | The emulator's own page: CONNECTED; routes `ws:9000` and `udp:9100` (all interfaces), REMOVE buttons visible (below 1400 px the panels stack, so no table scrolls sideways); sessions `UDP-1`, `UDP-2` with kbps; target = route udp:9100; charts drawing; packet log rows with fragment headers (`~id.i/n|…`). `pageOverflowY` true is expected (a scrolling page). |
| 23 | dashboard-swarm-nightmare | After NIGHTMARE on `udp:9100`: preset button lit, sliders at 120 ms / 50 ms / 12 % burst / 400 kbps; loss and queue charts rising; packet log shows `lost` and `queue drop` with whole-ms delays. The shot resets the route to Baseline afterwards. |

The dashboard with **no routes** (`npm run emulator`) isn't in the shots (they run the demo). Check it by hand, or see the scratch check in `log.md` T92: empty-state text, the add-route form, an error for a duplicate route, no horizontal scroll at 420 px.

## Recording the review

Write findings into the `log.md` change-log entry of the run (fixed, or listed with a reason). The last full review is in `log.md` under T94 (Phase 5); before that T75.
