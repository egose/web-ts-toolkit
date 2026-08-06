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

const createExistsApp = async ({ seed = true }: { seed?: boolean } = {}) => {
  const modelName = `AclMongoExistsUser${++modelCounter}`;
  const schema = new mongoose.Schema({
    name: String,
    public: Boolean,
  });

  schema.plugin(permissionsPlugin, { modelName });

  const User = mongoose.model(modelName, schema);

  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => [],
  });

  // Each createExistsApp() invocation registers its own OpenAPI route under
  // a basePath that is unique per model name. The previous test created
  // multiple routers against the same fixed `/exists-users` path, which
  // collided under ARF-08's strict-by-default OpenAPI collision policy.
  // Deriving the basePath from the unique model name eliminates the collision
  // while preserving the per-test behaviour under test.
  const basePath = `/exists-users/${modelName}`;
  const router = acl.createRouter(modelName, {
    basePath,
    operationAccess: {
      list: true,
      read: true,
    },
    permissionSchema: {
      name: true,
      public: true,
    },
    baseFilter: {
      read: () => ({ public: true }),
      update: () => false,
    },
  });

  router.router.get('/custom/exists', async (req) => {
    const svc = req.macl.getService(modelName);
    const access = req.query.access === 'update' ? 'update' : 'read';
    const includeId = req.query.includeId === 'true';

    return svc.exists(
      { name: String(req.query.name ?? '') },
      {
        access,
        includeId,
      },
    );
  });

  if (seed) {
    await User.create([
      { name: 'public-user', public: true },
      { name: 'private-user', public: false },
    ]);
  }

  const app = express();
  app.use(express.json());
  app.use(router.routes);

  return { app, basePath, modelName };
};

afterEach(() => {
  resetGlobalOptions();
  mongoose.deleteModel(/AclMongoExistsUser.*/);
});

describe('service exists integration', () => {
  it('returns boolean existence results using the default access level', async () => {
    const { app, basePath } = await createExistsApp();
    const { app: emptyApp, basePath: emptyBasePath } = await createExistsApp({ seed: false });

    const publicExists = await request(app)
      .get(`${basePath}/custom/exists?name=public-user`)
      .expect(200)
      .expect('Content-Type', /json/);

    const missingExists = await request(emptyApp)
      .get(`${emptyBasePath}/custom/exists?name=missing-user`)
      .expect(200)
      .expect('Content-Type', /json/);

    expect(publicExists.body).toMatchObject({
      success: true,
      kind: 'single',
      code: 'success',
      data: true,
    });
    expect(missingExists.body).toMatchObject({
      success: true,
      kind: 'single',
      code: 'success',
      data: false,
    });
  });

  it('returns the matching id when includeId is enabled', async () => {
    const { app, basePath } = await createExistsApp();

    const response = await request(app)
      .get(`${basePath}/custom/exists?name=public-user&includeId=true`)
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body.data).toMatchObject({
      _id: expect.any(String),
    });
  });

  it('honors the requested access override', async () => {
    const { app, basePath } = await createExistsApp();

    const response = await request(app)
      .get(`${basePath}/custom/exists?name=public-user&access=update`)
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body).toMatchObject({
      success: true,
      kind: 'single',
      code: 'success',
      data: false,
    });
  });

  // ARF-12 #1: Regimented regression coverage for exists() behaviour when an
  // unrelated document is present. The original test only seeded the queried
  // collection into an empty store; a buggy exists() that ignored the supplied
  // filter (e.g. returned `true` whenever any document existed) would pass
  // that test. These tests fail-against-buggy-behaviour by keeping an
  // unrelated document in the store alongside the requested query.
  describe('ARF-12 exists() unrelated-document regression', () => {
    it('returns false when only an unrelated document exists in the collection', async () => {
      const { app, basePath, modelName } = await createExistsApp({ seed: false });

      const UnrelatedModel = mongoose.model(modelName);
      await UnrelatedModel.create([
        { name: 'public-user', public: true },
        { name: 'private-user', public: false },
      ]);

      // An unrelated document is present, but the requested `name` does not
      // match it. A buggy exists() that picks the first document regardless
      // of the filter would return `true`.
      const missingExists = await request(app)
        .get(`${basePath}/custom/exists?name=missing`)
        .expect(200)
        .expect('Content-Type', /json/);

      expect(missingExists.body).toMatchObject({
        success: true,
        kind: 'single',
        code: 'success',
        data: false,
      });
    });

    it('returns true for the matching row and false for a non-matching name when both rows exist', async () => {
      const { app, basePath } = await createExistsApp();

      const matchExists = await request(app)
        .get(`${basePath}/custom/exists?name=public-user`)
        .expect(200)
        .expect('Content-Type', /json/);

      const missingExists = await request(app)
        .get(`${basePath}/custom/exists?name=missing-user`)
        .expect(200)
        .expect('Content-Type', /json/);

      expect(matchExists.body).toMatchObject({ data: true });
      expect(missingExists.body).toMatchObject({ data: false });
    });

    it('returns only the requested row id from includeId, never the unrelated document id', async () => {
      const { app, basePath, modelName } = await createExistsApp();

      const User = mongoose.model(modelName);
      const publicDoc = await User.findOne({ name: 'public-user' }).select('_id').lean();
      const privateDoc = await User.findOne({ name: 'private-user' }).select('_id').lean();
      expect(publicDoc?._id).toBeDefined();
      expect(privateDoc?._id).toBeDefined();
      const publicId = String(publicDoc!._id);
      const privateId = String(privateDoc!._id);
      expect(publicId).not.toBe(privateId);

      const matchResponse = await request(app)
        .get(`${basePath}/custom/exists?name=public-user&includeId=true`)
        .expect(200)
        .expect('Content-Type', /json/);

      expect(matchResponse.body.data).toMatchObject({ _id: publicId });
      expect(String(matchResponse.body.data._id)).not.toBe(privateId);

      // Sanity: a missing name must not return any id from the unrelated row.
      const missingResponse = await request(app)
        .get(`${basePath}/custom/exists?name=does-not-exist&includeId=true`)
        .expect(200)
        .expect('Content-Type', /json/);

      expect(missingResponse.body).toMatchObject({ data: null });
      expect(missingResponse.body.data).toBeNull();
    });
  });
});
