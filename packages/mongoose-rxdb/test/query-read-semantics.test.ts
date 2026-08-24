import { afterEach, describe, expect, it } from 'vitest';
import { Query, QueryOptionError, Schema } from '../src/index';
import { FakePersistenceAdapter } from './support/fake-adapter';

interface ReadDoc {
  name: string;
  age: number;
  role: string;
  secret: string;
}

function makeSchema() {
  return new Schema<ReadDoc>({
    name: String,
    age: Number,
    role: { type: String, default: 'user' },
    secret: String,
  });
}

function makeModel(adapter: FakePersistenceAdapter, schema = makeSchema()) {
  return {
    modelName: 'QueryReadHarness',
    schema,
    collection: adapter,
    resolveCollection: () => Promise.resolve(adapter),
    mw: { exec: (_op: string, _target: unknown, next: () => unknown) => next() },
  };
}

function seededAdapter() {
  return new FakePersistenceAdapter([
    { _id: 'u1', name: 'Ada', age: 1, role: 'admin', secret: 's1' },
    { _id: 'u2', name: 'Grace', age: 2, role: 'user', secret: 's2' },
    { _id: 'u3', name: 'Katherine', age: 3, role: 'user', secret: 's3' },
    { _id: 'u4', name: 'Dorothy', age: 4, role: 'user', secret: 's4' },
    { _id: 'u5', name: 'Mary', age: 5, role: 'user', secret: 's5' },
  ]);
}

