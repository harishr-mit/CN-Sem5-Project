/**
 * shots.mjs — `npm run shots` (PHASES.md P7, docs/PHASE4_PLAN.md D10).
 *
 * Starts the demo itself, opens every screen in the locally installed Google
 * Chrome (playwright-core, `channel: 'chrome'`, no browser download) at
 * 1280×720 and 1920×1080, and saves screenshots to
 * `artifacts/shots/<w>x<h>/` (git-ignored) with an `index.json` (fps,
 * console errors, Lab scroll, page overflow per shot). Review them against
 * docs/VISUAL_CHECKLIST.md.
 *
 * Every screen gets a fresh page (clean localStorage); resizing a live
 * headless page produced shifted screenshots in Phase 3. Exits non-zero on
 * any console error or failed screen. The demo runs with two network players
 * (`--swarm 2`, Phase 5) for the dashboard and Presenter Q13 screens. Its
 * process tree is always stopped, so ports 5173/8080/9000/9001 and UDP
 * 8081/9100 are free afterwards.
 *
 *   npm run shots              full run (Nightmare screens wait 15 s)
 *   npm run shots -- --fast    shorter waits (5 s)
 *   npm run shots -- --only=compare,presenter    screens whose name contains one of these
 *   NOBU_CHROME=<path>         use this Chrome/Edge executable instead of channel 'chrome'
 */

import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { spawnNode, spawnTs, assertPortsFree, assertUdpPortsFree, waitForPort, waitForUdpPort, cleanupOnExit } from './lib/procs.mjs';
import { spawnSync } from 'child_process';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const FAST = args.includes('--fast');
const ONLY = (args.find((a) => a.startsWith('--only=')) ?? '').slice(7).split(',').filter(Boolean);
const VIEWPORTS = [[1280, 720], [1920, 1080]];
const URL = 'http://localhost:5173';
/** The game edition (Phase 7): the built game on its own server, this machine only. */
const GAME_PORT = 8090;
const GAME_URL = `http://127.0.0.1:${GAME_PORT}/`;
const DASHBOARD = 'http://127.0.0.1:9001/';
const OUT = join(rootDir, 'artifacts', 'shots');
/** Effects that need the queue to build (Nightmare) get this long. */
const SETTLE_MS = FAST ? 5000 : 15000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Screens ─────────────────────────────────────────────────────
// Each gets a fresh page at the landing screen and leaves the page showing
// what should be captured. `settings` pre-seeds localStorage; `after` runs
// once the shot is taken (to undo a change that would leak into later screens).

async function startQuick(page) {
  await page.click('#quick-match-btn');
  await page.waitForSelector('#game-canvas canvas');
  await sleep(3000);
}

async function startCompare(page) {
  await page.click('#compare-btn');
  await page.waitForSelector('#cmp-grid');
  await sleep(2500);
}

async function comparePreset(page, id) {
  await startCompare(page);
  await page.click(`#cmp-preset-${id}`);
  await sleep(id === 'sync' || id === 'bandwidth' ? SETTLE_MS : 5000);
}

/** Game edition: a private room created by this page; returns its code. */
async function gameRoom(page) {
  await page.click('#create-room-btn');
  await page.waitForSelector('#hud-room-code');
  await sleep(1500);
  return page.locator('#hud-room-code').innerText();
}

/** A private room started alone: bots on (a lone host can't start without them), then START. */
async function gameMatch(page) {
  await gameRoom(page);
  await page.click('#lobby-bots');
  await sleep(600);
  await page.click('#hud-room-start');
  await sleep(4500); // 3 s countdown, then the match
}

