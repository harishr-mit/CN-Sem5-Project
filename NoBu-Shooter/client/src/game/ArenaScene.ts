/**
 * ArenaScene.ts — Phaser 3 scene that renders the game.
 * SPEC.md §13, GAMERULES.md §3–§7.
 *
 * === TEXTURE / MODEL PLACEHOLDERS ===
 * All art is procedurally generated with Phaser Graphics.
 * When custom textures are provided, replace each labeled section below.
 *
 * Search for:  // TEXTURE: <name>
 * to find every placeholder that should be replaced.
 */

import Phaser from 'phaser';
import type { NetClient, CorrectionEvent } from '../net/NetClient.js';
import type { PlayerSnap, GameEvent } from '@nobu/shared/protocol';
import GAME from '@nobu/shared/config/game';
import NET from '@nobu/shared/config/net';
import { acquireKeyboard, movementKeys, createPointerState, type PointerState } from './input.js';

export interface ArenaSceneOptions {
  netClient: NetClient;
  /** Shared aim/fire state (A/B panes pass one instance to both scenes). */
  pointer?: PointerState;
  /** Clients whose players are not drawn here (the twin in the other A/B pane). */
  hidePlayersOf?: NetClient[];
}

const SIM_STEP_MS = 1000 / GAME.sim.hz;
const INPUT_SEND_MS = 1000 / NET.inputSendHz;
/** After a stall (hidden tab, debugger) drop ticks beyond this instead of fast-forwarding. */
const MAX_CATCHUP_TICKS = 6;

// ─── Palette (SPEC.md §13.1) ──────────────────────────────────
const C_LOCAL_PLAYER   = 0x00e5ff; // cyan
const C_GHOST          = 0xffb300; // amber
const C_PROJECTILE     = 0xff3b5c; // red
const C_OBSTACLE_FILL  = 0x1a0a2e; // dark glass
const C_OBSTACLE_EDGE  = 0x7c4dff; // violet glow
const C_ARENA_BG       = 0x07070f;
const C_GRID           = 0x0d1a3a;
const C_SPAWN_PROTECT  = 0x00e5ff; // cyan shield ring
const C_RESPAWN_RING   = 0x7c4dff; // violet pulse

/** Eight distinct hues for remote players (indexed by player.id % 8). */
const PLAYER_COLORS = [
  0xff2bd6, // magenta
  0xb6ff3b, // lime
  0xff6b00, // orange
  0xffe14d, // yellow (cyan is reserved for the local player)
  0xff3b5c, // red
  0xffb300, // amber
  0x7c4dff, // violet
  0x39ff14, // neon green
];

