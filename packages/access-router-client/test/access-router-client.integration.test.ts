import type { AddressInfo } from 'node:net';
import { createServer, type Server } from 'node:http';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { createAccessRuntime } from '@web-ts-toolkit/access-router';
import type { ModelRouterOptions } from '@web-ts-toolkit/access-router';

import { createAdapter, DataService, Model, ModelService, ServiceError } from '../src';

const MONGO_TIMEOUT = 120_000;
const USER_MODEL_NAME = 'AdapterJsIntegrationUser';
const ORG_MODEL_NAME = 'AdapterJsIntegrationOrg';

interface Org {
  _id?: string;
  name: string;
}

interface User {
  _id?: string;
  name: string;
  role: string;
  public: boolean;
  orgs: string[];
  statusHistory: Array<{ _id?: string; label: string; flag: string }>;
}

interface Pet {
  name: string;
  age: number;
  sex: string;
  public: boolean;
}

interface CollisionDoc {
  _id?: string;
  save: string;
  nested: { value: string };
}

const petData: Pet[] = [
  { name: 'Max', age: 1, sex: 'male', public: true },
  { name: 'Bella', age: 3, sex: 'female', public: true },
  { name: 'Rocky', age: 5, sex: 'male', public: false },
];

const orgSchema = new mongoose.Schema<Org>({
  name: { type: String, required: true },
});

const userSchema = new mongoose.Schema<User>({
  name: { type: String, required: true },
  role: { type: String, required: true },
  public: { type: Boolean, default: true },
  orgs: [{ type: mongoose.Schema.Types.ObjectId, ref: ORG_MODEL_NAME }],
  statusHistory: [
    new mongoose.Schema(
      {
        label: { type: String, required: true },
        flag: { type: String, required: true },
      },
      { _id: true },
    ),
  ],
});

const OrgModel =
  (mongoose.models[ORG_MODEL_NAME] as mongoose.Model<Org>) || mongoose.model<Org>(ORG_MODEL_NAME, orgSchema);
const UserModel =
  (mongoose.models[USER_MODEL_NAME] as mongoose.Model<User>) || mongoose.model<User>(USER_MODEL_NAME, userSchema);

let mongoServer: MongoMemoryServer;
let server: Server;
let adapter: ReturnType<typeof createAdapter>;
let cacheRouteRequestCount = 0;

const services = {} as {
  userService: ModelService<User>;
  userServiceWithError: ModelService<User>;
  orgService: ModelService<Org>;
  petService: DataService<Pet>;
};

const endpoints = {} as {
  apple: ReturnType<ReturnType<typeof createAdapter>['wrapGet']>;
  chairman: ReturnType<ModelService<Org>['wrapPost']>;
};

const seedState = {} as {
  admin: mongoose.HydratedDocument<User>;
  lucy2: mongoose.HydratedDocument<User>;
  org1: mongoose.HydratedDocument<Org>;
  org2: mongoose.HydratedDocument<Org>;
};

async function listen(app: express.Express) {
  server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function seedDatabase() {
  await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));

  const [org1, org2] = await OrgModel.create([{ name: 'red' }, { name: 'blue' }]);
  const [admin, lucy2] = await UserModel.create([
    {
      name: 'admin-user',
      role: 'admin',
      public: true,
      orgs: [org1._id, org2._id],
      statusHistory: [
        { label: 'created', flag: 'green' },
        { label: 'reviewed', flag: 'blue' },
      ],
    },
    {
      name: 'lucy2',
      role: 'user',
      public: true,
      orgs: [org1._id, org2._id],
      statusHistory: [{ label: 'invited', flag: 'yellow' }],
    },
  ]);

  Object.assign(seedState, { admin, lucy2, org1, org2 });
}

