/** Independent DPV-06 contract regressions. Required findings remain failing until corrected. */
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
  runtimes.splice(0).forEach((api) => api.runtime.clearOpenApiRoutes());
  mongoose.deleteModel(/^DpvReview/);
});

function latch() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

async function fixture(hydration: 'lean' | 'hydrated', privateDependency = true) {
  const api = createAccessRuntime();
  runtimes.push(api);
  const n = ++serial;
  const Target = mongoose.model(`DpvReviewTarget${n}`, new mongoose.Schema({ name: String, balance: Number }));
  const Source = mongoose.model(
    `DpvReviewSource${n}`,
    new mongoose.Schema({ account: { type: mongoose.Schema.Types.ObjectId, ref: Target.modelName } }),
  );
  const targetRouter = api.createRouter(Target, {
    operationAccess: { read: true },
    permissionSchema: { name: true, balance: true },
  });
  const getter = vi.fn((_doc, _permissions, _context, populated) => populated.account?.balance);
  api.createRouter(Source, {
    operationAccess: { read: true, list: true },
    permissionSchema: { account: true, eligible: true },
    hydration: { find: hydration, findOne: hydration },
    virtuals: privateDependency
      ? { eligible: { get: getter, dependsOnPopulate: [{ path: 'account', select: 'balance -_id' }] } }
      : {},
  } as never);
  const target = await Target.create({ name: 'public name', balance: 7 });
  const source = await Source.create({ account: target._id });
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
    Source,
    Target,
    source,
    target,
    targetRouter,
    getter,
    async execute<T>(run: (req: ModelRequest) => Promise<T>): Promise<T> {
      callback = run;
      failure = undefined;
      await request(app).post('/probe').send({}).expect(200);
      if (failure) throw failure;
      return value as T;
    },
  };
}

describe.each(['lean', 'hydrated'] as const)('DPV-06 frozen public intent (%s)', (hydration) => {
  it.each(['findOne', 'find'] as const)('%s owns caller selection before row hooks await', async (method) => {
    const f = await fixture(hydration);
    const entered = latch();
    const held = latch();
    f.api.setModelOption(f.Source.modelName, `baseFilter.${method === 'find' ? 'list' : 'read'}`, async () => {
      entered.resolve();
      await held.promise;
      return {};
    });
    const result = await f.execute(async (req) => {
      const service = req.macl.getService(f.Source.modelName);
      const args = { select: ['eligible', '-_id'] };
      const pending = service[method]({ _id: f.source._id }, args, quiet);
      await entered.promise;
      args.select.push('account');
      held.resolve();
      return pending;
    });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.code);
    const row = result.kind === 'list' ? result.data[0] : result.data;
    expect(row).toHaveProperty('eligible', 7);
    expect(row).not.toHaveProperty('account');
    expect(f.getter).toHaveBeenCalledTimes(1);
  });

  it('owns the original public populated target selection before row hooks await', async () => {
    const f = await fixture(hydration);
    const entered = latch();
    const held = latch();
    f.api.setModelOption(f.Source.modelName, 'baseFilter.read', async () => {
      entered.resolve();
      await held.promise;
      return {};
    });
    const result = await f.execute(async (req) => {
      const select = ['name', '-_id'];
      const pending = req.macl
        .getService(f.Source.modelName)
        .findOne(
          { _id: f.source._id },
          { select: ['account', 'eligible', '-_id'], populate: [{ path: 'account', select }] },
          quiet,
        );
      await entered.promise;
      select.push('balance');
      held.resolve();
      return pending;
    });
    expect(result).toMatchObject({ success: true, data: { eligible: 7 } });
    if (!result.success) throw new Error(result.code);
    expect(result.data.account).toEqual({ name: 'public name' });
  });

  it('owns assigned server service defaults before row hooks await', async () => {
    const f = await fixture(hydration);
    const entered = latch();
    const held = latch();
    f.api.setModelOption(f.Source.modelName, 'baseFilter.read', async () => {
      entered.resolve();
      await held.promise;
      return {};
    });
    const result = await f.execute(async (req) => {
      const service = req.macl.getService(f.Source.modelName);
      service.defaults = { findOneArgs: { select: ['eligible', '-_id'] } };
      const pending = service.findOne({ _id: f.source._id }, undefined, quiet);
      await entered.promise;
      service.defaults = { findOneArgs: { select: ['account', 'eligible', '-_id'] } };
      held.resolve();
      return pending;
    });
    expect(result).toMatchObject({ success: true, data: { eligible: 7 } });
    if (!result.success) throw new Error(result.code);
    expect(result.data).not.toHaveProperty('account');
  });
});

describe.each(['lean', 'hydrated'] as const)('DPV-06 captured ordinary guard equivalence (%s)', (hydration) => {
  it.each([false, true])('retains exact runtime-default fallback (private dependency=%s)', async (enabled) => {
    const f = await fixture(hydration, enabled);
    f.api.setDefaultModelOption('operationAccess.read', true);
    f.targetRouter.setOption('operationAccess', undefined as never);
    expect(f.api.getModelOption(f.Target.modelName, 'operationAccess.read')).toBe(true);
    const result = await f.execute(async (req) => {
      expect(await req.macl.isAllowed(f.Target.modelName, 'read')).toBe(true);
      return req.macl.getService(f.Source.modelName).findOne(
        { _id: f.source._id },
        {
          select: ['account', ...(enabled ? ['eligible'] : []), '-_id'],
          populate: [{ path: 'account', select: 'name -_id' }],
        },
        quiet,
      );
    });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.code);
    if (enabled) expect(result.data).toHaveProperty('eligible', 7);
    expect(result.data.account).toEqual({ name: 'public name' });
  });
});
