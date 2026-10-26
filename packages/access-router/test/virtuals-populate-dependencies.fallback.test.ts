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
  mongoose.deleteModel(/^DpvFallback/);
});

function latch() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

async function fixture(hydration: 'lean' | 'hydrated', method: '_read' | '_readFilter') {
  const api = createAccessRuntime();
  runtimes.push(api);
  api.setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: (req: express.Request) => [String(req.headers['x-actor'])],
    requestComplexity: { maxBulkConcurrency: 1, maxHookConcurrency: 1 },
  } as never);
  const n = ++serial;
  const Account = mongoose.model(`DpvFallbackAccount${n}`, new mongoose.Schema({ name: String, balance: Number }));
  const Source = mongoose.model(
    `DpvFallbackSource${n}`,
    new mongoose.Schema({ name: String, account: { type: mongoose.Schema.Types.ObjectId, ref: Account.modelName } }),
  );
  const targetRouter = api.createRouter(Account, {
    operationAccess: { read: true, list: false },
    permissionSchema: { name: true, balance: false },
  });
  const getter = vi.fn((_doc, _permissions, _context, populated) => populated.account?.balance);
  const listRows = vi.fn(() => ({}));
  const docPermissions = vi.fn(() => ({}));
  const variant = vi.fn(() => false);
  const router = api.createRouter(Source, {
    basePath: '/fallback',
    operationAccess: { read: true, list: true, basicList: variant, advancedList: variant },
    baseFilter: { read: () => ({ name: 'read-hidden' }), list: listRows },
    permissionSchema: { name: true, eligible: { read: false, list: true }, account: false },
    docPermissions: { list: docPermissions },
    virtuals: {
      eligible: { list: { get: getter, dependsOnPopulate: [{ path: 'account', select: 'balance -_id' }] } },
    },
    defaults: {
      publicReadArgs: { select: ['eligible', '-_id'] },
      publicReadOptions: { ...quiet, tryList: true },
    },
    hydration: { find: hydration, findOne: hydration, publicRead: hydration },
  } as never);
  const root = api.createRouter({ basePath: '/root', operationAccess: true, maxConcurrentOperations: 1 });
  const account = await Account.create({ name: 'account', balance: 7 });
  const source = await Source.create({ name: 'source', account: account._id });
  const findOne = vi.spyOn(Source.collection, 'findOne');
  const targetFind = vi.spyOn(Account.collection, 'find');
  const read = (service: ReturnType<ModelRequest['macl']['getPublicService']>, options = {}) =>
    method === '_read'
      ? service._read(String(source._id), undefined, options)
      : service._readFilter({ _id: source._id }, undefined, options);
  return {
    api,
    Source,
    Account,
    source,
    router,
    targetRouter,
    getter,
    variant,
    listRows,
    docPermissions,
    findOne,
    targetFind,
    read,
    holdRead() {
      const entered = latch();
      const held = latch();
      let calls = 0;
      router.setOption('baseFilter.read', async () => {
        if (++calls === 1) {
          entered.resolve();
          await held.promise;
        }
        return { name: 'read-hidden' };
      });
      return { entered: entered.promise, release: held.resolve };
    },
    app() {
      const app = express();
      app.use(express.json());
      app.use(api());
      app.use(router.routes);
      app.use(root.routes);
      return app;
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

const rules = [
  { name: 'stored exact denial', stored: { list: false, default: true }, defaults: { list: true }, allowed: false },
  { name: 'stored exact grant', stored: { list: true, default: false }, defaults: { list: false }, allowed: true },
  { name: 'stored default', stored: { default: true }, defaults: { list: false }, allowed: true },
  { name: 'stored undefined exact', stored: { list: undefined, default: true }, defaults: {}, allowed: true },
  { name: 'stored bare grant', stored: true, defaults: { list: false }, allowed: true },
  { name: 'stored bare denial', stored: false, defaults: { list: true }, allowed: false },
  { name: 'stored permission string', stored: 'reader', defaults: {}, allowed: true },
  { name: 'stored permission array', stored: ['reader'], defaults: {}, allowed: true },
  { name: 'stored absent permission', stored: ['missing'], defaults: {}, allowed: false },
  { name: 'runtime exact', stored: undefined, defaults: { list: true }, allowed: true },
  { name: 'runtime exact denial', stored: undefined, defaults: { list: false, default: true }, allowed: false },
  { name: 'runtime default is not exact', stored: undefined, defaults: { default: true }, allowed: false },
  { name: 'runtime bare is not exact', stored: undefined, defaults: true, allowed: false },
  { name: 'empty stored parent blocks runtime', stored: {}, defaults: { list: true }, allowed: false },
  { name: 'stored sibling blocks runtime', stored: { read: true }, defaults: { list: true }, allowed: false },
];

describe.each(['lean', 'hydrated'] as const)('DPV-11 captured fallback (%s)', (hydration) => {
  describe.each(['_read', '_readFilter'] as const)('%s', (method) => {
    it.each(rules)('$name preserves exact/default/bare admission without private work on denial', async (entry) => {
      const f = await fixture(hydration, method);
      f.api.setDefaultModelOption('operationAccess', entry.defaults as never);
      f.router.setOption('operationAccess', entry.stored as never);
      const result = await f.execute(async (req) => {
        expect(await req.macl.isAllowed(f.Source.modelName, 'list')).toBe(entry.allowed);
        return f.read(req.macl.getPublicService(f.Source.modelName));
      });
      expect(result).toMatchObject(
        entry.allowed ? { success: true, data: { eligible: 7 } } : { success: false, code: 'unauthorized' },
      );
      expect(f.getter).toHaveBeenCalledTimes(entry.allowed ? 1 : 0);
      expect(f.targetFind).toHaveBeenCalledTimes(entry.allowed ? 1 : 0);
      expect(f.findOne).toHaveBeenCalledTimes(entry.allowed ? 2 : 1);
      expect(f.variant).not.toHaveBeenCalled();
    });

    it.each(['exact', 'default', 'bare', 'runtime-exact'] as const)(
      'retains a %s function guard and frozen permissions until fallback actually occurs',
      async (placement) => {
        const f = await fixture(hydration, method);
        const guard = vi.fn<GuardHook<ModelRequest>>(async function (permissions) {
          await turn();
          return permissions.has('reader');
        });
        f.api.setDefaultModelOption('operationAccess.list', placement === 'runtime-exact' ? guard : false);
        f.router.setOption(
          'operationAccess',
          (placement === 'exact'
            ? { list: guard }
            : placement === 'default'
              ? { default: guard }
              : placement === 'bare'
                ? guard
                : undefined) as never,
        );
        const pause = f.holdRead();
        let owner!: ModelRequest;
        const results = await f.execute(async (req) => {
          owner = req;
          const service = req.macl.getPublicService(f.Source.modelName);
          const pending = f.read(service);
          await pause.entered;
          expect(guard).not.toHaveBeenCalled();
          req.headers['x-actor'] = 'guest';
          req._permissions = { guest: true };
          await req.macl.setPermissions();
          expect(req.macl.getPermissions().has('reader')).toBe(false);
          f.router.setOption('operationAccess', { list: false });
          f.api.setDefaultModelOption('operationAccess.list', false);
          pause.release();
          return [await pending, await f.read(service)];
        });
        expect(results[0]).toMatchObject({ success: true, data: { eligible: 7 } });
        expect(results[1]).toMatchObject({ success: false, code: 'unauthorized' });
        expect(guard).toHaveBeenCalledTimes(1);
        expect(guard.mock.contexts[0]).toBe(owner);
        const permissions = guard.mock.calls[0][0];
        expect(permissions.keys).toEqual(['reader']);
        expect(Object.isFrozen(permissions)).toBe(true);
        expect(f.getter).toHaveBeenCalledTimes(1);
        expect(f.listRows).toHaveBeenCalledTimes(1);
        expect(f.getter.mock.calls[0][2]).toMatchObject({
          operation: 'read',
          virtualAccess: 'list',
          outputAccess: 'list',
        });
        expect(f.docPermissions).toHaveBeenCalledTimes(1);
        expect(f.variant).not.toHaveBeenCalled();
      },
    );

    it.each(['string', 'array'] as const)(
      'keeps a %s permission rule on the original permission snapshot',
      async (kind) => {
        const f = await fixture(hydration, method);
        f.router.setOption('operationAccess.list', kind === 'string' ? 'reader' : ['reader']);
        const pause = f.holdRead();
        const results = await f.execute(async (req) => {
          const service = req.macl.getPublicService(f.Source.modelName);
          const pending = f.read(service);
          await pause.entered;
          req.headers['x-actor'] = 'guest';
          req._permissions = { guest: true };
          await req.macl.setPermissions();
          pause.release();
          return [await pending, await f.read(service)];
        });
        expect(results[0]).toMatchObject({ success: true, data: { eligible: 7 } });
        expect(results[1]).toMatchObject({ success: false, code: 'unauthorized' });
        expect(f.getter).toHaveBeenCalledTimes(1);
      },
    );

    it.each([
      ['source-option', false],
      ['source-option', true],
      ['runtime-default', false],
      ['runtime-default', true],
    ] as const)('%s replacement from %s stays frozen while later calls observe it', async (kind, initial) => {
      const f = await fixture(hydration, method);
      f.api.setDefaultModelOption('operationAccess.list', initial);
      f.router.setOption('operationAccess', (kind === 'runtime-default' ? undefined : { list: initial }) as never);
      const pause = f.holdRead();
      const results = await f.execute(async (req) => {
        const service = req.macl.getPublicService(f.Source.modelName);
        const pending = f.read(service);
        await pause.entered;
        if (kind === 'runtime-default') f.api.setDefaultModelOption('operationAccess.list', !initial);
        else f.router.setOption('operationAccess', { list: !initial });
        pause.release();
        return [await pending, await f.read(service)];
      });
      for (const [index, result] of results.entries()) {
        expect(result).toMatchObject(
          (index === 0 ? initial : !initial)
            ? { success: true, data: { eligible: 7 } }
            : { success: false, code: 'unauthorized' },
        );
      }
      expect(f.getter).toHaveBeenCalledTimes(1);
      expect(f.targetFind).toHaveBeenCalledTimes(1);
      expect(f.findOne).toHaveBeenCalledTimes(3);
    });

    it('isolates concurrent old/new captures on the same service at hook/persistence limit one', async () => {
      const f = await fixture(hydration, method);
      const first = vi.fn(() => true);
      const second = vi.fn(() => {
        f.router.setOption('operationAccess.list', false);
        return true;
      });
      f.router.setOption('operationAccess.list', first);
      const pause = f.holdRead();
      const results = await f.execute(async (req) => {
        const service = req.macl.getPublicService(f.Source.modelName);
        const earlier = f.read(service);
        await pause.entered;
        f.router.setOption('operationAccess.list', second);
        const later = await f.read(service);
        pause.release();
        return [await earlier, later, await f.read(service)];
      });
      expect(results).toMatchObject([
        { success: true, data: { eligible: 7 } },
        { success: true, data: { eligible: 7 } },
        { success: false, code: 'unauthorized' },
      ]);
      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);
      expect(f.getter).toHaveBeenCalledTimes(2);
    });

    it('queues independent fallback guards within the request hook limit', async () => {
      const f = await fixture(hydration, method);
      const entered = latch();
      const held = latch();
      let active = 0;
      let peak = 0;
      const guard = vi.fn(async () => {
        peak = Math.max(peak, ++active);
        if (guard.mock.calls.length === 1) {
          entered.resolve();
          await held.promise;
        }
        active--;
        return true;
      });
      f.router.setOption('operationAccess.list', guard);
      const results = await f.execute(async (req) => {
        const service = req.macl.getPublicService(f.Source.modelName);
        const earlier = f.read(service);
        await entered.promise;
        const later = f.read(service);
        await expect.poll(() => f.findOne.mock.calls.length).toBe(2);
        await f.findOne.mock.results[1].value;
        await turn();
        expect(guard).toHaveBeenCalledTimes(1);
        held.resolve();
        return Promise.all([earlier, later]);
      });
      expect(results).toMatchObject([
        { success: true, data: { eligible: 7 } },
        { success: true, data: { eligible: 7 } },
      ]);
      expect(guard).toHaveBeenCalledTimes(2);
      expect(peak).toBe(1);
      expect(f.getter).toHaveBeenCalledTimes(2);
    });

    it('gives independent nested Core checks and a reused-service fallback fresh source policy', async () => {
      const f = await fixture(hydration, method);
      const decisions: boolean[] = [];
      let nested: unknown;
      let service!: ReturnType<ModelRequest['macl']['getPublicService']>;
      const guard = vi.fn<GuardHook<ModelRequest>>(async function () {
        if (guard.mock.calls.length > 1) return true;
        f.router.setOption('operationAccess.list', false);
        decisions.push(await this.macl.isAllowed(f.Source.modelName, 'list'));
        await turn();
        nested = await f.read(service);
        decisions.push(await this.macl.isAllowed(f.Source.modelName, 'list'));
        return true;
      });
      f.router.setOption('operationAccess.list', guard);
      const result = await f.execute((req) => {
        service = req.macl.getPublicService(f.Source.modelName);
        return f.read(service);
      });
      expect(decisions).toEqual([false, false]);
      expect(nested).toMatchObject({ success: false, code: 'unauthorized' });
      expect(result).toMatchObject({ success: true, data: { eligible: 7 } });
      expect(guard).toHaveBeenCalledTimes(1);
      expect(f.getter).toHaveBeenCalledTimes(1);
    });

    it('admits an explicitly nested fallback with its own captured function at limit one', async () => {
      const f = await fixture(hydration, method);
      let nested: unknown;
      let service!: ReturnType<ModelRequest['macl']['getPublicService']>;
      const inner = vi.fn<GuardHook<ModelRequest>>(async function () {
        f.router.setOption('operationAccess.list', false);
        await turn();
        return !(await this.macl.isAllowed(f.Source.modelName, 'list'));
      });
      const outer = vi.fn<GuardHook<ModelRequest>>(async function () {
        if (outer.mock.calls.length > 1) return false;
        f.router.setOption('operationAccess.list', inner);
        nested = await f.read(service);
        return !(await this.macl.isAllowed(f.Source.modelName, 'list'));
      });
      f.router.setOption('operationAccess.list', outer);
      const result = await f.execute((req) => {
        service = req.macl.getPublicService(f.Source.modelName);
        return f.read(service);
      });
      expect(result).toMatchObject({ success: true, data: { eligible: 7 } });
      expect(nested).toMatchObject({ success: true, data: { eligible: 7 } });
      expect(outer).toHaveBeenCalledTimes(1);
      expect(inner).toHaveBeenCalledTimes(1);
      expect(f.getter).toHaveBeenCalledTimes(2);
    });

    it('keeps concurrent native request actors and permission sets separate', async () => {
      const f = await fixture(hydration, method);
      const entered = latch();
      const held = latch();
      const actors: ModelRequest[] = [];
      const marker = { id: new mongoose.Types.ObjectId(), at: new Date(), bytes: Buffer.from([1, 2]) };
      const guard = vi.fn<GuardHook<ModelRequest>>(async function (permissions) {
        actors.push(this);
        if (actors.length === 2) entered.resolve();
        await held.promise;
        expect(this.user).toBe(marker);
        return permissions.has('reader') && !(await this.macl.isAllowed(f.Source.modelName, 'list'));
      });
      f.router.setOption('operationAccess.list', guard);
      const run = (req: ModelRequest) => {
        req.user = marker;
        return f.read(req.macl.getPublicService(f.Source.modelName));
      };
      const pending = Promise.all([f.execute(run, 'reader'), f.execute(run, 'guest')]);
      await entered.promise;
      f.router.setOption('operationAccess.list', false);
      held.resolve();
      const results = await pending;
      expect(results[0]).toMatchObject({ success: true, data: { eligible: 7 } });
      expect(results[1]).toMatchObject({ success: false, code: 'unauthorized' });
      expect(new Set(actors.map((actor) => actor.macl)).size).toBe(2);
      expect(guard.mock.calls.map(([permissions]) => permissions.keys)).toEqual(
        expect.arrayContaining([['reader'], ['guest']]),
      );
      expect(await f.execute(run)).toMatchObject({ success: false, code: 'unauthorized' });
      expect(f.getter).toHaveBeenCalledTimes(1);
    });

    it.each(['success', 'base-denial', 'transform-denial', 'invalid-populate', 'tryList-false'] as const)(
      'does no conditional list work for %s',
      async (outcome) => {
        const f = await fixture(hydration, method);
        const guard = vi.fn(() => true);
        f.router.setOption('operationAccess.list', guard);
        if (outcome === 'success') f.router.setOption('baseFilter.read', () => ({}));
        if (outcome === 'base-denial') f.router.setOption('baseFilter.read', () => false);
        if (outcome === 'transform-denial') f.router.setOption('overrideFilter.read', () => false);
        if (outcome === 'invalid-populate')
          f.router.setOption('defaults.publicReadArgs.populate', [{ path: 'account', access: 'basicRead' }] as never);
        const result = await f.execute((req) =>
          f.read(req.macl.getPublicService(f.Source.modelName), { tryList: outcome !== 'tryList-false' }),
        );
        expect(result).toMatchObject(
          outcome === 'success'
            ? { success: true }
            : {
                success: false,
                code:
                  outcome === 'invalid-populate'
                    ? 'bad_request'
                    : outcome === 'tryList-false'
                      ? 'not_found'
                      : 'forbidden',
              },
        );
        expect(guard).not.toHaveBeenCalled();
        expect(f.listRows).not.toHaveBeenCalled();
        expect(f.docPermissions).not.toHaveBeenCalled();
        expect(f.getter).not.toHaveBeenCalled();
        expect(f.targetFind).not.toHaveBeenCalled();
        expect(f.findOne.mock.calls.length).toBe(outcome === 'success' || outcome === 'tryList-false' ? 1 : 0);
      },
    );

    it('captures source/default/populate/target policy together and observes replacements on the next call', async () => {
      const f = await fixture(hydration, method);
      const before = vi.fn(() => true);
      const after = vi.fn(() => true);
      const replacement = vi.fn(() => 99);
      f.router.setOption('operationAccess.list', before);
      f.router.setOption('permissionSchema.account', true);
      f.router.setOption('defaults.publicReadOptions.populateAccess', 'read');
      f.router.setOption('defaults.publicReadArgs', {
        select: ['eligible', 'account', '-_id'],
        populate: [{ path: 'account', select: 'name -_id' }],
      });
      const pause = f.holdRead();
      const results = await f.execute(async (req) => {
        const service = req.macl.getPublicService(f.Source.modelName);
        const pending = f.read(service);
        await pause.entered;
        f.router.setOption('operationAccess.list', after);
        f.router.setOption('virtuals.eligible.list.get', replacement);
        f.router.setOption('defaults.publicReadArgs', { select: ['eligible', '-_id'], populate: [] });
        f.router.setOption('hydration.publicRead', hydration === 'lean' ? 'hydrated' : 'lean');
        f.targetRouter.setOption('operationAccess.read', false);
        pause.release();
        const results = [await pending, await f.read(service)];
        f.targetRouter.setOption('operationAccess.read', true);
        return [...results, await f.read(service)];
      });
      expect(results[0]).toMatchObject({ success: true, data: { eligible: 7, account: { name: 'account' } } });
      expect(results[1]).toMatchObject({ success: true, data: {} });
      if (!results[1].success) throw new Error(results[1].code);
      expect(results[1].data).not.toHaveProperty('eligible');
      expect(results[1].data).not.toHaveProperty('account');
      expect(results[2]).toMatchObject({ success: true, data: { eligible: 99 } });
      if (!results[2].success) throw new Error(results[2].code);
      expect(results[2].data).not.toHaveProperty('account');
      expect(before).toHaveBeenCalledTimes(1);
      expect(after).toHaveBeenCalledTimes(2);
      expect(f.getter).toHaveBeenCalledTimes(1);
      expect(replacement).toHaveBeenCalledTimes(1);
      expect(f.targetFind).toHaveBeenCalledTimes(2);
    });

    it.each(['direct', 'root'] as const)('%s route fallback retains the same capture', async (surface) => {
      const f = await fixture(hydration, method);
      f.router.setOption('stripPermissionsField', true);
      const pause = f.holdRead();
      const app = f.app();
      const read = () =>
        surface === 'root'
          ? request(app)
              .post('/root')
              .set('x-actor', 'reader')
              .send([
                {
                  target: 'model',
                  name: f.Source.modelName,
                  op: 'read',
                  ...(method === '_read' ? { id: String(f.source._id) } : { filter: { _id: String(f.source._id) } }),
                },
              ])
          : method === '_read'
            ? request(app).get(`/fallback/${f.source._id}`).set('x-actor', 'reader')
            : request(app)
                .post('/fallback/__query/__filter')
                .set('x-actor', 'reader')
                .send({ filter: { _id: String(f.source._id) } });
      const pending = read().then((response) => response);
      await pause.entered;
      f.router.setOption('operationAccess.list', false);
      pause.release();
      const earlier = await pending;
      const later = await read();
      if (surface === 'root') {
        expect(earlier.body[0]).toMatchObject({ statusCode: 200, result: { success: true, data: { eligible: 7 } } });
        expect(later.body[0]).toMatchObject({ statusCode: 401, result: { success: false, code: 'unauthorized' } });
      } else {
        expect(earlier.status).toBe(200);
        expect(earlier.body).toEqual({ eligible: 7 });
        expect(later.status).toBe(401);
      }
      expect(f.getter).toHaveBeenCalledTimes(1);
    });
  });

  it('captures list admission before the by-id identifier hook first suspends', async () => {
    const f = await fixture(hydration, '_read');
    const entered = latch();
    const held = latch();
    const guard = vi.fn(() => true);
    f.router.setOption('operationAccess.list', guard);
    f.router.setOption('resolveIdFilter', async () => {
      entered.resolve();
      await held.promise;
      return { _id: f.source._id };
    });
    const result = await f.execute(async (req) => {
      const pending = f.read(req.macl.getPublicService(f.Source.modelName));
      await entered.promise;
      expect(guard).not.toHaveBeenCalled();
      f.router.setOption('operationAccess.list', false);
      held.resolve();
      return pending;
    });
    expect(result).toMatchObject({ success: true, data: { eligible: 7 } });
    expect(guard).toHaveBeenCalledTimes(1);
  });
});