const requestSchemas = {
  advancedCreate: {
    data: z.object({ name: z.string().min(3), role: z.string().min(2), public: z.boolean().optional() }).passthrough(),
  },
  advancedUpdate: {
    data: z.object({ role: z.string().min(2) }).passthrough(),
  },
  advancedUpsert: {
    data: z.record(z.string(), z.unknown()),
  },
} as unknown as NonNullable<ModelRouterOptions<User>['requestSchemas']>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri(), { dbName: 'access-router-client-test' });

  const runtime = createAccessRuntime();
  runtime.setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: (req) => (req.headers.user === 'admin' ? ['isAdmin'] : []),
  });

  const app = express();
  app.use(express.json());

  const userRouter = runtime.createRouter(USER_MODEL_NAME, {
    basePath: '/api/users',
    operationAccess: {
      new: true,
      list: true,
      read: true,
      create: true,
      update: true,
      upsert: true,
      delete: true,
      distinct: true,
      count: true,
      subs: {
        statusHistory: {
          list: true,
          read: true,
          create: true,
          update: true,
          delete: true,
        },
      },
    },
    permissionSchema: {
      name: true,
      role: true,
      public: true,
      orgs: true,
      statusHistory: true,
    },
    requestSchemas,
  });

  const orgRouter = runtime.createRouter(ORG_MODEL_NAME, {
    basePath: '/api/orgs',
    queryRouteSegment: '_extra',
    operationAccess: {
      new: true,
      list: true,
      read: true,
      create: true,
      update: true,
      upsert: true,
      delete: true,
      distinct: true,
      count: true,
    },
    permissionSchema: {
      name: true,
    },
  });

  const petRouter = runtime.createDataRouter('pet-data', {
    basePath: '/api/pets',
    idField: 'name',
    operationAccess: {
      list: true,
      read: true,
    },
    data: petData,
    permissionSchema: {
      name: true,
      age: true,
      sex: true,
      public: true,
    },
  });

  const rootRouter = runtime.createRouter({
    basePath: '/api/root',
    operationAccess: true,
  });

  app.get('/api/apple/:name', (req, res) => {
    res.json({ pathParams: req.params, queryParams: req.query });
  });
  app.post('/api/orgs/chairman', (req, res) => {
    res.json({ name: 'chairman', flag: req.body.flag });
  });

  // Routes for testing group partial failure
  app.get('/api/root/group-success', (req, res) => {
    res.json({ success: true, message: 'success' });
  });

  app.get('/api/root/group-fail', (req, res) => {
    res.status(500).json({ success: false, message: 'internal error' });
  });

  // Routes for testing wrap methods error
  app.get('/api/test/wrap-error-404/:name', (req, res) => {
    res.status(404).json({ error: 'not found' });
  });

  app.get('/api/test/wrap-error-500/:name', (req, res) => {
    res.status(500).json({ error: 'internal server error' });
  });

  app.post('/api/test/wrap-error-500/:name', (req, res) => {
    res.status(500).json({ error: 'internal server error' });
  });

  app.get('/api/test/cache-user', (req, res) => {
    cacheRouteRequestCount += 1;
    res.json({ user: req.headers.user ?? 'anonymous', requestCount: cacheRouteRequestCount });
  });

  app.use(userRouter.routes);
  app.use(orgRouter.routes);
  app.use(petRouter.routes);
  app.use(rootRouter.routes);

  const baseUrl = await listen(app);
  adapter = createAdapter({ baseURL: `${baseUrl}/api` });

  services.userService = adapter.createModelService<User>({ modelName: USER_MODEL_NAME, basePath: 'users' });
  services.userServiceWithError = adapter.createModelService<User>({
    modelName: USER_MODEL_NAME,
    basePath: 'users',
    throwOnError: true,
  });
  services.orgService = adapter.createModelService<Org>({
    modelName: ORG_MODEL_NAME,
    basePath: 'orgs',
    queryPath: '_extra',
  });
  services.petService = adapter.createDataService<Pet>({ dataName: 'pet-data', basePath: 'pets' });

  endpoints.apple = adapter.wrapGet('/apple/{{name}}');
  endpoints.chairman = services.orgService.wrapPost('/chairman');
}, MONGO_TIMEOUT);

