import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import acl, { createAccessRuntime, permissionsPlugin, setGlobalOptions } from '../dist/index.mjs';
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

const seedDocs = [
  { name: 'alpha', publicRank: 2, secretRank: 1 },
  { name: 'bravo', publicRank: 1, secretRank: 3 },
  { name: 'charlie', publicRank: 1, secretRank: 2 },
];

const createSortOptionsApp = async (options: Record<string, unknown>) => {
  const modelName = `AclSortOptionsUser${++modelCounter}`;
  let findCalls = 0;
  let findOneCalls = 0;

  const schema = new mongoose.Schema({
    name: String,
    publicRank: Number,
    secretRank: Number,
  });

  schema.pre('find', function () {
    findCalls += 1;
  });
  schema.pre('findOne', function () {
    findOneCalls += 1;
  });
  schema.plugin(permissionsPlugin, { modelName });

  const User = mongoose.model(modelName, schema);

  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => [],
  });

  const router = acl.createRouter(modelName, {
    basePath: '/sort-options-users',
    operationAccess: { list: true, read: true },
    permissionSchema: {
      name: { list: true, read: true },
      publicRank: { list: true, read: true },
      secretRank: { list: false, read: false },
    },
    ...(options as object),
  });
  const rootRouter = acl.createRouter({ basePath: '/root', operationAccess: true });

  await User.create(seedDocs);

  const app = express();
  app.use(express.json());
  app.use(router.routes);
  app.use(rootRouter.routes);

  return { app, modelName, getFindCalls: () => findCalls, getFindOneCalls: () => findOneCalls };
};

