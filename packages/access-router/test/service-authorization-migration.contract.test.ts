import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import path from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../dist/index.mjs';
import type { Filter, ModelRequest } from '../src/interfaces';
import type { ModelAdapter } from '../src/model';
import type { Service } from '../src/services/service';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

const quiet = { skim: true, includePermissions: false, includeFieldPermissions: false };
const noteGrant = { outputFields: { mode: 'grant' as const, paths: ['internalNote'] } };
const badRequest = { success: false, kind: 'error', code: 'bad_request' };
const forbidden = { success: false, kind: 'error', code: 'forbidden', query: { filter: false } };
const methods = ['findOne', 'find', 'findById', 'create', 'updateOne', 'updateById', 'upsert', 'new'] as const;
const rowMethods = ['findOne', 'find', 'findById', 'updateOne', 'updateById', 'upsert'] as const;
type Method = (typeof methods)[number];
let sequence = 0;
const runtimes: Array<ReturnType<typeof createAccessRuntime>> = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const api of runtimes.splice(0)) api.runtime.clearOpenApiRoutes();
  mongoose.deleteModel(/^Sva09/);
});

async function fixture(options: Record<string, unknown> = {}) {
  const api = createAccessRuntime();
  runtimes.push(api);
  const tag = ++sequence;
  const modelName = `Sva09Order${tag}`,
    targetName = `Sva09Customer${tag}`;
  const Customer = mongoose.model(
    targetName,
    new mongoose.Schema({ name: String, internalNote: String, orderKey: String, tenant: String }),
  );
  const schema = new mongoose.Schema({
    status: { type: String, default: 'draft' },
    internalNote: { type: String, select: false, default: 'server-default' },
    ownerId: { type: String, default: 'alice' },
    tenant: String,
    slug: String,
    transformPass: Number,
    authorization: mongoose.Schema.Types.Mixed,
    overrides: mongoose.Schema.Types.Mixed,
    customer: { type: mongoose.Schema.Types.ObjectId, ref: targetName },
  });
  const projections: Record<string, number>[] = [];
  schema.pre('find', function () {
    projections.push({ ...this.projection() });
  });
  schema.pre('findOne', function () {
    projections.push({ ...this.projection() });
  });
  const Order = mongoose.model(modelName, schema);
  api.setGlobalOptions({ globalPermissions: () => [] });
  const targetTransform = vi.fn((filter: unknown) => filter);
  const targetRouter = api.createRouter(Customer, {
    operationAccess: { read: true, list: true, count: true },
    permissionSchema: { name: true, internalNote: false, orderKey: false, tenant: true },
    overrideFilter: { read: targetTransform, list: targetTransform },
    stripPermissionsField: true,
  } as never);
  const router = api.createRouter(Order, {
    hydration: { find: 'lean', findOne: 'lean', findById: 'lean', publicRead: 'lean' },
    basePath: `/sva09-${tag}`,
    operationAccess: { read: true, list: true, create: true, update: true, new: true },
    permissionSchema: {
      status: true,
      internalNote: false,
      slug: true,
      tenant: true,
      customer: true,
      authorization: true,
      overrides: true,
    },
    stripPermissionsField: true,
    ...options,
  } as never);
  const customer = await Customer.create({
    name: 'customer',
    internalNote: 'target-note',
    orderKey: 'first',
    tenant: 'a',
  });
  const rows = await Order.insertMany([
    {
      status: 'ready',
      internalNote: 'note-a',
      ownerId: 'alice',
      tenant: 'a',
      slug: 'first',
      transformPass: 1,
      customer: customer._id,
    },
    { status: 'ready', internalNote: 'note-b', ownerId: 'bob', tenant: 'b', slug: 'second', transformPass: 1 },
  ]);
  const app = express();
  app.use(express.json());
  app.use(router.routes);
  let run: (req: ModelRequest) => Promise<void>;
  let failure: unknown;
  router.router.post('/migration-probe', async (req, res) => {
    try {
      await run(req as unknown as ModelRequest);
    } catch (error) {
      failure = error;
    }
    res.json({ ok: true });
  });
  return {
    api,
    router,
    targetRouter,
    modelName,
    targetName,
    Order,
    Customer,
    rows,
    customer,
    projections,
    targetTransform,
    async execute(callback: (req: ModelRequest) => Promise<void>) {
      failure = undefined;
      run = callback;
      await request(app).post(`/sva09-${tag}/migration-probe`).send({}).expect(200);
      if (failure) throw failure;
    },
  };
}

