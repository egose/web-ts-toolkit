import { describe, expect, it } from 'vitest';
import { Connection, Query, QueryFilterError, sanitizeFilter, Schema, translateFilter } from '../src/index';
import { createMemoryDatabase } from '../src/storage/index';
import { FakePersistenceAdapter } from './support/fake-adapter';

interface NullDoc {
  name: string;
  age: number;
}

function createFakeModel(adapter: FakePersistenceAdapter) {
  const schema = new Schema<NullDoc>({ name: String, age: Number });
  return {
    schema,
    collection: adapter,
    resolveCollection: () => Promise.resolve(adapter),
    mw: { exec: (_op: string, _target: unknown, next: () => unknown) => next() },
  };
}

describe('BMRX-05 direct null-filter boundary', () => {
  it('sanitizer rejects explicit null but accepts omission', () => {
    expect(() => sanitizeFilter(null as any)).toThrow(QueryFilterError);
    expect(sanitizeFilter(undefined)).toBe(undefined);
  });

  it('compiler rejects explicit null but treats omission as match-all', () => {
    expect(() => translateFilter(null as any)).toThrow(QueryFilterError);
    expect(Object.keys(translateFilter(undefined))).toHaveLength(0);
    expect(() => translateFilter(null as any)).toThrow(/explicit null is rejected/);
  });

  it('descriptor rejects explicit null but treats omission and {} as match-all', () => {
    const adapter = new FakePersistenceAdapter([]);
    const model = createFakeModel(adapter);

    expect(() =>
      new Query(model, model.schema, adapter).setOperationDescriptor({ op: 'find', filter: null as any }),
    ).toThrow(QueryFilterError);

    const omitted = new Query<any[], NullDoc>(model, model.schema, adapter).setOperationDescriptor({ op: 'find' });
    const explicitEmpty = new Query<any[], NullDoc>(model, model.schema, adapter).setOperationDescriptor({
      op: 'find',
      filter: {},
    });
    expect(omitted.getFilter()).toEqual({});
    expect(explicitEmpty.getFilter()).toEqual({});
  });

  it('builder where(null) rejects instead of silently matching all', () => {
    const adapter = new FakePersistenceAdapter([]);
    const model = createFakeModel(adapter);
    expect(() => new Query(model, model.schema, adapter).where(null as any)).toThrow(QueryFilterError);
    expect(adapter.calls.find).toHaveLength(0);
  });

  it('model methods reject explicit null before any adapter call and leave seeded data unchanged', async () => {
    const adapter = new FakePersistenceAdapter([
      { _id: 'u1', name: 'Ada', age: 36 },
      { _id: 'u2', name: 'Grace', age: 40 },
    ]);
    const schema = new Schema<NullDoc>({ name: String, age: Number });
    const fakeModel: any = {
      schema,
      collection: adapter,
      resolveCollection: () => Promise.resolve(adapter),
      mw: { exec: (_op: string, _target: unknown, next: () => unknown) => next() },
    };
    const { Query: QueryCtor } = await import('../src/query');
    const makeQuery = (op: any, filter: any) => {
      const q = new QueryCtor<any, NullDoc>(fakeModel, schema, adapter);
      q.setOperationDescriptor({
        op,
        filter,
        ...(op.startsWith('update') || op === 'findOneAndUpdate' ? { update: { $set: { age: 99 } } } : {}),
      } as any);
      return q;
    };

    for (const op of ['find', 'findOne', 'count', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany']) {
      expect(() => makeQuery(op, null), op).toThrow(QueryFilterError);
    }

    expect(adapter.calls.find).toHaveLength(0);
    expect(adapter.calls.deleteMany).toHaveLength(0);
    expect(adapter.calls.updateMany).toHaveLength(0);
    expect(adapter.snapshot()).toHaveLength(2);
  });

  it('omitted and {} filters agree as intentional match-all on an isolated seeded store', async () => {
    const connection = new Connection();
    await connection.connect(() => createMemoryDatabase({ name: `bmrx05_${Date.now()}` }));
    try {
      const User = connection.model<NullDoc>(
        'NullBoundaryUser',
        new Schema<NullDoc>({ name: String, age: Number }),
        'null_boundary_users',
      );
      await User.create([
        { name: 'Keep', age: 1 },
        { name: 'Target', age: 2 },
      ]);

      // Explicit null is rejected synchronously at model-call time, before execution.
      expect(() => (User as any).deleteMany(null)).toThrow(QueryFilterError);
      expect(() => (User as any).find(null)).toThrow(QueryFilterError);
      expect(() => (User as any).updateMany(null, { $set: { age: 99 } })).toThrow(QueryFilterError);

      // Seeded records are untouched by the rejected probes.
      const omitted = await User.find();
      const explicitEmpty = await User.find({});
      expect(omitted.map((d: any) => d.name).sort()).toEqual(['Keep', 'Target']);
      expect(explicitEmpty.map((d: any) => d.name).sort()).toEqual(['Keep', 'Target']);
      expect(await User.countDocuments()).toBe(2);
    } finally {
      await connection.disconnect();
    }
  });
});
