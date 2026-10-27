import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../src/index';
import Permission from '../src/permission';
import { runWithRuntime } from '../src/runtime-context';
import { captureModelAuthorizationConfiguration } from '../src/acl/model-output-planning';
import { planAuthorizedModelProjection } from '../src/acl/output-projection';
import { resolveServiceAuthorization } from '../src/acl/service-authorization';
import { setPopulateTargetMeta } from '../src/acl/populate-target';
import {
  captureVirtualPopulateRows,
  createVirtualPopulateBatch,
  equivalentVirtualPopulatePredicate,
  executeVirtualPopulateBatch,
  getVirtualPopulateRow,
  getVirtualPopulatePublicIdentity,
  projectVirtualPopulateView,
  readVirtualPopulateInputs,
  readVirtualPopulateOriginalReference,
  readVirtualPopulatePublicRow,
  readVirtualPopulatePublicTargets,
} from '../src/acl/virtual-populate-execution';
import { isolateDocForOutput } from '../src/helpers/document';
import type { ModelRequest, Populate, Projection } from '../src/interfaces';
import type { FinalizeSnapshot } from '../src/output/finalize-model-output';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();
let serial = 0;
const quiet = { includePermissions: false, includeFieldPermissions: false, includeCount: false };

async function fixture(targetOptions: Record<string, unknown> = {}, sourceOptions: Record<string, unknown> = {}) {
  const api = createAccessRuntime();
  api.setGlobalOptions({ requestComplexity: { maxBulkConcurrency: 1, maxHookConcurrency: 1 } } as never);
  const n = ++serial;
  const calls: { filter: unknown; projection: unknown; lean: unknown }[] = [];
  const targetSchema = new mongoose.Schema({
    name: String,
    tenant: String,
    balance: { type: Number, select: false },
    credit: Number,
    creditLimit: Number,
    hookInput: String,
    profile: { city: String, secret: String },
    entries: [new mongoose.Schema({ value: Number, secret: String }, { _id: false })],
    stamp: Date,
    bytes: Buffer,
    decimal: mongoose.Schema.Types.Decimal128,
  });
  targetSchema.pre('find', function () {
    calls.push({ filter: this.getFilter(), projection: this.projection(), lean: this.mongooseOptions().lean });
  });
  const Target = mongoose.model(`DpvFetchTarget${n}`, targetSchema);
  const ref = { type: mongoose.Schema.Types.ObjectId, ref: Target.modelName };
  const Source = mongoose.model(
    `DpvFetchSource${n}`,
    new mongoose.Schema({
      label: String,
      account: ref,
      other: ref,
      publicOnly: ref,
      accounts: { type: [ref], default: undefined },
      children: [new mongoose.Schema({ account: ref })],
    }),
  );
  const targetPermissions = vi.fn(() => ({}));
  const sourcePermissions = vi.fn(() => ({}));
  const getter = vi.fn(() => true);
  const base = vi.fn(() => ({ tenant: 'a' }));
  api.createRouter(Target, {
    operationAccess: { read: true, list: true },
    permissionSchema: { name: true, hookInput: false, balance: false, credit: false },
    alwaysSelectFields: { read: ['hookInput'], list: ['hookInput'] },
    docPermissions: { read: targetPermissions, list: targetPermissions },
    baseFilter: { read: base, list: base },
    ...targetOptions,
  } as never);
  const router = api.createRouter(Source, {
    basePath: `/dpv-fetch-${n}`,
    operationAccess: { read: true, list: true },
    permissionSchema: {
      label: true,
      account: true,
      other: false,
      publicOnly: true,
      accounts: true,
      eligible: true,
      credit: true,
      repeated: true,
      listInput: true,
      children: { read: true, list: true, sub: { eligible: true } },
    },
    docPermissions: { read: sourcePermissions, list: sourcePermissions },
    virtuals: {
      eligible: { get: getter, dependsOnPopulate: [{ path: 'account', select: 'balance stamp bytes decimal -_id' }] },
      credit: { get: getter, dependsOnPopulate: [{ path: 'account', select: 'credit' }] },
      repeated: { get: getter, dependsOnPopulate: [{ path: 'other', select: 'balance' }] },
      listInput: { get: getter, dependsOnPopulate: [{ path: 'accounts', select: 'balance stamp bytes decimal' }] },
      children: { sub: { eligible: { get: getter, dependsOnPopulate: [{ path: 'account', select: 'balance' }] } } },
    },
    ...sourceOptions,
  } as never);
  const [a, b, outside] = await Target.create([
    {
      name: 'a',
      tenant: 'a',
      balance: 10,
      credit: 2,
      creditLimit: 2,
      hookInput: 'hook-a',
      stamp: new Date('2025-01-01'),
      bytes: Buffer.from('private'),
      decimal: '1.25',
      profile: { city: 'city', secret: 'hidden' },
      entries: [{ value: 0, secret: 'hidden' }],
    },
    { name: 'b', tenant: 'a', balance: 20, credit: 3, creditLimit: 3 },
    { name: 'outside', tenant: 'b', balance: 100, credit: 50, creditLimit: 50 },
  ]);
  const missing = new mongoose.Types.ObjectId();
  const ids = [a._id, missing, null, a._id, b._id, outside._id];
  const sources = await Source.create([
    {
      label: 'first',
      account: a._id,
      other: b._id,
      publicOnly: b._id,
      accounts: ids,
      children: [{ account: a._id }, { account: b._id }],
    },
    { label: 'second', account: missing, other: a._id, accounts: ids },
    { label: 'null', account: null, accounts: null },
    { label: 'empty', accounts: [] },
    { label: 'absent' },
  ]);
  const req = { actor: 'original' } as unknown as ModelRequest;
  const permissions = new Permission({});
  const plan = (select?: Projection, target = false) => {
    const model = target ? Target : Source;
    const binding = { request: req, runtime: api.runtime, model, modelName: model.modelName };
    const configuration = captureModelAuthorizationConfiguration(api.runtime, model.modelName);
    const authorization = resolveServiceAuthorization({
      binding,
      configuration,
      access: {
        operation: 'read',
        rowAccess: 'read',
        virtualAccess: 'read',
        outputAccess: 'read',
        docPermissionsAccess: 'read',
      },
      requestPermissions: permissions,
    });
    return planAuthorizedModelProjection({ binding, authorization, requestedSelect: select });
  };
  const batch = (lean = true) =>
    createVirtualPopulateBatch({
      request: req,
      runtime: api.runtime,
      family: {},
      permissions,
      hydration: lean ? 'lean' : 'hydrated',
    });
  const publicEntry = (
    path = 'account',
    select?: Projection,
    filter: unknown = { tenant: 'a' },
    access = 'read',
    requestRead = true,
  ) => {
    const plan = (() => {
      if (access === 'read') return f.plan(select, true);
      const configuration = captureModelAuthorizationConfiguration(api.runtime, Target.modelName);
      const binding = { request: req, runtime: api.runtime, model: Target, modelName: Target.modelName };
      return planAuthorizedModelProjection({
        binding,
        authorization: resolveServiceAuthorization({
          binding,
          configuration,
          requestPermissions: permissions,
          access: {
            operation: 'read',
            rowAccess: access,
            virtualAccess: access,
            outputAccess: access,
            docPermissionsAccess: access,
          },
        }),
        requestedSelect: select,
      });
    })();
    const configuration = captureModelAuthorizationConfiguration(api.runtime, Target.modelName);
    const entry = { path, select: plan.persistedFetchSelection, match: filter } as Populate;
    setPopulateTargetMeta(entry, {
      targetModelName: Target.modelName,
      virtualAccess: access,
      outputAccess: access,
      docPermissionsAccess: access,
      requestedSelect: select,
      plan,
      snapshot: configuration as FinalizeSnapshot,
      fetchBinding: { runtime: api.runtime, model: Target as never, schema: Target.schema, configuration, requestRead },
    });
    return entry;
  };
  const f = {
    api,
    Target,
    Source,
    router,
    basePath: `/dpv-fetch-${n}`,
    req,
    a,
    b,
    outside,
    ids,
    sources,
    missing,
    calls,
    base,
    getter,
    sourcePermissions,
    targetPermissions,
    plan,
    batch,
    publicEntry,
  };
  return f;
}

async function executeFixture<T>(f: Awaited<ReturnType<typeof fixture>>, run: (req: ModelRequest) => Promise<T>) {
  const path = `/runtime-probe-${++serial}`;
  let result!: T;
  let failure: unknown;
  f.router.router.post(path, async (req, res) => {
    try {
      result = await run(req as unknown as ModelRequest);
    } catch (error) {
      failure = error;
    }
    res.json({ ok: true });
  });
  const app = express();
  app.use(express.json());
  app.use(f.router.routes);
  await request(app).post(`${f.basePath}${path}`).send({}).expect(200);
  if (failure) throw failure;
  return result;
}

