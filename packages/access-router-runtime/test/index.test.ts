import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAccessRouterRuntime,
  createAccessRouterRuntimeApp,
  defineRuntimeConfig,
  type AccessRouterRuntimeConfig,
} from '../src/index';

type FakeRuntimeConnection = mongoose.Connection & {
  readonly id: string;
  readonly documents: Record<string, unknown[]>;
  openedUrl?: string;
};

function createFakeConnection(id: string, initialReadyState = 0): FakeRuntimeConnection {
  const connection = {
    id,
    readyState: initialReadyState,
    models: {},
    documents: {},
    openUri: vi.fn(async (url: string) => {
      connection.openedUrl = url;
      connection.readyState = 1;
      return connection;
    }),
    close: vi.fn(async () => {
      connection.readyState = 0;
      return connection;
    }),
    deleteModel: vi.fn((name: string) => {
      delete connection.models[name];
      delete connection.documents[name];
      return connection;
    }),
    model: vi.fn((name: string, schema?: mongoose.Schema<unknown>, collection?: string) => {
      const existing = connection.models[name] as mongoose.Model<unknown> | undefined;
      if (existing) {
        return existing;
      }

      connection.documents[name] = [];
      const model = Object.assign(function FakeModel() {}, {
        modelName: name,
        schema,
        collection: { name: collection ?? `${name.toLowerCase()}s` },
        db: connection,
        jsonSchema: () => ({ type: 'object', properties: {} }),
        create: vi.fn(async (doc: Record<string, unknown>) => {
          const saved = { ...doc, _connectionId: id };
          connection.documents[name].push(saved);
          return saved;
        }),
        find: vi.fn(() => connection.documents[name]),
      }) as unknown as mongoose.Model<unknown>;

      connection.models[name] = model;
      return model;
    }),
  } as unknown as FakeRuntimeConnection;

  return connection;
}

