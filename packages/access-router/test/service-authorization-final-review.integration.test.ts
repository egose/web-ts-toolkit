import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccessRuntime } from '../src/runtime';
import { Core } from '../src/core';
import { runWithRuntime } from '../src/runtime-context';
import Permission from '../src/permission';
import { PERMISSIONS } from '../src/symbols';
import type { ModelRequest, RowAuthorization } from '../src/interfaces';
import { createServiceExecution } from '../src/acl/service-execution';
import { executePreparedCount, prepareModelQuery, readPreparedModelQuery } from '../src/acl/prepared-query';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();
let sequence = 0;
const quiet = { skim: true, includePermissions: false, includeFieldPermissions: false };
const noteGrant = { outputFields: { mode: 'grant' as const, paths: ['internalNote'] } };
const modes = ['request', 'scope', 'unrestricted'] as const;
const rows = (mode: (typeof modes)[number]): RowAuthorization =>
  mode === 'scope' ? { mode, filter: { tenant: 'b' } } : { mode };

async function fixture(
  options: Record<string, unknown> = {},
  targetOptions: Record<string, unknown> = {},
  registerTarget = true,
) {
  const name = `Sva11Review${++sequence}`;
  const targetName = `${name}Target`;
  const runtime = new AccessRuntime();
  const calls: Array<{ model: string; op: string; filter: unknown }> = [];
  const schema = new mongoose.Schema({
    status: String,
    tenant: String,
    ownerId: String,
    slug: String,
    marker: mongoose.Schema.Types.Mixed,
    internalNote: { type: String, select: false },
    ref: { type: mongoose.Schema.Types.ObjectId, ref: targetName },
  });
  for (const op of ['find', 'findOne', 'countDocuments'] as const)
    schema.pre(op, function () {
      calls.push({ model: this.model.modelName, op, filter: this.getFilter() });
    });
  const model = mongoose.model(name, schema);
  const target = mongoose.model(targetName, schema.clone());
  runtime.registerModelInstance(name, model);
  if (registerTarget) runtime.registerModelInstance(targetName, target);
  const defaults = {
    hydration: { find: 'lean', findOne: 'lean', findById: 'lean', publicRead: 'lean' },
    permissionSchema: { status: true, tenant: true, slug: true, ref: true },
    operationAccess: { list: true, read: true, count: true },
    stripPermissionsField: true,
  };
  runtime.setModelOptions(name, { ...defaults, ...options } as never);
  if (registerTarget) runtime.setModelOptions(targetName, { ...defaults, ...targetOptions } as never);
  runtime.setGlobalOptions({
    requestPermissionField: '_permissions',
    requestComplexity: { maxBulkConcurrency: 1, maxHookConcurrency: 1 },
    globalPermissions: () => [],
  });
  const request = {
    actor: 'original',
    _permissions: { user: true },
    [PERMISSIONS]: new Permission({ user: true }),
  } as unknown as ModelRequest;
  const run = <T>(fn: () => T) => runWithRuntime(runtime, fn);
  const service = run(() => {
    request.macl = new Core(request);
    return request.macl.getService(name);
  });
  const documents = await model.insertMany([
    { status: 'ready', tenant: 'a', ownerId: 'alice', slug: 'first', internalNote: 'note-a' },
    { status: 'ready', tenant: 'b', ownerId: 'bob', slug: 'second', internalNote: 'note-b' },
    { status: 'closed', tenant: 'a', ownerId: 'alice', slug: 'third', internalNote: 'note-c' },
  ]);
  return { name, targetName, runtime, request, service, model, target, documents, calls, run };
}

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^Sva11Review/);
});

