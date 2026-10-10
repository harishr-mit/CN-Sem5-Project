/**
 * ArenaScene.ts — Phaser 3 scene that renders the game.
 * SPEC.md §13, GAMERULES.md §3–§8, §17, §18.
 *
 * === TEXTURES ===
 * Art comes from NoBu-Shooter/assets through the manifest in assets.ts
 * (PHASES.md Phase 2.5 A0). Every texture has a procedural fallback, used
 * when its file is missing; search for `// TEXTURE: <name>` to find them.
 * Map layers live in MapView.ts, the survivor sprites in PlayerView.ts.
 */

import Phaser from 'phaser';
import type { NetClient, CorrectionEvent } from '../net/NetClient.js';
import type { InputDriver } from '../compare/InputDriver.js';
import type { PlayerSnap, ProjectileSnap, PickupSnap, GameEvent, WeaponId } from '@nobu/shared/protocol';
import { moverPath, type MoverCfg } from '@nobu/shared/sim';
import GAME from '@nobu/shared/config/game';
import NET from '@nobu/shared/config/net';
import { acquireKeyboard, movementKeys, isTypingTarget } from './input.js';
import { preloadAssets, setupAssets, has, PLAYER_ATLAS, TEX, SFX } from './assets.js';
import { MapView, DEPTH } from './MapView.js';
import { PlayerView, bakePlayerTextures, type PlayerLook } from './PlayerView.js';
import { Sfx } from './audio.js';
import { PLAYER_COLORS } from './playerColors.js';

/**
 * Compare-view rendering options (PHASES.md C1-C4). Without them the scene
 * behaves exactly as in Quick Match. `view` is read every frame, so the
 * owner can flip its flags without recreating the scene.
 */
export interface ArenaSceneOptions {
  /**
   * Render at the canvas's displayed size and zoom the camera to fit the
   * arena (GameContainer uses Phaser.Scale.RESIZE). Cheaper for small panes.
   */
  renderAtDisplaySize?: boolean;
  /** Shared input: the scene stops polling keys and stepping the client. */
  input?: InputDriver;
  /** Colour per player id (Compare: each pane's player in its pane colour). */
  playerColors?: () => ReadonlyMap<number, number>;
  /** True server time in ms, for truth markers. */
  truthClock?: () => number | null;
  view?: {
    /** Draw other panes' players at 30 % alpha. */
    dimOthers: boolean;
    /** Dots at the last drawn mover positions: bunched = stutter. */
    moverTrails: boolean;
    /** Dashed ring at each mover's exact true position. */
    truthMarkers: boolean;
  };
}

// ─── Palette (SPEC.md §13.1) ──────────────────────────────────
const C_LOCAL_PLAYER   = 0x00e5ff; // cyan
const C_GHOST          = 0xffb300; // amber
const C_PROJECTILE     = 0xff3b5c; // red
const C_ARENA_BG       = 0x07070f;
const C_SPAWN_PROTECT  = 0x00e5ff; // cyan shield ring
const C_RESPAWN_RING   = 0x7c4dff; // violet pulse
const C_MOVER          = 0xc6b5ff; // pale violet drone
const C_TRUTH          = 0xffffff;
const C_MUZZLE         = 0xffe08a;
const C_PIERCE         = 0xb388ff; // piercing rounds

const PICKUP_COLORS: Record<string, number> = {
  rapid_fire: 0x8fa3c0, spread_shot: 0xff9a3c, shield: 0x39ff14, speed: 0xffd400, piercing: 0xb388ff, dash: 0x2fd6ff,
};

const MOVER_CFG: MoverCfg = { speed: GAME.lab.moverSpeed, stopGo: GAME.lab.stopGo };
const TRAIL_LEN = 24;

const ARENA_W = GAME.arena.width;
const ARENA_H = GAME.arena.height;
const P_RADIUS = GAME.player.radius;
const PROJ_RADIUS = GAME.projectile.radius;

/** Gun tip relative to the body pivot (world px): forward, sideways (+ = right of aim). */
const MUZZLE: Record<WeaponId, { fwd: number; side: number }> = {
  handgun: { fwd: 32, side: 9 },
  rifle: { fwd: 46, side: 6 },
  shotgun: { fwd: 46, side: 6 },
};

