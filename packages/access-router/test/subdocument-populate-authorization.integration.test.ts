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
    requireRegisteredPopulateModels: true,
  });
};

const createSubdocumentPopulateApp = async ({
  registerReviewerRouter = true,
  reviewerReadAllowed = true,
}: {
  registerReviewerRouter?: boolean;
  reviewerReadAllowed?: boolean;
} = {}) => {
  const runtime = createAccessRuntime();
  const reviewerModelName = `AclSubPopulateReviewer${++modelCounter}`;
  const postModelName = `AclSubPopulatePost${++modelCounter}`;

  const Reviewer = mongoose.model(
    reviewerModelName,
    new mongoose.Schema({
      name: String,
      secret: String,
      public: Boolean,
    }),
  );

  const commentSchema = new mongoose.Schema({
    body: String,
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: reviewerModelName },
  });
  const postSchema = new mongoose.Schema({
    title: String,
    comments: [commentSchema],
  });
  postSchema.plugin(permissionsPlugin, { modelName: postModelName });
  const Post = mongoose.model(postModelName, postSchema);

  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions(req: express.Request) {
      return req.headers.user === 'admin' ? ['isAdmin'] : [];
    },
    requireRegisteredPopulateModels: true,
  });

  if (registerReviewerRouter) {
    runtime.createRouter(reviewerModelName, {
      basePath: '/reviewers',
      operationAccess: { read: reviewerReadAllowed },
      baseFilter: {
        read: () => ({ public: true }),
      },
      permissionSchema: {
        name: { read: true },
        secret: { read: false },
        public: { read: true },
      },
    });
  }

  const postRouter = runtime.createRouter(postModelName, {
    basePath: '/posts',
    operationAccess: {
      read: true,
      subs: {
        comments: {
          read: true,
        },
      },
    },
    permissionSchema: {
      title: { read: true },
      comments: {
        sub: {
          body: { read: true },
          reviewer: { read: true },
        },
      },
    },
  });

  const visibleReviewer = await Reviewer.create({ name: 'visible', secret: 'hidden', public: true }); // pragma: allowlist secret
  const excludedReviewer = await Reviewer.create({ name: 'excluded', secret: 'hidden', public: false }); // pragma: allowlist secret
  const post = await Post.create({
    title: 'post-1',
    comments: [
      { body: 'visible comment', reviewer: visibleReviewer._id },
      { body: 'excluded comment', reviewer: excludedReviewer._id },
    ],
  });

  const rootRouter = runtime.createRouter({
    basePath: '/root',
    operationAccess: true,
  });

  const app = express();
  app.use(express.json());
  app.use(postRouter.routes);
  app.use(rootRouter.routes);

  return {
    app,
    postModelName,
    postId: String(post._id),
    visibleCommentId: String(post.comments[0]._id),
    excludedCommentId: String(post.comments[1]._id),
    visibleReviewerId: String(visibleReviewer._id),
  };
};

afterEach(() => {
  resetGlobalOptions();
  mongoose.deleteModel(/AclSubPopulate.*/);
});

describe('subdocument populate authorization', () => {
  it('applies target operation, row, and field policy for direct subdocument populate', async () => {
    const { app, postId, visibleCommentId, excludedCommentId, visibleReviewerId } =
      await createSubdocumentPopulateApp();

    const visible = await request(app)
      .post(`/posts/${postId}/comments/${visibleCommentId}/__query`)
      .send({ populate: [{ path: 'reviewer', select: ['name', 'secret'] }] })
      .expect(200)
      .expect('Content-Type', /json/);

    expect(visible.body).toMatchObject({
      body: 'visible comment',
      reviewer: { _id: visibleReviewerId, name: 'visible' },
    });
    expect(visible.body.reviewer.secret).toBeUndefined();

    const excluded = await request(app)
      .post(`/posts/${postId}/comments/${excludedCommentId}/__query`)
      .send({ populate: ['reviewer'] })
      .expect(200)
      .expect('Content-Type', /json/);

    expect(excluded.body).toMatchObject({ body: 'excluded comment', reviewer: null });
  });

  it('does not populate direct subdocument targets when target read is denied or the path is unknown', async () => {
    const { app, postId, visibleCommentId, visibleReviewerId } = await createSubdocumentPopulateApp({
      reviewerReadAllowed: false,
    });

    const denied = await request(app)
      .post(`/posts/${postId}/comments/${visibleCommentId}/__query`)
      .send({ populate: ['reviewer'] })
      .expect(200)
      .expect('Content-Type', /json/);
    expect(denied.body.reviewer).toBe(visibleReviewerId);

    const unknown = await request(app)
      .post(`/posts/${postId}/comments/${visibleCommentId}/__query`)
      .send({ populate: ['missing'] })
      .expect(200)
      .expect('Content-Type', /json/);
    expect(unknown.body).toMatchObject({ body: 'visible comment', reviewer: visibleReviewerId });
  });

  it('applies the same target policy through root subRead', async () => {
    const { app, postModelName, postId, visibleCommentId, visibleReviewerId } = await createSubdocumentPopulateApp();

    const response = await request(app)
      .post('/root')
      .send([
        {
          target: 'model',
          name: postModelName,
          op: 'subRead',
          id: postId,
          sub: 'comments',
          subId: visibleCommentId,
          args: { populate: [{ path: 'reviewer', select: ['name', 'secret'] }] },
        },
      ])
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body[0]).toMatchObject({ statusCode: 200, result: { success: true, kind: 'single' } });
    expect(response.body[0].result.data.reviewer).toMatchObject({ _id: visibleReviewerId, name: 'visible' });
    expect(response.body[0].result.data.reviewer.secret).toBeUndefined();
  });

  it('does not populate subdocument references whose target model is not registered in the active runtime', async () => {
    const { app, postId, visibleCommentId, visibleReviewerId } = await createSubdocumentPopulateApp({
      registerReviewerRouter: false,
    });

    const response = await request(app)
      .post(`/posts/${postId}/comments/${visibleCommentId}/__query`)
      .send({ populate: ['reviewer'] })
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body.reviewer).toBe(visibleReviewerId);
  });
});
