import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/mongodb/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: false,
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