const ARENA_W = GAME.arena.width;
const ARENA_H = GAME.arena.height;
const OBSTACLES = GAME.obstacles as unknown as { id: string; x: number; y: number; w: number; h: number }[];
const P_RADIUS = GAME.player.radius;
const PROJ_RADIUS = GAME.projectile.radius;
const SPAWN_POINTS = GAME.spawnPoints as unknown as { x: number; y: number }[];

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
  // arenaContainer removed (Bug 3B) — graphics objects are added directly
  private bgGraphics!: Phaser.GameObjects.Graphics;
  private playerGraphics!: Phaser.GameObjects.Graphics;
  private projGraphics!: Phaser.GameObjects.Graphics;
  private fxGraphics!: Phaser.GameObjects.Graphics;
  private ghostGraphics!: Phaser.GameObjects.Graphics;

  // Particle system
  private particles: ParticleEffect[] = [];
  private correctionLines: CorrectionLine[] = [];

  // Muzzle flash (timer is now in milliseconds, Bug 6D fix)
  private muzzleFlashTimer = 0;
  private muzzleFlashX = 0;
  private muzzleFlashY = 0;

  // FPS tracking for auto-degrade
  private fpsSamples: number[] = [];
  private bloomEnabled = true;

  // Fixed 60 Hz sim and 30 Hz input send, aligned to absolute frame time so
  // every pane on the page steps and sends in the same frames (A/B twins
  // sample identical inputs). -1 = not started.
  private lastSimTick = -1;
  private lastSendSlot = -1;

  // Pointer position in arena space (shared between A/B panes); aim is
  // recomputed every frame from the *rendered* local position.
  private pointer: PointerState;
  private hidePlayersOf: NetClient[];
  private localX = 0;
  private localY = 0;
  private unsubscribers: (() => void)[] = [];

  constructor(opts: ArenaSceneOptions) {
    super({ key: 'ArenaScene' });
    this.netClient = opts.netClient;
    this.pointer = opts.pointer ?? createPointerState();
    this.hidePlayersOf = opts.hidePlayersOf ?? [];
  }

  create(): void {
    this.cameras.main.setBackgroundColor(C_ARENA_BG);

    // Layers (draw order)
    this.bgGraphics    = this.add.graphics();
    this.ghostGraphics = this.add.graphics();
    this.projGraphics  = this.add.graphics();
    this.playerGraphics = this.add.graphics();
    this.fxGraphics    = this.add.graphics();

    // Pointer — worldX/Y is already in arena space at any scale
    this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => {
      this.pointer.x = ptr.worldX;
      this.pointer.y = ptr.worldY;
    });
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (ptr.leftButtonDown()) this.pointer.fireDown = true;
    });
    const release = () => { this.pointer.fireDown = false; };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);

    // Keyboard — one page-level tracker shared by every pane (see input.ts).
    // Phaser's per-game keyboard is not used for movement.
    const releaseKeyboard = acquireKeyboard();

    // Clean up the keyboard and NetClient subscriptions when the scene stops or
    // the whole game is destroyed (React StrictMode mounts the container twice).
    const cleanup = () => {
      releaseKeyboard();
      this.unsubscribers.forEach((off) => off());
      this.unsubscribers = [];
    };
    this.events.once('shutdown', cleanup);
    this.events.once('destroy', cleanup);

    this.unsubscribers.push(
      this.netClient.on('correction', (ev: CorrectionEvent) => {
        this.correctionLines.push({
          fx: ev.fromX, fy: ev.fromY, tx: ev.toX, ty: ev.toY,
          life: 1000, errorPx: ev.errorPx,
        });
      }),
      // Local muzzle flash at the rendered (predicted) position (SPEC.md §10.8)
      this.netClient.on('fire', () => {
        this.muzzleFlashTimer = 100;
        this.muzzleFlashX = this.localX + Math.cos(this.netClient.aimAngle) * (P_RADIUS + 10);
        this.muzzleFlashY = this.localY + Math.sin(this.netClient.aimAngle) * (P_RADIUS + 10);
      }),
      this.netClient.on('event', (ev: GameEvent) => {
        if (ev.type === 'PLAYER_DEATH' && ev.x !== undefined && ev.y !== undefined) {
          const isMe = ev.victim === this.netClient.myPlayerId;
          this.spawnDeathParticles(ev.x, ev.y, isMe ? C_LOCAL_PLAYER : this.colorFor(ev.victim ?? 0));
          if (isMe) this.cameras?.main?.shake(150, 0.006);
        }
        if (ev.type === 'PROJECTILE_HIT' && ev.x !== undefined && ev.y !== undefined) {
          this.spawnHitSparks(ev.x, ev.y);
        }
      }),
    );
  }

  private colorFor(id: number): number {
    return PLAYER_COLORS[id % PLAYER_COLORS.length];
  }

  update(time: number, delta: number): void {
    const dt = delta;

    // ── Input state (keyboard is page-level, pointer may be shared) ────
    this.netClient.keys = movementKeys();
    this.netClient.fireDown = this.pointer.fireDown;

    // ── Fixed 60 Hz sim on absolute tick boundaries ──────────
    // `time` is the requestAnimationFrame timestamp, identical for every
    // Phaser game in the same frame, so A/B panes run the same ticks.
    const simTick = Math.floor(time / SIM_STEP_MS);
    if (this.lastSimTick < 0 || simTick - this.lastSimTick > MAX_CATCHUP_TICKS) this.lastSimTick = simTick - 1;
    while (this.lastSimTick < simTick) {
      this.netClient.simStep();
      this.lastSimTick++;
    }

    // ── Input send (inputSendHz), same alignment ─────────────
    const sendSlot = Math.floor(time / INPUT_SEND_MS);
    if (sendSlot !== this.lastSendSlot) {
      this.lastSendSlot = sendSlot;
      this.netClient.sendInputs();
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
    this.render();
    this.netClient.framePresented(dt);

    // ── Decay effects (Bug 6D fix: use delta ms, not frame count) ────────
    if (this.muzzleFlashTimer > 0) this.muzzleFlashTimer = Math.max(0, this.muzzleFlashTimer - dt);
    this.particles = this.particles.filter(p => p.life > 0);
    this.correctionLines = this.correctionLines.filter(l => l.life > 0);
    const frames = dt / (1000 / 60); // velocities are in px per 60 Hz frame
    const drag = Math.pow(0.92, frames);
    for (const p of this.particles) {
      p.x += p.vx * frames; p.y += p.vy * frames;
      p.vx *= drag; p.vy *= drag;
      p.life -= dt;
    }
    for (const l of this.correctionLines) l.life -= dt; // ms-based
  }

  private render(): void {
    const g = this.bgGraphics;
    const pg = this.playerGraphics;
    const projG = this.projGraphics;
    const fxG = this.fxGraphics;
    const ghost = this.ghostGraphics;

    g.clear(); pg.clear(); projG.clear(); fxG.clear(); ghost.clear();

    this.drawBackground(g);
    this.drawObstacles(g);

    const state = this.netClient.getInterpolatedState();
    const { players, projectiles } = state;
    const snap = this.netClient.latestSnapshot;
    const myId = this.netClient.myPlayerId;

    const local = this.netClient.getLocalRenderPos(state);
    this.localX = local.x;
    this.localY = local.y;
    if (this.pointer.x !== null && this.pointer.y !== null) {
      this.netClient.aimAngle = Math.atan2(this.pointer.y - local.y, this.pointer.x - local.x);
    }

    // Draw remote players (except twins shown in another pane)
    for (const p of players) {
      if (p.id === myId || this.hidePlayersOf.some(c => c.myPlayerId === p.id)) continue;
      this.drawRemotePlayer(pg, p);
    }

    // Draw local player
    const me = snap?.players.find(p => p.id === myId);
    if (me) {
      this.drawLocalPlayer(pg, me);
    }

    // Draw ghost (SPEC.md §13.4) — hidden with prediction off, where it would coincide
    if (this.netClient.toggles.ghost && this.netClient.toggles.prediction && myId !== null && me?.alive) {
      ghost.lineStyle(2, C_GHOST, 0.7);
      ghost.strokeCircle(this.netClient.authX, this.netClient.authY, P_RADIUS + 3);
      // Draw dashes manually for dashed circle effect
      this.drawDashedCircle(ghost, this.netClient.authX, this.netClient.authY, P_RADIUS + 4, C_GHOST);
    }

    // Draw correction lines
    fxG.lineStyle(2, C_GHOST, 0.8);
    for (const line of this.correctionLines) {
      const alpha = Math.min(1, line.life / 1000); // ms-based alpha (Bug 6D fix)
      fxG.lineStyle(2, C_GHOST, alpha);
      fxG.lineBetween(line.fx, line.fy, line.tx, line.ty);
      // Ring pulse
      const radius = Math.min(P_RADIUS * 3, line.errorPx);
      fxG.strokeCircle(line.tx, line.ty, radius * (1 - alpha));
    }

    // Draw projectiles
    /* TEXTURE: projectile_trail
     * Replace with a sprite with trail effect.
     * Current: bright circle + fading trail drawn with line. */
    for (const proj of projectiles) {
      projG.fillStyle(C_PROJECTILE, 1);
      projG.fillCircle(proj.x, proj.y, PROJ_RADIUS);
      // Fading trail — guard against undefined dx/dy (Bug 3A fix)
      const dx = (proj as unknown as Record<string, number>).dx;
      const dy = (proj as unknown as Record<string, number>).dy;
      if (Number.isFinite(dx) && Number.isFinite(dy)) {
        const trailX = proj.x - dx * 12;
        const trailY = proj.y - dy * 12;
        if (Number.isFinite(trailX) && Number.isFinite(trailY)) {
          projG.lineStyle(2, C_PROJECTILE, 0.3);
          projG.lineBetween(trailX, trailY, proj.x, proj.y);
        }
      }
    }

    // Draw particles
    for (const p of this.particles) {
      const alpha = p.life / p.maxLife;
      fxG.fillStyle(p.color, alpha);
      fxG.fillCircle(p.x, p.y, p.size * alpha);
    }

    // Muzzle flash
    if (this.muzzleFlashTimer > 0) {
      const alpha = Math.min(1, this.muzzleFlashTimer / 100); // ms-based alpha (Bug 6D fix)
      fxG.fillStyle(0xffffff, alpha);
      fxG.fillCircle(this.muzzleFlashX, this.muzzleFlashY, 8 * alpha);
    }
  }

  private drawBackground(g: Phaser.GameObjects.Graphics): void {
    // Arena floor
    g.fillStyle(C_ARENA_BG, 1);
    g.fillRect(0, 0, ARENA_W, ARENA_H);

    // Grid floor (faint blue grid with slow pulse effect)
    /* TEXTURE: arena_floor_grid
     * Replace with a tiling texture asset.
     * Current: procedural grid lines. */
    const gridSize = 64;
    const pulse = 0.04 + 0.01 * Math.sin(Date.now() / 1500);
    g.lineStyle(1, C_GRID, pulse);
    for (let x = 0; x <= ARENA_W; x += gridSize) {
      g.lineBetween(x, 0, x, ARENA_H);
    }
    for (let y = 0; y <= ARENA_H; y += gridSize) {
      g.lineBetween(0, y, ARENA_W, y);
    }

    // Arena boundary glow
    g.lineStyle(3, C_OBSTACLE_EDGE, 0.8);
    g.strokeRect(0, 0, ARENA_W, ARENA_H);
  }

  private drawObstacles(g: Phaser.GameObjects.Graphics): void {
    /* TEXTURE: obstacle_dark_glass
     * Replace each obstacle with a 9-slice sprite with glowing violet edges.
     * Current: filled dark rect with glowing violet border. */
    for (const obs of OBSTACLES) {
      // Fill
      g.fillStyle(C_OBSTACLE_FILL, 0.95);
      g.fillRect(obs.x, obs.y, obs.w, obs.h);

      // Glow edge (draw multiple times with decreasing alpha for glow effect)
      for (let i = 3; i >= 0; i--) {
        g.lineStyle(2 + i, C_OBSTACLE_EDGE, 0.15 * (4 - i));
        g.strokeRect(obs.x - i, obs.y - i, obs.w + 2 * i, obs.h + 2 * i);
      }
      g.lineStyle(2, C_OBSTACLE_EDGE, 1);
      g.strokeRect(obs.x, obs.y, obs.w, obs.h);
    }
  }

  private drawRemotePlayer(g: Phaser.GameObjects.Graphics, p: PlayerSnap): void {
    if (!p.alive) return;

    const color = this.colorFor(p.id);

    if (p.protectMs > 0) {
      this.drawShieldRing(g, p.x, p.y, color);
    }

    /* TEXTURE: remote_player_sprite
     * Replace with a sprite sheet for remote players.
     * Current: glowing circle with chevron aim indicator. */
    // Glow halo
    g.fillStyle(color, 0.15);
    g.fillCircle(p.x, p.y, P_RADIUS + 8);
    g.fillStyle(color, 0.3);
    g.fillCircle(p.x, p.y, P_RADIUS + 4);

    // Body
    g.fillStyle(color, 1);
    g.fillCircle(p.x, p.y, P_RADIUS);

    // Inner ring
    g.lineStyle(2, 0xffffff, 0.5);
    g.strokeCircle(p.x, p.y, P_RADIUS - 4);

    // Name tag
    // (Text would be a Phaser Text object; for this procedural version we skip dynamic text in Graphics)

    // Score badge
  }

  private drawLocalPlayer(g: Phaser.GameObjects.Graphics, me: PlayerSnap): void {
    const rx = this.localX;
    const ry = this.localY;

    if (!me.alive) {
      // Respawn ring pulse
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 200);
      g.lineStyle(3, C_RESPAWN_RING, pulse);
      g.strokeCircle(rx, ry, P_RADIUS + 10 + 5 * pulse);
      return;
    }

    if (me.protectMs > 0) {
      this.drawShieldRing(g, rx, ry, C_SPAWN_PROTECT);
    }

    /* TEXTURE: local_player_sprite
     * Replace with a sprite for the local player.
     * Current: cyan glowing circle with aim chevron. */
    // Glow halo
    g.fillStyle(C_LOCAL_PLAYER, 0.1);
    g.fillCircle(rx, ry, P_RADIUS + 12);
    g.fillStyle(C_LOCAL_PLAYER, 0.25);
    g.fillCircle(rx, ry, P_RADIUS + 6);

    // Body
    g.fillStyle(C_LOCAL_PLAYER, 1);
    g.fillCircle(rx, ry, P_RADIUS);

    // Inner ring
    g.lineStyle(2, 0xffffff, 0.6);
    g.strokeCircle(rx, ry, P_RADIUS - 4);

    // Aim chevron
    const aim = this.netClient.aimAngle;
    const chevTip = P_RADIUS + 10;
    const chevWing = 6;
    const tx = rx + Math.cos(aim) * chevTip;
    const ty = ry + Math.sin(aim) * chevTip;
    const lx = rx + Math.cos(aim - 0.5) * (chevTip - chevWing);
    const ly = ry + Math.sin(aim - 0.5) * (chevTip - chevWing);
    const rx2 = rx + Math.cos(aim + 0.5) * (chevTip - chevWing);
    const ry2 = ry + Math.sin(aim + 0.5) * (chevTip - chevWing);

    g.fillStyle(C_LOCAL_PLAYER, 0.9);
    g.fillTriangle(tx, ty, lx, ly, rx2, ry2);

    // Pending inputs bar (below player)
    const pending = this.netClient.pendingCount;
    if (pending > 0) {
      const barW = Math.min(pending * 3, 40);
      const barH = 4;
      const barX = rx - 20;
      const barY = ry + P_RADIUS + 6;
      g.fillStyle(0x333333, 0.8);
      g.fillRect(barX, barY, 40, barH);
      g.fillStyle(C_LOCAL_PLAYER, 1);
      g.fillRect(barX, barY, barW, barH);
    }
  }

  private drawShieldRing(
    g: Phaser.GameObjects.Graphics,
    x: number, y: number,
    color: number
  ): void {
    /* TEXTURE: spawn_shield_ring
     * Replace with a rotating animated sprite.
     * Current: rotating dashed circle drawn procedurally. */
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
    color: number
  ): void {
    const segments = 16;
    g.lineStyle(1, color, 0.5);
    for (let i = 0; i < segments; i += 2) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      g.beginPath();
      g.arc(x, y, r, a0, a1, false);
      g.strokePath();
    }
  }

  private spawnDeathParticles(x: number, y: number, color: number): void {
    for (let i = 0; i < 28; i++) {
      const angle = (i / 28) * Math.PI * 2 + Math.random() * 0.2;
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
