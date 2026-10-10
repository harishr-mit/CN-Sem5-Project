/**
 * delta.ts — delta snapshots against an acknowledged base (docs/PHASE3_PLAN.md D3).
 *
 * Server: DeltaEncoder remembers the last `ringSize` snapshots it sent to one
 * connection. Each new snapshot is sent as the changes since the newest one
 * the client acknowledged, if that one is still remembered and at most
 * `maxBaseAgeMs` old; otherwise as a complete `snap` (a fallback). Each delta
 * names its base, so loss, duplication and reordering can't corrupt it.
 *
 * Events: the room keeps only the last 500 ms of events, but acks under a bad
 * link can take longer than that. So the encoder logs every event it has sent
 * until the client acknowledges a snapshot containing it, and repeats the
 * unconfirmed ones in every delta and fallback. (A first version limited the
 * base age to 500 ms instead; under Nightmare a late ack then forced a full
 * snapshot, which filled the 400 kbps queue, which delayed the next ack —
 * a loop that left delta sending full snapshots.)
 *
 * Client: DeltaDecoder keeps the snapshots it decoded (full or delta) and
 * rebuilds full snapshots from deltas. `newestTick` is what it acknowledges.
 */

import type { GameEvent, MsgSnap, MsgSnapDelta } from '../protocol/messages.js';
import NET from '../config/net.js';
import { diffFields, diffList, patchFields, patchList } from './diff.js';

interface SentEntry {
  tick: number;
  st: number;
  /** The snapshot as sent, without events (the room's events array is live, see PHASE3_PLAN.md §3). */
  snap: Omit<MsgSnap, 'events'>;
  /** Highest event id the client has been sent up to and including this snapshot. */
  maxEid: number;
}

export interface DeltaEncoderCfg {
  ringSize: number;
  maxBaseAgeMs: number;
}

/** Upper bound of the unconfirmed-event log (a client that never acks can't grow it forever). */
const EVENT_LOG_MAX = 512;

export class DeltaEncoder {
  private ring: SentEntry[] = [];
  private ackedTick = -1;
  private maxEid = 0;
  /** Events sent but not yet confirmed by an ack, oldest first. */
  private eventLog: GameEvent[] = [];
  /** Every event up to this id is confirmed (contained in an acknowledged snapshot). */
  private ackedMaxEid = 0;
  /** Complete snapshots sent and deltas sent. */
  fullsSent = 0;
  deltasSent = 0;
  /** Complete snapshots sent although the client had acknowledged one (its base was lost or too old). */
  fallbacks = 0;

  constructor(private readonly cfg: DeltaEncoderCfg = NET.delta) {}

  /** The client has decoded snapshot `tick` (acks may arrive late or out of order). */
  onAck(tick: number): void {
    if (tick <= this.ackedTick) return;
    this.ackedTick = tick;
    const entry = this.ring.find((e) => e.tick === tick);
    if (entry && entry.maxEid > this.ackedMaxEid) {
      this.ackedMaxEid = entry.maxEid;
      this.eventLog = this.eventLog.filter((e) => e.eid > this.ackedMaxEid);
    }
  }

  encode(snap: MsgSnap): MsgSnap | MsgSnapDelta {
    let maxEid = this.maxEid;
    for (const ev of snap.events) {
      if (ev.eid <= this.maxEid) continue;
      this.eventLog.push(ev);
      if (ev.eid > maxEid) maxEid = ev.eid;
    }
    if (this.eventLog.length > EVENT_LOG_MAX) this.eventLog.splice(0, this.eventLog.length - EVENT_LOG_MAX);

    const base = this.ring.find((e) => e.tick === this.ackedTick);
    const usable = base !== undefined && base.tick < snap.tick && snap.st - base.st <= this.cfg.maxBaseAgeMs;

    const { events: _events, ...rest } = snap;
    this.ring.push({ tick: snap.tick, st: snap.st, snap: rest, maxEid });
    if (this.ring.length > this.cfg.ringSize) this.ring.shift();
    this.maxEid = maxEid;

    if (!usable) {
      this.fullsSent++;
      // Before the first ack every snapshot is complete; that is start-up, not a fallback
      if (this.ackedTick >= 0) this.fallbacks++;
      // The room's 500 ms of events plus any older ones the client hasn't confirmed
      const inSnap = new Set(snap.events.map((e) => e.eid));
      const older = this.eventLog.filter((e) => e.eid > this.ackedMaxEid && !inSnap.has(e.eid));
      return older.length ? { ...snap, events: [...older, ...snap.events] } : snap;
    }
    this.deltasSent++;
    return makeDelta(base.snap, base.maxEid, snap, this.eventLog);
  }
}

