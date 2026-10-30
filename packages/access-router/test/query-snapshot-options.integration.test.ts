import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../dist/index.mjs';
import type { ModelRequest, ModelRouterOptions, ServiceOutputContext } from '../src/interfaces';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();
const flags = [
  'unsafeSkipListOutputSnapshotChecks',
  'unsafeSkipReadOutputSnapshotChecks',
  'unsafeSkipListNestedDocumentSnapshotChecks',
  'unsafeSkipReadNestedDocumentSnapshotChecks',
] as const;
const copyFlags = ['unsafeSkipListInitialOutputSnapshotCopy', 'unsafeSkipReadInitialOutputSnapshotCopy'] as const;
const quiet = { includePermissions: false, includeFieldPermissions: false, includeCount: false };
let serial = 0;

async function fixture(options: ModelRouterOptions = {}) {
  const api = createAccessRuntime();
  api.setGlobalOptions({ globalPermissions: () => ['reader'], logger: { warn: vi.fn() } });
  const n = ++serial;
  const Target = mongoose.model(
    `QuerySnapshotHttpTarget${n}`,
    new mongoose.Schema(
      {
        name: String,
        secret: String,
        hidden: String,
        owner: Boolean,
        group: String,
        tenant: String,
      },
      { versionKey: false },
    ),
  );
  const Root = mongoose.model(
    `QuerySnapshotHttpRoot${n}`,
    new mongoose.Schema(
      {
        value: String,
        hidden: String,
        group: String,
        tenant: String,
        owner: Boolean,
        children: [new mongoose.Schema({ label: String, hidden: String }, { _id: false })],
        ref: { type: mongoose.Schema.Types.ObjectId, ref: Target.modelName },
      },
      { versionKey: false },
    ),
  );
  const docHook = vi.fn((doc: Record<string, unknown>) => ({ owner: doc.owner === true }));
  const targetRouter = api.createRouter(Target, {
    operationAccess: { list: true, read: true },
    baseFilter: { read: () => ({ tenant: 'allowed' }), list: () => ({ tenant: 'allowed' }) },
    permissionSchema: { name: 'reader', secret: 'doc:owner', hidden: false },
    docPermissions: { read: docHook, list: docHook },
    alwaysSelectFields: ['owner'],
    modelPermissionPrefix: 'doc:',
    stripPermissionsField: true,
    // Target flags must not choose the origin's mode, including include LIST under READ.
    ...Object.fromEntries(flags.map((key) => [key, options[key] !== true])),
    ...Object.fromEntries(copyFlags.map((key) => [key, options[key] !== true])),
  });
  const router = api.createRouter(Root, {
    basePath: '/snapshots',
    operationAccess: { list: true, read: true },
    baseFilter: { read: () => ({ tenant: 'read' }), list: () => ({ tenant: 'list' }) },
    permissionSchema: {
      value: 'reader',
      hidden: false,
      ref: true,
      children: { read: true, list: true, sub: { label: 'doc:owner', hidden: false } },
    },
    virtuals: { children: { sub: {} } },
    alwaysSelectFields: ['owner'],
    docPermissions: { read: docHook, list: docHook },
    modelPermissionPrefix: 'doc:',
    stripPermissionsField: true,
    unsafeSkipReadDocumentSnapshotChecks: true,
    unsafeSkipListDocumentSnapshotChecks: true,
    ...options,
  });
  const targetRows = await Target.insertMany([
    { name: 'owned', secret: 'allowed', hidden: 'never', owner: true, group: 'g', tenant: 'allowed' },
    { name: 'unowned', secret: 'never', hidden: 'never', owner: false, group: 'g', tenant: 'allowed' },
    { name: 'outside', secret: 'never', hidden: 'never', owner: true, group: 'g', tenant: 'outside' },
  ]);
  const rows = await Root.insertMany(
    ['read', 'list'].map((tenant) => ({
      value: tenant,
      hidden: 'never',
      tenant,
      group: 'g',
      owner: true,
      children: [{ label: 'child', hidden: 'never' }],
      ref: targetRows[0]._id,
    })),
  );
  const args = {
    select: ['value', 'hidden', 'children.label', 'children.hidden', 'ref', '-_id'],
    populate: [{ path: 'ref', access: 'read' as const, select: ['name', 'secret', 'hidden', '-_id'] }],
    include: [
      {
        model: Target.modelName,
        path: 'items',
        op: 'list' as const,
        localField: 'group',
        foreignField: 'group',
        args: { select: ['name', 'secret', 'hidden', '-_id'] },
      },
    ],
  };
  const expected = (value: string) => ({
    value,
    children: [{ label: 'child' }],
    ref: { name: 'owned', secret: 'allowed' },
    items: [{ name: 'owned', secret: 'allowed' }, { name: 'unowned' }],
  });
  const rootRouter = api.createRouter({ basePath: '/root', operationAccess: true });
  const app = express().use(express.json()).use(router.routes).use(rootRouter.routes);
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
    Root,
    Target,
    router,
    targetRouter,
    app,
    rows,
    args,
    expected,
    docHook,
    async execute(callback: (req: ModelRequest) => Promise<void>) {
      run = callback;
      failure = undefined;
      await request(app).post('/snapshots/probe').send({}).expect(200);
      if (failure) throw failure;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^QuerySnapshotHttp/);
});

