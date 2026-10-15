import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAccessRuntime, type DataRouterOptions } from '../dist/index.mjs';
import type { DataRequest, Projection } from '../dist/advanced';
import type { DataService } from '../src/services/data-service';

let sequence = 0;
afterEach(() => vi.restoreAllMocks());

function fixture<T extends { id: string }>(data: T[], options: DataRouterOptions<T> = {}) {
  const api = createAccessRuntime();
  const name = `Arl05Data${++sequence}`;
  const router = api.createDataRouter(name, {
    basePath: '/data',
    idParam: 'id',
    idField: 'id',
    operationAccess: { list: true, read: true },
    permissionSchema: { id: true, payload: true } as never,
    data,
    ...options,
  });
  const callbacks = new Map<string, (req: DataRequest) => Promise<void>>();
  let probe = 0;
  router.router.post('/_probe', async (req: DataRequest, res: express.Response) => {
    await callbacks.get(String(req.headers['arl05-probe']))!(req);
    res.json({ ok: true });
  });
  const root = api.createRouter({ basePath: '/root', operationAccess: true });
  const app = express();
  app.use(express.json(), router.routes, root.routes);

  async function execute<TResult>(run: (svc: DataService<T>, req: DataRequest) => Promise<TResult>): Promise<TResult> {
    const token = String(++probe);
    let value: TResult;
    let failed = false;
    let failure: unknown;
    callbacks.set(token, async (req) => {
      try {
        value = await run(router.getService(req), req);
      } catch (error) {
        failed = true;
        failure = error;
      }
    });
    try {
      await request(app).post('/data/_probe').set('arl05-probe', token).expect(200, { ok: true });
      if (failed) throw failure;
      return value!;
    } finally {
      callbacks.delete(token);
    }
  }

  return { api, runtime: api.runtime, name, router, app, execute };
}

const methods = ['findOne', 'findById', 'find'] as const;
async function readRow<T>(svc: DataService<T>, method: (typeof methods)[number] = 'findOne', select?: Projection) {
  const result =
    method === 'find'
      ? await svc.find({}, { limit: 1, select })
      : method === 'findById'
        ? await svc.findById('one', { select })
        : await svc.findOne({}, { select });
  expect(result.success).toBe(true);
  if (!result.success) throw new Error(`Unexpected data result: ${result.code}`);
  return (result.kind === 'list' ? result.data[0] : result.data) as T;
}

type ValueCase = {
  name: string;
  native: boolean;
  create: () => unknown;
  mutate: (value: unknown) => void;
  observe: (value: unknown) => unknown;
};

function valueCase<T>(
  name: string,
  create: () => T,
  mutate: (value: T) => void,
  observe: (value: T) => unknown,
  native = true,
): ValueCase {
  return {
    name,
    native,
    create,
    mutate: (value) => mutate(value as T),
    observe: (value) => {
      expect(Object.getPrototypeOf(value)).toBe(Object.getPrototypeOf(create()));
      return observe(value as T);
    },
  };
}

