import { defineConfig } from 'vitest/config';

// A Node controller drives actual Playwright pages. Keeping the controller
// outside the page lets the SPA navigate away to the IdP and reload normally.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/browser/**/*.browser.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
