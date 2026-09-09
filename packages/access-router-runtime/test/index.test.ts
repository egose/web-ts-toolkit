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

  it('snapshots nested auth and structured arrays so original mutation cannot change openUri args', async () => {
    const connection = createFakeConnection('snapshot-nested');
    vi.spyOn(mongoose, 'createConnection').mockReturnValue(connection);
    const auth = { username: 'original', password: 'secret' }; // pragma: allowlist secret
    const readPreferenceTags: Array<Record<string, string>> = [{ dc: 'east' }];
    const compressors = ['zlib'];
    const config: AccessRouterRuntimeConfig = {
      db: {
        url: 'mongodb://127.0.0.1:27017/nested-original',
        options: {
          serverSelectionTimeoutMS: 10,
          auth,
          readPreferenceTags,
          compressors,
        } as unknown as mongoose.ConnectOptions,
      },
    };

    const runtime = createAccessRouterRuntime(config);
    auth.username = 'mutated';
    auth.password = 'mutated'; // pragma: allowlist secret
    readPreferenceTags[0].dc = 'west';
    readPreferenceTags.push({ dc: 'north' });
    compressors.push('snappy');

    await runtime.init();
    await runtime.shutdown();

    expect(connection.openUri).toHaveBeenCalledWith('mongodb://127.0.0.1:27017/nested-original', {
      serverSelectionTimeoutMS: 10,
      auth: { username: 'original', password: 'secret' }, // pragma: allowlist secret
      readPreferenceTags: [{ dc: 'east' }],
      compressors: ['zlib'],
    });
  });

  it('prevents runtime.config mutation from changing captured options and preserves opaque identity', async () => {
    const connection = createFakeConnection('snapshot-opaque');
    vi.spyOn(mongoose, 'createConnection').mockReturnValue(connection);
    class FakePkFactory {
      createPk(): number {
        return 1;
      }
    }
    const pkFactory = new FakePkFactory();
    const hook = (): string => 'hook';
    const startedAt = new Date('2026-01-02T03:04:05.000Z');
    const payload = Buffer.from('opaque');
    const config: AccessRouterRuntimeConfig = {
      db: {
        url: 'mongodb://127.0.0.1:27017/opaque-original',
        options: {
          serverSelectionTimeoutMS: 10,
          auth: { username: 'original', password: 'secret' }, // pragma: allowlist secret
          pkFactory: pkFactory as never,
          hook,
          startedAt,
          payload,
        } as unknown as mongoose.ConnectOptions,
      },
    };

    const runtime = createAccessRouterRuntime(config);
    const publicOptions = (runtime.config.db as unknown as { options: Record<string, unknown> }).options;
    expect(publicOptions.pkFactory).toBe(pkFactory);
    expect(publicOptions.hook).toBe(hook);
    expect(publicOptions.startedAt).toBe(startedAt);
    expect(publicOptions.payload).toBe(payload);
    expect((publicOptions.hook as () => string)()).toBe('hook');
    expect(publicOptions.startedAt).toBeInstanceOf(Date);
    expect(Buffer.isBuffer(publicOptions.payload)).toBe(true);

    expect(() => {
      (publicOptions.auth as Record<string, unknown>).username = 'hacked';
    }).toThrow(TypeError);
    expect(() => {
      (publicOptions.auth as Record<string, unknown>).password = 'hacked'; // pragma: allowlist secret
    }).toThrow(TypeError);

    await runtime.init();
    await runtime.shutdown();

    const openUriOptions = connection.openUri.mock.calls[0][1] as Record<string, unknown>;
    expect(openUriOptions).toMatchObject({ serverSelectionTimeoutMS: 10 });
    expect(openUriOptions.auth).toEqual({ username: 'original', password: 'secret' }); // pragma: allowlist secret
    expect(openUriOptions.pkFactory).toBe(pkFactory);
    expect(openUriOptions.hook).toBe(hook);
    expect(openUriOptions.startedAt).toBe(startedAt);
    expect(openUriOptions.payload).toBe(payload);
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

  it('rolls back partial construction when a later model collides with a pre-existing external model', () => {
    const externalConnection = createFakeConnection('b04-partial', 1);
    const preExistingSchema = new mongoose.Schema({ label: String });
    const preExisting = externalConnection.model('AccessRouterRuntimeB04Existing', preExistingSchema);
    const baselineKeys = Object.keys(externalConnection.models).sort();
    externalConnection.model.mockClear();

    const schemaA = new mongoose.Schema({ title: String });
    const incompatibleB = new mongoose.Schema({ other: String });

    expect(() =>
      createAccessRouterRuntime({
        db: { connection: externalConnection },
        models: [
          { name: 'AccessRouterRuntimeB04ValidA', schema: schemaA, router: { operationAccess: false } },
          { name: 'AccessRouterRuntimeB04Existing', schema: incompatibleB, router: { operationAccess: false } },
        ],
      }),
    ).toThrow(/conflicts with an existing model on the selected Mongoose connection/);

    expect(Object.keys(externalConnection.models).sort()).toEqual(baselineKeys);
    expect(externalConnection.models.AccessRouterRuntimeB04Existing).toBe(preExisting);
    expect(externalConnection.models.AccessRouterRuntimeB04ValidA).toBeUndefined();

    const retry = createAccessRouterRuntime({
      db: { connection: externalConnection },
      models: [
        { name: 'AccessRouterRuntimeB04ValidA', schema: schemaA, router: { operationAccess: false } },
        { name: 'AccessRouterRuntimeB04Existing', schema: preExistingSchema, router: { operationAccess: false } },
      ],
    });

    expect(retry.models.AccessRouterRuntimeB04ValidA).toBeDefined();
    expect(retry.models.AccessRouterRuntimeB04Existing).toBe(preExisting);
    expect(externalConnection.models.AccessRouterRuntimeB04ValidA).toBeDefined();
  });

  it('releases owned models and connections when finalize throws during construction', async () => {
    const baseline = mongoose.connections.length;
    const modelName = 'AccessRouterRuntimeB04OwnedFinalize';
    const rejections: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      rejections.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);

    try {
      expect(() =>
        createAccessRouterRuntime({
          models: [
            { name: modelName, schema: new mongoose.Schema({ title: String }), router: { operationAccess: false } },
          ],
          express: {
            finalize() {
              throw new Error('b04 finalize boom');
            },
          },
        }),
      ).toThrow('b04 finalize boom');

      expect(mongoose.connections.length).toBe(baseline);
      expect(mongoose.connections.some((connection) => connection.models[modelName])).toBe(false);

      await new Promise((resolve) => setImmediate(resolve));
      expect(rejections).toEqual([]);

      const retry = createAccessRouterRuntime({
        models: [
          { name: modelName, schema: new mongoose.Schema({ title: String }), router: { operationAccess: false } },
        ],
      });
      expect(retry.models[modelName]).toBeDefined();
      await retry.shutdown();
      expect(mongoose.connections.length).toBe(baseline);
    } finally {
      process.off('unhandledRejection', onUnhandled);
      for (const connection of [...mongoose.connections]) {
        if (connection.models[modelName]) {
          try {
            await connection.destroy();
          } catch {
            // defensive teardown only; assertions already ran
          }
        }
      }
    }
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

  it('denies an unauthorized custom request through a caller-supplied macl guard', async () => {
    const runtime = createAccessRouterRuntime({
      models: [
        {
          name: 'AccessRouterRuntimeCustomDenied',
          schema: new mongoose.Schema({ name: String }),
          router: {
            basePath: '/api/custom-denied',
            operationAccess: false,
          },
          customRoutes: [
            {
              method: 'get',
              path: '/:id/profile',
              handler: async (req, res) => {
                // ARRT-B12: supported ACL API without casts; custom routes
                // carry no automatic CRUD authorization.
                const allowed: boolean = await req.macl.isAllowed('AccessRouterRuntimeCustomDenied', 'read');
                if (!allowed) {
                  res.status(403).json({ denied: true });
                  return;
                }
                return { ok: true };
              },
            },
          ],
        },
      ],
    });

    await request(runtime.app).get('/api/custom-denied/123/profile').expect(403, { denied: true });
  });

  it('permits an authorized custom request through a caller-supplied macl guard', async () => {
    const runtime = createAccessRouterRuntime({
      models: [
        {
          name: 'AccessRouterRuntimeCustomAllowed',
          schema: new mongoose.Schema({ name: String }),
          router: {
            basePath: '/api/custom-allowed',
            operationAccess: { read: true },
          },
          customRoutes: [
            {
              method: 'get',
              path: '/:id/profile',
              handler: async (req) => {
                // ARRT-B12: supported ACL API without casts; the caller owns
                // the guard decision, not a guessed CRUD mapping.
                const allowed: boolean = await req.macl.isAllowed('AccessRouterRuntimeCustomAllowed', 'read');
                if (!allowed) {
                  throw Object.assign(new Error('forbidden'), { statusCode: 403 });
                }
                const service = req.macl.getPublicService('AccessRouterRuntimeCustomAllowed');
                void service;
                return { ok: true };
              },
            },
          ],
        },
      ],
    });

    await request(runtime.app).get('/api/custom-allowed/123/profile').expect(200, { ok: true });
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