const valueCases: ValueCase[] = [
  valueCase(
    'object',
    () => ({ nested: { labels: ['stored'] } }),
    (value) => value.nested.labels.push('changed'),
    (value) => [...value.nested.labels],
    false,
  ),
  valueCase(
    'array',
    () => [{ nested: { count: 1 } }],
    (value) => {
      value[0].nested.count += 1;
      value.push({ nested: { count: 9 } });
    },
    (value) => value.map((entry) => entry.nested.count),
    false,
  ),
  valueCase(
    'Date',
    () => new Date(123456),
    (value) => value.setTime(999999),
    (value) => value.getTime(),
  ),
  valueCase(
    'Buffer',
    () => Buffer.alloc(4, 3),
    (value) => value.fill(9),
    (value) => [...value],
  ),
  valueCase(
    'Map',
    () => new Map([['stored', { nested: { count: 1 }, dates: [new Date(123456)] }]]),
    (value) => {
      const entry = value.get('stored')!;
      entry.nested.count += 1;
      entry.dates[0].setTime(999999);
      entry.dates.push(new Date(7));
      value.set('added', { nested: { count: 9 }, dates: [] });
    },
    (value) => [...value].map(([key, entry]) => [key, entry.nested.count, entry.dates.map((date) => date.getTime())]),
  ),
  valueCase(
    'Set',
    () => new Set([{ nested: { count: 1 }, bytes: Buffer.alloc(2, 3) }]),
    (value) => {
      const entry = [...value][0];
      entry.nested.count += 1;
      entry.bytes.fill(9);
      value.add({ nested: { count: 9 }, bytes: Buffer.alloc(1, 9) });
    },
    (value) => [...value].map((entry) => [entry.nested.count, [...entry.bytes]]),
  ),
  valueCase(
    'RegExp',
    () => Object.assign(/stored/gi, { lastIndex: 2 }),
    (value) => {
      value.compile('changed', 'g');
      value.lastIndex = 5;
    },
    (value) => [value.source, value.flags, value.lastIndex],
  ),
  valueCase(
    'ArrayBuffer',
    () => new Uint8Array([1, 2, 3, 4]).buffer,
    (value) => new Uint8Array(value).fill(9),
    (value) => [...new Uint8Array(value)],
  ),
  valueCase(
    'DataView',
    () => new DataView(new Uint8Array([0, 1, 2, 3, 4, 0]).buffer, 1, 4),
    (value) => value.setUint8(0, 9),
    (value) => [...new Uint8Array(value.buffer, value.byteOffset, value.byteLength)],
  ),
  ...[
    Int8Array,
    Uint8Array,
    Uint8ClampedArray,
    Int16Array,
    Uint16Array,
    Int32Array,
    Uint32Array,
    Float32Array,
    Float64Array,
  ].map((Type) =>
    valueCase(
      Type.name,
      () => new Type([1, 2, 3]).subarray(1),
      (value) => value.fill(9),
      (value) => [...value],
    ),
  ),
  ...[BigInt64Array, BigUint64Array].map((Type) =>
    valueCase(
      Type.name,
      () => new Type([1n, 2n, 3n]).subarray(1),
      (value) => value.fill(9n),
      (value) => [...value].map(String),
    ),
  ),
];

type Row = { id: string; payload: { label: string; entries: Array<{ value: unknown }> } };
const makeRow = (value: unknown, id = 'one'): Row => ({ id, payload: { label: 'stored', entries: [{ value }] } });
const leaf = (row: Row) => row.payload.entries[0].value;

