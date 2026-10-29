import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { isLocalHost, restrictedPage } from '../shared/src/net/localHost';

/** The demo is for this machine: any other Host (a tunnel, the LAN) is told so, before Vite's own host check answers. */
const localOnly = {
  name: 'nobu-local-only',
  configureServer(server: { middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void } }) {
    server.middlewares.use((req, res, next) => {
      if (isLocalHost(req.headers.host)) return next();
      res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(restrictedPage('The Network Mechanics Demo (this page)', 8080));
    });
  },
};

export default defineConfig({
  plugins: [react(), localOnly],
  // Art and sound: generated from NoBu-Shooter/assets by `npm run assets`
  // (scripts/build-assets.mjs) into one folder per Graphics Quality tier,
  // served from the site root, e.g. /high/packed/player.webp
  // (client/src/game/assets.ts, docs/PHASE7_PLAN.md D11).
  publicDir: resolve(__dirname, '../assets-build'),
  resolve: {
    alias: {
      '@nobu/shared': resolve(__dirname, '../shared/src'),
    },
  },
  server: {
    port: 5173,
    open: false,
  },
  build: {
    outDir: 'dist',
  },
});
