import { defineConfig } from 'tsup';

/**
 * ATT-01: single multi-entry build for `@web-ts-toolkit/express-request-attestation`.
 *
 * Both public entries (`.` and `./signer`) are built in ONE tsup invocation so
 * a single process owns cleaning and emitting `dist/` — never run a second
 * `clean: true` builder against the same output (see AGENTS.md serial-build rule
 * and `packages/access-router/tsup.config.ts`).
 *
 * - Shared `es2022` syntax target for the Node and browser entries.
 * - Neutral platform: neither entry assumes Node globals. Node built-ins used
 *   by the server entry (`node:*`) and the optional Express peer stay external
 *   and are resolved from the consumer's runtime, never bundled.
 * - The signer graph (`src/signer.ts` + `src/shared/*`) imports no Node
 *   built-ins, Express, Redis, or `Buffer`, so `dist/signer.{js,mjs}` loads in
 *   bundlers and browsers without a Node runtime graph.
 */
export default defineConfig({
  entry: ['src/index.ts', 'src/signer.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  target: 'es2022',
  platform: 'neutral',
  outDir: 'dist',
  clean: true,
  bundle: true,
  splitting: false,
  external: ['express', /^node:/],
});
