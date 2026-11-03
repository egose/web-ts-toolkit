import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../src/index';
import { serverAuthorizationControls } from '../src/acl/authorization-modes';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();
let serial = 0;

async function fixture() {
  const api = createAccessRuntime();
  const modelGuard = vi.fn(() => true);
  const rootGuard = vi.fn(() => true);
  const docHook = vi.fn(() => ({ owner: true }));
  const schema = new mongoose.Schema(
    {
      value: String,
      ...Object.fromEntries(serverAuthorizationControls.map((key) => [key, String])),
    },
    { versionKey: false },
  );
  class Business {
    readAuthorizationMode = 'business-only';
    unsafeUseReadAuthorizationFastPath = false;
  }
  schema.loadClass(Business);
  const model = mongoose.model(`OwnedModesHttp${++serial}`, schema);
  api.setGlobalOptions({ globalPermissions: () => ['reader'], logger: { warn: vi.fn() } });
  const router = api.createRouter(model, {
    basePath: '/modes',
    operationAccess: { read: modelGuard, list: modelGuard, create: modelGuard },
    permissionSchema: { value: true, ...Object.fromEntries(serverAuthorizationControls.map((key) => [key, true])) },
    docPermissions: { read: docHook, list: docHook },
    stripPermissionsField: true,
  });
  const root = api.createRouter({ basePath: '/root', operationAccess: rootGuard });
  const app = express().use(express.json()).use(router.routes).use(root.routes);
  const row = await model.create({
    value: 'value',
    ...Object.fromEntries(serverAuthorizationControls.map((key) => [key, 'business'])),
  });
  const database = vi.fn();
  mongoose.set('debug', database);
  return { api, model, app, router, row, modelGuard, rootGuard, docHook, database };
}

afterEach(() => {
  mongoose.set('debug', false);
  vi.restoreAllMocks();
  mongoose.deleteModel(/^OwnedModesHttp/);
});

describe('whole HTTP/root control admission before application work', () => {
  it.each(serverAuthorizationControls)(
    'rejects %s before model/root guards, hooks, adapters or valid siblings',
    async (key) => {
      const f = await fixture();
      for (const controls of [{ [key]: false }, { [`${key}.x`]: false }]) {
        await request(f.app).post('/modes/__query').send({ filter: {}, options: controls }).expect(400);
        await request(f.app)
          .post('/root')
          .send([
            { target: 'model', name: f.model.modelName, op: 'list' },
            { target: 'model', name: f.model.modelName, op: 'list', options: controls },
          ])
          .expect(400);
        await request(f.app).get(`/modes/${f.row._id}`).query(controls).expect(400);
      }
      expect(f.modelGuard).not.toHaveBeenCalled();
      expect(f.rootGuard).not.toHaveBeenCalled();
      expect(f.docHook).not.toHaveBeenCalled();
      expect(f.database).not.toHaveBeenCalled();
    },
  );

  it.each(serverAuthorizationControls)(
    '%s remains a persisted business field in predicates, selection and root data',
    async (key) => {
      const f = await fixture();
      const response = await request(f.app)
        .post('/modes/__query')
        .send({
          filter: { [key]: 'business' },
          select: [key, '-_id'],
          options: { includeCount: false, includePermissions: false, includeFieldPermissions: false },
        })
        .expect(200);
      expect(response.body.data).toEqual([{ [key]: 'business' }]);
      const root = await request(f.app)
        .post('/root')
        .send([
          {
            target: 'model',
            name: f.model.modelName,
            op: 'create',
            data: { value: 'new', [key]: 'new-business', options: { [key]: 'inert' } },
            args: { select: [key, '-_id'] },
            options: { includePermissions: false, includeFieldPermissions: false },
          },
        ])
        .expect(200);
      expect(root.body[0].result.success).toBe(true);
      expect(await f.model.exists({ [key]: 'new-business' })).toBeTruthy();
      expect(f.modelGuard).toHaveBeenCalled();
      expect(f.docHook).toHaveBeenCalled();
    },
  );

  it('keeps valid root entries nontransactional after a successful whole-envelope preflight', async () => {
    const f = await fixture();
    const response = await request(f.app)
      .post('/root')
      .send([
        { target: 'model', name: f.model.modelName, op: 'create', data: { value: 'persisted' } },
        { target: 'model', name: 'MissingModel', op: 'list', order: 1 },
      ])
      .expect(200);
    expect(response.body[0].result.success).toBe(true);
    expect(response.body[1].result).toMatchObject({ success: false, code: 'bad_request' });
    expect(await f.model.exists({ value: 'persisted' })).toBeTruthy();
  });
});
