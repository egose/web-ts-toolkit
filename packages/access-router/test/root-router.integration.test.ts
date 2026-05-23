import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import acl, { permissionsPlugin, setGlobalOptions } from '../dist/index.mjs';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

let modelCounter = 0;

const resetGlobalOptions = () => {
  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => ({}),
  });
};

const createRootRouterApp = async (rootOperationAccess: true | string = true) => {
  const modelName = `AclMongoRootUser${++modelCounter}`;
  const schema = new mongoose.Schema({
    name: String,
    role: String,
    public: Boolean,
  });

  schema.plugin(permissionsPlugin, { modelName });

  const User = mongoose.model(modelName, schema);

  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions(req: express.Request) {
      return req.headers.user === 'admin' ? ['isAdmin'] : [];
    },
  });

  acl.createRouter(modelName, {
    basePath: '/users',
    resolveIdFilter(id: string) {
      return { name: id };
    },
    operationAccess: {
      list: true,
      read: true,
      count: 'isAdmin',
      create: 'isAdmin',
      upsert: 'isAdmin',
    },
    permissionSchema: {
      name: { list: true, read: true, create: true, update: true },
      role: { list: true, read: true, create: true, update: true },
      public: { list: true, read: true, create: true, update: true },
    },
    defaults: {
      publicCreateOptions: {
        includePermissions: false,
      },
    },
  });

  const rootRouter = acl.createRouter({
    basePath: '/root',
    operationAccess: rootOperationAccess,
  });

  await User.create([
    { name: 'admin', role: 'admin', public: false },
    { name: 'user1', role: 'user', public: true },
    { name: 'user2', role: 'user', public: false },
  ]);

  const app = express();
  app.use(express.json());
  app.use(rootRouter.routes);

  return { app, modelName };
};

const createRootRouterCountAccessApp = async () => {
  const modelName = `AclMongoRootCountUser${++modelCounter}`;
  const schema = new mongoose.Schema({
    name: String,
    public: Boolean,
  });

  schema.plugin(permissionsPlugin, { modelName });

  const User = mongoose.model(modelName, schema);

  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => [],
  });

  acl.createRouter(modelName, {
    basePath: '/count-users',
    resolveIdFilter(id: string) {
      return { name: id };
    },
    operationAccess: {
      count: true,
    },
    baseFilter: {
      list: () => ({ public: true }),
      read: () => ({}),
    },
    permissionSchema: {
      name: true,
      public: true,
    },
  });

  const rootRouter = acl.createRouter({
    basePath: '/root-count',
    operationAccess: true,
  });

  await User.create([
    { name: 'public-user', public: true },
    { name: 'private-user-1', public: false },
    { name: 'private-user-2', public: false },
  ]);

  const app = express();
  app.use(express.json());
  app.use(rootRouter.routes);

  return { app, modelName };
};

const createRootRouterDataApp = async () => {
  const dataName = `AclRootData${++modelCounter}`;

  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => [],
  });

  acl.createDataRouter(dataName, {
    basePath: '/data-users',
    data: [
      { id: 'user-1', name: 'user1', public: true },
      { id: 'user-2', name: 'user2', public: false },
    ],
    idField: 'id',
    operationAccess: {
      list: true,
      read: true,
    },
    baseFilter: {
      list: () => ({ public: true }),
      read: () => ({}),
    },
    permissionSchema: {
      id: true,
      name: true,
      public: true,
    },
  });

  const rootRouter = acl.createRouter({
    basePath: '/root-data',
    operationAccess: true,
  });

  const app = express();
  app.use(express.json());
  app.use(rootRouter.routes);

  return { app, dataName };
};

const createRootRouterUpsertApp = async () => {
  const modelName = `AclMongoRootUpsertUser${++modelCounter}`;
  const schema = new mongoose.Schema({
    name: String,
    role: String,
    public: Boolean,
  });

  schema.plugin(permissionsPlugin, { modelName });

  const User = mongoose.model(modelName, schema);

  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions(req: express.Request) {
      return req.headers.user === 'admin' ? ['isAdmin'] : [];
    },
  });

  acl.createRouter(modelName, {
    basePath: '/upsert-users',
    operationAccess: {
      read: true,
      create: 'isAdmin',
      upsert: 'isAdmin',
    },
    permissionSchema: {
      name: { read: true, create: true, update: true },
      role: { read: true, create: true, update: true },
      public: { read: true, create: true, update: true },
    },
    defaults: {
      publicCreateOptions: {
        includePermissions: false,
      },
      publicUpdateOptions: {
        includePermissions: false,
      },
    },
  });

  const existingUser = await User.create({ name: 'user1', role: 'user', public: true });

  const rootRouter = acl.createRouter({
    basePath: '/root-upsert',
    operationAccess: true,
  });

  const app = express();
  app.use(express.json());
  app.use(rootRouter.routes);

  return { app, modelName, existingId: String(existingUser._id) };
};

