import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../src/index';
import type { ModelRequest } from '../src/interfaces';
import { unsafeSnapshotOptions } from '../src/acl/unsafe-snapshot-options';
import { readDocumentAuthorization, readDocumentAuthorizationAccess } from '../src/acl/document-authorization';
import { readAuthorizationFastPath } from '../src/acl/service-authorization';
import { getServiceExecutors } from '../src/acl/service-execution';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();
const quiet = { includePermissions: false, includeFieldPermissions: false, includeCount: false };
const originalOn = Object.fromEntries(unsafeSnapshotOptions.map((key) => [key, true]));
const active = { ...originalOn, unsafeUseListAuthorizationFastPath: true, unsafeUseReadAuthorizationFastPath: true };
let serial = 0;

async function fixture(hydrated = false, metadata = false, enabled = true) {
  const api = createAccessRuntime(),
    n = ++serial;
  api.setGlobalOptions({
    globalPermissions: () => ['reader'],
    logger: { warn: vi.fn() },
    requestComplexity: { maxHookConcurrency: 2, maxBulkConcurrency: 2, maxDepth: 16 },
  });
  const Target = mongoose.model(
    `FastRuntimeHttpTarget${n}`,
    new mongoose.Schema(
      {
        name: String,
        secret: String,
        group: String,
        tenant: String,
        owner: Boolean,
        balance: { type: Number, select: false },
      },
      { versionKey: false },
    ),
  );
  const Source = mongoose.model(
    `FastRuntimeHttpSource${n}`,
    new mongoose.Schema(
      {
        name: String,
        conditional: String,
        hidden: String,
        owner: Boolean,
        group: String,
        tenant: String,
        ref: { type: mongoose.Schema.Types.ObjectId, ref: Target.modelName },
        children: [new mongoose.Schema({ label: String, hidden: String }, { _id: false })],
        meta: { permissions: mongoose.Schema.Types.Mixed },
      },
      { versionKey: false },
    ),
  );
  const actors: unknown[] = [],
    order: string[] = [];
  const sourceHook = vi.fn(function (this: ModelRequest, doc: Record<string, any>) {
    actors.push(this);
    order.push(`source:${doc.name}`);
    expect(doc.ref?.balance).toBeUndefined();
    return { owner: doc.owner === true };
  });
  const targetHook = vi.fn(function (this: ModelRequest, doc: Record<string, any>) {
    actors.push(this);
    order.push(`target:${doc.name}`);
    expect(doc.balance).toBeUndefined();
    return { owner: doc.owner === true };
  });
  const targetGetter = vi.fn((doc: Record<string, any>) => {
    order.push(`target-get:${doc.name}`);
    return `target:${doc.name}`;
  });
  const sourceGetter = vi.fn((doc: Record<string, any>, _p, context) => {
    order.push(`source-get:${doc.name}`);
    expect(doc.ref?.balance).toBeUndefined();
    expect(doc.ref?.hidden).toBeUndefined();
    expect(doc.children.every((child: object) => !('hidden' in child))).toBe(true);
    expect(context.docPermissions.owner).toBe(doc.owner === true);
    return `${doc.name}:${doc.ref?.name ?? 'id'}`;
  });
  const privateFirst = vi.fn((_doc, _p, _context, populated) => {
    const value = populated.ref.balance;
    populated.ref.balance = -1;
    return value;
  });
  const privateSecond = vi.fn((_doc, _p, _context, populated) => populated.ref.balance);
  api.createRouter(Target, {
    operationAccess: { list: true, read: true, count: true },
    baseFilter: {
      list: () => ({ tenant: 'allowed' }),
      read: () => ({ tenant: 'allowed' }),
      count: () => ({ tenant: 'allowed' }),
    },
    permissionSchema: { name: true, secret: 'doc:owner', balance: false, targetView: true },
    modelPermissionPrefix: 'doc:',
    alwaysSelectFields: ['owner'],
    docPermissions: { list: targetHook, read: targetHook },
    virtuals: { targetView: { dependsOn: ['name'], get: targetGetter } },
    stripPermissionsField: true,
    // Opposite/dormant live target flags do NOT select the inherited origin's mode.
    ...Object.fromEntries(unsafeSnapshotOptions.map((key) => [key, false])),
    unsafeUseListAuthorizationFastPath: true,
    unsafeUseReadAuthorizationFastPath: true,
  });
  const router = api.createRouter(Source, {
    basePath: `/fast-runtime-${n}`,
    operationAccess: { read: true, list: true },
    baseFilter: { read: () => ({ tenant: 'allowed' }), list: () => ({ tenant: 'allowed' }) },
    modelPermissionPrefix: 'doc:',
    alwaysSelectFields: ['owner'],
    docPermissions: { list: sourceHook, read: sourceHook },
    permissionSchema: {
      name: true,
      conditional: 'doc:owner',
      hidden: false,
      ref: true,
      view: true,
      first: true,
      second: true,
      children: { list: true, read: true, sub: { label: 'doc:owner', hidden: false } },
    },
    virtuals: {
      view: { dependsOn: ['name', 'ref', 'children', 'owner'], get: sourceGetter },
      first: { dependsOnPopulate: [{ path: 'ref', select: ['balance', '-_id'] }], get: privateFirst },
      second: { dependsOnPopulate: [{ path: 'ref', select: ['balance', '-_id'] }], get: privateSecond },
      children: { sub: {} },
    },
    hydration: {
      find: hydrated ? 'hydrated' : 'lean',
      findOne: hydrated ? 'hydrated' : 'lean',
      publicList: hydrated ? 'hydrated' : 'lean',
      publicRead: hydrated ? 'hydrated' : 'lean',
    },
    stripPermissionsField: !metadata,
    documentPermissionField: 'meta.permissions',
    exposedDocPermissionKeys: ['owner'],
    ...(enabled ? active : originalOn),
  });
  const targetRows = await Target.create([
    { name: 'owned', secret: 'allowed', group: 'g', tenant: 'allowed', owner: true, balance: 42 },
    { name: 'unowned', secret: 'never', group: 'g', tenant: 'allowed', owner: false, balance: 24 },
    { name: 'outside', secret: 'never', group: 'g', tenant: 'outside', owner: true, balance: 99 },
  ]);
  const sources = await Source.create(
    [false, true].map((owner, index) => ({
      name: `root:${index}`,
      conditional: `conditional:${index}`,
      hidden: 'never',
      owner,
      group: 'g',
      tenant: 'allowed',
      ref: targetRows[index]._id,
      children: [{ label: 'label', hidden: 'never' }],
      meta: { permissions: { owner: !owner } },
    })),
  );
  const root = api.createRouter({ basePath: `/fast-runtime-root-${n}`, operationAccess: true });
  const app = express().use(express.json()).use(router.routes).use(root.routes);
  let run!: (req: ModelRequest) => Promise<unknown>, value: unknown, failure: unknown;
  router.router.post('/probe', async (req, res) => {
    try {
      value = await run(req as unknown as ModelRequest);
    } catch (error) {
      failure = error;
    }
    res.json({ ok: true });
  });
  const execute = async <T>(callback: (req: ModelRequest) => Promise<T>): Promise<T> => {
    failure = undefined;
    run = callback;
    await request(app).post(`/fast-runtime-${n}/probe`).send({}).expect(200);
    if (failure) throw failure;
    return value as T;
  };
  const args = {
    select: ['name', 'conditional', 'children', 'ref', 'view', '-_id'],
    sort: 'name',
    populate: [{ path: 'ref', access: 'read' as const, select: ['name', 'secret', 'targetView', '-_id'] }],
  };
  const include = {
    model: Target.modelName,
    op: 'list' as const,
    path: 'meta.items',
    localField: 'group',
    foreignField: 'group',
    // Target.create saves these rows concurrently, so natural insertion order is
    // not an ordering contract for this include or its issued-member assertions.
    args: { select: ['name', 'secret', 'targetView', '-_id'], sort: 'name' },
  };
  return {
    api,
    Source,
    Target,
    sources,
    targetRows,
    router,
    root,
    app,
    execute,
    args,
    include,
    sourceHook,
    targetHook,
    sourceGetter,
    targetGetter,
    privateFirst,
    privateSecond,
    order,
    actors,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^FastRuntimeHttp/);
});

