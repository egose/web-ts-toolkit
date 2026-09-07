import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import acl, { setGlobalOptions } from '../dist/index.mjs';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

let modelCounter = 0;

const resetGlobalOptions = () => {
  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => ['isAdmin'],
  });
};

afterEach(() => {
  vi.restoreAllMocks();
  resetGlobalOptions();
  mongoose.deleteModel(/AclAdvancedMutation.*/);
});

const createMutationApp = async (requestSchemas: Record<string, unknown>) => {
  const modelName = `AclAdvancedMutation${++modelCounter}`;
  const basePath = `/arh04-${modelCounter}`;
  const schema = new mongoose.Schema({
    name: String,
    role: String,
    public: Boolean,
  });
  const Model = mongoose.model(modelName, schema);

  resetGlobalOptions();

  const router = acl.createRouter(modelName, {
    basePath,
    operationAccess: {
      create: true,
      read: true,
      update: true,
      upsert: true,
    },
    permissionSchema: {
      name: { create: true, read: true, update: true },
      role: { create: true, read: true, update: true },
      public: { create: true, read: true, update: true },
    },
    requestSchemas: requestSchemas as never,
  });

  const app = express();
  app.use(express.json());
  app.use(router.routes);

  return { app, Model, modelName, basePath };
};

describe('advanced mutation transformed bodies (ARH-04)', () => {
  it('uses the final whole-body create output for data, args, and options', async () => {
    const { app, Model, basePath } = await createMutationApp({
      advancedCreate: async (body: unknown) => {
        const envelope = body as {
          data: Record<string, unknown>;
          select?: string[];
          options?: Record<string, unknown>;
        };
        return {
          success: true as const,
          data: {
            ...envelope,
            data: { name: 'sanitized', role: 'user' },
            select: ['name'],
            options: { includePermissions: false },
          },
        };
      },
    });

    const createSpy = vi.spyOn(Model, 'create');

    const response = await request(app)
      .post(`${basePath}/__mutation?include_permissions=true`)
      .send({
        data: { name: 'raw', role: 'raw', junk: 'should-not-persist' },
        select: ['name', 'role'],
        options: { includePermissions: true },
      })
      .expect(201)
      .expect('Content-Type', /json/);

    expect(response.body).toMatchObject({ name: 'sanitized' });
    expect(response.body.role).toBeUndefined();
    expect(response.body.junk).toBeUndefined();
    expect(response.body.__acl).toBeUndefined();

    expect(createSpy).toHaveBeenCalledTimes(1);
    const createdArg = createSpy.mock.calls[0]?.[0];
    const createdDoc = Array.isArray(createdArg) ? createdArg[0] : createdArg;
    expect(createdDoc).toMatchObject({ name: 'sanitized', role: 'user' });
    expect(createdDoc).not.toHaveProperty('junk');

    await expect(Model.collection.findOne({ name: 'sanitized' })).resolves.toMatchObject({
      name: 'sanitized',
      role: 'user',
    });
    await expect(Model.collection.findOne({ name: 'raw' })).resolves.toBeNull();
  });

  it('strips unknown keys and applies Zod transforms on nested create data', async () => {
    const { app, Model, basePath } = await createMutationApp({
      advancedCreate: {
        data: z.object({
          name: z.string().trim(),
          role: z.string(),
        }),
      },
    });

    await request(app)
      .post(`${basePath}/__mutation`)
      .send({ data: { name: '  spaced  ', role: 'user', extra: 'drop-me' } })
      .expect(201);

    await expect(Model.collection.findOne({ name: 'spaced' })).resolves.toMatchObject({
      name: 'spaced',
      role: 'user',
    });
    const stored = await Model.collection.findOne({ name: 'spaced' });
    expect(stored).not.toHaveProperty('extra');
  });

  it('uses the final whole-body update output and keeps query fallback for missing options', async () => {
    const { app, Model, basePath } = await createMutationApp({
      advancedUpdate: async (body: unknown) => {
        const envelope = body as {
          data: Record<string, unknown>;
          options?: Record<string, unknown>;
        };
        return {
          success: true as const,
          data: {
            ...envelope,
            data: { role: 'sanitized-role' },
            options: { returningAll: false, includePermissions: false },
          },
        };
      },
    });

    const created = await Model.create({ name: 'target', role: 'raw' });
    const id = String(created._id);

    const response = await request(app)
      .patch(`${basePath}/__mutation/${id}?returning_all=true&include_permissions=true`)
      .send({ data: { role: 'raw', injected: true } })
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body.role).toBe('sanitized-role');
    expect(response.body.name).toBeUndefined();
    expect(response.body.__acl).toBeUndefined();
    expect(response.body).toHaveProperty('_id', id);

    await expect(Model.collection.findOne({ _id: created._id })).resolves.toMatchObject({
      name: 'target',
      role: 'sanitized-role',
    });

    // Query fallback: validator omits options, query params still apply.
    const {
      app: fallbackApp,
      Model: FallbackModel,
      basePath: fallbackBasePath,
    } = await createMutationApp({
      advancedUpdate: {
        data: async (value: unknown) => ({ success: true as const, data: value }),
      },
    });
    const target = await FallbackModel.create({ name: 'fallback', role: 'raw' });
    const fallbackId = String(target._id);
    const fallbackResponse = await request(fallbackApp)
      .patch(`${fallbackBasePath}/__mutation/${fallbackId}?returning_all=false&include_permissions=false`)
      .send({ data: { role: 'next' } })
      .expect(200);
    expect(fallbackResponse.body.role).toBe('next');
    expect(fallbackResponse.body.name).toBeUndefined();
    expect(fallbackResponse.body.__acl).toBeUndefined();
  });

  it('uses the final whole-body upsert output and ignores disallowed option keys', async () => {
    const { app, Model, basePath } = await createMutationApp({
      advancedUpsert: async (body: unknown) => {
        const envelope = body as {
          data: Record<string, unknown>;
          options?: Record<string, unknown>;
        };
        return {
          success: true as const,
          data: {
            ...envelope,
            data: { ...(envelope.data as Record<string, unknown>), role: 'sanitized-upsert' },
            options: { includePermissions: false, skim: true, bogus: 'ignored' },
          },
        };
      },
    });

    const response = await request(app)
      .put(`${basePath}/__mutation?include_permissions=true`)
      .send({ data: { name: 'upserted', role: 'raw' } })
      .expect(201);

    expect(response.body).toMatchObject({ name: 'upserted', role: 'sanitized-upsert' });
    expect(response.body.__acl).toBeUndefined();

    const stored = await Model.collection.findOne({ name: 'upserted' });
    expect(stored).toMatchObject({ name: 'upserted', role: 'sanitized-upsert' });
    expect(stored).not.toHaveProperty('bogus');
    expect(stored).not.toHaveProperty('skim');
  });

  it('composes nested data and whole-body validators in order', async () => {
    const { app, Model, basePath } = await createMutationApp({
      advancedCreate: {
        data: async (value: unknown) => {
          const data = value as Record<string, unknown>;
          return {
            success: true as const,
            data: { ...data, name: String(data.name).toUpperCase() },
          };
        },
        default: async (body: unknown) => {
          const envelope = body as {
            data: Record<string, unknown>;
            options?: Record<string, unknown>;
          };
          return {
            success: true as const,
            data: {
              ...envelope,
              data: { ...envelope.data, name: `${String(envelope.data.name)}-FINAL` },
              options: { ...envelope.options, includePermissions: false },
            },
          };
        },
      },
    });

    const response = await request(app)
      .post(`${basePath}/__mutation?include_permissions=true`)
      .send({ data: { name: 'mixed', role: 'user' } })
      .expect(201);

    expect(response.body.name).toBe('MIXED-FINAL');
    expect(response.body.__acl).toBeUndefined();
    await expect(Model.collection.findOne({ name: 'MIXED-FINAL' })).resolves.toMatchObject({
      name: 'MIXED-FINAL',
      role: 'user',
    });
  });

  it('rejects invalid advanced mutations without dispatching to persistence', async () => {
    const { app, Model, basePath } = await createMutationApp({
      advancedCreate: {
        data: async () => ({
          success: false as const,
          issues: [{ message: 'bad create', path: ['role'] }],
        }),
      },
      advancedUpdate: {
        data: async () => ({
          success: false as const,
          issues: [{ message: 'bad update', path: ['role'] }],
        }),
      },
      advancedUpsert: {
        data: async () => ({
          success: false as const,
          issues: [{ message: 'bad upsert', path: ['role'] }],
        }),
      },
    });

    const createSpy = vi.spyOn(Model, 'create');
    const findOneSpy = vi.spyOn(Model, 'findOne');
    const existing = await Model.create({ name: 'kept', role: 'user' });
    const existingId = String(existing._id);
    createSpy.mockClear();
    findOneSpy.mockClear();

    const createInvalid = await request(app)
      .post(`${basePath}/__mutation`)
      .send({ data: { name: 'nope', role: 'bad' } })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);
    expect(createInvalid.body).toMatchObject({ status: 400 });
    expect(JSON.stringify(createInvalid.body)).toContain('data');

    await request(app)
      .patch(`${basePath}/__mutation/${existingId}`)
      .send({ data: { role: 'bad' } })
      .expect(400);

    await request(app)
      .put(`${basePath}/__mutation`)
      .send({ data: { name: 'nope', role: 'bad' } })
      .expect(400);

    expect(createSpy).not.toHaveBeenCalled();
    expect(findOneSpy).not.toHaveBeenCalled();
    await expect(Model.collection.countDocuments({})).resolves.toBe(1);
    await expect(Model.collection.findOne({ name: 'kept' })).resolves.toMatchObject({ role: 'user' });
  });
});
