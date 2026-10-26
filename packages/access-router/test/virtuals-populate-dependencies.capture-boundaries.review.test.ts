/** Independent resumed DPV-06 probes for newly affected operation-capture boundaries. */
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
  mongoose.deleteModel(/^DpvCaptureReview/);
});

function latch() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

async function fixture(hydration: 'lean' | 'hydrated') {
  const api = createAccessRuntime();
  runtimes.push(api);
  api.setGlobalOptions({ requestComplexity: { maxBulkConcurrency: 1, maxHookConcurrency: 1 } } as never);
  const n = ++serial;
  const Account = mongoose.model(`DpvCaptureReviewAccount${n}`, new mongoose.Schema({ balance: Number }));
  const Source = mongoose.model(
    `DpvCaptureReviewSource${n}`,
    new mongoose.Schema({ name: String, account: { type: mongoose.Schema.Types.ObjectId, ref: Account.modelName } }),
  );
  api.createRouter(Account, { operationAccess: { read: true }, permissionSchema: { balance: false } });
  const getter = vi.fn((_doc, _permissions, _context, populated) => populated.account?.balance);
  const router = api.createRouter(Source, {
    operationAccess: { read: true, list: true },
    permissionSchema: { name: true, eligible: true, account: false },
    virtuals: { eligible: { get: getter, dependsOnPopulate: [{ path: 'account', select: 'balance -_id' }] } },
    hydration: { find: hydration, findOne: hydration, publicRead: hydration },
  } as never);
  const account = await Account.create({ balance: 7 });
  const source = await Source.create({ name: 'source', account: account._id });
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
    source,
    router,
    getter,
    include: {
      model: Source.modelName,
      op: 'read' as const,
      path: 'joined',
      localField: '_id',
      foreignField: '_id',
      args: { select: ['name', 'eligible', '-_id'] },
    },
    holdRead(miss = false) {
      const entered = latch();
      const held = latch();
      let calls = 0;
      api.setModelOption(Source.modelName, 'baseFilter.read', async () => {
        if (++calls === 1) {
          entered.resolve();
          await held.promise;
        }
        return miss ? { name: 'not-visible-through-read' } : {};
      });
      return { entered: entered.promise, release: held.resolve };
    },
    async execute<T>(run: (req: ModelRequest) => Promise<T>): Promise<T> {
      callback = run;
      failure = undefined;
      await request(app).post('/probe').send({}).expect(200);
      if (failure) throw failure;
      return value as T;
    },
  };
}

describe.each(['lean', 'hydrated'] as const)('DPV-06 include guard ownership (%s)', (hydration) => {
  it('does not give an independent nested Core check the include admission capture', async () => {
    const f = await fixture(hydration);
    const nestedDecisions: boolean[] = [];
    const guard = vi.fn(async function (this: ModelRequest) {
      // Bound accidental recursion so a leaked dispatch produces an observable
      // wrong grant instead of an unbounded recursive fixture or stack overflow.
      if (guard.mock.calls.length > 1) return true;
      await Promise.resolve();
      const allowed = await this.macl.isAllowed(f.Source.modelName, 'read');
      nestedDecisions.push(allowed);
      return allowed;
    });
    f.router.setOption('operationAccess.read', guard);
    const pause = f.holdRead();
    const result = await f.execute(async (req) => {
      const pending = req.macl
        .getService(f.Source.modelName)
        .findOne({ _id: f.source._id }, { select: ['name'], include: [f.include] }, quiet);
      await pause.entered;
      f.router.setOption('operationAccess.read', false);
      expect(await req.macl.isAllowed(f.Source.modelName, 'read')).toBe(false);
      pause.release();
      return pending;
    });
    expect({
      nestedDecisions,
      guardCalls: guard.mock.calls.length,
      success: result.success,
      code: result.code,
      getterCalls: f.getter.mock.calls.length,
    }).toEqual({
      nestedDecisions: [false],
      guardCalls: 1,
      success: false,
      code: 'unauthorized',
      getterCalls: 0,
    });
  });

  it('isolates concurrent captures on the same core and model', async () => {
    const f = await fixture(hydration);
    const pause = f.holdRead();
    const results = await f.execute(async (req) => {
      const service = req.macl.getService(f.Source.modelName);
      const args = { select: ['name'], include: [f.include] };
      const earlier = service.findOne({ _id: f.source._id }, args, quiet);
      await pause.entered;
      f.router.setOption('operationAccess.read', false);
      const later = await service.findOne({ _id: f.source._id }, args, quiet);
      pause.release();
      return [await earlier, later];
    });
    expect(results[0]).toMatchObject({ success: true, data: { joined: { name: 'source', eligible: 7 } } });
    expect(results[1]).toMatchObject({ success: false, code: 'unauthorized' });
    expect(f.getter).toHaveBeenCalledTimes(1);
  });

  it('gives a nested include its own later capture at hook concurrency one', async () => {
    const f = await fixture(hydration);
    let nested: unknown;
    const guard = vi.fn(async function (this: ModelRequest) {
      nested = await this.macl
        .getService(f.Source.modelName)
        .findOne({ _id: f.source._id }, { select: ['name'], include: [f.include] }, quiet);
      return true;
    });
    f.router.setOption('operationAccess.read', guard);
    const pause = f.holdRead();
    const result = await f.execute(async (req) => {
      const pending = req.macl
        .getService(f.Source.modelName)
        .findOne({ _id: f.source._id }, { select: ['name'], include: [f.include] }, quiet);
      await pause.entered;
      f.router.setOption('operationAccess.read', false);
      pause.release();
      return pending;
    });
    expect(nested).toMatchObject({ success: false, code: 'unauthorized' });
    expect(result).toMatchObject({ success: true, data: { joined: { eligible: 7 } } });
    expect(guard).toHaveBeenCalledTimes(1);
    expect(f.getter).toHaveBeenCalledTimes(1);
  });
});

describe.each(['lean', 'hydrated'] as const)('DPV-06 fallback operation capture (%s)', (hydration) => {
  describe.each(['_read', '_readFilter'] as const)('%s', (method) => {
    it.each([false, true])('retains its initial list admission (%s) through read suspension', async (initial) => {
      const f = await fixture(hydration);
      f.router.setOption('operationAccess.list', initial);
      const pause = f.holdRead(true);
      const results = await f.execute(async (req) => {
        const service = req.macl.getPublicService(f.Source.modelName);
        const read = () =>
          method === '_read'
            ? service._read(String(f.source._id), { select: ['eligible', '-_id'] }, { ...quiet, tryList: true })
            : service._readFilter({ _id: f.source._id }, { select: ['eligible', '-_id'] }, { ...quiet, tryList: true });
        const pending = read();
        await pause.entered;
        f.router.setOption('operationAccess.list', !initial);
        expect(await req.macl.isAllowed(f.Source.modelName, 'list')).toBe(!initial);
        pause.release();
        return [await pending, await read()];
      });
      expect(results[1].success).toBe(!initial);
      if (initial) {
        expect(results[0]).toMatchObject({ success: true, data: { eligible: 7 } });
        expect(results[1]).toMatchObject({ success: false, code: 'unauthorized' });
      } else {
        expect(results[0]).toMatchObject({ success: false, code: 'unauthorized' });
        expect(results[1]).toMatchObject({ success: true, data: { eligible: 7 } });
      }
      expect(f.getter).toHaveBeenCalledTimes(1);
    });
  });
});
