import type { AddressInfo } from 'node:net';
import { createServer, type Server } from 'node:http';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAccessRuntime } from '@web-ts-toolkit/access-router';
import type { HydrationMode } from '@web-ts-toolkit/access-router';

import { createAdapter, Model, parentField } from '../src';
import type { Defaults, ModelRequest, Response } from '../src';
import type { ProtocolRequest } from './support/integration-suite';

interface Row {
  _id?: string;
  name: string;
  lean: string;
  hydration: string;
  payload?: unknown;
  missingDefault?: string;
  targetId?: string;
}

type Execution = 'direct' | 'grouped';
type OptionSource = 'adapter' | 'service' | 'call';
type Bag = Record<string, unknown>;

const SOURCE = 'HydClientSource';
const TARGET = 'HydClientTarget';
const modes = ['lean', 'hydrated'] as const;
const executions = ['direct', 'grouped'] as const;
const business = { lean: 'business-lean', hydration: 'business-hydration' };
const select = ['name', 'lean', 'hydration', 'payload', 'missingDefault'] as const;
const quiet = { includePermissions: false, includeFieldPermissions: false };
const protocolRequests: ProtocolRequest[] = [];
const callbacks: unknown[] = [];
let mongo: MongoMemoryServer;
let server: Server;
let api: ReturnType<typeof createAccessRuntime>;
let baseURL: string;
let id: string;
let targetId: string;
let Source: mongoose.Model<Row>;
let Target: mongoose.Model<Row>;

