import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { get } from '@web-ts-toolkit/utils';

import { createAccessRuntime, permissionsPlugin } from '../dist/index.mjs';
import type { ModelRequest, ServiceOutputContext } from '../src/interfaces';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

type Row = Record<string, any>;
type Entry =
  | 'service-list'
  | 'service-read'
  | 'service-id'
  | 'direct-list'
  | 'direct-read'
  | 'direct-id'
  | 'root-list'
  | 'root-read'
  | 'root-id';
const entries: Entry[] = [
  'service-list',
  'service-read',
  'service-id',
  'direct-list',
  'direct-read',
  'direct-id',
  'root-list',
  'root-read',
  'root-id',
];
const selection = ['name', 'conditional', 'restrictionState', 'profile.safe'];
const targetSelection = ['name', 'status', 'conditional', 'secret', 'note', 'restrictionState'];
const quiet = { includePermissions: false, includeFieldPermissions: false, includeCount: false };
let sequence = 0;
const runtimes: ReturnType<typeof createAccessRuntime>[] = [];

function plain(value: any): any {
  return JSON.parse(JSON.stringify(value instanceof mongoose.Document ? value.toObject({ virtuals: false }) : value));
}

function track(schema: mongoose.Schema) {
  const calls: string[] = [];
  const fetched: Array<{ raw: unknown; original: unknown; hydrated: boolean }> = [];
  let failure: Error | undefined;
  for (const op of ['find', 'findOne', 'countDocuments', 'aggregate'] as const) {
    schema.pre(op, function () {
      calls.push(op);
      if (failure) throw failure;
    });
  }
  for (const op of ['find', 'findOne'] as const) {
    schema.post(op, function (value) {
      for (const raw of Array.isArray(value) ? value : value ? [value] : []) {
        fetched.push({ raw, original: plain(raw), hydrated: raw instanceof mongoose.Document });
      }
    });
  }
  return {
    calls,
    fetched,
    fail(error?: Error) {
      failure = error;
    },
    assertUnchanged() {
      for (const { raw, original } of fetched) expect(plain(raw)).toEqual(original);
    },
  };
}

