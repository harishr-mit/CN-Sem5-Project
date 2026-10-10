/**
 * pack-assets.mjs — packs the survivor animation frames into one atlas.
 *
 *   npm run pack-assets [-- --preview <file.png>]
 *
 * Input:  assets/sprites/player/{body/<weapon>/<anim>,feet/<anim>}/NN.png
 *         (Top-Down Survivor, ~255 × 215 px per frame, 245 frames)
 * Output: assets/packed/player.png + player.json (Phaser JSON-hash atlas)
 *
 * Every frame is cropped to its opaque pixels and downscaled by STORE_SCALE
 * (area averaging, premultiplied alpha). Each frame carries a `pivot` = the
 * character's rotation centre (shoulders), so a Phaser animation can switch
 * between frames of different sizes without the body jumping. One small
 * atlas instead of 245 textures keeps Compare (one Phaser game per pane)
 * cheap on GPU memory. Re-run after changing the source frames; the output
 * is committed so a fresh clone needs nothing but npm install.
 *
 * --preview writes a contact sheet (first frame of every animation, pivot
 * marked with a red cross) for checking the pivots by eye.
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PNG } from 'pngjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'assets', 'sprites', 'player');
const OUT = join(root, 'assets', 'packed');
/** Stored size relative to the source frames (the client draws them at ~0.26). */
const STORE_SCALE = 0.4;
const ATLAS_W = 2048;
const PAD = 2;

// ── PNG helpers ───────────────────────────────────────────────
function readPng(file) {
  return PNG.sync.read(readFileSync(file));
}

/** Opaque bounding box (alpha > 8), or null for an empty frame. */
function opaqueBox(img) {
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * Body pivot: the column where the silhouette is tallest (the shoulder line,
 * smoothed over ±6 px), at the middle of that column's opaque run. The gun
 * and arms are thin, so they never win. Feet pivot: bounding-box centre.
 */
function bodyPivot(img) {
  const counts = new Array(img.width).fill(0);
  for (let x = 0; x < img.width; x++) {
    for (let y = 0; y < img.height; y++) if (img.data[(y * img.width + x) * 4 + 3] > 128) counts[x]++;
  }
  let best = 0, bestX = 0;
  for (let x = 0; x < img.width; x++) {
    let s = 0;
    for (let k = -6; k <= 6; k++) s += counts[x + k] ?? 0;
    if (s > best) { best = s; bestX = x; }
  }
  let top = -1, bottom = -1;
  for (let y = 0; y < img.height; y++) {
    if (img.data[(y * img.width + bestX) * 4 + 3] > 128) { if (top < 0) top = y; bottom = y; }
  }
  return { x: bestX, y: (top + bottom) / 2 };
}

function feetPivot(img) {
  const b = opaqueBox(img);
  return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : { x: img.width / 2, y: img.height / 2 };
}

/** Area-averaging downscale of a source rectangle (premultiplied alpha). */
function downscale(img, box, scale) {
  const w = Math.max(1, Math.round(box.w * scale));
  const h = Math.max(1, Math.round(box.h * scale));
  const out = new PNG({ width: w, height: h });
  const sx = box.w / w, sy = box.h / h;
  for (let oy = 0; oy < h; oy++) {
    const fy0 = box.y + oy * sy, fy1 = fy0 + sy;
    for (let ox = 0; ox < w; ox++) {
      const fx0 = box.x + ox * sx, fx1 = fx0 + sx;
      let r = 0, g = 0, b = 0, a = 0, area = 0;
      for (let y = Math.floor(fy0); y < Math.ceil(fy1); y++) {
        const wy = Math.min(fy1, y + 1) - Math.max(fy0, y);
        for (let x = Math.floor(fx0); x < Math.ceil(fx1); x++) {
          const wx = Math.min(fx1, x + 1) - Math.max(fx0, x);
          const wgt = wx * wy;
          const i = (y * img.width + x) * 4;
          const al = img.data[i + 3] / 255;
          r += img.data[i] * al * wgt; g += img.data[i + 1] * al * wgt; b += img.data[i + 2] * al * wgt;
          a += al * wgt; area += wgt;
        }
      }
      const o = (oy * w + ox) * 4;
      out.data[o] = a > 0 ? Math.round(r / a) : 0;
      out.data[o + 1] = a > 0 ? Math.round(g / a) : 0;
      out.data[o + 2] = a > 0 ? Math.round(b / a) : 0;
      out.data[o + 3] = Math.round((a / area) * 255);
    }
  }
  return out;
}

// ── Collect animations ────────────────────────────────────────
const anims = []; // { key, files, kind }
for (const weapon of readdirSync(join(SRC, 'body')).sort()) {
  for (const anim of readdirSync(join(SRC, 'body', weapon)).sort()) {
    const dir = join(SRC, 'body', weapon, anim);
    anims.push({ key: `body_${weapon}_${anim}`, kind: 'body', files: readdirSync(dir).filter((f) => f.endsWith('.png')).sort().map((f) => join(dir, f)) });
  }
}
for (const anim of readdirSync(join(SRC, 'feet')).sort()) {
  const dir = join(SRC, 'feet', anim);
  anims.push({ key: `feet_${anim}`, kind: 'feet', files: readdirSync(dir).filter((f) => f.endsWith('.png')).sort().map((f) => join(dir, f)) });
}

// ── Downscale every frame (pivot from the animation's first frame) ──
const frames = []; // { name, png, pivotX, pivotY (px in the scaled crop) }
const firsts = [];
for (const a of anims) {
  const first = readPng(a.files[0]);
  const pivot = a.kind === 'body' ? bodyPivot(first) : feetPivot(first);
  a.files.forEach((file, i) => {
    const img = i === 0 ? first : readPng(file);
    const box = opaqueBox(img) ?? { x: 0, y: 0, w: img.width, h: img.height };
    const png = downscale(img, box, STORE_SCALE);
    const sxScale = png.width / box.w, syScale = png.height / box.h;
    const f = {
      name: `${a.key}_${String(i).padStart(2, '0')}`,
      png,
      pivotX: (pivot.x - box.x) * sxScale,
      pivotY: (pivot.y - box.y) * syScale,
    };
    frames.push(f);
    if (i === 0) firsts.push({ ...f, label: a.key });
  });
}

// ── Shelf packing (tallest first) ─────────────────────────────
const order = [...frames].sort((p, q) => q.png.height - p.png.height);
let x = PAD, y = PAD, shelfH = 0;
for (const f of order) {
  if (x + f.png.width + PAD > ATLAS_W) { x = PAD; y += shelfH + PAD; shelfH = 0; }
  f.x = x; f.y = y;
  x += f.png.width + PAD;
  shelfH = Math.max(shelfH, f.png.height);
}
let atlasH = 1;
while (atlasH < y + shelfH + PAD) atlasH *= 2;

const atlas = new PNG({ width: ATLAS_W, height: atlasH });
atlas.data.fill(0);
for (const f of frames) PNG.bitblt(f.png, atlas, 0, 0, f.png.width, f.png.height, f.x, f.y);

const json = { frames: {}, meta: { app: 'scripts/pack-assets.mjs', image: 'player.png', size: { w: ATLAS_W, h: atlasH }, scale: String(STORE_SCALE), storeScale: STORE_SCALE } };
for (const f of frames) {
  const w = f.png.width, h = f.png.height;
  json.frames[f.name] = {
    frame: { x: f.x, y: f.y, w, h },
    rotated: false,
    trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w, h },
    sourceSize: { w, h },
    pivot: { x: +(f.pivotX / w).toFixed(4), y: +(f.pivotY / h).toFixed(4) },
  };
}

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'player.png'), PNG.sync.write(atlas));
writeFileSync(join(OUT, 'player.json'), JSON.stringify(json, null, 1));
console.log(`[pack-assets] ${frames.length} frames from ${anims.length} animations -> assets/packed/player.png (${ATLAS_W}x${atlasH}) + player.json`);

