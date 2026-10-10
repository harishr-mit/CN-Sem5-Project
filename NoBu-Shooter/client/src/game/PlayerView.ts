/**
 * PlayerView.ts — one player drawn with the survivor sprites (GAMERULES.md §17).
 *
 * Everyone uses the same avatar; identity is the colour ring under the feet
 * and the coloured name tag, and the local player also wears cyan shoulder
 * pips. The body animation follows the weapon and state (idle / move / shoot
 * / reload); the feet follow the movement direction relative to the aim
 * (run / strafe_left / strafe_right / idle). Used only when the player atlas
 * loaded — otherwise ArenaScene draws the procedural circles.
 */

import Phaser from 'phaser';
import type { WeaponId } from '@nobu/shared/protocol';
import GAME from '@nobu/shared/config/game';
import { PLAYER_ATLAS, PLAYER_SPRITE_SCALE, TEX, has } from './assets.js';
import { DEPTH } from './MapView.js';

const P_RADIUS = GAME.player.radius;
const C_LOCAL = 0x00e5ff;
const C_SHIELD_POWERUP = 0x39ff14;
/** Below this speed (px/s) a player counts as standing still. */
const MOVING_PX_S = 40;
/** How long the 3-frame shoot animation shows after a shot. */
const SHOOT_SHOW_MS = 140;

export interface PlayerLook {
  x: number;
  y: number;
  aim: number;
  alive: boolean;
  life: number;
  weapon: WeaponId;
  reloading: boolean;
  /** Spawn protection (pulsing bubble in the player's colour). */
  protect: boolean;
  /** Shield power-up (steady green bubble). */
  shield: boolean;
  fast: boolean;
  color: number;
  /** Draw the colour ring (off in Compare, and for the local player while the ghost is shown). */
  ring: boolean;
  alpha: number;
  isLocal: boolean;
  name: string;
  /** Time of the latest shot (ms, scene clock), 0 if none. */
  shotAt: number;
}

/** Textures shared by every PlayerView: the ring and the shoulder pips. */
export function bakePlayerTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists('player-ring')) {
    const g = scene.make.graphics({}, false);
    const r = P_RADIUS + 6;
    g.fillStyle(0xffffff, 0.16);
    g.fillCircle(r + 3, r + 3, r);
    g.lineStyle(3, 0xffffff, 0.95);
    g.strokeCircle(r + 3, r + 3, r);
    g.generateTexture('player-ring', (r + 3) * 2, (r + 3) * 2);
    g.destroy();
  }
  if (!scene.textures.exists('local-marker')) {
    // Two pips on the shoulder line (± 14 px across the aim), texture faces right
    const g = scene.make.graphics({}, false);
    for (const y of [5, 33]) {
      g.fillStyle(C_LOCAL, 0.35);
      g.fillCircle(6, y, 6);
      g.fillStyle(C_LOCAL, 1);
      g.fillCircle(6, y, 3.5);
      g.lineStyle(1, 0xffffff, 0.9);
      g.strokeCircle(6, y, 3.5);
    }
    g.generateTexture('local-marker', 12, 38);
    g.destroy();
  }
}

export class PlayerView {
  private readonly ring: Phaser.GameObjects.Image;
  private readonly feet: Phaser.GameObjects.Sprite;
  private readonly body: Phaser.GameObjects.Sprite;
  private readonly bubble: Phaser.GameObjects.Image | null;
  private readonly marker: Phaser.GameObjects.Image;
  private readonly tag: Phaser.GameObjects.Text;

  private lastX = 0;
  private lastY = 0;
  private lastLife = -1;
  private vx = 0;
  private vy = 0;
  private lastShotAt = 0;

