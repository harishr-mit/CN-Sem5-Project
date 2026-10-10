/**
 * Sync models (PHASES.md Phase 3, docs/PHASE3_PLAN.md): one server encoder
 * per connection turns each snapshot the room builds into what goes on the wire.
 */

import type { MsgSnap, MsgSnapDelta, MsgState } from '../protocol/messages.js';
import { DeltaEncoder } from './delta.js';
import { StateEncoder, type VelocityTable } from './state.js';
import { normalizeSync, type SyncSpec } from './types.js';

export * from './types.js';
export { diffFields, patchFields, diffList, patchList } from './diff.js';
export { DeltaEncoder, DeltaDecoder, makeDelta, applyDelta } from './delta.js';
export { StateEncoder, stateToSnap, type Velocity, type VelocityTable } from './state.js';

export type SyncOutput = MsgSnap | MsgSnapDelta | MsgState;

export interface SyncEncoder {
  readonly spec: SyncSpec;
  /** What to send for this snapshot (null = nothing this time). */
  encode(snap: MsgSnap, vel: VelocityTable): SyncOutput | null;
  /** Snapshot ack from the client (delta only). */
  onAck(tick: number): void;
  /** Delta only: complete snapshots sent although the client had acknowledged one. */
  readonly fallbacks: number;
}

export function createEncoder(spec: SyncSpec): SyncEncoder {
  const s = normalizeSync(spec);
  if (s.model === 'delta') {
    const d = new DeltaEncoder();
    return {
      spec: s,
      encode: (snap) => d.encode(snap),
      onAck: (tick) => d.onAck(tick),
      get fallbacks() { return d.fallbacks; },
    };
  }
  if (s.model === 'state') {
    const st = new StateEncoder(s.hz!);
    return { spec: s, encode: (snap, vel) => st.encode(snap, vel), onAck: () => {}, fallbacks: 0 };
  }
  return { spec: s, encode: (snap) => snap, onAck: () => {}, fallbacks: 0 };
}
