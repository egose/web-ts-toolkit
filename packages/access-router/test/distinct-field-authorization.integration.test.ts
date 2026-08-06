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
      secret: false,
    },
  });

  await User.create([
    { name: 'admin-user', role: 'admin', public: false, secret: 'topsecret-1' },
    { name: 'public-user', role: 'user', public: true, secret: 'topsecret-2' },
    { name: 'private-user', role: 'user', public: false, secret: 'topsecret-3' },
  ]);

  const app = express();
  app.use(express.json());
  app.use(router.routes);

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
});
