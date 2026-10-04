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
// `docPermissions` hook; `view.secret` is hook output visible in responses.
const createFieldPermsApp = async () => {
  const modelName = `AclFieldPermsUser${++modelCounter}`;
  const schema = new mongoose.Schema({ name: String, secret: String });
  schema.plugin(permissionsPlugin, { modelName });
  const User = mongoose.model(modelName, schema);

  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => [],
  });

  const router = acl.createRouter(modelName, {
    basePath: '/field-perms-users',
    operationAccess: { list: true, read: true, create: true, update: true },
    modelPermissionPrefix: 'm::',
    permissionSchema: {
      name: { list: true, read: true, create: true, update: true },
      secret: { list: 'm::view.secret', read: 'm::view.secret', create: true, update: 'm::view.secret' },
    },
    docPermissions: {
      list: () => ({ 'view.secret': true }),
      read: () => ({ 'view.secret': true }),
      create: () => ({ 'view.secret': true }),
      update: () => ({ 'view.secret': true }),
    },
  });
  const rootRouter = acl.createRouter({ basePath: '/root', operationAccess: true });

  const created = await User.create([{ name: 'alpha', secret: 's1' }]); // pragma: allowlist secret

  const app = express();
  app.use(express.json());
  app.use(router.routes);
  app.use(rootRouter.routes);

  return { app, modelName, id: String(created[0]._id) };
};

describe('includeFieldPermissions opt-out', () => {
  it('list keeps doc hook keys but omits _view/_edit when field permissions are disabled', async () => {
    const { app } = await createFieldPermsApp();

    const both = await request(app).get('/field-perms-users?include_permissions=true').expect(200);
    expect(both.body.data[0]._permissions).toMatchObject({
      'view.secret': true,
      _view: { name: true, secret: true },
    });
    expect(both.body.data[0]._permissions).toHaveProperty('_edit');

    const docOnly = await request(app)
      .get('/field-perms-users?include_permissions=true&include_field_permissions=false')
      .expect(200);
    expect(docOnly.body.data[0]._permissions).toEqual({ 'view.secret': true });
    expect(docOnly.body.data[0].secret).toBe('s1');
  });

  it('list preserves the placeholder-only wipe when includePermissions is false', async () => {
    const { app } = await createFieldPermsApp();

    const wiped = await request(app).get('/field-perms-users?include_permissions=false').expect(200);
    expect(wiped.body.data[0]._permissions).toEqual({ _view: { $: '_' }, _edit: { $: '_' } });

    // Public list defaults resolve to includePermissions: false.
    const defaults = await request(app).get('/field-perms-users').expect(200);
    expect(defaults.body.data[0]._permissions).toEqual({ _view: { $: '_' }, _edit: { $: '_' } });
  });

  it('list computes identical field permissions when only includeFieldPermissions is true', async () => {
    const { app } = await createFieldPermsApp();

    const both = await request(app).get('/field-perms-users?include_permissions=true').expect(200);
    const fieldOnly = await request(app)
      .get('/field-perms-users?include_permissions=false&include_field_permissions=true')
      .expect(200);
    // Requested field maps compute doc grants as input (even under skim), so
    // the output matches includePermissions: true exactly.
    expect(fieldOnly.body.data[0]._permissions).toEqual(both.body.data[0]._permissions);
    expect(fieldOnly.body.data[0]._permissions).toMatchObject({
      'view.secret': true,
      _view: { name: true, secret: true },
    });
  });

  it('read honors includeFieldPermissions via advanced body options', async () => {
    const { app } = await createFieldPermsApp();

    const both = await request(app)
      .post('/field-perms-users/__query/__filter')
      .send({ filter: {}, options: { includePermissions: true } })
      .expect(200);
    expect(both.body._permissions).toMatchObject({ 'view.secret': true, _view: { name: true, secret: true } });

    const docOnly = await request(app)
      .post('/field-perms-users/__query/__filter')
      .send({ filter: {}, options: { includePermissions: true, includeFieldPermissions: false } })
      .expect(200);
    expect(docOnly.body._permissions).toEqual({ 'view.secret': true });
    expect(docOnly.body.secret).toBe('s1');

    const fieldOnly = await request(app)
      .post('/field-perms-users/__query/__filter')
      .send({ filter: {}, options: { includePermissions: false, includeFieldPermissions: true } })
      .expect(200);
    // Same input-computation rule as list: output matches includePermissions: true.
    expect(fieldOnly.body._permissions).toEqual(both.body._permissions);

    // Read defaults resolve to includePermissions: true, so the field maps follow.
    const defaults = await request(app).post('/field-perms-users/__query/__filter').send({ filter: {} }).expect(200);
    expect(defaults.body._permissions).toMatchObject({ 'view.secret': true, _view: { name: true } });
  });

  it('create honors includeFieldPermissions via query params', async () => {
    const { app } = await createFieldPermsApp();

    const docOnly = await request(app)
      .post('/field-perms-users?include_permissions=true&include_field_permissions=false')
      .send({ name: 'beta', secret: 's2' }) // pragma: allowlist secret
      .expect(201);
    expect(docOnly.body._permissions).toEqual({ 'view.secret': true });

    const both = await request(app).post('/field-perms-users').send({ name: 'gamma', secret: 's3' }).expect(201); // pragma: allowlist secret
    expect(both.body._permissions).toMatchObject({ 'view.secret': true });
    expect(both.body._permissions).toHaveProperty('_view');

    const fieldOnly = await request(app)
      .post('/field-perms-users?include_permissions=false&include_field_permissions=true')
      .send({ name: 'delta', secret: 's4' }) // pragma: allowlist secret
      .expect(201);
    expect(fieldOnly.body._permissions).toEqual(both.body._permissions);
  });

  it('update honors includeFieldPermissions via query params', async () => {
    const { app, id } = await createFieldPermsApp();

    const docOnly = await request(app)
      .patch(`/field-perms-users/${id}?include_permissions=true&include_field_permissions=false`)
      .send({ name: 'renamed' })
      .expect(200);
    expect(docOnly.body._permissions).toEqual({ 'view.secret': true });
    expect(docOnly.body.name).toBe('renamed');

    const both = await request(app).patch(`/field-perms-users/${id}`).send({ name: 'renamed-again' }).expect(200);
    expect(both.body._permissions).toMatchObject({ 'view.secret': true });
    expect(both.body._permissions).toHaveProperty('_view');

    const fieldOnly = await request(app)
      .patch(`/field-perms-users/${id}?include_permissions=false&include_field_permissions=true`)
      .send({ name: 'renamed-final' })
      .expect(200);
    expect(fieldOnly.body._permissions).toEqual(both.body._permissions);
  });

  it('root batch passes includeFieldPermissions through to the model service', async () => {
    const { app, modelName } = await createFieldPermsApp();

    const res = await request(app)
      .post('/root')
      .send([
        {
          target: 'model',
          name: modelName,
          op: 'list',
          args: {},
          options: { includePermissions: true, includeFieldPermissions: false },
        },
      ])
      .expect(200);
    expect(res.body[0].result.data[0]._permissions).toEqual({ 'view.secret': true });
  });
});
