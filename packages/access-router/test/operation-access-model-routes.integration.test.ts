import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createAccessRuntime,
  permissionsPlugin,
  type AccessRouterRequest,
  type GuardHook,
  type ModelHook,
  type ModelRouterOptions,
  type ModelValidateHook,
  type OperationAccess,
  type PairedRouteAccess,
  type RouteVariant,
  type RouteVariantAccess,
} from '../dist/index.mjs';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

interface Row {
  name: string;
  role: string;
  public: boolean;
  status: string;
  privateNote?: string;
}

const pairs = [
  { access: 'list', basic: 'basicList', advanced: 'advancedList' },
  { access: 'read', basic: 'basicRead', advanced: 'advancedRead' },
  { access: 'create', basic: 'basicCreate', advanced: 'advancedCreate' },
  { access: 'update', basic: 'basicUpdate', advanced: 'advancedUpdate' },
  { access: 'upsert', basic: 'basicUpsert', advanced: 'advancedUpsert' },
  { access: 'count', basic: 'basicCount', advanced: 'advancedCount' },
  { access: 'distinct', basic: 'basicDistinct', advanced: 'advancedDistinct' },
] as const satisfies ReadonlyArray<{
  access: PairedRouteAccess;
  basic: RouteVariantAccess;
  advanced: RouteVariantAccess;
}>;

const baseAccess: OperationAccess = {
  new: true,
  list: true,
  read: true,
  create: true,
  update: true,
  upsert: true,
  count: true,
  distinct: true,
  delete: true,
};
const hiddenMetadata = { includePermissions: false, includeFieldPermissions: false };
const hiddenMetadataQuery = 'include_permissions=false&include_field_permissions=false';
const activeFixtures: Array<{
  runtime: ReturnType<typeof createAccessRuntime>;
  connection: mongoose.Connection;
}> = [];
let modelCounter = 0;
let rowCounter = 0;

afterEach(async () => {
  vi.restoreAllMocks();
  for (const { runtime, connection } of activeFixtures.splice(0)) {
    runtime.runtime.clearOpenApiRoutes();
    if (connection !== mongoose.connection) await connection.destroy();
  }
  mongoose.deleteModel(/^Oav03Model/);
});

const createRoutesApp = (options: ModelRouterOptions<Row> = {}, connection = mongoose.connection) => {
  const runtime = createAccessRuntime();
  activeFixtures.push({ runtime, connection });
  runtime.setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions(req) {
      return String(req.headers['x-perms'] ?? '')
        .split(',')
        .filter(Boolean);
    },
  });
  const modelName = `Oav03Model${++modelCounter}`;
  const schema = new mongoose.Schema<Row>(
    {
      name: String,
      role: String,
      public: Boolean,
      status: { type: String, default: 'fresh' },
      privateNote: String,
    },
    { bufferCommands: false },
  );
  schema.plugin(permissionsPlugin, { modelName });
  const Model = connection.model<Row>(modelName, schema);
  const basePath = options.basePath ?? '/oav03-model';
  const router = runtime.createRouter(Model, {
    basePath,
    operationAccess: baseAccess,
    permissionSchema: { name: true, role: true, public: true, status: true, privateNote: false },
    baseFilter: { list: () => ({ public: true }), read: () => ({}), update: () => ({}), delete: () => ({}) },
    ...options,
  });

  // Observe the actual per-request Core dispatch, including filtered distinct's
  // direct req.macl call. Router.model and source-module prototypes are different
  // instances from the adapters/services used by the built HTTP routes.
  const serviceDispatchSpies: Array<{ mock: { calls: unknown[][] } }> = [];
  const app = express();
  app.use(express.json());
  app.use(runtime());
  app.use((req, _res, next) => {
    const core = (req as AccessRouterRequest).macl;
    if (!core) throw new Error('Owning runtime did not initialize Core');
    serviceDispatchSpies.push(vi.spyOn(core, 'getPublicService'));
    next();
  });
  app.use(router.routes);

  const persistenceSpies = [
    vi.spyOn(Model, 'find'),
    vi.spyOn(Model, 'findOne'),
    vi.spyOn(Model, 'create'),
    vi.spyOn(Model, 'countDocuments'),
    vi.spyOn(Model, 'distinct'),
    vi.spyOn(Model.prototype, 'save'),
    vi.spyOn(Model.prototype, 'deleteOne'),
  ];

  return {
    app,
    runtime,
    router,
    Model,
    modelName,
    basePath,
    serviceDispatchSpies,
    persistenceSpies,
    querySegment: router.options.queryRouteSegment ?? '__query',
    mutationSegment: router.options.mutationRouteSegment ?? '__mutation',
  };
};