describe('query snapshot switches through real read/list, population, include and root execution', () => {
  it.each(
    Array.from({ length: 16 }, (_, mask) => ({
      mask,
      options: Object.fromEntries(flags.map((key, index) => [key, !!(mask & (1 << index))])),
    })),
  )('retains permissions, filters and captured output handles for mask=$mask', async ({ options }) => {
    const f = await fixture(options);
    await f.execute(async (req) => {
      const svc = req.macl.getService(f.Root.modelName),
        pub = req.macl.getPublicService(f.Root.modelName),
        target = req.macl.getService(f.Target.modelName);
      for (const operation of ['read', 'list', 'retry'] as const) {
        const result =
          operation === 'list'
            ? await svc.find({}, f.args, quiet)
            : operation === 'read'
              ? await svc.findById(String(f.rows[0]._id), f.args, quiet)
              : await pub._read(String(f.rows[1]._id), f.args, quiet);
        expect(result.success).toBe(true);
        if (!result.success) throw new Error(result.code);
        const output = (operation === 'list' ? (result.data as unknown[])[0] : result.data) as ReturnType<
          typeof f.expected
        >;
        const context =
          operation === 'list'
            ? (result as unknown as { contexts: ServiceOutputContext[] }).contexts[0]
            : (result as unknown as { context: ServiceOutputContext }).context;
        expect(output).toEqual(f.expected(operation === 'read' ? 'read' : 'list'));
        const refHandle = context.getDocumentAuthorization(output.ref)!;
        const includeHandle = context.getDocumentAuthorization(output.items[0])!;
        const childHandle = context.getDocumentAuthorization(output.children[0])!;
        expect(refHandle).toBeDefined();
        expect(includeHandle).toBeDefined();
        expect(childHandle).toBeDefined();
        expect(await target.pickAllowedFields(output.ref, 'read', { documentAuthorization: refHandle })).toEqual(
          output.ref,
        );
        expect(
          await target.pickAllowedFields(output.items[0], 'list', { documentAuthorization: includeHandle }),
        ).toEqual(output.items[0]);
        const skip =
          options[operation === 'list' ? 'unsafeSkipListOutputSnapshotChecks' : 'unsafeSkipReadOutputSnapshotChecks'];
        output.value = 'changed';
        output.ref.name = 'changed';
        const pick = svc.pickAllowedFields(output, operation === 'read' ? 'read' : 'list', {
          documentAuthorization: context.documentAuthorization,
        });
        if (skip) {
          await expect(pick).resolves.toMatchObject({ value: 'changed', ref: { name: 'changed', secret: 'allowed' } });
          expect(context.getDocumentAuthorization(output.ref)).toBe(refHandle);
        } else {
          await expect(pick).rejects.toThrow();
          expect(context.getDocumentAuthorization(output.ref)).toBeUndefined();
        }
      }
    });
    const response = await request(f.app)
      .post('/root')
      .send([
        {
          target: 'model',
          name: f.Root.modelName,
          op: 'read',
          id: String(f.rows[1]._id),
          args: f.args,
          options: quiet,
        },
        { target: 'model', name: f.Root.modelName, op: 'list', args: f.args, options: quiet },
      ])
      .expect(200);
    expect(response.body[0].result.data).toEqual(f.expected('list'));
    expect(response.body[1].result.data).toEqual([f.expected('list')]);
    f.targetRouter.setOption('operationAccess.read', false);
    await f.execute(async (req) => {
      const result = await req.macl.getService(f.Root.modelName).findOne({}, f.args, quiet);
      expect(result.success).toBe(true);
      if (result.success)
        expect((result.data as { ref: unknown }).ref).not.toEqual({ name: 'owned', secret: 'allowed' });
    });
    f.router.setOption('operationAccess.read', false);
    await request(f.app).get(`/snapshots/${f.rows[0]._id}`).expect(401);
  });

  it.each(Array.from({ length: 4 }, (_, mask) => mask))(
    'retains output-copy ownership through real READ/LIST/retry descendants (mask=%s)',
    async (mask) => {
      const options = {
        ...Object.fromEntries(flags.map((key) => [key, true])),
        ...Object.fromEntries(copyFlags.map((key, index) => [key, !!(mask & (1 << index))])),
      };
      const f = await fixture(options);
      await f.execute(async (req) => {
        const svc = req.macl.getService(f.Root.modelName),
          pub = req.macl.getPublicService(f.Root.modelName);
        for (const operation of ['read', 'list', 'retry'] as const) {
          const result =
            operation === 'list'
              ? await svc.find({}, f.args, quiet)
              : operation === 'read'
                ? await svc.findById(String(f.rows[0]._id), f.args, quiet)
                : await pub._read(String(f.rows[1]._id), f.args, quiet);
          expect(result.success).toBe(true);
          if (!result.success) throw new Error(result.code);
          const output = (operation === 'list' ? (result.data as unknown[])[0] : result.data) as ReturnType<
            typeof f.expected
          >;
          const context =
            operation === 'list'
              ? (result as unknown as { contexts: ServiceOutputContext[] }).contexts[0]
              : (result as unknown as { context: ServiceOutputContext }).context;
          expect(output).toEqual(f.expected(operation === 'read' ? 'read' : 'list'));
          for (const child of [output.children[0], output.ref, ...output.items]) {
            expect(context.getDocumentAuthorization(child)).toBeDefined();
          }
          const key = operation === 'list' ? copyFlags[0] : copyFlags[1];
          expect(f.api.getModelOption(f.Target.modelName, key)).toBe(!options[key]);
          // Rollback applies to new calls, not previously issued contexts/handles.
          f.api.setModelOption(f.Root.modelName, key, false);
          output.value = 'changed';
          const picked = await svc.pickAllowedFields(output, operation === 'read' ? 'read' : 'list', {
            documentAuthorization: context.documentAuthorization,
          });
          // A field helper uses the receiving model's catalog; it is not include
          // assembly and does not invent the non-schema `items` attachment.
          const { items: _items, ...expectedPick } = output;
          expect(picked).toEqual(expectedPick);
          expect(picked).not.toBe(output);
          output.children[0] = { ...output.children[0] };
          expect(context.getDocumentAuthorization(output.ref)).toBeUndefined();
          await expect(
            svc.pickAllowedFields(output, operation === 'read' ? 'read' : 'list', {
              documentAuthorization: context.documentAuthorization,
            }),
          ).rejects.toThrow();
          f.api.setModelOption(f.Root.modelName, key, options[key]);
        }
      });
      const response = await request(f.app)
        .post('/root')
        .send([
          {
            target: 'model',
            name: f.Root.modelName,
            op: 'read',
            id: String(f.rows[1]._id),
            args: f.args,
            options: quiet,
          },
          { target: 'model', name: f.Root.modelName, op: 'list', args: f.args, options: quiet },
        ])
        .expect(200);
      expect(response.body[0].result.data).toEqual(f.expected('list'));
      expect(response.body[1].result.data).toEqual([f.expected('list')]);
      expect(f.docHook).toHaveBeenCalled();
    },
  );

  it.each([...flags, ...copyFlags])('rejects %s across HTTP and a root sibling preflight', async (key) => {
    const f = await fixture();
    for (const operation of ['read', 'list']) {
      await request(f.app)
        .post(operation === 'list' ? '/snapshots/__query' : '/snapshots/__query/__filter')
        .send({ filter: {}, options: { [key]: true } })
        .expect(400);
    }
    await request(f.app)
      .get(`/snapshots/${f.rows[0]._id}`)
      .query({ [key]: 'true' })
      .expect(400);
    await request(f.app)
      .post('/root')
      .send([
        { target: 'model', name: f.Root.modelName, op: 'read', id: String(f.rows[0]._id) },
        { target: 'model', name: f.Root.modelName, op: 'list', options: { [key]: true } },
      ])
      .expect(400);
    expect(f.docHook).not.toHaveBeenCalled();
    expect(f.api.getModelOption(f.Root.modelName, key)).toBe(false);
  });
});
