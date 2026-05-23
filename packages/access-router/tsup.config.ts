import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/advanced.ts', 'src/processors.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  target: 'node20',
  outDir: 'dist',
  clean: true,
  bundle: true,
  splitting: false,
});