describe('ARL-05 supported data ownership', () => {
  it.each(valueCases)('owns configured nested $name values, including frozen caller containers', async (test) => {
    for (const frozen of [false, true]) {
      const original = [makeRow(test.create())];
      if (frozen) {
        Object.freeze(original[0].payload.entries[0]);
        Object.freeze(original[0].payload.entries);
        Object.freeze(original[0].payload);
        Object.freeze(original[0]);
        Object.freeze(original);
      }
      const f = fixture(original);
      const expected = test.observe(test.create());
      test.mutate(leaf(original[0]));
      if (!frozen) {
        original[0].payload.label = 'changed';
        original[0].payload.entries.push({ value: 'extra' });
        original.push(makeRow('extra', 'two'));
      }
      await f.execute(async (svc) => {
        const row = await readRow(svc);
        expect(row.payload.label).toBe('stored');
        expect(row.payload.entries).toHaveLength(1);
        expect(test.observe(leaf(row))).toEqual(expected);
        const list = await svc.find({});
        expect(list).toMatchObject({ success: true, count: 1, totalCount: 1 });
      });
    }
  });

  it.each(valueCases)('isolates $name values through every public snapshot/getter surface', async (test) => {
    const f = fixture([makeRow(test.create())]);
    const expected = test.observe(test.create());
    const getters = [
      () => f.runtime.getDataOptions<Row>(f.name).data![0],
      () => f.runtime.getDataSnapshot<Row>(f.name)[0],
      () => (f.runtime.getDataOption(f.name, 'data') as Row[])[0],
      () => (f.runtime.getExactDataOption(f.name, 'data') as Row[])[0],
      () => f.runtime.getDataOption(f.name, 'data.0') as Row,
      () => f.runtime.getExactDataOption(f.name, 'data.0') as Row,
      () => f.router.options.data![0],
      () => f.runtime.createBootstrapSnapshot().dataOptions[f.name].data![0] as Row,
    ];
    for (const getter of getters) {
      const row = getter();
      expect(Object.isFrozen(row.payload.entries)).toBe(true);
      expect(() => row.payload.entries.push({ value: 'changed' })).toThrow(TypeError);
      const value = leaf(row);
      if (test.native) {
        test.mutate(value);
        expect(value).not.toBe(leaf(getter()));
      } else {
        expect(() => test.mutate(value)).toThrow(TypeError);
      }
      expect(test.observe(leaf(getter()))).toEqual(expected);
    }
    // Exact nested leaf lookup must also detach rather than bypass the snapshot view.
    if (test.native) {
      test.mutate(f.runtime.getDataOption(f.name, 'data.0.payload.entries.0.value'));
      test.mutate(f.runtime.getExactDataOption(f.name, 'data.0.payload.entries.0.value'));
    }
    expect(test.observe(leaf(await f.execute((svc) => readRow(svc))))).toEqual(expected);
  });

  it.each(valueCases)('returns independently mutable nested $name values from find/findOne/findById', async (test) => {
    const f = fixture([makeRow(test.create())]);
    const expected = test.observe(test.create());
    await f.execute(async (svc) => {
      for (const method of methods) {
        const row = await readRow(svc, method);
        const peer = await readRow(svc, method);
        test.mutate(leaf(row));
        expect(test.observe(leaf(peer))).toEqual(expected);
        row.payload.entries.push({ value: 'caller-added' });
        row.payload.label = 'caller-mutated';
        expect(peer.payload).toMatchObject({ label: 'stored', entries: [{ value: expect.anything() }] });
        expect(peer.payload.entries).toHaveLength(1);
        expect(test.observe(leaf(await readRow(svc, method)))).toEqual(expected);
      }
    });
    expect(test.observe(leaf(await f.execute((svc) => readRow(svc))))).toEqual(expected);
  });

  it('preserves primitive values, null prototypes, sparse arrays, accessors and repeated references without JSON copying', async () => {
    let reads = 0;
    const shared = { nested: [1] };
    const sparse: unknown[] = new Array(3);
    sparse[2] = undefined;
    const payload = Object.assign(Object.create(null), {
      undefined,
      nan: NaN,
      infinity: Infinity,
      negativeZero: -0,
      bigint: 7n,
      sparse,
      a: shared,
      b: shared,
    });
    Object.defineProperty(payload, 'computed', {
      enumerable: true,
      get: () => {
        reads += 1;
        return { value: 3 };
      },
    });
    Object.defineProperty(payload, 'ignored', { value: () => 'not data', enumerable: false });
    const f = fixture([{ id: 'one', payload }]);
    expect(reads).toBe(1);
    expect(Object.isFrozen(shared)).toBe(false);
    shared.nested.push(2);
    const result = await f.execute((svc) => readRow(svc));
    expect(Object.getPrototypeOf(result.payload)).toBe(null);
    expect(Object.hasOwn(result.payload, 'undefined')).toBe(true);
    expect(result.payload.nan).toBeNaN();
    expect(result.payload.infinity).toBe(Infinity);
    expect(Object.is(result.payload.negativeZero, -0)).toBe(true);
    expect(result.payload.bigint).toBe(7n);
    expect(result.payload.sparse).toHaveLength(3);
    expect(Object.hasOwn(result.payload.sparse, 0)).toBe(false);
    expect(Object.hasOwn(result.payload.sparse, 2)).toBe(true);
    expect(result.payload.a).toBe(result.payload.b);
    expect(result.payload.a.nested).toEqual([1]);
    expect(result.payload.computed).toEqual({ value: 3 });
    expect(Object.hasOwn(result.payload, 'ignored')).toBe(false);
    expect(reads).toBe(1);
    result.payload.a.nested.push(3);
    expect((await f.execute((svc) => readRow(svc))).payload.a.nested).toEqual([1]);
  });

  it('copies object Map keys and their aliases, and gives shared source rows independent outputs', async () => {
    const key = { nested: { label: 'key' } };
    const payload = { map: new Map([[key, { key, bytes: Buffer.alloc(2, 3) }]]) };
    const f = fixture([
      { id: 'one', payload },
      { id: 'two', payload },
    ]);
    key.nested.label = 'changed-original';
    await f.execute(async (svc) => {
      const result = await svc.find({});
      expect(result.success).toBe(true);
      if (!result.success) return;
      const [first, second] = result.data as Array<{ id: string; payload: typeof payload }>;
      const copiedKey = [...first.payload.map.keys()][0];
      expect(copiedKey.nested.label).toBe('key');
      expect(first.payload.map.get(copiedKey)!.key).toBe(copiedKey);
      copiedKey.nested.label = 'changed-result';
      first.payload.map.get(copiedKey)!.bytes.fill(9);
      first.payload.map.clear();
      const peerKey = [...second.payload.map.keys()][0];
      expect(peerKey.nested.label).toBe('key');
      expect([...second.payload.map.get(peerKey)!.bytes]).toEqual([3, 3]);
    });
  });

  it("isolates Buffer backing memory and copies only a binary view's visible bytes", async () => {
    const bytes = Buffer.allocUnsafeSlow(32).fill(3).subarray(8, 12);
    const view = new Uint16Array(new Uint16Array([0, 1, 2, 0]).buffer, 2, 2);
    const f = fixture([{ id: 'one', payload: { bytes, view } }]);
    for (const payload of [f.router.options.data![0].payload, (await f.execute((svc) => readRow(svc))).payload]) {
      const bufferCopy = payload.bytes;
      const viewCopy = payload.view;
      expect(bufferCopy.buffer.byteLength).toBe(4);
      expect(bufferCopy.byteOffset).toBe(0);
      expect(viewCopy.buffer.byteLength).toBe(4);
      expect(viewCopy.byteOffset).toBe(0);
      new Uint8Array(bufferCopy.buffer).fill(9);
      new Uint8Array(viewCopy.buffer).fill(9);
    }
    const after = await f.execute((svc) => readRow(svc));
    expect([...after.payload.bytes]).toEqual([3, 3, 3, 3]);
    expect([...after.payload.view]).toEqual([1, 2]);
    expect([...bytes]).toEqual([3, 3, 3, 3]);
    expect([...view]).toEqual([1, 2]);
  });
});

