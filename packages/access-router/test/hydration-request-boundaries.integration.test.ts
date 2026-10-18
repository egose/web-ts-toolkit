import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { createAccessRuntime } from '../dist/index.mjs';
import type { HydrationMode, ModelHookContext } from '../dist/advanced.mjs';
import { listBodySchema, readByIdBodySchema, readFilterBodySchema } from '../src/validation/model-router';
import { rootQuerySchema } from '../src/validation/root-router';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

type Bag = Record<string, any>;
const quiet = { includePermissions: false, includeFieldPermissions: false };
const business = { lean: 'business-lean', hydration: 'business-hydration' };
const select = ['name', 'lean', 'hydration', 'payload', 'missingDefault'];
const modes = ['lean', 'hydrated'] as const;
const opposite = (mode: HydrationMode): HydrationMode => (mode === 'lean' ? 'hydrated' : 'lean');
const runtimes: ReturnType<typeof createAccessRuntime>[] = [];
let sequence = 0;

// Observe both the executed query and actual pre-finalization Mongoose values.
// A response DTO is plain in either mode and cannot prove hydration by itself.
function observe(ref?: string) {
  const schema = new mongoose.Schema({
    name: String,
    lean: String,
    hydration: String,
    payload: mongoose.Schema.Types.Mixed,
    missingDefault: { type: String, default: 'fetch-default' },
    ...(ref ? { ref: { type: mongoose.Schema.Types.ObjectId, ref } } : {}),
  });
  const queries: Array<{ op: string; lean: boolean }> = [];
  const documents: boolean[] = [];
  for (const op of ['find', 'findOne'] as const) {
    schema.pre(op, function () {
      queries.push({ op, lean: this.mongooseOptions().lean === true });
    });
    schema.post(op, function (value) {
      for (const doc of Array.isArray(value) ? value : value ? [value] : [])
        documents.push(doc instanceof mongoose.Document);
    });
  }
  return {
    schema,
    queries,
    documents,
    reset() {
      queries.length = 0;
      documents.length = 0;
    },
  };
}

async function fixture(mode: HydrationMode) {
  const api = createAccessRuntime();
  runtimes.push(api);
  const tag = ++sequence;
  const name = `HydWireSource${tag}`;
  const targetName = `HydWireTarget${tag}`;
  const source = observe(targetName);
  const target = observe();
  const Source = mongoose.model(name, source.schema);
  const Target = mongoose.model(targetName, target.schema);
  const contexts: ModelHookContext[] = [];
  const options = {
    operationAccess: true,
    permissionSchema: { name: true, lean: true, hydration: true, payload: true, missingDefault: true, ref: true },
    hydration: { publicList: mode, publicRead: mode },
    defaults: { publicListOptions: quiet, publicReadOptions: quiet },
    decorate: (doc: any, _permissions: unknown, context: ModelHookContext) => {
      contexts.push(context);
      return doc;
    },
  };
  const router = api.createRouter(Source, { ...options, basePath: '/rows' });
  api.createRouter(Target, { ...options, basePath: '/targets' });
  const root = api.createRouter({ basePath: '/root', operationAccess: true });
  const id = new mongoose.Types.ObjectId();
  const targetId = new mongoose.Types.ObjectId();
  // Raw inserts deliberately omit the schema default.
  await Target.collection.insertOne({ _id: targetId, name: 'row', ...business });
  await Source.collection.insertOne({ _id: id, name: 'row', ...business, payload: { ...business }, ref: targetId });
  const app = express().use(express.json()).use(router.routes).use(root.routes);
  // Exercise dispatch without the root schema, as backend integrations may do.
  const dispatch = root as unknown as { processOp(req: unknown, entry: unknown, index: number): Promise<unknown> };
  app.use(api()).post('/dispatch', async (req, res) => {
    res.json(await dispatch.processOp(req, req.body, 0));
  });
  return { api, app, name, targetName, id: String(id), targetId: String(targetId), Source, source, target, contexts };
}

function controls(mode: HydrationMode): Bag[] {
  return [
    {},
    { lean: true },
    { lean: false },
    { hydration: opposite(mode) },
    {
      hydration: {
        publicList: opposite(mode),
        publicRead: opposite(mode),
        find: opposite(mode),
        findOne: opposite(mode),
      },
    },
    // Unknown wire values are tolerated, not validated as obsolete controls.
    { lean: 'retired', hydration: false },
  ];
}