/** Deliberately JS/mistyped calls; strict source and installed fixtures check the typed API. */
function invoke(
  service: Service,
  method: Method,
  args: unknown,
  options: unknown,
  filter: Filter = {},
  data = {},
  id = 'id',
) {
  switch (method) {
    case 'findOne':
      return service.findOne(filter, args as never, options as never);
    case 'find':
      return service.find(filter, args as never, options as never);
    case 'findById':
      return service.findById(id, args as never, options as never);
    case 'create':
      return service.create(data, args as never, options as never);
    case 'updateOne':
      return service.updateOne(filter, data, args as never, options as never);
    case 'updateById':
      return service.updateById(id, data, args as never, options as never);
    case 'upsert':
      return service.upsert(filter, data, args as never, options as never);
    case 'new':
      return service.new(args as never, options as never);
  }
}

function observeDispatch(service: Service, req: ModelRequest) {
  const adapter = (service as unknown as { model: ModelAdapter }).model;
  const spies = [
    ...(['new', 'create', 'find', 'findOne', 'exists', 'countDocuments', 'aggregate', 'distinct'] as const).map((key) =>
      vi.spyOn(adapter, key),
    ),
    ...[
      'parseClientData',
      'genIDFilter',
      'genFilter',
      'genExecutionPopulate',
      'findPrepared',
      'findOnePrepared',
      'createPrepared',
      'updateOnePrepared',
    ].map((key) => vi.spyOn(service as any, key)),
    vi.spyOn(req.macl, 'getPublicService'),
    vi.spyOn(mongoose.Model.prototype, 'save'),
  ];
  return () => {
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  };
}

const secret = 'sensitive-legacy-value-do-not-echo'; // pragma: allowlist secret
const legacyValues = [
  undefined,
  null,
  {},
  false,
  secret,
  { select: [secret] },
  { filter: { tenant: secret } },
  { filter: false },
  { populate: [{ path: secret }] },
  { idFilter: { slug: secret } },
  { effectiveSelect: [secret] },
  { operation: secret },
  { select: [secret], filter: {}, populate: [], idFilter: {}, effectiveSelect: [], operation: secret },
];

