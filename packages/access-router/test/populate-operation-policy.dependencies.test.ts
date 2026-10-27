import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../dist/index.mjs';
import type { ModelRequest } from '../src/interfaces';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();
const quiet = { includePermissions: false, includeFieldPermissions: false, includeCount: false };
const modes = [
  { queries: true, dependencies: true },
  { queries: false, dependencies: true },
  { queries: true, dependencies: false },
  { queries: false, dependencies: false },
] as const;
const runtimes: ReturnType<typeof createAccessRuntime>[] = [];
let sequence = 0;
afterEach(() => {
  vi.restoreAllMocks();
  runtimes.splice(0).forEach((api) => api.runtime.clearOpenApiRoutes());
  mongoose.deleteModel(/^PopDependency/);
});

const latch = () => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => (release = resolve));
  return { promise, release };
};

async function fixture(hydration: 'lean' | 'hydrated', mode: (typeof modes)[number]) {
  const api = createAccessRuntime();
  runtimes.push(api);
  api.setGlobalOptions({
    requireOperationAccessForPopulateQueries: mode.queries,
    requireOperationAccessForPopulateDependencies: mode.dependencies,
    globalPermissions: () => ['actor'],
    requestPermissionField: '_permissions',
    requestComplexity: { maxBulkConcurrency: 1, maxHookConcurrency: 1 },
  });
  const n = ++sequence;
  const Target = mongoose.model(
    `PopDependencyTarget${n}`,
    new mongoose.Schema({
      name: String,
      owner: String,
      owned: String,
      tenant: String,
      balance: { type: Number, select: false },
      date: Date,
      bytes: Buffer,
      marker: mongoose.Schema.Types.ObjectId,
    }),
  );
  const ref = { type: mongoose.Schema.Types.ObjectId, ref: Target.modelName };
  const fields = { name: String, account: ref, accounts: { type: [ref], default: undefined } };
  const Source = mongoose.model(
    `PopDependencySource${n}`,
    new mongoose.Schema({
      ...fields,
      children: [fields],
      related: { type: mongoose.Schema.Types.ObjectId, ref: `PopDependencySource${n}` },
    }),
  );
  const guard = vi.fn(function (this: ModelRequest, permissions) {
    expect(permissions.has('actor')).toBe(true);
    return false;
  });
  const base = vi.fn(() => ({ tenant: 'a' }));
  const override = vi.fn(() => ({}));
  const targetHook = vi.fn((doc) => ({ owns: doc.owner === 'actor' }));
  api.registerModelInstance(Target.modelName, Target);
  api.setModelOptions(Target.modelName, {
    operationAccess: { read: guard, list: false },
    permissionSchema: { name: true, owned: 'doc:owns', balance: false, date: false, bytes: false, marker: false },
    modelPermissionPrefix: 'doc:',
    alwaysSelectFields: ['owner'],
    docPermissions: targetHook,
    baseFilter: { read: base },
    overrideFilter: { read: override },
    stripPermissionsField: true,
  });
  const total = vi.fn((_doc, _permissions, _context, populated) => populated.account?.balance ?? null);
  const slots = vi.fn((_doc, _permissions, _context, populated) =>
    populated.accounts === null ? null : populated.accounts.map((row) => row?.balance ?? null),
  );
  const virtuals = {
    total: { get: total, dependsOnPopulate: [{ path: 'account', select: 'balance date bytes marker -_id' }] },
    slots: { get: slots, dependsOnPopulate: [{ path: 'accounts', select: 'balance -_id' }] },
  };
  const permissions = { name: true, account: true, accounts: true, total: true, slots: true };
  const sourceHook = vi.fn(() => ({}));
  const decorate = vi.fn((doc) => doc);
  const router = api.createRouter(Source, {
    basePath: '/parents',
    operationAccess: true,
    permissionSchema: {
      ...permissions,
      related: true,
      children: { list: true, read: true, create: true, update: true, sub: permissions },
    },
    virtuals: { ...virtuals, children: { sub: virtuals } },
    docPermissions: sourceHook,
    decorate,
    hydration: { find: hydration, findOne: hydration, publicRead: hydration, publicList: hydration },
    stripPermissionsField: true,
    defaults: { publicReadOptions: { ...quiet, tryList: false }, publicListOptions: quiet },
  } as never);
  const root = api.createRouter({ basePath: '/root', operationAccess: true });
  const [a, b, outside] = await Target.create(
    [
      { name: 'a', tenant: 'a', balance: 7, owner: 'actor' },
      { name: 'b', tenant: 'a', balance: 8, owner: 'other' },
      { name: 'outside', tenant: 'b', balance: 90, owner: 'actor' },
    ].map((row) => ({
      ...row,
      owned: 'owned-value',
      date: new Date('2026-10-01T00:00:00Z'),
      bytes: Buffer.from([1, 2]),
      marker: new mongoose.Types.ObjectId(),
    })),
  );
  const missing = new mongoose.Types.ObjectId();
  const ids = [a._id, missing, null, a._id, b._id, outside._id];
  const source = await Source.create({
    name: 'source',
    account: a._id,
    accounts: ids,
    children: [{ name: 'child', account: a._id, accounts: ids }],
  });
  await Source.updateOne({ _id: source._id }, { related: source._id });
  const finds = vi.spyOn(Target.collection, 'find');
  const app = express();
  app.use(express.json());
  app.use(router.routes);
  app.use(root.routes);
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
    outside,
    ids,
    missing,
    guard,
    base,
    override,
    targetHook,
    total,
    slots,
    sourceHook,
    decorate,
    finds,
    async execute<T>(run: (req: ModelRequest) => Promise<T>): Promise<T> {
      callback = run;
      failure = undefined;
      await request(app).post('/parents/probe').send({}).expect(200);
      if (failure) throw failure;
      return value as T;
    },
  };
}

