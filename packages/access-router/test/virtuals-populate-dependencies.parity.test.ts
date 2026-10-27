import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime, permissionsPlugin } from '../dist/index.mjs';
import type { ModelRequest } from '../src/interfaces';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();
type Row = Record<string, any>;
const quiet = { includePermissions: false, includeFieldPermissions: false, includeCount: false };
let sequence = 0;
const runtimes: ReturnType<typeof createAccessRuntime>[] = [];
afterEach(() => {
  runtimes.splice(0).forEach((api) => api.runtime.clearOpenApiRoutes());
  mongoose.deleteModel(/^DpvParity/);
});
const plain = (value: unknown): any => JSON.parse(JSON.stringify(value));

async function fixture(hydration: 'lean' | 'hydrated', options: Row = {}) {
  const api = createAccessRuntime();
  runtimes.push(api);
  const n = ++sequence;
  const accountName = `DpvParityAccount${n}`;
  const memberName = `DpvParityMember${n}`;
  const parentName = `DpvParityParent${n}`;
  const schema = (fields: Row, name: string) => {
    const value = new mongoose.Schema(fields);
    value.plugin(permissionsPlugin, { modelName: name });
    return value;
  };
  const accountSchema = schema(
    { name: String, tenant: String, balance: { type: Number, select: false }, credit: Number },
    accountName,
  );
  const targetReads: { row: unknown; original: unknown; hydrated: boolean }[] = [];
  accountSchema.post('find', (rows) => {
    for (const row of rows) targetReads.push({ row, original: plain(row), hydrated: row instanceof mongoose.Document });
  });
  const Account = mongoose.model(accountName, accountSchema);
  const ref = { type: mongoose.Schema.Types.ObjectId, ref: accountName };
  const fields = {
    name: String,
    visible: { type: Boolean, default: true },
    account: ref,
    accounts: { type: [ref], default: undefined },
    member: { type: mongoose.Schema.Types.ObjectId, ref: memberName },
    stringMember: { type: String, ref: memberName },
  };
  const Member = mongoose.model(memberName, schema({ ...fields, key: String, owner: String }, memberName));
  const note = new mongoose.Schema(fields);
  const child = new mongoose.Schema({ ...fields, notes: [note] });
  const Parent = mongoose.model(
    parentName,
    schema(
      {
        ...fields,
        key: String,
        owner: String,
        dependsOnPopulate: String,
        children: [child],
        profile: child,
        nested: { inner: fields, stringMember: { type: String, ref: memberName } },
        member: { type: mongoose.Schema.Types.ObjectId, ref: memberName },
        members: [{ type: mongoose.Schema.Types.ObjectId, ref: memberName }],
        stringMember: { type: String, ref: memberName },
      },
      parentName,
    ),
  );
  const targetHook = vi.fn((doc: Row) => ({ owns: doc.owner === 'target' }));
  const parentHook = vi.fn((doc: Row) => ({ owns: doc.owner === 'parent' }));
  const accountHook = vi.fn(() => ({}));
  const accountBase = vi.fn(() => ({ tenant: 'a' }));
  const total = vi.fn(
    (_doc: Row, _permissions: unknown, context: Row, populated: Row) =>
      `${context.virtualAccess}:${populated.account?.balance ?? 'null'}`,
  );
  const slots = vi.fn((_doc: Row, _permissions: unknown, _context: Row, populated: Row) =>
    populated.accounts === null
      ? 'null'
      : populated.accounts.map((row: Row | null) => row?.balance ?? 'null').join('|'),
  );
  const targetTotal = vi.fn(
    (_doc: Row, _permissions: unknown, context: Row, populated: Row) =>
      `${context.virtualAccess}:${populated.account?.balance ?? 'null'}`,
  );
  const declaration = (get = total) => ({
    get,
    dependsOnPopulate: [{ path: 'account', select: 'balance -_id' }],
  });
  const virtuals = {
    total: declaration(),
    slots: { get: slots, dependsOnPopulate: [{ path: 'accounts', select: 'balance -_id' }] },
  };
  const scopeFields = {
    name: true,
    visible: false,
    account: true,
    accounts: true,
    member: true,
    stringMember: true,
    total: 'm::owns',
    slots: true,
  };
  const nestedScope = { list: true, read: true, create: true, update: true, sub: scopeFields };
  const childScope = {
    list: true,
    read: true,
    create: true,
    update: true,
    sub: { ...scopeFields, notes: nestedScope },
  };
  api.setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => [],
    requestComplexity: { maxDepth: 20, maxBulkConcurrency: 1, maxHookConcurrency: 1 },
  } as never);
  api.createRouter(Account, {
    operationAccess: { read: true, list: true },
    permissionSchema: { name: true, tenant: false, balance: false, credit: false },
    baseFilter: { read: accountBase, list: accountBase },
    docPermissions: accountHook,
    ...options.account,
  } as never);
  api.createRouter(Member, {
    operationAccess: { read: true, list: true, count: true },
    permissionSchema: { ...scopeFields, key: true, owner: false },
    modelPermissionPrefix: 'm::',
    docPermissions: targetHook,
    alwaysSelectFields: ['owner'],
    virtuals: { total: declaration(targetTotal) },
    hydration: { find: hydration, findOne: hydration, publicList: hydration, publicRead: hydration },
    stripPermissionsField: true,
    ...options.member,
  } as never);
  const router = api.createRouter(Parent, {
    basePath: `/dpv-parity-${n}`,
    operationAccess: {
      list: true,
      read: true,
      create: true,
      update: true,
      upsert: true,
      new: true,
      count: true,
      distinct: true,
      delete: true,
      subs: { children: { list: true, read: true, create: true, update: true, delete: true } },
    },
    modelPermissionPrefix: 'm::',
    permissionSchema: {
      ...scopeFields,
      key: true,
      owner: false,
      dependsOnPopulate: true,
      children: childScope,
      profile: childScope,
      nested: { list: true, read: true, sub: { inner: nestedScope, stringMember: true } },
      member: true,
      members: true,
      stringMember: true,
    },
    docPermissions: parentHook,
    alwaysSelectFields: ['owner'],
    virtuals: {
      ...virtuals,
      children: { sub: { ...virtuals, notes: { sub: virtuals } } },
      profile: { sub: { ...virtuals, notes: { sub: virtuals } } },
      nested: { sub: { inner: { sub: virtuals } } },
    },
    hydration: Object.fromEntries(
      ['find', 'findOne', 'findById', 'publicList', 'publicRead'].map((key) => [key, hydration]),
    ),
    stripPermissionsField: true,
    defaults: { publicListOptions: quiet, publicReadOptions: { ...quiet, tryList: false } },
    ...options.parent,
  } as never);
  const root = api.createRouter({ basePath: `/dpv-parity-root-${n}`, operationAccess: true });
  const [a, b, outside] = await Account.create([
    { name: 'A', tenant: 'a', balance: 10, credit: 1 },
    { name: 'B', tenant: 'a', balance: 20, credit: 2 },
    { name: 'outside', tenant: 'other', balance: 90, credit: 9 },
  ]);
  const missing = new mongoose.Types.ObjectId();
  const ids = [a._id, missing, null, a._id, b._id, outside._id];
  const [member, deniedMember] = await Member.create([
    { name: 'member', key: 'join', owner: 'target', account: a._id },
    { name: 'denied', key: 'other', owner: 'other', account: b._id },
  ]);
  const parent = await Parent.create({
    name: 'parent',
    key: 'join',
    owner: 'parent',
    dependsOnPopulate: 'business data',
    account: a._id,
    accounts: ids,
    member: member._id,
    members: [member._id, deniedMember._id, member._id],
    stringMember: String(member._id),
    children: [
      {
        name: 'first',
        account: a._id,
        accounts: ids,
        member: member._id,
        stringMember: String(member._id),
        notes: [{ name: 'note', account: b._id }],
      },
      { name: 'second', account: b._id, accounts: [] },
      { name: 'hidden', visible: false, account: outside._id },
    ],
    profile: { name: 'profile', account: b._id },
    nested: { inner: { name: 'nested', account: a._id }, stringMember: String(member._id) },
  });
  const app = express();
  app.use(express.json());
  app.use(router.routes);
  app.use(root.routes);
  let callback: (req: ModelRequest) => Promise<unknown>;
  let failure: unknown;
  let value: unknown;
  router.router.post('/probe', async (req, res) => {
    try {
      value = await callback(req as unknown as ModelRequest);
    } catch (error) {
      failure = error;
    }
    res.json({ ok: true });
  });
  return {
    api,
    app,
    base: `/dpv-parity-${n}`,
    rootBase: `/dpv-parity-root-${n}`,
    Account,
    Member,
    Parent,
    parent,
    member,
    a,
    b,
    outside,
    ids,
    missing,
    total,
    slots,
    targetTotal,
    parentHook,
    targetHook,
    accountHook,
    accountBase,
    targetReads,
    assertTargetRowsUnchanged() {
      for (const { row, original } of targetReads) expect(plain(row)).toEqual(original);
    },
    async execute<T>(run: (req: ModelRequest) => Promise<T>): Promise<T> {
      callback = run;
      failure = undefined;
      await request(app).post(`/dpv-parity-${n}/probe`).send({}).expect(200);
      if (failure) throw failure;
      return value as T;
    },
  };
}

