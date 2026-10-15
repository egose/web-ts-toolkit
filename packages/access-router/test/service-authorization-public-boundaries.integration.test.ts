import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime, permissionsPlugin } from '../dist/index.mjs';
import type { ModelRequest } from '../src/interfaces';
import { Codes } from '../src/enums';
import { toPublicServiceResult } from '../src/http/response-pipelines/service-result';
import { useMongoTestDatabase } from './setup';
import { noteGrant, quiet } from './service-authorization-fixture';

useMongoTestDatabase();
const runtimes: Array<{ clearOpenApiRoutes(): void }> = [];
afterEach(() => {
  vi.restoreAllMocks();
  runtimes.splice(0).forEach((runtime) => runtime.clearOpenApiRoutes());
  mongoose.deleteModel(/^Sva08/);
});
let sequence = 0;
const badRequest = { success: false, code: Codes.BadRequest };
const business = { authorization: { mode: 'invoice' }, overrides: { filter: 'customer preference' } };
const controls = {
  authorization: { ...noteGrant, inputFields: { mode: 'grant', paths: ['internalNote'] } },
  overrides: { select: ['internalNote'], filter: {} },
  documentAuthorization: {},
  documentAuthorizationStage: {},
  resolvedAuthorization: {},
  execution: {},
  executionContext: {},
  serviceExecutionContext: {},
  preparedQuery: { filter: {}, parsed: true },
  preparedFilter: {},
  preparedModelQuery: {},
  resolvedIdentifier: {},
  skipParsing: true,
  skipAuthorization: true,
  alreadyAuthorized: true,
  operation: 'read',
};

// Observe actual Mongoose dispatch, not mocked successful service results. All
// spies call through; reset only their observations after the positive control.
function observe(Model: mongoose.Model<any>) {
  return [
    vi.spyOn(Model, 'find'),
    vi.spyOn(Model, 'findOne'),
    vi.spyOn(Model, 'countDocuments'),
    vi.spyOn(Model, 'aggregate'),
    vi.spyOn(Model, 'create'),
    vi.spyOn(Model.prototype, 'save'),
    vi.spyOn(Model.collection, 'insertOne'),
    vi.spyOn(Model.collection, 'updateOne'),
  ];
}

