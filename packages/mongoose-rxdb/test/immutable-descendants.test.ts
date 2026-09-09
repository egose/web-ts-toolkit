import { describe, expect, it } from 'vitest';
import { Document, Query, Schema } from '../src/index';
import { WriteNormalizationError } from '../src/converter';
import { FakePersistenceAdapter } from './support/fake-adapter';

function makeSchema() {
  const profileSchema = new Schema({
    score: Number,
    code: { type: String, immutable: true },
  });
  const itemSchema = new Schema({
    n: Number,
    code: { type: String, immutable: true },
  });
  return new Schema({
    name: String,
    slug: { type: String, immutable: true },
    profile: profileSchema,
    items: [itemSchema],
  });
}

function seedDoc() {
  return {
    _id: 'imm-1',
    name: 'Ada',
    slug: 'ada',
    profile: { score: 1, code: 'p1' },
    items: [
      { n: 1, code: 'i1' },
      { n: 2, code: 'i2' },
    ],
  };
}

function makeModel(adapter: FakePersistenceAdapter, schema = makeSchema()) {
  return {
    modelName: 'ImmutableHarness',
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

async function loadDoc(model: any, adapter: FakePersistenceAdapter) {
  return new Query<any | null, any>(model, model.schema, adapter)
    .where({ _id: 'imm-1' } as any)
    .setOp('findOne')
    .exec();
}

describe('BMRX-09 immutable descendants on existing-record writes', () => {
  it('rejects direct top-level and nested immutable $set with bytes unchanged', async () => {
    const adapter = new FakePersistenceAdapter([seedDoc()]);
    const model = makeModel(adapter);
    const before = adapter.snapshot();

    await expect(
      new Query(model, model.schema, adapter)
        .where({ _id: 'imm-1' } as any)
        .setOp('updateOne')
        .setUpdate({ $set: { slug: 'changed' } } as any)
        .exec(),
    ).rejects.toBeInstanceOf(WriteNormalizationError);

    await expect(
      new Query(model, model.schema, adapter)
        .where({ _id: 'imm-1' } as any)
        .setOp('updateOne')
        .setUpdate({ $set: { 'profile.code': 'hacked' } } as any)
        .exec(),
    ).rejects.toBeInstanceOf(WriteNormalizationError);

    expect(adapter.snapshot()).toEqual(before);
  });

  it('rejects parent $set/$unset that alter or remove immutable children, but allows sibling changes', async () => {
    const adapter = new FakePersistenceAdapter([seedDoc()]);
    const model = makeModel(adapter);
    const before = adapter.snapshot();

    await expect(
      new Query(model, model.schema, adapter)
        .where({ _id: 'imm-1' } as any)
        .setOp('updateOne')
        .setUpdate({ $set: { profile: { score: 9, code: 'hacked' } } } as any)
        .exec(),
    ).rejects.toBeInstanceOf(WriteNormalizationError);
    expect(adapter.snapshot()).toEqual(before);

    await expect(
      new Query(model, model.schema, adapter)
        .where({ _id: 'imm-1' } as any)
        .setOp('updateOne')
        .setUpdate({ $unset: { profile: true } } as any)
        .exec(),
    ).rejects.toBeInstanceOf(WriteNormalizationError);
    expect(adapter.snapshot()).toEqual(before);

    await new Query(model, model.schema, adapter)
      .where({ _id: 'imm-1' } as any)
      .setOp('updateOne')
      .setUpdate({ $set: { profile: { score: 9, code: 'p1' } } } as any)
      .exec();
    expect(adapter.snapshot().find((doc) => doc._id === 'imm-1')).toMatchObject({
      profile: { score: 9, code: 'p1' },
    });
  });

  it('rejects plain (replacement-style) updates that change immutable values with bytes unchanged', async () => {
    const adapter = new FakePersistenceAdapter([seedDoc()]);
    const model = makeModel(adapter);
    const before = adapter.snapshot();

    await expect(
      new Query(model, model.schema, adapter)
        .where({ _id: 'imm-1' } as any)
        .setOp('updateOne')
        .setUpdate({ slug: 'changed' } as any)
        .exec(),
    ).rejects.toBeInstanceOf(WriteNormalizationError);
    expect(adapter.snapshot()).toEqual(before);

    await expect(
      new Query(model, model.schema, adapter)
        .where({ _id: 'imm-1' } as any)
        .setOp('updateOne')
        .setUpdate({ profile: { score: 2, code: 'hacked' } } as any)
        .exec(),
    ).rejects.toBeInstanceOf(WriteNormalizationError);
    expect(adapter.snapshot()).toEqual(before);

    await new Query(model, model.schema, adapter)
      .where({ _id: 'imm-1' } as any)
      .setOp('updateOne')
      .setUpdate({ name: 'Grace' } as any)
      .exec();
    expect(adapter.snapshot().find((doc) => doc._id === 'imm-1')).toMatchObject({ name: 'Grace', slug: 'ada' });
  });

  it('rejects loaded-document saves that change immutable values and keeps saves retryable for siblings', async () => {
    const adapter = new FakePersistenceAdapter([seedDoc()]);
    const model = makeModel(adapter);
    const before = adapter.snapshot();

    const direct = await loadDoc(model, adapter);
    direct.set('slug', 'changed');
    await expect(direct.save()).rejects.toBeInstanceOf(WriteNormalizationError);
    expect(adapter.snapshot()).toEqual(before);

    const nested = await loadDoc(model, adapter);
    nested.set('profile.code', 'hacked');
    await expect(nested.save()).rejects.toBeInstanceOf(WriteNormalizationError);
    expect(adapter.snapshot()).toEqual(before);

    const parent = await loadDoc(model, adapter);
    parent.set('profile', { score: 5, code: 'hacked' });
    await expect(parent.save()).rejects.toBeInstanceOf(WriteNormalizationError);
    expect(adapter.snapshot()).toEqual(before);

    const sibling = await loadDoc(model, adapter);
    sibling.set('profile', { score: 5, code: 'p1' });
    await sibling.save();
    expect(adapter.snapshot().find((doc) => doc._id === 'imm-1')).toMatchObject({
      profile: { score: 5, code: 'p1' },
    });
  });

  it('enforces immutable descendants inside subdocument arrays while allowing sibling edits and appends', async () => {
    const adapter = new FakePersistenceAdapter([seedDoc()]);
    const model = makeModel(adapter);
    const before = adapter.snapshot();

    await expect(
      new Query(model, model.schema, adapter)
        .where({ _id: 'imm-1' } as any)
        .setOp('updateOne')
        .setUpdate({
          $set: {
            items: [
              { n: 1, code: 'hacked' },
              { n: 2, code: 'i2' },
            ],
          },
        } as any)
        .exec(),
    ).rejects.toBeInstanceOf(WriteNormalizationError);
    expect(adapter.snapshot()).toEqual(before);

    await expect(
      new Query(model, model.schema, adapter)
        .where({ _id: 'imm-1' } as any)
        .setOp('updateOne')
        .setUpdate({ $set: { items: [{ n: 1, code: 'i1' }] } } as any)
        .exec(),
    ).rejects.toBeInstanceOf(WriteNormalizationError);
    expect(adapter.snapshot()).toEqual(before);

    await new Query(model, model.schema, adapter)
      .where({ _id: 'imm-1' } as any)
      .setOp('updateOne')
      .setUpdate({
        $set: {
          items: [
            { n: 10, code: 'i1' },
            { n: 2, code: 'i2' },
          ],
        },
      } as any)
      .exec();
    expect(adapter.snapshot().find((doc) => doc._id === 'imm-1')).toMatchObject({
      items: [
        { n: 10, code: 'i1' },
        { n: 2, code: 'i2' },
      ],
    });

    await new Query(model, model.schema, adapter)
      .where({ _id: 'imm-1' } as any)
      .setOp('updateOne')
      .setUpdate({ $push: { items: { n: 3, code: 'i3' } } } as any)
      .exec();
    expect(adapter.snapshot().find((doc) => doc._id === 'imm-1')).toMatchObject({
      items: [
        { n: 10, code: 'i1' },
        { n: 2, code: 'i2' },
        { n: 3, code: 'i3' },
      ],
    });
  });

  it('preserves immutable initialization on inserts and upsert-inserts while rejecting upsert-updates', async () => {
    const adapter = new FakePersistenceAdapter([seedDoc()]);
    const model = makeModel(adapter);

    const created = new Document(
      { name: 'Grace', slug: 'grace', profile: { score: 1, code: 'g1' } },
      model.schema,
      model,
    );
    await created.save();
    expect(adapter.snapshot().find((doc) => doc.slug === 'grace')).toMatchObject({
      profile: { score: 1, code: 'g1' },
    });

    const upserted = await withQueryOptions(
      new Query(model, model.schema, adapter)
        .where({ name: 'Inserted' } as any)
        .setOp('findOneAndUpdate')
        .setUpdate({ $set: { name: 'Inserted', slug: 'inserted', profile: { score: 1, code: 'n1' } } } as any),
      { upsert: true },
    ).exec();
    expect(upserted).toBeNull();
    expect(adapter.calls.insert.at(-1)).toMatchObject({ slug: 'inserted', profile: { score: 1, code: 'n1' } });

    const before = adapter.snapshot();
    await expect(
      withQueryOptions(
        new Query(model, model.schema, adapter)
          .where({ _id: 'imm-1' } as any)
          .setOp('updateOne')
          .setUpdate({ $set: { slug: 'changed' } } as any),
        { upsert: true },
      ).exec(),
    ).rejects.toBeInstanceOf(WriteNormalizationError);
    expect(adapter.snapshot()).toEqual(before);
  });
});
