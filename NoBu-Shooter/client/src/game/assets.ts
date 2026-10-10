/**
 * assets.ts — texture / animation / sound manifest (PHASES.md Phase 2.5 A0).
 *
 * Files live in NoBu-Shooter/assets (Vite's publicDir, so they are served
 * from the site root). Every key is optional: a file that fails to load is
 * simply absent, and the scene falls back to its procedural drawing (or to
 * silence) — check with `has(scene, key)`. Inventory and licences:
 * assets/README.md, assets/CREDITS.md.
 */

import Phaser from 'phaser';
import GAME, { POWERUP_KINDS, WEAPON_IDS } from '@nobu/shared/config/game';

/** Survivor body + feet frames, packed by scripts/pack-assets.mjs. */
export const PLAYER_ATLAS = 'player';
/** The atlas stores frames at this fraction of the source art. */
const ATLAS_STORE_SCALE = 0.4;
/** Source-art pixels → world pixels: the body is ≈ 54 px across (GAMERULES.md §17). */
const ART_TO_WORLD = 0.25;
/** Sprite scale for atlas frames. */
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

/** Queue every file for Scene.preload(). Missing files are tolerated. */
export function preloadAssets(scene: Phaser.Scene, opts: PreloadOptions): void {
  const load = scene.load;
  // A missing file must not break the scene: Phaser logs it and moves on.
  load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
    console.info(`[assets] ${file.key} not loaded (${file.url}) — using the procedural fallback`);
  });

  load.atlas(PLAYER_ATLAS, 'packed/player.png', 'packed/player.json');
  load.image(TEX.bullet, 'fx/bullet.png');
  load.spritesheet(TEX.muzzle, 'fx/muzzle_flash_strip4.png', { frameWidth: 128, frameHeight: 128 });
  load.spritesheet(TEX.spark, 'fx/spark_strip9.png', { frameWidth: 32, frameHeight: 32 });
  load.image(TEX.shield, 'fx/shield_bubble.png');
  load.image(TEX.drone, 'sprites/drone_target.png');

  if (opts.room === 'main') {
    for (const kind of POWERUP_KINDS) load.image(TEX.pickup(kind), `sprites/pickups/${kind}.png`);
    const { floors, props } = mapArt();
    for (const f of floors) load.image(TEX.floor(f), `textures/floors/${f}.png`);
    for (const p of props) load.image(TEX.prop(p), `textures/props/${p}.png`);
    for (const p of props) if (p !== 'crate_metal') PIXEL_ART.add(TEX.prop(p));
  }

  if (opts.audio) {
    load.audio(SFX.shootHandgun, 'sfx/shoot_handgun.wav');
    load.audio(SFX.shootRifle, 'sfx/shoot_rifle.wav');
    for (const w of WEAPON_IDS) load.audio(SFX.reload(w), `sfx/reload_${w}.wav`);
    load.audio(SFX.dryFire, 'sfx/dry_fire.mp3');
    load.audio(SFX.hit, 'sfx/hit.wav');
    load.audio(SFX.death, 'sfx/death.ogg');
    load.audio(SFX.pickup, 'sfx/pickup.wav');
  }
}

export function has(scene: Phaser.Scene, key: string): boolean {
  return scene.textures.exists(key);
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
  for (const key of PIXEL_ART) {
    if (has(scene, key)) scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

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
