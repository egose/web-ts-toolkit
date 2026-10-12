import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../dist/index.mjs';
import type { ModelRequest } from '../src/interfaces';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();
let sequence = 0;
const runtimes: Array<{ clearOpenApiRoutes(): void }> = [];
afterEach(() => {
  runtimes.splice(0).forEach((runtime) => runtime.clearOpenApiRoutes());
  mongoose.deleteModel(/^SvaF02/);
  vi.restoreAllMocks();
});
const operation = { mode: 'grant' as const };
const rows = { mode: 'unrestricted' as const };
const gate = { operation, rows };
const grant = (...paths: string[]) => ({ mode: 'grant' as const, paths });

async function fixture(extra: Record<string, unknown> = {}, limits: Record<string, number> = {}) {
  const name = `SvaF02Parent${++sequence}`,
    targetName = `SvaF02Target${sequence}`;
  const api = createAccessRuntime();
  runtimes.push(api.runtime);
  api.setGlobalOptions({
    globalPermissions: () => [],
    requestComplexity: { maxBulkConcurrency: 1, maxHookConcurrency: 1, ...limits },
  });
  const Target = mongoose.model(targetName, new mongoose.Schema({ label: String, secret: String, tenant: String }));
  const leaf = new mongoose.Schema({ value: String, denied: String }, { strict: false });
  const child = new mongoose.Schema(
    {
      label: String,
      secret: { type: String, select: false },
      visible: Boolean,
      listed: Boolean,
      nested: { value: String, denied: String },
      pieces: [leaf],
      payload: mongoose.Schema.Types.Mixed,
      ref: { type: mongoose.Schema.Types.ObjectId, ref: targetName },
      authorization: String,
      overrides: String,
      gateWrite: String,
      gateRead: String,
      quantity: { type: Number, min: 0 },
    },
    { strict: false },
  );
  const schema = new mongoose.Schema({ key: String, owner: String, items: [child], other: [child] }, { strict: false });
  const saves = vi.fn();
  schema.pre('save', function () {
    saves(this.toObject({ virtuals: false }));
  });
  const Parent = mongoose.model(name, schema);
  const stages: Array<{
    access: string;
    operation: string;
    owner: unknown;
    secret: unknown;
    hydrated: boolean;
    count: number;
  }> = [];
  const hook = (access: string) =>
    vi.fn((doc, _permissions, context) => {
      stages.push({
        access,
        operation: context.operation,
        owner: doc.owner,
        secret: doc.items?.[0]?.secret,
        hydrated: doc instanceof mongoose.Document,
        count: doc.items?.length,
      });
      return {
        write: doc.owner === 'owner-a' && doc.items?.[0]?.secret === 'old', // pragma: allowlist secret
        read: doc.items?.[0]?.secret === 'new', // pragma: allowlist secret
      };
    });
  const updateHook = hook('update'),
    readHook = hook('read');
  const getter = vi.fn((doc, _permissions, context) => `${context.virtualAccess}:${doc.secret}`);
  api.createRouter(Target, {
    basePath: '/target',
    operationAccess: { read: true },
    permissionSchema: { label: true, secret: false },
    baseFilter: { read: () => ({ tenant: 'a' }) },
  });
  const router = api.createRouter(Parent, {
    basePath: '/parents',
    stripPermissionsField: true,
    operationAccess: {
      read: true,
      update: true,
      subs: { items: { list: true, read: true, create: true, update: true, delete: true } },
    },
    baseFilter: {
      read: () => ({ owner: 'owner-a' }),
      update: () => ({ owner: 'owner-a' }),
      subs: {
        items: {
          list: () => ({ listed: true }),
          read: () => ({ visible: true }),
          update: () => ({ visible: true }),
          delete: () => ({ visible: true }),
        },
      },
    },
    permissionSchema: {
      items: {
        read: false,
        list: false,
        sub: {
          label: true,
          secret: false,
          visible: { create: true, update: true },
          listed: { create: true, update: true },
          nested: false,
          pieces: false,
          payload: false,
          ref: true,
          authorization: true,
          overrides: true,
          gateWrite: { update: 'write', read: false },
          gateRead: { read: 'read', list: 'read' },
          quantity: true,
          badge: false,
        },
      },
    },
    docPermissions: { update: updateHook, read: readHook },
    virtuals: { items: { sub: { badge: { dependsOn: ['secret'], get: getter } } } },
    ...extra,
  } as never);
  const root = api.createRouter({ basePath: '/root', operationAccess: true });
  const target = await Target.create({ label: 'target', secret: 'target-secret', tenant: 'a' }); // pragma: allowlist secret
  const targetHidden = await Target.create({ label: 'hidden-target', secret: 'hidden-secret', tenant: 'b' }); // pragma: allowlist secret
  const seed = (owner: string) => ({
    owner,
    key: owner,
    items: [
      {
        label: 'one',
        secret: 'old', // pragma: allowlist secret
        visible: true,
        listed: true,
        ref: target._id,
        nested: { value: 'v', denied: 'keep' },
        pieces: [
          { value: 'a', denied: 'keep-a' },
          { value: 'b', denied: 'keep-b' },
        ],
        gateRead: 'reader',
      },
      {
        label: 'two',
        secret: 'second', // pragma: allowlist secret
        visible: false,
        listed: false,
        ref: targetHidden._id,
        pieces: [{ value: 'c', denied: 'keep-c' }],
      },
      { label: 'three', secret: 'third', visible: true, listed: false }, // pragma: allowlist secret
    ],
    other: [{ label: 'other', secret: 'other-secret' }], // pragma: allowlist secret
  });
  const parent = await Parent.create(seed('owner-a')),
    other = await Parent.create(seed('owner-b'));
  saves.mockClear();
  const app = express();
  app.use(express.json());
  app.use(router.routes);
  app.use(root.routes);
  let callback: (req: ModelRequest) => Promise<void>, failure: unknown;
  router.router.post('/probe', async (req, res) => {
    try {
      await callback(req as unknown as ModelRequest);
    } catch (error) {
      failure = error;
    }
    res.json({ ok: true });
  });
  const id = String(parent._id),
    ids = parent.items.map((row) => String(row._id));
  return {
    app,
    api,
    router,
    Parent,
    Target,
    name,
    targetName,
    parent,
    other,
    id,
    ids,
    saves,
    stages,
    updateHook,
    readHook,
    getter,
    reload: () => Parent.collection.findOne({ _id: parent._id }),
    async execute(run: (service: any, req: ModelRequest) => Promise<void>) {
      callback = (req) => run(req.macl.getService(name), req);
      failure = undefined;
      await request(app).post('/parents/probe').send({}).expect(200);
      if (failure) throw failure;
    },
  };
}

