import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/is.ts',
    'src/schema.ts',
    'src/utils/index.ts',
    'src/plugins/index.ts',
    'src/plugins/cascade-delete.ts',
    'src/plugins/model-function.ts',
  ],
  format: ['cjs', 'esm'],
  dts: true,
  target: 'node22',
  outDir: 'dist',
  clean: true,
  bundle: false,
});
