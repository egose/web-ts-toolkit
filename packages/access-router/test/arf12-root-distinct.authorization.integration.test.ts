import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { createAccessRuntime, permissionsPlugin } from '../dist/index.mjs';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

let modelCounter = 0;

// ARF-12 #2: Distinct denial must be enforced through the root batch entry,
// not only the direct HTTP route. Earlier regression coverage only exercised
// the direct `/distinct/<field>` route and could miss a regression that
// bypasses the same field-policy authorization when a caller invokes
// distinct through a root batch. We additionally demonstrate that dynamic
// document-level field-permission resolution (permissionSchema as a
// function of the caller's permissions) behaves deterministically: a caller
// without the gating permission is denied, a caller with the gating
// permission is permitted. Each test uses its own isolated AccessRuntime so
// the OpenAPI route registry and global options are scoped to the test
// (no cross-test collision under ARF-08's strict-by-default policy).

afterEach(() => {
  mongoose.deleteModel(/AclArf12DistinctUser.*/);
});

const buildDistinctRuntimeApp = (globalPermissionsFactory: (req: express.Request) => string[]) => {
  const runtime = createAccessRuntime();
  const modelName = `AclArf12DistinctUser${++modelCounter}`;
  const schema = new mongoose.Schema({
    name: String,
    role: String,
    public: Boolean,
    secret: {
      type: String,
      default: 'confidential',
    },
  });

  schema.plugin(permissionsPlugin, { modelName });

  const User = mongoose.model(modelName, schema);

  runtime.setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: globalPermissionsFactory,
  });

  const modelRouter = runtime.createRouter(User, {
    basePath: '/arf12-distinct-users',
    operationAccess: {
      list: true,
      read: true,
      distinct: true,
    },
    permissionSchema: {
      name: true,
      role: true,
      public: true,
      // `secret` is gated by the caller's 'canViewSecret' permission. The
      // function form is the dynamic document-level field-permission path:
      // the field is only included in allowedFields when the caller holds
      // the gating permission. Authorization of distinct('secret') consults
      // genAllowedFields(null,'read'), so docPermissions are empty and the
      // decision depends solely on the request's global permissions.
      secret: (_permissions: Set<string>, _docPermissions: Record<string, unknown>) =>
        _permissions.has('canViewSecret'),
    },
  });

  const rootRouter = runtime.createRouter({
    basePath: '/arf12-distinct-root',
    operationAccess: true,
  });

  const app = express();
  app.use(express.json());
  app.use(modelRouter.routes);
  app.use(rootRouter.routes);

  return { app, modelName, User, runtime };
};

describe('ARF-12 #2 distinct field authorization through root and dynamic permissions', () => {
  it('rejects distinct on a denied field through a root batch entry with a controlled 403', async () => {
    const { app, modelName } = buildDistinctRuntimeApp((req) =>
      req.headers.user === 'admin' ? ['canViewSecret'] : [],
    );

    await mongoose.model(modelName).create([
      { name: 'admin-user', role: 'admin', public: false, secret: 'topsecret-1' }, // pragma: allowlist secret
      { name: 'public-user', role: 'user', public: true, secret: 'topsecret-2' }, // pragma: allowlist secret
    ]);

    const response = await request(app)
      .post('/arf12-distinct-root')
      .set('user', 'none')
      .send([
        { target: 'model', name: modelName, op: 'distinct', field: 'secret' },
        { target: 'model', name: modelName, op: 'distinct', field: 'role' },
      ])
      .expect(200)
      .expect('Content-Type', /json/);

    // A buggy root distinct path that bypassed authorizeDistinctField would
    // surface a 200 listing real `secret` values for the unauthorized caller.
    expect(response.body[0]).toMatchObject({
      target: 'model',
      name: modelName,
      op: 'distinct',
      statusCode: 403,
      message: 'Forbidden',
      result: {
        success: false,
        code: 'forbidden',
        errors: expect.arrayContaining([expect.objectContaining({ detail: expect.stringContaining('secret') })]),
      },
    });

    // A permitted field on the same batch still succeeds: the rejection is
    // per-entry controlled, not a full batch abort.
    expect(response.body[1]).toMatchObject({
      target: 'model',
      name: modelName,
      op: 'distinct',
      statusCode: 200,
      result: { success: true },
    });
    expect(response.body[1].result.data.sort()).toEqual(['admin', 'user']);

    // The denied entry must not leak the secret values through the body.
    expect(response.body[0].result.data).toBeUndefined();
  });

  it('permits distinct(secret) for a caller holding the dynamic gating permission and denies a caller that lacks it', async () => {
    // Two independent runtimes so the OpenAPI registries do not collide.
    const { app: deniedApp, modelName: deniedModel } = buildDistinctRuntimeApp(() => []);
    await mongoose.model(deniedModel).create([
      { name: 'admin-user', role: 'admin', public: false, secret: 'topsecret-1' }, // pragma: allowlist secret
      { name: 'public-user', role: 'user', public: true, secret: 'topsecret-2' }, // pragma: allowlist secret
    ]);
    const deniedRoot = await request(deniedApp)
      .post('/arf12-distinct-root')
      .send([{ target: 'model', name: deniedModel, op: 'distinct', field: 'secret' }])
      .expect(200);

    expect(deniedRoot.body[0]).toMatchObject({
      statusCode: 403,
      result: { success: false, code: 'forbidden' },
    });
    expect(deniedRoot.body[0].result.data).toBeUndefined();

    const { app: allowedApp, modelName: allowedModel } = buildDistinctRuntimeApp((req) =>
      req.headers.user === 'admin' ? ['canViewSecret'] : [],
    );
    await mongoose.model(allowedModel).create([
      { name: 'admin-user', role: 'admin', public: false, secret: 'topsecret-1' }, // pragma: allowlist secret
      { name: 'public-user', role: 'user', public: true, secret: 'topsecret-2' }, // pragma: allowlist secret
    ]);
    const allowedRoot = await request(allowedApp)
      .post('/arf12-distinct-root')
      .set('user', 'admin')
      .send([{ target: 'model', name: allowedModel, op: 'distinct', field: 'secret' }])
      .expect(200);

    expect(allowedRoot.body[0]).toMatchObject({
      statusCode: 200,
      result: { success: true, code: 'success' },
    });
    expect(allowedRoot.body[0].result.data.sort()).toEqual(['topsecret-1', 'topsecret-2']);
  });

  it('repeated distinct(secret) denials under the same caller produce identical deterministic responses', async () => {
    const { app, modelName } = buildDistinctRuntimeApp(() => []);
    await mongoose.model(modelName).create([
      { name: 'admin-user', role: 'admin', public: false, secret: 'topsecret-1' }, // pragma: allowlist secret
      { name: 'public-user', role: 'user', public: true, secret: 'topsecret-2' }, // pragma: allowlist secret
    ]);

    const bodies: unknown[] = [];
    for (let i = 0; i < 3; i++) {
      const response = await request(app)
        .post('/arf12-distinct-root')
        .send([{ target: 'model', name: modelName, op: 'distinct', field: 'secret' }])
        .expect(200);
      bodies.push(response.body);
    }
    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[1]).toEqual(bodies[2]);
    expect(bodies[0][0].statusCode).toBe(403);
  });
});
