import { describe, expect, it } from 'vitest';
import { Connection, Query, Schema } from '../src/index';
import { MAX_STORAGE_DEPTH, WriteNormalizationError, normalizeUpdatePlan } from '../src/converter';
import { createMemoryDatabase } from '../src/storage/index';
import { FakePersistenceAdapter } from './support/fake-adapter';

function makeSchema() {
  return new Schema({
    name: String,
    age: Number,
    meta: { type: Object },
    misc: [Object],
    tags: [String],
  });
}

function seedDoc() {
  return {
    _id: 'stor-1',
    name: 'Ada',
    age: 1,
    meta: { ok: true },
    misc: [],
    tags: [],
  };
}

function makeModel(adapter: FakePersistenceAdapter, schema = makeSchema()) {
  return {
    modelName: 'StorageValueHarness',
    schema,
    collection: adapter,
    resolveCollection: () => Promise.resolve(adapter),
    mw: { exec: (_op: string, _target: unknown, next: () => unknown) => next() },
  };
}

async function runUpdate(model: any, adapter: FakePersistenceAdapter, update: any) {
  return new Query(model, model.schema, adapter)
    .where({ _id: 'stor-1' } as any)
    .setOp('updateOne')
    .setUpdate(update as any)
    .exec();
}

function deepNesting(levels: number): any {
  let current: any = { leaf: 'x' };
  for (let i = 0; i < levels; i++) current = { nested: current };
  return current;
}

let unique = 0;
function nextSuffix() {
  unique += 1;
  return `${Date.now()}_${unique}`;
}

