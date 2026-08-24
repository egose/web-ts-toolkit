import { afterEach, describe, expect, it } from 'vitest';
import { BulkWritePartialFailureError, Document, Query, Schema } from '../src/index';
import { MutationPartialFailureError } from '../src/rx-adapter';
import { compileQuery } from '../src/query-compiler';
import { createBarrier } from './support/async';
import { FakePersistenceAdapter } from './support/fake-adapter';

interface UserDoc {
  name: string;
  age: number;
  count: number;
}

function createFakeModel(
  adapter: FakePersistenceAdapter,
  schema = new Schema<UserDoc>({ name: String, age: Number, count: Number }),
) {
  return {
    schema,
    collection: adapter,
    resolveCollection: () => Promise.resolve(adapter),
    mw: { exec: (_op: string, _target: unknown, next: () => unknown) => next() },
  };
}

describe('MRX-01 fake persistence adapter harness', () => {
  afterEach(() => {
    expect.hasAssertions();
  });

  it('records exact read, mutation, bulk, count, and hydration spy calls without RxDB imports', async () => {
    const adapter = new FakePersistenceAdapter([{ _id: 'u1', name: 'Ada', age: 36, count: 0 }]);
    const model = createFakeModel(adapter);
    const query = new Query<any[], UserDoc>(model, model.schema, adapter).where({ name: 'Ada' });

    const results = await query.exec();
    for (const result of results) adapter.recordHydration(result.toObject());
    const created = new Document<UserDoc>({ name: 'Grace', age: 37, count: 0 }, model.schema, model);
    await created.save();
    await adapter.count(compileQuery({ age: { $gte: 30 } }));
    await adapter.insertMany([{ _id: 'u3', name: 'Katherine', age: 34, count: 0 }]);
    await adapter.bulkModify([{ id: 'u3', next: { _id: 'u3', name: 'Katherine', age: 35, count: 1 } }]);

    expect(results[0]).toBeInstanceOf(Document);
    expect(adapter.calls.find).toHaveLength(1);
    expect(adapter.calls.find[0].selector).toEqual({ name: { $eq: 'Ada' } });
    expect(adapter.calls.hydrate).toHaveLength(1);
    expect(adapter.calls.insert).toHaveLength(1);
    expect(adapter.calls.count).toHaveLength(1);
    expect(adapter.calls.insertMany).toHaveLength(1);
    expect(adapter.calls.bulkModify).toHaveLength(1);
    expect(adapter.calls.modify).toHaveLength(1);
  });

  it('can pause two mutations after their common read and release them deterministically', async () => {
    const barrier = createBarrier(2);
    const adapter = new FakePersistenceAdapter([{ _id: 'counter', name: 'Counter', age: 0, count: 0 }], {
      onUpdateRecordStart: () => barrier.wait(),
    });
    const model = createFakeModel(adapter);
    const first = new Query(model, model.schema, adapter)
      .where({ _id: 'counter' } as any)
      .setOp('updateOne')
      .setUpdate({ $inc: { count: 1 } });
    const second = new Query(model, model.schema, adapter)
      .where({ _id: 'counter' } as any)
      .setOp('updateOne')
      .setUpdate({ $inc: { count: 1 } });

    const updates = Promise.all([first.exec(), second.exec()]);
    await barrier.allEntered;
    expect(adapter.calls.find).toHaveLength(0);
    expect(adapter.calls.updateOne).toHaveLength(2);
    barrier.release();
    await updates;

    expect(adapter.snapshot()).toHaveLength(1);
  });

  it('uses bounded operation-specific calls for one-document update and delete queries', async () => {
    const adapter = new FakePersistenceAdapter([
      { _id: 'u1', name: 'Ada', age: 36, count: 0 },
      { _id: 'u2', name: 'Ada', age: 37, count: 0 },
    ]);
    const model = createFakeModel(adapter);

    const update = await new Query(model, model.schema, adapter)
      .where({ name: 'Ada' })
      .sort({ age: 1 })
      .setOp('updateOne')
      .setUpdate({ $set: { count: 1 } })
      .exec();
    const deletion = await new Query(model, model.schema, adapter)
      .where({ name: 'Ada' })
      .sort({ age: -1 })
      .setOp('deleteOne')
      .exec();

    expect(update).toEqual({ matchedCount: 1, modifiedCount: 1 });
    expect(deletion).toEqual({ deletedCount: 1 });
    expect(adapter.calls.updateOne).toHaveLength(1);
    expect(adapter.calls.deleteOne).toHaveLength(1);
    expect(adapter.calls.find).toHaveLength(0);
    expect(adapter.calls.findOne).toHaveLength(0);
    expect(adapter.calls.modify).toHaveLength(0);
    expect(adapter.calls.remove).toHaveLength(0);
  });

  it('reports truthful update counts and strips protected fields even if the updater bypasses query helpers', async () => {
    const adapter = new FakePersistenceAdapter([{ _id: 'u1', name: 'Ada', age: 36, count: 0 }]);
    const model = createFakeModel(adapter);

    const noop = await new Query(model, model.schema, adapter)
      .where({ _id: 'u1' } as any)
      .setOp('updateOne')
      .setUpdate({ $set: { count: 0 } })
      .exec();
    await adapter.updateOne(compileQuery({ _id: 'u1' } as any), (doc) => ({
      ...doc,
      _id: 'changed',
      _rev: '1-x',
      _deleted: true,
      count: 2,
    }));

    expect(noop).toEqual({ matchedCount: 1, modifiedCount: 0 });
    expect(adapter.snapshot()[0]).toEqual({ _id: 'u1', name: 'Ada', age: 36, count: 2 });
  });

  it('defines many-document mutations as ordered and non-transactional on partial failure', async () => {
    const adapter = new FakePersistenceAdapter(
      [
        { _id: 'u1', name: 'Ada', age: 36, count: 0 },
        { _id: 'u2', name: 'Grace', age: 37, count: 0 },
        { _id: 'u3', name: 'Katherine', age: 38, count: 0 },
      ],
      { failUpdateIds: new Set(['u2']) },
    );
    const model = createFakeModel(adapter);

    await expect(
      new Query(model, model.schema, adapter)
        .where({ age: { $gte: 36 } })
        .sort({ age: 1 })
        .setOp('updateMany')
        .setUpdate({ $inc: { count: 1 } })
        .exec(),
    ).rejects.toMatchObject({ name: 'MutationPartialFailureError', matchedCount: 1, modifiedCount: 1 });

    const error = await new Query(model, model.schema, adapter)
      .where({ age: { $gte: 36 } })
      .sort({ age: 1 })
      .setOp('updateMany')
      .setUpdate({ $inc: { count: 1 } })
      .exec()
      .catch((err) => err);
    expect(error).toBeInstanceOf(MutationPartialFailureError);
    expect(adapter.snapshot()).toEqual([
      { _id: 'u1', name: 'Ada', age: 36, count: 2 },
      { _id: 'u2', name: 'Grace', age: 37, count: 0 },
      { _id: 'u3', name: 'Katherine', age: 38, count: 0 },
    ]);
    expect(adapter.calls.updateMany).toHaveLength(2);
  });

  it('keeps count and bulk insert call counts bounded for 1, 100, and 1,000 records', async () => {
    for (const size of [1, 100, 1_000]) {
      const adapter = new FakePersistenceAdapter();
      const model = createFakeModel(adapter);
      const docs = Array.from({ length: size }, (_, index) => ({
        _id: `u${index}`,
        name: `User ${index}`,
        age: index,
        count: 0,
      }));

      const inserted = await model.collection.insertMany(docs);
      const count = await new Query<number, UserDoc>(model, model.schema, adapter).setOp('count').exec();

      expect(inserted.insertedCount).toBe(size);
      expect(count).toBe(size);
      expect(adapter.calls.insertMany).toHaveLength(1);
      expect(adapter.calls.insert).toHaveLength(0);
      expect(adapter.calls.count).toHaveLength(1);
      expect(adapter.calls.find).toHaveLength(0);
    }
  });

  it('returns ordered and unordered bulk insertion outcomes on partial failure', async () => {
    const ordered = new FakePersistenceAdapter([{ _id: 'existing', name: 'Existing', age: 1, count: 0 }]);
    const orderedError = await ordered
      .insertMany([
        { _id: 'a', name: 'A', age: 1, count: 0 },
        { _id: 'existing', name: 'Duplicate', age: 2, count: 0 },
        { _id: 'b', name: 'B', age: 3, count: 0 },
      ])
      .catch((error) => error);

    const unordered = new FakePersistenceAdapter([{ _id: 'existing', name: 'Existing', age: 1, count: 0 }]);
    const unorderedError = await unordered
      .insertMany(
        [
          { _id: 'a', name: 'A', age: 1, count: 0 },
          { _id: 'existing', name: 'Duplicate', age: 2, count: 0 },
          { _id: 'b', name: 'B', age: 3, count: 0 },
        ],
        { ordered: false },
      )
      .catch((error) => error);

    expect(orderedError).toBeInstanceOf(BulkWritePartialFailureError);
    expect(orderedError).toMatchObject({ ordered: true, insertedCount: 1, insertedIds: ['a'], errors: [{ index: 1 }] });
    expect(
      ordered
        .snapshot()
        .map((record) => record._id)
        .sort(),
    ).toEqual(['a', 'existing']);
    expect(unorderedError).toBeInstanceOf(BulkWritePartialFailureError);
    expect(unorderedError).toMatchObject({
      ordered: false,
      insertedCount: 2,
      insertedIds: ['a', 'b'],
      errors: [{ index: 1 }],
    });
    expect(
      unordered
        .snapshot()
        .map((record) => record._id)
        .sort(),
    ).toEqual(['a', 'b', 'existing']);
  });

  it('does not expose RxDB metadata through fake adapter records', async () => {
    const adapter = new FakePersistenceAdapter();
    await adapter.insertMany([
      { _id: 'u1', name: 'Ada', age: 36, count: 0, _rev: '1-a', _meta: {}, _attachments: {}, _deleted: false } as any,
    ]);
    const [record] = await adapter.find(compileQuery({ _id: 'u1' } as any));

    expect(record).toEqual({ _id: 'u1', name: 'Ada', age: 36, count: 0 });
    expect(record).not.toHaveProperty('_rev');
    expect(record).not.toHaveProperty('_meta');
    expect(record).not.toHaveProperty('_attachments');
    expect(record).not.toHaveProperty('_deleted');
  });
});