/** Touch devices (owner revision R5–R8): a phone in landscape or portrait. Taken once, not per viewport. */
const PHONE_LANDSCAPE = { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const PHONE_PORTRAIT = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

/** A started room on a phone, with the Dash power-up always on (so its button shows). */
async function touchMatch(page) {
  await page.tap('#create-room-btn');
  await page.waitForSelector('#hud-room-code');
  await sleep(1200);
  await page.tap('#lobby-bots');
  await sleep(300);
  await page.tap('#lobby-always-dash');
  await sleep(500);
  await page.tap('#hud-room-start');
  await sleep(4500);
}

const SCREENS = [
  { name: 'landing', run: async () => { await sleep(800); } },
  { name: 'credits', run: async (p) => { await p.click('#credits-btn'); await sleep(400); } },
  { name: 'quick-match', run: startQuick },
  { name: 'quick-nightmare', run: async (p) => { await startQuick(p); await p.keyboard.press('5'); await sleep(SETTLE_MS); } },
  { name: 'quick-inspector', run: async (p) => { await startQuick(p); await p.click('#toggle-inspector-btn'); await sleep(1500); } },
  { name: 'quick-settings', run: async (p) => { await startQuick(p); await p.keyboard.press('Escape'); await sleep(500); } },
  { name: 'quick-controls', run: async (p) => { await startQuick(p); await p.keyboard.press('F1'); await sleep(500); } },
  {
    name: 'quick-lab-all-open',
    settings: { labSections: { presets: true, impairment: true, sync: true, toggles: true, dev: true, metrics: true, sparklines: true, notes: true } },
    run: startQuick,
  },
  { name: 'quick-ui-130', settings: { uiScale: 130 }, run: startQuick },
  { name: 'compare-prediction', run: (p) => comparePreset(p, 'prediction') },
  { name: 'compare-interpolation', run: (p) => comparePreset(p, 'interpolation') },
  { name: 'compare-redundancy', run: (p) => comparePreset(p, 'redundancy') },
  { name: 'compare-sync', run: (p) => comparePreset(p, 'sync') },
  { name: 'compare-bandwidth', run: (p) => comparePreset(p, 'bandwidth') },
  { name: 'compare-staterate', run: (p) => comparePreset(p, 'staterate') },
  // Phase 6: Snapshot vs Lockstep — let B's stalls and C's smoothness show in the dock (docs/PHASE6_PLAN.md D11)
  { name: 'compare-lockstep', run: async (p) => { await comparePreset(p, 'lockstep'); await sleep(4000); } },
  {
    name: 'compare-custom-4-ref',
    run: async (p) => {
      await startCompare(p);
      await p.click('#cmp-preset-custom');
      await p.click('#compare-view button:text-is("4")');
      await p.click('#cmp-ref-toggle');
      await sleep(4000);
    },
  },
  { name: 'compare-lab-drawer', run: async (p) => { await startCompare(p); await p.click('#cmp-lab-toggle'); await sleep(800); } },
  {
    name: 'presenter-quick-1',
    run: async (p) => { await p.click('#presenter-quick-btn'); await p.waitForSelector('#presenter-bar'); await sleep(3000); },
  },
  {
    name: 'presenter-quick-10-nightmare',
    run: async (p) => {
      await p.click('#presenter-quick-btn');
      await p.waitForSelector('#presenter-bar');
      await sleep(2000);
      for (let i = 0; i < 9; i++) { await p.keyboard.press('n'); await sleep(250); }
      await p.waitForSelector('#presenter-bar[data-step="Q10"]');
      await sleep(SETTLE_MS);
    },
  },
  {
    name: 'presenter-quick-13-swarm',
    run: async (p) => {
      await p.click('#presenter-quick-btn');
      await p.waitForSelector('#presenter-bar');
      await sleep(2000);
      for (let i = 0; i < 12; i++) { await p.keyboard.press('n'); await sleep(200); }
      await p.waitForSelector('#presenter-bar[data-step="Q13"]');
      await p.waitForSelector('#presenter-swarm .presenter-swarm-ok', { timeout: 10000 });
      await sleep(6000);
    },
  },
  {
    name: 'presenter-compare-1',
    run: async (p) => { await p.click('#presenter-compare-btn'); await p.waitForSelector('#presenter-bar'); await sleep(4000); },
  },
  {
    name: 'presenter-compare-7',
    run: async (p) => {
      await p.click('#presenter-compare-btn');
      await p.waitForSelector('#presenter-bar');
      await sleep(2000);
      for (let i = 0; i < 6; i++) { await p.keyboard.press('n'); await sleep(250); }
      await p.waitForSelector('#presenter-bar[data-step="C7"]');
      await sleep(SETTLE_MS);
    },
  },
  {
    // The emulator's own page with the demo's two routes and the network players
    name: 'dashboard',
    run: async (p) => {
      await p.goto(DASHBOARD);
      await p.waitForSelector('#conn.pill-on');
      await p.waitForSelector('#sessions-table tbody tr');
      await p.selectOption('#target', 'udp:9100');
      await sleep(5000);
    },
  },
  {
    name: 'dashboard-swarm-nightmare',
    run: async (p) => {
      await p.goto(DASHBOARD);
      await p.waitForSelector('#conn.pill-on');
      await p.selectOption('#target', 'udp:9100');
      await p.click('#presets button:text-is("Nightmare")');
      await sleep(SETTLE_MS / 2);
    },
    // Back to Baseline, so the next viewport's screens start clean
    after: async (p) => { await p.click('#presets button.reset'); await sleep(300); },
  },
  // ── Phase 7: the game edition (npm run build + the game server, docs/PHASE7_PLAN.md) ──
  { name: 'game-landing', url: GAME_URL, run: async () => { await sleep(800); } },
  {
    name: 'game-quick-match',
    url: GAME_URL,
    run: async (p) => { await p.click('#quick-match-btn'); await p.waitForSelector('#game-canvas canvas'); await sleep(5000); },
  },
  { name: 'game-room-host', url: GAME_URL, run: gameRoom },
  {
    name: 'game-room-options',
    url: GAME_URL,
    run: async (p) => {
      await gameRoom(p);
      for (const sel of ['#lobby-map button:text-is("WAREHOUSE")', '#lobby-bots', '#lobby-always-weapon button:text-is("SPREAD SHOT")', '#lobby-always-shield', '#lobby-powerup-every button:text-is("3 s")']) {
        await p.click(sel);
        await sleep(350);
      }
      await sleep(1000);
    },
  },
  {
    name: 'game-room-guest',
    url: GAME_URL,
    run: async (p) => {
      const host = await p.context().newPage();
      await host.goto(GAME_URL);
      await host.waitForSelector('#landing-screen');
      const code = await gameRoom(host);
      await p.fill('#room-code-input', code);
      await p.click('#join-room-btn');
      await p.waitForSelector('#hud-room-players');
      await sleep(1500);
    },
  },
  { name: 'game-match', url: GAME_URL, run: gameMatch },
  { name: 'game-settings', url: GAME_URL, run: async (p) => { await gameMatch(p); await p.keyboard.press('Escape'); await sleep(500); } },
  { name: 'game-controls', url: GAME_URL, run: async (p) => { await gameMatch(p); await p.keyboard.press('F1'); await sleep(500); } },
  { name: 'game-quality-low', url: GAME_URL, settings: { graphicsQuality: 'low' }, run: gameMatch },
  {
    name: 'game-room-not-found',
    url: GAME_URL,
    run: async (p) => { await p.fill('#room-code-input', 'jolly zebra'); await p.click('#join-room-btn'); await p.waitForSelector('#hud-error-text'); await sleep(500); },
  },
  // ── Touch UI (owner revision of Phase 7): phones, both editions ──
  { name: 'touch-game-landing-portrait', url: GAME_URL, device: PHONE_PORTRAIT, run: async () => { await sleep(800); } },
  { name: 'touch-game-match-landscape', url: GAME_URL, device: PHONE_LANDSCAPE, run: touchMatch },
  { name: 'touch-game-match-portrait', url: GAME_URL, device: PHONE_PORTRAIT, run: touchMatch },
  {
    name: 'touch-game-lobby-portrait',
    url: GAME_URL,
    device: PHONE_PORTRAIT,
    run: async (p) => { await p.tap('#create-room-btn'); await p.waitForSelector('#hud-room-code'); await sleep(1500); },
  },
  {
    name: 'touch-game-menu-landscape',
    url: GAME_URL,
    device: PHONE_LANDSCAPE,
    run: async (p) => { await touchMatch(p); await p.tap('#touch-menu'); await sleep(500); },
  },
  {
    name: 'touch-demo-quick-landscape',
    device: PHONE_LANDSCAPE,
    run: async (p) => { await p.tap('#quick-match-btn'); await p.waitForSelector('#game-canvas canvas'); await sleep(3500); },
  },
  {
    name: 'touch-demo-lab-landscape',
    device: PHONE_LANDSCAPE,
    run: async (p) => {
      await p.tap('#quick-match-btn');
      await p.waitForSelector('#touch-menu');
      await sleep(2500);
      await p.tap('#touch-menu');
      await sleep(300);
      await p.tap('#touch-menu-lab');
      await sleep(800);
    },
  },
];

/**
 * Every screen starts from a clean emulator: the emulator outlives the pages,
 * so a preset from one screen (Nightmare, a Compare network) used to carry
 * over into the next ones. Node sends no Origin, so the control API accepts it.
 */
function resetEmulator() {
  const { WebSocket } = require('ws');
  return new Promise((res) => {
    const ws = new WebSocket('ws://127.0.0.1:9001');
    const done = () => { try { ws.close(); } catch { /* closed */ } res(); };
    ws.on('open', () => { ws.send(JSON.stringify({ cmd: 'reset', target: 'all' })); setTimeout(done, 150); });
    ws.on('error', done);
  });
}

/** Frames per second over `ms` (requestAnimationFrame count). */
function measureFps(page, ms) {
  return page.evaluate((ms) => new Promise((res) => {
    let n = 0;
    const t0 = performance.now();
    const f = () => {
      n++;
      if (performance.now() - t0 < ms) requestAnimationFrame(f);
      else res(Math.round((n * 1000) / (performance.now() - t0)));
    };
    requestAnimationFrame(f);
  }), ms);
}

/** Layout facts the checklist cares about. */
function layoutFacts(page) {
  return page.evaluate(() => {
    const lab = document.querySelector('.lab-panel:not(.collapsed) .lab-panel-inner');
    const doc = document.scrollingElement ?? document.documentElement;
    return {
      labScrolls: lab ? lab.scrollHeight > lab.clientHeight + 1 : null,
      pageOverflowX: doc.scrollWidth > window.innerWidth + 1,
      pageOverflowY: doc.scrollHeight > window.innerHeight + 1,
    };
  });
}

// ── Main ────────────────────────────────────────────────────────
let chromium;
try {
  ({ chromium } = require('playwright-core'));
} catch {
  console.error('✘ playwright-core is missing: run `npm install` in NoBu-Shooter (it is a devDependency).');
  process.exit(1);
}

await assertPortsFree([5173, 8080, GAME_PORT, 9000, 9001]);
await assertUdpPortsFree([8081, 9100]);
console.log(`[shots] starting the demo with 2 network players${FAST ? ' (--fast)' : ''}...`);
const demoLog = [];
/** Set once the run is over, so the demo stopping then is expected. */
let finished = false;
// The game edition first (its assets step must not race the demo's): `npm run build`
const built = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: rootDir, stdio: 'inherit' });
if (built.status !== 0) {
  console.error('✘ npm run build failed');
  process.exit(1);
}
const demo = spawnNode('DEMO', ['scripts/demo.mjs', '--swarm', '2'], { cwd: rootDir, onLine: (l) => { demoLog.push(l); if (demoLog.length > 200) demoLog.shift(); } });
// …served like `npm start`
const gameServer = spawnTs('GAME', 'server/src/main.ts', ['--game', '--static', 'dist/game', '--port', String(GAME_PORT), '--host', '127.0.0.1'], { cwd: rootDir, onLine: () => {} });
const cleanup = cleanupOnExit([demo, gameServer]);
demo.on('exit', (code) => {
  if (!finished) { console.error(`[shots] the demo exited early (code ${code})\n${demoLog.slice(-20).join('\n')}`); process.exit(1); }
});