describe('access-router-runtime', () => {
  afterEach(async () => {
    mongoose.deleteModel(/AccessRouterRuntime.*/);
    vi.restoreAllMocks();
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  it('builds an express app from model, data, root, and openapi config', async () => {
    const runtime = createAccessRouterRuntime(
      defineRuntimeConfig({
        globalOptions: {
          globalPermissions() {
            return [];
          },
        },
        rootRouter: {
          basePath: '/api/root',
          operationAccess: true,
        },
        models: [
          {
            name: 'AccessRouterRuntimePost',
            schema: new mongoose.Schema({ title: String }),
            router: {
              basePath: '/api/posts',
              operationAccess: { new: true },
              permissionSchema: { title: true },
            },
          },
        ],
        data: [
          {
            name: 'status',
            router: {
              basePath: '/api/status',
              idField: 'id',
              operationAccess: { list: true, read: true },
              data: [{ id: 'ok', label: 'OK' }],
              permissionSchema: { id: true, label: true },
            },
          },
        ],
        openApi: {
          title: 'Runtime API',
          version: '1.0.0',
          jsonPath: '/api/openapi.json',
          docsPath: false,
        },
      }),
    );

    expect(runtime.models.AccessRouterRuntimePost).toBeDefined();

    await request(runtime.app).get('/api/status').expect(200);

    const openApiResponse = await request(runtime.app)
      .get('/api/openapi.json')
      .expect(200)
      .expect('Content-Type', /json/);
    expect(openApiResponse.body.paths['/api/posts/new']).toBeDefined();
    expect(openApiResponse.body.paths['/api/root']).toBeDefined();
  });

  it('uses db config in init and shutdown lifecycle hooks', async () => {
    const connection = createFakeConnection('lifecycle');
    vi.spyOn(mongoose, 'createConnection').mockReturnValue(connection);
    const initHook = vi.fn();
    const shutdownHook = vi.fn();

    const runtime = createAccessRouterRuntime({
      db: {
        url: 'mongodb://127.0.0.1:27017/access-router-runtime-test',
      },
      init: initHook,
      shutdown: shutdownHook,
    });

    await runtime.init();
    await runtime.init();
    expect(connection.openUri).toHaveBeenCalledTimes(1);
    expect(initHook).toHaveBeenCalledTimes(1);

    await runtime.shutdown();
    expect(connection.close).toHaveBeenCalledTimes(1);
    expect(shutdownHook).toHaveBeenCalledTimes(1);
  });

  it('exposes readonly runtime registry snapshots through the public context', () => {
    const runtime = createAccessRouterRuntime({
      models: [
        {
          name: 'AccessRouterRuntimeReadonlyPost',
          schema: new mongoose.Schema({ title: String }),
          router: { operationAccess: false },
        },
      ],
      data: [{ name: 'status', router: { data: [{ id: 'ok' }], idField: 'id' } }],
    });

    expect(Object.isFrozen(runtime.models)).toBe(true);
    expect(Object.isFrozen(runtime.modelRouters)).toBe(true);
    expect(Object.isFrozen(runtime.dataRouters)).toBe(true);
    expect(() => {
      (runtime.models as Record<string, unknown>).Injected = {};
    }).toThrow(TypeError);
    expect(() => {
      (runtime.modelRouters as unknown[]).push(runtime.modelRouters[0]);
    }).toThrow(TypeError);
    expect(runtime.models.AccessRouterRuntimeReadonlyPost).toBeDefined();
    expect(runtime.modelRouters).toHaveLength(1);
    expect(runtime.dataRouters).toHaveLength(1);
  });

  it('snapshots lifecycle config so caller mutation after construction cannot replace DB options or hooks', async () => {
    const connection = createFakeConnection('snapshot');
    vi.spyOn(mongoose, 'createConnection').mockReturnValue(connection);
    const initHook = vi.fn();
    const shutdownHook = vi.fn();
    const mutatedInitHook = vi.fn();
    const mutatedShutdownHook = vi.fn();
    const dbOptions = { serverSelectionTimeoutMS: 10 };
    const config: AccessRouterRuntimeConfig = {
      db: {
        url: 'mongodb://127.0.0.1:27017/original',
        options: dbOptions,
      },
      init: initHook,
      shutdown: shutdownHook,
    };

    const runtime = createAccessRouterRuntime(config);
    config.db = {
      url: 'mongodb://127.0.0.1:27017/mutated',
      options: { serverSelectionTimeoutMS: 99 },
      disconnectOnShutdown: false,
    };
    config.init = mutatedInitHook;
    config.shutdown = mutatedShutdownHook;
    dbOptions.serverSelectionTimeoutMS = 99;

    await runtime.init();
    await runtime.shutdown();

    expect(connection.openUri).toHaveBeenCalledWith('mongodb://127.0.0.1:27017/original', {
      serverSelectionTimeoutMS: 10,
    });
    expect(connection.close).toHaveBeenCalledTimes(1);
    expect(initHook).toHaveBeenCalledTimes(1);
    expect(shutdownHook).toHaveBeenCalledTimes(1);
    expect(mutatedInitHook).not.toHaveBeenCalled();
    expect(mutatedShutdownHook).not.toHaveBeenCalled();
    expect(runtime.config).not.toBe(config);
    expect(Object.isFrozen(runtime.config)).toBe(true);
  });

  it('rejects app-only helper configs with lifecycle requirements before runtime side effects', () => {
    const createConnectionSpy = vi.spyOn(mongoose, 'createConnection');

    expect(() =>
      createAccessRouterRuntimeApp({
        db: { url: 'mongodb://127.0.0.1:27017/app-helper' },
      } as unknown as Parameters<typeof createAccessRouterRuntimeApp>[0]),
    ).toThrow(/lifecycle-free configs/);
    expect(() =>
      createAccessRouterRuntimeApp({ init() {} } as unknown as Parameters<typeof createAccessRouterRuntimeApp>[0]),
    ).toThrow(/lifecycle-free configs/);
    expect(() =>
      createAccessRouterRuntimeApp({ shutdown() {} } as unknown as Parameters<typeof createAccessRouterRuntimeApp>[0]),
    ).toThrow(/lifecycle-free configs/);
    expect(createConnectionSpy).not.toHaveBeenCalled();
  });

  it('keeps URL-backed runtimes on independent connections and closes only the stopped runtime', async () => {
    const connectionA = createFakeConnection('tenant-a');
    const connectionB = createFakeConnection('tenant-b');
    const createConnectionSpy = vi
      .spyOn(mongoose, 'createConnection')
      .mockReturnValueOnce(connectionA)
      .mockReturnValueOnce(connectionB);
    const globalConnectSpy = vi.spyOn(mongoose, 'connect');
    const globalDisconnectSpy = vi.spyOn(mongoose, 'disconnect');

    const createTenantRuntime = (url: string) =>
      createAccessRouterRuntime({
        db: { url },
        models: [
          {
            name: 'AccessRouterRuntimeTenantPost',
            schema: new mongoose.Schema({ title: String }),
            router: { operationAccess: false },
          },
        ],
      });

    const runtimeA = createTenantRuntime('mongodb://127.0.0.1:27017/tenant-a');
    const runtimeB = createTenantRuntime('mongodb://127.0.0.1:27017/tenant-b');

    await runtimeA.init();
    await runtimeB.init();

    await runtimeA.models.AccessRouterRuntimeTenantPost.create({ title: 'A' });
    await runtimeB.models.AccessRouterRuntimeTenantPost.create({ title: 'B' });

    expect(createConnectionSpy).toHaveBeenCalledTimes(2);
    expect(connectionA.openedUrl).toBe('mongodb://127.0.0.1:27017/tenant-a');
    expect(connectionB.openedUrl).toBe('mongodb://127.0.0.1:27017/tenant-b');
    expect(connectionA.documents.AccessRouterRuntimeTenantPost).toEqual([{ title: 'A', _connectionId: 'tenant-a' }]);
    expect(connectionB.documents.AccessRouterRuntimeTenantPost).toEqual([{ title: 'B', _connectionId: 'tenant-b' }]);

    await runtimeA.shutdown();

    expect(connectionA.readyState).toBe(0);
    expect(connectionB.readyState).toBe(1);
    expect(connectionA.close).toHaveBeenCalledTimes(1);
    expect(connectionB.close).not.toHaveBeenCalled();
    await runtimeB.models.AccessRouterRuntimeTenantPost.create({ title: 'B2' });
    expect(connectionB.documents.AccessRouterRuntimeTenantPost).toEqual([
      { title: 'B', _connectionId: 'tenant-b' },
      { title: 'B2', _connectionId: 'tenant-b' },
    ]);
    expect(globalConnectSpy).not.toHaveBeenCalled();
    expect(globalDisconnectSpy).not.toHaveBeenCalled();
  });

  it('leaves externally supplied connections open on shutdown', async () => {
    const externalConnection = createFakeConnection('external', 1);
    const runtime = createAccessRouterRuntime({
      db: { connection: externalConnection },
      models: [
        {
          name: 'AccessRouterRuntimeExternalPost',
          schema: new mongoose.Schema({ title: String }),
          router: { operationAccess: false },
        },
      ],
    });

    await runtime.init();
    await runtime.models.AccessRouterRuntimeExternalPost.create({ title: 'external' });
    await runtime.shutdown();

    expect(externalConnection.readyState).toBe(1);
    expect(externalConnection.openUri).not.toHaveBeenCalled();
    expect(externalConnection.close).not.toHaveBeenCalled();
  });

  it('rejects incompatible existing models with configured runtime-owned database URLs', () => {
    const existingModel = mongoose.model('AccessRouterRuntimeExistingOnGlobal', new mongoose.Schema({ title: String }));
    const createConnectionSpy = vi.spyOn(mongoose, 'createConnection');

    expect(() =>
      createAccessRouterRuntime({
        db: { url: 'mongodb://127.0.0.1:27017/runtime-owned' },
        models: [{ model: existingModel, router: { operationAccess: false } }],
      }),
    ).toThrow(/existing model while db.url is configured/);
    expect(createConnectionSpy).not.toHaveBeenCalled();
  });

  it('opens a configured URL through the owned connection instead of global Mongoose state', async () => {
    const connection = createFakeConnection('owned');
    vi.spyOn(mongoose, 'createConnection').mockReturnValue(connection);
    const globalConnectSpy = vi.spyOn(mongoose, 'connect');

    const runtime = createAccessRouterRuntime({
      db: { url: 'mongodb://127.0.0.1:27017/owned' },
    });

    await runtime.init();

    expect(connection.openUri).toHaveBeenCalledWith('mongodb://127.0.0.1:27017/owned', undefined);
    expect(globalConnectSpy).not.toHaveBeenCalled();
  });

  it('isolates same-name schema models by connection and rejects collisions on the same supplied connection', async () => {
    const connectionA = createFakeConnection('schema-a');
    const connectionB = createFakeConnection('schema-b');
    vi.spyOn(mongoose, 'createConnection').mockReturnValueOnce(connectionA).mockReturnValueOnce(connectionB);

    const schemaA = new mongoose.Schema({ title: String });
    const schemaB = new mongoose.Schema({ label: String });
    const runtimeA = createAccessRouterRuntime({
      models: [{ name: 'AccessRouterRuntimeSharedName', schema: schemaA, router: { operationAccess: false } }],
    });
    const runtimeB = createAccessRouterRuntime({
      models: [{ name: 'AccessRouterRuntimeSharedName', schema: schemaB, router: { operationAccess: false } }],
    });

    expect(runtimeA.models.AccessRouterRuntimeSharedName).not.toBe(runtimeB.models.AccessRouterRuntimeSharedName);
    expect(runtimeA.models.AccessRouterRuntimeSharedName.db).toBe(connectionA);
    expect(runtimeB.models.AccessRouterRuntimeSharedName.db).toBe(connectionB);

    const externalConnection = createFakeConnection('collision', 1);
    createAccessRouterRuntime({
      db: { connection: externalConnection },
      models: [{ name: 'AccessRouterRuntimeCollision', schema: schemaA, router: { operationAccess: false } }],
    });

    expect(() =>
      createAccessRouterRuntime({
        db: { connection: externalConnection },
        models: [{ name: 'AccessRouterRuntimeCollision', schema: schemaB, router: { operationAccess: false } }],
      }),
    ).toThrow(/conflicts with an existing model on the selected Mongoose connection/);
    expect(externalConnection.model).toHaveBeenCalledTimes(1);
  });

  it('cleans runtime-generated models deterministically on shutdown', async () => {
    const externalConnection = createFakeConnection('cleanup', 1);
    const firstRuntime = createAccessRouterRuntime({
      db: { connection: externalConnection },
      models: [
        {
          name: 'AccessRouterRuntimeCleanupPost',
          schema: new mongoose.Schema({ title: String }),
          router: { operationAccess: false },
        },
      ],
    });

    expect(externalConnection.models.AccessRouterRuntimeCleanupPost).toBeDefined();
    await firstRuntime.shutdown();
    expect(externalConnection.models.AccessRouterRuntimeCleanupPost).toBeUndefined();

    const secondRuntime = createAccessRouterRuntime({
      db: { connection: externalConnection },
      models: [
        {
          name: 'AccessRouterRuntimeCleanupPost',
          schema: new mongoose.Schema({ label: String }),
          router: { operationAccess: false },
        },
      ],
    });

    expect(secondRuntime.models.AccessRouterRuntimeCleanupPost).toBeDefined();
  });

  it('rejects invalid model config before registering models or connecting to the database', () => {
    const modelSpy = vi.spyOn(mongoose, 'model');
    const connectSpy = vi.spyOn(mongoose, 'connect');

    expect(() =>
      createAccessRouterRuntime({
        db: {
          url: 'mongodb://127.0.0.1:27017/access-router-runtime-test',
        },
        models: [
          {
            name: 'AccessRouterRuntimeInvalidPost',
            schema: new mongoose.Schema({ title: String }),
            router: {
              operationAccess: true,
            },
          },
          {
            name: 'AccessRouterRuntimeInvalidPost',
            schema: new mongoose.Schema({ title: String }),
            router: {
              operationAccess: true,
            },
          },
        ],
      }),
    ).toThrow(/runtime config.*duplicate model name "AccessRouterRuntimeInvalidPost"/);

    expect(modelSpy).not.toHaveBeenCalled();
    expect(connectSpy).not.toHaveBeenCalled();
  });

  it('rejects ambiguous model definitions and duplicate data names before runtime assembly', () => {
    expect(() =>
      createAccessRouterRuntime({
        models: [
          {
            name: 'AccessRouterRuntimeAmbiguousPost',
            model: mongoose.model('AccessRouterRuntimeAmbiguousPost', new mongoose.Schema({ title: String })),
            schema: new mongoose.Schema({ title: String }),
            router: {},
          },
        ],
      } as unknown as AccessRouterRuntimeConfig),
    ).toThrow(/runtime config.*models\[0\].*exactly one/);

    expect(() =>
      createAccessRouterRuntime({
        data: [
          { name: 'status', router: {} },
          { name: 'status', router: {} },
        ],
      }),
    ).toThrow(/runtime config.*duplicate data name "status"/);
  });

  it('mounts model custom routes that return JSON values', async () => {
    const runtime = createAccessRouterRuntime({
      models: [
        {
          name: 'AccessRouterRuntimeUser',
          schema: new mongoose.Schema({ name: String }),
          router: {
            basePath: '/api/users',
            operationAccess: false,
          },
          customRoutes: [
            {
              method: 'get',
              path: '/:id/custom',
              handler: async (req) => ({ id: req.params.id, ok: true }),
            },
          ],
        },
      ],
    });

    await request(runtime.app).get('/api/users/123/custom').expect(200, { id: '123', ok: true });
  });

  it('mounts model custom routes that use the response object directly', async () => {
    const runtime = createAccessRouterRuntime({
      models: [
        {
          name: 'AccessRouterRuntimeMember',
          schema: new mongoose.Schema({ name: String }),
          router: {
            basePath: '/api/members',
            operationAccess: false,
          },
          customRoutes: [
            {
              method: 'post',
              path: '/status',
              handler: (_req, res) => {
                res.status(201).json({ created: true });
              },
            },
          ],
        },
      ],
    });

    await request(runtime.app).post('/api/members/status').expect(201, { created: true });
  });

  it('creates a serverless handler that preserves caller init hooks', async () => {
    const runtimeInit = vi.fn();
    const userInit = vi.fn();

    const config: AccessRouterRuntimeConfig = {
      init: runtimeInit,
      express: {
        finalize(app) {
          app.get('/ok', (_req, res) => {
            res.json({ ok: true });
          });
        },
      },
    };

    const runtime = createAccessRouterRuntime(config);
    const handler = runtime.createServerlessHandler({ init: userInit });

    await handler(
      {
        httpMethod: 'GET',
        path: '/ok',
        headers: {},
      },
      {},
    );

    expect(runtimeInit).toHaveBeenCalledTimes(1);
    expect(userInit).toHaveBeenCalledTimes(1);
  });
});
