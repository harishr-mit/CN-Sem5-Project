/**
 * assets.ts — texture / animation / sound manifest (PHASES.md Phase 2.5 A0).
 *
 * The masters live in NoBu-Shooter/assets; `npm run assets` generates the
 * served copies into NoBu-Shooter/assets-build/<tier>/ (Vite's publicDir, so
 * they are served from the site root as `<tier>/...`), as WebP and OGG
 * (docs/PHASE7_PLAN.md D11). Every key is optional: a file that fails to load
 * is simply absent, and the scene falls back to its procedural drawing (or to
 * silence) — check with `has(scene, key)`. Inventory and licences:
 * assets/README.md, assets/CREDITS.md.
 *
 * Graphics Quality (D13): a scene loads one tier. Some images are stored
 * smaller in lower tiers (`tiers.ts`); draw code multiplies their scale by
 * `invScale(scene, key)` so everything keeps its size on screen.
 * `loadTier` fetches another tier under temporary keys; `swapTier` (called
 * while the scene restarts, when nothing uses the old textures) puts it in
 * place.
 */

import Phaser from 'phaser';
import GAME, { POWERUP_KINDS, WEAPON_IDS, type MapId } from '@nobu/shared/config/game';
import { tierUrl, tierScale, TIERS, type Tier } from './tiers.js';

/** Survivor body + feet frames, packed by scripts/pack-assets.mjs. */
export const PLAYER_ATLAS = 'player';
/** The master atlas stores frames at this fraction of the source art. */
const ATLAS_STORE_SCALE = 0.4;
/** Source-art pixels → world pixels: the body is ≈ 54 px across (GAMERULES.md §17). */
const ART_TO_WORLD = 0.25;
/** Sprite scale for frames of the master (high-tier) atlas; multiply by `invScale` for others. */
export const PLAYER_SPRITE_SCALE = ART_TO_WORLD / ATLAS_STORE_SCALE;

export const TEX = {
  bullet: 'fx-bullet',
  muzzle: 'fx-muzzle',
  spark: 'fx-spark',
  shield: 'fx-shield',
  drone: 'drone-target',
  pickup: (kind: string) => `pickup-${kind}`,
  floor: (name: string) => `floor-${name}`,
  prop: (name: string) => `prop-${name}`,
} as const;

export const SFX = {
  shootHandgun: 'sfx-shoot-handgun',
  shootRifle: 'sfx-shoot-rifle',
  reload: (weapon: string) => `sfx-reload-${weapon}`,
  dryFire: 'sfx-dry-fire',
  hit: 'sfx-hit',
  death: 'sfx-death',
  pickup: 'sfx-pickup',
} as const;

const PIXEL_ART = new Set<string>([TEX.drone, ...POWERUP_KINDS.map(TEX.pickup)]);
/** Spritesheet frame sizes in the masters. */
const MUZZLE_FRAME = 128;
const SPARK_FRAME = 32;

/** One loadable file: its key, kind and master path (relative to assets/). */
interface Entry {
  key: string;
  kind: 'image' | 'atlas' | 'sheet' | 'audio';
  master: string;
  /** Spritesheets: master frame size. */
  frame?: number;
}

/** Every prop and floor named by any map. */
function mapArt(): { floors: Set<string>; props: Set<string> } {
  const floors = new Set<string>();
  const props = new Set<string>();
  for (const id of GAME.maps.rotation) {
    const m = GAME.maps[id] as { floor: string | null; obstacles: readonly { prop?: string }[] };
    if (m.floor) floors.add(m.floor);
    for (const o of m.obstacles) if (o.prop) props.add(o.prop);
  }
  return { floors, props };
}

export interface PreloadOptions {
  /** The room's art: `lab` (Compare) needs no floors, props or pickups. */
  room: 'main' | 'lab';
  audio: boolean;
}

