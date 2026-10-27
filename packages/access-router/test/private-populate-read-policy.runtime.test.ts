import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../dist/index.mjs';
import type { ModelRequest } from '../src/interfaces';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();
const flag = 'requireReadOperationAccessForPopulateDependencies';
const quiet = { includePermissions: false, includeFieldPermissions: false, includeCount: false };
const runtimes: ReturnType<typeof createAccessRuntime>[] = [];
let serial = 0;
afterEach(() => {
  vi.restoreAllMocks();
  runtimes.splice(0).forEach((api) => api.runtime.clearOpenApiRoutes());
  mongoose.deleteModel(/^PprRuntime/);
});

function latch() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

async function fixture(hydration: 'lean' | 'hydrated', strict: boolean, allowed = false) {
  const api = createAccessRuntime();
  runtimes.push(api);
  api.setGlobalOptions({
    [flag]: strict,
    requestPermissionField: '_permissions',
    globalPermissions: () => ['original'],
    requestComplexity: { maxBulkConcurrency: 1, maxHookConcurrency: 1 },
  } as never);
  const n = ++serial;
  const Target = mongoose.model(
    `PprRuntimeTarget${n}`,
    new mongoose.Schema({ name: String, tenant: String, balance: { type: Number, select: false } }),
  );
  const ref = { type: mongoose.Schema.Types.ObjectId, ref: Target.modelName };
  const Source = mongoose.model(
    `PprRuntimeSource${n}`,
    new mongoose.Schema({ name: String, account: ref, accounts: { type: [ref], default: undefined }, other: ref }),
  );
  const guard = vi.fn(function (this: ModelRequest, permissions) {
    expect(permissions.has('original')).toBe(true);
    return allowed;
  });
  const base = vi.fn(() => ({ tenant: 'a' }));
  const targetHooks = vi.fn(() => ({}));
  api.createRouter(Target, {
    operationAccess: { read: guard, list: true },
    permissionSchema: { name: true, balance: false },
    baseFilter: { read: base },
    docPermissions: targetHooks,
    stripPermissionsField: true,
  } as never);
  const getter = vi.fn((_doc, _permissions, _context, populated) => populated.account?.balance ?? null);
  const slots = vi.fn((_doc, _permissions, _context, populated) =>
    populated.accounts === null ? null : populated.accounts.map((row) => row?.balance ?? null),
  );
  const router = api.createRouter(Source, {
    basePath: `/ppr-runtime-${n}`,
    operationAccess: { read: true, list: true, create: true, update: true, upsert: true, new: true },
    permissionSchema: { name: true, account: true, accounts: true, other: true, total: true, slots: true },
    virtuals: {
      total: { get: getter, dependsOnPopulate: [{ path: 'account', select: 'balance -_id' }] },
      slots: { get: slots, dependsOnPopulate: [{ path: 'accounts', select: 'balance -_id' }] },
    },
    hydration: Object.fromEntries(
      ['find', 'findOne', 'findById', 'publicRead', 'publicList'].map((method) => [method, hydration]),
    ),
    stripPermissionsField: true,
  } as never);
  const [a, b, outside] = await Target.create([
    { name: 'a', tenant: 'a', balance: 7 },
    { name: 'b', tenant: 'a', balance: 8 },
    { name: 'outside', tenant: 'b', balance: 90 },
  ]);
  const missing = new mongoose.Types.ObjectId();
  const ids = [a._id, missing, null, a._id, b._id, outside._id];
  const source = await Source.create({ name: 'source', account: a._id, accounts: ids, other: b._id });
  const finds = vi.spyOn(Target.collection, 'find');
  const app = express();
  app.use(express.json());
  app.use(router.routes);
  let callback: (req: ModelRequest) => Promise<unknown>;
  let value: unknown;
  let failure: unknown;
  router.router.post('/probe', async (req, res) => {
    try {
      value = await callback(req as ModelRequest);
    } catch (error) {
      failure = error;
    }
    res.json({ ok: true });
  });
  return {
    api,
    app,
    Source,
    Target,
    source,
    a,
    b,
    ids,
    missing,
    guard,
    base,
    getter,
    slots,
    finds,
    targetHooks,
    read(req: ModelRequest, args = { select: ['account', 'total', '-_id'] }, options = quiet) {
      return req.macl.getService(Source.modelName).findOne({ _id: source._id }, args, options);
    },
    hold() {
      const entered = latch();
      const held = latch();
      api.setModelOption(Source.modelName, 'baseFilter.read', async () => {
        entered.resolve();
        await held.promise;
        return {};
      });
      return { entered: entered.promise, release: held.resolve };
    },
    async execute<T>(run: (req: ModelRequest) => Promise<T>): Promise<T> {
      callback = run;
      failure = undefined;
      await request(app).post(`/ppr-runtime-${n}/probe`).send({}).expect(200);
      if (failure) throw failure;
      return value as T;
    },
  };
}