describe.each(['lean', 'hydrated'] as const)('DPV-04 dedicated child outputs (%s)', (hydration) => {
  it('loads all visible list children in one batch with exact refs, scoped maps and parent grants', async () => {
    const f = await fixture(hydration);
    const targetFind = vi.spyOn(f.Account.collection, 'find');
    const result = await f.execute((req) =>
      req.macl.getService(f.Parent.modelName).listSub(String(f.parent._id), 'children', {
        filter: { visible: true },
        select: ['name', 'account', 'accounts', 'total', 'slots', 'notes.total'],
      }),
    );
    expect(result).toMatchObject({ success: true, count: 2 });
    if (!result.success) throw new Error(result.code);
    const rows = plain(result.data);
    expect(rows[0]).toMatchObject({ name: 'first', total: 'list:10', slots: '10|null|null|10|20|null' });
    expect(rows[1]).toMatchObject({ name: 'second', total: 'list:20', slots: '' });
    expect(rows[0].account).toBe(String(f.a._id));
    expect(rows[0].accounts).toEqual(f.ids.map((id) => (id === null ? null : String(id))));
    expect(rows[0].notes[0]).toHaveProperty('total', 'list:20');
    expect(targetFind).toHaveBeenCalledTimes(1);
    expect(f.total).toHaveBeenCalledTimes(3);
    expect(f.parentHook).toHaveBeenCalledTimes(1);
    expect(f.parentHook.mock.calls[0][0].children[0].account).toEqual(f.a._id);
    expect(f.accountHook).not.toHaveBeenCalled();
    expect(f.targetReads.every((row) => row.hydrated)).toBe(true);
    f.assertTargetRowsUnchanged();
    expect(f.total.mock.calls[0][2]).toMatchObject({ operation: 'subList', docPermissionsAccess: 'read' });
    expect(
      f.total.mock.calls.find(([, , context]) => context.scopePath.join('.') === 'children.sub.notes.sub')![0],
    ).not.toHaveProperty('account');
  });

  it('captures read refs before ordinary population and shares only the public fetch', async () => {
    const f = await fixture(hydration);
    const parentFind = vi.spyOn(f.Parent.collection, 'findOne');
    const targetFind = vi.spyOn(f.Account.collection, 'find');
    const result = await f.execute((req) =>
      req.macl
        .getService(f.Parent.modelName)
        .readSub(String(f.parent._id), 'children', String(f.parent.children[0]._id), {
          select: ['account', 'accounts', 'total', 'slots'],
          populate: [
            { path: 'account', select: 'name -_id' },
            { path: 'accounts', select: 'name -_id' },
          ],
        }),
    );
    expect(result).toMatchObject({ success: true });
    if (!result.success) throw new Error(result.code);
    expect(plain(result.data)).toMatchObject({
      account: { name: 'A' },
      accounts: [{ name: 'A' }, { name: 'A' }, { name: 'B' }],
      total: 'read:10',
      slots: '10|null|null|10|20|null',
    });
    expect(parentFind).toHaveBeenCalledTimes(1);
    expect(targetFind).toHaveBeenCalledTimes(1);
    const seen = f.parentHook.mock.calls[0][0];
    expect(f.accountBase).toHaveBeenCalledTimes(1);
    expect(seen.children[0].account).toEqual(f.a._id);
    expect(seen.children[0].accounts).toEqual(f.ids);
    expect(f.total.mock.calls[0][0].account).toEqual({ name: 'A' });
    expect(f.total.mock.calls[0][3]).toEqual({ account: { balance: 10 } });
    expect(f.targetReads.every((row) => row.hydrated)).toBe(true);
    f.assertTargetRowsUnchanged();
  });

  it.each(['create', 'update', 'bulkUpdate'] as const)('post-save %s refs', async (method) => {
    const f = await fixture(hydration);
    const targetFind = vi.spyOn(f.Account.collection, 'find');
    const result = await f.execute((req) => {
      const service = req.macl.getService(f.Parent.modelName);
      const id = String(f.parent._id);
      if (method === 'create')
        return service.createSub(id, 'children', { name: 'added', account: f.b._id, accounts: f.ids });
      if (method === 'update')
        return service.updateSub(id, 'children', String(f.parent.children[0]._id), {
          name: 'changed',
          account: f.b._id,
        });
      return service.bulkUpdateSub(id, 'children', [
        { _id: String(f.parent.children[1]._id), name: 'bulk-second', account: f.a._id },
        { _id: String(f.parent.children[0]._id), name: 'bulk-first', account: f.b._id },
      ]);
    });
    expect(result).toMatchObject({ success: true });
    if (!result.success) throw new Error(result.code);
    const rows = Array.isArray(result.data) ? result.data : [result.data];
    expect(rows.length).toBeGreaterThan(0);
    const wanted = method === 'create' ? rows.find((row: Row) => row.name === 'added') : rows[0];
    expect(wanted).toHaveProperty('total', `${method === 'create' ? 'create' : 'update'}:20`);
    expect(targetFind).toHaveBeenCalledTimes(1);
    expect(f.targetReads.every((row) => !row.hydrated)).toBe(true);
    f.assertTargetRowsUnchanged();
    const stored = await f.Parent.findById(f.parent._id).lean();
    for (const row of stored!.children) {
      expect(row).not.toHaveProperty('total');
      expect(row.account).toBeInstanceOf(mongoose.Types.ObjectId);
    }
  });

  it.each(['list', 'read'] as const)('%s omits unselected refs and masks local views', async (method) => {
    const f = await fixture(hydration);
    const result = await f.execute((req) => {
      const service = req.macl.getService(f.Parent.modelName);
      const args = { select: ['total', 'slots'] };
      return method === 'list'
        ? service.listSub(String(f.parent._id), 'children', { ...args, filter: { visible: true } })
        : service.readSub(String(f.parent._id), 'children', String(f.parent.children[0]._id), args);
    });
    expect(result).toMatchObject({ success: true });
    if (!result.success) throw new Error(result.code);
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    expect(row).toMatchObject({ total: `${method}:10`, slots: '10|null|null|10|20|null' });
    expect(row).not.toHaveProperty('account');
    expect(row).not.toHaveProperty('accounts');
    expect(f.total.mock.calls.every(([doc]) => !Object.hasOwn(doc, 'account'))).toBe(true);
  });

  it.each(['create', 'update', 'bulkUpdate'] as const)('hidden %s has no private work', async (method) => {
    const f = await fixture(hydration, {
      parent: { baseFilter: { subs: { children: { read: () => false, list: () => false } } } },
    });
    const targetFind = vi.spyOn(f.Account.collection, 'find');
    const result = await f.execute((req) => {
      const service = req.macl.getService(f.Parent.modelName);
      const id = String(f.parent._id);
      if (method === 'create') return service.createSub(id, 'children', { name: 'saved', account: f.a._id });
      if (method === 'update')
        return service.updateSub(id, 'children', String(f.parent.children[0]._id), { name: 'saved' });
      return service.bulkUpdateSub(id, 'children', [{ _id: String(f.parent.children[0]._id), name: 'saved' }]);
    });
    expect(result).toMatchObject({ success: true, data: method === 'update' ? null : [] });
    expect(targetFind).not.toHaveBeenCalled();
    expect(f.total).not.toHaveBeenCalled();
    expect((await f.Parent.findById(f.parent._id).lean())!.children.some((row) => row.name === 'saved')).toBe(true);
  });

  it.each(['throw', 'undefined'] as const)('reconstructs exact child refs after getter %s', async (outcome) => {
    const f = await fixture(hydration);
    f.total.mockImplementation(() => {
      if (outcome === 'throw') throw new Error('private failure');
      return undefined as never;
    });
    const result = await f.execute((req) =>
      req.macl
        .getService(f.Parent.modelName)
        .readSub(String(f.parent._id), 'children', String(f.parent.children[0]._id)),
    );
    expect(result).toMatchObject({ success: true });
    if (!result.success) throw new Error(result.code);
    expect(plain(result.data.accounts)).toEqual(f.ids.map((id) => (id === null ? null : String(id))));
    expect(result.data.account).toEqual(f.a._id);
    expect(result.data).not.toHaveProperty('total');
    expect(f.total).toHaveBeenCalled();
  });

  it('keeps a successful child write visible when private loading fails', async () => {
    const f = await fixture(hydration);
    const targetFind = vi.spyOn(f.Account.collection, 'find').mockImplementation(() => {
      throw new Error('private query failure');
    });
    const write = vi.spyOn(f.Parent.collection, 'updateOne');
    const result = await f.execute((req) =>
      req.macl
        .getService(f.Parent.modelName)
        .updateSub(String(f.parent._id), 'children', String(f.parent.children[0]._id), { name: 'saved' }),
    );
    expect(result).toMatchObject({ success: true, data: { name: 'saved' } });
    if (!result.success) throw new Error(result.code);
    expect(result.data).not.toHaveProperty('total');
    expect(result.data.account).toEqual(f.a._id);
    expect(targetFind).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
    expect(f.total).not.toHaveBeenCalled();
  });

  it('captures child getters and target policies coherently before an awaited parent row hook', async () => {
    let ready!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => (ready = resolve));
    const held = new Promise<void>((resolve) => (release = resolve));
    let first = true;
    const f = await fixture(hydration, {
      parent: {
        baseFilter: {
          read: async () => {
            if (first) {
              first = false;
              ready();
              await held;
            }
            return {};
          },
        },
      },
    });
    const run = () =>
      f.execute((req) =>
        req.macl
          .getService(f.Parent.modelName)
          .readSub(String(f.parent._id), 'children', String(f.parent.children[0]._id), { select: ['total'] }),
      );
    const pending = run();
    await entered;
    const next = vi.fn((_doc, _permissions, _context, inputs) => `next:${inputs.account.credit}`);
    f.api.setModelOptions(f.Parent.modelName, {
      virtuals: {
        children: { sub: { total: { get: next, dependsOnPopulate: [{ path: 'account', select: 'credit -_id' }] } } },
      },
    } as never);
    f.api.setModelOptions(f.Account.modelName, { baseFilter: { read: () => false } } as never);
    release();
    expect(await pending).toMatchObject({ success: true, data: { total: 'read:10' } });
    const denied = await run();
    expect(denied).toMatchObject({ success: true });
    if (!denied.success) throw new Error(denied.code);
    expect(denied.data).not.toHaveProperty('total');
    expect(next).not.toHaveBeenCalled();
    f.api.setModelOptions(f.Account.modelName, { baseFilter: { read: () => ({ tenant: 'a' }) } } as never);
    expect(await run()).toMatchObject({ success: true, data: { total: 'next:1' } });
  });

  it.each(['member', 'stringMember'])('readSub %s target owns its dependency token', async (path) => {
    const f = await fixture(hydration);
    const targetFind = vi.spyOn(f.Account.collection, 'find');
    const result = await f.execute((req) =>
      req.macl
        .getService(f.Parent.modelName)
        .readSub(String(f.parent._id), 'children', String(f.parent.children[0]._id), {
          select: [path],
          populate: [{ path, select: ['name', 'total'] }],
        }),
    );
    expect(result).toMatchObject({ success: true });
    if (!result.success) throw new Error(result.code);
    expect(result.data[path]).toMatchObject({ name: 'member', total: 'read:10' });
    expect(result.data[path]).not.toHaveProperty('account');
    expect(targetFind).toHaveBeenCalledTimes(1);
    expect(f.targetHook.mock.calls[0][0]).not.toHaveProperty('account');
    expect(f.parentHook.mock.calls[0][0].children[0][path]).not.toHaveProperty('name');
  });
});

