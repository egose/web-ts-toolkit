import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    target: 'node22',
    outDir: 'dist',
    clean: true,
    onSuccess:
      "node -e \"const fs=require('node:fs');fs.copyFileSync('tsconfig.package.json','dist/tsconfig.package.json');fs.copyFileSync('tsconfig.package.json','dist/tsconfig.json')\"",
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
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
]);
