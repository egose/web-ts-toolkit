import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createAccessRuntime,
  type AccessRouterRequest,
  type DataRouterOptions,
  type GuardHook,
  type ModelRouterOptions,
  type OperationAccess,
  type RouteVariant,
  type SubOperationAccess,
} from '../dist/index.mjs';
import { useMongoTestDatabase } from './setup';

interface DataRow {
  id: string;
  label: string;
  value: number;
  public: boolean;
  privateNote?: string;
}

interface Item {
  _id?: mongoose.Types.ObjectId;
  label: string;
  value: number;
  listed: boolean;
  readable: boolean;
  privateNote?: string;
}

interface Parent {
  key: string;
  tenant: string;
  items: Item[];
}

const pairs = [
  { access: 'list', basic: 'basicList', advanced: 'advancedList' },
  { access: 'read', basic: 'basicRead', advanced: 'advancedRead' },
] as const;
type Pair = (typeof pairs)[number];
type Method = 'get' | 'post' | 'patch' | 'delete' | 'head';
type CallSpy = { mock: { calls: unknown[][] } };
type Api = ReturnType<typeof createAccessRuntime>;
interface HttpFixture {
  app: express.Express;
  basePath: string;
  dispatchSpies: CallSpy[];
  policySpies: CallSpy[];
  persistenceSpies: CallSpy[];
}

const dataAccess: OperationAccess = { list: true, read: true };
const subAccess: SubOperationAccess = { list: true, read: true, create: true, update: true, delete: true };
const parentAccess: OperationAccess = { list: true, read: true, create: true, update: true, delete: true };
const withSubAccess = (items: SubOperationAccess): OperationAccess => ({ ...parentAccess, subs: { items } });
const runtimes = new Set<Api>();
const connections = new Set<mongoose.Connection>();
let counter = 0;

afterEach(async () => {
  vi.restoreAllMocks();
  for (const api of runtimes) api.runtime.clearOpenApiRoutes();
  runtimes.clear();
  for (const connection of connections) await connection.destroy();
  connections.clear();
  mongoose.deleteModel(/^Oav04/);
});

const configureRuntime = (api: Api) => {
  runtimes.add(api);
  api.setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions(req) {
      return String(req.headers['x-perms'] ?? '')
        .split(',')
        .filter(Boolean);
    },
  });
};

const countCalls = (spies: CallSpy[]) => spies.reduce((sum, spy) => sum + spy.mock.calls.length, 0);
const workCounts = (fixture: HttpFixture) => ({
  dispatch: countCalls(fixture.dispatchSpies),
  policy: countCalls(fixture.policySpies),
  persistence: countCalls(fixture.persistenceSpies),
});
const send = (fixture: HttpFixture, method: Method, suffix: string, body?: unknown) => {
  const test = request(fixture.app)[method](`${fixture.basePath}${suffix}`);
  return body === undefined ? test : test.send(body);
};

const expectEntry = async (
  fixture: HttpFixture,
  method: Method,
  suffix: string,
  body: unknown,
  allowed: boolean,
  successStatus = 200,
) => {
  const before = workCounts(fixture);
  const response = await send(fixture, method, suffix, body).expect(allowed ? successStatus : 401);
  if (method !== 'head') {
    expect(response.headers['content-type']).toMatch(allowed ? /json/ : /application\/problem\+json/);
  }
  if (allowed) {
    expect(workCounts(fixture).dispatch).toBe(before.dispatch + 1);
  } else {
    if (method !== 'head') expect(response.body).toMatchObject({ status: 401, title: 'Unauthorized' });
    expect(workCounts(fixture)).toEqual(before);
  }
  return response;
};

const createDataFixture = (
  options: DataRouterOptions<DataRow> = {},
  api = createAccessRuntime(),
  dataName = `Oav04Data${++counter}`,
) => {
  configureRuntime(api);
  const router = api.createDataRouter<DataRow>(dataName, {
    basePath: '/oav04-data',
    idField: 'id',
    operationAccess: dataAccess,
    data: [
      { id: 'apple', label: 'Apple', value: 1, public: true, privateNote: 'stored-note' },
      { id: 'private', label: 'Private', value: 99, public: false, privateNote: 'stored-note' },
      { id: 'pear', label: 'Pear', value: 2, public: true, privateNote: 'stored-note' },
    ],
    permissionSchema: { id: true, label: true, value: { list: false, read: true }, privateNote: false },
    baseFilter: { list: () => ({ public: true }), read: () => ({ public: true }) },
    ...options,
  });
  const dispatchSpies: CallSpy[] = [];
  const policySpies: CallSpy[] = [];
  const app = express();
  app.use(express.json());
  // The runtime API's callable middleware initializes only model Core. Reuse
  // this built data router's owning DataCore middleware before observing it.
  app.use(router.router.middlewares);
  app.use((req, _res, next) => {
    const core = (req as AccessRouterRequest).dacl;
    if (!core) throw new Error('Owning runtime did not initialize DataCore');
    dispatchSpies.push(vi.spyOn(core, 'getService'));
    policySpies.push(
      vi.spyOn(core, 'genFilter'),
      vi.spyOn(core, 'genSelect'),
      vi.spyOn(core, 'genIDFilter'),
      vi.spyOn(core, 'pickAllowedFields'),
    );
    next();
  });
  app.use(router.routes);
  return {
    app,
    api,
    router,
    dataName,
    dispatchSpies,
    policySpies,
    persistenceSpies: [],
    basePath: router.options.basePath!,
    querySegment: router.options.queryRouteSegment!,
  };
};

