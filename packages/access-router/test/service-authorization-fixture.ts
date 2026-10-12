import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { createAccessRuntime, permissionsPlugin } from '../dist/index.mjs';
import type { ModelRequest } from '../src/interfaces';

let sequence = 0;
export const quiet = { skim: true, lean: true, includePermissions: false, includeFieldPermissions: false };
export const noteGrant = { outputFields: { mode: 'grant' as const, paths: ['internalNote'] } };

/** Assertions run outside Express's error handler so failures retain their real cause. */
export async function authorizationFixture(options: Record<string, unknown> = {}) {
  const api = createAccessRuntime();
  const modelName = `Sva05Order${++sequence}`;
  const schema = new mongoose.Schema(
    {
      status: { type: String, default: 'draft' },
      internalNote: { type: String, default: 'server-default', select: false },
      ownerId: { type: String, default: 'alice' },
      tenant: String,
      slug: String,
      contacts: [{ email: String, ssn: String }],
    },
    { strict: false },
  );
  const projections: Array<Record<string, number>> = [];
  schema.pre('find', function () {
    projections.push({ ...this.projection() });
  });
  schema.pre('findOne', function () {
    projections.push({ ...this.projection() });
  });
  schema.plugin(permissionsPlugin, { modelName });
  const Model = mongoose.model(modelName, schema);
  api.setGlobalOptions({ requestPermissionField: '_permissions', globalPermissions: () => [] });
  const router = api.createRouter(Model, {
    basePath: `/sva05-${sequence}`,
    operationAccess: { read: true, list: true, create: true, update: true, new: true },
    permissionSchema: { status: true, internalNote: false, slug: true, tenant: true },
    ...options,
  } as never);
  const rows = await Model.insertMany([
    {
      status: 'ready',
      internalNote: 'note-a',
      ownerId: 'alice',
      tenant: 'a',
      slug: 'first',
      contacts: [{ email: 'a@x', ssn: 'hidden' }],
    },
    { status: 'closed', internalNote: 'note-b', ownerId: 'bob', tenant: 'b', slug: 'second' },
  ]);
  const basePath = `/sva05-${sequence}`;
  const app = express();
  app.use(express.json());
  app.use(router.routes);
  let run: (req: ModelRequest) => Promise<void>;
  let failure: unknown;
  router.router.post('/probe', async (req, res) => {
    try {
      await run(req as unknown as ModelRequest);
    } catch (error) {
      failure = error;
    }
    res.json({ ok: true });
  });
  return {
    api,
    router,
    Model,
    modelName,
    rows,
    projections,
    async execute(callback: (req: ModelRequest) => Promise<void>) {
      failure = undefined;
      run = callback;
      await request(app).post(`${basePath}/probe`).send({}).expect(200);
      if (failure) throw failure;
    },
  };
}