describe('active real query assembly, targets, getters and private inputs', () => {
  it('keeps READ metadata request-only even when backend output grants allow a denied document field', async () => {
    for (const enabled of [false, true]) {
      const f = await fixture(false, true, enabled);
      await f.execute(async (req) => {
        const result = await req.macl.getService(f.Source.modelName).find({}, f.args, {
          ...quiet,
          includeFieldPermissions: true,
          authorization: { outputFields: { mode: 'grant', paths: ['conditional'] } },
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error(result.code);
        const [first, second] = result.data as any[];
        expect(first.conditional).toBe('conditional:0');
        expect(first.meta.permissions._view.name).toBe(true);
        expect(first.meta.permissions._view).not.toHaveProperty('conditional');
        expect(second.meta.permissions._view.conditional).toBe(true);
        expect(f.sourceHook).toHaveBeenCalledTimes(2);
      });
    }
  });

  it.each([false, true])(
    'retains target-own gates/grants, metadata/dotted includes and builder-known membership; hydrated=%s',
    async (hydrated) => {
      const f = await fixture(hydrated, true);
      await f.execute(async (req) => {
        const service = req.macl.getService(f.Source.modelName),
          target = req.macl.getService(f.Target.modelName);
        const result = await service.find(
          {},
          { ...f.args, include: [f.include] },
          { ...quiet, includePermissions: true },
        );
        expect(result.success).toBe(true);
        if (!result.success) throw new Error(result.code);
        const [a, b] = result.data as any[],
          [ca, cb] = result.contexts;
        expect(a).toMatchObject({
          name: 'root:0',
          children: [{}],
          ref: { name: 'owned', secret: 'allowed', targetView: 'target:owned' },
          view: 'root:0:owned',
          meta: { permissions: { owner: false }, items: [{ name: 'owned', secret: 'allowed' }, { name: 'unowned' }] },
        });
        expect(a).not.toHaveProperty('conditional');
        expect(b).toHaveProperty('conditional', 'conditional:1');
        expect(b.children).toEqual([{ label: 'label' }]);
        expect(b.ref).toEqual({ name: 'unowned', targetView: 'target:unowned' });
        expect(JSON.stringify(result.data)).not.toContain('never');
        expect(JSON.stringify(result.data)).not.toContain('outside');
        expect(ca.getDocumentAuthorization(a.ref)).toBeDefined();
        expect(ca.getDocumentAuthorization(b.ref)).toBeUndefined();
        expect(ca.getDocumentAuthorization(a.meta.items[0])).toBe(cb.getDocumentAuthorization(b.meta.items[0]));
        expect(a.meta.items[0]).toBe(b.meta.items[0]);
        expect(a.permissions).toBe(a.meta.permissions);
        const issued = a.ref,
          issuedHandle = ca.getDocumentAuthorization(issued)!;
        const targetBinding = getServiceExecutors(target).binding();
        const state = readDocumentAuthorization(issuedHandle, targetBinding);
        expect(state.sourceState).toBe('trusted');
        expect(readAuthorizationFastPath(state.authorization, targetBinding)?.mode).toBe('active');
        a.ref = { _id: f.targetRows[1]._id, name: 'forged', secret: 'forged' };
        expect(ca.getDocumentAuthorization(a.ref)).toBeUndefined();
        expect(ca.getDocumentAuthorization(issued)).toBe(issuedHandle);
        const picked = (await service.pickAllowedFields(a, 'list', {
          documentAuthorization: ca.documentAuthorization,
        })) as any;
        expect(String(picked.ref)).toBe(String(f.targetRows[1]._id));
        expect(picked.ref).not.toHaveProperty('secret');
        expect(f.sourceHook).toHaveBeenCalledTimes(2);
        expect(f.targetHook).toHaveBeenCalledTimes(4);
        expect(f.actors.every((actor) => actor === req)).toBe(true);
        for (const name of ['root:0', 'root:1'])
          expect(f.order.indexOf(`source:${name}`)).toBeGreaterThan(f.order.indexOf('target-get:owned'));
      });
    },
  );

  it.each([false, true])(
    'shares only an actual fetched populate target, including one hydrated conversion; hydrated=%s',
    async (hydrated) => {
      const f = await fixture(hydrated);
      await f.Source.updateMany({}, { ref: f.targetRows[0]._id });
      await f.execute(async (req) => {
        const result = await req.macl.getService(f.Source.modelName).find({}, f.args, quiet);
        expect(result.success).toBe(true);
        if (!result.success) throw new Error(result.code);
        const [a, b] = result.data as any[];
        expect(a.ref).toBe(b.ref);
        expect(result.contexts[0].getDocumentAuthorization(a.ref)).toBe(
          result.contexts[1].getDocumentAuthorization(b.ref),
        );
        expect(f.targetHook).toHaveBeenCalledTimes(1);
        expect(f.targetGetter).toHaveBeenCalledTimes(1);
        expect(f.sourceHook).toHaveBeenCalledTimes(2);
      });
    },
  );

  it('keeps private argument-four admission/isolation, public masks and child-before-parent views', async () => {
    const f = await fixture();
    await f.execute(async (req) => {
      const service = req.macl.getService(f.Source.modelName);
      const result = await service.find({}, { ...f.args, select: [...f.args.select, 'first', 'second'] }, quiet);
      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.code);
      expect((result.data as any[]).map((row) => [row.first, row.second])).toEqual([
        [42, 42],
        [24, 24],
      ]);
      for (const row of result.data as any[]) expect(row.ref).not.toHaveProperty('balance');
      expect(f.privateFirst).toHaveBeenCalledTimes(2);
      expect(f.privateSecond).toHaveBeenCalledTimes(2);
      expect(f.sourceHook).toHaveBeenCalledTimes(2);
      expect(f.targetHook).toHaveBeenCalledTimes(2);
      f.api.setModelOptions(f.Target.modelName, {
        operationAccess: { read: false },
        requireOperationAccessForPopulateQueries: false,
      });
      const unavailable = await service.find({}, { ...f.args, select: [...f.args.select, 'first', 'second'] }, quiet);
      expect(unavailable.success).toBe(true);
      if (!unavailable.success) throw new Error(unavailable.code);
      for (const row of unavailable.data as any[]) {
        expect(row).not.toHaveProperty('first');
        expect(row).not.toHaveProperty('second');
        expect(row.ref).not.toHaveProperty('balance');
      }
      expect(f.privateFirst).toHaveBeenCalledTimes(2);
      expect(f.privateSecond).toHaveBeenCalledTimes(2);
    });
  });

  it('keeps legacy/correlated include source collisions separate from grants and preserves order/count semantics', async () => {
    const f = await fixture(false, true);
    await f.execute(async (req) => {
      const service = req.macl.getService(f.Source.modelName);
      for (const correlated of [false, true]) {
        const { localField: _local, foreignField: _foreign, ...common } = f.include;
        const include = correlated
          ? { ...common, path: 'owner', mode: 'correlated', filter: { group: { $parent: 'group' } } }
          : { ...f.include, path: 'owner' };
        const result = await service.find(
          {},
          {
            ...f.args,
            include: [
              include,
              { model: f.Target.modelName, op: 'count', path: 'count', localField: 'group', foreignField: 'group' },
            ],
          } as never,
          { ...quiet, includePermissions: true },
        );
        expect(result.success, JSON.stringify(result)).toBe(true);
        if (!result.success) throw new Error(result.code);
        const [a, b] = result.data as any[];
        expect(a.owner).toHaveLength(2);
        expect(a.meta.permissions.owner).toBe(false);
        expect(a).not.toHaveProperty('conditional');
        expect(b).toHaveProperty('conditional', 'conditional:1');
        expect(a.count).toBe(2);
        expect(b.count).toBe(2);
        expect(a.view).toBe('root:0:owned');
        expect(b.view).toBe('root:1:unowned');
      }
    });
  });

  it('matches current all-eight ON ordinary READ/LIST/root output while retaining actual active handles', async () => {
    for (const enabled of [false, true]) {
      const f = await fixture(false, false, enabled);
      await f.execute(async (req) => {
        const service = req.macl.getService(f.Source.modelName);
        for (const origin of ['list', 'read'] as const) {
          const result =
            origin === 'list'
              ? await service.find({}, f.args, quiet)
              : await service.findOne({ _id: f.sources[0]._id }, f.args, quiet);
          expect(result.success).toBe(true);
          if (!result.success) throw new Error(result.code);
          const row = (origin === 'list' ? (result.data as any[])[0] : result.data) as any;
          expect(row).toEqual({
            name: 'root:0',
            children: [{}],
            ref: { name: 'owned', secret: 'allowed', targetView: 'target:owned' },
            view: 'root:0:owned',
          });
          const context = 'contexts' in result ? result.contexts[0] : result.context,
            binding = getServiceExecutors(service).binding();
          const state = readDocumentAuthorizationAccess(context.documentAuthorization, binding);
          expect(state.sourceState).toBe(enabled ? 'trusted' : 'copied');
          expect(readAuthorizationFastPath(state.authorization, binding)?.mode).toBe(enabled ? 'active' : 'off');
        }
      });
      const response = await request(f.app)
        .post(`/fast-runtime-root-${serial}`)
        .send([{ target: 'model', name: f.Source.modelName, op: 'list', args: f.args, options: quiet }])
        .expect(200);
      expect(response.body[0].statusCode).toBe(200);
      expect(response.body[0].result.data.map((row: any) => row.name)).toEqual(['root:0', 'root:1']);
      expect(JSON.stringify(response.body)).not.toContain('never');
    }
  });
});