function entries(opts: PreloadOptions): Entry[] {
  const list: Entry[] = [
    { key: PLAYER_ATLAS, kind: 'atlas', master: 'packed/player.png' },
    { key: TEX.bullet, kind: 'image', master: 'fx/bullet.png' },
    { key: TEX.muzzle, kind: 'sheet', master: 'fx/muzzle_flash_strip4.png', frame: MUZZLE_FRAME },
    { key: TEX.spark, kind: 'sheet', master: 'fx/spark_strip9.png', frame: SPARK_FRAME },
    { key: TEX.shield, kind: 'image', master: 'fx/shield_bubble.png' },
    { key: TEX.drone, kind: 'image', master: 'sprites/drone_target.png' },
  ];
  if (opts.room === 'main') {
    for (const kind of POWERUP_KINDS) list.push({ key: TEX.pickup(kind), kind: 'image', master: `sprites/pickups/${kind}.png` });
    const { floors, props } = mapArt();
    for (const f of floors) list.push({ key: TEX.floor(f), kind: 'image', master: `textures/floors/${f}.png` });
    for (const p of props) {
      list.push({ key: TEX.prop(p), kind: 'image', master: `textures/props/${p}.png` });
      if (p !== 'crate_metal') PIXEL_ART.add(TEX.prop(p));
    }
  }
  if (opts.audio) {
    list.push(
      { key: SFX.shootHandgun, kind: 'audio', master: 'sfx/shoot_handgun.wav' },
      { key: SFX.shootRifle, kind: 'audio', master: 'sfx/shoot_rifle.wav' },
      ...WEAPON_IDS.map((w): Entry => ({ key: SFX.reload(w), kind: 'audio', master: `sfx/reload_${w}.wav` })),
      { key: SFX.dryFire, kind: 'audio', master: 'sfx/dry_fire.mp3' },
      { key: SFX.hit, kind: 'audio', master: 'sfx/hit.wav' },
      { key: SFX.death, kind: 'audio', master: 'sfx/death.ogg' },
      { key: SFX.pickup, kind: 'audio', master: 'sfx/pickup.wav' },
    );
  }
  return list;
}

/** Floors and props of maps loaded at runtime (`loadMapArt`), so a tier swap includes them. */
const runtimeArt = new WeakMap<Phaser.Scene, Entry[]>();

function sceneEntries(scene: Phaser.Scene, opts: PreloadOptions): Entry[] {
  const list = entries(opts);
  for (const e of runtimeArt.get(scene) ?? []) if (!list.some((x) => x.key === e.key)) list.push(e);
  return list;
}

const isLoaded = (scene: Phaser.Scene, e: Entry, key = e.key): boolean =>
  e.kind === 'audio' ? scene.cache.audio.exists(key) : scene.textures.exists(key);

/** Queue one entry of `tier` under `key` (its own key, or a temporary one). */
function queue(scene: Phaser.Scene, e: Entry, tier: Tier, key: string): void {
  const load = scene.load;
  const url = tierUrl(tier, e.master);
  if (e.kind === 'atlas') load.atlas(key, url, url.replace(/\.webp$/, '.json'));
  else if (e.kind === 'sheet') {
    const f = Math.max(1, Math.round(e.frame! * tierScale(tier, e.master)));
    load.spritesheet(key, url, { frameWidth: f, frameHeight: f });
  } else if (e.kind === 'audio') load.audio(key, url);
  else load.image(key, url);
}

/** Scale bookkeeping lives in the game's registry: `tierScale:<key>`. */
function recordScale(scene: Phaser.Scene, e: Entry, tier: Tier): void {
  if (e.kind !== 'audio') scene.registry.set(`tierScale:${e.key}`, tierScale(tier, e.master));
}

/** The tier this game's textures come from (null before the first preload). */
export function currentTier(scene: Phaser.Scene): Tier | null {
  return (scene.registry.get('tier') as Tier | undefined) ?? null;
}

/**
 * Multiply a texture's scale by this so it keeps its master size on screen
 * (1 for files that are the same in every tier).
 */
