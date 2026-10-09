export interface UserSettings {
  mouseSensitivity: number;
  graphicsQuality: 'low' | 'medium' | 'high';
  showGhost: boolean;
  showParticleTrails: boolean;
  soundVolume: number;
}

const SETTINGS_KEY = 'nobu_shooter_settings';

export const DEFAULT_SETTINGS: UserSettings = {
  mouseSensitivity: 1.0,
  graphicsQuality: 'high',
  showGhost: true,
  showParticleTrails: true,
  soundVolume: 80,
};

export function loadSettings(): UserSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
    };
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
