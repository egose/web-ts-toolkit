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
    globalPermissions: () => [],
  });
};

const createExistsApp = async ({ seed = true }: { seed?: boolean } = {}) => {
  const modelName = `AclMongoExistsUser${++modelCounter}`;
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

  const router = acl.createRouter(modelName, {
    basePath: '/exists-users',
    operationAccess: {
      list: true,
      read: true,
    },
    permissionSchema: {
      name: true,
      public: true,
    },
    baseFilter: {
      read: () => ({ public: true }),
      update: () => false,
    },
  });

  router.router.get('/custom/exists', async (req) => {
    const svc = req.macl.getService(modelName);
    const access = req.query.access === 'update' ? 'update' : 'read';
    const includeId = req.query.includeId === 'true';

    return svc.exists(
      { name: String(req.query.name ?? '') },
      {
        access,
        includeId,
      },
    );
  });

  if (seed) {
    await User.create([
      { name: 'public-user', public: true },
      { name: 'private-user', public: false },
    ]);
  }

  const app = express();
  app.use(express.json());
  app.use(router.routes);

  return { app };
};

afterEach(() => {
  resetGlobalOptions();
  mongoose.deleteModel(/AclMongoExistsUser.*/);
});

describe('service exists integration', () => {
  it('returns boolean existence results using the default access level', async () => {
    const { app } = await createExistsApp();
    const { app: emptyApp } = await createExistsApp({ seed: false });

    const publicExists = await request(app)
      .get('/exists-users/custom/exists?name=public-user')
      .expect(200)
      .expect('Content-Type', /json/);

    const missingExists = await request(emptyApp)
      .get('/exists-users/custom/exists?name=missing-user')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(publicExists.body).toMatchObject({
      success: true,
      kind: 'single',
      code: 'success',
      data: true,
    });
    expect(missingExists.body).toMatchObject({
      success: true,
      kind: 'single',
      code: 'success',
      data: false,
    });
  });

  it('returns the matching id when includeId is enabled', async () => {
    const { app } = await createExistsApp();

    const response = await request(app)
      .get('/exists-users/custom/exists?name=public-user&includeId=true')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body.data).toMatchObject({
      _id: expect.any(String),
    });
  });

  it('honors the requested access override', async () => {
    const { app } = await createExistsApp();

    const response = await request(app)
      .get('/exists-users/custom/exists?name=public-user&access=update')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body).toMatchObject({
      success: true,
      kind: 'single',
      code: 'success',
      data: false,
    });
  });
});
