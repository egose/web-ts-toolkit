import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['server/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist/server',
  outExtension: () => ({ js: '.mjs' }),
  clean: true,
  // Bundle local relative imports so the built fixture runs in plain Node ESM.
  bundle: true,
});
