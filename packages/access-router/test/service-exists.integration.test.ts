import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
      upsert: true,
    },
    permissionSchema: {
      name: true,
      public: true,
    },
    baseFilter: {
      read: () => ({ public: true }),
      update: () => false,
    },
    overrideFilter: {
      read: (filter) => (filter && filter.name === 'override-denied' ? false : filter),
    },
  });

  router.router.get('/custom/exists', async (req) => {
    const svc = req.macl.getService(modelName);
    const access = req.query.access === 'update' ? 'update' : 'read';
    const includeId = req.query.includeId === 'true';

    return svc.exists(req.query.deny === 'true' ? false : { name: String(req.query.name ?? '') }, {
      access,
      includeId,
    });
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
  const rootPath = `${basePath}-root`;
  app.use(acl.createRouter({ basePath: rootPath, operationAccess: true }).routes);

  return { app, basePath, modelName, rootPath };
};

afterEach(() => {
  vi.restoreAllMocks();
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

  it.each([false, true])(
    'returns Forbidden for denied access, includeId=%s (custom route owns HTTP status)',
    async (includeId) => {
      const { app, basePath, modelName } = await createExistsApp();
      const findOne = vi.spyOn(mongoose.model(modelName), 'findOne');

      const response = await request(app)
        .get(`${basePath}/custom/exists?name=public-user&access=update&includeId=${includeId}`)
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toMatchObject({
        success: false,
        kind: 'error',
        code: 'forbidden',
        query: { filter: false },
      });
      expect(response.body).not.toHaveProperty('data');
      expect(findOne).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    'distinguishes explicit/override denial from ACL no-match, includeId=%s',
    async (includeId) => {
      const { app, basePath, modelName } = await createExistsApp();
      const findOne = vi.spyOn(mongoose.model(modelName), 'findOne');
      for (const query of ['name=public-user&deny=true', 'name=override-denied']) {
        const response = await request(app)
          .get(`${basePath}/custom/exists?${query}&includeId=${includeId}`)
          .expect(200);
        expect(response.body).toMatchObject({ success: false, code: 'forbidden', query: { filter: false } });
        expect(response.body).not.toHaveProperty('data');
      }
      expect(findOne).not.toHaveBeenCalled();
      const hidden = await request(app)
        .get(`${basePath}/custom/exists?name=private-user&includeId=${includeId}`)
        .expect(200);
      expect(hidden.body).toMatchObject({ success: true, data: includeId ? null : false });
      expect(findOne).toHaveBeenCalledTimes(1);
    },
  );

  it('maps denied public upsert to direct/root-entry 403 without lookup or mutation', async () => {
    const { app, basePath, modelName, rootPath } = await createExistsApp();
    const User = mongoose.model(modelName);
    const doc = await User.findOne({ name: 'public-user' }).lean();
    const findOne = vi.spyOn(User, 'findOne');
    const create = vi.spyOn(User, 'create');
    const save = vi.spyOn(User.prototype, 'save');
    const data = { _id: String(doc!._id), name: 'changed' };
    await request(app).put(`${basePath}/__mutation`).send({ data }).expect(403);
    const root = await request(app)
      .post(rootPath)
      .send([{ target: 'model', name: modelName, op: 'upsert', data }])
      .expect(200);
    expect(root.body[0]).toMatchObject({ statusCode: 403, result: { success: false, code: 'forbidden' } });
    expect(findOne).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(await User.collection.findOne({ _id: doc!._id })).toMatchObject({ name: 'public-user' });
    expect(await User.collection.countDocuments({})).toBe(2);
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
