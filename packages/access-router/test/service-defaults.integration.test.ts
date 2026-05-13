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

const createDefaultsApp = async () => {
  const modelName = `AclMongoDefaultUser${++modelCounter}`;
  const schema = new mongoose.Schema({
    name: String,
    role: String,
    public: Boolean,
  });

  schema.plugin(permissionsPlugin, { modelName });

  const User = mongoose.model(modelName, schema);

  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: async function (req: express.Request) {
      const userName = String(req.headers.user ?? '');
      const user = userName ? await User.findOne({ name: userName }) : null;
      (req as express.Request & { _user?: unknown })._user = user;

      return user?.role === 'admin' ? ['isAdmin'] : [];
    },
  });

  const router = acl.createRouter(modelName, {
    basePath: '/default-users',
    resolveIdFilter(id: string) {
      return { name: id };
    },
    operationAccess: {
      list: true,
      read: true,
      update: 'isAdmin',
    },
    permissionSchema: {
      name: { list: true, read: true, update: true },
      role: { list: true, read: true, update: true },
      public: { list: true, read: true, update: true },
    },
    baseFilter: {
      list: function (permissions) {
        if (permissions.isAdmin) return {};
        const currentUser = (this as express.Request & { _user?: { _id?: mongoose.Types.ObjectId } })._user;
        return { $or: [{ _id: currentUser?._id }, { public: true }] };
      },
      read: function (permissions) {
        if (permissions.isAdmin) return {};
        const currentUser = (this as express.Request & { _user?: { _id?: mongoose.Types.ObjectId } })._user;
        return { _id: currentUser?._id };
      },
    },
    defaults: {
      publicReadOptions: {
        tryList: false,
      },
      publicUpdateOptions: {
        returningAll: false,
      },
      findOneOptions: {
        includePermissions: true,
      },
      findByIdOptions: {
        includePermissions: false,
      },
    },
  });

  router.router.get('/custom/service-read/:id', async (req) => {
    const result = await req.macl.getService(modelName).findById(String(req.params.id));
    if (!result.success) {
      return result;
    }

    return result.data;
  });

  await User.create([
    { name: 'admin', role: 'admin', public: false },
    { name: 'user1', role: 'user', public: true },
    { name: 'user2', role: 'user', public: false },
  ]);

  const app = express();
  app.use(express.json());
  app.use(router.routes);

  return { app };
};

afterEach(() => {
  resetGlobalOptions();
  mongoose.deleteModel(/AclMongoDefaultUser.*/);
});

describe('service defaults integration', () => {
  it('uses configured public read defaults and lets explicit query params override them', async () => {
    const { app } = await createDefaultsApp();

    await request(app).get('/default-users/user1').set('user', 'user2').expect(404).expect('Content-Type', /json/);

    const fallbackRead = await request(app)
      .get('/default-users/user1?try_list=true')
      .set('user', 'user2')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(fallbackRead.body).toMatchObject({
      name: 'user1',
      role: 'user',
      public: true,
    });
  });

  it('uses configured public update defaults and lets explicit query params override them', async () => {
    const { app } = await createDefaultsApp();

    const defaultUpdate = await request(app)
      .patch('/default-users/user1')
      .set('user', 'admin')
      .send({ role: 'manager' })
      .expect(200)
      .expect('Content-Type', /json/);

    expect(defaultUpdate.body).toMatchObject({
      _id: expect.any(String),
      role: 'manager',
    });
    expect(defaultUpdate.body.name).toBeUndefined();
    expect(defaultUpdate.body.public).toBeUndefined();

    const fullUpdate = await request(app)
      .patch('/default-users/user1?returning_all=true')
      .set('user', 'admin')
      .send({ role: 'lead' })
      .expect(200)
      .expect('Content-Type', /json/);

    expect(fullUpdate.body).toMatchObject({
      _id: expect.any(String),
      name: 'user1',
      role: 'lead',
      public: true,
    });
  });

  it('uses findByIdOptions defaults instead of findOneOptions defaults', async () => {
    const { app } = await createDefaultsApp();

    const response = await request(app)
      .get('/default-users/custom/service-read/user1')
      .set('user', 'admin')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body).toMatchObject({
      name: 'user1',
      role: 'user',
      public: true,
      _permissions: {
        _view: { $: '_' },
        _edit: { $: '_' },
      },
    });
  });
});
