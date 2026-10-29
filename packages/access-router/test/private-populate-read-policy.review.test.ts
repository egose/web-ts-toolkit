/** Independent PPR-04 probes: deferred source eligibility, masks and final attachment provenance. */
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../dist/index.mjs';
import type { ModelRequest } from '../src/interfaces';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();
const quiet = { includePermissions: false, includeFieldPermissions: false, includeCount: false };
const runtimes: ReturnType<typeof createAccessRuntime>[] = [];
let serial = 0;
afterEach(() => {
  vi.restoreAllMocks();
  runtimes.splice(0).forEach((api) => api.runtime.clearOpenApiRoutes());
  mongoose.deleteModel(/^PprIndependent/);
});

async function fixture(hydration: 'lean' | 'hydrated', strict: boolean, read = false) {
  const api = createAccessRuntime();
  runtimes.push(api);
  api.setGlobalOptions({
    globalPermissions: () => ['actor'],
    requestComplexity: { maxHookConcurrency: 1, maxBulkConcurrency: 1 },
  });
  api.setDefaultModelOption('requireOperationAccessForPopulateDependencies', strict);
  const n = ++serial;
  const Target = mongoose.model(
    `PprIndependentTarget${n}`,
    new mongoose.Schema({ amount: Number, date: Date, name: String }),
  );
  const Source = mongoose.model(
    `PprIndependentSource${n}`,
    new mongoose.Schema({ link: { type: mongoose.Schema.Types.ObjectId, ref: Target.modelName } }),
  );
  const Report = mongoose.model(
    `PprIndependentReport${n}`,
    new mongoose.Schema({ source: mongoose.Schema.Types.ObjectId, label: String }),
  );
  const guard = vi.fn(() => read);
  api.createRouter(Target, {
    operationAccess: { read: guard, list: true },
    permissionSchema: { name: true, amount: false, date: false },
    stripPermissionsField: true,
  });
  api.createRouter(Report, {
    operationAccess: { read: true, list: true, count: true },
    permissionSchema: { label: true },
    stripPermissionsField: true,
  });
  const amount = vi.fn((_doc, _permissions, _context, populated) => {
    const value = populated.link.amount;
    populated.link.date.setUTCFullYear(2001);
    return value;
  });
  const date = vi.fn((_doc, _permissions, _context, populated) => populated.link.date.toISOString());
  api.createRouter(Source, {
    operationAccess: { read: true, list: true },
    permissionSchema: { link: true, amount: true, date: true },
    virtuals: {
      amount: { get: amount, dependsOnPopulate: [{ path: 'link', select: 'amount date -_id' }] },
      date: { get: date, dependsOnPopulate: [{ path: 'link', select: 'date -_id' }] },
    },
    hydration: { findOne: hydration },
    stripPermissionsField: true,
  } as never);
  const target = await Target.create({ amount: 17, date: new Date('2026-10-01T00:00:00Z'), name: 'public' });
  const source = await Source.create({ link: target._id });
  await Report.create({ source: source._id, label: 'independent attachment' });
  const finds = vi.spyOn(Target.collection, 'find');
  const app = express();
  app.use(express.json());
  app.use(api());
  let callback: (req: ModelRequest) => Promise<unknown>;
  let value: unknown;
  let failure: unknown;
  app.post('/probe', async (req, res) => {
    try {
      value = await callback(req as ModelRequest);
    } catch (error) {
      failure = error;
    }
    res.json({ ok: true });
  });
  return {
    api,
    Target,
    Source,
    Report,
    target,
    source,
    guard,
    amount,
    date,
    finds,
    async execute<T>(run: (req: ModelRequest) => Promise<T>): Promise<T> {
      callback = run;
      failure = undefined;
      await request(app).post('/probe').send({}).expect(200);
      if (failure) throw failure;
      return value as T;
    },
  };
}

