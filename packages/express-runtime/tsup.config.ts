import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    target: 'node20',
    outDir: 'dist',
    clean: true,
  },
  {
    entry: {
      cli: 'src/cli.ts',
    },
    format: ['cjs'],
    dts: false,
    target: 'node20',
    outDir: 'dist',
    clean: false,
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
]);
