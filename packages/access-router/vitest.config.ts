import { defineConfig } from 'vitest/config';
import { sharedTestSettings } from './vitest.shared';

export default defineConfig({
  test: {
    ...sharedTestSettings,
    include: ['test/**/*.test.ts'],
  },
});
