import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'server-only': path.resolve(__dirname, 'tests/helpers/server-only.ts'),
    },
  },
  test: {
    include: ['lib/**/*.test.ts', 'scripts/**/*.test.ts', 'tests/db/test-target.test.ts'],
  },
});