describe.each(['lean', 'hydrated'] as const)(
  'PPR-02 independent private loading / reference visibility (%s)',
  (hydration) => {
    describe.each([true, false])('strict=%s', (strict) => {
      it.each([false, true])(
        'denied base read omits the entire reference, ordinary population=%s',
        async (populate) => {
          const f = await fixture(hydration, strict);
          const result = await f.execute((req) =>
            f.read(req, {
              select: ['account', 'total', '-_id'],
              ...(populate ? { populate: [{ path: 'account', select: 'name -_id' }] } : {}),
            }),
          );
          expect(result).toMatchObject({ success: true });
          if (!result.success) throw new Error(result.code);
          expect(result.data).not.toHaveProperty('account');
          if (strict) expect(result.data).not.toHaveProperty('total');
          else expect(result.data).toHaveProperty('total', 7);
          expect(f.getter).toHaveBeenCalledTimes(strict ? 0 : 1);
          expect(f.finds).toHaveBeenCalledTimes(strict ? 0 : 1);
          // Ordinary planning has its own admission. Visibility reuses strict private admission.
          expect(f.guard).toHaveBeenCalledTimes(populate ? 2 : 1);
          expect(f.targetHooks).not.toHaveBeenCalled();
        },
      );

      it.each([false, true])(
        'read allowed preserves exact IDs or the original public union (populate=%s)',
        async (populate) => {
          const f = await fixture(hydration, strict, true);
          const result = await f.execute((req) =>
            f.read(req, {
              select: ['accounts', 'slots', '-_id'],
              ...(populate ? { populate: [{ path: 'accounts', select: 'name -_id' }] } : {}),
            }),
          );
          expect(result).toMatchObject({ success: true, data: { slots: [7, null, null, 7, 8, null] } });
          if (!result.success) throw new Error(result.code);
          expect(result.data.accounts).toEqual(populate ? [{ name: 'a' }, { name: 'a' }, { name: 'b' }] : f.ids);
          expect(f.finds).toHaveBeenCalledTimes(1);
          const projection = f.finds.mock.calls[0][1]?.projection;
          expect(projection).toMatchObject({ _id: 1, balance: 1, ...(populate ? { name: 1 } : {}) });
          expect(result.data).not.toHaveProperty('accounts.0.balance');
        },
      );

      it.each(['base', 'override'] as const)(
        '%s terminal denial keeps private unavailable without target I/O',
        async (kind) => {
          const f = await fixture(hydration, strict, true);
          const deny = vi.fn(() => false);
          f.api.setModelOption(f.Target.modelName, `${kind === 'base' ? 'baseFilter' : 'overrideFilter'}.read`, deny);
          const result = await f.execute((req) => f.read(req));
          expect(result).toMatchObject({ success: true, data: { account: f.a._id } });
          expect(result).not.toHaveProperty('data.total');
          expect(f.getter).not.toHaveBeenCalled();
          expect(f.finds).not.toHaveBeenCalled();
          expect(f.guard).toHaveBeenCalledTimes(1);
          expect(deny).toHaveBeenCalledTimes(1);
        },
      );

      it.each(['list', 'grant'] as const)(
        'base read visibility outranks ordinary %s authority on active paths',
        async (mode) => {
          const f = await fixture(hydration, strict);
          const result = await f.execute((req) =>
            f.read(
              req,
              {
                select: ['account', 'total'],
                populate: [{ path: 'account', access: mode === 'list' ? 'list' : 'read', select: 'name -_id' }],
              } as never,
              {
                ...quiet,
                ...(mode === 'grant'
                  ? {
                      authorization: {
                        related: {
                          account: {
                            model: f.Target.modelName,
                            operation: { mode: 'grant' },
                            rows: { mode: 'unrestricted' },
                          },
                        },
                      },
                    }
                  : {}),
              } as never,
            ),
          );
          expect(result).toMatchObject({ success: true });
          expect(result).not.toHaveProperty('data.account');
          if (strict) expect(result).not.toHaveProperty('data.total');
          else expect(result).toHaveProperty('data.total', 7);
        },
      );

      it('omits every active array occurrence even after a getter fails or is document-denied', async () => {
        const f = await fixture(hydration, strict);
        f.getter.mockImplementation(() => {
          throw new Error('getter failure');
        });
        f.api.setModelOptions(f.Source.modelName, {
          modelPermissionPrefix: 'doc:',
          permissionSchema: { account: true, accounts: true, total: 'doc:no', slots: true, other: true },
        } as never);
        const result = await f.execute((req) =>
          f.read(req, { select: ['account', 'accounts', 'total', 'slots', 'other'] }),
        );
        expect(result).toMatchObject({ success: true, data: { other: f.b._id } });
        expect(result).not.toHaveProperty('data.account');
        expect(result).not.toHaveProperty('data.accounts');
        expect(result).not.toHaveProperty('data.total');
        expect(f.guard).toHaveBeenCalledTimes(1);
        if (!strict) expect(result).toHaveProperty('data.slots', [7, null, null, 7, 8, null]);
      });

      it('failed private-only read guards cannot make a completed write retry', async () => {
        const f = await fixture(hydration, strict);
        f.guard.mockImplementation(() => {
          throw new Error('PRIVATE guard detail');
        });
        const warn = vi.fn();
        f.api.setGlobalOptions({ logger: { warn } } as never);
        const writes = vi.spyOn(f.Source.collection, 'updateOne');
        const result = await f.execute((req) =>
          req.macl
            .getService(f.Source.modelName)
            .updateById(String(f.source._id), { name: 'saved' }, { select: ['name', 'account', 'total'] }, quiet),
        );
        expect(result).toMatchObject({ success: true, data: { name: 'saved' } });
        expect(result).not.toHaveProperty('data.account');
        if (strict) expect(result).not.toHaveProperty('data.total');
        else expect(result).toHaveProperty('data.total', 7);
        expect(writes).toHaveBeenCalledTimes(1);
        expect((await f.Source.findById(f.source._id).lean())!.name).toBe('saved');
        expect(JSON.stringify(warn.mock.calls)).not.toContain('PRIVATE');
      });

      it('leaves ordinary denied-populate ID fallback unchanged without an active plan', async () => {
        const f = await fixture(hydration, strict);
        const result = await f.execute((req) =>
          f.read(req, { select: ['account'], populate: [{ path: 'account', select: 'name' }] } as never),
        );
        expect(result).toMatchObject({ success: true, data: { account: f.a._id } });
        expect(f.getter).not.toHaveBeenCalled();
        expect(f.guard).toHaveBeenCalledTimes(1);
        expect(f.finds).not.toHaveBeenCalled();
      });

      it.each(['_read', '_readFilter'] as const)(
        '%s fallback uses private read policy and independent read visibility',
        async (method) => {
          const f = await fixture(hydration, strict);
          f.api.setModelOption(f.Source.modelName, 'baseFilter.read', () => ({ name: 'no-read-row' }));
          const result = await f.execute((req) => {
            const service = req.macl.getPublicService(f.Source.modelName);
            const args = { select: ['account', 'total', '-_id'] };
            return method === '_read'
              ? service._read(String(f.source._id), args, { ...quiet, tryList: true })
              : service._readFilter({ _id: f.source._id }, args, { ...quiet, tryList: true });
          });
          expect(result).toMatchObject({ success: true });
          expect(result).not.toHaveProperty('data.account');
          if (strict) expect(result).not.toHaveProperty('data.total');
          else expect(result).toHaveProperty('data.total', 7);
          expect(f.guard).toHaveBeenCalledTimes(1);
        },
      );
    });

    it.each(['unselected', 'excluded', 'denied', 'deferred-denied'] as const)(
      'false mode performs no output-only guard for a %s reference',
      async (mode) => {
        const f = await fixture(hydration, false);
        if (mode === 'denied' || mode === 'deferred-denied')
          f.api.setModelOptions(f.Source.modelName, {
            modelPermissionPrefix: 'doc:',
            permissionSchema: { account: mode === 'denied' ? false : 'doc:no', total: true },
          } as never);
        const result = await f.execute((req) =>
          f.read(req, {
            select:
              mode === 'unselected' ? ['total'] : mode === 'excluded' ? ['total', '-account'] : ['total', 'account'],
          }),
        );
        expect(result).toMatchObject({ success: true, data: { total: 7 } });
        expect(result).not.toHaveProperty('data.account');
        expect(f.guard).not.toHaveBeenCalled();
        expect(f.finds).toHaveBeenCalledTimes(1);
      },
    );

    it.each([true, false])(
      'mode %s is captured before source suspension; later same-service calls see changes',
      async (initial) => {
        const f = await fixture(hydration, initial);
        const pause = f.hold();
        const results = await f.execute(async (req) => {
          const service = req.macl.getService(f.Source.modelName);
          const read = () => service.findOne({ _id: f.source._id }, { select: ['account', 'total'] }, quiet);
          const pending = read();
          await pause.entered;
          f.api.setGlobalOption(flag, !initial);
          pause.release();
          return [await pending, await read()];
        });
        for (const [index, result] of results.entries()) {
          expect(result).toMatchObject({ success: true });
          expect(result).not.toHaveProperty('data.account');
          const strict = index === 0 ? initial : !initial;
          if (strict) expect(result).not.toHaveProperty('data.total');
          else expect(result).toHaveProperty('data.total', 7);
        }
        expect(f.finds).toHaveBeenCalledTimes(1);
      },
    );

    it.each([true, false])(
      'false mode keeps visibility independent of a failed private fetch (read=%s)',
      async (allowed) => {
        const f = await fixture(hydration, false, allowed);
        f.finds.mockImplementation(() => {
          throw new Error('private query');
        });
        const result = await f.execute((req) => f.read(req));
        expect(result).toMatchObject({ success: true });
        if (allowed) expect(result).toHaveProperty('data.account', f.a._id);
        else expect(result).not.toHaveProperty('data.account');
        expect(result).not.toHaveProperty('data.total');
        expect(f.guard).toHaveBeenCalledTimes(1);
        expect(f.finds).toHaveBeenCalledTimes(1);
      },
    );

    it.each(['undefined', 'throw'] as const)(
      'false mode denied reference remains omitted after getter %s',
      async (outcome) => {
        const f = await fixture(hydration, false);
        f.getter.mockImplementation(() => {
          if (outcome === 'throw') throw new Error('private getter');
          return undefined;
        });
        const result = await f.execute((req) => f.read(req));
        expect(result).toMatchObject({ success: true, data: {} });
        expect(result).not.toHaveProperty('data.account');
        expect(result).not.toHaveProperty('data.total');
        expect(f.getter).toHaveBeenCalledTimes(1);
        expect(f.guard).toHaveBeenCalledTimes(1);
      },
    );

    it.each([true, false])(
      'false mode preserves scalar/array null, empty, absent and missing refs when read=%s',
      async (allowed) => {
        const f = await fixture(hydration, false, allowed);
        await f.Source.create([
          { name: 'null', account: null, accounts: null },
          { name: 'empty', accounts: [] },
          { name: 'absent' },
          { name: 'missing', account: f.missing, accounts: [f.missing] },
        ]);
        const result = await f.execute((req) =>
          req.macl
            .getService(f.Source.modelName)
            .find({}, { select: ['name', 'account', 'accounts', 'total', 'slots', '-_id'] }, quiet),
        );
        expect(result).toMatchObject({ success: true });
        if (!result.success) throw new Error(result.code);
        const byName = Object.fromEntries(result.data.map((row) => [row.name, row]));
        if (allowed) {
          expect(byName.source.accounts).toEqual(f.ids);
          expect(byName.null).toMatchObject({ account: null, accounts: null, total: null, slots: null });
          expect(byName.empty).toHaveProperty('accounts', []);
          expect(byName.missing).toMatchObject({
            account: f.missing,
            accounts: [f.missing],
            total: null,
            slots: [null],
          });
        } else {
          for (const row of result.data) {
            expect(row).not.toHaveProperty('account');
            expect(row).not.toHaveProperty('accounts');
          }
        }
        expect(byName.absent).not.toHaveProperty('account');
        expect(byName.absent).not.toHaveProperty('accounts');
        expect(byName.absent).not.toHaveProperty('total');
        expect(byName.absent).not.toHaveProperty('slots');
        expect(f.guard).toHaveBeenCalledTimes(1);
        expect(f.finds).toHaveBeenCalledTimes(1);
      },
    );

    it('false mode checks a document-granted reference but does not check an absent reference', async () => {
      const f = await fixture(hydration, false);
      f.api.setModelOptions(f.Source.modelName, {
        modelPermissionPrefix: 'doc:',
        permissionSchema: { account: 'doc:canSee', total: true },
        docPermissions: () => ({ canSee: true }),
      } as never);
      const result = await f.execute((req) => f.read(req));
      expect(result).toMatchObject({ success: true, data: { total: 7 } });
      expect(result).not.toHaveProperty('data.account');
      expect(f.guard).toHaveBeenCalledTimes(1);
      await f.Source.updateOne({ _id: f.source._id }, { $unset: { account: 1 } });
      f.guard.mockClear();
      const absent = await f.execute((req) => f.read(req));
      expect(absent).toMatchObject({ success: true });
      expect(absent).not.toHaveProperty('data.account');
      expect(f.guard).not.toHaveBeenCalled();
    });

    it('false mode applies request tenant/transform predicates and mandatory original IDs', async () => {
      const f = await fixture(hydration, false);
      const override = vi.fn(() => ({ name: 'b' }));
      f.api.setModelOption(f.Target.modelName, 'overrideFilter.read', override);
      const result = await f.execute((req) => f.read(req));
      expect(result).toMatchObject({ success: true, data: { total: null } });
      expect(result).not.toHaveProperty('data.account');
      expect(f.getter.mock.calls[0][3]).toEqual({ account: null });
      expect(override).toHaveBeenCalledTimes(1);
      expect(f.base).toHaveBeenCalledTimes(1);
      expect(f.finds).toHaveBeenCalledTimes(1);
      const filter = f.finds.mock.calls[0][0];
      expect(JSON.stringify(filter)).toContain('"tenant":"a"');
      expect(JSON.stringify(filter)).toContain('"name":"b"');
      expect(JSON.stringify(filter)).toContain(String(f.a._id));
    });

    it('false mode retains the captured guard/permissions and gives nested Core checks their own context', async () => {
      const f = await fixture(hydration, false, true);
      const nested: boolean[] = [];
      const guard = vi.fn(async function (this: ModelRequest, permissions) {
        expect(permissions.has('original')).toBe(true);
        await Promise.resolve();
        nested.push(await this.macl.isAllowed(f.Target.modelName, 'read'));
        return true;
      });
      f.api.setModelOption(f.Target.modelName, 'operationAccess.read', guard);
      const pause = f.hold();
      let actor: ModelRequest;
      const result = await f.execute(async (req) => {
        actor = req;
        const pending = f.read(req);
        await pause.entered;
        f.api.setModelOption(f.Target.modelName, 'operationAccess.read', false);
        f.api.setDefaultModelOption('operationAccess.read', false);
        req._permissions = {};
        pause.release();
        return pending;
      });
      expect(result).toMatchObject({ success: true, data: { total: 7, account: f.a._id } });
      expect(nested).toEqual([false]);
      expect(guard).toHaveBeenCalledTimes(1);
      expect(guard.mock.contexts[0]).toBe(actor!);
    });

    it('separate runtimes on the same models cannot share bypass mode or reference authority', async () => {
      const f = await fixture(hydration, false);
      const other = createAccessRuntime();
      runtimes.push(other);
      other.setGlobalOptions({
        globalPermissions: () => ['original'],
        requestPermissionField: '_permissions',
      } as never);
      other.createRouter(f.Target, { operationAccess: { read: false } });
      const router = other.createRouter(f.Source, {
        ...f.api.runtime.getModelOptions(f.Source.modelName),
        basePath: '/other-ppr',
      } as never);
      const app = express();
      app.use(express.json());
      app.use(router.routes);
      const bypass = await f.execute((req) => f.read(req));
      expect(bypass).toMatchObject({ success: true, data: { total: 7 } });
      expect(bypass).not.toHaveProperty('data.account');
      const strict = await request(app)
        .post('/other-ppr/__query')
        .send({ select: ['account', 'total'] })
        .expect(200);
      expect(strict.body.data[0]).not.toHaveProperty('account');
      expect(strict.body.data[0]).not.toHaveProperty('total');
      expect(f.finds).toHaveBeenCalledTimes(1);
    });

    it('false mode confers no public target operation/handle authority and retains local snapshots', async () => {
      const f = await fixture(hydration, false);
      await f.execute(async (req) => {
        const service = req.macl.getService(f.Source.modelName);
        const result = await f.read(req);
        expect(result).toMatchObject({ success: true, data: { total: 7 } });
        if (!result.success) throw new Error(result.code);
        expect(result.data).not.toHaveProperty('account');
        expect(result.context.originalDocumentSnapshot.account).toEqual(f.a._id);
        expect(result.context.documentAuthorization).not.toHaveProperty('populated');
        expect(result.context).not.toHaveProperty('populated');
        expect(f.getter.mock.calls[0][2]).not.toHaveProperty('populated');
        const picked = await service.pickAllowedFields(result.data, 'read', {
          documentAuthorization: result.context.documentAuthorization,
        });
        expect(picked).toHaveProperty('total', 7);
        expect(picked).not.toHaveProperty('account');
        expect(await req.macl.isAllowed(f.Target.modelName, 'read')).toBe(false);
      });
      expect((await f.Source.findById(f.source._id).lean())!.account).toEqual(f.a._id);
      expect(f.targetHooks).not.toHaveBeenCalled();
    });

    it('false mode preserves ordinary public query failures instead of treating them as private misses', async () => {
      const f = await fixture(hydration, false, true);
      const failure = new Error('ordinary query failure');
      f.finds.mockImplementation(() => {
        throw failure;
      });
      await expect(
        f.execute((req) =>
          f.read(req, {
            select: ['account', 'total'],
            populate: [{ path: 'account', select: 'name' }],
          } as never),
        ),
      ).rejects.toBe(failure);
      expect(f.getter).not.toHaveBeenCalled();
    });
  },
);
