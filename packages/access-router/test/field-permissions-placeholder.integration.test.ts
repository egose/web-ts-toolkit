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

const createPlaceholderApp = async () => {
  const modelName = `AclPermPlaceholderUser${++modelCounter}`;
  const schema = new mongoose.Schema({ name: String, secret: String });
  schema.plugin(permissionsPlugin, { modelName });
  const User = mongoose.model(modelName, schema);

  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions(req: express.Request) {
      return req.headers.user === 'admin' ? ['isAdmin'] : [];
    },
  });

  const router = acl.createRouter(modelName, {
    basePath: '/perm-placeholder-users',
    operationAccess: { list: true, read: true },
    permissionSchema: {
      name: { list: 'isAdmin', read: 'isAdmin' },
      secret: { list: 'isAdmin', read: 'isAdmin' },
    },
  });

  await User.create([{ name: 'alpha', secret: 's1' }]); // pragma: allowlist secret

  const app = express();
  app.use(express.json());
  app.use(router.routes);

  return { app };
};

describe('field permission empty-grant placeholder', () => {
  it('shows the non-empty placeholder on lean list rows with no grants', async () => {
    const { app } = await createPlaceholderApp();

    const res = await request(app).get('/perm-placeholder-users?include_permissions=true').expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).not.toHaveProperty('secret');
    expect(res.body.data[0]).not.toHaveProperty('name');
    expect(res.body.data[0]._permissions).toEqual({ _view: { $: '_' }, _edit: { $: '_' } });
  });

  it('shows the non-empty placeholder on non-lean reads with no grants', async () => {
    const { app } = await createPlaceholderApp();

    const res = await request(app).post('/perm-placeholder-users/__query/__filter').send({ filter: {} }).expect(200);
    expect(res.body).not.toHaveProperty('secret');
    expect(res.body._permissions).toEqual({ _view: { $: '_' }, _edit: { $: '_' } });
  });

  it('leaves non-empty grant maps untouched', async () => {
    const { app } = await createPlaceholderApp();

    const list = await request(app)
      .get('/perm-placeholder-users?include_permissions=true')
      .set('user', 'admin')
      .expect(200);
    expect(list.body.data[0]._permissions._view).toEqual({ name: true, secret: true });
    expect(list.body.data[0]._permissions._edit).toEqual({ $: '_' });

    const read = await request(app)
      .post('/perm-placeholder-users/__query/__filter')
      .set('user', 'admin')
      .send({ filter: {} })
      .expect(200);
    expect(read.body._permissions._view).toEqual({ name: true, secret: true });
  });
});
