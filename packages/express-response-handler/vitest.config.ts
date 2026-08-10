import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['dist/index.mjs', 'dist/responses/csv.mjs'],
      thresholds: {
        statements: 78,
        branches: 68,
        functions: 62,
        lines: 78,
        // Root imports bundle create-handler.ts, so this gates the handler lifecycle branches consumers execute.
        'dist/index.mjs': {
          statements: 75,
          branches: 68,
          functions: 59,
          lines: 75,
        },
        'dist/responses/csv.mjs': {
          statements: 90,
          branches: 75,
          functions: 80,
          lines: 90,
        },
      },
    },
  },
});