describe.each(['lean', 'hydrated'] as const)('PPR-04 adversarial output boundaries (%s)', (hydration) => {
  it.each([false, true])(
    'false mode respects an awaited source grant without any output-only read gate (%s)',
    async (grant) => {
      const f = await fixture(hydration, false);
      const field = vi.fn(async function (this: ModelRequest, permissions) {
        expect(permissions.has('actor')).toBe(true);
        await Promise.resolve();
        // Deliberately replace both live policies after the operation has captured them.
        f.api.setDefaultModelOption('requireOperationAccessForPopulateDependencies', true);
        f.api.setModelOption(f.Target.modelName, 'operationAccess.read', true);
        return grant;
      });
      f.api.setModelOption(f.Source.modelName, 'permissionSchema.link', field);
      const result = await f.execute((req) =>
        req.macl
          .getService(f.Source.modelName)
          .findOne({ _id: f.source._id }, { select: ['link', 'amount', 'date', '-_id'] }, quiet),
      );
      expect(result).toMatchObject({ success: true, data: { amount: 17, date: '2026-10-01T00:00:00.000Z' } });
      if (grant) expect(result).toHaveProperty('data.link', f.target._id);
      else expect(result).not.toHaveProperty('data.link');
      expect(field).toHaveBeenCalledTimes(1);
      expect(f.guard).not.toHaveBeenCalled();
      expect(f.finds).toHaveBeenCalledTimes(1);
      // Distinct fourth-argument masks remain isolated despite sharing a raw query/target.
      expect(Object.keys(f.amount.mock.calls[0][3].link).sort()).toEqual(['amount', 'date']);
      expect(Object.keys(f.date.mock.calls[0][3].link)).toEqual(['date']);
      expect(f.amount.mock.calls[0][0]).not.toHaveProperty('link.amount');
      expect(f.date.mock.calls[0][0]).not.toHaveProperty('link.date');
      expect((await f.Target.findById(f.target._id).lean())!.date).toEqual(new Date('2026-10-01T00:00:00Z'));
    },
  );

  describe.each([true, false])('strict=%s', (strict) => {
    it.each(['row', 'query'] as const)(
      'a %s failure does not cause a second read decision or hide allowed IDs',
      async (failure) => {
        const f = await fixture(hydration, strict, true);
        f.guard.mockReturnValueOnce(true).mockReturnValue(false);
        if (failure === 'row')
          f.api.setModelOption(f.Target.modelName, 'baseFilter.read', () => {
            throw new Error('unavailable private row policy');
          });
        else
          f.finds.mockImplementation(() => {
            throw new Error('unavailable private query');
          });
        const result = await f.execute((req) =>
          req.macl
            .getService(f.Source.modelName)
            .findOne({ _id: f.source._id }, { select: ['link', 'amount', 'date', '-_id'] }, quiet),
        );
        expect(result).toMatchObject({ success: true, data: { link: f.target._id } });
        expect(result).not.toHaveProperty('data.amount');
        expect(result).not.toHaveProperty('data.date');
        expect(f.guard).toHaveBeenCalledTimes(Number(strict));
        expect(f.finds).toHaveBeenCalledTimes(failure === 'row' ? 0 : 1);
        expect(f.amount).not.toHaveBeenCalled();
        expect(f.date).not.toHaveBeenCalled();
      },
    );

    it.each(['read', 'list', 'count', 'read-miss', 'read-row-denied'] as const)(
      '%s include colliding with a dependency ref preserves only actual attachment provenance',
      async (mode) => {
        const f = await fixture(hydration, strict);
        if (mode === 'read-row-denied') f.api.setModelOption(f.Report.modelName, 'baseFilter.read', () => false);
        const produced = mode === 'read' || mode === 'list' || mode === 'count';
        const result = await f.execute((req) =>
          req.macl.getService(f.Source.modelName).findOne(
            { _id: f.source._id },
            {
              select: ['link', 'amount', '-_id'],
              include: [
                {
                  model: f.Report.modelName,
                  op: mode === 'list' || mode === 'count' ? mode : 'read',
                  path: 'link',
                  localField: '_id',
                  foreignField: 'source',
                  ...(mode === 'read-miss' ? { filter: { label: 'missing' } } : {}),
                  args: { select: ['label', '-_id'] },
                },
              ],
            },
            quiet,
          ),
        );
        expect(result).toMatchObject({ success: true });
        if (!result.success) throw new Error(result.code);
        if (produced)
          expect(result.data.link).toEqual(
            mode === 'count'
              ? 1
              : mode === 'list'
                ? [{ label: 'independent attachment' }]
                : { label: 'independent attachment' },
          );
        else expect(result.data.link).toEqual(f.target._id);
        if (strict) expect(result.data).not.toHaveProperty('amount');
        else expect(result.data).toHaveProperty('amount', 17);
        expect(f.guard).toHaveBeenCalledTimes(Number(strict));
        if (produced) expect(JSON.stringify(result.data)).not.toContain(String(f.target._id));
        expect(result.context.originalDocumentSnapshot.link).toEqual(f.target._id);
        expect(result.data).not.toHaveProperty('link.amount');
        expect((await f.Source.findById(f.source._id).lean())!.link).toEqual(f.target._id);
      },
    );
  });
});
