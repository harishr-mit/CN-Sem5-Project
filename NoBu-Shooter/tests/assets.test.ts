/**
 * Asset tiers (docs/PHASE7_PLAN.md D11–D13, tests 7–8): `npm run assets`
 * output, size budgets, the re-packed atlases and the client's tier mapping.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'child_process';
import { existsSync, readFileSync, statSync, readdirSync } from 'fs';
import { join, relative, sep } from 'path';
import CFG from '../client/src/game/assetTiers.json';
import { tierUrl, tierScale, servedName, isTier, TIERS } from '../client/src/game/tiers';

const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'assets');
const OUT = join(ROOT, 'assets-build');

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
}
const rel = (base: string, p: string) => relative(base, p).split(sep).join('/');

interface AtlasJson {
  frames: Record<string, { frame: { x: number; y: number; w: number; h: number }; pivot?: { x: number; y: number } }>;
  meta: { size: { w: number; h: number }; tierScale?: number; image: string };
}

describe('npm run assets (build-assets.mjs)', () => {
  beforeAll(() => {
    const r = spawnSync(process.execPath, ['scripts/build-assets.mjs'], { cwd: ROOT, encoding: 'utf8' });
    expect(r.status, r.stderr || r.stdout).toBe(0);
  }, 120_000);

  const masters = walk(SRC).map((p) => rel(SRC, p))
    .filter((r) => !(CFG.notServed as string[]).includes(r))
    .filter((r) => r !== 'packed/player.json');

  it('writes every master into every tier, as WebP / OGG', () => {
    for (const tier of TIERS) {
      for (const m of masters) {
        const out = join(OUT, tier, servedName(m));
        expect(existsSync(out), `${tier}/${servedName(m)}`).toBe(true);
      }
      expect(existsSync(join(OUT, tier, 'packed/player.json'))).toBe(true);
      const served = walk(join(OUT, tier)).map((p) => rel(join(OUT, tier), p));
      expect(served.filter((f) => /\.(png|wav|mp3)$/.test(f))).toEqual([]);
      expect(served.some((f) => f.endsWith('.md'))).toBe(false);
    }
    expect(walk(OUT).some((p) => rel(OUT, p).startsWith('.'))).toBe(false); // no build state served
    {
    }
  });

  it('keeps every served file within its budget (stone_beige ≤ 160 kB)', () => {
    const budgets = CFG.budgets as Record<string, number>;
    for (const p of walk(OUT)) {
      const r = rel(OUT, p);
      if (r === 'manifest.json') continue;
      expect(statSync(p).size, r).toBeLessThanOrEqual(budgets[r] ?? CFG.budgetBytes);
    }
    expect(statSync(join(OUT, 'high/textures/floors/stone_beige.webp')).size).toBeLessThanOrEqual(160 * 1024);
  });

  it('serves the sounds as OGG in every tier, smaller or equal going down', () => {
    const sounds = masters.filter((m) => m.startsWith('sfx/'));
    expect(sounds.length).toBeGreaterThan(5);
    for (const s of sounds) {
      const size = (t: string) => statSync(join(OUT, t, servedName(s))).size;
      expect(servedName(s).endsWith('.ogg')).toBe(true);
      expect(size('low')).toBeLessThanOrEqual(size('high'));
    }
  });

  it('re-packs the player atlas per tier: frames scaled, inside the image, not overlapping', () => {
    const master = JSON.parse(readFileSync(join(SRC, 'packed/player.json'), 'utf8')) as AtlasJson;
    for (const tier of TIERS) {
      const atlas = JSON.parse(readFileSync(join(OUT, tier, 'packed/player.json'), 'utf8')) as AtlasJson;
      const s = CFG.scales[tier];
      expect(atlas.meta.tierScale).toBe(s);
      expect(atlas.meta.image).toBe('player.webp');
      expect(Object.keys(atlas.frames).sort()).toEqual(Object.keys(master.frames).sort());
      const rects = Object.entries(atlas.frames).map(([name, f]) => {
        const m = master.frames[name];
        expect(f.frame.w, name).toBe(Math.max(1, Math.round(m.frame.w * s)));
        expect(f.frame.h, name).toBe(Math.max(1, Math.round(m.frame.h * s)));
        expect(f.pivot).toEqual(m.pivot);
        expect(f.frame.x + f.frame.w).toBeLessThanOrEqual(atlas.meta.size.w);
        expect(f.frame.y + f.frame.h).toBeLessThanOrEqual(atlas.meta.size.h);
        return f.frame;
      });
      if (s === 1) continue; // the high tier keeps the master layout
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i], b = rects[j];
          const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
          expect(apart).toBe(true);
        }
      }
    }
  });

  it('writes a manifest with each tier smaller than the one above', () => {
    const m = JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8'));
    expect(m.tiers.low.totalBytes).toBeLessThan(m.tiers.medium.totalBytes);
    expect(m.tiers.medium.totalBytes).toBeLessThan(m.tiers.high.totalBytes);
  });

  it('does not serve the raw player frames (D12)', () => {
    expect(existsSync(join(SRC, 'sprites/player'))).toBe(false);
    expect(existsSync(join(ROOT, 'assets-src/player/body'))).toBe(true);
    for (const tier of TIERS) expect(existsSync(join(OUT, tier, 'sprites/player'))).toBe(false);
  });
});

describe('tier mapping (client/src/game/tiers.ts)', () => {
  it('maps masters to served URLs', () => {
    expect(tierUrl('high', 'fx/bullet.png')).toBe('high/fx/bullet.webp');
    expect(tierUrl('low', 'sfx/hit.wav')).toBe('low/sfx/hit.ogg');
    expect(tierUrl('medium', 'sfx/dry_fire.mp3')).toBe('medium/sfx/dry_fire.ogg');
    expect(tierUrl('low', 'packed/player.png')).toBe('low/packed/player.webp');
    expect(servedName('a/b.json')).toBe('a/b.json');
  });

  it('scales only the listed images', () => {
    expect(tierScale('low', 'packed/player.png')).toBe(0.25);
    expect(tierScale('medium', 'packed/player.png')).toBe(0.5);
    expect(tierScale('high', 'packed/player.png')).toBe(1);
    expect(tierScale('low', 'fx/bullet.png')).toBe(1);
    expect(tierScale('low', 'sprites/pickups/dash.png')).toBe(1);
  });

  it('validates tier names', () => {
    expect(TIERS.every(isTier)).toBe(true);
    expect(isTier('ultra')).toBe(false);
    expect(isTier(undefined)).toBe(false);
  });
});
