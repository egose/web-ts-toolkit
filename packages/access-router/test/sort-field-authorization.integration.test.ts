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

const createModelSortApp = async () => {
  const modelName = `AclSortPolicyUser${++modelCounter}`;
  let findCalls = 0;
  let findOneCalls = 0;

  const schema = new mongoose.Schema({
    name: String,
    group: String,
    publicRank: Number,
    secondaryRank: Number,
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
    basePath: '/sort-users',
    operationAccess: { list: true, read: true },
    permissionSchema: {
      name: { list: true, read: true },
      group: { list: true, read: true },
      publicRank: { list: true, read: true },
      secondaryRank: { list: true, read: true },
      secretRank: { list: false, read: false },
    },
  });
  const rootRouter = acl.createRouter({ basePath: '/root', operationAccess: true });

  await User.create([
    { name: 'alpha', group: 'a', publicRank: 2, secondaryRank: 2, secretRank: 1 },
    { name: 'bravo', group: 'a', publicRank: 1, secondaryRank: 1, secretRank: 3 },
    { name: 'charlie', group: 'a', publicRank: 1, secondaryRank: 3, secretRank: 2 },
  ]);

  const app = express();
  app.use(express.json());
  app.use(router.routes);
  app.use(rootRouter.routes);

  return { app, modelName, getFindCalls: () => findCalls, getFindOneCalls: () => findOneCalls };
};

const createDataSortApp = () => {
  const dataName = `AclSortPolicyData${++modelCounter}`;

  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => [],
  });

  const dataRouter = acl.createDataRouter(dataName, {
    basePath: '/sort-data',
    idField: 'id',
    operationAccess: { list: true, read: true },
    data: [
      { id: 'a', name: 'alpha', publicRank: 2, secondaryRank: 2, secretRank: 1 },
      { id: 'b', name: 'bravo', publicRank: 1, secondaryRank: 1, secretRank: 3 },
      { id: 'c', name: 'charlie', publicRank: 1, secondaryRank: 3, secretRank: 2 },
    ],
    permissionSchema: {
      id: true,
      name: true,
      publicRank: true,
      secondaryRank: true,
    },
  });
  const rootRouter = acl.createRouter({ basePath: '/root', operationAccess: true });

  const app = express();
  app.use(express.json());
  app.use(dataRouter.routes);
  app.use(rootRouter.routes);

  return { app, dataName };
};

