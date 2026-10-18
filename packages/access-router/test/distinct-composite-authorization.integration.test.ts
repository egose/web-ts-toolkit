import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAccessRuntime } from '../dist/index.mjs';
import type { Filter, ModelRequest } from '../dist/advanced';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

type Row = Record<string, any>;
type Entry = 'GET' | 'POST' | 'root' | 'trusted';
const entries: Entry[] = ['GET', 'POST', 'root', 'trusted'];
const filteredEntries: Entry[] = ['POST', 'root', 'trusted'];
const containers = ['profile', 'single', 'contacts', 'envelope'] as const;
const scalarChildren = ['profile.public', 'single.public', 'contacts.public', 'envelope.members.public'];
const quiet = { includePermissions: false, includeFieldPermissions: false };
let sequence = 0;
const runtimes: ReturnType<typeof createAccessRuntime>[] = [];

const plain = (value: unknown): any => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const sorted = (values: unknown[]) => values.map((value) => JSON.stringify(plain(value))).sort();
const restrictedRule = () => ({ read: true, list: true, sub: { public: true, secret: false } });

afterEach(() => {
  vi.restoreAllMocks();
  for (const api of runtimes.splice(0)) api.runtime.clearOpenApiRoutes();
  mongoose.deleteModel(/^Arl04Distinct/);
});