const createMongoApp = async (options: ModelRouterOptions<Row> = {}) => {
  const fixture = createRoutesApp(options);
  const [seed] = await fixture.Model.create([
    { name: 'visible-row', role: 'reader', public: true, privateNote: 'stored-note' },
    { name: 'private-row', role: 'private', public: false, privateNote: 'stored-note' },
  ]);
  return { ...fixture, seed };
};

type RoutesFixture = ReturnType<typeof createRoutesApp>;
type MongoFixture = Awaited<ReturnType<typeof createMongoApp>>;
type Method = 'get' | 'post' | 'patch' | 'put' | 'delete' | 'head';

const dispatchCount = (fixture: RoutesFixture) =>
  fixture.serviceDispatchSpies.reduce((sum, spy) => sum + spy.mock.calls.length, 0);

const send = (fixture: RoutesFixture, method: Method, suffix: string, body?: unknown) => {
  const test = request(fixture.app)[method](`${fixture.basePath}${suffix}`);
  return body === undefined ? test : test.send(body);
};

const expectEndpoint = async (
  fixture: RoutesFixture,
  method: Method,
  suffix: string,
  body: unknown,
  allowed: boolean,
  successStatus = 200,
) => {
  const beforeDispatch = dispatchCount(fixture);
  const beforePersistence = fixture.persistenceSpies.map((spy) => spy.mock.calls.length);
  const response = await send(fixture, method, suffix, body)
    .expect(allowed ? successStatus : 401)
    .expect('Content-Type', allowed ? /json/ : /application\/problem\+json/);
  if (!allowed) {
    expect(response.body).toMatchObject({ status: 401, title: 'Unauthorized' });
    expect(dispatchCount(fixture)).toBe(beforeDispatch);
    expect(fixture.persistenceSpies.map((spy) => spy.mock.calls.length)).toEqual(beforePersistence);
  } else {
    expect(dispatchCount(fixture)).toBe(beforeDispatch + 1);
  }
  return response;
};

