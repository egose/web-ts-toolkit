import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { createAccessRuntime, permissionsPlugin } from '../dist/index.mjs';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

// ARF-12 #3: `/new` route denial and removal of a sensitive default field.
// Earlier coverage exercised the happy-path `/new` route only. A buggy
// router that forgot `assertAllowed(req,'new')` would respond 200 to a
// caller lacking the required `canNew` permission, and a buggy output
// trimmer that omitted the `create`-access field policy would leak the
// schema's default `secret` value. We set `operationAccess.new: 'canNew'`
// and assert both: (a) `/new` returns 401 for a caller lacking `canNew`,
// and (b) the sensitive default `secret` field is absent when an authorized
// caller does reach `/new`. Each test uses an isolated AccessRuntime so the
// route registry is scoped and never collides with another test under
// ARF-08's strict-by-default collision policy.

let modelCounter = 0;

afterEach(() => {
  mongoose.deleteModel(/AclArf12NewUser.*/);
});

const buildNewRuntimeApp = () => {
  const runtime = createAccessRuntime();
  const modelName = `AclArf12NewUser${++modelCounter}`;
  const schema = new mongoose.Schema({
    name: String,
    role: String,
    status: {
      type: String,
      default: 'fresh',
    },
    secret: {
      type: String,
      default: 'confidential',
    },
  });

  schema.plugin(permissionsPlugin, { modelName });

  const User = mongoose.model(modelName, schema);

  runtime.setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: (req: express.Request) => (req.headers.user === 'admin' ? ['canNew'] : []),
  });

  const router = runtime.createRouter(User, {
    basePath: '/arf12-new-users',
    operationAccess: {
      // Only callers holding the `canNew` permission may reach /new.
      new: 'canNew',
      list: true,
      read: true,
    },
    permissionSchema: {
      name: true,
      role: true,
      status: true,
      // `secret` is denied on every access including create (the access used
      // by Service.new()). A buggy trimmer would leak the schema default.
      secret: false,
    },
  });

  const app = express();
  app.use(express.json());
  app.use(router.routes);

  return { app, modelName };
};

describe('ARF-12 #3 /new denial and sensitive-default removal', () => {
  it('returns 401 for /new when the caller lacks the canNew permission', async () => {
    const { app } = buildNewRuntimeApp();

    // Unauthenticated caller (no `canNew` in globalPermissions) is denied.
    await request(app)
      .get('/arf12-new-users/new')
      .expect(401)
      .expect('Content-Type', /application\/problem\+json/);
  });

  it('returns 200 for /new when the caller holds canNew and the sensitive default secret is absent', async () => {
    const { app } = buildNewRuntimeApp();

    const response = await request(app)
      .get('/arf12-new-users/new')
      .set('user', 'admin')
      .expect(200)
      .expect('Content-Type', /json/);

    // Authorized caller reaches the handler. The schematic default for
    // `status` is `fresh` and remains visible (status is permitted), while
    // the schematic default for `secret` ('confidential') must be stripped
    // by Service.new()'s `trimOutputFields(doc,'create')` call.
    expect(response.body.status).toBe('fresh');
    expect(response.body.secret).toBeUndefined();
    expect('secret' in response.body).toBe(false);
  });

  it('does not leak the secret default through a root-batch new entry either', async () => {
    const runtime = createAccessRuntime();
    const modelName = `AclArf12NewUser${++modelCounter}`;
    const schema = new mongoose.Schema({
      name: String,
      status: { type: String, default: 'fresh' },
      secret: { type: String, default: 'confidential' },
    });
    schema.plugin(permissionsPlugin, { modelName });
    const User = mongoose.model(modelName, schema);

    runtime.setGlobalOptions({
      requestPermissionField: '_permissions',
      globalPermissions: (req: express.Request) => (req.headers.user === 'admin' ? ['canNew'] : []),
    });

    runtime.createRouter(User, {
      basePath: '/arf12-new-model-users',
      operationAccess: { new: 'canNew', list: true, read: true },
      permissionSchema: { name: true, status: true, secret: false },
    });

    const rootRouter = runtime.createRouter({ basePath: '/arf12-new-root', operationAccess: true });

    const app = express();
    app.use(express.json());
    app.use(rootRouter.routes);

    // Caller lacking `canNew` — root batch still must deny each entry with
    // a controlled 401 inside the per-item result rather than surfacing the
    // sensitive default field.
    const unauthorized = await request(app)
      .post('/arf12-new-root')
      .send([{ target: 'model', name: modelName, op: 'new' }])
      .expect(200);

    expect(unauthorized.body[0]).toMatchObject({
      target: 'model',
      name: modelName,
      op: 'new',
      statusCode: 401,
      result: { success: false, code: 'unauthorized' },
    });
    expect(unauthorized.body[0].result.data).toBeUndefined();

    // Authorized caller — root batch permits the entry and the sensitive
    // default is still stripped from the returned doc.
    const authorized = await request(app)
      .post('/arf12-new-root')
      .set('user', 'admin')
      .send([{ target: 'model', name: modelName, op: 'new' }])
      .expect(200);

    expect(authorized.body[0]).toMatchObject({
      statusCode: 200,
      result: { success: true, code: 'success' },
    });
    expect(authorized.body[0].result.data.status).toBe('fresh');
    expect(authorized.body[0].result.data.secret).toBeUndefined();
  });
});
