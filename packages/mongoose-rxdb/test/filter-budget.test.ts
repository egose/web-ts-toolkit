import { afterAll, describe, expect, it } from 'vitest';
import { Connection, Query, QueryFilterError, sanitizeFilter, Schema, translateFilter } from '../src/index';
import { createMemoryDatabase } from '../src/storage/index';
import { cleanupTrackedChildren, runSubprocess } from './support/subprocess';
import { FakePersistenceAdapter } from './support/fake-adapter';
import { packageRoot } from './support/packed-consumer';

interface BudgetDoc {
  name: string;
  age: number;
}

afterAll(async () => {
  await cleanupTrackedChildren();
});

function createFakeModel(adapter: FakePersistenceAdapter) {
  const schema = new Schema<BudgetDoc>({ name: String, age: Number });
  return {
    schema,
    collection: adapter,
    resolveCollection: () => Promise.resolve(adapter),
    mw: { exec: (_op: string, _target: unknown, next: () => unknown) => next() },
  };
}

function deepLiteralObjects(levels: number): any {
  let inner: any = { leaf: 1 };
  for (let i = 0; i < levels; i += 1) inner = { nest: inner };
  return { profile: inner };
}

function deepSingletonArrays(levels: number): any {
  let inner: any = 1;
  for (let i = 0; i < levels; i += 1) inner = [inner];
  return { tags: inner };
}

function mixedNesting(levels: number): any {
  let inner: any = 1;
  for (let i = 0; i < levels; i += 1) inner = i % 2 === 0 ? [inner] : { nest: inner };
  return { f: inner };
}

function wideSiblingObjects(count: number): any {
  const out: any = {};
  for (let i = 0; i < count; i += 1) out[`f${i}`] = { x: 1, y: 2 };
  return out;
}