describe.each(['lean', 'hydrated'] as const)('DPV-04 related and nested parity (%s)', (hydration) => {
  it.each(['member', 'members', 'nested.stringMember'] as const)('%s target inputs', async (path) => {
    const f = await fixture(hydration);
    const targetFind = vi.spyOn(f.Account.collection, 'find');
    const result = await f.execute((req) =>
      req.macl
        .getService(f.Parent.modelName)
        .find({ _id: f.parent._id }, { select: [path], populate: [{ path, select: ['name', 'total'] }] }, quiet),
    );
    expect(result).toMatchObject({ success: true });
    if (!result.success) throw new Error(result.code);
    const output = path === 'nested.stringMember' ? result.data[0].nested.stringMember : result.data[0][path];
    const rows = Array.isArray(output) ? output : [output];
    expect(rows[0]).toHaveProperty('total', 'read:10');
    if (path === 'members') {
      expect(rows[1]).not.toHaveProperty('total');
      expect(rows[2]).toEqual(rows[0]);
      expect(rows[2]).not.toBe(rows[0]);
      expect(f.targetTotal).toHaveBeenCalledTimes(1);
    }
    expect(targetFind).toHaveBeenCalledTimes(1);
    for (const [doc] of f.targetHook.mock.calls) expect(doc).not.toHaveProperty('account');
    for (const row of rows) expect(row).not.toHaveProperty('account');
    for (const [doc] of f.parentHook.mock.calls) {
      const value = path === 'nested.stringMember' ? doc.nested.stringMember : doc[path];
      const values = Array.isArray(value) ? value : [value];
      for (const value of values) expect(value).not.toHaveProperty('account');
    }
  });

  it.each(['legacy', 'correlated'] as const)('%s include collisions and own grants', async (mode) => {
    const f = await fixture(hydration);
    const include = (op: 'read' | 'list' | 'count', path: string) => ({
      model: f.Member.modelName,
      op,
      path,
      ...(mode === 'correlated'
        ? { mode, filter: { key: { $parent: 'key' } } }
        : { localField: 'key', foreignField: 'key' }),
      ...(op === 'count' ? {} : { args: { select: ['name', 'total'] } }),
    });
    const targetFind = vi.spyOn(f.Account.collection, 'find');
    const result = await f.execute((req) =>
      req.macl.getService(f.Parent.modelName).findOne(
        { _id: f.parent._id },
        {
          select: ['name', 'total'],
          include: [include('count', 'matches'), include('read', 'account'), include('list', 'key')],
        } as never,
        quiet,
      ),
    );
    expect(result).toMatchObject({ success: true });
    if (!result.success) throw new Error(result.code);
    expect(result.data).toMatchObject({
      total: 'read:10',
      account: { name: 'member', total: 'read:10' },
      key: [{ name: 'member', total: 'list:10' }],
      matches: 1,
    });
    expect(result.data.account).not.toHaveProperty('account');
    expect(f.total.mock.calls[0][0]).not.toHaveProperty('account');
    expect(f.total.mock.calls[0][3]).toEqual({ account: { balance: 10 } });
    expect(f.parentHook.mock.calls[0][0]).not.toHaveProperty('account');
    expect(f.parentHook.mock.calls[0][0].key).toBe('join');
    expect(targetFind).toHaveBeenCalledTimes(3);
    expect(f.targetTotal).toHaveBeenCalledTimes(2);
  });

  it('batches deep nested object/document-array occurrences and keeps absent/null containers absent/null', async () => {
    const f = await fixture(hydration);
    await f.Parent.create([
      { name: 'null', owner: 'parent', profile: null },
      { name: 'absent', owner: 'parent' },
    ]);
    const targetFind = vi.spyOn(f.Account.collection, 'find');
    const result = await f.execute((req) =>
      req.macl.getService(f.Parent.modelName).find(
        {},
        {
          select: ['name', 'children.total', 'children.notes.total', 'profile.total', 'nested.inner.total'],
          sort: 'name',
        },
        quiet,
      ),
    );
    expect(result).toMatchObject({ success: true });
    if (!result.success) throw new Error(result.code);
    const row = result.data.find((entry: Row) => entry.name === 'parent');
    expect(row).toMatchObject({
      children: [{ total: 'list:10', notes: [{ total: 'list:20' }] }, { total: 'list:20' }, { total: 'list:null' }],
      profile: { total: 'list:20' },
      nested: { inner: { total: 'list:10' } },
    });
    expect(result.data.find((entry: Row) => entry.name === 'null').profile ?? null).toBeNull();
    expect(result.data.find((entry: Row) => entry.name === 'absent')).not.toHaveProperty('profile');
    expect(targetFind).toHaveBeenCalledTimes(1);
    expect(f.total).toHaveBeenCalledTimes(6);
    for (const [doc] of f.total.mock.calls) expect(doc).not.toHaveProperty('account');
  });

  it('keeps whole-container grants, caller exclusions and embedded parent grants coherent', async () => {
    const f = await fixture(hydration);
    const result = await f.execute((req) =>
      req.macl
        .getService(f.Parent.modelName)
        .findOne(
          { _id: f.parent._id },
          { select: ['children', '-children.account', '-children.accounts', '-children.notes.account'] },
          { ...quiet, authorization: { outputFields: { mode: 'grant', paths: ['children'] } } },
        ),
    );
    expect(result).toMatchObject({ success: true });
    if (!result.success) throw new Error(result.code);
    expect(result.data.children[0]).toHaveProperty('total', 'read:10');
    expect(result.data.children[0].notes[0]).toHaveProperty('total', 'read:20');
    expect(result.data.children[0]).not.toHaveProperty('account');
    expect(result.data.children[0]).not.toHaveProperty('accounts');
    expect(result.data.children[0].notes[0]).not.toHaveProperty('account');
    expect(f.parentHook).toHaveBeenCalledTimes(1);
  });

  it('ordinary public matches and target-owned grants do not redefine nested private inputs', async () => {
    const f = await fixture(hydration);
    const targetFind = vi.spyOn(f.Account.collection, 'find');
    const result = await f.execute((req) =>
      req.macl.getService(f.Parent.modelName).findOne(
        { _id: f.parent._id },
        {
          select: ['total', 'account', 'accounts', 'slots'],
          populate: [
            { path: 'account', select: 'name -_id', match: { name: 'B' }, access: 'list' },
            { path: 'accounts', select: 'name -_id', match: { name: 'A' } },
          ],
        },
        quiet,
      ),
    );
    expect(result).toMatchObject({
      success: true,
      data: {
        total: 'read:10',
        slots: '10|null|null|10|20|null',
        account: null,
        accounts: [{ name: 'A' }, { name: 'A' }],
      },
    });
    expect(targetFind).toHaveBeenCalledTimes(3);
  });

  it('the same physical models in another runtime cannot reuse private policy or cached values', async () => {
    const f = await fixture(hydration);
    const other = createAccessRuntime();
    runtimes.push(other);
    other.setGlobalOptions({ requestComplexity: { maxHookConcurrency: 1, maxBulkConcurrency: 1 } } as never);
    other.createRouter(f.Account, { operationAccess: { read: false }, permissionSchema: {} } as never);
    other.createRouter(f.Member, { operationAccess: { read: true }, permissionSchema: { name: true } } as never);
    const router = other.createRouter(f.Parent, {
      ...f.api.runtime.getModelOptions(f.Parent.modelName),
      basePath: '/other-owner',
    } as never);
    const app = express();
    app.use(express.json());
    app.use(router.routes);
    const targetFind = vi.spyOn(f.Account.collection, 'find');
    const normal = await request(f.app)
      .post(`${f.base}/__query`)
      .send({ select: ['total'] })
      .expect(200);
    expect(normal.body.data[0]).toHaveProperty('total', 'list:10');
    const blocked = await request(app)
      .post('/other-owner/__query')
      .send({ select: ['total'] })
      .expect(200);
    expect(blocked.body.data[0]).not.toHaveProperty('total');
    expect(targetFind).toHaveBeenCalledTimes(1);
    expect(f.total).toHaveBeenCalledTimes(1);
  });

  it('post-save adapter population loads target dependencies on detached copies', async () => {
    const f = await fixture(hydration);
    const targetFind = vi.spyOn(f.Account.collection, 'find');
    const result = await f.execute((req) =>
      req.macl
        .getService(f.Parent.modelName)
        .updateById(
          String(f.parent._id),
          { name: 'updated' },
          { select: ['nested.stringMember'], populate: [{ path: 'nested.stringMember', select: ['name', 'total'] }] },
          quiet,
        ),
    );
    expect(result).toMatchObject({
      success: true,
      data: { nested: { stringMember: { name: 'member', total: 'read:10' } } },
    });
    expect(targetFind).toHaveBeenCalledTimes(1);
    const stored = await f.Parent.findById(f.parent._id).lean();
    expect(stored!.nested.stringMember).toBe(String(f.member._id));
    expect(f.targetHook.mock.calls[0][0]).not.toHaveProperty('account');
    f.assertTargetRowsUnchanged();
  });

  it.each([1, 8])('collects ordinary targets across %s parent rows before finalization', async (count) => {
    const f = await fixture(hydration);
    if (count > 1) await f.Parent.create(Array.from({ length: count - 1 }, () => ({ member: f.member._id })));
    const parentFind = vi.spyOn(f.Parent.collection, 'find');
    const memberFind = vi.spyOn(f.Member.collection, 'find');
    const accountFind = vi.spyOn(f.Account.collection, 'find');
    const result = await f.execute((req) =>
      req.macl.getService(f.Parent.modelName).find(
        {},
        {
          select: ['member'],
          populate: [{ path: 'member', select: ['total'] }],
        },
        quiet,
      ),
    );
    expect(result).toMatchObject({ success: true, count });
    if (!result.success) throw new Error(result.code);
    for (const row of result.data) expect(row.member).toHaveProperty('total', 'read:10');
    expect(parentFind).toHaveBeenCalledTimes(1);
    expect(memberFind).toHaveBeenCalledTimes(1);
    expect(accountFind).toHaveBeenCalledTimes(1);
    expect(f.targetTotal).toHaveBeenCalledTimes(1);
    f.assertTargetRowsUnchanged();
  });

  it.each(['legacy', 'correlated'])('%s list include reuses covered private work', async (mode) => {
    const f = await fixture(hydration);
    await f.Parent.create(Array.from({ length: 7 }, () => ({ key: 'join' })));
    const memberFind = vi.spyOn(f.Member.collection, 'find');
    const accountFind = vi.spyOn(f.Account.collection, 'find');
    const result = await f.execute((req) =>
      req.macl.getService(f.Parent.modelName).find(
        {},
        {
          select: ['name'],
          include: [
            {
              model: f.Member.modelName,
              op: 'list',
              path: 'joined',
              args: { select: ['total'] },
              ...(mode === 'correlated'
                ? { mode, filter: { key: { $parent: 'key' } } }
                : { localField: 'key', foreignField: 'key' }),
            },
          ],
        } as never,
        quiet,
      ),
    );
    expect(result).toMatchObject({ success: true, count: 8 });
    if (!result.success) throw new Error(result.code);
    for (const row of result.data) expect(row.joined[0]).toHaveProperty('total', 'list:10');
    // Correlated lists keep their existing per-parent public query/output stages.
    expect(memberFind).toHaveBeenCalledTimes(mode === 'correlated' ? 8 : 1);
    expect(accountFind).toHaveBeenCalledTimes(1);
    expect(f.targetTotal).toHaveBeenCalledTimes(mode === 'correlated' ? 8 : 1);
    // Existing relatedExecution fixes include target receiving mode to lean.
    expect(f.targetReads.every((row) => !row.hydrated)).toBe(true);
    f.assertTargetRowsUnchanged();
  });
});

