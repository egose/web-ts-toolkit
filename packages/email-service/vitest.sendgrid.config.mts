import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/sendgrid/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: false,
    fileParallelism: false,
    testTimeout: 6_000,
    hookTimeout: 20_000,
  },
});
