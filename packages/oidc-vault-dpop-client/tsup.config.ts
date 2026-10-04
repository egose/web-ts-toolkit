import { defineConfig } from 'tsup';

/**
 * Build target — single shared `es2022` baseline at the intersection of the
 * supported runtimes:
 *   - Node >= 22 (the `engines.node` floor; the emitted bundle needs nothing newer)
 *   - evergreen browsers (Chrome 94+, Edge 94+, Firefox 93+, Safari 16+;
 *     see `browserslist` in package.json)
 *
 * The source imports no Node built-ins (`node:*`) and no `express` — browser
 * globals (`crypto.subtle`, `indexedDB`, `sessionStorage`, `navigator.locks`,
 * `BroadcastChannel`) are only touched lazily behind runtime feature asserts,
 * so the bundled `dist/index.mjs` stays importable in Node (for the jsdom
 * smoke test) without leaking server dependencies into browser bundles.
 * Cookie transport additionally needs Web Locks + BroadcastChannel at runtime.
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
