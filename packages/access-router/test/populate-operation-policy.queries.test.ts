import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../dist/index.mjs';
import type { ModelRequest, Populate } from '../dist/advanced';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

const flag = 'requireOperationAccessForPopulateQueries' as const;
const quiet = { includePermissions: false, includeFieldPermissions: false, includeCount: false };
const runtimes: ReturnType<typeof createAccessRuntime>[] = [];
let sequence = 0;

afterEach(() => {
  vi.restoreAllMocks();
  for (const api of runtimes.splice(0)) api.runtime.clearOpenApiRoutes();
  mongoose.deleteModel(/^PopQuery/);
});

async function fixture(required = false, hydration: 'lean' | 'hydrated' = 'lean') {
  const api = createAccessRuntime();
  runtimes.push(api);
  api.setGlobalOptions({
    [flag]: required,
    globalPermissions: () => ({ reader: true, admin: false }),
    requestPermissionField: '_permissions',
  });
  const targetName = `PopQueryDocument${++sequence}`;
  const sourceName = `PopQueryParent${sequence}`;
  const queries: Array<{ filter: unknown; projection: unknown }> = [];
  const schema = new mongoose.Schema({
    name: String,
    tenant: String,
    owner: String,
    owned: String,
    secret: String,
    unselected: String,
    readOnly: String,
    listOnly: String,
  });
  schema.pre('find', function () {
    queries.push({ filter: this.getFilter(), projection: this.projection() });
  });
  const Target = mongoose.model(targetName, schema);
  const ref = () => ({ type: mongoose.Schema.Types.ObjectId, ref: targetName });
  const Parent = mongoose.model(
    sourceName,
    new mongoose.Schema({
      name: String,
      group: String,
      ref: ref(),
      refs: [ref()],
      missing: ref(),
      nullable: ref(),
      absent: ref(),
      empty: [ref()],
      children: [{ label: String, ref: ref() }],
      requireOperationAccessForPopulateQueries: Boolean,
      requireOperationAccessForPopulateDependencies: Boolean,
    }),
  );
  const grants = vi.fn((doc: { owner?: string }) => ({ owner: doc.owner === 'actor' }));
  const transform = vi.fn(() => ({}));
  const readRows = vi.fn(() => ({ tenant: 'a' }));
  api.registerModelInstance(targetName, Target);
  // A configured target needs no target router or route mounting.
  api.setModelOptions(targetName, {
    operationAccess: { read: false, list: false },
    stripPermissionsField: true,
    modelPermissionPrefix: 'doc:',
    permissionSchema: {
      name: 'reader',
      owned: 'doc:owner',
      secret: false,
      unselected: true,
      readOnly: { read: true, list: false },
      listOnly: { read: false, list: true },
    },
    alwaysSelectFields: { read: ['owner'], list: ['owner'] },
    docPermissions: { read: grants, list: grants },
    baseFilter: { read: readRows, list: () => ({ tenant: 'b' }) },
    overrideFilter: { read: transform, list: transform },
  });
  const source = api.createRouter(Parent, {
    basePath: '/parents',
    stripPermissionsField: true,
    operationAccess: true,
    permissionSchema: {
      name: true,
      group: true,
      ref: true,
      refs: true,
      missing: true,
      nullable: true,
      absent: true,
      empty: true,
      children: { read: true, list: true, create: true, update: true, sub: { label: true, ref: true } },
      requireOperationAccessForPopulateQueries: true,
      requireOperationAccessForPopulateDependencies: true,
    },
    hydration: { find: hydration, findOne: hydration, publicList: hydration, publicRead: hydration },
  });
  const rows = await Target.create(
    [
      { name: 'visible', tenant: 'a', owner: 'actor' },
      { name: 'list-row', tenant: 'b', owner: 'other' },
      { name: 'other-owner', tenant: 'a', owner: 'other' },
      { name: 'unrelated', tenant: 'a', owner: 'actor' },
    ].map((row) => ({
      ...row,
      owned: 'owner-field',
      secret: 'hidden', // pragma: allowlist secret
      unselected: 'not-requested',
      readOnly: 'read-field',
      listOnly: 'list-field',
    })),
  );
  const missing = new mongoose.Types.ObjectId();
  const parent = await Parent.create({
    name: 'parent',
    group: 'g',
    ref: rows[0]._id,
    refs: [rows[0]._id, rows[1]._id, rows[2]._id, rows[0]._id, missing],
    missing,
    nullable: null,
    empty: [],
    children: [
      { label: 'visible-child', ref: rows[0]._id },
      { label: 'hidden-child', ref: rows[1]._id },
    ],
    requireOperationAccessForPopulateQueries: false,
    requireOperationAccessForPopulateDependencies: false,
  });
  const root = api.createRouter({ basePath: '/root', operationAccess: true });
  let callback: (req: ModelRequest) => Promise<void>;
  let failure: unknown;
  source.router.post('/probe', async (req, res) => {
    try {
      await callback(req as unknown as ModelRequest);
    } catch (error) {
      failure = error;
    }
    res.json({ ok: true });
  });
  const app = express();
  app.use(express.json());
  app.use(source.routes);
  app.use(root.routes);
  return {
    api,
    app,
    source,
    sourceName,
    targetName,
    Parent,
    Target,
    parent,
    rows,
    queries,
    grants,
    transform,
    readRows,
    async execute(run: typeof callback) {
      callback = run;
      failure = undefined;
      await request(app).post('/parents/probe').send({}).expect(200, { ok: true });
      if (failure) throw failure;
    },
  };
}

