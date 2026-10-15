import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../dist/index.mjs';
import type { ModelRequest } from '../src/interfaces';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

const noCalls = { aggregate: 0, find: 0, findOne: 0, countDocuments: 0 };
const bsonSize = (value: Record<string, unknown>) => mongoose.mongo.BSON.calculateObjectSize(value);
let sequence = 0;

async function fixture(arrays = true, parentKeys: unknown[] = ['A', ['A', 'a', 'B', 'A'], 'b', [], 'absent']) {
  const n = ++sequence;
  const api = createAccessRuntime();
  const tenant = new mongoose.Types.ObjectId();
  const region = new mongoose.Types.ObjectId();
  const calls = { ...noCalls };
  const results: Array<{ rows: number; bytes: number; documents: number[]; numeric: boolean }> = [];
  const aggregateErrors: Array<{ code?: number; message: string }> = [];
  const schema = new mongoose.Schema({
    _id: String,
    join: arrays ? [{ type: String, lowercase: true }] : { type: String, lowercase: true },
    tenant: mongoose.Schema.Types.ObjectId,
    region: mongoose.Schema.Types.ObjectId,
    visible: Boolean,
  });
  for (const op of ['aggregate', 'find', 'findOne', 'countDocuments'] as const) {
    schema.pre(op, function () {
      calls[op] += 1;
    });
  }
  schema.post('aggregate', function (rows: Array<Record<string, unknown>>) {
    results.push({
      rows: rows.length,
      bytes: bsonSize({ rows }),
      documents: rows.map(bsonSize),
      numeric: rows.every(
        (row) =>
          Object.keys(row).sort().join(',') === '_id,count' &&
          Number.isSafeInteger(row._id) &&
          typeof row.count === 'number',
      ),
    });
  });
  schema.post('aggregate', function (error: Error & { code?: number }, _rows: unknown, next: (error: Error) => void) {
    aggregateErrors.push({ code: error.code, message: error.message });
    next(error);
  });
  const Target = mongoose.model(`Arl08Target${n}`, schema);
  const Parent = mongoose.model(
    `Arl08Parent${n}`,
    new mongoose.Schema({ name: String, join: mongoose.Schema.Types.Mixed }),
  );
  api.setGlobalOptions({ globalPermissions: () => [], requestComplexity: { maxBulkConcurrency: 1 } });
  api.createRouter(Target, {
    operationAccess: { count: true, read: false, list: false },
    listHardLimit: 2,
    permissionSchema: {},
    baseFilter: { count: () => ({ tenant: String(tenant), visible: true }) },
  });
  const router = api.createRouter(Parent, {
    basePath: '/arl08',
    listHardLimit: 1100,
    operationAccess: { read: true, list: true },
    permissionSchema: { name: true, join: true },
  });
  const root = api.createRouter({ basePath: '/root', operationAccess: true });
  const parents = await Parent.insertMany(parentKeys.map((join, index) => ({ name: `p${index}`, join })));
  const targetRows = [
    ...Array.from({ length: 9 }, (_, index) => ({ _id: `both-${index}`, join: arrays ? ['a', 'a', 'b'] : 'a' })),
    { _id: 'a-only', join: arrays ? ['a'] : 'a' },
    { _id: 'b-only', join: arrays ? ['b'] : 'b' },
    { _id: 'c-only', join: arrays ? ['c'] : 'c' },
  ];
  await Target.insertMany([
    ...targetRows.map((row) => ({ ...row, tenant, region, visible: true })),
    {
      _id: 'wrong-tenant',
      join: arrays ? ['a', 'b'] : 'a',
      tenant: new mongoose.Types.ObjectId(),
      region,
      visible: true,
    },
    {
      _id: 'wrong-region',
      join: arrays ? ['a', 'b'] : 'a',
      tenant,
      region: new mongoose.Types.ObjectId(),
      visible: true,
    },
    { _id: 'hidden', join: arrays ? ['a', 'b'] : 'a', tenant, region, visible: false },
  ]);
  const aggregate = vi.spyOn(Target.collection, 'aggregate');
  const include = {
    model: Target.modelName,
    op: 'count' as const,
    path: 'total',
    localField: 'join',
    foreignField: 'join',
    filter: { region: String(region) },
    args: { limit: 1, skip: 100, page: 50, pageSize: 1 },
  };
  let callback: (req: ModelRequest) => Promise<void>;
  let failure: unknown;
  router.router.post('/probe', async (req, res) => {
    try {
      await callback(req as unknown as ModelRequest);
    } catch (error) {
      failure = error;
    }
    res.json({ ok: true });
  });
  const app = express();
  app.use(express.json());
  app.use(router.routes);
  app.use(root.routes);
  const reset = () => {
    Object.assign(calls, noCalls);
    results.length = 0;
    aggregateErrors.length = 0;
    aggregate.mockClear();
  };
  return {
    api,
    app,
    Target,
    Parent,
    parents,
    tenant,
    region,
    include,
    calls,
    results,
    aggregate,
    aggregateErrors,
    reset,
    async execute(run: (req: ModelRequest) => Promise<void>) {
      failure = undefined;
      callback = run;
      await request(app).post('/arl08/probe').send({}).expect(200);
      if (failure) throw failure;
    },
    invoke(root = false) {
      return root
        ? request(app)
            .post('/root')
            .send([{ target: 'model', name: Parent.modelName, op: 'list', args: { include, sort: { name: 1 } } }])
        : request(app)
            .post('/arl08/__query')
            .send({ include, sort: { name: 1 } });
    },
  };
}