describe.each(['lean', 'hydrated'] as const)('DPV-04 alternate entry points (%s)', (hydration) => {
  it.each(['list', 'read', 'readFilter', 'subList', 'subRead'] as const)('%s entry parity', async (op) => {
    const f = await fixture(hydration);
    const id = String(f.parent._id);
    const subId = String(f.parent.children[0]._id);
    const args = { select: ['total'] };
    const direct =
      op === 'list'
        ? await request(f.app).post(`${f.base}/__query`).send(args).expect(200)
        : op === 'read' || op === 'readFilter'
          ? await request(f.app).post(`${f.base}/__query/${id}`).send(args).expect(200)
          : await request(f.app)
              .post(`${f.base}/${id}/children${op === 'subRead' ? `/${subId}` : ''}/__query`)
              .send(args)
              .expect(200);
    const root = await request(f.app)
      .post(f.rootBase)
      .send([
        {
          target: 'model',
          name: f.Parent.modelName,
          op: op === 'readFilter' ? 'read' : op,
          ...(op === 'readFilter' ? { filter: { _id: id } } : { id }),
          ...(op.startsWith('sub') ? { sub: 'children', subId } : {}),
          args,
        },
      ])
      .expect(200);
    expect(root.body[0].statusCode).toBe(200);
    const trusted = await f.execute((req) => {
      const service = req.macl.getService(f.Parent.modelName);
      if (op === 'list') return service.find({ _id: id }, args, quiet);
      if (op === 'readFilter') return service.findOne({ _id: id }, args, quiet);
      if (op === 'read') return service.findById(id, args, quiet);
      if (op === 'subList') return service.listSub(id, 'children', args);
      return service.readSub(id, 'children', subId, args);
    });
    expect(trusted).toMatchObject({ success: true });
    if (!trusted.success) throw new Error(trusted.code);
    const directData = op === 'list' ? direct.body.data : direct.body;
    expect(plain(trusted.data)).toEqual(directData);
    expect(root.body[0].result.data).toEqual(directData);
    const row = Array.isArray(directData) ? directData[0] : directData;
    expect(row).toHaveProperty('total', `${op === 'list' || op === 'subList' ? 'list' : 'read'}:10`);
    expect(row).not.toHaveProperty('account');
  });

  it.each([
    'create',
    'update',
    'upsert-create',
    'upsert-update',
    'new',
    'subCreate',
    'subUpdate',
    'subBulkUpdate',
  ] as const)('root %s returns the same declared private computation', async (operation) => {
    const f = await fixture(hydration, { parent: { docPermissions: () => ({ owns: true }) } });
    f.Parent.schema.path('account').default(f.b._id);
    const id = String(f.parent._id);
    const subId = String(f.parent.children[0]._id);
    const sub = operation.startsWith('sub');
    const create = ['create', 'upsert-create', 'new', 'subCreate'].includes(operation);
    const data = { name: 'root-write', account: String(f.b._id) };
    const response = await request(f.app)
      .post(f.rootBase)
      .send([
        {
          target: 'model',
          name: f.Parent.modelName,
          op: operation.startsWith('upsert') ? 'upsert' : operation,
          ...(['update', 'upsert-update'].includes(operation) || sub ? { id } : {}),
          ...(sub ? { sub: 'children', subId } : {}),
          ...(operation === 'new'
            ? {}
            : {
                data:
                  operation === 'subBulkUpdate'
                    ? [{ ...data, _id: subId }]
                    : operation === 'upsert-update'
                      ? { ...data, _id: id }
                      : data,
              }),
        },
      ])
      .expect(200);
    expect(response.body[0].statusCode).toBe(create && operation !== 'new' ? 201 : 200);
    const result = response.body[0].result;
    const rows = Array.isArray(result.data) ? result.data : [result.data];
    const row = sub && operation === 'subCreate' ? rows.find((value: Row) => value.name === 'root-write') : rows[0];
    expect(row).toHaveProperty('total', `${create ? 'create' : 'update'}:20`);
    expect(row.account).toBe(String(f.b._id));
    expect(row).not.toHaveProperty('balance');
    const stored = await f.Parent.findOne({ name: 'root-write' }).lean();
    if (stored) expect(stored).not.toHaveProperty('total');
  });

  it('scalar/identity operations and output-only helpers perform no dependency work', async () => {
    const f = await fixture(hydration);
    const targetFind = vi.spyOn(f.Account.collection, 'find');
    await f.execute(async (req) => {
      const service = req.macl.getService(f.Parent.modelName);
      expect(await service.count({})).toMatchObject({ success: true, data: 1 });
      expect(await service.distinct('name')).toMatchObject({ success: true, data: ['parent'] });
      expect(await service.exists({ _id: f.parent._id })).toMatchObject({ success: true });
      await service.genSelect('read', ['total', 'children.total']);
      await service.genQuerySelect('read', ['total']);
      await service.pickAllowedFields({ name: 'existing', total: 'existing' }, 'read');
      await service.trimOutputFields({ total: 'existing' }, 'read');
      const included = await service.findOne(
        { _id: f.parent._id },
        {
          select: ['name'],
          include: [
            { model: f.Member.modelName, op: 'count', path: 'matches', localField: 'key', foreignField: 'key' },
          ],
        },
        quiet,
      );
      expect(included).toMatchObject({ success: true, data: { matches: 1 } });
      expect(await service.deleteSub(String(f.parent._id), 'children', String(f.parent.children[0]._id))).toMatchObject(
        { success: true },
      );
      expect(await service.delete(String(f.parent._id))).toMatchObject({ success: true });
    });
    expect(targetFind).not.toHaveBeenCalled();
    expect(f.total).not.toHaveBeenCalled();
    expect(f.targetTotal).not.toHaveBeenCalled();
  });

  it('wire/root/custom-service controls cannot activate loading; same-spelled business data remains usable', async () => {
    const f = await fixture(hydration);
    const targetFind = vi.spyOn(f.Account.collection, 'find');
    const forged = {
      dependsOnPopulate: [{ path: 'account', select: 'balance' }],
      populated: { account: { balance: 999 } },
    };
    const args = { select: ['dependsOnPopulate'], ...forged };
    const direct = await request(f.app)
      .post(`${f.base}/__query`)
      .send({ ...args, options: forged })
      .expect(200);
    expect(direct.body.data[0]).toHaveProperty('dependsOnPopulate', 'business data');
    const root = await request(f.app)
      .post(f.rootBase)
      .send([{ target: 'model', name: f.Parent.modelName, op: 'list', args, options: forged, ...forged }])
      .expect(200);
    expect(root.body[0].result.data[0]).toHaveProperty('dependsOnPopulate', 'business data');
    await f.execute(async (req) => {
      const service = req.macl.getService(f.Parent.modelName);
      const result = await service.find(
        { dependsOnPopulate: 'business data' },
        args as never,
        { ...quiet, ...forged } as never,
      );
      expect(result).toMatchObject({ success: true, data: [{ dependsOnPopulate: 'business data' }] });
      const created = await service.create({ name: 'data', dependsOnPopulate: 'saved' }, {}, quiet);
      expect(created).toMatchObject({ success: true, data: [{ dependsOnPopulate: 'saved' }] });
    });
    expect(targetFind).not.toHaveBeenCalled();
    expect(f.total).not.toHaveBeenCalled();
  });

  it('dedicated visibility filters children before loading/getters', async () => {
    const f = await fixture(hydration, {
      parent: { baseFilter: { subs: { children: { read: () => ({ visible: true }) } } } },
    });
    const result = await f.execute((req) =>
      req.macl
        .getService(f.Parent.modelName)
        .createSub(String(f.parent._id), 'children', { name: 'added', account: f.b._id }),
    );
    expect(result).toMatchObject({ success: true, count: 3 });
    if (!result.success) throw new Error(result.code);
    expect(result.data.map((row: Row) => row.name)).toEqual(['first', 'second', 'added']);
    expect(f.total.mock.calls.some(([row]) => row.name === 'hidden')).toBe(false);
    expect(f.slots.mock.calls.some(([row]) => row.name === 'hidden')).toBe(false);
    expect((await f.Parent.findById(f.parent._id).lean())!.children).toHaveLength(4);
  });

  it.each([false, true])('metadata/skimming flags do not carry private inputs (%s)', async (metadata) => {
    const f = await fixture(hydration, { parent: { stripPermissionsField: false } });
    const response = await request(f.app)
      .post(`${f.base}/__query`)
      .send({
        select: ['total', 'children.total'],
        options: { skim: !metadata, includePermissions: metadata, includeFieldPermissions: metadata },
      })
      .expect(200);
    const row = response.body.data[0];
    expect(row).toHaveProperty('total', 'list:10');
    expect(row.children[0]).toHaveProperty('total', 'list:10');
    expect(row).not.toHaveProperty('account');
    expect(JSON.stringify(row)).not.toContain('balance');
    expect(JSON.stringify(row)).not.toContain('virtualPopulate');
    for (const [doc, , context] of f.total.mock.calls) {
      expect(doc).not.toHaveProperty('account');
      expect(context).not.toHaveProperty('populated');
    }
  });
});