// Every mutation request gets its own target/name. In particular, each upsert
// exercises both a new-row branch and a fresh existing-row branch, so a repeated
// no-op PATCH cannot accidentally satisfy the authorization matrix.
const exercisePair = async (
  fixture: MongoFixture,
  access: PairedRouteAccess,
  variant: RouteVariant,
  allowed: boolean,
) => {
  const advanced = variant === 'advanced';
  const { Model, seed, querySegment, mutationSegment } = fixture;
  const readOptions = { ...hiddenMetadata, tryList: false };

  if (access === 'list') {
    const rows = await Model.collection.find({ public: true }).sort({ name: 1 }).toArray();
    const response = await expectEndpoint(
      fixture,
      advanced ? 'post' : 'get',
      advanced ? `/${querySegment}` : '?select=name,role&sort=name&include_count=true',
      advanced ? { select: ['name', 'role'], sort: 'name', options: { includeCount: true } } : undefined,
      allowed,
    );
    if (allowed) {
      expect(response.body.data.map((row: Row) => row.name)).toEqual(rows.map((row) => row.name));
      expect(response.body.meta.totalCount).toBe(rows.length);
      for (const row of response.body.data) expect(row).not.toHaveProperty('privateNote');
    }
    return;
  }

  if (access === 'read') {
    const endpoints = advanced
      ? [
          { path: `/${querySegment}/${seed._id}`, body: { select: ['name', 'role'], options: readOptions } },
          {
            path: `/${querySegment}/__filter`,
            body: { filter: { name: seed.name }, select: ['name', 'role'], options: readOptions },
          },
        ]
      : [{ path: `/${seed._id}?${hiddenMetadataQuery}&try_list=false&select=name,role`, body: undefined }];
    for (const endpoint of endpoints) {
      const response = await expectEndpoint(fixture, advanced ? 'post' : 'get', endpoint.path, endpoint.body, allowed);
      if (allowed) {
        expect(response.body).toMatchObject({ _id: String(seed._id), name: seed.name, role: seed.role });
        expect(response.body).not.toHaveProperty('privateNote');
      }
    }
    return;
  }

  if (access === 'count' || access === 'distinct') {
    const suffix = access === 'count' ? '/count' : '/distinct/role';
    const response = await expectEndpoint(
      fixture,
      advanced ? 'post' : 'get',
      suffix,
      advanced ? { filter: {} } : undefined,
      allowed,
    );
    if (allowed) {
      if (access === 'count')
        expect(Number(response.text)).toBe(await Model.collection.countDocuments({ public: true }));
      else expect(response.body.sort()).toEqual((await Model.collection.distinct('role')).sort());
    }
    return;
  }

  const name = `${access}-${variant}-${++rowCounter}`;
  const mutationPath = advanced ? `/${mutationSegment}` : '';
  const createData = { name, role: 'writer', public: true, privateNote: 'client-note' };

  if (access === 'create' || access === 'upsert') {
    const response = await expectEndpoint(
      fixture,
      access === 'create' ? 'post' : 'put',
      `${mutationPath}?${hiddenMetadataQuery}`,
      advanced ? { data: createData, options: hiddenMetadata } : createData,
      allowed,
      201,
    );
    const stored = await Model.collection.findOne({ name });
    if (allowed) {
      expect(response.body).toMatchObject({ name, role: 'writer', public: true, status: 'fresh' });
      expect(response.body).not.toHaveProperty('privateNote');
      expect(stored).toMatchObject({ name, role: 'writer' });
      expect(stored).not.toHaveProperty('privateNote');
    } else {
      expect(stored).toBeNull();
    }
    if (access === 'create') return;
  }

  const target = await Model.create({
    name: `${name}-target`,
    role: 'original',
    public: true,
    privateNote: 'stored-note',
  });
  const role = `${name}-changed`;
  const data =
    access === 'upsert'
      ? { _id: String(target._id), role, privateNote: 'client-note' }
      : { role, privateNote: 'client-note' };
  const path = access === 'upsert' ? mutationPath : `${mutationPath}/${target._id}`;
  const response = await expectEndpoint(
    fixture,
    access === 'upsert' ? 'put' : 'patch',
    `${path}?${hiddenMetadataQuery}&returning_all=true`,
    advanced ? { data, options: { ...hiddenMetadata, returningAll: true } } : data,
    allowed,
  );
  if (allowed) {
    expect(response.body).toMatchObject({ _id: String(target._id), name: target.name, role });
    expect(response.body).not.toHaveProperty('privateNote');
  }
  expect(await Model.collection.findOne({ _id: target._id })).toMatchObject({
    name: target.name,
    role: allowed ? role : 'original',
    privateNote: 'stored-note',
  });
};

describe('OAV-03 seven paired model operations', () => {
  it.each(pairs)('inherits the base-only $access rule on both variants', async ({ access }) => {
    const fixture = await createMongoApp();
    await exercisePair(fixture, access, 'basic', true);
    await exercisePair(fixture, access, 'advanced', true);
  });

  it.each(pairs)('inherits a denied base-only $access rule on both variants', async ({ access }) => {
    const fixture = await createMongoApp({ operationAccess: { ...baseAccess, [access]: false } });
    await exercisePair(fixture, access, 'basic', false);
    await exercisePair(fixture, access, 'advanced', false);
  });

  for (const variant of ['basic', 'advanced'] as const) {
    it.each(pairs)(`denies only the ${variant} $access endpoint over an allowed base`, async (pair) => {
      const fixture = await createMongoApp({ operationAccess: { ...baseAccess, [pair[variant]]: false } });
      await exercisePair(fixture, pair.access, 'basic', variant !== 'basic');
      await exercisePair(fixture, pair.access, 'advanced', variant !== 'advanced');
    });

    it.each(pairs)(`allows only the ${variant} $access endpoint over a denied base`, async (pair) => {
      const fixture = await createMongoApp({
        operationAccess: { ...baseAccess, [pair.access]: false, [pair[variant]]: true },
      });
      await exercisePair(fixture, pair.access, 'basic', variant === 'basic');
      await exercisePair(fixture, pair.access, 'advanced', variant === 'advanced');
    });
  }
});

