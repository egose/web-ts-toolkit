import { describe, expect, it } from 'vitest';
import { Query, Schema } from '../src/index';
import { FakePersistenceAdapter } from './support/fake-adapter';

interface NDoc {
  n: number;
}

function makeSchema() {
  return new Schema<NDoc>({ n: Number });
}

function makeModel(adapter: FakePersistenceAdapter, schema = makeSchema()) {
  return {
    modelName: 'ChainedConstraintsHarness',
    schema,
    collection: adapter,
    resolveCollection: () => Promise.resolve(adapter),
    mw: { exec: (_op: string, _target: unknown, next: () => unknown) => next() },
  };
}

function seededAdapter() {
  return new FakePersistenceAdapter([
    { _id: 'low', n: 0 },
    { _id: 'mid', n: 5 },
    { _id: 'high', n: 10 },
  ]);
}

describe('BMRX-06 chained builder constraints', () => {
  it('accumulates compatible range operators instead of replacing', async () => {
    const adapter = seededAdapter();
    const model = makeModel(adapter);
    const query = new Query<any[], NDoc>(model, model.schema, adapter).where('n').gte(3).lte(7).lean();
    expect(query.getFilter()).toEqual({ n: { $gte: 3, $lte: 7 } });
    const rows = await query.exec();
    expect(rows.map((doc) => doc._id)).toEqual(['mid']);
  });

  it('replaces only the repeated operator key and lets equals() replace the field', () => {
    const adapter = seededAdapter();
    const model = makeModel(adapter);
    const repeated = new Query(model, model.schema, adapter).where('n').gt(1).gt(2).lt(10);
    expect(repeated.getFilter()).toEqual({ n: { $gt: 2, $lt: 10 } });

    const equalsReplaces = new Query(model, model.schema, adapter).where('n').gte(3).lte(7).equals(5);
    expect(equalsReplaces.getFilter()).toEqual({ n: 5 });

    const operatorAfterEquals = new Query(model, model.schema, adapter).where('n').equals(5).gt(3);
    expect(operatorAfterEquals.getFilter()).toEqual({ n: { $gt: 3 } });
  });

  it('retains membership, exclusion, and existence predicates alongside ranges', async () => {
    const adapter = seededAdapter();
    const model = makeModel(adapter);
    const membership = new Query<any[], NDoc>(model, model.schema, adapter)
      .where('n')
      .gte(0)
      .in([0, 5])
      .nin([0])
      .lean();
    expect(membership.getFilter()).toEqual({ n: { $gte: 0, $in: [0, 5], $nin: [0] } });
    expect((await membership.exec()).map((doc) => doc._id)).toEqual(['mid']);

    const existence = new Query(model, model.schema, adapter).where('n').gte(3).exists(true);
    expect(existence.getFilter()).toEqual({ n: { $gte: 3, $exists: true } });
  });

  it('merges operator maps across where(object) calls', () => {
    const adapter = seededAdapter();
    const model = makeModel(adapter);
    const query = new Query(model, model.schema, adapter)
      .where({ n: { $gte: 3 } } as any)
      .where({ n: { $lte: 7 } } as any);
    expect(query.getFilter()).toEqual({ n: { $gte: 3, $lte: 7 } });
  });

  it('leaves outside-range records unchanged for destructive chained queries', async () => {
    const adapter = seededAdapter();
    const model = makeModel(adapter);
    const deleted = await new Query<{ deletedCount: number }, NDoc>(model, model.schema, adapter)
      .setOp('deleteMany')
      .where('n')
      .gte(3)
      .lte(7)
      .exec();
    expect(deleted).toEqual({ deletedCount: 1 });
    expect(
      adapter
        .snapshot()
        .map((doc) => doc._id)
        .sort(),
    ).toEqual(['high', 'low']);

    const adapter2 = seededAdapter();
    const model2 = makeModel(adapter2);
    await new Query(model2, model2.schema, adapter2)
      .setOp('updateMany')
      .where('n')
      .gte(3)
      .lte(7)
      .setUpdate({ $set: { n: 6 } })
      .exec();
    const remaining = adapter2.snapshot().sort((a, b) => (a.n as number) - (b.n as number));
    expect(remaining.map((doc) => doc.n)).toEqual([0, 6, 10]);
  });

  it('snapshots mutable builder operands so later caller mutation cannot change the query', async () => {
    const adapter = seededAdapter();
    const model = makeModel(adapter);

    const inValues = [0, 5];
    const inQuery = new Query<any[], NDoc>(model, model.schema, adapter).where('n').in(inValues).lean();
    inValues.push(10);
    expect(inQuery.getFilter()).toEqual({ n: { $in: [0, 5] } });

    const orConditions: any[] = [{ n: 0 }, { n: 5 }];
    const orQuery = new Query<any[], NDoc>(model, model.schema, adapter).or(orConditions).lean();
    orConditions.push({ n: 10 });
    (orConditions[0] as any).n = 99;
    expect(orQuery.getFilter()).toEqual({ $or: [{ n: 0 }, { n: 5 }] });
    expect((await orQuery.exec()).map((doc) => doc._id).sort()).toEqual(['low', 'mid']);

    const objOperand: any = { nested: 1 };
    const eqQuery = new Query(model, model.schema, adapter).where('n').equals(objOperand);
    objOperand.nested = 99;
    expect(eqQuery.getFilter()).toEqual({ n: { nested: 1 } });

    const dateOperand = new Date('2020-01-01T00:00:00.000Z');
    const dateQuery = new Query(model, model.schema, adapter).where('n').gte(dateOperand as any);
    dateOperand.setFullYear(1999);
    expect((dateQuery.getFilter() as any).n.$gte).toEqual(new Date('2020-01-01T00:00:00.000Z'));
    expect((dateQuery.getFilter() as any).n.$gte).not.toBe(dateOperand);
  });

  it('preserves clone isolation and single-use execution', async () => {
    const adapter = seededAdapter();
    const model = makeModel(adapter);
    const base = new Query<any[], NDoc>(model, model.schema, adapter).where('n').gte(3).lean();
    const clone = base.clone().where('n').lte(7);
    expect(base.getFilter()).toEqual({ n: { $gte: 3 } });
    expect(clone.getFilter()).toEqual({ n: { $gte: 3, $lte: 7 } });

    const single = new Query<any[], NDoc>(model, model.schema, adapter).where('n').gte(3).lte(7).lean();
    await single.exec();
    await expect(single.exec()).rejects.toThrow(/already executed/);
  });
});