describe.each(['lean', 'hydrated'] as const)('DPV-03 direct private getter inputs (%s)', (hydration) => {
  it('computes from denied ref/target fields without adding them to the first argument or output', async () => {
    const getter = vi.fn((doc, _permissions, _context, populated) => {
      expect(doc).not.toHaveProperty('account');
      return populated?.account?.balance + populated?.account?.creditLimit === 12;
    });
    const f = await fixture(
      {},
      {
        hydration: { findOne: hydration },
        permissionSchema: { label: true, account: false, eligible: true },
        virtuals: {
          eligible: { get: getter, dependsOnPopulate: [{ path: 'account', select: 'balance creditLimit -_id' }] },
        },
      },
    );
    const result = await executeFixture(f, (req) =>
      req.macl.getService(f.Source.modelName).findOne({ _id: f.sources[0]._id }, { select: ['eligible'] }, quiet),
    );
    expect(result).toMatchObject({ success: true, data: { eligible: true } });
    expect(getter).toHaveBeenCalledTimes(1);
    expect(getter.mock.calls[0][3]).toEqual({ account: { balance: 10, creditLimit: 2 } });
    expect(result).not.toHaveProperty('data.account');
    expect(f.calls).toHaveLength(1);
  });

  it.each(['name', 'name -_id', '-balance -creditLimit', { name: 1, _id: -1 }] as Projection[])(
    'returns the original authorized ordinary target projection %j, with fetch-only union',
    async (select) => {
      const getter = vi.fn((doc, _permissions, _context, populated) => {
        expect(doc.account).toHaveProperty('name', 'a');
        expect(doc.account).not.toHaveProperty('balance');
        expect(doc.account).not.toHaveProperty('creditLimit');
        return populated.account.balance + populated.account.creditLimit;
      });
      const f = await fixture(
        { permissionSchema: { name: true, balance: true, creditLimit: true } },
        {
          hydration: { findOne: hydration },
          virtuals: {
            eligible: { get: getter, dependsOnPopulate: [{ path: 'account', select: 'balance creditLimit -_id' }] },
          },
        },
      );
      const result = await executeFixture(f, (req) =>
        req.macl
          .getService(f.Source.modelName)
          .findOne(
            { _id: f.sources[0]._id },
            { select: ['account', 'eligible', '-_id'], populate: [{ path: 'account', select }] },
            quiet,
          ),
      );
      expect(result).toMatchObject({ success: true, data: { eligible: 12, account: { name: 'a' } } });
      if (!result.success) throw new Error(result.code);
      const idExcluded = typeof select === 'string' ? select.includes('-_id') : true;
      expect(Object.keys(result.data.account).sort()).toEqual(idExcluded ? ['name'] : ['_id', 'name']);
      expect(result.data).not.toHaveProperty('_id');
      expect(f.calls).toHaveLength(1);
      expect(f.calls[0].projection).toMatchObject({ balance: 1, creditLimit: 1, name: 1, _id: 1 });
      expect(f.targetPermissions).toHaveBeenCalledTimes(1);
      expect(f.targetPermissions.mock.calls[0][0]).not.toHaveProperty('balance');
    },
  );

  it('restores scalar/array source refs exactly, including misses, null, absence, duplicates and order', async () => {
    const getter = vi.fn((_doc, _permissions, _context, populated) =>
      populated.accounts === null ? null : populated.accounts.map((target) => target?.balance ?? null),
    );
    const f = await fixture(
      {},
      {
        hydration: { find: hydration },
        virtuals: { listInput: { get: getter, dependsOnPopulate: [{ path: 'accounts', select: 'balance -_id' }] } },
      },
    );
    const result = await executeFixture(f, (req) =>
      req.macl
        .getService(f.Source.modelName)
        .find({}, { select: ['label', 'account', 'accounts', 'listInput'] }, quiet),
    );
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.code);
    const first = result.data.find((row) => row.label === 'first')!;
    expect(first.accounts).toEqual(f.ids);
    expect(first.account).toEqual(f.a._id);
    expect(first.listInput).toEqual([10, null, null, 10, 20, null]);
    expect(result.data.find((row) => row.label === 'second')!.account).toEqual(f.missing);
    expect(result.data.find((row) => row.label === 'null')).toMatchObject({ accounts: null, listInput: null });
    expect(result.data.find((row) => row.label === 'empty')).toMatchObject({ accounts: [], listInput: [] });
    expect(result.data.find((row) => row.label === 'absent')).not.toHaveProperty('accounts');
    expect(result.data.find((row) => row.label === 'absent')).not.toHaveProperty('listInput');
    expect(getter).toHaveBeenCalledTimes(4);
    expect(f.calls).toHaveLength(1);
  });

  it.each(['unselected', 'excluded', 'denied'])(
    'omits the %s ref while computing; ordinary population cannot widen its eligibility',
    async (mode) => {
      const getter = vi.fn((_doc, _permissions, _context, populated) => populated.account.balance);
      const f = await fixture(
        {},
        {
          hydration: { findOne: hydration },
          permissionSchema: { account: mode !== 'denied', eligible: true },
          virtuals: { eligible: { get: getter, dependsOnPopulate: [{ path: 'account', select: 'balance' }] } },
        },
      );
      const result = await executeFixture(f, (req) =>
        req.macl.getService(f.Source.modelName).findOne(
          { _id: f.sources[0]._id },
          {
            select:
              mode === 'excluded'
                ? ['eligible', '-account']
                : mode === 'denied'
                  ? ['eligible', 'account']
                  : ['eligible'],
            populate: [{ path: 'account', select: 'name' }],
          },
          quiet,
        ),
      );
      expect(result).toMatchObject({ success: true, data: { eligible: 10 } });
      expect(result).not.toHaveProperty('data.account');
    },
  );

  it('keeps ordinary match independent of private inputs and preserves ordinary array misses', async () => {
    const getter = vi.fn((doc, _permissions, _context, populated) => {
      expect(doc.accounts.map((target) => target.name)).toEqual(['a', 'a']);
      return populated.accounts.map((target) => target?.balance ?? null);
    });
    const f = await fixture(
      {},
      {
        hydration: { findOne: hydration },
        virtuals: { listInput: { get: getter, dependsOnPopulate: [{ path: 'accounts', select: 'balance -_id' }] } },
      },
    );
    const result = await executeFixture(f, (req) =>
      req.macl.getService(f.Source.modelName).findOne(
        { _id: f.sources[0]._id },
        {
          select: ['accounts', 'listInput'],
          populate: [{ path: 'accounts', select: 'name -_id', match: { name: 'a' } }],
        },
        quiet,
      ),
    );
    expect(result).toMatchObject({
      success: true,
      data: { accounts: [{ name: 'a' }, { name: 'a' }], listInput: [10, null, null, 10, 20, null] },
    });
    expect(f.calls).toHaveLength(2);
  });

  it('preserves ordinary populate defaults and explicit [] suppression', async () => {
    const getter = vi.fn((_doc, _permissions, _context, populated) => populated.account.balance);
    const f = await fixture(
      {},
      {
        hydration: { findOne: hydration },
        defaults: {
          findOneArgs: { select: ['account', 'eligible'], populate: [{ path: 'account', select: 'name -_id' }] },
        },
        virtuals: { eligible: { get: getter, dependsOnPopulate: [{ path: 'account', select: 'balance' }] } },
      },
    );
    await executeFixture(f, async (req) => {
      const service = req.macl.getService(f.Source.modelName);
      expect(await service.findOne({ _id: f.sources[0]._id }, undefined, quiet)).toMatchObject({
        success: true,
        data: { account: { name: 'a' }, eligible: 10 },
      });
      expect(await service.findOne({ _id: f.sources[0]._id }, { populate: [] }, quiet)).toMatchObject({
        success: true,
        data: { account: f.a._id, eligible: 10 },
      });
    });
    expect(f.calls).toHaveLength(2);
  });

  it('loads an ordinary populated target own private dependencies before parent getters without recursion', async () => {
    const f = await fixture({}, { hydration: { findOne: hydration } });
    f.Target.schema.add({ back: { type: mongoose.Schema.Types.ObjectId, ref: f.Source.modelName } });
    const badge = vi.fn((_doc, _permissions, _context, populated) => populated.back.label);
    f.api.runtime.setModelOptions(f.Target.modelName, {
      permissionSchema: { name: true, badge: true, back: false },
      docPermissions: { read: f.targetPermissions },
      virtuals: { badge: { get: badge, dependsOnPopulate: [{ path: 'back', select: 'label -_id' }] } },
    } as never);
    await f.Target.updateOne({ _id: f.a._id }, { back: f.sources[0]._id });
    const result = await executeFixture(f, (req) =>
      req.macl
        .getService(f.Source.modelName)
        .findOne(
          { _id: f.sources[0]._id },
          { select: ['account'], populate: [{ path: 'account', select: 'name badge -_id' }] },
          quiet,
        ),
    );
    expect(result).toMatchObject({ success: true, data: { account: { name: 'a', badge: 'first' } } });
    expect(result).not.toHaveProperty('data.account.back');
    expect(badge).toHaveBeenCalledTimes(1);
    expect(badge.mock.calls[0][0]).not.toHaveProperty('back');
    expect(f.getter).not.toHaveBeenCalled();
    expect(f.targetPermissions.mock.calls[0][0]).not.toHaveProperty('back');
  });
});

