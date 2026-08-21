import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
      thresholds: {
        statements: 96,
        branches: 86,
        functions: 96,
        lines: 96,
      },
    },
    // Exclude the strict declaration-consumer fixtures from vitest's
    // runtime — they are TYPE-ONLY compile-time suites validated by
    // `pnpm typecheck:nodenext-strict` / `pnpm typecheck:bundler-strict`
    // (Task ARR-09). Calling a React hook factory outside `renderHook`
    // throws Invalid-hook-call, which is the correct runtime behavior;
    // the fixture's value comes from `tsc --noEmit --strict` against
    // `dist/index.d.ts`, not from vitest's `expect(...)` execution.
    //
    // ARR-10 also adds two new compile/staging trees:
    //  - `test-packed-consumer/consumer/` is the file set the packed-consumer
    //    test copies into a fresh `/tmp` install before running `node` and
    //    `tsc`; vitest should not import it directly (no vitest runtime).
    //  - `test-docs-consumer/` is the docs compile fixture tree. The `.ts` /
    //    `.tsx` inside `examples/` are compiled via `tsc --noEmit` against
    //    the installed consumer declarations, not via vitest runtime; the
    //    inventory file (`snippets-mapping.md`) is parse-only.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'test-decl-consumer/**',
      'test-packed-consumer/**',
      'test-docs-consumer/**',
    ],
  },
});
