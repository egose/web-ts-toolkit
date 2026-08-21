import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import acl, { createAccessRuntime, permissionsPlugin, setGlobalOptions } from '../dist/index.mjs';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

let modelCounter = 0;

const resetGlobalOptions = () => {
  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => ({}),
  });
};

const createSubdocumentApp = async () => {
  const modelName = `AclMongoSubPost${++modelCounter}`;
  const commentSchema = new mongoose.Schema({
    body: String,
    votes: Number,
  });
  const schema = new mongoose.Schema({
    title: String,
    comments: [commentSchema],
  });

  schema.plugin(permissionsPlugin, { modelName });

  const Post = mongoose.model(modelName, schema);

  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => ['isAdmin'],
  });

  const router = acl.createRouter(modelName, {
    basePath: '/sub-posts',
    operationAccess: {
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
      title: { read: true },
      comments: {
        sub: {
          body: { list: true, read: true, create: true, update: true },
          votes: { list: true, read: true, create: true, update: true },
        },
      },
    },
  });

  const post = await Post.create({
    title: 'post-1',
    comments: [
      { body: 'first', votes: 1 },
      { body: 'second', votes: 2 },
    ],
  });

  const app = express();
  app.use(express.json());
  app.use(router.routes);

  return {
    app,
    postId: String(post._id),
    firstCommentId: String(post.comments[0]._id),
    secondCommentId: String(post.comments[1]._id),
  };
};

afterEach(() => {
  resetGlobalOptions();
  mongoose.deleteModel(/AclMongoSubPost.*/);
});

