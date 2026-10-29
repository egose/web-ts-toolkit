import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../dist/index.mjs';
import type { ModelRequest } from '../dist/advanced';
import Permission from '../src/permission';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();
const runtimes: ReturnType<typeof createAccessRuntime>[] = [];
const connections: mongoose.Connection[] = [];
const quiet = { includePermissions: false, includeFieldPermissions: false, includeCount: false };
const plain = (value: unknown): any => JSON.parse(JSON.stringify(value));
const latch = () => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => (release = resolve));
  return { promise, release };
};
let sequence = 0;

afterEach(async () => {
  vi.restoreAllMocks();
  runtimes.splice(0).forEach((api) => api.runtime.clearOpenApiRoutes());
  for (const connection of connections.splice(0)) {
    await connection.dropDatabase();
    await connection.close();
  }
  mongoose.deleteModel(/^MpoIncludeOwned/);
});

async function fixture(hydration: 'lean' | 'hydrated') {
  const n = ++sequence;
  const api = createAccessRuntime();
  runtimes.push(api);
  const B = await mongoose
    .createConnection(`mongodb://${mongoose.connection.host}:${mongoose.connection.port}`, {
      dbName: `mpo-include-owned-${n}`,
    })
    .asPromise();
  connections.push(B);
  const userName = `MpoIncludeOwnedUser${n}`;
  const targetName = `MpoIncludeOwnedTarget${n}`;
  const sourceName = `MpoIncludeOwnedSource${n}`;
  const userId = new mongoose.Types.ObjectId();
  const when = new Date('2026-01-02T03:04:05.000Z');
  const nativeRows: Array<{ row: unknown; before: unknown }> = [];
  const userSchema = () => {
    const schema = new mongoose.Schema({
      secret: { type: String, select: false },
      date: Date,
      tenant: String,
      next: { type: mongoose.Schema.Types.ObjectId, ref: userName },
    });
    schema.post('find', (rows) => {
      for (const row of rows) nativeRows.push({ row, before: plain(row) });
    });
    return schema;
  };
  const UserA = mongoose.model(userName, userSchema());
  const UserB = B.model(userName, userSchema());
  await UserA.create({ _id: userId, secret: 'private-A', date: when, tenant: 'allowed', next: userId });
  await UserB.create({ _id: userId, secret: 'private-B', date: when, tenant: 'allowed', next: userId });
  const targetSchema = () =>
    new mongoose.Schema({
      key: String,
      name: String,
      owner: Boolean,
      tenant: String,
      matched: Boolean,
      when: Date,
      user: { type: mongoose.Schema.Types.ObjectId, ref: userName },
    });
  const TargetA = mongoose.model(targetName, targetSchema());
  const TargetB = B.model(targetName, targetSchema());
  const rows = (owner: string, count: number) => [
    ...Array.from({ length: count }, (_, index) => ({
      key: 'join',
      name: `${owner}-${index}`,
      owner: owner === 'B' || index === 0,
      tenant: 'allowed',
      matched: true,
      when,
      user: userId,
    })),
    { key: 'other', name: `${owner}-unrelated`, owner: true, tenant: 'allowed', matched: true, when, user: userId },
    { key: 'join', name: `${owner}-outside`, owner: true, tenant: 'outside', matched: true, when, user: userId },
    { key: 'join', name: `${owner}-unmatched`, owner: true, tenant: 'allowed', matched: false, when, user: userId },
  ];
  const targets = await TargetA.create(rows('A', 2));
  await TargetB.create(rows('B', 3));
  const sourceSchema = () => new mongoose.Schema({ label: String, key: String });
  const SourceA = mongoose.model(sourceName, sourceSchema());
  const SourceB = B.model(sourceName, sourceSchema());
  const source = await SourceA.create({ label: 'source-A', key: 'join' });
  await SourceB.create({ _id: source._id, label: 'source-B', key: 'other' });
  const contexts: unknown[] = [];
  const terminal = vi.fn(() => 'must-not-run');
  const value = vi.fn((doc, permissions, context, inputs) => {
    expect(permissions.has('reader')).toBe(true);
    expect(context).not.toHaveProperty('populated');
    expect(doc).not.toHaveProperty('user.secret');
    expect(inputs).toEqual({ user: { secret: inputs.user.secret } });
    expect(doc.user).toEqual(userId);
    return inputs.user.secret;
  });
  const stamp = vi.fn((doc, _permissions, context, inputs) => {
    expect(context).not.toHaveProperty('populated');
    expect(doc).not.toHaveProperty('user.date');
    expect(Object.keys(inputs.user)).toEqual(['date']);
    expect(inputs.user.date).toBeInstanceOf(Date);
    const result = inputs.user.date.toISOString();
    inputs.user.date.setTime(0);
    return result;
  });
  const virtuals = {
    value: { get: value, dependsOnPopulate: [{ path: 'user', select: 'secret -_id' }] },
    stamp: { get: stamp, dependsOnPopulate: [{ path: 'user', select: 'date -_id' }] },
  };
  const targetOptions = {
    requireOperationAccessForPopulateQueries: false,
    requireOperationAccessForPopulateDependencies: true,
    operationAccess: { read: 'reader', list: 'reader', count: 'reader' },
    permissionSchema: { name: 'reader', user: true, value: 'm::owner', stamp: 'reader' },
    modelPermissionPrefix: 'm::',
    alwaysSelectFields: ['owner'],
    stripPermissionsField: true,
    docPermissions: (doc: any, permissions: any, context: any) => {
      expect(permissions.has('reader')).toBe(true);
      contexts.push(context.mongooseModel);
      return { owner: doc.owner === true };
    },
    baseFilter: {
      read: (permissions: any) => ({ tenant: permissions.has('reader') ? 'allowed' : 'none' }),
      list: (permissions: any) => ({ tenant: permissions.has('reader') ? 'allowed' : 'none' }),
      count: (permissions: any) => ({ tenant: permissions.has('reader') ? 'allowed' : 'none' }),
    },
    overrideFilter: { read: () => ({}), list: () => ({}), count: () => ({}) },
    defaults: {
      findOneArgs: { select: ['name', 'user', 'value', 'stamp', '-_id'], sort: { name: 1 } },
      findArgs: { select: ['name', 'user', 'value', 'stamp', '-_id'], sort: { name: 1 } },
    },
    virtuals,
  };
  api.setGlobalOptions({
    globalPermissions: () => ['reader'],
    requestComplexity: { maxBulkConcurrency: 1, maxHookConcurrency: 1 },
  });
  api.setDefaultModelOptions({
    requireOperationAccessForPopulateQueries: true,
    requireOperationAccessForPopulateDependencies: false,
  });
  api.registerModelInstance(userName, UserA);
  api.setModelOptions(userName, {
    operationAccess: false,
    permissionSchema: {},
    baseFilter: { read: () => ({ tenant: 'allowed' }) },
    virtuals: { terminal: { get: terminal, dependsOnPopulate: [{ path: 'next', select: 'secret -_id' }] } },
  } as never);
  api.registerModelInstance(targetName, TargetA);
  api.setModelOptions(targetName, targetOptions as never);
  const entered = latch();
  const resume = latch();
  let calls = 0;
  api.createRouter(SourceA, {
    requireOperationAccessForPopulateQueries: false,
    requireOperationAccessForPopulateDependencies: true,
    operationAccess: true,
    permissionSchema: { label: true, key: false },
    stripPermissionsField: true,
    hydration: { findOne: hydration },
    baseFilter: {
      read: async () => {
        if (calls++ === 0) {
          entered.release();
          await resume.promise;
        }
        return {};
      },
    },
  });
  const targetReadsA = {
    list: vi.spyOn(TargetA.collection, 'find'),
    read: vi.spyOn(TargetA.collection, 'findOne'),
    count: vi.spyOn(TargetA.collection, 'aggregate'),
  };
  const targetReadsB = {
    list: vi.spyOn(TargetB.collection, 'find'),
    read: vi.spyOn(TargetB.collection, 'findOne'),
    count: vi.spyOn(TargetB.collection, 'aggregate'),
    directCount: vi.spyOn(TargetB.collection, 'countDocuments'),
  };
  const directCountA = vi.spyOn(TargetA.collection, 'countDocuments');
  const privateReadsA = vi.spyOn(UserA.collection, 'find');
  const privateReadsB = vi.spyOn(UserB.collection, 'find');
  const app = express().use(api());
  let run!: (req: ModelRequest) => Promise<void>;
  let failure: unknown;
  app.post('/probe', async (req, res) => {
    try {
      await run(req as ModelRequest);
    } catch (error) {
      failure = error;
      resume.release();
    }
    res.json({ done: true });
  });
  return {
    api,
    B,
    n,
    source,
    targets,
    SourceA,
    SourceB,
    UserA,
    UserB,
    TargetA,
    TargetB,
    targetName,
    userName,
    userId,
    when,
    entered,
    resume,
    contexts,
    value,
    stamp,
    terminal,
    virtuals,
    targetOptions,
    targetReadsA,
    targetReadsB,
    directCountA,
    privateReadsA,
    privateReadsB,
    replace(models: mongoose.Model<any>[]) {
      const replacement = api.runtime.createBootstrapSnapshot();
      for (const model of models) replacement.modelInstances[model.modelName] = model as mongoose.Model<unknown>;
      api.runtime.restoreBootstrapSnapshot(replacement);
    },
    include(mode: 'legacy' | 'correlated', op: 'read' | 'list' | 'count', model = targetName, path = 'joined') {
      return {
        model,
        op,
        path,
        ...(mode === 'legacy'
          ? { localField: 'key', foreignField: 'key', filter: { matched: true, when } }
          : { mode, filter: { key: { $parent: 'key' }, matched: true, when } }),
      };
    },
    assertNative() {
      for (const { row, before } of nativeRows) expect(plain(row)).toEqual(before);
      expect(terminal).not.toHaveBeenCalled();
    },
    async execute(callback: typeof run) {
      run = callback;
      await request(app).post('/probe').expect(200, { done: true });
      if (failure) throw failure;
    },
  };
}

