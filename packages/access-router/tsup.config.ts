import { defineConfig } from 'tsup';

const shared = {
  format: ['cjs', 'esm'] as const,
  dts: true,
  target: 'node22',
  outDir: 'dist',
  bundle: true,
  splitting: false,
};

export default defineConfig({
  // Build all public entry points in one tsup invocation so nothing cleans or
  // rewrites `dist/` while another access-router entry is still emitting.
  entry: ['src/index.ts', 'src/advanced.ts', 'src/processors.ts'],
  clean: true,
  ...shared,
});
