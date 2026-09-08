import { describe, expect, it } from 'vitest';

// Explicit `.ts` specifiers: unambiguous, always TypeScript source — never
// the ignored compiled `.js` siblings beside `src/*.ts`.
import hasOwnTs from '../src/hasOwn.ts';
import omitTs from '../src/omit.ts';
import * as utilsIndexTs from '../src/index.ts';

/**
 * UTILS-10 requirement 1: prove source regressions execute TypeScript,
 * independent of the ignored sibling `.js` output.
 *
 * The scoped `vitest.config.ts` lists `.ts` before `.js` so extensionless
 * `../src/*` imports (used by the three pre-existing test files) resolve to
 * source. This file proves that ordering holds: if an extensionless import
 * resolved to a stale `.js` sibling while the explicit `.ts` specifier
 * resolved to source, the two specifiers would yield distinct module
 * instances and the `toBe` identity assertions below would fail.
 */
describe('UTILS-10 source resolution boundary', () => {
  it('loads the test file itself as TypeScript', () => {
    expect(import.meta.url).toContain('source-resolution.test.ts');
  });

  it('resolves extensionless source imports to the same TypeScript modules as explicit `.ts` imports', async () => {
    const extensionless = await import('../src/hasOwn');
    const explicit = await import('../src/hasOwn.ts');
    expect(extensionless.default).toBe(explicit.default);
    expect(extensionless.default).toBe(hasOwnTs);

    const omitExtensionless = await import('../src/omit');
    const omitExplicit = await import('../src/omit.ts');
    expect(omitExtensionless.default).toBe(omitExplicit.default);
    expect(omitExtensionless.default).toBe(omitTs);
  });

  it('executes TypeScript source for the root entry, not sibling output', async () => {
    const extensionless = await import('../src/index');
    const explicit = await import('../src/index.ts');
    expect(extensionless.get).toBe(explicit.get);
    expect(explicit.get).toBe(utilsIndexTs.get);
  });
});
