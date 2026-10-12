# Phase 7 Implementation Plan — Multiplayer readiness (LAN)

**Status:** **done 2026-10-12** (T109–T114; plan written in T108 from the owner's decisions in `PHASES.md` Phase 7, option A). Deviations X1–X10 in §8. Option B (internet play) is not part of this plan.

**In one sentence:** after Phase 7, someone on the same network opens `http://<operator-ip>:8080`, types a name, and plays: a quick match, or a private room joined with a short code. The game has no install, no emulator, no operator tools and one fixed set of the best netcode settings. `npm run demo` keeps everything it has today.

---

## 0. Starting point

Measured on branch `phase7` (= `main` after PR #9), 2026-10-12:

- **Client build today** (`vite build`, the demo, the only edition): **16 MB on disk.**
  - JS 1,798 kB (gzip 443 kB), one chunk. Phaser is about 1.2 MB of it.
  - CSS 80 kB (gzip 27 kB).
  - Fonts ≈ 3 MB: every `@fontsource` subset (latin, latin-ext, Vietnamese, Devanagari) as both woff and woff2. Browsers download only the subsets a page uses, so the network cost is far less than the disk size.
  - The whole `assets/` folder, because it is Vite's `publicDir`:
    - `sprites/player/**`, 7.6 MB of raw frames. Nothing loads these; they only feed `npm run pack-assets`.
    - `packed/player.png`, 1.6 MB: the atlas the game actually draws players from.
    - `textures/floors/stone_beige.png`, 2.2 MB.
    - The sounds, 432 kB (WAV, plus one OGG and one MP3).
    - `README.md` and `CREDITS.md`.
- **What a player's browser downloads today:** ≈ 0.5 MB of JS and CSS (gzip), the fonts it uses, and ≈ 4.7 MB of art and sound.
- **Server:** `server/src/main.ts` runs the WebSocket server on Node's HTTP server (port 8080, all interfaces), plus UDP 8081. The HTTP server answers no ordinary requests yet.
  - Rooms are fixed: `main` and `lab` (`core.ts` `getRoom`). `hello.room` must be `'main' | 'lab'`.
  - With bots on, the first human starts the countdown at once (`room.ts` `checkMatchTransition`).
- **Client:**
  - `App.tsx` is the demo shell: Landing, the match view with Lab / strip / inspector / Presenter, and Compare.
  - The addresses are hard-coded: `ws://127.0.0.1:9000` (`App.tsx`) and `127.0.0.1` in `CompareView.tsx` and `EmulatorClient.ts`.
  - `NetClient` imports `LockstepClient` and `Extrapolator` statically, so every bundle contains them.
  - `Hud`, `GameContainer`, `ArenaScene`, `SettingsPanel` and `ControlsOverlay` have no Lab dependencies (the Lab keys live in `NetworkLab.tsx`).
- **Settings:** there is no Graphics Quality setting any more (the bloom it controlled was removed in T86).
- **Checks:** 222 tests, typecheck, smoke (8 steps) and shots (25 screens × 2) pass on `main`.

---

## 1. Decisions

The owner's decisions are in `PHASES.md` Phase 7. These are the implementation decisions.

| ID | Decision | Why |
|---|---|---|
| D1 | **Two client editions, one code base.**<br>• **Demo** (`client/index.html` → `src/main.tsx` → `ui/App.tsx`) is unchanged in behaviour.<br>• **Game** (`client/play/index.html` → `src/play/main.tsx` → `play/PlayApp.tsx`) imports only what a player needs.<br>Both are built from the same modules: arena scene, HUD, settings, controls, landing form, match view, `NetClient`, assets manifest, and `shared/` for rules, maps, sim and protocol. A rule, texture, effect or HUD change is made once. What exists per edition is only its shell: which tools it mounts. | Owner: "any change is only updated once". |
| D2 | **Shared shell pieces extracted from `App.tsx`:**<br>• `MatchView`: arena + HUD + Settings (Esc) + Controls (F1) + `M` mute, with a slot for edition extras.<br>• `LandingForm`: callsign, PLAY, CREATE ROOM, JOIN ROOM.<br>The demo's `App` = `LandingForm` + its extra buttons, and `MatchView` + Lab / strip / inspector / Presenter. The game's `PlayApp` = `LandingForm` + `MatchView` with nothing extra. | One landing and one match view instead of two copies. |
| D3 | **The game's fixed netcode** (owner, from the Phase 3–6 numbers):<br>• Delta snapshots;<br>• prediction, reconciliation (smoothing on) and interpolation (100 ms) on;<br>• input redundancy off;<br>• ghost off.<br>No keys or UI change them. The game server enforces Delta: a `sync` / `hello.sync` asking for another model gets `error SYNC_FIXED`, and the connection stays on Delta. | Best measured settings. Over TCP, redundancy only adds bytes. |
| D4 | **`NetClient` sync models become pluggable.** `NetClientOptions.models?: SyncModules` supplies the State decoder (`Extrapolator`) and `LockstepClient`.<br>• `client/src/net/allModels.ts` exports all of them. The demo, Compare, tests and the swarm pass it.<br>• The game passes nothing, so tree-shaking drops lockstep and extrapolation from its bundle.<br>• Without the modules, `setSync` to `state` / `lockstep` is refused locally (it stays on its model). | Smallest bundle without forking `NetClient`. |
| D5 | **Server address in the client** (`client/src/net/serverUrl.ts`):<br>• The game connects to `ws(s)://<page host>/ws`: `wss` when the page is `https`, which is ready for option B.<br>• `?server=host:port` overrides it, so an operator can put the standalone emulator in front by sharing `http://<ip>:8080/?server=<ip>:9000`.<br>• The demo keeps the emulator route, but derives the host the same way, so a demo opened from another machine reaches the operator's emulator. The emulator control port stays 127.0.0.1-only as in Phase 5 D7. | M1. The page's own host is the one address that works locally and on the LAN. |
| D6 | **The game server = the same `server/src/main.ts`, with flags.**<br>• `--game` (or `NOBU_MODE=game`):<br>  – refuses `dev`, `perturb`, `lab`, lockstep, the `lab` room and non-Delta sync (`error NOT_ALLOWED` / `SYNC_FIXED`);<br>  – no UDP adapter unless `--udp`.<br>• `--static <dir>` serves the built game on the WebSocket's HTTP port.<br>• `--port <n>` / `PORT`, default 8080.<br>WebSocket upgrades are accepted on `/ws` and, as today, on `/`. `NOBU_DEV` is never set by the game commands. | M2, M3. One process, one port, one firewall rule. Browsers can't use UDP, so the port stays closed unless the swarm should join. |
| D7 | **Static file server** (`server/src/static.ts`, Node built-ins only):<br>• `GET` / `HEAD` only, and paths resolved inside `<dir>` (no `..`, no symlink escape);<br>• `index.html` for `/`, `404` otherwise;<br>• hashed files under `/assets/` are cached `immutable` for 1 year, everything else `no-cache`;<br>• HTML / JS / CSS / JSON compressed with brotli (or gzip, from `Accept-Encoding`), once at first request and then from memory;<br>• images and audio are sent as they are (already compressed). | Compression and caching save more bytes than anything else at no cost. No new dependency. |
| D8 | **Commands** (both from the repo root and from `NoBu-Shooter/`):<br>• `npm run dev`: assets step (D11), then the game server (`--game`, 8080) + a Vite dev server for `client/play` on **5173, all interfaces** (`--host`), with HMR and a proxy `/ws` → `ws://127.0.0.1:8080`. Ctrl+C stops both (the `demo.mjs` process helpers).<br>• `npm run build`: assets step, then `vite build` of the game → `NoBu-Shooter/dist/game/` (git-ignored); it prints the bundle sizes.<br>• `npm start`: `server --game --static dist/game` on 8080. It prints the LAN addresses (`os.networkInterfaces()`), e.g. `http://192.168.1.23:8080`, and fails with a hint if `dist/game` is missing.<br>• `npm run demo` and `npm run emulator` are unchanged. | Standard names (owner: yes). The page is reachable on the LAN the same way in dev and in start. |
| D9 | **Rooms with codes** (owner, M6).<br>• `hello.room` is `'main'` (quick match), `'lab'` (demo only), `'new'` (create a private room) or a **room code**. The welcome carries the room's `code` and whether you are its `host`.<br>• **Codes are two short words**, adjective + animal (≈ 40 × 40 words, 3–5 letters each, no look-alikes), shown as `BLUE FOX`. Typing is case-insensitive; space, dash or nothing between the words all work (`bluefox`). The share link is `http://<host>:8080/?room=blue-fox`.<br>• Errors: `ROOM_NOT_FOUND`, `ROOM_FULL`, `ROOM_LIMIT` (at most 32 private rooms per server).<br>• **A private room plays exactly like `main`:** bots, firing, power-ups, the 2-minute clock and the map rotation.<br>• **Its lobby waits for the host:** `WAITING` until the host presses **START** (new message `start`), then countdown, with bots filling the empty slots to 4. After a match it continues like `main` (`ENDED` → `COUNTDOWN`). If the host leaves, the longest-connected human becomes host.<br>• The room is deleted 60 s after its last human leaves, so a page reload doesn't lose it.<br>• Rooms exist in every edition, demo included; the Presenter keeps using `main`. | Short and memorable (owner). Word pairs are easier to say across a room than random letters. "Waiting for the host" suits friends gathering. A quick match uses the timed join window instead (D10). |
| D10 | **Join window in `main`** (all editions, `GAMERULES.md` §2):<br>• `match.joinWindowMs = 10000`. The first human in an empty `main` room starts it. It ends early once `bots.targetParticipants` (4) humans are in. Then the countdown begins, and bots fill to 4 as today.<br>• `MatchSnap.waitMsLeft` (new, optional) drives "WAITING FOR PLAYERS — starts in 8 s · 2 connected".<br>• `start` in `main` is honoured only under `NOBU_DEV` (the demo). **Presenter Quick Match sends it, so the talk never waits** (owner: yes).<br>• Tests, smoke and shots set `NOBU_JOIN_WINDOW_MS` (0 where they need the old instant start; shots also capture the waiting screen once). | Owner. A human who takes a few seconds to join isn't late. |
| D11 | **Asset pipeline:** `assets/` holds the masters you edit; a generated folder is what every edition serves. `scripts/build-assets.mjs` (`npm run assets`) writes `NoBu-Shooter/assets-build/` (git-ignored) with `high/`, `medium/`, `low/` and `manifest.json` (file → size, tier scale). `demo`, `dev` and `build` run it first, and it skips files whose master is unchanged (mtime + size). Vite's `publicDir` becomes `assets-build/`.<br>• **Textures → WebP**: lossy, quality ≈ 85, for floors, the player atlas, effects and the shield; lossless for pixel-art props and icons. Tiers by linear scale for images larger than 128 px: high 1.0, medium 0.5, low 0.25. Small images and pixel art are the same in every tier.<br>• **Budget:** no generated file above 300 kB. `stone_beige` high ≤ 160 kB (owner: comparable to the other floors, `brick_herringbone` = 148 kB). The script fails if a budget is broken.<br>• **Sounds → OGG Vorbis** (owner: all sounds): high q5 as recorded, medium q3, low q1 mono 22 kHz. The WAV / MP3 masters stay in `assets/sfx/`.<br>• **The player atlas JSON** is scaled with its image per tier, and `PLAYER_SPRITE_SCALE` divides by the tier scale, so a player is ≈ 54 px on every tier.<br>• **New local dev dependencies** (owner: yes): `sharp` (images) and `ffmpeg-static` (audio). | Change a texture or sound once, in `assets/`. WebP alone cuts the atlas several times over. |
| D12 | **Raw player frames move out of the served folder:** `assets/sprites/player/**` → `NoBu-Shooter/assets-src/player/**` (`pack-assets` input; `CREDITS.md` and the asset README updated). `assets/README.md` and `CREDITS.md` are not copied into `assets-build/`. | 7.6 MB that no edition loads stops being served by all of them (owner). |
| D13 | **Graphics Quality** (Settings, both editions): Low / Medium / **High (default)**, remembered.<br>• **Progressive loading:** a scene always starts on the **low** tier, so the first frame comes fast. It then downloads the chosen tier in the background (under temporary keys). When that has finished, it swaps at a safe moment: the scene restarts with the new textures. Old keys are removed, the new ones renamed, and the player animations rebuilt; `NetClient` is untouched, so the match goes on.<br>• Changing the setting during a match does the same.<br>• Compare panes use the medium tier (they render small). | Owner: lower resolution on low, progressively up to the full files on high. A scene restart is the simplest safe swap, because Phaser animations hold references to the old textures. |
| D14 | **Ping on the HUD** (both editions): `PING 23 ms`, coloured green / amber / red at < 60 / < 150 / ≥ 150 ms, from `NetClient`'s RTT. The game shows no other network numbers. | Owner: just a ping. |
| D15 | **Smaller fonts:** import only the `latin` subsets of the three `@fontsource` families (both editions). | ≈ 3 MB of font files that no Latin page uses leave the build. |
| D16 | **Bundle guard:** a test builds the game and fails if its JS contains demo-only markers (`NETWORK LAB`, `PRESENTER`, `lsNack`, `EmulatorClient`, `DASHBOARD`). It records the sizes in its output. Phaser stays as it is (a custom Phaser build is not in Phase 7). | Keeps the game bundle game-only as the code evolves. |

---

## 2. Design

### 2.1 Shared (`shared/src/`)

- `protocol/messages.ts`:
  - `MsgHello.room: string`, validated as `main` / `lab` / `new` or a room code.
  - New `MsgStart { t: 'start' }`.
  - `MsgWelcome` gains `code?` and `host?`.
  - `MatchSnap` gains `waitMsLeft?`, `code?` and `hostId?`.
  - New error codes `ROOM_NOT_FOUND`, `ROOM_LIMIT`, `NOT_ALLOWED`, `SYNC_FIXED`.
- `rooms/codes.ts`: the word lists, `newCode(taken, rng)`, `normalizeCode(input)` (→ `blue-fox` or null) and `formatCode` (→ `BLUE FOX`).
- `config/game.json`: `match.joinWindowMs: 10000`, `rooms.maxPrivate: 32`, `rooms.emptyGraceMs: 60000`.

### 2.2 Server

- `core.ts`:
  - `GameServer` options: `{ mode: 'demo' | 'game', joinWindowMs? }`.
  - The `hello` room logic: create or find a private room, or the errors; host bookkeeping; `start`.
  - The game-mode refusals (D3, D6).
  - A periodic sweep that removes private rooms empty for `emptyGraceMs`.
- `game/room.ts`:
  - `kind: 'main' | 'lab' | 'private'` (private rooms use `main`'s room config);
  - the join-window timer in `WAITING`, and `waitMsLeft` in snapshots;
  - `start()`;
  - host tracking and handover.
- `main.ts`: the flags `--game`, `--static`, `--port`, `--udp`; WebSocket on `/ws` and `/`; LAN address print.
- `static.ts`: D7.

### 2.3 Client

- `net/serverUrl.ts` (D5), `net/allModels.ts` (D4), `NetClient`: `models`, `room` as a string, the `code` / `host` from the welcome, and `start()`.
- `ui/MatchView.tsx` and `ui/LandingForm.tsx` (D2).
  - `LandingForm` has a "JOIN ROOM" code field.
  - It shows the room code and START button in the waiting overlay for the host, and "Waiting for the host" for others.
  - `?room=` on the URL pre-fills JOIN.
- `Hud.tsx`: the ping (D14) and the waiting overlay (D10).
- `SettingsPanel`: Graphics Quality; demo-only rows (ghost) hidden in the game.
- `ControlsOverlay`: the game lists only game keys.
- `game/assets.ts`: tier-aware paths (`manifest.json`), per-key scale, background upgrade and swap (D13).
- `play/`: `index.html`, `main.tsx`, `PlayApp.tsx`.
- `vite.config.ts` (demo) + `vite.play.config.ts` (game: root `client/play`, the same alias and publicDir, outDir `../dist/game`, `/ws` proxy).

### 2.4 Scripts

- `scripts/build-assets.mjs` (D11).
- `scripts/dev.mjs` (D8), sharing `scripts/lib/procs.mjs` with `demo.mjs`.
- `scripts/start.mjs`: checks for `dist/game`, then spawns the server with the flags.
- `pack-assets.mjs`: the new input folder (D12).
- `smoke.mjs`: new steps (§4).
- `shots.mjs`: game screens.

---

## 3. Build order

| Step | Task | What | Done when |
|---|---|---|---|
| 1 | T109 | **Assets:** move the raw frames (D12); `build-assets` with `sharp` + `ffmpeg-static` (WebP, OGG, tiers, budgets, manifest); publicDir → `assets-build/`; `demo` runs the assets step; tier-aware manifest + Graphics Quality + progressive swap (D13); latin fonts (D15) | Tests 7–8; the demo looks the same at High (shots); `stone_beige` ≤ 160 kB |
| 2 | T110 | **Server:** join window + `start` (D10); private rooms + codes + host (D9); game mode (D3, D6); static server (D7); flags | Tests 1–5 |
| 3 | T111 | **Client shared:** `serverUrl`, pluggable sync models (D4), `MatchView` / `LandingForm` refactor, rooms UI, waiting overlay, ping, Presenter sends `start` | Tests 6, 9; the demo behaves as before (smoke, shots) |
| 4 | T112 | **Game edition:** `client/play`, `vite.play.config.ts`, `npm run dev` / `build` / `start` (+ root scripts), bundle guard | Test 10; `npm run build` + `npm start` play from a second browser profile via the LAN address |
| 5 | T113 | **Verification:** smoke steps 9–10, shots for the game, LAN check from this laptop's LAN IP, bundle numbers before / after | §5 checklist |
| 6 | T114 | **Docs + phase exit:**<br>• `README.md`: commands, a "Host a LAN game" section (IP, firewall prompt / rule, Wi-Fi client isolation, hotspot);<br>• `docs/PROTOCOL.md`: rooms, `start`, the new fields and errors;<br>• `GAMERULES.md`: §2 join window, private rooms;<br>• `docs/ASSUMPTIONS.md`, `docs/DEMO_SCRIPT.md` (Presenter skips the window), `docs/VISUAL_CHECKLIST.md`, `assets/README.md`, `PHASES.md`, `log.md` | Every doc describes the new behaviour |

---

## 4. Tests

| # | File | Checks |
|---|---|---|
| 1 | `tests/rooms.test.ts` | Codes: unique among taken ones; normalize `Blue Fox` / `blue-fox` / `BLUEFOX` → `blue-fox`; bad input → null. |
| 2 | `tests/rooms.test.ts` | `hello room:'new'` → welcome with code + host. A second client joins by code and is not the host. An unknown code → `ROOM_NOT_FOUND`. The 33rd room → `ROOM_LIMIT`. Rooms are isolated (no snapshots across rooms). The host leaving hands over. An empty room is removed after the grace period. |
| 3 | `tests/rooms.test.ts` | Private lobby: stays `WAITING` until the host's `start`; `start` from a non-host is ignored; after `start`, bots fill to 4 and the countdown runs. |
| 4 | `tests/netcode.test.ts` (or new) | Join window in `main`: `WAITING` with `waitMsLeft` counting down → `COUNTDOWN` after 10 s; early with 4 humans; `start` in `main` only with `NOBU_DEV`. |
| 5 | `tests/gamemode.test.ts` | Game mode refuses `dev`, `perturb`, `lab`, `room:'lab'` and `sync` ≠ delta (error codes); delta is the default. Static server: `/` → index.html; hashed asset → immutable; brotli / gzip by `Accept-Encoding`; `/../package.json` and encoded variants → 404; the WebSocket on `/ws` on the same port completes a hello. |
| 6 | `tests/serverUrl.test.ts` | `http://192.168.1.5:8080/` → `ws://192.168.1.5:8080/ws`; https → wss; `?server=` override; the demo's emulator URL uses the page host. |
| 7 | `tests/assets.test.ts` | After `build-assets`: three tiers exist for every manifest entry; every file within budget; `stone_beige` high ≤ 160 kB; the atlas JSON frames scaled by the tier and inside the image; every sound has an `.ogg` in every tier. |
| 8 | `tests/assets.test.ts` | The tier resolver: paths, and the scale for each key and tier. |
| 9 | `tests/netcode.test.ts` | `NetClient` without models: full + delta work; `setSync('state')` is refused locally; with `allModels` all existing sync tests pass unchanged. |
| 10 | `tests/bundle.test.ts` (slow, own script) | Builds the game: none of the demo markers (D16) in its JS; logs the JS / CSS / asset sizes. |

The existing 222 tests stay green. Where they relied on the instant start, they set the join window to 0.

**Smoke:**
- Step 9: `npm run build` + `npm start` on a free port. A headless client on the LAN address (the first non-internal IPv4) plays a quick match through the join window.
- Step 10: two headless clients create and join a private room by code, and the host starts it.

**Shots:** the game landing, the waiting screen with its countdown, the room lobby (host and guest), Settings with Graphics Quality, the game HUD with ping, and the arena at Low / High.

---

## 5. Exit checklist

- [x] Every check passes: `npm test` (**267 tests**, 222 before + 45 new), `npm run typecheck`, `npm run smoke` (**10/10 steps**), `npm run shots` (**34 screens × 2, 0 console errors**).
- [x] `npm run build` → `npm start` serves the game on 8080. Fresh browser contexts reach it via the LAN address (192.168.0.9), play a quick match and a private room (create, join by typed code, host START), and see ping on the HUD. No Lab, Presenter or emulator anywhere in it.
- [x] `npm run dev`: editing a client file (`PlayApp.tsx`) hot-reloads in place (page state kept) in a browser opened via the LAN address; the game connects through Vite's `/ws` proxy.
- [x] `npm run demo` and the Presenter run as before (smoke 1–8, shots 1–25); with the real 10 s window a normal Quick Match waits 10 s then counts down, Presenter Quick Match starts at once (∞ clock).
- [x] The game bundle and assets measured and recorded (before / after) in `log.md` and §8 X7; `stone_beige` 141 kB; no raw frames served (`tests/assets.test.ts`).
- [x] The UDP port is closed under `npm start` (`netstat`: only TCP 8080); `dev` / `start` clear `NOBU_DEV`, and the server refuses `--game` with it.
- [x] `.gitignore` covers `assets-build/` (added) and `dist/`; the asset build state is under `node_modules/`; the new dependencies (`sharp`, `ffmpeg-static`) are listed in `log.md`.
- [x] Docs updated (§3 step 6); no processes or sockets left.
- [ ] **Owner:** a real second machine on the same network (not possible from the development laptop alone).

---

## 6. Risks

| Risk | Plan |
|---|---|
| `sharp` / `ffmpeg-static` binaries fail to install on this Windows + Node 26 machine | Both ship prebuilt binaries. If one fails, ask the owner before any other route; a fallback for images is `pngjs` (already a dependency) resizing + PNG. |
| The progressive swap breaks animations or leaks textures | The swap is a scene restart; a test-like shots run at Low → High; texture counts logged in dev. If unstable, fall back to "the chosen tier from the start", with a change applied on the next match (deviation logged). |
| The join window slows tests, smoke and shots | `NOBU_JOIN_WINDOW_MS` / the `GameServer` option; 0 where the old timing is needed. |
| The `App.tsx` refactor breaks the demo | Smoke + shots + presenter tests after step 3, before the game edition is built on it. |
| Windows Firewall blocks LAN players | Documented: answer the first prompt with "Private networks", or a one-line rule (administrator). The operator's decision, not done by a script. |
| Wi-Fi client isolation (campus networks) | Documented: a phone hotspot or a travel router. |
| OGG in Safari | Target browsers are Chrome, Edge and Firefox (laptops / PCs). Safari's OGG support depends on its version; noted in the README. |

---

## 7. Not in Phase 7

- Option B (internet play): TLS / `wss://`, a public host, M4 hardening, a browser datagram transport (WebRTC DataChannel or WebTransport), and input redundancy back on with it (`PHASES.md` Phase 7, "Future scope").
- Phones / touch controls, accounts, matchmaking beyond quick match + room codes, a custom Phaser build.

## 8. Deviations from this plan

| ID | Deviation | Why |
|---|---|---|
| X1 | **The bundle guard runs in `npm run build`** (`scripts/build.mjs`; smoke step 9 and shots run the build), not as `tests/bundle.test.ts`. | A Vite build inside `npm test` would add ≈ 15 s to every test run; in the build it guards every artifact that can ship. |
| X2 | **Smoke steps 9–10 bind 127.0.0.1** (port 8090), not the LAN address. The LAN path was checked by hand from this laptop's LAN address (192.168.0.9: `npm start` and `npm run dev`). | Tests and smoke never expose ports (Phase 5 D15); binding the LAN would also raise a firewall prompt in an unattended run. |
| X3 | **The game's entry is `client/play/main.tsx`**, not `src/play/main.tsx` (the app is still `src/play/PlayApp.tsx`); `client/tsconfig.json` includes `play`. | Found in the dev check: the Vite dev server resolves `index.html`'s script against its root (`client/play`) and couldn't load `../src/...`, although `vite build` could. |
| X4 | **Latin-only fonts are imported in `global.css`**, not in a separate fonts module. | Found in the first build: `global.css` already imported every `@fontsource` subset itself, so a separate Latin import changed nothing. |
| X5 | **The demo's key groups moved to `ui/demoControls.ts`** (ControlsOverlay takes edition groups). | Found by the bundle guard: hidden at runtime, their text ("NETWORK LAB", "PRESENTER") was still in the game's JS. |
| X6 | **The asset build's state lives in `node_modules/.cache/`**, not in `assets-build/`. | `assets-build/` is served as is; a dot-file there would have been copied into the build. |
| X7 | **The JS saving is small**: 1 798 → 1 730 kB minified (gzip 443 → 410 kB; brotli as served: 332 kB). The big savings are elsewhere: build on disk 16 MB → 3.2 MB, art + sound loaded ≈ 4.7 MB → 191–645 kB, fonts ≈ 3 MB → 328 kB on disk (142 kB woff2). | Phaser (≈ 1.2 MB) and React are most of the JS; the demo's tools were ≈ 70 kB. A custom Phaser build stays out of Phase 7. |
| X8 | **Both editions get an inline SVG favicon.** | The demo linked `/favicon.svg`, which never existed: a 404 on every page load (seen in the game check). |
| X9 | **`start` in `main` is blocked in the core on the game server, and `main.ts` refuses `--game` with `NOBU_DEV=1`.** | Bug found while writing test 5: `Room.start` trusted `NOBU_DEV` alone, so a game server started with it would have let anyone skip the join window. |
| X10 | **Smoke's game server uses a 3 s join window; the shots' one a 10-minute window** (`NOBU_JOIN_WINDOW_MS`), so the waiting screen stays up; the demo in smoke and shots keeps 0. | Walk through the window quickly in smoke; capture it reliably in shots. |