interface ParticleEffect {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  color: number;
  size: number;
}

interface CorrectionLine {
  fx: number; fy: number; tx: number; ty: number;
  life: number; errorPx: number;
}

export class ArenaScene extends Phaser.Scene {
  private netClient!: NetClient;
  private mapView!: MapView;
  private playerGraphics!: Phaser.GameObjects.Graphics;
  private projGraphics!: Phaser.GameObjects.Graphics;
  private fxGraphics!: Phaser.GameObjects.Graphics;
  private ghostGraphics!: Phaser.GameObjects.Graphics;
  private sfx!: Sfx;

  // Particle system
  private particles: ParticleEffect[] = [];
  private correctionLines: CorrectionLine[] = [];

  // FPS tracking for auto-degrade
  private fpsSamples: number[] = [];
  private bloomEnabled = true;

  // Fixed sim accumulator
  private accumMs = 0;
  private inputSendAccum = 0;

  // Last pointer position in arena space; aim is recomputed every frame from
  // the *rendered* local position so it stays correct while moving.
  private pointerX: number | null = null;
  private pointerY: number | null = null;
  private localX = 0;
  private localY = 0;
  private unsubscribers: (() => void)[] = [];

  private options: ArenaSceneOptions;
  /** Survivor sprites (null when the player atlas is missing: procedural circles). */
  private useSprites = false;
  private playerViews = new Map<number, PlayerView>();
  /** Where each player was drawn last frame (muzzle flashes, sound positions). */
  private drawnAt = new Map<number, { x: number; y: number; aim: number; weapon: WeaponId }>();
  private shotAt = new Map<number, number>();
  private projSprites: Phaser.GameObjects.Image[] = [];
  private pickupSprites = new Map<number, Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.Visible>();
  /**
   * Mover sprites per mover id: body, truth ring and a trail of dots (newest
   * last). Pooled Images batch far more cheaply than redrawn Graphics.
   */
  private moverSprites = new Map<number, {
    body: Phaser.GameObjects.Image;
    truth: Phaser.GameObjects.Image;
    dots: Phaser.GameObjects.Image[];
    trail: { x: number; y: number }[];
  }>();

  constructor(config: Phaser.Types.Scenes.SettingsConfig & { netClient: NetClient; options?: ArenaSceneOptions }) {
    super({ key: 'ArenaScene', ...config });
    this.netClient = (config as unknown as { netClient: NetClient }).netClient;
    this.options = (config as { options?: ArenaSceneOptions }).options ?? {};
  }

  init(data: { netClient: NetClient }): void {
    if (data.netClient) this.netClient = data.netClient;
  }

  /** Compare panes (shared input) have no sound: five games would play everything five times. */
  private get audible(): boolean {
    return !this.options.input && !this.options.renderAtDisplaySize;
  }

