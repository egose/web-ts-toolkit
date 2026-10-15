import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createAccessRuntime,
  permissionsPlugin,
  type AccessRouterRequest,
  type GlobalOptions,
} from '../dist/index.mjs';
import { DATA_MIDDLEWARE, MIDDLEWARE, PERMISSIONS, PERMISSION_KEYS } from '../dist/advanced.mjs';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

let modelCounter = 0;

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^Arl01Permission/);
});

const nullishResolvers = [
  { label: 'sync null', resolver: () => null },
  { label: 'sync undefined', resolver: () => undefined },
  { label: 'async null', resolver: async () => null },
  { label: 'async undefined', resolver: async () => undefined },
];

const emptyResolvers = [
  ...nullishResolvers,
  { label: 'absent resolver', resolver: undefined },
  { label: 'non-callable null resolver', resolver: null },
  { label: 'non-callable object resolver', resolver: { admin: true } },
];

const createHandoffApp = (resolver: unknown, applicationPermissions?: Record<string, boolean>) => {
  const runtimeA = createAccessRuntime();
  const runtimeB = createAccessRuntime();
  const sourceGrants = { admin: true, sourceOnly: true };
  const resolveA = vi.fn(() => sourceGrants);
  const resolveB =
    typeof resolver === 'function' ? vi.fn(resolver as NonNullable<GlobalOptions['globalPermissions']>) : resolver;
  runtimeA.setGlobalOptions({ requestPermissionField: '_permissions', globalPermissions: resolveA });
  // Non-callable values exercise JavaScript configuration at the same boundary.
  runtimeB.setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: resolveB as GlobalOptions['globalPermissions'],
  });

  const modelName = `Arl01Permission${++modelCounter}`;
  const schema = new mongoose.Schema({ name: String, role: String }, { bufferCommands: false });
  schema.plugin(permissionsPlugin, { modelName });
  const Target = mongoose.model(modelName, schema);
  const modelRouter = runtimeB.createRouter(Target, {
    basePath: '/target',
    operationAccess: { create: 'admin', read: true },
    permissionSchema: { name: true, role: 'admin' },
  });
  const dataName = `${modelName}Data`;
  const dataFilter = vi.fn(() => ({}));
  const dataRouter = runtimeB.createDataRouter(dataName, {
    basePath: '/data',
    idField: 'id',
    data: [{ id: 'one', name: 'protected data' }],
    operationAccess: { list: 'admin' },
    permissionSchema: { id: true, name: true },
    baseFilter: { list: dataFilter },
  });
  const rootRouter = runtimeB.createRouter({ basePath: '/root', operationAccess: true });
  const privateRootRouter = runtimeB.createRouter({ basePath: '/private-root', operationAccess: 'admin' });
  const visits: Array<{ req: AccessRouterRequest; sourceCore: NonNullable<AccessRouterRequest['macl']> }> = [];
  const app = express();
  app.use(express.json());
  if (applicationPermissions !== undefined) {
    app.use((req, _res, next) => {
      (req as AccessRouterRequest)._permissions = applicationPermissions;
      next();
    });
  }
  app.use(runtimeA());
  app.use((req, _res, next) => {
    const aclRequest = req as AccessRouterRequest;
    visits.push({ req: aclRequest, sourceCore: aclRequest.macl! });
    next();
  });
  app.use(modelRouter.routes);
  app.use(dataRouter.routes);
  app.use(rootRouter.routes);
  app.use(privateRootRouter.routes);

  const persistenceSpies = [
    vi.spyOn(Target, 'create'),
    vi.spyOn(Target.prototype, 'save'),
    vi.spyOn(Target, 'find'),
    vi.spyOn(Target, 'findOne'),
    vi.spyOn(Target, 'countDocuments'),
  ];
  const batch = [
    { target: 'model', name: modelName, op: 'create', data: { name: 'root write', role: 'admin' } },
    { target: 'data', name: dataName, op: 'list' },
  ];

  return {
    app,
    runtimeA,
    runtimeB,
    Target,
    sourceGrants,
    resolveA,
    resolveB,
    visits,
    persistenceSpies,
    dataFilter,
    batch,
  };
};

type HandoffFixture = ReturnType<typeof createHandoffApp>;

const expectNoTargetWork = (fixture: HandoffFixture) => {
  for (const spy of fixture.persistenceSpies) expect(spy).not.toHaveBeenCalled();
  expect(fixture.dataFilter).not.toHaveBeenCalled();
};

