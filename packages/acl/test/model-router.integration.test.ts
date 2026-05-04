import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import acl, { guard, permissionsPlugin, setGlobalOptions } from '../dist/index.mjs';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

let modelCounter = 0;

const resetGlobalOptions = () => {
  setGlobalOptions({
    permissionField: '_permissions',
    globalPermissions: () => ({}),
  });
};

const createIntegrationApp = async () => {
  const modelName = `AclMongoUser${++modelCounter}`;
  const schema = new mongoose.Schema({
    name: String,
    role: String,
    public: Boolean,
  });

  schema.plugin(permissionsPlugin, { modelName });

  const User = mongoose.model(modelName, schema);

  setGlobalOptions({
    permissionField: '_permissions',
    globalPermissions: async function (req: express.Request) {
      const userName = String(req.headers.user ?? '');
      const user = userName ? await User.findOne({ name: userName }) : null;
      (req as express.Request & { _user?: unknown })._user = user;

      return user?.role === 'admin' ? ['isAdmin'] : [];
    },
  });

  const router = acl.createRouter(modelName, {
    basePath: '/users',
    modelPermissionPrefix: 'm::',
    routeGuard: {
      list: true,
      read: true,
      create: 'isAdmin',
      update: true,
    },
    permissionSchema: {
      name: { list: true, read: true, update: ['m::edit.name', 'm::edit.dummy'], create: true },
      role: { list: 'isAdmin', read: true, update: 'm::edit.role', create: 'isAdmin' },
      public: { list: false, read: true, update: 'm::edit.public', create: true },
    },
    docPermissions: function (doc, permissions) {
      const currentUser = (this as express.Request & { _user?: { _id?: mongoose.Types.ObjectId } })._user;
      const isMe = String(doc._id) === String(currentUser?._id);

      return {
        'edit.name': permissions.isAdmin || isMe,
        'edit.role': permissions.isAdmin,
        'edit.public': permissions.isAdmin,
      };
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
      update: function (permissions) {
        if (permissions.isAdmin) return {};
        const currentUser = (this as express.Request & { _user?: { _id?: mongoose.Types.ObjectId } })._user;
        return { _id: currentUser?._id };
      },
    },
    identifier: function (id: string) {
      return { name: id };
    },
  });

  router.router.get('/custom/permissions', guard('isAdmin'), async (req) => {
    const svc = req.macl.getService(modelName);
    const result = await svc.findOne({ name: 'user1' }, {}, { lean: false });
    return result.data.permissions;
  });

  router.router.get(
    '/custom/query',
    guard({ modelName, id: { type: 'query', key: 'userid' }, condition: 'edit.role' }),
    () => {
      return true;
    },
  );

  router.router.get('/custom/fixed', guard({ modelName, id: 'user1', condition: 'edit.role' }), () => {
    return true;
  });

  router.router.get(
    '/custom/:userid',
    guard({ modelName, id: { type: 'param', key: 'userid' }, condition: 'edit.role' }),
    () => {
      return true;
    },
  );

  await User.create([
    { name: 'admin', role: 'admin', public: false },
    { name: 'user1', role: 'admin', public: false },
    { name: 'user2', role: 'user', public: false },
    { name: 'user3', role: 'user', public: true },
  ]);

  const app = express();
  app.use(express.json());
  app.use(router.routes);

  return { app, modelName };
};

afterEach(() => {
  resetGlobalOptions();
  mongoose.deleteModel(/AclMongoUser.*/);
});

describe('model router integration', () => {
  it('applies baseFilter and permissionSchema for list and read requests', async () => {
    const { app } = await createIntegrationApp();

    const adminList = await request(app).get('/users').set('user', 'admin').expect(200).expect('Content-Type', /json/);
    const userList = await request(app).get('/users').set('user', 'user2').expect(200).expect('Content-Type', /json/);
    const selfRead = await request(app)
      .get('/users/user2?include_permissions=true')
      .set('user', 'user2')
      .expect(200)
      .expect('Content-Type', /json/);
    const otherReadViaListFallback = await request(app)
      .get('/users/user3')
      .set('user', 'user2')
      .expect(200)
      .expect('Content-Type', /json/);
    const strictOtherRead = await request(app)
      .get('/users/user3?try_list=false')
      .set('user', 'user2')
      .expect(404)
      .expect('Content-Type', /json/);

    expect(adminList.body).toHaveLength(4);
    expect(adminList.body[0]).toMatchObject({
      name: 'admin',
      role: 'admin',
    });
    expect(adminList.body[0].public).toBeUndefined();

    expect(userList.body).toHaveLength(2);
    expect(userList.body.map((row: { name: string }) => row.name).sort()).toEqual(['user2', 'user3']);
    expect(userList.body[0].role).toBeUndefined();
    expect(userList.body[0].public).toBeUndefined();

    expect(selfRead.body).toMatchObject({
      name: 'user2',
      role: 'user',
      public: false,
    });
    expect(selfRead.body._permissions['edit.name']).toBe(true);
    expect(selfRead.body._permissions['edit.role']).toBeUndefined();
    expect(selfRead.body._permissions._edit.name).toBe(true);
    expect(selfRead.body._permissions._edit.role).toBeUndefined();

    expect(otherReadViaListFallback.body.name).toBe('user3');
    expect(otherReadViaListFallback.body.role).toBeUndefined();
    expect(otherReadViaListFallback.body.public).toBeUndefined();
    expect(strictOtherRead.body.message).toBe('Not Found');
  });

  it('computes document permissions and enforces custom guard routes against live data', async () => {
    const { app } = await createIntegrationApp();

    const permissions = await request(app)
      .get('/users/custom/permissions')
      .set('user', 'admin')
      .expect(200)
      .expect('Content-Type', /json/);

    await request(app).get('/users/custom/fixed').set('user', 'admin').expect(200);
    await request(app).get('/users/custom/user1').set('user', 'admin').expect(200);
    await request(app).get('/users/custom/query?userid=user1').set('user', 'admin').expect(200);
    await request(app).get('/users/custom/user1000').set('user', 'admin').expect(401);
    await request(app).get('/users/custom/query?userid=user1000').set('user', 'admin').expect(401);
    await request(app).get('/users/custom/user1').set('user', 'user2').expect(401);

    expect(permissions.body['edit.name']).toBe(true);
    expect(permissions.body['edit.role']).toBe(true);
    expect(permissions.body['edit.public']).toBe(true);
  });
});