  preload(): void {
    preloadAssets(this, { room: this.netClient.room, audio: this.audible });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(C_ARENA_BG);
    if (this.options.renderAtDisplaySize) {
      const fit = (size: Phaser.Structs.Size) => {
        const cam = this.cameras.main;
        cam.setSize(size.width, size.height);
        cam.setZoom(Math.min(size.width / ARENA_W, size.height / ARENA_H));
        cam.centerOn(ARENA_W / 2, ARENA_H / 2);
      };
      fit(this.scale.gameSize);
      this.scale.on(Phaser.Scale.Events.RESIZE, fit);
      this.events.once('shutdown', () => this.scale.off(Phaser.Scale.Events.RESIZE, fit));
    }

    setupAssets(this);
    bakePlayerTextures(this);
    this.bakeMoverTextures();
    this.useSprites = has(this, PLAYER_ATLAS);
    this.sfx = new Sfx(this, this.audible);

    // Layers (draw order by depth, see MapView.DEPTH)
    this.mapView = new MapView(this);
    this.mapView.show(this.netClient.mapId);
    this.ghostGraphics = this.add.graphics().setDepth(DEPTH.ghost);
    this.projGraphics  = this.add.graphics().setDepth(DEPTH.proj);
    this.playerGraphics = this.add.graphics().setDepth(DEPTH.body);
    this.fxGraphics    = this.add.graphics().setDepth(DEPTH.fx);

    // Input — pointer worldX/Y is already in arena space at any scale
    const driver = this.options.input;
    this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => {
      this.pointerX = ptr.worldX;
      this.pointerY = ptr.worldY;
      driver?.setPointer(ptr.worldX, ptr.worldY);
    });
    if (!driver) {
      this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
        if (ptr.leftButtonDown()) this.netClient.fireDown = true;
      });
      const release = () => { this.netClient.fireDown = false; };
      this.input.on('pointerup', release);
      this.input.on('pointerupoutside', release);
    }

    // Keyboard — the page-level tracker in input.ts (Phaser's keyboard is
    // disabled in GameContainer). With a shared InputDriver the driver owns
    // the keyboard instead. R = reload (GAMERULES.md §6a).
    const releaseKeyboard = driver ? () => {} : acquireKeyboard();
    // R = reload, Space = dash (Dash power-up), GAMERULES.md §6a/§6b
    const onReloadKey = (e: KeyboardEvent) => {
      if (e.repeat || isTypingTarget(e.target)) return;
      if (e.code === 'KeyR') this.netClient.requestReload();
      if (e.code === 'Space') {
        e.preventDefault(); // no page scroll / button press
        this.netClient.requestDash();
      }
    };
    if (!driver) window.addEventListener('keydown', onReloadKey);

    // Clean up the keyboard and NetClient subscriptions when the scene stops or
    // the whole game is destroyed (React StrictMode mounts the container twice).
    const cleanup = () => {
      releaseKeyboard();
      window.removeEventListener('keydown', onReloadKey);
      this.unsubscribers.forEach((off) => off());
      this.unsubscribers = [];
    };
    this.events.once('shutdown', cleanup);
    this.events.once('destroy', cleanup);

    const net = this.netClient;
    this.unsubscribers.push(
      net.on('correction', (ev: CorrectionEvent) => {
        this.correctionLines.push({
          fx: ev.fromX, fy: ev.fromY, tx: ev.toX, ty: ev.toY,
          life: 1000, errorPx: ev.errorPx,
        });
      }),
      // Local shot / reload / dry fire, predicted (SPEC.md §10.8)
      net.on('fire', (weapon) => {
        const me = net.myPlayerId;
        if (me !== null) this.shotAt.set(me, this.time.now);
        this.muzzleFlash(this.localX, this.localY, net.aimAngle, weapon);
        this.playShot(weapon);
      }),
      net.on('reload', (weapon) => this.sfx.play(SFX.reload(weapon))),
      net.on('dryFire', () => this.sfx.play(SFX.dryFire)),
      net.on('event', (ev: GameEvent) => this.onGameEvent(ev)),
    );
  }

  private onGameEvent(ev: GameEvent): void {
    const net = this.netClient;
    const me = net.myPlayerId;
    // Own actions come from the prediction while it is on (no double sound)
    const fromOther = ev.playerId !== me || !net.toggles.prediction;
    const listener = { x: this.localX, y: this.localY };
    const at = ev.x !== undefined && ev.y !== undefined ? { x: ev.x, y: ev.y } : undefined;

    switch (ev.type) {
      case 'PLAYER_FIRE': {
        if (ev.playerId === undefined || !fromOther) break;
        this.shotAt.set(ev.playerId, this.time.now);
        const drawn = this.drawnAt.get(ev.playerId);
        const weapon = ev.weapon ?? 'handgun';
        if (drawn) this.muzzleFlash(drawn.x, drawn.y, drawn.aim, weapon);
        this.playShot(weapon, drawn ?? at, listener);
        break;
      }
      case 'RELOAD_START':
        if (ev.playerId !== undefined && fromOther) {
          this.sfx.play(SFX.reload(ev.weapon ?? 'handgun'), { at: this.drawnAt.get(ev.playerId) ?? at, listener, gain: ev.playerId === me ? 1 : 0.6 });
        }
        break;
      case 'PLAYER_DEATH':
        if (at) {
          const isMe = ev.victim === me;
          this.spawnDeathParticles(at.x, at.y, isMe ? C_LOCAL_PLAYER : this.colorFor(ev.victim ?? 0));
          this.spark(at.x, at.y, 1.6);
          if (isMe) this.cameras?.main?.shake(150, 0.006);
          this.sfx.play(SFX.death, isMe ? {} : { at, listener });
        }
        break;
      case 'PROJECTILE_HIT':
        if (at) this.spawnHitSparks(at.x, at.y);
        break;
      case 'SHIELD_HIT':
        if (at) {
          this.spark(at.x, at.y, 1.3);
          this.sfx.play(SFX.hit, ev.victim === me ? {} : { at, listener });
        }
        break;
      case 'PICKUP':
        if (at) {
          this.spawnDeathParticles(at.x, at.y, PICKUP_COLORS[ev.kind ?? ''] ?? 0xffffff, 10);
          this.sfx.play(SFX.pickup, ev.playerId === me ? {} : { at, listener, gain: 0.6 });
        }
        break;
    }
  }

  private playShot(weapon: WeaponId, at?: { x: number; y: number }, listener?: { x: number; y: number }): void {
    const key = weapon === 'handgun' ? SFX.shootHandgun : SFX.shootRifle;
    this.sfx.play(key, { at, listener, rate: weapon === 'shotgun' ? 0.7 : 1, gain: at ? 0.7 : 0.85 });
  }

  private colorFor(id: number): number {
    return this.options.playerColors?.().get(id) ?? PLAYER_COLORS[id % PLAYER_COLORS.length];
  }

  update(_time: number, delta: number): void {
    const dt = delta;

    // With a shared InputDriver, it samples keys and steps the client.
    if (!this.options.input) {
      // ── Movement keys (page-level tracker, input.ts) ────────
      this.netClient.keys = movementKeys();

      // ── Fixed sim accumulator (60 Hz) ────────────────────────
      const stepMs = 1000 / GAME.sim.hz;
      this.accumMs += dt;
      while (this.accumMs >= stepMs) {
        this.netClient.simStep();
        this.accumMs -= stepMs;
      }

      // ── Input send (inputSendHz) ─────────────────────────────
      const sendMs = 1000 / NET.inputSendHz;
      this.inputSendAccum += dt;
      if (this.inputSendAccum >= sendMs) {
        this.netClient.sendInputs();
        this.inputSendAccum %= sendMs;
      }
    }

    // ── FPS auto-degrade ─────────────────────────────────────
    this.fpsSamples.push(1000 / dt);
    if (this.fpsSamples.length > 180) this.fpsSamples.shift();
    if (this.fpsSamples.length >= 180) {
      const avgFps = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
      if (avgFps < 45 && this.bloomEnabled) {
        this.bloomEnabled = false;
        // TODO: disable bloom post-processing when Phaser pipeline is added
      }
    }

    // ── Render ───────────────────────────────────────────────
    this.render(dt);
    this.netClient.framePresented(dt);

    // ── Decay effects (ms-based) ─────────────────────────────
    this.particles = this.particles.filter(p => p.life > 0);
    this.correctionLines = this.correctionLines.filter(l => l.life > 0);
    const frames = dt / (1000 / 60); // velocities are in px per 60 Hz frame
    const drag = Math.pow(0.92, frames);
    for (const p of this.particles) {
      p.x += p.vx * frames; p.y += p.vy * frames;
      p.vx *= drag; p.vy *= drag;
      p.life -= dt;
    }
    for (const l of this.correctionLines) l.life -= dt;
  }

  private render(dt: number): void {
    const pg = this.playerGraphics;
    const projG = this.projGraphics;
    const fxG = this.fxGraphics;
    const ghost = this.ghostGraphics;
    const net = this.netClient;

    pg.clear(); projG.clear(); fxG.clear(); ghost.clear();

    const snap = net.latestSnapshot;
    this.mapView.show(snap?.match.map ?? net.mapId);
    this.mapView.update();

    const state = net.getInterpolatedState();
    const { players, projectiles } = state;
    const myId = net.myPlayerId;

    const local = net.getLocalRenderPos(state);
    this.localX = local.x;
    this.localY = local.y;
    const pointerX = this.options.input?.pointerX ?? this.pointerX;
    const pointerY = this.options.input?.pointerY ?? this.pointerY;
    if (pointerX !== null && pointerY !== null) {
      net.aimAngle = Math.atan2(pointerY - local.y, pointerX - local.x);
    }

    // Movers: trails, truth markers, then the drones themselves
    this.drawMovers(players);

    // Remote players (other panes' players are dimmed when asked). Compare
    // has no colour rings: its ghost / truth rings already mark positions.
    const dim = (this.options.view?.dimOthers ?? false) && myId !== null;
    const compare = !!(this.options.input || this.options.renderAtDisplaySize);
    const ghostShown = net.toggles.ghost && net.toggles.prediction;
    const now = this.time.now;
    const seen = new Set<number>();
    for (const p of players) {
      if (p.id === myId || p.mover) continue;
      seen.add(p.id);
      const color = this.colorFor(p.id);
      this.drawnAt.set(p.id, { x: p.x, y: p.y, aim: p.aim, weapon: p.weapon });
      if (this.useSprites) {
        this.viewFor(p.id).update({
          x: p.x, y: p.y, aim: p.aim, alive: p.alive, life: p.life, weapon: p.weapon,
          reloading: p.reloading, protect: p.protectMs > 0, shield: p.shield, fast: p.fast,
          color, ring: !compare, alpha: dim ? 0.3 : 1, isLocal: false,
          name: p.invincible ? `${p.name} [DEV]` : p.name, shotAt: this.shotAt.get(p.id) ?? 0,
        }, now, dt);
      } else {
        this.drawRemotePlayer(pg, p, color, dim ? 0.3 : 1);
      }
    }

    // Local player: predicted position, predicted weapon state
    const me = snap?.players.find(p => p.id === myId);
    if (me && myId !== null) {
      seen.add(myId);
      const cv = net.combatView;
      const look: PlayerLook = {
        x: local.x, y: local.y, aim: net.aimAngle, alive: me.alive, life: me.life,
        weapon: cv.weapon, reloading: cv.reload !== null,
        protect: me.protectMs > 0, shield: me.shield, fast: cv.speedMsLeft > 0 || me.fast,
        // The ghost (G) replaces our colour ring while it is shown
        color: C_LOCAL_PLAYER, ring: !compare && !ghostShown, alpha: 1, isLocal: true,
        name: me.invincible ? `${me.name} [DEV]` : me.name, shotAt: this.shotAt.get(myId) ?? 0,
      };
      this.drawnAt.set(myId, { x: local.x, y: local.y, aim: net.aimAngle, weapon: cv.weapon });
      if (this.useSprites) this.viewFor(myId).update(look, now, dt);
      else this.drawLocalPlayer(pg, me);
      if (!me.alive) {
        // Respawn ring pulse
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 200);
        pg.lineStyle(3, C_RESPAWN_RING, pulse);
        pg.strokeCircle(local.x, local.y, P_RADIUS + 10 + 5 * pulse);
      } else {
        this.drawPendingBar(pg, local.x, local.y);
      }
    }
    for (const [id, view] of [...this.playerViews]) {
      if (!seen.has(id)) { view.destroy(); this.playerViews.delete(id); this.drawnAt.delete(id); }
    }

    // Ghost (SPEC.md §13.4) — hidden with prediction off, where it would coincide
    if (net.toggles.ghost && net.toggles.prediction && myId !== null && me?.alive) {
      ghost.lineStyle(2, C_GHOST, 0.7);
      ghost.strokeCircle(net.authX, net.authY, P_RADIUS + 3);
      this.drawDashedCircle(ghost, net.authX, net.authY, P_RADIUS + 4, C_GHOST);
    }

    // Correction lines
    for (const line of this.correctionLines) {
      const alpha = Math.min(1, line.life / 1000);
      fxG.lineStyle(2, C_GHOST, alpha);
      fxG.lineBetween(line.fx, line.fy, line.tx, line.ty);
      const radius = Math.min(P_RADIUS * 3, line.errorPx);
      fxG.strokeCircle(line.tx, line.ty, radius * (1 - alpha));
    }

    this.drawPickups(snap?.pickups ?? []);
    this.drawProjectiles(projG, projectiles);

    // Particles
    for (const p of this.particles) {
      const alpha = p.life / p.maxLife;
      fxG.fillStyle(p.color, alpha);
      fxG.fillCircle(p.x, p.y, p.size * alpha);
    }
  }

  private viewFor(id: number): PlayerView {
    let v = this.playerViews.get(id);
    if (!v) { v = new PlayerView(this); this.playerViews.set(id, v); }
    return v;
  }

  /** Pending (unacknowledged) inputs as a small bar under the local player. */
  private drawPendingBar(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    const pending = this.netClient.pendingCount;
    if (pending <= 0) return;
    const barW = Math.min(pending * 3, 40);
    g.fillStyle(0x333333, 0.8);
    g.fillRect(x - 20, y + P_RADIUS + 28, 40, 4);
    g.fillStyle(C_LOCAL_PLAYER, 1);
    g.fillRect(x - 20, y + P_RADIUS + 28, barW, 4);
  }

  /* TEXTURE: projectile_trail — fx/bullet.png rotated along its direction,
   * plus a procedural fading trail; fallback: a red circle. */
  private drawProjectiles(g: Phaser.GameObjects.Graphics, projectiles: ProjectileSnap[]): void {
    const sprite = has(this, TEX.bullet);
    projectiles.forEach((proj, i) => {
      const dx = Number.isFinite(proj.dx) ? proj.dx : 0;
      const dy = Number.isFinite(proj.dy) ? proj.dy : 0;
      g.lineStyle(2, proj.pierce ? C_PIERCE : C_PROJECTILE, proj.pierce ? 0.6 : 0.3);
      if (dx || dy) g.lineBetween(proj.x - dx * 14, proj.y - dy * 14, proj.x, proj.y);
      if (sprite) {
        let img = this.projSprites[i];
        if (!img) {
          img = this.add.image(0, 0, TEX.bullet).setScale(2).setDepth(DEPTH.proj);
          this.projSprites[i] = img;
        }
        img.setVisible(true).setPosition(proj.x, proj.y).setRotation(Math.atan2(dy, dx));
        if (proj.pierce) img.setTint(C_PIERCE); else img.clearTint();
      } else {
        g.fillStyle(C_PROJECTILE, 1);
        g.fillCircle(proj.x, proj.y, PROJ_RADIUS);
      }
    });
    for (let i = projectiles.length; i < this.projSprites.length; i++) this.projSprites[i].setVisible(false);
  }

  /* TEXTURE: powerup_pickup — sprites/pickups/<kind>.png bobbing on its pad;
   * fallback: a coloured disc. */
  private drawPickups(pickups: PickupSnap[]): void {
    const seen = new Set<number>();
    const bob = Math.sin(this.time.now / 300) * 3;
    for (const pk of pickups) {
      seen.add(pk.id);
      let obj = this.pickupSprites.get(pk.id);
      const key = TEX.pickup(pk.kind);
      if (obj && obj.getData('kind') !== pk.kind) { obj.destroy(); obj = undefined; }
      if (!obj) {
        obj = has(this, key)
          ? this.add.image(0, 0, key).setDisplaySize(40, 40)
          : this.add.circle(0, 0, 12, PICKUP_COLORS[pk.kind] ?? 0xffffff, 0.9).setStrokeStyle(2, 0xffffff, 0.8);
        obj.setData('kind', pk.kind);
        (obj as unknown as Phaser.GameObjects.Components.Depth).setDepth(DEPTH.pads);
        this.pickupSprites.set(pk.id, obj);
      }
      obj.setPosition(pk.x, pk.y + bob).setVisible(true);
    }
    for (const [id, obj] of [...this.pickupSprites]) {
      if (!seen.has(id)) { obj.destroy(); this.pickupSprites.delete(id); }
    }
  }

  /* TEXTURE: muzzle_flash — one random frame of fx/muzzle_flash_strip4.png at
   * the gun tip, for one frame burst; fallback: a white dot. */
  private muzzleFlash(x: number, y: number, aim: number, weapon: WeaponId): void {
    const m = MUZZLE[weapon];
    const mx = x + Math.cos(aim) * m.fwd - Math.sin(aim) * m.side;
    const my = y + Math.sin(aim) * m.fwd + Math.cos(aim) * m.side;
    if (has(this, TEX.muzzle)) {
      const img = this.add.image(mx, my, TEX.muzzle, Math.floor(Math.random() * 4))
        .setScale(weapon === 'handgun' ? 0.2 : 0.26).setRotation(aim).setTint(C_MUZZLE)
        .setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fx);
      this.time.delayedCall(60, () => img.destroy());
    } else {
      this.particles.push({ x: mx, y: my, vx: 0, vy: 0, life: 80, maxLife: 80, color: 0xffffff, size: 7 });
    }
  }

  /* TEXTURE: hit_spark — fx/spark_strip9.png animation; fallback: particles. */
  private spark(x: number, y: number, scale = 1): void {
    if (!this.anims.exists('spark')) { this.spawnHitSparks(x, y); return; }
    const s = this.add.sprite(x, y, TEX.spark).setScale(scale).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fx);
    s.play('spark');
    s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.destroy());
  }

  /* TEXTURE: remote_player_sprite — fallback when the player atlas is missing. */
  private drawRemotePlayer(g: Phaser.GameObjects.Graphics, p: PlayerSnap, color: number, alpha = 1): void {
    if (!p.alive) return;
    if (p.protectMs > 0 || p.shield) this.drawShieldRing(g, p.x, p.y, p.shield ? 0x39ff14 : color);
    g.fillStyle(color, 0.15 * alpha);
    g.fillCircle(p.x, p.y, P_RADIUS + 8);
    g.fillStyle(color, 0.3 * alpha);
    g.fillCircle(p.x, p.y, P_RADIUS + 4);
    g.fillStyle(color, alpha);
    g.fillCircle(p.x, p.y, P_RADIUS);
    g.lineStyle(2, 0xffffff, 0.5 * alpha);
    g.strokeCircle(p.x, p.y, P_RADIUS - 4);
  }

  /* TEXTURE: local_player_sprite — fallback when the player atlas is missing. */
  private drawLocalPlayer(g: Phaser.GameObjects.Graphics, me: PlayerSnap): void {
    const rx = this.localX;
    const ry = this.localY;
    if (!me.alive) return;
    if (me.protectMs > 0 || me.shield) this.drawShieldRing(g, rx, ry, me.shield ? 0x39ff14 : C_SPAWN_PROTECT);
    g.fillStyle(C_LOCAL_PLAYER, 0.1);
    g.fillCircle(rx, ry, P_RADIUS + 12);
    g.fillStyle(C_LOCAL_PLAYER, 0.25);
    g.fillCircle(rx, ry, P_RADIUS + 6);
    g.fillStyle(C_LOCAL_PLAYER, 1);
    g.fillCircle(rx, ry, P_RADIUS);
    g.lineStyle(2, 0xffffff, 0.6);
    g.strokeCircle(rx, ry, P_RADIUS - 4);
    // Aim chevron
    const aim = this.netClient.aimAngle;
    const chevTip = P_RADIUS + 10;
    const chevWing = 6;
    g.fillStyle(C_LOCAL_PLAYER, 0.9);
    g.fillTriangle(
      rx + Math.cos(aim) * chevTip, ry + Math.sin(aim) * chevTip,
      rx + Math.cos(aim - 0.5) * (chevTip - chevWing), ry + Math.sin(aim - 0.5) * (chevTip - chevWing),
      rx + Math.cos(aim + 0.5) * (chevTip - chevWing), ry + Math.sin(aim + 0.5) * (chevTip - chevWing),
    );
  }

  /** Mover body, trail dot and truth ring, drawn once into textures. */
  private bakeMoverTextures(): void {
    if (this.textures.exists('mover-drone')) return;
    const half = P_RADIUS + 8;
    const g = this.make.graphics({}, false);
    /* TEXTURE: mover_drone — sprites/drone_target.png; this ring is the fallback. */
    g.fillStyle(C_MOVER, 0.12);
    g.fillCircle(half, half, P_RADIUS + 6);
    g.lineStyle(3, C_MOVER, 0.95);
    g.strokeCircle(half, half, P_RADIUS - 2);
    g.fillStyle(C_MOVER, 1);
    g.fillCircle(half, half, 4);
    g.generateTexture('mover-drone', half * 2, half * 2);
    g.clear();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(3, 3, 3);
    g.generateTexture('mover-dot', 6, 6);
    g.clear();
    this.drawDashedCircle(g, half, half, P_RADIUS + 2, C_TRUTH, 0.8);
    g.generateTexture('mover-truth', half * 2, half * 2);
    g.destroy();
  }

  /**
   * Scripted lab movers (PHASES.md C3): the drone target. Optional trail
   * of recent drawn positions (evenly spaced = smooth, bunched = stutter)
   * and a dashed marker at the exact true position.
   */
  private drawMovers(players: PlayerSnap[]): void {
    const view = this.options.view;
    const truth = view?.truthMarkers ? (this.options.truthClock?.() ?? null) : null;
    const seen = new Set<number>();
    const drone = has(this, TEX.drone);
    for (const p of players) {
      if (!p.mover) continue;
      seen.add(p.id);
      let spr = this.moverSprites.get(p.id);
      if (!spr) {
        spr = {
          dots: Array.from({ length: TRAIL_LEN }, () => this.add.image(0, 0, 'mover-dot').setTint(C_MOVER).setDepth(DEPTH.trail)),
          body: (drone
            ? this.add.image(0, 0, TEX.drone).setDisplaySize(36, 36)
            : this.add.image(0, 0, 'mover-drone')).setDepth(DEPTH.body),
          truth: this.add.image(0, 0, 'mover-truth').setDepth(DEPTH.marker),
          trail: [],
        };
        this.moverSprites.set(p.id, spr);
      }
      spr.body.setPosition(p.x, p.y);

      spr.trail.push({ x: p.x, y: p.y });
      if (spr.trail.length > TRAIL_LEN) spr.trail.shift();
      const n = spr.trail.length;
      spr.dots.forEach((dot, i) => {
        const pt = spr!.trail[i];
        const visible = !!view?.moverTrails && pt !== undefined;
        dot.setVisible(visible);
        if (visible) dot.setPosition(pt.x, pt.y).setAlpha(0.15 + 0.6 * (i / n));
      });

      if (truth !== null) {
        const t = moverPath(p.mover, truth / 1000, MOVER_CFG);
        spr.truth.setVisible(true).setPosition(t.x, t.y);
      } else {
        spr.truth.setVisible(false);
      }
    }
    for (const [id, spr] of [...this.moverSprites]) {
      if (seen.has(id)) continue;
      spr.body.destroy();
      spr.truth.destroy();
      spr.dots.forEach((d) => d.destroy());
      this.moverSprites.delete(id);
    }
  }

  /* TEXTURE: spawn_shield_ring — fallback for the shield bubble. */
  private drawShieldRing(g: Phaser.GameObjects.Graphics, x: number, y: number, color: number): void {
    const angle = (Date.now() / 300) % (Math.PI * 2);
    const r = P_RADIUS + 10;
    const segments = 12;
    for (let i = 0; i < segments; i++) {
      const a0 = angle + (i / segments) * Math.PI * 2;
      const a1 = angle + ((i + 0.6) / segments) * Math.PI * 2;
      g.lineStyle(3, color, 0.8);
      g.beginPath();
      g.arc(x, y, r, a0, a1, false);
      g.strokePath();
    }
  }

  private drawDashedCircle(
    g: Phaser.GameObjects.Graphics,
    x: number, y: number,
    r: number,
    color: number,
    alpha = 0.5
  ): void {
    const segments = 16;
    g.lineStyle(alpha >= 0.8 ? 2 : 1, color, alpha);
    for (let i = 0; i < segments; i += 2) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      g.beginPath();
      g.arc(x, y, r, a0, a1, false);
      g.strokePath();
    }
  }

  private spawnDeathParticles(x: number, y: number, color: number, count = 28): void {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.2;
      const speed = 2 + Math.random() * 4;
      const life = 450 + Math.random() * 350; // ms
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life, maxLife: life,
        color,
        size: 3 + Math.random() * 3,
      });
    }
  }

  private spawnHitSparks(x: number, y: number): void {
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 220, maxLife: 220, // ms
        color: 0xffffff,
        size: 2,
      });
    }
  }
}