export function invScale(scene: Phaser.Scene, key: string): number {
  const s = scene.registry.get(`tierScale:${key}`) as number | undefined;
  return s ? 1 / s : 1;
}

const errorsHooked = new WeakSet<Phaser.Loader.LoaderPlugin>();
function hookLoadErrors(scene: Phaser.Scene): void {
  if (errorsHooked.has(scene.load)) return;
  errorsHooked.add(scene.load);
  // A missing file must not break the scene: Phaser logs it and moves on.
  scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
    console.info(`[assets] ${file.key} not loaded (${file.url}) — using the procedural fallback`);
  });
}

/**
 * Queue every file for Scene.preload(), from `tier` on the first run of the
 * game and from the current tier after that. Files already loaded (a scene
 * restart after a tier swap) are skipped. Missing files are tolerated.
 */
export function preloadAssets(scene: Phaser.Scene, opts: PreloadOptions & { tier: Tier }): void {
  hookLoadErrors(scene);
  if (!currentTier(scene)) scene.registry.set('tier', opts.tier);
  const tier = currentTier(scene)!;
  for (const e of entries(opts)) {
    if (isLoaded(scene, e)) continue;
    queue(scene, e, tier, e.key);
    recordScale(scene, e, tier);
  }
}

const tmpKey = (key: string, tier: Tier) => `${key}@${tier}`;

/**
 * Fetch every file the scene uses again from `tier`, in the background and
 * under temporary keys, while the scene keeps playing. Calls `done` when the
 * loader has finished (a failed file keeps its current tier). Returns false
 * when there was nothing to load.
 */
export function loadTier(scene: Phaser.Scene, opts: PreloadOptions, tier: Tier, done: () => void): boolean {
  hookLoadErrors(scene);
  let n = 0;
  for (const e of sceneEntries(scene, opts)) {
    if (!isLoaded(scene, e) || isLoaded(scene, e, tmpKey(e.key, tier))) continue;
    queue(scene, e, tier, tmpKey(e.key, tier));
    n++;
  }
  if (n === 0) return false;
  scene.load.once(Phaser.Loader.Events.COMPLETE, done);
  scene.load.start();
  return true;
}

/**
 * Replace the current textures and sounds by the ones `loadTier` fetched.
 * Call it only while no game object uses them (scene init after a restart):
 * the old textures are destroyed, and the animations built on them removed
 * (`setupAssets` rebuilds them).
 */
export function swapTier(scene: Phaser.Scene, opts: PreloadOptions, tier: Tier): void {
  const swapped = new Set<string>();
  for (const e of sceneEntries(scene, opts)) {
    const tmp = tmpKey(e.key, tier);
    if (e.kind === 'audio') {
      if (!scene.cache.audio.exists(tmp)) continue;
      const data = scene.cache.audio.get(tmp);
      scene.cache.audio.remove(tmp);
      scene.cache.audio.remove(e.key);
      scene.cache.audio.add(e.key, data);
      continue;
    }
    if (!scene.textures.exists(tmp)) continue;
    if (scene.textures.exists(e.key)) scene.textures.remove(e.key);
    scene.textures.renameTexture(tmp, e.key);
    recordScale(scene, e, tier);
    swapped.add(e.key);
  }
  // Copies of a choice that was superseded while it loaded
  for (const e of sceneEntries(scene, opts)) {
    for (const other of TIERS) {
      const tmp = tmpKey(e.key, other);
      if (e.kind === 'audio') scene.cache.audio.remove(tmp);
      else if (scene.textures.exists(tmp)) scene.textures.remove(tmp);
    }
  }
  const manager = scene.anims as unknown as { anims: Phaser.Structs.Map<string, Phaser.Animations.Animation> };
  for (const key of manager.anims.keys()) {
    const a = scene.anims.get(key);
    if (a?.frames[0] && swapped.has(a.frames[0].textureKey)) scene.anims.remove(key);
  }
  scene.registry.set('tier', tier);
}

