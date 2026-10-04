import { defineConfig } from 'vitest/config';

/**
 * Release-shaped tarball consumer lane (owned by ATT-08).
 *
 * No packed-consumer test exists in the ATT-01 scaffold, and
 * `passWithNoTests` is deliberately `false` so this lane fails instead of
 * pretending an empty run verifies the released package shape. ATT-08 adds
 * `test/packed-consumer.test.ts` using the repository manifest transform
 * (flattened `dist`, rewritten metadata, real version) plus isolated
 * CJS/ESM/browser-only installs. A source-directory `npm pack --dry-run`
 * inventory check is not a substitute for that gate.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/packed-consumer.test.ts'],
    passWithNoTests: false,
  },
});
