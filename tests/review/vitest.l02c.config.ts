import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: {
    '@': process.cwd(),
    'server-only': path.resolve(process.cwd(), 'tests/helpers/server-only.ts'),
  } },
  test: {
    include: ['tests/review/l02c-review.probe.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
