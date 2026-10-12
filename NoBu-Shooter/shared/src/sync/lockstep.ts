/**
 * lockstep.ts — deterministic lockstep for the lab room (PHASES.md L1,
 * docs/PHASE6_PLAN.md D2–D6).
 *
 * The server relays, for every tick, the movement keys it consumed for each
 * player (a LockstepRecord). A client that applies the records in order with
 * the shared movement code (applyRecord) reproduces the server's lab world
 * bit for bit. Things that inputs don't explain (join, leave, nudge, restart,
 * map, movers) travel as keyframes inside the same tick stream.
 *
 * - LockstepLog: the server's ring of the last records.
 * - LockstepEncoder: per connection, what to send (records once + resend on
 *   request, or a redundant window), keyframes for a start or a resync.
 * - applyRecord / worldFromKeyframe / worldHash: the replay both sides agree on.
 */

import { stepPlayer } from '../sim/movement.js';
import { moverPath, type MoverCfg, type MoverPattern } from '../sim/movers.js';
import { hashWorld, type HashEntity } from '../sim/hash.js';
import type { MoveCfg } from '../sim/movement.js';
import GAME, { mapDef, type MapId } from '../config/game.js';
import NET from '../config/net.js';
import type { Keyframe, LockstepRecord, LsPlayer, MsgLs } from '../protocol/messages.js';

export type { Keyframe, LockstepRecord, LsPlayer, LsMover, MsgLs, MsgLsNack } from '../protocol/messages.js';

const SIM_HZ = GAME.sim.hz;
const LAB_MOVER_CFG: MoverCfg = { speed: GAME.lab.moverSpeed, stopGo: GAME.lab.stopGo };

/** Movement settings of a map, exactly as the server's Room builds them (lab: no speed power-up). */
export function labMoveCfg(map: MapId): MoveCfg {
  return {
    speed: GAME.player.speed,
    radius: GAME.player.radius,
    arenaW: GAME.arena.width,
    arenaH: GAME.arena.height,
    obstacles: [...mapDef(map).obstacles],
    hz: SIM_HZ,
  };
}

/** A mover with its position at the world's tick. */
export interface LabMover {
  id: number;
  pattern: MoverPattern;
  x: number;
  y: number;
}

/** The lab world a lockstep client replays (players move, movers follow their path). */
export interface LabWorld {
  /** The tick this world is the result of. */
  tick: number;
  map: MapId;
  moveCfg: MoveCfg;
  players: Map<number, LsPlayer>;
  movers: LabMover[];
}

/** Position of every mover at `tick` (the server's Room does the same each tick). */
export function moverPosAt(pattern: MoverPattern, tick: number): { x: number; y: number } {
  return moverPath(pattern, tick / SIM_HZ, LAB_MOVER_CFG);
}

export function worldFromKeyframe(key: Keyframe, tick: number): LabWorld {
  return {
    tick,
    map: key.map,
    moveCfg: labMoveCfg(key.map),
    players: new Map(key.players.map((p) => [p.id, { ...p }])),
    movers: key.movers.map((m) => ({ id: m.id, pattern: m.pattern, ...moverPosAt(m.pattern, tick) })),
  };
}

/**
 * Apply tick `rec.k` to `world` (which must be the result of tick rec.k − 1,
 * unless the record carries a keyframe). Returns the world (the same object,
 * or a new one for a keyframe).
 */
export function applyRecord(world: LabWorld | null, rec: LockstepRecord): LabWorld {
  if (rec.key) return worldFromKeyframe(rec.key, rec.k);
  if (!world) throw new Error(`lockstep: tick ${rec.k} without a world`);
  if (rec.in) {
    for (const [id, keys] of Object.entries(rec.in)) {
      const p = world.players.get(Number(id));
      if (!p) continue;
      for (const k of keys) {
        const pos = stepPlayer({ x: p.x, y: p.y }, k, world.moveCfg);
        p.x = pos.x;
        p.y = pos.y;
      }
    }
  }
  world.tick = rec.k;
  for (const m of world.movers) {
    const pos = moverPosAt(m.pattern, rec.k);
    m.x = pos.x;
    m.y = pos.y;
  }
  return world;
}

/** hashWorld over the world's players and movers (docs/PHASE6_PLAN.md D6). */
export function worldHash(world: LabWorld): number {
  const all: HashEntity[] = [...world.players.values(), ...world.movers];
  return hashWorld(all);
}

/** The record source a LockstepEncoder reads (the server's ring). */
export interface RecordSource {
  /** Newest tick recorded (−1 = none yet). */
  readonly newest: number;
  /** Oldest tick still held. */
  readonly oldest: number;
  get(tick: number): LockstepRecord | undefined;
}

/** The server's ring of the last `size` tick records (docs/PHASE6_PLAN.md D3). */
export class LockstepLog implements RecordSource {
  private readonly ring: (LockstepRecord | undefined)[];
  newest = -1;

  constructor(readonly size: number = NET.lockstep.ringTicks) {
    this.ring = new Array(size);
  }

  /** Records must be pushed in tick order, one per tick. */
  push(rec: LockstepRecord): void {
    this.ring[rec.k % this.size] = rec;
    this.newest = rec.k;
  }

