import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../dist/index.mjs';
import type { ModelRequest } from '../src/interfaces';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();
let serial = 0;
const flag = 'unsafeSkipReadDocumentSnapshotChecks';
const select = ['ordinal', 'value', 'secret', 'hidden', '-_id'];
const quiet = { includePermissions: false, includeFieldPermissions: false };

async function fixture(read: boolean, list = false) {
  const api = createAccessRuntime();
  api.setGlobalOptions({ globalPermissions: () => ['reader'], logger: { warn: vi.fn() } });
  const Model = mongoose.model(
    `ReadSnapshotHttp${++serial}`,
    new mongoose.Schema(
      {
        ordinal: Number,
        value: String,
        secret: String,
        hidden: String,
        owner: String,
        tenant: String,
      },
      { versionKey: false },
    ),
  );
  const hooks = {
    read: vi.fn((doc: Record<string, unknown>) => ({ owner: doc.owner === 'alice' })),
    list: vi.fn((doc: Record<string, unknown>) => ({ owner: doc.owner === 'alice' })),
  };
  const router = api.createRouter(Model, {
    basePath: '/reads',
    operationAccess: { read: 'reader', list: 'reader' },
    baseFilter: { read: () => ({ tenant: 'read' }), list: () => ({ tenant: 'list' }) },
    permissionSchema: { ordinal: true, value: 'reader', secret: 'doc:owner', hidden: false },
    alwaysSelectFields: ['owner'],
    modelPermissionPrefix: 'doc:',
    docPermissions: hooks,
    stripPermissionsField: true,
    unsafeSkipReadDocumentSnapshotChecks: read,
    unsafeSkipListDocumentSnapshotChecks: list,
  });
  const root = api.createRouter({ basePath: '/root', operationAccess: true });
  const rows = await Model.insertMany([
    { ordinal: 0, value: 'owned', secret: 'owned value', hidden: 'never', tenant: 'read', owner: 'alice' },
    { ordinal: 1, value: 'unowned', secret: 'not owned', hidden: 'never', tenant: 'read', owner: 'bob' },
    { ordinal: 2, value: 'list-only', secret: 'fallback value', hidden: 'never', tenant: 'list', owner: 'alice' },
    { ordinal: 3, value: 'outside', secret: 'never', hidden: 'never', tenant: 'outside', owner: 'alice' },
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
  return {
    api,
    Model,
    router,
    app,
    rows,
    hooks,
    owned: { ordinal: 0, value: 'owned', secret: 'owned value' },
    fallback: { ordinal: 2, value: 'list-only', secret: 'fallback value' },
    async execute(callback: (req: ModelRequest) => Promise<void>) {
      run = callback;
      failure = undefined;
      await request(app).post('/reads/probe').send({}).expect(200);
      if (failure) throw failure;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^ReadSnapshotHttp/);
});

describe('read snapshot opt-out retains ACL and public boundaries', () => {
  it.each([false, true].flatMap((read) => [false, true].map((list) => ({ read, list }))))(
    'retains single-read field/row rules with read=$read and list=$list',
    async ({ read, list }) => {
      const f = await fixture(read, list);
      await f.execute(async (req) => {
        const svc = req.macl.getService(f.Model.modelName),
          pub = req.macl.getPublicService(f.Model.modelName);
        const one = await svc.findOne({ ordinal: 0 }, { select }, quiet);
        expect(one).toMatchObject({ success: true, data: f.owned });
        if (!one.success) throw new Error(one.code);
        expect(
          await svc.pickAllowedFields(one.data, 'read', { documentAuthorization: one.context.documentAuthorization }),
        ).toEqual(f.owned);
        expect(await svc.findById(String(f.rows[0]._id), { select }, quiet)).toMatchObject({
          success: true,
          data: f.owned,
        });
        expect(await pub._read(String(f.rows[1]._id), { select }, { ...quiet, tryList: false })).toMatchObject({
          success: true,
          data: { ordinal: 1, value: 'unowned' },
        });
        expect(await pub._readFilter({ ordinal: 0 }, { select }, quiet)).toMatchObject({
          success: true,
          data: f.owned,
        });
        expect(await svc.findOne({ ordinal: 3 }, { select }, quiet)).toMatchObject({
          success: false,
          code: 'not_found',
        });
      });
      const http = await request(f.app)
        .get(`/reads/${f.rows[0]._id}`)
        .query({ select: select.join(' ') })
        .expect(200);
      expect(http.body).toEqual(f.owned);
      const filter = await request(f.app)
        .post('/reads/__query/__filter')
        .send({ filter: { ordinal: 0 }, select, options: quiet })
        .expect(200);
      expect(filter.body).toEqual(f.owned);
      const root = await request(f.app)
        .post('/root')
        .send([
          {
            target: 'model',
            name: f.Model.modelName,
            op: 'read',
            id: String(f.rows[0]._id),
            args: { select },
            options: quiet,
          },
        ])
        .expect(200);
      expect(root.body[0].result.data).toEqual(f.owned);
      expect(f.hooks.read).toHaveBeenCalled();
      f.router.setOption('operationAccess.read', false);
      await request(f.app).get(`/reads/${f.rows[0]._id}`).expect(401);
      f.router.setOption('baseFilter.read', () => false);
      await f.execute(async (req) => {
        expect(await req.macl.getService(f.Model.modelName).findOne({}, { select }, quiet)).toMatchObject({
          success: false,
          code: 'forbidden',
        });
      });
    },
  );

  it.each([false, true].flatMap((read) => [false, true].map((list) => ({ read, list }))))(
    'keeps list-access retry gates/rules with independent read=$read and list=$list',
    async ({ read, list }) => {
      const f = await fixture(read, list),
        findOne = vi.spyOn(f.Model, 'findOne');
      await f.execute(async (req) => {
        const pub = req.macl.getPublicService(f.Model.modelName);
        expect(await pub._read(String(f.rows[2]._id), { select }, quiet)).toMatchObject({
          success: true,
          data: f.fallback,
        });
        expect(await pub._readFilter({ ordinal: 2 }, { select }, quiet)).toMatchObject({
          success: true,
          data: f.fallback,
        });
      });
      expect(findOne).toHaveBeenCalledTimes(4);
      expect(f.hooks.read).not.toHaveBeenCalled();
      expect(f.hooks.list).toHaveBeenCalledTimes(2);
      const response = await request(f.app)
        .post('/root')
        .send([
          {
            target: 'model',
            name: f.Model.modelName,
            op: 'read',
            id: String(f.rows[2]._id),
            args: { select },
            options: quiet,
          },
        ])
        .expect(200);
      expect(response.body[0].result.data).toEqual(f.fallback);
      f.router.setOption('operationAccess.list', false);
      await request(f.app)
        .get(`/reads/${f.rows[2]._id}`)
        .query({ select: select.join(' ') })
        .expect(401);
    },
  );

  it.each(['query', 'body', 'options', 'root'])('rejects client opt-out in %s before document hooks', async (slot) => {
    const f = await fixture(false);
    if (slot === 'query')
      await request(f.app)
        .get(`/reads/${f.rows[0]._id}`)
        .query({ [flag]: 'true' })
        .expect(400);
    else if (slot === 'root')
      await request(f.app)
        .post('/root')
        .send([
          {
            target: 'model',
            name: f.Model.modelName,
            op: 'read',
            id: String(f.rows[0]._id),
            options: { [flag]: true },
          },
        ])
        .expect(400);
    else
      await request(f.app)
        .post('/reads/__query/__filter')
        .send({ filter: { ordinal: 0 }, ...(slot === 'body' ? { [flag]: true } : { options: { [flag]: true } }) })
        .expect(400);
    expect(f.hooks.read).not.toHaveBeenCalled();
    expect(f.api.getModelOption(f.Model.modelName, flag)).toBe(false);
  });
});
