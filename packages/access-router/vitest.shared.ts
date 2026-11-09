import type { UserConfig } from 'vitest/config';

// Do not put include here: mergeConfig concatenates arrays, which would silently
// turn a standalone layer back into the exhaustive suite.
export const sharedTestSettings = {
  environment: 'node',
  setupFiles: ['test/global-setup.ts'],
  fileParallelism: false,
  testTimeout: 30_000,
} satisfies NonNullable<UserConfig['test']>;
