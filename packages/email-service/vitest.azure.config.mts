import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/azure/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: false,
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