function expectOneNumericAggregate(f: Awaited<ReturnType<typeof fixture>>, groups: number) {
  expect(f.calls).toEqual({ ...noCalls, aggregate: 1 });
  expect(f.aggregate).toHaveBeenCalledTimes(1);
  expect(f.results).toHaveLength(1);
  expect(f.results[0].numeric).toBe(true);
  expect(f.results[0].rows).toBeLessThanOrEqual(groups);
  expect(f.results[0].bytes).toBeLessThanOrEqual(16 + groups * 64);
  // The grouped operation must never accumulate identifiers, even inside Mongo.
  const pipeline = JSON.stringify(f.aggregate.mock.calls[0][0]);
  expect(pipeline).not.toContain('$addToSet');
  expect(pipeline).not.toContain('$push');
  expect(pipeline).not.toContain('$_id');
  expect(pipeline).not.toContain('$limit');
  expect(pipeline).not.toContain('$skip');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ARL-08 numeric grouped counts', () => {
  for (const arrays of [false, true]) {
    it.each([false, true])(
      `${arrays ? 'array' : 'scalar'} foreign keys count overlapping parents exactly (root=%s)`,
      async (root) => {
        const f = await fixture(arrays);
        const response = await f.invoke(root).expect(200);
        const rows = root ? response.body[0].result.data : response.body.data;
        expect(rows.map((row: { total: number }) => row.total)).toEqual([10, 11, arrays ? 10 : 1, 0, 0]);
        expectOneNumericAggregate(f, 5);
        // Reference queries occur strictly after instrumentation of the include.
        for (let i = 0; i < f.parents.length; i++) {
          const join = f.parents[i].join;
          expect(rows[i].total).toBe(
            await f.Target.countDocuments({
              tenant: String(f.tenant),
              region: String(f.region),
              visible: true,
              join: { $in: Array.isArray(join) ? join : [join] },
            }),
          );
        }
      },
    );
  }

  it('public countByFieldValues returns numbers for original aliases, zero misses and duplicate foreign arrays', async () => {
    const f = await fixture();
    await f.execute(async (req) => {
      const service = req.macl.getService(f.Target.modelName);
      const values = ['A', 'a', 'B', 'absent', 'A'];
      const result = await service.countByFieldValues('join', values, { region: String(f.region) }, 'count');
      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.code);
      expect([...result.data]).toEqual([
        ['A', 10],
        ['a', 10],
        ['B', 10],
        ['absent', 0],
      ]);
      expect(values).toEqual(['A', 'a', 'B', 'absent', 'A']);
    });
    expectOneNumericAggregate(f, 4);
  });

  it('owns public operands before an awaited row hook can mutate the caller array', async () => {
    const f = await fixture(false);
    const values = ['A'];
    f.api.setModelOption(f.Target.modelName, 'baseFilter.count', async () => {
      values[0] = 'b';
      await Promise.resolve();
      return { tenant: String(f.tenant), visible: true };
    });
    await f.execute(async (req) => {
      const result = await req.macl
        .getService(f.Target.modelName)
        .countByFieldValues('join', values, { region: String(f.region) }, 'count');
      expect(result.success).toBe(true);
      if (result.success) expect([...result.data]).toEqual([['A', 10]]);
    });
    expect(values).toEqual(['b']);
    expectOneNumericAggregate(f, 1);
  });

  it('retains one-level local flattening, literal dollar keys and independent overlapping groups', async () => {
    const f = await fixture(true, [[['A'], ['B', 'A']], ['B', 'C'], ['$literal'], []]);
    await f.Target.insertMany([
      { _id: 'literal', join: ['$literal'], tenant: f.tenant, region: f.region, visible: true },
    ]);
    const response = await f.invoke().expect(200);
    expect(response.body.data.map((row: { total: number }) => row.total)).toEqual([11, 11, 1, 0]);
    expectOneNumericAggregate(f, 4);
  });

  it('preserves a literal false predicate and terminal row denial before schema casting', async () => {
    const f = await fixture();
    const setter = vi.fn(() => {
      throw new Error('denied count must not cast');
    });
    f.Target.schema.path('join').set(setter);
    await f.execute(async (req) => {
      const service = req.macl.getService(f.Target.modelName);
      expect(await service.countByFieldValues('join', ['invalid'], false, 'count')).toMatchObject({
        success: false,
        code: 'forbidden',
      });
    });
    f.api.setModelOption(f.Target.modelName, 'baseFilter.count', () => false);
    const response = await f.invoke().expect(200);
    expect(response.body.data.every((row: object) => !('total' in row))).toBe(true);
    expect(setter).not.toHaveBeenCalled();
    expect(f.calls).toEqual(noCalls);
    expect(f.aggregate).not.toHaveBeenCalled();
  });

  it.each([
    ['group count', () => Array.from({ length: 1001 }, () => 'a')],
    ['key occurrences before deduplication', () => [Array.from({ length: 10001 }, () => 'a')]],
    ['individual key bytes', () => ['a'.repeat(64 * 1024 + 1)]],
    ['cumulative key bytes', () => [Array.from({ length: 20 }, (_, i) => `${i}${'a'.repeat(60_000)}`)]],
  ] as const)('rejects excess %s before target persistence', async (_label, keys) => {
    const f = await fixture(true, keys());
    const response = await f.invoke();
    expect(response.status).toBe(400);
    expect(f.calls).toEqual(noCalls);
    expect(f.aggregate).not.toHaveBeenCalled();
  });

  it.each([
    ['groups', () => Array.from({ length: 1000 }, () => 'a')],
    ['key occurrences', () => [Array.from({ length: 10000 }, () => 'a')]],
  ] as const)('accepts the inclusive %s bound in one query', async (_label, keys) => {
    const parentKeys = keys();
    const f = await fixture(true, parentKeys);
    const response = await f.invoke().expect(200);
    expect(response.body.data).toHaveLength(parentKeys.length);
    expect(response.body.data.every((row: { total: number }) => row.total === 10)).toBe(true);
    expectOneNumericAggregate(f, parentKeys.length);
  });

  it.each(['individual', 'cumulative'])('also bounds %s schema-setter expansion before aggregation', async (mode) => {
    const f = await fixture(false, [mode === 'individual' ? 'a' : Array.from({ length: 20 }, (_, i) => String(i))]);
    f.Target.schema.path('join').set((value: string) => value.padEnd(mode === 'individual' ? 65537 : 60000, 'x'));
    const response = await f.invoke();
    expect(response.status).toBe(400);
    expect(f.calls).toEqual(noCalls);
    expect(f.aggregate).not.toHaveBeenCalled();
  });

  it('rejects malformed public inputs, excess values and extra authority arguments without persistence', async () => {
    const f = await fixture();
    await f.execute(async (req) => {
      const service = req.macl.getService(f.Target.modelName);
      for (const values of [null, {}, 'a', Array.from({ length: 1001 }, () => 'a')]) {
        expect(await service.countByFieldValues('join', values as never)).toMatchObject({ code: 'bad_request' });
      }
      expect(await service.countByFieldValues('a'.repeat(1025), ['a'])).toMatchObject({ code: 'bad_request' });
      expect(await service.countByFieldValues('join', ['a'], {}, {} as never)).toMatchObject({ code: 'bad_request' });
      expect(
        await Reflect.apply(service.countByFieldValues, service, [
          'join',
          ['a'],
          {},
          'count',
          { rows: { mode: 'unrestricted' } },
        ]),
      ).toMatchObject({ code: 'bad_request' });
    });
    expect(f.calls).toEqual(noCalls);
    expect(f.aggregate).not.toHaveBeenCalled();
  });

  it('returns controlled errors for unstringifiable, executable, cyclic and oversized native keys', async () => {
    const f = await fixture();
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    const keys = [
      Object.assign(Object.create(null), { key: 'a' }),
      { toString: 1 },
      /a/,
      new mongoose.mongo.BSON.Code('return true'),
      cyclic,
      Buffer.alloc(65537),
      new mongoose.mongo.BSON.Binary(Buffer.alloc(65537)),
      { key: { key: { key: { key: { key: { key: { key: { key: { key: 'a' } } } } } } } } },
    ];
    await f.execute(async (req) => {
      const service = req.macl.getService(f.Target.modelName);
      for (const key of keys) {
        expect(await service.countByFieldValues('join', [key], {}, 'count')).toMatchObject({
          success: false,
          code: 'bad_request',
        });
      }
    });
    expect(f.calls).toEqual(noCalls);
    expect(f.aggregate).not.toHaveBeenCalled();
  });

  it('keeps count results bounded when matching string IDs exceed MongoDB 16 MiB', async () => {
    const f = await fixture(true, ['a', ['a', 'b', 'a'], 'b', 'absent', []]);
    await f.Target.deleteMany({});
    const targetCount = 144;
    const idBytes = 128 * 1024;
    async function seed(longIds: boolean, size = targetCount) {
      await f.Target.insertMany(
        Array.from({ length: size }, (_, i) => ({
          _id: longIds ? String(i).padEnd(idBytes, 'x') : `short-${i}`,
          join: ['a', 'b', 'a'],
          tenant: f.tenant,
          region: f.region,
          visible: true,
        })),
      );
    }
    await seed(false, 1);
    f.reset();
    const single = await f.invoke().expect(200);
    expect(single.body.data.map((row: { total: number }) => row.total)).toEqual([1, 1, 1, 0, 0]);
    expectOneNumericAggregate(f, 5);
    const singleTargetBytes = f.results[0].bytes;
    await f.Target.deleteMany({});
    await seed(false);
    f.reset();
    const short = await f.invoke().expect(200);
    expect(short.body.data.map((row: { total: number }) => row.total)).toEqual([144, 144, 144, 0, 0]);
    expectOneNumericAggregate(f, 5);
    const shortBytes = f.results[0].bytes;
    await f.Target.deleteMany({});
    await seed(true);
    const [volume] = await f.Target.collection
      .aggregate([{ $group: { _id: null, ids: { $sum: { $strLenBytes: '$_id' } }, targets: { $sum: 1 } } }])
      .toArray();
    expect(volume).toEqual({ _id: null, ids: targetCount * idBytes, targets: targetCount });
    expect(volume.ids).toBeGreaterThan(16 * 1024 * 1024);
    f.reset();
    const response = await f.invoke();
    console.info('ARL-08 result-size measurement', {
      targets: targetCount,
      matchingIdBytes: volume.ids,
      requestedGroups: 5,
      aggregateQueries: f.calls.aggregate,
      status: response.status,
      aggregateErrors: f.aggregateErrors,
      resultRows: f.results[0]?.rows,
      resultBsonBytes: f.results[0]?.bytes,
      resultDocumentBytes: f.results[0]?.documents,
      shortIdResultBsonBytes: shortBytes,
      singleTargetResultBsonBytes: singleTargetBytes,
    });
    expect(response.status).toBe(200);
    expect(response.body.data.map((row: { total: number }) => row.total)).toEqual([144, 144, 144, 0, 0]);
    expect(f.results[0].bytes).toBeLessThanOrEqual(16 + 5 * 64);
    expectOneNumericAggregate(f, 5);
    expect(f.results[0].bytes).toBe(shortBytes);
    expect(f.results[0].bytes).toBe(singleTargetBytes);
    expect(f.results[0].rows).toBe(3);
    expect(f.results[0].bytes).toBe(100);
    expect(f.results[0].documents).toEqual([25, 25, 25]);
  });
});
