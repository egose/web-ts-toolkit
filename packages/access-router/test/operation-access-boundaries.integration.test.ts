import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createAccessRuntime,
  defineRequestSchema,
  type AccessRouterRequest,
  type ModelRouterOptions,
} from '../dist/index.mjs';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

type Api = ReturnType<typeof createAccessRuntime>;
type Method = 'get' | 'post' | 'patch' | 'put';
type Spy = { mock: { calls: unknown[][] }; mockClear(): unknown };
const runtimes = new Set<Api>();
let counter = 0;
let writeCounter = 0;

const variants = [
  'basicList',
  'advancedList',
  'basicRead',
  'advancedRead',
  'basicCreate',
  'advancedCreate',
  'basicUpdate',
  'advancedUpdate',
  'basicUpsert',
  'advancedUpsert',
  'basicCount',
  'advancedCount',
  'basicDistinct',
  'advancedDistinct',
] as const;
const hiddenMetadata = { includePermissions: false, includeFieldPermissions: false };
const baseOperations = {
  list: true,
  read: true,
  create: true,
  update: true,
  upsert: true,
  count: true,
  distinct: true,
  new: true,
  delete: true,
  subs: { items: { list: true, read: true, create: true, update: true, delete: true } },
};

interface Item {
  _id?: mongoose.Types.ObjectId;
  label: string;
  value: number;
  listed: boolean;
  readable: boolean;
  privateNote?: string;
  target?: mongoose.Types.ObjectId;
}
interface SourceRow {
  name: string;
  key: string;
  tenant: string;
  target?: mongoose.Types.ObjectId;
  readOnly?: string;
  listOnly?: string;
  privateNote?: string;
  items: Item[];
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const api of runtimes) api.runtime.clearOpenApiRoutes();
  runtimes.clear();
  mongoose.deleteModel(/^Oav05/);
});

const observeModel = (Model: mongoose.Model<any>) => ({
  find: vi.spyOn(Model, 'find'),
  findOne: vi.spyOn(Model, 'findOne'),
  count: vi.spyOn(Model, 'countDocuments'),
  aggregate: vi.spyOn(Model, 'aggregate'),
  distinct: vi.spyOn(Model, 'distinct'),
  create: vi.spyOn(Model, 'create'),
  save: vi.spyOn(Model.prototype, 'save'),
});
const workCounts = (spies: Record<string, Spy>) =>
  Object.fromEntries(Object.entries(spies).map(([key, spy]) => [key, spy.mock.calls.length]));
const expectNoWork = (spies: Record<string, Spy>) => {
  for (const spy of Object.values(spies)) expect(spy).not.toHaveBeenCalled();
};

