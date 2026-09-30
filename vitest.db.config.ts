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
    include: ['tests/db/**/*.test.ts', 'tests/review/l02c-review.probe.ts'],
    exclude: ['tests/db/learning-migration-path.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // These tests share one local Supabase database and deliberately exercise
    // row locks. A single worker prevents separate test processes from
    // overlapping fixture setup and teardown.
    maxWorkers: 1,
    fileParallelism: false,
  },
});
