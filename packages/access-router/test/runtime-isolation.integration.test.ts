import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import acl, { createAccessRuntime, permissionsPlugin } from '../dist/index.mjs';

let primaryMongo: MongoMemoryServer | null = null;

afterAll(async () => {
  if (primaryMongo) {
    await primaryMongo.stop();
  }
}, 120_000);

const ensurePrimaryConnection = async () => {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  primaryMongo = await MongoMemoryServer.create();
  await mongoose.connect(primaryMongo.getUri(), { dbName: 'acl-iso' });
  return mongoose.connection;
};

const createIsolatedConnection = async (dbName: string) => {
  if (!primaryMongo) primaryMongo = await MongoMemoryServer.create();
  const baseUri = primaryMongo.getUri().replace(/\/$/, '');
  const conn = await mongoose.createConnection(`${baseUri}/${dbName}`).asPromise();
  return conn;
};

let modelCounter = 0;

const resetGlobalOptions = () => {
  acl.setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => ({}),
  });
};

afterEach(() => {
  resetGlobalOptions();
});

const defineUserModel = (modelName: string, connection: mongoose.Connection) => {
  const schema = new mongoose.Schema({ name: String, role: String, public: Boolean });
  schema.plugin(permissionsPlugin, { modelName });
  return connection.model(modelName, schema);
};

const buildRouterApp = (runtime: ReturnType<typeof createAccessRuntime>, userModel: mongoose.Model<unknown>) => {
  const router = runtime.createRouter(userModel, {
    basePath: '/users',
    operationAccess: {
      list: true,
      create: true,
      read: true,
      update: true,
      delete: true,
    },
    permissionSchema: {
      name: true,
      role: true,
      public: true,
    },
  });

  const app = express();
  app.use(express.json());
  app.use(router.routes);
  return app;
};