const expectEmptyTargetAuthority = (fixture: HandoffFixture, target: 'model' | 'data' | 'root') => {
  const { req, sourceCore } = fixture.visits.at(-1)!;
  expect(req._permissions).toEqual({});
  expect(req._permissions).not.toBe(fixture.sourceGrants);
  expect(req[PERMISSIONS]?.keys).toEqual([]);
  expect(req[PERMISSION_KEYS]).toEqual([]);
  expect(fixture.sourceGrants).toEqual({ admin: true, sourceOnly: true });
  expect(sourceCore.getPermissions().has('admin')).toBe(true);
  if (target === 'data') {
    expect(req.macl).toBe(sourceCore);
    expect(req[MIDDLEWARE]).toBe(fixture.runtimeA.runtime);
  } else {
    expect(req.macl).not.toBe(sourceCore);
    expect(req.macl?.getPermissions().keys).toEqual([]);
    expect(req[MIDDLEWARE]).toBe(fixture.runtimeB.runtime);
  }
  if (target !== 'model') {
    expect(req.dacl).not.toBe(req.macl);
    expect(req.dacl?.getPermissions().keys).toEqual([]);
    expect(req[DATA_MIDDLEWARE]).toBe(fixture.runtimeB.runtime);
  }
};

describe('ARL-01 runtime permission-field handoff', () => {
  describe.each(emptyResolvers)('$label', ({ resolver }) => {
    it('denies model/model creation before target persistence', async () => {
      const fixture = createHandoffApp(resolver);
      await request(fixture.app).post('/target').send({ name: 'blocked write', role: 'admin' }).expect(401);
      expectNoTargetWork(fixture);
      expectEmptyTargetAuthority(fixture, 'model');
      expect(await fixture.Target.collection.countDocuments({})).toBe(0);
    });

    it('denies model/data access while retaining the source model core grants', async () => {
      const fixture = createHandoffApp(resolver);
      await request(fixture.app).get('/data').expect(401);
      expectNoTargetWork(fixture);
      expectEmptyTargetAuthority(fixture, 'data');
    });

    it('denies root model/data targets and the protected root endpoint before target work', async () => {
      const fixture = createHandoffApp(resolver);
      const response = await request(fixture.app).post('/root').send(fixture.batch).expect(200);
      expect(response.body.map((entry: { statusCode: number }) => entry.statusCode)).toEqual([401, 401]);
      expectEmptyTargetAuthority(fixture, 'root');
      // Root initializes separate model and data cores, but resolves the shared field once.
      if (typeof fixture.resolveB === 'function') expect(fixture.resolveB).toHaveBeenCalledTimes(1);

      await request(fixture.app).post('/private-root').send(fixture.batch).expect(401);
      expectEmptyTargetAuthority(fixture, 'root');
      if (typeof fixture.resolveB === 'function') expect(fixture.resolveB).toHaveBeenCalledTimes(2);
      expectNoTargetWork(fixture);
      expect(await fixture.Target.collection.countDocuments({})).toBe(0);
    });
  });

  it.each([
    { label: 'object', resolver: () => ({ admin: true }) },
    { label: 'array', resolver: () => ['admin'] },
    { label: 'string', resolver: () => 'admin' },
  ])('honors runtime B $label grants on model, data and root routes', async ({ resolver }) => {
    const fixture = createHandoffApp(resolver);
    const created = await request(fixture.app)
      .post('/target')
      .send({ name: 'allowed write', role: 'admin' })
      .expect(201);
    expect(created.body).toMatchObject({ name: 'allowed write', role: 'admin' });
    const listed = await request(fixture.app).get('/data').expect(200);
    expect(listed.body.data).toEqual([{ id: 'one', name: 'protected data' }]);
    const batch = await request(fixture.app).post('/root').send(fixture.batch).expect(200);
    expect(batch.body.map((entry: { statusCode: number }) => entry.statusCode)).toEqual([201, 200]);
    expect(await fixture.Target.collection.countDocuments({})).toBe(2);
    expect(fixture.resolveB).toHaveBeenCalledTimes(3);
    for (const { req, sourceCore } of fixture.visits) {
      expect(req._permissions).toEqual({ admin: true });
      expect(req[PERMISSIONS]?.has('sourceOnly')).toBe(false);
      expect(sourceCore.getPermissions().has('sourceOnly')).toBe(true);
    }
  });

  describe.each([
    { label: 'async null', resolver: async () => null },
    { label: 'absent resolver', resolver: undefined },
  ])('application-owned maps with $label', ({ resolver }) => {
    it.each([
      { label: 'granted', permissions: { admin: true, denied: false }, statuses: [201, 200] },
      { label: 'empty', permissions: {}, statuses: [401, 401] },
    ])('preserves the unowned $label map across both runtimes and root cores', async ({ permissions, statuses }) => {
      const fixture = createHandoffApp(resolver, permissions);
      const response = await request(fixture.app).post('/root').send(fixture.batch).expect(200);
      expect(response.body.map((entry: { statusCode: number }) => entry.statusCode)).toEqual(statuses);
      expect(fixture.resolveA).not.toHaveBeenCalled();
      if (typeof fixture.resolveB === 'function') expect(fixture.resolveB).not.toHaveBeenCalled();
      const { req, sourceCore } = fixture.visits[0];
      expect(req._permissions).toBe(permissions);
      for (const core of [sourceCore, req.macl!, req.dacl!]) {
        expect(core.getPermissions().has('admin')).toBe(permissions.admin === true);
        expect(core.getPermissions().has('sourceOnly')).toBe(false);
        expect(core.getPermissions().has('denied')).toBe(false);
      }
      if (!permissions.admin) expectNoTargetWork(fixture);
    });
  });

  it.each(nullishResolvers)(
    'reuses initially empty $label authority across repeated middleware and root cores',
    async ({ resolver }) => {
      const runtime = createAccessRuntime();
      const resolve = vi.fn(resolver);
      runtime.setGlobalOptions({ globalPermissions: resolve });
      runtime.createDataRouter('publicData', {
        basePath: '/public-data',
        data: [{ name: 'public', secret: 'admin only' }],
        operationAccess: { list: true },
        permissionSchema: { name: true, secret: 'admin' },
      });
      const root = runtime.createRouter({ basePath: '/root', operationAccess: true });
      const app = express();
      let firstCore: AccessRouterRequest['macl'];
      let firstField: unknown;
      let observed: AccessRouterRequest;
      app.use(express.json());
      app.use(runtime());
      app.use((req, _res, next) => {
        observed = req as AccessRouterRequest;
        firstCore = observed.macl;
        firstField = observed._permissions;
        next();
      });
      app.use(runtime());
      app.use(root.routes);
      const response = await request(app)
        .post('/root')
        .send([{ target: 'data', name: 'publicData', op: 'list' }])
        .expect(200);
      expect(response.body[0].statusCode).toBe(200);
      expect(response.body[0].result.data).toEqual([{ name: 'public' }]);
      expect(resolve).toHaveBeenCalledTimes(1);
      expect(firstField).toEqual({});
      expect(observed!._permissions).toBe(firstField);
      expect(observed!.macl).toBe(firstCore);
      expect(observed!.dacl).not.toBe(firstCore);
      expect(observed!.macl?.getPermissions().keys).toEqual([]);
      expect(observed!.dacl?.getPermissions().keys).toEqual([]);
    },
  );

  it.each([null, undefined])(
    'awaits async %s before publishing the target core and permission symbols',
    async (value) => {
      const runtimeA = createAccessRuntime();
      const runtimeB = createAccessRuntime();
      runtimeA.setGlobalOptions({ globalPermissions: () => ({ admin: true }) });
      const started = Promise.withResolvers<void>();
      const release = Promise.withResolvers<null | undefined>();
      runtimeB.setGlobalOptions({
        globalPermissions: async function (req) {
          expect(this).toBe(req);
          started.resolve();
          return release.promise;
        },
      });
      const req = {} as AccessRouterRequest;
      const res = {} as express.Response;
      await runtimeA()(req, res, vi.fn());
      const sourceCore = req.macl;
      const sourcePermissions = req[PERMISSIONS];
      const next = vi.fn();
      const transition = runtimeB()(req, res, next);
      await started.promise;
      try {
        expect(next).not.toHaveBeenCalled();
        expect(req.macl).toBe(sourceCore);
        expect(req[MIDDLEWARE]).toBe(runtimeA.runtime);
        expect(req[PERMISSIONS]).toBe(sourcePermissions);
        expect(req[PERMISSION_KEYS]).toEqual(['admin']);
      } finally {
        release.resolve(value);
      }
      await transition;
      expect(next).toHaveBeenCalledTimes(1);
      expect(req.macl).not.toBe(sourceCore);
      expect(req[MIDDLEWARE]).toBe(runtimeB.runtime);
      expect(req._permissions).toEqual({});
      expect(req[PERMISSIONS]?.keys).toEqual([]);
      expect(req[PERMISSION_KEYS]).toEqual([]);
      expect(req.macl?.getPermissions().has('admin')).toBe(false);
      expect(sourceCore?.getPermissions().has('admin')).toBe(true);
    },
  );

  it('does not publish a rejected resolution or mark it reusable, and allows an empty retry', async () => {
    const runtimeA = createAccessRuntime();
    const runtimeB = createAccessRuntime();
    runtimeA.setGlobalOptions({ globalPermissions: () => ({ admin: true }) });
    const failure = new Error('resolver failed');
    const resolve = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce(null);
    runtimeB.setGlobalOptions({ globalPermissions: resolve });
    const req = {} as AccessRouterRequest;
    const res = {} as express.Response;
    await runtimeA()(req, res, vi.fn());
    const sourceCore = req.macl;
    const sourcePermissions = req[PERMISSIONS];
    const middleware = runtimeB();
    const next = vi.fn();
    await expect(middleware(req, res, next)).rejects.toBe(failure);
    expect(next).not.toHaveBeenCalled();
    expect(req.macl).toBe(sourceCore);
    expect(req[PERMISSIONS]).toBe(sourcePermissions);
    expect(req[MIDDLEWARE]).toBe(runtimeA.runtime);
    await middleware(req, res, next);
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.macl?.getPermissions().has('admin')).toBe(false);
    expect(req[MIDDLEWARE]).toBe(runtimeB.runtime);
  });
});
