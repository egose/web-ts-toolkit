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

type PostureOptions = {
  prefix: string;
  stripPermissionsField?: boolean;
  disableFieldPermissions?: boolean;
  defaults?: {
    publicListOptions?: { includePermissions?: boolean; includeFieldPermissions?: boolean };
  };
};

// Same grant shape as the field-permissions opt-out fixture: `secret` is
// granted per-row via an `m::` rule resolved from the `docPermissions` hook.
const createPostureApp = async ({
  prefix,
  stripPermissionsField,
  disableFieldPermissions,
  defaults,
}: PostureOptions) => {
  const modelName = `${prefix}${++modelCounter}`;
  const schema = new mongoose.Schema({ name: String, secret: String });
  schema.plugin(permissionsPlugin, { modelName });
  const User = mongoose.model(modelName, schema);

  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => [],
  });

  // Unique basePath per router: the shared OpenAPI registry rejects duplicate
  // method+path registrations within one test (cleared between tests).
  const basePath = `/posture-${modelName.toLowerCase()}`;
  const router = acl.createRouter(modelName, {
    basePath,
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
    ...(stripPermissionsField !== undefined ? { stripPermissionsField } : {}),
    ...(disableFieldPermissions !== undefined ? { disableFieldPermissions } : {}),
    ...(defaults !== undefined ? { defaults } : {}),
  });
  const rootRouter = acl.createRouter({ basePath: '/root', operationAccess: true });

  const created = await User.create([{ name: 'alpha', secret: 's1' }]); // pragma: allowlist secret

  const app = express();
  app.use(express.json());
  app.use(router.routes);
  app.use(rootRouter.routes);

  return { app, modelName, basePath, id: String(created[0]._id) };
};

describe('stripPermissionsField', () => {
  it('list ignores client flags and removes the permissions field entirely', async () => {
    const { app, basePath } = await createPostureApp({ prefix: 'AclPostureStrip', stripPermissionsField: true });

    const res = await request(app)
      .get(`${basePath}?include_permissions=true&include_field_permissions=true`)
      .expect(200);
    expect(res.body.data[0]).not.toHaveProperty('_permissions');
    expect(res.body.data[0].name).toBe('alpha');
    // Data filtering still follows includePermissions:false semantics.
    expect(res.body.data[0]).not.toHaveProperty('secret');
  });

  it('read still enforces grants but strips permission metadata', async () => {
    const { app, basePath } = await createPostureApp({ prefix: 'AclPostureStrip', stripPermissionsField: true });

    const res = await request(app).post(`${basePath}/__query/__filter`).send({ filter: {} }).expect(200);
    expect(res.body).not.toHaveProperty('_permissions');
    // Enforcement ran (doc grants computed under skim:false): secret is granted.
    expect(res.body.secret).toBe('s1');
  });

  it('create and update ignore client flags and strip the field', async () => {
    const { app, basePath, id } = await createPostureApp({
      prefix: 'AclPostureStrip',
      stripPermissionsField: true,
    });

    const created = await request(app)
      .post(`${basePath}?include_permissions=true&include_field_permissions=true`)
      .send({ name: 'beta', secret: 's2' }) // pragma: allowlist secret
      .expect(201);
    expect(created.body).not.toHaveProperty('_permissions');

    const updated = await request(app)
      .patch(`${basePath}/${id}?include_permissions=true&include_field_permissions=true`)
      .send({ name: 'renamed' })
      .expect(200);
    expect(updated.body).not.toHaveProperty('_permissions');
    expect(updated.body.name).toBe('renamed');
  });

  it('per-operation defaults cannot re-enable permission output', async () => {
    const { app, basePath } = await createPostureApp({
      prefix: 'AclPostureStrip',
      stripPermissionsField: true,
      defaults: { publicListOptions: { includePermissions: true, includeFieldPermissions: true } },
    });

    const res = await request(app).get(basePath).expect(200);
    expect(res.body.data[0]).not.toHaveProperty('_permissions');
  });

  it('root batch options cannot re-enable permission output', async () => {
    const { app, modelName } = await createPostureApp({ prefix: 'AclPostureStrip', stripPermissionsField: true });

    const res = await request(app)
      .post('/root')
      .send([
        {
          target: 'model',
          name: modelName,
          op: 'list',
          args: {},
          options: { includePermissions: true, includeFieldPermissions: true },
        },
      ])
      .expect(200);
    expect(res.body[0].result.data[0]).not.toHaveProperty('_permissions');
  });
});

describe('disableFieldPermissions', () => {
  it('list keeps doc hook keys but never emits field maps', async () => {
    const { app, basePath } = await createPostureApp({ prefix: 'AclPostureDisable', disableFieldPermissions: true });

    const res = await request(app)
      .get(`${basePath}?include_permissions=true&include_field_permissions=true`)
      .expect(200);
    expect(res.body.data[0]._permissions).toEqual({ 'view.secret': true });
    expect(res.body.data[0].secret).toBe('s1');
  });

  it('read and update keep doc hook keys but never emit field maps', async () => {
    const { app, basePath, id } = await createPostureApp({
      prefix: 'AclPostureDisable',
      disableFieldPermissions: true,
    });

    const read = await request(app)
      .post(`${basePath}/__query/__filter`)
      .send({ filter: {}, options: { includePermissions: true, includeFieldPermissions: true } })
      .expect(200);
    expect(read.body._permissions).toEqual({ 'view.secret': true });

    const updated = await request(app)
      .patch(`${basePath}/${id}?include_permissions=true&include_field_permissions=true`)
      .send({ name: 'renamed' })
      .expect(200);
    expect(updated.body._permissions).toEqual({ 'view.secret': true });
  });

  it('client field flags stay disabled even when owner defaults enable permissions', async () => {
    const { app, basePath } = await createPostureApp({
      prefix: 'AclPostureDisable',
      disableFieldPermissions: true,
      defaults: { publicListOptions: { includePermissions: true } },
    });

    // Owner defaults turn doc permissions on; the posture still forces field maps off.
    const res = await request(app).get(basePath).expect(200);
    expect(res.body.data[0]._permissions).toEqual({ 'view.secret': true });

    // Without owner defaults, an explicit client field flag is still ignored:
    // both flags resolve false, so the placeholder wipe applies.
    const plain = await createPostureApp({ prefix: 'AclPostureDisable', disableFieldPermissions: true });
    const explicit = await request(plain.app).get(`${plain.basePath}?include_field_permissions=true`).expect(200);
    expect(explicit.body.data[0]._permissions).toEqual({ _view: { $: '_' }, _edit: { $: '_' } });
  });

  it('root batch field flags are ignored', async () => {
    const { app, modelName } = await createPostureApp({ prefix: 'AclPostureDisable', disableFieldPermissions: true });

    const res = await request(app)
      .post('/root')
      .send([
        {
          target: 'model',
          name: modelName,
          op: 'list',
          args: {},
          options: { includePermissions: true, includeFieldPermissions: true },
        },
      ])
      .expect(200);
    expect(res.body[0].result.data[0]._permissions).toEqual({ 'view.secret': true });
  });
});
