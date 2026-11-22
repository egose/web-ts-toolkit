import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/s3/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: false,
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 180_000,
  },
});
