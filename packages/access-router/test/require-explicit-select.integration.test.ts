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

const createRequireSelectApp = async (options: Record<string, unknown>) => {
  const modelName = `AclRequireSelectUser${++modelCounter}`;
  const schema = new mongoose.Schema({ name: String, secret: String });
  schema.plugin(permissionsPlugin, { modelName });
  const User = mongoose.model(modelName, schema);

  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => [],
  });

  const router = acl.createRouter(modelName, {
    basePath: '/require-select-users',
    operationAccess: { list: true, read: true },
    permissionSchema: {
      name: { list: true, read: true },
      secret: { list: true, read: true },
    },
    ...(options as object),
  });
  const rootRouter = acl.createRouter({ basePath: '/root', operationAccess: true });

  await User.create([
    { name: 'alpha', secret: 's1' }, // pragma: allowlist secret
    { name: 'bravo', secret: 's2' }, // pragma: allowlist secret
  ]);

  const app = express();
  app.use(express.json());
  app.use(router.routes);
  app.use(rootRouter.routes);

  return { app, modelName };
};

describe('requireExplicitSelect', () => {
  it('returns field-less list rows when select is omitted', async () => {
    const { app } = await createRequireSelectApp({ requireExplicitSelect: true });

    const res = await request(app).post('/require-select-users/__query').send({}).expect(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.returnedCount).toBe(2);
    for (const row of res.body.data) {
      expect(Object.keys(row).sort()).toEqual(['_id', '_permissions']);
      expect(row._permissions).toEqual({ _view: { $: '_' }, _edit: { $: '_' } });
    }
  });

  it('still attaches the permission field when requested', async () => {
    const { app } = await createRequireSelectApp({ requireExplicitSelect: true });

    const res = await request(app)
      .post('/require-select-users/__query')
      .send({ options: { includePermissions: true } })
      .expect(200);
    expect(res.body.data).toHaveLength(2);
    for (const row of res.body.data) {
      expect(Object.keys(row).sort()).toEqual(['_id', '_permissions']);
      expect(row._permissions._view).toEqual({ name: true, secret: true });
    }
  });

  it('returns a field-less document on read when select is omitted', async () => {
    const { app } = await createRequireSelectApp({ requireExplicitSelect: true });

    const res = await request(app).post('/require-select-users/__query/__filter').send({ filter: {} }).expect(200);
    // Public read includes permissions by default.
    expect(Object.keys(res.body).sort()).toEqual(['_id', '_permissions']);
    expect(res.body._permissions._view).toEqual({ name: true, secret: true });
  });

  it('honors an explicit select for list and read', async () => {
    const { app } = await createRequireSelectApp({ requireExplicitSelect: true });

    const list = await request(app)
      .post('/require-select-users/__query')
      .send({ select: ['name'] })
      .expect(200);
    expect(list.body.data[0]).toMatchObject({ name: expect.any(String) });
    expect(list.body.data[0]).not.toHaveProperty('secret');

    const read = await request(app)
      .post('/require-select-users/__query/__filter')
      .send({ filter: {}, select: ['name'] })
      .expect(200);
    expect(read.body).toMatchObject({ name: expect.any(String) });
    expect(read.body).not.toHaveProperty('secret');
  });

  it('supports select via query string on plain GET list and read', async () => {
    const { app } = await createRequireSelectApp({ requireExplicitSelect: true });

    const bareList = await request(app).get('/require-select-users').expect(200);
    expect(bareList.body.data).toHaveLength(2);
    for (const row of bareList.body.data) {
      expect(row).not.toHaveProperty('name');
      expect(row).not.toHaveProperty('secret');
    }

    const selectedList = await request(app).get('/require-select-users?select=name,secret').expect(200);
    expect(selectedList.body.data[0]).toMatchObject({ name: expect.any(String), secret: expect.any(String) });

    const spacedList = await request(app).get('/require-select-users?select=name%20secret').expect(200);
    expect(spacedList.body.data[0]).toMatchObject({ name: expect.any(String), secret: expect.any(String) });

    const docId = bareList.body.data[0]._id;
    const bareRead = await request(app).get(`/require-select-users/${docId}`).expect(200);
    expect(bareRead.body).not.toHaveProperty('name');
    expect(bareRead.body).not.toHaveProperty('secret');

    const selectedRead = await request(app).get(`/require-select-users/${docId}?select=name`).expect(200);
    expect(selectedRead.body).toMatchObject({ name: expect.any(String) });
    expect(selectedRead.body).not.toHaveProperty('secret');
  });

  it('supports select via query string without the flag', async () => {
    const { app } = await createRequireSelectApp({});

    const selectedList = await request(app).get('/require-select-users?select=name').expect(200);
    expect(selectedList.body.data[0]).toMatchObject({ name: expect.any(String) });
    expect(selectedList.body.data[0]).not.toHaveProperty('secret');

    const docId = selectedList.body.data[0]._id;
    const selectedRead = await request(app).get(`/require-select-users/${docId}?select=name`).expect(200);
    expect(selectedRead.body).toMatchObject({ name: expect.any(String) });
    expect(selectedRead.body).not.toHaveProperty('secret');
  });

  it('returns full rows by default when the option is off', async () => {
    const { app } = await createRequireSelectApp({});

    const list = await request(app).post('/require-select-users/__query').send({}).expect(200);
    expect(list.body.data.map((row: { name: string }) => row.name).sort()).toEqual(['alpha', 'bravo']);
    expect(list.body.data[0]).toMatchObject({ secret: expect.any(String) });

    const read = await request(app).post('/require-select-users/__query/__filter').send({ filter: {} }).expect(200);
    expect(read.body).toMatchObject({ name: expect.any(String), secret: expect.any(String) });
  });

  it('prefers backend defaults over the empty projection', async () => {
    const { app } = await createRequireSelectApp({
      requireExplicitSelect: true,
      defaults: { publicListArgs: { select: ['name'] } },
    });

    const res = await request(app).post('/require-select-users/__query').send({}).expect(200);
    expect(res.body.data[0]).toMatchObject({ name: expect.any(String) });
    expect(res.body.data[0]).not.toHaveProperty('secret');
  });

  it('applies to root batch entries without select', async () => {
    const { app, modelName } = await createRequireSelectApp({ requireExplicitSelect: true });

    const res = await request(app)
      .post('/root')
      .send([{ target: 'model', name: modelName, op: 'list', args: {} }])
      .expect(200);
    expect(res.body[0].result.success).toBe(true);
    for (const row of res.body[0].result.data) {
      expect(row).not.toHaveProperty('name');
      expect(row).not.toHaveProperty('secret');
    }
  });
});
