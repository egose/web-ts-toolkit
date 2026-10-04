import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