describe('DPV-03 isolated getters and unconditional reconstruction', () => {
  it('carries occurrence addresses through embedded arrays without synthesizing missing containers', async () => {
    const getter = vi.fn((doc, _permissions, context, populated) => {
      expect(doc).not.toHaveProperty('account');
      expect(context.scopePath).toEqual(['children', 'sub']);
      return populated.account?.balance;
    });
    const f = await fixture(
      {},
      {
        permissionSchema: {
          label: true,
          children: { read: true, list: true, sub: { account: false, eligible: true } },
        },
        virtuals: {
          children: { sub: { eligible: { get: getter, dependsOnPopulate: [{ path: 'account', select: 'balance' }] } } },
        },
      },
    );
    const result = await executeFixture(f, (req) =>
      req.macl
        .getService(f.Source.modelName)
        .find(
          { _id: { $in: [f.sources[0]._id, f.sources[4]._id] } },
          { select: ['label', 'children.eligible'] },
          quiet,
        ),
    );
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.code);
    expect(result.data.find((row) => row.label === 'first')!.children).toMatchObject([
      { eligible: 10 },
      { eligible: 20 },
    ]);
    expect(result.data.find((row) => row.label === 'absent')!.children).toEqual([]);
    expect(getter).toHaveBeenCalledTimes(2);
    expect(f.calls).toHaveLength(1);
  });

  it('isolates declarations, native leaves, repeated slots, first arguments, sibling getters and authenticated output', async () => {
    const mutate = vi.fn(async (doc, _permissions, context, populated) => {
      expect(populated.account).not.toHaveProperty('credit');
      expect(doc.account).toEqual({ name: 'a' });
      expect(context).not.toHaveProperty('populated');
      expect(context.originalDocumentSnapshot.account).not.toHaveProperty('balance');
      populated.account.balance = -100;
      populated.account.stamp.setFullYear(1999);
      const bytes = populated.account.bytes;
      (Buffer.isBuffer(bytes) ? bytes : bytes.buffer)[0] = 0;
      populated.accounts[0].balance = -200;
      expect(populated.accounts[3].balance).toBe(10);
      doc.account.name = 'mutated';
      await Promise.resolve();
      return undefined;
    });
    const credit = vi.fn((_doc, _permissions, _context, populated) => {
      expect(Object.keys(populated)).toEqual(['account']);
      expect(populated.account).toEqual({ credit: 2 });
      return populated.account.credit;
    });
    const balance = vi.fn((_doc, _permissions, _context, populated) => {
      expect(populated.account.stamp.getUTCFullYear()).toBe(2025);
      return populated.account.balance;
    });
    const legacy = vi.fn((doc, _permissions, _context, populated) => {
      expect(populated).toEqual({});
      expect(doc.account).toEqual({ name: 'a' });
      expect(doc).not.toHaveProperty('accounts');
      return 'ordinary';
    });
    const f = await fixture(
      {},
      {
        permissionSchema: { account: true, eligible: true, credit: true, repeated: true, legacy: true },
        virtuals: {
          eligible: {
            get: mutate,
            dependsOnPopulate: [
              { path: 'account', select: 'balance stamp bytes -_id' },
              { path: 'accounts', select: 'balance -_id' },
            ],
          },
          credit: { get: credit, dependsOnPopulate: [{ path: 'account', select: 'credit -_id' }] },
          repeated: { get: balance, dependsOnPopulate: [{ path: 'account', select: 'balance stamp -_id' }] },
          legacy,
        },
      },
    );
    f.api.setGlobalOptions({ requestComplexity: { maxBulkConcurrency: 1, maxHookConcurrency: 3 } } as never);
    await executeFixture(f, async (req) => {
      const service = req.macl.getService(f.Source.modelName);
      const result = await service.findOne(
        { _id: f.sources[0]._id },
        {
          select: ['account', 'eligible', 'credit', 'repeated', 'legacy'],
          populate: [{ path: 'account', select: 'name -_id' }],
        },
        quiet,
      );
      expect(balance.mock.calls[0]?.[3]?.account?.stamp).toEqual(new Date('2025-01-01'));
      expect(balance.mock.results[0]).toMatchObject({ type: 'return', value: 10 });
      expect(result).toMatchObject({
        success: true,
        data: { account: { name: 'a' }, credit: 2, repeated: 10, legacy: 'ordinary' },
      });
      if (!result.success) throw new Error(result.code);
      expect(result.data).not.toHaveProperty('eligible');
      expect(result.data).not.toHaveProperty('accounts');
      expect(getVirtualPopulateRow(result.data)).toBeUndefined();
      expect(Reflect.ownKeys(result.data).every((key) => typeof key === 'string')).toBe(true);
      const picked = await service.pickAllowedFields(result.data, 'read', {
        documentAuthorization: result.context.documentAuthorization,
      });
      expect(picked).toHaveProperty('account.name', 'a');
      expect(picked).not.toHaveProperty('account.balance');
      expect(result.context).not.toHaveProperty('populated');
      expect(result.context.documentAuthorization).not.toHaveProperty('populated');
    });
    for (const getter of [mutate, credit, balance, legacy]) expect(getter).toHaveBeenCalledTimes(1);
    await expect(mutate.mock.results[0].value).resolves.toBeUndefined();
    expect(f.calls).toHaveLength(1);
    expect(await f.Target.findById(f.a._id).select('+balance').lean()).toHaveProperty('balance', 10);
    expect(await f.Source.findById(f.sources[0]._id).lean()).toHaveProperty('account', f.a._id);
  });

  it.each(['undefined', 'throw', 'late-denial', 'operation', 'scope', 'query', 'missing-source'])(
    'reconstructs allowed IDs (PPR-02 omits operation-denied refs) and omits the virtual on %s',
    async (outcome) => {
      const getter = vi.fn(() => {
        if (outcome === 'throw') throw new Error('SECRET getter input');
        return undefined;
      });
      const warning = vi.fn();
      const f = await fixture(
        outcome === 'operation'
          ? { operationAccess: { read: false, list: true } }
          : outcome === 'scope'
            ? { baseFilter: { read: () => false } }
            : {},
        {
          modelPermissionPrefix: 'doc:',
          permissionSchema: { account: true, eligible: outcome === 'late-denial' ? 'doc:allowed' : true },
          virtuals: { eligible: { get: getter, dependsOnPopulate: [{ path: 'account', select: 'balance' }] } },
        },
      );
      f.api.setGlobalOptions({ logger: { warn: warning } } as never);
      const failedQuery =
        outcome === 'query'
          ? vi.spyOn(f.Target.collection, 'find').mockImplementation(() => {
              throw new Error('SECRET dependency query');
            })
          : undefined;
      try {
        const source = outcome === 'missing-source' ? f.sources[4] : f.sources[1];
        const result = await executeFixture(f, (req) =>
          req.macl
            .getService(f.Source.modelName)
            .findOne({ _id: source._id }, { select: ['account', 'eligible'] }, quiet),
        );
        expect(result.success).toBe(true);
        if (!result.success) throw new Error(result.code);
        expect(result.data).not.toHaveProperty('eligible');
        if (outcome === 'missing-source' || outcome === 'operation') expect(result.data).not.toHaveProperty('account');
        else expect(result.data.account).toEqual(f.missing);
        expect(getter).toHaveBeenCalledTimes(['undefined', 'throw'].includes(outcome) ? 1 : 0);
        expect(JSON.stringify(warning.mock.calls)).not.toContain('SECRET');
      } finally {
        failedQuery?.mockRestore();
      }
    },
  );

  it('supplies available null/empty inputs but skips both when target read is unavailable', async () => {
    const getter = vi.fn((_doc, _permissions, _context, populated) => populated);
    const f = await fixture(
      {},
      {
        virtuals: {
          eligible: {
            get: getter,
            dependsOnPopulate: [
              { path: 'account', select: 'balance' },
              { path: 'accounts', select: 'credit' },
            ],
          },
        },
      },
    );
    await f.Source.updateOne({ _id: f.sources[3]._id }, { account: null });
    await executeFixture(f, async (req) => {
      const service = req.macl.getService(f.Source.modelName);
      expect(await service.findOne({ _id: f.sources[3]._id }, { select: ['eligible'] }, quiet)).toMatchObject({
        success: true,
        data: { eligible: { account: null, accounts: [] } },
      });
    });
    expect(getter).toHaveBeenCalledTimes(1);
    expect(f.calls).toHaveLength(0);
    f.api.runtime.setModelOption(f.Target.modelName, 'operationAccess.read', false);
    const result = await executeFixture(f, (req) =>
      req.macl.getService(f.Source.modelName).findOne({ _id: f.sources[3]._id }, { select: ['eligible'] }, quiet),
    );
    expect(result).not.toHaveProperty('data.eligible');
    expect(getter).toHaveBeenCalledTimes(1);
    expect(f.calls).toHaveLength(0);
  });

  it('PPR-02 caller base read visibility outranks public related grants on active dependency refs', async () => {
    const getter = vi.fn((_doc, _permissions, _context, populated) => populated.account.balance);
    const f = await fixture(
      { operationAccess: { read: false, list: true } },
      {
        virtuals: { eligible: { get: getter, dependsOnPopulate: [{ path: 'account', select: 'balance' }] } },
      },
    );
    const result = await executeFixture(f, (req) =>
      req.macl.getService(f.Source.modelName).findOne(
        { _id: f.sources[0]._id },
        { select: ['account', 'eligible'], populate: [{ path: 'account', select: 'name -_id' }] },
        {
          ...quiet,
          authorization: { related: { account: { model: f.Target.modelName, operation: { mode: 'grant' } } } },
        },
      ),
    );
    expect(result).toMatchObject({ success: true });
    expect(result).not.toHaveProperty('data.account');
    expect(result).not.toHaveProperty('data.eligible');
    expect(getter).not.toHaveBeenCalled();
    expect(f.calls).toHaveLength(1);
    const denied = await executeFixture(f, (req) =>
      req.macl
        .getService(f.Source.modelName)
        .findOne(
          { _id: f.sources[0]._id },
          { select: ['account', 'eligible'], populate: [{ path: 'account', select: 'name' }] },
          quiet,
        ),
    );
    expect(denied).toMatchObject({ success: true });
    expect(denied).not.toHaveProperty('data.account');
    expect(f.calls).toHaveLength(1);
  });

  it.each(['throw', 'undefined', 'late-denial'])(
    'retains only ordinary populated output after getter %s',
    async (outcome) => {
      const getter = vi.fn(() => {
        if (outcome === 'throw') throw new Error('SECRET getter');
        return undefined;
      });
      const f = await fixture(
        {},
        {
          modelPermissionPrefix: 'doc:',
          permissionSchema: { account: true, eligible: outcome === 'late-denial' ? 'doc:allowed' : true },
          virtuals: { eligible: { get: getter, dependsOnPopulate: [{ path: 'account', select: 'balance' }] } },
        },
      );
      const result = await executeFixture(f, (req) =>
        req.macl
          .getService(f.Source.modelName)
          .findOne(
            { _id: f.sources[0]._id },
            { select: ['account', 'eligible'], populate: [{ path: 'account', select: 'name -_id' }] },
            quiet,
          ),
      );
      expect(result).toMatchObject({ success: true, data: { account: { name: 'a' } } });
      expect(result).not.toHaveProperty('data.account.balance');
      expect(result).not.toHaveProperty('data.eligible');
      expect(getter).toHaveBeenCalledTimes(outcome === 'late-denial' ? 0 : 1);
    },
  );
});

