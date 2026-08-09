/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Consumer CJS entry exercised by ARC-18 packed-tarball install test.
 *
 * `require()` resolves `@web-ts-toolkit/access-router-client` from a fresh
 * `node_modules` containing the produced npm tarball (no workspace path
 * mapping). Asserts the published CJS entry is reachable, has the
 * documented runtime export surface, and is constructible.
 */
const assert = require('node:assert');

const arc = require('@web-ts-toolkit/access-router-client');

const expected = [
  'CustomHeaders',
  'DataService',
  'MissingPersistenceIdentityError',
  'Model',
  'ModelService',
  'Service',
  'ServiceError',
  'createAdapter',
  'removeItemById',
  'replaceItemById',
  'wrapLazyPromise',
].sort();

const actual = Object.keys(arc).sort();
assert.deepStrictEqual(
  actual,
  expected,
  `CJS runtime export surface mismatch. expected ${expected.join(', ')}, got ${actual.join(', ')}`,
);

assert.strictEqual(arc.CustomHeaders.TotalCount, 'wtt-total-count', 'CustomHeaders.TotalCount runtime value');
assert.strictEqual(typeof arc.createAdapter, 'function', 'createAdapter is a function');
assert.strictEqual(typeof arc.ModelService, 'function', 'ModelService constructor is a function');
// ARC-21: persistence-identity safety error class is a public runtime export.
assert.strictEqual(
  typeof arc.MissingPersistenceIdentityError,
  'function',
  'MissingPersistenceIdentityError is a function',
);
assert.strictEqual(
  new arc.MissingPersistenceIdentityError('boom').name,
  'MissingPersistenceIdentityError',
  'MissingPersistenceIdentityError sets its name',
);

const adapter = arc.createAdapter({ baseURL: 'http://localhost:3000/api' });
assert.ok(adapter, 'createAdapter returned a non-null adapter');
assert.strictEqual(
  typeof adapter.createModelService,
  'function',
  'adapter exposed createModelService factory',
);
assert.strictEqual(
  typeof adapter.createDataService,
  'function',
  'adapter exposed createDataService factory',
);