async function fixture(lean: boolean, metadata = false) {
  const api = createAccessRuntime();
  runtimes.push(api);
  const tag = ++sequence;
  const sourceName = `Arl03Source${tag}`;
  const targetName = `Arl03Target${tag}`;
  const leafName = `Arl03Leaf${tag}`;
  const schema = () =>
    new mongoose.Schema({
      name: String,
      key: String,
      nextKey: String,
      tenant: String,
      owner: String,
      restricted: Boolean,
      conditional: String,
      status: String,
      secret: { type: String, select: false },
      unselected: { type: String, select: false },
      note: { type: String, select: false },
      profile: { safe: String, private: String, restricted: Boolean },
      ref: { type: mongoose.Schema.Types.ObjectId, ref: leafName },
    });
  const sourceSchema = schema();
  if (metadata) sourceSchema.plugin(permissionsPlugin, { modelName: sourceName });
  const targetSchema = schema();
  const leafSchema = schema();
  const sourceTrace = track(sourceSchema);
  const targetTrace = track(targetSchema);
  const leafTrace = track(leafSchema);
  const Source = mongoose.model(sourceName, sourceSchema);
  const Target = mongoose.model(targetName, targetSchema);
  const Leaf = mongoose.model(leafName, leafSchema);
  const sourceHook = vi.fn((doc: Row) => ({ canRead: doc.restricted !== true, owns: doc.owner === 'owner' }));
  const targetHook = vi.fn((doc: Row) => ({ canRead: doc.restricted !== true, owns: doc.owner === 'owner' }));
  const leafHook = vi.fn((doc: Row) => ({ canRead: doc.restricted !== true, owns: doc.owner === 'owner' }));
  const sourceGetter = vi.fn((doc: Row) => (doc.restricted ? 'restricted' : 'open'));
  const targetGetter = vi.fn((doc: Row) => (doc.restricted ? 'restricted' : 'open'));
  const leafGetter = vi.fn((doc: Row) => (doc.restricted ? 'restricted' : 'open'));
  let targetDenied = false;
  let targetOperationAllowed = true;
  api.setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => [],
    // Root envelopes add nesting around the supported nested include tree.
    requestComplexity: { maxDepth: 16, maxBulkConcurrency: 2, maxHookConcurrency: 2 },
  });
  const options = (hook: typeof sourceHook, getter = sourceGetter) => ({
    operationAccess: { read: true, list: true, count: true },
    permissionSchema: {
      name: true,
      status: 'owns',
      conditional: 'canRead',
      secret: false,
      unselected: true,
      restricted: false,
      note: false,
      profile: { read: true, list: true, sub: { safe: true, private: false, restricted: false } },
      restrictionState: true,
      ref: true,
    },
    alwaysSelectFields: ['secret', 'unselected', 'restricted', 'owner', 'profile.private', 'profile.restricted'],
    docPermissions: hook,
    virtuals: { restrictionState: { dependsOn: ['restricted'], read: getter, list: getter } },
    stripPermissionsField: true,
    hydration: Object.fromEntries(
      ['publicRead', 'publicList', 'find', 'findOne', 'findById'].map((key) => [key, lean ? 'lean' : 'hydrated']),
    ),
    defaults: {
      publicReadOptions: { ...quiet, tryList: false },
      publicListOptions: { ...quiet },
    },
  });
  const router = api.createRouter(Source, {
    ...options(sourceHook),
    basePath: `/arl03-${tag}`,
    stripPermissionsField: !metadata,
  } as never);
  api.createRouter(Target, {
    ...options(targetHook, targetGetter),
    basePath: `/arl03-target-${tag}`,
    operationAccess: () => targetOperationAllowed,
    baseFilter: () => (targetDenied ? false : { tenant: 'visible' }),
  } as never);
  api.createRouter(Leaf, { ...options(leafHook, leafGetter), basePath: `/arl03-leaf-${tag}` } as never);
  const root = api.createRouter({ basePath: `/arl03-root-${tag}`, operationAccess: true });
  const seed = (name: string, key: string, restricted = true) => ({
    name,
    key,
    nextKey: 'match',
    tenant: 'visible',
    restricted,
    owner: 'owner',
    conditional: `${name}-conditional`,
    status: `${name}-status`,
    secret: `${name}-private`,
    unselected: `${name}-unselected`,
    note: `${name}-note`,
    profile: { safe: `${name}-safe`, private: `${name}-profile-private`, restricted },
  });
  const leaf = await Leaf.create(seed('leaf', 'match'));
  const targets = await Target.create([
    { ...seed('target', 'match'), ref: leaf._id },
    { ...seed('blocked-target', 'blocked'), tenant: 'other' },
  ]);
  const sources = await Source.create([
    { ...seed('restricted-hit', 'match'), ref: leaf._id },
    seed('restricted-miss', 'missing'),
    { ...seed('allowed-hit', 'match', false), ref: leaf._id },
    seed('restricted-blocked', 'blocked'),
  ]);
  const app = express();
  app.use(express.json());
  app.use(router.routes);
  app.use(root.routes);
  let run: (req: ModelRequest) => Promise<unknown>;
  let failure: unknown;
  let value: unknown;
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
    await request(app).post(`/arl03-${tag}/probe`).send({}).expect(200);
    if (failure) throw failure;
    return value as T;
  };
  const include = (op: 'read' | 'list' | 'count', path: string, correlated = false): Row => ({
    model: targetName,
    op,
    path,
    ...(correlated
      ? { mode: 'correlated', filter: { key: { $parent: 'key' } } }
      : { localField: 'key', foreignField: 'key' }),
    ...(op === 'count' ? {} : { args: { select: targetSelection } }),
  });
  const invoke = async (entry: Entry, args: Row = {}, row: number | null = 0) => {
    const id = row === null ? undefined : String(sources[row]._id);
    const filter = id ? { _id: id } : {};
    if (entry.startsWith('service')) {
      return execute(async (req) => {
        const service = req.macl.getService(sourceName);
        const options = { ...quiet };
        const result =
          entry === 'service-list'
            ? await service.find(filter, args, options)
            : entry === 'service-id'
              ? await service.findById(id!, args, options)
              : await service.findOne(filter, args, options);
        expect(result, JSON.stringify(result)).toMatchObject({ success: true });
        if (!result.success) throw new Error(result.code);
        return plain(entry === 'service-list' ? result.data : [result.data]) as Row[];
      });
    }
    if (entry.startsWith('root')) {
      const response = await request(app)
        .post(`/arl03-root-${tag}`)
        .send([
          {
            target: 'model',
            name: sourceName,
            op: entry === 'root-list' ? 'list' : 'read',
            ...(entry === 'root-id' ? { id } : { filter }),
            args,
          },
        ]);
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body[0], JSON.stringify(response.body)).toMatchObject({ statusCode: 200 });
      return (entry === 'root-list' ? response.body[0].result.data : [response.body[0].result.data]) as Row[];
    }
    const response = await request(app)
      .post(`/arl03-${tag}/__query${entry === 'direct-id' ? `/${id}` : entry === 'direct-read' ? '/__filter' : ''}`)
      .send({ filter, ...args })
      .expect(200);
    return (entry === 'direct-list' ? response.body.data : [response.body]) as Row[];
  };
  return {
    api,
    Source,
    Target,
    Leaf,
    sourceName,
    targetName,
    leafName,
    sources,
    targets,
    sourceHook,
    targetHook,
    sourceGetter,
    targetGetter,
    leafGetter,
    sourceTrace,
    targetTrace,
    leafTrace,
    execute,
    invoke,
    include,
    denyTargetRows(deny: boolean) {
      targetDenied = deny;
    },
    denyTargetOperation() {
      targetOperationAllowed = false;
    },
  };
}

