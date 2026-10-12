import { DEFAULT_SYNC, isSyncSpec, normalizeSync, type SyncSpec } from '@nobu/shared/sync';

export interface UserSettings {
  mouseSensitivity: number;
  showGhost: boolean;
  showParticleTrails: boolean;
  soundVolume: number;
  /** Sound effects muted (`M`, GAMERULES.md §18). */
  muted: boolean;
  /** Quick Match sync model (`Y`, PHASES.md Phase 3); default full. */
  syncModel: SyncSpec;
  /** Projector UI scale in % (PHASES.md P4): all React UI, not the arena. */
  uiScale: UiScale;
  /** Network Lab sections open (true) or closed, by section id (PHASES.md P4). */
  labSections: Record<string, boolean>;
}

export type UiScale = 100 | 115 | 130;
export const UI_SCALES: readonly UiScale[] = [100, 115, 130];

/**
 * Lab sections open by default (docs/PHASE4_PLAN.md D8): presets, sync model,
 * toggles and metrics; sliders, developer, sparklines and notes closed — so the
 * Lab fits 1920 × 1080 without scrolling.
 */
export const DEFAULT_LAB_SECTIONS: Record<string, boolean> = {
  presets: true, impairment: false, sync: true, toggles: true,
  dev: false, metrics: true, sparklines: false, notes: false,
};

const SETTINGS_KEY = 'nobu_shooter_settings';

export const DEFAULT_SETTINGS: UserSettings = {
  mouseSensitivity: 1.0,
  showGhost: true,
  showParticleTrails: true,
  soundVolume: 80,
  muted: false,
  syncModel: DEFAULT_SYNC,
  uiScale: 100,
  labSections: { ...DEFAULT_LAB_SECTIONS },
};

export function loadSettings(): UserSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    const merged = { ...DEFAULT_SETTINGS, ...parsed } as UserSettings;
    // Lockstep is Compare-only (lab room, docs/PHASE6_PLAN.md D1): never a Quick Match setting
    merged.syncModel = isSyncSpec(merged.syncModel) && merged.syncModel.model !== 'lockstep'
      ? normalizeSync(merged.syncModel) : DEFAULT_SYNC;
    if (!UI_SCALES.includes(merged.uiScale)) merged.uiScale = 100;
    const sections = typeof merged.labSections === 'object' && merged.labSections !== null ? merged.labSections : {};
    merged.labSections = { ...DEFAULT_LAB_SECTIONS };
    for (const [k, v] of Object.entries(sections)) if (typeof v === 'boolean') merged.labSections[k] = v;
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

const listeners = new Set<(s: UserSettings) => void>();

/** Called after every saveSettings (e.g. the arena follows Graphics Quality live). */
export function onSettingsChange(fn: (s: UserSettings) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Scale all React UI (rem-based sizes and the Lab width) for projectors. */
export function applyUiScale(scale: UiScale): void {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--ui-scale', String(scale / 100));
}

export function saveSettings(settings: UserSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* ignore localStorage errors */
  }
  for (const fn of listeners) fn({ ...settings });
}