const createSubRoutesFixture = (options: ModelRouterOptions<Parent> = {}, connection = mongoose.connection) => {
  const api = createAccessRuntime();
  configureRuntime(api);
  if (connection !== mongoose.connection) connections.add(connection);
  const modelName = `Oav04Sub${++counter}`;
  const itemSchema = new mongoose.Schema<Item>({
    label: String,
    value: Number,
    listed: Boolean,
    readable: Boolean,
    privateNote: String,
  });
  const Model = connection.model<Parent>(
    modelName,
    new mongoose.Schema<Parent>(
      {
        key: String,
        tenant: String,
        items: [itemSchema],
      },
      { bufferCommands: false },
    ),
  );
  const router = api.createRouter(Model, {
    basePath: '/oav04-sub',
    operationAccess: withSubAccess(subAccess),
    permissionSchema: {
      key: true,
      items: {
        sub: {
          label: { list: true, read: true, create: true, update: true },
          value: { list: false, read: true, create: true, update: true },
          listed: { create: true, update: true },
          readable: { create: true, update: true },
          privateNote: false,
        },
      },
    },
    baseFilter: {
      read: () => ({ tenant: 'allowed' }),
      update: () => ({ tenant: 'allowed' }),
      subs: {
        items: {
          list: () => ({ listed: true }),
          read: () => ({ readable: true }),
          update: () => ({}),
          delete: () => ({}),
        },
      },
    },
    ...options,
  });
  const dispatchSpies: CallSpy[] = [];
  const policySpies: CallSpy[] = [];
  const app = express();
  app.use(express.json());
  app.use(api());
  app.use((req, _res, next) => {
    const core = (req as AccessRouterRequest).macl;
    if (!core) throw new Error('Owning runtime did not initialize Core');
    dispatchSpies.push(vi.spyOn(core, 'getPublicService'));
    policySpies.push(vi.spyOn(core, 'genFilter'), vi.spyOn(core, 'genSelect'));
    next();
  });
  app.use(router.routes);
  const persistenceSpies = [
    vi.spyOn(Model, 'find'),
    vi.spyOn(Model, 'findOne'),
    vi.spyOn(Model, 'create'),
    vi.spyOn(Model.prototype, 'save'),
    vi.spyOn(Model.collection, 'findOne'),
    vi.spyOn(Model.collection, 'insertOne'),
    vi.spyOn(Model.collection, 'updateOne'),
  ];
  return {
    app,
    api,
    router,
    Model,
    modelName,
    dispatchSpies,
    policySpies,
    persistenceSpies,
    basePath: router.options.basePath!,
    querySegment: router.options.queryRouteSegment!,
  };
};

const createSubFixture = async (options: ModelRouterOptions<Parent> = {}) => {
  const fixture = createSubRoutesFixture(options);
  const seed = await fixture.Model.create({
    key: `post-key-${counter}`,
    tenant: 'allowed',
    items: [
      { label: 'visible', value: 1, listed: true, readable: true },
      { label: 'list-hidden', value: 2, listed: false, readable: true },
      { label: 'read-hidden', value: 3, listed: true, readable: false },
      { label: 'both-hidden', value: 4, listed: false, readable: false },
    ].map((item) => ({ ...item, privateNote: 'stored-note' })),
  });
  return {
    ...fixture,
    seed,
    id: fixture.router.options.idField === 'key' ? seed.key : String(seed._id),
    subIds: seed.items.map((item) => String(item._id)),
    reload: () => fixture.Model.collection.findOne({ _id: seed._id }),
  };
};

const exerciseDataPair = async (
  fixture: ReturnType<typeof createDataFixture>,
  access: Pair['access'],
  variant: RouteVariant,
  allowed: boolean,
) => {
  const advanced = variant === 'advanced';
  if (access === 'list') {
    const response = await expectEntry(
      fixture,
      advanced ? 'post' : 'get',
      advanced ? `/${fixture.querySegment}` : '?include_count=true',
      advanced
        ? {
            filter: { label: 'Apple' },
            select: ['id', 'label', 'value', 'privateNote'],
            options: { includeCount: true },
          }
        : undefined,
      allowed,
    );
    if (allowed) {
      expect(response.body.data).toEqual([
        { id: 'apple', label: 'Apple' },
        ...(advanced ? [] : [{ id: 'pear', label: 'Pear' }]),
      ]);
      expect(response.body.meta.totalCount).toBe(advanced ? 1 : 2);
    }
    return;
  }
  const endpoints = advanced
    ? [
        { path: `/${fixture.querySegment}/apple`, body: { select: ['id', 'label', 'value', 'privateNote'] } },
        {
          path: `/${fixture.querySegment}/__filter`,
          body: { filter: { id: 'apple' }, select: ['id', 'label', 'value', 'privateNote'] },
        },
      ]
    : [{ path: '/apple', body: undefined }];
  for (const { path, body } of endpoints) {
    const response = await expectEntry(fixture, advanced ? 'post' : 'get', path, body, allowed);
    if (allowed) expect(response.body).toEqual({ id: 'apple', label: 'Apple', value: 1 });
  }
};

const exerciseSubPair = async (
  fixture: Awaited<ReturnType<typeof createSubFixture>>,
  access: Pair['access'],
  variant: RouteVariant,
  allowed: boolean,
) => {
  const advanced = variant === 'advanced';
  const path = `/${fixture.id}/items${access === 'read' ? `/${fixture.subIds[0]}` : ''}`;
  const response = await expectEntry(
    fixture,
    advanced ? 'post' : 'get',
    `${path}${advanced ? `/${fixture.querySegment}` : ''}`,
    advanced
      ? {
          ...(access === 'list' ? { filter: { label: 'visible' } } : {}),
          select: ['label', 'value', 'privateNote'],
        }
      : undefined,
    allowed,
  );
  if (allowed) {
    const visible = { _id: fixture.subIds[0], label: 'visible' };
    expect(response.body).toEqual(
      access === 'read'
        ? { ...visible, value: 1 }
        : [visible, ...(advanced ? [] : [{ _id: fixture.subIds[2], label: 'read-hidden' }])],
    );
  }
};

