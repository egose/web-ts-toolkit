import { defineConfig } from 'vitest/config';

/**
 * CLIENT-05 jsdom bundle-smoke config.
 *
 * Vitest is Vite-powered, so this config runs the smoke test through Vite's
 * module pipeline against a `jsdom` browser environment. The smoke test
 * imports the *built* ESM bundle (`dist/index.mjs`) — not the source — so it
 * catches Node built-in leaks and basic browser-bundling regressions. This is
 * explicitly NOT a real-browser engine/version compatibility gate (see
 * CLIENT-07 for the Playwright Chromium+Firefox lane).
 *
 * Scoped to `test/*.browser-smoke.ts` via the `test:browser-smoke` package
 * script so the rest of the suite continues to run under the shared Node
 * `vitest.config.ts` at the repo root.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    environmentMatchGlobs: [],
    include: ['test/*.browser-smoke.ts'],
  },
});
