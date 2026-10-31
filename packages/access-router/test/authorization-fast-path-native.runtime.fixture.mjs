/** Runs unchanged against the production-transformed packed package, using public imports only. */
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import { createAccessRuntime } from '@web-ts-toolkit/access-router';

const B = mongoose.mongo.BSON;
const results = [];
let server;
let hookCalls = 0;
let wireHookCalls = 0;
// Preallocate denied expansion outside the hook: this tests library-owned key
// filtering work, not arbitrary computation inside application serialization code.
const deniedExpansion = Object.fromEntries(Array.from({ length: 21000 }, (_, index) => [`hidden${index}`, 'never']));
const documentHook = (doc) => {
  hookCalls++;
  if (doc.name === 'wire-denied-keys')
    Object.defineProperty(doc.token, 'toBSON', {
      value: () => {
        wireHookCalls++;
        return deniedExpansion;
      },
    });
  return {};
};
await mongoose.connect(process.env.MONGODB_URL, { dbName: 'packed_fast_path_native' });
try {
  const Model = mongoose.model(
    'PackedFastPathNative',
    new mongoose.Schema(
      { name: String, value: mongoose.Schema.Types.Mixed, token: mongoose.Schema.Types.ObjectId },
      { versionKey: false },
    ),
  );
  const api = createAccessRuntime();
  api.setGlobalOptions({ globalPermissions: () => [], logger: { warn() {} } });
  const router = api.createRouter(Model, {
    basePath: '/native-budget',
    operationAccess: { list: true, read: true },
    permissionSchema: { name: true, value: true, token: true },
    stripPermissionsField: true,
    unsafeSkipListDocumentSnapshotChecks: true,
    unsafeSkipListOutputSnapshotChecks: true,
    unsafeSkipListNestedDocumentSnapshotChecks: true,
    unsafeSkipListInitialOutputSnapshotCopy: true,
    unsafeSkipReadDocumentSnapshotChecks: true,
    unsafeSkipReadOutputSnapshotChecks: true,
    unsafeSkipReadNestedDocumentSnapshotChecks: true,
    unsafeSkipReadInitialOutputSnapshotCopy: true,
    unsafeUseListAuthorizationFastPath: true,
    unsafeUseReadAuthorizationFastPath: true,
    docPermissions: {
      list: documentHook,
      read: documentHook,
    },
  });
  const ordinary = new B.Code('return 1', {
    selected: 'yes',
    child: new B.DBRef('collection', new B.ObjectId('000000000000000000000001'), 'db', { selected: true }),
  });
  // The Mongo driver's deserializer can return DBRef even from an ordinary BSON
  // document. Persist actual BSON values rather than inventing tags in JSON requests.
  await Model.create([
    { name: 'wire-denied-keys', token: new B.ObjectId() },
    { name: 'ordinary', value: ordinary },
    { name: 'code-overbound', value: new B.Code('return 1', { expanded: Array(20001).fill('selected') }) },
    {
      name: 'dbref-overbound',
      value: new B.DBRef('collection', new B.ObjectId(), 'db', { expanded: Array(20001).fill('selected') }),
    },
  ]);
  const app = express().use(express.json()).use(router.routes);
  server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  for (const name of ['ordinary', 'code-overbound', 'dbref-overbound', 'wire-denied-keys']) {
    for (const [origin, suffix] of [
      ['list', '/__query'],
      ['read', '/__query/__filter'],
    ]) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/native-budget${suffix}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          filter: { name },
          select: ['name', name === 'wire-denied-keys' ? 'token' : 'value', '-_id'],
          limit: 1,
          options: { includePermissions: false, includeFieldPermissions: false, includeCount: false },
        }),
      });
      const body = await response.json();
      const row = origin === 'list' ? body.data?.[0] : body;
      results.push({
        name,
        origin,
        status: response.status,
        selectedScopeSlots: row?.value?.scope?.expanded?.length ?? null,
      });
      if (name === 'ordinary') {
        assert.equal(response.status, 200);
        assert.equal(row.name, name);
        assert.equal(row.value.code, 'return 1');
        assert.equal(row.value.scope.selected, 'yes');
        assert.deepEqual(row.value.scope.child, {
          $ref: 'collection',
          $id: '000000000000000000000001',
          selected: true,
          $db: 'db',
        });
      } else {
        assert.equal(response.status, 400, `${origin} ${name} must reject selected native expansion`);
        assert.equal(row?.value, undefined);
        assert.equal(row?.token, undefined);
        assert.equal(body.data, undefined, 'no partial row publication');
        assert.ok(JSON.stringify(body).includes('Service authorization:'), 'controlled authorization failure');
      }
    }
  }
  assert.equal(hookCalls, 8);
  assert.equal(wireHookCalls, 2);
  console.log(
    JSON.stringify({
      results,
      hookCalls,
      wireHookCalls,
      expandedOwnKeys: Object.keys(deniedExpansion).length,
      mongoose: mongoose.version,
    }),
  );
} finally {
  if (server)
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
  if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}