describe('SVA-11 independent hook resolver review', () => {
  for (const shape of ['bare', 'default'] as const) {
    it.each(modes)(`${shape} row hooks preserve %s query/row separation and count scope`, async (mode) => {
      const transform = vi.fn(function (this: ModelRequest, _filter, permissions) {
        expect(this).toBe(f.request);
        expect(permissions.has('user')).toBe(true);
        return { status: 'ready' };
      });
      const base = vi.fn(() => ({ tenant: 'a' }));
      const f = await fixture({
        overrideFilter: shape === 'bare' ? transform : { default: transform },
        baseFilter: shape === 'bare' ? base : { default: base },
      });
      await f.run(async () => {
        const result = await f.service.find(
          { status: 'caller' },
          { select: ['status', 'internalNote'] },
          { ...quiet, includeCount: true, authorization: { ...noteGrant, rows: rows(mode) } },
        );
        expect(result).toMatchObject({
          success: true,
          count: mode === 'unrestricted' ? 2 : 1,
          totalCount: mode === 'unrestricted' ? 2 : 1,
        });
        if (!result.success) throw new Error('expected successful scoped query');
        expect(result.data.map((doc: any) => doc.internalNote)).toEqual(
          mode === 'unrestricted' ? ['note-a', 'note-b'] : [mode === 'scope' ? 'note-b' : 'note-a'],
        );
        expect(transform).toHaveBeenCalledTimes(1);
        expect(base).toHaveBeenCalledTimes(mode === 'request' ? 1 : 0);
        expect(f.calls).toHaveLength(2);
        expect(f.calls[0].filter).toEqual(f.calls[1].filter);
      });
    });

    it.each(modes)(`${shape} transform denial is terminal in %s mode`, async (mode) => {
      const transform = vi.fn(() => false);
      const f = await fixture({ overrideFilter: shape === 'bare' ? transform : { default: transform } });
      await f.run(async () => {
        const result = await f.service.findOne({}, {}, { ...quiet, authorization: { ...noteGrant, rows: rows(mode) } });
        expect(result).toMatchObject({ success: false, code: 'forbidden' });
        expect(transform).toHaveBeenCalledTimes(1);
        expect(f.calls).toEqual([]);
      });
    });
  }

  it('default document grants survive metadata/dependency trim and same-stage picks', async () => {
    const hook = vi.fn(function (this: ModelRequest, doc) {
      expect(this).toBe(f.request);
      return { owner: doc.ownerId === 'alice' };
    });
    const f = await fixture({
      permissionSchema: { status: 'owner' },
      alwaysSelectFields: { default: ['ownerId'] },
      docPermissions: { read: undefined, default: hook },
    });
    await f.run(async () => {
      const result = await f.service.findOne(
        { slug: 'first' },
        { select: ['status', 'internalNote'] },
        { ...quiet, authorization: noteGrant },
      );
      expect(result).toMatchObject({ success: true, data: { status: 'ready', internalNote: 'note-a' } });
      if (!result.success) throw new Error('expected successful output');
      expect(result.data).not.toHaveProperty('ownerId');
      expect(result.data).not.toHaveProperty('_permissions');
      const picked = await f.service.pickAllowedFields(result.data, 'read', {
        documentAuthorization: result.context.documentAuthorization,
      });
      expect(picked).toEqual(result.data);
      expect(hook).toHaveBeenCalledTimes(1);
    });
  });

  it.each([null, false])('an exact defined %s hook entry suppresses default fallback', async (entry) => {
    const fallback = vi.fn(() => false);
    const docFallback = vi.fn(() => ({ owner: true }));
    const f = await fixture({
      permissionSchema: { status: 'owner' },
      overrideFilter: { read: entry, default: fallback },
      baseFilter: { read: entry, default: fallback },
      docPermissions: { read: entry, default: docFallback },
    });
    await f.run(async () => {
      const result = await f.service.findOne(
        { slug: 'first' },
        { select: ['status', 'internalNote'] },
        { ...quiet, authorization: noteGrant },
      );
      expect(result).toMatchObject({ success: true, data: { internalNote: 'note-a' } });
      if (result.success) expect(result.data).not.toHaveProperty('status');
      expect(fallback).not.toHaveBeenCalled();
      expect(docFallback).not.toHaveBeenCalled();
    });
  });

  it('a captured default hook remains coherent across replacement and another call on the same service', async () => {
    let resume!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const barrier = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const initial = vi.fn(async () => {
      entered();
      await barrier;
      return { tenant: 'a' };
    });
    const replacement = vi.fn(() => false);
    const docHook = vi.fn((doc) => ({ owner: doc.ownerId === 'alice' }));
    const f = await fixture({
      overrideFilter: { default: initial },
      docPermissions: { default: docHook },
      permissionSchema: { status: 'owner' },
      alwaysSelectFields: ['ownerId'],
    });
    await f.run(async () => {
      const first = f.service.findOne(
        {},
        { select: ['status', 'internalNote'] },
        { ...quiet, authorization: noteGrant },
      );
      await started;
      f.runtime.setModelOption(f.name, 'overrideFilter', { default: replacement });
      f.runtime.setModelOption(f.name, 'docPermissions', { default: () => ({ owner: false }) });
      const second = await f.service.findOne({}, {}, quiet);
      resume();
      expect(await first).toMatchObject({ success: true, data: { status: 'ready', internalNote: 'note-a' } });
      expect(second).toMatchObject({ success: false, code: 'forbidden' });
      expect(initial).toHaveBeenCalledTimes(1);
      expect(replacement).toHaveBeenCalledTimes(1);
      expect(docHook).toHaveBeenCalledTimes(1);
    });
  });
});