async function fixture() {
  const api = createAccessRuntime();
  runtimes.push(api);
  const modelName = `Arl04Distinct${++sequence}`;
  const pair = { public: String, secret: String };
  const embedded = new mongoose.Schema(pair, { _id: false });
  const schema = new mongoose.Schema(
    {
      name: String,
      tenant: String,
      restricted: Boolean,
      revision: Number,
      role: String,
      profile: pair,
      single: embedded,
      contacts: [embedded],
      envelope: new mongoose.Schema({ members: [embedded] }, { _id: false }),
      identified: [new mongoose.Schema(pair)],
      empty: new mongoose.Schema({}, { _id: false, minimize: false }),
      payload: mongoose.Schema.Types.Mixed,
      scalarPayload: mongoose.Schema.Types.Mixed,
      mixedList: [mongoose.Schema.Types.Mixed],
      mixedMatrix: [[mongoose.Schema.Types.Mixed]],
      opaqueContainer: { payload: mongoose.Schema.Types.Mixed },
      metrics: { type: Map, of: Number },
      records: { type: Map, of: embedded },
      open: new mongoose.Schema(pair, { _id: false, strict: false }),
      versioned: new mongoose.Schema({ public: String, revision: Number }, { _id: false, versionKey: 'revision' }),
      panel: new mongoose.Schema({ public: String }, { _id: false }),
      labels: [String],
      matrix: [[Number]],
      when: Date,
      owner: { type: mongoose.Schema.Types.ObjectId, ref: modelName },
      reconciliation: mongoose.Schema.Types.Mixed,
    },
    { minimize: false },
  );
  const Model = mongoose.model(modelName, schema);
  const hook = vi.fn((doc: Row) => ({ blocked: doc.restricted, owner: !doc.restricted }));
  const getter = vi.fn(() => 'computed-output');
  api.setGlobalOptions({ globalPermissions: () => ({ reader: true, admin: false }) });
  const basePath = `/arl04-${sequence}`;
  const rootPath = `/arl04-root-${sequence}`;
  const router = api.createRouter(Model, {
    hydration: { find: 'lean', findOne: 'lean', findById: 'lean', publicRead: 'lean' },
    basePath,
    operationAccess: { list: true, read: true, distinct: true },
    permissionSchema: {
      name: true,
      tenant: false,
      restricted: false,
      revision: true,
      role: 'reader',
      profile: restrictedRule(),
      single: restrictedRule(),
      contacts: restrictedRule(),
      envelope: { read: true, list: true, sub: { members: restrictedRule() } },
      identified: true,
      empty: true,
      payload: true,
      scalarPayload: true,
      mixedList: true,
      mixedMatrix: true,
      opaqueContainer: true,
      metrics: true,
      'metrics.apples': true,
      records: { read: true, sub: { primary: { read: true, sub: { public: true, secret: true } } } },
      open: { read: true, sub: { public: true, secret: true } },
      versioned: true,
      panel: true,
      labels: true,
      matrix: true,
      when: true,
      owner: true,
      computed: true,
    },
    modelPermissionPrefix: 'doc:',
    baseFilter: { read: () => ({ tenant: 'visible' }) },
    alwaysSelectFields: ['restricted'],
    docPermissions: { read: hook },
    virtuals: {
      computed: { get: getter, dependsOn: [] },
      panel: { sub: { computed: { get: getter, dependsOn: [] } } },
    },
    stripPermissionsField: true,
    defaults: { publicReadOptions: { ...quiet, tryList: false } },
  } as never);
  const root = api.createRouter({ basePath: rootPath, operationAccess: true });
  const owner = new mongoose.Types.ObjectId();
  const rows = await Model.create(
    ['alpha', 'beta', 'outside'].map((name, index) => {
      const value = { public: 'same-public-value', secret: `hidden-${name}` };
      return {
        name,
        tenant: index < 2 ? 'visible' : 'other',
        restricted: index !== 1,
        revision: index + 1,
        role: index === 0 ? 'admin' : 'user',
        profile: value,
        single: value,
        contacts: [value],
        envelope: { members: [value] },
        identified: [value],
        empty: {},
        payload: value,
        scalarPayload: name,
        mixedList: [value],
        mixedMatrix: [[value]],
        opaqueContainer: { payload: value },
        metrics: { apples: index + 1, pears: index + 2 },
        records: { primary: value },
        open: { ...value, extra: `hidden-open-${name}` },
        versioned: { public: name, revision: index + 1 },
        panel: { public: name },
        labels: ['shared', name],
        matrix: [[index, index + 1]],
        when: new Date(`2026-10-0${index + 1}T00:00:00.000Z`),
        owner,
        reconciliation: index === 1 ? {} : { settled: true },
      };
    }),
  );
  const distinct = vi.spyOn(Model, 'distinct');
  const collectionDistinct = vi.spyOn(Model.collection, 'distinct');
  const persistence = [
    distinct,
    collectionDistinct,
    vi.spyOn(Model, 'find'),
    vi.spyOn(Model, 'findOne'),
    vi.spyOn(Model, 'countDocuments'),
    vi.spyOn(Model, 'aggregate'),
  ];
  const resetTrace = () => {
    persistence.forEach((spy) => spy.mockClear());
    hook.mockClear();
    getter.mockClear();
  };
  const assertNoPersistence = () => {
    persistence.forEach((spy) => expect.soft(spy).not.toHaveBeenCalled());
    expect.soft(hook).not.toHaveBeenCalled();
    expect.soft(getter).not.toHaveBeenCalled();
  };
  let run: (req: ModelRequest) => Promise<unknown>;
  let failure: unknown;
  let value: unknown;
  router.router.post('/probe', async (req, res) => {
    try {
      value = await run(req as unknown as ModelRequest);
    } catch (error) {
      failure = error;
    }
    res.json({ ok: true });
  });
  const app = express();
  app.use(express.json(), router.routes, root.routes);
  const execute = async <T>(callback: (req: ModelRequest) => Promise<T>): Promise<T> => {
    failure = undefined;
    run = callback;
    await request(app).post(`${basePath}/probe`).send({}).expect(200);
    if (failure) throw failure;
    return value as T;
  };
  const invoke = async (entry: Entry, field: string, filter: Filter = {}): Promise<Row> => {
    if (entry === 'trusted') {
      const result = await execute((req) => req.macl.getService(modelName).distinct(field, { filter }));
      return {
        status: result.success ? 200 : result.code === 'bad_request' ? 400 : 403,
        body: plain(result),
        ...(result.success ? { data: plain(result.data), count: result.count } : {}),
      };
    }
    if (entry === 'root') {
      const response = await request(app)
        .post(rootPath)
        .send([{ target: 'model', name: modelName, op: 'distinct', field, filter }])
        .expect(200);
      const item = response.body[0];
      return { status: item.statusCode, body: item, data: item.result.data, count: item.result.count };
    }
    const url = `${basePath}/distinct/${encodeURIComponent(field)}`;
    const response = entry === 'GET' ? await request(app).get(url) : await request(app).post(url).send({ filter });
    return { status: response.status, body: response.body, data: response.status === 200 ? response.body : undefined };
  };
  const read = async (entry: Entry, field: string): Promise<Row> => {
    const id = String(rows[0]._id);
    if (entry === 'trusted') {
      const result = await execute((req) => req.macl.getService(modelName).findById(id, { select: [field] }, quiet));
      expect(result).toMatchObject({ success: true });
      return plain(result.success ? result.data : undefined);
    }
    if (entry === 'root') {
      const response = await request(app)
        .post(rootPath)
        .send([{ target: 'model', name: modelName, op: 'read', id, args: { select: [field] } }])
        .expect(200);
      expect(response.body[0]).toMatchObject({ statusCode: 200, result: { success: true } });
      return response.body[0].result.data;
    }
    const response =
      entry === 'GET'
        ? await request(app).get(`${basePath}/${id}`).query({ select: field }).expect(200)
        : await request(app)
            .post(`${basePath}/__query/${id}`)
            .send({ select: [field] })
            .expect(200);
    return response.body;
  };
  const setRules = (rules: Row) =>
    router.setOption('permissionSchema', { ...api.runtime.getModelOptions(modelName).permissionSchema, ...rules });
  const expectedDistinct = (field: string) => Model.collection.distinct(field, { tenant: 'visible' });
  return {
    api,
    app,
    basePath,
    rootPath,
    router,
    Model,
    modelName,
    rows,
    hook,
    getter,
    distinct,
    collectionDistinct,
    execute,
    invoke,
    read,
    setRules,
    expectedDistinct,
    resetTrace,
    assertNoPersistence,
  };
}