const up = (await Promise.all([
  ...[5173, 8080, GAME_PORT, 9000, 9001].map((p) => waitForPort(p, 30000)),
  ...[8081, 9100].map((p) => waitForUdpPort(p, 30000)),
])).every(Boolean);
if (!up) {
  console.error('[shots] the demo did not start in time');
  cleanup();
  process.exit(1);
}

let browser;
try {
  browser = await chromium.launch(process.env.NOBU_CHROME
    ? { executablePath: process.env.NOBU_CHROME, headless: true }
    : { channel: 'chrome', headless: true });
} catch (e) {
  console.error('✘ Could not start Google Chrome. Install Chrome, or set NOBU_CHROME to a Chrome/Edge executable.');
  console.error(String(e?.message ?? e).split('\n')[0]);
  finished = true;
  cleanup();
  process.exit(1);
}

const screens = SCREENS.filter((s) => ONLY.length === 0 || ONLY.some((o) => s.name.includes(o)));
const index = { createdAt: new Date().toISOString(), fast: FAST, viewports: {}, failures: 0 };
let failures = 0;

try {
  for (const [w, h] of VIEWPORTS) {
    const dir = join(OUT, `${w}x${h}`);
    if (ONLY.length === 0) rmSync(dir, { recursive: true, force: true }); // a partial run keeps the other shots
    mkdirSync(dir, { recursive: true });
    const rows = [];
    for (const screen of screens) {
      // Touch screens use their phone, so they are taken in the first viewport's run only
      if (screen.device && w !== VIEWPORTS[0][0]) continue;
      // Numbered by the full list, so a partial run (--only) overwrites the same files
      const file = `${String(SCREENS.indexOf(screen) + 1).padStart(2, '0')}-${screen.name}.png`;
      const context = await browser.newContext(screen.device ?? { viewport: { width: w, height: h } });
      const page = await context.newPage();
      const errors = [];
      const notes = [];
      let warnings = 0;
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
        else if (m.type() === 'warning') warnings++;
        else if (m.text().startsWith('[arena]')) notes.push(m.text()); // arena notices
      });
      const row = { name: screen.name, file, fps: null, errors, notes, warnings: 0, ok: true };
      try {
        await resetEmulator();
        await page.goto(screen.url ?? URL);
        await page.waitForSelector('#landing-screen');
        if (screen.settings) {
          await page.evaluate((s) => localStorage.setItem('nobu_shooter_settings', JSON.stringify(s)), screen.settings);
          await page.reload();
          await page.waitForSelector('#landing-screen');
        }
        await screen.run(page);
        row.fps = await measureFps(page, FAST ? 1000 : 2000);
        Object.assign(row, await layoutFacts(page));
        await page.screenshot({ path: join(dir, file) });
        if (screen.after) await screen.after(page);
      } catch (e) {
        row.ok = false;
        errors.push(`screen failed: ${String(e?.message ?? e).split('\n')[0]}`);
      }
      row.warnings = warnings;
      if (!row.ok || errors.length) failures++;
      rows.push(row);
      const flags = [
        row.labScrolls ? 'LAB SCROLLS' : '', row.pageOverflowX ? 'OVERFLOW-X' : '', row.pageOverflowY ? 'OVERFLOW-Y' : '',
      ].filter(Boolean).join(' ');
      console.log(`[shots] ${w}x${h} ${file.padEnd(36)} ${String(row.fps ?? '–').padStart(3)} fps  ${errors.length ? `✘ ${errors.length} error(s): ${errors[0]}` : '✔'} ${flags}`);
      await context.close();
    }
    index.viewports[`${w}x${h}`] = rows;
    if (ONLY.length === 0) writeFileSync(join(dir, 'index.json'), JSON.stringify(rows, null, 2));
  }
} finally {
  index.failures = failures;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 2));
  await browser.close().catch(() => {});
  finished = true;
  cleanup();
}

console.log(`\n[shots] ${failures === 0 ? '✔ all screens captured, 0 console errors' : `✘ ${failures} screen(s) with errors`} → ${OUT}`);
console.log('[shots] review them against docs/VISUAL_CHECKLIST.md');
process.exit(failures === 0 ? 0 : 1);