/**
 * The delta from `base` to `next`. Events: those newer than `baseMaxEid`, taken
 * from `eventLog` (the encoder's unconfirmed events) or else from `next`.
 */
export function makeDelta(
  base: Omit<MsgSnap, 'events'>, baseMaxEid: number, next: MsgSnap, eventLog: readonly GameEvent[] = next.events,
): MsgSnapDelta {
  const d: MsgSnapDelta = { t: 'snapDelta', tick: next.tick, base: base.tick, st: next.st, ack: next.ack };
  const match = diffFields(base.match, next.match);
  if (match) d.match = match;
  const players = diffList(base.players, next.players);
  if (players.changed.length) d.players = players.changed;
  if (players.gone.length) d.gone = players.gone;
  const projectiles = diffList(base.projectiles, next.projectiles);
  if (projectiles.changed.length) d.projectiles = projectiles.changed;
  if (projectiles.gone.length) d.projGone = projectiles.gone;
  if (JSON.stringify(base.pickups) !== JSON.stringify(next.pickups)) d.pickups = next.pickups;
  if (next.me && base.me) {
    const me = diffFields(base.me, next.me);
    if (me) d.me = me;
  } else if (next.me) d.me = { ...next.me };
  else if (base.me) d.me = null;
  const events = eventLog.filter((e) => e.eid > baseMaxEid);
  if (events.length) d.events = events;
  return d;
}

/** Apply a delta to its base. `events` holds only the delta's (new) events. */
export function applyDelta(base: MsgSnap, d: MsgSnapDelta): MsgSnap {
  const snap: MsgSnap = {
    t: 'snap',
    tick: d.tick,
    st: d.st,
    ack: d.ack,
    match: d.match ? patchFields(base.match, d.match) : base.match,
    players: patchList(base.players, d.players, d.gone),
    projectiles: patchList(base.projectiles, d.projectiles, d.projGone),
    pickups: d.pickups ?? base.pickups,
    events: d.events ?? [],
  };
  if (d.me === undefined) { if (base.me) snap.me = base.me; }
  else if (d.me !== null) snap.me = base.me ? patchFields(base.me, d.me) : (d.me as MsgSnap['me']);
  return snap;
}

export class DeltaDecoder {
  private ring = new Map<number, MsgSnap>();
  /** Newest snapshot tick decoded (what the client acknowledges); -1 = none. */
  newestTick = -1;
  /** Deltas whose base this decoder no longer (or never) had. */
  missingBase = 0;

  constructor(private readonly size: number = NET.delta.clientRingSize) {}

  /** Remember a complete snapshot (a `snap`, or a decoded delta). */
  store(snap: MsgSnap): void {
    if (this.ring.has(snap.tick)) return;
    this.ring.set(snap.tick, snap);
    if (snap.tick > this.newestTick) this.newestTick = snap.tick;
    while (this.ring.size > this.size) {
      // Evict the oldest tick (Map order is arrival order, which reordering can break)
      let oldest = Infinity;
      for (const t of this.ring.keys()) if (t < oldest) oldest = t;
      this.ring.delete(oldest);
    }
  }

  /** Rebuild the full snapshot, or null when the base is unknown (counted). */
  decode(d: MsgSnapDelta): MsgSnap | null {
    const known = this.ring.get(d.tick);
    if (known) return { ...known, events: d.events ?? [] }; // duplicate
    const base = this.ring.get(d.base);
    if (!base) { this.missingBase++; return null; }
    const snap = applyDelta(base, d);
    this.store(snap);
    return snap;
  }

  reset(): void {
    this.ring.clear();
    this.newestTick = -1;
  }
}