// ── Optional preview: first frame of each animation, pivot marked ──
const previewIdx = process.argv.indexOf('--preview');
if (previewIdx > 0 && process.argv[previewIdx + 1]) {
  const cell = 140;
  const cols = 8;
  const rows = Math.ceil(firsts.length / cols);
  const sheet = new PNG({ width: cols * cell, height: rows * cell });
  for (let i = 0; i < sheet.data.length; i += 4) { sheet.data[i] = 40; sheet.data[i + 1] = 44; sheet.data[i + 2] = 52; sheet.data[i + 3] = 255; }
  firsts.forEach((f, i) => {
    const cx = (i % cols) * cell + cell / 2, cy = Math.floor(i / cols) * cell + cell / 2;
    const ox = Math.round(cx - f.pivotX), oy = Math.round(cy - f.pivotY);
    for (let yy = 0; yy < f.png.height; yy++) {
      for (let xx = 0; xx < f.png.width; xx++) {
        const tx = ox + xx, ty = oy + yy;
        if (tx < 0 || ty < 0 || tx >= sheet.width || ty >= sheet.height) continue;
        const s = (yy * f.png.width + xx) * 4, d = (ty * sheet.width + tx) * 4;
        const al = f.png.data[s + 3] / 255;
        for (let c = 0; c < 3; c++) sheet.data[d + c] = Math.round(f.png.data[s + c] * al + sheet.data[d + c] * (1 - al));
      }
    }
    for (let k = -8; k <= 8; k++) {
      for (const [px, py] of [[cx + k, cy], [cx, cy + k]]) {
        const d = (py * sheet.width + px) * 4;
        sheet.data[d] = 255; sheet.data[d + 1] = 30; sheet.data[d + 2] = 30;
      }
    }
  });
  writeFileSync(process.argv[previewIdx + 1], PNG.sync.write(sheet));
  console.log(`[pack-assets] preview -> ${process.argv[previewIdx + 1]}`);
}
