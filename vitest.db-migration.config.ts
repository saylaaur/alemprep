import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'server-only': path.resolve(__dirname, 'tests/helpers/server-only.ts'),
    },
  },
  test: {
    include: ['tests/db/learning-migration-path.test.ts'],
    testTimeout: 90_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