async function fixture(sourceOptions: ModelRouterOptions<SourceRow> = {}) {
  const api = createAccessRuntime();
  runtimes.add(api);
  api.setGlobalOptions({ requestPermissionField: '_permissions', globalPermissions: () => [] });
  const tag = ++counter;
  const sourceName = `Oav05Source${tag}`;
  const targetName = `Oav05Target${tag}`;
  const leafName = `Oav05Leaf${tag}`;
  const dataName = `Oav05Data${tag}`;
  const Leaf = mongoose.model(
    leafName,
    new mongoose.Schema(
      {
        name: String,
        tenant: String,
        privateNote: String,
      },
      { bufferCommands: false },
    ),
  );
  const Target = mongoose.model(
    targetName,
    new mongoose.Schema(
      {
        name: String,
        key: String,
        tenant: String,
        readOnly: String,
        listOnly: String,
        privateNote: String,
        leaf: { type: mongoose.Schema.Types.ObjectId, ref: leafName },
      },
      { bufferCommands: false },
    ),
  );
  const Source = mongoose.model<SourceRow>(
    sourceName,
    new mongoose.Schema<SourceRow>(
      {
        name: String,
        key: String,
        tenant: String,
        readOnly: String,
        listOnly: String,
        privateNote: String,
        target: { type: mongoose.Schema.Types.ObjectId, ref: targetName },
        items: [
          new mongoose.Schema<Item>({
            label: String,
            value: Number,
            listed: Boolean,
            readable: Boolean,
            privateNote: String,
            target: { type: mongoose.Schema.Types.ObjectId, ref: targetName },
          }),
        ],
      },
      { bufferCommands: false },
    ),
  );

  const leafRouter = api.createRouter(Leaf, {
    basePath: '/oav05-leaves',
    stripPermissionsField: true,
    operationAccess: { list: true, read: true },
    permissionSchema: { name: true, tenant: true, privateNote: false },
    baseFilter: { read: () => ({ tenant: 'read' }), list: () => ({ tenant: 'list' }) },
  });
  const targetRouter = api.createRouter(Target, {
    basePath: '/oav05-targets',
    stripPermissionsField: true,
    operationAccess: { list: true, read: true, count: true },
    permissionSchema: {
      name: true,
      key: true,
      tenant: true,
      leaf: true,
      privateNote: false,
      readOnly: { read: true, list: false },
      listOnly: { read: false, list: true },
    },
    baseFilter: {
      read: () => ({ tenant: 'read' }),
      list: () => ({ tenant: 'list' }),
      count: () => ({ tenant: 'count' }),
    },
  });
  const sourceRouter = api.createRouter(Source, {
    basePath: '/oav05-sources',
    stripPermissionsField: true,
    operationAccess: baseOperations,
    permissionSchema: {
      name: true,
      key: true,
      tenant: true,
      target: true,
      privateNote: false,
      readOnly: { read: true, list: false, create: true, update: true },
      listOnly: { read: false, list: true, create: true, update: true },
      items: {
        sub: {
          label: true,
          value: { read: true, list: false, create: true, update: true },
          listed: { create: true, update: true },
          readable: { create: true, update: true },
          privateNote: false,
          target: true,
        },
      },
    },
    baseFilter: {
      list: () => ({ tenant: 'allowed' }),
      read: () => ({ tenant: 'allowed' }),
      update: () => ({ tenant: 'allowed' }),
      subs: { items: { list: () => ({ listed: true }), read: () => ({ readable: true }) } },
    },
    ...sourceOptions,
  });
  const dataRouter = api.createDataRouter(dataName, {
    basePath: '/oav05-data',
    idField: 'id',
    operationAccess: { list: true, read: true },
    data: [
      { id: 'visible', name: 'data-visible', tenant: 'allowed', privateNote: 'stored-note' },
      { id: 'hidden', name: 'data-hidden', tenant: 'hidden', privateNote: 'stored-note' },
    ],
    permissionSchema: { id: true, name: true, privateNote: false },
    baseFilter: { list: () => ({ tenant: 'allowed' }), read: () => ({ tenant: 'allowed' }) },
  });
  const root = api.createRouter({ basePath: '/oav05-root', operationAccess: true, maxConcurrentOperations: 1 });

  const [leafRead, leafList] = await Leaf.create([
    { name: 'leaf-read', tenant: 'read', privateNote: 'stored-note' },
    { name: 'leaf-list', tenant: 'list', privateNote: 'stored-note' },
  ]);
  const [targetRead, targetList] = await Target.create([
    {
      name: 'target-read',
      key: 'join',
      tenant: 'read',
      leaf: leafRead._id,
      readOnly: 'target-read-field',
      listOnly: 'target-list-field',
    },
    {
      name: 'target-list',
      key: 'join',
      tenant: 'list',
      leaf: leafList._id,
      readOnly: 'target-read-field',
      listOnly: 'target-list-field',
    },
    { name: 'count-one', key: 'join', tenant: 'count' },
    { name: 'count-two', key: 'join', tenant: 'count' },
    { name: 'target-hidden', key: 'join', tenant: 'hidden', privateNote: 'stored-note' },
  ]);
  const [sourceRead, sourceList] = await Source.create([
    {
      name: 'source-read',
      key: 'join',
      tenant: 'allowed',
      target: targetRead._id,
      readOnly: 'source-read-field',
      listOnly: 'source-list-field',
      privateNote: 'stored-note',
      items: [
        { label: 'visible', value: 1, listed: true, readable: true, target: targetRead._id },
        { label: 'list-hidden', value: 2, listed: false, readable: true },
        { label: 'read-hidden', value: 3, listed: true, readable: false },
      ].map((row) => ({ ...row, privateNote: 'stored-note' })),
    },
    { name: 'source-list', key: 'join', tenant: 'allowed', target: targetList._id, items: [] },
    { name: 'source-hidden', key: 'join', tenant: 'hidden', target: targetRead._id, items: [] },
  ]);

  const observations: Array<Record<string, Spy>> = [];
  const app = express();
  app.use(express.json());
  // Initialize both owning cores before observing the live per-request instances.
  app.use(root.router.middlewares);
  app.use((req, _res, next) => {
    const { macl, dacl } = req as AccessRouterRequest;
    observations.push({
      allowed: vi.spyOn(macl, 'isAllowed'),
      routeAllowed: vi.spyOn(macl, 'isAllowedRoute'),
      dispatch: vi.spyOn(macl, 'getPublicService'),
      dataDispatch: vi.spyOn(dacl, 'getService'),
      filter: vi.spyOn(macl, 'genFilter'),
      select: vi.spyOn(macl, 'genSelect'),
      fields: vi.spyOn(macl, 'genAllowedFields'),
      decorate: vi.spyOn(macl, 'decorate'),
      decorateAll: vi.spyOn(macl, 'decorateAll'),
      validate: vi.spyOn(macl, 'validate'),
      prepare: vi.spyOn(macl, 'prepare'),
    });
    next();
  });
  sourceRouter.router.post('/internal/populate-plan', (req) =>
    req.macl.genPopulate(sourceName, req.body.access as never, req.body.populate as never),
  );
  sourceRouter.router.all('/internal/service/:operation', async (req) => {
    const { id = String(sourceRead._id), filter = {}, data = {}, args = {}, options = {} } = req.body ?? {};
    const svc = req.macl.getPublicService(sourceName);
    switch (req.params.operation) {
      case 'list':
        return svc._list(filter, args, options);
      case 'read':
        return svc._read(id, args, options);
      case 'read-filter':
        return svc._readFilter(filter, args, options);
      case 'create':
        return svc._create(data, args, options);
      case 'update':
        return svc._update(id, data, args, options);
      case 'upsert':
        return svc._upsert(data, args, options);
      case 'count':
        return svc._count(filter);
      case 'distinct':
        return svc._distinct('name', { filter });
      case 'find':
        return svc.find(filter, args, options);
      case 'find-one':
        return svc.findOne(filter, args, options);
      case 'create-raw':
        return svc.create(data, args, options);
      case 'update-raw':
        return svc.updateOne({ _id: id }, data, args, options);
      default:
        throw new Error('Unknown fixture service operation');
    }
  });
  app.use(sourceRouter.routes);
  app.use(targetRouter.routes);
  app.use(dataRouter.routes);
  app.use(root.routes);

  return {
    app,
    api,
    sourceRouter,
    targetRouter,
    leafRouter,
    dataRouter,
    sourceName,
    targetName,
    leafName,
    dataName,
    Source,
    Target,
    Leaf,
    sourceRead,
    sourceList,
    targetRead,
    targetList,
    observations,
    sourceWork: observeModel(Source),
    targetWork: observeModel(Target),
    leafWork: observeModel(Leaf),
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

interface ModelCall {
  label: string;
  access: string;
  variant: string;
  method: Method;
  path: string;
  body: Record<string, unknown>;
  root: Record<string, unknown>;
  status: number;
  schema?: string;
}
function modelCalls(f: Fixture): ModelCall[] {
  const name = `fresh-${++writeCounter}`;
  const id = String(f.sourceRead._id);
  const data = { name, key: 'join', tenant: 'allowed', target: String(f.targetRead._id), privateNote: 'client-note' };
  const entry = { target: 'model', name: f.sourceName };
  return [
    {
      label: 'list',
      access: 'list',
      variant: 'advancedList',
      method: 'post',
      path: '/__query',
      body: { filter: { name: 'source-read' } },
      root: { ...entry, op: 'list', filter: { name: 'source-read' } },
      status: 200,
      schema: 'advancedList',
    },
    {
      label: 'read-id',
      access: 'read',
      variant: 'advancedRead',
      method: 'post',
      path: `/__query/${id}`,
      body: {},
      root: { ...entry, op: 'read', id },
      status: 200,
      schema: 'advancedRead',
    },
    {
      label: 'read-filter',
      access: 'read',
      variant: 'advancedRead',
      method: 'post',
      path: '/__query/__filter',
      body: { filter: { name: 'source-read' } },
      root: { ...entry, op: 'read', filter: { name: 'source-read' } },
      status: 200,
      schema: 'advancedReadFilter',
    },
    {
      label: 'create',
      access: 'create',
      variant: 'advancedCreate',
      method: 'post',
      path: '/__mutation',
      body: { data },
      root: { ...entry, op: 'create', data },
      status: 201,
      schema: 'advancedCreate.default',
    },
    {
      label: 'update',
      access: 'update',
      variant: 'advancedUpdate',
      method: 'patch',
      path: `/__mutation/${id}`,
      body: { data: { name } },
      root: { ...entry, op: 'update', id, data: { name } },
      status: 200,
      schema: 'advancedUpdate.default',
    },
    {
      label: 'upsert-create',
      access: 'upsert',
      variant: 'advancedUpsert',
      method: 'put',
      path: '/__mutation',
      body: { data },
      root: { ...entry, op: 'upsert', data },
      status: 201,
      schema: 'advancedUpsert.default',
    },
    {
      label: 'upsert-update',
      access: 'upsert',
      variant: 'advancedUpsert',
      method: 'put',
      path: '/__mutation',
      body: { data: { _id: id, name } },
      root: { ...entry, op: 'upsert', data: { _id: id, name } },
      status: 200,
      schema: 'advancedUpsert.default',
    },
    {
      label: 'count',
      access: 'count',
      variant: 'advancedCount',
      method: 'post',
      path: '/count',
      body: {},
      root: { ...entry, op: 'count' },
      status: 200,
    },
    {
      label: 'distinct',
      access: 'distinct',
      variant: 'advancedDistinct',
      method: 'post',
      path: '/distinct/name',
      body: {},
      root: { ...entry, op: 'distinct', field: 'name' },
      status: 200,
    },
  ];
}
const populateCalls = ['list', 'read-id', 'read-filter', 'create', 'update', 'upsert-create', 'upsert-update'];
const sendModel = (f: Fixture, call: ModelCall, body = call.body) =>
  request(f.app)[call.method](`/oav05-sources${call.path}`).send(body);
const sendRoot = (f: Fixture, entry: Record<string, unknown>) => request(f.app).post('/oav05-root').send([entry]);
const readSource = { name: 'source-read' };
const legacy = (f: Fixture, op: 'list' | 'read' | 'count', extra = {}) => ({
  model: f.targetName,
  op,
  path: 'related',
  localField: 'key',
  foreignField: 'key',
  ...extra,
});
const subquery = (f: Fixture, op: 'list' | 'read', extra = {}) => ({
  target: {
    $in: {
      $$sq: {
        model: f.targetName,
        op,
        ...(op === 'read' ? { id: String(f.targetRead._id) } : { filter: {} }),
        sqOptions: { path: '_id', compact: true },
        ...extra,
      },
    },
  },
});
const policyAccesses = (observation: Record<string, Spy>) => [
  ...observation.filter.mock.calls.map((call) => call[1]),
  ...observation.select.mock.calls.map((call) => call[1]),
  ...['fields', 'decorate', 'decorateAll', 'validate', 'prepare'].flatMap((key) =>
    observation[key].mock.calls.map((call) => call[2]),
  ),
];
const expectBasePolicy = (f: Fixture) => {
  for (const observation of f.observations) {
    for (const access of policyAccesses(observation)) expect(variants).not.toContain(access);
    for (const [, access] of observation.allowed.mock.calls) expect(variants).not.toContain(access);
  }
};

describe('OAV-05 populate input boundaries', () => {
  it('reproduces the denied-base comparative probe without allowing an arbitrary stored advancedRead', async () => {
    const f = await fixture();
    f.targetRouter.operationAccess('read', false);
    f.targetRouter.operationAccess('advancedRead', true);
    const normal = await request(f.app)
      .post('/oav05-sources/internal/populate-plan')
      .send({ access: 'read', populate: [{ path: 'target', select: ['name'] }] })
      .expect(200);
    expect(normal.body).toEqual([]);
    const arbitrary = await request(f.app)
      .post('/oav05-sources/internal/populate-plan')
      .send({ access: 'advancedRead', populate: [{ path: 'target', select: ['name'] }] })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);
    expect(arbitrary.body).toMatchObject({ status: 400, title: 'Bad Request' });
    expectNoWork(f.sourceWork);
    expectNoWork(f.targetWork);
    expectBasePolicy(f);
  });

  it.each(variants)(
    'rejects reserved %s in both shared option and descriptor access before any target admission',
    async (access) => {
      const f = await fixture();
      f.targetRouter.operationAccess(access, true);
      for (const body of [
        { access, populate: [{ path: 'target', access: 'read' }] },
        { access: 'read', populate: ['target', { path: 'target', access }] },
      ]) {
        await request(f.app).post('/oav05-sources/internal/populate-plan').send(body).expect(400);
        const observation = f.observations.at(-1)!;
        expect(observation.allowed).not.toHaveBeenCalled();
        expect(observation.select).not.toHaveBeenCalled();
      }
      expectNoWork(f.targetWork);
      expectNoWork(f.sourceWork);
    },
  );

  for (const entry of ['direct', 'root'] as const) {
    it.each(populateCalls)(
      `${entry} %s rejects unsupported wire populateAccess before source/target persistence`,
      async (label) => {
        const f = await fixture();
        f.targetRouter.operationAccess('read', false);
        f.targetRouter.operationAccess('advancedRead', true);
        const call = modelCalls(f).find((candidate) => candidate.label === label)!;
        for (const access of ['basicRead', 'advancedRead', 'trustedCustom', null, { access: 'read' }]) {
          const options = { ...hiddenMetadata, populateAccess: access };
          const response =
            entry === 'direct'
              ? await sendModel(f, call, { ...call.body, populate: ['target'], options }).expect(400)
              : await sendRoot(f, { ...call.root, args: { populate: ['target'] }, options }).expect(400);
          expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
          expect(response.body).toMatchObject({ status: 400, title: 'Bad Request' });
        }
        expectNoWork(f.sourceWork);
        expectNoWork(f.targetWork);
        expectNoWork(f.leafWork);
      },
    );

    it(`${entry} retains descriptor list/read validation for object and array populate shapes`, async () => {
      const f = await fixture();
      for (const populate of [{ path: 'target', access: 'advancedRead' }, [{ path: 'target', access: 'basicRead' }]]) {
        const response =
          entry === 'direct'
            ? await request(f.app).post('/oav05-sources/__query').send({ populate }).expect(400)
            : await sendRoot(f, { target: 'model', name: f.sourceName, op: 'list', args: { populate } }).expect(400);
        expect(response.body.status).toBe(400);
      }
      expectNoWork(f.sourceWork);
      expectNoWork(f.targetWork);
    });
  }

  it.each(['read', 'list', 'omitted'] as const)(
    'keeps valid %s populate access and its existing default on direct/root requests',
    async (access) => {
      const f = await fixture();
      f.targetRouter.operationAccess('advancedRead', false);
      f.targetRouter.operationAccess('advancedList', false);
      const list = access === 'list';
      const filter = { name: list ? 'source-list' : 'source-read' };
      const options = access === 'omitted' ? undefined : { populateAccess: access };
      const args = { populate: [{ path: 'target', select: ['name', 'readOnly', 'listOnly', 'privateNote'] }] };
      const direct = await request(f.app)
        .post('/oav05-sources/__query')
        .send({ filter, ...args, options })
        .expect(200);
      const root = await sendRoot(f, { target: 'model', name: f.sourceName, op: 'list', filter, args, options }).expect(
        200,
      );
      for (const rows of [direct.body.data, root.body[0].result.data]) {
        expect(rows).toHaveLength(1);
        expect(rows[0].target).toMatchObject({ name: list ? 'target-list' : 'target-read' });
        expect(rows[0].target).toHaveProperty(list ? 'listOnly' : 'readOnly');
        expect(rows[0].target).not.toHaveProperty(list ? 'readOnly' : 'listOnly');
        expect(rows[0].target).not.toHaveProperty('privateNote');
      }
      expect(f.targetWork.find).toHaveBeenCalledTimes(2);
      expectBasePolicy(f);
    },
  );

  it('retains a supported descriptor override over option access', async () => {
    const f = await fixture();
    f.targetRouter.operationAccess('read', false);
    const response = await request(f.app)
      .post('/oav05-sources/__query')
      .send({
        filter: { name: 'source-list' },
        options: { populateAccess: 'read' },
        populate: [{ path: 'target', access: 'list', select: ['name', 'listOnly', 'readOnly'] }],
      })
      .expect(200);
    expect(response.body.data[0].target).toMatchObject({ name: 'target-list', listOnly: 'target-list-field' });
    expect(response.body.data[0].target).not.toHaveProperty('readOnly');
    expectBasePolicy(f);
  });

  it('keeps omitted direct/root wire access delegated to a configured base-list default', async () => {
    const f = await fixture();
    f.sourceRouter.setOptions({ defaults: { publicListOptions: { populateAccess: 'list' } } });
    const filter = { name: 'source-list' };
    const args = { populate: ['target'] };
    const direct = await request(f.app)
      .post('/oav05-sources/__query')
      .send({ filter, ...args })
      .expect(200);
    const root = await sendRoot(f, { target: 'model', name: f.sourceName, op: 'list', filter, args }).expect(200);
    for (const rows of [direct.body.data, root.body[0].result.data]) {
      expect(rows).toHaveLength(1);
      expect(rows[0].target).toMatchObject({ name: 'target-list', listOnly: 'target-list-field' });
      expect(rows[0].target).not.toHaveProperty('readOnly');
    }
    expectBasePolicy(f);
  });

  it.each(populateCalls)(
    'rejects a trusted %s reserved default after omitted wire options, with root per-entry mapping',
    async (label) => {
      const f = await fixture();
      const call = modelCalls(f).find((candidate) => candidate.label === label)!;
      const defaultKey =
        call.access === 'list'
          ? 'publicListOptions'
          : call.access === 'read'
            ? 'publicReadOptions'
            : label === 'create' || label === 'upsert-create'
              ? 'publicCreateOptions'
              : 'publicUpdateOptions';
      // Trusted JavaScript configuration can bypass the public PopulateAccess type.
      f.sourceRouter.setOptions({ defaults: { [defaultKey]: { populateAccess: 'advancedRead' as never } } });
      await sendModel(f, call, { ...call.body, populate: ['target'], options: hiddenMetadata }).expect(400);
      const root = await sendRoot(f, { ...call.root, args: { populate: ['target'] }, options: hiddenMetadata }).expect(
        200,
      );
      expect(root.body[0]).toMatchObject({ statusCode: 400, result: { success: false, code: 'bad_request' } });
      expect(root.body[0].result).not.toHaveProperty('query');
      expectNoWork(f.targetWork);
      expect(f.sourceWork.create).not.toHaveBeenCalled();
      expect(f.sourceWork.save).not.toHaveBeenCalled();
      expectBasePolicy(f);
    },
  );

  it.each(['find', 'find-one', 'create-raw', 'update-raw', 'read', 'read-filter', 'upsert'] as const)(
    'trusted %s returns a BadRequest ErrorResult for final reserved access, with no target query or write',
    async (operation) => {
      const f = await fixture();
      const result = await request(f.app)
        .post(`/oav05-sources/internal/service/${operation}`)
        .send({
          filter: readSource,
          data: { name: 'invalid-write', tenant: 'allowed' },
          args: { populate: [{ path: 'target', access: 'advancedRead' }] },
          options: { ...hiddenMetadata, populateAccess: 'read', tryList: true },
        })
        .expect(200);
      expect(result.body).toMatchObject({ success: false, kind: 'error', code: 'bad_request' });
      expect(result.body.errors).toEqual([
        expect.objectContaining({ detail: expect.stringContaining('advancedRead') }),
      ]);
      expectNoWork(f.targetWork);
      expect(f.sourceWork.create).not.toHaveBeenCalled();
      expect(f.sourceWork.save).not.toHaveBeenCalled();
      expect(f.observations.at(-1)!.allowed.mock.calls).not.toContainEqual([f.sourceName, 'list']);
    },
  );

  it.each(populateCalls)('catches %s request-schema transformations at the final shared boundary', async (label) => {
    const f = await fixture();
    const call = modelCalls(f).find((candidate) => candidate.label === label)!;
    const transform = vi.fn((value: unknown) => ({
      success: true as const,
      data: { ...(value as object), options: { ...hiddenMetadata, populateAccess: 'advancedRead' } },
    }));
    const [schemaKey, nestedKey] = call.schema!.split('.');
    f.sourceRouter.setOptions({
      requestSchemas: {
        [schemaKey]: nestedKey ? { [nestedKey]: defineRequestSchema(transform) } : defineRequestSchema(transform),
      },
    });
    const response = await sendModel(f, call, {
      ...call.body,
      populate: ['target'],
      options: { populateAccess: 'read' },
    })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);
    expect(response.body).toMatchObject({ status: 400, title: 'Bad Request' });
    expect(transform).toHaveBeenCalledTimes(1);
    expectNoWork(f.targetWork);
    expect(f.sourceWork.create).not.toHaveBeenCalled();
    expect(f.sourceWork.save).not.toHaveBeenCalled();
    expectBasePolicy(f);
  });

  it.each(['read-id', 'read-filter'] as const)(
    'catches %s transformed descriptor access without attempting list fallback',
    async (label) => {
      const f = await fixture();
      const call = modelCalls(f).find((candidate) => candidate.label === label)!;
      f.sourceRouter.setOptions({
        requestSchemas: {
          [call.schema!]: defineRequestSchema((value) => ({
            success: true,
            data: { ...(value as object), populate: [{ path: 'target', access: 'advancedRead' }] },
          })),
        },
      });
      await sendModel(f, call, { ...call.body, populate: [{ path: 'target', access: 'read' }] }).expect(400);
      expectNoWork(f.sourceWork);
      expectNoWork(f.targetWork);
      expect(f.observations.at(-1)!.allowed.mock.calls).toEqual([[f.sourceName, 'read']]);
      expectBasePolicy(f);
    },
  );

  it('does not convert an operational target-guard error into a selector BadRequest or list retry', async () => {
    const f = await fixture();
    const targetGuard = vi.fn(() => {
      throw new Error('target-guard-sentinel');
    });
    const listGuard = vi.fn(() => true);
    f.targetRouter.operationAccess('read', targetGuard);
    f.sourceRouter.operationAccess('list', listGuard);
    await request(f.app)
      .post('/oav05-sources/internal/service/read')
      .send({
        args: { populate: ['target'] },
        options: { ...hiddenMetadata, tryList: true },
      })
      .expect(500);
    expect(targetGuard).toHaveBeenCalledTimes(1);
    expect(listGuard).not.toHaveBeenCalled();
    expectNoWork(f.sourceWork);
    expectNoWork(f.targetWork);
  });

  for (const path of ['include-list', 'include-read', 'subquery-list', 'subquery-read'] as const) {
    it.each(['options', 'descriptor'] as const)(
      `${path} rejects reserved nested %s access before the queried target dispatch`,
      async (location) => {
        const f = await fixture();
        // Root's array/entry wrapper adds depth; reach shared populate validation
        // rather than the independent request-complexity guard in these probes.
        f.api.setGlobalOption('requestComplexity', { maxDepth: 16 });
        f.leafRouter.operationAccess('read', false);
        f.leafRouter.operationAccess('advancedRead', true);
        const args = { populate: [{ path: 'leaf', ...(location === 'descriptor' ? { access: 'advancedRead' } : {}) }] };
        const options = { populateAccess: location === 'options' ? 'advancedRead' : 'read' };
        const op = path.endsWith('list') ? 'list' : 'read';
        const body = path.startsWith('include')
          ? { filter: readSource, include: legacy(f, op, { args, options }) }
          : { filter: subquery(f, op, { args, options }) };
        const direct = await request(f.app).post('/oav05-sources/__query').send(body).expect(400);
        const root = await sendRoot(f, {
          target: 'model',
          name: f.sourceName,
          op: 'list',
          filter: body.filter,
          args: 'include' in body ? { include: body.include } : {},
        }).expect(200);
        expect(direct.body).toMatchObject({ status: 400, title: 'Bad Request' });
        expect(root.body[0]).toMatchObject({ statusCode: 400, result: { success: false, code: 'bad_request' } });
        expect(root.body[0].result).not.toHaveProperty('query');
        expect(root.body[0].result).not.toHaveProperty('context');
        expectNoWork(f.targetWork);
        expectNoWork(f.leafWork);
        expect(f.sourceWork.find).toHaveBeenCalledTimes(path.startsWith('include') ? 2 : 0);
        expectBasePolicy(f);
      },
    );
  }

  it.each(['list', 'read'] as const)(
    'propagates a deeper legacy %s target BadRequest through both include result seams',
    async (op) => {
      const f = await fixture();
      const nested = legacy(f, op, {
        args: { populate: [{ path: 'leaf', access: 'advancedRead' }] },
      });
      for (const outerOp of ['list', 'read'] as const) {
        const before = f.targetWork.find.mock.calls.length + f.targetWork.findOne.mock.calls.length;
        await request(f.app)
          .post('/oav05-sources/__query')
          .send({
            filter: readSource,
            include: legacy(f, outerOp, { args: { include: nested } }),
          })
          .expect(400);
        expect(f.targetWork.find.mock.calls.length + f.targetWork.findOne.mock.calls.length).toBe(before + 1);
      }
      expectNoWork(f.leafWork);
    },
  );

  it.each(['plan', 'include', 'subquery'] as const)(
    'preserves trusted non-reserved custom populate access through %s',
    async (path) => {
      const f = await fixture();
      const router = path === 'plan' ? f.targetRouter : f.leafRouter;
      router.operationAccess('read', false);
      router.operationAccess('inspection', true);
      router.baseFilter('inspection', () => ({ tenant: 'read' }));
      if (path === 'plan') {
        const response = await request(f.app)
          .post('/oav05-sources/internal/populate-plan')
          .send({ access: 'inspection', populate: [{ path: 'target', select: ['name'] }] })
          .expect(200);
        expect(response.body).toEqual([expect.objectContaining({ path: 'target', match: { tenant: 'read' } })]);
        expectNoWork(f.targetWork);
      } else {
        const extra = { args: { populate: ['leaf'] }, options: { populateAccess: 'inspection' } };
        const body =
          path === 'include'
            ? { filter: readSource, include: legacy(f, 'read', extra) }
            : { filter: subquery(f, 'read', extra) };
        const response = await request(f.app).post('/oav05-sources/__query').send(body).expect(200);
        expect(response.body.data).toHaveLength(1);
        if (path === 'include') expect(response.body.data[0].related.leaf).toMatchObject({ name: 'leaf-read' });
        expect(f.leafWork.find).toHaveBeenCalledTimes(1);
      }
    },
  );

  it.each(['list', 'read', 'descriptor', 'include', 'subquery'] as const)(
    'retains custom-only target fields and document grants through %s populate finalization',
    async (path) => {
      const f = await fixture();
      const nested = path === 'include' || path === 'subquery';
      if (path === 'subquery') f.api.setGlobalOption('requestComplexity', { maxDepth: 16 });
      const router = nested ? f.leafRouter : f.targetRouter;
      const receiverName = nested ? f.leafName : f.targetName;
      const grantedField = nested ? 'tenant' : 'readOnly';
      const customGrants = vi.fn((_doc, _permissions, context) => {
        expect(context.modelName).toBe(receiverName);
        return { canInspectTarget: true };
      });
      const readGrants = vi.fn(() => ({}));
      router.operationAccess('read', false);
      router.operationAccess('advancedRead', true);
      router.operationAccess('inspection', true);
      router.baseFilter('inspection', () => ({ tenant: 'read' }));
      // Trusted custom data-policy keys are intentionally outside the typed base
      // field-rule shape; JavaScript configurations retain their existing behavior.
      router.permissionSchema({
        name: { inspection: true, read: false, list: true },
        [grantedField]: { inspection: 'canInspectTarget', read: false, list: false },
      } as never);
      router.alwaysSelectFields('inspection', [grantedField]);
      router.docPermissions('inspection', customGrants);
      router.docPermissions('read', readGrants);
      const populate = [
        {
          path: nested ? 'leaf' : 'target',
          select: ['name', grantedField],
          ...(path === 'descriptor' ? { access: 'inspection' } : {}),
        },
      ];
      let target: Record<string, unknown> | undefined;
      if (nested) {
        const extra = { args: { populate }, options: { populateAccess: 'inspection' } };
        if (path === 'include') {
          const response = await request(f.app)
            .post('/oav05-sources/__query')
            .send({
              filter: readSource,
              include: legacy(f, 'read', extra),
            })
            .expect(200);
          target = response.body.data[0].related.leaf;
        } else {
          await f.Source.collection.updateOne({ _id: f.sourceRead._id }, { $set: { key: 'leaf-read' } });
          const response = await request(f.app)
            .post('/oav05-sources/__query')
            .send({
              filter: {
                key: {
                  $in: {
                    $$sq: {
                      model: f.targetName,
                      op: 'read',
                      id: String(f.targetRead._id),
                      ...extra,
                      sqOptions: { path: 'leaf.name', compact: true },
                    },
                  },
                },
              },
            })
            .expect(200);
          expect(response.body.data).toEqual([expect.objectContaining({ name: 'source-read', key: 'leaf-read' })]);
        }
      } else {
        const operation = path === 'list' ? 'list' : 'read';
        const response = await request(f.app)
          .post(`/oav05-sources/internal/service/${operation}`)
          .send({
            id: String(f.sourceRead._id),
            filter: readSource,
            args: { populate },
            options: {
              ...hiddenMetadata,
              lean: path === 'list',
              tryList: false,
              populateAccess: path === 'descriptor' ? 'read' : 'inspection',
            },
          })
          .expect(200);
        expect(response.body.success).toBe(true);
        target = (operation === 'list' ? response.body.data[0] : response.body.data).target;
      }
      if (path !== 'subquery') {
        expect(target).toMatchObject({
          name: nested ? 'leaf-read' : 'target-read',
          [grantedField]: nested ? 'read' : 'target-read-field',
        });
        expect(target).not.toHaveProperty('privateNote');
      }
      expect(customGrants).toHaveBeenCalledTimes(1);
      expect(readGrants).not.toHaveBeenCalled();
      const observation = f.observations.at(-1)!;
      expect(observation.allowed.mock.calls).toContainEqual([receiverName, 'inspection']);
      expectBasePolicy(f);
    },
  );
});

