import React from 'react';

interface ControlsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ControlsOverlay: React.FC<ControlsOverlayProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const controlGroups = [
    {
      category: 'PILOT & COMBAT',
      items: [
        { keys: ['W', 'A', 'S', 'D'], desc: 'Move (or Arrow Keys)' },
        { keys: ['MOUSE'], desc: 'Aim' },
        { keys: ['LMB'], desc: 'Fire (hold) — magazine reloads itself when empty' },
        { keys: ['R'], desc: 'Reload (the pistol has unlimited reloads)' },
        { keys: ['SPACE'], desc: 'Dash (with the Dash power-up)' },
        { keys: ['M'], desc: 'Mute / unmute sound effects' },
      ],
    },
    {
      category: 'POWER-UPS (walk over one; up to 1 per 2 players)',
      items: [
        { keys: ['RAPID'], desc: 'Rifle for 10 s or 2 magazines (rarest)' },
        { keys: ['SPREAD'], desc: 'Shotgun for 10 s or 2 magazines — 3 pellets per shot' },
        { keys: ['SHIELD'], desc: 'Absorbs the next hit' },
        { keys: ['SPEED'], desc: '1.5× speed for 6 s (most common)' },
        { keys: ['PIERCE'], desc: 'Bullets pass through obstacles for 8 s' },
        { keys: ['DASH'], desc: 'For 10 s: SPACE = short burst (2 s cooldown)' },
      ],
    },
    {
      category: 'NETWORK LAB & PRESETS',
      items: [
        { keys: ['TAB'], desc: 'Toggle Network Lab panel' },
        { keys: ['1'], desc: 'Preset: Baseline (LAN, 0ms, 0% loss)' },
        { keys: ['2'], desc: 'Preset: Café Wi-Fi (25ms, 15ms jitter, 1% loss)' },
        { keys: ['3'], desc: 'Preset: Mobile 4G (45ms, 25ms jitter, 2% loss)' },
        { keys: ['4'], desc: 'Preset: Transatlantic (90ms, 8ms jitter, 0.5% loss)' },
        { keys: ['5'], desc: 'Preset: Nightmare (120ms, 50ms jitter, 12% loss)' },
      ],
    },
    {
      category: 'NETCODE ENGINE TOGGLES',
      items: [
        { keys: ['P'], desc: 'Toggle Client-Side Prediction' },
        { keys: ['C'], desc: 'Toggle Server Reconciliation' },
        { keys: ['I'], desc: 'Toggle Snapshot Interpolation' },
        { keys: ['G'], desc: 'Toggle Ghost Player (Server True Position)' },
        { keys: ['Y'], desc: 'Cycle sync model: Full → Delta → State 10 Hz → State 30 Hz (live)' },
      ],
    },
    {
      category: 'SYSTEM SHORTCUTS',
      items: [
        { keys: ['ESC'], desc: 'Open System Settings (includes Leave Match)' },
        { keys: ['F1', '?'], desc: 'Toggle this Controls Guide' },
      ],
    },
  ];

  return (
    <div
      className="overlay"
      style={{
        // .overlay is click-through (pointer-events: none, inherited) for HUD
        // text; a modal must take clicks and wheel events, or they reach the game
        pointerEvents: 'auto',
        position: 'fixed',
        padding: 'var(--sp-l)',
        zIndex: 1000,
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
        className="controls-modal"
        style={{
          background: 'var(--c-bg-panel)',
          border: '1px solid var(--c-border-glow)',
          boxShadow: '0 0 25px rgba(0, 229, 255, 0.35), inset 0 0 15px rgba(124, 77, 255, 0.05)',
          borderRadius: 'var(--panel-radius)',
          width: 'clamp(340px, 92vw, 560px)',
          maxHeight: '100%',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          padding: 'var(--sp-xl)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--sp-m)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--c-border)', paddingBottom: 'var(--sp-s)' }}>
          <h2 className="font-display text-glow-cyan" style={{ fontSize: '1.2rem', letterSpacing: '0.12em', margin: 0 }}>
            FLIGHT & SYSTEM CONTROLS
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
            title="Close [F1 / Esc]"
          >
            ✕
          </button>
        </div>

        {/* Groups */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-m)' }}>
          {controlGroups.map((grp) => (
            <div key={grp.category} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div
                className="font-display"
                style={{
                  fontSize: '0.68rem',
                  letterSpacing: '0.12em',
                  color: 'var(--c-cyan)',
                  textTransform: 'uppercase',
                }}
              >
                {grp.category}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {grp.items.map((it, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '4px 8px',
                      background: 'rgba(255, 255, 255, 0.03)',
                      borderRadius: '4px',
                      fontSize: '0.85rem',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {it.keys.map((k) => (
                        <kbd
                          key={k}
                          style={{
                            background: 'rgba(124, 77, 255, 0.25)',
                            border: '1px solid var(--c-border)',
                            borderRadius: '3px',
                            padding: '2px 6px',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.75rem',
                            color: '#fff',
                            fontWeight: 600,
                          }}
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                    <span style={{ color: 'var(--c-text-muted)', textAlign: 'right', marginLeft: '12px' }}>
                      {it.desc}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--sp-xs)', borderTop: '1px solid var(--c-border)', paddingTop: 'var(--sp-s)' }}>
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
            DISMISS [F1 / ESC]
          </button>
        </div>
      </div>
    </div>
  );
};