describe('SVA-09 complete service container removal', () => {
  describe.each(methods)('%s boundary', (method) => {
    it.each(['args', 'options'] as const)(
      'rejects every supplied %s.overrides before parsing or dispatch, including mixed authority',
      async (slot) => {
        const f = await fixture();
        await f.execute(async (req) => {
          const service = req.macl.getService(f.modelName);
          const noDispatch = observeDispatch(service, req);
          const marker = { $$sq: { model: f.targetName, op: 'list', args: { select: ['name'] } } };
          for (const value of legacyValues) {
            for (const authorization of [undefined, noteGrant, { rows: null }]) {
              const args = { select: ['internalNote'], ...(slot === 'args' ? { overrides: value } : {}) };
              const options = { ...quiet, authorization, ...(slot === 'options' ? { overrides: value } : {}) };
              const result = await invoke(service, method, args, options, { status: marker }, { status: marker });
              expect(result).toMatchObject(badRequest);
              expect(result.errors).toEqual([{ detail: expect.stringContaining(`${slot}.overrides was removed`) }]);
              expect(JSON.stringify(result)).toContain('options.authorization');
              expect(JSON.stringify(result)).not.toContain(secret);
              expect(result).not.toHaveProperty('data');
              expect(result).not.toHaveProperty('query');
            }
          }
          noDispatch();
        });
      },
    );

    it('rejects inherited/non-enumerable/accessor/null-prototype/array/function controls without reading them', async () => {
      const f = await fixture();
      await f.execute(async (req) => {
        const service = req.macl.getService(f.modelName);
        const noDispatch = observeDispatch(service, req);
        const getter = vi.fn(() => {
          throw new Error(secret);
        });
        const slots = [
          Object.create({ overrides: undefined }),
          Object.defineProperty({}, 'overrides', { value: undefined }),
          Object.defineProperty({}, 'overrides', { get: getter }),
          Object.assign(Object.create(null), { overrides: null }),
          Object.assign([], { overrides: {} }),
          Object.assign(() => {}, { overrides: {} }),
        ];
        for (const value of slots) {
          expect(await invoke(service, method, value, quiet)).toMatchObject(badRequest);
          expect(await invoke(service, method, {}, value)).toMatchObject(badRequest);
        }
        // Presence rejection precedes both ordinary args and new authority getters.
        const args = Object.defineProperty({ overrides: {} }, 'select', { get: getter });
        const options = Object.defineProperty({}, 'authorization', { get: getter });
        expect(await invoke(service, method, args, options)).toMatchObject(badRequest);
        expect(getter).not.toHaveBeenCalled();
        noDispatch();
      });
    });
  });

  it.each([
    'findOneArgs',
    'findByIdArgs',
    'findArgs',
    'createArgs',
    'updateOneArgs',
    'updateByIdArgs',
    'upsertArgs',
  ] as const)('rejects a mistyped %s default at configuration and service entry', async (key) => {
    const f = await fixture();
    expect(() => f.router.set(`defaults.${key}` as never, { overrides: undefined } as never)).toThrow();
    await f.execute(async (req) => {
      const service = req.macl.getService(f.modelName);
      const noDispatch = observeDispatch(service, req);
      service.defaults = { [key]: { overrides: null } } as never;
      expect(await service.findOne({}, {}, { ...quiet, authorization: noteGrant })).toMatchObject(badRequest);
      noDispatch();
    });
  });

  it('rejects legacy controls in existing standalone option slots without adding row-only APIs', async () => {
    const f = await fixture();
    await f.execute(async (req) => {
      const service = req.macl.getService(f.modelName);
      const noDispatch = observeDispatch(service, req);
      expect(await service.exists({}, { overrides: undefined } as never)).toMatchObject(badRequest);
      expect(await service.distinct('status', { overrides: {} } as never)).toMatchObject(badRequest);
      noDispatch();
    });
  });

  it('strict source surface rejects every removed argument/default property and mixed call', () => {
    const root = path.resolve(__dirname, '..');
    const config = ts.readConfigFile(path.join(root, 'tsconfig.typecheck.json'), ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
    const file = path.join(root, 'test/service-authorization-migration.types.fixture.ts');
    const program = ts.createProgram([file], {
      ...parsed.options,
      strict: true,
      noEmit: true,
      paths: {
        '@web-ts-toolkit/access-router': ['./src/index.ts'],
        '@web-ts-toolkit/access-router/advanced': ['./src/advanced.ts'],
      },
    });
    const source = program.getSourceFile(file)!;
    // Check this strict API fixture against source symbols. The separate package
    // typecheck checks all implementation files under the package's compiler policy.
    const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program, source)];
    expect(diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))).toEqual([]);
  });
});