describe.each(['lean', 'hydrated'] as const)('PPR-02 / POP-03 denied-read ID retention parity (%s)', (hydration) => {
  describe.each([true, false])('requireOperationAccessForPopulateDependencies=%s', (strict) => {
    const policyFixture = async () => {
      const f = await fixture(hydration, {
        account: { operationAccess: { read: false, list: true } },
        parent: { docPermissions: () => ({ owns: true }) },
      });
      f.api.setGlobalOption('requireOperationAccessForPopulateDependencies', strict);
      return f;
    };
    const assertRow = (row: Row, access: string, account: unknown, balance = 10) => {
      expect(String(row.account)).toBe(String(account));
      expect(row).not.toHaveProperty('account.balance');
      if (strict) expect(row).not.toHaveProperty('total');
      else expect(row).toHaveProperty('total', `${access}:${balance}`);
    };

    it.each(['list', 'read', 'readFilter', 'subList', 'subRead'] as const)(
      '%s direct/root/trusted preserves the permitted reference ID',
      async (op) => {
        const f = await policyFixture();
        const id = String(f.parent._id);
        const subId = String(f.parent.children[0]._id);
        const args = { select: ['name', 'account', 'total'] };
        const direct = await request(f.app)
          .post(
            op === 'list'
              ? `${f.base}/__query`
              : op === 'read' || op === 'readFilter'
                ? `${f.base}/__query/${id}`
                : `${f.base}/${id}/children${op === 'subRead' ? `/${subId}` : ''}/__query`,
          )
          .send(args)
          .expect(200);
        const root = await request(f.app)
          .post(f.rootBase)
          .send([
            {
              target: 'model',
              name: f.Parent.modelName,
              op: op === 'readFilter' ? 'read' : op,
              ...(op === 'readFilter' ? { filter: { _id: id } } : { id }),
              ...(op.startsWith('sub') ? { sub: 'children', subId } : {}),
              args,
            },
          ])
          .expect(200);
        expect(root.body[0].statusCode).toBe(200);
        const trusted = await f.execute((req) => {
          const service = req.macl.getService(f.Parent.modelName);
          if (op === 'list') return service.find({ _id: id }, args, quiet);
          if (op === 'readFilter') return service.findOne({ _id: id }, args, quiet);
          if (op === 'read') return service.findById(id, args, quiet);
          if (op === 'subList') return service.listSub(id, 'children', args);
          return service.readSub(id, 'children', subId, args);
        });
        expect(trusted).toMatchObject({ success: true });
        if (!trusted.success) throw new Error(trusted.code);
        const directData = op === 'list' ? direct.body.data : direct.body;
        expect(plain(trusted.data)).toEqual(directData);
        expect(root.body[0].result.data).toEqual(directData);
        assertRow(
          Array.isArray(directData) ? directData[0] : directData,
          op.endsWith('List') || op === 'list' ? 'list' : 'read',
          f.a._id,
        );
        f.assertTargetRowsUnchanged();
      },
    );

    it.each([
      'create',
      'update',
      'upsert-create',
      'upsert-update',
      'new',
      'subCreate',
      'subUpdate',
      'subBulkUpdate',
    ] as const)('root %s keeps computation authority separate from reference output', async (operation) => {
      const f = await policyFixture();
      f.Parent.schema.path('account').default(f.b._id);
      const id = String(f.parent._id);
      const subId = String(f.parent.children[0]._id);
      const sub = operation.startsWith('sub');
      const create = ['create', 'upsert-create', 'new', 'subCreate'].includes(operation);
      const data = { name: 'ppr-write', account: String(f.b._id) };
      const response = await request(f.app)
        .post(f.rootBase)
        .send([
          {
            target: 'model',
            name: f.Parent.modelName,
            op: operation.startsWith('upsert') ? 'upsert' : operation,
            ...(['update', 'upsert-update'].includes(operation) || sub ? { id } : {}),
            ...(sub ? { sub: 'children', subId } : {}),
            ...(operation === 'new'
              ? {}
              : {
                  data:
                    operation === 'subBulkUpdate'
                      ? [{ ...data, _id: subId }]
                      : operation === 'upsert-update'
                        ? { ...data, _id: id }
                        : data,
                }),
          },
        ])
        .expect(200);
      expect(response.body[0].statusCode).toBe(create && operation !== 'new' ? 201 : 200);
      const rows = Array.isArray(response.body[0].result.data)
        ? response.body[0].result.data
        : [response.body[0].result.data];
      const row = sub && operation === 'subCreate' ? rows.find((value: Row) => value.name === 'ppr-write') : rows[0];
      assertRow(row, create ? 'create' : 'update', f.b._id, 20);
      const stored = sub ? await f.Parent.findById(id).lean() : await f.Parent.findOne({ name: 'ppr-write' }).lean();
      if (stored) {
        expect(stored).not.toHaveProperty('total');
        expect(sub ? stored.children.find((child) => child.name === 'ppr-write')!.account : stored.account).toEqual(
          f.b._id,
        );
      }
      f.assertTargetRowsUnchanged();
    });

    it('trusted create/update/upsert/new retain local snapshots and perform persistence once', async () => {
      const f = await policyFixture();
      f.Parent.schema.path('account').default(f.b._id);
      await f.execute(async (req) => {
        const service = req.macl.getService(f.Parent.modelName);
        const args = { select: ['name', 'account', 'total'] };
        const data = { name: 'trusted-ppr', account: f.b._id };
        const results = [
          await service.create(data, args, quiet),
          await service.updateOne({ _id: f.parent._id }, data, args, quiet),
          await service.updateById(String(f.parent._id), data, args, quiet),
          await service.upsert({ name: 'missing' }, { ...data, name: 'upsert-ppr' }, args, quiet),
          await service.new({}, quiet),
        ];
        for (const [index, result] of results.entries()) {
          expect(result).toMatchObject({ success: true });
          if (!result.success) throw new Error(result.code);
          const row = Array.isArray(result.data) ? result.data[0] : result.data;
          assertRow(row, index === 1 || index === 2 ? 'update' : 'create', f.b._id, 20);
          if ('contexts' in result) expect(result.contexts[0].finalDocumentSnapshot.account).toEqual(f.b._id);
          else if (index !== 4) expect(result.context.finalDocumentSnapshot.account).toEqual(f.b._id);
        }
      });
      expect(await f.Parent.countDocuments()).toBe(3);
      f.assertTargetRowsUnchanged();
    });

    it('embedded arrays/plain nested/single scopes retain occurrence visibility under field grants', async () => {
      const f = await policyFixture();
      const result = await f.execute((req) =>
        req.macl.getService(f.Parent.modelName).findOne(
          { _id: f.parent._id },
          {
            select: [
              'children.account',
              'children.total',
              'children.notes.account',
              'children.notes.total',
              'profile.account',
              'profile.total',
              'nested.inner.account',
              'nested.inner.total',
            ],
          },
          { ...quiet, authorization: { outputFields: { mode: 'grant', paths: ['children', 'profile', 'nested'] } } },
        ),
      );
      expect(result).toMatchObject({ success: true });
      if (!result.success) throw new Error(result.code);
      assertRow(result.data.children[0], 'read', f.a._id);
      assertRow(result.data.children[0].notes[0], 'read', f.b._id, 20);
      assertRow(result.data.profile, 'read', f.b._id, 20);
      assertRow(result.data.nested.inner, 'read', f.a._id);
      f.assertTargetRowsUnchanged();
    });

    it('duplicate populated target DTOs keep their own mask and captured visibility through output-cache copies', async () => {
      const f = await policyFixture();
      const find = vi.spyOn(f.Account.collection, 'find');
      const result = await f.execute((req) =>
        req.macl
          .getService(f.Parent.modelName)
          .findOne(
            { _id: f.parent._id },
            { select: ['members'], populate: [{ path: 'members', select: ['name', 'account', 'total'] }] },
            quiet,
          ),
      );
      expect(result).toMatchObject({ success: true });
      if (!result.success) throw new Error(result.code);
      const rows = result.data.members;
      assertRow(rows[0], 'read', f.a._id);
      expect(rows[1].account).toEqual(f.b._id);
      expect(rows[1]).not.toHaveProperty('total');
      expect(rows[2]).toEqual(rows[0]);
      expect(rows[2]).not.toBe(rows[0]);
      expect(f.targetTotal).toHaveBeenCalledTimes(strict ? 0 : 1);
      expect(find).toHaveBeenCalledTimes(strict ? 0 : 1);
    });

    it.each(['legacy', 'correlated'] as const)(
      '%s include output retains permitted target references independently of private base read',
      async (mode) => {
        const f = await policyFixture();
        const result = await f.execute((req) =>
          req.macl.getService(f.Parent.modelName).findOne(
            { _id: f.parent._id },
            {
              select: ['name'],
              include: [
                {
                  model: f.Member.modelName,
                  op: 'list',
                  path: 'joined',
                  args: { select: ['name', 'account', 'total'] },
                  ...(mode === 'correlated'
                    ? { mode, filter: { key: { $parent: 'key' } } }
                    : { localField: 'key', foreignField: 'key' }),
                },
              ],
            } as never,
            quiet,
          ),
        );
        expect(result).toMatchObject({ success: true });
        if (!result.success) throw new Error(result.code);
        assertRow(result.data.joined[0], 'list', f.a._id);
      },
    );

    it.each(['embedded', 'child', 'populated', 'include'] as const)(
      '%s stages keep their initial mode through an awaited parent hook',
      async (stage) => {
        const f = await policyFixture();
        let entered!: () => void;
        let release!: () => void;
        const ready = new Promise<void>((resolve) => (entered = resolve));
        const held = new Promise<void>((resolve) => (release = resolve));
        let first = true;
        f.api.setModelOption(f.Parent.modelName, 'baseFilter.read', async () => {
          if (first) {
            first = false;
            entered();
            await held;
          }
          return {};
        });
        const results = await f.execute(async (req) => {
          const service = req.macl.getService(f.Parent.modelName);
          const read = () =>
            stage === 'child'
              ? service.readSub(String(f.parent._id), 'children', String(f.parent.children[0]._id), {
                  select: ['account', 'total'],
                })
              : service.findOne(
                  { _id: f.parent._id },
                  stage === 'embedded'
                    ? { select: ['children.account', 'children.total'] }
                    : stage === 'populated'
                      ? { select: ['members'], populate: [{ path: 'members', select: ['account', 'total'] }] }
                      : {
                          select: ['name'],
                          include: [
                            {
                              model: f.Member.modelName,
                              op: 'read',
                              path: 'joined',
                              localField: 'key',
                              foreignField: 'key',
                              args: { select: ['account', 'total'] },
                            },
                          ],
                        },
                  quiet,
                );
          const pending = read();
          await ready;
          f.api.setGlobalOption('requireOperationAccessForPopulateDependencies', !strict);
          release();
          return [await pending, await read()];
        });
        for (const [index, result] of results.entries()) {
          expect(result).toMatchObject({ success: true });
          if (!result.success) throw new Error(result.code);
          const data = result.data as Row;
          const row =
            stage === 'embedded'
              ? data.children[0]
              : stage === 'populated'
                ? data.members[0]
                : stage === 'include'
                  ? data.joined
                  : data;
          expect(row.account).toEqual(f.a._id);
          if (index === 0 ? strict : !strict) expect(row).not.toHaveProperty('total');
          else expect(row).toHaveProperty('total', 'read:10');
        }
      },
    );
  });
});
