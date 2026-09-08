import { defineConfig } from 'vitest/config';

/**
 * UTILS-10: utils-scoped test config.
 *
 * Ignored compiled `.js` siblings sit beside every `src/*.ts` (the package
 * `tsconfig.json` enables emit with no outDir). Vite's default
 * `resolve.extensions` prefers `.js` over `.ts`, so extensionless `../src/*`
 * imports in the existing tests could silently execute stale sibling output
 * instead of TypeScript source. Listing `.ts`/`.mts` first forces
 * extensionless test imports to resolve to source. New tests additionally use
 * explicit `.ts` specifiers; see `test/source-resolution.test.ts` for the
 * identity proof that both specifier styles load the same modules.
 */
export default defineConfig({
  resolve: {
    extensions: ['.ts', '.mts', '.cts', '.mjs', '.cjs', '.js', '.json'],
  },
  test: {
    environment: 'node',
    passWithNoTests: true,
    include: ['test/**/*.test.ts'],
  },
});
