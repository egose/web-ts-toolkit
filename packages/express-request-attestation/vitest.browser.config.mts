import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

/**
 * Real-browser lane (owned by ATT-06/ATT-07, release evidence in ATT-08).
 *
 * Mirrors `packages/pdf-reader/vitest.browser.config.mts`: the suite runs in
 * real Headless Chromium through the Vitest Playwright provider against the
 * built `dist/signer.mjs` — jsdom is intentionally not used and is not
 * sufficient evidence for WebCrypto/native module-loading guarantees.
 *
 * No `*.browser.ts` files exist in the ATT-01 scaffold, and
 * `passWithNoTests` is deliberately `false` so this lane fails instead of
 * pretending an empty run verifies browser behavior. ATT-06 adds the signer
 * and module-contract browser tests; ATT-08 adds release-tarball browser
 * evidence. Requires Playwright Chromium (`playwright install chromium`).
 */
export default defineConfig({
  test: {
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({
        launchOptions: { args: ['--no-sandbox'] },
      }),
      instances: [{ browser: 'chromium', name: 'chromium' }],
    },
    include: ['test/**/*.browser.ts'],
    fileParallelism: false,
    passWithNoTests: false,
  },
});
