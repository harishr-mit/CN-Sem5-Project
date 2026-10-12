/**
 * build.mjs — `npm run build`: the game edition's production bundle
 * (docs/PHASE7_PLAN.md D8, D16) in NoBu-Shooter/dist/game, which `npm start`
 * serves.
 *   1. `npm run assets` (art and sound tiers)
 *   2. `vite build` with client/vite.play.config.ts
 *   3. Bundle guard: the game's JS must contain none of the demo's markers
 *      (Network Lab, Presenter, emulator, Compare) — fails the build if it does
 *   4. Size report: what a player downloads (JS / CSS compressed as served)
 */

import { fileURLToPath } from 'url';
import { dirname, resolve, join, extname } from 'path';
import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { brotliCompressSync, gzipSync } from 'zlib';
import { build } from 'vite';
import { buildAssets } from './lib/procs.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(rootDir, 'dist', 'game');

/** Strings that exist only in demo modules (UI text survives minification). */
export const DEMO_MARKERS = ['NETWORK LAB', 'PRESENTER', 'NUDGE ME', 'INSPECT PACKETS', 'EMULATOR DASHBOARD', 'Snapshot vs Lockstep', 'REFERENCE'];

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const kb = (n) => `${(n / 1024).toFixed(0)} kB`;

buildAssets(rootDir);
await build({ configFile: join(rootDir, 'client', 'vite.play.config.ts'), logLevel: 'warn' });
if (!existsSync(join(OUT, 'index.html'))) {
  console.error('✘ The build wrote no dist/game/index.html');
  process.exit(1);
}

const files = walk(OUT);
const js = files.filter((f) => extname(f) === '.js');
const css = files.filter((f) => extname(f) === '.css');
const found = [];
for (const f of js) {
  const text = readFileSync(f, 'utf8');
  for (const m of DEMO_MARKERS) if (text.includes(m)) found.push(`${m} (${f.slice(OUT.length + 1)})`);
}
if (found.length) {
  console.error(`✘ Demo-only code in the game bundle:\n  ${found.join('\n  ')}`);
  process.exit(1);
}

const sum = (list, f) => list.reduce((n, p) => n + f(p), 0);
const size = (p) => statSync(p).size;
const br = (p) => brotliCompressSync(readFileSync(p)).length;
const gz = (p) => gzipSync(readFileSync(p), { level: 9 }).length;
const fonts = files.filter((f) => extname(f) === '.woff2');
const manifest = JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8'));

console.log('\n✔ Game built → dist/game (no demo code in the bundle)');
console.log(`  JS   ${kb(sum(js, size))} (brotli ${kb(sum(js, br))}, gzip ${kb(sum(js, gz))})`);
console.log(`  CSS  ${kb(sum(css, size))} (brotli ${kb(sum(css, br))})`);
console.log(`  Fonts (woff2, Latin) ${kb(sum(fonts, size))}`);
console.log(`  Art + sound per Graphics Quality tier: ${Object.entries(manifest.tiers).map(([t, v]) => `${t} ${kb(v.totalBytes)}`).join(' · ')}`);
console.log(`  On disk: ${kb(sum(files, size))}`);
console.log('  Serve it with: npm start\n');