afterEach(() => {
  resetGlobalOptions();
  mongoose.deleteModel(/AclMongoRootUser.*/);
  mongoose.deleteModel(/AclMongoRootCountUser.*/);
  mongoose.deleteModel(/AclMongoRootUpsertUser.*/);
});

describe('root router integration', () => {
  it('supports batched list, read, and count operations while preserving request order', async () => {
    const { app, modelName } = await createRootRouterApp();

    const response = await request(app)
      .post('/root')
      .set('user', 'admin')
      .send([
        { target: 'model', name: modelName, op: 'count', order: 1 },
        { target: 'model', name: modelName, op: 'read', id: 'user2', order: 0 },
        { target: 'model', name: modelName, op: 'list', order: 0 },
      ])
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body).toHaveLength(3);
    expect(response.body[0]).toMatchObject({
      target: 'model',
      name: modelName,
      op: 'count',
      statusCode: 200,
      message: 'OK',
      result: {
        success: true,
        kind: 'single',
        code: 'success',
        data: 3,
      },
    });
    expect(response.body[1]).toMatchObject({
      target: 'model',
      name: modelName,
      op: 'read',
      message: 'OK',
      statusCode: 200,
      result: {
        success: true,
        kind: 'single',
        code: 'success',
        data: {
          name: 'user2',
          role: 'user',
          public: false,
        },
      },
    });
    expect(response.body[2]).toMatchObject({
      target: 'model',
      name: modelName,
      op: 'list',
      message: 'OK',
      statusCode: 200,
      result: {
        success: true,
        kind: 'list',
        code: 'success',
        count: 3,
      },
    });
    expect(response.body[2].result.data).toHaveLength(3);
    expect(response.body[2].result.data.map((row: { name: string }) => row.name).sort()).toEqual([
      'admin',
      'user1',
      'user2',
    ]);
  });

  it('returns per-item failures for unauthorized and unknown root operations', async () => {
    const { app, modelName } = await createRootRouterApp();

    const response = await request(app)
      .post('/root')
      .set('user', 'user1')
      .send([
        { target: 'model', name: modelName, op: 'list' },
        { target: 'model', name: modelName, op: 'count' },
        { target: 'model', name: 'MissingRootModel', op: 'list' },
        { target: 'data', name: 'MissingRootData', op: 'list' },
        { target: 'model', name: modelName, op: 'read', id: 'user1' },
      ])
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body[0]).toMatchObject({
      target: 'model',
      name: modelName,
      op: 'list',
      statusCode: 200,
      result: {
        success: true,
        code: 'success',
      },
    });
    expect(response.body[1]).toMatchObject({
      target: 'model',
      name: modelName,
      op: 'count',
      statusCode: 422,
      result: {
        success: false,
        code: 'unauthorized',
        errors: [{ detail: 'Unauthorized' }],
      },
    });
    expect(response.body[2]).toMatchObject({
      target: 'model',
      name: 'MissingRootModel',
      op: 'list',
      message: 'Bad Request',
      statusCode: 400,
      result: {
        success: false,
        code: 'bad_request',
        errors: [{ detail: 'Model MissingRootModel not found' }],
      },
    });
    expect(response.body[3]).toMatchObject({
      target: 'data',
      name: 'MissingRootData',
      op: 'list',
      message: 'Bad Request',
      statusCode: 400,
      result: {
        success: false,
        code: 'bad_request',
        errors: [{ detail: 'Data MissingRootData not found' }],
      },
    });
    expect(response.body[4]).toMatchObject({
      target: 'model',
      name: modelName,
      op: 'read',
      message: 'OK',
      statusCode: 200,
      result: {
        success: true,
        code: 'success',
        data: {
          name: expect.any(String),
          role: expect.any(String),
          public: expect.any(Boolean),
        },
      },
    });
  });

  it('enforces the root route guard before evaluating batched operations', async () => {
    const { app, modelName } = await createRootRouterApp('isAdmin');

    await request(app)
      .post('/root')
      .send([{ target: 'model', name: modelName, op: 'list' }])
      .expect(401)
      .expect('Content-Type', /application\/problem\+json/);

    await request(app)
      .post('/root')
      .set('user', 'admin')
      .send([{ target: 'model', name: modelName, op: 'list' }])
      .expect(200)
      .expect('Content-Type', /json/);
  });

  it('rejects non-object args and options in root batch entries', async () => {
    const { app, modelName } = await createRootRouterApp();

    const response = await request(app)
      .post('/root')
      .set('user', 'admin')
      .send([{ target: 'model', name: modelName, op: 'list', args: 'name', options: true }])
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    expect(response.body).toMatchObject({
      title: 'Bad Request',
      detail: 'Bad Request',
      status: 400,
      errors: [{ pointer: '#/0' }],
    });
  });

  it('passes create options and count access overrides through the root batch payload', async () => {
    const { app, modelName } = await createRootRouterApp();

    const createResponse = await request(app)
      .post('/root')
      .set('user', 'admin')
      .send([
        {
          target: 'model',
          name: modelName,
          op: 'create',
          data: { name: 'user3', role: 'user', public: true },
          options: { includePermissions: true },
        },
      ])
      .expect(200)
      .expect('Content-Type', /json/);

    expect(createResponse.body[0]).toMatchObject({
      target: 'model',
      name: modelName,
      op: 'create',
      statusCode: 201,
      result: {
        success: true,
        kind: 'list',
        code: 'created',
        count: 1,
      },
    });
    expect(createResponse.body[0].result.data).toHaveLength(1);
    expect(createResponse.body[0].result.data[0]).toMatchObject({
      name: 'user3',
      role: 'user',
      public: true,
    });
    expect(createResponse.body[0].result.data[0]._permissions).toBeDefined();

    const { app: countApp, modelName: countModelName } = await createRootRouterCountAccessApp();

    const countResponse = await request(countApp)
      .post('/root-count')
      .send([
        { target: 'model', name: countModelName, op: 'count' },
        { target: 'model', name: countModelName, op: 'count', options: { access: 'read' } },
      ])
      .expect(200)
      .expect('Content-Type', /json/);

    expect(countResponse.body).toMatchObject([
      {
        target: 'model',
        name: countModelName,
        op: 'count',
        result: {
          success: true,
          code: 'success',
          data: 1,
        },
      },
      {
        target: 'model',
        name: countModelName,
        op: 'count',
        result: {
          success: true,
          code: 'success',
          data: 3,
        },
      },
    ]);
  });

  it('supports batched data-router list and read operations', async () => {
    const { app, dataName } = await createRootRouterDataApp();

    const response = await request(app)
      .post('/root-data')
      .send([
        { target: 'data', name: dataName, op: 'list', options: { includeCount: true } },
        { target: 'data', name: dataName, op: 'read', id: 'user-2' },
      ])
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body[0]).toMatchObject({
      target: 'data',
      name: dataName,
      op: 'list',
      statusCode: 200,
      result: {
        success: true,
        kind: 'list',
        code: 'success',
        count: 1,
        totalCount: 1,
      },
    });
    expect(response.body[0].result.data).toEqual([{ id: 'user-1', name: 'user1', public: true }]);

    expect(response.body[1]).toMatchObject({
      target: 'data',
      name: dataName,
      op: 'read',
      statusCode: 200,
      result: {
        success: true,
        kind: 'single',
        code: 'success',
        data: { id: 'user-2', name: 'user2', public: false },
      },
    });
  });

  it('supports batched model upsert for create and update paths', async () => {
    const { app, modelName, existingId } = await createRootRouterUpsertApp();

    const response = await request(app)
      .post('/root-upsert')
      .set('user', 'admin')
      .send([
        {
          target: 'model',
          name: modelName,
          op: 'upsert',
          data: { _id: existingId, role: 'admin' },
          options: { returningAll: true, includePermissions: false },
        },
        {
          target: 'model',
          name: modelName,
          op: 'upsert',
          data: { name: 'user4', role: 'user', public: true },
          options: { includePermissions: false },
        },
      ])
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body[0]).toMatchObject({
      target: 'model',
      name: modelName,
      op: 'upsert',
      statusCode: 200,
      result: {
        success: true,
        kind: 'single',
        code: 'success',
        data: {
          name: 'user1',
          role: 'admin',
          public: true,
        },
      },
    });

    expect(response.body[1]).toMatchObject({
      target: 'model',
      name: modelName,
      op: 'upsert',
      statusCode: 201,
      result: {
        success: true,
        kind: 'list',
        code: 'created',
        count: 1,
      },
    });
    expect(response.body[1].result.data).toHaveLength(1);
    expect(response.body[1].result.data[0]).toMatchObject({ name: 'user4', role: 'user', public: true });
  });

  it('rejects root entries that omit operation-specific required fields', async () => {
    const { app, modelName } = await createRootRouterApp();

    const response = await request(app)
      .post('/root')
      .set('user', 'admin')
      .send([
        { target: 'model', name: modelName, op: 'update', data: { role: 'admin' } },
        { target: 'model', name: modelName, op: 'distinct' },
      ])
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    expect(response.body).toMatchObject({
      title: 'Bad Request',
      detail: 'Bad Request',
      status: 400,
      errors: [{ pointer: '#/0' }, { pointer: '#/1' }],
    });
  });
});
