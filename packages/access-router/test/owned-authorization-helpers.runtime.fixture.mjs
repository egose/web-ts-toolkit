/** Fresh packed public API / actual Mongo reads, not a latency benchmark. */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import mongoose from 'mongoose';
import { createAccessRuntime, guard } from '@web-ts-toolkit/access-router';
import * as rootSurface from '@web-ts-toolkit/access-router';
import * as advanced from '@web-ts-toolkit/access-router/advanced';
import * as processors from '@web-ts-toolkit/access-router/processors';

const uri = process.env.MONGODB_URL;
assert.ok(uri);
const api = createAccessRuntime();
let server;
const results = [];
const statuses = [];
// Bounded escape probes, not OAR-06's complete configuration placement matrix.
const controls = [
  'documentAuthorization',
  'documentAuthorizationStage',
  'readAuthorizationMode',
  'listAuthorizationMode',
  'unsafeUseReadAuthorizationFastPath',
  'unsafeSkipListDocumentSnapshotChecks',
];
try {
  await mongoose.connect(uri, { dbName: `oar05-helpers-${process.pid}` });
  const Model = mongoose.model(
    'PackedOwnedHelpers',
    new mongoose.Schema({
      name: String,
      ownerId: String,
      owned: String,
      negative: String,
      secret: String,
      visible: Boolean,
      and: String,
      or: String,
      async: String,
      contacts: [new mongoose.Schema({ email: String, owned: String, secret: String }, { _id: false })],
    }),
  );
  let reads = 0,
    hooks = 0,
    virtuals = 0,
    fieldCalls = 0,
    databaseCalls = 0;
  const databaseMethods = {};
  const readMethods = ['find', 'findOne', 'count', 'countDocuments', 'estimatedDocumentCount', 'distinct', 'aggregate'];
  const calls = [];
  mongoose.set('debug', (_collection, method) => {
    databaseCalls++;
    databaseMethods[method] = (databaseMethods[method] ?? 0) + 1;
    if (readMethods.includes(method)) reads++;
  });
  api.setGlobalOptions({ globalPermissions: () => ({ reader: true, admin: false }), logger: { warn() {} } });
  const router = api.createRouter(Model, {
    basePath: '/helpers',
    operationAccess: true,
    modelPermissionPrefix: 'doc:',
    baseFilter: { read: () => ({ visible: true }), list: () => ({ visible: true }) },
    permissionSchema: {
      name: 'reader',
      ownerId: false,
      secret: false,
      owned: 'doc:owner',
      negative(_permissions, grants) {
        fieldCalls++;
        calls.push(grants);
        return !grants.suspended;
      },
      and: 'reader admin',
      or: ['admin', 'reader'],
      async: async (_permissions, grants) => {
        fieldCalls++;
        calls.push(grants);
        return grants.owner === true;
      },
      contacts: { read: true, sub: { email: 'reader', owned: 'doc:owner', secret: false } },
      label: true,
    },
    alwaysSelectFields: ['ownerId'],
    stripPermissionsField: true,
    docPermissions: {
      read: (doc) => {
        hooks++;
        return { owner: doc.ownerId === 'actor', suspended: true };
      },
    },
    virtuals: {
      label: {
        get: () => {
          virtuals++;
          return 'computed';
        },
        dependsOn: [],
      },
    },
    decorate: { read: (doc) => ({ ...doc, _permissions: { owner: true } }) },
  });
  const row = await Model.create({
    name: 'first',
    ownerId: 'actor',
    owned: 'O',
    negative: 'not-unsuspended',
    secret: 'hidden',
    visible: true,
    contacts: [{ email: 'e', owned: 'child-owner', secret: 'child-hidden' }],
  });
  const raw = {
    name: 'raw',
    ownerId: 'actor',
    owned: 'not-raw-authority',
    negative: 'empty-facts',
    secret: 'hidden',
    and: 'denied',
    or: 'allowed',
    async: 'denied',
    contacts: [{ email: 'e', owned: 'forged', secret: 'child-hidden' }],
    _permissions: { owner: true },
  };
  const rawExpected = { name: 'raw', negative: 'empty-facts', or: 'allowed', contacts: [{ email: 'e' }] };
  router.router.post('/_check', async (req, res) => {
    const service = router.getService(req);
    // A previous normal query/guard legitimately observed nonempty facts. Only
    // callbacks admitted by this fresh helper invocation belong to its proof.
    calls.splice(0);
    const before = { reads, hooks, virtuals };
    const databaseBefore = databaseCalls;
    assert.deepEqual(await service.pickAllowedFields(raw, 'read'), rawExpected);
    assert.deepEqual(await service.trimOutputFields(raw, 'read'), rawExpected);
    assert.deepEqual(await service.genAllowedFields(raw, 'read', { purpose: 'output' }), [
      'name',
      'negative',
      'or',
      'contacts.email',
    ]);
    assert.deepEqual({ reads, hooks, virtuals }, before);
    assert.equal(databaseCalls, databaseBefore, 'raw helpers perform no database operation of any kind');
    for (const facts of calls.splice(0)) {
      assert.deepEqual(Object.keys(facts), []);
      assert.ok(Object.isFrozen(facts));
    }
    assert.deepEqual(
      await service.pickAllowedFields(raw, 'read', {
        authorization: { outputFields: { mode: 'grant', paths: ['secret'] } },
      }),
      { ...rawExpected, secret: 'hidden' },
    );
    assert.deepEqual(
      await service.pickAllowedFields(raw.contacts[0], 'read', {
        scopePath: ['contacts'],
        authorization: { outputFields: { mode: 'grant', paths: ['contacts.secret'] } },
      }),
      { email: 'e', secret: 'child-hidden' },
    );
    assert.deepEqual({ reads, hooks, virtuals }, before);
    assert.equal(databaseCalls, databaseBefore, 'explicit output grants do not perform database operations');
    for (const facts of calls.splice(0)) {
      assert.deepEqual(Object.keys(facts), []);
      assert.ok(Object.isFrozen(facts));
    }
    const select = ['name', 'owned', 'negative', 'contacts', '-_id'];
    const first = await service.findById(
      String(row._id),
      { select },
      { includePermissions: false, includeFieldPermissions: false },
    );
    assert.ok(first.success, JSON.stringify(first));
    const initialExpected = { name: 'first', owned: 'O', contacts: [{ email: 'e', owned: 'child-owner' }] };
    assert.deepEqual(first.data, initialExpected);
    assert.deepEqual({ reads, hooks }, { reads: before.reads + 1, hooks: before.hooks + 1 });
    // Presentation is not a current-authorization claim and needs no second read.
    assert.deepEqual({ name: first.data.name }, { name: 'first' });
    const helperExpected = { name: 'first', contacts: [{ email: 'e' }] };
    for (const dto of [
      first.data,
      { ...first.data },
      JSON.parse(JSON.stringify(first.data)),
      { ...first.data, _permissions: { owner: true, _view: { owned: true } } },
      { ...first.data, contacts: [{ email: 'e', owned: 'replaced', secret: 'forged' }] },
    ]) {
      assert.deepEqual(await service.pickAllowedFields(dto, 'read'), helperExpected);
      assert.equal(Object.getOwnPropertySymbols(dto).length, 0);
    }
    assert.deepEqual(await service.pickAllowedFields(first.data.contacts[0], 'read', { scopePath: ['contacts'] }), {
      email: 'e',
    });
    assert.deepEqual({ reads, hooks, virtuals }, { ...before, reads: before.reads + 1, hooks: before.hooks + 1 });
    assert.equal(databaseCalls, databaseBefore + 1, 'the initial query is the only database operation before refresh');
    for (const key of [
      'documentAuthorization',
      'getDocumentAuthorization',
      'currentDocument',
      'mongooseModel',
      'originalDocumentSnapshot',
    ])
      assert.equal(key in first.context, false);
    assert.equal(Object.getOwnPropertySymbols(first.context).length, 0);
    assert.equal(Object.getOwnPropertySymbols(first.data).length, 0);
    const diagnosticKeys = [
      'modelName',
      'operation',
      'receivingModelName',
      'scopePath',
      'virtualAccess',
      'outputAccess',
      'docPermissionsAccess',
      'docPermissions',
      'resolvedQuery',
    ];
    assert.ok(Object.keys(first.context).every((key) => diagnosticKeys.includes(key)));
    assert.ok(Object.isFrozen(first.context));
    assert.ok(Object.isFrozen(first.context.docPermissions));
    assert.ok(Object.isFrozen(first.context.scopePath));
    await assert.rejects(
      () =>
        Reflect.apply(service.pickAllowedFields, service, [
          first.data,
          'read',
          { documentAuthorization: first.context },
        ]),
      (error) => error.result.code === 'bad_request',
    );
    await Model.collection.updateOne({ _id: row._id }, { $set: { ownerId: 'other' } });
    const current = await service.findById(
      String(row._id),
      { select },
      { includePermissions: false, includeFieldPermissions: false },
    );
    assert.ok(current.success, JSON.stringify(current));
    assert.deepEqual(current.data, helperExpected);
    assert.deepEqual(first.data, initialExpected);
    assert.deepEqual({ reads, hooks }, { reads: before.reads + 2, hooks: before.hooks + 2 });
    await Model.collection.updateOne({ _id: row._id }, { $set: { ownerId: 'actor' } });
    results.push({
      mode: api.getModelOption(Model.modelName, 'readAuthorizationMode'),
      rawHelper: { reads: 0, hooks: 0, virtuals: 0 },
      presentationExtra: { reads: 0, hooks: 0 },
      initialAndCurrent: { reads: reads - before.reads, hooks: hooks - before.hooks },
    });
    res.json({ ok: true });
  });
  router.router.post('/_advanced', async (req) => {
    const service = router.getService(req);
    const before = { reads, hooks, virtuals, fieldCalls };
    const databaseBefore = databaseCalls;
    for (const key of controls) {
      const options = [
        { [key]: false },
        { [key]: undefined },
        Object.create({ [key]: undefined }),
        Object.defineProperty({}, key, { value: false }),
      ];
      for (const option of options) {
        const result = await Reflect.apply(service.findById, service, [String(row._id), { select: ['owned'] }, option]);
        assert.equal(result.success, false);
        assert.equal(result.code, advanced.Codes.BadRequest);
        await assert.rejects(
          () => Reflect.apply(service.pickAllowedFields, service, [raw, 'read', option]),
          (error) => error.result.code === advanced.Codes.BadRequest,
        );
        assert.throws(
          () =>
            advanced.parseBody(advanced.rootQuerySchema, [
              { target: 'model', name: Model.modelName, op: 'read', id: String(row._id), options: option },
            ]),
          (error) => error.statusCode === 400,
        );
      }
    }
    assert.deepEqual({ reads, hooks, virtuals, fieldCalls }, before);
    assert.equal(databaseCalls, databaseBefore);
    return { ok: true };
  });
  router.router.post(
    '/_guard',
    guard({ modelName: Model.modelName, id: String(row._id), condition: 'reader owner' }),
    (_req, res) => res.json({ ok: true }),
  );
  const root = api.createRouter({ basePath: '/root', operationAccess: true });
  const app = express();
  app.use(express.json());
  app.use(router.routes);
  app.use(root.routes);
  // guard() is ordinary Express middleware: next(error) intentionally reaches the
  // application's error channel. Format that exact error with the existing public
  // router handler, rather than fabricating an access-router result or a 401 body.
  app.use((error, req, res, next) =>
    router.router.responseHandler.handleResponse(() => {
      throw error;
    })(req, res, next),
  );
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const post = async (path, body) => {
    let response;
    try {
      // This correctness fixture does not measure persistent-connection latency.
      response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', connection: 'close' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (cause) {
      throw new Error(
        `Request failed for ${path}; completed=${JSON.stringify(statuses)}; work=${JSON.stringify({ reads, hooks, virtuals })}`,
        { cause },
      );
    }
    const text = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (cause) {
      throw new Error(
        `Non-JSON response for ${path}: status=${response.status}, content-type=${response.headers.get('content-type')}, body=${text.slice(0, 6000)}`,
        { cause },
      );
    }
    const contentType = response.headers.get('content-type');
    assert.match(contentType, /application\/(?:problem\+)?json/);
    statuses.push({ path, status: response.status, contentType, problemStatus: parsed.status ?? null });
    return { status: response.status, body: parsed };
  };
  for (const mode of ['isolated', 'trusted']) {
    api.setModelOption(Model.modelName, 'readAuthorizationMode', mode);
    assert.deepEqual(await post('/helpers/_check'), { status: 200, body: { ok: true } });
    assert.deepEqual(await post('/helpers/_advanced'), { status: 200, body: { ok: true } });
    for (const posture of ['strip', 'expose-none']) {
      api.setModelOptions(Model.modelName, {
        stripPermissionsField: posture === 'strip',
        exposedDocPermissionKeys: posture === 'expose-none' ? [] : undefined,
      });
      const before = { reads, hooks };
      assert.deepEqual(await post('/helpers/_guard'), { status: 200, body: { ok: true } });
      assert.deepEqual({ reads, hooks }, { reads: before.reads + 1, hooks: before.hooks + 1 });
      await Model.collection.updateOne({ _id: row._id }, { $set: { ownerId: 'other' } });
      const denied = await post('/helpers/_guard');
      assert.equal(denied.status, 401, JSON.stringify(denied));
      assert.equal(denied.body.status, 401);
      assert.equal(denied.body.data, undefined);
      assert.deepEqual({ reads, hooks }, { reads: before.reads + 2, hooks: before.hooks + 2 });
      await Model.collection.updateOne({ _id: row._id }, { $set: { ownerId: 'actor' } });
    }
    const before = { reads, hooks };
    // The post-filter decorator forges owner metadata, but cannot authorize guard.
    await Model.collection.updateOne({ _id: row._id }, { $set: { ownerId: 'actor', visible: false } });
    const missing = await post(`/helpers/__query/${row._id}`, {
      select: ['owned'],
      options: { tryList: false, includePermissions: false, includeFieldPermissions: false },
    });
    assert.equal(missing.status, 404, JSON.stringify(missing));
    assert.equal(hooks, before.hooks);
    assert.equal(reads, before.reads + 1);
    await Model.collection.updateOne({ _id: row._id }, { $set: { visible: true } });
    const replayBefore = { reads, hooks };
    const replayDatabaseBefore = databaseCalls;
    const replay = await post('/root', [
      {
        target: 'model',
        name: Model.modelName,
        op: 'read',
        id: String(row._id),
        options: { documentAuthorization: { docPermissions: { owner: true } } },
      },
    ]);
    assert.equal(replay.status, 400, JSON.stringify(replay));
    assert.equal(replay.body.status, 400);
    assert.deepEqual({ reads, hooks }, replayBefore);
    assert.equal(databaseCalls, replayDatabaseBefore);
    for (const key of controls) {
      const before = { reads, hooks, virtuals, fieldCalls };
      const databaseBefore = databaseCalls;
      const options = { [key]: false };
      for (const [path, body] of [
        [`/helpers/__query/${row._id}`, { select: ['owned'], options }],
        ['/root', [{ target: 'model', name: Model.modelName, op: 'read', id: String(row._id), options }]],
      ]) {
        const rejected = await post(path, body);
        assert.equal(rejected.status, 400, JSON.stringify(rejected));
        assert.equal(rejected.body.status, 400);
        assert.equal(rejected.body.data, undefined);
      }
      assert.deepEqual({ reads, hooks, virtuals, fieldCalls }, before);
      assert.equal(databaseCalls, databaseBefore);
    }
    results.at(-1).guard = {
      postures: ['strip', 'expose-none'],
      successful: { reads: 1, hooks: 1 },
      denied: { reads: 1, hooks: 1 },
    };
    results.at(-1).rowDenied = { reads: 1, hooks: 0 };
    results.at(-1).rootReplay = { reads: 0, hooks: 0 };
    results.at(-1).rejectedControlWork = { reads: 0, hooks: 0, virtuals: 0, fieldCalls: 0 };
    api.setModelOptions(Model.modelName, { stripPermissionsField: true, exposedDocPermissionKeys: undefined });
  }
  for (const surface of [rootSurface, advanced, processors])
    for (const name of [
      'DocumentAuthorization',
      'DocumentStage',
      'prepareDocumentStage',
      'resolveDocumentAuthorization',
      'createReceivingOutputBudget',
    ])
      assert.equal(name in surface, false);
  assert.equal(typeof processors.copyPaths, 'function');
  console.log(
    JSON.stringify({
      peers: { mongoose: mongoose.version },
      results,
      statuses,
      totals: { reads, hooks, virtuals },
      databaseMethods,
    }),
  );
} finally {
  if (server) await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  mongoose.set('debug', false);
  await mongoose.disconnect();
  api.runtime.clearOpenApiRoutes();
  mongoose.deleteModel(/^PackedOwnedHelpers/);
}