  constructor(private readonly scene: Phaser.Scene) {
    this.ring = scene.add.image(0, 0, 'player-ring').setDepth(DEPTH.ring);
    this.feet = scene.add.sprite(0, 0, PLAYER_ATLAS).setScale(PLAYER_SPRITE_SCALE).setDepth(DEPTH.feet);
    this.body = scene.add.sprite(0, 0, PLAYER_ATLAS).setScale(PLAYER_SPRITE_SCALE).setDepth(DEPTH.body);
    this.bubble = has(scene, TEX.shield) ? scene.add.image(0, 0, TEX.shield).setDepth(DEPTH.shield).setDisplaySize(62, 62) : null;
    this.marker = scene.add.image(0, 0, 'local-marker').setDepth(DEPTH.marker);
    this.tag = scene.add.text(0, 0, '', {
      fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 0).setDepth(DEPTH.name);
  }

  update(p: PlayerLook, nowMs: number, dtMs: number): void {
    const visible = p.alive;
    for (const o of [this.feet, this.body, this.tag]) o.setVisible(visible);
    this.ring.setVisible(visible && p.ring);
    this.marker.setVisible(visible && p.isLocal);
    if (!visible) { this.bubble?.setVisible(false); this.lastLife = -1; return; }

    // Velocity from drawn positions (works for predicted, interpolated and
    // un-interpolated players alike); a respawn teleport resets it.
    if (p.life !== this.lastLife) {
      this.lastLife = p.life;
      this.vx = this.vy = 0;
    } else if (dtMs > 0) {
      const k = Math.min(1, dtMs / 80);
      this.vx += ((p.x - this.lastX) / (dtMs / 1000) - this.vx) * k;
      this.vy += ((p.y - this.lastY) / (dtMs / 1000) - this.vy) * k;
    }
    this.lastX = p.x;
    this.lastY = p.y;
    const moving = Math.hypot(this.vx, this.vy) > MOVING_PX_S;

    // Body: reload > shoot > move > idle
    if (p.shotAt !== this.lastShotAt) {
      this.lastShotAt = p.shotAt;
      this.playIfExists(this.body, `body_${p.weapon}_shoot`, true);
    }
    const shooting = nowMs - p.shotAt < SHOOT_SHOW_MS;
    const bodyAnim = p.reloading ? 'reload' : shooting ? 'shoot' : moving ? 'move' : 'idle';
    this.playIfExists(this.body, `body_${p.weapon}_${bodyAnim}`);

    // Feet: direction of travel relative to the aim
    let feetAnim = 'idle';
    if (moving) {
      const diff = Math.atan2(Math.sin(Math.atan2(this.vy, this.vx) - p.aim), Math.cos(Math.atan2(this.vy, this.vx) - p.aim));
      const a = Math.abs(diff);
      feetAnim = a < Math.PI / 4 || a > (3 * Math.PI) / 4 ? 'run' : diff > 0 ? 'strafe_right' : 'strafe_left';
    }
    this.playIfExists(this.feet, `feet_${feetAnim}`);

    for (const s of [this.feet, this.body]) s.setPosition(p.x, p.y).setRotation(p.aim).setAlpha(p.alpha);
    this.marker.setPosition(p.x, p.y).setRotation(p.aim).setAlpha(p.alpha);

    // Ring in the player's colour; brighter and pulsing while Speed is on
    const pulse = 0.5 + 0.5 * Math.sin(nowMs / 90);
    this.ring.setPosition(p.x, p.y).setTint(p.color)
      .setAlpha(p.alpha * (p.fast ? 0.7 + 0.3 * pulse : 0.85))
      .setScale(p.fast ? 1.08 + 0.06 * pulse : 1);

    if (this.bubble) {
      const on = p.protect || p.shield;
      this.bubble.setVisible(on);
      if (on) {
        this.bubble.setPosition(p.x, p.y)
          .setTint(p.shield ? C_SHIELD_POWERUP : p.color)
          .setAlpha(p.alpha * (p.shield ? 0.38 : 0.22 + 0.16 * Math.sin(nowMs / 120)));
      }
    }

    const css = `#${p.color.toString(16).padStart(6, '0')}`;
    if (this.tag.text !== p.name) this.tag.setText(p.name);
    this.tag.setColor(css).setPosition(p.x, p.y + P_RADIUS + 12).setAlpha(p.alpha);
  }

  destroy(): void {
    for (const o of [this.ring, this.feet, this.body, this.bubble, this.marker, this.tag]) o?.destroy();
  }

  private playIfExists(sprite: Phaser.GameObjects.Sprite, key: string, restart = false): void {
    if (!this.scene.anims.exists(key)) return;
    if (restart || sprite.anims.currentAnim?.key !== key) sprite.play(key, !restart);
  }
}
