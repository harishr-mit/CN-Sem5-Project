import { DEFAULT_SYNC, isSyncSpec, normalizeSync, type SyncSpec } from '@nobu/shared/sync';

export interface UserSettings {
  mouseSensitivity: number;
  graphicsQuality: 'low' | 'medium' | 'high';
  showGhost: boolean;
  showParticleTrails: boolean;
  soundVolume: number;
  /** Sound effects muted (`M`, GAMERULES.md §18). */
  muted: boolean;
  /** Quick Match sync model (`Y`, PHASES.md Phase 3); default full. */
  syncModel: SyncSpec;
}

const SETTINGS_KEY = 'nobu_shooter_settings';

export const DEFAULT_SETTINGS: UserSettings = {
  mouseSensitivity: 1.0,
  graphicsQuality: 'high',
  showGhost: true,
  showParticleTrails: true,
  soundVolume: 80,
  muted: false,
  syncModel: DEFAULT_SYNC,
};

export function loadSettings(): UserSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    const merged = { ...DEFAULT_SETTINGS, ...parsed } as UserSettings;
    merged.syncModel = isSyncSpec(merged.syncModel) ? normalizeSync(merged.syncModel) : DEFAULT_SYNC;
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: UserSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* ignore localStorage errors */
  }
}
