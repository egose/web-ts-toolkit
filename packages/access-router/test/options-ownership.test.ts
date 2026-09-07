import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createAccessRuntime } from '../dist/index.mjs';

let counter = 0;

describe('ART-10 configuration and data ownership', () => {
  it('isolates runtime options from original objects and fetched snapshots', () => {
    const runtime = createAccessRuntime();
    const globalPermissions = () => ({ isAdmin: true });
    const requestComplexity = { maxHookConcurrency: 2, maxBulkConcurrency: 3 };

    runtime.setGlobalOptions({ globalPermissions, requestComplexity });
    requestComplexity.maxHookConcurrency = 99;

    expect(runtime.getGlobalOption('globalPermissions')).toBe(globalPermissions);
    expect(runtime.getGlobalOption('requestComplexity')).toMatchObject({
      maxHookConcurrency: 2,
      maxBulkConcurrency: 3,
    });

    const snapshot = runtime.getGlobalOptions();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.requestComplexity)).toBe(true);

    expect(() => {
      (snapshot.requestComplexity as { maxHookConcurrency: number }).maxHookConcurrency = 123;
    }).toThrow(TypeError);
    expect(runtime.getGlobalOption('requestComplexity')).toMatchObject({ maxHookConcurrency: 2 });
  });

  it('recomputes model permission metadata for nested setter updates', () => {
    const runtime = createAccessRuntime();
    const modelName = `Art10OptionsUser${++counter}`;
    const model = mongoose.model(modelName, new mongoose.Schema({ name: String, secret: String }));

    runtime.createRouter(model, {
      basePath: `/art10-options-${counter}`,
      modelPermissionPrefix: 'model:',
      operationAccess: { read: true },
      permissionSchema: {
        name: { read: 'model:read' },
      },
    });

    expect(runtime.getModelOption(modelName, '_modelPermissionKeys.read')).toEqual(['name']);

    const nestedRule = { read: 'model:secret' };
    runtime.setModelOption(modelName, 'permissionSchema.secret' as never, nestedRule as never);
    nestedRule.read = true as never;

    expect(runtime.getModelOption(modelName, '_modelPermissionKeys.read')).toEqual(['name', 'secret']);
    expect(runtime.getModelOption(modelName, '_globalPermissionKeys.read')).toEqual([]);

    const snapshot = runtime.getModelOptions(modelName);
    expect(Object.isFrozen(snapshot.permissionSchema)).toBe(true);
    expect(() => {
      (snapshot.permissionSchema as Record<string, unknown>).leaked = { read: true };
    }).toThrow(TypeError);
    expect(runtime.getModelOption(modelName, '_permissionSchemaKeys')).toEqual(['name', 'secret']);
  });

  it('serves data-router records from immutable configured snapshots', async () => {
    const runtime = createAccessRuntime();
    const dataName = `art10-data-${++counter}`;
    const records = [{ id: '1', name: 'original', public: true }];

    const router = runtime.createDataRouter(dataName, {
      basePath: `/art10-data-${counter}`,
      idField: 'id',
      operationAccess: { list: true, read: true },
      data: records,
      permissionSchema: { id: true, name: true, public: true },
    });

    records[0].name = 'mutated';
    records.push({ id: '2', name: 'added-after-create', public: true });

    const dataSnapshot = runtime.runtime.getDataOptions<(typeof records)[number]>(dataName).data;
    expect(Object.isFrozen(dataSnapshot)).toBe(true);
    expect(Object.isFrozen(dataSnapshot?.[0])).toBe(true);

    const app = express();
    app.use(express.json());
    app.use(router.routes);

    const firstResponse = await request(app).get(`/art10-data-${counter}`).expect(200);
    expect(firstResponse.body.data).toEqual([{ id: '1', name: 'original', public: true }]);

    router.data([{ id: '3', name: 'replacement', public: true }]);
    const secondResponse = await request(app).get(`/art10-data-${counter}`).expect(200);
    expect(secondResponse.body.data).toEqual([{ id: '3', name: 'replacement', public: true }]);
  });
});