describe('OAV-04 in-memory data list/read pairs (no Mongo)', () => {
  it.each(pairs)('inherits the base-only $access rule on both variants', async ({ access }) => {
    const fixture = createDataFixture();
    await exerciseDataPair(fixture, access, 'basic', true);
    await exerciseDataPair(fixture, access, 'advanced', true);
  });

  it.each(pairs)('inherits a denied base-only $access rule on both variants', async ({ access }) => {
    const fixture = createDataFixture({ operationAccess: { ...dataAccess, [access]: false } });
    await exerciseDataPair(fixture, access, 'basic', false);
    await exerciseDataPair(fixture, access, 'advanced', false);
  });

  for (const variant of ['basic', 'advanced'] as const) {
    it.each(pairs)(`denies only the ${variant} $access endpoint over an allowed base`, async (pair) => {
      const fixture = createDataFixture({ operationAccess: { ...dataAccess, [pair[variant]]: false } });
      await exerciseDataPair(fixture, pair.access, 'basic', variant !== 'basic');
      await exerciseDataPair(fixture, pair.access, 'advanced', variant !== 'advanced');
    });

    it.each(pairs)(`allows only the ${variant} $access endpoint over a denied base`, async (pair) => {
      const fixture = createDataFixture({
        operationAccess: { ...dataAccess, [pair.access]: false, [pair[variant]]: true },
      });
      await exerciseDataPair(fixture, pair.access, 'basic', variant === 'basic');
      await exerciseDataPair(fixture, pair.access, 'advanced', variant === 'advanced');
    });

    it.each(pairs)(`allows a ${variant}-only $access rule with no base grant`, async (pair) => {
      const fixture = createDataFixture({ operationAccess: { [pair[variant]]: true } });
      await exerciseDataPair(fixture, pair.access, 'basic', variant === 'basic');
      await exerciseDataPair(fixture, pair.access, 'advanced', variant === 'advanced');
    });
  }

  it('denies all five entries before built-in/custom validation, service creation, or row/field hooks', async () => {
    const validator = vi.fn(() => ({ success: false as const, issues: [{ message: 'Must not reach validation' }] }));
    const decorate = vi.fn((row) => row);
    const fixture = createDataFixture({
      operationAccess: { ...dataAccess, basicList: false, advancedList: false, basicRead: false, advancedRead: false },
      requestSchemas: { advancedList: validator, advancedRead: validator, advancedReadFilter: validator },
      decorate,
    });
    const entries: Array<{ method: Method; path: string; body?: unknown }> = [
      { method: 'get', path: '?limit=0' },
      { method: 'get', path: '/apple' },
      { method: 'post', path: '/__query', body: { select: true } },
      { method: 'post', path: '/__query/apple', body: { select: true } },
      { method: 'post', path: '/__query/__filter', body: { select: true } },
      { method: 'post', path: '/__query', body: {} },
      { method: 'post', path: '/__query/apple', body: {} },
      { method: 'post', path: '/__query/__filter', body: {} },
    ];
    for (const { method, path, body } of entries) await expectEntry(fixture, method, path, body, false);
    expect(workCounts(fixture)).toEqual({ dispatch: 0, policy: 0, persistence: 0 });
    expect(fixture.dispatchSpies).toHaveLength(entries.length);
    expect(validator).not.toHaveBeenCalled();
    expect(decorate).not.toHaveBeenCalled();
  });

  it.each(pairs)('HEAD uses only the basic $access guard in both directions', async (pair) => {
    const fixture = createDataFixture({
      operationAccess: { ...dataAccess, [pair.basic]: false, [pair.advanced]: true },
    });
    const suffix = pair.access === 'list' ? '' : '/apple';
    await expectEntry(fixture, 'head', suffix, undefined, false);
    await exerciseDataPair(fixture, pair.access, 'advanced', true);
    fixture.router.setOption('operationAccess', { ...dataAccess, [pair.basic]: true, [pair.advanced]: false });
    const response = await expectEntry(fixture, 'head', suffix, undefined, true);
    expect(response.text ?? '').toBe('');
    await exerciseDataPair(fixture, pair.access, 'advanced', false);
  });

  it.each(pairs)('retains custom data id/query segments for the $access pair', async (pair) => {
    const fixture = createDataFixture({
      basePath: '/custom-data',
      idParam: 'recordId',
      queryRouteSegment: 'search',
      operationAccess: { ...dataAccess, [pair.basic]: false },
    });
    await exerciseDataPair(fixture, pair.access, 'basic', false);
    await exerciseDataPair(fixture, pair.access, 'advanced', true);
    fixture.router.set('operationAccess', { ...dataAccess, [pair.advanced]: false });
    await exerciseDataPair(fixture, pair.access, 'basic', true);
    await exerciseDataPair(fixture, pair.access, 'advanced', false);
    expect(fixture.router.router.getEndpoints()).toContainEqual({ method: 'GET', path: '/custom-data/:recordId' });
    expect(fixture.router.router.getEndpoints()).toContainEqual({
      method: 'POST',
      path: '/custom-data/search/:recordId',
    });
    expect(fixture.router.router.getEndpoints()).toContainEqual({
      method: 'POST',
      path: '/custom-data/search/__filter',
    });
  });

  it.each(pairs)('observes live data property/dotted setters and undefined inheritance for $access', async (pair) => {
    const fixture = createDataFixture({ operationAccess: { ...dataAccess, [pair.basic]: false } });
    const { router, api, dataName } = fixture;
    const snapshot = router.options.operationAccess;
    const endpoints = router.router.getEndpoints();
    await exerciseDataPair(fixture, pair.access, 'basic', false);
    router.operationAccess(pair.basic, true);
    await exerciseDataPair(fixture, pair.access, 'basic', true);
    router.set(`operationAccess.${pair.advanced}`, false);
    await exerciseDataPair(fixture, pair.access, 'advanced', false);
    router.setOption(`operationAccess.${pair.basic}`, false);
    await exerciseDataPair(fixture, pair.access, 'basic', false);
    api.runtime.setDataOption(dataName, `operationAccess.${pair.advanced}`, true);
    await exerciseDataPair(fixture, pair.access, 'advanced', true);
    router.setOption(`operationAccess.${pair.basic}`, undefined);
    await exerciseDataPair(fixture, pair.access, 'basic', true);

    router.set({ operationAccess: { [pair.advanced]: true } });
    expect(api.runtime.getDataOptions(dataName).operationAccess).toEqual({ [pair.advanced]: true });
    await exerciseDataPair(fixture, pair.access, 'basic', false);
    await exerciseDataPair(fixture, pair.access, 'advanced', true);
    router.operationAccess({ ...dataAccess, [pair.advanced]: false });
    await exerciseDataPair(fixture, pair.access, 'basic', true);
    await exerciseDataPair(fixture, pair.access, 'advanced', false);
    expect(router.options.operationAccess).toBe(snapshot);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(snapshot).toEqual({ ...dataAccess, [pair.basic]: false });
    expect(router.router.getEndpoints()).toEqual(endpoints);
  });

  it('keeps same-name data runtimes independent without inheriting model defaults', async () => {
    const apiA = createAccessRuntime();
    const apiB = createAccessRuntime();
    apiA.setDefaultModelOptions({
      operationAccess: { list: false, read: false, basicRead: true, advancedList: false },
    });
    apiB.setDefaultModelOptions({
      operationAccess: { list: false, read: false, advancedRead: true, basicList: false },
    });
    const name = `Oav04SharedData${++counter}`;
    const a = createDataFixture({ operationAccess: { ...dataAccess, basicRead: false } }, apiA, name);
    const b = createDataFixture({ operationAccess: { ...dataAccess, advancedRead: false } }, apiB, name);
    for (let index = 0; index < 2; index++) {
      await exerciseDataPair(a, 'read', 'basic', false);
      await exerciseDataPair(b, 'read', 'basic', true);
      await exerciseDataPair(a, 'read', 'advanced', true);
      await exerciseDataPair(b, 'read', 'advanced', false);
    }
    await exerciseDataPair(a, 'list', 'advanced', true);
    await exerciseDataPair(b, 'list', 'basic', true);
    apiA.runtime.setDataOption(name, 'operationAccess.basicRead', true);
    await exerciseDataPair(a, 'read', 'basic', true);
    await exerciseDataPair(b, 'read', 'advanced', false);
  });

  it('keeps all five denied data endpoints in getEndpoints and served OpenAPI after live updates', async () => {
    const fixture = createDataFixture({
      basePath: '/registered-data',
      idParam: 'recordId',
      queryRouteSegment: 'search',
      operationAccess: { ...dataAccess, basicList: false, advancedList: false, basicRead: false, advancedRead: false },
    });
    fixture.app.use(fixture.api.createOpenApiRouter({ title: 'OAV-04 data routes', version: '1.0.0' }));
    const endpoints = fixture.router.router.getEndpoints();
    const routes = [
      { method: 'get', path: '' },
      { method: 'post', path: '/search' },
      { method: 'get', path: '/:recordId' },
      { method: 'post', path: '/search/:recordId' },
      { method: 'post', path: '/search/__filter' },
    ];
    const spec = await request(fixture.app).get('/openapi.json').expect(200);
    expect(endpoints).toHaveLength(routes.length);
    for (const { method, path } of routes) {
      expect(endpoints).toContainEqual({ method: method.toUpperCase(), path: `${fixture.basePath}${path || '/'}` });
      const openApiPath = `${fixture.basePath}${path}`.replace(/:([^/]+)/g, '{$1}');
      expect(spec.body.paths[openApiPath][method].responses[401]).toBeDefined();
    }
    await exerciseDataPair(fixture, 'read', 'advanced', false);
    fixture.router.operationAccess(dataAccess);
    await exerciseDataPair(fixture, 'read', 'advanced', true);
    expect(fixture.router.router.getEndpoints()).toEqual(endpoints);
    const updatedSpec = await request(fixture.app).get('/openapi.json').expect(200);
    expect(updatedSpec.body.paths).toEqual(spec.body.paths);
  });

  it.each(pairs)(
    'advanced data $access keeps base row/field/decorate policy despite a denied base entry',
    async (pair) => {
      const listFilter = vi.fn(() => ({ public: true }));
      const readFilter = vi.fn(() => ({ public: true }));
      const wrongPolicy = vi.fn(() => {
        throw new Error('Route variant reached a data-policy hook');
      });
      const listDecorate = vi.fn((row, _permissions, context) => {
        expect(context.operation).toBe('list');
        return row;
      });
      const readDecorate = vi.fn((row, _permissions, context) => {
        expect(context.operation).toBe('read');
        return row;
      });
      const fixture = createDataFixture({
        operationAccess: { ...dataAccess, [pair.access]: false, [pair.advanced]: true },
        baseFilter: {
          list: listFilter,
          read: readFilter,
          basicList: wrongPolicy,
          advancedList: wrongPolicy,
          basicRead: wrongPolicy,
          advancedRead: wrongPolicy,
        },
        decorate: {
          list: listDecorate,
          read: readDecorate,
          basicList: wrongPolicy,
          advancedList: wrongPolicy,
          basicRead: wrongPolicy,
          advancedRead: wrongPolicy,
        },
      });
      await exerciseDataPair(fixture, pair.access, 'advanced', true);
      expect(pair.access === 'list' ? listFilter : readFilter).toHaveBeenCalledTimes(pair.access === 'list' ? 1 : 2);
      expect(pair.access === 'list' ? listDecorate : readDecorate).toHaveBeenCalledTimes(
        pair.access === 'list' ? 1 : 2,
      );
      expect(pair.access === 'list' ? readFilter : listFilter).not.toHaveBeenCalled();
      expect(wrongPolicy).not.toHaveBeenCalled();
    },
  );

  it.each(pairs)('an allowed advanced data $access retains ordinary 400/403 policy failures', async (pair) => {
    const fixture = createDataFixture({
      operationAccess: { ...dataAccess, [pair.access]: false, [pair.advanced]: true },
      baseFilter: { [pair.access]: () => false },
    });
    const paths = pair.access === 'list' ? ['/__query'] : ['/__query/apple', '/__query/__filter'];
    for (const path of paths) {
      const forbidden = await send(fixture, 'post', path, {}).expect(403);
      expect(forbidden.body).toMatchObject({ status: 403, title: 'Forbidden' });
      await send(fixture, 'post', path, { select: true }).expect(400);
    }
  });
});

