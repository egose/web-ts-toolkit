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

afterEach(resetGlobalOptions);

// `secret` is granted per-row via an `m::` rule resolved from the
// `docPermissions` hook; `internal.signal` is hook output that grants nothing.
const createExposureApp = async (options: Record<string, unknown>) => {
  const modelName = `AclDocExposureUser${++modelCounter}`;
  const schema = new mongoose.Schema({ name: String, secret: String });
  schema.plugin(permissionsPlugin, { modelName });
  const User = mongoose.model(modelName, schema);

  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => [],
  });

  const router = acl.createRouter(modelName, {
    basePath: '/exposure-users',
    operationAccess: { list: true, read: true },
    modelPermissionPrefix: 'm::',
    permissionSchema: {
      name: { list: true, read: true },
      secret: { list: 'm::view.secret', read: 'm::view.secret' },
    },
    docPermissions: {
      list: () => ({ 'view.secret': true, 'internal.signal': true }),
      read: () => ({ 'view.secret': true, 'internal.signal': true }),
    },
    ...(options as object),
  });
  const rootRouter = acl.createRouter({ basePath: '/root', operationAccess: true });

  await User.create([{ name: 'alpha', secret: 's1' }]); // pragma: allowlist secret

  const app = express();
  app.use(express.json());
  app.use(router.routes);
  app.use(rootRouter.routes);

  return { app, modelName };
};

describe('exposedDocPermissionKeys', () => {
  it('exposes the full hook map by default', async () => {
    const { app } = await createExposureApp({});

    const list = await request(app).get('/exposure-users?include_permissions=true').expect(200);
    expect(list.body.data[0]._permissions).toMatchObject({
      'view.secret': true,
      'internal.signal': true,
      _view: { name: true, secret: true },
    });

    const read = await request(app).post('/exposure-users/__query/__filter').send({ filter: {} }).expect(200);
    expect(read.body._permissions).toMatchObject({ 'view.secret': true, 'internal.signal': true });
  });

  it('keeps view/edit plus allowlisted keys while still enforcing hidden grants', async () => {
    const { app, modelName } = await createExposureApp({ exposedDocPermissionKeys: ['view.secret'] });

    const list = await request(app).get('/exposure-users?include_permissions=true').expect(200);
    expect(list.body.data[0]._permissions).toEqual({
      'view.secret': true,
      _view: { name: true, secret: true },
      _edit: { $: '_' },
    });
    // The grant still took effect even though sibling keys are hidden.
    expect(list.body.data[0].secret).toBe('s1');

    const read = await request(app).post('/exposure-users/__query/__filter').send({ filter: {} }).expect(200);
    expect(read.body._permissions).toEqual({
      'view.secret': true,
      _view: { name: true, secret: true },
      _edit: { $: '_' },
    });
    expect(read.body.secret).toBe('s1');

    const rootList = await request(app)
      .post('/root')
      .send([
        {
          target: 'model',
          name: modelName,
          op: 'list',
          args: {},
          options: { includePermissions: true },
        },
      ])
      .expect(200);
    expect(rootList.body[0].result.data[0]._permissions).toEqual({
      'view.secret': true,
      _view: { name: true, secret: true },
      _edit: { $: '_' },
    });
  });

  it('empty allowlist exposes only _view/_edit without weakening enforcement', async () => {
    const { app } = await createExposureApp({ exposedDocPermissionKeys: [] });

    const list = await request(app).get('/exposure-users?include_permissions=true').expect(200);
    expect(list.body.data[0]._permissions).toEqual({
      _view: { name: true, secret: true },
      _edit: { $: '_' },
    });
    expect(list.body.data[0].secret).toBe('s1');
  });
});