const unsupportedCases = [
  { name: 'function', create: () => () => undefined },
  { name: 'symbol value', create: () => Symbol('data') },
  { name: 'symbol key', create: () => ({ [Symbol('data')]: 'value' }) },
  {
    name: 'class instance',
    create: () =>
      new (class BusinessRecord {
        value = 1;
      })(),
  },
  { name: 'Mongoose ObjectId', create: () => new mongoose.Types.ObjectId() },
  { name: 'Date subclass', create: () => new (class BusinessDate extends Date {})() },
  { name: 'Array subclass', create: () => new (class BusinessArray extends Array {})() },
  { name: 'custom native property', create: () => Object.assign(new Date(1), { metadata: { value: 1 } }) },
  { name: 'WeakMap', create: () => new WeakMap() },
  { name: 'WeakSet', create: () => new WeakSet() },
  { name: 'Promise', create: () => Promise.resolve(1) },
  { name: 'Proxy', create: () => new Proxy({ value: 1 }, {}) },
  {
    name: 'object cycle',
    create: () => {
      const value: Record<string, unknown> = {};
      value.self = value;
      return value;
    },
  },
  {
    name: 'array cycle',
    create: () => {
      const value: unknown[] = [];
      value.push(value);
      return value;
    },
  },
  {
    name: 'Map cycle',
    create: () => {
      const value = new Map();
      value.set('self', value);
      return value;
    },
  },
  {
    name: 'Set cycle',
    create: () => {
      const value = new Set();
      value.add(value);
      return value;
    },
  },
  { name: 'shared buffer', create: () => new SharedArrayBuffer(4) },
  { name: 'shared buffer view', create: () => new Uint8Array(new SharedArrayBuffer(4)) },
  { name: 'resizable buffer', create: () => new ArrayBuffer(4, { maxByteLength: 8 }) },
  { name: 'resizable buffer view', create: () => new DataView(new ArrayBuffer(4, { maxByteLength: 8 })) },
  {
    name: 'detached buffer',
    create: () => {
      const value = new ArrayBuffer(4);
      structuredClone(value, { transfer: [value] });
      return value;
    },
  },
];

