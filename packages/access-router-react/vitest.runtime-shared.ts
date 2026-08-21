import type { UserConfig } from 'vitest/config';

export const fixtureOnlyExcludes = [
  '**/node_modules/**',
  '**/dist/**',
  'test-decl-consumer/**',
  'test-packed-consumer/**',
  'test-docs-consumer/**',
] as const;

export const nonRuntimeTestFiles = [
  'test/access-router-react.packed-consumer.test.ts',
  'test/access-router-react.docs.compile.test.ts',
  'test/access-router-react.exports.unit.test.ts',
] as const;

export const runtimeTestConfig = {
  environment: 'jsdom',
  globals: true,
  include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
  exclude: [...fixtureOnlyExcludes, ...nonRuntimeTestFiles],
} satisfies NonNullable<UserConfig['test']>;