describe.each(['lean', 'hydrated'] as const)('DPV-03 read fallback and presentation (%s)', (hydration) => {
  it('finishes cleanup before decorate/decorateAll/tasks and retains old local-ref dependency semantics', async () => {
    const seen: unknown[] = [];
    const decorate = (doc) => {
      seen.push(isolateDocForOutput(doc));
      return doc;
    };
    const decorateAll = (docs) => {
      seen.push(...docs.map(isolateDocForOutput));
      return docs;
    };
    const local = vi.fn((doc, _permissions, _context, populated) => {
      expect(populated).toEqual({});
      expect(doc.account).toEqual(f.a._id);
      return 'local';
    });
    const f = await fixture(
      {},
      {
        hydration: { publicList: hydration },
        permissionSchema: { account: false, eligible: true, legacy: true },
        virtuals: {
          eligible: {
            get: (_doc, _permissions, _context, populated) => populated.account.balance,
            dependsOnPopulate: [{ path: 'account', select: 'balance' }],
          },
          legacy: { get: local, dependsOn: ['account'] },
        },
        decorate: { list: decorate },
        decorateAll: { list: decorateAll },
      },
    );
    const result = await executeFixture(f, (req) =>
      req.macl.getPublicService(f.Source.modelName)._list(
        { _id: f.sources[0]._id },
        {
          select: ['eligible', 'legacy'],
          tasks: [{ type: 'COPY', args: [{ src: 'account.balance', dest: 'copiedPrivate' }] }],
        },
        quiet,
      ),
    );
    expect(result).toMatchObject({ success: true, data: [{ eligible: 10, legacy: 'local' }] });
    if (!result.success) throw new Error(result.code);
    expect(result.data[0].copiedPrivate).toBeUndefined();
    for (const row of seen) {
      expect(row).toHaveProperty('eligible', 10);
      expect(row).not.toHaveProperty('account');
    }
    expect(seen).toHaveLength(2);
    expect(local).toHaveBeenCalledTimes(1);
  });

  it('read/readFilter fallback retains list access with private read policy and cleans output before presentation', async () => {
    const contexts: string[] = [];
    const getter = vi.fn((_doc, _permissions, context, populated) => {
      contexts.push(
        `${context.operation}:${context.virtualAccess}:${context.outputAccess}:${context.docPermissionsAccess}`,
      );
      return populated.account.balance;
    });
    const decorate = vi.fn((doc) => {
      expect(doc).not.toHaveProperty('account');
      return doc;
    });
    const f = await fixture(
      {},
      {
        hydration: { publicRead: hydration, publicList: hydration },
        baseFilter: { read: () => ({ label: 'not-visible' }) },
        permissionSchema: { label: true, account: false, eligible: { list: true, read: false } },
        virtuals: { eligible: { list: { get: getter, dependsOnPopulate: [{ path: 'account', select: 'balance' }] } } },
        decorate: { list: decorate },
      },
    );
    await executeFixture(f, async (req) => {
      const service = req.macl.getPublicService(f.Source.modelName);
      const args = { select: ['eligible'] };
      expect(await service._read(String(f.sources[0]._id), args, { ...quiet, tryList: true })).toMatchObject({
        success: true,
        data: { eligible: 10 },
      });
      expect(await service._readFilter({ _id: f.sources[0]._id }, args, { ...quiet, tryList: true })).toMatchObject({
        success: true,
        data: { eligible: 10 },
      });
    });
    expect(contexts).toEqual(['read:list:list:list', 'read:list:list:list']);
    expect(decorate).toHaveBeenCalledTimes(2);
    expect(f.calls).toHaveLength(2);
    expect(f.calls.every((call) => !!call.lean === (hydration === 'lean'))).toBe(true);
  });
});