describe('MRX-10 query read semantics', () => {
  afterEach(() => {
    expect.hasAssertions();
  });

  it('applies skip before limit and honors skip for one-document reads', async () => {
    const adapter = seededAdapter();
    const model = makeModel(adapter);

    const skipOnly = await new Query<any[], ReadDoc>(model, model.schema, adapter)
      .sort({ age: 1 })
      .skip(2)
      .lean()
      .exec();
    const limitOnly = await new Query<any[], ReadDoc>(model, model.schema, adapter)
      .sort({ age: 1 })
      .limit(2)
      .lean()
      .exec();
    const skipAndLimit = await new Query<any[], ReadDoc>(model, model.schema, adapter)
      .sort({ age: 1 })
      .skip(2)
      .limit(2)
      .lean()
      .exec();
    const oneAfterSkip = await new Query<any, ReadDoc>(model, model.schema, adapter)
      .setOp('findOne')
      .sort({ age: 1 })
      .skip(2)
      .lean()
      .exec();

    expect(skipOnly.map((doc) => doc._id)).toEqual(['u3', 'u4', 'u5']);
    expect(limitOnly.map((doc) => doc._id)).toEqual(['u1', 'u2']);
    expect(skipAndLimit.map((doc) => doc._id)).toEqual(['u3', 'u4']);
    expect(oneAfterSkip._id).toBe('u3');
  });

  it('normalizes inclusion, exclusion, string, and _id projections before lean or hydration', async () => {
    const adapter = new FakePersistenceAdapter([{ _id: 'u1', name: 'Ada', age: 36, secret: 'hidden' }]);
    const model = makeModel(adapter);

    const leanIncluded = await new Query<any[], ReadDoc>(model, model.schema, adapter)
      .select('name -_id')
      .lean()
      .exec();
    const hydratedIncluded = await new Query<any | null, ReadDoc>(model, model.schema, adapter)
      .setOp('findOne')
      .select({ name: 1, _id: 0 })
      .exec();
    const leanExcluded = await new Query<any[], ReadDoc>(model, model.schema, adapter)
      .select('-secret -_id')
      .lean()
      .exec();

    expect(leanIncluded).toEqual([{ name: 'Ada' }]);
    expect(hydratedIncluded?.toObject()).toEqual({ name: 'Ada' });
    expect(leanExcluded[0]).toEqual({ name: 'Ada', age: 36 });
    expect(leanExcluded[0]).not.toHaveProperty('role');
    await expect(
      new Query(model, model.schema, adapter).select({ name: 1, secret: 0 } as any).exec(),
    ).rejects.toBeInstanceOf(QueryOptionError);
  });

  it('returns lean records without document hydration', async () => {
    const schema = makeSchema();
    let initCount = 0;
    schema.post('init', function () {
      initCount += 1;
    });
    const adapter = seededAdapter();
    const model = makeModel(adapter, schema);

    const lean = await new Query<any[], ReadDoc>(model, model.schema, adapter)
      .where({ age: { $lte: 2 } })
      .sort({ age: 1 })
      .lean()
      .exec();

    expect(lean.map((doc) => doc._id)).toEqual(['u1', 'u2']);
    expect(lean[0]).not.toHaveProperty('toObject');
    expect(initCount).toBe(0);
    expect(adapter.calls.find).toHaveLength(1);
  });

  it('uses native count, ignores sort, and counts the paginated match window', async () => {
    const adapter = seededAdapter();
    const model = makeModel(adapter);

    const count = await new Query<number, ReadDoc>(model, model.schema, adapter)
      .setOp('count')
      .where({ age: { $gte: 1 } })
      .sort({ age: -1 })
      .skip(1)
      .limit(2)
      .exec();

    expect(count).toBe(2);
    expect(adapter.calls.count).toHaveLength(1);
    expect(adapter.calls.count[0]).not.toHaveProperty('sort');
    expect(adapter.calls.find).toHaveLength(0);
  });

  it('rejects repeated execution through exec, then, catch, and finally combinations', async () => {
    const adapter = seededAdapter();
    const model = makeModel(adapter);

    const throughExec = new Query(model, model.schema, adapter)
      .setOp('updateOne')
      .where({ _id: 'u1' } as any)
      .setUpdate({ $set: { age: 6 } });
    await throughExec.exec();
    await expect(throughExec.then(() => undefined)).rejects.toThrow(/already executed/);

    const throughThen = new Query(model, model.schema, adapter).where({ _id: 'u2' } as any);
    await throughThen.then((result) => result);
    const caught = await throughThen.catch((error) => error);
    expect(caught).toMatchObject({ name: 'MongooseError', message: expect.stringContaining('already executed') });

    const throughFinally = new Query(model, model.schema, adapter).where({ _id: 'u3' } as any);
    await throughFinally.finally(() => undefined);
    await expect(throughFinally.exec()).rejects.toThrow(/already executed/);
  });

  it('deep-copies caller inputs and isolates cloned and middleware-mutated state', async () => {
    const adapter = seededAdapter();
    const schema = makeSchema();
    schema.pre('find', function (next) {
      (this as Query).where({ age: { $gte: 99 } } as any);
      next();
    });
    const model = makeModel(adapter, schema);
    const filter = { age: { $gte: 2 } };
    const options = { projection: { name: 1 } } as any;
    const query = new Query<any[], ReadDoc>(model, model.schema, adapter).setOperationDescriptor({
      op: 'find',
      filter,
      options,
    });

    filter.age.$gte = 99;
    (options.projection as any).secret = 1;
    const fromOriginalInputs = await query.exec();

    const base = new Query<any[], ReadDoc>(model, model.schema, adapter)
      .where({ age: { $gte: 1 } })
      .sort({ age: 1 })
      .lean();
    const clone = base.clone().where({ name: 'Ada' }).skip(1);
    const baseResult = await base.exec();
    const cloneResult = await clone.exec();

    expect(fromOriginalInputs.map((doc) => doc.toObject())).toEqual([
      { _id: 'u2', name: 'Grace' },
      { _id: 'u3', name: 'Katherine' },
      { _id: 'u4', name: 'Dorothy' },
      { _id: 'u5', name: 'Mary' },
    ]);
    expect(baseResult.map((doc) => doc._id)).toEqual(['u1', 'u2', 'u3', 'u4', 'u5']);
    expect(cloneResult).toEqual([]);
    expect(adapter.calls.find[0].selector).toEqual({ age: { $gte: 2 } });
    expect({ ...adapter.calls.find[0].projection?.fields }).toEqual({ name: 1 });
  });
});