describe('ARH-11 data snapshot reuse and ownership', () => {
  it('keeps function identities and rejects fetched-snapshot mutation', () => {
    const runtime = createAccessRuntime();
    const dataName = `arh11-fns-${++counter}`;
    const decorateFn = async (doc: unknown) => doc;
    const resolveIdFilter = (id: string) => ({ id }) as never;

    runtime.createDataRouter(dataName, {
      basePath: `/arh11-fns-${counter}`,
      idField: 'id',
      operationAccess: { list: true, read: true },
      data: [{ id: '1', name: 'a', public: true }],
      permissionSchema: { id: true, name: true, public: true },
      decorate: decorateFn as never,
      resolveIdFilter: resolveIdFilter as never,
    });

    expect(runtime.runtime.getDataOption(dataName, 'decorate')).toBe(decorateFn);
    expect(runtime.runtime.getDataOption(dataName, 'resolveIdFilter')).toBe(resolveIdFilter);

    const snapshot = runtime.runtime.getDataOptions<{ id: string }>(dataName);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.data)).toBe(true);
    expect(Object.isFrozen(snapshot.data?.[0])).toBe(true);
    expect(() => {
      (snapshot.data as Array<Record<string, unknown>>)[0] = { id: 'hacked' };
    }).toThrow(TypeError);
    expect(() => {
      ((snapshot.data as Array<Record<string, unknown>>)[0] as Record<string, unknown>).id = 'hacked';
    }).toThrow(TypeError);
    expect(runtime.runtime.getDataSnapshot<{ id: string }>(dataName)[0]).toMatchObject({ id: '1' });
  });

  it('preserves in-flight snapshot consistency during replacement', async () => {
    const runtime = createAccessRuntime();
    const dataName = `arh11-inflight-${++counter}`;
    const router = runtime.createDataRouter(dataName, {
      basePath: `/arh11-inflight-${counter}`,
      idField: 'id',
      operationAccess: { list: true, read: true },
      data: [{ id: '1', name: 'before', public: true }],
      permissionSchema: { id: true, name: true, public: true },
    });

    const app = express();
    app.use(express.json());
    app.use(router.routes);

    const beforeSnapshot = runtime.runtime.getDataSnapshot<{ id: string; name: string }>(dataName);
    expect(beforeSnapshot).toHaveLength(1);

    await request(app).get(`/arh11-inflight-${counter}`).expect(200);

    router.data([{ id: '2', name: 'after', public: true }]);

    const afterSnapshot = runtime.runtime.getDataSnapshot<{ id: string; name: string }>(dataName);
    expect(afterSnapshot).not.toBe(beforeSnapshot);
    // In-flight holder keeps its coherent version.
    expect(beforeSnapshot).toEqual([{ id: '1', name: 'before', public: true }]);
    expect(afterSnapshot).toEqual([{ id: '2', name: 'after', public: true }]);
    expect(Object.isFrozen(beforeSnapshot)).toBe(true);
    expect(Object.isFrozen(afterSnapshot)).toBe(true);

    const response = await request(app).get(`/arh11-inflight-${counter}`).expect(200);
    expect(response.body.data).toEqual([{ id: '2', name: 'after', public: true }]);
  });

  it('prevents decorators and response mutation from altering stored records', async () => {
    const runtime = createAccessRuntime();
    const dataName = `arh11-decorate-${++counter}`;
    const router = runtime.createDataRouter(dataName, {
      basePath: `/arh11-decorate-${counter}`,
      idField: 'id',
      operationAccess: { list: true, read: true },
      data: [{ id: '1', name: 'stored', public: true }],
      permissionSchema: { id: true, name: true, public: true },
      async decorate(doc: Record<string, unknown>) {
        return { ...doc, name: 'decorated' };
      },
    });

    const app = express();
    app.use(express.json());
    app.use(router.routes);

    const first = await request(app).get(`/arh11-decorate-${counter}`).expect(200);
    expect(first.body.data).toEqual([{ id: '1', name: 'decorated', public: true }]);

    // Mutating the served copy must not affect the next read.
    first.body.data[0].name = 'hacked';
    const second = await request(app).get(`/arh11-decorate-${counter}`).expect(200);
    expect(second.body.data).toEqual([{ id: '1', name: 'decorated', public: true }]);
    expect(runtime.runtime.getDataSnapshot<Record<string, unknown>>(dataName)[0]).toMatchObject({
      name: 'stored',
    });
  });
});