describe('DPV-03 detached mutations and templates', () => {
  it.each(['create', 'update'] as const)('computes %s output with a writable but read-denied ref', async (method) => {
    const getter = vi.fn((doc, _permissions, _context, populated) => {
      expect(doc).not.toHaveProperty('account');
      return populated.account.balance;
    });
    const f = await fixture(
      {},
      {
        permissionSchema: { label: true, account: { create: true, update: true, read: false }, eligible: true },
        virtuals: { eligible: { get: getter, dependsOnPopulate: [{ path: 'account', select: 'balance' }] } },
      },
    );
    const result = await executeFixture(f, async (req) => {
      const service = req.macl.getService(f.Source.modelName);
      const data = { label: 'denied-ref', account: f.a._id };
      return method === 'create'
        ? service.create(data, { select: ['account', 'eligible'] }, quiet)
        : service.updateOne({ _id: f.sources[0]._id }, data, { select: ['account', 'eligible'] }, quiet);
    });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.code);
    const row = result.kind === 'list' ? result.data[0] : result.data;
    expect(row).toHaveProperty('eligible', 10);
    expect(row).not.toHaveProperty('account');
    expect(getter).toHaveBeenCalledTimes(1);
  });

  it('batches bulk create after lifecycle work using post-afterPersist refs and preserves saved documents/snapshots', async () => {
    let afterRef: mongoose.Types.ObjectId;
    const live: mongoose.Document[] = [];
    const modified: string[][] = [];
    const order: string[] = [];
    const afterPersist = vi.fn((doc) => {
      doc.account = afterRef;
      live.push(doc);
      modified.push(doc.modifiedPaths());
      order.push('afterPersist');
      return doc;
    });
    const getter = vi.fn((_doc, _permissions, _context, populated) => {
      order.push('getter');
      return populated.account.balance;
    });
    const f = await fixture(
      {},
      {
        permissionSchema: { label: true, account: true, eligible: { read: true } },
        virtuals: {
          eligible: { create: { get: getter, dependsOnPopulate: [{ path: 'account', select: 'balance' }] } },
        },
        afterPersist: { create: afterPersist },
        validate: {
          create: () => {
            order.push('validate');
            return true;
          },
        },
      },
    );
    afterRef = f.b._id;
    await executeFixture(f, async (req) => {
      const service = req.macl.getService(f.Source.modelName);
      const result = await service.create(
        [
          { label: 'created-a', account: f.a._id },
          { label: 'created-b', account: f.a._id },
        ],
        { select: ['eligible', 'account'], populate: [{ path: 'account', select: 'name -_id' }] },
        quiet,
      );
      expect(result).toMatchObject({
        success: true,
        data: [
          { eligible: 20, account: { name: 'b' } },
          { eligible: 20, account: { name: 'b' } },
        ],
      });
      if (!result.success) throw new Error(result.code);
      for (const [i, context] of result.contexts.entries()) {
        expect(context.finalDocumentSnapshot).toHaveProperty('account', f.b._id);
        expect(context.currentDocument).toBe(live[i]);
        expect(live[i].get('account')).toEqual(f.b._id);
        expect(live[i].populated('account')).toBeUndefined();
        expect(live[i].modifiedPaths()).toEqual(modified[i]);
      }
      expect(result.contexts[0].finalDocumentSnapshot).not.toHaveProperty('eligible');
    });
    expect(order).toEqual(['validate', 'validate', 'afterPersist', 'afterPersist', 'getter', 'getter']);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].lean).toBeFalsy();
    const saved = await f.Source.find({ label: /^created-/ }).lean();
    expect(saved).toHaveLength(2);
    for (const row of saved) {
      expect(row.account).toEqual(f.a._id);
      expect(row).not.toHaveProperty('eligible');
    }
  });

  it.each(['updateOne', 'updateById', 'upsert-update', 'upsert-create'] as const)(
    '%s uses its existing access triple and detached original ref reconstruction',
    async (method) => {
      const observations: string[] = [];
      const live: mongoose.Document[] = [];
      const getter = vi.fn((_doc, _permissions, context, populated) => {
        observations.push(
          `${context.operation}:${context.virtualAccess}:${context.outputAccess}:${context.docPermissionsAccess}`,
        );
        return populated.account.balance;
      });
      const afterPersist = (doc) => {
        live.push(doc);
        return doc;
      };
      const f = await fixture(
        {},
        {
          hydration: { findOne: 'lean' }, // writes still receive hydrated target values
          permissionSchema: { label: true, account: true, eligible: { read: true } },
          virtuals: { eligible: { get: getter, dependsOnPopulate: [{ path: 'account', select: 'balance' }] } },
          afterPersist: { create: afterPersist, update: afterPersist },
        },
      );
      await executeFixture(f, async (req) => {
        const service = req.macl.getService(f.Source.modelName);
        const data = { label: 'write-result', account: f.b._id };
        const args = { select: ['account', 'eligible'] };
        const result =
          method === 'updateOne'
            ? await service.updateOne({ _id: f.sources[0]._id }, data, args, quiet)
            : method === 'updateById'
              ? await service.updateById(String(f.sources[0]._id), data, args, quiet)
              : await service.upsert(
                  method === 'upsert-create' ? { label: 'missing' } : { _id: f.sources[0]._id },
                  data,
                  args,
                  quiet,
                );
        expect(result.success, JSON.stringify(result)).toBe(true);
        if (!result.success) throw new Error(result.code);
        const row = result.kind === 'list' ? result.data[0] : result.data;
        expect(row).toMatchObject({ account: f.b._id, eligible: 20 });
        const context = result.kind === 'list' ? result.contexts[0] : result.context;
        expect(context.finalDocumentSnapshot).toHaveProperty('account', f.b._id);
        expect(context.finalDocumentSnapshot).not.toHaveProperty('eligible');
        expect(context.currentDocument).toBe(live[0]);
        expect(live[0].get('account')).toEqual(f.b._id);
        expect(live[0].populated('account')).toBeUndefined();
        expect(live[0].modifiedPaths()).toEqual([]);
        expect(await f.Source.findById(row._id).lean()).toMatchObject({ account: f.b._id, label: 'write-result' });
      });
      const access = method === 'upsert-create' ? 'create' : 'update';
      expect(observations).toEqual([`${method.startsWith('upsert') ? 'upsert' : 'update'}:${access}:read:${access}`]);
      expect(f.calls).toHaveLength(1);
      expect(f.calls[0].lean).toBeFalsy();
    },
  );

  it.each(['create', 'update', 'upsert-create', 'upsert-update'] as const)(
    'private query failure keeps %s successful without retrying persistence',
    async (method) => {
      const getter = vi.fn(() => true);
      const f = await fixture(
        {},
        {
          permissionSchema: { label: true, account: true, eligible: true },
          virtuals: { eligible: { get: getter, dependsOnPopulate: [{ path: 'account', select: 'balance' }] } },
        },
      );
      const failedQuery = vi.spyOn(f.Target.collection, 'find').mockImplementation(() => {
        throw new Error('private failure');
      });
      const save = vi.spyOn(
        f.Source.collection,
        method === 'create' || method === 'upsert-create' ? 'insertOne' : 'updateOne',
      );
      try {
        const result = await executeFixture(f, async (req) => {
          const service = req.macl.getService(f.Source.modelName);
          const data = { label: 'successful-write', account: f.a._id };
          const args = { select: ['account', 'eligible'] };
          return method === 'create'
            ? service.create(data, args, quiet)
            : method === 'update'
              ? service.updateOne({ _id: f.sources[0]._id }, data, args, quiet)
              : service.upsert(
                  method === 'upsert-create' ? { label: 'missing' } : { _id: f.sources[0]._id },
                  data,
                  args,
                  quiet,
                );
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error(result.code);
        const row = result.kind === 'list' ? result.data[0] : result.data;
        expect(row.account).toEqual(f.a._id);
        expect(row).not.toHaveProperty('eligible');
        expect(await f.Source.findById(row._id).lean()).toHaveProperty('label', 'successful-write');
        expect(save).toHaveBeenCalledTimes(1);
        expect(getter).not.toHaveBeenCalled();
      } finally {
        failedQuery.mockRestore();
        save.mockRestore();
      }
    },
  );

  it.each(['present', 'null', 'absent', 'denied'] as const)(
    'new loads %s default refs under target read, ignores select, and never saves/populates the template',
    async (mode) => {
      const getter = vi.fn((_doc, _permissions, context, populated) => {
        expect([context.operation, context.virtualAccess, context.outputAccess, context.docPermissionsAccess]).toEqual([
          'new',
          'create',
          'create',
          'create',
        ]);
        return populated.account?.balance ?? 'null';
      });
      const f = await fixture(mode === 'denied' ? { operationAccess: { read: false } } : {}, {
        requireExplicitSelect: true,
        permissionSchema: { account: { create: true, read: false }, eligible: { create: true } },
        virtuals: {
          eligible: { create: { get: getter, dependsOnPopulate: [{ path: 'account', select: 'balance' }] } },
        },
      });
      if (mode !== 'absent') f.Source.schema.path('account').default(mode === 'null' ? null : f.a._id);
      const save = vi.spyOn(f.Source.prototype, 'save');
      const result = await executeFixture(f, (req) =>
        req.macl.getService(f.Source.modelName).new({ select: ['-_id', '-eligible'] }, quiet),
      );
      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.code);
      expect(result.data).toHaveProperty('_id');
      if (mode === 'present' || mode === 'null') expect(result.data.eligible).toBe(mode === 'present' ? 10 : 'null');
      else expect(result.data).not.toHaveProperty('eligible');
      if (mode === 'absent' || mode === 'denied') expect(result.data).not.toHaveProperty('account');
      else expect(result.data.account).toEqual(mode === 'null' ? null : f.a._id);
      expect(save).not.toHaveBeenCalled();
      save.mockRestore();
      expect(f.calls).toHaveLength(mode === 'present' ? 1 : 0);
      expect(await f.Source.countDocuments()).toBe(5);
    },
  );

  it.each(['populated', 'empty', 'null'] as const)(
    'new preserves %s default array refs and private null slots',
    async (mode) => {
      const getter = vi.fn((_doc, _permissions, _context, populated) =>
        populated.accounts === null ? null : populated.accounts.map((target) => target?.balance ?? null),
      );
      const f = await fixture(
        {},
        {
          permissionSchema: { accounts: { create: true }, listInput: { create: true } },
          virtuals: {
            listInput: { create: { get: getter, dependsOnPopulate: [{ path: 'accounts', select: 'balance' }] } },
          },
        },
      );
      const original = mode === 'null' ? null : mode === 'empty' ? [] : f.ids;
      f.Source.schema.path('accounts').default(original);
      const result = await executeFixture(f, (req) => req.macl.getService(f.Source.modelName).new({}, quiet));
      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.code);
      expect(result.data.accounts).toEqual(original);
      expect(result.data.listInput).toEqual(
        mode === 'null' ? null : mode === 'empty' ? [] : [10, null, null, 10, 20, null],
      );
      expect(getter).toHaveBeenCalledTimes(1);
      expect(f.calls).toHaveLength(mode === 'populated' ? 1 : 0);
      expect(await f.Source.countDocuments()).toBe(5);
    },
  );
});

