import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    include: ['tests/db/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
