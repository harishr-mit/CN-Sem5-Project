/**
 * build-assets.mjs — generates what every edition serves from the masters in
 * NoBu-Shooter/assets (docs/PHASE7_PLAN.md D11).
 *
 *   npm run assets [-- --force]
 *
 * Output: NoBu-Shooter/assets-build/{low,medium,high}/… (git-ignored, Vite's
 * publicDir) + assets-build/manifest.json. Images become WebP, sounds OGG
 * Vorbis; the files in client/src/game/assetTiers.json `scaled` are stored at
 * the tier's scale (the player atlas is re-packed frame by frame, so frames
 * never bleed into each other). A file is rebuilt only when its master or this
 * script changed (`--force` rebuilds everything). Fails when a generated file
 * breaks its size budget.
 */

import { fileURLToPath } from 'url';
import { dirname, join, relative, extname, sep } from 'path';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, readdirSync, rmSync, copyFileSync } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createHash } from 'crypto';

const run = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'assets');
const OUT = join(root, 'assets-build');
const CFG = JSON.parse(readFileSync(join(root, 'client', 'src', 'game', 'assetTiers.json'), 'utf8'));
const FORCE = process.argv.includes('--force');
const IMAGE = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const AUDIO = new Set(['.wav', '.mp3', '.ogg', '.flac']);
const ATLAS_PAD = 2;

/** Bump the version (with the config) whenever the output format changes. */
const VERSION = createHash('sha1')
  .update(readFileSync(fileURLToPath(import.meta.url)))
  .update(JSON.stringify(CFG))
  .digest('hex').slice(0, 12);

const posix = (p) => p.split(sep).join('/');

/** Served name of a master: images → .webp, sounds → .ogg, others unchanged. */
function outName(rel) {
  const ext = extname(rel).toLowerCase();
  if (IMAGE.has(ext)) return rel.slice(0, -ext.length) + '.webp';
  if (AUDIO.has(ext)) return rel.slice(0, -ext.length) + '.ogg';
  return rel;
}

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

async function loadSharp() {
  try {
    return (await import('sharp')).default;
  } catch (err) {
    throw new Error(`sharp is not installed (${err.message}). Run "npm install" in NoBu-Shooter.`);
  }
}

async function ffmpegPath() {
  let p;
  try {
    p = (await import('ffmpeg-static')).default;
  } catch {
    p = null;
  }
  if (!p || !existsSync(p)) {
    throw new Error('ffmpeg-static has no binary. Run "npm rebuild ffmpeg-static" (or "npm approve-scripts ffmpeg-static" and reinstall) in NoBu-Shooter.');
  }
  return p;
}

// ── Images ─────────────────────────────────────────────────────

function webpOptions(rel) {
  return CFG.lossy.includes(rel)
    ? { quality: CFG.webpQuality, alphaQuality: 90, effort: 6 }
    : { lossless: true, effort: 6 };
}

async function buildImage(sharp, rel, tier, dest) {
  const scale = CFG.scaled.includes(rel) ? CFG.scales[tier] : 1;
  let img = sharp(join(SRC, rel));
  if (scale !== 1) {
    const meta = await sharp(join(SRC, rel)).metadata();
    img = img.resize(Math.max(1, Math.round(meta.width * scale)), Math.max(1, Math.round(meta.height * scale)), { kernel: 'lanczos3' });
  }
  await img.webp(webpOptions(rel)).toFile(dest);
}

/**
 * The player atlas at `scale`: every frame cut from the master, resized on its
 * own and shelf-packed with fresh padding; the JSON frames follow. Pivots are
 * fractions of the frame, so they carry over unchanged.
 */
async function buildAtlas(sharp, rel, tier, dest) {
  const scale = CFG.scales[tier];
  const jsonRel = rel.replace(/\.png$/, '.json');
  const json = JSON.parse(readFileSync(join(SRC, jsonRel), 'utf8'));
  const destJson = dest.replace(/\.webp$/, '.json');
  const imageName = posix(outName(rel)).split('/').pop();

  if (scale === 1) {
    await sharp(join(SRC, rel)).webp(webpOptions(rel)).toFile(dest);
    json.meta = { ...json.meta, image: imageName, tierScale: 1 };
    writeFileSync(destJson, JSON.stringify(json));
    return;
  }

  const master = sharp(join(SRC, rel));
  const names = Object.keys(json.frames);
  const pieces = [];
  for (const name of names) {
    const f = json.frames[name].frame;
    const w = Math.max(1, Math.round(f.w * scale));
    const h = Math.max(1, Math.round(f.h * scale));
    const buf = await master.clone()
      .extract({ left: f.x, top: f.y, width: f.w, height: f.h })
      .resize(w, h, { kernel: 'lanczos3' })
      .png()
      .toBuffer();
    pieces.push({ name, w, h, buf });
  }
  // Shelf packing, tallest first, into the master width at this scale
  const width = Math.max(64, Math.round(json.meta.size.w * scale));
  const order = [...pieces].sort((a, b) => b.h - a.h || a.name.localeCompare(b.name));
  let x = ATLAS_PAD, y = ATLAS_PAD, rowH = 0;
  for (const p of order) {
    if (x + p.w + ATLAS_PAD > width) { x = ATLAS_PAD; y += rowH + ATLAS_PAD; rowH = 0; }
    p.x = x; p.y = y;
    x += p.w + ATLAS_PAD;
    rowH = Math.max(rowH, p.h);
  }
  const height = y + rowH + ATLAS_PAD;
  await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(order.map((p) => ({ input: p.buf, left: p.x, top: p.y })))
    .webp(webpOptions(rel))
    .toFile(dest);

  const frames = {};
  for (const p of pieces) {
    const src = json.frames[p.name];
    frames[p.name] = {
      ...src,
      frame: { x: p.x, y: p.y, w: p.w, h: p.h },
      spriteSourceSize: { x: 0, y: 0, w: p.w, h: p.h },
      sourceSize: { w: p.w, h: p.h },
    };
  }
  writeFileSync(destJson, JSON.stringify({ frames, meta: { ...json.meta, image: imageName, size: { w: width, h: height }, tierScale: scale } }));
}

