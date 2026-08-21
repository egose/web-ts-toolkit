import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/global-setup.ts'],
    maxWorkers: 4,
    testTimeout: 30_000,
  },
});
