import { describe, expect, it } from 'vitest';
import { Connection, Query, Schema } from '../src/index';
import { WriteNormalizationError } from '../src/converter';
import { createMemoryDatabase } from '../src/storage/index';
import { FakePersistenceAdapter } from './support/fake-adapter';

function makeSchema() {
  const itemSchema = new Schema({ n: Number, code: String, nested: new Schema({ v: Number }) });
  return new Schema({
    name: String,
    items: [itemSchema],
    tags: [String],
    scores: [Number],
    events: [Date],
    meta: { type: Object },
  });
}

function seedDoc() {
  return {
    _id: 'arr-1',
    name: 'Ada',
    items: [
      { n: 1, code: 'i1', nested: { v: 1 } },
      { n: 2, code: 'i2', nested: { v: 2 } },
    ],
    tags: ['a', 'b'],
    scores: [1, 2],
    events: ['2000-01-01T00:00:00.000Z', '2001-01-01T00:00:00.000Z'],
    meta: {},
  };
}

function makeModel(adapter: FakePersistenceAdapter, schema = makeSchema()) {
  return {
    modelName: 'ArrayBoundaryHarness',
    schema,
    collection: adapter,
    resolveCollection: () => Promise.resolve(adapter),
    mw: { exec: (_op: string, _target: unknown, next: () => unknown) => next() },
  };
}

async function runUpdate(model: any, adapter: FakePersistenceAdapter, update: any) {
  return new Query(model, model.schema, adapter)
    .where({ _id: 'arr-1' } as any)
    .setOp('updateOne')
    .setUpdate(update as any)
    .exec();
}

let unique = 0;
function nextSuffix() {
  unique += 1;
  return `${Date.now()}_${unique}`;
}

