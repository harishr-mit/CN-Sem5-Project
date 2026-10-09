/**
 * bots.ts — simple bot AI.
 * GAMERULES.md §12.
 * Bots are real participants: they produce inputs in the same format as humans.
 * Bot traffic is server-local and bypasses the network emulator.
 */

import { mulberry32, segmentIntersectsRect } from '@nobu/shared/sim';
import { KEY } from '@nobu/shared/sim';
import type { Rect } from '@nobu/shared/sim';
import type { InputEntry } from '@nobu/shared/protocol';
import type { PlayerState } from './game/state.js';
import GAME from '@nobu/shared/config/game.js';

type Rng = () => number;

interface BotInternal {
  playerId: number;
  targetX: number;
  targetY: number;
  /** server ticks until next wander target pick. */
  wanderTicksLeft: number;
  /** If currently tracking a target: ticks since first sighting. */
  reactionTicksLeft: number;
  trackingId: number | null;
  stuckX: number;
  stuckY: number;
  stuckTicksLeft: number;
  /** +1 / -1: which way to circle around the current target. */
  strafeSign: number;
  strafeTicksLeft: number;
}

const BOT_HZ = GAME.sim.hz;
const WANDER_INTERVAL_TICKS = Math.round(1.5 * BOT_HZ);
const STUCK_CHECK_TICKS = BOT_HZ; // 1 s
const STUCK_THRESHOLD = 20;
const REACTION_TICKS = Math.round(GAME.bots.reactionMs * BOT_HZ / 1000);
const AIM_ERROR_RAD = (GAME.bots.aimErrorDeg * Math.PI) / 180;
const SIGHT_RANGE = GAME.bots.sightRange;
/** Preferred engagement distance band while strafing a target. */
const ENGAGE_MIN = 180;
const ENGAGE_MAX = 380;
const STRAFE_FLIP_TICKS = Math.round(1.2 * BOT_HZ);

/** Obstacles expanded by the projectile radius: a shot along a segment that
 *  misses these also misses the real obstacle (GAMERULES.md §7). */
const SHOT_BLOCKERS: Rect[] = (GAME.obstacles as readonly Rect[]).map((o) => ({
  x: o.x - GAME.projectile.radius,
  y: o.y - GAME.projectile.radius,
  w: o.w + 2 * GAME.projectile.radius,
  h: o.h + 2 * GAME.projectile.radius,
}));

function hasLineOfSight(ax: number, ay: number, bx: number, by: number): boolean {
  const a = { x: ax, y: ay };
  const b = { x: bx, y: by };
  for (const r of SHOT_BLOCKERS) if (segmentIntersectsRect(a, b, r)) return false;
  return true;
}

/** Turn a direction vector into the 8-way key bitmask. */
function keysToward(dx: number, dy: number): number {
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-6) return 0;
  const nx = dx / len;
  const ny = dy / len;
  let keys = 0;
  if (nx > 0.38) keys |= KEY.RIGHT;
  if (nx < -0.38) keys |= KEY.LEFT;
  if (ny > 0.38) keys |= KEY.DOWN;
  if (ny < -0.38) keys |= KEY.UP;
  return keys;
}

const spawnPoints: readonly { x: number; y: number }[] = GAME.spawnPoints;

function randomArenaPoint(rng: Rng): { x: number; y: number } {
  // Prefer spawn points for wander targets (gives natural movement)
  if (rng() < 0.6) {
    return spawnPoints[Math.floor(rng() * spawnPoints.length)];
  }
  return {
    x: 40 + rng() * (GAME.arena.width - 80),
    y: 40 + rng() * (GAME.arena.height - 80),
  };
}

export class BotController {
  private rng: Rng;
  private bots = new Map<number, BotInternal>();

  constructor() {
    this.rng = mulberry32(GAME.bots.seed);
  }

  addBot(playerId: number): void {
    const target = randomArenaPoint(this.rng);
    this.bots.set(playerId, {
      playerId,
      targetX: target.x,
      targetY: target.y,
      wanderTicksLeft: Math.floor(this.rng() * WANDER_INTERVAL_TICKS),
      reactionTicksLeft: 0,
      trackingId: null,
      stuckX: 0,
      stuckY: 0,
      stuckTicksLeft: STUCK_CHECK_TICKS,
      strafeSign: this.rng() < 0.5 ? 1 : -1,
      strafeTicksLeft: STRAFE_FLIP_TICKS,
    });
  }

  removeBot(playerId: number): void {
    this.bots.delete(playerId);
  }