  get oldest(): number {
    if (this.newest < 0) return 0;
    let t = Math.max(0, this.newest - this.size + 1);
    while (t <= this.newest && this.ring[t % this.size]?.k !== t) t++;
    return t;
  }

  get(tick: number): LockstepRecord | undefined {
    const r = this.ring[tick % this.size];
    return r && r.k === tick ? r : undefined;
  }
}

export interface LockstepEncoderStats {
  /** Messages sent. */
  msgs: number;
  /** Records sent more than once (NACK resends or the redundant window). */
  resent: number;
  /** Keyframes made for this connection (start + resyncs). */
  keyframes: number;
  /** Resyncs: keyframes after the start (too far behind, NACK beyond the ring, key requested). */
  resyncs: number;
}

/**
 * What one lockstep connection receives (docs/PHASE6_PLAN.md D3, D4).
 *
 * - On start (and on a resync) it makes a **base**: a keyframe of the world
 *   after the current tick, repeated in every message until the client acks
 *   that tick (so a lost base costs one send interval, in either mode).
 * - **Rd off** — each record is sent once; `onNack` queues a range to resend.
 * - **Rd on** — every message carries every record after the client's ack,
 *   at most `windowMaxTicks`; further behind than that → a resync.
 * - A request for a tick the ring no longer holds → a resync.
 */
export class LockstepEncoder {
  rd: boolean;
  /** Newest tick the client holds every record up to (its ack). */
  private acked = -1;
  /** Newest tick sent (Rd off). */
  private sentTo = -1;
  private base: LockstepRecord | null = null;
  private needKey = true;
  private nacks: [number, number][] = [];
  private everSent = new Set<number>();
  readonly stats: LockstepEncoderStats = { msgs: 0, resent: 0, keyframes: 0, resyncs: 0 };

  constructor(rd = false, private readonly windowMax: number = NET.lockstep.windowMaxTicks) {
    this.rd = rd;
  }

  get ackTick(): number { return this.acked; }

  /** The client's newest contiguous tick (snapAck / input.sa). Never moves backwards. */
  onAck(tick: number): void {
    if (tick > this.acked) this.acked = tick;
  }

  /** Resend ticks `from`..`to` (Rd off), or make a fresh keyframe (`key`). */
  onNack(from: number, to: number, key = false): void {
    if (key) {
      this.requestKey();
      return;
    }
    this.nacks.push([from, to]);
  }

  /** Start over from a keyframe (the client's world is unknown from now on). */
  requestKey(): void {
    this.needKey = true;
    this.acked = -1;
    this.nacks = [];
  }

  /**
   * The message for this send, or null when there is nothing yet.
   * `makeKey` builds the keyframe of the world after `log.newest`.
   * `seqAck` = the receiver's newest consumed input sequence.
   */
  encode(log: RecordSource, makeKey: () => Keyframe, seqAck: number): MsgLs | null {
    const tick = log.newest;
    if (tick < 0) return null;
    const out = new Map<number, LockstepRecord>();

    // Rd on: far behind → resync; Rd off: a requested tick the ring has lost → resync
    if (!this.needKey && this.base && this.acked >= this.base.k) {
      if (this.rd && tick - this.acked > this.windowMax) this.resync();
      if (!this.rd && this.nacks.some(([from, to]) => to > this.acked && Math.max(from, this.acked + 1) < log.oldest)) this.resync();
    }
    if (!this.needKey && this.base && this.acked < this.base.k && tick - this.base.k > this.windowMax) this.resync();

    if (this.needKey) {
      if (this.base) this.stats.resyncs++;
      this.base = { k: tick, key: makeKey() };
      this.stats.keyframes++;
      this.needKey = false;
      this.sentTo = tick;
      this.nacks = [];
    }
    const base = this.base!;
    // The base repeats until acknowledged; records start after it
    if (this.acked < base.k) out.set(base.k, base);
    const after = Math.max(base.k, this.acked);

    if (this.rd) {
      for (let k = after + 1; k <= tick; k++) {
        const r = log.get(k);
        if (r) out.set(k, r);
      }
    } else {
      for (const [from, to] of this.nacks) {
        for (let k = Math.max(from, after + 1); k <= Math.min(to, tick); k++) {
          const r = log.get(k);
          if (r) out.set(k, r);
        }
      }
      this.nacks = [];
      for (let k = Math.max(this.sentTo, after) + 1; k <= tick; k++) {
        const r = log.get(k);
        if (r) out.set(k, r);
      }
      this.sentTo = tick;
    }

    const recs = [...out.values()].sort((a, b) => a.k - b.k);
    for (const r of recs) {
      if (r === base) continue;
      if (this.everSent.has(r.k)) this.stats.resent++;
      else this.everSent.add(r.k);
    }
    // Forget ticks that can never be resent
    if (this.everSent.size > 2 * NET.lockstep.ringTicks) {
      for (const k of this.everSent) if (k < tick - NET.lockstep.ringTicks) this.everSent.delete(k);
    }
    this.stats.msgs++;
    return { t: 'ls', tick, ack: seqAck, recs };
  }

  private resync(): void {
    this.needKey = true;
    this.acked = -1;
  }
}
