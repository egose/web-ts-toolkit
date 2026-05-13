import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import acl, { getModelOption, setGlobalOptions } from '../dist/index.mjs';
import type { ModelRouterOptions } from '../src/interfaces';

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
  afterPersist,
}: {
  globalPermissions: (req: express.Request) => unknown;
  validate?: unknown;
  afterPersist?: unknown;
}) => {
  const modelName = `AclUserModel${++modelCounter}`;
  const schema = new mongoose.Schema({
    name: String,
    role: String,
    public: Boolean,
  });

  const User = mongoose.model(modelName, schema);
  const createSpy = vi.spyOn(User, 'create').mockImplementation(async (docs: Array<Record<string, unknown>>) => {
    return docs.map((doc) => new User(doc));
  });

  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions,
  });

  const options: Record<string, unknown> = {
    basePath: '/users',
    operationAccess: {
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
  };

  if (afterPersist !== undefined) {
    options.afterPersist = {
      create: afterPersist,
    };
  }

  const router = acl.createRouter(modelName, options as ModelRouterOptions);

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

  it('runs afterPersist hooks on create routes', async () => {
    const afterPersist = vi.fn((doc) => doc);

    const { app } = createUserApp({
      globalPermissions: () => ['isAdmin'],
      validate: true,
      afterPersist,
    });

    await request(app)
      .post('/users?include_permissions=false')
      .set('user', 'admin')
      .send({ name: 'user-after-persist', role: 'user', public: false })
      .expect(201);

    expect(afterPersist).toHaveBeenCalledOnce();
  });

  it('preserves existing model overrides across partial option updates', () => {
    const modelName = `AclUserModel${++modelCounter}`;
    mongoose.model(
      modelName,
      new mongoose.Schema({
        name: String,
      }),
    );

    acl.setModelOptions(modelName, {
      idField: 'name',
    });

    acl.setModelOptions(modelName, {
      basePath: '/users',
    });

    expect(getModelOption(modelName, 'idField')).toBe('name');
    expect(getModelOption(modelName, 'basePath')).toBe('/users');
  });

  it('falls back from nested keys to default and parent option values', () => {
    const modelName = `AclUserModel${++modelCounter}`;
    mongoose.model(
      modelName,
      new mongoose.Schema({
        name: String,
      }),
    );

    acl.setModelOptions(modelName, {
      alwaysSelectFields: {
        default: ['id'],
        create: ['email'],
      } as unknown as ModelRouterOptions['alwaysSelectFields'],
      operationAccess: true,
    });

    expect(getModelOption(modelName, 'alwaysSelectFields.create')).toEqual(['email']);
    expect(getModelOption(modelName, 'alwaysSelectFields.read')).toEqual(['id']);
    expect(getModelOption(modelName, 'operationAccess.list')).toBe(true);
  });

  it('uses the injected logger for router endpoint logs', () => {
    const modelName = `AclUserModel${++modelCounter}`;
    const info = vi.fn();

    setGlobalOptions({
      requestPermissionField: '_permissions',
      globalPermissions: () => ({}),
      logger: { info },
    });

    mongoose.model(
      modelName,
      new mongoose.Schema({
        name: String,
      }),
    );

    acl.createRouter(modelName, {
      basePath: '/users',
      operationAccess: { list: true, read: true },
      permissionSchema: {
        name: { list: true, read: true },
      },
    });

    expect(info).toHaveBeenCalled();
  });
});