function expectMode(probe: ReturnType<typeof observe>, mode: HydrationMode, ops: string[], count = 1) {
  expect(probe.queries).toEqual(ops.map((op) => ({ op, lean: mode === 'lean' })));
  expect(probe.documents).toEqual(Array.from({ length: count }, () => mode === 'hydrated'));
}

function expectRow(row: Bag, mode: HydrationMode) {
  expect(row).toMatchObject({ name: 'row', ...business });
  expect(row.missingDefault).toBe(mode === 'hydrated' ? 'fetch-default' : undefined);
}

// Check the metadata slots contextually: filters/snapshots may legitimately
// contain business lean/hydration properties. The model reference is not a DTO.
function expectContext(context: ModelHookContext) {
  for (const value of [context, context.resolvedQuery]) {
    expect(value).toBeDefined();
    for (const key of ['lean', 'hydration', 'configuration', 'execution']) expect(value).not.toHaveProperty(key);
  }
  const populate = context.resolvedQuery?.populate;
  if (Array.isArray(populate)) {
    for (const descriptor of populate) {
      for (const key of ['lean', 'hydration', 'options']) expect(descriptor).not.toHaveProperty(key);
    }
  }
}

afterEach(() => {
  for (const api of runtimes.splice(0)) api.runtime.clearOpenApiRoutes();
  mongoose.deleteModel(/^HydWire/);
});

