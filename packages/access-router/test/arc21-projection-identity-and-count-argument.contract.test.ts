/**
 * ARC-21 (cross-package server contract): documents two server-side
 * behaviors the client (`@web-ts-toolkit/access-router-client`) relies on
 * for the projection-identity and count-argument contracts.
 *
 * 1. Projection identity: An inclusion-style `select` projection (e.g.
 *    `['name']` or `'name'`) returns the document with `_id` retained
 *    (the mongoose default for inclusion projections). An exclusion-style
 *    projection that explicitly drops `_id` (e.g. `['-_-id', 'name']` or a
 *    KeyValueProjection with `{ _id: -1 }`) returns the document WITHOUT
 *    `_id`. The client pairs this with a captured persistence identity on
 *    `Model` so a `save()` after an `_id`-stripping read cannot silently
 *    create a duplicate.
 * 2. Count argument: The POST `/count` body schema (
 *    `countBodySchema` in `src/validation/model-router.ts`) explicitly
 *    rejects an `access` field. The obsolete `countAdvanced(filter, {
 *    access: 'list' | 'read' })` client signature was aligned to this
 *    contract by removing the argument entirely; this test asserts the
 *    server continues to refuse it so a re-added client argument would
 *    fail loudly rather than be silently dropped.
 */
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import acl, { defaultRuntime, permissionsPlugin, setGlobalOptions } from '../dist/index.mjs';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

let modelCounter = 0;

const resetGlobalOptions = () => {
  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => [],
  });
};

const createArcApp = async () => {
  const modelName = `Arc21ProjectionUser${++modelCounter}`;
  const schema = new mongoose.Schema({
    name: String,
    role: String,
    public: Boolean,
  });

  schema.plugin(permissionsPlugin, { modelName });

  const User = mongoose.model(modelName, schema);

  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => ['isAdmin'],
  });

  const router = acl.createRouter(modelName, {
    basePath: '/arc21-users',
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
    },
  });

  const [seeded] = await User.create([{ name: 'arc21-seed', role: 'admin', public: true }]);
  const seededId = String(seeded._id);

  const app = express();
  app.use(express.json());
  app.use(router.routes);

  return { app, seededId, User, modelName };
};

afterEach(() => {
  resetGlobalOptions();
  defaultRuntime.clearOpenApiRoutes();
  mongoose.deleteModel(/Arc21ProjectionUser.*/);
});

