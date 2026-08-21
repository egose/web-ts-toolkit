import { defineConfig } from 'vitest/config';

/**
 * Browser smoke test config (ARC-19).
 *
 * Vitest is Vite-powered, so this config runs the test through Vite's module
 * pipeline against a `jsdom` browser environment. The smoke test imports the
 * *built* ESM bundle (`dist/index.mjs`) — not the source — so it catches Node
 * built-ins and basic browser-bundling regressions. This is not a real-browser
 * engine/version compatibility gate.
 *
 * Scoped to `test/access-router-client.browser-smoke.test.ts` via the
 * `test:browser-smoke` package script so the rest of the suite continues to
 * run under the shared Node `vitest.config.ts` at the repo root.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    environmentMatchGlobs: [],
    include: ['test/access-router-client.browser-smoke.ts'],
  },
});