function assertDenied(response: Row, field: string) {
  expect.soft(response.status, JSON.stringify(response.body)).toBe(403);
  expect.soft(response.data).toBeUndefined();
  expect.soft(JSON.stringify(response.body)).toContain(`Distinct field not allowed: ${field}`);
  expect.soft(JSON.stringify(response.body)).not.toContain('hidden-');
}

describe.each(entries)('ARL-04 whole-value distinct through %s', (entry) => {
  it.each(containers)('denies restricted %s before persistence, unlike an ordinary trimmed read', async (field) => {
    const f = await fixture();
    const read = await f.read(entry, field);
    const publicValue = { public: 'same-public-value' };
    expect(read[field]).toEqual(
      field === 'contacts' ? [publicValue] : field === 'envelope' ? { members: [publicValue] } : publicValue,
    );
    expect(JSON.stringify(read)).not.toContain('hidden-');
    f.resetTrace();
    assertDenied(await f.invoke(entry, field), field);
    f.assertNoPersistence();
  });

  it.each(scalarChildren)('permits the explicitly granted scalar child %s', async (field) => {
    const f = await fixture();
    const response = await f.invoke(entry, field);
    expect(response).toMatchObject({ status: 200, data: ['same-public-value'] });
    if (entry === 'root' || entry === 'trusted') expect(response.count).toBe(1);
    expect(f.distinct).toHaveBeenCalledTimes(1);
    expect(f.collectionDistinct).toHaveBeenCalledTimes(1);
    expect(f.hook).not.toHaveBeenCalled();
    expect(f.getter).not.toHaveBeenCalled();
  });

  it.each(containers)('preserves fully granted %s raw values and distinct equivalence/counts', async (field) => {
    const f = await fixture();
    f.setRules({ [field]: true });
    const expected = await f.expectedDistinct(field);
    expect(expected).toHaveLength(2); // Same public value, different authorized private values.
    f.resetTrace();
    const response = await f.invoke(entry, field);
    expect(response.status).toBe(200);
    expect(sorted(response.data)).toEqual(sorted(expected));
    if (entry === 'root' || entry === 'trusted') expect(response.count).toBe(2);
    expect(f.distinct).toHaveBeenCalledTimes(1);
    expect(f.collectionDistinct).toHaveBeenCalledTimes(1);
    expect(f.hook).not.toHaveBeenCalled();
  });

  it.each(['document-key', 'document-function'] as const)(
    'rejects %s nested decisions without synthetic grants',
    async (kind) => {
      const f = await fixture();
      const conditional = vi.fn((_permissions, grants: Row = {}) => !grants.blocked);
      f.setRules({
        profile: { read: true, sub: { public: true, secret: kind === 'document-key' ? 'doc:owner' : conditional } },
      });
      expect((await f.read(entry, 'profile')).profile).toEqual({ public: 'same-public-value' });
      f.resetTrace();
      conditional.mockClear();
      assertDenied(await f.invoke(entry, 'profile'), 'profile');
      expect(conditional).not.toHaveBeenCalled();
      f.assertNoPersistence();
    },
  );

  it.each(['profile', 'contacts'] as const)('rejects %s containing configured permission metadata', async (field) => {
    const f = await fixture();
    f.setRules({ [field]: true });
    f.router.setOption('documentPermissionField', `${field}.secret`);
    const read = await f.read(entry, field);
    expect(read[field]).toEqual(
      field === 'contacts' ? [{ public: 'same-public-value' }] : { public: 'same-public-value' },
    );
    f.resetTrace();
    assertDenied(await f.invoke(entry, field), field);
    f.assertNoPersistence();
  });
});