describe('ARL-05 data admission and replacement', () => {
  it.each(unsupportedCases)('rejects $name data atomically with a useful path', ({ create }) => {
    const f = fixture([makeRow(new Date(123456))]);
    const before = f.runtime.getDataSnapshot(f.name);
    const limit = f.runtime.getDataOption(f.name, 'listHardLimit');
    const error = expect.objectContaining({
      name: 'TypeError',
      message: expect.stringMatching(/Unsupported data value at data\[0\]\.payload/),
    });
    expect(() =>
      f.runtime.setDataOptions(f.name, { listHardLimit: 1, data: [{ id: 'bad', payload: create() }] }),
    ).toThrowError(error);
    expect(f.runtime.getDataSnapshot(f.name)).toBe(before);
    expect(f.runtime.getDataOption(f.name, 'listHardLimit')).toBe(limit);
    expect(() => f.runtime.setDataOption(f.name, 'data.0.payload' as never, create() as never)).toThrowError(error);
    expect(f.runtime.getDataSnapshot(f.name)).toBe(before);
  });

  it.each([null, {}, 'records', new Set()])(
    'rejects non-array datasets (%s) and accepts undefined to clear',
    async (invalid) => {
      const f = fixture([makeRow(new Date(1))]);
      const before = f.runtime.getDataSnapshot(f.name);
      expect(() => f.router.data(invalid as never)).toThrowError(/Unsupported data value at data/);
      expect(f.runtime.getDataSnapshot(f.name)).toBe(before);
      f.router.setOption('data', undefined);
      expect(f.runtime.getDataSnapshot(f.name)).toEqual([]);
      expect(await f.execute((svc) => svc.find({}))).toMatchObject({ success: true, data: [], totalCount: 0 });
    },
  );

  it('uses copy-on-write for array-index data setters, retains siblings, and owns replacement natives', async () => {
    const f = fixture([makeRow(new Date(1)), makeRow(new Date(2), 'two')]);
    const before = f.runtime.getDataSnapshot<Row>(f.name);
    const next = { value: new Date(3) };
    f.router.data('0.payload.entries.0', next);
    next.value.setTime(99);
    const after = f.runtime.getDataSnapshot<Row>(f.name);
    expect(after).toHaveLength(2);
    expect((leaf(before[0]) as Date).getTime()).toBe(1);
    expect((leaf(after[0]) as Date).getTime()).toBe(3);
    expect((leaf(after[1]) as Date).getTime()).toBe(2);
    expect((leaf(f.router.options.data![0]) as Date).getTime()).toBe(1);
    expect((leaf(await f.execute((svc) => readRow(svc))) as Date).getTime()).toBe(3);
  });

  it('protects bootstrap snapshots and validates restored data through the same ingress', async () => {
    const f = fixture([makeRow(new Date(1))]);
    const snapshot = f.runtime.createBootstrapSnapshot();
    (leaf(snapshot.dataOptions[f.name].data![0] as Row) as Date).setTime(99);
    f.router.data([makeRow(new Date(2))]);
    f.runtime.restoreBootstrapSnapshot(snapshot);
    expect((leaf(await f.execute((svc) => readRow(svc))) as Date).getTime()).toBe(1);

    const unowned = [makeRow(new Date(3))];
    snapshot.dataOptions[f.name].data = unowned;
    f.runtime.restoreBootstrapSnapshot(snapshot);
    (leaf(unowned[0]) as Date).setTime(99);
    expect((leaf(await f.execute((svc) => readRow(svc))) as Date).getTime()).toBe(3);
    const before = f.runtime.getDataSnapshot(f.name);
    snapshot.dataOptions[f.name].data = [makeRow(new WeakMap())];
    expect(() => f.runtime.restoreBootstrapSnapshot(snapshot)).toThrowError(/Unsupported data value at data\[0\]/);
    expect(f.runtime.getDataSnapshot(f.name)).toBe(before);
  });

  it('retains hook, model, validator and runtime-handle identities outside data', () => {
    const f = fixture([makeRow(new Date(1))]);
    const hook = vi.fn((doc) => doc);
    const handle = new (class RuntimeHandle {})();
    const model = mongoose.model(`Arl05Identity${sequence}`, new mongoose.Schema({ name: String }));
    try {
      f.runtime.setDataOptions(f.name, { decorate: hook, requestSchemas: { advancedList: handle } as never });
      f.runtime.setDataOption(f.name, 'handle' as never, handle as never);
      f.runtime.setGlobalOption('logger', handle as never);
      f.runtime.registerModelInstance(model.modelName, model);
      expect(f.runtime.getDataOption(f.name, 'decorate')).toBe(hook);
      expect(f.runtime.getDataOption(f.name, 'requestSchemas.advancedList')).toBe(handle);
      expect(f.runtime.getDataOption(f.name, 'handle')).toBe(handle);
      expect(f.runtime.getGlobalOption('logger')).toBe(handle);
      expect(f.runtime.getModelInstance(model.modelName)).toBe(model);
    } finally {
      mongoose.deleteModel(model.modelName);
    }
  });
});

