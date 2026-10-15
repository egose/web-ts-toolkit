import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../dist/index.mjs';
import type { ModelRequest } from '../src/interfaces';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

const noCalls = { aggregate: 0, find: 0, findOne: 0, countDocuments: 0 };
const bsonSize = (value: object) => mongoose.mongo.BSON.calculateObjectSize(value);
const oid = new mongoose.Types.ObjectId('abcdef'.repeat(4));
let sequence = 0;

async function fixture(rows: Record<string, unknown>[], parentKeys: unknown[] = []) {
  const api = createAccessRuntime();
  const n = ++sequence;
  const calls = { ...noCalls };
  const results: Array<Array<{ _id: number; count: number }>> = [];
  const schema = new mongoose.Schema({
    _id: String,
    direct: [{ type: String, lowercase: true }],
    contacts: [{ keys: [String], value: mongoose.Schema.Types.Mixed }],
    scalar: { type: String, lowercase: true },
    value: mongoose.Schema.Types.Mixed,
    oid: mongoose.Schema.Types.ObjectId,
    date: Date,
    number: Number,
    tenant: Number,
    visible: Boolean,
  });
  for (const op of ['aggregate', 'find', 'findOne', 'countDocuments'] as const) {
    schema.pre(op, function () {
      calls[op] += 1;
    });
  }
  schema.post('aggregate', function (rows: Array<{ _id: number; count: number }>) {
    results.push(rows);
  });
  const Target = mongoose.model(`Arl12Target${n}`, schema);
  const Parent = mongoose.model(
    `Arl12Parent${n}`,
    new mongoose.Schema({ name: String, key: mongoose.Schema.Types.Mixed }),
  );
  // Raw insertion preserves missing/empty values and exact object order/array shape.
  await Target.collection.insertMany(
    [
      ...rows.map((row) => ({ ...row, tenant: 7, visible: true })),
      { ...rows[0], tenant: 8, visible: true },
      { ...rows[0], tenant: 7, visible: false },
    ].map((row, i) => ({ ...row, _id: `target-${i}` })),
  );
  await Parent.create(parentKeys.map((key, i) => ({ name: `p${String(i).padStart(4, '0')}`, key })));
  const aggregate = vi.spyOn(Target.collection, 'aggregate');
  const find = vi.spyOn(Target.collection, 'find');
  const findOne = vi.spyOn(Target.collection, 'findOne');
  const count = vi.spyOn(Target.collection, 'countDocuments');
  api.setGlobalOptions({ globalPermissions: () => [], requestComplexity: { maxBulkConcurrency: 1 } });
  api.createRouter(Target, {
    operationAccess: { count: true, list: false, read: false },
    permissionSchema: {},
    baseFilter: { count: () => ({ tenant: '7' }) },
  });
  const parent = api.createRouter(Parent, {
    basePath: '/parents',
    operationAccess: { list: true },
    permissionSchema: { name: true, key: true },
    listHardLimit: 1000,
  });
  const app = express();
  app.use(express.json(), parent.routes, api.createRouter({ basePath: '/root', operationAccess: true }).routes);
  let callback: (req: ModelRequest) => Promise<void>;
  let failure: unknown;
  parent.router.post('/probe', async (req, res) => {
    try {
      await callback(req as unknown as ModelRequest);
    } catch (error) {
      failure = error;
    }
    res.json({ ok: true });
  });
  return {
    api,
    Target,
    calls,
    results,
    aggregate,
    async helper(run: (req: ModelRequest) => Promise<void>) {
      callback = run;
      failure = undefined;
      await request(app).post('/parents/probe').send({}).expect(200);
      if (failure) throw failure;
    },
    async include(field: string, entry: 'service' | 'direct' | 'root') {
      const include = {
        model: Target.modelName,
        op: 'count',
        path: 'total',
        localField: 'key',
        foreignField: field,
        filter: { visible: true },
      };
      if (entry === 'service') {
        let rows: unknown;
        await this.helper(async (req) => {
          const result = await req.macl.getService(Parent.modelName).find({}, { include, sort: { name: 1 } } as never);
          expect(result.success).toBe(true);
          if (result.success) rows = result.data;
        });
        return rows as Array<{ total: number }>;
      }
      const response =
        entry === 'root'
          ? await request(app)
              .post('/root')
              .send([{ target: 'model', name: Parent.modelName, op: 'list', args: { include, sort: { name: 1 } } }])
              .expect(200)
          : await request(app)
              .post('/parents/__query')
              .send({ include, sort: { name: 1 } })
              .expect(200);
      return (entry === 'root' ? response.body[0].result.data : response.body.data) as Array<{ total: number }>;
    },
    reference(field: string, keys: unknown[]) {
      return Target.countDocuments({ tenant: '7', visible: true, [field]: { $in: keys } });
    },
    assertAggregate(groups: number, identityJoin = false) {
      expect(calls).toEqual({ ...noCalls, aggregate: 1 });
      expect(aggregate).toHaveBeenCalledTimes(1);
      expect(find).not.toHaveBeenCalled();
      expect(findOne).not.toHaveBeenCalled();
      expect(count).not.toHaveBeenCalled();
      expect(results).toHaveLength(1);
      expect(results[0].length).toBeLessThanOrEqual(groups);
      expect(bsonSize({ rows: results[0] })).toBeLessThanOrEqual(16 + groups * 64);
      for (const row of results[0]) {
        expect(Object.keys(row).sort()).toEqual(['_id', 'count']);
        expect(Number.isSafeInteger(row._id)).toBe(true);
        expect(Number.isSafeInteger(row.count)).toBe(true);
      }
      const pipeline = JSON.stringify(aggregate.mock.calls[0][0]);
      for (const forbidden of ['$addToSet', '$push', '$lookup', '$unionWith', ...(identityJoin ? [] : ['$_id'])]) {
        expect(pipeline).not.toContain(forbidden);
      }
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe('ARL-12 native query equivalence for numeric grouped counts', () => {
  const cases = [
    {
      name: 'literal array on a typed top-level array (reviewer reproduction)',
      field: 'direct',
      rows: [{ direct: ['a', 'b'] }, { direct: ['c'] }],
      values: [['a', 'b'], ['absent']],
      expected: [1, 0],
    },
    {
      name: 'scalar through repeated embedded arrays (reviewer reproduction)',
      field: 'contacts.keys',
      rows: [{ contacts: [{ keys: ['a', 'b'] }, { keys: ['a'] }] }, { contacts: [{ keys: ['c'] }] }],
      values: ['a', 'absent'],
      expected: [1, 0],
    },
    {
      name: 'literal nested array and scalar at a Mixed leaf',
      field: 'value',
      rows: [{ value: [['a', 'b'], 'c', ['a', 'b']] }, { value: ['a', 'b'] }, { value: ['b', 'a'] }],
      values: [['a', 'b'], ['b', 'a'], 'a', 'c', []],
      expected: [2, 1, 2, 1, 0],
    },
    {
      name: 'literal empty array versus missing/null',
      field: 'value',
      rows: [{ value: [] }, { value: [[]] }, { value: null }, {}],
      values: [[], null],
      expected: [2, 2],
    },
    {
      name: 'null on missing and array leaves',
      field: 'value',
      rows: [{}, { value: null }, { value: [null, null, 'a'] }, { value: [] }, { value: 'a' }],
      values: [null, 'absent'],
      expected: [3, 0],
    },
    {
      name: 'undefined retains driver query serialization',
      field: 'value',
      rows: [{}, { value: null }, { value: 'a' }],
      values: [undefined, 'absent'],
      expected: [2, 0],
    },
    {
      name: 'literal object equality and key order',
      field: 'value',
      rows: [
        { value: { a: 1, b: 2 } },
        { value: { b: 2, a: 1 } },
        {
          value: [
            { a: 1, b: 2 },
            { a: 1, b: 2 },
          ],
        },
      ],
      values: [
        { a: 1, b: 2 },
        { b: 2, a: 1 },
      ],
      expected: [2],
    },
    {
      name: 'empty literal object versus missing/null',
      field: 'value',
      rows: [{ value: {} }, { value: [{}, {}] }, {}, { value: null }],
      values: [{}, 'absent'],
      expected: [2, 0],
    },
    {
      name: 'dollar fields inside a literal object remain data',
      field: 'value',
      rows: [{ value: { tag: 'a', $gt: '' } }, { value: { tag: 'a', nested: { $gt: '' } } }],
      values: [{ tag: 'a', $gt: '' }, 'absent'],
      expected: [1, 0],
    },
    {
      name: 'operator-shaped objects inside a literal array remain data',
      field: 'value',
      rows: [{ value: [{ $gt: '' }] }],
      values: [[{ $gt: '' }], 'absent'],
      expected: [1, 0],
    },
    {
      name: 'complete literal DBRef documents retain the native query exception',
      field: 'value',
      rows: [{ value: { $ref: 'items', $id: oid } }],
      values: [{ $ref: 'items', $id: oid }, 'absent'],
      expected: [1, 0],
    },
    {
      name: 'dotted null with missing children and empty arrays',
      field: 'contacts.value',
      rows: [
        {},
        { contacts: [] },
        { contacts: [{}] },
        { contacts: [{ value: null }] },
        { contacts: [{ value: 'a' }, {}] },
        { contacts: [{ value: [] }] },
      ],
      values: [null, 'absent'],
    },
    {
      name: 'dotted literal object in repeated nested arrays',
      field: 'contacts.value',
      rows: [{ contacts: [{ value: [{ a: 1 }, { a: 1 }] }, { value: { a: 1 } }] }, { contacts: [{ value: { a: 2 } }] }],
      values: [{ a: 1 }, 'absent'],
      expected: [1, 0],
    },
    {
      name: 'dotted arrays through multiple Mixed levels',
      field: 'value.level.keys',
      rows: [
        { value: [{ level: [{ keys: ['a', 'b'] }, { keys: ['a'] }] }, { level: { keys: 'b' } }] },
        { value: { level: { keys: ['b'] } } },
      ],
      values: ['a', 'b', ['a', 'b'], 'absent'],
      expected: [1, 2, 1, 0],
    },
    {
      name: 'top-level scalar setters and original aliases',
      field: 'scalar',
      rows: [{ scalar: 'a' }, { scalar: 'b' }],
      values: ['A', 'a', 'B', 'absent', 'A'],
      expected: [1, 1, 1, 0],
    },
    {
      name: 'top-level array scalar positive control',
      field: 'direct',
      rows: [{ direct: ['a', 'b', 'a'] }],
      values: ['A', 'b', 'absent'],
      expected: [1, 1, 0],
    },
    {
      name: 'native ObjectId query casting and aliases',
      field: 'oid',
      rows: [{ oid }],
      values: [String(oid).toUpperCase(), oid, String(new mongoose.Types.ObjectId())],
      expected: [1, 1, 0],
    },
    {
      name: 'native date query casting',
      field: 'date',
      rows: [{ date: new Date('2026-01-01') }],
      values: ['2026-01-01', new Date('2026-01-01'), '2026-01-02'],
      expected: [1, 1, 0],
    },
    {
      name: 'numeric casting aliases',
      field: 'number',
      rows: [{ number: 1 }],
      values: ['001', 1, '2'],
      expected: [1, 1, 0],
    },
    {
      name: 'identity field remains available to native matching',
      field: '_id',
      rows: [{ value: 1 }],
      values: ['target-0', 'absent'],
      expected: [1, 0],
    },
    {
      name: 'first occurrence wins when array and scalar aliases collide',
      field: 'value',
      rows: [{ value: ['a', 'b'] }, { value: 'a,b' }, { value: 'a,b' }],
      values: [['a', 'b'], 'a,b'],
      expected: [1],
    },
  ];

  it.each(cases)('public helper: $name', async ({ field, rows, values, expected }) => {
    const f = await fixture(rows);
    const originals = new Map<string, unknown>();
    for (const value of values) if (!originals.has(String(value))) originals.set(String(value), value);
    let actual: Map<string, number>;
    await f.helper(async (req) => {
      const result = await req.macl
        .getService(f.Target.modelName)
        .countByFieldValues(field, values, { visible: true }, 'count');
      expect(result.success).toBe(true);
      if (result.success) actual = result.data;
    });
    f.assertAggregate(originals.size, field === '_id');
    const reference = [];
    for (const [alias, value] of originals) reference.push([alias, await f.reference(field, [value])]);
    if (expected) expect(reference.map(([, count]) => count)).toEqual(expected);
    expect([...actual!]).toEqual(reference);
  });

  for (const entry of ['service', 'direct', 'root'] as const) {
    it(`${entry} include: exact reviewer nested fixture matches 1 and misses 0`, async () => {
      const f = await fixture(
        [{ contacts: [{ keys: ['a', 'b'] }, { keys: ['a'] }] }, { contacts: [{ keys: ['c'] }] }],
        ['a', 'absent'],
      );
      const actual = await f.include('contacts.keys', entry);
      f.assertAggregate(2);
      expect(await f.reference('contacts.keys', ['a'])).toBe(1);
      expect(await f.reference('contacts.keys', ['absent'])).toBe(0);
      expect(actual.map((row) => row.total)).toEqual([1, 0]);
    });

    it(`${entry} include: literal arrays use the existing one-level local flattening`, async () => {
      const f = await fixture([{ direct: ['a', 'b'] }, { direct: ['c'] }], [[[['a', 'b']]], [[['absent']]]]);
      const actual = await f.include('direct', entry);
      f.assertAggregate(2);
      expect(await f.reference('direct', [['a', 'b']])).toBe(1);
      expect(await f.reference('direct', [['absent']])).toBe(0);
      expect(actual.map((row) => row.total)).toEqual([1, 0]);
    });

    it(`${entry} include: repeated nested matches count once for overlapping parents`, async () => {
      const keys = ['a', ['a', 'b', 'a'], ['b', 'c', 'b'], 'b', [], 'absent'];
      const f = await fixture(
        [
          { contacts: [{ keys: ['a', 'b', 'a'] }, { keys: ['a', 'b'] }] },
          { contacts: [{ keys: ['a', 'a'] }] },
          { contacts: [{ keys: ['b', 'b'] }] },
          { contacts: [{ keys: ['c'] }] },
          { contacts: [{ keys: ['z'] }] },
        ],
        keys,
      );
      const actual = await f.include('contacts.keys', entry);
      f.assertAggregate(keys.length);
      const reference = [];
      for (const key of keys) reference.push(await f.reference('contacts.keys', Array.isArray(key) ? key : [key]));
      expect(reference).toEqual([2, 3, 3, 2, 0, 0]);
      expect(actual.map((row) => row.total)).toEqual(reference);
    });

    it(`${entry} include: object equality and null/missing dotted children stay query-equivalent`, async () => {
      const keys = [{ tag: 'a' }, null, 'absent'];
      const f = await fixture(
        [
          { contacts: [{ value: [{ tag: 'a' }, { tag: 'a' }] }, { value: { tag: 'a' } }] },
          { contacts: [{ value: null }, { value: null }] },
          { contacts: [{}] },
          {},
          { contacts: [] },
          { contacts: [{ value: 'z' }] },
        ],
        keys,
      );
      const actual = await f.include('contacts.value', entry);
      f.assertAggregate(keys.length);
      const reference = [];
      for (const key of keys) reference.push(await f.reference('contacts.value', [key]));
      expect(reference).toEqual([1, 3, 0]);
      expect(actual.map((row) => row.total)).toEqual(reference);
    });
  }

  it('owns literal arrays and nested object values before awaited row hooks', async () => {
    const f = await fixture([{ value: [{ key: 'a' }] }]);
    const value = [{ key: 'a' }];
    f.api.setModelOption(f.Target.modelName, 'baseFilter.count', async () => {
      value[0].key = 'changed';
      await Promise.resolve();
      return { tenant: '7' };
    });
    await f.helper(async (req) => {
      const result = await req.macl
        .getService(f.Target.modelName)
        .countByFieldValues('value', [value], { visible: true }, 'count');
      expect(result.success).toBe(true);
      if (result.success) expect([...result.data]).toEqual([['[object Object]', 1]]);
    });
    f.assertAggregate(1);
    expect(await f.reference('value', [[{ key: 'a' }]])).toBe(1);
    expect(value).toEqual([{ key: 'changed' }]);
  });

  it('retains existing foreign-path grammar and rejects numeric positional paths before persistence', async () => {
    const f = await fixture([{ value: [{ keys: ['a'] }] }]);
    await f.helper(async (req) => {
      const result = await req.macl.getService(f.Target.modelName).countByFieldValues('value.0.keys', ['a']);
      expect(result).toMatchObject({ success: false, code: 'bad_request' });
    });
    expect(f.calls).toEqual(noCalls);
    expect(f.aggregate).not.toHaveBeenCalled();
  });

  it('empty public input returns an empty Map while false denial stays terminal', async () => {
    const f = await fixture([{ value: 'a' }]);
    await f.helper(async (req) => {
      const service = req.macl.getService(f.Target.modelName);
      const result = await service.countByFieldValues('value', [], {}, 'count');
      expect(result.success).toBe(true);
      if (result.success) expect([...result.data]).toEqual([]);
      expect(await service.countByFieldValues('value', [], false, 'count')).toMatchObject({ code: 'forbidden' });
    });
    expect(f.calls).toEqual(noCalls);
    expect(f.aggregate).not.toHaveBeenCalled();
  });

  it.each(['raw', 'cast'] as const)('bounds cumulative %s key nodes before target persistence', async (mode) => {
    const value = Array.from({ length: 1000 }, () => 'a');
    const f = await fixture([{ value: 'a' }]);
    if (mode === 'cast') {
      vi.spyOn(f.Target.schema.path('value'), 'castForQuery').mockImplementation((_operator, operands: unknown[]) =>
        operands.map(() => value),
      );
    }
    if (mode === 'raw') {
      await f.helper(async (req) => {
        const result = await req.macl.getService(f.Target.modelName).countByFieldValues(
          'value',
          Array.from({ length: 25 }, () => value),
          {},
          'count',
        );
        expect(result).toMatchObject({ success: false, code: 'bad_request' });
        if (!result.success) expect(result.errors?.[0]?.detail).toContain('20000 nodes');
      });
    } else {
      // Each cast key fits; its expansion across 25 groups does not.
      await f.helper(async (req) => {
        const result = await req.macl.getService(f.Target.modelName).countByFieldValues(
          'value',
          Array.from({ length: 25 }, (_, i) => String(i)),
          {},
          'count',
        );
        expect(result).toMatchObject({ success: false, code: 'bad_request' });
      });
    }
    expect(f.calls).toEqual(noCalls);
    expect(f.aggregate).not.toHaveBeenCalled();
  });

  it('keeps maximum-width native groups/path and near-budget key bytes within one bounded aggregate', async () => {
    const field = 'k'.repeat(1024);
    const keys = Array.from({ length: 1000 }, (_, i) => String(i).padEnd(480, 'x'));
    const f = await fixture([{ [field]: keys }], keys);
    const actual = await f.include(field, 'direct');
    f.assertAggregate(1000);
    expect(actual.map((row) => row.total)).toEqual(Array.from({ length: 1000 }, () => 1));
    const pipelineBytes = bsonSize({ pipeline: f.aggregate.mock.calls[0][0] });
    const resultBytes = bsonSize({ rows: f.results[0] });
    expect(pipelineBytes).toBeLessThan(4 * 1024 * 1024);
    expect(f.results[0]).toHaveLength(1000);
    console.info('ARL-12 maximum-width measurement', {
      groups: 1000,
      pathBytes: 1024,
      keyBytes: 480,
      aggregateQueries: f.calls.aggregate,
      resultRows: f.results[0].length,
      pipelineBytes,
      resultBytes,
    });
    expect(await f.reference(field, [keys[0]])).toBe(1);
    expect(await f.reference(field, [keys[999]])).toBe(1);
  });

  it.each(['raw', 'cast'] as const)(
    'rejects %s operator documents as equality operands before dispatch',
    async (mode) => {
      const f = await fixture([{ value: 'a' }]);
      if (mode === 'cast') {
        vi.spyOn(f.Target.schema.path('value'), 'castForQuery').mockImplementation((_operator, operands: unknown[]) =>
          operands.map(() => ({ $gt: '' })),
        );
      }
      await f.helper(async (req) => {
        const result = await req.macl
          .getService(f.Target.modelName)
          .countByFieldValues('value', [mode === 'raw' ? { $gt: '' } : 'a'], {}, 'count');
        expect(result).toMatchObject({ success: false, code: 'bad_request' });
      });
      expect(f.calls).toEqual(noCalls);
      expect(f.aggregate).not.toHaveBeenCalled();
    },
  );
});
