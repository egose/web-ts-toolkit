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

const createComplexityApp = async () => {
  const modelName = `AclMongoComplexityUser${++modelCounter}`;
  const postModelName = `AclMongoComplexityPost${modelCounter}`;
  const commentSchema = new mongoose.Schema({ body: String, votes: Number });
  const userSchema = new mongoose.Schema({
    name: String,
    role: String,
    orgId: String,
    comments: [commentSchema],
  });
  const postSchema = new mongoose.Schema({ name: String, ownerId: String });

  userSchema.plugin(permissionsPlugin, { modelName });
  postSchema.plugin(permissionsPlugin, { modelName: postModelName });

  const User = mongoose.model(modelName, userSchema);
  const Post = mongoose.model(postModelName, postSchema);

  const prepareCalls: Array<Record<string, unknown>> = [];

  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => ['isAdmin'],
    requestComplexity: {
      maxDepth: 8,
      maxNodes: 40,
      maxLogicalClauses: 3,
      maxInValues: 2,
      maxBulkItems: 1,
      maxIncludeCount: 1,
      maxSubQueryCount: 1,
      maxBulkConcurrency: 1,
    },
  });

  const router = acl.createRouter(modelName, {
    basePath: '/complex-users',
    operationAccess: {
      list: true,
      create: true,
      read: true,
      update: true,
      subs: {
        comments: {
          list: true,
          read: true,
          create: true,
          update: true,
          delete: true,
        },
      },
    },
    permissionSchema: {
      name: true,
      role: true,
      orgId: true,
      comments: {
        sub: {
          body: true,
          votes: true,
        },
      },
    },
    validate: {
      create(data) {
        const value = data as { name?: string; role?: string };
        const errors = [] as Array<{ detail: string; path: string[] }>;
        if (!value.name) errors.push({ detail: 'name required', path: ['name'] });
        if (!value.role) errors.push({ detail: 'role required', path: ['role'] });
        return errors;
      },
    },
    prepare: {
      create(data) {
        prepareCalls.push(data as Record<string, unknown>);
        return data;
      },
    },
  });

  acl.createRouter(postModelName, {
    basePath: '/complex-posts',
    operationAccess: {
      list: true,
      read: true,
    },
    permissionSchema: {
      name: true,
      ownerId: true,
    },
  });

  const rootRouter = acl.createRouter({
    basePath: '/complex-root',
    operationAccess: true,
  });

  const seededUser = await User.create({
    name: 'user-1',
    role: 'user',
    orgId: 'org-1',
    comments: [
      { body: 'first', votes: 1 },
      { body: 'second', votes: 2 },
    ],
  });
  await Post.create({ name: 'post-1', ownerId: 'org-1' });

  const app = express();
  app.use(express.json());
  app.use(router.routes);
  app.use(rootRouter.routes);

  return {
    app,
    modelName,
    postModelName,
    userId: String(seededUser._id),
    commentId: String(seededUser.comments[0]._id),
    prepareCalls,
  };
};

afterEach(() => {
  resetGlobalOptions();
  mongoose.deleteModel(/AclMongoComplexityUser.*/);
  mongoose.deleteModel(/AclMongoComplexityPost.*/);
});

