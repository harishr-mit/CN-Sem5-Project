/**
 * MapView.ts — the static layers of the current map: floor, obstacles and the
 * arena border (GAMERULES.md §3, §17).
 *
 * `neon` (and any map whose art is missing) is drawn procedurally and baked
 * into two textures once: Phaser re-tessellates every Graphics object each
 * frame, which had made five Compare panes CPU-bound. Textured maps tile the
 * floor and skin each obstacle with its prop; collision never depends on art.
 */

import Phaser from 'phaser';
import GAME, { mapDef, type MapId, type ObstacleDef } from '@nobu/shared/config/game';
import { TEX, has } from './assets.js';

const ARENA_W = GAME.arena.width;
const ARENA_H = GAME.arena.height;
const C_OBSTACLE_FILL = 0x1a0a2e; // dark glass
const C_OBSTACLE_EDGE = 0x7c4dff; // violet glow
const C_GRID = 0x0d1a3a;

export const DEPTH = {
  floor: 0, walls: 1, pads: 2, trail: 3, ring: 4, feet: 5, body: 6, shield: 7,
  marker: 8, ghost: 9, proj: 10, name: 11, fx: 12,
} as const;

/** Pixel-art props are drawn at 2× (assets/README.md). */
const PROP_SCALE = 2;

function drawGlass(g: Phaser.GameObjects.Graphics, obs: ObstacleDef): void {
  g.fillStyle(C_OBSTACLE_FILL, 0.95);
  g.fillRect(obs.x, obs.y, obs.w, obs.h);
  // Glow edge: several strokes with decreasing alpha
  for (let i = 3; i >= 0; i--) {
    g.lineStyle(2 + i, C_OBSTACLE_EDGE, 0.15 * (4 - i));
    g.strokeRect(obs.x - i, obs.y - i, obs.w + 2 * i, obs.h + 2 * i);
  }
  g.lineStyle(2, C_OBSTACLE_EDGE, 1);
  g.strokeRect(obs.x, obs.y, obs.w, obs.h);
}

export class MapView {
  mapId: MapId | null = null;
  private objects: Phaser.GameObjects.GameObject[] = [];
  /** The neon grid pulses (its alpha), so keep a handle on it. */
  private grid: Phaser.GameObjects.Image | null = null;

  constructor(private readonly scene: Phaser.Scene) {}

  /** (Re)build for a map; a no-op when it is already shown. */
  show(id: MapId): void {
    if (this.mapId === id) return;
    this.destroy();
    this.mapId = id;
    const map = mapDef(id);
    const textured = map.floor !== null && has(this.scene, TEX.floor(map.floor));

    if (textured) {
      this.add(this.scene.add.tileSprite(0, 0, ARENA_W, ARENA_H, TEX.floor(map.floor!)).setOrigin(0, 0).setDepth(DEPTH.floor));
      // Darken so players and bullets stay the brightest things on screen
      this.add(this.scene.add.rectangle(0, 0, ARENA_W, ARENA_H, 0x05050c, 0.42).setOrigin(0, 0).setDepth(DEPTH.floor));
    } else {
      this.grid = this.add(this.scene.add.image(0, 0, this.bakeGrid()).setOrigin(0, 0).setDepth(DEPTH.floor));
    }

    // Obstacles with a usable prop are skinned; the rest (all of neon) are glass, baked.
    const glass: ObstacleDef[] = [];
    for (const o of map.obstacles) {
      const key = o.prop ? TEX.prop(o.prop) : null;
      if (!textured || !key || !has(this.scene, key)) { glass.push(o); continue; }
      this.add(this.scene.add.rectangle(o.x + 5, o.y + 6, o.w, o.h, 0x000000, 0.4).setOrigin(0, 0).setDepth(DEPTH.walls));
      if (o.prop === 'crate_metal') {
        this.add(this.scene.add.image(o.x, o.y, key).setOrigin(0, 0).setDisplaySize(o.w, o.h).setDepth(DEPTH.walls));
      } else {
        this.add(this.scene.add.tileSprite(o.x, o.y, o.w, o.h, key).setOrigin(0, 0).setTileScale(PROP_SCALE).setDepth(DEPTH.walls));
      }
    }
    this.add(this.scene.add.image(0, 0, this.bakeWalls(id, glass, textured)).setOrigin(0, 0).setDepth(DEPTH.walls));

  }

  update(): void {
    // Slow grid pulse (the grid itself is static)
    this.grid?.setAlpha(0.04 + 0.01 * Math.sin(Date.now() / 1500));
  }

  destroy(): void {
    for (const o of this.objects) o.destroy();
    this.objects = [];
    this.grid = null;
    this.mapId = null;
  }

  private add<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.objects.push(o);
    return o;
  }

  /** Faint 64 px grid (TEXTURE: arena_floor_grid — procedural). */
  private bakeGrid(): string {
    const key = 'arena-grid';
    if (this.scene.textures.exists(key)) return key;
    const g = this.scene.make.graphics({}, false);
    g.lineStyle(1, C_GRID, 1);
    for (let x = 0; x <= ARENA_W; x += 64) g.lineBetween(x, 0, x, ARENA_H);
    for (let y = 0; y <= ARENA_H; y += 64) g.lineBetween(0, y, ARENA_W, y);
    g.generateTexture(key, ARENA_W, ARENA_H);
    g.destroy();
    return key;
  }

  /** Glass obstacles + the arena border (TEXTURE: obstacle_dark_glass — procedural). */
  private bakeWalls(id: MapId, glass: ObstacleDef[], textured: boolean): string {
    const key = `arena-walls-${id}-${textured ? 't' : 'g'}`;
    if (this.scene.textures.exists(key)) return key;
    const g = this.scene.make.graphics({}, false);
    if (textured) {
      g.lineStyle(4, 0x000000, 0.7);
      g.strokeRect(0, 0, ARENA_W, ARENA_H);
    } else {
      g.lineStyle(3, C_OBSTACLE_EDGE, 0.8);
      g.strokeRect(0, 0, ARENA_W, ARENA_H);
    }
    for (const o of glass) drawGlass(g, o);
    g.generateTexture(key, ARENA_W, ARENA_H);
    g.destroy();
    return key;
  }
}
