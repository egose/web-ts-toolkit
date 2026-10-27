import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../dist/index.mjs';
import type { ModelRequest } from '../dist/advanced';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();
let sequence = 0;
const runtimes: ReturnType<typeof createAccessRuntime>[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const api of runtimes.splice(0)) api.runtime.clearOpenApiRoutes();
  mongoose.deleteModel(/^PopHelperIsolation/);
});

const nativeMatch = (owner: mongoose.Types.ObjectId) => ({
  name: 'kept',
  since: { $gte: new Date('2026-10-26T00:00:00Z') },
  payload: Buffer.from('alpha'),
  owner: new mongoose.Types.ObjectId(owner.toHexString()),
  amount: mongoose.Types.Decimal128.fromString('1.25'),
});
type NativeMatch = ReturnType<typeof nativeMatch>;

function mutateNatives(filter: NativeMatch) {
  filter.since.$gte.setUTCFullYear(2000);
  filter.payload.fill(0);
  filter.owner.id.fill(0);
  filter.amount.bytes.fill(0);
}

async function fixture(required: boolean) {
  const api = createAccessRuntime();
  runtimes.push(api);
  api.setGlobalOption('requireOperationAccessForPopulateQueries', required);
  const Target = mongoose.model(
    `PopHelperIsolationTarget${++sequence}`,
    new mongoose.Schema({
      name: String,
      tenant: String,
      secret: String,
      since: Date,
      payload: Buffer,
      owner: mongoose.Schema.Types.ObjectId,
      amount: mongoose.Schema.Types.Decimal128,
    }),
  );
  const Parent = mongoose.model(
    `PopHelperIsolationParent${sequence}`,
    new mongoose.Schema({
      contacts: [{ refs: [{ type: mongoose.Schema.Types.ObjectId, ref: Target.modelName }] }],
    }),
  );
  const owner = new mongoose.Types.ObjectId();
  const defaults = {
    ...nativeMatch(owner),
    since: new Date('2026-10-26T00:00:00Z'),
    tenant: 'a',
    secret: 'private', // pragma: allowlist secret
  };
  const rows = await Target.create([
    defaults,
    { ...defaults, since: new Date('2025-01-01T00:00:00Z') },
    { ...defaults, payload: Buffer.from('other') },
    { ...defaults, owner: new mongoose.Types.ObjectId() },
    { ...defaults, amount: mongoose.Types.Decimal128.fromString('2.5') },
    { ...defaults, tenant: 'b' },
    defaults, // Matching but unrelated: it must never enter the reference query.
  ]);
  const parent = await Parent.create({ contacts: [{ refs: rows.slice(0, -1).map((row) => row._id) }] });
  const guard = vi.fn(() => required);
  const transform = vi.fn(async (filter: Record<string, unknown>) => filter);
  const base = vi.fn(() => ({ tenant: 'a' }));
  api.registerModelInstance(Target.modelName, Target);
  api.setModelOptions(Target.modelName, {
    operationAccess: { read: guard, list: guard, preview: guard },
    permissionSchema: { name: true, secret: false },
    overrideFilter: { read: transform, list: transform, preview: transform },
    baseFilter: { read: base, list: base, preview: base },
  });
  const router = api.createRouter(Parent, {
    basePath: '/parents',
    operationAccess: true,
    permissionSchema: { contacts: { sub: { refs: true } } },
  });
  let callback: (req: ModelRequest) => Promise<void>;
  let failure: unknown;
  router.router.post('/probe', async (req, res) => {
    try {
      await callback(req as ModelRequest);
    } catch (error) {
      failure = error;
    }
    res.json({ ok: true });
  });
  const app = express();
  app.use(router.routes);
  const queries = vi.spyOn(Target.collection, 'find');
  return {
    owner,
    Parent,
    Target,
    parent,
    rows,
    guard,
    transform,
    base,
    queries,
    descriptor: () => ({ path: 'contacts.refs', select: ['name', 'secret'], match: nativeMatch(owner) }),
    async execute(run: typeof callback) {
      callback = run;
      failure = undefined;
      await request(app).post('/parents/probe').expect(200, { ok: true });
      if (failure) throw failure;
    },
  };
}

