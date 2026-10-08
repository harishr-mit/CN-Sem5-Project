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
import type { PlayerSnap, ProjectileSnap, GameEvent } from '@nobu/shared/protocol';
import GAME from '@nobu/shared/config/game';

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
  0x00e5ff, // cyan (fallback only — local player uses this)
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

  // Keyboard keys (Bug 2A fix — stored as class fields, polled in update())
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyUp!: Phaser.Input.Keyboard.Key;
  private keyDown!: Phaser.Input.Keyboard.Key;
  private keyLeft!: Phaser.Input.Keyboard.Key;
  private keyRight!: Phaser.Input.Keyboard.Key;

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

  // Fixed sim accumulator
  private accumMs = 0;
  private lastTickMs = 0;
  private inputSendAccum = 0;
  // metricsAccum removed — NetworkLab drives updateMetrics() (Bug 6A fix)

  constructor(config: Phaser.Types.Scenes.SettingsConfig & { netClient: NetClient }) {
    super({ key: 'ArenaScene', ...config });
    this.netClient = (config as unknown as { netClient: NetClient }).netClient;
  }

  init(data: { netClient: NetClient }): void {
    if (data.netClient) this.netClient = data.netClient;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(C_ARENA_BG);

    // Layers (draw order)
    this.bgGraphics    = this.add.graphics();
    this.ghostGraphics = this.add.graphics();
    this.projGraphics  = this.add.graphics();
    this.playerGraphics = this.add.graphics();
    this.fxGraphics    = this.add.graphics();

    // Input — pointer uses worldX/Y to stay in game/arena-space (Bug 2B fix)
    this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => {
      // ptr.worldX/Y are already in Phaser game-space (not CSS screen pixels).
      // me.x/me.y are also in game-space, so the atan2 is now correct at any
      // window size when Phaser.Scale.FIT is active.
      const me = this.netClient.latestSnapshot?.players.find(
        p => p.id === this.netClient.myPlayerId
      );
      if (me) {
        this.netClient.aimAngle = Math.atan2(ptr.worldY - me.y, ptr.worldX - me.x);
      }
    });
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (ptr.leftButtonDown()) this.netClient.fireDown = true;
    });
    this.input.on('pointerup', () => { this.netClient.fireDown = false; });

    // Keyboard — store refs so we can poll them inside update() (Bug 2A fix)
    const kb = this.input.keyboard!;
    this.keyW     = kb.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA     = kb.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS     = kb.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD     = kb.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyUp    = kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.keyDown  = kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    this.keyLeft  = kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
    this.keyRight = kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);

    // Clean up key objects on scene shutdown to prevent stale refs on restart (Bug 2A fix)
    this.events.once('shutdown', () => {
      kb.removeAllKeys(true);
    });

    // Correction callback
    this.netClient.onCorrection = (ev: CorrectionEvent) => {
      this.correctionLines.push({
        fx: ev.fromX, fy: ev.fromY,
        tx: ev.toX, ty: ev.toY,
        life: 1000, errorPx: ev.errorPx, // 1000 ms lifetime (Bug 6D fix)
      });
    };

    // Muzzle flash callback — use renderX/Y (predicted pos) not snapshot me.x/y
    // so the flash stays aligned with the visually-displayed player (Bug 2B fix)
    this.netClient.onFire = () => {
      const hasPlayer = this.netClient.latestSnapshot?.players.some(
        p => p.id === this.netClient.myPlayerId
      );
      if (hasPlayer) {
        this.muzzleFlashTimer = 100; // ms (converted to time-based, Bug 6D fix)
        this.muzzleFlashX = this.netClient.renderX + Math.cos(this.netClient.aimAngle) * (P_RADIUS + 10);
        this.muzzleFlashY = this.netClient.renderY + Math.sin(this.netClient.aimAngle) * (P_RADIUS + 10);
      }
    };

    // Game events
    this.netClient.onEvent = (ev: GameEvent) => {
      if (ev.type === 'PLAYER_DEATH' && ev.x !== undefined && ev.y !== undefined) {
        this.spawnDeathParticles(ev.x, ev.y);
        // Camera shake on own death
        if (ev.victim === this.netClient.myPlayerId) {
          this.cameras.main.shake(150, 0.006);
        }
      }
      if (ev.type === 'PROJECTILE_HIT' && ev.x !== undefined && ev.y !== undefined) {
        this.spawnHitSparks(ev.x, ev.y);
      }
    };

    this.lastTickMs = this.time.now;
  }

  update(time: number, delta: number): void {
    const nowMs = time;
    const dt = delta;

    // ── Poll keyboard (Bug 2A fix: moved here from events.on('update')) ────
    let keys = 0;
    if (this.keyW?.isDown  || this.keyUp?.isDown)    keys |= 1; // UP
    if (this.keyS?.isDown  || this.keyDown?.isDown)  keys |= 2; // DOWN
    if (this.keyA?.isDown  || this.keyLeft?.isDown)  keys |= 4; // LEFT
    if (this.keyD?.isDown  || this.keyRight?.isDown) keys |= 8; // RIGHT
    this.netClient.keys = keys;

    // ── Fixed sim accumulator (60 Hz) ────────────────────────
    this.accumMs += dt;
    while (this.accumMs >= (1000 / GAME.sim.hz)) {
      this.netClient.simStep(nowMs);
      this.accumMs -= (1000 / GAME.sim.hz);
    }

    // ── Input send (30 Hz) ───────────────────────────────────
    this.inputSendAccum += dt;
    if (this.inputSendAccum >= (1000 / 30)) {
      this.netClient.sendInputs();
      this.inputSendAccum -= (1000 / 30);
    }

    // updateMetrics() removed from here (Bug 6A fix) — NetworkLab.tsx drives it at 5 Hz

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
    this.render(nowMs);

    // ── Decay effects (Bug 6D fix: use delta ms, not frame count) ────────
    if (this.muzzleFlashTimer > 0) this.muzzleFlashTimer = Math.max(0, this.muzzleFlashTimer - dt);
    this.particles = this.particles.filter(p => p.life > 0);
    // Correction lines also use ms lifetime now
    this.correctionLines = this.correctionLines.filter(l => l.life > 0);
    for (const p of this.particles) {
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.92; p.vy *= 0.92;
      p.life -= dt; // ms-based
    }
    for (const l of this.correctionLines) l.life -= dt; // ms-based
  }

  private render(nowMs: number): void {
    const g = this.bgGraphics;
    const pg = this.playerGraphics;
    const projG = this.projGraphics;
    const fxG = this.fxGraphics;
    const ghost = this.ghostGraphics;

    g.clear(); pg.clear(); projG.clear(); fxG.clear(); ghost.clear();

    this.drawBackground(g);
    this.drawObstacles(g);

    const { players, projectiles } = this.netClient.getInterpolatedState(nowMs);
    const snap = this.netClient.latestSnapshot;
    const myId = this.netClient.myPlayerId;

    // Draw remote players
    for (const p of players) {
      if (p.id === myId) continue;
      this.drawRemotePlayer(pg, p);
    }

    // Draw local player
    const me = snap?.players.find(p => p.id === myId);
    if (me) {
      this.drawLocalPlayer(pg, me);
    }

    // Draw ghost (SPEC.md §13.4)
    if (this.netClient.toggles.ghost && myId !== null) {
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

    const color = PLAYER_COLORS[p.id % PLAYER_COLORS.length];

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
    const rx = this.netClient.renderX;
    const ry = this.netClient.renderY;

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
    const pending = this.netClient.metrics.pendingInputs;
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

  private spawnDeathParticles(x: number, y: number): void {
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      const speed = 2 + Math.random() * 4;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 40, maxLife: 40,
        color: C_LOCAL_PLAYER,
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
        life: 20, maxLife: 20,
        color: 0xffffff,
        size: 2,
      });
    }
  }
}
