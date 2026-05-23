import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

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

const createRoutesApp = async () => {
  const modelName = `AclMongoRoutesUser${++modelCounter}`;
  const schema = new mongoose.Schema({
    name: String,
    role: String,
    public: Boolean,
    status: {
      type: String,
      default: 'fresh',
    },
  });

  schema.plugin(permissionsPlugin, { modelName });

  const User = mongoose.model(modelName, schema);

  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => ['isAdmin'],
  });

  const router = acl.createRouter(modelName, {
    basePath: '/route-users',
    operationAccess: {
      new: true,
      list: true,
      read: true,
      create: true,
      update: true,
      upsert: true,
      delete: true,
      count: true,
      distinct: true,
    },
    permissionSchema: {
      name: true,
      role: true,
      public: true,
      status: true,
    },
    baseFilter: {
      list: () => ({ public: true }),
      read: () => ({}),
      update: () => ({}),
      delete: () => ({}),
    },
    requestSchemas: {
      advancedList: z
        .object({
          filter: z.object({ public: z.boolean().optional(), role: z.string().optional() }).optional(),
          select: z.array(z.string()).optional(),
          options: z
            .object({
              includeCount: z.boolean().optional(),
            })
            .passthrough()
            .optional(),
        })
        .passthrough(),
      advancedRead: z
        .object({
          select: z.array(z.string()).optional(),
          options: z
            .object({
              includePermissions: z.boolean().optional(),
              tryList: z.boolean().optional(),
            })
            .passthrough()
            .optional(),
        })
        .passthrough(),
      advancedReadFilter: z
        .object({
          filter: z.object({ public: z.boolean().optional(), name: z.string().optional() }).optional(),
          select: z.array(z.string()).optional(),
          options: z
            .object({
              includePermissions: z.boolean().optional(),
              tryList: z.boolean().optional(),
            })
            .passthrough()
            .optional(),
        })
        .passthrough(),
      advancedCreate: {
        data: z
          .object({
            name: z.string().min(3),
            role: z.string().min(3),
            public: z.boolean().optional(),
          })
          .passthrough(),
      },
      advancedUpdate: {
        data: z
          .object({
            role: z.string().min(3),
          })
          .passthrough(),
      },
      advancedUpsert: {
        data: z.record(z.string(), z.unknown()),
      },
    },
  });

  const seededUsers = await User.create([
    { name: 'admin-user', role: 'admin', public: false },
    { name: 'public-user', role: 'user', public: true },
    { name: 'private-user', role: 'user', public: false },
  ]);
  const publicUser = seededUsers[1];

  const app = express();
  app.use(express.json());
  app.use(router.routes);

  return {
    app,
    publicUser,
  };
};

afterEach(() => {
  resetGlobalOptions();
  mongoose.deleteModel(/AclMongoRoutesUser.*/);
});

describe('model router route coverage', () => {
  it('covers direct collection and document route variants', async () => {
    const { app, publicUser } = await createRoutesApp();
    const publicUserId = String(publicUser._id);

    const newResponse = await request(app).get('/route-users/new').expect(200).expect('Content-Type', /json/);
    const countResponse = await request(app).get('/route-users/count').expect(200).expect('Content-Type', /json/);
    const readCountResponse = await request(app)
      .post('/route-users/count')
      .send({ options: { access: 'read' } })
      .expect(200)
      .expect('Content-Type', /json/);
    const distinctResponse = await request(app)
      .get('/route-users/distinct/role')
      .expect(200)
      .expect('Content-Type', /json/);
    const filteredDistinctResponse = await request(app)
      .post('/route-users/distinct/role')
      .send({ filter: { public: true } })
      .expect(200)
      .expect('Content-Type', /json/);
    const listResponse = await request(app)
      .post('/route-users/__query')
      .send({ filter: { public: true }, select: ['name', 'status'], options: { includeCount: true } })
      .expect(200)
      .expect('Content-Type', /json/);
    const readFilterResponse = await request(app)
      .post('/route-users/__query/__filter')
      .send({ filter: { name: 'private-user' }, select: ['role'] })
      .expect(200)
      .expect('Content-Type', /json/);
    const readByIdResponse = await request(app)
      .post(`/route-users/__query/${publicUserId}`)
      .send({ select: ['name'], options: { includePermissions: false } })
      .expect(200)
      .expect('Content-Type', /json/);

    expect(newResponse.body).toMatchObject({
      status: 'fresh',
      _id: expect.any(String),
    });
    expect(Number(countResponse.text)).toBe(1);
    expect(Number(readCountResponse.text)).toBe(3);
    expect(distinctResponse.body.sort()).toEqual(['admin', 'user']);
    expect(filteredDistinctResponse.body).toEqual(['user']);
    expect(listResponse.body).toMatchObject({
      data: [{ name: 'public-user', status: 'fresh' }],
      meta: {
        totalCount: 1,
      },
    });
    expect(readFilterResponse.body).toMatchObject({
      role: 'user',
    });
    expect(readFilterResponse.body.name).toBeUndefined();
    expect(readByIdResponse.body).toMatchObject({
      name: 'public-user',
    });
    expect(readByIdResponse.body.role).toBeUndefined();
  });

  it('covers advanced mutation route variants', async () => {
    const { app, publicUser } = await createRoutesApp();
    const publicUserId = String(publicUser._id);

    const createResponse = await request(app)
      .post('/route-users/__mutation')
      .send({ data: { name: 'created-user', role: 'editor', public: true } })
      .expect(201)
      .expect('Content-Type', /json/);

    const updateResponse = await request(app)
      .patch(`/route-users/__mutation/${publicUserId}`)
      .send({ data: { role: 'owner' }, options: { returningAll: true, includePermissions: false } })
      .expect(200)
      .expect('Content-Type', /json/);

    const upsertCreateResponse = await request(app)
      .put('/route-users/__mutation')
      .send({ data: { name: 'upsert-created-user', role: 'member', public: true } })
      .expect(201)
      .expect('Content-Type', /json/);

    const upsertUpdateResponse = await request(app)
      .put('/route-users/__mutation')
      .send({
        data: { _id: publicUserId, role: 'manager' },
        options: { returningAll: true, includePermissions: false },
      })
      .expect(200)
      .expect('Content-Type', /json/);

    expect(createResponse.body).toMatchObject({
      name: 'created-user',
      role: 'editor',
      public: true,
    });
    expect(updateResponse.body).toMatchObject({
      name: 'public-user',
      role: 'owner',
      public: true,
    });
    expect(upsertCreateResponse.body).toMatchObject({
      name: 'upsert-created-user',
      role: 'member',
      public: true,
    });
    expect(upsertUpdateResponse.body).toMatchObject({
      _id: publicUserId,
      name: 'public-user',
      role: 'manager',
      public: true,
    });
  });

  it('rejects invalid payloads on direct count and distinct routes', async () => {
    const { app } = await createRoutesApp();

    const invalidCount = await request(app)
      .post('/route-users/count')
      .send({ access: true })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    const invalidDistinct = await request(app)
      .post('/route-users/distinct/role')
      .send({ query: true })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    expect(invalidCount.body).toMatchObject({
      title: 'Bad Request',
      detail: 'Bad Request',
      status: 400,
      errors: [{ pointer: '#/access' }],
    });
    expect(invalidDistinct.body).toMatchObject({
      title: 'Bad Request',
      detail: 'Bad Request',
      status: 400,
      errors: [{ pointer: '#/query' }],
    });
  });
});
