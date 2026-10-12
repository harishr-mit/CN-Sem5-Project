import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
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