describe('SVA-09 canonical replacements', () => {
  it.each(['false', 'missing'] as const)(
    'ordinary select plus an explicit grant survives finalizer and handle pick (%s request rule)',
    async (rule) => {
      const hook = vi.fn((doc: { ownerId?: string }) => ({ owner: doc.ownerId === 'alice', note: false }));
      const f = await fixture({
        permissionSchema: { status: 'owner', ...(rule === 'false' ? { internalNote: false } : {}) },
        docPermissions: { read: hook },
        alwaysSelectFields: { read: ['ownerId'] },
      });
      await f.execute(async (req) => {
        const service = req.macl.getService(f.modelName);
        const positionalPlan = vi.spyOn(service, 'genSelect');
        const positionalPick = vi.spyOn(req.macl, 'pickAllowedFields');
        const result = await service.findOne(
          { slug: 'first' },
          { select: ['status', 'internalNote'] },
          { ...quiet, authorization: noteGrant },
        );
        expect(result.success).toBe(true);
        if (!result.success) throw new Error(result.code);
        expect(positionalPlan).not.toHaveBeenCalled();
        expect(positionalPick).not.toHaveBeenCalled();
        expect(f.projections.at(-1)).toMatchObject({ status: 1, internalNote: 1, ownerId: 1 });
        expect(result.data).toMatchObject({ status: 'ready', internalNote: 'note-a' });
        expect(result.data).not.toHaveProperty('ownerId');
        expect(result.data).not.toHaveProperty('_permissions');
        const reuse = { documentAuthorization: result.context.documentAuthorization };
        const picked = await service.pickAllowedFields(result.data, 'read', reuse);
        expect(await service.trimOutputFields(picked, 'read', reuse)).toMatchObject({
          status: 'ready',
          internalNote: 'note-a',
        });
        expect(hook).toHaveBeenCalledTimes(1);
        const fresh = await service.pickAllowedFields(result.data, 'read', { authorization: noteGrant });
        expect(fresh).toHaveProperty('internalNote', 'note-a');
        expect(fresh).not.toHaveProperty('status');
        const unselected = await service.findOne(
          { slug: 'first' },
          { select: ['status'] },
          { ...quiet, authorization: noteGrant },
        );
        expect(unselected).toMatchObject({ success: true, data: { status: 'ready' } });
        expect(unselected.data).not.toHaveProperty('internalNote');
        expect(f.projections.at(-1)).not.toHaveProperty('internalNote');
        expect(hook).toHaveBeenCalledTimes(2);
      });
    },
  );

  it.each(['request', 'scope', 'unrestricted'] as const)(
    '%s rows retain one configured transform and scope totalCount',
    async (mode) => {
      let passes = 0;
      const transform = vi.fn(() => ({ status: 'ready', transformPass: ++passes }));
      const base = vi.fn(() => ({ tenant: 'b' }));
      const f = await fixture({ baseFilter: { list: base } });
      // The configured public hook setter remains functional after container removal.
      f.router.overrideFilter('list', transform);
      await f.execute(async (req) => {
        const rows = mode === 'scope' ? { mode, filter: { tenant: 'a' } } : { mode };
        const result = await req.macl
          .getService(f.modelName)
          .find(
            { status: 'rewritten-by-hook' },
            { select: ['slug', 'tenant'], limit: 1 },
            { ...quiet, includeCount: true, authorization: { rows } },
          );
        expect(result).toMatchObject({ success: true, count: 1, totalCount: mode === 'unrestricted' ? 2 : 1 });
        expect(transform).toHaveBeenCalledTimes(1);
        expect(base).toHaveBeenCalledTimes(mode === 'request' ? 1 : 0);
        if (mode !== 'unrestricted')
          expect(result.data).toEqual([expect.objectContaining({ tenant: mode === 'scope' ? 'a' : 'b' })]);
      });
    },
  );

  it.each(rowMethods)('%s false scope replaces false override denial before parsing/IDs/child work', async (method) => {
    const f = await fixture();
    await f.execute(async (req) => {
      const service = req.macl.getService(f.modelName);
      const noDispatch = observeDispatch(service, req);
      const marker = { $$sq: { model: f.targetName, op: 'list' } };
      expect(
        await invoke(
          service,
          method,
          {},
          { ...quiet, authorization: { rows: { mode: 'scope', filter: false } } },
          { status: marker },
          { status: marker },
        ),
      ).toMatchObject(forbidden);
      noDispatch();
    });
  });

  it('omitted policy uses request scope, empty scope is explicit, and nullish scope filters reject', async () => {
    const base = vi.fn(() => false);
    const transform = vi.fn((filter: unknown) => filter);
    const f = await fixture({ baseFilter: { read: base }, overrideFilter: { read: transform } });
    await f.execute(async (req) => {
      const service = req.macl.getService(f.modelName);
      expect(await service.findOne({}, {}, quiet)).toMatchObject(forbidden);
      expect(
        await service.findOne({}, {}, { ...quiet, authorization: { rows: { mode: 'scope', filter: {} } } }),
      ).toMatchObject({ success: true });
      for (const filter of [null, undefined]) {
        expect(
          await service.findOne({}, {}, { ...quiet, authorization: { rows: { mode: 'scope', filter } } } as never),
        ).toMatchObject(badRequest);
      }
      expect(base).toHaveBeenCalledTimes(1);
      expect(transform).toHaveBeenCalledTimes(2);
    });
  });

  it('ordinary populate requires separate source/target grants and preserves target handle authority', async () => {
    const f = await fixture({ permissionSchema: { customer: false } });
    f.targetRouter.operationAccess('read', false);
    await f.execute(async (req) => {
      const service = req.macl.getService(f.modelName);
      const args = { select: ['customer'], populate: [{ path: 'customer', select: ['name', 'internalNote'] }] };
      const source = { outputFields: { mode: 'grant' as const, paths: ['customer'] } };
      expect(await service.findOne({ slug: 'first' }, args, { ...quiet, authorization: source })).toMatchObject({
        success: true,
      });
      expect(f.targetTransform).not.toHaveBeenCalled();
      const result = await service.findOne({ slug: 'first' }, args, {
        ...quiet,
        authorization: {
          ...source,
          related: {
            customer: { model: f.targetName, operation: { mode: 'grant' }, outputFields: noteGrant.outputFields },
          },
        },
      });
      expect(result).toMatchObject({
        success: true,
        data: { customer: { name: 'customer', internalNote: 'target-note' } },
      });
      if (!result.success) throw new Error(result.code);
      const child = (result.data as Record<string, object>).customer;
      const handle = result.context.getDocumentAuthorization(child)!;
      expect(
        await req.macl.getService(f.targetName).pickAllowedFields(child, 'read', { documentAuthorization: handle }),
      ).toMatchObject({ name: 'customer', internalNote: 'target-note' });
      expect(f.targetTransform).toHaveBeenCalledTimes(1);
    });
  });

  it('custom ID replacements use findOne/updateOne predicates; by-ID calls retain normal ID denial', async () => {
    const identifier = vi.fn(() => false);
    const f = await fixture({ resolveIdFilter: identifier, baseFilter: { read: () => false, update: () => false } });
    await f.execute(async (req) => {
      const service = req.macl.getService(f.modelName);
      const options = { ...quiet, authorization: { rows: { mode: 'scope' as const, filter: { tenant: 'a' } } } };
      expect(await service.findOne({ slug: 'first' }, { select: ['status'] }, options)).toMatchObject({
        success: true,
        data: { status: 'ready' },
      });
      expect(
        await service.updateOne({ slug: 'first' }, { status: 'changed' }, { select: ['status'] }, options),
      ).toMatchObject({ success: true, data: { status: 'changed' } });
      expect(identifier).not.toHaveBeenCalled();
      expect(await service.findById('custom', {}, options)).toMatchObject(forbidden);
      expect(identifier).toHaveBeenCalledExactlyOnceWith('custom');
    });
  });

  it('ordinary mutation select and private initiating operation cover create/update/upsert branches without granting writes', async () => {
    const operations: string[] = [];
    const transform = vi.fn((filter: unknown) => filter);
    const receipt = (access: string) => (_doc: unknown, _permissions: unknown, context: { operation: string }) => {
      operations.push(`${access}:${context.operation}`);
      return `${access}:${context.operation}`;
    };
    const f = await fixture({
      permissionSchema: { status: true, slug: true, internalNote: false, receipt: { read: true } },
      virtuals: { receipt: { dependsOn: [], create: receipt('create'), update: receipt('update') } },
      overrideFilter: { update: transform },
    });
    await f.execute(async (req) => {
      const service = req.macl.getService(f.modelName);
      const args = { select: ['internalNote', 'receipt'] },
        options = { ...quiet, authorization: noteGrant };
      const created = await service.create({ status: 'new', internalNote: 'attempted-write' }, args, options);
      const updated = await service.updateOne(
        { slug: 'first' },
        { status: 'changed', internalNote: 'attempted-write' },
        args,
        options,
      );
      const upserted = await service.upsert({ slug: 'first' }, { status: 'upserted' }, args, options);
      const inserted = await service.upsert(
        { slug: 'missing' },
        { status: 'inserted', slug: 'inserted' },
        args,
        options,
      );
      expect(created).toMatchObject({
        success: true,
        data: [{ internalNote: 'server-default', receipt: 'create:create' }],
      });
      expect(updated).toMatchObject({ success: true, data: { internalNote: 'note-a', receipt: 'update:update' } });
      expect(upserted).toMatchObject({ success: true, data: { internalNote: 'note-a', receipt: 'update:upsert' } });
      expect(inserted).toMatchObject({
        success: true,
        data: [{ internalNote: 'server-default', receipt: 'create:upsert' }],
      });
      for (const result of [created, updated, upserted, inserted]) {
        if (!result.success) throw new Error(result.code);
        const row = Array.isArray(result.data) ? result.data[0] : result.data;
        expect(row).not.toHaveProperty('status');
      }
      expect(transform).toHaveBeenCalledTimes(3); // one update + one preparation for each upsert
      expect(operations).toEqual(['create:create', 'update:update', 'update:upsert', 'create:upsert']);
    });
    expect((await f.Order.findById(f.rows[0]._id).select('+internalNote'))?.internalNote).toBe('note-a');
  });

  it.each(['legacy', 'correlated'] as const)(
    '%s includes reuse private prepared queries and selection-limited target grants',
    async (kind) => {
      const f = await fixture();
      await f.execute(async (req) => {
        const descriptor = {
          model: f.targetName,
          path: 'customers',
          op: 'list' as const,
          args: { select: ['internalNote'] },
        };
        const include =
          kind === 'legacy'
            ? { ...descriptor, localField: 'slug', foreignField: 'orderKey' }
            : { ...descriptor, mode: 'correlated' as const, filter: { orderKey: { $parent: 'slug' } } };
        const result = await req.macl.getService(f.modelName).findOne(
          { slug: 'first' },
          { select: ['status'], include },
          {
            ...quiet,
            authorization: { related: { customers: { model: f.targetName, outputFields: noteGrant.outputFields } } },
          },
        );
        expect(result).toMatchObject({ success: true, data: { customers: [{ internalNote: 'target-note' }] } });
        expect(f.targetTransform).toHaveBeenCalledTimes(1);
        expect(result.data).not.toHaveProperty('customers.0.orderKey');
        expect(result.data).not.toHaveProperty('customers.0.name');
      });
    },
  );

  it('named helper planning/grants replace provisional skipChecks and backend-visibility baseFields', async () => {
    const f = await fixture();
    await f.execute(async (req) => {
      const service = req.macl.getService(f.modelName);
      const options = { authorization: noteGrant };
      expect(await service.genSelect('read', ['internalNote'], options)).toContain('internalNote');
      expect(await service.genQuerySelect('read', ['internalNote'], options)).toContain('internalNote');
      const raw = { internalNote: 'backend-value', status: 'ready', ownerId: 'private' };
      expect(await service.pickAllowedFields(raw, 'read', options)).toEqual({
        internalNote: 'backend-value',
        status: 'ready',
      });
      expect(await service.genAllowedFields(raw, 'read', { ...options, purpose: 'output' })).toEqual(
        expect.arrayContaining(['internalNote', 'status']),
      );
    });
  });

  it('business data named overrides/authorization remains valid in writes, predicates and output grants', async () => {
    const f = await fixture();
    const business = { authorization: { mode: 'invoice' }, overrides: { filter: 'customer preference' } };
    await f.execute(async (req) => {
      const service = req.macl.getService(f.modelName);
      const created = await service.create(
        { status: 'business', ...business },
        { select: ['authorization', 'overrides'] },
        quiet,
      );
      expect(created).toMatchObject({ success: true, data: [business] });
      const result = await service.findOne(
        business,
        { select: ['authorization', 'overrides'] },
        {
          ...quiet,
          authorization: { outputFields: { mode: 'grant', paths: ['authorization', 'overrides'] } },
        },
      );
      expect(result).toMatchObject({ success: true, data: business });
    });
  });
});