describe('OAV-05 root entry and trusted service boundaries', () => {
  it.each([...populateCalls, 'count', 'distinct'])(
    'root model %s uses its base guard despite the opposite initiating variant',
    async (label) => {
      const f = await fixture();
      const call = modelCalls(f).find((candidate) => candidate.label === label)!;
      f.sourceRouter.operationAccess(call.variant, false);
      if (call.access === 'read') f.sourceRouter.operationAccess('basicRead', false);
      await sendModel(f, call).expect(401);
      const rootAllowed = await sendRoot(f, {
        ...call.root,
        ...(call.access === 'count' ? {} : { options: hiddenMetadata }),
      }).expect(200);
      expect(rootAllowed.body[0]).toMatchObject({ statusCode: call.status, result: { success: true } });
      expect(rootAllowed.body[0].result).not.toHaveProperty('query');
      expect(rootAllowed.body[0].result).not.toHaveProperty('context');
      if (call.access === 'list')
        expect(rootAllowed.body[0].result.data.map((row: SourceRow) => row.name)).toEqual(['source-read']);
      if (call.access === 'read')
        expect(rootAllowed.body[0].result.data).toMatchObject({ name: 'source-read', readOnly: 'source-read-field' });
      if (call.access === 'count') expect(rootAllowed.body[0].result.data).toBe(2);
      if (call.access === 'distinct') expect(rootAllowed.body[0].result.data).toContain('source-read');
      if (call.access === 'create' || call.access === 'update' || call.access === 'upsert') {
        const data = call.root.data as { name: string };
        expect(await f.Source.collection.findOne({ name: data.name })).toMatchObject({ name: data.name });
      }

      f.sourceRouter.operationAccess(call.access, false);
      f.sourceRouter.operationAccess(call.variant, true);
      const allowedCall = modelCalls(f).find((candidate) => candidate.label === label)!;
      await sendModel(f, allowedCall, {
        ...allowedCall.body,
        ...(call.access === 'count' ? {} : { options: { ...hiddenMetadata, tryList: false } }),
      }).expect(call.status);
      const before = workCounts(f.sourceWork);
      const rootDenied = await sendRoot(f, allowedCall.root).expect(200);
      expect(rootDenied.body[0]).toMatchObject({ statusCode: 401, result: { success: false, code: 'unauthorized' } });
      expect(workCounts(f.sourceWork)).toEqual(before);
      expect(f.observations.at(-1)!.dispatch).not.toHaveBeenCalled();
      expect(f.observations.at(-1)!.routeAllowed).not.toHaveBeenCalled();
      expectBasePolicy(f);
    },
  );

  it.each(['list', 'read-id', 'read-filter', 'subList', 'subRead'] as const)(
    'root %s data/sub entry retains base guard and base row/field policy',
    async (label) => {
      const f = await fixture();
      const sub = label.startsWith('sub');
      const read = label !== 'list' && label !== 'subList';
      const base = read ? 'read' : 'list';
      const variant = read ? 'advancedRead' : 'advancedList';
      const sourceId = String(f.sourceRead._id);
      const subId = String(f.sourceRead.items[0]._id);
      const entry = sub
        ? { target: 'model', name: f.sourceName, op: label, id: sourceId, sub: 'items', ...(read ? { subId } : {}) }
        : {
            target: 'data',
            name: f.dataName,
            op: base,
            ...(read ? (label === 'read-id' ? { id: 'visible' } : { filter: { id: 'visible' } }) : {}),
          };
      const path = sub
        ? `/oav05-sources/${sourceId}/items${read ? `/${subId}` : ''}/__query`
        : `/oav05-data/__query${read ? (label === 'read-id' ? '/visible' : '/__filter') : ''}`;
      const body = label === 'read-filter' ? { filter: { id: 'visible' } } : {};
      if (read) {
        if (sub) f.sourceRouter.operationAccess('subs.items.basicRead', false);
        else f.dataRouter.operationAccess('basicRead', false);
      }
      if (sub) f.sourceRouter.operationAccess(`subs.items.${variant}`, false);
      else f.dataRouter.operationAccess(variant, false);
      await request(f.app).post(path).send(body).expect(401);
      const allowed = await sendRoot(f, entry).expect(200);
      expect(allowed.body[0]).toMatchObject({ statusCode: 200, result: { success: true } });
      const data = allowed.body[0].result.data;
      if (sub) {
        if (read) expect(data).toEqual(expect.objectContaining({ label: 'visible', value: 1 }));
        else expect(data.map((row: Item) => row.label)).toEqual(['visible', 'read-hidden']);
        for (const row of read ? [data] : data) expect(row).not.toHaveProperty('privateNote');
      } else {
        expect(read ? data : data[0]).toEqual({ id: 'visible', name: 'data-visible' });
        if (!read) expect(data).toHaveLength(1);
      }

      if (sub) {
        f.sourceRouter.operationAccess(`subs.items.${base}`, false);
        f.sourceRouter.operationAccess(`subs.items.${variant}`, true);
      } else {
        f.dataRouter.operationAccess(base, false);
        f.dataRouter.operationAccess(variant, true);
      }
      await request(f.app).post(path).send(body).expect(200);
      const before = workCounts(f.sourceWork);
      const denied = await sendRoot(f, entry).expect(200);
      expect(denied.body[0]).toMatchObject({ statusCode: 401, result: { success: false, code: 'unauthorized' } });
      expect(workCounts(f.sourceWork)).toEqual(before);
      expect(f.observations.at(-1)!.dispatch).not.toHaveBeenCalled();
      expect(f.observations.at(-1)!.dataDispatch).not.toHaveBeenCalled();
      expectBasePolicy(f);
    },
  );

  it.each(['model', 'data'] as const)(
    'root %s rejects route-only names as operations before batch dispatch',
    async (target) => {
      const f = await fixture();
      for (const op of variants) {
        await sendRoot(f, {
          target,
          name: target === 'model' ? f.sourceName : f.dataName,
          op,
          id: String(f.sourceRead._id),
          data: {},
          field: 'name',
          sub: 'items',
        })
          .expect(400)
          .expect('Content-Type', /application\/problem\+json/);
      }
      expectNoWork(f.sourceWork);
      for (const observation of f.observations) {
        expect(observation.dispatch).not.toHaveBeenCalled();
        expect(observation.dataDispatch).not.toHaveBeenCalled();
      }
    },
  );

  it.each(['list', 'read', 'read-filter', 'create', 'update', 'upsert', 'count', 'distinct'] as const)(
    'trusted %s keeps its current behavior with the same GET/POST/PATCH/PUT request methods and denied route rules',
    async (operation) => {
      const f = await fixture({
        operationAccess: {
          ...baseOperations,
          list: false,
          read: false,
          create: false,
          update: false,
          upsert: false,
          count: false,
          distinct: false,
        },
      });
      for (const variant of variants) f.sourceRouter.operationAccess(variant, false);
      const baseDecorate = vi.fn((doc: object) => ({ ...doc, baseDecorated: operation }));
      const decorateKey = operation === 'read-filter' ? 'read' : operation === 'upsert' ? 'create' : operation;
      if (['list', 'read', 'create', 'update'].includes(decorateKey))
        f.sourceRouter.decorate(decorateKey, baseDecorate);
      for (const method of ['get', 'post', 'patch', 'put'] as const) {
        const data = {
          name: `trusted-${operation}-${method}-${++writeCounter}`,
          tenant: 'allowed',
          privateNote: 'client-note',
        };
        const result = await request(f.app)
          [method](`/oav05-sources/internal/service/${operation}`)
          .send({
            id: String(f.sourceRead._id),
            filter: { _id: String(f.sourceRead._id) },
            data,
            options: { ...hiddenMetadata, tryList: false },
          })
          .expect(200);
        expect(result.body.success).toBe(true);
        expect(f.observations.at(-1)!.routeAllowed).not.toHaveBeenCalled();
        expect(f.observations.at(-1)!.allowed).not.toHaveBeenCalled();
        const rows = Array.isArray(result.body.data) ? result.body.data : [result.body.data];
        if (!['count', 'distinct'].includes(operation)) {
          for (const row of rows) expect(row).not.toHaveProperty('privateNote');
          if (operation === 'list') {
            expect(rows).toHaveLength(1);
            expect(rows[0]).not.toHaveProperty('readOnly');
            expect(rows[0]).toHaveProperty('listOnly', 'source-list-field');
          }
          if (operation === 'read' || operation === 'read-filter') {
            expect(rows[0]).toHaveProperty('readOnly', 'source-read-field');
            expect(rows[0]).not.toHaveProperty('listOnly');
          }
          if (['create', 'upsert', 'update'].includes(operation)) {
            expect(await f.Source.collection.findOne({ name: data.name })).toMatchObject({ name: data.name });
            expect(await f.Source.collection.findOne({ name: data.name })).not.toHaveProperty(
              'privateNote',
              'client-note',
            );
          }
        } else if (operation === 'count') expect(result.body.data).toBe(1);
        else expect(result.body.data).toHaveLength(1);
      }
      if (['list', 'read', 'read-filter', 'create', 'update', 'upsert'].includes(operation))
        expect(baseDecorate).toHaveBeenCalledTimes(4);
      expectBasePolicy(f);
    },
  );
});

