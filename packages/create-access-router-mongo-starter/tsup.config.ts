import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      cli: 'src/cli.ts',
      'deploy-netlify': 'scripts/deploy-netlify.ts',
      'deploy-shared': 'scripts/deploy-shared.entry.ts',
    },
    format: ['cjs'],
    dts: false,
    target: 'node22',
    outDir: 'dist',
    clean: true,
    external: ['@clack/prompts', '@netlify/api'],
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
]);
