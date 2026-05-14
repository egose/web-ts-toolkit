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
    },
    permissionSchema: {
      name: { list: true, read: true, create: true },
      role: { list: true, read: true, create: true },
      public: { list: true, read: true, create: true },
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

afterEach(() => {
  resetGlobalOptions();
  mongoose.deleteModel(/AclMongoRootUser.*/);
  mongoose.deleteModel(/AclMongoRootCountUser.*/);
});

describe('root router integration', () => {
  it('supports batched list, read, and count operations while preserving request order', async () => {
    const { app, modelName } = await createRootRouterApp();

    const response = await request(app)
      .post('/root')
      .set('user', 'admin')
      .send([
        { model: modelName, op: 'count', order: 1 },
        { model: modelName, op: 'read', id: 'user2', order: 0 },
        { model: modelName, op: 'list', order: 0 },
      ])
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body).toHaveLength(3);
    expect(response.body[0]).toMatchObject({
      success: true,
      code: 'success',
      data: 3,
      message: 'OK',
      statusCode: 200,
      op: 'count',
    });
    expect(response.body[1]).toMatchObject({
      success: true,
      code: 'success',
      data: {
        name: 'user2',
        role: 'user',
        public: false,
      },
      message: 'OK',
      statusCode: 200,
      op: 'read',
    });
    expect(response.body[2]).toMatchObject({
      success: true,
      code: 'success',
      count: 3,
      message: 'OK',
      statusCode: 200,
      op: 'list',
    });
    expect(response.body[2].data).toHaveLength(3);
    expect(response.body[2].data.map((row: { name: string }) => row.name).sort()).toEqual(['admin', 'user1', 'user2']);
  });

  it('returns per-item failures for unauthorized and unknown root operations', async () => {
    const { app, modelName } = await createRootRouterApp();

    const response = await request(app)
      .post('/root')
      .set('user', 'user1')
      .send([
        { model: modelName, op: 'list' },
        { model: modelName, op: 'count' },
        { model: 'MissingRootModel', op: 'list' },
        { model: modelName, op: 'missing-op' },
        { model: modelName, op: 'read' },
      ])
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body[0]).toMatchObject({
      success: true,
      code: 'success',
      op: 'list',
      statusCode: 200,
    });
    expect(response.body[1]).toEqual({
      success: false,
      code: 'unauthorized',
      data: null,
      message: 'Unauthorized',
    });
    expect(response.body[2]).toEqual({
      success: false,
      code: 'bad_request',
      data: null,
      message: 'Model MissingRootModel not found',
    });
    expect(response.body[3]).toEqual({
      success: false,
      code: 'bad_request',
      data: null,
      message: 'Operation missing-op not found',
    });
    expect(response.body[4]).toMatchObject({
      success: true,
      code: 'success',
      data: {
        name: expect.any(String),
        role: expect.any(String),
        public: expect.any(Boolean),
      },
      message: 'OK',
      statusCode: 200,
      op: 'read',
    });
  });

  it('enforces the root route guard before evaluating batched operations', async () => {
    const { app, modelName } = await createRootRouterApp('isAdmin');

    await request(app)
      .post('/root')
      .send([{ model: modelName, op: 'list' }])
      .expect(401)
      .expect('Content-Type', /application\/problem\+json/);

    await request(app)
      .post('/root')
      .set('user', 'admin')
      .send([{ model: modelName, op: 'list' }])
      .expect(200)
      .expect('Content-Type', /json/);
  });

  it('rejects non-object args and options in root batch entries', async () => {
    const { app, modelName } = await createRootRouterApp();

    const response = await request(app)
      .post('/root')
      .set('user', 'admin')
      .send([{ model: modelName, op: 'list', args: 'name', options: true }])
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    expect(response.body).toMatchObject({
      title: 'Bad Request',
      detail: 'Bad Request',
      status: 400,
      errors: [{ pointer: '#/0/args' }, { pointer: '#/0/options' }],
    });
  });

  it('passes create options and count access overrides through the root batch payload', async () => {
    const { app, modelName } = await createRootRouterApp();

    const createResponse = await request(app)
      .post('/root')
      .set('user', 'admin')
      .send([
        {
          model: modelName,
          op: 'create',
          data: { name: 'user3', role: 'user', public: true },
          options: { includePermissions: true },
        },
      ])
      .expect(200)
      .expect('Content-Type', /json/);

    expect(createResponse.body[0]).toMatchObject({
      success: true,
      code: 'created',
      op: 'create',
      count: 1,
    });
    expect(createResponse.body[0].data).toHaveLength(1);
    expect(createResponse.body[0].data[0]).toMatchObject({
      name: 'user3',
      role: 'user',
      public: true,
    });
    expect(createResponse.body[0].data[0]._permissions).toBeDefined();

    const { app: countApp, modelName: countModelName } = await createRootRouterCountAccessApp();

    const countResponse = await request(countApp)
      .post('/root-count')
      .send([
        { model: countModelName, op: 'count' },
        { model: countModelName, op: 'count', options: { access: 'read' } },
      ])
      .expect(200)
      .expect('Content-Type', /json/);

    expect(countResponse.body).toMatchObject([
      {
        success: true,
        code: 'success',
        op: 'count',
        data: 1,
      },
      {
        success: true,
        code: 'success',
        op: 'count',
        data: 3,
      },
    ]);
  });
});