describe('SVA-11 independent mandatory predicate review', () => {
  it('a native regex scope cannot disappear when intersected with a broader same-field regex', async () => {
    const f = await fixture();
    await f.run(async () => {
      const result = await f.service.find(
        { tenant: /^[ab]/ },
        { select: ['slug'] },
        { ...quiet, includeCount: true, authorization: { rows: { mode: 'scope', filter: { tenant: /^a/ } } } },
      );
      expect(result).toMatchObject({ success: true, count: 2, totalCount: 2 });
      if (result.success) expect(result.data.map((doc: any) => doc.slug)).toEqual(['first', 'third']);
    });
  });

  it('regex flags remain part of a trusted predicate rather than a JSON equality key', async () => {
    const f = await fixture();
    await f.run(async () => {
      expect(
        await f.service.find(
          { slug: /^FIRST/i },
          { select: ['slug'] },
          { ...quiet, includeCount: true, authorization: { rows: { mode: 'scope', filter: { slug: /^FIRST/ } } } },
        ),
      ).toMatchObject({ success: true, data: [], count: 0, totalCount: 0 });
    });
  });

  it('BSON ObjectId and equal-looking string scopes stay distinct on Mixed fields', async () => {
    const f = await fixture();
    const marker = new mongoose.Types.ObjectId();
    await f.model.updateOne({ slug: 'first' }, { marker });
    await f.run(async () => {
      expect(
        await f.service.find(
          { marker },
          { select: ['slug'] },
          {
            ...quiet,
            includeCount: true,
            authorization: { rows: { mode: 'scope', filter: { marker: marker.toHexString() } } },
          },
        ),
      ).toMatchObject({ success: true, data: [], count: 0, totalCount: 0 });
    });
  });

  it('mutable regex diagnostics cannot widen a privately prepared later count', async () => {
    const f = await fixture();
    await f.run(async () => {
      const execution = createServiceExecution(
        f.service,
        {
          operation: 'list',
          rowAccess: 'list',
          virtualAccess: 'list',
          outputAccess: 'list',
          docPermissionsAccess: 'list',
        },
        { rows: { mode: 'scope', filter: { tenant: /^a/ } } },
      );
      const query = await prepareModelQuery(f.service, execution, { kind: 'client-read', filter: { tenant: /^[ab]/ } });
      const diagnostic = readPreparedModelQuery(f.service, execution, query);
      const regex = (diagnostic.filter as any).$and[1].tenant as RegExp;
      regex.compile('^[ab]');
      expect(await executePreparedCount(f.service, execution, query)).toMatchObject({ success: true, data: 2 });
      expect(
        ((readPreparedModelQuery(f.service, execution, query).filter as any).$and[1].tenant as RegExp).source,
      ).toBe('^a');
    });
  });

  it('a related match survives transform rewriting and an independent regex scope', async () => {
    const transform = vi.fn(() => ({ tenant: /^[abc]/ }));
    const f = await fixture({}, { overrideFilter: { list: transform, count: transform } });
    await f.target.insertMany([
      { slug: 'allowed', tenant: 'a', ownerId: 'alice' },
      { slug: 'wrong-match', tenant: 'b', ownerId: 'alice' },
      { slug: 'wrong-scope', tenant: 'c', ownerId: 'alice' },
      { slug: 'wrong-join', tenant: 'a', ownerId: 'bob' },
    ]);
    await f.run(async () => {
      const result = await f.service.findOne(
        { slug: 'first' },
        {
          select: ['slug'],
          include: [
            {
              model: f.targetName,
              op: 'list',
              path: 'items',
              localField: 'ownerId',
              foreignField: 'ownerId',
              filter: { tenant: /^a/ },
              args: { select: ['slug'] },
            },
            {
              model: f.targetName,
              op: 'count',
              path: 'total',
              localField: 'ownerId',
              foreignField: 'ownerId',
              filter: { tenant: /^a/ },
            },
          ],
        },
        {
          ...quiet,
          authorization: {
            related: {
              items: { model: f.targetName, rows: { mode: 'scope', filter: { tenant: /^[ab]/ } } },
              total: { model: f.targetName, rows: { mode: 'scope', filter: { tenant: /^[ab]/ } } },
            },
          },
        },
      );
      expect(result).toMatchObject({ success: true, data: { items: [{ slug: 'allowed' }], total: 1 } });
      if (result.success) expect((result.data as any).items).toHaveLength(1);
      expect(transform).toHaveBeenCalledTimes(2);
    });
  });
});

