import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import acl, { getGlobalOptions, setGlobalOptions } from '../dist/index.mjs';

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
    identifier: 'name',
    routeGuard: {
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
      identifier: 'id',
      routeGuard: {
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
      routeGuard: { list: 'isAdmin' },
      data: [{ id: 'apple' }],
    });

    app.use(router.routes);

    await request(app).get('/secure-fruit').set('user', 'admin').expect(200);
    await request(app).get('/secure-fruit').expect(401);
  });

  it('exposes the shared global options through the main package API', () => {
    const permissions = ['isAdmin'];

    acl.set('requestPermissionField', '__acl');
    acl.set({
      requestPermissionField: '_permissions',
      globalPermissions: () => permissions,
    });

    expect(getGlobalOptions().requestPermissionField).toBe('_permissions');
    expect(getGlobalOptions().globalPermissions?.({} as any)).toBe(permissions);
  });

  it('accepts an injected logger through global options', () => {
    const injectedLogger = {
      info: () => undefined,
      warn: () => undefined,
    };

    acl.set({ logger: injectedLogger });

    expect(getGlobalOptions().logger).toBe(injectedLogger);
  });

  it('creates a root router through the overloaded createRouter API', () => {
    const router = acl.createRouter({ basePath: '/api', routeGuard: true });

    expect(router).toBeInstanceOf(acl.RootRouter);
    expect(router.routes).toBeDefined();
  });
});