describe.each(['legacy', 'correlated'] as const)('MPO-05 held %s include output', (mode) => {
  describe.each(['lean', 'hydrated'] as const)('source %s', (hydration) => {
    it.each(['read', 'list', 'count'] as const)(
      '%s retains receiver, actor, fields, rows, masks and defaults; later same-service calls refresh',
      async (op) => {
        const f = await fixture(hydration);
        await f.execute(async (req) => {
          const service = req.macl.getService(f.SourceA.modelName);
          const include = f.include(mode, op);
          const invoke = () =>
            service.findOne({ _id: f.source._id }, { select: ['label', '-_id'], include } as never, quiet);
          const pending = invoke();
          await Promise.race([
            f.entered.promise,
            pending.then(() => {
              throw new Error('source capture was not reached');
            }),
          ]);
          // Default publication validates the entire current graph. Change the
          // default before temporarily replacing the target with a model from a
          // different connection, then exercise the held capture against both.
          f.api.setDefaultModelOptions({ requireOperationAccessForPopulateDependencies: true });
          f.replace([f.TargetB]);
          f.api.setModelOptions(f.targetName, {
            operationAccess: false,
            permissionSchema: {},
            virtuals: {},
            baseFilter: { read: () => false, list: () => false, count: () => false },
            defaults: { findArgs: { select: ['tenant'] }, findOneArgs: { select: ['tenant'] } },
          });
          const permissions = vi.spyOn(req.macl, 'getPermissions').mockReturnValue(new Permission({ reader: false }));
          f.resume.release();
          const first = await pending;
          expect(first.success).toBe(true);
          if (!first.success) throw new Error(first.code);
          const expected = ['A-0', 'A-1'].map((name, index) => ({
            name,
            user: String(f.userId),
            stamp: f.when.toISOString(),
            ...(index === 0 ? { value: 'private-A' } : {}),
          }));
          expect(plain(first.data)).toEqual({
            label: 'source-A',
            joined: op === 'count' ? 2 : op === 'read' ? expected[0] : expected,
          });
          expect(f.targetReadsA[op]).toHaveBeenCalledTimes(op === 'count' && mode === 'correlated' ? 0 : 1);
          expect(f.directCountA).toHaveBeenCalledTimes(op === 'count' && mode === 'correlated' ? 1 : 0);
          for (const spy of Object.values(f.targetReadsB)) expect(spy).not.toHaveBeenCalled();
          expect(f.privateReadsA).toHaveBeenCalledTimes(op === 'count' ? 0 : 1);
          expect(f.privateReadsB).not.toHaveBeenCalled();
          expect(f.value).toHaveBeenCalledTimes(op === 'count' ? 0 : 1);
          expect(f.stamp).toHaveBeenCalledTimes(op === 'count' ? 0 : op === 'read' ? 1 : 2);
          if (op !== 'count') {
            expect(f.contexts.length).toBeGreaterThan(0);
            expect(f.contexts.every((model) => model === f.TargetA)).toBe(true);
            const row = op === 'list' ? (first.data as any).joined[0] : (first.data as any).joined;
            const handle = first.context.getDocumentAuthorization(row);
            expect(handle).toBeDefined();
            expect(Reflect.ownKeys(handle!)).toEqual([]);
            await expect(
              req.macl.getService(f.targetName).pickAllowedFields(row, op, { documentAuthorization: handle! }),
            ).rejects.toMatchObject({
              result: {
                code: 'bad_request',
                errors: [{ detail: expect.stringContaining('binding mismatch') }],
              },
            });
            expect(f.privateReadsA.mock.calls[0][0]).toMatchObject({ _id: { $in: [f.userId] }, tenant: 'allowed' });
            expect(f.privateReadsA.mock.calls[0][1].projection).toMatchObject({ _id: 1, secret: 1, date: 1 });
          }
          f.assertNative();
          expect(await invoke()).toMatchObject({ success: false, code: 'unauthorized' });
          for (const spy of Object.values(f.targetReadsB)) expect(spy).not.toHaveBeenCalled();
          permissions.mockRestore();
          f.replace([f.UserB]);
          f.api.setModelOptions(f.targetName, {
            ...f.targetOptions,
            permissionSchema: { name: true, user: true, value: true, stamp: true },
          } as never);
          f.api.setModelOption(f.userName, 'requireOperationAccessForPopulateDependencies', undefined);
          const strict = await invoke();
          expect(strict.success).toBe(true);
          if (!strict.success) throw new Error(strict.code);
          const names = ['B-0', 'B-1', 'B-2'].map((name) => ({ name, user: String(f.userId) }));
          expect(plain(strict.data)).toEqual({
            label: 'source-A',
            joined: op === 'count' ? 3 : op === 'read' ? names[0] : names,
          });
          expect(f.privateReadsB).not.toHaveBeenCalled();
          f.api.setDefaultModelOption('requireOperationAccessForPopulateDependencies', false);
          const inherited = await invoke();
          expect(inherited.success).toBe(true);
          if (!inherited.success) throw new Error(inherited.code);
          const admitted = names.map((row) => ({ ...row, value: 'private-B', stamp: f.when.toISOString() }));
          expect(plain(inherited.data)).toEqual({
            label: 'source-A',
            joined: op === 'count' ? 3 : op === 'read' ? admitted[0] : admitted,
          });
          expect(f.privateReadsB).toHaveBeenCalledTimes(op === 'count' ? 0 : 1);
          f.assertNative();
        });
      },
    );

    it('recursive public includes retain source/receiver identity and held nested grants/private bindings', async () => {
      const f = await fixture(hydration);
      const nestedName = `MpoIncludeOwnedNested${f.n}`;
      const nestedSchema = () =>
        new mongoose.Schema({
          key: String,
          name: String,
          tenant: String,
          matched: Boolean,
          when: Date,
          user: { type: mongoose.Schema.Types.ObjectId, ref: f.userName },
        });
      const NestedA = mongoose.model(nestedName, nestedSchema());
      const NestedB = f.B.model(nestedName, nestedSchema());
      await NestedA.create({
        key: 'join',
        name: 'nested-A',
        tenant: 'allowed',
        matched: true,
        when: f.when,
        user: f.userId,
      });
      await NestedB.create({
        key: 'join',
        name: 'nested-B',
        tenant: 'allowed',
        matched: true,
        when: f.when,
        user: f.userId,
      });
      const nestedValue = vi.fn((_doc, _permissions, context, inputs) => {
        expect(context.mongooseModel).toBe(NestedA);
        expect(inputs).toEqual({ user: { secret: 'private-A' } });
        return inputs.user.secret;
      });
      f.api.registerModelInstance(nestedName, NestedA);
      f.api.setModelOptions(nestedName, {
        operationAccess: false,
        permissionSchema: { name: false, value: false },
        stripPermissionsField: true,
        baseFilter: { list: () => false },
        virtuals: { value: { get: nestedValue, dependsOnPopulate: [{ path: 'user', select: 'secret -_id' }] } },
      } as never);
      f.api.setModelOptions(f.targetName, {
        operationAccess: false,
        permissionSchema: { name: false, user: true, value: false, stamp: false },
        // An output grant does not authorize persisted query sort fields.
        sortableFields: ['name'],
      });
      const readsA = vi.spyOn(NestedA.collection, 'find');
      const readsB = vi.spyOn(NestedB.collection, 'find');
      await f.execute(async (req) => {
        const nested = {
          ...f.include(mode, 'list', nestedName, 'nested'),
          args: { select: ['name', 'value', '-_id'] },
        };
        const include = {
          ...f.include(mode, 'list'),
          args: { select: ['name', 'user', 'value', '-_id'], include: nested },
        };
        const policy = {
          model: f.targetName,
          operation: { mode: 'grant' },
          outputFields: { mode: 'grant', paths: ['name', 'value'] },
          related: {
            nested: {
              model: nestedName,
              operation: { mode: 'grant' },
              rows: { mode: 'scope', filter: { tenant: 'allowed' } },
              outputFields: { mode: 'grant', paths: ['name', 'value'] },
            },
          },
        };
        const pending = req.macl
          .getService(f.SourceA.modelName)
          .findOne(
            { _id: f.source._id },
            { select: ['label', '-_id'], include } as never,
            { ...quiet, authorization: { related: { joined: policy } } } as never,
          );
        await Promise.race([
          f.entered.promise,
          pending.then(() => {
            throw new Error('source capture was not reached');
          }),
        ]);
        f.replace([f.SourceB, f.TargetB, NestedB, f.UserB]);
        f.api.setDefaultModelOption('requireOperationAccessForPopulateDependencies', true);
        f.resume.release();
        const result = await pending;
        expect(result.success, JSON.stringify(result)).toBe(true);
        if (!result.success) throw new Error(result.code);
        expect(plain(result.data)).toEqual({
          label: 'source-A',
          joined: ['A-0', 'A-1'].map((name) => ({
            name,
            user: String(f.userId),
            value: 'private-A',
            nested: [{ name: 'nested-A', value: 'private-A' }],
          })),
        });
        expect(f.targetReadsA.list).toHaveBeenCalledTimes(1);
        expect(f.targetReadsB.list).not.toHaveBeenCalled();
        expect(readsA).toHaveBeenCalledTimes(mode === 'legacy' ? 1 : 2);
        expect(readsB).not.toHaveBeenCalled();
        expect(f.contexts.every((model) => model === f.TargetA)).toBe(true);
        expect(f.privateReadsB).not.toHaveBeenCalled();
        expect(nestedValue).toHaveBeenCalledTimes(mode === 'legacy' ? 1 : 2);
        expect(result.context.getDocumentAuthorization((result.data as any).joined[0].nested[0])).toBeDefined();
        expect(f.api.runtime.getModelInstance(f.SourceA.modelName)).toBe(f.SourceB);
        expect(f.api.runtime.getModelInstance(f.targetName)).toBe(f.TargetB);
        f.assertNative();
      });
    });
  });

  it('awaited include admission is one-shot; nested guards stay live at concurrency one', async () => {
    const f = await fixture('lean');
    f.resume.release();
    const entered = latch();
    const resume = latch();
    await f.execute(async (req) => {
      const guard = vi.fn(async (permissions) => {
        entered.release();
        await resume.promise;
        expect(await req.macl.isAllowed(f.targetName, 'list')).toBe(false);
        return permissions.has('reader');
      });
      f.api.setModelOption(f.targetName, 'operationAccess.list', guard);
      const service = req.macl.getService(f.SourceA.modelName);
      const pending = service.findOne({ _id: f.source._id }, { include: f.include(mode, 'list') } as never, quiet);
      await Promise.race([
        entered.promise,
        pending.then(() => {
          throw new Error('include guard was not reached');
        }),
      ]);
      f.replace([f.TargetB]);
      f.api.setModelOptions(f.targetName, { operationAccess: false, virtuals: {} });
      resume.release();
      const result = await pending;
      expect(result.success).toBe(true);
      if (result.success)
        expect(plain((result.data as any).joined).map((row: any) => row.name)).toEqual(['A-0', 'A-1']);
      expect(guard).toHaveBeenCalledTimes(1);
      expect(f.targetReadsA.list).toHaveBeenCalledTimes(1);
      expect(f.targetReadsB.list).not.toHaveBeenCalled();
      expect(await req.macl.isAllowed(f.targetName, 'list')).toBe(false);
      expect(
        await service.findOne({ _id: f.source._id }, { include: f.include(mode, 'list') } as never, quiet),
      ).toMatchObject({ success: false, code: 'unauthorized' });
    });
  });
});