beforeEach(async () => {
  cacheRouteRequestCount = 0;
  await seedDatabase();
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  await mongoose.disconnect();
  await mongoServer.stop();
}, MONGO_TIMEOUT);

describe('access-router-client', () => {
  it('groups root-router operations using the current access-router payload contract', async () => {
    const result = await adapter.group(
      services.userService.create({ name: 'group-user', role: 'editor', public: true }, undefined, {
        headers: { user: 'admin' },
      }),
      services.orgService.count(),
    );

    expect(result).toHaveLength(2);
    expect(result[0].success).toBe(true);
    expect(result[0].status).toBe(201);
    expect(result[0].data).toBeInstanceOf(Model);
    expect(result[0].data.name).toBe('group-user');
    expect(result[1]).toMatchObject({ success: true, status: 200, data: 2, raw: 2 });
  });

  it('supports advanced model operations, nested requestSchemas.data validation, and model.save()', async () => {
    const created = await services.userService.createAdvanced(
      { name: 'lucy', role: 'user', public: true },
      { select: ['name', 'role', 'public'] },
      undefined,
      { headers: { user: 'admin' } },
    );

    expect(created.status).toBe(201);
    expect(created.data.name).toBe('lucy');

    const listed = await services.userService.listAdvanced(
      { public: true },
      { select: ['name'], limit: 10 },
      { includeCount: true },
      { headers: { user: 'admin' } },
    );

    expect(listed.success).toBe(true);
    expect(listed.totalCount).toBeGreaterThanOrEqual(3);
    expect(listed.data[0]).toBeInstanceOf(Model);

    const readById = await services.userService.readAdvanced(
      String(seedState.admin._id),
      { select: ['name', 'role'] },
      undefined,
      {
        headers: { user: 'admin' },
      },
    );
    expect(readById.data.name).toBe('admin-user');

    const readByFilter = await services.userService.readAdvancedFilter(
      { name: 'lucy2' },
      { select: ['name', 'role'] },
      undefined,
      { headers: { user: 'admin' } },
    );
    expect(readByFilter.data.name).toBe('lucy2');

    const updated = await services.userService.updateAdvanced(
      String(seedState.admin._id),
      { role: 'owner' },
      { select: ['name', 'role'] },
      undefined,
      { headers: { user: 'admin' } },
    );
    expect(updated.data.role).toBe('owner');

    updated.data.role = 'maintainer';
    const saved = await updated.data.save({ headers: { user: 'admin' } });
    expect(saved.success).toBe(true);
    expect(saved.data.role).toBe('maintainer');

    const upserted = await services.userService.upsertAdvanced(
      { _id: String(seedState.admin._id), role: 'director' },
      { select: ['name', 'role'] },
      undefined,
      { headers: { user: 'admin' } },
    );
    expect(upserted.data.role).toBe('director');

    const distinct = await services.userService.distinct('role', { headers: { user: 'admin' } });
    expect(distinct.data.sort()).toEqual(['director', 'user']);

    const counted = await services.userService.countAdvanced(
      { public: true },
      { access: 'read' },
      { headers: { user: 'admin' } },
    );
    expect(counted.data).toBeGreaterThanOrEqual(2);

    const invalidCreateError = await services.userServiceWithError
      .createAdvanced({ name: 'no', role: 'x', public: true }, undefined, undefined, {
        headers: { user: 'admin' },
      })
      .catch((error) => error);

    expect(invalidCreateError).toBeInstanceOf(ServiceError);
    expect(invalidCreateError.message).not.toBe('[object Object]');
    expect(invalidCreateError.message.length).toBeGreaterThan(0);
    expect(invalidCreateError.raw).toBeTruthy();
  });

  it('supports Model helper methods and preserves dirty state on failed save', async () => {
    const read = await services.userService.read(String(seedState.admin._id), undefined, {
      headers: { user: 'admin' },
    });
    expect(read.success).toBe(true);
    expect(read.data.isDirty()).toBe(false);

    const cloned = read.data.toObject();
    cloned.name = 'changed-outside-model';
    expect(read.data.name).toBe('admin-user');
    expect(JSON.parse(JSON.stringify(read.data))).toMatchObject({ name: 'admin-user' });
    expect(read.data.get('name')).toBe('admin-user');

    read.data.assign({ role: 'captain' });
    expect(read.data.isDirty()).toBe(true);
    expect(read.data.isDirty('role')).toBe(true);

    read.data.set('name', 'admiral-user');
    expect(read.data.name).toBe('admiral-user');
    expect(read.data.get('name')).toBe('admiral-user');

    read.data.statusHistory[0].label = 'approved';
    expect(read.data.isDirty('statusHistory')).toBe(false);
    read.data.set('statusHistory.0.label', 'approved-2');
    expect(read.data.isDirty('statusHistory')).toBe(true);

    read.data.reset();
    expect(read.data.isDirty()).toBe(false);
    expect(read.data.name).toBe('admin-user');
    expect(read.data.role).toBe('admin');
    expect(read.data.statusHistory[0].label).toBe('created');

    read.data.assign({ role: 'captain' });
    read.data.set('statusHistory.0.label', 'approved');

    const currentId = String(read.data._id);
    read.data._id = '000000000000000000000000';
    const failedSave = await read.data.save({ headers: { user: 'admin' } });
    expect(failedSave.success).toBe(false);
    expect(read.data.isDirty('role')).toBe(true);
    expect(read.data.isDirty('statusHistory')).toBe(true);

    read.data._id = currentId;
    const saved = await read.data.save({ headers: { user: 'admin' } });
    expect(saved.success).toBe(true);
    expect(read.data.isDirty()).toBe(false);

    const reloaded = await services.userService.read(currentId, undefined, { headers: { user: 'admin' } });
    expect(reloaded.data.role).toBe('captain');
    expect(reloaded.data.statusHistory[0].label).toBe('approved');

    const collisionModel = new Model<CollisionDoc, CollisionDoc>(
      {
        save: 'field-value',
        nested: { value: 'one' },
      },
      services.userService as unknown as ModelService<CollisionDoc>,
    ) as Model<CollisionDoc, CollisionDoc> & CollisionDoc;

    expect(typeof collisionModel.save).toBe('function');
    expect(collisionModel.get('save')).toBe('field-value');
    collisionModel.set('save', 'next-field-value');
    collisionModel.set('nested.value', 'two');
    expect(collisionModel.get('save')).toBe('next-field-value');
    expect(collisionModel.get('nested.value')).toBe('two');
    expect(collisionModel.isDirty('nested')).toBe(true);
    collisionModel.reset();
    expect(collisionModel.get('save')).toBe('field-value');
    expect(collisionModel.get('nested.value')).toBe('one');
  });

  it('supports creating a new unsaved Model instance via save()', async () => {
    const draft = new Model<User, Partial<User>>(
      {
        name: 'draft-user',
        role: 'author',
        public: true,
        orgs: [String(seedState.org1._id)],
        statusHistory: [{ label: 'drafted', flag: 'purple' }],
      },
      services.userService,
    ) as Model<User, Partial<User>> & Partial<User>;

    expect(draft.isDirty()).toBe(true);
    expect(draft.isDirty('name')).toBe(true);

    const saved = await draft.save({ headers: { user: 'admin' } });
    expect(saved.success).toBe(true);
    expect(saved.data._id).toBeTruthy();
    expect(saved.data.name).toBe('draft-user');

    const created = await services.userService.read(String(saved.data._id), undefined, { headers: { user: 'admin' } });
    expect(created.success).toBe(true);
    expect(created.data.role).toBe('author');
    expect(created.data.statusHistory[0]).toMatchObject({ label: 'drafted', flag: 'purple' });
  });

  it('supports subqueries and subdocument routes without an external backend', async () => {
    const orgResponse = await services.orgService.listAdvanced(
      {
        _id: services.userService.readAdvancedFilter(
          { name: 'lucy2' },
          undefined,
          { sq: { path: 'orgs', compact: true } },
          { headers: { user: 'admin' } },
        ),
      },
      { select: ['name'] },
      undefined,
      { headers: { user: 'admin' } },
    );

    expect(orgResponse.success).toBe(true);
    expect(orgResponse.data.map((row) => row.name).sort()).toEqual(['blue', 'red']);

    const subService = services.userService.id(String(seedState.admin._id)).subs('statusHistory');
    const listed = await subService.list({ headers: { user: 'admin' } });
    expect(listed.raw).toHaveLength(2);

    const existingSubId = String(seedState.admin.statusHistory[0]._id);
    const read = await subService.read(existingSubId, { headers: { user: 'admin' } });
    expect(read.success).toBe(true);
    expect(read.raw).toMatchObject({ _id: existingSubId });

    const advancedListed = await subService.listAdvanced(
      { flag: 'green' },
      { select: ['label', 'flag'] },
      { headers: { user: 'admin' } },
    );
    expect(advancedListed.success).toBe(true);
    expect(advancedListed.raw).toHaveLength(1);
    expect(String(advancedListed.raw[0]._id)).toBe(existingSubId);

    const advancedRead = await subService.readAdvanced(
      existingSubId,
      { select: ['label'], populate: [] },
      { headers: { user: 'admin' } },
    );
    expect(advancedRead.success).toBe(true);
    expect(String(advancedRead.raw._id)).toBe(existingSubId);
  });

  it('supports data services and custom wrapped endpoints', async () => {
    const list = await services.petService.list({ limit: 2 }, { includeCount: true }, { headers: { user: 'admin' } });
    expect(list.success).toBe(true);
    expect(list.raw).toHaveLength(2);
    expect(list.totalCount).toBe(3);

    const advancedList = await services.petService.listAdvanced(
      { public: true },
      { select: 'name', limit: 10 },
      { includeCount: true },
      { headers: { user: 'admin' } },
    );
    expect(advancedList.data.map((row) => row.name).sort()).toEqual(['Bella', 'Max']);

    const read = await services.petService.read('Max', undefined, { headers: { user: 'admin' } });
    expect(read.data.name).toBe('Max');

    const apple = await endpoints.apple({ pathParams: { name: 'apple' }, queryParams: { q1: 'a', q2: 'b' } });
    expect(apple.data).toEqual({ pathParams: { name: 'apple' }, queryParams: { q1: 'a', q2: 'b' } });

    const chairman = await endpoints.chairman({ flag: 'pencil' });
    expect(chairman.data).toEqual({ name: 'chairman', flag: 'pencil' });
  });

  it('infers selected field types for advanced selects', async () => {
    const typedUser = await services.userService.readAdvanced(
      String(seedState.admin._id),
      { select: ['name', 'role'] as const },
      undefined,
      { headers: { user: 'admin' } },
    );

    const typedProjectedUser = await services.userService.readAdvanced(
      String(seedState.admin._id),
      { select: { name: 1, role: 1 } as const },
      undefined,
      { headers: { user: 'admin' } },
    );

    const explicitTypedUser = await services.userService.readAdvanced<{ name: string }>(
      String(seedState.admin._id),
      { select: { name: 1, role: 1 } as const },
      undefined,
      { headers: { user: 'admin' } },
    );

    expectTypeOf(typedUser.raw).toEqualTypeOf<Pick<User, 'name' | 'role'>>();
    expectTypeOf(typedProjectedUser.raw).toEqualTypeOf<Pick<User, 'name' | 'role'>>();
    expectTypeOf(explicitTypedUser.raw).toEqualTypeOf<{ name: string }>();

    expect(typedUser.success).toBe(true);
    expect(typedProjectedUser.success).toBe(true);
    expect(explicitTypedUser.success).toBe(true);
  });

  it('reads totalCount from access-router extra headers', async () => {
    const list = await services.petService.list(
      { limit: 1 },
      { includeCount: true, includeExtraHeaders: true },
      { headers: { user: 'admin' } },
    );

    expect(list.success).toBe(true);
    expect(list.raw).toHaveLength(1);
    expect(list.totalCount).toBe(3);
  });

  it('handles group partial failures gracefully', async () => {
    // One successful request: read an existing user
    const successful = services.userService.readAdvanced(String(seedState.admin._id), { select: ['name'] }, undefined, {
      headers: { user: 'admin' },
    });
    // One failed request: read a non-existent user
    const failed = services.userService.readAdvanced('000000000000000000000000', { select: ['name'] }, undefined, {
      headers: { user: 'admin' },
    });

    const result = await adapter.group(successful, failed);

    expect(result).toHaveLength(2);
    expect(result[0].success).toBe(true);
    expect(result[0].data.name).toBe('admin-user');
    expect(result[1].success).toBe(false);
    expect(result[1].data).toBeNull();
    // The failed request should have a non-2xx status and a message
    expect(result[1].status).toBeGreaterThanOrEqual(400);
    expect(typeof result[1].message).toBe('string');
  });

  it('rejects grouped requests with conflicting axios configs', async () => {
    const first = services.userService.read(String(seedState.admin._id), undefined, { headers: { user: 'admin' } });
    const second = services.userService.read(String(seedState.lucy2._id), undefined, { headers: { user: 'guest' } });

    await expect(adapter.group(first, second)).rejects.toThrow(
      'Grouped requests must share the same axios request config',
    );
  });

  it('handles wrapGet 404 errors appropriately', async () => {
    const wrapGet404 = adapter.wrapGet('test/wrap-error-404/test');
    await expect(wrapGet404({})).rejects.toMatchObject({
      response: {
        status: 404,
      },
    });
  });

  it('handles wrapGet 500 errors appropriately', async () => {
    const wrapGet500 = adapter.wrapGet('test/wrap-error-500/test');
    await expect(wrapGet500({})).rejects.toMatchObject({
      response: {
        status: 500,
      },
    });
  });

  it('handles wrapPost errors appropriately', async () => {
    const wrapPost500 = adapter.wrapPost('test/wrap-error-500/test');
    await expect(wrapPost500({})).rejects.toMatchObject({
      response: {
        status: 500,
      },
    });
  });

  it('supports lazy request catch and finally semantics', async () => {
    let finalized = false;

    const finalizedResult = await services.userService
      .read(String(seedState.admin._id), undefined, { headers: { user: 'admin' } })
      .finally(() => {
        finalized = true;
      });

    expect(finalized).toBe(true);
    expect(finalizedResult.success).toBe(true);
    expect(finalizedResult.data.name).toBe('admin-user');

    const error = await services.userService
      .read('000000000000000000000000', undefined, { headers: { user: 'admin' }, throwOnError: true })
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(ServiceError);
    expect(error).toMatchObject({ status: 404 });
  });

  it('scopes cached responses to each adapter instance and request headers', async () => {
    const cachedAdapter = createAdapter({ baseURL: adapter.axios.defaults.baseURL }, { cacheTTL: 60_000 });
    const getCachedUser = cachedAdapter.wrapGet<{ user: string; requestCount: number }>('test/cache-user');

    const adminFirst = await getCachedUser(undefined, { headers: { user: 'admin' } });
    const adminSecond = await getCachedUser(undefined, { headers: { user: 'admin' } });
    const guestFirst = await getCachedUser(undefined, { headers: { user: 'guest' } });

    expect(adminFirst.data).toEqual({ user: 'admin', requestCount: 1 });
    expect(adminSecond.data).toEqual({ user: 'admin', requestCount: 1 });
    expect(guestFirst.data).toEqual({ user: 'guest', requestCount: 2 });
  });
});
