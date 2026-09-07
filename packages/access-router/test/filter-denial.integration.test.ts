import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import acl, { permissionsPlugin, setGlobalOptions } from '../dist/index.mjs';
import { Cache } from '../src/cache.ts';
import { resolveAccessFilter } from '../src/core-shared.ts';
import Permission from '../src/permission.ts';
import type { AccessRouterBaseRequest, Filter } from '../src/interfaces/index.ts';
import { useMongoTestDatabase } from './setup.ts';

useMongoTestDatabase();

let modelCounter = 0;

afterEach(() => {
  vi.restoreAllMocks();
  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => ({}),
  });
  mongoose.deleteModel(/AclFilterDenial.*/);
});

describe('explicit ACL filter denial', () => {
  const baseFilters: Array<[string, Filter | undefined]> = [
    ['absent', undefined],
    ['empty', {}],
    ['restrictive', { tenant: 'allowed' }],
    ['denied', false],
  ];

  const resolve = (
    filter: Filter | undefined,
    baseFilter: Filter | undefined,
    overrideFilter?: (filter: Filter) => Filter | Promise<Filter>,
  ) => {
    const options: Record<string, unknown> = {};
    if (baseFilter !== undefined) options['baseFilter.read'] = () => baseFilter;
    if (overrideFilter) options['overrideFilter.read'] = overrideFilter;

    return resolveAccessFilter({
      req: {} as AccessRouterBaseRequest,
      permissions: new Permission({}),
      cache: new Cache<string, unknown>(),
      cacheKey: 'resource_baseFilter_read',
      filter,
      getOption: (key, defaultValue) => options[key] ?? defaultValue,
    });
  };

  it.each(baseFilters)('preserves identifier denial with a %s base filter', async (_label, baseFilter) => {
    const overrideFilter = vi.fn(() => ({ revived: true }));

    await expect(resolve(false, baseFilter, overrideFilter)).resolves.toBe(false);
    expect(overrideFilter).not.toHaveBeenCalled();
  });

  it.each(baseFilters)('preserves override denial with a %s base filter', async (_label, baseFilter) => {
    await expect(resolve({ id: 'denied' }, baseFilter, () => false)).resolves.toBe(false);
  });

  it('retains absent, empty, restrictive, and trusted replacement behavior', async () => {
    await expect(resolve(undefined, undefined)).resolves.toEqual({});
    await expect(resolve({}, undefined)).resolves.toEqual({});
    await expect(resolve({}, { tenant: 'allowed' })).resolves.toEqual({ tenant: 'allowed' });
    await expect(resolve({ id: 'allowed' }, { tenant: 'allowed' })).resolves.toEqual({
      id: 'allowed',
      tenant: 'allowed',
    });
    await expect(resolve({ id: 'original' }, { tenant: 'allowed' }, () => ({ id: 'replacement' }))).resolves.toEqual({
      id: 'replacement',
      tenant: 'allowed',
    });
  });

  it('short-circuits denied direct and root reads/deletes without touching persistence', async () => {
    const modelName = `AclFilterDenial${++modelCounter}`;
    const schema = new mongoose.Schema({ name: String });
    schema.plugin(permissionsPlugin, { modelName });
    const Model = mongoose.model(modelName, schema);

    setGlobalOptions({
      requestPermissionField: '_permissions',
      globalPermissions: () => ({}),
    });

    const modelRouter = acl.createRouter(modelName, {
      basePath: '/filter-denial',
      operationAccess: { read: true, list: true, delete: true },
      permissionSchema: { name: true },
      resolveIdFilter(id: string) {
        return id === 'identifier-denied' ? false : { name: id };
      },
      overrideFilter: {
        read(filter: Filter) {
          return filter && 'name' in filter && filter.name === 'override-denied' ? false : filter;
        },
        delete(filter: Filter) {
          return filter && 'name' in filter && filter.name === 'override-denied' ? false : filter;
        },
      },
    });
    const rootRouter = acl.createRouter({ basePath: '/filter-denial-root', operationAccess: true });
    await Model.create([{ name: 'allowed-read' }, { name: 'allowed-delete' }, { name: 'unrelated' }]);

    const app = express();
    app.use(express.json());
    app.use(modelRouter.routes);
    app.use(rootRouter.routes);

    const findOneSpy = vi.spyOn(Model, 'findOne');

    await request(app).get('/filter-denial/identifier-denied?try_list=false').expect(403);
    await request(app).get('/filter-denial/override-denied?try_list=false').expect(403);
    await request(app).delete('/filter-denial/identifier-denied').expect(403);
    await request(app).delete('/filter-denial/override-denied').expect(403);

    const rootDenied = await request(app)
      .post('/filter-denial-root')
      .send([
        { target: 'model', name: modelName, op: 'read', id: 'identifier-denied', options: { tryList: false } },
        { target: 'model', name: modelName, op: 'read', id: 'override-denied', options: { tryList: false } },
        { target: 'model', name: modelName, op: 'delete', id: 'identifier-denied' },
        { target: 'model', name: modelName, op: 'delete', id: 'override-denied' },
      ])
      .expect(200);

    expect(rootDenied.body).toHaveLength(4);
    expect(rootDenied.body).toEqual([
      expect.objectContaining({ op: 'read', statusCode: 403, result: expect.objectContaining({ code: 'forbidden' }) }),
      expect.objectContaining({ op: 'read', statusCode: 403, result: expect.objectContaining({ code: 'forbidden' }) }),
      expect.objectContaining({
        op: 'delete',
        statusCode: 403,
        result: expect.objectContaining({ code: 'forbidden' }),
      }),
      expect.objectContaining({
        op: 'delete',
        statusCode: 403,
        result: expect.objectContaining({ code: 'forbidden' }),
      }),
    ]);
    expect(findOneSpy).not.toHaveBeenCalled();
    await expect(Model.collection.countDocuments({})).resolves.toBe(3);

    await request(app).get('/filter-denial/allowed-read?try_list=false&include_permissions=false').expect(200);
    await request(app).delete('/filter-denial/allowed-delete').expect(200);

    expect(findOneSpy).toHaveBeenCalledTimes(2);
    await expect(Model.collection.findOne({ name: 'allowed-delete' })).resolves.toBeNull();
    await expect(Model.collection.findOne({ name: 'unrelated' })).resolves.toMatchObject({ name: 'unrelated' });
  });
});
