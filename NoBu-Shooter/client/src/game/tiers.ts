/**
 * tiers.ts — Graphics Quality tiers (docs/PHASE7_PLAN.md D11, D13). No Phaser
 * here, so tests can use it. The files themselves are generated into
 * NoBu-Shooter/assets-build/<tier>/ by `npm run assets` from the masters in
 * NoBu-Shooter/assets; this module maps a master path to its served URL and
 * the scale it is stored at.
 */

import CFG from './assetTiers.json';

export type Tier = 'low' | 'medium' | 'high';
export const TIERS: readonly Tier[] = ['low', 'medium', 'high'];
export const DEFAULT_TIER: Tier = 'high';
/** Every scene starts on this tier and upgrades in the background (D13). */
export const START_TIER: Tier = 'low';

export function isTier(v: unknown): v is Tier {
  return v === 'low' || v === 'medium' || v === 'high';
}

const IMAGE = /\.(png|jpe?g|webp)$/i;
const AUDIO = /\.(wav|mp3|ogg|flac)$/i;

/** Served name of a master: images → .webp, sounds → .ogg (as build-assets.mjs). */
export function servedName(master: string): string {
  if (IMAGE.test(master)) return master.replace(IMAGE, '.webp');
  if (AUDIO.test(master)) return master.replace(AUDIO, '.ogg');
  return master;
}

/** URL (relative to the site root) of a master in a tier, e.g. `high/fx/bullet.webp`. */
export function tierUrl(tier: Tier, master: string): string {
  return `${tier}/${servedName(master)}`;
}

/** The fraction of its master size an image is stored at in a tier (1 = full size). */
export function tierScale(tier: Tier, master: string): number {
  return (CFG.scaled as readonly string[]).includes(master) ? (CFG.scales as Record<Tier, number>)[tier] : 1;
}