describe('OAV-03 generated route boundaries', () => {
  it('denies every paired entry before body/query validation, service construction, or persistence', async () => {
    const validator = vi.fn(() => ({
      success: false as const,
      issues: [{ message: 'Entry authorization must precede this validator' }],
    }));
    const validate = vi.fn(() => true);
    const prepare = vi.fn((data: Row) => data);
    const fixture = createRoutesApp(
      {
        operationAccess: {
          ...baseAccess,
          ...Object.fromEntries(
            pairs.flatMap(({ basic, advanced }) => [
              [basic, false],
              [advanced, false],
            ]),
          ),
        },
        requestSchemas: {
          create: validator,
          update: validator,
          upsert: validator,
          count: validator,
          distinct: validator,
          advancedList: validator,
          advancedRead: validator,
          advancedReadFilter: validator,
          advancedCreate: { data: validator, default: validator },
          advancedUpdate: { data: validator, default: validator },
          advancedUpsert: { data: validator, default: validator },
        },
        validate,
        prepare,
      },
      mongoose.createConnection(),
    );
    const id = String(new mongoose.Types.ObjectId());
    const endpoints: Array<{ method: Method; path: string; body?: unknown }> = [
      { method: 'get', path: '?limit=0' },
      { method: 'post', path: '/__query', body: { select: true } },
      { method: 'get', path: `/${id}?try_list=invalid` },
      { method: 'post', path: `/__query/${id}`, body: { select: true } },
      { method: 'post', path: '/__query/__filter', body: { select: true } },
      { method: 'post', path: '', body: { name: 'denied' } },
      { method: 'post', path: '/__mutation', body: { data: { name: 'denied' } } },
      { method: 'patch', path: `/${id}`, body: { role: 'denied' } },
      { method: 'patch', path: `/__mutation/${id}`, body: { data: { role: 'denied' } } },
      { method: 'put', path: '', body: { name: 'denied' } },
      { method: 'put', path: '', body: { _id: id, role: 'denied' } },
      { method: 'put', path: '/__mutation', body: { data: { name: 'denied' } } },
      { method: 'put', path: '/__mutation', body: { data: { _id: id, role: 'denied' } } },
      { method: 'get', path: '/count' },
      { method: 'post', path: '/count', body: { access: true } },
      { method: 'get', path: '/distinct/role' },
      { method: 'post', path: '/distinct/role', body: { query: true } },
    ];
    for (const { method, path, body } of endpoints) {
      await expectEndpoint(fixture, method, path, body, false);
    }
    expect(fixture.serviceDispatchSpies).toHaveLength(endpoints.length);
    expect(dispatchCount(fixture)).toBe(0);
    for (const spy of fixture.persistenceSpies) expect(spy).not.toHaveBeenCalled();
    expect(validator).not.toHaveBeenCalled();
    expect(validate).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
  });

  it('basicRead false leaves both advanced reads and every unrelated basic/advanced operation usable', async () => {
    const fixture = await createMongoApp({ operationAccess: { ...baseAccess, basicRead: false } });
    await exercisePair(fixture, 'read', 'basic', false);
    await exercisePair(fixture, 'read', 'advanced', true);
    for (const { access } of pairs) {
      if (access === 'read') continue;
      await exercisePair(fixture, access, 'basic', true);
      await exercisePair(fixture, access, 'advanced', true);
    }
    const template = await expectEndpoint(fixture, 'get', '/new', undefined, true);
    expect(template.body).toMatchObject({ status: 'fresh' });
    const target = await fixture.Model.create({ name: 'delete-target', role: 'reader', public: true });
    await expectEndpoint(fixture, 'delete', `/${target._id}`, undefined, true);
    expect(await fixture.Model.collection.findOne({ _id: target._id })).toBeNull();
  });

  it.each(['list', 'read', 'count', 'distinct'] as const)('HEAD uses the basic %s guard', async (access) => {
    const pair = pairs.find((pair) => pair.access === access)!;
    const fixture = await createMongoApp({
      operationAccess: { ...baseAccess, [pair.basic]: false, [pair.advanced]: true },
    });
    const path =
      access === 'list'
        ? ''
        : access === 'read'
          ? `/${fixture.seed._id}`
          : access === 'count'
            ? '/count'
            : '/distinct/role';
    const beforePersistence = fixture.persistenceSpies.map((spy) => spy.mock.calls.length);
    await send(fixture, 'head', path).expect(401);
    expect(dispatchCount(fixture)).toBe(0);
    expect(fixture.persistenceSpies.map((spy) => spy.mock.calls.length)).toEqual(beforePersistence);
    await exercisePair(fixture, access, 'advanced', true);

    fixture.router.setOption('operationAccess', { ...baseAccess, [pair.basic]: true, [pair.advanced]: false });
    const beforeDispatch = dispatchCount(fixture);
    const allowed = await send(fixture, 'head', path).expect(200);
    expect(allowed.text ?? '').toBe('');
    expect(dispatchCount(fixture)).toBe(beforeDispatch + 1);
    await exercisePair(fixture, access, 'advanced', false);
  });

  it.each(pairs)('retains custom id/query/mutation segments for the $access pair', async (pair) => {
    const fixture = await createMongoApp({
      basePath: '/custom-model',
      idParam: 'recordId',
      queryRouteSegment: 'search',
      mutationRouteSegment: 'write',
      operationAccess: { ...baseAccess, [pair.basic]: false },
    });
    await exercisePair(fixture, pair.access, 'basic', false);
    await exercisePair(fixture, pair.access, 'advanced', true);
    fixture.router.set('operationAccess', { ...baseAccess, [pair.advanced]: false });
    await exercisePair(fixture, pair.access, 'basic', true);
    await exercisePair(fixture, pair.access, 'advanced', false);
    expect(fixture.router.router.getEndpoints()).toContainEqual({ method: 'GET', path: '/custom-model/:recordId' });
    expect(fixture.router.router.getEndpoints()).toContainEqual({
      method: 'POST',
      path: '/custom-model/search/:recordId',
    });
    expect(fixture.router.router.getEndpoints()).toContainEqual({
      method: 'PATCH',
      path: '/custom-model/write/:recordId',
    });
  });

  it('observes live property-helper and typed set/setOption/runtime updates, including shallow replacement', async () => {
    const fixture = await createMongoApp({ operationAccess: { ...baseAccess, basicRead: false } });
    const { router, runtime, modelName } = fixture;
    const snapshot = router.options.operationAccess;
    const endpoints = router.router.getEndpoints();
    await exercisePair(fixture, 'read', 'basic', false);
    await exercisePair(fixture, 'read', 'advanced', true);

    router.operationAccess('basicRead', true);
    await exercisePair(fixture, 'read', 'basic', true);
    router.set('operationAccess.advancedRead', false);
    await exercisePair(fixture, 'read', 'basic', true);
    await exercisePair(fixture, 'read', 'advanced', false);
    router.setOption('operationAccess.basicRead', false);
    await exercisePair(fixture, 'read', 'basic', false);
    runtime.setModelOption(modelName, 'operationAccess.advancedRead', true);
    await exercisePair(fixture, 'read', 'advanced', true);
    router.setOption('operationAccess.basicRead', undefined);
    await exercisePair(fixture, 'read', 'basic', true);

    router.set({ operationAccess: { advancedRead: true } });
    expect(runtime.getModelOptions(modelName).operationAccess).toEqual({ advancedRead: true });
    await exercisePair(fixture, 'read', 'basic', false);
    await exercisePair(fixture, 'read', 'advanced', true);
    await exercisePair(fixture, 'list', 'basic', false);
    await expectEndpoint(fixture, 'get', '/new', undefined, false);

    router.setOption('operationAccess', { ...baseAccess, basicRead: false });
    await exercisePair(fixture, 'read', 'basic', false);
    await exercisePair(fixture, 'read', 'advanced', true);
    await exercisePair(fixture, 'list', 'basic', true);
    router.operationAccess({ ...baseAccess, advancedRead: false });
    expect(runtime.getModelOptions(modelName).operationAccess).toEqual({ ...baseAccess, advancedRead: false });
    await exercisePair(fixture, 'read', 'basic', true);
    await exercisePair(fixture, 'read', 'advanced', false);
    expect(router.options.operationAccess).toBe(snapshot);
    expect(snapshot).toEqual({ ...baseAccess, basicRead: false });
    expect(router.router.getEndpoints()).toEqual(endpoints);
  });

  it('keeps all denied routes in getEndpoints and served OpenAPI before and after live mutation', async () => {
    const fixture = createRoutesApp(
      {
        basePath: '/registered-model',
        idParam: 'recordId',
        queryRouteSegment: 'search',
        mutationRouteSegment: 'write',
        operationAccess: {
          ...baseAccess,
          new: false,
          delete: false,
          ...Object.fromEntries(
            pairs.flatMap(({ basic, advanced }) => [
              [basic, false],
              [advanced, false],
            ]),
          ),
        },
      },
      mongoose.createConnection(),
    );
    fixture.app.use(fixture.runtime.createOpenApiRouter({ title: 'OAV-03 routes', version: '1.0.0' }));
    const endpoints = fixture.router.router.getEndpoints();
    const registrations = [
      { method: 'get', path: '/' },
      { method: 'post', path: '/search' },
      { method: 'post', path: '/' },
      { method: 'post', path: '/write' },
      { method: 'get', path: '/new' },
      { method: 'get', path: '/count' },
      { method: 'post', path: '/count' },
      { method: 'get', path: '/:recordId' },
      { method: 'post', path: '/search/__filter' },
      { method: 'post', path: '/search/:recordId' },
      { method: 'patch', path: '/:recordId' },
      { method: 'patch', path: '/write/:recordId' },
      { method: 'put', path: '/' },
      { method: 'put', path: '/write' },
      { method: 'delete', path: '/:recordId' },
      { method: 'get', path: '/distinct/:field' },
      { method: 'post', path: '/distinct/:field' },
    ];
    const spec = await request(fixture.app).get('/openapi.json').expect(200);
    expect(endpoints).toHaveLength(registrations.length);
    for (const { method, path } of registrations) {
      expect(endpoints).toContainEqual({ method: method.toUpperCase(), path: `${fixture.basePath}${path}` });
      // Basic upsert's existing OpenAPI descriptor preserves '/', while
      // collection list/create descriptors use ''. Both stay registered.
      const specSuffix = path === '/' && method !== 'put' ? '' : path;
      const openApiPath = `${fixture.basePath}${specSuffix}`.replace(/:([^/]+)/g, '{$1}');
      expect(spec.body.paths[openApiPath][method], `${method.toUpperCase()} ${openApiPath}`).toBeDefined();
      expect(spec.body.paths[openApiPath][method].responses[401]).toBeDefined();
    }
    await expectEndpoint(fixture, 'get', '/some-id', undefined, false);
    fixture.router.operationAccess(baseAccess);
    expect(fixture.router.router.getEndpoints()).toEqual(endpoints);
    const updatedSpec = await request(fixture.app).get('/openapi.json').expect(200);
    expect(updatedSpec.body.paths).toEqual(spec.body.paths);
  });

  it('authorized advanced upsert uses both internal branches despite denied create/update route guards', async () => {
    const fixture = await createMongoApp({
      operationAccess: {
        ...baseAccess,
        upsert: false,
        advancedUpsert: true,
        create: false,
        basicCreate: false,
        advancedCreate: false,
        update: false,
        basicUpdate: false,
        advancedUpdate: false,
      },
    });
    await exercisePair(fixture, 'upsert', 'advanced', true);
    await exercisePair(fixture, 'upsert', 'basic', false);
    await exercisePair(fixture, 'create', 'advanced', false);
    await exercisePair(fixture, 'update', 'advanced', false);
  });

  it('keeps new and delete on their live unpaired base guards', async () => {
    const fixture = await createMongoApp({
      operationAccess: { ...baseAccess, new: false, delete: false, basicRead: true, advancedCreate: true },
    });
    await expectEndpoint(fixture, 'get', '/new', undefined, false);
    await expectEndpoint(fixture, 'delete', `/${fixture.seed._id}`, undefined, false);
    expect(await fixture.Model.collection.findOne({ _id: fixture.seed._id })).not.toBeNull();
    fixture.router.operationAccess('new', true);
    fixture.router.operationAccess('delete', true);
    const template = await expectEndpoint(fixture, 'get', '/new', undefined, true);
    expect(template.body).toMatchObject({ status: 'fresh' });
    await expectEndpoint(fixture, 'delete', `/${fixture.seed._id}`, undefined, true);
    expect(await fixture.Model.collection.findOne({ _id: fixture.seed._id })).toBeNull();
  });
});