describe.each([true, false])('DPV-02 batched raw targets (lean=%s)', (lean) => {
  it('unions rows, paths, embedded scopes and getters once, deduplicating IDs but preserving associations', async () => {
    const f = await fixture();
    const source = await f.Source.find().sort({ label: 1 }).lean(lean);
    const originals = source.map(isolateDocForOutput);
    const plan = f.plan('label eligible credit repeated listInput children.eligible -_id');
    const batch = f.batch(lean);
    const tokens = captureVirtualPopulateRows(batch, source, plan, [f.publicEntry(), f.publicEntry('publicOnly')]);
    await executeVirtualPopulateBatch(batch);
    await executeVirtualPopulateBatch(batch);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].projection).toMatchObject({ name: 1, balance: 1, credit: 1, hookInput: 1, _id: 1 });
    expect(!!f.calls[0].lean).toBe(lean);
    expect(f.base).toHaveBeenCalledTimes(1);
    const i = originals.findIndex((row) => row.label === 'first');
    const row = tokens[i];
    const privateInput = readVirtualPopulateInputs(row, [], 'eligible');
    expect(privateInput).toMatchObject({ available: true, populated: { account: { balance: 10 } } });
    if (!privateInput.available) throw new Error('missing private inputs');
    expect(privateInput.populated.account).not.toHaveProperty('_id');
    expect(privateInput.populated.account).not.toHaveProperty('credit');
    expect(privateInput.populated.account).not.toHaveProperty('name');
    expect(readVirtualPopulateInputs(row, ['children', 1], 'eligible')).toMatchObject({
      populated: { account: { balance: 20 } },
    });
    expect(readVirtualPopulateInputs(row, [], 'repeated')).toMatchObject({ populated: { other: { balance: 20 } } });
    const arrayInput = readVirtualPopulateInputs(row, [], 'listInput');
    if (!arrayInput.available) throw new Error('missing array inputs');
    const accounts = arrayInput.populated.accounts as Array<Record<string, unknown> | null>;
    expect(accounts.map((entry) => entry?.balance ?? null)).toEqual([10, null, null, 10, 20, null]);
    expect(accounts[0]).not.toBe(accounts[3]);
    (accounts[0]!.stamp as Date).setFullYear(2000);
    const bytes = accounts[0]!.bytes as Buffer | mongoose.mongo.Binary;
    (Buffer.isBuffer(bytes) ? bytes : bytes.buffer)[0] = 0;
    (accounts[0]!.decimal as mongoose.Types.Decimal128).bytes[0] = 0;
    (accounts[0]!._id as mongoose.Types.ObjectId).id[0] = 0;
    const again = readVirtualPopulateInputs(row, [], 'listInput');
    expect(again).toMatchObject({
      populated: {
        accounts: [{ stamp: new Date('2025-01-01') }, null, null, { stamp: new Date('2025-01-01') }, {}, null],
      },
    });
    if (!again.available) throw new Error('missing repeated array inputs');
    const copied = (again.populated.accounts as Record<string, unknown>[])[0];
    expect(String(copied._id)).toBe(String(f.a._id));
    expect(String(copied.decimal)).toBe('1.25');
    expect(
      Buffer.from(Buffer.isBuffer(copied.bytes) ? copied.bytes : (copied.bytes as mongoose.mongo.Binary).buffer),
    ).toEqual(Buffer.from('private'));
    const ordinary = readVirtualPopulatePublicRow(row);
    expect(ordinary.account).toMatchObject({ name: 'a', hookInput: 'hook-a' });
    expect(ordinary.account).not.toHaveProperty('balance');
    expect(ordinary).not.toHaveProperty('other');
    expect(ordinary).not.toHaveProperty('accounts');
    expect(getVirtualPopulateRow(ordinary)).toBe(row);
    expect(Reflect.ownKeys(ordinary).some((key) => typeof key === 'symbol')).toBe(false);
    expect(readVirtualPopulateOriginalReference(row, [], 'accounts')?.value).toEqual(f.ids);
    expect(readVirtualPopulateOriginalReference(row, [], 'publicOnly')?.value).toEqual(f.b._id);
    expect(source.map(isolateDocForOutput)).toEqual(originals);
    expect(f.targetPermissions).not.toHaveBeenCalled();
    expect(f.getter).not.toHaveBeenCalled();
    expect(() => captureVirtualPopulateRows(batch, source, plan)).toThrow('closed');
  });

  it('distinguishes absent refs, present undefined, null, empty, missing targets and exact original arrays', async () => {
    const f = await fixture();
    const source = await f.Source.find().lean(lean);
    const plan = f.plan('label eligible listInput');
    const batch = f.batch(lean);
    const tokens = captureVirtualPopulateRows(batch, source, plan);
    await executeVirtualPopulateBatch(batch);
    const byLabel = (label: string) => tokens[source.findIndex((row) => isolateDocForOutput(row).label === label)];
    expect(readVirtualPopulateInputs(byLabel('null'), [], 'eligible')).toEqual({
      available: true,
      populated: { account: null },
    });
    expect(readVirtualPopulateInputs(byLabel('null'), [], 'listInput')).toEqual({
      available: true,
      populated: { accounts: null },
    });
    expect(readVirtualPopulateInputs(byLabel('empty'), [], 'listInput')).toEqual({
      available: true,
      populated: { accounts: [] },
    });
    expect(readVirtualPopulateInputs(byLabel('absent'), [], 'eligible')).toEqual({ available: false });
    expect(readVirtualPopulateOriginalReference(byLabel('absent'), [], 'account')).toEqual({
      present: false,
      value: undefined,
    });
    expect(readVirtualPopulateInputs(byLabel('second'), [], 'eligible')).toEqual({
      available: true,
      populated: { account: null },
    });
    const before = readVirtualPopulateOriginalReference(byLabel('first'), [], 'accounts')!;
    (before.value as unknown[]).reverse();
    expect(readVirtualPopulateOriginalReference(byLabel('first'), [], 'accounts')?.value).toEqual(f.ids);
    expect(readVirtualPopulatePublicRow(byLabel('first'))).not.toHaveProperty('account');
    const emptyBatch = f.batch(lean);
    const [undefinedRef] = captureVirtualPopulateRows(emptyBatch, [{ account: undefined }], f.plan('eligible'));
    await executeVirtualPopulateBatch(emptyBatch);
    expect(readVirtualPopulateInputs(undefinedRef, [], 'eligible')).toEqual({ available: false });
    expect(readVirtualPopulateOriginalReference(undefinedRef, [], 'account')).toEqual({
      present: true,
      value: undefined,
    });
  });

  it('preserves exact originals beside independently matched ordinary arrays and private null slots', async () => {
    const f = await fixture();
    const source = await f.Source.findById(f.sources[0]._id).lean(lean);
    const batch = f.batch(lean);
    const [row] = captureVirtualPopulateRows(batch, [source], f.plan('accounts listInput'), [
      f.publicEntry('accounts', 'name', { tenant: 'a', name: 'a' }),
    ]);
    await executeVirtualPopulateBatch(batch);
    expect(f.calls).toHaveLength(2);
    expect((readVirtualPopulatePublicRow(row).accounts as { name: string }[]).map((target) => target.name)).toEqual([
      'a',
      'a',
    ]);
    expect(readVirtualPopulateOriginalReference(row, [], 'accounts')?.value).toEqual(f.ids);
    const input = readVirtualPopulateInputs(row, [], 'listInput');
    if (!input.available) throw new Error('missing private array');
    expect(
      (input.populated.accounts as ({ balance: number } | null)[]).map((target) => target?.balance ?? null),
    ).toEqual([10, null, null, 10, 20, null]);
  });
});

