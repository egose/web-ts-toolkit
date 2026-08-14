/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Consumer CJS entry exercised by ARR-10 packed-tarball install test.
 *
 * `require()` resolves `@web-ts-toolkit/access-router-react` from a fresh
 * `node_modules` containing the produced npm tarball (no workspace path
 * mapping). Asserts the published CJS entry is reachable, has the documented
 * runtime export surface, and the public helpers are constructible. Cannot
 * exercise `createModelHooks` end-to-end here (requires a React renderer),
 * so the runtime smoke is limited to the export surface + the
 * React-independent `requestKeyFor` / `RequestKeyError` helpers.
 */
const assert = require('node:assert');

const arr = require('@web-ts-toolkit/access-router-react');

const expected = ['RequestKeyError', 'createModelHooks', 'requestKeyFor'].sort();

const actual = Object.keys(arr).sort();
assert.deepStrictEqual(
  actual,
  expected,
  `CJS runtime export surface mismatch. expected ${expected.join(', ')}, got ${actual.join(', ')}`,
);

assert.strictEqual(typeof arr.createModelHooks, 'function', 'createModelHooks is a function');
assert.strictEqual(typeof arr.requestKeyFor, 'function', 'requestKeyFor is a function');
assert.strictEqual(typeof arr.RequestKeyError, 'function', 'RequestKeyError constructor is a function');

// requestKeyFor is React-independent; exercise it for real against the
// packed artifact so ESM/CJS packed smoke is not purely a presence check.
assert.strictEqual(
  arr.requestKeyFor({ filter: { status: 'active' } }),
  arr.requestKeyFor({ filter: { status: 'active' } }),
  'requestKeyFor is stable for equal inputs',
);
assert.ok(typeof arr.requestKeyFor({ filter: { status: 'active' } }) === 'string', 'requestKeyFor returns a string');

// RequestKeyError is a public runtime extension of Error.
assert.ok(
  arr.RequestKeyError.prototype instanceof Error,
  'RequestKeyError extends Error',
);
assert.strictEqual(
  new arr.RequestKeyError('boom').name,
  'RequestKeyError',
  'RequestKeyError sets its name',
);
