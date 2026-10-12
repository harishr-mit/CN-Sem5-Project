/**
 * vite.play.config.ts — the game edition (docs/PHASE7_PLAN.md D1, D8).
 *
 * `npm run dev`: Vite serves client/play on port 5173 for this machine and
 * the LAN (host: true), with hot reload, and forwards `/ws` to the game
 * server on 8080 — so the page and the game share one address.
 * `npm run build`: the bundle goes to NoBu-Shooter/dist/game, which
 * `npm start` serves. The demo's config is vite.config.ts.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export const GAME_DEV_PORT = 5173;
export const GAME_SERVER_PORT = 8080;

export default defineConfig({
  root: resolve(__dirname, 'play'),
  plugins: [react()],
  // The same generated art and sound tiers as the demo (npm run assets)
  publicDir: resolve(__dirname, '../assets-build'),
  resolve: {
    alias: {
      '@nobu/shared': resolve(__dirname, '../shared/src'),
    },
  },
  server: {
    port: GAME_DEV_PORT,
    strictPort: true,
    host: true,
    open: false,
    proxy: {
      '/ws': { target: `ws://127.0.0.1:${GAME_SERVER_PORT}`, ws: true },
    },
  },
  build: {
    outDir: resolve(__dirname, '../dist/game'),
    emptyOutDir: true,
    // Phaser alone is ≈ 1.2 MB minified (1.7 MB with React and the game); one chunk is fine for a game that needs all of it at once
    chunkSizeWarningLimit: 2000,
  },
});
