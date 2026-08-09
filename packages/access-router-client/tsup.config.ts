import { defineConfig } from 'tsup';

/**
 * Build target — single shared `es2022` baseline that runs in:
 *   - Node 16.17+ (the `engines.node` floor listed below is stricter, but the
 *     emitted bundle itself is valid back to Node 16)
 *   - all evergreen browsers (Chrome 94+, Edge 94+, Firefox 93+, Safari 16+)
 *
 * ARC-19 chose browser + Node support as the official runtime matrix, so the
 * bundle targets their syntax intersection rather than `node22`. The source
 * imports no Node built-ins; the only runtime-conditional is the cache
 * timer's feature-detected `unref()` guard, which is a no-op in browsers.
 * A Vitest + jsdom (Vite-powered) smoke test imports `dist/index.mjs` and
 * exercises the public surface to catch Node-only built-ins or incompatible
 * syntax (see `test/access-router-client.browser-smoke.test.ts`).
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  target: 'es2022',
  outDir: 'dist',
  clean: true,
  bundle: true,
  splitting: false,
});