describe('BMRX-04 filter budgets before recursive copy', () => {
  it('rejects deep literal objects at sanitize time', () => {
    expect(() => sanitizeFilter(deepLiteralObjects(40))).toThrow(QueryFilterError);
    expect(() => translateFilter(deepLiteralObjects(40) as any)).toThrow(QueryFilterError);
  });

  it('rejects deep arrays and mixed nesting at sanitize time', () => {
    expect(() => sanitizeFilter(deepSingletonArrays(100))).toThrow(QueryFilterError);
    expect(() => sanitizeFilter(mixedNesting(40))).toThrow(QueryFilterError);
    expect(() => translateFilter(deepSingletonArrays(100) as any)).toThrow(QueryFilterError);
  });

  it('rejects wide literal trees at sanitize time', () => {
    expect(() => sanitizeFilter(wideSiblingObjects(80))).toThrow(QueryFilterError);
    const widePrimitives: any = {};
    for (let i = 0; i < 250; i += 1) widePrimitives[`f${i}`] = i;
    expect(() => sanitizeFilter(widePrimitives)).toThrow(QueryFilterError);
  });

  it('rejects cyclic inputs with a controlled error', () => {
    const selfRef: any = {};
    selfRef.self = selfRef;
    expect(() => sanitizeFilter({ f: selfRef } as any)).toThrow(QueryFilterError);

    const arrCycle: any[] = [];
    arrCycle.push(arrCycle);
    expect(() => sanitizeFilter({ f: arrCycle } as any)).toThrow(QueryFilterError);

    const nested: any = { a: { b: {} } };
    nested.a.b.root = nested;
    expect(() => sanitizeFilter(nested as any)).toThrow(QueryFilterError);
  });

  it('rejects over-budget direct-query construction before adapter execution', async () => {
    const adapter = new FakePersistenceAdapter([{ _id: 'u1', name: 'Ada', age: 36 }]);
    const model = createFakeModel(adapter);

    expect(() =>
      new Query<any[], BudgetDoc>(model, model.schema, adapter).where(deepSingletonArrays(100) as any),
    ).toThrow(QueryFilterError);
    expect(adapter.calls.find).toHaveLength(0);

    const cyc: any = {};
    cyc.self = cyc;
    expect(() => new Query<any[], BudgetDoc>(model, model.schema, adapter).where({ f: cyc } as any)).toThrow(
      QueryFilterError,
    );
    expect(adapter.calls.find).toHaveLength(0);

    // Exec-time boundary: bypass builder clones by mutating the live filter,
    // then exec must still reject before any adapter call.
    const q = new Query<any[], BudgetDoc>(model, model.schema, adapter).where({ name: 'Ada' } as any);
    (q.getFilter() as any).deep = deepLiteralObjects(40);
    await expect(q.exec()).rejects.toBeInstanceOf(QueryFilterError);
    expect(adapter.calls.find).toHaveLength(0);
  });

  it('rejects over-budget descriptor construction synchronously', () => {
    const adapter = new FakePersistenceAdapter([]);
    const model = createFakeModel(adapter);
    expect(() =>
      new Query(model, model.schema, adapter).setOperationDescriptor({
        op: 'find',
        filter: deepLiteralObjects(40) as any,
      }),
    ).toThrow(QueryFilterError);

    const cyc: any = { a: {} };
    cyc.a.root = cyc;
    expect(() =>
      new Query(model, model.schema, adapter).setOperationDescriptor({ op: 'find', filter: cyc as any }),
    ).toThrow(QueryFilterError);
  });

  it('enforces budgets at builder copy boundaries', () => {
    const adapter = new FakePersistenceAdapter([]);
    const model = createFakeModel(adapter);

    expect(() => new Query(model, model.schema, adapter).where(deepSingletonArrays(60) as any)).toThrow(
      QueryFilterError,
    );
    expect(() =>
      new Query(model, model.schema, adapter).where('age').in(Array.from({ length: 60 }, (_, i) => i)),
    ).toThrow(QueryFilterError);
    expect(() => new Query(model, model.schema, adapter).or([deepLiteralObjects(30) as any])).toThrow(QueryFilterError);
    const cyc: any = {};
    cyc.self = cyc;
    expect(() => new Query(model, model.schema, adapter).where('f').equals(cyc)).toThrow(QueryFilterError);
    expect(() => new Query(model, model.schema, adapter).setUpdate(deepLiteralObjects(40) as any)).toThrow(
      QueryFilterError,
    );
  });

  it('rejects over-budget model calls before adapter execution and leaves data unchanged', async () => {
    const connection = new Connection();
    await connection.connect(() => createMemoryDatabase({ name: `bmrx04_${Date.now()}` }));
    try {
      const User = connection.model<BudgetDoc>(
        'BudgetUser',
        new Schema<BudgetDoc>({ name: String, age: Number }),
        'budget_users',
      );
      await User.create([
        { name: 'Keep', age: 1 },
        { name: 'Target', age: 2 },
      ]);

      expect(() => User.find(deepLiteralObjects(40) as any)).toThrow(QueryFilterError);
      expect(() => User.deleteMany(deepSingletonArrays(100) as any)).toThrow(QueryFilterError);
      const cyc: any = {};
      cyc.self = cyc;
      expect(() => User.updateMany({ f: cyc } as any, { $set: { age: 99 } })).toThrow(QueryFilterError);

      const docs = await User.find({ name: { $in: ['Keep', 'Target'] } });
      expect(docs.map((d: any) => d.name).sort()).toEqual(['Keep', 'Target']);
    } finally {
      await connection.disconnect();
    }
  });

  it('accepts valid boundary-sized inputs', async () => {
    expect(() => sanitizeFilter({ name: 'Ada', age: { $gte: 2 } } as any)).not.toThrow();
    expect(() => sanitizeFilter(deepLiteralObjects(10) as any)).not.toThrow();
    expect(() => sanitizeFilter({ $or: Array.from({ length: 50 }, () => ({ name: 'x' })) } as any)).not.toThrow();
    expect(() => sanitizeFilter({ tags: { $in: Array.from({ length: 50 }, (_, i) => i) } } as any)).not.toThrow();

    const adapter = new FakePersistenceAdapter([{ _id: 'u1', name: 'Ada', age: 36 }]);
    const model = createFakeModel(adapter);
    const rows = await new Query<any[], BudgetDoc>(model, model.schema, adapter)
      .where({ age: { $gte: 2 } } as any)
      .exec();
    expect(rows).toHaveLength(1);
    expect(adapter.calls.find).toHaveLength(1);
  });

  it('rejects a 10000-deep singleton array in a subprocess without stack exhaustion', async () => {
    const script = `
const { sanitizeFilter, QueryFilterError } = require('./dist/index.js');
let inner = 1;
for (let i = 0; i < 10000; i += 1) inner = [inner];
try {
  sanitizeFilter({ tags: inner });
  process.exit(2);
} catch (error) {
  if (error instanceof QueryFilterError) process.exit(0);
  console.error(error && error.stack || error);
  process.exit(1);
}
`;
    const result = await runSubprocess(process.execPath, ['-e', script], {
      cwd: packageRoot,
      timeoutMs: 10_000,
    });
    expect(result.timedOut).toBe(false);
    expect(result.exitCode).toBe(0);
  });
});
