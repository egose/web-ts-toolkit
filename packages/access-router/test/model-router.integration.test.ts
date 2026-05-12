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
    requestPermissionField: '_permissions',
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
    requestPermissionField: '_permissions',
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

  router.router.get('/custom/filter-cache', async (req) => {
    const first = await req.macl.genFilter(modelName, 'read', { name: 'user1' });
    const second = await req.macl.genFilter(modelName, 'read', { name: 'user2' });
    const empty = await req.macl.genFilter(modelName, 'read', {});
    const emptyAnd = await req.macl.genFilter(modelName, 'read', { $and: [{}] });
    const singleAnd = await req.macl.genFilter(modelName, 'read', { $and: [{ name: 'user1' }] });
    const mergedPlain = await req.macl.genFilter(modelName, 'read', { name: 'user1' });
    const deduped = await req.macl.genFilter(modelName, 'read', {
      $and: [{ _id: req._user?._id }, { _id: req._user?._id }],
    });
    const conflicting = await req.macl.genFilter(modelName, 'read', { _id: 'different-id' });

    return { first, second, empty, emptyAnd, singleAnd, mergedPlain, deduped, conflicting };
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

const createPopulateIntegrationApp = async () => {
  const orgModelName = `AclMongoOrg${++modelCounter}`;
  const userModelName = `AclMongoPopulateUser${++modelCounter}`;

  const Org = mongoose.model(
    orgModelName,
    new mongoose.Schema({
      name: String,
      secret: String,
    }),
  );

  const User = mongoose.model(
    userModelName,
    new mongoose.Schema({
      name: String,
      org: { type: mongoose.Schema.Types.ObjectId, ref: orgModelName },
    }),
  );

  setGlobalOptions({
    requestPermissionField: '__reqAcl',
    globalPermissions(req: express.Request) {
      return req.headers.user === 'admin' ? ['isAdmin'] : [];
    },
  });

  const orgRouter = acl.createRouter(orgModelName, {
    basePath: '/orgs',
    routeGuard: { list: true, read: true },
    permissionSchema: {
      name: { list: true, read: true },
      secret: { list: 'isAdmin', read: 'isAdmin' },
    },
  });

  const userRouter = acl.createRouter(userModelName, {
    basePath: '/members',
    documentPermissionField: '__acl',
    routeGuard: { list: true, read: true },
    permissionSchema: {
      name: { list: true, read: true },
      org: { list: 'isAdmin', read: 'isAdmin' },
    },
    identifier(id: string) {
      return { name: id };
    },
  });

  userRouter.router.get('/custom/populate-query', async (req) => {
    return req.macl.genPopulate(userModelName, 'read', 'org');
  });

  const org = await Org.create({ name: 'org-1', secret: 'top-secret' });
  await User.create([{ name: 'user1', org: org._id }]);

  const app = express();
  app.use(express.json());
  app.use(orgRouter.routes);
  app.use(userRouter.routes);

  return { app };
};

afterEach(() => {
  resetGlobalOptions();
  mongoose.deleteModel(/AclMongo(User|OpsUser|Org|PopulateUser).*/);
});

describe('model router integration', () => {
  it('applies baseFilter and permissionSchema for list and read requests', async () => {
    const { app } = await createIntegrationApp();

    const adminList = await request(app).get('/users').set('user', 'admin').expect(200).expect('Content-Type', /json/);
    const userList = await request(app).get('/users').set('user', 'user2').expect(200).expect('Content-Type', /json/);
    const userListWithPermissions = await request(app)
      .get('/users?include_permissions=true')
      .set('user', 'user2')
      .expect(200)
      .expect('Content-Type', /json/);
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

    expect(adminList.body.data).toHaveLength(4);
    expect(adminList.body.data.map((row: { name: string }) => row.name).sort()).toEqual([
      'admin',
      'user1',
      'user2',
      'user3',
    ]);
    expect(adminList.body.meta).toEqual({
      returnedCount: 4,
      skip: 0,
      limit: 1000,
      page: 1,
      pageSize: 1000,
      hasPreviousPage: false,
    });
    const adminRow = adminList.body.data.find((row: { name: string }) => row.name === 'admin');
    expect(adminRow).toMatchObject({
      name: 'admin',
      role: 'admin',
    });
    expect(adminRow.public).toBeUndefined();

    expect(userList.body.data).toHaveLength(2);
    expect(userList.body.data.map((row: { name: string }) => row.name).sort()).toEqual(['user2', 'user3']);
    expect(userList.body.meta).toEqual({
      returnedCount: 2,
      skip: 0,
      limit: 1000,
      page: 1,
      pageSize: 1000,
      hasPreviousPage: false,
    });
    expect(userList.body.data[0].role).toBeUndefined();
    expect(userList.body.data[0].public).toBeUndefined();

    const selfListRow = userListWithPermissions.body.data.find((row: { name: string }) => row.name === 'user2');
    const publicListRow = userListWithPermissions.body.data.find((row: { name: string }) => row.name === 'user3');
    expect(selfListRow._permissions._view.name).toBe(true);
    expect(selfListRow._permissions._edit.name).toBe(true);
    expect(publicListRow._permissions._view).toEqual({});
    expect(publicListRow._permissions._edit).toEqual({});

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
    expect(strictOtherRead.body.title).toBe('Not Found');
    expect(strictOtherRead.body.detail).toBe('Not Found');
    expect(strictOtherRead.body.status).toBe(404);
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

  it('does not reuse merged base filters across different genFilter calls in one request', async () => {
    const { app } = await createIntegrationApp();

    const response = await request(app)
      .get('/users/custom/filter-cache')
      .set('user', 'user2')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body.first).toMatchObject({ _id: expect.any(String), name: 'user1' });
    expect(response.body.first.$and).toBeUndefined();
    expect(response.body.second).toMatchObject({ _id: expect.any(String), name: 'user2' });
    expect(response.body.second.$and).toBeUndefined();
    expect(response.body.empty).toMatchObject({ _id: expect.any(String) });
    expect(response.body.empty.$and).toBeUndefined();
    expect(response.body.emptyAnd).toMatchObject({ _id: expect.any(String) });
    expect(response.body.emptyAnd.$and).toBeUndefined();
    expect(response.body.singleAnd).toMatchObject({ _id: expect.any(String), name: 'user1' });
    expect(response.body.singleAnd.$and).toBeUndefined();
    expect(response.body.mergedPlain).toMatchObject({ _id: expect.any(String), name: 'user1' });
    expect(response.body.mergedPlain.$and).toBeUndefined();
    expect(response.body.deduped).toMatchObject({ _id: expect.any(String) });
    expect(response.body.deduped.$and).toBeUndefined();
    expect(response.body.conflicting).toMatchObject({
      $and: [{ _id: expect.any(String) }, { _id: 'different-id' }],
    });
  });

  it('rejects unsupported client filter operators for model queries', async () => {
    const { app } = await createIntegrationApp();

    const whereResponse = await request(app)
      .post('/users/__query')
      .set('user', 'admin')
      .send({ filter: { $where: 'return true' } })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    expect(whereResponse.body).toMatchObject({
      title: 'Bad Request',
      detail: 'Bad Request',
      status: 400,
      errors: ['Unsupported filter operator: filter.$where'],
    });

    const exprResponse = await request(app)
      .post('/users/__query')
      .set('user', 'admin')
      .send({ filter: { $expr: { $eq: ['$name', 'user1'] } } })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    expect(exprResponse.body).toMatchObject({
      title: 'Bad Request',
      detail: 'Bad Request',
      status: 400,
      errors: ['Unsupported filter operator: filter.$expr'],
    });
  });

  it('rejects invalid query params and payload shapes for public model routes', async () => {
    const { app } = await createIntegrationApp();

    const invalidQuery = await request(app)
      .get('/users/user1?try_list=maybe')
      .set('user', 'admin')
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    expect(invalidQuery.body).toMatchObject({
      title: 'Bad Request',
      detail: 'Bad Request',
      status: 400,
      errors: [{ parameter: 'try_list' }],
    });

    const invalidBody = await request(app)
      .post('/users/__mutation')
      .set('user', 'admin')
      .send({ select: 'name' })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    expect(invalidBody.body).toMatchObject({
      title: 'Bad Request',
      detail: 'Bad Request',
      status: 400,
      errors: [{ pointer: '#/data' }],
    });
  });

  it('rejects invalid advanced populate payloads for model routes', async () => {
    const { app } = await createIntegrationApp();

    const invalidPopulate = await request(app)
      .post('/users/__query/user1')
      .set('user', 'admin')
      .send({ populate: [123] })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    expect(invalidPopulate.body).toMatchObject({
      title: 'Bad Request',
      detail: 'Bad Request',
      status: 400,
      errors: [{ pointer: '#/populate' }],
    });
  });

  it('supports route guards for count, distinct, and upsert routes', async () => {
    const modelName = `AclMongoOpsUser${++modelCounter}`;
    const schema = new mongoose.Schema({
      name: String,
      role: String,
      public: Boolean,
    });

    const User = mongoose.model(modelName, schema);

    setGlobalOptions({
      requestPermissionField: '_permissions',
      globalPermissions(req: express.Request) {
        return req.headers.user === 'admin' ? ['isAdmin'] : [];
      },
    });

    const router = acl.createRouter(modelName, {
      basePath: '/ops-users',
      routeGuard: {
        list: true,
        read: true,
        create: 'isAdmin',
        update: 'isAdmin',
        count: 'isAdmin',
        distinct: 'isAdmin',
        // `upsert` is supported by the runtime even though it is not yet documented consistently.
        upsert: 'isAdmin',
      } as any,
      permissionSchema: {
        name: { list: true, read: true, create: true, update: true },
        role: { list: true, read: true, create: true, update: true },
        public: { list: true, read: true, create: true, update: true },
      },
    });

    await User.create([
      { name: 'admin', role: 'admin', public: false },
      { name: 'user1', role: 'user', public: true },
      { name: 'user2', role: 'user', public: false },
    ]);

    const app = express();
    app.use(express.json());
    app.use(router.routes);

    const count = await request(app)
      .get('/ops-users/count')
      .set('user', 'admin')
      .expect(200)
      .expect('Content-Type', /json/);
    expect(Number(count.text)).toBe(3);
    await request(app).get('/ops-users/count').expect(401);

    const distinct = await request(app)
      .get('/ops-users/distinct/role')
      .set('user', 'admin')
      .expect(200)
      .expect('Content-Type', /json/);
    expect(distinct.body.sort()).toEqual(['admin', 'user']);
    await request(app).get('/ops-users/distinct/role').expect(401);

    const created = await request(app)
      .put('/ops-users')
      .set('user', 'admin')
      .send({ name: 'user3', role: 'user', public: true })
      .expect(201)
      .expect('Content-Type', /json/);
    expect(created.body).toMatchObject({ name: 'user3', role: 'user', public: true });

    const existing = await User.findOne({ name: 'user1' }).select('_id').lean();
    expect(existing?._id).toBeDefined();

    const updated = await request(app)
      .put('/ops-users')
      .set('user', 'admin')
      .send({ _id: String(existing?._id), role: 'manager' })
      .expect(200)
      .expect('Content-Type', /json/);
    expect(updated.body).toMatchObject({ _id: String(existing?._id), role: 'manager' });

    await request(app).put('/ops-users').expect(401);
  });

  it('supports renamed request and document permission field options', async () => {
    const { app } = await createPopulateIntegrationApp();

    const response = await request(app)
      .get('/members/user1?include_permissions=true')
      .set('user', 'admin')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body.__acl).toBeDefined();
    expect(response.body._permissions).toBeUndefined();
  });

  it('denies populate paths at query-construction time when the parent path is not readable', async () => {
    const { app } = await createPopulateIntegrationApp();

    const deniedPopulate = await request(app)
      .get('/members/custom/populate-query')
      .expect(200)
      .expect('Content-Type', /json/);
    expect(deniedPopulate.body).toEqual([]);

    const allowedPopulate = await request(app)
      .get('/members/custom/populate-query')
      .set('user', 'admin')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(allowedPopulate.body).toHaveLength(1);
    expect(allowedPopulate.body[0]).toMatchObject({
      path: 'org',
      match: {},
    });
  });
});
