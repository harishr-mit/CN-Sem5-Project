/**
 * audio.ts — sound effects (GAMERULES.md §18). Client-only and cosmetic.
 *
 * Volume and mute come from the user settings (Settings panel, `M`); other
 * players' sounds fade with distance from the local player. At most
 * MAX_VOICES play at once, so a rifle fight can't pile up hundreds of voices.
 * Respawn, power-up end and UI clicks are deliberately silent.
 */

import Phaser from 'phaser';
import GAME from '@nobu/shared/config/game';
import { loadSettings } from '../ui/settings.js';

const MAX_VOICES = 8;
/** Volume at the far side of the arena (linear falloff from 1). */
const FAR_VOLUME = 0.3;
const ARENA_DIAG = Math.hypot(GAME.arena.width, GAME.arena.height);

/** Shared by every scene; App / SettingsPanel update it (`M`, volume slider). */
export const soundPrefs = (() => {
  const s = loadSettings();
  return { volume: s.soundVolume / 100, muted: s.muted };
})();

export function setSoundPrefs(volume: number, muted: boolean): void {
  soundPrefs.volume = volume;
  soundPrefs.muted = muted;
}

export interface PlayOptions {
  /** World position of the source; omitted = the local player (full volume). */
  at?: { x: number; y: number };
  /** Listener (local player) position for the distance falloff. */
  listener?: { x: number; y: number };
  /** Extra gain (0–1). */
  gain?: number;
  /** Playback rate (shotgun = rifle shot at 0.7). */
  rate?: number;
}

export class Sfx {
  private voices = 0;

  constructor(private readonly scene: Phaser.Scene, private readonly enabled: boolean) {}

  play(key: string, opts: PlayOptions = {}): void {
    if (!this.enabled || soundPrefs.muted || soundPrefs.volume <= 0) return;
    if (this.voices >= MAX_VOICES || !this.scene.cache.audio.exists(key)) return;
    let gain = opts.gain ?? 1;
    if (opts.at && opts.listener) {
      const d = Math.hypot(opts.at.x - opts.listener.x, opts.at.y - opts.listener.y);
      gain *= 1 - (1 - FAR_VOLUME) * Math.min(1, d / ARENA_DIAG);
    }
    const sound = this.scene.sound.add(key, { volume: gain * soundPrefs.volume, rate: opts.rate ?? 1 });
    this.voices++;
    let finished = false;
    const done = () => { if (finished) return; finished = true; this.voices--; sound.destroy(); };
    sound.once(Phaser.Sound.Events.COMPLETE, done);
    sound.once(Phaser.Sound.Events.STOP, done);
    if (!sound.play()) done();
  }
}