describe('OAV-05 secondary target authorization', () => {
  for (const kind of ['legacy', 'correlated', 'subquery', 'populate', 'sub-populate'] as const) {
    const accesses =
      kind === 'legacy' || kind === 'correlated'
        ? (['list', 'read', 'count'] as const)
        : kind === 'sub-populate'
          ? (['read'] as const)
          : (['list', 'read'] as const);
    it.each(accesses)(
      `${kind} uses target base %s for denial and never dispatches the denied model`,
      async (access) => {
        const f = await fixture();
        f.sourceRouter.operationAccess('advancedList', true);
        f.targetRouter.operationAccess(access, false);
        f.targetRouter.operationAccess(`advanced${access[0].toUpperCase()}${access.slice(1)}`, true);
        let body: Record<string, unknown>;
        let entry: Record<string, unknown>;
        let path = '/oav05-sources/__query';
        if (kind === 'legacy' || kind === 'correlated') {
          const include =
            kind === 'legacy'
              ? legacy(f, access)
              : {
                  mode: 'correlated',
                  model: f.targetName,
                  op: access,
                  path: 'related',
                  filter: { key: { $parent: 'key' } },
                };
          body = { filter: readSource, include };
          entry = { target: 'model', name: f.sourceName, op: 'list', filter: readSource, args: { include } };
        } else if (kind === 'subquery') {
          body = { filter: subquery(f, access as 'list' | 'read') };
          entry = { target: 'model', name: f.sourceName, op: 'list', filter: body.filter };
        } else if (kind === 'sub-populate') {
          const id = String(f.sourceRead._id);
          const subId = String(f.sourceRead.items[0]._id);
          f.sourceRouter.operationAccess('subs.items.advancedRead', true);
          path = `/oav05-sources/${id}/items/${subId}/__query`;
          body = { populate: ['target'] };
          entry = { target: 'model', name: f.sourceName, op: 'subRead', id, sub: 'items', subId, args: body };
        } else {
          body = { filter: readSource, populate: [{ path: 'target', access }], options: { populateAccess: access } };
          entry = {
            target: 'model',
            name: f.sourceName,
            op: 'list',
            filter: readSource,
            args: { populate: body.populate },
            options: body.options,
          };
        }
        const dropPopulate = kind === 'populate' || kind === 'sub-populate';
        const direct = await request(f.app)
          .post(path)
          .send(body)
          .expect(dropPopulate ? 200 : 401);
        const root = await sendRoot(f, entry).expect(200);
        if (dropPopulate) {
          const data = kind === 'populate' ? direct.body.data[0] : direct.body;
          const rootData = kind === 'populate' ? root.body[0].result.data[0] : root.body[0].result.data;
          expect(data.target).toBe(String(f.targetRead._id));
          expect(rootData.target).toBe(String(f.targetRead._id));
        } else {
          expect(direct.body.status).toBe(401);
          expect(root.body[0]).toMatchObject({ statusCode: 401, result: { success: false, code: 'unauthorized' } });
        }
        expectNoWork(f.targetWork);
        expectNoWork(f.leafWork);
        const sourceReads = f.sourceWork.find.mock.calls.length + f.sourceWork.findOne.mock.calls.length;
        expect(sourceReads).toBe(kind === 'subquery' ? 0 : 2);
        for (const observation of f.observations) {
          expect(observation.allowed.mock.calls).toContainEqual([f.targetName, access]);
        }
        expectBasePolicy(f);
      },
    );
  }

  it.each(['legacy', 'correlated'] as const)(
    '%s list/read/count preserve target base filters, projections, count semantics with route variants denied',
    async (kind) => {
      const f = await fixture();
      for (const access of ['List', 'Read', 'Count']) f.targetRouter.operationAccess(`advanced${access}`, false);
      const includes = (['list', 'read', 'count'] as const).map((op) =>
        kind === 'legacy'
          ? legacy(f, op, {
              path: op,
              args: { select: ['name', 'readOnly', 'listOnly', 'privateNote'], limit: 1 },
              options: { limit: 1 },
            })
          : {
              mode: 'correlated',
              model: f.targetName,
              op,
              path: op,
              filter: { key: { $parent: 'key' } },
              ...(op === 'count'
                ? {}
                : {
                    args: {
                      select: ['name', 'readOnly', 'listOnly', 'privateNote'],
                      ...(op === 'list' ? { limit: 1 } : {}),
                    },
                  }),
            },
      );
      const direct = await request(f.app)
        .post('/oav05-sources/__query')
        .send({ filter: readSource, include: includes })
        .expect(200);
      const root = await sendRoot(f, {
        target: 'model',
        name: f.sourceName,
        op: 'list',
        filter: readSource,
        args: { include: includes },
      }).expect(200);
      for (const rows of [direct.body.data, root.body[0].result.data]) {
        expect(rows).toHaveLength(1);
        expect(rows[0].list).toEqual([expect.objectContaining({ name: 'target-list', listOnly: 'target-list-field' })]);
        expect(rows[0].list[0]).not.toHaveProperty('readOnly');
        expect(rows[0].read).toMatchObject({ name: 'target-read', readOnly: 'target-read-field' });
        expect(rows[0].read).not.toHaveProperty('listOnly');
        expect(rows[0].count).toBe(2);
        expect(rows[0].read).not.toHaveProperty('privateNote');
        expect(rows[0].list[0]).not.toHaveProperty('privateNote');
      }
      expect(f.targetWork.find).toHaveBeenCalledTimes(2);
      expect(f.targetWork.findOne).toHaveBeenCalledTimes(2);
      expect(kind === 'legacy' ? f.targetWork.aggregate : f.targetWork.count).toHaveBeenCalledTimes(2);
      expectBasePolicy(f);
    },
  );

  it.each(['list', 'read'] as const)(
    'subquery %s succeeds with base grants when target route variants deny',
    async (op) => {
      const f = await fixture();
      f.targetRouter.operationAccess(`advanced${op === 'list' ? 'List' : 'Read'}`, false);
      const body = { filter: subquery(f, op) };
      const direct = await request(f.app).post('/oav05-sources/__query').send(body).expect(200);
      const root = await sendRoot(f, { target: 'model', name: f.sourceName, op: 'list', filter: body.filter }).expect(
        200,
      );
      for (const rows of [direct.body.data, root.body[0].result.data]) {
        expect(rows.map((row: SourceRow) => row.name)).toEqual([op === 'list' ? 'source-list' : 'source-read']);
      }
      expect(op === 'list' ? f.targetWork.find : f.targetWork.findOne).toHaveBeenCalledTimes(2);
      expectBasePolicy(f);
    },
  );

  it.each(['list', 'read'] as const)(
    'preserves finalized legacy include output on hydrated trusted %s calls',
    async (op) => {
      const f = await fixture();
      const result = await request(f.app)
        .post(`/oav05-sources/internal/service/${op}`)
        .send({
          id: String(f.sourceRead._id),
          filter: readSource,
          args: { include: legacy(f, 'read', { args: { select: ['name', 'readOnly', 'privateNote'] } }) },
          options: { ...hiddenMetadata, lean: false, tryList: false },
        })
        .expect(200);
      expect(result.body.success).toBe(true);
      const data = op === 'list' ? result.body.data[0] : result.body.data;
      expect(data.related).toMatchObject({ name: 'target-read', readOnly: 'target-read-field' });
      expect(data.related).not.toHaveProperty('privateNote');
      expect(f.targetWork.findOne).toHaveBeenCalledTimes(1);
      expectBasePolicy(f);
    },
  );

  it.each(['list', 'read'] as const)(
    'subquery %s and populate retain terminal target row-policy denial with no target query',
    async (op) => {
      const f = await fixture();
      f.targetRouter.baseFilter(op, () => false);
      f.targetRouter.operationAccess(`advanced${op === 'list' ? 'List' : 'Read'}`, true);
      const denied = await request(f.app)
        .post('/oav05-sources/__query')
        .send({ filter: subquery(f, op) })
        .expect(403);
      expect(denied.body.status).toBe(403);
      const populated = await request(f.app)
        .post('/oav05-sources/__query')
        .send({
          filter: readSource,
          populate: [{ path: 'target', access: op }],
        })
        .expect(200);
      expect(populated.body.data[0].target).toBe(String(f.targetRead._id));
      expectNoWork(f.targetWork);
      expectBasePolicy(f);
    },
  );

  it.each(['list', 'read', 'count'] as const)(
    'correlated %s retains terminal target base-filter denial despite a permitted variant',
    async (op) => {
      const f = await fixture();
      f.targetRouter.operationAccess(`advanced${op[0].toUpperCase()}${op.slice(1)}`, true);
      f.targetRouter.baseFilter(op, () => false);
      const include = {
        mode: 'correlated',
        model: f.targetName,
        op,
        path: 'related',
        filter: { key: { $parent: 'key' } },
      };
      await request(f.app).post('/oav05-sources/__query').send({ filter: readSource, include }).expect(403);
      const root = await sendRoot(f, {
        target: 'model',
        name: f.sourceName,
        op: 'list',
        filter: readSource,
        args: { include },
      }).expect(200);
      expect(root.body[0]).toMatchObject({ statusCode: 403, result: { success: false, code: 'forbidden' } });
      expectNoWork(f.targetWork);
      expectBasePolicy(f);
    },
  );

  it.each(['list', 'read', 'count'] as const)(
    'legacy %s retains its hidden target-filter-denial shape with no target query',
    async (op) => {
      const f = await fixture();
      f.targetRouter.operationAccess(`advanced${op[0].toUpperCase()}${op.slice(1)}`, true);
      f.targetRouter.baseFilter(op, () => false);
      const include = legacy(f, op);
      const direct = await request(f.app)
        .post('/oav05-sources/__query')
        .send({ filter: readSource, include })
        .expect(200);
      const root = await sendRoot(f, {
        target: 'model',
        name: f.sourceName,
        op: 'list',
        filter: readSource,
        args: { include },
      }).expect(200);
      for (const rows of [direct.body.data, root.body[0].result.data]) {
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ name: 'source-read' });
        expect(rows[0]).not.toHaveProperty('related');
      }
      expectNoWork(f.targetWork);
      expectBasePolicy(f);
    },
  );
});

