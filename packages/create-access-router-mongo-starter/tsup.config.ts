import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      'bin/cli': 'src/cli.ts',
      'bin/deploy-netlify': 'scripts/deploy-netlify.ts',
      'bin/deploy-shared': 'scripts/deploy-shared.entry.ts',
    },
    format: ['cjs'],
    dts: false,
    target: 'node22',
    outDir: 'dist',
    clean: true,
    external: ['@clack/prompts', '@netlify/api', 'smol-toml'],
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
]);
