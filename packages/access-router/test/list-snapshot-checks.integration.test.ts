import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../dist/index.mjs';
import type { ModelRequest } from '../src/interfaces';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();
let serial = 0;
const flag = 'unsafeSkipListDocumentSnapshotChecks';
const select = ['ordinal', 'visible', 'restricted', 'hidden', '-_id'];
const quiet = { includePermissions: false, includeFieldPermissions: false, includeCount: false };

async function fixture(unsafe: boolean) {
  const api = createAccessRuntime();
  api.setGlobalOptions({ globalPermissions: () => ['reader'], logger: { warn: vi.fn() } });
  const Model = mongoose.model(
    `ListSnapshotHttp${++serial}`,
    new mongoose.Schema(
      {
        ordinal: Number,
        visible: String,
        restricted: String,
        hidden: String,
        owner: String,
        tenant: String,
      },
      { versionKey: false },
    ),
  );
  const hooks = vi.fn((doc: Record<string, unknown>) => ({ owner: doc.owner === 'alice' }));
  const router = api.createRouter(Model, {
    basePath: '/items',
    operationAccess: { list: true, read: false },
    baseFilter: { list: () => ({ tenant: 'allowed' }) },
    permissionSchema: { ordinal: true, visible: 'reader', restricted: 'doc:owner', hidden: false },
    modelPermissionPrefix: 'doc:',
    alwaysSelectFields: ['owner'],
    docPermissions: { list: hooks },
    stripPermissionsField: true,
    unsafeSkipListDocumentSnapshotChecks: unsafe,
    defaults: { publicListOptions: quiet },
  });
  const root = api.createRouter({ basePath: '/root', operationAccess: true });
  await Model.insertMany([
    { ordinal: 0, visible: 'first', restricted: 'owned', hidden: 'secret', owner: 'alice', tenant: 'allowed' },
    { ordinal: 1, visible: 'second', restricted: 'not owned', hidden: 'secret', owner: 'bob', tenant: 'allowed' },
    { ordinal: 2, visible: 'wrong tenant', restricted: 'owned', owner: 'alice', tenant: 'denied' },
  ]);
  const app = express().use(express.json()).use(router.routes).use(root.routes);
  let run: (req: ModelRequest) => Promise<void>, failure: unknown;
  router.router.post('/probe', async (req, res) => {
    try {
      await run(req as unknown as ModelRequest);
    } catch (error) {
      failure = error;
    }
    res.json({ ok: true });
  });
  const expected = [
    { ordinal: 0, visible: 'first', restricted: 'owned' },
    { ordinal: 1, visible: 'second' },
  ];
  return {
    api,
    Model,
    router,
    app,
    expected,
    hooks,
    async execute(callback: (req: ModelRequest) => Promise<void>) {
      run = callback;
      failure = undefined;
      await request(app).post('/items/probe').send({}).expect(200);
      if (failure) throw failure;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^ListSnapshotHttp/);
});

describe('server list snapshot flag does not turn off ACL', () => {
  it.each([false, true])(
    'preserves row/document/field rules through direct, public and HTTP lists (unsafe=%s)',
    async (unsafe) => {
      const f = await fixture(unsafe);
      await f.execute(async (req) => {
        const service = req.macl.getService(f.Model.modelName);
        const direct = await service.find({}, { select, sort: 'ordinal' }, quiet);
        expect(direct.success).toBe(true);
        if (!direct.success) throw new Error(direct.code);
        expect(direct.data).toEqual(f.expected);
        const handle = direct.contexts[0].documentAuthorization;
        expect(await service.pickAllowedFields(direct.data[0], 'list', { documentAuthorization: handle })).toEqual(
          f.expected[0],
        );
        expect(
          await req.macl.getPublicService(f.Model.modelName)._list({}, { select, sort: 'ordinal' }, quiet),
        ).toMatchObject({ success: true, data: f.expected });
      });
      await request(f.app)
        .post('/items/__query')
        .send({ select, sort: 'ordinal' })
        .expect(200)
        .expect(({ body }) => {
          expect(body.data).toEqual(f.expected);
        });
      expect(f.hooks).toHaveBeenCalled();
      await request(f.app).get('/items/0123456789abcdef01234567').expect(401);
      f.router.setOption('baseFilter.list', () => false);
      await f.execute(async (req) => {
        expect(await req.macl.getService(f.Model.modelName).find({}, { select }, quiet)).toMatchObject({
          success: false,
          code: 'forbidden',
        });
      });
    },
  );

  it.each([false, true])('keeps root list output and denied root reads identical (unsafe=%s)', async (unsafe) => {
    const f = await fixture(unsafe);
    const response = await request(f.app)
      .post('/root')
      .send([
        { target: 'model', name: f.Model.modelName, op: 'list', args: { select, sort: 'ordinal' }, options: quiet },
      ])
      .expect(200);
    expect(response.body[0].result.data).toEqual(f.expected);
    const denied = await request(f.app)
      .post('/root')
      .send([{ target: 'model', name: f.Model.modelName, op: 'read', id: '0123456789abcdef01234567' }])
      .expect(200);
    expect(denied.body[0].result).toMatchObject({ success: false, code: 'unauthorized' });
  });

  it.each(['body', 'options', 'root', 'query'])('cannot enable the flag from %s control slots', async (slot) => {
    const f = await fixture(false);
    if (slot === 'root') {
      await request(f.app)
        .post('/root')
        .send([{ target: 'model', name: f.Model.modelName, op: 'list', args: { select }, options: { [flag]: true } }])
        .expect(400);
    } else if (slot === 'query') {
      await request(f.app)
        .get('/items')
        .query({ select: select.join(' '), [flag]: 'true' })
        .expect(400);
    } else {
      await request(f.app)
        .post('/items/__query')
        .send({ select, ...(slot === 'body' ? { [flag]: true } : { options: { [flag]: true } }) })
        .expect(400);
    }
    expect(f.hooks).not.toHaveBeenCalled();
    expect(f.api.getModelOption(f.Model.modelName, flag)).toBe(false);
  });
});