describe('HYD-03 HTTP hydration boundaries', () => {
  it.each(modes)('direct GET/body and raw root list/id/filter reads retain server %s mode', async (mode) => {
    const f = await fixture(mode);
    for (const stale of controls(mode)) {
      const query = {
        select: select.join(','),
        ...Object.fromEntries(
          Object.entries(stale).map(([key, value]) => [
            key,
            typeof value === 'object' ? JSON.stringify(value) : String(value),
          ]),
        ),
      };
      const body = { ...stale, select, options: { ...quiet, ...stale } };
      const calls = [
        { op: 'find', run: () => request(f.app).get('/rows').query(query), row: (body: Bag) => body.data[0] },
        { op: 'findOne', run: () => request(f.app).get(`/rows/${f.id}`).query(query), row: (body: Bag) => body },
        {
          op: 'find',
          run: () =>
            request(f.app)
              .post('/rows/__query')
              .send({ ...body, filter: business }),
          row: (body: Bag) => body.data[0],
        },
        { op: 'findOne', run: () => request(f.app).post(`/rows/__query/${f.id}`).send(body), row: (body: Bag) => body },
        {
          op: 'findOne',
          run: () =>
            request(f.app)
              .post('/rows/__query/__filter')
              .send({ ...body, filter: business }),
          row: (body: Bag) => body,
        },
      ];
      for (const call of calls) {
        f.source.reset();
        const response = await call.run().expect(200);
        expectRow(call.row(response.body), mode);
        expectMode(f.source, mode, [call.op]);
      }
      f.source.reset();
      const entries = [
        { op: 'list', filter: business },
        { op: 'read', id: f.id },
        { op: 'read', filter: business },
      ];
      const response = await request(f.app)
        .post('/root')
        .send(
          entries.map((entry, order) => ({
            ...stale,
            target: 'model',
            name: f.name,
            ...entry,
            order,
            args: { ...stale, select },
            options: { ...quiet, ...stale },
          })),
        )
        .expect(200);
      expectMode(f.source, mode, ['find', 'findOne', 'findOne'], 3);
      for (const entry of response.body) {
        expect(entry.statusCode).toBe(200);
        expectRow(entry.result.kind === 'list' ? entry.result.data[0] : entry.result.data, mode);
        for (const key of ['query', 'context', 'contexts', 'hydration', 'lean'])
          expect(entry.result).not.toHaveProperty(key);
      }
    }
    expect(f.contexts.length).toBeGreaterThan(0);
    f.contexts.forEach(expectContext);
  });

  it.each(modes)('direct/root id and filter fallbacks retain publicRead %s rather than publicList', async (mode) => {
    const f = await fixture(mode);
    f.api.setModelOptions(f.name, {
      hydration: { publicRead: mode, publicList: opposite(mode) },
      baseFilter: { read: () => ({ name: 'absent' }), list: () => ({}) },
    });
    for (const stale of controls(mode).slice(0, 5)) {
      const body = { select, options: { ...quiet, ...stale, tryList: true } };
      f.source.reset();
      const basic = await request(f.app)
        .get(`/rows/${f.id}`)
        .query({
          select: select.join(','),
          try_list: 'true',
          ...Object.fromEntries(Object.entries(stale).map(([key, value]) => [key, JSON.stringify(value)])),
        })
        .expect(200);
      expectRow(basic.body, mode);
      expectMode(f.source, mode, ['findOne', 'findOne']);
      for (const path of [`/rows/__query/${f.id}`, '/rows/__query/__filter']) {
        f.source.reset();
        const response = await request(f.app)
          .post(path)
          .send({ ...body, filter: business })
          .expect(200);
        expectRow(response.body, mode);
        expectMode(f.source, mode, ['findOne', 'findOne']);
      }
      f.source.reset();
      const response = await request(f.app)
        .post('/root')
        .send([
          { target: 'model', name: f.name, op: 'read', id: f.id, args: { select }, options: body.options, order: 0 },
          {
            target: 'model',
            name: f.name,
            op: 'read',
            filter: business,
            args: { select },
            options: body.options,
            order: 1,
          },
        ])
        .expect(200);
      expectMode(f.source, mode, ['findOne', 'findOne', 'findOne', 'findOne'], 2);
      for (const entry of response.body) {
        expect(entry.statusCode).toBe(200);
        expectRow(entry.result.data, mode);
      }
    }
    f.contexts.forEach(expectContext);
  });

  it.each(modes)('$$sq list/id/filter targets use their own public %s mode', async (mode) => {
    const f = await fixture(opposite(mode));
    f.api.setModelOption(f.targetName, 'hydration', { publicList: mode, publicRead: mode });
    for (const stale of controls(mode)) {
      for (const op of ['list', 'id', 'filter']) {
        const sq = {
          $$sq: {
            ...stale,
            model: f.targetName,
            op: op === 'list' ? 'list' : 'read',
            ...(op === 'id' ? { id: f.targetId } : { filter: business }),
            args: { ...stale, select: ['name'] },
            options: { ...quiet, ...stale },
            sqOptions: { ...stale, path: 'name' },
          },
        };
        const filter = { name: op === 'list' ? { $in: sq } : sq };
        for (const root of [false, true]) {
          f.source.reset();
          f.target.reset();
          const response = await request(f.app)
            .post(root ? '/root' : '/rows/__query')
            .send(
              root
                ? [{ target: 'model', name: f.name, op: 'list', filter, args: { select }, options: quiet }]
                : { filter, select, options: quiet },
            )
            .expect(200);
          expectRow(root ? response.body[0].result.data[0] : response.body.data[0], opposite(mode));
          expectMode(f.source, opposite(mode), ['find']);
          expectMode(f.target, mode, [op === 'list' ? 'find' : 'findOne']);
        }
      }
    }
    f.contexts.forEach(expectContext);
  });

  it.each(modes)(
    'legacy includes stay fixed lean and populate inherits parent %s despite descriptor controls',
    async (mode) => {
      const f = await fixture(mode);
      f.api.setModelOption(f.targetName, 'hydration', {
        publicList: opposite(mode),
        publicRead: opposite(mode),
        find: opposite(mode),
        findOne: opposite(mode),
      });
      for (const stale of controls(mode)) {
        for (const op of ['list', 'read']) {
          const include = {
            ...stale,
            model: f.targetName,
            op,
            path: 'joined',
            localField: 'name',
            foreignField: 'name',
            filter: business,
            args: { ...stale, select },
            options: { ...quiet, ...stale },
          };
          f.source.reset();
          f.target.reset();
          const response = await request(f.app)
            .post('/rows/__query')
            .send({ select, include, options: quiet })
            .expect(200);
          expectRow(op === 'list' ? response.body.data[0].joined[0] : response.body.data[0].joined, 'lean');
          expectMode(f.source, mode, ['find']);
          expectMode(f.target, 'lean', [op === 'list' ? 'find' : 'findOne']);
        }
        f.source.reset();
        f.target.reset();
        const response = await request(f.app)
          .post('/root')
          .send([
            {
              target: 'model',
              name: f.name,
              op: 'read',
              id: f.id,
              args: { select: ['ref'], populate: [{ path: 'ref', select, ...stale, options: stale }] },
              options: quiet,
            },
          ])
          .expect(200);
        expectRow(response.body[0].result.data.ref, mode);
        expectMode(f.source, mode, ['findOne']);
        expectMode(f.target, mode, ['find']);
      }
      f.contexts.forEach(expectContext);
    },
  );

  it.each(modes)(
    'correlated list/id/filter reads stay lean under server %s; nonempty controls still reject',
    async (mode) => {
      const f = await fixture(mode);
      const include = [
        {
          mode: 'correlated',
          model: f.targetName,
          op: 'list',
          path: 'joinedList',
          filter: { lean: { $parent: 'lean' }, hydration: business.hydration },
          args: { select },
        },
        {
          mode: 'correlated',
          model: f.targetName,
          op: 'read',
          path: 'joinedFilter',
          filter: business,
          args: { select },
        },
        { mode: 'correlated', model: f.targetName, op: 'read', path: 'joinedId', id: f.targetId, args: { select } },
      ];
      const response = await request(f.app)
        .post('/rows/__query')
        .send({ select: [...select, 'ref'], include, options: quiet })
        .expect(200);
      const row = response.body.data[0];
      for (const child of [row.joinedList[0], row.joinedFilter, row.joinedId]) expectRow(child, 'lean');
      expectMode(f.source, mode, ['find']);
      expect(f.target.queries.map(({ op }) => op).sort()).toEqual(['find', 'findOne', 'findOne']);
      expect(f.target.queries.every(({ lean }) => lean)).toBe(true);
      expect(f.target.documents).toEqual([false, false, false]);
      for (const stale of controls(mode).slice(1)) {
        f.source.reset();
        f.target.reset();
        const invalid = { ...include[0], options: stale };
        await request(f.app).post('/rows/__query').send({ include: invalid }).expect(400);
        await request(f.app)
          .post('/root')
          .send([{ target: 'model', name: f.name, op: 'list', args: { include: invalid } }])
          .expect(400);
        const independent = await request(f.app)
          .post('/dispatch')
          .send({ target: 'model', name: f.name, op: 'list', args: { include: invalid } })
          .expect(200);
        expect(independent.body).toMatchObject({ statusCode: 400, result: { success: false, code: 'bad_request' } });
        expect(f.source.queries).toEqual([]);
        expect(f.target.queries).toEqual([]);
      }
    },
  );

  it.each(modes)('business filters, selection, mutations and task payloads survive under %s', async (mode) => {
    const f = await fixture(mode);
    await f.Source.collection.insertOne({ name: 'row', lean: 'decoy', hydration: 'decoy' });
    const replacement = { lean: 'task-data', hydration: { publicList: 'ordinary-data' } };
    const tasks = { type: 'MASK', args: [{ src: 'payload', replacement }] };
    for (const root of [false, true]) {
      const response = await request(f.app)
        .post(root ? '/root' : '/rows/__query')
        .send(
          root
            ? [
                {
                  target: 'model',
                  name: f.name,
                  op: 'list',
                  filter: business,
                  args: { select, tasks },
                  options: { lean: false, hydration: 'lean' },
                },
              ]
            : { filter: business, select, tasks, options: { lean: true, hydration: 'hydrated' } },
        )
        .expect(200);
      const rows = root ? response.body[0].result.data : response.body.data;
      expect(rows).toHaveLength(1);
      expectRow(rows[0], mode);
      expect(rows[0].payload).toEqual(replacement);
    }
    const created = await request(f.app)
      .post('/rows/__mutation')
      .send({ data: { name: 'created', ...business, payload: business }, select })
      .expect(201);
    expect(created.body).toMatchObject(business);
    const updated = { lean: 'changed-lean', hydration: 'changed-hydration', payload: replacement };
    const response = await request(f.app)
      .post('/root')
      .send([
        {
          target: 'model',
          name: f.name,
          op: 'update',
          id: f.id,
          data: updated,
          args: { select },
          options: { lean: true, hydration: 'lean' },
        },
      ])
      .expect(200);
    expect(response.body[0].result.data).toMatchObject(updated);
    expect(await f.Source.collection.findOne({ _id: new mongoose.Types.ObjectId(f.id) })).toMatchObject(updated);
  });

  it('tolerates unknown root/direct control values while leaving data and selections intact', () => {
    for (const stale of controls('lean')) {
      const args = { select: ['lean', 'hydration'] };
      for (const schema of [listBodySchema, readByIdBodySchema, readFilterBodySchema]) {
        expect(schema.parse({ ...args, filter: business, options: stale })).toMatchObject({
          ...args,
          filter: business,
          options: stale,
        });
      }
      const entries = [
        { op: 'list', filter: business },
        { op: 'read', id: 'id' },
        { op: 'read', filter: business },
      ].map((entry) => ({
        target: 'model',
        name: 'Example',
        ...entry,
        args,
        options: stale,
      }));
      expect(rootQuerySchema.parse(entries)).toEqual(entries);
    }
  });
});