describe('OAV-04 subdocument list/read routes', () => {
  useMongoTestDatabase();

  it.each(pairs)('inherits the field base-only $access rule on both variants', async ({ access }) => {
    const fixture = await createSubFixture();
    await exerciseSubPair(fixture, access, 'basic', true);
    await exerciseSubPair(fixture, access, 'advanced', true);
  });

  it.each(pairs)('inherits a denied field base-only $access rule on both variants', async ({ access }) => {
    const fixture = await createSubFixture({ operationAccess: withSubAccess({ ...subAccess, [access]: false }) });
    await exerciseSubPair(fixture, access, 'basic', false);
    await exerciseSubPair(fixture, access, 'advanced', false);
  });

  for (const variant of ['basic', 'advanced'] as const) {
    it.each(pairs)(`denies only the ${variant} field $access endpoint over an allowed base`, async (pair) => {
      const fixture = await createSubFixture({
        operationAccess: withSubAccess({ ...subAccess, [pair[variant]]: false }),
      });
      await exerciseSubPair(fixture, pair.access, 'basic', variant !== 'basic');
      await exerciseSubPair(fixture, pair.access, 'advanced', variant !== 'advanced');
    });

    it.each(pairs)(`allows only the ${variant} field $access endpoint over a denied base`, async (pair) => {
      const fixture = await createSubFixture({
        operationAccess: withSubAccess({ ...subAccess, [pair.access]: false, [pair[variant]]: true }),
      });
      await exerciseSubPair(fixture, pair.access, 'basic', variant === 'basic');
      await exerciseSubPair(fixture, pair.access, 'advanced', variant === 'advanced');
    });

    it.each(pairs)(`allows a ${variant}-only field $access rule with no base grant`, async (pair) => {
      const fixture = await createSubFixture({ operationAccess: withSubAccess({ [pair[variant]]: true }) });
      await exerciseSubPair(fixture, pair.access, 'basic', variant === 'basic');
      await exerciseSubPair(fixture, pair.access, 'advanced', variant === 'advanced');
    });
  }

  it.each(pairs)('field $access base rules outrank conflicting general basic/advanced rules', async (pair) => {
    const fixture = await createSubFixture({
      operationAccess: {
        ...parentAccess,
        [pair.basic]: false,
        [pair.advanced]: false,
        subs: { items: subAccess },
      },
    });
    await exerciseSubPair(fixture, pair.access, 'basic', true);
    await exerciseSubPair(fixture, pair.access, 'advanced', true);
    fixture.router.operationAccess({
      ...parentAccess,
      [pair.basic]: true,
      [pair.advanced]: true,
      subs: { items: { ...subAccess, [pair.access]: false } },
    });
    await exerciseSubPair(fixture, pair.access, 'basic', false);
    await exerciseSubPair(fixture, pair.access, 'advanced', false);
  });

  it.each(pairs)('a field exact $access variant precedes its field base and top variants', async (pair) => {
    const selected = vi.fn<GuardHook>(async function (permissions) {
      expect(this.params.subId ?? this.params.id).toBeDefined();
      expect(this.macl?.getPermissions()).toBe(permissions);
      return true;
    });
    const fieldBase = vi.fn<GuardHook>(() => {
      throw new Error('Field base must not run for an exact variant');
    });
    const topVariant = vi.fn<GuardHook>(() => {
      throw new Error('General variant must not run for a defined field');
    });
    const fixture = await createSubFixture({
      operationAccess: {
        ...parentAccess,
        [pair.basic]: topVariant,
        [pair.advanced]: topVariant,
        subs: { items: { ...subAccess, [pair.access]: fieldBase, [pair.basic]: selected, [pair.advanced]: selected } },
      },
    });
    await exerciseSubPair(fixture, pair.access, 'basic', true);
    await exerciseSubPair(fixture, pair.access, 'advanced', true);
    expect(selected).toHaveBeenCalledTimes(2);
    expect(fieldBase).not.toHaveBeenCalled();
    expect(topVariant).not.toHaveBeenCalled();
  });

  it.each(pairs)('defined field scalars close $access before general transport rules', async (pair) => {
    const fixture = await createSubFixture({
      operationAccess: {
        ...parentAccess,
        [pair.basic]: false,
        [pair.advanced]: false,
        subs: { items: true },
      },
    });
    await exerciseSubPair(fixture, pair.access, 'basic', true);
    await exerciseSubPair(fixture, pair.access, 'advanced', true);
    fixture.router.operationAccess({
      ...parentAccess,
      [pair.basic]: true,
      [pair.advanced]: true,
      subs: { items: false },
    });
    await exerciseSubPair(fixture, pair.access, 'basic', false);
    await exerciseSubPair(fixture, pair.access, 'advanced', false);
  });

  it.each(pairs)('a defined field object cannot inherit its omitted $access from general allows', async (pair) => {
    const fixture = await createSubFixture({
      operationAccess: {
        ...parentAccess,
        basicList: true,
        advancedList: true,
        basicRead: true,
        advancedRead: true,
        subs: { items: { [pair.access === 'list' ? 'read' : 'list']: true } },
      },
    });
    await exerciseSubPair(fixture, pair.access, 'basic', false);
    await exerciseSubPair(fixture, pair.access, 'advanced', false);
    fixture.router.operationAccess('subs.items', {
      [pair.access]: undefined,
      [pair.basic]: undefined,
      [pair.advanced]: undefined,
      default: true,
    });
    await exerciseSubPair(fixture, pair.access, 'basic', false);
    await exerciseSubPair(fixture, pair.access, 'advanced', false);
  });

  it.each(pairs)(
    'general $access variants apply only to an absent field, then fall back to the top base',
    async (pair) => {
      const fixture = await createSubFixture({
        operationAccess: {
          ...parentAccess,
          [pair.basic]: false,
          [pair.advanced]: true,
          subs: { other: false },
        },
      });
      await exerciseSubPair(fixture, pair.access, 'basic', false);
      await exerciseSubPair(fixture, pair.access, 'advanced', true);
      fixture.router.operationAccess({ ...parentAccess, [pair.access]: false, [pair.basic]: true });
      await exerciseSubPair(fixture, pair.access, 'basic', true);
      await exerciseSubPair(fixture, pair.access, 'advanced', false);
      fixture.router.operationAccess({ ...parentAccess, [pair.basic]: undefined, [pair.advanced]: undefined });
      await exerciseSubPair(fixture, pair.access, 'basic', true);
      await exerciseSubPair(fixture, pair.access, 'advanced', true);
    },
  );

  it.each([false, 'hook'] as const)('preserves the legacy absent-field subs umbrella: %s', async (rule) => {
    const umbrella = vi.fn<GuardHook>(() => {
      throw new Error('Absent fields must not consult the legacy subs umbrella');
    });
    const fixture = await createSubFixture({
      operationAccess: { ...parentAccess, subs: rule === 'hook' ? umbrella : false },
    });
    for (const pair of pairs) {
      await exerciseSubPair(fixture, pair.access, 'basic', true);
      await exerciseSubPair(fixture, pair.access, 'advanced', true);
    }
    fixture.router.set('operationAccess.basicRead', false);
    await exerciseSubPair(fixture, 'read', 'basic', false);
    await exerciseSubPair(fixture, 'read', 'advanced', true);
    expect(umbrella).not.toHaveBeenCalled();
  });

  it.each(pairs)('HEAD uses only the basic field $access guard in both directions', async (pair) => {
    const fixture = await createSubFixture({
      operationAccess: withSubAccess({ ...subAccess, [pair.basic]: false, [pair.advanced]: true }),
    });
    const path = `/${fixture.id}/items${pair.access === 'read' ? `/${fixture.subIds[0]}` : ''}`;
    await expectEntry(fixture, 'head', path, undefined, false);
    await exerciseSubPair(fixture, pair.access, 'advanced', true);
    fixture.router.operationAccess('subs.items', { ...subAccess, [pair.basic]: true, [pair.advanced]: false });
    const response = await expectEntry(fixture, 'head', path, undefined, true);
    expect(response.text ?? '').toBe('');
    await exerciseSubPair(fixture, pair.access, 'advanced', false);
  });

  it.each(pairs)('retains custom parent identifiers/id/query segments for field $access', async (pair) => {
    const fixture = await createSubFixture({
      basePath: '/custom-sub',
      idParam: 'recordId',
      idField: 'key',
      queryRouteSegment: 'search',
      operationAccess: withSubAccess({ ...subAccess, [pair.basic]: false }),
    });
    await exerciseSubPair(fixture, pair.access, 'basic', false);
    await exerciseSubPair(fixture, pair.access, 'advanced', true);
    fixture.router.operationAccess('subs.items', { ...subAccess, [pair.advanced]: false });
    await exerciseSubPair(fixture, pair.access, 'basic', true);
    await exerciseSubPair(fixture, pair.access, 'advanced', false);
    expect(fixture.router.router.getEndpoints()).toContainEqual({
      method: 'GET',
      path: '/custom-sub/:recordId/items/:subId',
    });
    expect(fixture.router.router.getEndpoints()).toContainEqual({
      method: 'POST',
      path: '/custom-sub/:recordId/items/search',
    });
    expect(fixture.router.router.getEndpoints()).toContainEqual({
      method: 'POST',
      path: '/custom-sub/:recordId/items/:subId/search',
    });
  });

  it.each(pairs)('observes live nested/typed/runtime setters and immutable field $access snapshots', async (pair) => {
    const fixture = await createSubFixture({ operationAccess: withSubAccess({ ...subAccess, [pair.basic]: false }) });
    const { router, api, modelName } = fixture;
    const snapshot = router.options.operationAccess;
    const endpoints = router.router.getEndpoints();
    await exerciseSubPair(fixture, pair.access, 'basic', false);
    router.operationAccess(`subs.items.${pair.basic}`, true);
    await exerciseSubPair(fixture, pair.access, 'basic', true);
    router.operationAccess(`subs.items.${pair.advanced}`, false);
    await exerciseSubPair(fixture, pair.access, 'advanced', false);
    router.set('operationAccess.subs', { items: { ...subAccess, [pair.basic]: false, [pair.advanced]: true } });
    await exerciseSubPair(fixture, pair.access, 'basic', false);
    await exerciseSubPair(fixture, pair.access, 'advanced', true);
    router.setOption('operationAccess.subs', {
      items: { ...subAccess, [pair.basic]: undefined, [pair.advanced]: false },
    });
    await exerciseSubPair(fixture, pair.access, 'basic', true);
    await exerciseSubPair(fixture, pair.access, 'advanced', false);
    api.setModelOption(modelName, 'operationAccess.subs', {
      items: { ...subAccess, [pair.basic]: false, [pair.advanced]: true },
    });
    await exerciseSubPair(fixture, pair.access, 'basic', false);
    await exerciseSubPair(fixture, pair.access, 'advanced', true);

    router.set({ operationAccess: { [pair.advanced]: true } });
    expect(api.getModelOptions(modelName).operationAccess).toEqual({ [pair.advanced]: true });
    await exerciseSubPair(fixture, pair.access, 'basic', false);
    await exerciseSubPair(fixture, pair.access, 'advanced', true);
    router.set(`operationAccess.${pair.basic}`, true);
    router.setOption(`operationAccess.${pair.advanced}`, false);
    await exerciseSubPair(fixture, pair.access, 'basic', true);
    await exerciseSubPair(fixture, pair.access, 'advanced', false);
    expect(router.options.operationAccess).toBe(snapshot);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(snapshot).toEqual(withSubAccess({ ...subAccess, [pair.basic]: false }));
    expect(router.router.getEndpoints()).toEqual(endpoints);
  });

  it.each(['create', 'single', 'bulk', 'delete'] as const)(
    'basicRead denial leaves unpaired subdocument %s and base response visibility intact',
    async (operation) => {
      const fixture = await createSubFixture({
        operationAccess: {
          ...parentAccess,
          basicRead: false,
          basicList: false,
          advancedList: false,
          subs: { items: { ...subAccess, basicRead: false, basicList: false, advancedList: false } },
        },
      });
      await exerciseSubPair(fixture, 'read', 'basic', false);
      await exerciseSubPair(fixture, 'read', 'advanced', true);
      const path = `/${fixture.id}/items`;
      if (operation === 'create') {
        const response = await expectEntry(
          fixture,
          'post',
          path,
          [
            { label: 'new-visible', value: 9, listed: true, readable: true, privateNote: 'client-note' },
            { label: 'new-hidden', value: 10, listed: true, readable: false },
          ],
          true,
          201,
        );
        expect(response.body).toEqual([
          { _id: fixture.subIds[0], label: 'visible', value: 1 },
          { _id: expect.any(String), label: 'new-visible', value: 9 },
        ]);
        const stored = await fixture.reload();
        expect(stored!.items).toHaveLength(6);
        expect(stored!.items[4]).toMatchObject({ label: 'new-visible', value: 9 });
        expect(stored!.items[4]).not.toHaveProperty('privateNote');
        expect(stored!.items[5]).toMatchObject({ label: 'new-hidden', value: 10 });
      } else if (operation === 'delete') {
        const response = await expectEntry(fixture, 'delete', `${path}/${fixture.subIds[2]}`, undefined, true);
        expect(response.body).toBe(fixture.subIds[2]);
        expect((await fixture.reload())!.items.map((item) => String(item._id))).toEqual([
          fixture.subIds[0],
          fixture.subIds[1],
          fixture.subIds[3],
        ]);
      } else {
        const data =
          operation === 'single'
            ? { value: 9, privateNote: 'client-note' }
            : [
                { _id: fixture.subIds[2], value: 10 },
                { _id: fixture.subIds[1], value: 9, privateNote: 'client-note' },
              ];
        const response = await expectEntry(
          fixture,
          'patch',
          `${path}${operation === 'single' ? `/${fixture.subIds[1]}` : ''}`,
          data,
          true,
        );
        const visible = { _id: fixture.subIds[1], label: 'list-hidden', value: 9 };
        expect(response.body).toEqual(operation === 'single' ? visible : [visible]);
        const stored = await fixture.reload();
        expect(stored!.items[1]).toMatchObject({ value: 9, privateNote: 'stored-note' });
        expect(stored!.items[2].value).toBe(operation === 'bulk' ? 10 : 3);
        expect(stored!.items[0].value).toBe(1);
      }
    },
  );

  it.each(pairs)('advanced field $access keeps base parent/sub row and selection policy', async (pair) => {
    const parentRead = vi.fn(() => ({ tenant: 'allowed' }));
    const fieldList = vi.fn(() => ({ listed: true }));
    const fieldRead = vi.fn(() => ({ readable: true }));
    const wrongPolicy = vi.fn(() => {
      throw new Error('A route variant reached a subdocument data-policy hook');
    });
    const fixture = await createSubFixture({
      operationAccess: withSubAccess({ ...subAccess, [pair.access]: false, [pair.advanced]: true }),
      baseFilter: {
        read: parentRead,
        subs: {
          items: {
            list: fieldList,
            read: fieldRead,
            basicList: wrongPolicy,
            advancedList: wrongPolicy,
            basicRead: wrongPolicy,
            advancedRead: wrongPolicy,
          },
        },
      } as ModelRouterOptions<Parent>['baseFilter'],
    });
    await exerciseSubPair(fixture, pair.access, 'advanced', true);
    expect(parentRead).toHaveBeenCalledTimes(1);
    expect(pair.access === 'list' ? fieldList : fieldRead).toHaveBeenCalledTimes(1);
    expect(pair.access === 'list' ? fieldRead : fieldList).not.toHaveBeenCalled();
    const accesses = fixture.policySpies.flatMap((spy) => spy.mock.calls.map((call) => call[1]));
    expect(accesses).toContain(`subs.items.${pair.access}`);
    expect(accesses).toContain(pair.access);
    expect(accesses.some((access) => /basic|advanced/.test(String(access)))).toBe(false);
    expect(wrongPolicy).not.toHaveBeenCalled();
  });

  it.each(pairs)('allowed advanced field $access retains validation/row-policy failure statuses', async (pair) => {
    const fixture = await createSubFixture({
      operationAccess: withSubAccess({ ...subAccess, [pair.access]: false, [pair.advanced]: true }),
      baseFilter: {
        read: () => ({}),
        subs: { items: { [pair.access]: () => false } },
      } as ModelRouterOptions<Parent>['baseFilter'],
    });
    const path = `/${fixture.id}/items${pair.access === 'read' ? `/${fixture.subIds[0]}` : ''}/__query`;
    await send(fixture, 'post', path, {}).expect(403);
    const before = workCounts(fixture);
    await send(fixture, 'post', path, { fields: ['label'] }).expect(400);
    expect(workCounts(fixture)).toEqual(before);
    fixture.router.baseFilter({ read: () => ({ tenant: 'absent' }) });
    await send(fixture, 'post', path, {}).expect(404);
  });
});

