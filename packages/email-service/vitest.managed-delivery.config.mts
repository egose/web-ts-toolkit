import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/managed-delivery/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: false,
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 240_000,
  },
});