describe('SVA-11 independent private-input lifetime review', () => {
  it('an include FK declared as a document-hook input survives until authorization, then stays private', async () => {
    const hook = vi.fn((doc) => ({ owner: doc.ownerId === 'alice' }));
    const f = await fixture(
      {},
      {
        permissionSchema: { status: 'owner' },
        alwaysSelectFields: { list: ['ownerId'] },
        docPermissions: { list: hook },
      },
    );
    await f.target.create({ ownerId: 'alice', status: 'visible', internalNote: 'backend', slug: 'hidden' });
    await f.run(async () => {
      const result = await f.service.findOne(
        { slug: 'first' },
        {
          select: ['slug'],
          include: {
            model: f.targetName,
            op: 'list',
            path: 'items',
            localField: 'ownerId',
            foreignField: 'ownerId',
            args: { select: ['status', 'internalNote'] },
          },
        },
        { ...quiet, authorization: { related: { items: { model: f.targetName, ...noteGrant } } } },
      );
      expect(result).toMatchObject({
        success: true,
        data: { items: [{ status: 'visible', internalNote: 'backend' }] },
      });
      if (!result.success) throw new Error('expected successful include');
      const child = (result.data as any).items[0];
      expect(child).not.toHaveProperty('ownerId');
      expect(child).not.toHaveProperty('slug');
      expect(child).not.toHaveProperty('_permissions');
      const handle = result.context.getDocumentAuthorization(child);
      expect(handle).toBeDefined();
      expect(
        await f.request.macl
          .getService(f.targetName)
          .pickAllowedFields(child, 'list', { documentAuthorization: handle! }),
      ).toEqual(child);
      expect(hook).toHaveBeenCalledTimes(1);
    });
  });

  it.each(['classified', 731, true])(
    'a descendant-only grant cannot expose a privately fetched scalar ancestor %j',
    async (value) => {
      const f = await fixture({ alwaysSelectFields: ['marker'] });
      await f.model.updateOne({ slug: 'first' }, { marker: value });
      await f.run(async () => {
        const authorization = { outputFields: { mode: 'grant' as const, paths: ['marker.visible'] } };
        const result = await f.service.findOne(
          { slug: 'first' },
          { select: ['marker.visible'] },
          { ...quiet, authorization },
        );
        expect(result.success).toBe(true);
        if (result.success) expect(result.data).not.toHaveProperty('marker');
        const picked = await f.service.pickAllowedFields({ marker: value }, 'read', { authorization });
        expect(picked).not.toHaveProperty('marker');
        expect(
          await f.service.pickAllowedFields({ marker: value }, 'read', {
            authorization: { outputFields: { mode: 'grant', paths: ['marker'] } },
          }),
        ).toEqual({ marker: value });
      });
    },
  );

  it('descendant projection preserves safe Mixed array positions and null containers', async () => {
    const f = await fixture({ alwaysSelectFields: ['marker'] });
    await f.model.updateOne(
      { slug: 'first' },
      { marker: ['classified', { visible: 'yes', secret: 'no' }, false, null] },
    );
    await f.run(async () => {
      const authorization = { outputFields: { mode: 'grant' as const, paths: ['marker.visible'] } };
      const result = await f.service.findOne(
        { slug: 'first' },
        { select: ['marker.visible'] },
        { ...quiet, authorization },
      );
      expect(result).toMatchObject({ success: true, data: { marker: [null, { visible: 'yes' }, null, null] } });
      expect(
        await f.service.pickAllowedFields(
          { marker: ['classified', { visible: 'yes', secret: 'no' }, false, null] },
          'read',
          { authorization },
        ),
      ).toEqual({ marker: [null, { visible: 'yes' }, null, null] });
      expect(await f.service.pickAllowedFields({ marker: null }, 'read', { authorization })).toEqual({ marker: null });
    });
  });
});

