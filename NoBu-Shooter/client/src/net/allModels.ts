/**
 * allModels.ts — every optional sync model for NetClient (docs/PHASE7_PLAN.md
 * D4): State (extrapolation) and Lockstep. The demo, Compare, the tests and
 * the network-player tools pass `ALL_MODELS`; the game edition does not
 * import this file, so neither model is in its bundle.
 */
import { Extrapolator } from './extrapolate.js';
import { LockstepClient } from './lockstep.js';
import type { SyncModules } from './NetClient.js';

export const ALL_MODELS: SyncModules = {
  extrapolator: (cfg) => new Extrapolator(cfg),
  lockstep: (opts) => new LockstepClient(opts),
};
