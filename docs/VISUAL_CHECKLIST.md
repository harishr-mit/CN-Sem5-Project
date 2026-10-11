# Visual Checklist — reviewing `npm run shots`

**Audience:** whoever reviews the screenshots before a demo or a phase exit (PHASES.md Phase 4 exit criteria, P7).

## Running it

```bash
npm run shots              # from the repo root or NoBu-Shooter/; ≈ 5 min
npm run shots -- --fast    # shorter waits (Nightmare screens 5 s instead of 15 s)
npm run shots -- --only=compare,presenter   # only screens whose name contains one of these
```

The script starts `npm run demo` itself (ports 5173/8080/9000/9001 must be free), drives the locally installed Google Chrome through `playwright-core` (a devDependency of `NoBu-Shooter`; no browser download — set `NOBU_CHROME=<path to chrome.exe or msedge.exe>` if Chrome is elsewhere), and stops the demo when it ends. Output (git-ignored):

```text
NoBu-Shooter/artifacts/shots/
  index.json                 run summary: both viewports, failures
  1280x720/  01-landing.png … 20-presenter-compare-1.png, index.json
  1920x1080/ (same 20 screens)
```

Each `index.json` row has `fps` (requestAnimationFrame over 2 s), `errors` (console errors and page errors — the run fails on any), `notes` (e.g. `[arena] bloom switched off…`), `warnings` (count; React StrictMode's "closed before established" WebSocket warnings in Compare are expected, `docs/ASSUMPTIONS.md` #18), `labScrolls`, `pageOverflowX/Y`.

## What to check on every shot

1. **No unstyled elements** — no browser-default buttons, serif text, blue links or white boxes.
2. **No overlap** — text doesn't run into other text or controls; buttons aren't covered; nothing is cut off at the window edge (`pageOverflowX/Y` false).
3. **Readable at 1280 × 720** — every label can be read at 100 % zoom; metric values aren't truncated.
4. **Captions don't hide the effect** — the Presenter bar and the Compare dock never cover the arena area being described.
5. **Colours mean the same everywhere** — cyan = you / upstream, magenta = downstream, amber = ghost / corrections / queue, red = loss, pane colours match the dock rows.

## Per screen

| # | Screen | Also check |
|---|---|---|
| 01 | landing | Five buttons: Quick Match, Compare, Presenter — Quick Match, Presenter — Compare, Emulator dashboard (disabled, "Phase 5"); controls hint fits in two lines. |
| 02 | credits | Modal centred, CC-BY avatar credit present, CLOSE visible. |
| 03 | quick-match | Lab open with default sections and **no Lab scroll** (`labScrolls: false`); aim chevrons in front of the bots' rings; soft glow on walls (bloom, quality high); packet strip legend visible next to INSPECT PACKETS. |
| 04 | quick-nightmare | Strip: EMULATOR chips list the Nightmare impairments; **queue bar** amber/red with `QUEUE ↓… ms`; dots crowd inside the box; red lost dots fall. |
| 05 | quick-inspector | Drawer readable; doesn't cover the Lab. |
| 06 | quick-settings | UI Scale row (100 / 115 / 130 %), Graphics Quality, Leave Match at the end; no blur artefacts. |
| 07 | quick-controls | `Y`, presenter keys and power-ups listed. |
| 08 | quick-lab-all-open | Every section open: the Lab scrolls (expected), section titles have carets, nothing overlaps. |
| 09 | quick-ui-130 | UI 30 % larger, Lab wider; at 1920 × 1080 still no Lab scroll; strip side column doesn't collide with SERVER. |
| 10–15 | compare-<preset> | Pane headers (title, sync chip, P/C/I/Rd/G chips) fit; dock table + bandwidth chart visible; caption above the table; Sync/Bandwidth after ≈ 15 s show the gap between Full and Delta. |
| 16 | compare-custom-4-ref | Four panes + REF fit the grid without letterboxing; dock still visible (or in the empty cell). |
| 17 | compare-lab-drawer | Drawer overlays (panes not resized); all impairment sliders visible (sections never collapse here). |
| 18 | presenter-quick-1 | Presenter bar between arena and strip: `1 / 12`, title, caption, EXPECT line, timer, ◄ B / N ► / END; Lab shows `[DEV]` Invincible on (under `npm run demo`). |
| 19 | presenter-quick-10-nightmare | Step `10 / 12`, timer ≈ 0:15; queue bar filled; Lab sync = FULL, preset = Nightmare. |
| 20 | presenter-compare-1 | Bar under the Compare grid; dock without its own caption (it is in the bar); Prediction preset selected. |

## Recording the review

Write findings into the `log.md` change-log entry of the run (fixed, or listed with a reason). The last full review is in `log.md` under T75.
