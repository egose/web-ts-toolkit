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
});