describe('request complexity budgets (AR-10)', () => {
  it('rejects oversized and dangerous filters before service work', async () => {
    const { app } = await createComplexityApp();

    const tooManyInValues = await request(app)
      .post('/complex-users/__query')
      .send({ filter: { orgId: { $in: ['org-1', 'org-2', 'org-3'] } } })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    const dangerousKey = await request(app)
      .post('/complex-users/__query')
      .send({ filter: { constructor: { nested: true } } })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    expect(tooManyInValues.body.status).toBe(400);
    expect(tooManyInValues.body.errors[0].detail).toContain('$in');
    expect(dangerousKey.body.status).toBe(400);
    expect(dangerousKey.body.errors[0].detail).toContain('constructor');
  });

  it('rejects too many includes and subqueries at the request boundary', async () => {
    const { app, postModelName } = await createComplexityApp();

    const includeOverflow = await request(app)
      .post('/complex-users/__query')
      .send({
        include: [
          { model: postModelName, op: 'list', path: 'posts', localField: 'orgId', foreignField: 'ownerId' },
          { model: postModelName, op: 'read', path: 'post', localField: 'orgId', foreignField: 'ownerId' },
        ],
      })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    const subQueryOverflow = await request(app)
      .post('/complex-users/__query')
      .send({
        filter: {
          $or: [
            { orgId: { $$sq: { model: postModelName, op: 'list', sqOptions: { path: 'ownerId' } } } },
            { orgId: { $$sq: { model: postModelName, op: 'list', sqOptions: { path: 'ownerId' } } } },
          ],
        },
      })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    expect(includeOverflow.body.errors[0].detail).toContain('include');
    expect(subQueryOverflow.body.errors[0].detail).toContain('subquery');
  });

  it('rejects bulk create limits for direct and root routes', async () => {
    const { app, modelName } = await createComplexityApp();

    const directResponse = await request(app)
      .post('/complex-users')
      .send([
        { name: 'alpha', role: 'user' },
        { name: 'beta', role: 'user' },
      ])
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    const rootResponse = await request(app)
      .post('/complex-root')
      .send([
        {
          target: 'model',
          name: modelName,
          op: 'create',
          data: [
            { name: 'alpha', role: 'user' },
            { name: 'beta', role: 'user' },
          ],
        },
      ])
      .expect(200)
      .expect('Content-Type', /json/);

    expect(directResponse.body.status).toBe(400);
    expect(directResponse.body.errors[0].detail).toContain('Bulk create exceeds maximum item count');
    expect(rootResponse.body[0]).toMatchObject({
      statusCode: 400,
      result: {
        success: false,
        errors: [{ detail: expect.stringContaining('Bulk create exceeds maximum item count') }],
      },
    });
  });

  it('does not run prepare hooks when batch validation fails and preserves item indices', async () => {
    const { app, prepareCalls } = await createComplexityApp();

    const response = await request(app)
      .post('/complex-users')
      .send([{}])
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    expect(prepareCalls).toHaveLength(0);
    expect(response.body).toMatchObject({
      title: 'Bad Request',
      detail: 'Bad Request',
      status: 400,
    });
    expect(response.body.errors.map((error: { pointer?: string }) => error.pointer).sort()).toEqual([
      '#/0/name',
      '#/0/role',
    ]);
  });

  it('rejects oversized subdocument mutation arrays', async () => {
    const { app, userId, commentId } = await createComplexityApp();

    const response = await request(app)
      .patch(`/complex-users/${userId}/comments`)
      .send([
        { _id: commentId, votes: 4 },
        { _id: commentId, votes: 5 },
      ])
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    expect(response.body.status).toBe(400);
    expect(response.body.errors[0].detail).toContain('Bulk subdocument update exceeds maximum item count');
  });

  it('aggregates bulk validation errors deterministically across multiple invalid items (ARF-05)', async () => {
    const modelName = `AclMongoBulkAgg${++modelCounter}`;
    const schema = new mongoose.Schema({ name: String, role: String });
    schema.plugin(permissionsPlugin, { modelName });
    const User = mongoose.model(modelName, schema);

    setGlobalOptions({
      requestPermissionField: '_permissions',
      globalPermissions: () => ['isAdmin'],
      requestComplexity: {
        maxDepth: 8,
        maxNodes: 500,
        maxLogicalClauses: 50,
        maxInValues: 100,
        maxBulkItems: 100,
        maxIncludeCount: 10,
        maxSubQueryCount: 10,
        maxBulkConcurrency: 1,
      },
    });

    const prepareCalls: Array<Record<string, unknown>> = [];

    const router = acl.createRouter(modelName, {
      basePath: '/bulk-agg-users',
      operationAccess: { list: true, create: true },
      permissionSchema: { name: true, role: true },
      validate: {
        create(data) {
          const value = data as { name?: string; role?: string };
          const errors = [] as Array<{ detail: string; path: string[] }>;
          if (!value.name) errors.push({ detail: 'name required', path: ['name'] });
          if (!value.role) errors.push({ detail: 'role required', path: ['role'] });
          return errors;
        },
      },
      prepare: {
        create(data) {
          prepareCalls.push(data as Record<string, unknown>);
          return data;
        },
      },
    });

    const app = express();
    app.use(express.json());
    app.use(router.routes);

    // Three invalid items at distinct indices plus valid items between them.
    // With maxBulkConcurrency=1, the old shared-validationError code skipped
    // all items after the first failure, so the index-4 error would never be
    // reported. ARF-05 validates every item regardless of earlier failures.
    const response = await request(app)
      .post('/bulk-agg-users')
      .send([
        { name: 'a', role: 'user' }, // valid → index 0
        { name: 'b', role: 'user' }, // valid → index 1
        { role: 'user' }, // missing name → index 2
        { name: 'c', role: 'user' }, // valid → index 3
        { name: 'x' }, // missing role → index 4
      ])
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    expect(prepareCalls).toHaveLength(0);

    // All five items validated; pointers preserve the input index.
    const pointers = response.body.errors.map((error: { pointer?: string }) => error.pointer);
    expect(pointers).toContain('#/2/name');
    expect(pointers).toContain('#/4/role');
    // The valid items contribute no errors.
    expect(pointers.filter((p: string) => p.startsWith('#/0/'))).toEqual([]);
    expect(pointers.filter((p: string) => p.startsWith('#/1/'))).toEqual([]);
    expect(pointers.filter((p: string) => p.startsWith('#/3/'))).toEqual([]);

    // Repeated runs produce the same error set (deterministic ordering).
    const response2 = await request(app)
      .post('/bulk-agg-users')
      .send([
        { name: 'a', role: 'user' },
        { name: 'b', role: 'user' },
        { role: 'user' },
        { name: 'c', role: 'user' },
        { name: 'x' },
      ])
      .expect(400);

    expect(response2.body.errors.map((e: { pointer?: string }) => e.pointer)).toEqual(pointers);

    mongoose.deleteModel(modelName);
  });

  it('validates complete $$sq subquery payloads, not just the count (ARF-02)', async () => {
    const { app, postModelName } = await createComplexityApp();

    // One $$sq entry (count=1, within budget) but with oversized $in values
    // inside the subquery filter. ARF-02 must recurse into $$sq so this fails
    // with a controlled 400 rather than reaching the target service.
    const oversizedInSubQuery = await request(app)
      .post('/complex-users/__query')
      .send({
        filter: {
          orgId: {
            $in: {
              $$sq: {
                model: postModelName,
                op: 'list',
                filter: { ownerId: { $in: ['a', 'b', 'c'] } },
                sqOptions: { path: 'ownerId', compact: true },
              },
            },
          },
        },
      })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    expect(oversizedInSubQuery.body.status).toBe(400);
    expect(oversizedInSubQuery.body.errors[0].detail).toContain('$in');

    // One $$sq with a dangerous prototype-pollution key inside its filter.
    const dangerousKeySubQuery = await request(app)
      .post('/complex-users/__query')
      .send({
        filter: {
          orgId: {
            $$sq: {
              model: postModelName,
              op: 'list',
              filter: { constructor: { x: 1 } },
              sqOptions: { path: 'ownerId', compact: true },
            },
          },
        },
      })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    expect(dangerousKeySubQuery.body.errors[0].detail).toContain('constructor');

    // One $$sq with a nested $$sq inside it — this exceeds the subquery budget.
    const nestedSubQuery = await request(app)
      .post('/complex-users/__query')
      .send({
        filter: {
          orgId: {
            $$sq: {
              model: postModelName,
              op: 'list',
              filter: {
                ownerId: {
                  $$sq: { model: postModelName, op: 'list', sqOptions: { path: 'ownerId' } },
                },
              },
              sqOptions: { path: 'ownerId', compact: true },
            },
          },
        },
      })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    expect(nestedSubQuery.body.errors[0].detail).toContain('subquery');

    // One $$sq with an excessive include list inside it.
    const includeInsideSubQuery = await request(app)
      .post('/complex-users/__query')
      .send({
        filter: {
          orgId: {
            $$sq: {
              model: postModelName,
              op: 'list',
              args: {
                include: [
                  { model: postModelName, op: 'read', path: 'p1', localField: 'ownerId', foreignField: 'ownerId' },
                  { model: postModelName, op: 'read', path: 'p2', localField: 'ownerId', foreignField: 'ownerId' },
                ],
              },
              sqOptions: { path: 'ownerId', compact: true },
            },
          },
        },
      })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    expect(includeInsideSubQuery.body.errors[0].detail).toContain('include');
  });
});
