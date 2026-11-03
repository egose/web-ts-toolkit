import { defineConfig } from 'tsup';
import { copyFile } from 'node:fs/promises';

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
  // The production publisher flattens dist and has a fixed default doc-copy list.
  // Keep the installed guide in that actual publication tree, not only source files.
  onSuccess: async () => {
    await copyFile('MIGRATION.md', 'dist/MIGRATION.md');
  },
  ...shared,
});
