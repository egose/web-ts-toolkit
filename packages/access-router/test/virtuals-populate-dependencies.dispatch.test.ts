import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../dist/index.mjs';
import type { GuardHook, ModelRequest } from '../src/interfaces';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();
const quiet = { includePermissions: false, includeFieldPermissions: false, includeCount: false };
const runtimes: ReturnType<typeof createAccessRuntime>[] = [];
let serial = 0;
afterEach(() => {
  vi.restoreAllMocks();
  runtimes.splice(0).forEach((api) => api.runtime.clearOpenApiRoutes());
  mongoose.deleteModel(/^DpvDispatch/);
});

function latch() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

async function fixture(hydration: 'lean' | 'hydrated', maxHookConcurrency = 1) {
  const api = createAccessRuntime();
  runtimes.push(api);
  api.setGlobalOptions({
    globalPermissions: (req: express.Request) => [String(req.headers['x-actor'])],
    requestComplexity: { maxBulkConcurrency: 1, maxHookConcurrency },
  } as never);
  const n = ++serial;
  const Account = mongoose.model(`DpvDispatchAccount${n}`, new mongoose.Schema({ balance: Number }));
  const Source = mongoose.model(
    `DpvDispatchSource${n}`,
    new mongoose.Schema({ name: String, account: { type: mongoose.Schema.Types.ObjectId, ref: Account.modelName } }),
  );
  api.createRouter(Account, { operationAccess: { read: true }, permissionSchema: { balance: false } });
  const getter = vi.fn((_doc, _permissions, _context, populated) => populated.account?.balance);
  const router = api.createRouter(Source, {
    operationAccess: { read: true, list: false },
    permissionSchema: { name: true, eligible: true, account: false },
    virtuals: { eligible: { get: getter, dependsOnPopulate: [{ path: 'account', select: 'balance -_id' }] } },
    hydration: { find: hydration, findOne: hydration },
  } as never);
  const account = await Account.create({ balance: 7 });
  const source = await Source.create({ name: 'source', account: account._id });
  const read = (req: ModelRequest) =>
    req.macl.getService(Source.modelName).findOne(
      { _id: source._id },
      {
        select: ['name'],
        include: [
          {
            model: Source.modelName,
            op: 'read',
            path: 'joined',
            localField: '_id',
            foreignField: '_id',
            args: { select: ['name', 'eligible', '-_id'] },
          },
        ],
      },
      quiet,
    );
  return {
    api,
    Account,
    Source,
    router,
    getter,
    read,
    holdSource() {
      const entered = latch();
      const held = latch();
      let calls = 0;
      router.setOption('baseFilter.read', async () => {
        if (++calls === 1) {
          entered.resolve();
          await held.promise;
        }
        return {};
      });
      return { entered: entered.promise, release: held.resolve };
    },
    async execute<T>(run: (req: ModelRequest) => Promise<T>, actor = 'reader'): Promise<T> {
      let value!: T;
      let failure: unknown;
      const app = express();
      app.use(api());
      app.post('/probe', async (req, res) => {
        try {
          value = await run(req as ModelRequest);
        } catch (error) {
          failure = error;
        }
        res.json({ ok: true });
      });
      await request(app).post('/probe').set('x-actor', actor).send({}).expect(200);
      if (failure) throw failure;
      return value;
    },
  };
}

