import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import acl, { setGlobalOptions } from '../dist/index.mjs';

let modelCounter = 0;

const resetGlobalOptions = () => {
  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => ({}),
  });
};

const createUserApp = ({
  globalPermissions,
  validate,
}: {
  globalPermissions: (req: express.Request) => any;
  validate?: any;
}) => {
  const modelName = `AclUserModel${++modelCounter}`;
  const schema = new mongoose.Schema({
    name: String,
    role: String,
    public: Boolean,
  });

  const User = mongoose.model(modelName, schema);
  const createSpy = vi.spyOn(User, 'create').mockImplementation(async (docs: any) => {
    return docs.map((doc) => new User(doc));
  });

  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions,
  });

  const router = acl.createRouter(modelName, {
    basePath: '/users',
    routeGuard: {
      create: 'isAdmin',
    },
    permissionSchema: {
      name: { create: true, read: true },
      role: { create: true, read: true },
      public: { create: true, read: true },
    },
    validate: {
      create: validate,
    },
  });

  const app = express();
  app.use(express.json());
  app.use(router.routes);

  return { app, createSpy };
};

afterEach(() => {
  vi.restoreAllMocks();
  resetGlobalOptions();
  mongoose.deleteModel(/AclUserModel.*/);
});

describe('model router', () => {
  it.each([
    ['array', (req: express.Request) => (req.headers.user === 'admin' ? ['isAdmin'] : [])],
    ['string', (req: express.Request) => (req.headers.user === 'admin' ? 'isAdmin' : null)],
    ['object', (req: express.Request) => (req.headers.user === 'admin' ? { isAdmin: true } : {})],
  ])('accepts %s-based global permissions on create routes', async (_label, globalPermissions) => {
    const { app, createSpy } = createUserApp({
      globalPermissions,
      validate: true,
    });

    const response = await request(app)
      .post('/users?include_permissions=false')
      .set('user', 'admin')
      .send({ name: 'user1', role: 'user', public: false })
      .expect(201)
      .expect('Content-Type', /json/);

    expect(createSpy).toHaveBeenCalledOnce();
    expect(response.body).toMatchObject({
      name: 'user1',
      role: 'user',
      public: false,
    });
  });

  it('rejects create requests when validate.create is false', async () => {
    const { app, createSpy } = createUserApp({
      globalPermissions: () => ['isAdmin'],
      validate: false,
    });

    const response = await request(app)
      .post('/users?include_permissions=false')
      .set('user', 'admin')
      .send({ name: 'user-validate-err1', role: 'user', public: false })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    expect(createSpy).not.toHaveBeenCalled();
    expect(response.body).toMatchObject({
      title: 'Bad Request',
      detail: 'Bad Request',
      status: 400,
      errors: [],
    });
  });

  it('returns explicit validation errors from array-based validators', async () => {
    const { app, createSpy } = createUserApp({
      globalPermissions: () => ['isAdmin'],
      validate: ['error1', 'error2'],
    });

    const response = await request(app)
      .post('/users?include_permissions=false')
      .set('user', 'admin')
      .send({ name: 'user-validate-err2', role: 'user', public: false })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    expect(createSpy).not.toHaveBeenCalled();
    expect(response.body).toMatchObject({
      title: 'Bad Request',
      detail: 'Bad Request',
      status: 400,
      errors: ['error1', 'error2'],
    });
  });

  it('runs function validators with the request context', async () => {
    const validate = vi.fn(function (data) {
      return this.actor === 'admin' && data.name === 'user-validate-ok' ? [] : ['invalid actor'];
    });

    const { app, createSpy } = createUserApp({
      globalPermissions(req: express.Request) {
        (req as express.Request & { actor?: string }).actor = String(req.headers.user ?? '');
        return req.headers.user === 'admin' ? 'isAdmin' : null;
      },
      validate,
    });

    const response = await request(app)
      .post('/users?include_permissions=false')
      .set('user', 'admin')
      .send({ name: 'user-validate-ok', role: 'user', public: false })
      .expect(201)
      .expect('Content-Type', /json/);

    expect(validate).toHaveBeenCalledOnce();
    expect(createSpy).toHaveBeenCalledOnce();
    expect(response.body).toMatchObject({
      name: 'user-validate-ok',
      role: 'user',
      public: false,
    });
  });

  it.each([true, [], null])('allows create requests for pass-through validators: %j', async (validate) => {
    const { app, createSpy } = createUserApp({
      globalPermissions: () => ({ isAdmin: true }),
      validate,
    });

    const response = await request(app)
      .post('/users?include_permissions=false')
      .set('user', 'admin')
      .send({ name: `user-${String(validate)}`, role: 'user', public: false })
      .expect(201)
      .expect('Content-Type', /json/);

    expect(createSpy).toHaveBeenCalledOnce();
    expect(response.body.role).toBe('user');
  });
});
