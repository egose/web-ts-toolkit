import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import acl, { createAccessRuntime, getGlobalOptions, setGlobalOptions } from '../dist/index.mjs';
import type { Request as AccessRequest } from '../src/interfaces';

const resetGlobalOptions = () => {
  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => ({}),
  });
};

const petData = [
  { name: 'Max', age: 1, sex: 'male', public: true },
  { name: 'Bella', age: 3, sex: 'female', public: true },
  { name: 'Rocky', age: 5, sex: 'male', public: false },
  { name: 'Buddy', age: 1, sex: 'male', public: true },
  { name: 'Milo', age: 4, sex: 'male', public: false },
  { name: 'Toby', age: 1, sex: 'male', public: true },
  { name: 'Zoey', age: 2, sex: 'female', public: false },
];

const createPetApp = () => {
  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: (req) => {
      return req.headers.user === 'admin' ? ['isAdmin'] : [];
    },
  });

  const app = express();
  const router = acl.createDataRouter('pet-legacy', {
    basePath: '/pets',
    idField: 'name',
    operationAccess: {
      list: true,
      read: true,
    },
    data: petData,
    permissionSchema: {
      name: true,
      age: { list: 'isAdmin', read: true },
      sex: { list: false, read: true },
    },
    baseFilter: {
      list(this: express.Request, permissions: { has: (key: string) => boolean }) {
        return permissions.has('isAdmin') ? {} : { public: true };
      },
      read(this: express.Request, permissions: { has: (key: string) => boolean }) {
        return permissions.has('isAdmin') ? {} : { public: true };
      },
    },
  });

  router.router.get('/custom/filter-cache', async (req) => {
    const first = await req.dacl.genFilter('pet-legacy', 'read', { name: 'Max' });
    const second = await req.dacl.genFilter('pet-legacy', 'read', { name: 'Bella' });
    const empty = await req.dacl.genFilter('pet-legacy', 'read', {});
    const emptyAnd = await req.dacl.genFilter('pet-legacy', 'read', { $and: [{}] });
    const singleAnd = await req.dacl.genFilter('pet-legacy', 'read', { $and: [{ name: 'Toby' }] });
    const mergedPlain = await req.dacl.genFilter('pet-legacy', 'read', { name: 'Max' });
    const deduped = await req.dacl.genFilter('pet-legacy', 'read', { $and: [{ public: true }, { public: true }] });
    const conflicting = await req.dacl.genFilter('pet-legacy', 'read', { public: false });

    return { first, second, empty, emptyAnd, singleAnd, mergedPlain, deduped, conflicting };
  });

  app.use(express.json());
  app.use(router.routes);

  return app;
};

afterEach(() => {
  resetGlobalOptions();
});