export function has(scene: Phaser.Scene, key: string): boolean {
  return scene.textures.exists(key);
}

/**
 * Load one map's floor and props at runtime. Compare panes (lab room)
 * preload no map art — the lab was always neon — but the Presenter can now
 * switch the lab's map (owner, 2026-10-11). Calls `done` when the loader has
 * finished (missing files fall back as usual). Returns false if there was
 * nothing to load.
 */
export function loadMapArt(scene: Phaser.Scene, id: MapId, done: () => void): boolean {
  const m = GAME.maps[id] as { floor: string | null; obstacles: readonly { prop?: string }[] };
  const tier = currentTier(scene) ?? 'high';
  const list: Entry[] = [];
  if (m.floor && !has(scene, TEX.floor(m.floor))) list.push({ key: TEX.floor(m.floor), kind: 'image', master: `textures/floors/${m.floor}.png` });
  for (const o of m.obstacles) {
    if (!o.prop) continue;
    if (o.prop !== 'crate_metal') PIXEL_ART.add(TEX.prop(o.prop));
    const key = TEX.prop(o.prop);
    if (!has(scene, key) && !list.some((e) => e.key === key)) list.push({ key, kind: 'image', master: `textures/props/${o.prop}.png` });
  }
  if (list.length === 0) return false;
  hookLoadErrors(scene);
  const known = runtimeArt.get(scene) ?? [];
  runtimeArt.set(scene, [...known, ...list]);
  for (const e of list) {
    queue(scene, e, tier, e.key);
    recordScale(scene, e, tier);
  }
  scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
    applyPixelFilters(scene);
    done();
  });
  scene.load.start();
  return true;
}

/** Nearest-neighbour filtering for the pixel-art textures that are loaded. */
function applyPixelFilters(scene: Phaser.Scene): void {
  for (const key of PIXEL_ART) {
    if (has(scene, key)) scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
}

/** Frame rate per animation; reloads span the weapon's reload time. */
function frameRate(anim: string, frames: number, weapon?: string): number {
  if (anim === 'reload' && weapon) {
    const ms = (GAME.weapons as unknown as Record<string, { reloadMs: number }>)[weapon].reloadMs;
    return frames / (ms / 1000);
  }
  if (anim === 'idle') return 20;
  if (anim === 'shoot') return 24;
  return 30; // move, run, strafe
}

/**
 * After loading: crisp filtering for pixel art and the player animations
 * (`body_<weapon>_<anim>`, `feet_<anim>`). Animations are per game, so each
 * Compare pane creates its own.
 */
export function setupAssets(scene: Phaser.Scene): void {
  applyPixelFilters(scene);

  if (has(scene, PLAYER_ATLAS)) {
    const names = scene.textures.get(PLAYER_ATLAS).getFrameNames();
    const groups = new Map<string, string[]>();
    for (const n of names) {
      const key = n.replace(/_\d+$/, '');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(n);
    }
    for (const [key, frames] of groups) {
      if (scene.anims.exists(key)) continue;
      frames.sort();
      const parts = key.split('_'); // body_<weapon>_<anim> | feet_<anim>
      const anim = parts[parts.length - 1] === 'left' || parts[parts.length - 1] === 'right'
        ? parts.slice(-2).join('_')
        : parts[parts.length - 1];
      const weapon = parts[0] === 'body' ? parts[1] : undefined;
      scene.anims.create({
        key,
        frames: frames.map((frame) => ({ key: PLAYER_ATLAS, frame })),
        frameRate: frameRate(anim, frames.length, weapon),
        repeat: anim === 'shoot' || anim === 'reload' ? 0 : -1,
      });
    }
  }

  if (has(scene, TEX.spark) && !scene.anims.exists('spark')) {
    scene.anims.create({ key: 'spark', frames: scene.anims.generateFrameNumbers(TEX.spark, { start: 0, end: 8 }), frameRate: 36, repeat: 0 });
  }
}
