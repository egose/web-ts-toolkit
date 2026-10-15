import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../dist/index.mjs';
import type { ModelRequest } from '../src/interfaces';
import { useMongoTestDatabase } from './setup';
import { quiet } from './service-authorization-fixture';

useMongoTestDatabase();
let sequence = 0;
async function fixture(targetOptions: Record<string, unknown> = {}, parentOptions: Record<string, unknown> = {}) {
  const api = createAccessRuntime();
  const n = ++sequence;
  const targetName = `Sva06Target${n}`,
    parentName = `Sva06Parent${n}`;
  const calls: unknown[] = [];
  const schema = new mongoose.Schema({
    name: String,
    note: { type: String, select: false },
    hidden: String,
    owner: String,
    group: String,
    tenant: String,
    nextId: String,
    next: { type: mongoose.Schema.Types.ObjectId, ref: targetName },
  });
  schema.pre('find', function () {
    calls.push({ filter: this.getFilter(), projection: this.projection() });
  });
  schema.pre('findOne', function () {
    calls.push({ filter: this.getFilter(), projection: this.projection() });
  });
  const Target = mongoose.model(targetName, schema);
  const Parent = mongoose.model(
    parentName,
    new mongoose.Schema({
      name: String,
      group: String,
      ref: { type: mongoose.Schema.Types.ObjectId, ref: targetName },
      refs: [{ type: mongoose.Schema.Types.ObjectId, ref: targetName }],
    }),
  );
  api.setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => [],
    requestComplexity: { maxBulkConcurrency: 1 },
  } as never);
  api.createRouter(Target, {
    basePath: `/sva06t-${n}`,
    operationAccess: { read: true, list: true, count: true },
    permissionSchema: { name: true, note: false, next: true },
    ...targetOptions,
  } as never);
  const router = api.createRouter(Parent, {
    basePath: `/sva06p-${n}`,
    operationAccess: { read: true, list: true, create: true, update: true },
    permissionSchema: {
      name: true,
      group: true,
      ref: { read: false, list: false, create: true, update: true },
      refs: { read: false, list: false, create: true, update: true },
    },
    ...parentOptions,
  } as never);
  const rows = await Target.insertMany([
    { name: 'a', note: 'note-a', hidden: 'private-a', owner: 'alice', group: 'g', tenant: 'a' },
    { name: 'b', note: 'note-b', hidden: 'private-b', owner: 'bob', group: 'g', tenant: 'b' },
    { name: 'unrelated', note: 'note-u', group: 'other', tenant: 'a' },
  ]);
  await Target.updateOne({ _id: rows[0]._id }, { next: rows[1]._id, nextId: String(rows[1]._id) });
  const parents = await Parent.insertMany([
    { name: 'p1', group: 'g', ref: rows[0]._id, refs: [rows[0]._id, rows[1]._id] },
    { name: 'p2', group: 'g', ref: rows[0]._id },
    { name: 'missing', group: 'none', ref: new mongoose.Types.ObjectId(), refs: [] },
  ]);
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
    Target,
    Parent,
    targetName,
    parentName,
    rows,
    parents,
    calls,
    grant: (path: string, policy: Record<string, unknown> = {}) => ({
      outputFields: { mode: 'grant', paths: ['ref', 'refs'] },
      related: { [path]: { model: targetName, outputFields: { mode: 'grant', paths: ['note'] }, ...policy } },
    }),
    include: (op: 'read' | 'list' | 'count', correlated = false, path = 'items') => ({
      model: targetName,
      path,
      op,
      ...(correlated
        ? { mode: 'correlated', filter: { group: { $parent: 'group' } } }
        : { localField: 'group', foreignField: 'group' }),
      ...(op === 'count' ? {} : { args: { select: ['name', 'note'] } }),
    }),
    async execute(callback: (req: ModelRequest) => Promise<void>) {
      failure = undefined;
      run = callback;
      await request(app).post(`/sva06p-${n}/probe`).send({}).expect(200);
      if (failure) throw failure;
    },
  };
}

