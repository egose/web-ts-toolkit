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
      maxDepth: 4,
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
});
