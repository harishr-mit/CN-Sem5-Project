/**
 * state.ts — state sync (docs/PHASE3_PLAN.md D5): complete records plus each
 * entity's velocity, sent at 10 or 30 Hz. The client extrapolates from them
 * instead of interpolating (client/src/net/extrapolate.ts).
 */

import type { MsgSnap, MsgState, StateHz, StatePlayerSnap } from '../protocol/messages.js';
import GAME from '../config/game.js';

/** Velocity of an entity over the last tick, px/s (the room supplies it; not sent in full/delta). */
export interface Velocity { vx: number; vy: number }
export type VelocityTable = ReadonlyMap<number, Velocity>;

const ZERO: Velocity = { vx: 0, vy: 0 };

export class StateEncoder {
  /** Ticks between two state messages (snapshots are built every 2 ticks). */
  private readonly every: number;

  constructor(readonly hz: StateHz) {
    this.every = Math.round(GAME.sim.hz / hz);
  }

  /** A state message for this snapshot, or null when this tick is skipped. */
  encode(snap: MsgSnap, vel: VelocityTable): MsgState | null {
    if (snap.tick % this.every !== 0) return null;
    const players: StatePlayerSnap[] = snap.players.map((p) => {
      const v = vel.get(p.id) ?? ZERO;
      return { ...p, vx: v.vx, vy: v.vy };
    });
    return { ...snap, t: 'state', hz: this.hz, players };
  }
}

/** Client side: the plain snapshot and the velocities of a state message. */
export function stateToSnap(msg: MsgState): { snap: MsgSnap; vel: Map<number, Velocity>; hz: StateHz } {
  const vel = new Map<number, Velocity>();
  const players = msg.players.map(({ vx, vy, ...p }) => {
    vel.set(p.id, { vx, vy });
    return p;
  });
  const { hz, ...rest } = msg;
  return { snap: { ...rest, t: 'snap', players }, vel, hz };
}
