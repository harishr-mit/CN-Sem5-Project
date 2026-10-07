/**
 * bots.ts — simple bot AI.
 * GAMERULES.md §12.
 * Bots are real participants: they produce inputs in the same format as humans.
 * Bot traffic is server-local and bypasses the network emulator.
 */

import { mulberry32 } from '@nobu/shared/sim';
import { KEY } from '@nobu/shared/sim';
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
}

const BOT_HZ = GAME.sim.hz;
const WANDER_INTERVAL_TICKS = Math.round(1.5 * BOT_HZ);
const STUCK_CHECK_TICKS = BOT_HZ; // 1 s
const STUCK_THRESHOLD = 20;
const REACTION_TICKS = Math.round(GAME.bots.reactionMs * BOT_HZ / 1000);
const AIM_ERROR_RAD = (GAME.bots.aimErrorDeg * Math.PI) / 180;
const SIGHT_RANGE = GAME.bots.sightRange;

const spawnPoints: { x: number; y: number }[] = GAME.spawnPoints;

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
        if (d < SIGHT_RANGE && d < nearestDist) {
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

        if (bot.reactionTicksLeft <= 0) {
          fireFlag = 1;
          // Aim toward target — override wander
          bot.targetX = target.x;
          bot.targetY = target.y;
        }
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
          // Pick new target
          const t = randomArenaPoint(this.rng);
          bot.targetX = t.x;
          bot.targetY = t.y;
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
      const dxT = bot.targetX - self.x;
      const dyT = bot.targetY - self.y;
      let keys = 0;
      const ARRIVE = 12;
      if (Math.abs(dxT) > ARRIVE || Math.abs(dyT) > ARRIVE) {
        if (dxT > ARRIVE)  keys |= KEY.RIGHT;
        if (dxT < -ARRIVE) keys |= KEY.LEFT;
        if (dyT > ARRIVE)  keys |= KEY.DOWN;
        if (dyT < -ARRIVE) keys |= KEY.UP;
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