describe.each(['lean', 'hydrated'] as const)('DPV-10 one-shot include dispatch (%s)', (hydration) => {
  it.each(['immediate', 'awaited turn'] as const)(
    'keeps independent same/different-model/access checks fresh at an %s boundary',
    async (boundary) => {
      const f = await fixture(hydration);
      const decisions: boolean[][] = [];
      let owner!: ModelRequest;
      const guard = vi.fn<GuardHook<ModelRequest>>(async function () {
        // A leaked capture must fail assertions rather than recursively run forever.
        if (guard.mock.calls.length > 1) return true;
        if (boundary === 'awaited turn') await turn();
        const checks = await Promise.all([
          this.macl.isAllowed(f.Account.modelName, 'read'),
          this.macl.isAllowed(f.Source.modelName, 'list'),
          this.macl.isAllowed(f.Source.modelName, 'read'),
        ]);
        decisions.push(checks);
        return checks[2];
      });
      f.router.setOption('operationAccess.read', guard);
      const pause = f.holdSource();
      const result = await f.execute(async (req) => {
        owner = req;
        const pending = f.read(req);
        await pause.entered;
        f.router.setOption('operationAccess.read', false);
        f.api.setModelOption(f.Account.modelName, 'operationAccess.read', false);
        pause.release();
        return pending;
      });
      expect(decisions).toEqual([[false, false, false]]);
      expect(guard).toHaveBeenCalledTimes(1);
      expect(guard.mock.contexts[0]).toBe(owner);
      expect(guard.mock.calls[0][0].keys).toEqual(['reader']);
      expect(result).toMatchObject({ success: false, code: 'unauthorized' });
      expect(f.getter).not.toHaveBeenCalled();
    },
  );

  it('isolates two captured guards suspended concurrently on the same core/model/access', async () => {
    const f = await fixture(hydration, 2);
    const entered = [latch(), latch()];
    const held = latch();
    const decisions: boolean[] = [];
    const guards = entered.map((entry, index) =>
      vi.fn<GuardHook<ModelRequest>>(async function () {
        if (guards[index].mock.calls.length > 1) return true;
        entry.resolve();
        await held.promise;
        const fresh = await this.macl.isAllowed(f.Source.modelName, 'read');
        decisions[index] = fresh;
        return fresh;
      }),
    );
    const results = await f.execute(async (req) => {
      f.router.setOption('operationAccess.read', guards[0]);
      const first = f.read(req);
      await entered[0].promise;
      f.router.setOption('operationAccess.read', guards[1]);
      const second = f.read(req);
      await entered[1].promise;
      f.router.setOption('operationAccess.read', false);
      held.resolve();
      return Promise.all([first, second]);
    });
    expect(decisions).toEqual([false, false]);
    expect(guards.map((guard) => guard.mock.calls.length)).toEqual([1, 1]);
    expect(results).toMatchObject([
      { success: false, code: 'unauthorized' },
      { success: false, code: 'unauthorized' },
    ]);
    expect(f.getter).not.toHaveBeenCalled();
  });

  it('allows an explicit nested include to establish its own capture at hook/persistence limit one', async () => {
    const f = await fixture(hydration);
    const decisions: boolean[] = [];
    let nested: unknown;
    const inner = vi.fn<GuardHook<ModelRequest>>(async function (permissions) {
      if (inner.mock.calls.length > 1) return true;
      f.router.setOption('operationAccess.read', false);
      await turn();
      const fresh = await this.macl.isAllowed(f.Source.modelName, 'read');
      decisions.push(fresh);
      return !fresh && permissions.has('reader');
    });
    const outer = vi.fn<GuardHook<ModelRequest>>(async function () {
      if (outer.mock.calls.length > 1) return true;
      f.router.setOption('operationAccess.read', inner);
      nested = await f.read(this);
      const fresh = await this.macl.isAllowed(f.Source.modelName, 'read');
      decisions.push(fresh);
      return !fresh;
    });
    f.router.setOption('operationAccess.read', outer);
    const result = await f.execute(f.read);
    expect(decisions).toEqual([false, false]);
    expect(nested).toMatchObject({ success: true, data: { joined: { eligible: 7 } } });
    expect(result).toMatchObject({ success: true, data: { joined: { eligible: 7 } } });
    expect(outer).toHaveBeenCalledTimes(1);
    expect(inner).toHaveBeenCalledTimes(1);
    expect(f.getter).toHaveBeenCalledTimes(2);
  });

  it.each(['return', 'throw', 'reject'] as const)(
    'clears capture for suspended descendants after guard %s and admits a later fresh include',
    async (outcome) => {
      const f = await fixture(hydration);
      const held = latch();
      const failure = new Error('dispatch guard failed');
      let delayed!: Promise<boolean>;
      const guard = vi.fn<GuardHook<ModelRequest>>(function () {
        if (guard.mock.calls.length > 1) return true;
        f.router.setOption('operationAccess.read', false);
        delayed = held.promise.then(() => this.macl.isAllowed(f.Source.modelName, 'read'));
        if (outcome === 'throw') throw failure;
        if (outcome === 'reject') return Promise.reject(failure);
        return true;
      });
      f.router.setOption('operationAccess.read', guard);
      await f.execute(async (req) => {
        const pending = f.read(req);
        if (outcome === 'return') {
          expect(await pending).toMatchObject({ success: true, data: { joined: { eligible: 7 } } });
        } else {
          await expect(pending).rejects.toBe(failure);
        }
        expect(await req.macl.isAllowed(f.Source.modelName, 'read')).toBe(false);
        held.resolve();
        expect(await delayed).toBe(false);
        f.router.setOption('operationAccess.read', true);
        expect(await f.read(req)).toMatchObject({ success: true, data: { joined: { eligible: 7 } } });
      });
      expect(guard).toHaveBeenCalledTimes(1);
      expect(f.getter).toHaveBeenCalledTimes(outcome === 'return' ? 2 : 1);
    },
  );

  it('keeps concurrent actor/core captures separate while each nested check observes live denial', async () => {
    const f = await fixture(hydration);
    const entered = latch();
    const held = latch();
    const owners = new Set<ModelRequest>();
    const decisions: Array<{ actor: readonly string[]; fresh: boolean }> = [];
    const guard = vi.fn<GuardHook<ModelRequest>>(async function (permissions) {
      if (owners.has(this)) return true;
      owners.add(this);
      if (owners.size === 2) entered.resolve();
      await held.promise;
      const fresh = await this.macl.isAllowed(f.Source.modelName, 'read');
      decisions.push({ actor: permissions.keys, fresh });
      return permissions.has('reader') && !fresh;
    });
    f.router.setOption('operationAccess.read', guard);
    const pending = Promise.all([f.execute(f.read, 'reader'), f.execute(f.read, 'guest')]);
    await entered.promise;
    f.router.setOption('operationAccess.read', false);
    held.resolve();
    const results = await pending;
    expect(decisions).toEqual(
      expect.arrayContaining([
        { actor: ['reader'], fresh: false },
        { actor: ['guest'], fresh: false },
      ]),
    );
    expect(owners.size).toBe(2);
    expect(new Set([...owners].map((owner) => owner.macl)).size).toBe(2);
    expect(guard).toHaveBeenCalledTimes(2);
    expect(results[0]).toMatchObject({ success: true, data: { joined: { eligible: 7 } } });
    expect(results[1]).toMatchObject({ success: false, code: 'unauthorized' });
    expect(await f.execute(f.read)).toMatchObject({ success: false, code: 'unauthorized' });
    expect(f.getter).toHaveBeenCalledTimes(1);
  });
});