describe('BMRX-10 safe array update paths and value equality', () => {
  it('rejects ambiguous non-indexed traversal and never converts arrays to objects', async () => {
    const adapter = new FakePersistenceAdapter([seedDoc()]);
    const model = makeModel(adapter);
    const before = adapter.snapshot();

    for (const update of [
      { $set: { 'items.n': 3 } },
      { $unset: { 'items.n': true } },
      { $inc: { 'items.n': 1 } },
      { $set: { 'tags.value': 'x' } },
      { $set: { 'scores.foo': 1 } },
    ]) {
      await expect(runUpdate(model, adapter, update)).rejects.toBeInstanceOf(WriteNormalizationError);
    }
    const after = adapter.snapshot().find((doc) => doc._id === 'arr-1')!;
    expect(after).toEqual(before.find((doc) => doc._id === 'arr-1'));
    expect(Array.isArray(after.items)).toBe(true);
    expect(Array.isArray(after.tags)).toBe(true);
    expect(Array.isArray(after.scores)).toBe(true);
  });

  it('supports indexed set, unset of subfields, and arithmetic on elements', async () => {
    const adapter = new FakePersistenceAdapter([seedDoc()]);
    const model = makeModel(adapter);

    await runUpdate(model, adapter, { $set: { 'items.0.n': 10 } });
    expect(adapter.snapshot().find((d) => d._id === 'arr-1')!.items).toEqual([
      { n: 10, code: 'i1', nested: { v: 1 } },
      { n: 2, code: 'i2', nested: { v: 2 } },
    ]);

    await runUpdate(model, adapter, { $inc: { 'items.1.n': 5 } });
    expect(adapter.snapshot().find((d) => d._id === 'arr-1')!.items[1].n).toBe(7);

    await runUpdate(model, adapter, { $set: { 'tags.0': 'z' } });
    expect(adapter.snapshot().find((d) => d._id === 'arr-1')!.tags).toEqual(['z', 'b']);

    await runUpdate(model, adapter, { $unset: { 'items.0.nested.v': true } });
    const items = adapter.snapshot().find((d) => d._id === 'arr-1')!.items;
    expect(items[0]).toEqual({ n: 10, code: 'i1', nested: {} });
    expect(Array.isArray(items)).toBe(true);
  });

  it('handles whole-array unset, rejects bare-index unset, and rejects out-of-bounds indexed set', async () => {
    const adapter = new FakePersistenceAdapter([seedDoc()]);
    const model = makeModel(adapter);
    const before = adapter.snapshot();

    await expect(runUpdate(model, adapter, { $unset: { 'tags.0': true } })).rejects.toBeInstanceOf(
      WriteNormalizationError,
    );
    await expect(runUpdate(model, adapter, { $set: { 'items.9.n': 1 } })).rejects.toBeInstanceOf(
      WriteNormalizationError,
    );
    expect(adapter.snapshot()).toEqual(before);

    await runUpdate(model, adapter, { $unset: { tags: true } });
    const after = adapter.snapshot().find((d) => d._id === 'arr-1')!;
    expect(after.tags).toBeUndefined();
  });

  it('deduplicates equal objects on repeated $addToSet including nested objects and dates', async () => {
    const adapter = new FakePersistenceAdapter([seedDoc()]);
    const model = makeModel(adapter);

    const subdoc = { n: 3, code: 'i3', nested: { v: 3 } };
    await runUpdate(model, adapter, { $addToSet: { items: subdoc } });
    await runUpdate(model, adapter, { $addToSet: { items: JSON.parse(JSON.stringify(subdoc)) } });
    const items = adapter.snapshot().find((d) => d._id === 'arr-1')!.items;
    expect(items.filter((e: any) => e.code === 'i3')).toHaveLength(1);

    await runUpdate(model, adapter, { $addToSet: { tags: 'a' } });
    await runUpdate(model, adapter, { $addToSet: { tags: 'c' } });
    await runUpdate(model, adapter, { $addToSet: { tags: 'c' } });
    expect(adapter.snapshot().find((d) => d._id === 'arr-1')!.tags).toEqual(['a', 'b', 'c']);

    const event = new Date('2002-06-01T00:00:00.000Z');
    await runUpdate(model, adapter, { $addToSet: { events: event } });
    await runUpdate(model, adapter, { $addToSet: { events: new Date('2002-06-01T00:00:00.000Z') } });
    expect(adapter.snapshot().find((d) => d._id === 'arr-1')!.events).toHaveLength(3);
  });

  it('removes equal values with $pull for objects, nested objects, and dates', async () => {
    const adapter = new FakePersistenceAdapter([seedDoc()]);
    const model = makeModel(adapter);

    await runUpdate(model, adapter, {
      $pull: { items: { n: 1, code: 'i1', nested: { v: 1 } } },
    });
    expect(adapter.snapshot().find((d) => d._id === 'arr-1')!.items).toEqual([{ n: 2, code: 'i2', nested: { v: 2 } }]);

    await runUpdate(model, adapter, { $pull: { tags: 'a' } });
    expect(adapter.snapshot().find((d) => d._id === 'arr-1')!.tags).toEqual(['b']);

    await runUpdate(model, adapter, { $pull: { events: new Date('2000-01-01T00:00:00.000Z') } });
    expect(adapter.snapshot().find((d) => d._id === 'arr-1')!.events).toEqual(['2001-01-01T00:00:00.000Z']);

    const before = adapter.snapshot();
    await runUpdate(model, adapter, { $pull: { tags: 'missing' } });
    expect(adapter.snapshot()).toEqual(before);
  });

  it('rejects operator forms and object operands on scalar arrays', async () => {
    const adapter = new FakePersistenceAdapter([seedDoc()]);
    const model = makeModel(adapter);
    const before = adapter.snapshot();

    for (const update of [
      { $push: { tags: { $each: ['x'] } } },
      { $addToSet: { tags: { $each: ['x'] } } },
      { $push: { items: { $each: [{ n: 9 }] } } },
      { $push: { tags: { foo: 1 } } },
      { $push: { tags: ['x', 'y'] } },
    ]) {
      await expect(runUpdate(model, adapter, update as any)).rejects.toBeInstanceOf(WriteNormalizationError);
    }
    expect(adapter.snapshot()).toEqual(before);
  });

  it('round-trips indexed updates and set-equality through real memory storage', async () => {
    const conn = new Connection();
    const suffix = nextSuffix();
    await conn.connect(() => createMemoryDatabase({ name: `bmrx10_memory_${suffix}` }));
    try {
      const M = conn.model<any>(`Bmrx10_${suffix}`, makeSchema(), `bmrx10_${suffix}`);
      const created = await M.create({
        name: 'Ada',
        items: [
          { n: 1, code: 'i1', nested: { v: 1 } },
          { n: 2, code: 'i2', nested: { v: 2 } },
        ],
        tags: ['a', 'b'],
        scores: [1, 2],
        events: [new Date('2000-01-01T00:00:00.000Z')],
      } as any);

      await expect(
        M.updateOne({ _id: created._id } as any, { $set: { 'items.n': 3 } } as any).exec(),
      ).rejects.toBeInstanceOf(WriteNormalizationError);
      expect(((await M.findById(created._id))!.toObject() as any).items).toHaveLength(2);

      await M.updateOne({ _id: created._id } as any, { $set: { 'items.0.n': 10 } } as any).exec();
      await M.updateOne({ _id: created._id } as any, { $addToSet: { tags: 'b' } } as any).exec();
      await M.updateOne({ _id: created._id } as any, { $addToSet: { tags: 'c' } } as any).exec();
      await M.updateOne({ _id: created._id } as any, { $addToSet: { tags: 'c' } } as any).exec();
      const sub = { n: 3, code: 'i3', nested: { v: 3 } };
      await M.updateOne({ _id: created._id } as any, { $addToSet: { items: sub } } as any).exec();
      await M.updateOne(
        { _id: created._id } as any,
        { $addToSet: { items: JSON.parse(JSON.stringify(sub)) } } as any,
      ).exec();

      const after = (await M.findById(created._id))!.toObject() as any;
      expect(Array.isArray(after.items)).toBe(true);
      expect(after.items[0].n).toBe(10);
      expect(after.tags).toEqual(['a', 'b', 'c']);
      expect(after.items.filter((e: any) => e.code === 'i3')).toHaveLength(1);

      await M.updateOne({ _id: created._id } as any, { $pull: { tags: 'a' } } as any).exec();
      const pulled = (await M.findById(created._id))!.toObject() as any;
      expect(pulled.tags).toEqual(['b', 'c']);
      expect(Array.isArray(pulled.items)).toBe(true);
    } finally {
      await conn.disconnect();
    }
  });
});