// ── Sounds ─────────────────────────────────────────────────────

async function buildSound(ffmpeg, rel, tier, dest) {
  const a = CFG.audio[tier];
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', join(SRC, rel), '-map_metadata', '-1', '-vn'];
  if (a.mono) args.push('-ac', '1');
  if (a.rate) args.push('-ar', String(a.rate));
  args.push('-c:a', 'libvorbis', '-q:a', String(a.q), dest);
  await run(ffmpeg, args);
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now();
  const masters = walk(SRC)
    .map((p) => posix(relative(SRC, p)))
    .filter((rel) => !CFG.notServed.includes(rel))
    // The atlas JSON is written together with its image
    .filter((rel) => !(rel.endsWith('.json') && existsSync(join(SRC, rel.replace(/\.json$/, '.png')))));

  // Build state lives outside the served folder (it must not end up in a build)
  const stampPath = join(root, 'node_modules', '.cache', 'nobu-assets-stamp.json');
  const stamp = !FORCE && existsSync(stampPath) ? JSON.parse(readFileSync(stampPath, 'utf8')) : {};
  const nextStamp = {};
  const expected = new Set(['manifest.json']);
  let sharp = null, ffmpeg = null, built = 0;

  for (const rel of masters) {
    const st = statSync(join(SRC, rel));
    const ext = extname(rel).toLowerCase();
    const isAtlas = rel === 'packed/player.png';
    const jsonSt = isAtlas ? statSync(join(SRC, 'packed/player.json')) : null;
    const key = `${VERSION}:${st.size}:${Math.round(st.mtimeMs)}${jsonSt ? `:${jsonSt.size}:${Math.round(jsonSt.mtimeMs)}` : ''}`;
    for (const tier of CFG.tiers) {
      const outRel = `${tier}/${outName(rel)}`;
      const dest = join(OUT, outRel);
      expected.add(outRel);
      if (isAtlas) expected.add(outRel.replace(/\.webp$/, '.json'));
      const id = `${tier}/${rel}`;
      nextStamp[id] = key;
      const outputs = isAtlas ? [dest, dest.replace(/\.webp$/, '.json')] : [dest];
      if (stamp[id] === key && outputs.every(existsSync)) continue;
      mkdirSync(dirname(dest), { recursive: true });
      if (IMAGE.has(ext)) {
        sharp ??= await loadSharp();
        if (isAtlas) await buildAtlas(sharp, rel, tier, dest);
        else await buildImage(sharp, rel, tier, dest);
      } else if (AUDIO.has(ext)) {
        ffmpeg ??= await ffmpegPath();
        await buildSound(ffmpeg, rel, tier, dest);
      } else {
        copyFileSync(join(SRC, rel), dest);
      }
      built++;
    }
  }

  // Remove generated files whose master is gone
  if (existsSync(OUT)) {
    for (const p of walk(OUT)) {
      const rel = posix(relative(OUT, p));
      if (!expected.has(rel)) rmSync(p);
    }
  }

  // Manifest + budgets
  const manifest = { version: VERSION, tiers: {} };
  const over = [];
  for (const tier of CFG.tiers) {
    const files = {};
    let total = 0;
    for (const rel of [...expected].filter((r) => r.startsWith(`${tier}/`)).sort()) {
      const size = statSync(join(OUT, rel)).size;
      files[rel.slice(tier.length + 1)] = size;
      total += size;
      const budget = CFG.budgets[rel] ?? CFG.budgetBytes;
      if (size > budget) over.push(`${rel} is ${(size / 1024).toFixed(0)} kB (budget ${(budget / 1024).toFixed(0)} kB)`);
    }
    manifest.tiers[tier] = { scale: CFG.scales[tier], totalBytes: total, files };
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
  mkdirSync(dirname(stampPath), { recursive: true });
  writeFileSync(stampPath, JSON.stringify(nextStamp));

  const kb = (n) => `${(n / 1024).toFixed(0)} kB`;
  console.log(`[assets] ${built} file(s) built, ${masters.length * CFG.tiers.length - built} up to date (${Date.now() - t0} ms) → assets-build/`);
  console.log(`[assets] ${CFG.tiers.map((t) => `${t} ${kb(manifest.tiers[t].totalBytes)}`).join(' · ')}`);
  if (over.length) {
    console.error(`[assets] Over budget:\n  ${over.join('\n  ')}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`[assets] ${err.message}`);
  process.exit(1);
});
