/**
 * static.ts — serves the built game (`npm start`, docs/PHASE7_PLAN.md D7)
 * from the game server's own HTTP port, with Node built-ins only.
 *
 * - GET / HEAD only; paths resolve inside the root (no `..`, no symlink
 *   escape); `/` → index.html; anything else missing → 404.
 * - Vite's hashed files under /assets/ are cached for a year (`immutable`),
 *   everything else is revalidated (`no-cache`).
 * - Text (HTML, JS, CSS, JSON, SVG) is compressed with brotli or gzip per
 *   `Accept-Encoding`, once, then served from memory. Images and sounds are
 *   already compressed and go out as they are.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createReadStream, promises as fs, realpathSync } from 'fs';
import { resolve, sep, extname } from 'path';
import { brotliCompressSync, gzipSync, constants as zlib } from 'zlib';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt']);
/** Text files larger than this are streamed uncompressed rather than held in memory. */
const MAX_CACHED_BYTES = 8 * 1024 * 1024;

type Encoding = 'br' | 'gzip' | 'identity';

export interface StaticHandler {
  /** Handles the request; returns false if it is not a GET / HEAD (the caller answers). */
  (req: IncomingMessage, res: ServerResponse): boolean;
  readonly root: string;
}

function pickEncoding(header: string | string[] | undefined): Encoding {
  const h = (Array.isArray(header) ? header.join(',') : header ?? '').toLowerCase();
  const accepts = (name: string) => h.split(',').some((part) => {
    const [token, ...params] = part.trim().split(';');
    if (token.trim() !== name) return false;
    const q = params.map((x) => x.trim()).find((x) => x.startsWith('q='));
    return !q || Number(q.slice(2)) > 0;
  });
  if (accepts('br')) return 'br';
  if (accepts('gzip')) return 'gzip';
  return 'identity';
}

export function createStaticHandler(rootDir: string): StaticHandler {
  const root = realpathSync(resolve(rootDir));
  // `${file}|${encoding}` → body + the file's size / mtime when it was compressed. A rebuild
  // (`npm run build` while `npm start` runs) changes them, so the old body is never served.
  const cache = new Map<string, { size: number; mtimeMs: number; body: Buffer }>();

  /** The file a URL path names, or null if it is outside the root or not a file. */
  async function locate(urlPath: string): Promise<string | null> {
    let decoded: string;
    try {
      decoded = decodeURIComponent(urlPath);
    } catch {
      return null;
    }
    if (decoded.includes('\0')) return null;
    const rel = decoded === '/' || decoded === '' ? 'index.html' : decoded.replace(/^\/+/, '');
    const candidate = resolve(root, rel);
    if (candidate !== root && !candidate.startsWith(root + sep)) return null;
    try {
      const real = await fs.realpath(candidate);
      if (real !== root && !real.startsWith(root + sep)) return null;
      const st = await fs.stat(real);
      return st.isFile() ? real : null;
    } catch {
      return null;
    }
  }

  async function body(file: string, enc: Encoding, st: { size: number; mtimeMs: number }): Promise<Buffer> {
    const key = `${file}|${enc}`;
    const hit = cache.get(key);
    if (hit && hit.size === st.size && hit.mtimeMs === st.mtimeMs) return hit.body;
    const raw = await fs.readFile(file);
    const out = enc === 'br'
      ? brotliCompressSync(raw, { params: { [zlib.BROTLI_PARAM_QUALITY]: 10, [zlib.BROTLI_PARAM_SIZE_HINT]: raw.length } })
      : enc === 'gzip' ? gzipSync(raw, { level: 9 }) : raw;
    cache.set(key, { size: st.size, mtimeMs: st.mtimeMs, body: out });
    return out;
  }

  const handler = ((req: IncomingMessage, res: ServerResponse): boolean => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    const urlPath = (req.url ?? '/').split('?')[0].split('#')[0];
    void (async () => {
      const file = await locate(urlPath);
      if (!file) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
        res.end('Not found');
        return;
      }
      const ext = extname(file).toLowerCase();
      const headers: Record<string, string> = {
        'Content-Type': TYPES[ext] ?? 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': urlPath.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      };
      const st = await fs.stat(file);
      const size = st.size;
      if (COMPRESSIBLE.has(ext) && size <= MAX_CACHED_BYTES) {
        const enc = pickEncoding(req.headers['accept-encoding']);
        const data = await body(file, enc, st);
        headers['Vary'] = 'Accept-Encoding';
        if (enc !== 'identity') headers['Content-Encoding'] = enc;
        headers['Content-Length'] = String(data.length);
        res.writeHead(200, headers);
        res.end(req.method === 'HEAD' ? undefined : data);
        return;
      }
      headers['Content-Length'] = String(size);
      res.writeHead(200, headers);
      if (req.method === 'HEAD') { res.end(); return; }
      createReadStream(file).on('error', () => res.destroy()).pipe(res);
    })().catch(() => {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Server error');
    });
    return true;
  }) as StaticHandler;
  Object.defineProperty(handler, 'root', { value: root });
  return handler;
}