describe('AR-11 runtime model ownership isolation', () => {
  it('preserves the supplied mongoose.Model instance attached to a non-default connection', async () => {
    await ensurePrimaryConnection();
    const secondary = await createIsolatedConnection('acl-iso-secondary');

    const runtime = createAccessRuntime();
    runtime.setGlobalOptions({
      requestPermissionField: '_permissions',
      globalPermissions: () => ['isAdmin'],
    });

    const modelName = `AclRuntimeIsolationUser${++modelCounter}`;
    const userModel = defineUserModel(modelName, secondary);
    expect(runtime.runtime.hasModelInstance(modelName)).toBe(false);

    const router = runtime.createRouter(userModel, {
      basePath: '/conn-users',
      operationAccess: {
        list: true,
        create: true,
        read: true,
      },
      permissionSchema: {
        name: true,
        role: true,
        public: true,
      },
    });

    expect(runtime.runtime.hasModelInstance(modelName)).toBe(true);
    expect(runtime.runtime.getModelInstance(modelName)).toBe(userModel);

    const app = express();
    app.use(express.json());
    app.use(router.routes);

    const createResponse = await request(app)
      .post('/conn-users?include_permissions=false')
      .send({ name: 'route-iso-1', role: 'user', public: false })
      .expect(201);

    expect(createResponse.body).toMatchObject({ name: 'route-iso-1' });

    const listResponse = await request(app).get('/conn-users?include_permissions=false').expect(200);
    expect(listResponse.body.data).toHaveLength(1);
    expect(listResponse.body.data[0]).toMatchObject({ name: 'route-iso-1' });

    await secondary.destroy();
  });

  it('supports the same model name in two isolated runtimes on separate connections', async () => {
    await ensurePrimaryConnection();
    const sharedName = `AclRuntimeDualUser${++modelCounter}`;

    const connA = await createIsolatedConnection('acl-dual-a');
    const connB = await createIsolatedConnection('acl-dual-b');

    const runtimeA = createAccessRuntime();
    const runtimeB = createAccessRuntime();

    runtimeA.setGlobalOptions({
      requestPermissionField: '_permissions',
      globalPermissions: () => ['isAdmin'],
    });
    runtimeB.setGlobalOptions({
      requestPermissionField: '_permissions',
      globalPermissions: () => ['observer'],
    });

    const modelA = defineUserModel(sharedName, connA);
    const modelB = defineUserModel(sharedName, connB);

    const appA = buildRouterApp(runtimeA, modelA);
    const appB = buildRouterApp(runtimeB, modelB);

    expect(runtimeA.runtime.getModelInstance(sharedName)).toBe(modelA);
    expect(runtimeB.runtime.getModelInstance(sharedName)).toBe(modelB);

    await request(appA)
      .post('/users?include_permissions=false')
      .send({ name: 'albert', role: 'admin', public: true })
      .expect(201);

    await request(appB)
      .post('/users?include_permissions=false')
      .send({ name: 'beatrice', role: 'admin', public: true })
      .expect(201);

    const listA = await request(appA).get('/users?include_permissions=false').expect(200);
    expect(listA.body.data).toHaveLength(1);
    expect(listA.body.data[0]).toMatchObject({ name: 'albert' });

    const listB = await request(appB).get('/users?include_permissions=false').expect(200);
    expect(listB.body.data).toHaveLength(1);
    expect(listB.body.data[0]).toMatchObject({ name: 'beatrice' });

    await connA.destroy();
    await connB.destroy();
  });

  it('rejects duplicate model name registration with a different mongoose.Model instance on the same runtime', () => {
    const runtime = createAccessRuntime();
    const modelName = `AclRuntimeConflictUser${++modelCounter}`;

    const connA = mongoose.model(`${modelName}A`, new mongoose.Schema({ name: String }));
    const connB = mongoose.model(`${modelName}B`, new mongoose.Schema({ name: String, role: String }));

    runtime.registerModelInstance(modelName, connA);
    expect(runtime.runtime.getModelInstance(modelName)).toBe(connA);

    expect(() => runtime.registerModelInstance(modelName, connB)).toThrow(/Runtime model registry conflict/);

    expect(runtime.runtime.getModelInstance(modelName)).toBe(connA);

    expect(() => runtime.registerModelInstance(modelName, connA)).not.toThrow();
  });

  it('does not silently acquire a global model from a fresh isolated runtime', () => {
    const runtime = createAccessRuntime();
    const modelName = `AclRuntimeGlobalLeakUser${++modelCounter}`;
    const globalModel = defineUserModel(modelName, mongoose.connection);

    expect(runtime.runtime.hasModelInstance(modelName)).toBe(false);
    expect(runtime.runtime.getModelInstance(modelName)).toBe(null);

    expect(() => runtime.createRouter(modelName, { basePath: '/global-leak-users' })).toThrow(
      /Runtime model registry missing model/,
    );

    expect(runtime.runtime.hasModelInstance(modelName)).toBe(false);
    expect(runtime.runtime.getModelInstance(modelName)).toBe(null);

    runtime.registerModelInstance(modelName, globalModel);
    expect(runtime.runtime.hasModelInstance(modelName)).toBe(true);
    expect(runtime.runtime.getModelInstance(modelName)).toBe(globalModel);
    expect(() => runtime.createRouter(modelName, { basePath: '/registered-users' })).not.toThrow();
  });

  it('keeps default-runtime model-name compatibility by adopting the global model instance', () => {
    const modelName = `AclRuntimeDefaultCompatUser${++modelCounter}`;
    const globalModel = defineUserModel(modelName, mongoose.connection);

    expect(acl.hasModelInstance(modelName)).toBe(true);
    expect(acl.getModelInstance(modelName)).toBe(globalModel);
    expect(acl.hasModelInstance(modelName)).toBe(true);

    expect(() => acl.createRouter(modelName, { basePath: '/default-compat-users' })).not.toThrow();
    expect(acl.getModelInstance(modelName)).toBe(globalModel);
  });

  it('constructing runtime B cannot alter runtime A behavior', async () => {
    await ensurePrimaryConnection();
    const sharedName = `AclRuntimeGuardUser${++modelCounter}`;

    const connA = await createIsolatedConnection('acl-guard-a');
    const connB = await createIsolatedConnection('acl-guard-b');

    const runtimeA = createAccessRuntime();
    runtimeA.setGlobalOptions({
      requestPermissionField: '_permissions',
      globalPermissions: () => ['isAdmin'],
    });

    const modelA = defineUserModel(sharedName, connA);
    const appA = buildRouterApp(runtimeA, modelA);

    await request(appA)
      .post('/users?include_permissions=false')
      .send({ name: 'alpha', role: 'admin', public: false })
      .expect(201);

    const runtimeB = createAccessRuntime();
    runtimeB.setGlobalOptions({
      requestPermissionField: '_permissions',
      globalPermissions: () => ['observer'],
    });
    const modelB = defineUserModel(sharedName, connB);
    const appB = buildRouterApp(runtimeB, modelB);

    expect(runtimeA.runtime.getModelInstance(sharedName)).toBe(modelA);
    expect(runtimeB.runtime.getModelInstance(sharedName)).toBe(modelB);

    await request(appB)
      .post('/users?include_permissions=false')
      .send({ name: 'bravo', role: 'admin', public: false })
      .expect(201);

    const listA = await request(appA).get('/users?include_permissions=false').expect(200);
    expect(listA.body.data).toHaveLength(1);
    expect(listA.body.data[0]).toMatchObject({ name: 'alpha' });

    await connA.destroy();
    await connB.destroy();
  });

  // ARF-12 #5: Concurrent same-name isolated-runtime requests prove separate
  // base filters and AsyncLocalStorage isolation. Two runtimes register the
  // SAME model name on separate connections, each with a different
  // `baseFilter.list`. Both runtimes share the same underlying database
  // name in this test (different connections to the same mongo-memory
  // primary), and each runtime stores both a public and a private document.
  // Runtime A's base filter exposes only `public:true` rows. Runtime B's
  // base filter exposes only `public:false` rows. Concurrent HTTP list
  // requests must each observe their own runtime's base filter — a buggy
  // AsyncLocalStorage propagation (or one that leaked the store across
  // requests) would mix the results.
  it('concurrent same-name isolated-runtime requests each see their own runtime base filter', async () => {
    await ensurePrimaryConnection();
    const sharedName = `AclRuntimeConcurrentUser${++modelCounter}`;

    const connA = await createIsolatedConnection('acl-concurrent-a');
    const connB = await createIsolatedConnection('acl-concurrent-b');

    const runtimeA = createAccessRuntime();
    runtimeA.setGlobalOptions({
      requestPermissionField: '_permissions',
      globalPermissions: () => ['isAdmin'],
    });

    const runtimeB = createAccessRuntime();
    runtimeB.setGlobalOptions({
      requestPermissionField: '_permissions',
      globalPermissions: () => ['isAdmin'],
    });

    const modelA = defineUserModel(sharedName, connA);
    const modelB = defineUserModel(sharedName, connB);

    // Differing base filters are the determining identity of each runtime
    // here. Runtime A -> public users; runtime B -> private users.
    const routerA = runtimeA.createRouter(modelA, {
      basePath: '/users',
      operationAccess: {
        list: true,
        read: true,
        create: true,
      },
      permissionSchema: { name: true, role: true, public: true },
      baseFilter: {
        list: () => ({ public: true }),
        read: () => ({}),
        update: () => ({}),
        delete: () => ({}),
      },
    });
    const routerB = runtimeB.createRouter(modelB, {
      basePath: '/users',
      operationAccess: {
        list: true,
        read: true,
        create: true,
      },
      permissionSchema: { name: true, role: true, public: true },
      baseFilter: {
        list: () => ({ public: false }),
        read: () => ({}),
        update: () => ({}),
        delete: () => ({}),
      },
    });

    const appA = express();
    appA.use(express.json());
    appA.use(routerA.routes);

    const appB = express();
    appB.use(express.json());
    appB.use(routerB.routes);

    // Seed each runtime's store with one public and one private document so
    // the base filter — not the data — is the deciding factor.
    await request(appA)
      .post('/users?include_permissions=false')
      .send({ name: 'a-public', role: 'user', public: true })
      .expect(201);
    await request(appA)
      .post('/users?include_permissions=false')
      .send({ name: 'a-private', role: 'user', public: false })
      .expect(201);

    await request(appB)
      .post('/users?include_permissions=false')
      .send({ name: 'b-public', role: 'user', public: true })
      .expect(201);
    await request(appB)
      .post('/users?include_permissions=false')
      .send({ name: 'b-private', role: 'user', public: false })
      .expect(201);

    // Fire two concurrent HTTP requests against the two runtimes using the
    // same model name. Each request must resolve to its own runtime's
    // base filter only.
    const CONCURRENT = 8;
    const requests: Promise<request.Response>[] = [];
    for (let i = 0; i < CONCURRENT; i++) {
      const useA = i % 2 === 0;
      requests.push(
        useA
          ? request(appA).get('/users?include_permissions=false')
          : request(appB).get('/users?include_permissions=false'),
      );
    }

    const responses = await Promise.all(requests);
    expect(responses).toHaveLength(CONCURRENT);
    for (let i = 0; i < CONCURRENT; i++) {
      const useA = i % 2 === 0;
      const response = responses[i];
      expect(response.status).toBe(200);
      const names = (response.body.data as Array<{ name: string }>).map((row) => row.name).sort();
      if (useA) {
        // Runtime A: only public rows from connection A. The a-private row
        // is filtered out by runtime A's base filter.
        expect(names).toEqual(['a-public']);
      } else {
        // Runtime B: only private rows from connection B. The b-public row
        // is filtered out by runtime B's base filter.
        expect(names).toEqual(['b-private']);
      }
    }

    // Repeat the same concurrency burst a few times to make a cross-thread
    // leak much more likely to surface if AsyncLocalStorage is bugged.
    for (let burst = 0; burst < 3; burst++) {
      const round: Promise<request.Response>[] = [];
      for (let i = 0; i < CONCURRENT; i++) {
        const useA = (burst + i) % 2 === 0;
        round.push(
          useA
            ? request(appA).get('/users?include_permissions=false')
            : request(appB).get('/users?include_permissions=false'),
        );
      }

      const roundResponses = await Promise.all(round);
      for (let i = 0; i < CONCURRENT; i++) {
        const useA = (burst + i) % 2 === 0;
        const names = (roundResponses[i].body.data as Array<{ name: string }>).map((row) => row.name).sort();
        expect(names).toEqual(useA ? ['a-public'] : ['b-private']);
      }
    }

    await connA.destroy();
    await connB.destroy();
  });
});
