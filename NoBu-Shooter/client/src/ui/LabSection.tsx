/**
 * LabSection — a Network Lab section whose title opens and closes it
 * (PHASES.md P4, docs/PHASE4_PLAN.md D8). The open state is remembered in the
 * user settings (`labSections`). With `collapsible={false}` it is a plain,
 * always-open section (Compare's network drawer).
 */

import React, { useState } from 'react';
import { loadSettings, saveSettings, DEFAULT_LAB_SECTIONS } from './settings.js';

interface LabSectionProps {
  /** Key in `labSections`. */
  id: string;
  title: React.ReactNode;
  titleStyle?: React.CSSProperties;
  /** Shown next to the title while the section is closed (e.g. the current value). */
  summary?: React.ReactNode;
  collapsible?: boolean;
  domId?: string;
  children: React.ReactNode;
}

export const LabSection: React.FC<LabSectionProps> = ({
  id, title, titleStyle, summary, collapsible = true, domId, children,
}) => {
  const [open, setOpen] = useState(() => loadSettings().labSections[id] ?? DEFAULT_LAB_SECTIONS[id] ?? true);

  if (!collapsible) {
    return (
      <div className="lab-section" id={domId}>
        <div className="lab-section-title" style={titleStyle}>{title}</div>
        {children}
      </div>
    );
  }

  const toggle = () => {
    const next = !open;
    setOpen(next);
    const s = loadSettings();
    saveSettings({ ...s, labSections: { ...s.labSections, [id]: next } });
  };

  return (
    <div className={`lab-section ${open ? '' : 'closed'}`} id={domId} data-section={id}>
      <button
        className="lab-section-title lab-section-toggle"
        style={titleStyle}
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault() /* keep keyboard focus on the game */}
        onClick={toggle}
      >
        <span className="lab-section-caret" aria-hidden />
        <span>{title}</span>
        {!open && summary !== undefined && <span className="lab-section-summary">{summary}</span>}
      </button>
      {open && children}
    </div>
  );
};
