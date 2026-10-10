import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  // Art and sound (NoBu-Shooter/assets, inventory in its README) are served
  // from the site root, e.g. /packed/player.png (client/src/game/assets.ts).
  publicDir: resolve(__dirname, '../assets'),
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
