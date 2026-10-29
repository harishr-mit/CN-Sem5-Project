/**
 * localHost.ts — "is this request meant for this machine?" by its Host header.
 * A forwarded port (VS Code / dev tunnel) reaches the server from 127.0.0.1,
 * so the peer address says nothing; the Host header names what the visitor
 * typed. Used to keep the demo's tools local and to give remote visitors the
 * game only (server/src/http.ts, client/vite.config.ts).
 * shortcut: the header is client-supplied, so this is a guard against mistakes
 * on a trusted network, not against an attacker; upgrade with real auth for the internet.
 */

/** True for localhost, 127.x.x.x and [::1] (any port); a missing Host counts as local (tools). */
export function isLocalHost(hostHeader: string | undefined): boolean {
  if (!hostHeader) return true;
  const host = hostHeader.trim().toLowerCase().replace(/:\d+$/, '');
  return host === 'localhost' || host === '[::1]' || /^127(\.\d{1,3}){3}$/.test(host);
}

/** A small page telling a remote visitor that this port is the demo's, local only. */
export function restrictedPage(what: string, gamePort: number): string {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Restricted</title><body style="font-family:system-ui;background:#0a081a;color:#e8e8ff;padding:2rem;max-width:34rem;margin:auto">
<h1 style="color:#ff5a8c">Restricted</h1>
<p>${what} is a developer tool and is available on the host machine only.</p>
<p>To play, open the game on port <b>${gamePort}</b> of this same address (the page without the port number you used for this one).</p>`;
}
