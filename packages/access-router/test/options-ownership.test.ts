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
