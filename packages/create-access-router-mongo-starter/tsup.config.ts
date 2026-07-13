import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      cli: 'src/cli.ts',
    },
    format: ['cjs'],
    dts: false,
    target: 'node20',
    outDir: 'dist',
    clean: true,
    external: ['@clack/prompts'],
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
]);
