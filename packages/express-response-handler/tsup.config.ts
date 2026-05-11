import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/create-handler.ts',
    'src/error-formats.ts',
    'src/error-format.ts',
    'src/http-response.ts',
    'src/public-types.ts',
    'src/responses/index.ts',
    'src/responses/csv.ts',
    'src/responses/success.ts',
  ],
  format: ['cjs', 'esm'],
  dts: true,
  target: 'node20',
  outDir: 'dist',
  clean: true,
  bundle: false,
});