  /**
   * Produce one InputEntry per bot for this tick.
   * Returns map: playerId → InputEntry.
   * The `seq` numbers are tracked externally (in the room).
   */
  tick(
    players: Map<number, PlayerState>,
    seqMap: Map<number, number>
  ): Map<number, InputEntry> {
    const result = new Map<number, InputEntry>();

    for (const [id, bot] of this.bots) {
      const self = players.get(id);
      if (!self || !self.alive) {
        // Still produce a no-op input to advance the sequence
        const s = (seqMap.get(id) ?? 0) + 1;
        seqMap.set(id, s);
        result.set(id, { s, k: 0, a: 0, f: 0 });
        continue;
      }

      let fireFlag: 0 | 1 = 0;
      let aimAngle = 0;

      // ── sight check ─────────────────────────────────────────
      let nearestDist = Infinity;
      let nearestId: number | null = null;
      for (const [pid, p] of players) {
        if (pid === id || !p.alive || p.protectionTicksLeft > 0) continue;
        const dx = p.x - self.x;
        const dy = p.y - self.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < SIGHT_RANGE && d < nearestDist && hasLineOfSight(self.x, self.y, p.x, p.y)) {
          nearestDist = d;
          nearestId = pid;
        }
      }

      if (nearestId !== null) {
        const target = players.get(nearestId)!;
        const dx = target.x - self.x;
        const dy = target.y - self.y;
        const baseAngle = Math.atan2(dy, dx);
        // Apply random aim error (fixed per bot, seeded)
        const error = (this.rng() * 2 - 1) * AIM_ERROR_RAD;
        aimAngle = baseAngle + error;

        if (bot.trackingId !== nearestId) {
          bot.trackingId = nearestId;
          bot.reactionTicksLeft = REACTION_TICKS;
        } else if (bot.reactionTicksLeft > 0) {
          bot.reactionTicksLeft--;
        }

        if (bot.reactionTicksLeft <= 0) fireFlag = 1;
      } else {
        bot.trackingId = null;
        bot.reactionTicksLeft = 0;
      }

      // ── wander ──────────────────────────────────────────────
      bot.stuckTicksLeft--;
      if (bot.stuckTicksLeft <= 0) {
        const movedX = Math.abs(self.x - bot.stuckX);
        const movedY = Math.abs(self.y - bot.stuckY);
        if (movedX + movedY < STUCK_THRESHOLD) {
          // Pick a new wander target and circle the other way
          const t = randomArenaPoint(this.rng);
          bot.targetX = t.x;
          bot.targetY = t.y;
          bot.strafeSign = -bot.strafeSign;
        }
        bot.stuckX = self.x;
        bot.stuckY = self.y;
        bot.stuckTicksLeft = STUCK_CHECK_TICKS;
      }

      bot.wanderTicksLeft--;
      if (bot.wanderTicksLeft <= 0) {
        if (bot.trackingId === null) {
          const t = randomArenaPoint(this.rng);
          bot.targetX = t.x;
          bot.targetY = t.y;
        }
        bot.wanderTicksLeft = Math.floor(
          WANDER_INTERVAL_TICKS * (0.5 + this.rng() * 1.0)
        );
      }

      // ── movement keys ────────────────────────────────────────
      let keys = 0;
      const target = bot.trackingId !== null ? players.get(bot.trackingId) : undefined;
      if (target) {
        // Engaged: strafe around the target, keeping a distance band.
        bot.strafeTicksLeft--;
        if (bot.strafeTicksLeft <= 0) {
          if (this.rng() < 0.5) bot.strafeSign = -bot.strafeSign;
          bot.strafeTicksLeft = Math.floor(STRAFE_FLIP_TICKS * (0.6 + this.rng() * 0.8));
        }
        const tx = target.x - self.x;
        const ty = target.y - self.y;
        const d = Math.sqrt(tx * tx + ty * ty) || 1;
        const radial = d > ENGAGE_MAX ? 1 : d < ENGAGE_MIN ? -1 : 0;
        const mx = (tx / d) * radial + (-ty / d) * bot.strafeSign;
        const my = (ty / d) * radial + (tx / d) * bot.strafeSign;
        keys = keysToward(mx, my);
      } else {
        const dxT = bot.targetX - self.x;
        const dyT = bot.targetY - self.y;
        if (Math.abs(dxT) > 12 || Math.abs(dyT) > 12) keys = keysToward(dxT, dyT);
      }

      const s = (seqMap.get(id) ?? 0) + 1;
      seqMap.set(id, s);
      result.set(id, {
        s,
        k: keys,
        a: Math.round(aimAngle * 1000) / 1000,
        f: fireFlag,
      });
    }

    return result;
  }
}