describe('data router', () => {
  it('creates package-local routers and applies permission-filtered fields', async () => {
    setGlobalOptions({
      requestPermissionField: '_permissions',
      globalPermissions: (req) => {
        return req.headers.user === 'admin' ? ['isAdmin'] : [];
      },
    });

    const app = express();
    const router = acl.createDataRouter('fruit', {
      basePath: '/fruit',
      idField: 'id',
      operationAccess: {
        list: true,
        read: true,
      },
      data: [
        { id: 'apple', name: 'Apple', public: true },
        { id: 'pear', name: 'Pear', public: false },
      ],
      permissionSchema: {
        id: true,
        name: 'isAdmin',
        public: true,
      },
    });

    app.use(express.json());
    app.use(router.routes);

    const guestList = await request(app).get('/fruit').expect(200).expect('Content-Type', /json/);
    const adminList = await request(app).get('/fruit').set('user', 'admin').expect(200).expect('Content-Type', /json/);
    const adminRead = await request(app)
      .get('/fruit/apple')
      .set('user', 'admin')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(guestList.body).toEqual({
      data: [
        { id: 'apple', public: true },
        { id: 'pear', public: false },
      ],
      meta: {
        returnedCount: 2,
        skip: 0,
        limit: 2,
        page: 1,
        pageSize: 2,
        hasPreviousPage: false,
      },
    });
    expect(adminList.body).toEqual({
      data: [
        { id: 'apple', name: 'Apple', public: true },
        { id: 'pear', name: 'Pear', public: false },
      ],
      meta: {
        returnedCount: 2,
        skip: 0,
        limit: 2,
        page: 1,
        pageSize: 2,
        hasPreviousPage: false,
      },
    });
    expect(adminRead.body).toEqual({ id: 'apple', name: 'Apple', public: true });
  });

  it('covers the legacy list and read query variants for in-memory data routers', async () => {
    const app = createPetApp();

    const adminList = await request(app).get('/pets').set('user', 'admin').expect(200).expect('Content-Type', /json/);
    const userList = await request(app).get('/pets').set('user', 'john').expect(200).expect('Content-Type', /json/);
    const countList = await request(app)
      .get('/pets?include_count=true')
      .set('user', 'admin')
      .expect(200)
      .expect('Content-Type', /json/);
    const guestCountList = await request(app)
      .get('/pets?include_count=true')
      .set('user', 'john')
      .expect(200)
      .expect('Content-Type', /json/);
    const pagedList = await request(app)
      .get('/pets?limit=1&page=2')
      .set('user', 'admin')
      .expect(200)
      .expect('Content-Type', /json/);
    const pagedCountList = await request(app)
      .get('/pets?limit=2&page=2&include_count=true')
      .set('user', 'admin')
      .expect(200)
      .expect('Content-Type', /json/);
    const pagedCountListWithHeaders = await request(app)
      .get('/pets?limit=2&page=2&include_count=true&include_extra_headers=true')
      .set('user', 'admin')
      .expect(200)
      .expect('Content-Type', /json/);
    const advancedList = await request(app)
      .post('/pets/__query')
      .set('user', 'admin')
      .send({ filter: { name: 'Max' }, select: 'name' })
      .expect(200)
      .expect('Content-Type', /json/);
    const read = await request(app).get('/pets/Max').set('user', 'admin').expect(200).expect('Content-Type', /json/);
    const advancedRead = await request(app)
      .post('/pets/__query/Max')
      .set('user', 'admin')
      .send({ select: 'age' })
      .expect(200)
      .expect('Content-Type', /json/);
    const filteredRead = await request(app)
      .post('/pets/__query/__filter')
      .set('user', 'admin')
      .send({ filter: { name: 'Max' } })
      .expect(200)
      .expect('Content-Type', /json/);

    expect(adminList.body.data).toHaveLength(7);
    expect(adminList.body.data[0]).toEqual({ name: 'Max', age: 1 });
    expect(adminList.body.meta).toEqual({
      returnedCount: 7,
      skip: 0,
      limit: 7,
      page: 1,
      pageSize: 7,
      hasPreviousPage: false,
    });

    expect(userList.body.data).toHaveLength(4);
    expect(userList.body.data[0]).toEqual({ name: 'Max' });
    expect(userList.body.meta).toEqual({
      returnedCount: 4,
      skip: 0,
      limit: 4,
      page: 1,
      pageSize: 4,
      hasPreviousPage: false,
    });

    expect(countList.body).toEqual({
      data: [
        { name: 'Max', age: 1 },
        { name: 'Bella', age: 3 },
        { name: 'Rocky', age: 5 },
        { name: 'Buddy', age: 1 },
        { name: 'Milo', age: 4 },
        { name: 'Toby', age: 1 },
        { name: 'Zoey', age: 2 },
      ],
      meta: {
        returnedCount: 7,
        totalCount: 7,
        skip: 0,
        limit: 7,
        page: 1,
        pageSize: 7,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });

    expect(guestCountList.body).toEqual({
      data: [{ name: 'Max' }, { name: 'Bella' }, { name: 'Buddy' }, { name: 'Toby' }],
      meta: {
        returnedCount: 4,
        totalCount: 4,
        skip: 0,
        limit: 4,
        page: 1,
        pageSize: 4,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });

    expect(pagedList.body).toEqual({
      data: [{ name: 'Bella', age: 3 }],
      meta: {
        returnedCount: 1,
        skip: 1,
        limit: 1,
        page: 2,
        pageSize: 1,
        hasPreviousPage: true,
      },
    });
    expect(pagedCountList.body).toEqual({
      data: [
        { name: 'Rocky', age: 5 },
        { name: 'Buddy', age: 1 },
      ],
      meta: {
        returnedCount: 2,
        totalCount: 7,
        skip: 2,
        limit: 2,
        page: 2,
        pageSize: 2,
        totalPages: 4,
        hasNextPage: true,
        hasPreviousPage: true,
      },
    });
    expect(pagedCountListWithHeaders.body).toEqual(pagedCountList.body);
    expect(pagedCountListWithHeaders.headers['wtt-returned-count']).toBe('2');
    expect(pagedCountListWithHeaders.headers['wtt-total-count']).toBe('7');
    expect(pagedCountListWithHeaders.headers['wtt-page']).toBe('2');
    expect(pagedCountListWithHeaders.headers['wtt-page-size']).toBe('2');
    expect(pagedCountListWithHeaders.headers['wtt-total-pages']).toBe('4');
    expect(pagedCountListWithHeaders.headers['wtt-has-next-page']).toBe('true');
    expect(pagedCountListWithHeaders.headers['wtt-has-previous-page']).toBe('true');
    expect(advancedList.body).toEqual({
      data: [{ name: 'Max' }],
      meta: {
        returnedCount: 1,
        skip: 0,
        limit: 1,
        page: 1,
        pageSize: 1,
        hasPreviousPage: false,
      },
    });
    expect(read.body).toEqual({ name: 'Max', age: 1, sex: 'male' });
    expect(advancedRead.body).toEqual({ age: 1 });
    expect(filteredRead.body).toEqual({ name: 'Max', age: 1, sex: 'male' });
  });

  it('does not reuse merged base filters across different data genFilter calls in one request', async () => {
    const app = createPetApp();

    const response = await request(app)
      .get('/pets/custom/filter-cache')
      .set('user', 'john')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body.first).toEqual({ public: true, name: 'Max' });
    expect(response.body.second).toEqual({ public: true, name: 'Bella' });
    expect(response.body.empty).toEqual({ public: true });
    expect(response.body.emptyAnd).toEqual({ public: true });
    expect(response.body.singleAnd).toEqual({ public: true, name: 'Toby' });
    expect(response.body.mergedPlain).toEqual({ public: true, name: 'Max' });
    expect(response.body.deduped).toEqual({ public: true });
    expect(response.body.conflicting).toEqual({
      $and: [{ public: true }, { public: false }],
    });
  });

  it('injects data hook context metadata for decorate and decorateAll hooks', async () => {
    const decorate = vi.fn((doc) => doc);
    const decorateAll = vi.fn((docs) => docs);

    const app = express();
    const router = acl.createDataRouter('hook-fruit', {
      basePath: '/hook-fruit',
      idField: 'id',
      operationAccess: {
        list: true,
      },
      data: [{ id: 'apple', name: 'Apple' }],
      permissionSchema: {
        id: true,
        name: true,
      },
      decorate: {
        list: decorate,
      },
      decorateAll: {
        list: decorateAll,
      },
    });

    router.router.get('/custom/context', async (req) => {
      const svc = router.getService(req);
      await svc.decorate({ id: 'apple', name: 'Apple' }, 'list');
      await svc.decorateAll([{ id: 'apple', name: 'Apple' }], 'list');

      return {
        decorateContext: decorate.mock.calls[0]?.[2],
        decorateAllContext: decorateAll.mock.calls[0]?.[2],
      };
    });

    app.use(express.json());
    app.use(router.routes);

    const response = await request(app).get('/hook-fruit/custom/context').expect(200).expect('Content-Type', /json/);

    expect(response.body).toEqual({
      decorateContext: {
        dataName: 'hook-fruit',
        operation: 'list',
      },
      decorateAllContext: {
        dataName: 'hook-fruit',
        operation: 'list',
      },
    });
  });

  it('applies built-in data route decorate hooks with resolved query metadata', async () => {
    const app = express();
    const router = acl.createDataRouter('route-hook-fruit', {
      basePath: '/route-hook-fruit',
      idField: 'id',
      operationAccess: {
        list: true,
        read: true,
      },
      data: [
        { id: 'apple', name: 'Apple' },
        { id: 'pear', name: 'Pear' },
      ],
      permissionSchema: {
        id: true,
        name: true,
      },
      decorate: {
        list(doc, _permissions, context) {
          return {
            ...doc,
            decoratedOperation: context.operation,
            queryLimit: context.resolvedQuery?.limit ?? null,
          };
        },
        read(doc, _permissions, context) {
          return {
            ...doc,
            decoratedOperation: context.operation,
            queryFilter: context.resolvedQuery?.filter ?? null,
          };
        },
      },
      decorateAll: {
        list(docs, _permissions, context) {
          return docs.map((doc) => ({
            ...doc,
            decoratedAllOperation: context.operation,
            querySkip: context.resolvedQuery?.skip ?? null,
          }));
        },
      },
    });

    app.use(express.json());
    app.use(router.routes);

    const listResponse = await request(app).get('/route-hook-fruit?limit=1').expect(200).expect('Content-Type', /json/);

    const readResponse = await request(app).get('/route-hook-fruit/apple').expect(200).expect('Content-Type', /json/);

    expect(listResponse.body).toEqual({
      data: [
        {
          id: 'apple',
          name: 'Apple',
          decoratedOperation: 'list',
          decoratedAllOperation: 'list',
          queryLimit: 1,
          querySkip: 0,
        },
      ],
      meta: {
        returnedCount: 1,
        skip: 0,
        limit: 1,
        page: 1,
        pageSize: 1,
        hasPreviousPage: false,
      },
    });

    expect(readResponse.body).toEqual({
      id: 'apple',
      name: 'Apple',
      decoratedOperation: 'read',
      queryFilter: { id: 'apple' },
    });
  });

  it('rejects unsupported client filter operators for in-memory data queries', async () => {
    const app = createPetApp();

    const whereResponse = await request(app)
      .post('/pets/__query')
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
      .post('/pets/__query')
      .set('user', 'admin')
      .send({ filter: { $expr: { $eq: ['$name', 'Max'] } } })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    expect(exprResponse.body).toMatchObject({
      title: 'Bad Request',
      detail: 'Bad Request',
      status: 400,
      errors: ['Unsupported filter operator: filter.$expr'],
    });
  });

  it('rejects invalid query params and payload shapes for public data routes', async () => {
    const app = createPetApp();

    const invalidQuery = await request(app)
      .get('/pets?include_count=yes')
      .set('user', 'admin')
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    expect(invalidQuery.body).toMatchObject({
      title: 'Bad Request',
      detail: 'Bad Request',
      status: 400,
      errors: [{ parameter: 'include_count' }],
    });

    const invalidBody = await request(app)
      .post('/pets/__query')
      .set('user', 'admin')
      .send([])
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    expect(invalidBody.body).toMatchObject({
      title: 'Bad Request',
      detail: 'Bad Request',
      status: 400,
      errors: [{ pointer: '#' }],
    });

    const invalidSort = await request(app)
      .post('/pets/__query')
      .set('user', 'admin')
      .send({ sort: { name: 1 } })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    expect(invalidSort.body).toMatchObject({
      title: 'Bad Request',
      detail: 'Bad Request',
      status: 400,
      errors: [{ pointer: '#/sort' }],
    });

    const deadReadOptions = await request(app)
      .post('/pets/__query/Max')
      .set('user', 'admin')
      .send({ options: {} })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    expect(deadReadOptions.body).toMatchObject({
      title: 'Bad Request',
      detail: 'Bad Request',
      status: 400,
      errors: [{ pointer: '#/options' }],
    });
  });

  it('supports object-shaped global permissions in data router middleware', async () => {
    setGlobalOptions({
      requestPermissionField: '_permissions',
      globalPermissions: (req) => {
        return req.headers.user === 'admin' ? { isAdmin: true } : {};
      },
    });

    const app = express();
    const router = acl.createDataRouter('secure-fruit', {
      basePath: '/secure-fruit',
      operationAccess: { list: 'isAdmin' },
      data: [{ id: 'apple' }],
    });

    app.use(router.routes);

    await request(app).get('/secure-fruit').set('user', 'admin').expect(200);
    await request(app).get('/secure-fruit').expect(401);
  });

  it('supports user-defined requestSchemas for advanced data routes', async () => {
    setGlobalOptions({
      requestPermissionField: '_permissions',
      globalPermissions: () => [],
    });

    const app = express();
    const router = acl.createDataRouter('schema-fruit', {
      basePath: '/schema-fruit',
      idField: 'id',
      operationAccess: {
        list: true,
        read: true,
      },
      data: [
        { id: 'apple', name: 'Apple', public: true },
        { id: 'pear', name: 'Pear', public: false },
      ],
      permissionSchema: {
        id: true,
        name: true,
        public: true,
      },
      requestSchemas: {
        advancedList: z.object({
          filter: z.object({ public: z.boolean() }).optional(),
        }),
        advancedRead: z.object({
          select: z.array(z.string()).optional(),
        }),
      },
    });

    app.use(express.json());
    app.use(router.routes);

    const invalidList = await request(app)
      .post('/schema-fruit/__query')
      .send({ filter: { public: 'yes' } })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    expect(invalidList.body).toMatchObject({
      title: 'Bad Request',
      detail: 'Bad Request',
      status: 400,
      errors: [{ pointer: '#/filter/public' }],
    });

    await request(app)
      .post('/schema-fruit/__query')
      .send({ filter: { public: true } })
      .expect(200)
      .expect('Content-Type', /json/);

    const invalidRead = await request(app)
      .post('/schema-fruit/__query/apple')
      .send({ select: 'name' })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    expect(invalidRead.body).toMatchObject({
      title: 'Bad Request',
      detail: 'Bad Request',
      status: 400,
      errors: [{ pointer: '#/select' }],
    });

    await request(app)
      .post('/schema-fruit/__query/apple')
      .send({ select: ['name'] })
      .expect(200)
      .expect('Content-Type', /json/);
  });

  it('exposes the shared global options through the main package API', () => {
    const permissions = ['isAdmin'];

    acl.set('requestPermissionField', '__acl');
    acl.set({
      requestPermissionField: '_permissions',
      globalPermissions: () => permissions,
    });

    expect(getGlobalOptions().requestPermissionField).toBe('_permissions');
    expect(getGlobalOptions().globalPermissions?.({} as AccessRequest)).toBe(permissions);
  });

  it('accepts an injected logger through global options', () => {
    const injectedLogger = {
      info: () => undefined,
      warn: () => undefined,
    };

    acl.set({ logger: injectedLogger });

    expect(getGlobalOptions().logger).toBe(injectedLogger);
  });

  it('creates isolated runtime APIs with separate global options', () => {
    const runtimeA = createAccessRuntime();
    const runtimeB = createAccessRuntime();

    runtimeA.set({ requestPermissionField: '__a' });
    runtimeB.set({ requestPermissionField: '__b' });

    expect(runtimeA.getGlobalOptions().requestPermissionField).toBe('__a');
    expect(runtimeB.getGlobalOptions().requestPermissionField).toBe('__b');
    expect(getGlobalOptions().requestPermissionField).not.toBe('__a');
    expect(getGlobalOptions().requestPermissionField).not.toBe('__b');
  });

  it('rejects changing build-time data route options after construction', () => {
    const router = acl.createDataRouter('immutable-fruit', {
      basePath: '/fruit',
      idField: 'id',
      operationAccess: {
        list: true,
      },
      data: [{ id: 'apple', name: 'Apple' }],
      permissionSchema: {
        id: true,
        name: true,
      },
    });

    expect(() => router.set('queryRouteSegment', '__custom')).toThrow(
      'Cannot change queryRouteSegment after router construction because it is a build-time option',
    );
    expect(() => router.setOptions({ basePath: '/other-fruit' })).toThrow(
      'Cannot change basePath after router construction because it is a build-time option',
    );
  });

  it('exposes low-level APIs through the advanced subpath', async () => {
    const advanced = await import('../dist/advanced.mjs');
    const main = await import('../dist/index.mjs');

    expect(advanced).toHaveProperty('parseBody');
    expect(advanced).toHaveProperty('MIDDLEWARE');
    expect(advanced).toHaveProperty('Codes');
    expect(main).not.toHaveProperty('parseBody');
    expect(main).not.toHaveProperty('MIDDLEWARE');
    expect(main).not.toHaveProperty('Codes');
  });

  it('creates a root router through the overloaded createRouter API', () => {
    const router = acl.createRouter({ basePath: '/api', operationAccess: true });

    expect(router).toBeInstanceOf(acl.RootRouter);
    expect(router.routes).toBeDefined();
  });

  it('combines router instances and express routers in the passed order', async () => {
    setGlobalOptions({
      requestPermissionField: '_permissions',
      globalPermissions: () => [],
    });

    const healthRouter = express.Router();
    healthRouter.get('/health', (_req, res) => {
      res.json({ ok: true });
    });

    const firstOverlapRouter = express.Router();
    firstOverlapRouter.get('/overlap', (_req, res) => {
      res.json({ source: 'first' });
    });

    const secondOverlapRouter = express.Router();
    secondOverlapRouter.get('/overlap', (_req, res) => {
      res.json({ source: 'second' });
    });

    const fruitRouter = acl.createDataRouter('combined-fruit', {
      basePath: '/fruit',
      idField: 'name',
      operationAccess: {
        list: true,
        read: true,
      },
      data: [{ name: 'apple', color: 'red', public: true }],
      permissionSchema: {
        name: true,
        color: true,
        public: true,
      },
    });

    const app = express();
    app.use(acl.combineRoutes(healthRouter, firstOverlapRouter, fruitRouter, secondOverlapRouter));

    await request(app).get('/health').expect(200, { ok: true });
    await request(app)
      .get('/fruit')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toHaveLength(1);
        expect(body.data[0]).toMatchObject({ name: 'apple', color: 'red', public: true });
      });
    await request(app).get('/overlap').expect(200, { source: 'first' });
  });
});