describe('ARC-21 projection identity and count argument contract', () => {
  describe('projection identity — inclusion projections retain `_id`', () => {
    it('GET list with no `select` returns full documents INCLUDING `_id`', async () => {
      const { app } = await createArcApp();

      const list = await request(app).get('/arc21-users').expect(200).expect('Content-Type', /json/);

      expect(Array.isArray(list.body.data ? list.body.data : list.body)).toBe(true);
      const rows: Array<{ _id?: string }> = (list.body.data ?? list.body) as Array<{ _id?: string }>;
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(typeof row._id).toBe('string');
        expect(row._id).toBeTruthy();
      }
    });

    it('POST /__query with `select: ["name"]` STILL returns `_id` (mongoose default for inclusion projections)', async () => {
      const { app, seededId } = await createArcApp();

      const advancedList = await request(app)
        .post('/arc21-users/__query')
        .send({ select: ['name'] })
        .expect(200)
        .expect('Content-Type', /json/);

      const rows = (advancedList.body.data ?? advancedList.body) as Array<Record<string, unknown>>;
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        // The server applies `builder.select('name')` which keeps `_id` by
        // default — this is what lets the client resolve persistence identity
        // from `_data._id` for save-capable list items.
        expect(row._id).toBeDefined();
        expect(String(row._id)).toBe(seededId);
        expect(row).not.toHaveProperty('role');
        expect(row).toHaveProperty('name');
      }
    });

    it('POST /__query/__filter with `select: ["role"]` retains `_id` and returns only the requested field plus `_id`', async () => {
      const { app, seededId } = await createArcApp();

      const result = await request(app)
        .post('/arc21-users/__query/__filter')
        .send({ filter: {}, select: ['role'] })
        .expect(200)
        .expect('Content-Type', /json/);

      const body = result.body as Record<string, unknown>;
      expect(body._id).toBeDefined();
      expect(String(body._id)).toBe(seededId);
      expect(body).toHaveProperty('role');
      expect(body).not.toHaveProperty('name');
    });
  });

  describe('projection identity — explicit `_id` exclusion strips identity', () => {
    it('POST /__query with `select: ["name", "-_id"]` returns rows WITHOUT `_id`', async () => {
      const { app } = await createArcApp();

      const result = await request(app)
        .post('/arc21-users/__query')
        .send({ select: ['name', '-_id'] })
        .expect(200)
        .expect('Content-Type', /json/);

      const rows = (result.body.data ?? result.body) as Array<Record<string, unknown>>;
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        // Mongoose interprets `-_id` as an explicit exclusion, stripping
        // the otherwise-included `_id` from each row. This is the projection
        // that the client protects against: an `Model.save()` over such a row
        // cannot silently POST a duplicate; it falls back to the `Model`'s
        // captured persistence identity (when the read was by id) or throws
        // `MissingPersistenceIdentityError` (when the read was a filter).
        expect(row).not.toHaveProperty('_id');
        expect(row).toHaveProperty('name');
      }
    });

    it('POST /__query/<id> with `select: ["name", "-_id"]` strips `_id` from the single document read', async () => {
      const { app, seededId } = await createArcApp();

      const result = await request(app)
        .post(`/arc21-users/__query/${seededId}`)
        .send({ select: ['name', '-_id'], options: { includePermissions: false } })
        .expect(200)
        .expect('Content-Type', /json/);

      const body = result.body as Record<string, unknown>;
      expect(body).not.toHaveProperty('_id');
      expect(body).toHaveProperty('name');
    });
  });

  describe('count argument — POST /count rejects an obsolete `access` key', () => {
    it('POST /count with only `filter` succeeds and returns the document count', async () => {
      const { app } = await createArcApp();

      const result = await request(app)
        .post('/arc21-users/count')
        .send({ filter: { public: true } })
        .expect(200)
        .expect('Content-Type', /json/);

      expect(Number(result.text)).toBeGreaterThan(0);
    });

    it('POST /count with an `access` key is rejected by `countBodySchema` with 400 Unsupported field', async () => {
      const { app } = await createArcApp();

      const result = await request(app)
        .post('/arc21-users/count')
        .send({ filter: {}, access: 'read' })
        .expect('Content-Type', /application\/problem\+json/);

      // The count body schema (`src/validation/model-router.ts` countBodySchema)
      // superRefines with rejectKeys(['query', 'access', 'options']) so an
      // `access` key produces a 400 with a problem payload pointing at the
      // forbidden field. The client removed that argument because of this
      // contract; if it is reintroduced here, this test fails first.
      expect(result.status).toBeGreaterThanOrEqual(400);
      const body = result.body as Record<string, unknown>;
      expect(body).toBeTruthy();
      const errors = (body.errors ?? body.validationErrors ?? []) as Array<{ pointer?: string; field?: string }>;
      const errorText = JSON.stringify(body).toLowerCase();
      expect(errorText).toContain('access');
    });

    it('POST /count with an `options.access` shape is ALSO rejected (covered by the same `access` rejection)', async () => {
      const { app } = await createArcApp();

      const result = await request(app)
        .post('/arc21-users/count')
        .send({ filter: {}, options: { access: 'list' } })
        .expect('Content-Type', /application\/problem\+json/);

      expect(result.status).toBeGreaterThanOrEqual(400);
      const errorText = JSON.stringify(result.body as Record<string, unknown>).toLowerCase();
      // `options` is one of the rejected keys too; assert at least one of
      // them appears in the rejection payload.
      expect(errorText.includes('access') || errorText.includes('options')).toBe(true);
    });
  });
});