async function fixture(sourceOptions: Record<string, unknown> = {}, targetOptions: Record<string, unknown> = {}) {
  const api = createAccessRuntime();
  runtimes.push(api.runtime);
  const n = ++sequence,
    sourceName = `Sva08Source${n}`,
    targetName = `Sva08Target${n}`;
  const targetSchema = new mongoose.Schema({
    name: String,
    internalNote: { type: String, select: false },
    group: String,
    next: { type: mongoose.Schema.Types.ObjectId, ref: targetName },
  });
  const Target = mongoose.model(targetName, targetSchema);
  const schema = new mongoose.Schema({
    name: String,
    internalNote: { type: String, default: 'server-note', select: false },
    owner: String,
    status: String,
    tenant: String,
    group: String,
    authorization: mongoose.Schema.Types.Mixed,
    overrides: mongoose.Schema.Types.Mixed,
    ref: { type: mongoose.Schema.Types.ObjectId, ref: targetName },
    contacts: [{ email: String, ref: { type: mongoose.Schema.Types.ObjectId, ref: targetName } }],
  });
  schema.plugin(permissionsPlugin, { modelName: sourceName });
  const Source = mongoose.model(sourceName, schema);
  api.setGlobalOptions({ requestPermissionField: '_permissions', globalPermissions: () => [] });
  const targetRouter = api.createRouter(Target, {
    basePath: '/targets',
    operationAccess: { list: false, read: false, count: false },
    baseFilter: { read: () => false, list: () => false, count: () => false },
    permissionSchema: { name: true, internalNote: false, next: true },
    ...targetOptions,
  } as never);
  const router = api.createRouter(Source, {
    basePath: '/sources',
    operationAccess: true,
    permissionSchema: {
      name: true,
      internalNote: false,
      status: true,
      tenant: true,
      group: true,
      authorization: true,
      overrides: true,
      ref: true,
      contacts: { read: true, list: true, create: true, update: true, sub: { email: true, ref: true } },
    },
    ...sourceOptions,
  } as never);
  const root = api.createRouter({ basePath: '/root', operationAccess: true });
  const targets = await Target.insertMany([
    { name: 'target-a', internalNote: 'target-note', group: 'g' },
    { name: 'target-b', internalNote: 'next-note', group: 'g' },
  ]);
  await Target.updateOne({ _id: targets[0]._id }, { next: targets[1]._id });
  const rows = await Source.insertMany([
    {
      name: 'a',
      internalNote: 'source-note',
      status: 'owned',
      owner: 'alice',
      tenant: 'a',
      group: 'g',
      ref: targets[0]._id,
      contacts: [{ email: 'a@x', ref: targets[0]._id }],
      ...business,
    },
    { name: 'b', internalNote: 'other-note', status: 'other', owner: 'bob', tenant: 'b', group: 'g', ...business },
  ]);
  const app = express().use(express.json()).use(router.routes).use(targetRouter.routes).use(root.routes);
  let callback: (req: ModelRequest) => Promise<void>, failure: unknown;
  router.router.post('/probe', async (req, res) => {
    try {
      await callback(req as unknown as ModelRequest);
    } catch (error) {
      failure = error;
    }
    res.json({ ok: true });
  });
  // The installed bundle owns the prototype. Observe it through a real request
  // so this includes target admission in subsequent HTTP/root requests as well.
  let prototype: object;
  callback = async (req) => {
    prototype = Object.getPrototypeOf(req.macl.getPublicService(sourceName));
  };
  await request(app).post('/sources/probe').send({}).expect(200);
  if (failure) throw failure;
  const targetDispatch = vi.spyOn(prototype!, 'getAuthorizedTargetService' as never);
  const work = [...observe(Source), ...observe(Target)];
  const targetPolicy = {
    model: targetName,
    operation: { mode: 'grant' },
    rows: { mode: 'unrestricted' },
    outputFields: { mode: 'grant', paths: ['internalNote'] },
  };
  return {
    api,
    app,
    router,
    Source,
    Target,
    sourceName,
    targetName,
    rows,
    targets,
    targetPolicy,
    targetDispatch,
    include: (op = 'list', correlated = false) => ({
      model: targetName,
      op,
      path: 'items',
      ...(correlated
        ? { mode: 'correlated', filter: { group: { $parent: 'group' } } }
        : { localField: 'group', foreignField: 'group' }),
      ...(op === 'count' ? {} : { args: { select: ['name', 'internalNote'] } }),
    }),
    clear: () => {
      work.forEach((spy) => spy.mockClear());
      targetDispatch.mockClear();
    },
    noWork: () => {
      work.forEach((spy) => expect(spy).not.toHaveBeenCalled());
      expect(targetDispatch).not.toHaveBeenCalled();
    },
    noPersistence: () => work.forEach((spy) => expect(spy).not.toHaveBeenCalled()),
    async execute(run: (req: ModelRequest) => Promise<void>) {
      callback = run;
      failure = undefined;
      await request(app).post('/sources/probe').send({}).expect(200);
      if (failure) throw failure;
    },
  };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
type Operation = 'list' | 'read' | 'create' | 'update' | 'upsert' | 'upsert-create';
async function grantedOperation(f: Fixture, svc: ReturnType<ModelRequest['macl']['getPublicService']>, op: Operation) {
  const id = String(f.rows[0]._id),
    args = { select: ['name', 'internalNote'] };
  const options = { ...quiet, authorization: noteGrant };
  const result =
    op === 'list'
      ? await svc.find({}, args, options)
      : op === 'read'
        ? await svc.findOne({ _id: id }, args, options)
        : op === 'create'
          ? await svc.create({ name: 'created' }, args, options)
          : op === 'update'
            ? await svc.updateOne({ _id: id }, { name: 'a' }, args, options)
            : op === 'upsert'
              ? await svc.upsert({ _id: id }, { name: 'a' }, args, options)
              : await svc.upsert({ name: 'missing' }, { name: 'created' }, args, options);
  expect(result.success).toBe(true);
  if (!result.success) throw new Error(result.code);
  expect(Array.isArray(result.data) ? result.data[0] : result.data).toHaveProperty(
    'internalNote',
    op === 'create' || op === 'upsert-create' ? 'server-note' : 'source-note',
  );
  return result;
}

async function grantControl(f: Fixture) {
  await f.execute(async (req) => {
    const result = await req.macl
      .getService(f.sourceName)
      .findOne(
        { _id: f.rows[0]._id },
        { select: ['name', 'internalNote'] },
        { ...quiet, authorization: { ...noteGrant, rows: { mode: 'unrestricted' } } },
      );
    expect(result).toMatchObject({ success: true, data: { name: 'a', internalNote: 'source-note' } });
  });
  f.clear();
}

function assertPrivateFree(value: unknown, permissionMap = false) {
  if (!value || typeof value !== 'object') return;
  expect(Object.getOwnPropertySymbols(value)).toEqual([]);
  for (const key of Object.getOwnPropertyNames(value)) {
    // These two English names are legitimate declared business fields.
    if (key === 'authorization' || key === 'overrides') {
      if (permissionMap) expect(typeof (value as any)[key]).toBe('boolean');
      else expect((value as any)[key]).toEqual(business[key]);
    } else
      expect([
        ...Object.keys(controls),
        'context',
        'contexts',
        'docPermissions',
        'targetPlan',
        'childPlan',
        'authorizationBinding',
        'relatedPlans',
        'VIRT_ASSOCIATION',
      ]).not.toContain(key);
    assertPrivateFree((value as Record<string, unknown>)[key], key === '_view' || key === '_edit');
  }
}

describe('SVA-08 real backend grants versus public authority injection', () => {
  it.each(['grant', 'unrestricted'] as const)(
    'working %s input authority is rejected by every public mutation envelope before effects',
    async (mode) => {
      const f = await fixture();
      const authorization = { inputFields: mode === 'grant' ? { mode, paths: ['internalNote'] } : { mode } };
      await f.execute(async (req) => {
        const service = req.macl.getPublicService(f.sourceName);
        for (const op of ['create', 'update', 'upsert', 'upsert-create'] as const) {
          const id = String(f.rows[0]._id),
            data = { name: 'backend', internalNote: `written-${op}` };
          const internal =
            op === 'create'
              ? await service.create(data, {}, { ...quiet, authorization })
              : op === 'update'
                ? await service.updateById(id, data, {}, { ...quiet, authorization })
                : await service.upsert(
                    op === 'upsert' ? { _id: id } : { name: 'missing' },
                    data,
                    {},
                    { ...quiet, authorization },
                  );
          expect(internal).toMatchObject({ success: true });
          if (!internal.success) throw new Error(internal.code);
          const output = (Array.isArray(internal.data) ? internal.data[0] : internal.data) as any;
          expect(output).not.toHaveProperty('internalNote');
          const persisted = await f.Source.collection.findOne({ _id: output._id });
          expect(persisted).toHaveProperty('internalNote', `written-${op}`);
          f.clear();
          for (const slot of ['args', 'options']) {
            const args = slot === 'args' ? { authorization } : {};
            const options = slot === 'options' ? { ...quiet, authorization } : quiet;
            const rejected =
              op === 'create'
                ? await service._create(data, args as never, options as never)
                : op === 'update'
                  ? await service._update(id, data, args as never, options as never)
                  : await service._upsert(
                      { ...data, ...(op === 'upsert' ? { _id: id } : {}) },
                      args as never,
                      options as never,
                    );
            expect(rejected).toMatchObject(badRequest);
            const method = op === 'update' ? 'patch' : op === 'create' ? 'post' : 'put';
            const url = op === 'update' ? `/sources/__mutation/${id}` : '/sources/__mutation';
            const agent = request(f.app);
            await agent[method](url)
              .send({ data, ...(slot === 'args' ? { authorization } : { options: { authorization } }) })
              .expect(400);
            await request(f.app)
              .post('/root')
              .send([
                { target: 'model', name: f.sourceName, op: 'create', data: { name: 'must-not-run' } },
                {
                  target: 'model',
                  name: f.sourceName,
                  op: op.startsWith('upsert') ? 'upsert' : op,
                  id,
                  data,
                  [slot]: { authorization },
                },
              ])
              .expect(400);
            f.noWork();
          }
          expect(await f.Source.collection.findOne({ _id: output._id })).toEqual(persisted);
        }
      });
    },
  );

  it.each(['list', 'read', 'create', 'update', 'upsert', 'upsert-create'] as const)(
    '%s JS args/options reject controls and reuse stays request-only',
    async (op) => {
      const f = await fixture();
      await f.execute(async (req) => {
        // PublicService is also the real internal Service on this exact request.
        const svc = req.macl.getPublicService(f.sourceName);
        const id = String(f.rows[0]._id),
          args = { select: ['name', 'internalNote'] };
        const call = (a: any, o: any) =>
          op === 'list'
            ? svc._list({}, a, o)
            : op === 'read'
              ? svc._read(id, a, o)
              : op === 'create'
                ? svc._create({ name: 'public-created' }, a, o)
                : op === 'update'
                  ? svc._update(id, { name: 'a' }, a, o)
                  : svc._upsert({ ...(op === 'upsert' ? { _id: id } : {}), name: 'a' }, a, o);
        await grantedOperation(f, svc, op);
        f.clear();
        for (const [key, value] of Object.entries(controls))
          for (const slot of ['args', 'options']) {
            expect(
              await call(
                slot === 'args' ? { ...args, [key]: value } : args,
                slot === 'options' ? { ...quiet, [key]: value } : quiet,
              ),
            ).toMatchObject(badRequest);
            f.noWork();
          }
        const ordinary = await call(args, quiet);
        expect(ordinary.success).toBe(true);
        if (!ordinary.success) throw new Error(ordinary.code);
        for (const row of Array.isArray(ordinary.data) ? ordinary.data : [ordinary.data]) {
          expect(row).not.toHaveProperty('internalNote');
          assertPrivateFree(row);
        }
      });
    },
  );

  it('input authority does not change initiating route guards or transformed-public admission', async () => {
    let transformed: unknown;
    const authorization = { inputFields: { mode: 'grant' as const, paths: ['internalNote'] } };
    const f = await fixture({
      operationAccess: { create: false, update: true, basicUpdate: false },
      requestSchemas: { advancedUpdate: () => ({ success: true, data: transformed }) },
    });
    await f.execute(async (req) => {
      const result = await req.macl
        .getService(f.sourceName)
        .create({ name: 'backend', internalNote: 'input-granted' }, {}, { ...quiet, authorization });
      expect(result).toMatchObject({ success: true });
      if (!result.success) throw new Error(result.code);
      expect(await f.Source.collection.findOne({ _id: (result.data[0] as any)._id })).toHaveProperty(
        'internalNote',
        'input-granted',
      );
    });
    f.clear();
    await request(f.app).post('/sources').send({ internalNote: 'attack' }).expect(401);
    await request(f.app)
      .post('/sources/__mutation')
      .send({ data: { internalNote: 'attack' }, options: { authorization } })
      .expect(401);
    await request(f.app).patch(`/sources/${f.rows[0]._id}`).send({ internalNote: 'attack' }).expect(401);
    const root = await request(f.app)
      .post('/root')
      .send([{ target: 'model', name: f.sourceName, op: 'create', data: { internalNote: 'attack' } }])
      .expect(200);
    expect(root.body[0].result).toMatchObject({ success: false, code: 'unauthorized' });
    transformed = { data: { internalNote: 'attack' }, options: { authorization } };
    await request(f.app).patch(`/sources/__mutation/${f.rows[0]._id}`).send({ data: {} }).expect(400);
    f.noWork();
    expect(await f.Source.collection.findOne({ _id: f.rows[0]._id })).toHaveProperty('internalNote', 'source-note');
  });

  it.each(['list', 'read', 'create', 'update', 'upsert'] as const)(
    'direct HTTP and root %s reject wire controls before persistence',
    async (op) => {
      const f = await fixture();
      await f.execute(async (req) => {
        await grantedOperation(f, req.macl.getPublicService(f.sourceName), op);
      });
      f.clear();
      const id = String(f.rows[0]._id);
      const method = op === 'update' ? 'patch' : op === 'upsert' ? 'put' : 'post';
      const url =
        op === 'list'
          ? '/sources/__query'
          : op === 'read'
            ? `/sources/__query/${id}`
            : op === 'update'
              ? `/sources/__mutation/${id}`
              : '/sources/__mutation';
      for (const [key, value] of Object.entries(controls)) {
        for (const injection of [{ [key]: value }, { options: { [key]: value } }]) {
          const agent = request(f.app);
          await agent[method](url)
            .send({ data: { name: 'blocked' }, ...injection })
            .expect(400);
          f.noWork();
        }
        for (const slot of ['args', 'options']) {
          // A valid first entry must not run before a later invalid entry.
          await request(f.app)
            .post('/root')
            .send([
              { target: 'model', name: f.sourceName, op: 'list' },
              { target: 'model', name: f.sourceName, op, id, data: { name: 'blocked' }, [slot]: { [key]: value } },
            ])
            .expect(400);
          f.noWork();
        }
      }
    },
  );

  it.each(['scope', 'unrestricted'] as const)(
    'a working %s row grant cannot enter public args/options or revive early denial',
    async (mode) => {
      const f = await fixture({ baseFilter: { read: () => false, list: () => false } });
      await f.execute(async (req) => {
        const svc = req.macl.getPublicService(f.sourceName);
        const authorization = { ...noteGrant, rows: mode === 'scope' ? { mode, filter: { tenant: 'b' } } : { mode } };
        const granted = await svc.findOne(
          { _id: f.rows[1]._id },
          { select: ['internalNote'] },
          { ...quiet, authorization },
        );
        expect(granted).toMatchObject({ success: true, data: { internalNote: 'other-note' } });
        f.clear();
        for (const slot of ['args', 'options']) {
          expect(
            await svc._list(
              {},
              slot === 'args' ? ({ authorization } as never) : {},
              slot === 'options' ? ({ authorization } as never) : quiet,
            ),
          ).toMatchObject(badRequest);
          await request(f.app)
            .post('/sources/__query')
            .send(slot === 'args' ? { authorization } : { options: { authorization } })
            .expect(400);
          await request(f.app)
            .post('/root')
            .send([{ target: 'model', name: f.sourceName, op: 'list', [slot]: { authorization } }])
            .expect(400);
          f.noWork();
        }
        expect(await svc._read(String(f.rows[1]._id), {}, { ...quiet, tryList: true })).toMatchObject({
          success: false,
          code: Codes.Forbidden,
        });
        expect(await svc._list(false, { include: f.include() } as never, quiet)).toMatchObject({
          success: false,
          code: Codes.Forbidden,
        });
        const subquery = { name: { $$sq: { model: f.targetName, op: 'list', filter: {} } } };
        expect(
          await svc.findOne(
            subquery as never,
            { include: f.include() } as never,
            {
              ...quiet,
              authorization: {
                ...noteGrant,
                rows: { mode: 'scope', filter: false },
                related: { items: f.targetPolicy },
              },
            } as never,
          ),
        ).toMatchObject({ success: false, code: Codes.Forbidden });
        f.noWork();
      });
    },
  );

  it('authority defaults reject atomically and mutated defaults cannot elevate reused public services', async () => {
    const f = await fixture({
      defaults: { publicReadArgs: { select: ['name', 'internalNote'] }, publicReadOptions: quiet },
    });
    await grantControl(f);
    for (const [key, value] of Object.entries(controls)) {
      expect(() =>
        f.api.setModelOption(f.sourceName, `defaults.findOneOptions.${key}` as never, value as never),
      ).toThrow();
    }
    expect(f.api.getModelOption(f.sourceName, 'defaults.publicReadArgs')).toEqual({ select: ['name', 'internalNote'] });
    await f.execute(async (req) => {
      const svc = req.macl.getPublicService(f.sourceName);
      await grantedOperation(f, svc, 'read');
      f.clear();
      const saved = svc.defaults;
      for (const [key, value] of Object.entries(controls)) {
        svc.defaults = { ...saved, findOneOptions: { [key]: value } } as never;
        expect(await svc._read(String(f.rows[0]._id))).toMatchObject(badRequest);
        f.noWork();
      }
      svc.defaults = saved;
      const ordinary = await svc._read(String(f.rows[0]._id));
      expect(ordinary).toMatchObject({ success: true, data: { name: 'a' } });
      if (!ordinary.success) throw new Error(ordinary.code);
      expect(ordinary.data).not.toHaveProperty('internalNote');
    });
  });

  it.each([false, true])(
    'legacy/correlated include read/list/count controls reject before sibling target dispatch (correlated=%s)',
    async (correlated) => {
      const f = await fixture();
      await f.execute(async (req) => {
        const svc = req.macl.getPublicService(f.sourceName);
        for (const op of ['read', 'list', 'count']) {
          const include = f.include(op, correlated);
          const { outputFields: _output, ...countPolicy } = f.targetPolicy;
          const granted = await svc.findOne(
            { _id: f.rows[0]._id },
            { include } as never,
            { ...quiet, authorization: { related: { items: op === 'count' ? countPolicy : f.targetPolicy } } } as never,
          );
          expect(granted, `${op}: ${JSON.stringify(granted)}`).toMatchObject({ success: true });
          if (!granted.success) throw new Error(granted.code);
          expect((granted.data as any).items).toEqual(
            op === 'count'
              ? 2
              : op === 'list'
                ? [
                    expect.objectContaining({ internalNote: 'target-note' }),
                    expect.objectContaining({ internalNote: 'next-note' }),
                  ]
                : expect.objectContaining({ internalNote: 'target-note' }),
          );
          // Count policy derivation also runs for this embedded output. Normalized
          // count defaults must not become unsupported caller-supplied dimensions.
          expect((granted.data as any).contacts[0]).toHaveProperty('email', 'a@x');
          assertPrivateFree(granted.data);
          f.clear();
          for (const [key, value] of Object.entries({ ...controls, authorization: f.targetPolicy }))
            for (const slot of ['args', 'options']) {
              const injected = { ...include, [slot]: { [key]: value } };
              const args = { include: [{ ...include, path: 'first' }, injected] };
              expect(await svc._list({}, args as never, quiet)).toMatchObject(badRequest);
              await request(f.app).post('/sources/__query').send(args).expect(400);
              await request(f.app)
                .post('/root')
                .send([{ target: 'model', name: f.sourceName, op: 'list', args }])
                .expect(400);
              f.noWork();
            }
        }
      });
    },
  );

  it.each([
    { correlated: false, path: 'nested' },
    { correlated: true, path: 'nested' },
    { correlated: false, path: 'group' },
    { correlated: true, path: 'group' },
  ])(
    'nested include consumes its private association key before cleanup ($correlated, $path)',
    async ({ correlated, path }) => {
      const groups: unknown[] = [];
      const getter = vi.fn((doc) => {
        groups.push(doc.group);
        return `computed:${doc.name}`;
      });
      const f = await fixture(
        {},
        {
          permissionSchema: { name: true, internalNote: false, computed: true },
          virtuals: { computed: { dependsOn: ['name'], list: getter } },
        },
      );
      await f.execute(async (req) => {
        const svc = req.macl.getPublicService(f.sourceName);
        const nested = { ...f.include('read', correlated), path };
        const include = { ...f.include(), args: { select: ['name', 'internalNote', 'computed'], include: nested } };
        const granted = await svc.findOne(
          { _id: f.rows[0]._id },
          { select: ['name'], include } as never,
          {
            ...quiet,
            authorization: { related: { items: { ...f.targetPolicy, related: { [path]: f.targetPolicy } } } },
          } as never,
        );
        expect(granted, JSON.stringify(granted)).toMatchObject({
          success: true,
          data: {
            items: [
              { internalNote: 'target-note', computed: 'computed:target-a', [path]: { internalNote: 'target-note' } },
              { internalNote: 'next-note', computed: 'computed:target-b', [path]: { internalNote: 'target-note' } },
            ],
          },
        });
        if (!granted.success) throw new Error(granted.code);
        for (const row of (granted.data as any).items) {
          if (path !== 'group') expect(row).not.toHaveProperty('group');
          expect(row[path]).not.toHaveProperty('group');
          const handle = granted.context.getDocumentAuthorization(row[path]);
          expect(handle).toBeDefined();
          expect(
            await req.macl
              .getService(f.targetName)
              .pickAllowedFields(row[path], 'read', { documentAuthorization: handle! }),
          ).toHaveProperty('internalNote', 'target-note');
        }
        expect(getter).toHaveBeenCalledTimes(2);
        expect(groups).toEqual([undefined, undefined]);
        assertPrivateFree(granted.data);
        f.clear();
        for (const [key, value] of Object.entries({ ...controls, authorization: f.targetPolicy })) {
          const args = {
            include: { ...include, args: { ...include.args, include: { ...nested, options: { [key]: value } } } },
          };
          expect(await svc._list({}, args as never, quiet)).toMatchObject(badRequest);
          await request(f.app).post('/sources/__query').send(args).expect(400);
          await request(f.app)
            .post('/root')
            .send([{ target: 'model', name: f.sourceName, op: 'list', args }])
            .expect(400);
          f.noWork();
        }
      });
    },
  );

  it('populate/subpopulate passthrough and nested include options cannot carry a working target grant', async () => {
    const f = await fixture();
    await f.execute(async (req) => {
      const svc = req.macl.getPublicService(f.sourceName);
      const populate = [{ path: 'ref', select: ['name', 'internalNote'] }];
      const granted = await svc.findOne({ _id: f.rows[0]._id }, { select: ['ref'], populate }, {
        ...quiet,
        authorization: { related: { ref: f.targetPolicy } },
      } as never);
      expect(granted).toMatchObject({ success: true, data: { ref: { internalNote: 'target-note' } } });
      const embedded = await svc.findOne(
        { _id: f.rows[0]._id },
        { select: ['contacts'], populate: [{ path: 'contacts.ref', select: ['internalNote'] }] },
        { ...quiet, authorization: { related: { 'contacts.ref': f.targetPolicy } } } as never,
      );
      expect(embedded).toMatchObject({ success: true, data: { contacts: [{ ref: { internalNote: 'target-note' } }] } });
      const nested = {
        ...f.include(),
        args: { include: { ...f.include('read'), path: 'nested', localField: 'group' } },
      };
      const nestedGrant = await svc.findOne(
        { _id: f.rows[0]._id },
        { include: nested } as never,
        {
          ...quiet,
          authorization: { related: { items: { ...f.targetPolicy, related: { nested: f.targetPolicy } } } },
        } as never,
      );
      expect(nestedGrant).toMatchObject({
        success: true,
        data: { items: [{ nested: { internalNote: 'target-note' } }, { nested: { internalNote: 'target-note' } }] },
      });
      f.clear();
      for (const [key, value] of Object.entries({ ...controls, authorization: f.targetPolicy })) {
        for (const descriptor of [
          { ...populate[0], [key]: value },
          { ...populate[0], options: { [key]: value } },
          { ...populate[0], populate: { path: 'next', options: { [key]: value } } },
        ]) {
          expect(await svc._read(String(f.rows[0]._id), { populate: [descriptor] } as never, quiet)).toMatchObject(
            badRequest,
          );
          await request(f.app)
            .post('/sources/__query')
            .send({ populate: [descriptor] })
            .expect(400);
          await request(f.app)
            .post(`/sources/${f.rows[0]._id}/contacts/${f.rows[0].contacts[0]._id}/__query`)
            .send({ populate: [descriptor] })
            .expect(400);
          await request(f.app)
            .post('/root')
            .send([
              {
                target: 'model',
                name: f.sourceName,
                op: 'subRead',
                id: String(f.rows[0]._id),
                sub: 'contacts',
                subId: String(f.rows[0].contacts[0]._id),
                args: { populate: [descriptor] },
              },
            ])
            .expect(400);
          f.noWork();
        }
        expect(
          await svc._list(
            {},
            { include: { ...nested, args: { include: { ...f.include('read'), options: { [key]: value } } } } } as never,
            quiet,
          ),
        ).toMatchObject(badRequest);
        f.noWork();
      }
    });
  });

  it('$$sq never inherits a related operation/row/field grant and rejects nested authority before dispatch', async () => {
    const f = await fixture();
    await f.execute(async (req) => {
      const svc = req.macl.getPublicService(f.sourceName);
      const args = { include: f.include() };
      const options = { ...quiet, authorization: { ...noteGrant, related: { items: f.targetPolicy } } };
      expect(await svc.findOne({ _id: f.rows[0]._id }, args as never, options as never)).toMatchObject({
        success: true,
        data: { internalNote: 'source-note', items: [{ internalNote: 'target-note' }, { internalNote: 'next-note' }] },
      });
      f.clear();
      for (const op of ['read', 'list'])
        for (const [key, value] of Object.entries({ ...controls, authorization: f.targetPolicy })) {
          for (const slot of ['args', 'options', 'sqOptions']) {
            const filter = { name: { $$sq: { model: f.targetName, op, filter: {}, [slot]: { [key]: value } } } };
            expect(await svc._list(filter, {}, quiet)).toMatchObject(badRequest);
            await request(f.app).post('/sources/__query').send({ filter }).expect(400);
            await request(f.app)
              .post('/root')
              .send([{ target: 'model', name: f.sourceName, op: 'list', filter }])
              .expect(400);
            f.noWork();
          }
        }
      const denied = await svc.findOne(
        { name: { $$sq: { model: f.targetName, op: 'list', filter: {} } } } as never,
        args as never,
        options as never,
      );
      expect(denied).toMatchObject({ success: false, code: 'unauthorized' });
      expect(f.targetDispatch).toHaveBeenCalledOnce();
      f.noPersistence();
    });
  });

  it('supported $$sq selection/pagination/path and dedicated subpopulate remain request-only', async () => {
    const f = await fixture({}, { operationAccess: true, baseFilter: {} });
    await f.execute(async (req) => {
      const svc = req.macl.getPublicService(f.sourceName);
      const granted = await svc.findOne(
        { _id: f.rows[0]._id },
        { select: ['contacts'], populate: [{ path: 'contacts.ref', select: ['internalNote'] }] },
        { ...quiet, authorization: { related: { 'contacts.ref': f.targetPolicy } } } as never,
      );
      expect(granted).toMatchObject({ success: true, data: { contacts: [{ ref: { internalNote: 'target-note' } }] } });
      const sub = await svc.readSub(String(f.rows[0]._id), 'contacts', String(f.rows[0].contacts[0]._id), {
        select: ['email', 'ref'],
        populate: [{ path: 'ref', select: ['name', 'internalNote'], unknownPresentation: true }],
      } as never);
      expect(sub).toMatchObject({ success: true, data: { email: 'a@x', ref: { name: 'target-a' } } });
      if (!sub.success) throw new Error(sub.code);
      expect((sub.data as any).ref).not.toHaveProperty('internalNote');
    });
    const filter = {
      ref: {
        $in: {
          $$sq: {
            model: f.targetName,
            op: 'list',
            filter: {},
            args: { select: ['name', 'internalNote'], sort: { name: 1 }, skip: 0, limit: 1 },
            options: quiet,
            sqOptions: { path: '_id', compact: true },
          },
        },
      },
    };
    const direct = await request(f.app)
      .post('/sources/__query')
      .send({ filter, select: ['name'], options: quiet })
      .expect(200);
    const root = await request(f.app)
      .post('/root')
      .send([{ target: 'model', name: f.sourceName, op: 'list', filter, args: { select: ['name'] }, options: quiet }])
      .expect(200);
    expect(direct.body.data).toEqual(root.body[0].result.data);
    expect(direct.body.data).toEqual([expect.objectContaining({ name: 'a' })]);
    assertPrivateFree(direct.body);
    assertPrivateFree(root.body);
  });

  it.each(['subdocuments'])(
    'unsupported %s rejects internally and at wire boundaries without granting writes',
    async (key) => {
      const f = await fixture();
      await grantControl(f);
      await f.execute(async (req) => {
        const svc = req.macl.getPublicService(f.sourceName);
        const authorization = { ...noteGrant, [key]: { mode: 'unrestricted' } };
        expect(await svc.findOne({}, {}, { authorization } as never)).toMatchObject(badRequest);
        expect(await svc.create({ internalNote: 'injected' }, {}, { authorization } as never)).toMatchObject(
          badRequest,
        );
        expect(await svc._create({ internalNote: 'injected' }, {}, { authorization } as never)).toMatchObject(
          badRequest,
        );
        await request(f.app)
          .post('/sources/__mutation')
          .send({ data: { internalNote: 'injected' }, options: { authorization } })
          .expect(400);
        await request(f.app)
          .post('/root')
          .send([
            {
              target: 'model',
              name: f.sourceName,
              op: 'create',
              data: { internalNote: 'injected' },
              options: { authorization },
            },
          ])
          .expect(400);
        f.noWork();
        const safe = await svc.create(
          { name: 'safe', internalNote: 'injected' },
          { select: ['internalNote'] },
          { ...quiet, authorization: noteGrant },
        );
        expect(safe).toMatchObject({ success: true, data: [{ internalNote: 'server-note' }] });
      });
    },
  );

  it.each(['advancedList', 'advancedCreate', 'create'])(
    'rechecks transformed %s envelopes while preserving business data',
    async (variant) => {
      let transformed: unknown;
      const validator = vi.fn(() => ({ success: true, data: transformed }));
      const f = await fixture({ requestSchemas: { [variant]: validator } });
      await grantControl(f);
      const url =
        variant === 'advancedList'
          ? '/sources/__query'
          : variant === 'advancedCreate'
            ? '/sources/__mutation'
            : '/sources';
      for (const [key, value] of Object.entries(controls)) {
        transformed =
          variant === 'create'
            ? { name: { $$sq: { model: f.targetName, op: 'list', filter: {}, options: { [key]: value } } } }
            : { data: business, options: { [key]: value } };
        await request(f.app)
          .post(url)
          .send(variant === 'advancedCreate' ? { data: {} } : {})
          .expect(400);
        f.noWork();
      }
      expect(validator).toHaveBeenCalledTimes(Object.keys(controls).length);
      transformed =
        variant === 'advancedList'
          ? { select: ['authorization', 'overrides'], options: quiet }
          : variant === 'advancedCreate'
            ? { data: { name: 'transformed', ...business }, options: quiet }
            : { name: 'transformed', ...business };
      const response = await request(f.app)
        .post(url)
        .send(variant === 'advancedCreate' ? { data: {} } : {})
        .expect(variant === 'advancedList' ? 200 : 201);
      expect(JSON.stringify(response.body)).toContain('customer preference');
      assertPrivateFree(response.body);
    },
  );

  it.each(['advancedRead', 'advancedReadFilter', 'advancedUpdate', 'advancedUpsert', 'advancedCreate.data'])(
    'transformed %s cannot inject nested policy/prepared controls',
    async (variant) => {
      let transformed: unknown;
      const validator = vi.fn(() => ({ success: true, data: transformed }));
      const nestedData = variant === 'advancedCreate.data';
      const f = await fixture({
        requestSchemas: nestedData ? { advancedCreate: { data: validator } } : { [variant]: validator },
      });
      const op =
        variant === 'advancedUpdate'
          ? 'update'
          : variant === 'advancedUpsert'
            ? 'upsert'
            : nestedData
              ? 'create'
              : 'read';
      await f.execute(async (req) => {
        await grantedOperation(f, req.macl.getPublicService(f.sourceName), op);
      });
      f.clear();
      const id = String(f.rows[0]._id);
      const url =
        variant === 'advancedRead'
          ? `/sources/__query/${id}`
          : variant === 'advancedReadFilter'
            ? '/sources/__query/__filter'
            : variant === 'advancedUpdate'
              ? `/sources/__mutation/${id}`
              : '/sources/__mutation';
      const method = variant === 'advancedUpdate' ? 'patch' : variant === 'advancedUpsert' ? 'put' : 'post';
      const body = { filter: { _id: id }, data: { _id: id, name: 'updated' } };
      for (const [key, value] of Object.entries({ ...controls, authorization: f.targetPolicy })) {
        transformed = nestedData
          ? { name: { $$sq: { model: f.targetName, op: 'read', filter: {}, options: { [key]: value } } } }
          : { ...body, include: { ...f.include(), options: { [key]: value } } };
        await request(f.app)[method](url).send(body).expect(400);
        f.noWork();
      }
      expect(validator).toHaveBeenCalledTimes(Object.keys(controls).length);
      transformed = nestedData
        ? { name: 'transformed', ...business }
        : {
            ...body,
            data: { _id: id, name: 'updated', ...business },
            select: ['name', 'authorization', 'overrides', 'internalNote'],
            options: quiet,
          };
      const agent = request(f.app);
      const response = await agent[method](url)
        .send(body)
        .expect(nestedData ? 201 : 200);
      expect(response.body).toMatchObject(business);
      expect(response.body).not.toHaveProperty('internalNote');
      assertPrivateFree(response.body);
    },
  );

  it('issued document state authenticates only its output; same request calls re-evaluate documents, rows and prepared predicates', async () => {
    const hook = vi.fn((doc) => ({ owner: doc.owner === 'alice' }));
    const transform = vi.fn((filter) => filter);
    const f = await fixture({
      permissionSchema: { name: true, status: { read: 'owner', list: 'owner' }, internalNote: false },
      alwaysSelectFields: { read: ['owner'], list: ['owner'] },
      docPermissions: { read: hook, list: hook },
      baseFilter: { read: () => ({ tenant: 'a' }), list: () => ({ tenant: 'a' }) },
      overrideFilter: { read: transform, list: transform },
    });
    await f.execute(async (req) => {
      const svc = req.macl.getPublicService(f.sourceName),
        args = { select: ['status', 'internalNote'] };
      const granted = await svc.findOne({ _id: f.rows[0]._id }, args, { ...quiet, authorization: noteGrant });
      expect(granted).toMatchObject({ success: true, data: { status: 'owned', internalNote: 'source-note' } });
      if (!granted.success) throw new Error(granted.code);
      const handle = granted.context.documentAuthorization;
      expect(JSON.stringify(handle)).toBe('{}');
      expect(await svc.pickAllowedFields(granted.data, 'read', { documentAuthorization: handle })).toHaveProperty(
        'internalNote',
        'source-note',
      );
      expect(hook).toHaveBeenCalledTimes(1);
      assertPrivateFree(granted.data);
      f.clear();
      for (const state of [
        handle,
        JSON.parse(JSON.stringify(handle)),
        { ...handle },
        { _id: f.rows[0]._id, grants: { owner: true } },
      ]) {
        expect(await svc._read(String(f.rows[0]._id), {}, { documentAuthorization: state } as never)).toMatchObject(
          badRequest,
        );
        await request(f.app)
          .post('/sources/__query')
          .send({ options: { documentAuthorization: state } })
          .expect(400);
        f.noWork();
      }
      await expect(
        svc.pickAllowedFields({ ...granted.data }, 'read', { documentAuthorization: handle }),
      ).rejects.toThrow();
      await expect(
        svc.pickAllowedFields(granted.data, 'read', { documentAuthorization: {} } as never),
      ).rejects.toThrow();
      // Same persisted identity, different snapshot: a prior owner result must not
      // authorize the next public read, even on the same PublicService instance.
      await f.Source.updateOne({ _id: f.rows[0]._id }, { owner: 'bob' });
      const ordinary = await svc._read(String(f.rows[0]._id), args, { ...quiet, tryList: false });
      expect(ordinary.success).toBe(true);
      if (!ordinary.success) throw new Error(ordinary.code);
      expect(ordinary.data).not.toHaveProperty('status');
      expect(ordinary.data).not.toHaveProperty('internalNote');
      expect(hook).toHaveBeenCalledTimes(2);
      await expect(svc.pickAllowedFields(ordinary.data, 'read', { documentAuthorization: handle })).rejects.toThrow();
      const elevated = await svc.findOne({ _id: f.rows[1]._id }, args, {
        ...quiet,
        authorization: { ...noteGrant, rows: { mode: 'unrestricted' } },
      });
      expect(elevated).toMatchObject({ success: true, data: { internalNote: 'other-note' } });
      const before = transform.mock.calls.length;
      const missing = await svc._read(String(f.rows[1]._id), args, { ...quiet, tryList: false });
      expect(missing).toMatchObject({ success: false, code: Codes.NotFound });
      expect(transform).toHaveBeenCalledTimes(before + 1);
      const list = await svc._list({}, { select: ['name', 'internalNote'] }, quiet);
      expect(list).toMatchObject({ success: true, data: [{ name: 'a' }] });
      if (list.success) expect(list.data).toHaveLength(1);
    });
  });

  it.each([false, true])(
    'public DTOs preserve business names/options and user metadata without internal authority (strip=%s)',
    async (stripPermissionsField) => {
      const f = await fixture(
        { stripPermissionsField, docPermissions: () => ({ mayReadNote: false }) },
        { operationAccess: true, baseFilter: {}, permissionSchema: { name: true, next: true, internalNote: false } },
      );
      await f.execute(async (req) => {
        const svc = req.macl.getService(f.sourceName);
        const actor = req.macl.getPermissions();
        const result = await svc.findOne(
          { _id: f.rows[0]._id },
          { select: ['internalNote', 'ref'], populate: [{ path: 'ref', select: ['internalNote'] }] },
          {
            lean: true,
            includePermissions: true,
            includeFieldPermissions: true,
            authorization: { ...noteGrant, related: { ref: f.targetPolicy } },
          } as never,
        );
        expect(result).toMatchObject({
          success: true,
          data: { internalNote: 'source-note', ref: { internalNote: 'target-note' } },
        });
        if (!result.success) throw new Error(result.code);
        if (stripPermissionsField) expect(result.data).not.toHaveProperty('_permissions');
        else {
          expect((result.data as any)._permissions).toHaveProperty('mayReadNote', false);
          expect((result.data as any)._permissions._view.internalNote).not.toBe(true);
          expect((result.data as any)._permissions._edit.internalNote).not.toBe(true);
        }
        expect(req.macl.getPermissions()).toBe(actor);
        expect(Object.keys(result.context)).not.toContain('documentAuthorization');
        expect(Object.getOwnPropertyDescriptor(result.context, 'documentAuthorization')).toMatchObject({
          enumerable: false,
          writable: false,
        });
        expect(result.context.getDocumentAuthorization((result.data as any).ref)).toBeDefined();
        assertPrivateFree(result.data);
        const dto = toPublicServiceResult(result);
        expect(dto).toMatchObject({ data: { internalNote: 'source-note', ref: { internalNote: 'target-note' } } });
        assertPrivateFree(dto);
      });
      const args = {
        select: ['name', 'authorization', 'overrides', 'internalNote', 'ref'],
        sort: { name: -1 },
        skip: 1,
        limit: 1,
        populate: [{ path: 'ref', select: ['name', 'internalNote'], unknownPresentation: 'inert' }],
        include: {
          ...f.include(),
          args: { select: ['name', 'internalNote'], sort: { name: -1 }, limit: 1 },
          options: { skim: true },
        },
      };
      const direct = await request(f.app)
        .post('/sources/__query')
        .send({ filter: business, ...args, options: { ...quiet, includeCount: true } })
        .expect(200);
      const root = await request(f.app)
        .post('/root')
        .send([
          {
            target: 'model',
            name: f.sourceName,
            op: 'list',
            filter: business,
            args,
            options: { ...quiet, includeCount: true },
          },
        ])
        .expect(200);
      expect(direct.body.data).toEqual(root.body[0].result.data);
      expect(direct.body.data).toHaveLength(1);
      expect(direct.body.data[0]).toMatchObject({
        name: 'a',
        ...business,
        ref: { name: 'target-a' },
        items: [{ name: 'target-b' }],
      });
      expect(direct.body.meta.totalCount).toBe(2);
      expect(root.body[0].result.totalCount).toBe(2);
      expect(JSON.stringify(direct.body)).not.toContain('source-note');
      expect(JSON.stringify(direct.body)).not.toContain('target-note');
      assertPrivateFree(direct.body);
      assertPrivateFree(root.body);
      const created = await request(f.app)
        .post('/sources')
        .send({ name: 'business', ...business })
        .expect(201);
      expect(JSON.stringify(created.body)).toContain('customer preference');
      expect(await f.Source.findOne({ name: 'business' }).lean()).toMatchObject(business);
    },
  );

  it('basic/advanced route guards and reserved target access still deny despite available internal grants', async () => {
    const f = await fixture({ operationAccess: { list: true, basicList: false, advancedList: false, read: true } });
    await grantControl(f);
    await request(f.app).get('/sources').expect(401);
    await request(f.app).post('/sources/__query').send({}).expect(401);
    f.noWork();
    await f.execute(async (req) => {
      const svc = req.macl.getService(f.sourceName);
      const valid = await svc.findOne(
        { _id: f.rows[0]._id },
        { populate: [{ path: 'ref', select: ['internalNote'] }] },
        { ...quiet, authorization: { related: { ref: f.targetPolicy } } } as never,
      );
      expect(valid).toMatchObject({ success: true, data: { ref: { internalNote: 'target-note' } } });
      f.clear();
      for (const access of ['basicRead', 'advancedRead', 'basicList', 'advancedList']) {
        expect(
          await svc.findOne(
            {},
            { populate: [{ path: 'ref', access }] } as never,
            { ...quiet, authorization: { related: { ref: f.targetPolicy } } } as never,
          ),
        ).toMatchObject(badRequest);
        f.noWork();
      }
    });
  });
});
