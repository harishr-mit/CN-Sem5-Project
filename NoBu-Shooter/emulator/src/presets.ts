/**
 * presets.ts — named link presets and config validation (SPEC.md §11.5).
 * Every preset is a complete LinkConfig so switching presets never leaves
 * settings from the previous one behind (e.g. burst loss after Nightmare).
 */

import { DEFAULT_LINK_CONFIG, type LinkConfig } from './pipeline.js';

const preset = (p: Partial<LinkConfig>): LinkConfig => ({ ...DEFAULT_LINK_CONFIG, ...p });

export const PRESETS: Record<string, LinkConfig> = {
  Baseline: preset({}),
  'Café Wi-Fi': preset({ latencyMs: 25, jitterMs: 15, lossPct: 1 }),
  'Mobile 4G': preset({ latencyMs: 45, jitterMs: 25, lossPct: 2, bandwidthKbps: 5000 }),
  Transatlantic: preset({ latencyMs: 90, jitterMs: 8, lossPct: 0.5 }),
  Nightmare: preset({
    latencyMs: 120, jitterMs: 50, lossPct: 12, lossModel: 'burst', burstLen: 4,
    duplicatePct: 3, reorderPct: 5, bandwidthKbps: 400,
  }),
};

const ENUMS: Partial<Record<keyof LinkConfig, readonly string[]>> = {
  jitterDist: ['normal', 'uniform'],
  lossModel: ['random', 'burst'],
};

/**
 * The known, well-typed fields of `partial` (unknown keys, wrong types,
 * non-finite or negative numbers and unknown enum values are dropped).
 */
export function sanitizePatch(partial: unknown): Partial<LinkConfig> {
  const out: Partial<LinkConfig> = {};
  if (typeof partial !== 'object' || partial === null) return out;
  const src = partial as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_LINK_CONFIG) as (keyof LinkConfig)[]) {
    const v = src[key];
    if (v === undefined || typeof v !== typeof DEFAULT_LINK_CONFIG[key]) continue;
    if (typeof v === 'number' && (!Number.isFinite(v) || v < 0)) continue;
    const allowed = ENUMS[key];
    if (allowed && !allowed.includes(v as string)) continue;
    (out as Record<string, unknown>)[key] = v;
  }
  if (out.lossPct !== undefined) out.lossPct = Math.min(100, out.lossPct);
  if (out.duplicatePct !== undefined) out.duplicatePct = Math.min(100, out.duplicatePct);
  if (out.reorderPct !== undefined) out.reorderPct = Math.min(100, out.reorderPct);
  if (out.burstLen !== undefined) out.burstLen = Math.max(1, out.burstLen);
  return out;
}

/**
 * Complete a partial config from the defaults, ignoring unknown keys and
 * values of the wrong type. Used for ad-hoc presets (`preset` + `config`),
 * so a one-off preset never inherits settings from the previous one.
 */
export function completeConfig(partial: unknown): LinkConfig {
  return { ...DEFAULT_LINK_CONFIG, ...sanitizePatch(partial) };
}