describe.each(['lean', 'hydrated'] as const)('MPO-05 ordinary refs inside legacy include (%s)', (hydration) => {
  it.each([false, true])(
    'keeps an explicit cross-connection Model and its Q=%s policy after replacement',
    async (queries) => {
      const f = await fixture(hydration);
      const name = `MpoIncludeOwnedCross${f.n}`;
      const CrossB = f.B.model(name, new mongoose.Schema({ name: String }));
      const CrossA = mongoose.model(name, new mongoose.Schema({ name: String }));
      const id = new mongoose.Types.ObjectId();
      await CrossB.create({ _id: id, name: 'cross-B' });
      await CrossA.create({ _id: id, name: 'cross-A' });
      f.TargetA.schema.add({ ordinary: { type: mongoose.Schema.Types.ObjectId, ref: CrossB } });
      await f.TargetA.updateMany({ key: 'join' }, { ordinary: id });
      f.api.registerModelInstance(name, CrossB);
      f.api.setModelOptions(name, {
        requireOperationAccessForPopulateQueries: queries,
        operationAccess: false,
        permissionSchema: { name: true },
        stripPermissionsField: true,
      });
      f.api.setModelOption(f.targetName, 'permissionSchema.ordinary' as never, true as never);
      const readsA = vi.spyOn(CrossA.collection, 'find');
      const readsB = vi.spyOn(CrossB.collection, 'find');
      await f.execute(async (req) => {
        const include = {
          ...f.include('legacy', 'list'),
          args: { select: ['name', 'ordinary', '-_id'], populate: [{ path: 'ordinary', select: 'name -_id' }] },
        };
        const pending = req.macl
          .getService(f.SourceA.modelName)
          .findOne({ _id: f.source._id }, { select: ['label', '-_id'], include } as never, quiet);
        await Promise.race([
          f.entered.promise,
          pending.then(() => {
            throw new Error('source capture was not reached');
          }),
        ]);
        f.replace([f.TargetB, CrossA]);
        f.resume.release();
        const result = await pending;
        expect(result.success).toBe(true);
        if (!result.success) throw new Error(result.code);
        expect(plain(result.data)).toEqual({
          label: 'source-A',
          joined: ['A-0', 'A-1'].map((name) => ({ name, ordinary: queries ? String(id) : { name: 'cross-B' } })),
        });
        expect(f.targetReadsA.list).toHaveBeenCalledTimes(1);
        expect(f.targetReadsB.list).not.toHaveBeenCalled();
        expect(readsA).not.toHaveBeenCalled();
        expect(readsB).toHaveBeenCalledTimes(queries ? 0 : 1);
        expect(f.privateReadsA).not.toHaveBeenCalled();
        expect(f.privateReadsB).not.toHaveBeenCalled();
        expect(f.api.runtime.getModelInstance(name)).toBe(CrossA);
        f.assertNative();
      });
    },
  );
});
