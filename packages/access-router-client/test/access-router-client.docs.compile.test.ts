import { cpSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { cleanupTempRoots, installPackedConsumer, packageRoot, run } from './packed-consumer-harness';

/**
 * ARC-20: documentation compile test.
 *
 * Extracts every "complete" TypeScript code block from the installed docs
 * (`README.md`, `llms.txt`) and the website docs
 * (`website/docs/packages/access-router-client/*.mdx`) into fixture files in
 * `test-docs-consumer/examples/` and compiles them against the *packed* npm
 * tarball — the same artifact exercised by ARC-18 — under strict NodeNext
 * and Bundler resolution with `strict: true` and `skipLibCheck: false`.
 *
 * A drift in any documented public name (removed export, renamed option key,
 * stale response shape, invalid method signature) surfaces as a `tsc` error
 * rather than being silently shipped in the docs. Intentionally partial
 * snippets (one-line concept demonstrations that cannot compile on their own)
 * are embedded into the larger fixture that anchors them, recorded in
 * `test-docs-consumer/snippets-mapping.md`.
 *
 * The packed-tarball install keeps this test honest: the fixtures import
 * `@web-ts-toolkit/access-router-client` from a fresh `node_modules`, so an
 * example that uses a name only present in `src/` (not in the published
 * declarations) fails to compile here even though the source-level test
 * suite would pass.
 */

const docsExamplesDir = path.resolve(packageRoot, 'test-docs-consumer', 'examples');
const docsTsconfigDir = path.resolve(packageRoot, 'test-docs-consumer');

afterAll(() => {
  cleanupTempRoots();
});

describe('ARC-20 documentation examples compile against the packed artifact', () => {
  it('stages example fixtures for the documentation compile test', () => {
    expect(existsSync(docsExamplesDir)).toBe(true);
    const fixtures = readdirSync(docsExamplesDir).filter((f) => f.endsWith('.ts'));
    expect(fixtures.length).toBeGreaterThan(0);
    // The fixture catalog is the explicit mapping ARC-20 requirement #4 asks
    // for; if it is removed, the compile test still runs but loses its
    // "intentionally partial" catalog, so guard it.
    expect(existsSync(path.resolve(docsTsconfigDir, 'snippets-mapping.md'))).toBe(true);
  });

  it('installs the staged tarball + internal dependency closure and compiles every doc example under strict NodeNext and Bundler resolution against the published declarations', () => {
    const consumerDir = installPackedConsumer();

    // Copy the example fixtures + the two strict tsconfigs into the
    // freshly installed consumer tree. The consumer's installed
    // `node_modules/@web-ts-toolkit/access-router-client` resolves the
    // package's declarations via the published export map (no `paths`
    // override), exactly as an external consumer installing the npm
    // tarball would.
    cpSync(docsExamplesDir, path.resolve(consumerDir, 'examples'), { recursive: true });
    for (const file of ['tsconfig-nodenext.json', 'tsconfig-bundler.json']) {
      const source = path.resolve(docsTsconfigDir, file);
      if (!existsSync(source)) {
        throw new Error(`missing docs tsconfig fixture: ${source}`);
      }
      cpSync(source, path.resolve(consumerDir, file));
    }

    // List the example fixtures actually copied so the failure message is
    // explicit if the staging mishandled the directory.
    const copied = readdirSync(path.resolve(consumerDir, 'examples')).sort();
    expect(copied.length).toBeGreaterThan(0);

    // Strict NodeNext typecheck against the installed declarations,
    // resolved through the export map's per-condition `types.import`
    // (`./index.d.mts`). `skipLibCheck: false` so the package's own
    // declaration surface is fully checked; `topLevelAwait: 'always'`
    // because several fixtures use top-level `await` (mirroring the docs'
    // quickstart shape). Any doc example that references an unexported
    // name, a renamed option key, or a stale response shape fails here.
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-nodenext.json'], consumerDir);

    // Strict Bundler typecheck — same fixtures, Bundler resolution through
    // the export map's `types` field. `skipLibCheck: false`. Bundler
    // lets us catch distinct drift (e.g. a name reachable only via the
    // `import` condition's `.d.mts`).
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-bundler.json'], consumerDir);
  }, 240_000);
});
