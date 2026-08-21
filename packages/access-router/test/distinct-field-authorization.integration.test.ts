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

const createDistinctAuthApp = async () => {
  const modelName = `AclMongoDistinctUser${++modelCounter}`;
  const schema = new mongoose.Schema({
    name: String,
    role: String,
    public: Boolean,
    profile: {
      public: String,
      secret: String,
    },
    secret: {
      type: String,
      default: 'confidential',
    },
  });

  schema.plugin(permissionsPlugin, { modelName });

  const User = mongoose.model(modelName, schema);

  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => [],
  });

  const router = acl.createRouter(modelName, {
    basePath: '/distinct-users',
    operationAccess: {
      list: true,
      read: true,
      distinct: true,
    },
    permissionSchema: {
      name: true,
      role: true,
      public: true,
      'profile.public': true,
      'profile.secret': false,
      secret: false,
    },
  });

  await User.create([
    {
      name: 'admin-user',
      role: 'admin',
      public: false,
      profile: { public: 'visible-admin', secret: 'hidden-profile-1' }, // pragma: allowlist secret
      secret: 'topsecret-1', // pragma: allowlist secret
    },
    {
      name: 'public-user',
      role: 'user',
      public: true,
      profile: { public: 'visible-user', secret: 'hidden-profile-2' }, // pragma: allowlist secret
      secret: 'topsecret-2', // pragma: allowlist secret
    },
    {
      name: 'private-user',
      role: 'user',
      public: false,
      profile: { public: 'visible-private', secret: 'hidden-profile-3' }, // pragma: allowlist secret
      secret: 'topsecret-3', // pragma: allowlist secret
    },
  ]);

  const rootRouter = acl.createRouter({ basePath: '/distinct-root', operationAccess: true });

  const app = express();
  app.use(express.json());
  app.use(router.routes);
  app.use(rootRouter.routes);

  return { app, modelName };
};

afterEach(() => {
  resetGlobalOptions();
  mongoose.deleteModel(/AclMongoDistinctUser.*/);
});

describe('distinct field authorization (AR-03)', () => {
  it('allows distinct on a field permitted for read', async () => {
    const { app } = await createDistinctAuthApp();

    const response = await request(app).get('/distinct-users/distinct/role').expect(200).expect('Content-Type', /json/);

    expect(response.body.sort()).toEqual(['admin', 'user']);
  });

  it('rejects distinct on a field denied by field policy', async () => {
    const { app } = await createDistinctAuthApp();

    const response = await request(app)
      .get('/distinct-users/distinct/secret')
      .expect('Content-Type', /application\/problem\+json/);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      status: 403,
      errors: expect.arrayContaining([expect.objectContaining({ detail: expect.stringContaining('secret') })]),
    });
  });

  it('rejects distinct with $-prefixed operator paths', async () => {
    const { app } = await createDistinctAuthApp();

    const response = await request(app)
      .get('/distinct-users/distinct/$where')
      .expect('Content-Type', /application\/problem\+json/);

    expect(response.status).toBe(400);
  });

  it('rejects distinct with traversal-dot paths', async () => {
    const { app } = await createDistinctAuthApp();

    const response = await request(app)
      .get('/distinct-users/distinct/name..role')
      .expect('Content-Type', /application\/problem\+json/);

    expect(response.status).toBe(400);
  });

  it('rejects distinct on an unknown field', async () => {
    const { app } = await createDistinctAuthApp();

    const response = await request(app)
      .get('/distinct-users/distinct/nonexistent')
      .expect('Content-Type', /application\/problem\+json/);

    expect(response.status).toBe(403);
  });

  it('rejects distinct with whitespace-embedded fields', async () => {
    const { app } = await createDistinctAuthApp();

    const response = await request(app)
      .get('/distinct-users/distinct/role%20')
      .expect('Content-Type', /application\/problem\+json/);

    expect(response.status).toBe(400);
  });

  it('rejects distinct with nested field path under public fields (deny by default)', async () => {
    const { app } = await createDistinctAuthApp();

    const response = await request(app)
      .get('/distinct-users/distinct/secret.value')
      .expect('Content-Type', /application\/problem\+json/);

    expect(response.status).toBe(403);
  });

  it('rejects distinct on an object parent when only a child field is allowed', async () => {
    const { app } = await createDistinctAuthApp();

    const response = await request(app)
      .get('/distinct-users/distinct/profile')
      .expect('Content-Type', /application\/problem\+json/);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      status: 403,
      errors: expect.arrayContaining([expect.objectContaining({ detail: expect.stringContaining('profile') })]),
    });
    expect(JSON.stringify(response.body)).not.toContain('hidden-profile');
  });

  it('allows distinct on an explicitly allowed nested child through direct GET and POST routes', async () => {
    const { app } = await createDistinctAuthApp();

    const getResponse = await request(app)
      .get('/distinct-users/distinct/profile.public')
      .expect(200)
      .expect('Content-Type', /json/);
    expect(getResponse.body.sort()).toEqual(['visible-admin', 'visible-private', 'visible-user']);
    expect(JSON.stringify(getResponse.body)).not.toContain('hidden-profile');

    const postResponse = await request(app)
      .post('/distinct-users/distinct/profile.public')
      .send({ filter: { role: 'user' } })
      .expect(200)
      .expect('Content-Type', /json/);
    expect(postResponse.body.sort()).toEqual(['visible-private', 'visible-user']);
    expect(JSON.stringify(postResponse.body)).not.toContain('hidden-profile');
  });

  it('enforces exact nested distinct authorization through root operations', async () => {
    const { app, modelName } = await createDistinctAuthApp();

    const response = await request(app)
      .post('/distinct-root')
      .send([
        { target: 'model', name: modelName, op: 'distinct', field: 'profile' },
        { target: 'model', name: modelName, op: 'distinct', field: 'profile.secret' },
        { target: 'model', name: modelName, op: 'distinct', field: 'profile.public' },
      ])
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body[0]).toMatchObject({ statusCode: 403, result: { success: false, code: 'forbidden' } });
    expect(response.body[1]).toMatchObject({ statusCode: 403, result: { success: false, code: 'forbidden' } });
    expect(response.body[2]).toMatchObject({ statusCode: 200, result: { success: true, code: 'success' } });
    expect(response.body[2].result.data.sort()).toEqual(['visible-admin', 'visible-private', 'visible-user']);
    expect(JSON.stringify(response.body)).not.toContain('hidden-profile');
  });
});