describe('DPV-02 fetch scopes and failures', () => {
  it.each(['match', 'list', 'row-grant'])(
    'separates public %s from independent request read semantics',
    async (dimension) => {
      const f = await fixture();
      const plan = f.plan('account eligible');
      const entry = f.publicEntry(
        'account',
        'name',
        dimension === 'match' ? { tenant: 'a', name: 'no-match' } : { tenant: 'a' },
        dimension === 'list' ? 'list' : 'read',
        dimension !== 'row-grant',
      );
      const batch = f.batch();
      const [row] = captureVirtualPopulateRows(batch, [f.sources[0]], plan, [entry]);
      await executeVirtualPopulateBatch(batch);
      expect(f.calls).toHaveLength(2);
      expect(readVirtualPopulateInputs(row, [], 'eligible')).toMatchObject({ populated: { account: { balance: 10 } } });
      if (dimension === 'match') expect(readVirtualPopulatePublicRow(row).account).toBeNull();
      else expect(readVirtualPopulatePublicRow(row).account).toMatchObject({ name: 'a' });
    },
  );

  it.each(['operation', 'base', 'transform'])(
    'queries nothing for terminal false %s, even for null/empty refs',
    async (gate) => {
      const f = await fixture(
        gate === 'operation'
          ? { operationAccess: { list: true, read: false } }
          : gate === 'base'
            ? { baseFilter: { read: () => false } }
            : { overrideFilter: { read: () => false } },
      );
      const batch = f.batch();
      const tokens = captureVirtualPopulateRows(
        batch,
        [{ account: null, accounts: [] }, f.sources[0]],
        f.plan('eligible listInput'),
      );
      await executeVirtualPopulateBatch(batch);
      expect(f.calls).toHaveLength(0);
      for (const row of tokens) expect(readVirtualPopulateInputs(row, [], 'eligible')).toEqual({ available: false });
    },
  );

  it('retains mandatory IDs after a transform and request tenant scope without permission hooks or target virtual recursion', async () => {
    const transform = vi.fn(function (this: unknown, filter, permissions) {
      expect(this).toHaveProperty('actor', 'original');
      expect(filter).toBeNull(); // existing normalizeFilter({}) convention
      expect(permissions.has('admin')).toBe(false);
      return { _id: { $in: [] } };
    });
    const f = await fixture({
      overrideFilter: { read: transform },
      virtuals: {
        recurse: () => {
          throw new Error('terminal');
        },
      },
    });
    const batch = f.batch();
    const [row] = captureVirtualPopulateRows(batch, [f.sources[0]], f.plan('eligible'));
    await executeVirtualPopulateBatch(batch);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].filter).toMatchObject({ $and: expect.any(Array) });
    expect(readVirtualPopulateInputs(row, [], 'eligible')).toEqual({ available: true, populated: { account: null } });
    expect(f.targetPermissions).not.toHaveBeenCalled();
    expect(transform).toHaveBeenCalledTimes(1);
  });

  it.each(['query', 'hook'])('omits dependency-only %s failures and logs fixed structural data', async (failure) => {
    const f = await fixture(
      failure === 'hook'
        ? {
            baseFilter: {
              read: () => {
                throw new Error('SECRET scope');
              },
            },
          }
        : {},
    );
    const warning = vi.fn();
    f.api.setGlobalOptions({ logger: { warn: warning } } as never);
    const spy =
      failure === 'query'
        ? vi.spyOn(f.Target.collection, 'find').mockImplementation(() => {
            throw new Error('SECRET query');
          })
        : undefined;
    try {
      const batch = f.batch();
      const [row] = captureVirtualPopulateRows(batch, [f.sources[0]], f.plan('eligible'));
      await runWithRuntime(f.api.runtime, () => executeVirtualPopulateBatch(batch));
      expect(readVirtualPopulateInputs(row, [], 'eligible')).toEqual({ available: false });
      expect(warning).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(warning.mock.calls)).not.toContain('SECRET');
      expect(warning.mock.calls[0][1]).toEqual({
        modelName: f.Target.modelName,
        category: failure === 'hook' ? 'policy' : 'query',
      });
    } finally {
      spy?.mockRestore();
    }
  });

  it('propagates an actual shared-public query failure', async () => {
    const f = await fixture();
    const spy = vi.spyOn(f.Target.collection, 'find').mockImplementation(() => {
      throw new Error('public fetch failed');
    });
    try {
      const batch = f.batch();
      captureVirtualPopulateRows(batch, [f.sources[0]], f.plan('account eligible'), [f.publicEntry()]);
      await expect(executeVirtualPopulateBatch(batch)).rejects.toThrow('public fetch failed');
    } finally {
      spy.mockRestore();
    }
  });

  it('owns source declarations and target policies across an await; a new operation observes replacement', async () => {
    let release!: () => void, entered!: () => void;
    const waiting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const pause = new Promise<void>((resolve) => {
      release = resolve;
    });
    const f = await fixture({
      overrideFilter: {
        read: async () => {
          entered();
          await pause;
          return {};
        },
      },
    });
    const batch = f.batch();
    const [row] = captureVirtualPopulateRows(batch, [f.sources[0]], f.plan('eligible'));
    const pending = executeVirtualPopulateBatch(batch);
    await waiting;
    f.api.runtime.setModelOption(f.Target.modelName, 'operationAccess.read', false);
    f.api.runtime.setModelOption(f.Target.modelName, 'baseFilter.read', () => ({ tenant: 'b' }));
    f.api.runtime.setModelOption(f.Source.modelName, 'virtuals.eligible.dependsOnPopulate', [
      { path: 'account', select: 'credit' },
    ]);
    release();
    await pending;
    expect(readVirtualPopulateInputs(row, [], 'eligible')).toMatchObject({ populated: { account: { balance: 10 } } });
    const next = f.batch();
    const [nextRow] = captureVirtualPopulateRows(next, [f.sources[0]], f.plan('eligible'));
    await executeVirtualPopulateBatch(next);
    expect(readVirtualPopulateInputs(nextRow, [], 'eligible')).toEqual({ available: false });
    expect(f.calls).toHaveLength(1);
  });

  it('compares BSON types and literal key order conservatively and resolves embedded masks without collisions', () => {
    const id = new mongoose.Types.ObjectId();
    expect(
      equivalentVirtualPopulatePredicate(
        { _id: id, at: new Date(1) },
        { _id: new mongoose.Types.ObjectId(String(id)), at: new Date(1) },
      ),
    ).toBe(true);
    expect(equivalentVirtualPopulatePredicate({ literal: { a: 1, b: 2 } }, { literal: { b: 2, a: 1 } })).toBe(false);
    expect(equivalentVirtualPopulatePredicate({ _id: id }, { _id: String(id) })).toBe(false);
    expect(equivalentVirtualPopulatePredicate({ pattern: /a/i }, { pattern: /a/ })).toBe(false);
    expect(
      projectVirtualPopulateView(
        { entries: [{ value: 0, secret: 'hidden' }, null, {}], profile: { city: '', secret: 'hidden' } },
        ['entries.value', 'profile.city'],
      ),
    ).toEqual({ entries: [{ value: 0 }, null, {}], profile: { city: '' } });
  });

  it.each([undefined, '', [], {}, 'name -_id', { 'profile.city': 1, _id: -1 }, '-profile.secret -entries.secret'] as (
    | Projection
    | undefined
  )[])(
    'unions normalized ordinary selection %j without altering its masks or mixing projection tokens',
    async (selection) => {
      const f = await fixture({
        permissionSchema: {
          name: true,
          profile: { read: true, sub: { city: true, secret: false } },
          entries: { read: true, sub: { value: true, secret: false } },
        },
      });
      // Omitted is intentionally passed through; target defaults do not replace a public explicit mask.
      const entry = f.publicEntry('account', selection);
      const batch = f.batch();
      const plan = f.plan('account eligible');
      const originalOutput = [...plan.outputSelection];
      const [row] = captureVirtualPopulateRows(batch, [f.sources[0]], plan, [entry]);
      await executeVirtualPopulateBatch(batch);
      expect(f.calls).toHaveLength(1);
      const projection = f.calls[0].projection as Record<string, number>;
      expect(projection.balance).toBe(1);
      expect(Object.values(projection).every((value) => value === 1)).toBe(true);
      const paths = Object.keys(projection);
      expect(paths.some((path) => paths.some((other) => other !== path && path.startsWith(`${other}.`)))).toBe(false);
      expect(plan.outputSelection).toEqual(originalOutput);
      const ordinary = readVirtualPopulatePublicRow(row).account;
      expect(ordinary).not.toHaveProperty('balance');
      expect(ordinary).not.toHaveProperty('profile.secret');
      expect(readVirtualPopulateInputs(row, [], 'eligible')).toMatchObject({ populated: { account: { balance: 10 } } });
    },
  );

  it('transports ordinary target auto refs to a subsequent collected stage without using a parent private union', async () => {
    const f = await fixture();
    f.Target.schema.add({ back: { type: mongoose.Schema.Types.ObjectId, ref: f.Source.modelName } });
    f.api.runtime.setModelOptions(f.Target.modelName, {
      permissionSchema: { name: true, badge: true },
      virtuals: { badge: { get: () => true, dependsOnPopulate: [{ path: 'back', select: 'label' }] } },
    } as never);
    await f.Target.updateOne({ _id: f.a._id }, { back: f.sources[0]._id });
    const batch = f.batch();
    const [row] = captureVirtualPopulateRows(batch, [f.sources[0]], f.plan('account eligible'), [
      f.publicEntry('account', 'name badge'),
    ]);
    await executeVirtualPopulateBatch(batch);
    const [target] = readVirtualPopulatePublicTargets(row);
    expect(target.address).toEqual(['account']);
    expect(target.input).toHaveProperty('back', f.sources[0]._id);
    expect(target.input).not.toHaveProperty('balance');
    expect(readVirtualPopulatePublicRow(row).account).not.toHaveProperty('back');
    const next = f.batch();
    const [targetRow] = captureVirtualPopulateRows(next, [target.input], target.plan);
    await executeVirtualPopulateBatch(next);
    expect(readVirtualPopulateInputs(targetRow, [], 'badge')).toMatchObject({
      populated: { back: { label: 'first' } },
    });
    expect(readVirtualPopulatePublicRow(targetRow)).not.toHaveProperty('back');
    expect(getVirtualPopulatePublicIdentity(readVirtualPopulatePublicRow(targetRow))).toBe(
      getVirtualPopulatePublicIdentity(readVirtualPopulatePublicRow(row).account as object),
    );
  });

  it('does no dependency I/O for excluded, inapplicable and known-denied getters; deferred output can still receive later grants', async () => {
    for (const variant of ['excluded', 'inapplicable', 'denied', 'deferred']) {
      const rule = variant === 'denied' ? false : variant === 'deferred' ? 'doc:allowed' : true;
      const f = await fixture(
        {},
        {
          modelPermissionPrefix: 'doc:',
          permissionSchema: { eligible: rule },
          docPermissions: { read: () => ({ allowed: true }) },
          ...(variant === 'inapplicable' ? { virtuals: { eligible: { update: () => true } } } : {}),
        },
      );
      const batch = f.batch();
      const plan = f.plan(variant === 'excluded' ? '_id -eligible' : 'eligible');
      const [row] = captureVirtualPopulateRows(batch, [f.sources[0]], plan);
      await executeVirtualPopulateBatch(batch);
      expect(f.calls).toHaveLength(variant === 'deferred' ? 1 : 0);
      if (variant === 'deferred') {
        expect(plan.candidates[0].authState).toBe('deferred');
        const { finalizeModelOutput } = await import('../src/output/finalize-model-output');
        const result = await finalizeModelOutput({
          receivingModelName: f.Source.modelName,
          input: readVirtualPopulatePublicRow(row),
          plan,
          snapshot: {} as FinalizeSnapshot,
          request: f.req,
          virtualAccess: 'read',
          outputAccess: 'read',
          docPermissionsAccess: 'read',
        });
        expect(result.eligible).toBe(true);
      }
    }
  });
});

