import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The old instant start of `main` (Phase 7 join window: tests that need it pass joinWindowMs)
    env: { NOBU_JOIN_WINDOW_MS: '0' },
  },
  resolve: {
    alias: {
      '@nobu/shared': resolve(__dirname, 'shared/src'),
    },
  },
});
