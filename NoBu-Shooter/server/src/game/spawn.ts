/**
 * spawn.ts — spawn point selection algorithm.
 * GAMERULES.md §9.
 */

import { dist2 } from '@nobu/shared/sim';
import type { PlayerState } from './state.js';
import GAME from '@nobu/shared/config/game.js';

type Rng = () => number;

const spawnPoints: readonly { x: number; y: number }[] = GAME.spawnPoints;
const MIN_SEP = GAME.spawnMinSeparationPx;

export function pickSpawnPoint(
  players: Map<number, PlayerState>,
  rng: Rng,
  excludeId?: number
): { x: number; y: number } {
  const alivePositions: { x: number; y: number }[] = [];
  for (const [id, p] of players) {
    if (p.alive && id !== excludeId) {
      alivePositions.push({ x: p.x, y: p.y });
    }
  }

  function maxMinDist(sp: { x: number; y: number }): number {
    if (alivePositions.length === 0) return Infinity;
    let minD = Infinity;
    for (const ap of alivePositions) {
      const d = dist2(sp, ap);
      if (d < minD) minD = d;
    }
    return minD;
  }

  // Step 1: filter candidates farther than MIN_SEP from all alive players
  let candidates = spawnPoints.filter(sp => {
    for (const ap of alivePositions) {
      if (dist2(sp, ap) < MIN_SEP * MIN_SEP) return false;
    }
    return true;
  });

  // Step 4: if all discarded, use all 8
  if (candidates.length === 0) candidates = [...spawnPoints];

  // Step 3: choose candidate maximizing distance to nearest alive opponent
  let best = candidates[0];
  let bestScore = -1;
  for (const sp of candidates) {
    const score = maxMinDist(sp);
    if (score > bestScore || (score === bestScore && rng() < 0.5)) {
      best = sp;
      bestScore = score;
    }
  }

  return { x: best.x, y: best.y };
}