describe('BMRX-11 non-JSON storage values and arithmetic overflow', () => {
  it('rejects $inc/$mul overflow before stored data changes', async () => {
    const adapter = new FakePersistenceAdapter([{ ...seedDoc(), age: Number.MAX_VALUE }]);
    const model = makeModel(adapter);
    const before = adapter.snapshot();

    await expect(runUpdate(model, adapter, { $inc: { age: Number.MAX_VALUE } })).rejects.toBeInstanceOf(
      WriteNormalizationError,
    );
    await expect(runUpdate(model, adapter, { $mul: { age: Number.MAX_VALUE } })).rejects.toBeInstanceOf(
      WriteNormalizationError,
    );
    expect(adapter.snapshot()).toEqual(before);

    // Finite arithmetic still works and stays finite.
    const okAdapter = new FakePersistenceAdapter([{ ...seedDoc(), age: 2 }]);
    const okModel = makeModel(okAdapter);
    await runUpdate(okModel, okAdapter, { $inc: { age: 3 } });
    expect(okAdapter.snapshot().find((d) => d._id === 'stor-1')!.age).toBe(5);
    await runUpdate(okModel, okAdapter, { $mul: { age: 2 } });
    expect(okAdapter.snapshot().find((d) => d._id === 'stor-1')!.age).toBe(10);
  });

  it('rejects unsupported root, nested, and array mixed values', async () => {
    const adapter = new FakePersistenceAdapter([seedDoc()]);
    const model = makeModel(adapter);
    const before = adapter.snapshot();

    const badRoots: Array<[string, any]> = [
      ['function', () => undefined],
      ['symbol', Symbol('s')],
      ['bigint', 10n],
      ['non-finite', Infinity],
      ['undefined-nested', { a: undefined }],
      ['date-ok-control-check-later', { a: 1 }],
    ];
    // First five must reject; the last is a valid control asserted separately.
    for (const [label, bad] of badRoots.slice(0, 5)) {
      await expect(runUpdate(model, adapter, { $set: { meta: bad } }), label).rejects.toBeInstanceOf(
        WriteNormalizationError,
      );
    }
    // Nested and array positions.
    await expect(runUpdate(model, adapter, { $set: { meta: { deep: { fn: () => 1 } } } })).rejects.toBeInstanceOf(
      WriteNormalizationError,
    );
    await expect(runUpdate(model, adapter, { $set: { meta: { arr: [1, Symbol('x')] } } })).rejects.toBeInstanceOf(
      WriteNormalizationError,
    );
    await expect(runUpdate(model, adapter, { $push: { misc: 10n as any } })).rejects.toBeInstanceOf(
      WriteNormalizationError,
    );
    await expect(runUpdate(model, adapter, { $addToSet: { misc: { fn: () => 1 } as any } })).rejects.toBeInstanceOf(
      WriteNormalizationError,
    );
    expect(adapter.snapshot()).toEqual(before);

    // Control: plain nested mixed value is accepted.
    await runUpdate(model, adapter, { $set: { meta: { a: 1 } } });
    expect(adapter.snapshot().find((d) => d._id === 'stor-1')!.meta).toEqual({ a: 1 });
  });

  it('rejects cyclic and excessively deep mixed values without hanging', async () => {
    const adapter = new FakePersistenceAdapter([seedDoc()]);
    const model = makeModel(adapter);
    const before = adapter.snapshot();

    const cyclic: any = { a: 1 };
    cyclic.self = cyclic;
    // Builder copy boundaries reject cycles as QueryFilterError before the
    // converter sees them; both are package-owned failures with no mutation.
    await expect(runUpdate(model, adapter, { $set: { meta: cyclic } })).rejects.toThrowError(
      /Cyclic|QueryFilterError|WriteNormalizationError|cyclic/i,
    );
    // Direct normalization proves the converter-owned rejection.
    expect(() => normalizeUpdatePlan({ $set: { meta: cyclic } }, model.schema)).toThrow(WriteNormalizationError);

    const cyclicArr: any[] = [1];
    cyclicArr.push(cyclicArr);
    await expect(runUpdate(model, adapter, { $set: { meta: { arr: cyclicArr } } })).rejects.toThrowError(
      /Cyclic|QueryFilterError|WriteNormalizationError|cyclic/i,
    );
    expect(() => normalizeUpdatePlan({ $set: { meta: { arr: cyclicArr } } }, model.schema)).toThrow(
      WriteNormalizationError,
    );

    // Excessive depth fails with a package-owned error (builder budget or
    // storage depth) before stored data changes.
    await expect(
      runUpdate(model, adapter, { $set: { meta: deepNesting(MAX_STORAGE_DEPTH + 10) } }),
    ).rejects.toThrowError(/depth|budget|nodes|limit|WriteNormalization|QueryFilter/i);
    expect(() => normalizeUpdatePlan({ $set: { meta: deepNesting(MAX_STORAGE_DEPTH + 10) } }, model.schema)).toThrow(
      WriteNormalizationError,
    );
    expect(adapter.snapshot()).toEqual(before);

    // Boundary-depth value is accepted.
    await runUpdate(model, adapter, { $set: { meta: deepNesting(5) } });
    expect(adapter.snapshot().find((d) => d._id === 'stor-1')!.meta).toBeDefined();
  });

  it('treats top-level undefined as absent but rejects nested undefined, and normalizes Date-in-mixed to ISO', async () => {
    const adapter = new FakePersistenceAdapter([seedDoc()]);
    const model = makeModel(adapter);

    // Top-level undefined is omitted, not stored.
    await runUpdate(model, adapter, { $set: { meta: { a: 1 } } });
    const { documentToStorage } = await import('../src/converter');
    const stored = documentToStorage({ name: 'n', age: 1, meta: { a: 1 }, misc: [], tags: [] }, model.schema, {
      applyDefaults: false,
      allowId: false,
    });
    expect(stored).toBeDefined();
    const withUndefined = documentToStorage(
      { name: 'n', age: undefined as any, meta: { a: 1 }, misc: [], tags: [] },
      model.schema,
      { applyDefaults: false, allowId: false },
    );
    expect('age' in withUndefined).toBe(false);

    // Nested undefined is rejected, not silently dropped.
    await expect(runUpdate(model, adapter, { $set: { meta: { a: undefined } as any } })).rejects.toBeInstanceOf(
      WriteNormalizationError,
    );

    // Date-in-mixed normalizes to an ISO string.
    const stamp = new Date('2002-06-01T00:00:00.000Z');
    await runUpdate(model, adapter, { $set: { meta: { at: stamp } as any } });
    expect(adapter.snapshot().find((d) => d._id === 'stor-1')!.meta).toEqual({ at: '2002-06-01T00:00:00.000Z' });
  });

  it('distinguishes schema casts from unsupported mixed values', async () => {
    const adapter = new FakePersistenceAdapter([seedDoc()]);
    const model = makeModel(adapter);

    // Schema cast: number into a string path succeeds via String().
    await runUpdate(model, adapter, { $set: { name: 42 as any } });
    expect(adapter.snapshot().find((d) => d._id === 'stor-1')!.name).toBe('42');

    // Same-kind value in mixed is fine, but function/symbol/bigint are not cast.
    await runUpdate(model, adapter, { $set: { meta: { n: 42 } } });
    expect(adapter.snapshot().find((d) => d._id === 'stor-1')!.meta).toEqual({ n: 42 });
    const before = adapter.snapshot();
    await expect(runUpdate(model, adapter, { $set: { meta: (() => 1) as any } })).rejects.toBeInstanceOf(
      WriteNormalizationError,
    );
    expect(adapter.snapshot()).toEqual(before);
  });

  it('round-trips accepted values consistently through fake and real adapters', async () => {
    const adapter = new FakePersistenceAdapter([seedDoc()]);
    const model = makeModel(adapter);
    const accepted = {
      s: 'hello',
      n: 3.5,
      b: false,
      nil: null,
      nested: { a: [1, 'two', { three: [null, true] }] },
      at: new Date('2003-03-03T00:00:00.000Z'),
    };
    await runUpdate(model, adapter, { $set: { meta: accepted as any } });
    expect(adapter.snapshot().find((d) => d._id === 'stor-1')!.meta).toEqual({
      s: 'hello',
      n: 3.5,
      b: false,
      nil: null,
      nested: { a: [1, 'two', { three: [null, true] }] },
      at: '2003-03-03T00:00:00.000Z',
    });

    const conn = new Connection();
    const suffix = nextSuffix();
    await conn.connect(() => createMemoryDatabase({ name: `bmrx11_memory_${suffix}` }));
    try {
      const M = conn.model<any>(`Bmrx11_${suffix}`, makeSchema(), `bmrx11_${suffix}`);
      const created = (await M.create({
        name: 'Ada',
        age: Number.MAX_VALUE,
        meta: accepted,
        misc: [],
        tags: [],
      } as any)) as any;
      const found = (await M.findById(created._id))!.toObject() as any;
      expect(found.meta).toEqual({
        s: 'hello',
        n: 3.5,
        b: false,
        nil: null,
        nested: { a: [1, 'two', { three: [null, true] }] },
        at: '2003-03-03T00:00:00.000Z',
      });

      await expect(
        M.updateOne({ _id: created._id } as any, { $inc: { age: Number.MAX_VALUE } } as any).exec(),
      ).rejects.toBeInstanceOf(WriteNormalizationError);
      expect(((await M.findById(created._id))!.toObject() as any).age).toBe(Number.MAX_VALUE);

      await expect(
        M.updateOne({ _id: created._id } as any, { $set: { meta: { fn: () => 1 } as any } } as any).exec(),
      ).rejects.toBeInstanceOf(WriteNormalizationError);
      expect(((await M.findById(created._id))!.toObject() as any).meta).toEqual({
        s: 'hello',
        n: 3.5,
        b: false,
        nil: null,
        nested: { a: [1, 'two', { three: [null, true] }] },
        at: '2003-03-03T00:00:00.000Z',
      });
    } finally {
      await conn.disconnect();
    }
  });
});
