/**
 * Consumer ESM entry exercised by ARR-10 packed-tarball install test.
 *
 * A real `import` statement resolves
 * `@web-ts-toolkit/access-router-react` from a fresh `node_modules`
 * containing the produced npm tarball through the `exports.import`
 * (= ./dist/index.mjs → ./index.mjs in published tree) map. No workspace
 * alias / tsconfig `paths` involved.
 */
import assert from 'node:assert';

import {
  createModelHooks,
  requestKeyFor,
  RequestKeyError,
} from '@web-ts-toolkit/access-router-react';

const expected = ['RequestKeyError', 'createModelHooks', 'requestKeyFor'].sort();

const actual = Object.keys(await import('@web-ts-toolkit/access-router-react')).sort();
assert.deepStrictEqual(
  actual,
  expected,
  `ESM runtime export surface mismatch. expected ${expected.join(', ')}, got ${actual.join(', ')}`,
);

assert.strictEqual(typeof createModelHooks, 'function', 'createModelHooks is a function');
assert.strictEqual(typeof requestKeyFor, 'function', 'requestKeyFor is a function');
assert.strictEqual(typeof RequestKeyError, 'function', 'RequestKeyError constructor is a function');

// requestKeyFor is React-independent; exercise it for real against the
// packed artifact so ESM packed smoke is not purely a presence check.
assert.strictEqual(
  requestKeyFor({ filter: { status: 'active' } }),
  requestKeyFor({ filter: { status: 'active' } }),
  'requestKeyFor is stable for equal inputs',
);
assert.ok(
  typeof requestKeyFor({ filter: { status: 'active' } }) === 'string',
  'requestKeyFor returns a string',
);

// RequestKeyError is a public runtime extension of Error so consumers can
// catch it via `instanceof` against the dependency-key helper.
assert.ok(RequestKeyError.prototype instanceof Error, 'RequestKeyError extends Error');
assert.strictEqual(
  new RequestKeyError('boom').name,
  'RequestKeyError',
  'RequestKeyError sets its name',
);