describe('SVA-06 explicit related policies', () => {
  it.each([false, true])(
    'populates false/missing target output rules (virtuals=%s), keeps selection and target handles',
    async (virtuals) => {
      const getter = vi.fn((doc) => `v:${doc.hidden}`);
      const hook = vi.fn((doc) => ({ owner: doc.owner === 'alice' }));
      const f = await fixture({
        permissionSchema: { name: { read: 'owner' }, ...(virtuals ? { computed: false, note: false } : {}) },
        alwaysSelectFields: { read: ['owner'] },
        docPermissions: { read: hook },
        ...(virtuals ? { virtuals: { computed: { dependsOn: ['hidden'], read: getter } } } : {}),
      });
      await f.execute(async (req) => {
        const svc = req.macl.getService(f.parentName),
          target = req.macl.getService(f.targetName);
        const authorization = f.grant('ref');
        if (virtuals) authorization.related.ref.outputFields.paths.push('computed');
        const result = await svc.findOne(
          { _id: f.parents[0]._id },
          { select: ['ref'], populate: [{ path: 'ref', select: ['name', 'note', ...(virtuals ? ['computed'] : [])] }] },
          { ...quiet, authorization } as never,
        );
        expect(result).toMatchObject({
          success: true,
          data: { ref: { name: 'a', note: 'note-a', ...(virtuals ? { computed: 'v:private-a' } : {}) } },
        });
        if (!result.success) throw new Error(result.code);
        const child = (result.data as any).ref;
        const handle = result.context.getDocumentAuthorization(child);
        expect(handle).toBeDefined();
        expect(await target.pickAllowedFields(child, 'read', { documentAuthorization: handle! })).toMatchObject({
          note: 'note-a',
          name: 'a',
        });
        expect(child).not.toHaveProperty('owner');
        expect(child).not.toHaveProperty('hidden');
        expect(child).not.toHaveProperty('_permissions');
        expect(hook).toHaveBeenCalledTimes(1);
        expect(getter).toHaveBeenCalledTimes(virtuals ? 1 : 0);
        await f.Target.updateOne({ _id: f.rows[0]._id }, { $unset: { note: 1 } });
        const absent = await svc.findOne(
          { _id: f.parents[0]._id },
          { select: ['ref'], populate: [{ path: 'ref', select: ['note'] }] },
          { ...quiet, authorization } as never,
        );
        if (!absent.success) throw new Error(absent.code);
        expect((absent.data as any).ref).not.toHaveProperty('note');
        const unselected = await svc.findOne(
          { _id: f.parents[0]._id },
          { select: ['ref'], populate: [{ path: 'ref', select: ['name'] }] },
          { ...quiet, authorization } as never,
        );
        if (!unselected.success) throw new Error(unselected.code);
        expect((unselected.data as any).ref).not.toHaveProperty('note');
      });
    },
  );

  it.each(['operation', 'rows', 'fields'])(
    'parent-only grants cannot elevate target %s; independent child grant works',
    async (dimension) => {
      const f = await fixture(
        dimension === 'operation'
          ? { operationAccess: { read: false } }
          : dimension === 'rows'
            ? { baseFilter: { read: () => false } }
            : {},
      );
      await f.execute(async (req) => {
        const svc = req.macl.getService(f.parentName);
        const args = { select: ['ref'], populate: [{ path: 'ref', select: ['name', 'note'] }] };
        const parentOnly = await svc.findOne({ _id: f.parents[0]._id }, args, {
          ...quiet,
          authorization: { outputFields: { mode: 'unrestricted' } },
        });
        expect(JSON.stringify(parentOnly)).not.toContain('note-a');
        const policy =
          dimension === 'operation'
            ? { operation: { mode: 'grant' } }
            : dimension === 'rows'
              ? { rows: { mode: 'unrestricted' } }
              : {};
        const granted = await svc.findOne({ _id: f.parents[0]._id }, args, {
          ...quiet,
          authorization: f.grant('ref', policy),
        } as never);
        expect(granted).toMatchObject({ success: true, data: { ref: { note: 'note-a' } } });
      });
    },
  );

  it.each(['request', 'scope', 'unrestricted'])(
    'populate match and reference constraints survive rewriting in %s rows',
    async (mode) => {
      const transform = vi.fn(() => ({}));
      const f = await fixture({ overrideFilter: { read: transform } });
      await f.execute(async (req) => {
        const result = await req.macl
          .getService(f.parentName)
          .findOne(
            { _id: f.parents[0]._id },
            { select: ['refs'], populate: [{ path: 'refs', select: ['name', 'note'], match: { tenant: 'a' } }] },
            {
              ...quiet,
              authorization: f.grant('refs', { rows: mode === 'scope' ? { mode, filter: { tenant: 'a' } } : { mode } }),
            } as never,
          );
        expect(result).toMatchObject({ success: true, data: { refs: [{ name: 'a', note: 'note-a' }] } });
        if (result.success) expect((result.data as any).refs).toHaveLength(1);
        expect(transform).toHaveBeenCalledTimes(1);
      });
    },
  );

  it.each([false, true])(
    'all include operations have independent target policies (correlated=%s)',
    async (correlated) => {
      const f = await fixture({
        operationAccess: { list: false, read: false, count: false },
        baseFilter: { list: () => false, read: () => false, count: () => false },
      });
      await f.execute(async (req) => {
        const svc = req.macl.getService(f.parentName);
        for (const op of ['read', 'list', 'count'] as const) {
          const include = f.include(op, correlated);
          expect(await svc.findOne({ _id: f.parents[0]._id }, { include } as never, quiet)).toMatchObject({
            success: false,
            code: 'unauthorized',
          });
          const policy = {
            model: f.targetName,
            operation: { mode: 'grant' },
            rows: { mode: 'scope', filter: { tenant: 'a' } },
            ...(op === 'count' ? {} : { outputFields: { mode: 'grant', paths: ['note'] } }),
          };
          const rowDenied = await svc.findOne(
            { _id: f.parents[0]._id },
            { include } as never,
            { ...quiet, authorization: { related: { items: { ...policy, rows: { mode: 'request' } } } } } as never,
          );
          if (correlated) expect(rowDenied).toMatchObject({ success: false, code: 'forbidden' });
          else {
            expect(rowDenied).toMatchObject({ success: true });
            if (rowDenied.success) expect(rowDenied.data).not.toHaveProperty('items');
          }
          const result = await svc.findOne(
            { _id: f.parents[0]._id },
            { select: ['name'], include } as never,
            { ...quiet, authorization: { related: { items: policy } } } as never,
          );
          expect(result).toMatchObject({ success: true });
          if (!result.success) throw new Error(result.code);
          const items = (result.data as any).items;
          expect(items).toEqual(
            op === 'count'
              ? 1
              : op === 'list'
                ? [expect.objectContaining({ note: 'note-a' })]
                : expect.objectContaining({ note: 'note-a' }),
          );
          if (op !== 'count') {
            const child = op === 'list' ? items[0] : items;
            expect(child).not.toHaveProperty('group');
            expect(result.context.getDocumentAuthorization(child)).toBeDefined();
            const requestFields = await svc.findOne(
              { _id: f.parents[0]._id },
              { include } as never,
              {
                ...quiet,
                authorization: { related: { items: { ...policy, outputFields: { mode: 'request' } } } },
              } as never,
            );
            expect(requestFields).toMatchObject({ success: true });
            expect(JSON.stringify(requestFields)).not.toContain('note-a');
          }
        }
      });
    },
  );

  it.each(['request', 'scope', 'unrestricted'])(
    'legacy filter/join and correlated predicates survive rewriting under %s',
    async (mode) => {
      const f = await fixture({ overrideFilter: { list: () => ({}), count: () => ({}) } });
      await f.execute(async (req) => {
        for (const correlated of [false, true])
          for (const op of ['list', 'count'] as const) {
            const include = {
              ...f.include(op, correlated),
              filter: { ...(correlated ? { group: { $parent: 'group' } } : {}), tenant: 'a' },
            };
            const result = await req.macl.getService(f.parentName).findOne(
              { _id: f.parents[0]._id },
              { include } as never,
              {
                ...quiet,
                authorization: {
                  related: {
                    items: { model: f.targetName, rows: mode === 'scope' ? { mode, filter: {} } : { mode } },
                  },
                },
              } as never,
            );
            expect(result).toMatchObject({ success: true });
            if (result.success)
              expect((result.data as any).items).toEqual(op === 'count' ? 1 : [expect.objectContaining({ name: 'a' })]);
          }
      });
    },
  );

  it('nested policies and sibling paths stay isolated, with request-default children and distinct document results', async () => {
    const hook = vi.fn((doc) => ({ owner: doc.owner === 'alice' }));
    const f = await fixture({
      permissionSchema: { name: { list: 'owner', read: 'owner' }, next: true },
      docPermissions: { list: hook, read: hook },
      alwaysSelectFields: { list: ['owner'], read: ['owner'] },
    });
    await f.execute(async (req) => {
      const include = {
        ...f.include('list', true),
        args: {
          select: ['name', 'note'],
          include: {
            model: f.targetName,
            path: 'nested',
            op: 'read',
            mode: 'correlated',
            id: { $parent: 'nextId' },
            args: { select: ['note'] },
          },
        },
      };
      const authorization = {
        related: {
          items: {
            model: f.targetName,
            outputFields: { mode: 'grant', paths: ['note'] },
            related: { nested: { model: f.targetName, outputFields: { mode: 'grant', paths: ['note'] } } },
          },
        },
      };
      const result = await req.macl
        .getService(f.parentName)
        .findOne(
          { _id: f.parents[0]._id },
          { include: [include, f.include('list', false, 'ordinary')] } as never,
          { ...quiet, authorization } as never,
        );
      expect(result, JSON.stringify(result)).toMatchObject({ success: true });
      if (!result.success) throw new Error(result.code);
      const data = result.data as any;
      expect(data.items[0]).toMatchObject({ name: 'a', note: 'note-a', nested: { note: 'note-b' } });
      expect(data.items[1]).not.toHaveProperty('name');
      expect(data.items[1].nested).toBeNull();
      expect(data.ordinary[0]).not.toHaveProperty('note');
      const target = req.macl.getService(f.targetName);
      const handle = result.context.getDocumentAuthorization(data.items[0]);
      expect(await target.pickAllowedFields(data.items[0], 'list', { documentAuthorization: handle! })).toHaveProperty(
        'note',
        'note-a',
      );
      await expect(
        target.pickAllowedFields(data.items[1], 'list', { documentAuthorization: handle! }),
      ).rejects.toThrow();
      expect(result.context.getDocumentAuthorization(data.items[0].nested)).toBeDefined();
    });
  });

  it.each(['create', 'update', 'upsert-create', 'upsert-update'])(
    'populate grants work after %s',
    async (operation) => {
      const f = await fixture();
      await f.execute(async (req) => {
        const svc = req.macl.getService(f.parentName);
        const args = { select: ['ref'], populate: [{ path: 'ref', select: ['note'] }] };
        const options = { ...quiet, authorization: f.grant('ref') } as never;
        const data = { name: 'new', ref: f.rows[0]._id };
        const result =
          operation === 'create'
            ? await svc.create(data, args, options)
            : operation === 'update'
              ? await svc.updateOne({ _id: f.parents[0]._id }, data, args, options)
              : await svc.upsert({ name: operation === 'upsert-create' ? 'absent' : 'p1' }, data, args, options);
        expect(result).toMatchObject({ success: true });
        if (!result.success) throw new Error(result.code);
        const output = Array.isArray(result.data) ? result.data[0] : result.data;
        expect(output).toMatchObject({ ref: { note: 'note-a' } });
      });
    },
  );

  it('validates mismatches, unused/duplicate paths, count dimensions and wire controls before target persistence', async () => {
    const f = await fixture();
    await f.execute(async (req) => {
      const svc = req.macl.getService(f.parentName);
      const cases = [
        [{ populate: ['ref'] }, { related: { ref: { model: 'wrong' } } }],
        [{ populate: ['ref'] }, { related: { typo: { model: f.targetName } } }],
        [{ populate: ['ref', 'ref'] }, f.grant('ref')],
        [
          { include: f.include('count') },
          { related: { items: { model: f.targetName, outputFields: { mode: 'request' } } } },
        ],
        [{ populate: [{ path: 'ref', authorization: f.grant('ref') }] }, {}],
        [{ include: { ...f.include('list'), options: { authorization: { rows: { mode: 'unrestricted' } } } } }, {}],
      ];
      for (const [args, authorization] of cases)
        expect(await svc.findOne({}, args as never, { ...quiet, authorization } as never)).toMatchObject({
          success: false,
          code: 'bad_request',
        });
      expect(f.calls).toHaveLength(0);
    });
  });

  it('false target scopes prevent correlated template subqueries and grants never flow to $$sq', async () => {
    const f = await fixture({ operationAccess: { list: false } });
    await f.execute(async (req) => {
      const svc = req.macl.getService(f.parentName);
      const filter = {
        group: { $parent: 'group' },
        name: { $$sq: { model: f.targetName, op: 'list', field: 'name' } },
      };
      const include = { ...f.include('list', true), filter };
      const policy = { model: f.targetName, operation: { mode: 'grant' }, rows: { mode: 'scope', filter: false } };
      expect(
        await svc.findOne(
          {},
          { include } as never,
          { ...quiet, authorization: { related: { items: policy } } } as never,
        ),
      ).toMatchObject({ success: false, code: 'forbidden' });
      policy.rows = { mode: 'unrestricted' } as never;
      expect(
        await svc.findOne(
          {},
          { include } as never,
          { ...quiet, authorization: { related: { items: policy } } } as never,
        ),
      ).toMatchObject({ success: false, code: 'unauthorized' });
      expect(f.calls).toHaveLength(0);
    });
  });

  it('shared populate/list outputs have one getter pass and isolated per-parent copies; misses retain shapes', async () => {
    const getter = vi.fn((doc) => `v:${doc.hidden}`);
    const f = await fixture({ virtuals: { computed: { dependsOn: ['hidden'], read: getter, list: getter } } });
    await f.execute(async (req) => {
      const result = await req.macl.getService(f.parentName).find(
        {},
        {
          select: ['ref', 'refs'],
          populate: [
            { path: 'ref', select: ['computed'] },
            { path: 'refs', select: ['note'] },
          ],
        },
        {
          ...quiet,
          includeCount: false,
          authorization: {
            outputFields: { mode: 'grant', paths: ['ref', 'refs'] },
            related: {
              ref: { model: f.targetName, outputFields: { mode: 'grant', paths: ['computed'] } },
              refs: { model: f.targetName, outputFields: { mode: 'grant', paths: ['note'] } },
            },
          },
        },
      );
      expect(result).toMatchObject({ success: true });
      if (!result.success) throw new Error(result.code);
      const rows = result.data as any[];
      expect(rows[0].ref).toEqual(rows[1].ref);
      expect(rows[0].ref).not.toBe(rows[1].ref);
      expect(getter).toHaveBeenCalledTimes(1);
      expect(rows[2].ref).toBeNull();
      expect(rows[2].refs).toEqual([]);
      expect(result.contexts[0].getDocumentAuthorization(rows[0].ref)).toBeDefined();
    });
  });

  it('custom populate access stays exact, and async policy/configuration mutation cannot widen the captured target', async () => {
    const getter = vi.fn((doc) => `custom:${doc.hidden}`);
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const f = await fixture(
      {
        operationAccess: { audit: false },
        permissionSchema: { note: false },
        virtuals: { computed: { dependsOn: ['hidden'], default: getter } },
      },
      {
        overrideFilter: {
          read: async () => {
            entered();
            await blocked;
            return {};
          },
        },
      },
    );
    await f.execute(async (req) => {
      const authorization = f.grant('ref', {
        operation: { mode: 'grant' },
        rows: { mode: 'scope', filter: { tenant: 'a' } },
      });
      authorization.related.ref.outputFields.paths.push('computed');
      const promise = req.macl
        .getService(f.parentName)
        .findOne({}, { select: ['ref'], populate: [{ path: 'ref', access: 'audit', select: ['note', 'computed'] }] }, {
          ...quiet,
          authorization,
        } as never);
      await ready;
      authorization.related.ref.outputFields.paths.splice(0);
      f.api.runtime.setModelOption(f.targetName, 'virtuals', {
        computed: { dependsOn: ['hidden'], default: () => 'replacement' },
      } as never);
      release();
      const result = await promise;
      expect(result).toMatchObject({ success: true, data: { ref: { note: 'note-a', computed: 'custom:private-a' } } });
      expect(getter).toHaveBeenCalledTimes(1);
    });
  });

  it('legacy list target getters run once per target with per-parent copies and request-default nested targets', async () => {
    const getter = vi.fn((doc) => `v:${doc.hidden}`);
    const f = await fixture({ virtuals: { computed: { dependsOn: ['hidden'], list: getter } } });
    await f.execute(async (req) => {
      const svc = req.macl.getService(f.parentName);
      const include = {
        ...f.include('list'),
        args: { select: ['computed', 'next'], populate: [{ path: 'next', select: ['note'] }] },
      };
      const result = await svc.find({}, { include } as never, {
        ...quiet,
        includeCount: false,
        authorization: {
          related: { items: { model: f.targetName, outputFields: { mode: 'unrestricted' } } },
        },
      });
      expect(result).toMatchObject({ success: true });
      if (!result.success) throw new Error(result.code);
      const rows = result.data as any[];
      expect(rows[0].items).toHaveLength(2);
      expect(rows[1].items).toHaveLength(2);
      expect(rows[2].items).toEqual([]);
      expect(rows[0].items[0]).not.toBe(rows[1].items[0]);
      expect(getter).toHaveBeenCalledTimes(2);
      expect(rows[0].items[0].next).not.toHaveProperty('note');
      expect(rows[0].items[0]).not.toHaveProperty('hidden');
      expect(rows[0].items[0]).not.toHaveProperty('group');
      const fresh = await svc.findOne({}, { include } as never, quiet);
      expect(JSON.stringify(fresh)).not.toContain('v:private');
      expect(getter).toHaveBeenCalledTimes(2);
    });
  });

  it.each(['disabled', 'stripped', 'limited'])(
    'related handles keep document and backend grants with %s metadata',
    async (posture) => {
      const hook = vi.fn((doc) => ({ owner: doc.owner === 'alice', other: true }));
      const f = await fixture({
        permissionSchema: { name: 'owner', note: false },
        docPermissions: { list: hook },
        alwaysSelectFields: { list: ['owner'] },
        ...(posture === 'stripped'
          ? { stripPermissionsField: true }
          : posture === 'limited'
            ? { exposedDocPermissionKeys: ['other'] }
            : { disableFieldPermissions: true }),
      });
      await f.execute(async (req) => {
        const result = await req.macl
          .getService(f.parentName)
          .findOne(
            { _id: f.parents[0]._id },
            { include: f.include('list') } as never,
            { ...quiet, authorization: f.grant('items') } as never,
          );
        expect(result).toMatchObject({ success: true });
        if (!result.success) throw new Error(result.code);
        const children = (result.data as any).items;
        expect(children[0]).toMatchObject({ name: 'a', note: 'note-a' });
        expect(children[1]).not.toHaveProperty('name');
        if (posture === 'stripped') expect(children[0]).not.toHaveProperty('_permissions');
        else expect(children[0]._permissions).toEqual({ _view: { $: '_' }, _edit: { $: '_' } });
        expect(children[0]).not.toHaveProperty('owner');
        const before = hook.mock.calls.length;
        expect(
          await req.macl.getService(f.targetName).pickAllowedFields(children[0], 'list', {
            documentAuthorization: result.context.getDocumentAuthorization(children[0])!,
          }),
        ).toMatchObject({ name: 'a', note: 'note-a' });
        expect(hook).toHaveBeenCalledTimes(before);
      });
    },
  );
});
