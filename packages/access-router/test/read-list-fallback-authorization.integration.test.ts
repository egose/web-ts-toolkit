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

const createFallbackApp = async () => {
  const modelName = `AclReadListFallbackUser${++modelCounter}`;
  const schema = new mongoose.Schema({
    name: String,
    tenant: String,
    secret: String,
    profile: Object,
  });

  schema.plugin(permissionsPlugin, { modelName });
  const User = mongoose.model(modelName, schema);

  let listDecorateCalls = 0;

  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions(req: express.Request) {
      return String(req.headers['x-perms'] ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    },
  });

  const router = acl.createRouter(modelName, {
    basePath: '/fallback-users',
    operationAccess: {
      list: 'canList',
      read: true,
    },
    permissionSchema: {
      name: { read: true, list: true },
      tenant: { read: true, list: true },
      secret: { read: false, list: true },
      profile: { read: false, list: true },
    },
    baseFilter: {
      read: () => ({ tenant: 'read' }),
      list: () => ({ tenant: 'list' }),
    },
    decorate: {
      list(doc) {
        listDecorateCalls += 1;
        return { ...doc, decoratedByList: true };
      },
    },
  });

  const rootRouter = acl.createRouter({ basePath: '/root', operationAccess: true });
  const doc = await User.create({
    name: 'list-only',
    tenant: 'list',
    secret: 'list-secret', // pragma: allowlist secret
    profile: { _id: 'profile-1', label: 'Profile One' },
  });

  router.router.get('/internal/read-filter', async (req, res) => {
    const result = await req.macl.getPublicService(modelName)._readFilter({ name: 'list-only' });
    res.status(result.success ? 200 : 401).json(result);
  });

  const app = express();
  app.use(express.json());
  app.use(router.routes);
  app.use(rootRouter.routes);

  return {
    app,
    docId: String(doc._id),
    modelName,
    getListDecorateCalls: () => listDecorateCalls,
  };
};

afterEach(() => {
  resetGlobalOptions();
  mongoose.deleteModel(/AclReadListFallbackUser.*/);
});

describe('read-to-list fallback authorization', () => {
  it('blocks direct id fallback unless list operation access is allowed', async () => {
    const { app, docId, getListDecorateCalls } = await createFallbackApp();

    const response = await request(app)
      .get(`/fallback-users/${docId}`)
      .expect(401)
      .expect('Content-Type', /application\/problem\+json/);

    expect(response.body).toMatchObject({ status: 401, title: 'Unauthorized' });
    expect(getListDecorateCalls()).toBe(0);
  });

  it('blocks direct read-by-filter fallback unless list operation access is allowed', async () => {
    const { app, getListDecorateCalls } = await createFallbackApp();

    const response = await request(app)
      .post('/fallback-users/__query/__filter')
      .send({ filter: { name: 'list-only' }, select: ['secret'] })
      .expect(401)
      .expect('Content-Type', /application\/problem\+json/);

    expect(response.body).toMatchObject({ status: 401, title: 'Unauthorized' });
    expect(getListDecorateCalls()).toBe(0);
  });

  it('blocks root read fallback unless list operation access is allowed', async () => {
    const { app, modelName, docId, getListDecorateCalls } = await createFallbackApp();

    const response = await request(app)
      .post('/root')
      .send([{ target: 'model', name: modelName, op: 'read', id: docId, args: { select: ['secret'] } }])
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body[0]).toMatchObject({
      target: 'model',
      name: modelName,
      op: 'read',
      statusCode: 401,
      result: {
        success: false,
        code: 'unauthorized',
        errors: ['Unauthorized'],
      },
    });
    expect(getListDecorateCalls()).toBe(0);
  });

  it('blocks in-process public-service fallback unless list operation access is allowed', async () => {
    const { app, getListDecorateCalls } = await createFallbackApp();

    const response = await request(app)
      .get('/fallback-users/internal/read-filter')
      .expect(401)
      .expect('Content-Type', /json/);

    expect(response.body).toMatchObject({
      success: false,
      code: 'unauthorized',
      errors: ['Unauthorized'],
    });
    expect(getListDecorateCalls()).toBe(0);
  });

  it('still applies list row, field, include, task, and decorate policy when both operations are allowed', async () => {
    const { app, docId, modelName, getListDecorateCalls } = await createFallbackApp();

    const response = await request(app)
      .post(`/fallback-users/__query/${docId}`)
      .set('x-perms', 'canList')
      .send({
        select: ['name', 'tenant', 'secret', 'profile'],
        include: {
          model: modelName,
          op: 'list',
          path: 'relatedUsers',
          localField: 'tenant',
          foreignField: 'tenant',
          args: { select: ['name', 'tenant', 'secret'] },
        },
        tasks: [{ type: 'COPY_AND_DEPOPULATE', args: [{ src: 'profile', dest: 'copiedProfile' }] }],
      })
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body).toMatchObject({
      name: 'list-only',
      tenant: 'list',
      secret: 'list-secret', // pragma: allowlist secret
      profile: 'profile-1',
      copiedProfile: { _id: 'profile-1', label: 'Profile One' },
      decoratedByList: true,
    });
    expect(response.body.relatedUsers).toEqual([
      expect.objectContaining({ name: 'list-only', tenant: 'list', secret: 'list-secret' }), // pragma: allowlist secret
    ]);
    expect(getListDecorateCalls()).toBe(1);
  });
});