describe.each([true, false])('POP-06 scoped helper isolation (Q=%s)', (required) => {
  it.each(['read', 'list', 'preview'] as const)(
    'allows native and object rewrites after await under %s, preserving match, rows, IDs and metadata',
    async (access) => {
      const f = await fixture(required);
      let retained!: NativeMatch;
      f.transform.mockImplementation(async (filter) => {
        await Promise.resolve();
        retained = filter as NativeMatch;
        mutateNatives(retained);
        for (const key of ['name', 'payload', 'owner', 'amount']) delete filter[key];
        filter.tenant = 'a';
        return filter;
      });
      await f.execute(async (req) => {
        const descriptor = f.descriptor();
        const plan = await req.macl
          .getService(f.Parent.modelName)
          .genPopulate(access, [descriptor], { scopePath: ['contacts'] });
        expect(plan).toHaveLength(1);
        expect(descriptor.match).toEqual(nativeMatch(f.owner));
        // A hook may retain its returned input. Later native mutations must not
        // change the prepared descriptor, even before Mongoose starts target I/O.
        retained.since.$gte.setUTCFullYear(2099);
        expect(Object.keys(plan[0]).sort()).toEqual(['match', 'path', 'select']);
        const symbols = Object.getOwnPropertySymbols(plan[0]);
        expect(symbols).toHaveLength(1);
        const metadata = Object.getOwnPropertyDescriptor(plan[0], symbols[0])!;
        expect(metadata.enumerable).toBe(false);
        expect(metadata.value).toMatchObject({
          targetModelName: f.Target.modelName,
          outputAccess: access,
          requestedSelect: ['name', 'secret'],
        });
        const output = await f.Parent.findById(f.parent._id).populate(plan).lean();
        expect(output?.contacts[0].refs).toEqual([{ _id: f.rows[0]._id, name: 'kept' }]);
        expect(f.queries).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(f.queries.mock.calls[0][0])).not.toContain(String(f.rows.at(-1)!._id));
        expect(f.guard).toHaveBeenCalledTimes(required ? 1 : 0);
        expect(f.transform).toHaveBeenCalledTimes(1);
        expect(f.base).toHaveBeenCalledTimes(1);
      });
    },
  );

  it.each(['override', 'base'] as const)(
    'detaches returned native predicates from the %s hook and request row cache',
    async (alias) => {
      const f = await fixture(required);
      const predicate = { ...nativeMatch(f.owner), tenant: 'a' };
      if (alias === 'override') f.transform.mockResolvedValue(predicate);
      else f.base.mockReturnValue(predicate);
      await f.execute(async (req) => {
        const service = req.macl.getService(f.Parent.modelName);
        const descriptor = { path: 'contacts.refs', select: ['name'], match: { name: 'kept' } };
        const plan = await service.genPopulate('read', descriptor, { scopePath: ['contacts'] });
        expect(plan).toHaveLength(1);
        mutateNatives(plan[0].match as NativeMatch);
        expect(predicate).toEqual({ ...nativeMatch(f.owner), tenant: 'a' });
        expect(descriptor.match).toEqual({ name: 'kept' });
        const later = await service.genPopulate('read', descriptor, { scopePath: ['contacts'] });
        const output = await f.Parent.findById(f.parent._id).populate(later).lean();
        expect(output?.contacts[0].refs).toEqual([{ _id: f.rows[0]._id, name: 'kept' }]);
        expect(f.base).toHaveBeenCalledTimes(1);
        expect(f.transform).toHaveBeenCalledTimes(2);
        expect(f.queries).toHaveBeenCalledTimes(1);
      });
    },
  );

  it('preserves original native intent when an awaited transform mutates then throws; retry stays scoped', async () => {
    const f = await fixture(required);
    const failure = new Error('application transform failed');
    f.transform.mockImplementationOnce(async (filter) => {
      await Promise.resolve();
      mutateNatives(filter as NativeMatch);
      delete filter.name;
      throw failure;
    });
    await f.execute(async (req) => {
      const service = req.macl.getService(f.Parent.modelName);
      const descriptor = f.descriptor();
      await expect(service.genPopulate('read', descriptor, { scopePath: ['contacts'] })).rejects.toBe(failure);
      expect(descriptor.match).toEqual(nativeMatch(f.owner));
      expect(descriptor.select).toEqual(['name', 'secret']);
      expect(f.base).not.toHaveBeenCalled();
      expect(f.queries).not.toHaveBeenCalled();
      const retry = await service.genPopulate('read', descriptor, { scopePath: ['contacts'] });
      const output = await f.Parent.findById(f.parent._id).populate(retry).lean();
      expect(output?.contacts[0].refs).toEqual([{ _id: f.rows[0]._id, name: 'kept' }]);
      expect(f.base).toHaveBeenCalledTimes(1);
      expect(f.transform).toHaveBeenCalledTimes(2);
      expect(f.queries).toHaveBeenCalledTimes(1);
    });
  });
});