describe('ARL-04 schema and request proof boundaries', () => {
  it('preserves scalar/native values, scalar arrays, embedded IDs and empty closed objects', async () => {
    const f = await fixture();
    for (const field of [
      'name',
      'role',
      'revision',
      '_id',
      'labels',
      'matrix',
      'when',
      'owner',
      'identified',
      'empty',
    ]) {
      const expected = await f.expectedDistinct(field);
      f.resetTrace();
      const response = await f.invoke('trusted', field);
      expect(response.status, field).toBe(200);
      expect(sorted(response.data), field).toEqual(sorted(expected));
      expect(response.count, field).toBe(expected.length);
      expect(f.distinct).toHaveBeenCalledTimes(1);
      expect(f.hook).not.toHaveBeenCalled();
      expect(f.getter).not.toHaveBeenCalled();
    }
  });

  it.each(['payload', 'scalarPayload', 'mixedList', 'mixedMatrix', 'opaqueContainer', 'metrics', 'records', 'open'])(
    'rejects open-ended %s despite a granted parent, without inspecting current values',
    async (field) => {
      const f = await fixture();
      f.setRules({ [field]: true });
      assertDenied(await f.invoke('trusted', field), field);
      f.assertNoPersistence();
    },
  );

  it('permits explicitly granted typed Map keys and scalar children of non-strict objects', async () => {
    const f = await fixture();
    for (const field of ['metrics.apples', 'records.primary', 'open.public']) {
      const expected = await f.expectedDistinct(field);
      f.resetTrace();
      const response = await f.invoke('trusted', field);
      expect(response.status, field).toBe(200);
      expect(sorted(response.data), field).toEqual(sorted(expected));
      expect(response.count).toBe(expected.length);
      expect(f.distinct).toHaveBeenCalledTimes(1);
    }
  });

  it('applies nested restrictions at named Map values and still permits their scalar child', async () => {
    const f = await fixture();
    f.setRules({ records: { read: true, sub: { primary: restrictedRule() } } });
    assertDenied(await f.invoke('trusted', 'records.primary'), 'records.primary');
    f.assertNoPersistence();
    expect(await f.invoke('trusted', 'records.primary.public')).toMatchObject({
      status: 200,
      data: ['same-public-value'],
    });
  });

  it.each(['missing', 'flat-denial'] as const)('rejects %s descendants beneath a granted container', async (kind) => {
    const f = await fixture();
    f.setRules(
      kind === 'missing'
        ? { profile: { read: true, sub: { public: true } } }
        : { profile: true, 'profile.secret': false },
    );
    expect((await f.read('trusted', 'profile')).profile).toEqual({ public: 'same-public-value' });
    f.resetTrace();
    assertDenied(await f.invoke('trusted', 'profile'), 'profile');
    f.assertNoPersistence();
  });

  it('shares ordinary exact dotted-rule precedence and request-satisfied permission expressions', async () => {
    const f = await fixture();
    f.setRules({ 'profile.secret': ['missing', 'reader'], profile: restrictedRule() });
    expect((await f.read('trusted', 'profile')).profile).toEqual({
      public: 'same-public-value',
      secret: 'hidden-alpha',
    }); // pragma: allowlist secret
    const expected = await f.expectedDistinct('profile');
    f.resetTrace();
    const response = await f.invoke('trusted', 'profile');
    expect(response.status).toBe(200);
    expect(sorted(response.data)).toEqual(sorted(expected));
    expect(response.count).toBe(2);
  });

  it('requires all request ancestors for a sub-rule and preserves explicit read:false', async () => {
    const f = await fixture();
    f.setRules({ profile: { read: false, list: true, sub: { public: true, secret: true } } });
    for (const field of ['profile', 'profile.public']) {
      assertDenied(await f.invoke('trusted', field), field);
      f.assertNoPersistence();
    }
  });

  it('permits complete .sub authority proved by the original request permissions', async () => {
    const f = await fixture();
    f.setRules({ profile: { read: 'reader', sub: { public: true, secret: ['missing', 'reader'] } } });
    const expected = await f.expectedDistinct('profile');
    f.resetTrace();
    const response = await f.invoke('trusted', 'profile');
    expect(response.status).toBe(200);
    expect(sorted(response.data)).toEqual(sorted(expected));
    expect(response.count).toBe(2);
    expect(f.hook).not.toHaveBeenCalled();
  });

  it.each(['sub-denial', 'dotted-denial', 'sub-function'] as const)(
    'rejects a stale policy descendant absent from the schema (%s)',
    async (kind) => {
      const f = await fixture();
      const rule = vi.fn(() => true);
      await f.Model.collection.updateOne({ _id: f.rows[0]._id }, { $set: { 'profile.retired': 'hidden-retired' } });
      f.setRules(
        kind === 'dotted-denial'
          ? { profile: true, 'profile.retired': false }
          : {
              profile: {
                read: true,
                sub: { public: true, secret: true, retired: kind === 'sub-function' ? rule : false },
              },
            },
      );
      expect((await f.read('trusted', 'profile')).profile).not.toHaveProperty('retired');
      f.resetTrace();
      rule.mockClear();
      assertDenied(await f.invoke('trusted', 'profile'), 'profile');
      f.assertNoPersistence();
      expect(rule).not.toHaveBeenCalled();
    },
  );

  it.each(['shared-scalar', 'mixed-variant'] as const)(
    'rejects discriminator composite values and checks every scalar variant (%s)',
    async (kind) => {
      const f = await fixture();
      const contacts = f.Model.schema.path('contacts') as mongoose.Schema.Types.DocumentArray;
      contacts.discriminator(
        'private',
        new mongoose.Schema(
          {
            extraSecret: String,
            ...(kind === 'mixed-variant' ? { public: mongoose.Schema.Types.Mixed } : {}),
          },
          { _id: false },
        ),
      );
      f.setRules({ contacts: { read: true, sub: { public: true, secret: true, __t: true } } });
      await f.Model.collection.updateOne(
        { _id: f.rows[0]._id },
        {
          $set: {
            contacts: [
              {
                __t: 'private',
                public: kind === 'mixed-variant' ? { secret: 'hidden-scalar-variant' } : 'same-public-value',
                secret: 'allowed',
                extraSecret: 'hidden-variant',
              },
            ],
          },
        },
      );
      expect((await f.read('trusted', 'contacts')).contacts[0]).not.toHaveProperty('extraSecret');
      f.resetTrace();
      assertDenied(await f.invoke('trusted', 'contacts'), 'contacts');
      f.assertNoPersistence();
      const scalar = await f.invoke('trusted', 'contacts.public');
      if (kind === 'shared-scalar') expect(scalar).toMatchObject({ status: 200, data: ['same-public-value'] });
      else {
        assertDenied(scalar, 'contacts.public');
        f.assertNoPersistence();
      }
    },
  );

  it('rejects recursive composite schema values before querying', async () => {
    const f = await fixture();
    const recursive = new mongoose.Schema({ value: String }, { _id: false });
    recursive.add({ children: [recursive] });
    f.Model.schema.add({ tree: recursive });
    f.setRules({ tree: true });
    await f.Model.collection.updateOne(
      { _id: f.rows[0]._id },
      { $set: { tree: { value: 'root', children: [{ value: 'hidden-child' }] } } },
    );
    assertDenied(await f.invoke('trusted', 'tree'), 'tree');
    f.assertNoPersistence();
  });

  it('rejects callable scalar/parent rules, including a throw-then-grant callback, without invoking them', async () => {
    const f = await fixture();
    const rule = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('transient rule failure');
      })
      .mockReturnValue(true);
    f.setRules({ name: rule, profile: { read: rule, sub: { public: true, secret: true } } });
    for (const field of ['name', 'profile', 'profile.public']) {
      assertDenied(await f.invoke('trusted', field), field);
      f.assertNoPersistence();
    }
    expect(rule).not.toHaveBeenCalled();
  });

  it('does not retry a failing request permission check through a permissive fallback', async () => {
    const f = await fixture();
    await f.execute(async (req) => {
      const permissions = req.macl.getPermissions();
      const has = vi.spyOn(permissions, 'has').mockImplementationOnce(() => {
        throw new Error('permission failure');
      });
      const service = req.macl.getService(f.modelName);
      expect.soft(await service.distinct('role')).toMatchObject({ success: false, code: 'forbidden' });
      expect.soft(has).toHaveBeenCalledTimes(1);
      f.assertNoPersistence();
      has.mockRestore();
      expect(await service.distinct('role')).toMatchObject({ success: true, data: ['admin', 'user'], count: 2 });
    });
  });

  it('rejects protected declared descendants and registered virtual-containing values', async () => {
    const f = await fixture();
    await f.Model.collection.updateOne(
      { _id: f.rows[0]._id },
      { $set: { 'panel.computed': 'hidden-persisted-alpha' } },
    );
    expect((await f.read('trusted', 'versioned')).versioned).toEqual({ public: 'alpha' });
    expect((await f.read('trusted', 'panel')).panel).toEqual({ public: 'alpha', computed: 'computed-output' });
    f.resetTrace();
    for (const field of ['versioned', 'versioned.revision', 'panel', 'panel.computed', 'computed']) {
      assertDenied(await f.invoke('trusted', field), field);
      f.assertNoPersistence();
    }
  });

  it('rejects unknown fields and Mixed descendants even when named by request rules', async () => {
    const f = await fixture();
    await f.Model.collection.updateOne({ _id: f.rows[0]._id }, { $set: { undeclared: 'hidden-undeclared' } });
    f.setRules({ undeclared: true, 'payload.public': true });
    for (const field of ['undeclared', 'payload.public']) {
      assertDenied(await f.invoke('trusted', field), field);
      f.assertNoPersistence();
    }
  });

  it('keeps backend output elevation and document grants separate from later distinct admission', async () => {
    const f = await fixture();
    await f.execute(async (req) => {
      const service = req.macl.getService(f.modelName);
      const read = await service.findById(
        String(f.rows[0]._id),
        { select: ['profile'] },
        {
          ...quiet,
          authorization: { outputFields: { mode: 'unrestricted' } },
        },
      );
      expect(read).toMatchObject({
        success: true,
        data: { profile: { public: 'same-public-value', secret: 'hidden-alpha' } },
      }); // pragma: allowlist secret
      f.resetTrace();
      expect(await service.distinct('profile')).toMatchObject({ success: false, code: 'forbidden' });
      f.assertNoPersistence();
      expect(req.macl.getPermissions().has('admin')).toBe(false);
      expect(req.macl.getPermissions().has('reader')).toBe(true);
    });
  });
});

