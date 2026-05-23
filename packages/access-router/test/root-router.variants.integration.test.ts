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

const createRootVariantsApp = async () => {
  const modelName = `AclMongoRootVariantsUser${++modelCounter}`;
  const schema = new mongoose.Schema({
    name: String,
    role: String,
    public: Boolean,
    status: {
      type: String,
      default: 'fresh',
    },
  });

  schema.plugin(permissionsPlugin, { modelName });

  const User = mongoose.model(modelName, schema);

  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => ['isAdmin'],
  });

  acl.createRouter(modelName, {
    basePath: '/root-variants-users',
    operationAccess: {
      new: true,
      list: true,
      read: true,
      distinct: true,
    },
    permissionSchema: {
      name: true,
      role: true,
      public: true,
      status: true,
    },
    resolveIdFilter(id: string) {
      return { name: id };
    },
  });

  const rootRouter = acl.createRouter({
    basePath: '/root-variants',
    operationAccess: true,
  });

  await User.create([
    { name: 'admin-user', role: 'admin', public: false },
    { name: 'public-user', role: 'user', public: true },
    { name: 'private-user', role: 'user', public: false },
  ]);

  const app = express();
  app.use(express.json());
  app.use(rootRouter.routes);

  return {
    app,
    modelName,
  };
};

afterEach(() => {
  resetGlobalOptions();
  mongoose.deleteModel(/AclMongoRootVariantsUser.*/);
});

describe('root router variants', () => {
  it('supports new, filter-read, and distinct model batch operations', async () => {
    const { app, modelName } = await createRootVariantsApp();

    const response = await request(app)
      .post('/root-variants')
      .send([
        { target: 'model', name: modelName, op: 'new', order: 0 },
        { target: 'model', name: modelName, op: 'read', filter: { name: 'public-user' }, order: 1 },
        { target: 'model', name: modelName, op: 'distinct', field: 'role', order: 2 },
      ])
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body).toHaveLength(3);
    expect(response.body[0]).toMatchObject({
      target: 'model',
      name: modelName,
      op: 'new',
      statusCode: 200,
      result: {
        success: true,
        kind: 'single',
        code: 'success',
        data: {
          status: 'fresh',
        },
      },
    });
    expect(response.body[1]).toMatchObject({
      target: 'model',
      name: modelName,
      op: 'read',
      statusCode: 200,
      result: {
        success: true,
        kind: 'single',
        code: 'success',
        data: {
          name: 'public-user',
          role: 'user',
          public: true,
        },
      },
    });
    expect(response.body[2]).toMatchObject({
      target: 'model',
      name: modelName,
      op: 'distinct',
      statusCode: 200,
      result: {
        success: true,
        kind: 'list',
        code: 'success',
      },
    });
    expect(response.body[2].result.data.sort()).toEqual(['admin', 'user']);
  });
});
