import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/storage/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  target: 'node22',
  outDir: 'dist',
});
