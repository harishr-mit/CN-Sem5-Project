import React, { useState, useEffect } from 'react';
import { loadSettings, saveSettings, DEFAULT_SETTINGS, type UserSettings } from './settings.js';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsChange?: (settings: UserSettings) => void;
  /** Leave the match and return to the landing page. */
  onLeave?: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isOpen,
  onClose,
  onSettingsChange,
  onLeave,
}) => {
  const [settings, setSettings] = useState<UserSettings>(() => loadSettings());

  useEffect(() => {
    if (isOpen) {
      setSettings(loadSettings());
    }
  }, [isOpen]);

  const updateSetting = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    saveSettings(updated);
    onSettingsChange?.(updated);
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    saveSettings(DEFAULT_SETTINGS);
    onSettingsChange?.(DEFAULT_SETTINGS);
  };

  if (!isOpen) return null;

  return (
    <div
      className="overlay"
      style={{
        zIndex: 1000,
        // .overlay is click-through (pointer-events: none); a modal must take clicks
        pointerEvents: 'auto',
        backgroundColor: 'rgba(5, 5, 15, 0.82)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="settings-modal"
        style={{
          background: 'var(--c-bg-panel)',
          border: '1px solid var(--c-border-glow)',
          boxShadow: '0 0 25px rgba(124, 77, 255, 0.4), inset 0 0 15px rgba(0, 229, 255, 0.05)',
          borderRadius: 'var(--panel-radius)',
          width: 'clamp(320px, 90vw, 480px)',
          padding: 'var(--sp-xl)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--sp-l)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--c-border)', paddingBottom: 'var(--sp-s)' }}>
          <h2 className="font-display text-glow-cyan" style={{ fontSize: '1.2rem', letterSpacing: '0.12em', margin: 0 }}>
            SYSTEM SETTINGS
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--c-text-muted)',
              fontSize: '1.3rem',
              cursor: 'pointer',
              lineHeight: 1,
            }}
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Mouse Sensitivity */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: 'var(--c-text)' }}>
            <span>Mouse Sensitivity</span>
            <span className="font-mono" style={{ color: 'var(--c-cyan)' }}>{settings.mouseSensitivity.toFixed(1)}x</span>
          </div>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={settings.mouseSensitivity}
            onChange={(e) => updateSetting('mouseSensitivity', parseFloat(e.target.value))}
            style={{ accentColor: 'var(--c-cyan)', cursor: 'pointer' }}
          />
        </div>

        {/* Graphics Quality */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)' }}>
          <div style={{ fontSize: '0.9rem', color: 'var(--c-text)' }}>Graphics Quality</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--sp-s)' }}>
            {(['low', 'medium', 'high'] as const).map((q) => (
              <button
                key={q}
                onClick={() => updateSetting('graphicsQuality', q)}
                style={{
                  padding: '6px',
                  borderRadius: '4px',
                  textTransform: 'uppercase',
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-display)',
                  letterSpacing: '0.08em',
                  background: settings.graphicsQuality === q ? 'var(--c-violet)' : 'rgba(255, 255, 255, 0.05)',
                  color: settings.graphicsQuality === q ? '#fff' : 'var(--c-text-muted)',
                  border: settings.graphicsQuality === q ? '1px solid var(--c-cyan)' : '1px solid var(--c-border)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Toggles */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-s)', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 'var(--sp-s)' }}>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontSize: '0.88rem' }}>
            <span>Show Ghost Player (Server True State)</span>
            <input
              type="checkbox"
              checked={settings.showGhost}
              onChange={(e) => updateSetting('showGhost', e.target.checked)}
              style={{ accentColor: 'var(--c-cyan)', width: '16px', height: '16px', cursor: 'pointer' }}
            />
          </label>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontSize: '0.88rem' }}>
            <span>Show Particle Effects</span>
            <input
              type="checkbox"
              checked={settings.showParticleTrails}
              onChange={(e) => updateSetting('showParticleTrails', e.target.checked)}
              style={{ accentColor: 'var(--c-cyan)', width: '16px', height: '16px', cursor: 'pointer' }}
            />
          </label>
        </div>

        {/* Sound Volume */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: 'var(--c-text)' }}>
            <span>Audio Volume</span>
            <span className="font-mono" style={{ color: 'var(--c-lime)' }}>{settings.soundVolume}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={settings.soundVolume}
            onChange={(e) => updateSetting('soundVolume', parseInt(e.target.value, 10))}
            style={{ accentColor: 'var(--c-lime)', cursor: 'pointer' }}
          />
        </div>

        {onLeave && (
          <button
            id="settings-leave-btn"
            onClick={onLeave}
            style={{
              background: 'rgba(255, 59, 92, 0.08)',
              border: '1px solid var(--c-red)',
              color: 'var(--c-red)',
              borderRadius: '4px',
              padding: '8px 12px',
              fontSize: '0.85rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              cursor: 'pointer',
            }}
          >
            ◄ LEAVE MATCH — BACK TO MAIN MENU
          </button>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'var(--sp-s)', borderTop: '1px solid var(--c-border)', paddingTop: 'var(--sp-m)' }}>
          <button
            onClick={handleReset}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.2)',
              color: 'var(--c-text-muted)',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            Reset Defaults
          </button>
          <button
            onClick={onClose}
            className="text-glow-cyan"
            style={{
              background: 'var(--c-violet)',
              border: '1px solid var(--c-cyan)',
              color: '#fff',
              borderRadius: '4px',
              padding: '6px 20px',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: '0.08em',
            }}
          >
            SAVE & CLOSE [ESC]
          </button>
        </div>
      </div>
    </div>
  );
};