describe('model router sub-document routes', () => {
  it('supports direct sub-document CRUD and query routes', async () => {
    const { app, postId, firstCommentId, secondCommentId } = await createSubdocumentApp();

    const listResponse = await request(app)
      .get(`/sub-posts/${postId}/comments`)
      .expect(200)
      .expect('Content-Type', /json/);
    const filteredListResponse = await request(app)
      .post(`/sub-posts/${postId}/comments/__query`)
      .send({ filter: { votes: { $gte: 2 } }, select: ['body'] })
      .expect(200)
      .expect('Content-Type', /json/);
    const readResponse = await request(app)
      .get(`/sub-posts/${postId}/comments/${firstCommentId}`)
      .expect(200)
      .expect('Content-Type', /json/);
    const readQueryResponse = await request(app)
      .post(`/sub-posts/${postId}/comments/${firstCommentId}/__query`)
      .send({ select: ['votes'] })
      .expect(200)
      .expect('Content-Type', /json/);
    const createResponse = await request(app)
      .post(`/sub-posts/${postId}/comments`)
      .send({ body: 'third', votes: 3 })
      .expect(201)
      .expect('Content-Type', /json/);
    const updateResponse = await request(app)
      .patch(`/sub-posts/${postId}/comments/${firstCommentId}`)
      .send({ votes: 10 })
      .expect(200)
      .expect('Content-Type', /json/);
    const bulkUpdateResponse = await request(app)
      .patch(`/sub-posts/${postId}/comments`)
      .send([{ _id: secondCommentId, votes: 20 }])
      .expect(200)
      .expect('Content-Type', /json/);
    const deleteResponse = await request(app)
      .delete(`/sub-posts/${postId}/comments/${secondCommentId}`)
      .expect(200)
      .expect('Content-Type', /json/);

    expect(listResponse.body).toHaveLength(2);
    expect(listResponse.body[0]).toMatchObject({ body: 'first', votes: 1 });
    expect(filteredListResponse.body).toHaveLength(1);
    expect(filteredListResponse.body[0]).toMatchObject({ body: 'second' });
    expect(readResponse.body).toMatchObject({
      body: 'first',
      votes: 1,
    });
    expect(readQueryResponse.body).toMatchObject({ votes: 1 });
    expect(createResponse.body).toHaveLength(3);
    expect(createResponse.body[2]).toMatchObject({ body: 'third', votes: 3 });
    expect(updateResponse.body).toMatchObject({ body: 'first', votes: 10 });
    expect(bulkUpdateResponse.body).toHaveLength(1);
    expect(bulkUpdateResponse.body[0]).toMatchObject({ body: 'second', votes: 20 });
    expect(deleteResponse.body).toBe(secondCommentId);
  });

  it('rejects invalid direct sub-document payloads', async () => {
    const { app, postId, firstCommentId } = await createSubdocumentApp();

    const invalidList = await request(app)
      .post(`/sub-posts/${postId}/comments/__query`)
      .send({ fields: ['body'] })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    const invalidRead = await request(app)
      .post(`/sub-posts/${postId}/comments/${firstCommentId}/__query`)
      .send({ fields: ['body'] })
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    const invalidCreate = await request(app)
      .post(`/sub-posts/${postId}/comments`)
      .send([1])
      .expect(400)
      .expect('Content-Type', /application\/problem\+json/);

    expect(invalidList.body).toMatchObject({
      title: 'Bad Request',
      detail: 'Bad Request',
      status: 400,
      errors: [{ pointer: '#/fields' }],
    });
    expect(invalidRead.body).toMatchObject({
      title: 'Bad Request',
      detail: 'Bad Request',
      status: 400,
      errors: [{ pointer: '#/fields' }],
    });
    expect(invalidCreate.body).toMatchObject({
      title: 'Bad Request',
      detail: 'Bad Request',
      status: 400,
      errors: expect.any(Array),
    });
  });

  // ARF-12 #4: The recursive client-filter sanitizer that blocks
  // `$where`, `$expr`, `$function`, and `$accumulator` at the top level must
  // also reject them at nested levels through BOTH the direct subdocument
  // list route (`POST /<parent>/<id>/<sub>/__query` with `{ filter: { ... } }`)
  // AND the root subdocument list batch entry (`{ op: 'subList', filter: { ... } }`).
  // The blocked operators are dangerous in MongoDB and historically bypassed
  // row-policy enforcement; they must be rejected with a controlled 400
  // regardless of how deep they appear inside the filter. Each test below uses
  // an isolated AccessRuntime so the OpenAPI route registry stays scoped to
  // this test and never collides with the default-runtime routers set up by
  // `createSubdocumentApp()` in the earlier tests (ARF-08 strict-by-default).
  describe('ARF-12 #4 subdocument list rejects dangerous operators at nested levels', () => {
    const BLOCKED_OPERATORS = ['$where', '$expr', '$function', '$accumulator'];
    let arf12Counter = 0;

    const buildArf12SubRuntimeApp = () => {
      const runtime = createAccessRuntime();
      const modelName = `AclArf12SubPost${++arf12Counter}`;
      const commentSchema = new mongoose.Schema({
        body: String,
        votes: Number,
      });
      const schema = new mongoose.Schema({
        title: String,
        comments: [commentSchema],
      });

      schema.plugin(permissionsPlugin, { modelName });

      const Post = mongoose.model(modelName, schema);

      runtime.setGlobalOptions({
        requestPermissionField: '_permissions',
        globalPermissions: () => ['isAdmin'],
      });

      const modelRouter = runtime.createRouter(Post, {
        basePath: '/arf12-sub-posts',
        operationAccess: {
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
          title: { read: true },
          comments: {
            sub: {
              body: { list: true, read: true, create: true, update: true },
              votes: { list: true, read: true, create: true, update: true },
            },
          },
        },
      });

      const rootRouter = runtime.createRouter({ basePath: '/arf12-sub-root', operationAccess: true });

      const app = express();
      app.use(express.json());
      app.use(modelRouter.routes);
      app.use(rootRouter.routes);

      return {
        app,
        modelName,
        persistPost: async () => {
          const created = await Post.create({
            title: 'post-1',
            comments: [
              { body: 'first', votes: 1 },
              { body: 'second', votes: 2 },
            ],
          });
          return { postId: String(created._id) };
        },
      };
    };

    afterEach(() => {
      mongoose.deleteModel(/AclArf12SubPost.*/);
    });

    for (const operator of BLOCKED_OPERATORS) {
      describe(`operator ${operator}`, () => {
        it('is rejected at the top of a direct subdocument list filter with a controlled 400', async () => {
          const { app, persistPost } = buildArf12SubRuntimeApp();
          const { postId } = await persistPost();

          // Top-level dangerous operator.
          const response = await request(app)
            .post(`/arf12-sub-posts/${postId}/comments/__query`)
            .send({ filter: { [operator]: 'this.body == "x"' } })
            .expect(400)
            .expect('Content-Type', /application\/problem\+json/);

          expect(response.body).toMatchObject({
            title: 'Bad Request',
            status: 400,
          });
          // Errors are returned as plain string messages (see
          // validateClientFilter returning string[]); assert the operator
          // mention is present so the test fails-against-buggy-behavior on a
          // sanitizer that silently dropped the operator (or only inspected
          // the top-level keys).
          expect(Array.isArray(response.body.errors)).toBe(true);
          expect(response.body.errors.some((err: unknown) => String(err).includes(operator))).toBe(true);
        });

        it('is rejected at a nested level under a normal field-name key on the direct subdocument list route', async () => {
          const { app, persistPost } = buildArf12SubRuntimeApp();
          const { postId } = await persistPost();

          // Nested under a normal field-name; the recursive visitor must
          // still discover the blocked operator. A sanitizer that only
          // inspected the top-level keys would let this reach MongoDB.
          const response = await request(app)
            .post(`/arf12-sub-posts/${postId}/comments/__query`)
            .send({
              filter: {
                body: { [operator]: 'this.votes == 1' },
              },
            })
            .expect(400)
            .expect('Content-Type', /application\/problem\+json/);

          expect(response.body.status).toBe(400);
          expect(response.body.errors.some((err: unknown) => String(err).includes(operator))).toBe(true);
        });

        it('is rejected at a nested level inside an $and/$or clump on the direct subdocument list route', async () => {
          const { app, persistPost } = buildArf12SubRuntimeApp();
          const { postId } = await persistPost();

          // Bury the dangerous operator inside an $and whose first clause is
          // a benign match. The visitor recurses into arrays and objects.
          const response = await request(app)
            .post(`/arf12-sub-posts/${postId}/comments/__query`)
            .send({
              filter: {
                $and: [
                  { votes: 1 },
                  { [operator]: 'this.body == "x"' },
                  {
                    $or: [{ body: 'first' }, { votes: { $gt: 0 } }],
                  },
                ],
              },
            })
            .expect(400)
            .expect('Content-Type', /application\/problem\+json/);

          expect(response.body.status).toBe(400);
          expect(response.body.errors.some((err: unknown) => String(err).includes(operator))).toBe(true);
        });

        it('is rejected at the top of a root subList filter with a controlled 400 inside the per-entry result', async () => {
          const { app, modelName, persistPost } = buildArf12SubRuntimeApp();
          const { postId } = await persistPost();

          // The root batch envelope returns HTTP 200 with a per-entry
          // statusCode that reflects the service result. A buggy path that
          // passed the dangerous operator to MongoDB would surface a 200
          // result (or an unhandled 5xx) rather than the controlled 400
          // stored in this entry.
          const response = await request(app)
            .post('/arf12-sub-root')
            .send([
              {
                target: 'model',
                name: modelName,
                op: 'subList',
                id: postId,
                sub: 'comments',
                filter: { [operator]: 'this.body == "x"' },
              },
            ])
            .expect(200)
            .expect('Content-Type', /json/);

          expect(response.body[0]).toMatchObject({
            target: 'model',
            name: modelName,
            op: 'subList',
            statusCode: 400,
            message: 'Bad Request',
            result: {
              success: false,
              code: 'bad_request',
            },
          });
          expect(Array.isArray(response.body[0].result.errors)).toBe(true);
          expect(response.body[0].result.errors.some((err: unknown) => String(err).includes(operator))).toBe(true);
        });

        it('is rejected at a nested level on a root subList filter too', async () => {
          const { app, modelName, persistPost } = buildArf12SubRuntimeApp();
          const { postId } = await persistPost();

          const response = await request(app)
            .post('/arf12-sub-root')
            .send([
              {
                target: 'model',
                name: modelName,
                op: 'subList',
                id: postId,
                sub: 'comments',
                filter: {
                  body: { [operator]: 'this.votes == 1' },
                },
              },
            ])
            .expect(200)
            .expect('Content-Type', /json/);

          expect(response.body[0]).toMatchObject({
            statusCode: 400,
            message: 'Bad Request',
            result: {
              success: false,
              code: 'bad_request',
            },
          });
          expect(response.body[0].result.errors.some((err: unknown) => String(err).includes(operator))).toBe(true);
        });

        it('does not reject a benign nested filter without any blocked operator', async () => {
          const { app, persistPost } = buildArf12SubRuntimeApp();
          const { postId } = await persistPost();

          // Sanity check: the sanitizer is specific to the blocked operators.
          const response = await request(app)
            .post(`/arf12-sub-posts/${postId}/comments/__query`)
            .send({
              filter: {
                $and: [{ votes: { $gte: 1 } }, { $or: [{ body: 'first' }, { body: 'second' }] }],
              },
              select: ['body'],
            })
            .expect(200)
            .expect('Content-Type', /json/);

          expect(Array.isArray(response.body)).toBe(true);
          expect(response.body.length).toBeGreaterThan(0);
        });
      });
    }
  });
});
