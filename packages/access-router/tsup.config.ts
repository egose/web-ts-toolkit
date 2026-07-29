import { defineConfig } from 'tsup';

const shared = {
  format: ['cjs', 'esm'] as const,
  dts: true,
  target: 'node22',
  outDir: 'dist',
  bundle: true,
  splitting: false,
};

export default defineConfig([
  {
    entry: ['src/index.ts'],
    clean: true,
    ...shared,
  },
  {
    entry: ['src/advanced.ts'],
    clean: false,
    ...shared,
  },
  {
    entry: ['src/processors.ts'],
    clean: false,
    ...shared,
  },
]);