const publicPopulate = [
  { path: 'account', select: 'name owned balance -_id' },
  { path: 'accounts', select: 'name owned balance -_id' },
];
const expectedPublic = {
  account: { name: 'a', owned: 'owned-value' },
  accounts: [{ name: 'a', owned: 'owned-value' }, { name: 'a', owned: 'owned-value' }, { name: 'b' }],
};
const serialized = (value: unknown) => JSON.parse(JSON.stringify(value));

describe.each(['lean', 'hydrated'] as const)('POP-03 independent private/public policies (%s)', (hydration) => {
  describe.each(modes)('queries=$queries dependencies=$dependencies', (mode) => {
    it.each([false, true])(
      'adding private virtuals preserves ordinary response shape (populate=%s)',
      async (populate) => {
        const f = await fixture(hydration, mode);
        await f.execute(async (req) => {
          const service = req.macl.getService(f.Source.modelName);
          const read = (active: boolean) =>
            service.findOne(
              { _id: f.source._id },
              {
                select: ['account', 'accounts', ...(active ? ['total', 'slots'] : []), '-_id'],
                ...(populate ? { populate: publicPopulate } : {}),
              },
              quiet,
            );
          const ordinary = await read(false);
          f.guard.mockClear();
          f.finds.mockClear();
          f.targetHook.mockClear();
          const active = await read(true);
          expect(ordinary.success && active.success).toBe(true);
          if (!ordinary.success || !active.success) throw new Error('source read failed');
          const expected = populate && !mode.queries ? expectedPublic : { account: f.a._id, accounts: f.ids };
          expect(ordinary.data).toEqual(expected);
          expect(active.data).toEqual({
            ...expected,
            ...(!mode.dependencies ? { total: 7, slots: [7, null, null, 7, 8, null] } : {}),
          });
          expect(f.total).toHaveBeenCalledTimes(mode.dependencies ? 0 : 1);
          expect(f.guard).toHaveBeenCalledTimes(Number(populate && mode.queries) * 2 + Number(mode.dependencies));
          expect(f.finds).toHaveBeenCalledTimes(!mode.dependencies || (populate && !mode.queries) ? 1 : 0);
          if (!mode.dependencies) {
            expect(f.total.mock.calls[0][3].account).toMatchObject({ balance: 7 });
            expect(f.total.mock.calls[0][3].account).not.toHaveProperty('name');
            expect(f.total.mock.calls[0][0]).not.toHaveProperty('account.balance');
            expect(f.slots.mock.calls[0][3].accounts).toHaveLength(f.ids.length);
          }
          // Scalar and array plans own separate public stages; duplicate array slots share theirs.
          expect(f.targetHook).toHaveBeenCalledTimes(populate && !mode.queries ? 3 : 0);
          expect(JSON.stringify(active.data)).not.toContain('balance');
          expect(active.context.originalDocumentSnapshot.account).toEqual(
            populate && !mode.queries ? expectedPublic.account : f.a._id,
          );
          expect(active.context).not.toHaveProperty('populated');
        });
        expect((await f.Source.findById(f.source._id).lean())!.accounts).toEqual(f.ids);
      },
    );

    it.each([
      'unselected',
      'excluded',
      'denied',
      'deferred-denied',
      'document-granted',
      'function-denied',
      'function-granted',
    ] as const)('keeps %s parent-field authorization independent from private input', async (sourcePolicy) => {
      const f = await fixture(hydration, mode);
      const field = vi.fn(async () => sourcePolicy === 'function-granted');
      if (sourcePolicy === 'denied') f.api.setModelOption(f.Source.modelName, 'permissionSchema.account', false);
      if (sourcePolicy === 'deferred-denied') {
        f.api.setModelOption(f.Source.modelName, 'modelPermissionPrefix', 'doc:');
        f.api.setModelOption(f.Source.modelName, 'permissionSchema.account', 'doc:no');
      }
      if (sourcePolicy === 'document-granted') {
        f.api.setModelOption(f.Source.modelName, 'modelPermissionPrefix', 'doc:');
        f.api.setModelOption(f.Source.modelName, 'permissionSchema.account', 'doc:canSee');
        f.sourceHook.mockReturnValue({ canSee: true });
      }
      if (sourcePolicy.startsWith('function'))
        f.api.setModelOption(f.Source.modelName, 'permissionSchema.account', field);
      const result = await f.execute((req) =>
        req.macl.getService(f.Source.modelName).findOne(
          { _id: f.source._id },
          {
            select: [
              'total',
              ...(sourcePolicy === 'unselected' ? [] : sourcePolicy === 'excluded' ? ['-account'] : ['account']),
              '-_id',
            ],
          },
          quiet,
        ),
      );
      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.code);
      expect(result.data).toEqual({
        ...(['function-granted', 'document-granted'].includes(sourcePolicy) ? { account: f.a._id } : {}),
        ...(!mode.dependencies ? { total: 7 } : {}),
      });
      expect(f.guard).toHaveBeenCalledTimes(Number(mode.dependencies));
      expect(f.total).toHaveBeenCalledTimes(mode.dependencies ? 0 : 1);
      if (sourcePolicy.startsWith('function')) expect(field).toHaveBeenCalledTimes(1);
    });

    it('preserves exact null/empty/missing/absent source slots without ordinary population', async () => {
      const f = await fixture(hydration, mode);
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
      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.code);
      const rows = Object.fromEntries(result.data.map((row) => [row.name, row]));
      expect(rows.source.account).toEqual(f.a._id);
      expect(rows.source.accounts).toEqual(f.ids);
      expect(rows.null).toEqual({
        name: 'null',
        account: null,
        accounts: null,
        ...(!mode.dependencies ? { total: null, slots: null } : {}),
      });
      expect(rows.empty).toEqual({ name: 'empty', accounts: [], ...(!mode.dependencies ? { slots: [] } : {}) });
      expect(rows.absent).toEqual({ name: 'absent' });
      expect(rows.missing).toEqual({
        name: 'missing',
        account: f.missing,
        accounts: [f.missing],
        ...(!mode.dependencies ? { total: null, slots: [null] } : {}),
      });
      expect(f.guard).toHaveBeenCalledTimes(Number(mode.dependencies));
      expect(f.finds).toHaveBeenCalledTimes(mode.dependencies ? 0 : 1);
    });

    it.each(['match', 'deleted'] as const)(
      'keeps admitted ordinary %s misses instead of restoring IDs',
      async (kind) => {
        const f = await fixture(hydration, mode);
        if (kind === 'deleted') await f.Target.deleteOne({ _id: f.a._id });
        const result = await f.execute((req) =>
          req.macl.getService(f.Source.modelName).findOne(
            { _id: f.source._id },
            {
              select: ['account', 'accounts', 'total', 'slots', '-_id'],
              populate: publicPopulate.map((entry) => ({
                ...entry,
                ...(kind === 'match' ? { match: { name: entry.path === 'account' ? 'b' : 'a' } } : {}),
              })),
            },
            quiet,
          ),
        );
        expect(result.success).toBe(true);
        if (!result.success) throw new Error(result.code);
        expect(result.data.account).toEqual(mode.queries ? f.a._id : null);
        expect(result.data.accounts).toEqual(
          mode.queries ? f.ids : kind === 'match' ? expectedPublic.accounts.slice(0, 2) : [{ name: 'b' }],
        );
        if (mode.dependencies) {
          expect(result.data).not.toHaveProperty('total');
          expect(result.data).not.toHaveProperty('slots');
        } else {
          expect(result.data.total).toBe(kind === 'match' ? 7 : null);
          expect(result.data.slots).toEqual(
            kind === 'match' ? [7, null, null, 7, 8, null] : [null, null, null, null, 8, null],
          );
        }
      },
    );

    it.each([
      'guard',
      'base-denial',
      'override-denial',
      'row-error',
      'query-error',
      'getter-error',
      'getter-undefined',
      'virtual-denied',
    ] as const)('private %s cannot remove permitted IDs or cause a write retry', async (failure) => {
      const f = await fixture(hydration, mode);
      const warnings = vi.fn();
      f.api.setGlobalOptions({ logger: { warn: warnings } } as never);
      if (failure === 'guard')
        f.guard.mockImplementation(() => {
          throw new Error('PRIVATE-sentinel');
        });
      else f.guard.mockReturnValue(true);
      if (failure === 'base-denial') f.base.mockReturnValue(false as never);
      if (failure === 'override-denial') f.override.mockReturnValue(false as never);
      if (failure === 'row-error')
        f.base.mockImplementation(() => {
          throw new Error('PRIVATE-sentinel');
        });
      if (failure === 'query-error')
        f.finds.mockImplementation(() => {
          throw new Error('PRIVATE-sentinel');
        });
      if (failure === 'getter-error')
        f.total.mockImplementation(() => {
          throw new Error('PRIVATE-sentinel');
        });
      if (failure === 'getter-undefined') f.total.mockReturnValue(undefined);
      if (failure === 'virtual-denied') {
        f.api.setModelOption(f.Source.modelName, 'modelPermissionPrefix', 'doc:');
        f.api.setModelOption(f.Source.modelName, 'permissionSchema.total', 'doc:no');
      }
      const writes = vi.spyOn(f.Source.collection, 'updateOne');
      const result = await f.execute((req) =>
        req.macl
          .getService(f.Source.modelName)
          .updateById(
            String(f.source._id),
            { name: 'saved' },
            { select: ['name', 'account', 'accounts', 'total', '-_id'] },
            quiet,
          ),
      );
      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.code);
      expect(result.data).toEqual({
        name: 'saved',
        account: f.a._id,
        accounts: f.ids,
        ...(failure === 'guard' && !mode.dependencies ? { total: 7 } : {}),
      });
      expect(f.guard).toHaveBeenCalledTimes(Number(mode.dependencies));
      expect(writes).toHaveBeenCalledTimes(1);
      expect((await f.Source.findById(f.source._id).lean())!.account).toEqual(f.a._id);
      expect(JSON.stringify(warnings.mock.calls)).not.toContain('PRIVATE-sentinel');
      expect(result.context.finalDocumentSnapshot.account).toEqual(f.a._id);
      expect(result.context).not.toHaveProperty('populated');
      for (const [doc] of f.sourceHook.mock.calls) expect(doc).not.toHaveProperty('account.balance');
    });

    it('isolates native private getter inputs and permits only an authorized deliberate return', async () => {
      const f = await fixture(hydration, mode);
      const saved = await f.Target.findById(f.a._id).select('+balance').lean();
      f.total.mockImplementation((_doc, _permissions, _context, populated) => {
        populated.account.date.setUTCFullYear(2001);
        populated.account.bytes[0] = 99;
        populated.account.marker.id[0] ^= 0xff;
        return 7;
      });
      const echo = vi.fn((_doc, _permissions, _context, populated) => populated.account);
      f.api.setModelOption(f.Source.modelName, 'permissionSchema.echo', true);
      f.api.setModelOption(f.Source.modelName, 'virtuals.echo', {
        get: echo,
        dependsOnPopulate: [{ path: 'account', select: 'date bytes marker -_id' }],
      } as never);
      const result = await f.execute((req) =>
        req.macl
          .getService(f.Source.modelName)
          .findOne({ _id: f.source._id }, { select: ['account', 'total', 'echo', '-_id'] }, quiet),
      );
      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.code);
      expect(result.data.account).toEqual(f.a._id);
      if (mode.dependencies) expect(result.data).not.toHaveProperty('echo');
      else {
        expect(result.data.echo).toEqual({ date: saved!.date, bytes: saved!.bytes, marker: saved!.marker });
        expect(echo.mock.calls[0][0]).not.toHaveProperty('account.date');
        expect(Object.keys(echo.mock.calls[0][3].account).sort()).toEqual(['bytes', 'date', 'marker']);
      }
      expect(await f.Target.findById(f.a._id).select('+balance').lean()).toEqual(saved);
      expect(f.guard).toHaveBeenCalledTimes(Number(mode.dependencies));
    });

    it('uses the original public mask even when private fetch unions select public-authorized fields', async () => {
      const f = await fixture(hydration, mode);
      f.api.setModelOption(f.Target.modelName, 'permissionSchema.balance', true);
      const result = await f.execute((req) =>
        req.macl
          .getService(f.Source.modelName)
          .findOne(
            { _id: f.source._id },
            { select: ['account', 'total', '-_id'], populate: [{ path: 'account', select: 'name -_id' }] },
            quiet,
          ),
      );
      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.code);
      expect(result.data.account).toEqual(mode.queries ? f.a._id : { name: 'a' });
      expect(result.data).not.toHaveProperty('account.balance');
      if (!mode.queries) expect(result.data).not.toHaveProperty('account._id');
      if (!mode.dependencies) expect(result.data).toHaveProperty('total', 7);
    });

    it('captures both flags before the first await and isolates later calls on the same service', async () => {
      const f = await fixture(hydration, mode);
      const ready = latch(),
        held = latch();
      f.api.setModelOption(f.Source.modelName, 'baseFilter.read', async () => {
        ready.release();
        await held.promise;
        return {};
      });
      const results = await f.execute(async (req) => {
        const service = req.macl.getService(f.Source.modelName);
        const read = () =>
          service.findOne(
            { _id: f.source._id },
            { select: ['account', 'total', '-_id'], populate: [publicPopulate[0]] },
            quiet,
          );
        const pending = read();
        await ready.promise;
        f.api.setGlobalOptions({
          requireOperationAccessForPopulateQueries: !mode.queries,
          requireOperationAccessForPopulateDependencies: !mode.dependencies,
        });
        held.release();
        return [await pending, await read()];
      });
      for (const [index, result] of results.entries()) {
        expect(result.success).toBe(true);
        if (!result.success) throw new Error(result.code);
        const queries = index === 0 ? mode.queries : !mode.queries;
        const dependencies = index === 0 ? mode.dependencies : !mode.dependencies;
        expect(result.data).toEqual({
          account: queries ? f.a._id : expectedPublic.account,
          ...(!dependencies ? { total: 7 } : {}),
        });
      }
      expect(f.finds).toHaveBeenCalledTimes(mode.queries === mode.dependencies ? 1 : 2);
      expect(f.total).toHaveBeenCalledTimes(1);
      expect(f.guard).toHaveBeenCalledTimes(2);
    });

    it.each(['embedded', 'child', 'populated', 'legacy-include', 'correlated-include'] as const)(
      'carries independent policies and public ownership through %s output',
      async (stage) => {
        const f = await fixture(hydration, mode);
        const result = await f.execute((req) => {
          const service = req.macl.getService(f.Source.modelName);
          const args = { select: ['account', 'accounts', 'total', 'slots', '-_id'], populate: publicPopulate };
          if (stage === 'child')
            return service.readSub(String(f.source._id), 'children', String(f.source.children[0]._id), args);
          return service.findOne(
            { _id: f.source._id },
            stage === 'embedded'
              ? {
                  select: [
                    'children.account',
                    'children.accounts',
                    'children.total',
                    'children.slots',
                    '-children._id',
                    '-_id',
                  ],
                  populate: publicPopulate.map((entry) => ({ ...entry, path: `children.${entry.path}` })),
                }
              : stage === 'populated'
                ? {
                    select: ['related', '-_id'],
                    populate: [{ path: 'related', select: ['account', 'accounts', 'total', 'slots', '-_id'] }],
                  }
                : ({
                    select: ['name', '-_id'],
                    include: [
                      {
                        model: f.Source.modelName,
                        op: 'read',
                        path: 'joined',
                        args: stage === 'correlated-include' ? { select: args.select } : args,
                        ...(stage === 'correlated-include'
                          ? { mode: 'correlated', filter: { _id: { $parent: '_id' } } }
                          : { localField: '_id', foreignField: '_id' }),
                      },
                    ],
                  } as never),
            quiet,
          );
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error(result.code);
        const row =
          stage === 'embedded'
            ? result.data.children[0]
            : stage === 'populated'
              ? result.data.related
              : stage === 'child'
                ? result.data
                : result.data.joined;
        const expected =
          stage !== 'populated' && stage !== 'correlated-include' && !mode.queries
            ? expectedPublic
            : { account: f.a._id, accounts: f.ids };
        expect(row).toEqual({
          ...expected,
          ...(!mode.dependencies ? { total: 7, slots: [7, null, null, 7, 8, null] } : {}),
        });
        expect(row).not.toHaveProperty('account.balance');
        expect(row).not.toHaveProperty('populated');
        for (const [doc] of f.sourceHook.mock.calls) expect(doc).not.toHaveProperty('account.balance');
      },
    );

    it.each(['create', 'update', 'upsert-create', 'upsert-update', 'new'] as const)(
      '%s output preserves source IDs, computed permission and saved references',
      async (operation) => {
        const f = await fixture(hydration, mode);
        f.Source.schema.path('account').default(f.a._id);
        f.Source.schema.path('accounts').default(f.ids);
        const result = await f.execute((req) => {
          const service = req.macl.getService(f.Source.modelName);
          const data = { name: 'saved', account: f.a._id, accounts: f.ids };
          const args = { select: ['name', 'account', 'accounts', 'total', 'slots'], populate: publicPopulate };
          return operation === 'new'
            ? service.new({}, quiet)
            : operation === 'create'
              ? service.create(data, args, quiet)
              : operation === 'update'
                ? service.updateById(String(f.source._id), data, args, quiet)
                : service.upsert({ name: operation === 'upsert-create' ? 'missing' : 'source' }, data, args, quiet);
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error(result.code);
        const row = Array.isArray(result.data) ? result.data[0] : result.data;
        const expected = operation !== 'new' && !mode.queries ? expectedPublic : { account: f.a._id, accounts: f.ids };
        expect(row).toMatchObject(expected);
        if (mode.dependencies) expect(row).not.toHaveProperty('total');
        else expect(row).toMatchObject({ total: 7, slots: [7, null, null, 7, 8, null] });
        const stored = await f.Source.findById(row._id).lean();
        if (operation === 'new') expect(stored).toBeNull();
        else {
          expect(stored!.accounts).toEqual(f.ids);
          expect(stored).not.toHaveProperty('total');
          expect(stored).not.toHaveProperty('slots');
        }
        for (const [doc] of f.sourceHook.mock.calls) expect(doc).not.toHaveProperty('account.balance');
        expect(row).not.toHaveProperty('account.balance');
      },
    );

    it.each(['list', 'read', 'subRead', 'fallback'] as const)(
      '%s direct/root/trusted outputs agree under both policies',
      async (operation) => {
        const f = await fixture(hydration, mode);
        const id = String(f.source._id),
          subId = String(f.source.children[0]._id);
        if (operation === 'fallback')
          f.api.setModelOption(f.Source.modelName, 'baseFilter.read', () => ({ name: 'not-present' }));
        const args = {
          select: ['account', 'accounts', 'total', 'slots', '-_id'],
          populate: publicPopulate.map((entry) => ({
            ...entry,
            ...(operation === 'fallback' ? { access: 'read' as const } : {}),
          })),
        };
        const options = { ...quiet, tryList: operation === 'fallback' };
        const direct = await request(f.app)
          .post(
            operation === 'list'
              ? '/parents/__query'
              : operation === 'subRead'
                ? `/parents/${id}/children/${subId}/__query`
                : `/parents/__query/${id}`,
          )
          .send({ ...args, options })
          .expect(200);
        const root = await request(f.app)
          .post('/root')
          .send([
            {
              target: 'model',
              name: f.Source.modelName,
              op: operation === 'fallback' ? 'read' : operation,
              id,
              ...(operation === 'subRead' ? { sub: 'children', subId } : {}),
              args,
              options,
            },
          ])
          .expect(200);
        expect(root.body[0].statusCode).toBe(200);
        const trusted = await f.execute((req) => {
          const service = req.macl.getPublicService(f.Source.modelName);
          return operation === 'list'
            ? service._list({ _id: f.source._id }, args, quiet)
            : operation === 'subRead'
              ? service.readSub(id, 'children', subId, args)
              : service._read(id, args, options);
        });
        expect(trusted.success).toBe(true);
        if (!trusted.success) throw new Error(trusted.code);
        const directData = operation === 'list' ? direct.body.data : direct.body;
        expect(serialized(trusted.data)).toEqual(directData);
        expect(root.body[0].result.data).toEqual(directData);
        const row = operation === 'list' ? directData[0] : directData;
        expect(row).toEqual(
          serialized({
            ...(mode.queries ? { account: f.a._id, accounts: f.ids } : expectedPublic),
            ...(!mode.dependencies ? { total: 7, slots: [7, null, null, 7, 8, null] } : {}),
          }),
        );
      },
    );

    it.each(['source-row', 'hidden-child-write'] as const)('%s visibility prevents private work', async (stage) => {
      const f = await fixture(hydration, mode);
      if (stage === 'source-row') f.api.setModelOption(f.Source.modelName, 'baseFilter.read', () => false);
      else
        f.api.setModelOption(f.Source.modelName, 'baseFilter.subs.children', { read: () => false, list: () => false });
      const writes = vi.spyOn(f.Source.collection, 'updateOne');
      const result = await f.execute((req) => {
        const service = req.macl.getService(f.Source.modelName);
        return stage === 'source-row'
          ? service.findOne({ _id: f.source._id }, { select: ['account', 'total'] }, quiet)
          : service.updateSub(String(f.source._id), 'children', String(f.source.children[0]._id), {
              name: 'hidden-save',
            });
      });
      if (stage === 'source-row') expect(result).toMatchObject({ success: false });
      else {
        expect(result).toMatchObject({ success: true, data: null });
        expect((await f.Source.findById(f.source._id).lean())!.children[0].name).toBe('hidden-save');
      }
      expect(writes).toHaveBeenCalledTimes(stage === 'source-row' ? 0 : 1);
      expect(f.guard).not.toHaveBeenCalled();
      expect(f.finds).not.toHaveBeenCalled();
      expect(f.total).not.toHaveBeenCalled();
    });

    it('keeps direct/root target denial and helper-only operations free of dependency I/O', async () => {
      const f = await fixture(hydration, mode);
      const target = f.api.createRouter(f.Target, { basePath: '/documents' });
      f.app.use(target.routes);
      await request(f.app).post('/documents/__query').send({}).expect(401);
      const root = await request(f.app)
        .post('/root')
        .send([
          { target: 'model', name: f.Target.modelName, op: 'read', id: String(f.a._id) },
          { target: 'model', name: f.Target.modelName, op: 'list' },
        ])
        .expect(200);
      for (const result of root.body)
        expect(result).toMatchObject({ statusCode: 401, result: { code: 'unauthorized' } });
      await f.execute(async (req) => {
        const service = req.macl.getService(f.Source.modelName);
        expect(await service.count({})).toMatchObject({ success: true, data: 1 });
        expect(await service.distinct('name')).toMatchObject({ success: true, data: ['source'] });
        expect(await service.exists({ _id: f.source._id })).toMatchObject({ success: true });
        await service.genSelect('read', ['total']);
        await service.genQuerySelect('read', ['total']);
        await service.pickAllowedFields({ total: 7 }, 'read');
        await service.trimOutputFields({ total: 7 }, 'read');
      });
      expect(f.finds).not.toHaveBeenCalled();
      expect(f.total).not.toHaveBeenCalled();
    });
  });
});