describe('SVA-11 independent opaque subtree review', () => {
  const value = {
    visible: 'yes',
    secret: 'hidden', // pragma: allowlist secret
    nested: { visible: 1, secret: 'hidden' }, // pragma: allowlist secret
    entries: [{ visible: 'kept', secret: 'hidden' }], // pragma: allowlist secret
  };
  for (const mode of ['grant', 'unrestricted'] as const) {
    const authorization = { outputFields: mode === 'grant' ? { mode, paths: ['marker'] } : { mode } };
    it(`${mode} applies descendant exclusions to opaque roots and keeps excluded values absent on later picks`, async () => {
      const f = await fixture();
      await f.model.updateOne({ slug: 'first' }, { marker: value });
      await f.run(async () => {
        const result = await f.service.findOne(
          { slug: 'first' },
          { select: ['marker', '-marker.secret', '-marker.nested.secret', '-marker.entries.secret'] },
          { ...quiet, authorization },
        );
        expect(result).toMatchObject({
          success: true,
          data: { marker: { visible: 'yes', nested: { visible: 1 }, entries: [{ visible: 'kept' }] } },
        });
        if (!result.success) throw new Error('expected selected opaque output');
        expect((result.data as any).marker).toEqual({
          visible: 'yes',
          nested: { visible: 1 },
          entries: [{ visible: 'kept' }],
        });
        expect(
          await f.service.pickAllowedFields(result.data, 'read', {
            documentAuthorization: result.context.documentAuthorization,
          }),
        ).toEqual(result.data);
      });
    });

    it(`${mode} covers an opaque subtree even when a dynamic child request rule is false`, async () => {
      const f = await fixture({ permissionSchema: { marker: { read: false, sub: { visible: false } } } });
      await f.model.updateOne({ slug: 'first' }, { marker: value });
      await f.run(async () => {
        const result = await f.service.findOne({ slug: 'first' }, { select: ['marker'] }, { ...quiet, authorization });
        expect(result).toMatchObject({ success: true, data: { marker: value } });
        if (!result.success) throw new Error('expected granted opaque output');
        expect(
          await f.service.pickAllowedFields(result.data, 'read', {
            documentAuthorization: result.context.documentAuthorization,
          }),
        ).toEqual(result.data);
        expect(await f.service.pickAllowedFields({ marker: value }, 'read', {})).toEqual({});
      });
    });
  }
});

