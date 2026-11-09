import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../../dist/index.mjs';
import type { ModelRequest } from '../../dist/advanced.mjs';
import { useMongoTestDatabase } from '../setup';

useMongoTestDatabase();
let sequence = 0;
const quiet = { skim: true, includePermissions: false, includeFieldPermissions: false };
const runtimes: ReturnType<typeof createAccessRuntime>[] = [];

async function fixture(options: Record<string, unknown> = {}) {
  const api = createAccessRuntime();
  runtimes.push(api);
  api.setGlobalOptions({
    logger: { warn: vi.fn(), info: vi.fn() },
    globalPermissions: () => [],
    requestComplexity: { maxHookConcurrency: 1, maxBulkConcurrency: 1 },
  });
  const modelName = `DocDepsIntegration${++sequence}`;
  const projections: Record<string, number>[] = [];
  const schema = new mongoose.Schema({
    name: String,
    ownerId: { type: String, select: false },
    readInput: { type: String, select: false },
    updateInput: { type: String, select: false },
    readFacts: { owner: { type: String, select: false } },
    group: String,
    contacts: [{ label: String, hidden: String }],
  });
  schema.pre('find', function () {
    projections.push({ ...this.projection() });
  });
  schema.pre('findOne', function () {
    projections.push({ ...this.projection() });
  });
  const Model = mongoose.model(modelName, schema);
  const router = api.createRouter(Model, {
    basePath: `/doc-deps-${sequence}`,
    modelPermissionPrefix: 'm:',
    operationAccess: {
      read: true,
      list: true,
      create: true,
      update: true,
      subs: { contacts: { list: true, read: true, create: true, update: true } },
    },
    permissionSchema: {
      name: { read: 'm:owner', list: 'm:owner', create: true, update: 'm:owner' },
      ownerId: false,
      readInput: false,
      updateInput: false,
      group: true,
      contacts: { read: true, list: true, sub: { label: 'm:owner', hidden: false } },
    },
    ...options,
  } as never);
  const row = await Model.create({
    name: 'before',
    ownerId: 'alice',
    readInput: 'read-value',
    updateInput: 'update-value',
    group: 'g',
    readFacts: { owner: 'alice' },
    contacts: [{ label: 'child', hidden: 'private-child' }],
  });
  const app = express();
  app.use(express.json());
  app.use(router.routes);
  let run: (req: ModelRequest) => Promise<void>, failure: unknown;
  router.router.post('/probe', async (req, res) => {
    try {
      await run(req as unknown as ModelRequest);
    } catch (error) {
      failure = error;
    }
    res.json({ ok: true });
  });
  return {
    api,
    app,
    router,
    Model,
    modelName,
    row,
    projections,
    async execute(callback: (req: ModelRequest) => Promise<void>) {
      failure = undefined;
      run = callback;
      await request(app).post(`${router.options.basePath}/probe`).send({}).expect(200);
      if (failure) throw failure;
    },
  };
}

afterEach(() => {
  for (const api of runtimes.splice(0)) api.runtime.clearOpenApiRoutes();
  mongoose.deleteModel(/^DocDepsIntegration/);
});

