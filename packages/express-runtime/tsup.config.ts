import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    target: 'node22',
    outDir: 'dist',
    clean: true,
  },
  {
    entry: {
      cli: 'src/cli.ts',
    },
    format: ['cjs'],
    dts: false,
    target: 'node22',
    outDir: 'dist',
    clean: false,
    // tsup is dynamically imported in build mode — keep it external so the
    // CLI bundle stays small (users who want `build` install tsup themselves).
    external: ['tsup', 'esbuild'],
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
]);