type MixedRow = { id: string; payload: { label: string; entries: Array<Record<string, unknown>> }; summary?: unknown };
const mixedRow = (id = 'one'): MixedRow => ({
  id,
  payload: { label: 'stored', entries: [Object.fromEntries(valueCases.map((test) => [test.name, test.create()]))] },
});
const observeMixed = (row: MixedRow) => ({
  label: row.payload.label,
  entries: row.payload.entries.length,
  leaves: Object.fromEntries(valueCases.map((test) => [test.name, test.observe(row.payload.entries[0][test.name])])),
});
const mutateMixed = (row: MixedRow) => {
  for (const test of valueCases) test.mutate(row.payload.entries[0][test.name]);
  row.payload.label = 'changed';
  row.payload.entries.push({ added: true });
};

describe('ARL-05 response decoration and concurrent versions', () => {
  it.each(valueCases.filter((test) => test.native))(
    'native-only $name decoration cannot change subsequent reads',
    async (test) => {
      const f = fixture([makeRow(test.create())]);
      const expected = test.observe(test.create());
      f.router.decorate((raw) => {
        const row = raw as Row;
        const before = test.observe(leaf(row));
        test.mutate(leaf(row));
        return { id: row.id, before };
      });
      for (let i = 0; i < 2; i += 1) {
        const response = await request(f.app).get('/data/one').expect(200);
        expect(response.body.before).toEqual(expected);
      }
      expect(test.observe(leaf(await f.execute((svc) => readRow(svc))))).toEqual(expected);
    },
  );

  it('a decorator that rejects after native mutation leaves the next reader intact', async () => {
    const f = fixture([makeRow(new Date(123456))]);
    f.router.decorate((raw) => {
      (leaf(raw as Row) as Date).setTime(999999);
      throw new Error('intentional decorator rejection');
    });
    await request(f.app).get('/data/one').expect(500);
    expect((leaf(await f.execute((svc) => readRow(svc))) as Date).getTime()).toBe(123456);
  });

  it.each([
    'basic list',
    'advanced list',
    'basic read',
    'advanced read',
    'filter read',
    'root list',
    'root read',
    'root filter read',
  ])('supports in-place nested/native decorators through %s without changing later readers', async (entry) => {
    const f = fixture([mixedRow()]);
    const expected = observeMixed(mixedRow());
    const before: unknown[] = [];
    const after: unknown[] = [];
    const retained: MixedRow[] = [];
    let allCalls = 0;
    f.router.decorate((raw, _permissions, context) => {
      const doc = raw as MixedRow;
      before.push(observeMixed(doc));
      mutateMixed(doc);
      after.push(observeMixed(doc));
      retained.push(doc);
      return context.operation === 'list' ? doc : { id: doc.id, decorated: true };
    });
    f.router.decorateAll((raw) => {
      allCalls += 1;
      for (const doc of raw as MixedRow[]) {
        // Exercise native mutators and nested array writes in the all-rows hook too.
        mutateMixed(doc);
      }
      return raw.map((doc) => ({ id: (doc as MixedRow).id, decorated: true }));
    });
    const send = () => {
      switch (entry) {
        case 'basic list':
          return request(f.app).get('/data?limit=1');
        case 'advanced list':
          return request(f.app).post('/data/__query').send({ limit: 1 });
        case 'basic read':
          return request(f.app).get('/data/one');
        case 'advanced read':
          return request(f.app).post('/data/__query/one').send({});
        case 'filter read':
          return request(f.app)
            .post('/data/__query/__filter')
            .send({ filter: { id: 'one' } });
        case 'root list':
          return request(f.app)
            .post('/root')
            .send([{ target: 'data', name: f.name, op: 'list', args: { limit: 1 } }]);
        case 'root read':
          return request(f.app)
            .post('/root')
            .send([{ target: 'data', name: f.name, op: 'read', id: 'one' }]);
        default:
          return request(f.app)
            .post('/root')
            .send([{ target: 'data', name: f.name, op: 'read', filter: { id: 'one' } }]);
      }
    };
    for (let i = 0; i < 2; i += 1) {
      const response = await send().expect(200);
      if (entry.startsWith('root')) expect(response.body[0]).toMatchObject({ statusCode: 200 });
    }
    expect(before).toEqual([expected, expected]);
    expect(after).toHaveLength(2);
    expect(after[0]).not.toEqual(expected);
    expect(allCalls).toBe(entry.includes('list') ? 2 : 0);
    mutateMixed(retained[0]);
    expect(observeMixed(await f.execute((svc) => readRow(svc)))).toEqual(expected);
  });

  it('keeps two held readers on the old native/plain version while replacement readers use the new one', async () => {
    const original = [mixedRow()];
    const f = fixture(original);
    const expected = observeMixed(mixedRow());
    const captured = [Promise.withResolvers<void>(), Promise.withResolvers<void>()];
    const release = Promise.withResolvers<void>();
    const oldReads = captured.map((barrier) =>
      f.execute(async (svc) => {
        barrier.resolve();
        await release.promise;
        return readRow(svc);
      }),
    );
    try {
      await Promise.all(captured.map((barrier) => barrier.promise));
      const replacement = [mixedRow('replacement')];
      replacement[0].payload.label = 'replacement';
      f.router.data(replacement);
      mutateMixed(original[0]);
      mutateMixed(replacement[0]);
      const current = await f.execute((svc) => readRow(svc));
      expect(current.id).toBe('replacement');
      expect(observeMixed(current)).toEqual({ ...expected, label: 'replacement' });
    } finally {
      release.resolve();
    }
    const [first, second] = await Promise.all(oldReads);
    expect(observeMixed(first)).toEqual(expected);
    expect(observeMixed(second)).toEqual(expected);
    mutateMixed(first);
    expect(observeMixed(second)).toEqual(expected);
    expect((await f.execute((svc) => readRow(svc))).payload.label).toBe('replacement');
  });
});