describe('document-permission private dependencies', () => {
  it.each([
    ['lean', 'isolated'],
    ['lean', 'trusted'],
    ['hydrated', 'isolated'],
    ['hydrated', 'trusted'],
  ] as const)('fetches denied/unrequested/excluded inputs without output leaks (%s/%s)', async (hydration, mode) => {
    const calls: unknown[] = [];
    const f = await fixture({
      hydration: { findOne: hydration, findById: hydration },
      readAuthorizationMode: mode,
      docPermissions: {
        dependsOn: ['ownerId'],
        get(this: ModelRequest, doc: any, permissions: any, context: any) {
          expect(this.macl).toBeDefined();
          expect(permissions.keys).toEqual([]);
          expect(context).toMatchObject({ operation: 'read', outputAccess: 'read', docPermissionsAccess: 'read' });
          calls.push(doc.ownerId);
          return { owner: doc.ownerId === 'alice' };
        },
      },
    });
    await f.execute(async (req) => {
      const service = req.macl.getService(f.modelName);
      for (const select of [['name'], ['name', 'ownerId'], ['-ownerId', '-readInput']]) {
        const output = await service.findById(String(f.row._id), { select }, quiet);
        expect(output).toMatchObject({ success: true, data: { name: 'before' } });
        if (!output.success) throw new Error(output.code);
        for (const key of ['ownerId', 'readInput', 'updateInput']) expect(output.data).not.toHaveProperty(key);
      }
    });
    expect(calls).toEqual(['alice', 'alice', 'alice']);
    expect(f.projections).toHaveLength(3);
    for (const projection of f.projections) {
      expect(projection.ownerId).toBe(1);
      expect(projection).not.toHaveProperty('readInput');
      expect(projection).not.toHaveProperty('updateInput');
    }
  });

  it('runs hooks on missing/undefined declared fields, unlike virtual dependency skipping', async () => {
    const hook = vi.fn((doc: any) => ({ owner: doc.ownerId === undefined }));
    const virtual = vi.fn(() => 'should-not-run');
    const f = await fixture({
      permissionSchema: { name: 'm:owner', receipt: true, ownerId: false },
      docPermissions: { get: hook, dependsOn: ['ownerId'] },
      virtuals: { receipt: { get: virtual, dependsOn: ['ownerId'] } },
    });
    await f.Model.updateOne({ _id: f.row._id }, { $unset: { ownerId: 1 } });
    await f.execute(async (req) => {
      expect(await req.macl.getService(f.modelName).findOne({}, { select: ['name', 'receipt'] }, quiet)).toMatchObject({
        success: true,
        data: { name: 'before' },
      });
    });
    expect(hook).toHaveBeenCalledTimes(1);
    expect(virtual).not.toHaveBeenCalled();
  });

  it('keeps function entries dependency-free and resolves default/custom hooks and inputs together', async () => {
    const fallback = vi.fn((doc: any) => ({ owner: doc.ownerId === 'alice' }));
    const list = vi.fn((doc: any) => {
      expect(doc.ownerId).toBeUndefined();
      return { owner: true };
    });
    const audit = vi.fn((doc: any) => {
      expect(doc.ownerId).toBeUndefined();
      return { owner: doc.readInput === 'read-value' };
    });
    const f = await fixture({
      permissionSchema: { name: { read: 'm:owner', list: 'm:owner', audit: 'm:owner' } },
      docPermissions: {
        default: { get: fallback, dependsOn: ['ownerId'] },
        read: undefined,
        list,
        audit: { get: audit, dependsOn: ['readInput'] },
      },
    });
    await f.execute(async (req) => {
      const service = req.macl.getService(f.modelName);
      expect(await service.findOne({}, { select: ['name'] }, quiet)).toMatchObject({
        success: true,
        data: { name: 'before' },
      });
      expect(await service.find({}, { select: ['name'] }, quiet)).toMatchObject({
        success: true,
        data: [{ name: 'before' }],
      });
      const customProjection = await req.macl.genSelect(f.modelName, 'audit' as never, ['name']);
      expect(customProjection).toContain('readInput');
      expect(customProjection).not.toContain('ownerId');
      expect(
        await service.genDocPermissions({ readInput: 'read-value' }, 'audit', { operation: 'read' } as never),
      ).toEqual({ owner: true });
    });
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledTimes(1);
    expect(f.projections[0]).toHaveProperty('ownerId', 1);
    expect(f.projections[1]).not.toHaveProperty('ownerId');
  });

  it('captures hooks and dependency arrays before a query await; later calls observe replacements', async () => {
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>((done) => {
      entered = done;
    });
    const waiting = new Promise<void>((done) => {
      release = done;
    });
    const original = vi.fn((doc: any) => {
      expect(doc.readInput).toBeUndefined();
      return { owner: doc.ownerId === 'alice' };
    });
    const next = vi.fn((doc: any) => {
      expect(doc.ownerId).toBeUndefined();
      return { owner: doc.readInput === 'read-value' };
    });
    let first = true;
    const dependsOn = ['ownerId'];
    const f = await fixture({
      baseFilter: {
        read: async () => {
          if (first) {
            first = false;
            entered();
            await waiting;
          }
          return {};
        },
      },
      docPermissions: { read: { get: original, dependsOn } },
    });
    await f.execute(async (req) => {
      const service = req.macl.getService(f.modelName);
      const pending = service.findOne({}, { select: ['name'] }, quiet);
      await started;
      dependsOn[0] = 'updateInput';
      f.api.setModelOption(f.modelName, 'docPermissions.read', { get: next, dependsOn: ['readInput'] });
      release();
      expect(await pending).toMatchObject({ success: true, data: { name: 'before' } });
      expect(await service.findOne({}, { select: ['name'] }, quiet)).toMatchObject({
        success: true,
        data: { name: 'before' },
      });
    });
    expect(original).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
    expect(f.projections[0]).toHaveProperty('ownerId', 1);
    expect(f.projections[0]).not.toHaveProperty('readInput');
    expect(f.projections[1]).toHaveProperty('readInput', 1);
    expect(f.projections[1]).not.toHaveProperty('ownerId');
  });

  it.each(['isolated', 'trusted'] as const)(
    'keeps independent pre/post-update stages on the captured update descriptor, not output read (%s)',
    async (mode) => {
      const stages: unknown[] = [];
      const read = vi.fn(() => ({ owner: false }));
      const replacement = vi.fn(() => ({ owner: false }));
      let f!: Awaited<ReturnType<typeof fixture>>;
      const update = vi.fn(async function (this: ModelRequest, doc: any, _permissions: unknown, context: any) {
        expect(this.macl).toBeDefined();
        expect(context).toMatchObject({ operation: 'update', docPermissionsAccess: 'update', outputAccess: 'read' });
        stages.push([doc.name, doc.ownerId]);
        if (stages.length === 1)
          f.api.setModelOption(f.modelName, 'docPermissions.update', { get: replacement, dependsOn: ['readInput'] });
        return { owner: doc.ownerId === 'alice' };
      });
      f = await fixture({
        readAuthorizationMode: 'trusted',
        listAuthorizationMode: 'trusted',
        createAuthorizationMode: mode,
        updateAuthorizationMode: mode,
        docPermissions: {
          read: { get: read, dependsOn: ['readInput'] },
          update: { get: update, dependsOn: ['ownerId'] },
        },
      });
      await f.execute(async (req) => {
        const output = await req.macl
          .getService(f.modelName)
          .updateOne({}, { name: 'after' }, { select: ['name'] }, quiet);
        expect(output).toMatchObject({ success: true, data: { name: 'after' } });
        if (output.success) expect(output.data).not.toHaveProperty('ownerId');
      });
      expect(stages).toEqual([
        ['before', 'alice'],
        ['after', 'alice'],
      ]);
      expect(update).toHaveBeenCalledTimes(2);
      expect(read).not.toHaveBeenCalled();
      expect(replacement).not.toHaveBeenCalled();
    },
  );

  it('dedicated subdocuments compute read facts once from the raw owning parent', async () => {
    const hook = vi.fn((doc: any, _permissions: unknown, context: any) => {
      expect(doc.contacts).toHaveLength(1);
      expect(context.scopePath).toEqual([]);
      return { owner: doc.ownerId === 'alice' };
    });
    const f = await fixture({ docPermissions: { read: { get: hook, dependsOn: ['ownerId'] } } });
    await f.execute(async (req) => {
      const output = await req.macl
        .getService(f.modelName)
        .listSub(String(f.row._id), 'contacts', { select: ['label'] });
      expect(output).toMatchObject({ success: true, data: [{ label: 'child' }] });
      if (output.success) {
        expect(output.data[0]).not.toHaveProperty('ownerId');
        expect(output.data[0]).not.toHaveProperty('hidden');
      }
    });
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it.each(['isolated', 'trusted'] as const)(
    'create output resolves its own descriptor without borrowing the read definition (%s)',
    async (mode) => {
      const create = vi.fn((doc: any) => ({ owner: doc.ownerId === 'alice' }));
      const read = vi.fn(() => ({ owner: false }));
      const f = await fixture({
        readAuthorizationMode: 'trusted',
        listAuthorizationMode: 'trusted',
        createAuthorizationMode: mode,
        updateAuthorizationMode: mode,
        prepare: { create: (data: any) => ({ ...data, ownerId: 'alice' }) },
        docPermissions: {
          create: { get: create, dependsOn: ['ownerId'] },
          read: { get: read, dependsOn: ['readInput'] },
        },
      });
      await f.execute(async (req) => {
        const output = await req.macl.getService(f.modelName).create({ name: 'created' }, { select: ['name'] }, quiet);
        expect(output).toMatchObject({ success: true, data: [{ name: 'created' }] });
        if (output.success) expect(output.data[0]).not.toHaveProperty('ownerId');
      });
      expect(create).toHaveBeenCalledTimes(1);
      expect(read).not.toHaveBeenCalled();
    },
  );

  it('dedicated subdocument writes use independent owning-parent update/read definitions', async () => {
    const stages: string[] = [];
    const hook = (access: string) =>
      vi.fn((doc: any, _permissions: unknown, context: any) => {
        stages.push(`${access}:${doc.contacts[0].label}`);
        expect(context.docPermissionsAccess).toBe(access);
        return { owner: doc.ownerId === 'alice' };
      });
    const update = hook('update'),
      read = hook('read');
    const f = await fixture({
      docPermissions: {
        update: { get: update, dependsOn: ['ownerId'] },
        read: { get: read, dependsOn: ['ownerId'] },
      },
    });
    await f.execute(async (req) => {
      const output = await req.macl
        .getService(f.modelName)
        .updateSub(String(f.row._id), 'contacts', String(f.row.contacts[0]._id), { label: 'changed' });
      expect(output).toMatchObject({ success: true, data: { label: 'changed' } });
      if (output.success) expect(output.data).not.toHaveProperty('ownerId');
    });
    expect(stages).toEqual(['update:child', 'read:changed']);
  });

  it.each(['readInput', 'readFacts'] as const)(
    'dedicated subdocuments retain a schema-hidden persisted metadata input for both owning-parent stages (%s)',
    async (dependency) => {
      const stages: string[] = [];
      const hook = (access: string) =>
        vi.fn((doc: any) => {
          const value = dependency === 'readInput' ? doc.readInput : doc.readFacts?.owner;
          stages.push(`${access}:${value}`);
          return { owner: value === (dependency === 'readInput' ? 'read-value' : 'alice') };
        });
      const read = hook('read'),
        update = hook('update');
      const f = await fixture({
        documentPermissionField: dependency,
        stripPermissionsField: true,
        docPermissions: {
          read: { get: read, dependsOn: [dependency] },
          update: { get: update, dependsOn: [dependency] },
        },
      });
      await f.execute(async (req) => {
        const service = req.macl.getService(f.modelName);
        const listed = await service.listSub(String(f.row._id), 'contacts', { select: ['label'] });
        expect(listed).toMatchObject({ success: true, data: [{ label: 'child' }] });
        const updated = await service.updateSub(String(f.row._id), 'contacts', String(f.row.contacts[0]._id), {
          label: 'changed',
        });
        expect(updated).toMatchObject({ success: true, data: { label: 'changed' } });
        if (listed.success) expect(listed.data[0]).not.toHaveProperty(dependency);
        if (updated.success) expect(updated.data).not.toHaveProperty(dependency);
      });
      const value = dependency === 'readInput' ? 'read-value' : 'alice';
      expect(stages).toEqual([`read:${value}`, `update:${value}`, `read:${value}`]);
      expect(await f.Model.findById(f.row._id).select('+readInput').lean()).toHaveProperty('readInput', 'read-value');
    },
  );

  it('top-level update stages retain hidden descendants of a declared metadata container', async () => {
    const seen: unknown[] = [];
    const get = vi.fn((doc: any) => {
      seen.push(doc.readFacts?.owner);
      return { owner: doc.readFacts?.owner === 'alice' };
    });
    const f = await fixture({
      documentPermissionField: 'readFacts',
      stripPermissionsField: true,
      docPermissions: { update: { get, dependsOn: ['readFacts'] } },
    });
    await f.execute(async (req) => {
      const output = await req.macl
        .getService(f.modelName)
        .updateOne({}, { name: 'changed' }, { select: ['name'] }, quiet);
      expect(output).toMatchObject({ success: true, data: { name: 'changed' } });
      if (output.success) expect(output.data).not.toHaveProperty('readFacts');
    });
    expect(seen).toEqual(['alice', 'alice']);
  });

  it.each(['populate', 'populate-custom', 'include'] as const)(
    'uses target-local hooks/dependencies and never leaks inputs for %s',
    async (kind) => {
      const rootHook = vi.fn(() => ({ owner: false }));
      const targetHook = vi.fn((doc: any) => ({ owner: doc.privateOwner === 'target-owner' }));
      const f = await fixture({ docPermissions: { get: rootHook, dependsOn: ['ownerId'] } });
      const targetName = `DocDepsIntegrationTarget${++sequence}`;
      const projections: Record<string, number>[] = [];
      const schema = new mongoose.Schema({
        name: String,
        group: String,
        privateOwner: { type: String, select: false },
      });
      schema.pre('find', function () {
        projections.push({ ...this.projection() });
      });
      schema.pre('findOne', function () {
        projections.push({ ...this.projection() });
      });
      const Target = mongoose.model(targetName, schema);
      f.api.registerModelInstance(targetName, Target);
      f.api.setModelOptions(targetName, {
        modelPermissionPrefix: 'm:',
        operationAccess: { read: true, list: true, audit: true },
        permissionSchema: { name: 'm:owner', privateOwner: false },
        docPermissions: {
          read: { get: targetHook, dependsOn: ['privateOwner'] },
          list: { get: targetHook, dependsOn: ['privateOwner'] },
          audit: { get: targetHook, dependsOn: ['privateOwner'] },
        },
      } as never);
      const target = await Target.create({ name: 'target', group: 'g', privateOwner: 'target-owner' });
      f.Model.schema.add({ ref: { type: mongoose.Schema.Types.ObjectId, ref: targetName } });
      await f.Model.updateOne({ _id: f.row._id }, { ref: target._id });
      f.api.setModelOption(f.modelName, 'permissionSchema', { group: true, ref: true });
      await f.execute(async (req) => {
        const args =
          kind !== 'include'
            ? {
                select: ['ref'],
                populate: [
                  { path: 'ref', select: ['name'], ...(kind === 'populate-custom' ? { access: 'audit' } : {}) },
                ],
              }
            : {
                select: ['group'],
                include: {
                  model: targetName,
                  path: 'targets',
                  op: 'list',
                  localField: 'group',
                  foreignField: 'group',
                  args: { select: ['name'] },
                },
              };
        const output = await req.macl.getService(f.modelName).findOne({}, args as never, quiet);
        expect(output).toMatchObject({ success: true });
        if (!output.success) throw new Error(output.code);
        const child = kind !== 'include' ? (output.data as any).ref : (output.data as any).targets[0];
        expect(child).toHaveProperty('name', 'target');
        expect(child).not.toHaveProperty('privateOwner');
        expect(child).not.toHaveProperty('ownerId');
        expect(output.data).not.toHaveProperty('ownerId');
      });
      expect(rootHook).toHaveBeenCalledTimes(1);
      expect(targetHook).toHaveBeenCalledTimes(1);
      expect(projections.some((projection) => projection.privateOwner === 1)).toBe(true);
      expect(projections.every((projection) => !Object.hasOwn(projection, 'ownerId'))).toBe(true);
    },
  );
});