describe('OAV-03 base data-policy preservation', () => {
  it.each(['create', 'update', 'upsert'] as const)(
    'advanced %s selects base validation/prepare/decorate hooks',
    async (access) => {
      const wrongAccess = vi.fn(() => {
        throw new Error('A route variant reached a data-policy hook');
      });
      const makeValidate = () =>
        vi.fn<ModelValidateHook>((_data, _permissions, context) => {
          expect(context.operation).toBe(access);
          return true;
        });
      const makePrepare = (operation: 'create' | 'update') =>
        vi.fn<ModelHook<Row>>((data, _permissions, context) => {
          expect(context.operation).toBe(access);
          return { ...data, status: `prepared-${operation}` };
        });
      const makeDecorate = (operation: 'create' | 'update') =>
        vi.fn<ModelHook<Row>>((doc, _permissions, context) => {
          expect(context.operation).toBe(access);
          return { ...doc, hookPolicy: operation };
        });
      const createValidate = makeValidate();
      const updateValidate = makeValidate();
      const createPrepare = makePrepare('create');
      const updatePrepare = makePrepare('update');
      const createDecorate = makeDecorate('create');
      const updateDecorate = makeDecorate('update');
      const variantHooks = { advancedCreate: wrongAccess, advancedUpdate: wrongAccess, advancedUpsert: wrongAccess };
      const fixture = await createMongoApp({
        operationAccess: {
          ...baseAccess,
          create: false,
          update: false,
          upsert: false,
          advancedCreate: access === 'create',
          advancedUpdate: access === 'update',
          advancedUpsert: access === 'upsert',
        },
        validate: { create: createValidate, update: updateValidate, ...variantHooks },
        prepare: { create: createPrepare, update: updatePrepare, ...variantHooks },
        decorate: { create: createDecorate, update: updateDecorate, ...variantHooks },
      });
      if (access !== 'update') {
        const name = `hook-create-${++rowCounter}`;
        const response = await expectEndpoint(
          fixture,
          access === 'upsert' ? 'put' : 'post',
          '/__mutation',
          {
            data: { name, role: 'writer', public: true },
            options: hiddenMetadata,
          },
          true,
          201,
        );
        expect(response.body).toMatchObject({ name, status: 'prepared-create', hookPolicy: 'create' });
        expect(await fixture.Model.collection.findOne({ name })).toMatchObject({ status: 'prepared-create' });
      }
      if (access !== 'create') {
        const target = await fixture.Model.create({
          name: `hook-update-${++rowCounter}`,
          role: 'original',
          public: true,
        });
        const data = access === 'upsert' ? { _id: String(target._id), role: 'edited' } : { role: 'edited' };
        const response = await expectEndpoint(
          fixture,
          access === 'upsert' ? 'put' : 'patch',
          access === 'upsert' ? '/__mutation' : `/__mutation/${target._id}`,
          {
            data,
            options: { ...hiddenMetadata, returningAll: true },
          },
          true,
        );
        expect(response.body).toMatchObject({
          name: target.name,
          role: 'edited',
          status: 'prepared-update',
          hookPolicy: 'update',
        });
        expect(await fixture.Model.collection.findOne({ _id: target._id })).toMatchObject({
          role: 'edited',
          status: 'prepared-update',
        });
      }
      for (const hook of [createValidate, createPrepare, createDecorate])
        expect(hook).toHaveBeenCalledTimes(access === 'update' ? 0 : 1);
      for (const hook of [updateValidate, updatePrepare, updateDecorate])
        expect(hook).toHaveBeenCalledTimes(access === 'create' ? 0 : 1);
      expect(wrongAccess).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])('advanced read retries use only base list: %s', async (listAllowed) => {
    const listGuard = vi.fn<GuardHook>(() => listAllowed);
    const basicListGuard = vi.fn<GuardHook>(() => !listAllowed);
    const advancedListGuard = vi.fn<GuardHook>(() => !listAllowed);
    const readDecorate = vi.fn((doc: Row) => doc);
    const listDecorate = vi.fn((doc: Row, _permissions, context) => {
      expect(context.operation).toBe('read');
      return { ...doc, fallbackPolicy: 'list' };
    });
    const fixture = await createMongoApp({
      operationAccess: {
        ...baseAccess,
        read: false,
        advancedRead: true,
        list: listGuard,
        basicList: basicListGuard,
        advancedList: advancedListGuard,
      },
      baseFilter: { read: () => ({ public: false }), list: () => ({ public: true }) },
      permissionSchema: {
        name: { read: true, list: true },
        role: { read: false, list: true },
        public: true,
        status: true,
        privateNote: false,
      },
      decorate: { read: readDecorate, list: listDecorate },
    });
    for (const endpoint of [
      { path: `/__query/${fixture.seed._id}`, body: { select: ['name', 'role'], options: hiddenMetadata } },
      {
        path: '/__query/__filter',
        body: { filter: { name: fixture.seed.name }, select: ['name', 'role'], options: hiddenMetadata },
      },
    ]) {
      const beforeDispatch = dispatchCount(fixture);
      const beforeFind = fixture.persistenceSpies[1].mock.calls.length;
      const response = await send(fixture, 'post', endpoint.path, endpoint.body).expect(listAllowed ? 200 : 401);
      expect(dispatchCount(fixture)).toBe(beforeDispatch + 1);
      expect(fixture.persistenceSpies[1].mock.calls.length - beforeFind).toBe(listAllowed ? 2 : 1);
      if (listAllowed)
        expect(response.body).toMatchObject({ name: fixture.seed.name, role: 'reader', fallbackPolicy: 'list' });
      else expect(response.body).toMatchObject({ status: 401, title: 'Unauthorized' });
    }
    expect(listGuard).toHaveBeenCalledTimes(2);
    expect(basicListGuard).not.toHaveBeenCalled();
    expect(advancedListGuard).not.toHaveBeenCalled();
    expect(readDecorate).not.toHaveBeenCalled();
    expect(listDecorate).toHaveBeenCalledTimes(listAllowed ? 2 : 0);
  });

  it.each(['basic', 'advanced'] as const)(
    '%s grants retain ordinary Forbidden and BadRequest statuses',
    async (variant) => {
      const fixture = await createMongoApp({
        operationAccess: {
          ...baseAccess,
          read: false,
          basicRead: true,
          advancedRead: true,
          update: false,
          basicUpdate: true,
          advancedUpdate: true,
          create: false,
          basicCreate: true,
          advancedCreate: true,
          count: false,
          basicCount: true,
          advancedCount: true,
          distinct: false,
          basicDistinct: true,
          advancedDistinct: true,
        },
        permissionSchema: {
          name: true,
          role: { read: false, list: false, create: true, update: true },
          public: true,
          status: true,
        },
        baseFilter: { read: () => false, list: () => false, update: () => false },
        validate: { create: () => false },
      });
      const advanced = variant === 'advanced';
      const mutationPath = advanced ? '/__mutation' : '';
      const id = String(fixture.seed._id);
      const data = { name: 'invalid-row', role: 'writer', public: true };
      const beforePersistence = fixture.persistenceSpies.map((spy) => spy.mock.calls.length);

      await send(
        fixture,
        advanced ? 'post' : 'get',
        advanced ? `/__query/${id}` : `/${id}`,
        advanced ? { options: hiddenMetadata } : undefined,
      ).expect(403);
      if (advanced)
        await send(fixture, 'post', '/__query/__filter', { filter: { name: fixture.seed.name } }).expect(403);
      await send(fixture, 'patch', `${mutationPath}/${id}`, advanced ? { data } : data).expect(403);
      await send(fixture, advanced ? 'post' : 'get', '/count', advanced ? {} : undefined).expect(403);
      await send(fixture, advanced ? 'post' : 'get', '/distinct/role', advanced ? {} : undefined).expect(403);
      await send(fixture, 'post', mutationPath, advanced ? { data } : data).expect(400);
      await send(
        fixture,
        advanced ? 'post' : 'get',
        advanced ? '/__query' : '?limit=0',
        advanced ? { limit: 0 } : undefined,
      ).expect(400);
      await send(fixture, advanced ? 'post' : 'get', '/distinct/%24invalid', advanced ? {} : undefined).expect(400);
      if (advanced) {
        await send(fixture, 'post', '/count', { access: true }).expect(400);
        await send(fixture, 'post', '/distinct/name', { query: true }).expect(400);
      }
      expect(fixture.persistenceSpies.map((spy) => spy.mock.calls.length)).toEqual(beforePersistence);
      expect(await fixture.Model.collection.countDocuments({})).toBe(2);
      expect(await fixture.Model.collection.findOne({ _id: fixture.seed._id })).toMatchObject({ role: 'reader' });
    },
  );

  it.each(['basic', 'advanced'] as const)(
    '%s read override retains NotFound when list retry is disabled',
    async (variant) => {
      const fixture = await createMongoApp({
        operationAccess: { ...baseAccess, read: false, basicRead: true, advancedRead: true },
      });
      const id = String(new mongoose.Types.ObjectId());
      const response = await send(
        fixture,
        variant === 'advanced' ? 'post' : 'get',
        variant === 'advanced' ? `/__query/${id}` : `/${id}?try_list=false`,
        variant === 'advanced' ? { options: { ...hiddenMetadata, tryList: false } } : undefined,
      ).expect(404);
      expect(response.body).toMatchObject({ status: 404, title: 'Not Found' });
      if (variant === 'advanced') {
        await send(fixture, 'post', '/__query/__filter', {
          filter: { name: 'absent-row' },
          options: { ...hiddenMetadata, tryList: false },
        }).expect(404);
      }
    },
  );
});
