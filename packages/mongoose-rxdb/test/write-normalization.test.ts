import { describe, expect, it } from 'vitest';
import { Document, Query, Schema } from '../src/index';
import { WriteNormalizationError } from '../src/converter';
import { FakePersistenceAdapter } from './support/fake-adapter';

interface WriteDoc {
  name: string;
  age: number;
  active: boolean;
  born: Date;
  tags: string[];
  meta: Record<string, unknown>;
  slug: string;
  profile: { score: number };
}

function makeSchema() {
  return new Schema<WriteDoc>({
    name: String,
    age: Number,
    active: Boolean,
    born: Date,
    tags: [String],
    meta: { type: Object },
    slug: { type: String, immutable: true },
    profile: new Schema({ score: Number }),
  });
}

function makeModel(adapter: FakePersistenceAdapter, schema = makeSchema()) {
  return {
    modelName: 'WriteHarness',
    schema,
    collection: adapter,
    resolveCollection: () => Promise.resolve(adapter),
    mw: { exec: (_op: string, _target: unknown, next: () => unknown) => next() },
  };
}

function withQueryOptions<T extends Query>(query: T, options: Record<string, unknown>): T {
  Object.assign((query as any).options, options);
  return query;
}

describe('MRX-05 schema-aware write normalization', () => {
  it('persists create, save, update, and upsert through the same storage normalization', async () => {
    const adapter = new FakePersistenceAdapter([
      {
        _id: 'existing',
        name: 'Ada',
        age: 1,
        active: false,
        born: '2000-01-01T00:00:00.000Z',
        tags: [],
        meta: {},
        slug: 'ada',
        profile: { score: 1 },
      },
    ]);
    const model = makeModel(adapter);

    const created = new Document<WriteDoc>(
      {
        name: 'Grace',
        age: '2' as any,
        active: 'true' as any,
        born: new Date('2001-02-03T04:05:06.000Z'),
        tags: [1] as any,
        meta: { safe: true },
        slug: 'grace',
        profile: { score: '3' as any },
      },
      model.schema,
      model,
    );
    await created.save();
    expect(adapter.calls.insert[0]).toMatchObject({
      age: 2,
      active: true,
      born: '2001-02-03T04:05:06.000Z',
      tags: ['1'],
      profile: { score: 3 },
    });

    const loaded = await new Query<any | null, WriteDoc>(model, model.schema, adapter)
      .where({ _id: 'existing' } as any)
      .setOp('findOne')
      .exec();
    expect(loaded.born).toBeInstanceOf(Date);
    loaded.age = '4' as any;
    loaded.born = new Date('2002-02-02T00:00:00.000Z') as any;
    await loaded.save();
    expect(adapter.calls.incrementalModify).toHaveLength(1);
    expect(adapter.snapshot().find((doc) => doc._id === 'existing')).toMatchObject({
      age: 4,
      born: '2002-02-02T00:00:00.000Z',
    });

    await new Query(model, model.schema, adapter)
      .where({ _id: 'existing' } as any)
      .setOp('updateOne')
      .setUpdate({
        $set: { age: '5' as any, active: 'true' as any, born: new Date('2003-03-03T00:00:00.000Z') },
        $push: { tags: 9 },
      })
      .exec();
    expect(adapter.snapshot().find((doc) => doc._id === 'existing')).toMatchObject({
      age: 5,
      active: true,
      born: '2003-03-03T00:00:00.000Z',
      tags: ['9'],
    });

    const upserted = await withQueryOptions(
      new Query(model, model.schema, adapter)
        .where({ name: 'Upserted' } as any)
        .setOp('findOneAndUpdate')
        .setUpdate({ $set: { name: 'Upserted', age: '6' as any, born: new Date('2004-04-04T00:00:00.000Z') } }),
      { upsert: true },
    ).exec();
    expect(upserted).toBeNull();

    await withQueryOptions(
      new Query(model, model.schema, adapter)
        .where({ name: 'Missing' } as any)
        .setOp('findOneAndUpdate')
        .setUpdate({ $set: { name: 'Inserted', age: '7' as any, born: new Date('2005-05-05T00:00:00.000Z') } }),
      { upsert: true },
    ).exec();
    const inserted = adapter.calls.insert.at(-1)!;
    expect(inserted._id).toEqual(expect.any(String));
    expect(inserted).toMatchObject({ name: 'Inserted', age: 7, born: '2005-05-05T00:00:00.000Z' });
  });

  it('applies dotted paths structurally and rejects dangerous dotted segments', async () => {
    const adapter = new FakePersistenceAdapter([
      {
        _id: 'nested',
        name: 'Nested',
        age: 1,
        active: false,
        born: '2000-01-01T00:00:00.000Z',
        tags: [],
        meta: {},
        slug: 'nested',
        profile: { score: 1 },
      },
    ]);
    const model = makeModel(adapter);

    await new Query(model, model.schema, adapter)
      .where({ _id: 'nested' } as any)
      .setOp('updateOne')
      .setUpdate({ $set: { 'profile.score': '42', 'meta.deep.value': 'ok' } } as any)
      .exec();

    const next = adapter.snapshot().find((doc) => doc._id === 'nested')!;
    expect(next.profile.score).toBe(42);
    expect(next.meta.deep.value).toBe('ok');
    expect(next['profile.score']).toBeUndefined();

    await expect(
      new Query(model, model.schema, adapter)
        .where({ _id: 'nested' } as any)
        .setOp('updateOne')
        .setUpdate(JSON.parse('{"$set":{"meta.__proto__.polluted":true}}'))
        .exec(),
    ).rejects.toBeInstanceOf(WriteNormalizationError);
    expect(({} as any).polluted).toBeUndefined();
  });

  it('rejects invalid update operands, protected paths, and unknown operators before adapter mutation', async () => {
    const adapter = new FakePersistenceAdapter([
      {
        _id: 'guarded',
        name: 'Guarded',
        age: 1,
        active: false,
        born: '2000-01-01T00:00:00.000Z',
        tags: [],
        meta: {},
        slug: 'guarded',
        profile: { score: 1 },
      },
    ]);
    const model = makeModel(adapter);

    const badUpdates = [
      { $set: { age: 'not-a-number' } },
      { $inc: { name: 1 } },
      { $push: { age: 1 } },
      { $set: { _id: 'changed' } },
      { $set: { slug: 'changed' } },
      { $set: { _rev: '1-x' } },
      { $set: { _meta: {} } },
      { $set: { _attachments: {} } },
      { $set: { _deleted: true } },
      { $rename: { name: 'other' } },
    ];

    for (const update of badUpdates) {
      await expect(
        new Query(model, model.schema, adapter)
          .where({ _id: 'guarded' } as any)
          .setOp('updateOne')
          .setUpdate(update as any)
          .exec(),
      ).rejects.toBeInstanceOf(WriteNormalizationError);
    }
    expect(adapter.calls.updateOne).toHaveLength(0);
  });

  it('validates the normalized persisted value before adapter mutation', async () => {
    const schema = new Schema<WriteDoc>({
      name: String,
      age: { type: Number, max: 10 },
      active: Boolean,
      born: Date,
      tags: [String],
      meta: { type: Object },
      slug: String,
      profile: new Schema({ score: Number }),
    });
    const adapter = new FakePersistenceAdapter([
      {
        _id: 'validated',
        name: 'Validated',
        age: 1,
        active: false,
        born: '2000-01-01T00:00:00.000Z',
        tags: [],
        meta: {},
        slug: 'validated',
        profile: { score: 1 },
      },
    ]);
    const model = makeModel(adapter, schema);

    const before = adapter.calls.updateOne.length;
    await expect(
      withQueryOptions(
        new Query(model, schema, adapter)
          .where({ _id: 'validated' } as any)
          .setOp('updateOne')
          .setUpdate({ $set: { age: '15' as any } }),
        { runValidators: true },
      ).exec(),
    ).rejects.toThrow('must be <= 10');
    expect(adapter.calls.updateOne).toHaveLength(before + 1);
    expect(adapter.snapshot().find((doc) => doc._id === 'validated')?.age).toBe(1);
  });
});