// Observe real queries and the fetched values before server finalization. Plain
// JSON/client Model wrappers alone cannot establish the Mongoose fetch mode.
function observe() {
  const schema = new mongoose.Schema<Row>({
    name: String,
    lean: String,
    hydration: String,
    payload: mongoose.Schema.Types.Mixed,
    targetId: String,
    missingDefault: { type: String, default: 'fetch-default' },
  });
  const queries: Array<{ op: string; lean: boolean }> = [];
  const documents: boolean[] = [];
  for (const op of ['find', 'findOne'] as const) {
    schema.pre(op, function () {
      queries.push({ op, lean: this.mongooseOptions().lean === true });
    });
    schema.post(op, function (value) {
      for (const doc of Array.isArray(value) ? value : value ? [value] : []) {
        documents.push(doc instanceof mongoose.Document);
      }
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

const source = observe();
const target = observe();
const opposite = (mode: HydrationMode): HydrationMode => (mode === 'lean' ? 'hydrated' : 'lean');

function controls(mode: HydrationMode): Bag[] {
  return [
    {},
    { lean: true, hydration: opposite(mode) },
    { lean: false, hydration: { publicList: opposite(mode), publicRead: opposite(mode) } },
    { lean: undefined, hydration: undefined },
  ];
}

function defaults(stale: Bag): Defaults {
  return {
    listOptions: { ...stale, includePermissions: false },
    listAdvancedOptions: { ...stale, includePermissions: false },
    readOptions: { ...stale, includePermissions: false, tryList: false },
    readAdvancedOptions: { ...stale, includePermissions: false, tryList: false },
  };
}

function client(scope: OptionSource, stale: Bag) {
  const adapter = createAdapter(
    { baseURL },
    { modelDefaults: scope === 'adapter' ? defaults(stale) : undefined, onSuccess: (res) => callbacks.push(res) },
  );
  const serviceDefaults = scope === 'service' ? defaults(stale) : undefined;
  return {
    adapter,
    rows: adapter.createModelService<Row>({ modelName: SOURCE, basePath: 'rows' }, serviceDefaults),
    targets: adapter.createModelService<Row>({ modelName: TARGET, basePath: 'targets' }, serviceDefaults),
  };
}

function reset() {
  source.reset();
  target.reset();
  protocolRequests.length = 0;
  callbacks.length = 0;
}

function expectMode(probe: ReturnType<typeof observe>, mode: HydrationMode, ops: string[], count = ops.length) {
  expect(probe.queries).toEqual(ops.map((op) => ({ op, lean: mode === 'lean' })));
  expect(probe.documents).toEqual(Array.from({ length: count }, () => mode === 'hydrated'));
}

function expectRow(row: unknown, mode: HydrationMode) {
  expect(row).toMatchObject({ name: 'row', ...business });
  expect(row).not.toHaveProperty('targetId');
  expect((row as Row).missingDefault).toBe(mode === 'hydrated' ? 'fetch-default' : undefined);
}

function expectNoControls(bag: unknown) {
  expect(bag).not.toHaveProperty('lean');
  expect(bag).not.toHaveProperty('hydration');
}

async function execute<T>(adapter: ReturnType<typeof createAdapter>, request: ModelRequest<T>, execution: Execution) {
  return execution === 'direct' ? await request : (await adapter.group(request))[0];
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'access-router-client-hydration' });
  Source = mongoose.model<Row>(SOURCE, source.schema);
  Target = mongoose.model<Row>(TARGET, target.schema);
  api = createAccessRuntime();
  // Grouped nested filters need envelope headroom, not a hydration-specific limit.
  api.setGlobalOptions({ requestComplexity: { maxDepth: 16 } });
  const options = {
    operationAccess: true,
    permissionSchema: { name: true, lean: true, hydration: true, payload: true, missingDefault: true, targetId: true },
    defaults: { publicListOptions: quiet, publicReadOptions: quiet },
  };
  const app = express().use(express.json());
  app.use((req, _res, next) => {
    protocolRequests.push({ method: req.method, path: req.path, query: { ...req.query }, body: req.body });
    next();
  });
  app.use(api.createRouter(Source, { ...options, basePath: '/api/rows' }).routes);
  app.use(api.createRouter(Target, { ...options, basePath: '/api/targets' }).routes);
  app.use(api.createRouter({ basePath: '/api/root', operationAccess: true }).routes);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
}, 120_000);

beforeEach(async () => {
  await Source.deleteMany({});
  await Target.deleteMany({});
  const sourceId = new mongoose.Types.ObjectId();
  const targetObjectId = new mongoose.Types.ObjectId();
  id = String(sourceId);
  targetId = String(targetObjectId);
  // Do not apply create-time defaults: missingDefault distinguishes fetch modes.
  await Target.collection.insertOne({ _id: targetObjectId, name: 'row', ...business });
  await Source.collection.insertMany([
    { _id: sourceId, name: 'row', ...business, payload: { ...business }, targetId },
    { name: 'decoy', lean: 'decoy', hydration: 'decoy' },
  ]);
  reset();
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
  api?.runtime.clearOpenApiRoutes();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  if (mongo) await mongo.stop();
}, 120_000);

describe.each(modes)('HYD-04 server-owned %s hydration', (mode) => {
  beforeEach(() => {
    for (const name of [SOURCE, TARGET]) {
      api.setModelOption(name, 'hydration', { publicList: mode, publicRead: mode });
    }
  });

  describe.each(executions)('%s transport', (execution) => {
    it.each(['adapter', 'service', 'call'] as const)(
      'omits stale %s options in basic/advanced list and reads',
      async (scope) => {
        for (const stale of controls(mode)) {
          reset();
          const { adapter, rows } = client(scope, stale);
          const options = scope === 'call' ? { ...stale, includePermissions: false, tryList: false } : undefined;
          const requests = [
            rows.list({ select, sort: '-name', limit: 1 }, options),
            rows.listAdvanced(business, { select }, options),
            rows.read(id, { select }, options),
            rows.readAdvanced(id, { select }, options),
            rows.readAdvancedFilter(business, { select }, options),
          ] as const;
          for (const request of requests) expectNoControls(request.__query.options);
          expect(protocolRequests).toHaveLength(0);
          const results: Response<unknown>[] = [];
          if (execution === 'grouped') results.push(...(await adapter.group(...requests)));
          else for (const request of requests) results.push(await request);
          expectMode(source, mode, ['find', 'find', 'findOne', 'findOne', 'findOne']);
          expect(target.queries).toEqual([]);
          expect(callbacks).toEqual(results);
          results.forEach((result, index) => {
            expect(result.success).toBe(true);
            const raw = index < 2 ? (result.raw as unknown[])[0] : result.raw;
            const data = index < 2 ? (result.data as unknown[])[0] : result.data;
            if (index < 2) expect(result.raw).toHaveLength(1);
            expectRow(raw, mode);
            expect(data).toBeInstanceOf(Model);
            expect(typeof (data as Model<Row>).save).toBe('function');
          });
          expect(protocolRequests).toHaveLength(execution === 'grouped' ? 1 : 5);
          if (execution === 'grouped') {
            for (const entry of protocolRequests[0].body as Array<{ options: unknown }>)
              expectNoControls(entry.options);
            await expect(requests[0].exec()).rejects.toThrow('already claimed for grouped execution');
          } else {
            for (const wire of protocolRequests) {
              expectNoControls(wire.query);
              if (wire.body) expectNoControls((wire.body as { options: unknown }).options);
            }
          }
        }
      },
    );

    it('uses target-owned modes for list/id/filter subqueries without executing the inner request', async () => {
      api.setModelOption(SOURCE, 'hydration', { publicList: opposite(mode), publicRead: opposite(mode) });
      for (const kind of ['list', 'id', 'filter'] as const) {
        reset();
        const stale = controls(mode)[2];
        const { adapter, rows, targets } = client('adapter', stale);
        const options = { ...stale, includePermissions: false, sq: { path: 'name', compact: true } };
        const inner =
          kind === 'list'
            ? targets.listAdvanced(business, { select: ['name'] }, options)
            : kind === 'id'
              ? targets.readAdvanced(targetId, { select: ['name'] }, options)
              : targets.readAdvancedFilter(business, { select: ['name'] }, options);
        expectNoControls(inner.__query.options);
        const outer = rows.listAdvanced({ ...business, name: inner }, { select });
        const sq = (outer.__query.filter as { name: { $$sq: { options: unknown } } }).name.$$sq;
        expectNoControls(sq.options);
        expect(protocolRequests).toHaveLength(0);
        const result = await execute(adapter, outer, execution);
        expect(result.success).toBe(true);
        expect(result.raw).toHaveLength(1);
        if (result.success) expectRow(result.raw[0], opposite(mode));
        expectMode(target, mode, [kind === 'list' ? 'find' : 'findOne']);
        expectMode(source, opposite(mode), ['find']);
        expect(protocolRequests).toHaveLength(1);
        expect(callbacks).toEqual([result]);
      }
    });

    it('keeps converted and legacy includes fixed lean while preserving business predicates', async () => {
      reset();
      const stale = controls(mode)[2];
      const { adapter, rows, targets } = client('service', stale);
      const correlated = targets
        .listAdvanced({ lean: parentField('lean'), hydration: parentField('hydration') }, { select }, stale)
        .$include('correlated');
      const read = targets.read(parentField('targetId'), { select }, stale).$include('related');
      const include = [
        correlated,
        read,
        {
          model: TARGET,
          op: 'list' as const,
          path: 'legacy',
          localField: 'lean',
          foreignField: 'lean',
          filter: business,
          args: { select },
          options: stale,
        },
      ];
      expectNoControls(correlated);
      expectNoControls(read);
      expect(correlated).not.toHaveProperty('options');
      expect(read).not.toHaveProperty('options');
      const request = rows.listAdvanced(business, { select, include });
      expect(protocolRequests).toHaveLength(0);
      const result = await execute(adapter, request, execution);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.raw).toHaveLength(1);
      expectRow(result.raw[0], mode);
      const row = result.raw[0] as Row & { correlated: Row[]; related: Row; legacy: Row[] };
      expect(row.correlated).toHaveLength(1);
      expect(row.legacy).toHaveLength(1);
      expectRow(row.correlated[0], 'lean');
      expectRow(row.related, 'lean');
      expectRow(row.legacy[0], 'lean');
      expect(row.related).not.toBeInstanceOf(Model);
      expectMode(source, mode, ['find']);
      expect(target.queries.map((query) => query.op).sort()).toEqual(['find', 'find', 'findOne']);
      expect(target.queries.every((query) => query.lean)).toBe(true);
      expect(target.documents).toEqual([false, false, false]);
      expect(protocolRequests).toHaveLength(1);
      expect(callbacks).toEqual([result]);
    });

    it('still rejects nonempty raw correlated execution controls before querying', async () => {
      const { adapter, rows, targets } = client('adapter', controls(mode)[1]);
      for (const options of [{ lean: false }, { hydration: 'hydrated' }, { skim: false }]) {
        reset();
        const converted = targets.read(parentField('targetId')).$include('related');
        const include = Object.assign({}, converted, { options });
        const result = await execute(adapter, rows.listAdvanced(business, { select, include }), execution);
        expect(result).toMatchObject({ success: false, status: 400, data: null });
        expect(source.queries).toEqual([]);
        expect(target.queries).toEqual([]);
        expect(callbacks).toEqual([]);
      }
    });

    it('preserves business selection, mutation persistence and nested task data', async () => {
      const { adapter, rows } = client('call', {});
      const replacement = { lean: 'task-data', hydration: { publicList: 'ordinary-data' } };
      const tasks = { type: 'MASK', args: [{ src: 'payload', replacement }], options: {} };
      const result = await execute(adapter, rows.listAdvanced(business, { select, tasks }), execution);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.raw).toHaveLength(1);
      expectRow(result.raw[0], mode);
      expect(result.raw[0].payload).toEqual(replacement);
      expectMode(source, mode, ['find']);
      const created = await execute(
        adapter,
        rows.createAdvanced({ name: 'created', ...business, payload: replacement }, { select }),
        execution,
      );
      expect(created.success).toBe(true);
      if (!created.success) return;
      expect(created.raw).toMatchObject({ ...business, payload: replacement });
      const updated = { lean: 'changed-lean', hydration: 'changed-hydration', payload: replacement };
      const changed = await execute(adapter, rows.updateAdvanced(id, updated, { select }), execution);
      expect(changed.success).toBe(true);
      expect(changed.raw).toMatchObject(updated);
      expect(await Source.collection.findOne({ _id: new mongoose.Types.ObjectId(id) })).toMatchObject(updated);
      expect(await Source.collection.findOne({ _id: new mongoose.Types.ObjectId(created.raw._id) })).toMatchObject({
        ...business,
        payload: replacement,
      });
    });
  });

  it('cannot regain hydration control through broad modified root/subquery metadata', async () => {
    for (const stale of controls(mode).slice(1, 3)) {
      reset();
      const { adapter, rows, targets } = client('service', {});
      const inner = targets.readAdvancedFilter(business, { select: ['name'] }, { sq: { path: 'name', compact: true } });
      Object.assign(inner.__query, stale);
      Object.assign(inner.__query.options!, stale);
      Object.assign(inner.__query.args!, stale);
      const list = rows.listAdvanced({ ...business, name: inner }, { select });
      const read = rows.readAdvanced(id, { select });
      const filterRead = rows.readAdvancedFilter(business, { select });
      const requests = [list, read, filterRead] as const;
      requests.forEach((request, index) => {
        Object.assign(request.__query, stale);
        Object.assign(request.__query.args!, stale);
        Object.assign(request.__query.options!, stale);
        request.__query.order = 2 - index;
      });
      expect(protocolRequests).toHaveLength(0);
      const [listed, byId, byFilter] = await adapter.group(...requests);
      expect(listed.success).toBe(true);
      expect(byId.success).toBe(true);
      expect(byFilter.success).toBe(true);
      if (listed.success) expectRow(listed.raw[0], mode);
      expectRow(byId.raw, mode);
      expectRow(byFilter.raw, mode);
      expectMode(source, mode, ['findOne', 'findOne', 'find']);
      expectMode(target, mode, ['findOne']);
      expect(callbacks).toEqual([listed, byId, byFilter]);
      expect(protocolRequests).toHaveLength(1);
      const entries = protocolRequests[0].body as Array<{ order: number; options: Bag; filter?: unknown }>;
      expect(entries.map((entry) => entry.order)).toEqual([2, 1, 0]);
      entries.forEach((entry) => expect(entry.options).toMatchObject(stale));
      expect(entries[0].filter).toMatchObject({ name: { $$sq: { options: stale } } });
    }
  });
});