describe('OAV-05 read retries and mutation visibility', () => {
  it.each([false, true])(
    'both advanced reads retry only with base list=%s and use list row/field/hooks',
    async (listAllowed) => {
      const f = await fixture();
      f.sourceRouter.operationAccess('read', false);
      f.sourceRouter.operationAccess('advancedRead', true);
      const baseList = vi.fn(() => listAllowed);
      const basicList = vi.fn(() => !listAllowed);
      const advancedList = vi.fn(() => !listAllowed);
      f.sourceRouter.operationAccess('list', baseList);
      f.sourceRouter.operationAccess('basicList', basicList);
      f.sourceRouter.operationAccess('advancedList', advancedList);
      f.sourceRouter.baseFilter('read', () => ({ tenant: 'read-miss' }));
      f.sourceRouter.baseFilter('list', () => ({ tenant: 'allowed' }));
      const readDecorate = vi.fn((doc) => doc);
      const listDecorate = vi.fn((doc: object) => ({ ...doc, policy: 'list' }));
      f.sourceRouter.decorate('read', readDecorate);
      f.sourceRouter.decorate('list', listDecorate);
      for (const call of modelCalls(f).filter((candidate) => candidate.access === 'read')) {
        const before = f.sourceWork.findOne.mock.calls.length;
        const response = await sendModel(f, call, {
          ...call.body,
          select: ['name', 'readOnly', 'listOnly', 'privateNote'],
          options: { ...hiddenMetadata, tryList: true },
        }).expect(listAllowed ? 200 : 401);
        expect(f.sourceWork.findOne.mock.calls.length - before).toBe(listAllowed ? 2 : 1);
        if (listAllowed) {
          expect(response.body).toMatchObject({ name: 'source-read', listOnly: 'source-list-field', policy: 'list' });
          expect(response.body).not.toHaveProperty('readOnly');
          expect(response.body).not.toHaveProperty('privateNote');
        }
      }
      expect(baseList).toHaveBeenCalledTimes(2);
      expect(basicList).not.toHaveBeenCalled();
      expect(advancedList).not.toHaveBeenCalled();
      expect(readDecorate).not.toHaveBeenCalled();
      expect(listDecorate).toHaveBeenCalledTimes(listAllowed ? 2 : 0);
      expectBasePolicy(f);
    },
  );

  it.each(['miss', 'row-miss', 'forbidden', 'bad-request'] as const)(
    'ordinary read %s stays distinct from initiating authorization and never gains a variant retry',
    async (outcome) => {
      const f = await fixture();
      f.sourceRouter.operationAccess('basicRead', false);
      f.sourceRouter.operationAccess('advancedRead', true);
      const listGuard = vi.fn(() => true);
      f.sourceRouter.operationAccess('list', listGuard);
      if (outcome === 'forbidden') f.sourceRouter.baseFilter('read', () => false);
      if (outcome === 'row-miss') f.sourceRouter.baseFilter('read', () => ({ tenant: 'excluded' }));
      const miss = outcome === 'miss' || outcome === 'row-miss';
      const filter =
        outcome === 'miss' ? { name: 'absent' } : outcome === 'bad-request' ? { $where: 'return true' } : readSource;
      for (const path of ['id', 'filter'] as const) {
        const before = f.sourceWork.findOne.mock.calls.length;
        const id = outcome === 'miss' ? String(new mongoose.Types.ObjectId()) : String(f.sourceRead._id);
        const body =
          path === 'filter'
            ? { filter, options: { ...hiddenMetadata, tryList: !miss } }
            : {
                ...(outcome === 'bad-request' ? { populate: [{ path: 'target', access: 'advancedRead' }] } : {}),
                options: { ...hiddenMetadata, tryList: !miss },
              };
        const response = await request(f.app)
          .post(`/oav05-sources/__query/${path === 'id' ? id : '__filter'}`)
          .send(body)
          .expect(miss ? 404 : outcome === 'forbidden' ? 403 : 400);
        expect(response.body.status).toBe(miss ? 404 : outcome === 'forbidden' ? 403 : 400);
        expect(f.sourceWork.findOne.mock.calls.length - before).toBe(miss ? 1 : 0);
      }
      expect(listGuard).not.toHaveBeenCalled();
      expectBasePolicy(f);
    },
  );

  for (const entry of ['direct', 'root'] as const) {
    it.each(['visible', 'parent-read', 'sub-read', 'sub-list'] as const)(
      `${entry} subdocument writes keep base %s visibility after one successful save`,
      async (policy) => {
        const f = await fixture();
        f.sourceRouter.operationAccess('basicRead', false);
        f.sourceRouter.operationAccess('advancedRead', true);
        f.sourceRouter.operationAccess('subs.items.basicRead', false);
        f.sourceRouter.operationAccess('subs.items.advancedRead', true);
        f.sourceRouter.operationAccess('subs.items.basicList', false);
        f.sourceRouter.operationAccess('subs.items.advancedList', true);
        if (policy === 'parent-read') f.sourceRouter.operationAccess('read', false);
        if (policy === 'sub-read') f.sourceRouter.operationAccess('subs.items.read', false);
        if (policy === 'sub-list') f.sourceRouter.operationAccess('subs.items.list', false);
        const id = String(f.sourceRead._id);
        const subId = String(f.sourceRead.items[0]._id);
        for (const op of ['create', 'single', 'bulk'] as const) {
          const data =
            op === 'create'
              ? { label: 'new', value: 7, readable: true, listed: true, privateNote: 'client-note' }
              : op === 'single'
                ? { value: 8, privateNote: 'client-note' }
                : [{ _id: subId, value: 9, privateNote: 'client-note' }];
          const beforeSave = f.sourceWork.save.mock.calls.length;
          const beforeFind = f.sourceWork.findOne.mock.calls.length;
          const response =
            entry === 'root'
              ? await sendRoot(f, {
                  target: 'model',
                  name: f.sourceName,
                  op: { create: 'subCreate', single: 'subUpdate', bulk: 'subBulkUpdate' }[op],
                  id,
                  sub: 'items',
                  ...(op === 'single' ? { subId } : {}),
                  data,
                }).expect(200)
              : await request(f.app)
                  [op === 'create' ? 'post' : 'patch'](
                    `/oav05-sources/${id}/items${op === 'single' ? `/${subId}` : ''}`,
                  )
                  .send(data)
                  .expect(op === 'create' ? 201 : 200);
          const result = entry === 'root' ? response.body[0].result : { data: response.body };
          if (entry === 'root') {
            expect(response.body[0].statusCode).toBe(op === 'create' ? 201 : 200);
            expect(result.success).toBe(true);
          }
          expect(f.sourceWork.save.mock.calls.length - beforeSave).toBe(1);
          const visible = policy === 'visible' || (policy === 'sub-list' && op !== 'create');
          expect(f.sourceWork.findOne.mock.calls.length - beforeFind).toBe(visible ? 2 : 1);
          const stored = (await f.Source.collection.findOne({ _id: f.sourceRead._id }))!;
          expect(stored.items).toHaveLength(4);
          expect(stored.items[0].privateNote).toBe('stored-note');
          expect(stored.items[3]).toMatchObject({ label: 'new', value: 7 });
          expect(stored.items[3]).not.toHaveProperty('privateNote');
          if (op !== 'create') expect(stored.items[0].value).toBe(op === 'single' ? 8 : 9);
          if (!visible) {
            expect(result.data).toEqual(op === 'single' ? null : []);
            if (entry === 'root' && op !== 'single') expect(result.count).toBe(0);
          } else {
            const rows = op === 'single' ? [result.data] : result.data;
            expect(rows.map((row: Item) => row.label)).toEqual(op === 'create' ? ['visible', 'new'] : ['visible']);
            for (const row of rows) {
              expect(row).toHaveProperty('value');
              expect(row).not.toHaveProperty('privateNote');
            }
          }
        }
        expectBasePolicy(f);
      },
    );
  }

  it('advanced upsert persists both branches using base mutation hooks without advancedCreate/Update entry requirements', async () => {
    const f = await fixture();
    f.sourceRouter.operationAccess('upsert', false);
    f.sourceRouter.operationAccess('advancedUpsert', true);
    for (const access of ['create', 'update', 'basicCreate', 'advancedCreate', 'basicUpdate', 'advancedUpdate']) {
      f.sourceRouter.operationAccess(access, false);
    }
    const create = vi.fn((data: object) => ({ ...data, key: 'created-by-base' }));
    const update = vi.fn((data: object) => ({ ...data, key: 'updated-by-base' }));
    f.sourceRouter.prepare('create', create);
    f.sourceRouter.prepare('update', update);
    for (const label of ['upsert-create', 'upsert-update']) {
      const call = modelCalls(f).find((candidate) => candidate.label === label)!;
      const response = await sendModel(f, call, { ...call.body, options: hiddenMetadata }).expect(call.status);
      expect(response.body.key).toBe(label.endsWith('create') ? 'created-by-base' : 'updated-by-base');
      expect(await f.Source.collection.findOne({ name: (call.body.data as { name: string }).name })).toMatchObject({
        key: label.endsWith('create') ? 'created-by-base' : 'updated-by-base',
      });
    }
    expect(create).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expectBasePolicy(f);
  });
});
