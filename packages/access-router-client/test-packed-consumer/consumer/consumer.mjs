/**
 * Consumer ESM entry exercised by ARC-18 packed-tarball install test.
 *
 * A real `import` statement resolves `@web-ts-toolkit/access-router-client`
 * from a fresh `node_modules` containing the produced npm tarball through the
 * `exports.import` (= ./dist/index.mjs → ./index.mjs in published tree) map.
 * No workspace alias / tsconfig `paths` involved.
 */
import assert from 'node:assert';

import {
  CustomHeaders,
  DataService,
  MissingPersistenceIdentityError,
  Model,
  ModelService,
  Service,
  ServiceError,
  createAdapter,
  removeItemById,
  replaceItemById,
  wrapLazyPromise,
} from '@web-ts-toolkit/access-router-client';

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

const actual = Object.keys(await import('@web-ts-toolkit/access-router-client')).sort();
assert.deepStrictEqual(
  actual,
  expected,
  `ESM runtime export surface mismatch. expected ${expected.join(', ')}, got ${actual.join(', ')}`,
);

assert.strictEqual(CustomHeaders.TotalCount, 'wtt-total-count', 'CustomHeaders.TotalCount runtime value');
assert.strictEqual(typeof createAdapter, 'function', 'createAdapter is a function');
assert.strictEqual(typeof ModelService, 'function', 'ModelService constructor is a function');
assert.ok(ModelService.prototype instanceof Service, 'ModelService extends Service');
assert.ok(DataService.prototype instanceof Service, 'DataService extends Service');
assert.ok(Model.prototype, 'Model constructible');
assert.ok(ServiceError.prototype instanceof Error, 'ServiceError extends Error');
// ARC-21: persistence-identity safety error is a public runtime export
// extending Error (callers will catch it via `instanceof`).
assert.ok(MissingPersistenceIdentityError.prototype instanceof Error, 'MissingPersistenceIdentityError extends Error');
assert.strictEqual(
  new MissingPersistenceIdentityError('boom').name,
  'MissingPersistenceIdentityError',
  'MissingPersistenceIdentityError sets its name',
);

const adapter = createAdapter({ baseURL: 'http://localhost:3000/api' });
assert.ok(adapter, 'createAdapter returned a non-null adapter');
assert.strictEqual(typeof adapter.createModelService, 'function', 'createModelService factory');
assert.strictEqual(typeof adapter.createDataService, 'function', 'createDataService factory');

const petService = adapter.createModelService({ modelName: 'Pet', basePath: 'pets' });
assert.ok(petService instanceof ModelService, 'createModelService returns a ModelService instance');

// wrapLazyPromise is exported (implementation metadata intentionally public
// per ARC-17 — required for `adapter.group(...)` request building).
assert.strictEqual(typeof wrapLazyPromise, 'function', 'wrapLazyPromise exported');
assert.strictEqual(typeof removeItemById, 'function', 'removeItemById exported');
assert.strictEqual(typeof replaceItemById, 'function', 'replaceItemById exported');