afterEach(() => {
  for (const api of runtimes.splice(0)) api.runtime.clearOpenApiRoutes();
  mongoose.deleteModel(/^Arl03/);
  vi.restoreAllMocks();
});

describe.each([true, false])('ARL-03 include source provenance (lean=%s)', (lean) => {
  it.each(entries)(
    'misses and terminal target row denial cannot restore private source fields via %s',
    async (entry) => {
      const f = await fixture(lean);
      const include = ['secret', 'unselected', 'profile.private'].map((path) => f.include('read', path));
      const args = { select: selection, include };
      for (const row of [1, 3]) {
        const baseline = await f.invoke(entry, { select: selection }, row);
        const result = await f.invoke(entry, args, row);
        expect.soft(result).toEqual(baseline);
        expect.soft(result[0]).not.toHaveProperty('secret');
        expect.soft(result[0]).not.toHaveProperty('unselected');
        expect.soft(result[0].profile).not.toHaveProperty('private');
      }
      f.denyTargetRows(true);
      f.targetTrace.calls.length = 0;
      const [denied] = await f.invoke(entry, args);
      expect.soft(denied).not.toHaveProperty('secret');
      expect.soft(denied).not.toHaveProperty('unselected');
      expect.soft(denied.profile).not.toHaveProperty('private');
      expect(f.targetTrace.calls).toEqual([]);
      expect(f.sourceTrace.fetched.every((row) => row.hydrated === !lean)).toBe(true);
      for (const [doc] of f.sourceHook.mock.calls) {
        expect(doc.secret).toBe(`${doc.name}-private`);
        expect(doc.unselected).toBe(`${doc.name}-unselected`);
        expect(doc.profile.private).toBe(`${doc.name}-profile-private`);
        expect(doc.restricted).toBe(true);
      }
    },
  );

  it.each(entries)(
    'successful private-field collisions keep original business grants and dependencies via %s',
    async (entry) => {
      const f = await fixture(lean);
      const include = [f.include('read', 'secret'), f.include('read', 'restricted')];
      for (const index of [0, 2]) {
        const [row] = await f.invoke(entry, { select: selection, include }, index);
        expect(row.secret).toMatchObject({ name: 'target', status: 'target-status' });
        expect(row.restricted).toMatchObject({ name: 'target', status: 'target-status' });
        expect(row.restricted).not.toHaveProperty('secret');
        expect(row.restricted).not.toHaveProperty('note');
        expect(row.restricted).not.toHaveProperty('conditional');
        expect(row.restricted).not.toHaveProperty('key');
        if (index === 0) expect(row).not.toHaveProperty('conditional');
        else expect(row.conditional).toBe('allowed-hit-conditional');
        expect(row.restrictionState).toBe(index === 0 ? 'restricted' : 'open');
        expect(JSON.stringify(row)).not.toContain('-private');
      }
      expect(f.sourceHook.mock.calls.map(([doc]) => doc.restricted)).toEqual([true, false]);
      expect(f.sourceGetter.mock.calls.map(([doc]) => doc.restricted)).toEqual([true, false]);
      expect(f.sourceHook.mock.calls.map(([doc]) => doc.secret)).toEqual([
        'restricted-hit-private',
        'allowed-hit-private',
      ]);
      f.sourceTrace.assertUnchanged();
      f.targetTrace.assertUnchanged();
    },
  );

  for (const outerOp of ['read', 'list'] as const) {
    it.each(['service-read', 'service-list', 'direct-list', 'root-read'] as const)(
      `nested ${outerOp} targets keep independent source provenance via %s`,
      async (entry) => {
        const f = await fixture(lean);
        for (const outcome of ['miss', 'denied', 'success']) {
          const nested = ['secret', 'restricted'].map((path) => ({
            model: f.leafName,
            op: 'read',
            path,
            localField: 'nextKey',
            foreignField: 'key',
            filter: outcome === 'miss' ? { name: 'absent' } : {},
            args: { select: targetSelection },
          }));
          f.api.runtime.setModelOption(f.leafName, 'baseFilter', () => (outcome === 'denied' ? false : {}));
          const [row] = await f.invoke(entry, {
            select: selection,
            include: { ...f.include(outerOp, 'related'), args: { select: targetSelection, include: nested } },
          });
          const target = outerOp === 'list' ? row.related[0] : row.related;
          expect.soft(target).not.toHaveProperty('conditional');
          expect
            .soft(target)
            .toMatchObject({ name: 'target', status: 'target-status', restrictionState: 'restricted' });
          expect(target).not.toHaveProperty('nextKey');
          if (outcome === 'success') {
            expect(target.secret).toMatchObject({ name: 'leaf', status: 'leaf-status' });
            expect(target.restricted).toMatchObject({ name: 'leaf', status: 'leaf-status' });
          } else {
            expect.soft(target).not.toHaveProperty('secret');
            expect.soft(target).not.toHaveProperty('restricted');
          }
          expect(row).not.toHaveProperty('secret');
          expect(row).not.toHaveProperty('conditional');
          expect.soft(JSON.stringify(row)).not.toContain('-private');
        }
        expect(f.targetHook.mock.calls.map(([doc]) => doc.restricted)).toEqual([true, true, true]);
        expect(f.targetHook.mock.calls.map(([doc]) => doc.secret)).toEqual([
          'target-private',
          'target-private',
          'target-private',
        ]);
        f.sourceTrace.assertUnchanged();
        f.targetTrace.assertUnchanged();
      },
    );
  }

  it.each([false, true])(
    'mixed list rows retain their own source grants and target handles (correlated=%s)',
    async (correlated) => {
      const f = await fixture(lean);
      await f.execute(async (req) => {
        const svc = req.macl.getService(f.sourceName);
        const target = req.macl.getService(f.targetName);
        const result = await svc.find(
          {},
          { select: selection, sort: { name: 1 }, include: f.include('read', 'restricted', correlated) } as never,
          {
            ...quiet,
            authorization: {
              related: { restricted: { model: f.targetName, outputFields: { mode: 'grant', paths: ['note'] } } },
            },
          },
        );
        expect(result).toMatchObject({ success: true });
        if (!result.success) throw new Error(result.code);
        const rows = result.data as Row[];
        expect(rows.map((row) => row.name)).toEqual([
          'allowed-hit',
          'restricted-blocked',
          'restricted-hit',
          'restricted-miss',
        ]);
        expect(rows[0].conditional).toBe('allowed-hit-conditional');
        for (const row of rows.slice(1)) expect(row).not.toHaveProperty('conditional');
        for (const index of [1, 3]) {
          if (correlated) expect(rows[index].restricted).toBeNull();
          else expect(rows[index]).not.toHaveProperty('restricted');
        }
        expect(rows[0].restricted).not.toBe(rows[2].restricted);
        const sourceCalls = f.sourceHook.mock.calls.length;
        const targetCalls = f.targetHook.mock.calls.length;
        for (const index of [0, 2]) {
          const child = rows[index].restricted;
          const handle = result.contexts[index].getDocumentAuthorization(child);
          expect(handle).toBeDefined();
          expect(result.contexts[index].getDocumentAuthorization(rows[index === 0 ? 2 : 0].restricted)).toBeUndefined();
          expect(await target.pickAllowedFields(child, 'read', { documentAuthorization: handle! })).toEqual(child);
          expect(child).toMatchObject({ status: 'target-status', note: 'target-note' });
          await expect(svc.pickAllowedFields(child, 'read', { documentAuthorization: handle! })).rejects.toThrow();
          await expect(
            target.pickAllowedFields(rows[index === 0 ? 2 : 0].restricted, 'read', { documentAuthorization: handle! }),
          ).rejects.toThrow();
          const sourcePick = await svc.pickAllowedFields(rows[index], 'list', {
            documentAuthorization: result.contexts[index].documentAuthorization,
          });
          if (index === 2) expect(sourcePick).not.toHaveProperty('conditional');
        }
        expect(f.sourceHook).toHaveBeenCalledTimes(sourceCalls);
        expect(f.targetHook).toHaveBeenCalledTimes(targetCalls);
        expect(f.sourceHook.mock.calls.map(([doc]) => doc.restricted)).toEqual([false, true, true, true]);
        f.sourceTrace.assertUnchanged();
      });
    },
  );

  it.each(['service-list', 'root-list'] as const)(
    'correlated empty results are explicit attachments without changing hooks via %s',
    async (entry) => {
      const f = await fixture(lean);
      for (const unresolvable of [false, true]) {
        f.targetTrace.calls.length = 0;
        const include = (['read', 'list', 'count'] as const).map((op, i) => ({
          ...f.include(op, ['secret', 'unselected', 'restricted'][i], true),
          filter: { key: { $parent: unresolvable ? 'absentKey' : 'key' }, name: 'absent' },
        }));
        const [row] = await f.invoke(entry, { select: selection, include });
        expect(row).toMatchObject({ secret: null, unselected: [], restricted: 0, restrictionState: 'restricted' });
        expect(row).not.toHaveProperty('conditional');
        if (unresolvable) expect(f.targetTrace.calls).toEqual([]);
        else expect(f.targetTrace.calls).toEqual(['findOne', 'find', 'countDocuments']);
      }
      expect(f.sourceHook.mock.calls.map(([doc]) => doc.restricted)).toEqual([true, true]);
      expect(f.sourceHook.mock.calls.map(([doc]) => doc.secret)).toEqual([
        'restricted-hit-private',
        'restricted-hit-private',
      ]);
    },
  );

  it.each(['profile', 'profile.safe', 'profile["safe"]'])(
    'ordinary %s collisions keep target ownership and safe source siblings',
    async (path) => {
      const f = await fixture(lean);
      // Legacy bracket paths remain supported output paths; related policy keys
      // deliberately use the existing stricter dotted-path grammar.
      const elevated = !path.includes('[');
      await f.execute(async (req) => {
        const result = await req.macl
          .getService(f.sourceName)
          .findOne({ _id: f.sources[0]._id }, { select: selection, include: f.include('read', path) } as never, {
            ...quiet,
            ...(elevated
              ? {
                  authorization: {
                    related: {
                      [path]: { model: f.targetName, outputFields: { mode: 'grant' as const, paths: ['note'] } },
                    },
                  },
                }
              : {}),
          });
        expect(result).toMatchObject({ success: true });
        if (!result.success) throw new Error(result.code);
        const child = get(result.data, path) as Row;
        const handle = result.context.getDocumentAuthorization(child);
        expect(handle).toBeDefined();
        expect(child).toMatchObject({ name: 'target', status: 'target-status' });
        if (elevated) expect(child.note).toBe('target-note');
        else expect(child).not.toHaveProperty('note');
        expect(
          await req.macl.getService(f.targetName).pickAllowedFields(child, 'read', { documentAuthorization: handle! }),
        ).toEqual(child);
        expect(f.sourceHook.mock.calls[0][0].profile).toMatchObject({
          safe: 'restricted-hit-safe',
          private: 'restricted-hit-profile-private',
          restricted: true,
        });
        expect(JSON.stringify(result.data)).not.toContain('-private');
        f.sourceTrace.assertUnchanged();
      });
    },
  );

  it('nested list attachments, populate targets and backend grants preserve their own handles', async () => {
    const f = await fixture(lean);
    await f.execute(async (req) => {
      const result = await req.macl.getService(f.sourceName).findOne(
        { _id: f.sources[0]._id },
        {
          select: selection,
          include: {
            ...f.include('list', 'restricted'),
            args: {
              select: [...targetSelection, 'ref'],
              populate: [{ path: 'ref', select: ['name', 'note'] }],
              include: {
                model: f.leafName,
                op: 'read',
                path: 'secret',
                localField: 'nextKey',
                foreignField: 'key',
                args: { select: ['name', 'note'] },
              },
            },
          },
        } as never,
        {
          ...quiet,
          authorization: {
            related: {
              restricted: {
                model: f.targetName,
                outputFields: { mode: 'grant', paths: ['note'] },
                related: { secret: { model: f.leafName, outputFields: { mode: 'grant', paths: ['note'] } } },
              },
            },
          },
        },
      );
      expect(result).toMatchObject({ success: true });
      if (!result.success) throw new Error(result.code);
      const child = (result.data as Row).restricted[0];
      const context = result.context as ServiceOutputContext;
      for (const [model, output, access] of [
        [f.targetName, child, 'list'],
        [f.leafName, child.secret, 'read'],
        [f.leafName, child.ref, 'read'],
      ] as const) {
        const handle = context.getDocumentAuthorization(output);
        expect(handle).toBeDefined();
        expect(
          await req.macl.getService(model).pickAllowedFields(output, access, { documentAuthorization: handle! }),
        ).toMatchObject({ name: output.name });
      }
      expect(child.note).toBe('target-note');
      expect(child.secret.note).toBe('leaf-note');
      expect(child.ref).not.toHaveProperty('note');
      expect(child).not.toHaveProperty('conditional');
      expect(child).not.toHaveProperty('key');
      expect(child).not.toHaveProperty('nextKey');
      expect(f.sourceHook.mock.calls[0][0].restricted).toBe(true);
      expect(f.targetHook.mock.calls[0][0].secret).toBe('target-private');
      f.sourceTrace.assertUnchanged();
      f.targetTrace.assertUnchanged();
      f.leafTrace.assertUnchanged();
    });
  });

  it('a missed ordinary collision preserves selected allowed source values', async () => {
    const f = await fixture(lean);
    const include = ['name', 'profile.safe'].map((path) => ({
      ...f.include('read', path),
      filter: { name: 'absent' },
    }));
    const baseline = await f.invoke('service-read', { select: selection });
    expect(await f.invoke('service-read', { select: selection, include })).toEqual(baseline);
    expect(f.sourceHook.mock.calls[1][0]).toMatchObject({
      name: 'restricted-hit',
      profile: { safe: 'restricted-hit-safe' },
    });
  });

  it('ordered overlapping attachments preserve sequential legacy joins and finalized target ownership', async () => {
    const f = await fixture(lean);
    await f.Leaf.create({ name: 'chained-leaf', key: 'target', owner: 'owner', status: 'chained-status' });
    await f.execute(async (req) => {
      const result = await req.macl.getService(f.sourceName).findOne(
        { _id: f.sources[0]._id },
        {
          select: selection,
          include: [
            f.include('read', 'profile'),
            {
              model: f.leafName,
              op: 'read',
              path: 'profile.child',
              localField: 'profile.name',
              foreignField: 'key',
              args: { select: ['name', 'status'] },
            },
            f.include('count', 'profile.name'),
          ],
        } as never,
        quiet,
      );
      expect(result).toMatchObject({ success: true });
      if (!result.success) throw new Error(result.code);
      const profile = (result.data as Row).profile;
      expect(profile).toMatchObject({
        name: 1,
        status: 'target-status',
        child: { name: 'chained-leaf', status: 'chained-status' },
      });
      for (const [name, child] of [
        [f.targetName, profile],
        [f.leafName, profile.child],
      ] as const) {
        const handle = result.context.getDocumentAuthorization(child);
        expect(handle).toBeDefined();
        expect(
          await req.macl.getService(name).pickAllowedFields(child, 'read', { documentAuthorization: handle! }),
        ).toMatchObject({ name: child.name, status: child.status });
      }
      expect(f.targetHook.mock.calls[0][0].name).toBe('target');
      expect(f.sourceHook.mock.calls[0][0].profile.safe).toBe('restricted-hit-safe');
      f.sourceTrace.assertUnchanged();
      f.targetTrace.assertUnchanged();
    });
  });

  it('detaching include rows retains shared populate evaluation and per-parent target copies', async () => {
    const f = await fixture(lean);
    await f.execute(async (req) => {
      const result = await req.macl.getService(f.sourceName).find(
        { key: 'match' },
        {
          select: ['name', 'ref'],
          populate: [{ path: 'ref', select: ['name', 'restrictionState'] }],
          include: f.include('count', 'relatedCount'),
        } as never,
        quiet,
      );
      expect(result).toMatchObject({ success: true });
      if (!result.success) throw new Error(result.code);
      const rows = result.data as Row[];
      expect(rows).toHaveLength(2);
      expect(rows[0].relatedCount).toBe(1);
      expect(rows[0].ref).toMatchObject({ name: 'leaf', restrictionState: 'restricted' });
      expect(rows[0].ref).toEqual(rows[1].ref);
      expect(rows[0].ref).not.toBe(rows[1].ref);
      expect(result.contexts[0].getDocumentAuthorization(rows[0].ref)).toBeDefined();
      expect(result.contexts[1].getDocumentAuthorization(rows[1].ref)).toBeDefined();
      expect(f.leafGetter).toHaveBeenCalledTimes(1);
      f.sourceTrace.assertUnchanged();
      f.leafTrace.assertUnchanged();
    });
  });

  it.each([false, true])('target operation/runtime failures stay failures (correlated=%s)', async (correlated) => {
    const f = await fixture(lean);
    await f.execute(async (req) => {
      const service = req.macl.getService(f.sourceName);
      const args = { select: selection, include: f.include('read', 'secret', correlated) };
      const error = new Error('ARL-03 target persistence failure');
      f.targetTrace.fail(error);
      await expect(service.findOne({}, args as never, quiet)).rejects.toBe(error);
      f.targetTrace.fail();
      f.targetTrace.calls.length = 0;
      f.denyTargetOperation();
      expect(await service.findOne({}, args as never, quiet)).toMatchObject({
        success: false,
        code: 'unauthorized',
      });
      expect(f.targetTrace.calls).toEqual([]);
      expect(f.sourceHook).not.toHaveBeenCalled();
      f.sourceTrace.assertUnchanged();
    });
  });

  it('keeps permission aliases and metadata separate from include provenance in both modes', async () => {
    const f = await fixture(lean, true);
    await f.execute(async (req) => {
      const result = await req.macl
        .getService(f.sourceName)
        .findOne({ _id: f.sources[0]._id }, { select: selection, include: f.include('read', 'restricted') } as never, {
          ...quiet,
          includePermissions: true,
        });
      expect(result).toMatchObject({ success: true });
      if (!result.success) throw new Error(result.code);
      const row = result.data as Row;
      expect(row._permissions).toEqual({ canRead: false, owns: true });
      expect(row.permissions).toBe(row._permissions);
      expect(Object.getOwnPropertySymbols(row)).toEqual([]);
      expect(Object.keys(row)).not.toContain('permissions');
      expect(row).not.toHaveProperty('conditional');
      f.sourceTrace.assertUnchanged();
    });
  });
});