describe('sort field authorization (ART-04)', () => {
  it('rejects denied and malformed model list/read sort before Mongoose query execution', async () => {
    const { app, modelName, getFindCalls, getFindOneCalls } = await createModelSortApp();

    const directList = await request(app)
      .post('/sort-users/__query')
      .send({ sort: '-secretRank', limit: 2 })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);
    expect(directList.body.errors[0]).toMatchObject({
      detail: 'Sort field is not allowed: secretRank',
      pointer: '#/sort',
    });
    expect(getFindCalls()).toBe(0);

    const directRead = await request(app)
      .post('/sort-users/__query/__filter')
      .send({ filter: { group: 'a' }, sort: { secretRank: 1 } })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);
    expect(directRead.body.errors[0]).toMatchObject({
      detail: 'Sort field is not allowed: secretRank',
      pointer: '#/sort',
    });
    expect(getFindOneCalls()).toBe(0);

    const malformed = await request(app)
      .post('/sort-users/__query')
      .send({ sort: { $where: 1 } })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);
    expect(malformed.body.errors[0]).toMatchObject({ detail: 'Invalid sort field: $where', pointer: '#/sort' });
    expect(getFindCalls()).toBe(0);

    const rootList = await request(app)
      .post('/root')
      .send([{ target: 'model', name: modelName, op: 'list', args: { sort: [['secretRank', 'desc']] } }])
      .expect(200);
    expect(rootList.body[0].result).toMatchObject({ success: false, code: 'bad_request' });
    expect(rootList.body[0].result.errors[0]).toMatchObject({
      detail: 'Sort field is not allowed: secretRank',
      pointer: '#/sort',
    });
    expect(getFindCalls()).toBe(0);

    const rootRead = await request(app)
      .post('/root')
      .send([
        { target: 'model', name: modelName, op: 'read', filter: { group: 'a' }, args: { sort: { secretRank: 1 } } },
      ])
      .expect(200);
    expect(rootRead.body[0].result).toMatchObject({ success: false, code: 'bad_request' });
    expect(rootRead.body[0].result.errors[0]).toMatchObject({
      detail: 'Sort field is not allowed: secretRank',
      pointer: '#/sort',
    });
    expect(getFindOneCalls()).toBe(0);
  });

  it('preserves permitted model and data string/object/tuple multi-field ordering', async () => {
    const { app: modelApp } = await createModelSortApp();

    const modelString = await request(modelApp)
      .post('/sort-users/__query')
      .send({ sort: 'publicRank -secondaryRank' })
      .expect(200);
    expect(modelString.body.data.map((row: { name: string }) => row.name)).toEqual(['charlie', 'bravo', 'alpha']);

    const modelObject = await request(modelApp)
      .post('/sort-users/__query')
      .send({ sort: { publicRank: 'asc', secondaryRank: 'desc' } })
      .expect(200);
    expect(modelObject.body.data.map((row: { name: string }) => row.name)).toEqual(['charlie', 'bravo', 'alpha']);

    const { app: dataApp, dataName } = createDataSortApp();

    const dataObject = await request(dataApp)
      .post('/sort-data/__query')
      .send({ sort: { publicRank: 'asc', secondaryRank: 'desc' } })
      .expect(200);
    expect(dataObject.body.data.map((row: { name: string }) => row.name)).toEqual(['charlie', 'bravo', 'alpha']);

    const dataRootTuple = await request(dataApp)
      .post('/root')
      .send([
        {
          target: 'data',
          name: dataName,
          op: 'list',
          args: {
            sort: [
              ['publicRank', 'asc'],
              ['secondaryRank', 'desc'],
            ],
          },
        },
      ])
      .expect(200);
    expect(dataRootTuple.body[0].result.data.map((row: { name: string }) => row.name)).toEqual([
      'charlie',
      'bravo',
      'alpha',
    ]);
  });

  it('matches model and data rejection semantics and ignores client projection for denied sort fields', async () => {
    const { app: modelApp } = await createModelSortApp();
    const { app: dataApp, dataName } = createDataSortApp();

    const modelDenied = await request(modelApp)
      .post('/sort-users/__query')
      .send({ select: 'secretRank name', sort: { secretRank: -1 } })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);
    expect(modelDenied.body.errors[0]).toMatchObject({
      detail: 'Sort field is not allowed: secretRank',
      pointer: '#/sort',
    });

    const dataDenied = await request(dataApp)
      .post('/sort-data/__query')
      .send({ select: 'secretRank name', sort: { secretRank: -1 } })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);
    expect(dataDenied.body.errors[0]).toMatchObject({
      detail: 'Sort field is not allowed: secretRank',
      pointer: '#/sort',
    });

    const modelBadOrder = await request(modelApp)
      .post('/sort-users/__query')
      .send({ sort: { publicRank: 'sideways' } })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);
    expect(modelBadOrder.body.errors[0]).toMatchObject({ detail: 'Invalid input', pointer: '#/sort' });

    const dataRootDenied = await request(dataApp)
      .post('/root')
      .send([{ target: 'data', name: dataName, op: 'list', args: { sort: [['secretRank', -1]] } }])
      .expect(200);
    expect(dataRootDenied.body[0].result).toMatchObject({ success: false, code: 'bad_request' });
    expect(dataRootDenied.body[0].result.errors[0]).toMatchObject({
      detail: 'Sort field is not allowed: secretRank',
      pointer: '#/sort',
    });
  });
});
