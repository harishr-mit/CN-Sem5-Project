/**
 * playerToken.ts — the player's persistent identity: a random secret kept in
 * localStorage and sent as hello `pid`. A room that has seen it gives the
 * same player id and score back on a rejoin. One per browser profile; no
 * accounts. Without storage (private mode) a fresh one per page load.
 */

const KEY = 'nobu.pid';
const NAME_KEY = 'nobu.name';
let memory: string | null = null;

function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function playerToken(): string {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && /^[A-Za-z0-9_-]{8,64}$/.test(saved)) return saved;
    const t = randomToken();
    localStorage.setItem(KEY, t);
    return t;
  } catch {
    return (memory ??= randomToken());
  }
}

/** The callsign last used (pre-fills the landing form), or null. */
export function savedName(): string | null {
  try { return localStorage.getItem(NAME_KEY); } catch { return null; }
}

export function saveName(name: string): void {
  try { localStorage.setItem(NAME_KEY, name); } catch { /* no storage: the name just isn't remembered */ }
}
