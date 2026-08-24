import { describe, expect, it } from 'vitest';
import { Document, Query, Schema } from '../src/index';
import { FakePersistenceAdapter } from './support/fake-adapter';

interface SnapshotDoc {
  name: string;
  tags: string[];
  profile: { score: number; label?: string };
  meta: Record<string, any>;
  seenAt: Date;
}

function makeSchema() {
  return new Schema<SnapshotDoc>({
    name: String,
    tags: [String],
    profile: new Schema({ score: Number, label: String }),
    meta: { type: Object },
    seenAt: Date,
  });
}

function makeModel(adapter: FakePersistenceAdapter, schema = makeSchema()) {
  return {
    modelName: 'SnapshotHarness',
    schema,
    collection: adapter,
    resolveCollection: () => Promise.resolve(adapter),
    mw: { exec: (_op: string, _target: unknown, next: () => unknown) => next() },
  };
}

function seedRecord() {
  return {
    _id: 'snapshot-1',
    name: 'Ada',
    tags: ['math', 'logic'],
    profile: { score: 1, label: 'start' },
    meta: { nested: { count: 1 }, flags: ['a'] },
    seenAt: '2020-01-01T00:00:00.000Z',
  };
}

async function loadDocument(adapter = new FakePersistenceAdapter([seedRecord()])) {
  const model = makeModel(adapter);
  const doc = await new Query<any | null, SnapshotDoc>(model, model.schema, adapter)
    .where({ _id: 'snapshot-1' } as any)
    .setOp('findOne')
    .exec();
  return { adapter, doc: doc as Document<SnapshotDoc> & SnapshotDoc };
}

describe('MRX-08 document snapshots and nested dirty tracking', () => {
  it('persists array, nested object, subdocument, and date mutations detected by structural diffing', async () => {
    const { adapter, doc } = await loadDocument();

    doc.tags.push('programming');
    doc.tags.splice(0, 1, 'analysis');
    doc.profile.score = 42;
    doc.meta.nested.count = 2;
    doc.meta.flags[0] = 'b';
    doc.seenAt.setUTCFullYear(2021);

    expect(doc.modifiedPaths().sort()).toEqual(['meta', 'profile', 'seenAt', 'tags']);
    await doc.save();

    expect(adapter.calls.incrementalModify).toHaveLength(1);
    expect(adapter.snapshot()[0]).toMatchObject({
      tags: ['analysis', 'logic', 'programming'],
      profile: { score: 42, label: 'start' },
      meta: { nested: { count: 2 }, flags: ['b'] },
      seenAt: '2021-01-01T00:00:00.000Z',
    });
    const model = makeModel(adapter);
    const reloaded = (await new Query<any | null, SnapshotDoc>(model, model.schema, adapter)
      .where({ _id: 'snapshot-1' } as any)
      .setOp('findOne')
      .exec()) as Document<SnapshotDoc> & SnapshotDoc;
    expect(reloaded.tags).toEqual(['analysis', 'logic', 'programming']);
    expect(reloaded.profile.score).toBe(42);
    expect(reloaded.meta.nested.count).toBe(2);
    expect(reloaded.seenAt.toISOString()).toBe('2021-01-01T00:00:00.000Z');
    expect(doc.isModified()).toBe(false);
  });

  it('isolates constructor input and toObject results from live document state', () => {
    const adapter = new FakePersistenceAdapter();
    const model = makeModel(adapter);
    const input = {
      name: 'Input',
      tags: ['one'],
      profile: { score: 1, label: 'safe' },
      meta: { nested: { count: 1 } },
      seenAt: new Date('2022-02-02T00:00:00.000Z'),
    };
    const doc = new Document<SnapshotDoc>(input, model.schema, model) as Document<SnapshotDoc> & SnapshotDoc;

    input.tags.push('external');
    input.profile.score = 99;
    input.meta.nested.count = 99;
    input.seenAt.setUTCFullYear(2030);

    expect(doc.tags).toEqual(['one']);
    expect(doc.profile.score).toBe(1);
    expect(doc.meta.nested.count).toBe(1);
    expect(doc.seenAt.toISOString()).toBe('2022-02-02T00:00:00.000Z');

    doc.clearModified();
    const plain = doc.toObject();
    plain.tags.push('plain');
    plain.profile.score = 50;
    plain.meta.nested.count = 50;
    plain.seenAt.setUTCFullYear(2040);

    expect(doc.tags).toEqual(['one']);
    expect(doc.profile.score).toBe(1);
    expect(doc.meta.nested.count).toBe(1);
    expect(doc.seenAt.toISOString()).toBe('2022-02-02T00:00:00.000Z');
    expect(doc.isModified()).toBe(false);
  });

  it('skips adapter mutation for unchanged documents and values reverted to the snapshot', async () => {
    const { adapter, doc } = await loadDocument();

    await doc.save();
    expect(adapter.calls.incrementalModify).toHaveLength(0);

    doc.name = 'Grace';
    doc.tags.push('temporary');
    doc.profile.score = 9;
    doc.seenAt = new Date('2023-03-03T00:00:00.000Z') as any;
    doc.name = 'Ada';
    doc.tags.pop();
    doc.profile.score = 1;
    doc.seenAt = new Date('2020-01-01T00:00:00.000Z') as any;

    expect(doc.isModified()).toBe(false);
    await doc.save();
    expect(adapter.calls.incrementalModify).toHaveLength(0);
    expect(adapter.snapshot()[0]).toEqual(seedRecord());
  });

  it('retains accurate modified paths and the old snapshot after failed save so retry can persist', async () => {
    let failNext = true;
    const { adapter, doc } = await loadDocument(
      new FakePersistenceAdapter([seedRecord()], {
        onIncrementalModifyStart(id) {
          if (failNext) throw new Error(`update failed for ${id}`);
        },
      }),
    );

    doc.tags.push('retry');
    doc.meta.nested.count = 3;
    await expect(doc.save()).rejects.toThrow('update failed for snapshot-1');

    expect(doc.modifiedPaths().sort()).toEqual(['meta', 'tags']);
    expect(adapter.snapshot()[0]).toEqual(seedRecord());

    failNext = false;
    await doc.save();

    expect(adapter.snapshot()[0]).toMatchObject({ tags: ['math', 'logic', 'retry'], meta: { nested: { count: 3 } } });
    expect(doc.isModified()).toBe(false);
  });

  it('honors explicit markModified only when the current value differs from the snapshot', async () => {
    const { adapter, doc } = await loadDocument();

    doc.markModified('meta');
    expect(doc.isModified()).toBe(false);
    await doc.save();
    expect(adapter.calls.incrementalModify).toHaveLength(0);

    doc.meta.extra = { nested: true };
    doc.markModified('meta');
    expect(doc.modifiedPaths()).toEqual(['meta']);
    await doc.save();

    expect(adapter.calls.incrementalModify).toHaveLength(1);
    expect(adapter.snapshot()[0].meta.extra).toEqual({ nested: true });
  });
});