describe.each([true, false])('DPV-02 service raw-result seam (lean=%s)', (lean) => {
  it('retains an ordinary target auto ref ahead of source/target snapshots even without parent dependencies', async () => {
    const f = await fixture({}, { hydration: { findOne: lean ? 'lean' : 'hydrated' } });
    f.Target.schema.add({ back: { type: mongoose.Schema.Types.ObjectId, ref: f.Source.modelName } });
    f.api.runtime.setModelOptions(f.Target.modelName, {
      permissionSchema: { name: true, badge: true },
      virtuals: { badge: { get: () => true, dependsOnPopulate: [{ path: 'back', select: 'label' }] } },
    } as never);
    await f.Target.updateOne({ _id: f.a._id }, { back: f.sources[0]._id });
    const app = express();
    app.use(express.json());
    let result: any, failure: unknown;
    f.router.router.post('/target-probe', async (req, res) => {
      try {
        result = await (req as unknown as ModelRequest).macl
          .getService(f.Source.modelName)
          .findOne(
            { _id: f.sources[0]._id },
            { select: ['account'], populate: [{ path: 'account', select: 'name badge' }] },
            quiet,
          );
      } catch (error) {
        failure = error;
      }
      res.json({ ok: true });
    });
    app.use(f.router.routes);
    await request(app).post(`${f.basePath}/target-probe`).send({}).expect(200);
    if (failure) throw failure;
    expect(result.success).toBe(true);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].projection).toMatchObject({ back: 1 });
    expect(result.data.account).not.toHaveProperty('back');
    expect(f.getter).not.toHaveBeenCalled();
    const sourceHook = f.sourcePermissions.mock.calls[0] as unknown[];
    const targetHook = f.targetPermissions.mock.calls[0] as unknown[];
    expect(sourceHook[0]).not.toHaveProperty('account.back');
    expect(sourceHook[2]).not.toHaveProperty('originalDocumentSnapshot.account.back');
    expect(targetHook[0]).not.toHaveProperty('back');
  });

  it.each(['findOne', 'find'] as const)(
    '%s shares public/private raw work before snapshots and public permission hooks',
    async (method) => {
      const f = await fixture(
        {},
        { hydration: { find: lean ? 'lean' : 'hydrated', findOne: lean ? 'lean' : 'hydrated' } },
      );
      const duplicate =
        method === 'find'
          ? await f.Source.create({ label: 'again', account: f.a._id, publicOnly: f.b._id, other: f.b._id })
          : undefined;
      const parentFind = vi.spyOn(f.Source.collection, method === 'find' ? 'find' : 'findOne');
      const app = express();
      app.use(express.json());
      let result: any, failure: unknown;
      f.router.router.post('/probe', async (req, res) => {
        try {
          result = await (req as unknown as ModelRequest).macl.getService(f.Source.modelName)[method](
            { _id: duplicate ? { $in: [f.sources[0]._id, duplicate._id] } : f.sources[0]._id },
            {
              select: ['label', 'account', 'publicOnly', 'eligible', 'repeated'],
              populate: [
                { path: 'account', select: 'name -_id' },
                { path: 'publicOnly', select: 'name -_id' },
              ],
            },
            quiet,
          );
        } catch (error) {
          failure = error;
        }
        res.json({ ok: true });
      });
      app.use(f.router.routes);
      try {
        await request(app).post(`${f.basePath}/probe`).send({}).expect(200);
        if (failure) throw failure;
        expect(result.success).toBe(true);
        const data = method === 'find' ? result.data[0] : result.data;
        expect(data.account).toEqual({ name: 'a' });
        expect(data.publicOnly).toEqual({ name: 'b' });
        expect(data).not.toHaveProperty('other');
        expect(parentFind).toHaveBeenCalledTimes(1);
        expect(f.calls).toHaveLength(1);
        expect(f.calls[0].projection).toMatchObject({ balance: 1, name: 1, hookInput: 1, _id: 1 });
        expect(f.sourcePermissions).toHaveBeenCalledTimes(duplicate ? 2 : 1);
        expect(f.targetPermissions).toHaveBeenCalledTimes(2);
        const sourceHook = f.sourcePermissions.mock.calls[0] as unknown[];
        const targetHook = f.targetPermissions.mock.calls[0] as unknown[];
        expect(sourceHook[0]).not.toHaveProperty('other');
        expect(sourceHook[0]).toHaveProperty('account.name', 'a');
        expect(sourceHook[0]).not.toHaveProperty('account.balance');
        expect(targetHook[0]).not.toHaveProperty('balance');
        expect(targetHook[0]).toHaveProperty('hookInput', 'hook-a');
        expect(JSON.stringify(result)).not.toContain('private');
        const persisted = await f.Source.findById(f.sources[0]._id).lean();
        expect(persisted!.account).toEqual(f.a._id);
      } finally {
        parentFind.mockRestore();
      }
    },
  );
});
