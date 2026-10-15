import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/wire.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  target: 'node22',
  outDir: 'dist',
  clean: true,
  bundle: true,
  splitting: false,
});