const methods = ['list', 'read', 'create', 'update', 'bulkUpdate', 'delete'] as const;
type Method = (typeof methods)[number];
function invoke(service: any, f: Awaited<ReturnType<typeof fixture>>, method: Method, authorization: unknown) {
  const options = { authorization };
  switch (method) {
    case 'list':
      return service.listSub(f.id, 'items', options);
    case 'read':
      return service.readSub(f.id, 'items', f.ids[0], options);
    case 'create':
      return service.createSub(f.id, 'items', { label: 'added', visible: true, listed: true }, options);
    case 'update':
      return service.updateSub(f.id, 'items', f.ids[0], { label: 'changed' }, options);
    case 'bulkUpdate':
      return service.bulkUpdateSub(f.id, 'items', [{ _id: f.ids[0], label: 'changed' }], options);
    case 'delete':
      return service.deleteSub(f.id, 'items', f.ids[0], options);
  }
}

describe('F02 dedicated parent/child capabilities', () => {
  it.each(['create', 'update', 'bulkUpdate'] as const)(
    'F04 %s bounds nested JS/array input before owner hooks and save',
    async (method) => {
      const f = await fixture({}, { maxNodes: 64, maxDepth: 8 });
      const before = await f.reload();
      class Cyclic {
        self = this;
      }
      const cycle = new Map<string, unknown>();
      cycle.set('self', cycle);
      let deep: unknown = 'leaf';
      for (let index = 0; index < 12; index++) deep = { child: deep };
      const invalid = [new Cyclic(), cycle, deep, Array(70).fill('value'), new Array(70)];
      await f.execute(async (service, req) => {
        const write = (receiver, payload, options) =>
          method === 'create'
            ? receiver.createSub(f.id, 'items', { payload }, options)
            : method === 'update'
              ? receiver.updateSub(f.id, 'items', f.ids[0], { payload }, options)
              : receiver.bulkUpdateSub(f.id, 'items', [{ _id: f.ids[0], payload }], options);
        for (const payload of invalid) {
          expect(
            await write(service, payload, { authorization: { child: { inputFields: grant('payload') } } }),
          ).toMatchObject({ success: false, code: 'bad_request' });
          expect(await write(req.macl.getPublicService(f.name), payload, undefined)).toMatchObject({
            success: false,
            code: 'bad_request',
          });
        }
        expect(f.updateHook).not.toHaveBeenCalled();
        expect(f.readHook).not.toHaveBeenCalled();
        expect(f.saves).not.toHaveBeenCalled();
        expect(await f.reload()).toEqual(before);
        expect(
          await write(service, new Map([['value', 'bounded']]), {
            authorization: { child: { inputFields: grant('payload') } },
          }),
        ).toMatchObject({ success: true });
        const stored = (await f.reload())!.items;
        expect((method === 'create' ? stored.at(-1) : stored[0]).payload).toEqual({ value: 'bounded' });
        expect(f.saves).toHaveBeenCalledOnce();
      });
    },
  );

  it.each(methods)('%s operation grants authorize exactly one scope', async (method) => {
    const f = await fixture({
      operationAccess: {
        read: false,
        update: false,
        subs: { items: { list: false, read: false, create: false, update: false, delete: false } },
      },
    });
    await f.execute(async (service) => {
      for (const authorization of [{}, { parent: { operation } }, { child: { operation } }])
        expect(await invoke(service, f, method, authorization)).toMatchObject({ success: false, code: 'forbidden' });
      expect(f.saves).not.toHaveBeenCalled();
      expect((await f.reload())!.items.map((row) => row.label)).toEqual(['one', 'two', 'three']);
      const result = await invoke(service, f, method, { parent: { operation }, child: { operation } });
      expect(result.success).toBe(true);
      const stored = (await f.reload())!.items;
      if (method === 'create') {
        expect(stored).toHaveLength(4);
        expect(result.data).toEqual([]);
      }
      if (method === 'update' || method === 'bulkUpdate') {
        expect(stored[0].label).toBe('changed');
        expect(result.data).toEqual(method === 'update' ? null : []);
      }
      if (method === 'delete') {
        expect(stored).toHaveLength(2);
        expect(String(result.data)).toBe(f.ids[0]);
      }
    });
  });

  it.each(['list', 'read', 'update', 'bulkUpdate', 'delete'] as const)(
    '%s rows remain independent of operation and the other scope',
    async (method) => {
      const f = await fixture({
        baseFilter: {
          read: () => false,
          update: () => false,
          subs: { items: { list: () => false, read: () => false, update: () => false, delete: () => false } },
        },
      });
      await f.execute(async (service) => {
        for (const authorization of [
          { parent: { operation }, child: gate },
          { parent: gate, child: { operation } },
        ])
          expect((await invoke(service, f, method, authorization)).success).toBe(false);
        expect(f.saves).not.toHaveBeenCalled();
        const result = await invoke(service, f, method, { parent: gate, child: gate });
        expect(result.success).toBe(true);
        if (method === 'list') expect(result.count).toBe(3);
        if (method === 'delete') expect((await f.reload())!.items).toHaveLength(2);
        if (method === 'update' || method === 'bulkUpdate') expect((await f.reload())!.items[0].label).toBe('changed');
      });
    },
  );

  it.each(['request', 'scope', 'unrestricted'] as const)(
    'transforms execute once with %s rows; parent ID, owner and child selection survive rewriting',
    async (mode) => {
      const parentTransform = vi.fn(() => ({})),
        childTransform = vi.fn(() => ({}));
      const f = await fixture({
        idField: 'key',
        overrideFilter: {
          read: parentTransform,
          update: parentTransform,
          subs: { items: { read: childTransform, update: childTransform, delete: childTransform } },
        },
      });
      await f.execute(async (service) => {
        const rowPolicy = mode === 'scope' ? { mode, filter: { owner: 'owner-b' } } : { mode };
        const childRows = mode === 'scope' ? { mode, filter: { label: 'two' } } : { mode };
        const policy = { parent: { operation, rows: rowPolicy }, child: { operation, rows: childRows } };
        const result = await service.readSub('missing-key', 'items', f.ids[0], { authorization: policy });
        expect(result).toMatchObject({ success: false, code: 'not_found' });
        expect(parentTransform).toHaveBeenCalledTimes(1);
        const read = await service.readSub('owner-a', 'items', f.ids[1], { authorization: policy });
        if (mode === 'unrestricted') expect(read.data.label).toBe('two');
        else expect(read.success).toBe(false);
        // A foreign parent's child cannot be selected even with all rows and rewriting.
        const foreign = await service.updateSub(
          'owner-a',
          'items',
          String(f.other.items[0]._id),
          { label: 'attack' },
          { authorization: { parent: gate, child: gate } },
        );
        expect(foreign).toMatchObject({ success: false, code: 'not_found' });
        const bulk = await service.bulkUpdateSub('owner-a', 'items', [{ _id: f.ids[1], label: 'only-two' }], {
          authorization: { parent: gate, child: gate },
        });
        expect(bulk.success).toBe(true);
        expect((await f.reload())!.items.map((row) => row.label)).toEqual(['one', 'only-two', 'three']);
        expect((await f.Parent.collection.findOne({ _id: f.other._id }))!.items[0].label).toBe('one');
        const deletion = await service.deleteSub('owner-a', 'items', f.ids[1], {
          authorization: { parent: gate, child: gate },
        });
        expect(deletion.success).toBe(true);
        expect((await f.reload())!.items.map((row) => row.label)).toEqual(['one', 'three']);
      });
    },
  );

  it.each(['parent', 'child', 'identifier', 'transform'] as const)(
    'false %s is terminal even under grants',
    async (denial) => {
      const identifier = vi.fn(() => (denial === 'identifier' ? false : {}));
      const transform = vi.fn(() => (denial === 'transform' ? false : {}));
      const f = await fixture({ resolveIdFilter: identifier, overrideFilter: { update: transform } });
      await f.execute(async (service) => {
        const policy = {
          parent: { ...gate, ...(denial === 'parent' ? { rows: { mode: 'scope', filter: false } } : {}) },
          child: { ...gate, ...(denial === 'child' ? { rows: { mode: 'scope', filter: false } } : {}) },
        };
        expect(
          (await service.updateSub(f.id, 'items', f.ids[0], { label: 'attack' }, { authorization: policy })).success,
        ).toBe(false);
        expect(f.saves).not.toHaveBeenCalled();
        expect((await f.reload())!.items[0].label).toBe('one');
        if (denial === 'parent' || denial === 'child') {
          expect(identifier).not.toHaveBeenCalled();
          expect(transform).not.toHaveBeenCalled();
        }
        if (denial === 'identifier') expect(transform).not.toHaveBeenCalled();
      });
    },
  );

  it('in-place query transforms cannot mutate mandatory parent or selected-child predicates', async () => {
    const rewrite = (query) => {
      for (const key of Object.keys(query)) delete query[key];
      return query;
    };
    const f = await fixture({
      overrideFilter: {
        read: rewrite,
        update: rewrite,
        subs: { items: { read: rewrite, update: rewrite, delete: rewrite } },
      },
    });
    await f.execute(async (service) => {
      const authorization = { parent: gate, child: gate };
      expect(await service.getParentDoc(String(new mongoose.Types.ObjectId()), 'items')).toBeNull();
      expect(
        await service.readSub(String(new mongoose.Types.ObjectId()), 'items', f.ids[0], { authorization }),
      ).toMatchObject({ success: false, code: 'not_found' });
      expect(await service.readSub(f.id, 'items', f.ids[1], { authorization })).toMatchObject({
        success: true,
        data: { label: 'two' },
      });
      expect(
        await service.updateSub(f.id, 'items', String(f.other.items[0]._id), { label: 'attack' }, { authorization }),
      ).toMatchObject({ success: false, code: 'not_found' });
      const updated = await service.updateSub(f.id, 'items', f.ids[1], { label: 'only-two' }, { authorization });
      expect(updated.success).toBe(true);
      expect((await f.reload())!.items.map((row) => row.label)).toEqual(['one', 'only-two', 'three']);
      expect((await service.deleteSub(f.id, 'items', f.ids[1], { authorization })).success).toBe(true);
      expect((await f.reload())!.items.map((row) => row.label)).toEqual(['one', 'three']);
    });
  });

  it('false list input skips identifiers and operation/row hooks before persistence', async () => {
    const identifier = vi.fn(() => ({})),
      transform = vi.fn(() => ({})),
      guard = vi.fn(() => true);
    const f = await fixture({
      resolveIdFilter: identifier,
      overrideFilter: { read: transform },
      operationAccess: { read: guard, subs: { items: { list: guard } } },
    });
    await f.execute(async (service) => {
      const fetch = vi.spyOn(service, 'findRawParentDoc');
      expect(await service.listSub(f.id, 'items', { filter: false, authorization: {} })).toMatchObject({
        success: false,
        code: 'forbidden',
      });
      expect(identifier).not.toHaveBeenCalled();
      expect(transform).not.toHaveBeenCalled();
      expect(guard).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  it('captures identifier configuration before awaiting operation hooks', async () => {
    let change = () => {};
    const f = await fixture({
      idField: 'key',
      operationAccess: {
        read: () => {
          change();
          return true;
        },
        subs: { items: { read: true } },
      },
    });
    await f.execute(async (service) => {
      change = () => f.router.setOption('resolveIdFilter', () => ({}));
      expect(await service.readSub('missing-key', 'items', f.ids[0], { authorization: {} })).toMatchObject({
        success: false,
        code: 'not_found',
      });
    });
  });

  it('scoped writes exclude incoming virtuals without editing unrelated stored children', async () => {
    const f = await fixture();
    await f.Parent.collection.updateOne({ _id: f.parent._id }, { $set: { 'items.1.badge': 'stored-legacy-value' } });
    await f.execute(async (service) => {
      const result = await service.updateSub(
        f.id,
        'items',
        f.ids[0],
        { secret: 'new', badge: 'incoming' }, // pragma: allowlist secret
        {
          authorization: { child: { inputFields: { mode: 'unrestricted' } } },
        },
      );
      expect(result.success).toBe(true);
      const stored = (await f.reload())!;
      expect(stored.items[0]).not.toHaveProperty('badge');
      expect(stored.items[1].badge).toBe('stored-legacy-value');
      expect(stored.other[0].secret).toBe('other-secret');
    });
  });

  it('business success:false on the owning parent cannot impersonate a service error or return raw data', async () => {
    const f = await fixture();
    await f.Parent.collection.updateOne({ _id: f.parent._id }, { $set: { success: false } });
    await f.execute(async (service) => {
      const result = await service.updateSub(
        f.id,
        'items',
        f.ids[0],
        { secret: 'new' }, // pragma: allowlist secret
        {
          authorization: { child: { inputFields: grant('secret') } },
        },
      );
      expect(result).toMatchObject({ success: true, kind: 'single', code: 'success' });
      expect(result).not.toHaveProperty('owner');
      expect(result).not.toHaveProperty('items');
      expect((await f.reload())!.items[0].secret).toBe('new');
    });
  });

  it('keeps scope marker operands inert and validates malformed predicates before effects', async () => {
    const f = await fixture();
    await f.Parent.collection.updateOne(
      { _id: f.parent._id },
      { $set: { 'items.0.payload': { $$sq: { name: 'not-a-model' } } } },
    );
    await f.execute(async (service) => {
      const result = await service.listSub(f.id, 'items', {
        authorization: {
          child: { rows: { mode: 'scope', filter: { payload: { $eq: { $$sq: { name: 'not-a-model' } } } } } },
        },
      });
      expect(result).toMatchObject({ success: true, count: 1 });
      for (const filter of [
        { label: { $notAnOperator: true } },
        { $where: 'attack' },
        { missing: true },
        { $and: [] },
        null,
        { pieces: { $not: { $elemMatch: { absent: 'bad-path' } } } },
        { pieces: { $elemMatch: { value: { $exists: 'invalid' } } } },
      ]) {
        expect(
          await service.updateSub(
            f.id,
            'items',
            f.ids[0],
            { label: 'attack' },
            { authorization: { child: { rows: { mode: 'scope', filter } } } },
          ),
        ).toMatchObject({ success: false, code: 'bad_request' });
      }
      expect(f.saves).not.toHaveBeenCalled();
    });
  });

  it('admits protected writes separately from output and preserves child array/sibling identities', async () => {
    const f = await fixture();
    await f.execute(async (service) => {
      const result = await service.updateSub(
        f.id,
        'items',
        f.ids[0],
        {
          secret: 'new', // pragma: allowlist secret
          nested: { value: 'changed', denied: 'attack' },
          pieces: [
            { _id: new mongoose.Types.ObjectId(), value: 'patched', denied: 'attack' },
            null,
            { value: 'excess' },
          ],
          badge: 'forged',
          _permissions: { read: true },
          gateWrite: 'privately-admitted',
        },
        { authorization: { child: { inputFields: grant('secret', 'nested.value', 'pieces.value') } } },
      );
      expect(result.success).toBe(true);
      expect(result.data).not.toHaveProperty('secret');
      expect(result.data).not.toHaveProperty('badge');
      expect(result.data.gateRead).toBe('reader');
      const stored = (await f.reload())!;
      expect(stored.items).toHaveLength(3);
      expect(stored.items[0]).toMatchObject({
        secret: 'new', // pragma: allowlist secret
        nested: { value: 'changed', denied: 'keep' },
        gateWrite: 'privately-admitted',
      });
      expect(stored.items[0].pieces).toHaveLength(2);
      expect(stored.items[0].pieces[0]).toMatchObject({ value: 'patched', denied: 'keep-a' });
      expect(stored.items[0].pieces[1]).toMatchObject({ value: 'b', denied: 'keep-b' });
      expect(String(stored.items[0].pieces[0]._id)).toBe(String(f.parent.items[0].pieces[0]._id));
      expect(stored.items[0]).not.toHaveProperty('badge');
      expect(stored.items[0]).not.toHaveProperty('_permissions');
      expect(f.stages).toEqual([
        { access: 'update', operation: 'subUpdate', owner: 'owner-a', secret: 'old', hydrated: true, count: 3 }, // pragma: allowlist secret
        { access: 'read', operation: 'subUpdate', owner: 'owner-a', secret: 'new', hydrated: false, count: 3 }, // pragma: allowlist secret
      ]);
      expect(f.saves).toHaveBeenCalledTimes(1);
    });
  });

  it('explicit containers replace nested structure, scrub JS virtual/control keys, and keep Mongoose validation', async () => {
    const f = await fixture();
    class Input {
      value = 'replacement';
      denied = 'explicit';
      badge = 'virtual';
      _permissions = { forged: true };
      unknown = 'extra';
    }
    await f.execute(async (service) => {
      const result = await service.updateSub(
        f.id,
        'items',
        f.ids[0],
        { pieces: [new Input()], nested: { value: 'only' } },
        { authorization: { child: { inputFields: grant('pieces', 'nested') } } },
      );
      expect(result.success).toBe(true);
      const stored = (await f.reload())!.items[0];
      expect(stored.pieces).toHaveLength(1);
      expect(stored.pieces[0]).toMatchObject({ value: 'replacement', denied: 'explicit' });
      expect(stored.pieces[0]).not.toHaveProperty('_permissions');
      expect(stored.pieces[0]).not.toHaveProperty('unknown');
      expect(stored.nested).toEqual({ value: 'only' });
      await expect(
        service.updateSub(
          f.id,
          'items',
          f.ids[0],
          { quantity: -1 },
          { authorization: { child: { inputFields: { mode: 'unrestricted' } } } },
        ),
      ).rejects.toThrow(/validation/i);
      expect((await f.reload())!.items[0]).not.toHaveProperty('quantity');
    });
  });

  it('visibility output grants alone cannot write and granted Mixed containers retain virtual-name exclusion', async () => {
    const f = await fixture();
    class Payload {
      business = 'kept';
      badge = 'virtual-input';
      _permissions = { forged: true };
    }
    await f.execute(async (service) => {
      const result = await service.updateSub(
        f.id,
        'items',
        f.ids[0],
        { secret: 'denied', payload: new Payload() }, // pragma: allowlist secret
        {
          authorization: {
            child: { inputFields: grant('payload') },
            visibility: { child: { outputFields: grant('secret') } },
          },
        },
      );
      expect(result).toMatchObject({ success: true, data: { secret: 'old' } }); // pragma: allowlist secret
      expect((await f.reload())!.items[0]).toMatchObject({ secret: 'old', payload: { business: 'kept' } }); // pragma: allowlist secret
      expect((await f.reload())!.items[0].payload).not.toHaveProperty('badge');
      expect((await f.reload())!.items[0].payload).not.toHaveProperty('_permissions');
    });
  });

  it.each(['update', 'bulkUpdate', 'create'] as const)(
    '%s persistence is successful when visibility is denied; explicit read grants are separate',
    async (method) => {
      const f = await fixture({
        operationAccess: {
          read: false,
          update: true,
          subs: { items: { read: false, list: false, create: true, update: true } },
        },
      });
      await f.execute(async (service) => {
        const mutation = { child: { inputFields: grant('secret') } };
        const write = (authorization) =>
          method === 'update'
            ? service.updateSub(f.id, 'items', f.ids[0], { secret: 'new' }, { authorization }) // pragma: allowlist secret
            : method === 'bulkUpdate'
              ? service.bulkUpdateSub(
                  f.id,
                  'items',
                  [
                    { _id: f.ids[0], secret: 'new' }, // pragma: allowlist secret
                    { _id: f.ids[2], secret: 'bulk' }, // pragma: allowlist secret
                  ],
                  { authorization },
                )
              : service.createSub(
                  f.id,
                  'items',
                  { label: 'added', secret: 'new', visible: true, listed: true }, // pragma: allowlist secret
                  { authorization, addFirst: true },
                );
        expect(await write(mutation)).toMatchObject({ success: true, data: method === 'update' ? null : [] });
        expect((await f.reload())!.items[0].secret).toBe('new');
        const visibility = { parent: gate, child: { ...gate, outputFields: grant('secret', 'badge') } };
        const result = await write({ ...mutation, visibility });
        if (method === 'create') {
          expect(result.data).toEqual([]); // list grant is independently required
          const visible = await write({ ...mutation, visibility: { ...visibility, list: gate } });
          expect(visible.count).toBe(6);
          expect(visible.data[0]).toMatchObject({ secret: 'new' }); // pragma: allowlist secret
        } else if (method === 'update')
          expect(result.data).toMatchObject({ secret: 'new' }); // pragma: allowlist secret
        else {
          expect(result.count).toBe(2);
          expect(result.data.map((row) => row.secret)).toEqual(['new', 'bulk']);
        }
        expect(f.getter).toHaveBeenCalled();
      });
    },
  );

  it('create fields/array structure and read/list row intersections have exact cardinality', async () => {
    const f = await fixture();
    await f.execute(async (service) => {
      const result = await service.createSub(
        f.id,
        'items',
        [
          { label: 'new-visible', secret: 'new', visible: true, listed: true, pieces: [{ value: 'no-array' }] }, // pragma: allowlist secret
          { label: 'new-hidden', secret: 'new', visible: true, listed: false }, // pragma: allowlist secret
        ],
        {
          authorization: {
            child: { inputFields: grant('secret', 'pieces.value') },
            visibility: { child: { outputFields: grant('secret') } },
          },
        },
      );
      expect(result.data.map((row) => row.label)).toEqual(['one', 'new-visible']);
      expect(result.count).toBe(2);
      const stored = (await f.reload())!;
      expect(stored.items).toHaveLength(5);
      expect(stored.items[3].pieces).toEqual([]);
      expect(stored.items[3].secret).toBe('new');
      expect(f.updateHook).not.toHaveBeenCalled();
      const empty = await service.createSub(f.id, 'items', [], {
        authorization: { visibility: { parent: gate, child: gate, list: gate } },
      });
      expect(empty.count).toBe(5);
      const created = await service.createSub(
        f.id,
        'items',
        { pieces: [{ value: 'array', denied: 'granted' }], badge: 'forged', _permissions: { all: true } },
        { authorization: { child: { inputFields: { mode: 'unrestricted' } } } },
      );
      expect(created.success).toBe(true);
      const last = (await f.reload())!.items[5];
      expect(last.pieces[0]).toMatchObject({ value: 'array', denied: 'granted' });
      expect(last).not.toHaveProperty('badge');
      expect(last).not.toHaveProperty('_permissions');
    });
  });

  it('visibility grants cannot substitute unrelated parents or nonselected child rows', async () => {
    const f = await fixture();
    await f.execute(async (service) => {
      const write = (visibility) =>
        service.updateSub(
          f.id,
          'items',
          f.ids[0],
          { secret: 'new' }, // pragma: allowlist secret
          {
            authorization: { child: { inputFields: grant('secret') }, visibility },
          },
        );
      const output = { ...gate, outputFields: grant('secret') };
      expect(
        await write({ parent: { operation, rows: { mode: 'scope', filter: { owner: 'owner-b' } } }, child: output }),
      ).toMatchObject({ success: true, data: null });
      expect(
        await write({
          parent: gate,
          child: { operation, rows: { mode: 'scope', filter: { _id: f.ids[1] } }, outputFields: grant('secret') },
        }),
      ).toMatchObject({ success: true, data: null });
      expect(await write({ parent: { rows: { mode: 'scope', filter: false } }, child: output })).toMatchObject({
        success: true,
        data: null,
      });
      expect(f.readHook).not.toHaveBeenCalled();
      const visible = await write({ parent: gate, child: output });
      expect(visible).toMatchObject({ success: true, data: { secret: 'new' } }); // pragma: allowlist secret
      expect((await f.reload())!.items[0].secret).toBe('new');
      expect((await f.reload())!.items[1].secret).toBe('second');
      expect((await f.Parent.collection.findOne({ _id: f.other._id }))!.items[0].secret).toBe('old');
    });
  });

  it.each(['list', 'read', 'create', 'update', 'bulkUpdate'] as const)(
    '%s keeps virtual/output/document access stages and raw parent inputs',
    async (method) => {
      const f = await fixture();
      await f.execute(async (service) => {
        const output = { outputFields: grant('badge') };
        const authorization =
          method === 'list' || method === 'read' ? { child: output } : { visibility: { child: output } };
        expect((await invoke(service, f, method, authorization)).success).toBe(true);
        expect(f.getter).toHaveBeenCalled();
        const virtualAccess = method === 'bulkUpdate' ? 'update' : method;
        for (const [, , context] of f.getter.mock.calls) {
          expect(context).toMatchObject({
            operation: `sub${method[0].toUpperCase()}${method.slice(1)}`,
            virtualAccess,
            outputAccess: method === 'list' ? 'list' : 'read',
            docPermissionsAccess: 'read',
            scopePath: ['items', 'sub'],
            receivingModelName: f.name,
          });
        }
        const update = method === 'update' || method === 'bulkUpdate';
        expect(f.stages.map((stage) => stage.access)).toEqual(update ? ['update', 'read'] : ['read']);
        expect(f.stages.every((stage) => stage.owner === 'owner-a' && stage.secret === 'old')).toBe(true); // pragma: allowlist secret
      });
    },
  );

  it('pre-write owner hooks can await another service with persistence/hook concurrency one', async () => {
    const f = await fixture();
    f.router.setOption('docPermissions.update', async function (doc, permissions, context) {
      expect(doc).toBeInstanceOf(mongoose.Document);
      expect(doc.owner).toBe('owner-a');
      expect(context.operation).toBe('subUpdate');
      expect(permissions.keys).toEqual([]);
      const target = await this.macl.getService(f.targetName).findOne({ label: 'target' });
      expect(target.success).toBe(true);
      return { write: true };
    });
    await f.execute(async (service) => {
      const result = await service.updateSub(
        f.id,
        'items',
        f.ids[0],
        { gateWrite: 'hook-granted' },
        { authorization: {} },
      );
      expect(result.success).toBe(true);
      expect((await f.reload())!.items[0].gateWrite).toBe('hook-granted');
    });
  });

  it('child output grants are selected/additive and do not leak to referenced targets, other arrays or later calls', async () => {
    const f = await fixture();
    await f.execute(async (service, req) => {
      const actor = req.macl.getPermissions().keys.slice();
      const result = await service.readSub(f.id, 'items', f.ids[0], {
        select: ['label', 'secret', 'badge', 'ref'],
        populate: [{ path: 'ref', select: ['label', 'secret'] }],
        authorization: { child: { outputFields: grant('secret', 'badge', 'ref') } },
      });
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ label: 'one', secret: 'old', ref: { label: 'target' } }); // pragma: allowlist secret
      expect(result.data).not.toHaveProperty('owner');
      expect(result.data.ref).not.toHaveProperty('secret');
      expect(f.getter).toHaveBeenCalledTimes(1);
      const ordinary = await service.readSub(f.id, 'items', f.ids[0]);
      expect(ordinary.data).not.toHaveProperty('secret');
      expect(ordinary.data).not.toHaveProperty('badge');
      const selected = await service.readSub(f.id, 'items', f.ids[0], {
        select: ['label'],
        authorization: { child: { outputFields: grant('secret') } },
      });
      expect(selected.data).not.toHaveProperty('secret');
      const hiddenTarget = await service.readSub(f.id, 'items', f.ids[1], {
        populate: ['ref'],
        authorization: { child: { ...gate, outputFields: { mode: 'unrestricted' } } },
      });
      expect(hiddenTarget.data.ref).toBeNull();
      expect(req.macl.getPermissions().keys).toEqual(actor);
      expect(service.defaults).not.toHaveProperty('authorization');
      expect((await f.reload())!.other[0].secret).toBe('other-secret');
      expect(f.stages.every((stage) => stage.owner === 'owner-a' && stage.count === 3)).toBe(true);
      f.api.runtime.setModelOption(f.targetName, 'operationAccess.read', false);
      const targetFetch = vi.spyOn(f.Target, 'find');
      const deniedTarget = await service.readSub(f.id, 'items', f.ids[0], {
        populate: [{ path: 'ref', select: ['label', 'secret'] }],
        authorization: { child: { ...gate, outputFields: { mode: 'unrestricted' } } },
      });
      expect(deniedTarget.success).toBe(true);
      expect(deniedTarget.data.ref).not.toHaveProperty('label');
      expect(deniedTarget.data.ref).not.toHaveProperty('secret');
      expect(targetFetch).not.toHaveBeenCalled();
    });
  });

  const invalid = [
    { parent: { outputFields: { mode: 'request' } } },
    { parent: { inputFields: grant('owner') } },
    { child: { outputFields: grant('secret') } },
    { child: { inputFields: grant('badge') } },
    { child: { inputFields: grant('missing') } },
    { child: { inputFields: grant('owner') } },
    { child: { inputFields: grant('items.secret') } },
    { child: { inputFields: grant('_id') } },
    { child: { inputFields: grant('pieces.0.value') } },
    { child: { inputFields: grant('ref.secret') } },
    { child: { inputFields: grant('_permissions') } },
    { child: { related: {} } },
    { child: { inputFields: grant('payload.badge') } },
    { visibility: { child: { inputFields: { mode: 'request' } } } },
    { visibility: { list: {} } },
    { visibility: { child: { outputFields: grant('missing') } } },
    { parent: { rows: { mode: 'scope', filter: { missing: true } } } },
  ];
  it.each(invalid.map((policy, index) => [index, policy] as const))(
    'rejects inapplicable/invalid policy %s before any query/hook/save',
    async (_index, authorization) => {
      const f = await fixture();
      await f.execute(async (service) => {
        const fetch = vi.spyOn(service, 'findRawParentDoc');
        // pragma: allowlist nextline secret
        expect(await service.updateSub(f.id, 'items', f.ids[0], { secret: 'attack' }, { authorization })).toMatchObject(
          { success: false, code: 'bad_request' },
        );
        expect(fetch).not.toHaveBeenCalled();
        expect(f.updateHook).not.toHaveBeenCalled();
        expect(f.saves).not.toHaveBeenCalled();
        expect((await f.reload())!.items[0].secret).toBe('old');
      });
    },
  );

  it('rejects wrong method dimensions, non-array paths, and complexity excess before effects', async () => {
    const f = await fixture({}, { maxNodes: 30, maxInValues: 2, maxBulkItems: 2 });
    await f.execute(async (service) => {
      const fetch = vi.spyOn(service, 'findRawParentDoc');
      for (const [method, authorization] of [
        ['list', { child: { inputFields: { mode: 'request' } } }],
        ['create', { child: { rows: { mode: 'request' } } }],
        ['delete', { child: { outputFields: { mode: 'request' } } }],
        ['delete', { visibility: {} }],
        ['update', { child: { inputFields: grant(...Array(40).fill('secret')) } }],
        ['update', { child: { inputFields: grant('payload.a.b.c.d.e.f.g.h.i') } }],
        ['read', { child: { rows: { mode: 'scope', filter: { label: { $in: ['a', 'b', 'c'] } } } } }],
      ] as const)
        expect(await invoke(service, f, method, authorization)).toMatchObject({ success: false, code: 'bad_request' });
      for (const sub of ['missing', 'owner', 'items.pieces', '__proto__'])
        expect(await service.listSub(f.id, sub, { authorization: {} })).toMatchObject({
          success: false,
          code: 'bad_request',
        });
      expect(await service.createSub(f.id, 'items', [{}, {}, {}], { authorization: {} })).toMatchObject({
        success: false,
        code: 'bad_request',
      });
      expect(fetch).not.toHaveBeenCalled();
      expect(f.saves).not.toHaveBeenCalled();
    });
  });

  it('captures policies/configuration before awaits and rejects defaults instead of inheriting authority', async () => {
    let mutate = () => {};
    const f = await fixture({
      overrideFilter: {
        update: () => {
          mutate();
          return {};
        },
      },
    });
    await f.execute(async (service, req) => {
      const policy = {
        child: { inputFields: grant('secret') },
        visibility: { child: { outputFields: grant('secret') } },
      };
      mutate = () => {
        policy.child.inputFields.paths.length = 0;
        policy.visibility.child.outputFields.paths.length = 0;
        f.router.setOption('permissionSchema.items.sub.secret', true);
      };
      const result = await service.updateSub(f.id, 'items', f.ids[0], { secret: 'new' }, { authorization: policy }); // pragma: allowlist secret
      expect(result.data.secret).toBe('new');
      expect((await f.reload())!.items[0].secret).toBe('new');
      expect(req.macl.getPermissions().keys).toEqual([]);
      service.defaults = { updateOneOptions: { authorization: { child: gate } } };
      // pragma: allowlist nextline secret
      expect(await service.updateSub(f.id, 'items', f.ids[0], { secret: 'default-attack' })).toMatchObject({
        success: false,
        code: 'bad_request',
      });
      expect((await f.reload())!.items[0].secret).toBe('new');
    });
  });

  it('public direct/root/custom-validator/nested dispatch rejects capabilities alongside a working backend control', async () => {
    const f = await fixture();
    await f.execute(async (service, req) => {
      const authorization = { child: { inputFields: grant('secret') } };
      // pragma: allowlist nextline secret
      expect((await service.updateSub(f.id, 'items', f.ids[0], { secret: 'new' }, { authorization })).success).toBe(
        true,
      );
      const publicService = req.macl.getPublicService(f.name);
      for (const method of methods) {
        const validPolicy =
          method === 'list' || method === 'read'
            ? { parent: gate, child: { ...gate, outputFields: grant('secret') } }
            : method === 'delete'
              ? { parent: gate, child: gate }
              : {
                  parent: gate,
                  child: { operation, ...(method === 'create' ? {} : { rows }), inputFields: grant('secret') },
                };
        expect(await invoke(publicService, f, method, validPolicy)).toMatchObject({
          success: false,
          code: 'bad_request',
        });
      }
      for (const options of [
        Object.create({ authorization }),
        Object.defineProperty({}, 'authorization', { value: authorization }),
        { authorization: undefined },
        { execution: {} },
        { overrides: {} },
      ]) {
        expect(
          await publicService.updateSub(f.id, 'items', f.ids[0], { secret: 'wire' }, options as never), // pragma: allowlist secret
        ).toMatchObject({ success: false, code: 'bad_request' });
      }
      expect(
        await publicService.updateSub(f.id, 'items', f.ids[0], { authorization: 'business', overrides: 'business' }),
      ).toMatchObject({ success: true });
      expect((await f.reload())!.items[0]).toMatchObject({
        secret: 'new', // pragma: allowlist secret
        authorization: 'business',
        overrides: 'business',
      });
      expect(
        await service.readSub(f.id, 'items', f.ids[0], {
          populate: [{ path: 'ref', authorization: { outputFields: { mode: 'unrestricted' } } }],
        }),
      ).toMatchObject({ success: false, code: 'bad_request' });
      const nested = await publicService._read(f.id, {
        include: {
          model: f.targetName,
          op: 'read',
          path: 'target',
          localField: '_id',
          foreignField: '_id',
          options: { authorization: { parent: gate, child: gate } },
        },
      } as never);
      expect(nested).toMatchObject({ success: false, code: 'bad_request' });
    });
    await request(f.app)
      .post(`/parents/${f.id}/items/__query`)
      .send({ authorization: { child: gate } })
      .expect(400);
    await request(f.app)
      .post('/root')
      .send([
        {
          target: 'model',
          name: f.name,
          op: 'subUpdate',
          id: f.id,
          sub: 'items',
          subId: f.ids[0],
          data: { secret: 'wire' }, // pragma: allowlist secret
          options: { authorization: { child: { inputFields: grant('secret') } } },
        },
      ])
      .expect(400);
    f.router.setOption('requestSchemas.subRead', () => ({
      success: true,
      data: { select: ['secret'], authorization: { child: { outputFields: grant('secret') } } },
    }));
    await request(f.app).post(`/parents/${f.id}/items/${f.ids[0]}/__query`).send({}).expect(400);
    expect((await f.reload())!.items[0].secret).toBe('new');
  });
});
