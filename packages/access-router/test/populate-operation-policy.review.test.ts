import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../dist/index.mjs';
import type { ModelRequest } from '../dist/advanced';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();
let sequence = 0;
afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^PopReview/);
});

describe.each([true, false])('POP-05 mutable populate transforms (Q=%s)', (required) => {
  it.each([
    { seam: 'canonical', rewrite: 'object' },
    { seam: 'helper', rewrite: 'object' },
    { seam: 'canonical', rewrite: 'native' },
    { seam: 'helper', rewrite: 'native' },
  ] as const)(
    '$seam isolates an in-place $rewrite transform while retaining requested match, rows and original IDs',
    async ({ seam, rewrite }) => {
      const api = createAccessRuntime();
      api.setGlobalOption('requireOperationAccessForPopulateQueries', required);
      const Target = mongoose.model(
        `PopReviewTarget${++sequence}`,
        new mongoose.Schema({ name: String, tenant: String, secret: String, since: Date }),
      );
      const Parent = mongoose.model(
        `PopReviewParent${sequence}`,
        new mongoose.Schema({ refs: [{ type: mongoose.Schema.Types.ObjectId, ref: Target.modelName }] }),
      );
      const transform = vi.fn((filter: Record<string, unknown>) => {
        // Existing override hooks may rewrite ordinary input in place. This must
        // receive a mutable copy, not the immutable required relationship match.
        if (rewrite === 'object') {
          delete filter.name;
          filter.tenant = 'a';
        } else {
          // Frozen containers do not make Date leaves immutable. A copied
          // transform input must not rewrite the mandatory captured predicate.
          (filter.since as { $gte: Date }).$gte.setUTCFullYear(2000);
        }
        return filter;
      });
      api.registerModelInstance(Target.modelName, Target);
      api.setModelOptions(Target.modelName, {
        operationAccess: { read: required },
        permissionSchema: { name: true, secret: false },
        overrideFilter: { read: transform },
        baseFilter: { read: () => ({ tenant: 'a' }) },
      });
      const router = api.createRouter(Parent, {
        basePath: '/parents',
        operationAccess: true,
        permissionSchema: { refs: true },
        stripPermissionsField: true,
      });
      const since = new Date('2026-10-26T00:00:00Z');
      const [visible, wrongMatch, wrongRow, unrelated] = await Target.create([
        { name: 'kept', tenant: 'a', secret: 'private-a', since }, // pragma: allowlist secret
        { name: 'other', tenant: 'a', since: new Date('2025-01-01T00:00:00Z') },
        { name: 'kept', tenant: 'b', since },
        { name: 'kept', tenant: 'a', since },
      ]);
      const parent = await Parent.create({ refs: [visible._id, wrongMatch._id, wrongRow._id] });
      const match = rewrite === 'object' ? { name: 'kept' } : { since: { $gte: since } };
      const populate = [{ path: 'refs', select: ['name'], match }];
      const queries = vi.spyOn(Target.collection, 'find');
      let failure: unknown;
      router.router.post('/probe', async (req, res) => {
        try {
          const core = (req as ModelRequest).macl;
          if (seam === 'helper') {
            const descriptors = await core.genPopulate(Parent.modelName, 'read', populate);
            const output = await Parent.findById(parent._id).populate(descriptors).lean();
            expect(output?.refs).toHaveLength(1);
            expect(output?.refs).toMatchObject([{ _id: visible._id, name: 'kept' }]);
            expect(output?.refs[0]).not.toHaveProperty('secret');
          } else {
            const result = await core
              .getService(Parent.modelName)
              .findOne(
                { _id: parent._id },
                { select: ['refs'], populate },
                { includePermissions: false, includeFieldPermissions: false, includeCount: false },
              );
            expect(result).toMatchObject({ success: true, data: { refs: [{ _id: visible._id, name: 'kept' }] } });
            if (!result.success) throw new Error(result.code);
            expect(result.data.refs).toHaveLength(1);
            expect(result.data.refs[0]).not.toHaveProperty('secret');
          }
          expect(match).toEqual(
            rewrite === 'object' ? { name: 'kept' } : { since: { $gte: new Date('2026-10-26T00:00:00Z') } },
          );
          expect(transform).toHaveBeenCalledTimes(1);
          expect(queries).toHaveBeenCalledTimes(1);
          expect(JSON.stringify(queries.mock.calls[0][0])).not.toContain(String(unrelated._id));
        } catch (error) {
          failure = error;
        }
        res.json({ ok: true });
      });
      const app = express();
      app.use(router.routes);
      try {
        await request(app).post('/parents/probe').expect(200, { ok: true });
        if (failure) throw failure;
      } finally {
        api.runtime.clearOpenApiRoutes();
      }
    },
  );
});