describe('OAV-04 database-free subdocument entry/discovery boundaries', () => {
  it('denies all four paired subdocument entries before custom validation, service, or database dispatch', async () => {
    const validator = vi.fn(() => ({ success: false as const, issues: [{ message: 'Must not reach validation' }] }));
    const fixture = createSubRoutesFixture(
      {
        operationAccess: withSubAccess({
          ...subAccess,
          basicList: false,
          advancedList: false,
          basicRead: false,
          advancedRead: false,
        }),
        requestSchemas: { subList: validator, subRead: validator },
      },
      mongoose.createConnection(),
    );
    const id = String(new mongoose.Types.ObjectId());
    const subId = String(new mongoose.Types.ObjectId());
    const paths = [`/${id}/items`, `/${id}/items/${subId}`];
    for (const path of paths) {
      await expectEntry(fixture, 'get', path, undefined, false);
      await expectEntry(fixture, 'post', `${path}/__query`, { fields: ['label'] }, false);
      await expectEntry(fixture, 'post', `${path}/__query`, {}, false);
    }
    expect(fixture.dispatchSpies).toHaveLength(6);
    expect(workCounts(fixture)).toEqual({ dispatch: 0, policy: 0, persistence: 0 });
    expect(validator).not.toHaveBeenCalled();
  });

  it('denied unpaired subdocument base mutation rules still precede validation and persistence', async () => {
    const validator = vi.fn(() => ({ success: false as const, issues: [{ message: 'Must not reach validation' }] }));
    const fixture = createSubRoutesFixture(
      {
        operationAccess: withSubAccess({
          ...subAccess,
          create: false,
          update: false,
          delete: false,
          basicList: true,
          advancedList: true,
          basicRead: true,
          advancedRead: true,
        }),
        requestSchemas: { subCreate: validator, subUpdate: validator, subBulkUpdate: validator },
      },
      mongoose.createConnection(),
    );
    const path = '/parent/items';
    await expectEntry(fixture, 'post', path, [1], false);
    await expectEntry(fixture, 'patch', path, [1], false);
    await expectEntry(fixture, 'patch', `${path}/child`, [1], false);
    await expectEntry(fixture, 'delete', `${path}/child`, undefined, false);
    expect(workCounts(fixture)).toEqual({ dispatch: 0, policy: 0, persistence: 0 });
    expect(validator).not.toHaveBeenCalled();
  });

  it('keeps all eight denied subdocument endpoints in getEndpoints and served OpenAPI after live updates', async () => {
    const fixture = createSubRoutesFixture(
      {
        basePath: '/registered-sub',
        idParam: 'recordId',
        queryRouteSegment: 'search',
        operationAccess: withSubAccess({
          ...subAccess,
          basicList: false,
          advancedList: false,
          basicRead: false,
          advancedRead: false,
          create: false,
          update: false,
          delete: false,
        }),
      },
      mongoose.createConnection(),
    );
    fixture.app.use(fixture.api.createOpenApiRouter({ title: 'OAV-04 subdocument routes', version: '1.0.0' }));
    const routes = [
      { method: 'get', path: '/:recordId/items' },
      { method: 'post', path: '/:recordId/items/search' },
      { method: 'get', path: '/:recordId/items/:subId' },
      { method: 'post', path: '/:recordId/items/:subId/search' },
      { method: 'post', path: '/:recordId/items' },
      { method: 'patch', path: '/:recordId/items' },
      { method: 'patch', path: '/:recordId/items/:subId' },
      { method: 'delete', path: '/:recordId/items/:subId' },
    ];
    const endpoints = fixture.router.router.getEndpoints();
    const spec = await request(fixture.app).get('/openapi.json').expect(200);
    expect(endpoints.filter(({ path }) => path.includes('/items'))).toHaveLength(routes.length);
    for (const { method, path } of routes) {
      expect(endpoints).toContainEqual({ method: method.toUpperCase(), path: `${fixture.basePath}${path}` });
      const openApiPath = `${fixture.basePath}${path}`.replace(/:([^/]+)/g, '{$1}');
      expect(spec.body.paths[openApiPath][method].responses[401]).toBeDefined();
    }
    await expectEntry(fixture, 'get', '/parent/items/child', undefined, false);
    fixture.router.operationAccess('subs.items', subAccess);
    expect(fixture.router.router.getEndpoints()).toEqual(endpoints);
    const updatedSpec = await request(fixture.app).get('/openapi.json').expect(200);
    expect(updatedSpec.body.paths).toEqual(spec.body.paths);
  });

  it('discovers variant-guarded subdocument routes from each owning runtime for divergent same-name models', async () => {
    const name = `Oav04Discovery${++counter}`;
    const fixtures = ['items', 'reviews'].map((sub, index) => {
      const api = createAccessRuntime();
      configureRuntime(api);
      const connection = mongoose.createConnection();
      connections.add(connection);
      const Model = connection.model(
        name,
        new mongoose.Schema({ [sub]: [new mongoose.Schema({ label: String })] }, { bufferCommands: false }),
      );
      const rules = {
        list: true,
        read: true,
        [index === 0 ? 'basicList' : 'advancedList']: false,
        [index === 0 ? 'basicRead' : 'advancedRead']: false,
      };
      const router = api.createRouter(Model, {
        basePath: `/discovered-${sub}`,
        operationAccess: { ...parentAccess, subs: { [sub]: rules } },
      });
      const dispatchSpies: CallSpy[] = [];
      const app = express();
      app.use(express.json());
      app.use(api());
      app.use((req, _res, next) => {
        dispatchSpies.push(vi.spyOn((req as AccessRouterRequest).macl!, 'getPublicService'));
        next();
      });
      app.use(router.routes);
      return {
        api,
        Model,
        router,
        sub,
        app,
        dispatchSpies,
        policySpies: [],
        persistenceSpies: [vi.spyOn(Model, 'findOne')],
        basePath: `/discovered-${sub}`,
      };
    });
    expect(mongoose.models[name]).toBeUndefined();
    for (const [index, fixture] of fixtures.entries()) {
      expect(fixture.api.runtime.getModelInstance(name)).toBe(fixture.Model);
      expect(fixture.api.runtime.getModelSub(name)).toEqual([fixture.sub]);
      const endpoints = fixture.router.router.getEndpoints().filter(({ path }) => path.includes(`/${fixture.sub}`));
      expect(endpoints).toHaveLength(8);
      expect(
        fixture.router.router.getEndpoints().some(({ path }) => path.includes(`/${index === 0 ? 'reviews' : 'items'}`)),
      ).toBe(false);
      expect(
        fixture.api.runtime
          .getOpenApiRoutes()
          .filter(({ operationId }) => operationId?.startsWith(`${name}.${fixture.sub}.`)),
      ).toHaveLength(8);
      for (const path of [`/parent/${fixture.sub}`, `/parent/${fixture.sub}/child`]) {
        await expectEntry(
          fixture,
          index === 0 ? 'get' : 'post',
          `${path}${index === 0 ? '' : '/__query'}`,
          index === 0 ? undefined : {},
          false,
        );
      }
    }
    expect(fixtures[0].Model).not.toBe(fixtures[1].Model);
  });
});