describe('ARL-05 selected/page-only copy work', () => {
  it('copies only selected output values and returned rows, including natives, with zero copies for misses/denials', async () => {
    const count = 2000;
    const payload = (row: number, field: string) => ({
      copyTag: `${field}:${row}`,
      nested: { value: row },
      map: new Map<string, unknown>([
        ['arl05-copy', `${field}:${row}`],
        ['value', { labels: ['stored'] }],
      ]),
    });
    const dataset = Array.from({ length: count }, (_, row) => ({
      id: `row-${row}`,
      rank: row,
      selected: payload(row, 'selected'),
      omitted: payload(row, 'omitted'),
      denied: payload(row, 'denied'),
    }));
    const f = fixture(dataset, {
      permissionSchema: { id: true, rank: true, selected: true, omitted: true, denied: false },
    });
    const mapCopies: string[] = [];
    const plainCopies: string[] = [];
    const mapEntries = Map.prototype.entries;
    const objectKeys = Object.keys;
    vi.spyOn(Map.prototype, 'entries').mockImplementation(function (this: Map<unknown, unknown>) {
      const marker = Map.prototype.get.call(this, 'arl05-copy');
      if (typeof marker === 'string') mapCopies.push(marker);
      return mapEntries.call(this);
    });
    vi.spyOn(Object, 'keys').mockImplementation((value) => {
      const marker = Object.getOwnPropertyDescriptor(value, 'copyTag')?.value;
      if (typeof marker === 'string') plainCopies.push(marker);
      return objectKeys(value);
    });
    const snapshot = f.runtime.getDataSnapshot(f.name);
    expect(f.runtime.getDataSnapshot(f.name)).toBe(snapshot);
    expect(f.runtime.getDataOptions(f.name).data).toBe(snapshot);
    f.router.listHardLimit(100);
    expect(mapCopies).toEqual([]);
    expect(plainCopies).toEqual([]);

    await f.execute(async (svc) => {
      const trims = vi.spyOn(svc, 'trimOutputFields');
      for (const pageSize of [1, 7, 19]) {
        mapCopies.length = 0;
        plainCopies.length = 0;
        trims.mockClear();
        const result = await svc.find({}, { select: ['selected'], sort: '-rank', skip: 3, limit: pageSize });
        expect(result).toMatchObject({ success: true, count: pageSize, totalCount: count });
        if (!result.success) throw new Error('Expected selected page');
        const expected = Array.from({ length: pageSize }, (_, i) => `selected:${count - 4 - i}`);
        expect(result.data.map((row) => (row as (typeof dataset)[number]).selected.copyTag)).toEqual(expected);
        expect(result.data.every((row) => Object.keys(row).join() === 'selected')).toBe(true);
        expect(trims).toHaveBeenCalledTimes(pageSize);
        expect(mapCopies).toEqual(expected);
        expect(plainCopies).toEqual(expected);
        console.info(
          `[ARL-05] dataset=${count} page=${pageSize} trim=${trims.mock.calls.length} plainCopies=${plainCopies.length} mapCopies=${mapCopies.length} omittedCopies=0 deniedCopies=0`,
        );
      }
      for (const method of methods) {
        mapCopies.length = 0;
        plainCopies.length = 0;
        const result =
          method === 'findById'
            ? await svc.findById('row-0', { select: ['selected'] })
            : method === 'findOne'
              ? await svc.findOne({ id: 'row-0' }, { select: ['selected'] })
              : await svc.find({ id: 'row-0' }, { select: ['selected'], limit: 1 });
        expect(result.success).toBe(true);
        expect(mapCopies).toEqual(['selected:0']);
        expect(plainCopies).toEqual(['selected:0']);
      }
      mapCopies.length = 0;
      plainCopies.length = 0;
      expect(await svc.findOne({ id: 'absent' })).toMatchObject({ success: false, code: 'not_found' });
      expect(await svc.find({ rank: -1 })).toMatchObject({ success: true, data: [] });
      expect(await svc.find({}, { sort: 'denied' })).toMatchObject({ success: false, code: 'bad_request' });
      expect(await svc.find(false)).toMatchObject({ success: false, code: 'forbidden' });
      expect(mapCopies).toEqual([]);
      expect(plainCopies).toEqual([]);
    });
  });
});
