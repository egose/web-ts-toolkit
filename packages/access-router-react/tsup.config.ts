import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  target: 'es2022',
  outDir: 'dist',
  clean: true,
  bundle: true,
  splitting: false,
  external: ['react', 'react-dom', '@web-ts-toolkit/access-router-client'],
});
