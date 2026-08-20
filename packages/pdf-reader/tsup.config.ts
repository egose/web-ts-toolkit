import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  target: 'es2020',
  outDir: 'dist',
  clean: true,
  bundle: true,
  splitting: false,
  external: ['pdfjs-dist'],
});