describe('POP-01 unregistered-populate fail-closed controls (supersedes SVA-11 raw opt-out)', () => {
  it.each(['model', 'runtime-default'] as const)(
    'an effective empty %s target schema is valid and closes all business output in bypass mode',
    async (mode) => {
      const f = await fixture({}, { permissionSchema: mode === 'model' ? {} : undefined });
      if (mode === 'runtime-default') f.runtime.setDefaultModelOption('permissionSchema', {});
      f.runtime.setGlobalOptions({
        requireOperationAccessForPopulateQueries: false,
        requireOperationAccessForPopulateDependencies: false,
      });
      const target = await f.target.create({ slug: 'configured-target', ownerId: 'private', internalNote: 'private' });
      await f.model.updateOne({ slug: 'first' }, { ref: target._id });
      const result = await f.service.findOne(
        { slug: 'first' },
        { select: ['ref'], populate: [{ path: 'ref', select: ['slug', 'ownerId', 'internalNote'] }] },
        quiet,
      );
      expect(result).toMatchObject({ success: true, data: { ref: { _id: target._id } } });
      if (!result.success) throw new Error('expected configured closed-schema population');
      expect(Object.keys((result.data as any).ref)).toEqual(['_id']);
    },
  );

  it.each(['internal', 'public'] as const)(
    '%s execution rejects unconfigured targets before I/O despite both operation bypasses and legacy controls',
    async (entry) => {
      const f = await fixture({}, {}, false);
      const target = await f.target.create({ slug: 'raw-target', ownerId: 'private', internalNote: 'private' });
      await f.model.updateOne({ slug: 'first' }, { ref: target._id });
      await f.run(async () => {
        const service = f.request.macl.getPublicService(f.name);
        const args = { select: ['ref'], populate: [{ path: 'ref', select: ['slug'] }] };
        const query = () =>
          entry === 'internal'
            ? service.findOne({ slug: 'first' }, args, quiet)
            : service._read(String(f.documents[0]._id), args, { ...quiet, tryList: false });
        f.calls.length = 0;
        expect(await query()).toMatchObject({ success: false, code: 'bad_request' });
        f.runtime.setGlobalOptions({
          requireOperationAccessForPopulateQueries: false,
          requireOperationAccessForPopulateDependencies: false,
        });
        f.runtime.setGlobalOption('requireRegisteredPopulateModels' as never, false as never);
        f.runtime.setGlobalOption('requireReadOperationAccessForPopulateDependencies' as never, false as never);
        const result = await query();
        expect(result).toMatchObject({
          success: false,
          code: 'bad_request',
          errors: [{ detail: expect.stringContaining(`Populate target "${f.targetName}"`) }],
        });
        expect(f.calls).toEqual([]);
        expect(
          await service.pickAllowedFields({ ref: { _id: target._id, slug: 'forged' } }, 'read', {
            authorization: { outputFields: { mode: 'grant', paths: ['ref'] } },
          }),
        ).toEqual({ ref: target._id });
        f.calls.length = 0;
        expect(
          await service.findOne({}, args, {
            ...quiet,
            authorization: { related: { ref: { model: f.targetName, outputFields: { mode: 'unrestricted' } } } },
          }),
        ).toMatchObject({ success: false, code: 'bad_request' });
        expect(f.calls).toEqual([]);
      });
    },
  );

  it('both public upsert branches reject unconfigured output targets before persistence', async () => {
    const f = await fixture({}, {}, false);
    const target = await f.target.create({ slug: 'raw-target', ownerId: 'private' });
    f.runtime.setGlobalOptions({
      requireOperationAccessForPopulateQueries: false,
      requireOperationAccessForPopulateDependencies: false,
    });
    await f.run(async () => {
      const service = f.request.macl.getPublicService(f.name);
      const args = { select: ['ref'], populate: [{ path: 'ref', select: ['slug'] }] };
      const data = { ref: target._id, internalNote: 'denied-write' };
      f.calls.length = 0;
      const insert = vi.spyOn(f.model.collection, 'insertOne');
      const update = vi.spyOn(f.model.collection, 'updateOne');
      expect(await service._upsert({ ...data, slug: 'created' }, args, quiet)).toMatchObject({
        success: false,
        code: 'bad_request',
      });
      expect(await service._upsert({ ...data, _id: String(f.documents[0]._id) }, args, quiet)).toMatchObject({
        success: false,
        code: 'bad_request',
      });
      expect(f.calls).toEqual([]);
      expect(insert).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      expect(await f.model.findOne({ slug: 'created' }).lean()).toBeNull();
      expect((await f.model.findById(f.documents[0]._id).select('+internalNote').lean())!.internalNote).toBe('note-a');
    });
  });
});
