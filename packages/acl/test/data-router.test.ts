import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import acl, { getGlobalOptions, setGlobalOptions } from '../dist/index.mjs';

const resetGlobalOptions = () => {
  setGlobalOptions({
    permissionField: '_permissions',
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
    permissionField: '_permissions',
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
      permissionField: '_permissions',
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

    expect(guestList.body).toEqual([
      { id: 'apple', public: true },
      { id: 'pear', public: false },
    ]);
    expect(adminList.body).toEqual([
      { id: 'apple', name: 'Apple', public: true },
      { id: 'pear', name: 'Pear', public: false },
    ]);
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
    const pagedList = await request(app)
      .get('/pets?limit=1&page=2')
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

    expect(adminList.body).toHaveLength(7);
    expect(adminList.body[0]).toEqual({ name: 'Max', age: 1 });

    expect(userList.body).toHaveLength(4);
    expect(userList.body[0]).toEqual({ name: 'Max' });

    expect(countList.body).toEqual({
      count: 7,
      rows: [
        { name: 'Max', age: 1 },
        { name: 'Bella', age: 3 },
        { name: 'Rocky', age: 5 },
        { name: 'Buddy', age: 1 },
        { name: 'Milo', age: 4 },
        { name: 'Toby', age: 1 },
        { name: 'Zoey', age: 2 },
      ],
    });

    expect(pagedList.body).toEqual([{ name: 'Bella', age: 3 }]);
    expect(advancedList.body).toEqual([{ name: 'Max' }]);
    expect(read.body).toEqual({ name: 'Max', age: 1, sex: 'male' });
    expect(advancedRead.body).toEqual({ age: 1 });
    expect(filteredRead.body).toEqual({ name: 'Max', age: 1, sex: 'male' });
  });

  it('supports object-shaped global permissions in data router middleware', async () => {
    setGlobalOptions({
      permissionField: '_permissions',
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

    acl.set('permissionField', '__acl');
    acl.set({
      permissionField: '_permissions',
      globalPermissions: () => permissions,
    });

    expect(getGlobalOptions().permissionField).toBe('_permissions');
    expect(getGlobalOptions().globalPermissions?.({} as any)).toBe(permissions);
  });

  it('creates a root router through the overloaded createRouter API', () => {
    const router = acl.createRouter({ basePath: '/api', routeGuard: true });

    expect(router).toBeInstanceOf(acl.RootRouter);
    expect(router.routes).toBeDefined();
  });
});