describe('sort options (sortableFields/stripDisallowedSort)', () => {
  it('sortableFields allowlists a denied field for list and read without exposing it', async () => {
    const { app, modelName, getFindCalls, getFindOneCalls } = await createSortOptionsApp({
      sortableFields: ['secretRank'],
    });

    const directList = await request(app).post('/sort-options-users/__query').send({ sort: '-secretRank' }).expect(200);
    expect(directList.body.data.map((row: { name: string }) => row.name)).toEqual(['bravo', 'charlie', 'alpha']);
    expect(directList.body.data[0]).not.toHaveProperty('secretRank');
    expect(getFindCalls()).toBe(1);

    const beforeRead = getFindOneCalls();
    const directRead = await request(app)
      .post('/sort-options-users/__query/__filter')
      .send({ filter: {}, sort: { secretRank: 1 } })
      .expect(200);
    expect(directRead.body).toMatchObject({ name: 'alpha' });
    expect(directRead.body).not.toHaveProperty('secretRank');
    expect(getFindOneCalls()).toBeGreaterThan(beforeRead);

    const rootList = await request(app)
      .post('/root')
      .send([{ target: 'model', name: modelName, op: 'list', args: { sort: [['secretRank', 'desc']] } }])
      .expect(200);
    expect(rootList.body[0].result.success).toBe(true);
    expect(rootList.body[0].result.data.map((row: { name: string }) => row.name)).toEqual([
      'bravo',
      'charlie',
      'alpha',
    ]);
  });

  it('stripDisallowedSort omits denied sort instead of failing', async () => {
    const { app, modelName, getFindCalls, getFindOneCalls } = await createSortOptionsApp({
      stripDisallowedSort: true,
    });

    const directList = await request(app).post('/sort-options-users/__query').send({ sort: '-secretRank' }).expect(200);
    expect(directList.body.data).toHaveLength(3);
    expect(getFindCalls()).toBe(1);

    const beforeRead = getFindOneCalls();
    const directRead = await request(app)
      .post('/sort-options-users/__query/__filter')
      .send({ filter: {}, sort: { secretRank: 1 } })
      .expect(200);
    expect(directRead.body).toMatchObject({ name: expect.any(String) });
    expect(getFindOneCalls()).toBeGreaterThan(beforeRead);

    const rootList = await request(app)
      .post('/root')
      .send([{ target: 'model', name: modelName, op: 'list', args: { sort: '-secretRank' } }])
      .expect(200);
    expect(rootList.body[0].result.success).toBe(true);
    expect(rootList.body[0].result.data).toHaveLength(3);
  });

  it('stripDisallowedSort keeps allowed keys from mixed sort', async () => {
    const { app } = await createSortOptionsApp({ stripDisallowedSort: true });

    const stringMixed = await request(app)
      .post('/sort-options-users/__query')
      .send({ sort: 'publicRank -secretRank' })
      .expect(200);
    expect(stringMixed.body.data).toHaveLength(3);
    expect(stringMixed.body.data[stringMixed.body.data.length - 1]).toMatchObject({ name: 'alpha' });

    const objectMixed = await request(app)
      .post('/sort-options-users/__query')
      .send({ sort: { publicRank: 'asc', secretRank: -1 } })
      .expect(200);
    expect(objectMixed.body.data).toHaveLength(3);
    expect(objectMixed.body.data[objectMixed.body.data.length - 1]).toMatchObject({ name: 'alpha' });
  });

  it('stripDisallowedSort still rejects malformed sort before query execution', async () => {
    const { app, getFindCalls } = await createSortOptionsApp({ stripDisallowedSort: true });

    const malformed = await request(app)
      .post('/sort-options-users/__query')
      .send({ sort: { $where: 1 } })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);
    expect(malformed.body.errors[0]).toMatchObject({ detail: 'Invalid sort field: $where', pointer: '#/sort' });
    expect(getFindCalls()).toBe(0);
  });

  it('filter denial takes precedence over sort handling', async () => {
    const { app, getFindCalls } = await createSortOptionsApp({
      stripDisallowedSort: true,
      baseFilter: { list: () => false },
    });

    await request(app).post('/sort-options-users/__query').send({ sort: '-secretRank' }).expect(403);
    expect(getFindCalls()).toBe(0);
  });

  it('inherits sortableFields from default model options unless overridden', async () => {
    const runtime = createAccessRuntime();
    runtime.setGlobalOptions({ requestPermissionField: '_permissions', globalPermissions: () => [] });
    runtime.setDefaultModelOptions({ sortableFields: ['secretRank'] });

    const buildApp = async (modelSuffix: string, perModelOptions: Record<string, unknown>) => {
      const modelName = `AclSortDefaultsUser${++modelCounter}${modelSuffix}`;
      const schema = new mongoose.Schema({ name: String, publicRank: Number, secretRank: Number });
      schema.plugin(permissionsPlugin, { modelName });
      const User = mongoose.model(modelName, schema);
      const router = runtime.createRouter(User, {
        basePath: `/sort-defaults-${modelCounter}${modelSuffix}`,
        operationAccess: { list: true, read: true },
        permissionSchema: {
          name: { list: true, read: true },
          publicRank: { list: true, read: true },
          secretRank: { list: false, read: false },
        },
        ...(perModelOptions as object),
      } as never);
      await User.create(seedDocs);
      const app = express();
      app.use(express.json());
      app.use(router.routes);
      return app;
    };

    const inherited = await buildApp('Inherited', {});
    const inheritedRes = await request(inherited)
      .post(`/sort-defaults-${modelCounter}Inherited/__query`)
      .send({ sort: '-secretRank' })
      .expect(200);
    expect(inheritedRes.body.data.map((row: { name: string }) => row.name)).toEqual(['bravo', 'charlie', 'alpha']);

    const overridden = await buildApp('Overridden', { sortableFields: [] });
    await request(overridden)
      .post(`/sort-defaults-${modelCounter}Overridden/__query`)
      .send({ sort: '-secretRank' })
      .expect(400);
  });

  it('inherits stripDisallowedSort from default model options with per-model override', async () => {
    const runtime = createAccessRuntime();
    runtime.setGlobalOptions({ requestPermissionField: '_permissions', globalPermissions: () => [] });
    runtime.setDefaultModelOptions({ stripDisallowedSort: true });

    const buildApp = async (modelSuffix: string, perModelOptions: Record<string, unknown>) => {
      const modelName = `AclSortStripDefaultsUser${++modelCounter}${modelSuffix}`;
      const schema = new mongoose.Schema({ name: String, publicRank: Number, secretRank: Number });
      schema.plugin(permissionsPlugin, { modelName });
      const User = mongoose.model(modelName, schema);
      const router = runtime.createRouter(User, {
        basePath: `/sort-strip-defaults-${modelCounter}${modelSuffix}`,
        operationAccess: { list: true, read: true },
        permissionSchema: {
          name: { list: true, read: true },
          publicRank: { list: true, read: true },
          secretRank: { list: false, read: false },
        },
        ...(perModelOptions as object),
      } as never);
      await User.create(seedDocs);
      const app = express();
      app.use(express.json());
      app.use(router.routes);
      return app;
    };

    const inherited = await buildApp('Inherited', {});
    await request(inherited)
      .post(`/sort-strip-defaults-${modelCounter}Inherited/__query`)
      .send({ sort: '-secretRank' })
      .expect(200);

    const overridden = await buildApp('Overridden', { stripDisallowedSort: false });
    await request(overridden)
      .post(`/sort-strip-defaults-${modelCounter}Overridden/__query`)
      .send({ sort: '-secretRank' })
      .expect(400);
  });
});