describe.each(filteredEntries)('ARL-04 preserved query policy through %s', (entry) => {
  it('keeps row scope, numeric casting and virtual predicate exclusion for scalar distinct', async () => {
    const f = await fixture();
    const response = await f.invoke(entry, 'name', { revision: '2', computed: 'ignored' } as Filter);
    expect(response).toMatchObject({ status: 200, data: ['beta'] });
    expect(f.collectionDistinct).toHaveBeenCalledTimes(1);
    const sent = JSON.stringify(f.collectionDistinct.mock.calls[0]);
    expect(sent).toContain('visible');
    expect(sent).toContain('"revision":2');
    expect(sent).not.toContain('computed');
    expect(f.hook).not.toHaveBeenCalled();
    expect(f.getter).not.toHaveBeenCalled();
  });

  it('preserves ARL-02 empty-object literal equality rather than broadening the filter', async () => {
    const f = await fixture();
    expect(await f.invoke(entry, 'name', { reconciliation: {} })).toMatchObject({ status: 200, data: ['beta'] });
    expect(f.collectionDistinct).toHaveBeenCalledTimes(1);
  });

  it.each(entry === 'trusted' ? ['input', 'base', 'transform'] : ['base', 'transform'])(
    'retains terminal %s denial with zero persistence',
    async (source) => {
      const f = await fixture();
      if (source === 'base') f.router.setOption('baseFilter.read', () => false);
      if (source === 'transform') f.router.setOption('overrideFilter.read', () => false);
      const response = await f.invoke(entry, 'name', source === 'input' ? false : {});
      expect(response.status).toBe(403);
      expect(response.data).toBeUndefined();
      f.assertNoPersistence();
    },
  );
});
