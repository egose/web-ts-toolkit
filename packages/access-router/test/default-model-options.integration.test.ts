import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../dist/index.mjs';
import { unsafeSnapshotOptions } from '../src/acl/unsafe-snapshot-options';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();
let sequence = 0;
const metadataQuery = { include_permissions: 'true', include_field_permissions: 'true' };

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^DefaultModelHttp/);
});

describe('effective default model flags in generated HTTP routes', () => {
  it('updates inherited flags after router creation without overriding explicit false or old snapshots', async () => {
    const api = createAccessRuntime(),
      warn = vi.fn();
    api.setGlobalOptions({ globalPermissions: () => ['reader'], logger: { warn } });
    const schema = new mongoose.Schema({ name: String, rank: Number, hidden: String }, { versionKey: false });
    const models = ['inherited', 'explicit'].map((kind) =>
      mongoose.model(`DefaultModelHttp${kind}${++sequence}`, schema),
    );
    const routers = models.map((model, index) =>
      api.createRouter(model, {
        basePath: index ? '/explicit' : '/inherited',
        operationAccess: { list: true, read: true },
        permissionSchema: { name: 'reader', rank: true, hidden: false },
        docPermissions: { list: () => ({ reader: true }), read: () => ({ reader: true }) },
        ...(index
          ? {
              requireExplicitSelect: false,
              stripDisallowedSort: false,
              stripPermissionsField: false,
              disableFieldPermissions: false,
              ...Object.fromEntries(unsafeSnapshotOptions.map((key) => [key, false])),
            }
          : {}),
      }),
    );
    const [row] = await models[0].insertMany([{ name: 'visible', rank: 1, hidden: 'never' }]);
    await models[1].insertMany([{ name: 'visible', rank: 1, hidden: 'never' }]);
    const app = express().use(express.json()).use(routers[0].routes).use(routers[1].routes);
    const initial = api.getModelOptions(models[0].modelName);
    api.setDefaultModelOptions({
      requireExplicitSelect: true,
      stripDisallowedSort: true,
      stripPermissionsField: true,
      disableFieldPermissions: true,
      ...Object.fromEntries(unsafeSnapshotOptions.map((key) => [key, true])),
    });
    expect(warn).toHaveBeenCalledTimes(6);
    for (const [, metadata] of warn.mock.calls) expect(metadata).toEqual({ modelName: models[0].modelName });
    expect(routers[0].options).toEqual(initial);
    const inherited = await request(app).get('/inherited').query(metadataQuery).expect(200);
    expect(inherited.body.data).toEqual([{ _id: String(row._id) }]);
    const selected = await request(app)
      .get(`/inherited/${row._id}`)
      .query({ ...metadataQuery, select: 'name -_id' })
      .expect(200);
    expect(selected.body).toEqual({ name: 'visible' });
    const explicit = await request(app).get('/explicit').query(metadataQuery).expect(200);
    expect(explicit.body.data[0]).toMatchObject({
      name: 'visible',
      rank: 1,
      _permissions: { reader: true, _view: expect.anything() },
    });
    expect(explicit.body.data[0]).not.toHaveProperty('hidden');
    await request(app).get('/inherited').query({ sort: 'hidden' }).expect(200);
    await request(app).get('/explicit').query({ sort: 'hidden' }).expect(400);

    api.setDefaultModelOption('stripPermissionsField', false);
    const withoutFieldMaps = await request(app)
      .get(`/inherited/${row._id}`)
      .query({ ...metadataQuery, select: 'name -_id' })
      .expect(200);
    expect(withoutFieldMaps.body).toEqual({ name: 'visible', _permissions: { reader: true } });
    api.setDefaultModelOption('disableFieldPermissions', false);
    const withFieldMaps = await request(app)
      .get(`/inherited/${row._id}`)
      .query({ ...metadataQuery, select: 'name -_id' })
      .expect(200);
    expect(withFieldMaps.body._permissions).toHaveProperty('_view');
    api.setDefaultModelOption('stripDisallowedSort', false);
    await request(app).get('/inherited').query({ sort: 'hidden' }).expect(400);
    api.setDefaultModelOption('requireExplicitSelect', false);
    const full = await request(app).get('/inherited').query(metadataQuery).expect(200);
    expect(full.body.data[0]).toMatchObject({ name: 'visible', rank: 1 });
    expect(full.body.data[0]).not.toHaveProperty('hidden');
    expect(warn).toHaveBeenCalledTimes(6);
  });
});
