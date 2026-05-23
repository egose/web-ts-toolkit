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
});