const selectedTarget = ['name', 'owned', 'secret', 'readOnly', 'listOnly'];
const populated = (path = 'ref', select = selectedTarget): Populate[] => [{ path, select }];
const deferred = () => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};

describe('POP-02 ordinary target operation admission', () => {
  it.each(['lean', 'hydrated'] as const)(
    'populates a configuration-only denied Document with selected fields and request rows (%s)',
    async (hydration) => {
      const f = await fixture(false, hydration);
      expect(f.api.runtime.getOpenApiRoutes().some((route) => route.path.startsWith('/documents'))).toBe(false);
      const args = { select: ['ref', 'refs'], populate: [...populated(), ...populated('refs')] };
      const direct = await request(f.app)
        .post('/parents/__query')
        .send({ ...args, options: quiet })
        .expect(200);
      const root = await request(f.app)
        .post('/root')
        .send([{ target: 'model', name: f.sourceName, op: 'list', args, options: quiet }])
        .expect(200);
      for (const output of [direct.body.data[0], root.body[0].result.data[0]]) {
        expect(output.ref).toEqual({
          _id: String(f.rows[0]._id),
          name: 'visible',
          owned: 'owner-field',
          readOnly: 'read-field',
        });
        expect(output.refs.map((row: { name: string }) => row.name)).toEqual(['visible', 'other-owner', 'visible']);
        expect(output.refs[1]).not.toHaveProperty('owned');
        for (const target of output.refs) {
          for (const key of ['secret', 'unselected', 'owner', 'tenant', 'listOnly'])
            expect(target).not.toHaveProperty(key);
        }
      }
      expect(f.queries).toHaveLength(4);
    },
  );

  it('denies direct and root Document reads/lists and source entry even when population skips admission', async () => {
    const f = await fixture();
    const target = f.api.createRouter(f.Target, { basePath: '/documents' });
    f.app.use(target.routes);
    await request(f.app).post('/documents/__query').send({ options: quiet }).expect(401);
    await request(f.app)
      .post(`/documents/__query/${f.rows[0]._id}`)
      .send({ options: { ...quiet, tryList: false } })
      .expect(401);
    const root = await request(f.app)
      .post('/root')
      .send([
        { target: 'model', name: f.targetName, op: 'list' },
        { target: 'model', name: f.targetName, op: 'read', id: String(f.rows[0]._id) },
      ])
      .expect(200);
    for (const entry of root.body) expect(entry).toMatchObject({ statusCode: 401, result: { code: 'unauthorized' } });
    f.source.operationAccess(false);
    await request(f.app).post('/parents/__query').send({ populate: populated() }).expect(401);
    const source = await request(f.app)
      .post('/root')
      .send([{ target: 'model', name: f.sourceName, op: 'list', args: { populate: populated() } }])
      .expect(200);
    expect(source.body[0]).toMatchObject({ statusCode: 401, result: { code: 'unauthorized' } });
    expect(f.queries).toEqual([]);
  });

  it.each(['empty', 'default'] as const)(
    'keeps the effective %s target field policy during operation bypass',
    async (mode) => {
      const f = await fixture();
      f.api.setModelOption(f.targetName, 'permissionSchema', mode === 'empty' ? {} : undefined);
      if (mode === 'default') f.api.setDefaultModelOptions({ permissionSchema: { name: true, secret: false } });
      await f.execute(async (req) => {
        const result = await req.macl
          .getService(f.sourceName)
          .findOne({}, { select: ['ref'], populate: populated('ref', ['name', 'secret']) }, quiet);
        expect(result).toMatchObject({ success: true });
        if (!result.success) throw new Error(result.code);
        expect((result.data as { ref: unknown }).ref).toEqual({
          _id: f.rows[0]._id,
          ...(mode === 'default' ? { name: 'visible' } : {}),
        });
      });
    },
  );

  it.each([true, false])('retains original authorized IDs only on operation denial (required=%s)', async (required) => {
    const f = await fixture(required);
    await f.execute(async (req) => {
      const result = await req.macl.getService(f.sourceName).findOne(
        { _id: f.parent._id },
        {
          select: ['ref', 'refs', 'missing', 'nullable', 'absent', 'empty'],
          populate: ['ref', 'refs', 'missing', 'nullable', 'absent', 'empty'],
        },
        quiet,
      );
      expect(result).toMatchObject({ success: true });
      if (!result.success) throw new Error(result.code);
      const data = JSON.parse(JSON.stringify(result.data));
      expect(data.nullable).toBeNull();
      expect(data.empty).toEqual([]);
      expect(data).not.toHaveProperty('absent');
      if (required) {
        expect(data.ref).toBe(String(f.rows[0]._id));
        expect(data.refs).toEqual(f.parent.refs.map(String));
        expect(data.missing).toBe(String(f.parent.missing));
        expect(f.queries).toEqual([]);
      } else {
        expect(data.ref.name).toBe('visible');
        expect(data.refs.map((row: { name: string }) => row.name)).toEqual(['visible', 'other-owner', 'visible']);
        expect(data.missing).toBeNull();
      }
    });
  });

  it.each([true, false])('omits source-denied and excluded reference fields (required=%s)', async (required) => {
    const f = await fixture(required);
    f.source.setOption('permissionSchema.ref', false);
    await f.execute(async (req) => {
      const svc = req.macl.getService(f.sourceName);
      for (const select of [
        ['ref', 'name'],
        ['name', '-refs'],
      ]) {
        const result = await svc.findOne(
          {},
          { select, populate: populated(select.includes('-refs') ? 'refs' : 'ref') },
          quiet,
        );
        expect(result).toMatchObject({ success: true, data: { name: 'parent' } });
        if (!result.success) throw new Error(result.code);
        expect(result.data).not.toHaveProperty('ref');
        expect(result.data).not.toHaveProperty('refs');
        if (select.includes('ref')) expect(f.queries).toEqual([]);
      }
      expect(await req.macl.genPopulate(f.sourceName, 'read', 'ref')).toEqual([]);
    });
  });

  it.each([true, false])(
    'honors target selection exclusions and identity independently (required=%s)',
    async (required) => {
      const f = await fixture(required);
      f.api.setModelOption(f.targetName, 'operationAccess', true);
      await f.execute(async (req) => {
        for (const select of [
          ['name', '-_id'],
          ['-owned', '-readOnly', '-listOnly', '-unselected'],
        ]) {
          const result = await req.macl
            .getService(f.sourceName)
            .findOne({}, { select: ['ref'], populate: populated('ref', select) }, quiet);
          expect(result).toMatchObject({ success: true, data: { ref: { name: 'visible' } } });
          if (!result.success) throw new Error(result.code);
          const target = (result.data as { ref: Record<string, unknown> }).ref;
          if (select.includes('-_id')) expect(target).not.toHaveProperty('_id');
          else expect(target).toHaveProperty('_id');
          for (const key of ['secret', 'owned', 'unselected', 'owner', 'readOnly', 'listOnly'])
            expect(target).not.toHaveProperty(key);
        }
      });
    },
  );

  it.each(['default-read', 'descriptor-list', 'option-list'] as const)(
    'uses effective %s operation/row/field policy independently of parent list',
    async (mode) => {
      const f = await fixture(true);
      const read = vi.fn(() => mode !== 'default-read');
      const list = vi.fn(() => mode === 'default-read');
      f.api.setModelOption(f.targetName, 'operationAccess', { read, list });
      await f.execute(async (req) => {
        const svc = req.macl.getService(f.sourceName);
        const args = {
          select: ['refs'],
          populate: [
            { path: 'refs', select: selectedTarget, ...(mode === 'descriptor-list' ? { access: 'list' } : {}) },
          ],
        };
        const options = { ...quiet, ...(mode === 'option-list' ? { populateAccess: 'list' } : {}) };
        const denied = await svc.find({}, args, options);
        expect(denied).toMatchObject({ success: true, data: [{ refs: f.parent.refs }] });
        expect(mode === 'default-read' ? read : list).toHaveBeenCalledTimes(1);
        expect(mode === 'default-read' ? list : read).not.toHaveBeenCalled();
        f.api.setGlobalOption(flag, false);
        const bypass = await svc.find({}, args, options);
        expect(bypass).toMatchObject({ success: true });
        if (!bypass.success) throw new Error(bypass.code);
        const refs = (bypass.data[0] as { refs: Array<Record<string, unknown>> }).refs;
        expect(refs.map((row) => row.name)).toEqual(
          mode === 'default-read' ? ['visible', 'other-owner', 'visible'] : ['list-row'],
        );
        for (const row of refs) {
          expect(row).toHaveProperty(mode === 'default-read' ? 'readOnly' : 'listOnly');
          expect(row).not.toHaveProperty(mode === 'default-read' ? 'listOnly' : 'readOnly');
        }
        expect(mode === 'default-read' ? read : list).toHaveBeenCalledTimes(1);
      });
    },
  );

  it.each(['canonical', 'helper'] as const)(
    'preserves original actor and exact custom policy through %s',
    async (seam) => {
      const f = await fixture(true);
      const guard = vi.fn(function (this: ModelRequest, permissions) {
        expect(this.macl).toBeDefined();
        expect(permissions.has('reader')).toBe(true);
        expect(permissions.has('admin')).toBe(false);
        return true;
      });
      f.api.setModelOptions(f.targetName, {
        operationAccess: { read: false, audit: guard },
        permissionSchema: { name: { audit: true, read: false }, secret: false } as never,
        baseFilter: { audit: () => ({ tenant: 'a' }) },
      });
      await f.execute(async (req) => {
        const descriptor = [{ path: 'ref', access: 'audit', select: ['name', 'secret'] }];
        if (seam === 'helper') {
          const plan = await req.macl.genPopulate(f.sourceName, 'read', descriptor);
          const raw = await f.Parent.findOne({ _id: f.parent._id }).populate(plan);
          expect(raw?.toObject().ref).toMatchObject({ name: 'visible' });
          expect(raw?.toObject().ref).not.toHaveProperty('secret');
        } else {
          const result = await req.macl
            .getService(f.sourceName)
            .findOne({}, { select: ['ref'], populate: descriptor }, quiet);
          expect(result).toMatchObject({ success: true, data: { ref: { name: 'visible' } } });
        }
        expect(req.macl.getPermissions().has('admin')).toBe(false);
      });
      expect(guard).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['canonical', 'helper'] as const)(
    'propagates target operation errors only when required through %s',
    async (seam) => {
      const f = await fixture(true);
      const guard = vi.fn(() => {
        throw new Error('ordinary-operation-sentinel');
      });
      f.api.setModelOption(f.targetName, 'operationAccess.read', guard);
      await f.execute(async (req) => {
        const call = () =>
          seam === 'helper'
            ? req.macl.genPopulate(f.sourceName, 'read', populated())
            : req.macl.getService(f.sourceName).findOne({}, { select: ['ref'], populate: populated() }, quiet);
        await expect(call()).rejects.toThrow('ordinary-operation-sentinel');
        f.api.setGlobalOption(flag, false);
        const result = await call();
        if (seam === 'helper') expect(result).toHaveLength(1);
        else expect(result).toMatchObject({ success: true, data: { ref: { name: 'visible' } } });
      });
      expect(guard).toHaveBeenCalledTimes(1);
    },
  );
});

describe('POP-02 match, rows, helpers and server authority', () => {
  it.each(['canonical', 'helper', 'scoped-helper'] as const)(
    'retains requested match, base rows and mandatory reference IDs through %s with query rewriting',
    async (seam) => {
      const f = await fixture();
      await f.execute(async (req) => {
        const svc = req.macl.getService(f.sourceName);
        const match = { name: { $ne: 'other-owner' } };
        if (seam === 'canonical') {
          const result = await svc.findOne(
            {},
            { select: ['refs'], populate: [{ path: 'refs', select: ['name'], match }] },
            quiet,
          );
          expect(result).toMatchObject({ success: true, data: { refs: [{ name: 'visible' }, { name: 'visible' }] } });
          if (result.success) expect((result.data as { refs: unknown[] }).refs).toHaveLength(2);
        } else if (seam === 'helper') {
          const plan = await svc.genPopulate('read', [{ path: 'refs', select: ['name'], match }]);
          expect(plan).toHaveLength(1);
          const raw = await f.Parent.findOne({ _id: f.parent._id }).populate(plan).lean();
          expect((raw?.refs as unknown as Array<{ name: string }>).map((row) => row.name)).toEqual([
            'visible',
            'visible',
          ]);
        } else {
          const plan = await svc.genPopulate(
            'read',
            [{ path: 'children.ref', select: ['name'], match: { _id: f.rows[3]._id } }],
            { scopePath: ['children'] },
          );
          expect(plan).toHaveLength(1);
          const raw = await f.Parent.findOne({ _id: f.parent._id }).populate(plan).lean();
          expect(raw?.children).toMatchObject([
            { label: 'visible-child', ref: null },
            { label: 'hidden-child', ref: null },
          ]);
        }
        expect(f.transform).toHaveBeenCalledTimes(1);
        expect(f.readRows).toHaveBeenCalledTimes(1);
        expect(f.queries).toHaveLength(1);
        expect(f.queries[0].filter).toMatchObject({ tenant: 'a' });
        expect(JSON.stringify(f.queries[0].filter)).toContain(String(f.rows[0]._id));
        if (seam !== 'scoped-helper') expect(JSON.stringify(f.queries[0].filter)).not.toContain(String(f.rows[3]._id));
      });
    },
  );

  it.each(['miss', 'deleted', 'array-miss'] as const)(
    'does not restore IDs after admitted %s population',
    async (mode) => {
      const f = await fixture();
      if (mode === 'deleted') await f.Target.deleteOne({ _id: f.rows[0]._id });
      const path = mode === 'array-miss' ? 'refs' : 'ref';
      await f.execute(async (req) => {
        const result = await req.macl.getService(f.sourceName).findOne(
          {},
          {
            select: [path],
            populate: [{ path, select: ['name'], ...(mode === 'deleted' ? {} : { match: { name: 'no-match' } }) }],
          },
          quiet,
        );
        expect(result).toMatchObject({ success: true, data: { [path]: mode === 'array-miss' ? [] : null } });
      });
      expect(f.queries).toHaveLength(1);
    },
  );

  it.each(['canonical', 'helper'] as const)(
    'keeps terminal row denial and row errors enforced through %s',
    async (seam) => {
      const f = await fixture();
      await f.execute(async (req) => {
        const call = () =>
          seam === 'helper'
            ? req.macl.genPopulate(f.sourceName, 'read', populated())
            : req.macl.getService(f.sourceName).findOne({}, { select: ['ref'], populate: populated() }, quiet);
        f.api.setModelOption(f.targetName, 'baseFilter.read', () => false);
        const denied = await call();
        if (seam === 'helper') expect(denied).toEqual([]);
        else expect(denied).toMatchObject({ success: true, data: { ref: f.rows[0]._id } });
        f.api.setModelOption(f.targetName, 'baseFilter.read', () => {
          throw new Error('ordinary-row-sentinel');
        });
        await expect(call()).rejects.toThrow('ordinary-row-sentinel');
      });
      expect(f.queries).toEqual([]);
    },
  );

  it.each([true, false])(
    'keeps explicit related operation grants independent from rows and fields (required=%s)',
    async (required) => {
      const f = await fixture(required);
      await f.execute(async (req) => {
        const result = await req.macl.getService(f.sourceName).findOne(
          {},
          {
            select: ['refs'],
            populate: [{ path: 'refs', select: ['name', 'secret'] }],
          },
          {
            ...quiet,
            authorization: { related: { refs: { model: f.targetName, operation: { mode: 'grant' } } } },
          },
        );
        expect(result).toMatchObject({ success: true });
        if (!result.success) throw new Error(result.code);
        const refs = (result.data as { refs: Array<{ name: string }> }).refs;
        expect(refs.map((row) => row.name)).toEqual(['visible', 'other-owner', 'visible']);
        for (const row of refs) expect(row).not.toHaveProperty('secret');
        expect(req.macl.getPermissions().has('admin')).toBe(false);
      });
    },
  );

  it('does not accept client flags as authority while preserving same-spelled business keys', async () => {
    const f = await fixture(true);
    const args = { select: ['ref'], populate: [{ path: 'ref', select: ['name'], [flag]: false }] };
    const direct = await request(f.app)
      .post('/parents/__query')
      .send({
        ...args,
        [flag]: false,
        options: { ...quiet, [flag]: false, requireOperationAccessForPopulateDependencies: false },
      })
      .expect(200);
    expect(direct.body.data[0].ref).toBe(String(f.rows[0]._id));
    const root = await request(f.app)
      .post('/root')
      .send([
        {
          target: 'model',
          name: f.sourceName,
          op: 'list',
          args: { ...args, [flag]: false },
          options: { [flag]: false },
        },
      ])
      .expect(200);
    expect(root.body[0].result.data[0].ref).toBe(String(f.rows[0]._id));
    const fields = ['requireOperationAccessForPopulateQueries', 'requireOperationAccessForPopulateDependencies'];
    const business = await request(f.app)
      .post('/parents/__query')
      .send({
        filter: { [flag]: false },
        select: fields,
        options: quiet,
      })
      .expect(200);
    expect(business.body.data[0]).toMatchObject(Object.fromEntries(fields.map((key) => [key, false])));
    expect(f.api.getGlobalOption(flag)).toBe(true);
    expect(f.api.getGlobalOption('requireOperationAccessForPopulateDependencies')).toBe(true);
    expect(f.queries).toEqual([]);
  });
});

describe.each(['canonical', 'helper'] as const)('POP-02 captured %s policy', (seam) => {
  it.each([
    { name: 'exact read', stored: { read: true, default: false }, defaults: false, allowed: true },
    { name: 'stored default', stored: { default: true }, defaults: false, allowed: true },
    { name: 'bare boolean', stored: true, defaults: false, allowed: true },
    { name: 'exact runtime default', stored: undefined, defaults: { read: true }, allowed: true },
    {
      name: 'runtime default is not an exact fallback',
      stored: undefined,
      defaults: { default: true },
      allowed: false,
    },
    { name: 'stored empty object wins', stored: {}, defaults: { read: true }, allowed: false },
    { name: 'stored denial wins', stored: { read: false }, defaults: { read: true }, allowed: false },
    { name: 'permission string', stored: 'reader', defaults: false, allowed: true },
    { name: 'denied permission string', stored: 'admin', defaults: false, allowed: false },
    { name: 'permission mask', stored: ['reader'], defaults: false, allowed: true },
    { name: 'denied permission mask', stored: ['admin'], defaults: false, allowed: false },
  ])('retains $name resolution with the operation requirement enabled', async ({ stored, defaults, allowed }) => {
    const f = await fixture(true);
    f.api.setDefaultModelOptions({ operationAccess: defaults });
    f.api.setModelOption(f.targetName, 'operationAccess', stored);
    await f.execute(async (req) => {
      if (seam === 'helper') {
        const plan = await req.macl.genPopulate(f.sourceName, 'read', populated());
        expect(plan).toHaveLength(allowed ? 1 : 0);
        if (allowed) {
          const raw = await f.Parent.findOne({ _id: f.parent._id }).populate(plan).lean();
          expect(raw?.ref).toMatchObject({ name: 'visible' });
        }
      } else {
        const result = await req.macl
          .getService(f.sourceName)
          .findOne({}, { select: ['ref'], populate: populated() }, quiet);
        expect(result).toMatchObject({ success: true, data: { ref: allowed ? { name: 'visible' } : f.rows[0]._id } });
      }
    });
  });

  it.each([true, false])(
    'freezes the initial query flag %s across source awaits; later calls see its inverse',
    async (initial) => {
      const f = await fixture(initial);
      const ready = deferred(),
        blocked = deferred();
      const pause = async () => {
        ready.release();
        await blocked.promise;
        return seam === 'helper' ? true : {};
      };
      if (seam === 'helper') f.source.setOption('permissionSchema.ref', pause);
      else f.source.setOption('overrideFilter.read', pause);
      await f.execute(async (req) => {
        const call = () =>
          seam === 'helper'
            ? req.macl.genPopulate(f.sourceName, 'read', populated('ref', ['name']))
            : req.macl
                .getService(f.sourceName)
                .findOne({}, { select: ['ref'], populate: populated('ref', ['name']) }, quiet);
        const pending = call();
        await ready.promise;
        f.api.setGlobalOption(flag, !initial);
        blocked.release();
        const first = await pending;
        const later = await call();
        if (seam === 'helper') {
          expect(first).toHaveLength(initial ? 0 : 1);
          expect(later).toHaveLength(initial ? 1 : 0);
        } else {
          expect(first).toMatchObject({ success: true, data: { ref: initial ? f.rows[0]._id : { name: 'visible' } } });
          expect(later).toMatchObject({ success: true, data: { ref: initial ? { name: 'visible' } : f.rows[0]._id } });
        }
      });
    },
  );

  it.each(['stored-operation', 'runtime-default'] as const)(
    'owns target %s, selection, row policy and original actor before the first source await',
    async (mode) => {
      const f = await fixture(true);
      const ready = deferred(),
        blocked = deferred();
      const guard = vi.fn(function (this: ModelRequest, permissions) {
        expect(this.macl).toBeDefined();
        expect(permissions.has('reader')).toBe(true);
        expect(permissions.has('admin')).toBe(false);
        return true;
      });
      if (mode === 'runtime-default') {
        f.api.setModelOption(f.targetName, 'operationAccess', undefined);
        f.api.setDefaultModelOptions({ operationAccess: { read: guard } });
      } else f.api.setModelOption(f.targetName, 'operationAccess.read', guard);
      const pause = async () => {
        ready.release();
        await blocked.promise;
        return seam === 'helper' ? true : {};
      };
      if (seam === 'helper') f.source.setOption('permissionSchema.ref', pause);
      else f.source.setOption('overrideFilter.read', pause);
      await f.execute(async (req) => {
        const args = { select: ['ref'], populate: [{ path: 'ref', select: ['name'], match: { tenant: 'a' } }] };
        const call = () =>
          seam === 'helper'
            ? req.macl.genPopulate(f.sourceName, 'read', args.populate)
            : req.macl.getService(f.sourceName).findOne({}, args, quiet);
        const pending = call();
        await ready.promise;
        args.populate[0].select.splice(0, 1, 'secret');
        args.populate[0].match.tenant = 'b';
        req._permissions.admin = true;
        if (mode === 'runtime-default') f.api.setDefaultModelOptions({ operationAccess: { read: false } });
        else f.api.setModelOption(f.targetName, 'operationAccess.read', false);
        f.api.setModelOption(f.targetName, 'permissionSchema', { name: false, secret: true });
        f.api.setModelOption(f.targetName, 'baseFilter.read', () => ({ tenant: 'b' }));
        blocked.release();
        const first = await pending;
        if (seam === 'helper') {
          expect(first).toHaveLength(1);
          const raw = await f.Parent.findOne({ _id: f.parent._id })
            .populate(first as Populate[])
            .lean();
          expect(raw?.ref).toMatchObject({ name: 'visible' });
          expect(raw?.ref).not.toHaveProperty('secret');
          expect(await call()).toEqual([]);
        } else {
          expect(first).toMatchObject({ success: true, data: { ref: { name: 'visible' } } });
          expect((first as { data: { ref: unknown } }).data.ref).not.toHaveProperty('secret');
          expect(await call()).toMatchObject({ success: true, data: { ref: f.rows[0]._id } });
        }
        f.api.setModelOption(f.targetName, 'operationAccess.read', true);
        await f.Parent.collection.updateOne({ _id: f.parent._id }, { $set: { ref: f.rows[1]._id } });
        const updated = await call();
        if (seam === 'helper') {
          const raw = await f.Parent.findOne({ _id: f.parent._id })
            .populate(updated as Populate[])
            .lean();
          expect(raw?.ref).toMatchObject({ secret: 'hidden' }); // pragma: allowlist secret
          expect(raw?.ref).not.toHaveProperty('name');
        } else {
          expect(updated).toMatchObject({ success: true, data: { ref: { secret: 'hidden' } } }); // pragma: allowlist secret
          expect((updated as { data: { ref: unknown } }).data.ref).not.toHaveProperty('name');
        }
        expect(guard).toHaveBeenCalledTimes(1);
      });
    },
  );
});

describe('POP-02 shared ordinary execution seams', () => {
  it.each(['read', 'read-filter', 'list', 'fallback', 'create', 'update', 'upsert-create', 'upsert-update'] as const)(
    'honors query bypass through trusted/public %s and leaves stored references intact',
    async (operation) => {
      const f = await fixture();
      if (operation === 'fallback') f.source.setOption('baseFilter.read', () => ({ name: 'not-found' }));
      await f.execute(async (req) => {
        const svc = req.macl.getService(f.sourceName),
          pub = req.macl.getPublicService(f.sourceName);
        const args = { select: ['name', 'ref'], populate: populated('ref', ['name', 'secret']) };
        if (operation === 'fallback') args.populate[0].access = 'read';
        const data = { name: 'changed', ref: f.rows[0]._id };
        const result =
          operation === 'read'
            ? await pub._read(String(f.parent._id), args, { ...quiet, tryList: false })
            : operation === 'read-filter'
              ? await pub._readFilter({ _id: f.parent._id }, args, { ...quiet, tryList: false })
              : operation === 'list'
                ? await pub._list({}, args, quiet)
                : operation === 'fallback'
                  ? await pub._read(String(f.parent._id), args, { ...quiet, tryList: true })
                  : operation === 'create'
                    ? await svc.create(data, args, quiet)
                    : operation === 'update'
                      ? await svc.updateOne({ _id: f.parent._id }, data, args, quiet)
                      : await svc.upsert({ name: operation === 'upsert-create' ? 'new' : 'parent' }, data, args, quiet);
        expect(result).toMatchObject({ success: true });
        if (!result.success) throw new Error(result.code);
        const output = (Array.isArray(result.data) ? result.data[0] : result.data) as {
          _id: mongoose.Types.ObjectId;
          ref: unknown;
        };
        expect(output.ref).toMatchObject({ name: 'visible' });
        expect(output.ref).not.toHaveProperty('secret');
        expect((await f.Parent.collection.findOne({ _id: output._id }))?.ref).toEqual(f.rows[0]._id);
      });
    },
  );

  for (const entry of ['direct', 'root'] as const) {
    it.each(['create', 'update', 'upsert'] as const)(
      `${entry} %s carries query bypass through mutation output`,
      async (operation) => {
        const f = await fixture();
        const args = { select: ['name', 'ref'], populate: populated('ref', ['name', 'secret']) };
        const data = { name: 'wire-write', ref: String(f.rows[0]._id) };
        let output: { ref: unknown };
        if (entry === 'root') {
          const response = await request(f.app)
            .post('/root')
            .send([
              {
                target: 'model',
                name: f.sourceName,
                op: operation,
                ...(operation === 'update' ? { id: String(f.parent._id) } : {}),
                data,
                args,
                options: quiet,
              },
            ])
            .expect(200);
          expect(response.body[0].result).toMatchObject({ success: true });
          const result = response.body[0].result.data;
          output = Array.isArray(result) ? result[0] : result;
        } else {
          const response =
            operation === 'create'
              ? await request(f.app)
                  .post('/parents/__mutation')
                  .send({ data, ...args, options: quiet })
                  .expect(201)
              : operation === 'update'
                ? await request(f.app)
                    .patch(`/parents/__mutation/${f.parent._id}`)
                    .send({ data, ...args, options: quiet })
                    .expect(200)
                : await request(f.app)
                    .put('/parents/__mutation')
                    .send({ data, ...args, options: quiet })
                    .expect(201);
          output = Array.isArray(response.body) ? response.body[0] : response.body;
        }
        expect(output.ref).toMatchObject({ name: 'visible' });
        expect(output.ref).not.toHaveProperty('secret');
        expect((await f.Parent.collection.findOne({ name: 'wire-write' }))?.ref).toEqual(f.rows[0]._id);
      },
    );
  }

  it.each([true, false])(
    'direct/root child reads retain target row and source-field policy (required=%s)',
    async (required) => {
      const f = await fixture(required);
      const args = { populate: populated('ref', ['name', 'secret']) };
      const path = `/parents/${f.parent._id}/children/${f.parent.children[0]._id}/__query`;
      const direct = await request(f.app).post(path).send(args).expect(200);
      const root = await request(f.app)
        .post('/root')
        .send([
          {
            target: 'model',
            name: f.sourceName,
            op: 'subRead',
            id: String(f.parent._id),
            sub: 'children',
            subId: String(f.parent.children[0]._id),
            args,
          },
        ])
        .expect(200);
      for (const output of [direct.body, root.body[0].result.data]) {
        if (required) expect(output.ref).toBe(String(f.rows[0]._id));
        else {
          expect(output.ref).toMatchObject({ name: 'visible' });
          expect(output.ref).not.toHaveProperty('secret');
        }
      }
      f.source.setOption('permissionSchema.children.sub.ref', false);
      const denied = await request(f.app).post(path).send(args).expect(200);
      expect(denied.body).not.toHaveProperty('ref');
    },
  );

  it.each(['embedded', 'child', 'include'] as const)(
    'retains bypass through %s output without granting the entry operation',
    async (seam) => {
      const f = await fixture();
      await f.execute(async (req) => {
        const svc = req.macl.getService(f.sourceName);
        if (seam === 'child') {
          const result = await svc.readSub(String(f.parent._id), 'children', String(f.parent.children[0]._id), {
            populate: populated('ref', ['name', 'secret']),
          });
          expect(result).toMatchObject({ success: true, data: { ref: { name: 'visible' } } });
          if (result.success) expect((result.data as { ref: unknown }).ref).not.toHaveProperty('secret');
        } else if (seam === 'embedded') {
          const result = await svc.findOne(
            {},
            { select: ['children'], populate: populated('children.ref', ['name', 'secret']) },
            quiet,
          );
          expect(result).toMatchObject({
            success: true,
            data: { children: [{ ref: { name: 'visible' } }, { ref: null }] },
          });
        } else {
          const include = {
            model: f.sourceName,
            path: 'related',
            op: 'read' as const,
            localField: 'group',
            foreignField: 'group',
            args: { select: ['ref'], populate: populated('ref', ['name', 'secret']) },
          };
          expect(await svc.findOne({}, { select: ['name'], include: [include] }, quiet)).toMatchObject({
            success: true,
            data: { related: { ref: { name: 'visible' } } },
          });
          f.source.operationAccess('read', false);
          expect(await svc.findOne({}, { include: [include] }, quiet)).toMatchObject({
            success: false,
            code: 'unauthorized',
          });
        }
      });
    },
  );
});

describe.each([true, false])('POP-02 source and target function policy (required=%s)', (required) => {
  it.each(['allowed', 'denied', 'error'] as const)(
    'keeps %s source reference decisions after target admission',
    async (decision) => {
      const f = await fixture(required);
      const rule = vi.fn((permissions) => {
        expect(permissions.has('reader')).toBe(true);
        expect(permissions.has('admin')).toBe(false);
        if (decision === 'error') throw new Error('source-field-sentinel');
        return decision === 'allowed';
      });
      f.source.setOption('permissionSchema.ref', rule);
      await f.execute(async (req) => {
        const result = await req.macl
          .getService(f.sourceName)
          .findOne({}, { select: ['ref'], populate: populated('ref', ['name']) }, quiet);
        expect(result).toMatchObject({ success: true });
        if (!result.success) throw new Error(result.code);
        if (decision !== 'allowed') expect(result.data).not.toHaveProperty('ref');
        else expect(result.data).toMatchObject({ ref: required ? f.rows[0]._id : { name: 'visible' } });
      });
      expect(rule).toHaveBeenCalledTimes(1);
    },
  );
});
