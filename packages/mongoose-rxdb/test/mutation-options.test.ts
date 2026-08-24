import { afterEach, describe, expect, it } from 'vitest';
import { Connection, MutationOptionError, Query, Schema } from '../src/index';
import { createMemoryDatabase } from '../src/storage/index';
import { FakePersistenceAdapter } from './support/fake-adapter';

interface OptionDoc {
  name: string;
  tenant: string;
  age: number;
  role: string;
}

function makeSchema() {
  return new Schema<OptionDoc>({
    name: { type: String, required: true },
    tenant: String,
    age: { type: Number, min: 0, max: 10 },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
  });
}

function makeFakeModel(adapter: FakePersistenceAdapter, schema = makeSchema()) {
  return {
    modelName: 'MutationOptionHarness',
    schema,
    collection: adapter,
    resolveCollection: () => Promise.resolve(adapter),
    mw: { exec: (_op: string, _target: unknown, next: () => unknown) => next() },
  };
}

describe('MRX-07 mutation options and upserts', () => {
  afterEach(() => {
    expect.hasAssertions();
  });

  it('transfers runValidators from model methods and leaves invalid updates unchanged', async () => {
    const conn = new Connection();
    await conn.connect(() => createMemoryDatabase({ name: `mrx07_validators_${Date.now()}` }));
    try {
      const User = conn.model('Mrx07ValidatorUser', makeSchema(), 'mrx07_validator_users');
      const created = await User.create({ name: 'Ada', tenant: 'core', age: 1 });
      const before = (await User.findById(created._id))!.toObject();

      await expect(
        User.updateOne({ _id: created._id } as any, { $set: { age: 15 } }, { runValidators: true }).exec(),
      ).rejects.toThrow('must be <= 10');
      expect((await User.findById(created._id))!.toObject()).toEqual(before);

      await User.updateOne({ _id: created._id } as any, { $set: { age: 15 } }, { runValidators: false }).exec();
      expect((await User.findById(created._id))!.age).toBe(15);
    } finally {
      await conn.disconnect();
    }
  });

  it('transfers findOneAndUpdate validators and preserves storage on rejection', async () => {
    const adapter = new FakePersistenceAdapter([{ _id: 'u1', name: 'Ada', tenant: 'core', age: 1, role: 'user' }]);
    const model = makeFakeModel(adapter);
    const before = adapter.snapshot();

    await expect(
      new Query(model, model.schema, adapter)
        .setOperationDescriptor({
          op: 'findOneAndUpdate',
          filter: { _id: 'u1' } as any,
          update: { $set: { age: 15 } },
          options: { runValidators: true, returnDocument: 'after' },
        })
        .exec(),
    ).rejects.toThrow('must be <= 10');

    expect(adapter.snapshot()).toEqual(before);
    expect(adapter.calls.findOneAndUpdate).toHaveLength(1);
  });

  it('builds upserts from equality filters, normalized updates, generated ids, and explicit insert defaults', async () => {
    const adapter = new FakePersistenceAdapter();
    const model = makeFakeModel(adapter);

    const inserted = await new Query(model, model.schema, adapter)
      .setOperationDescriptor({
        op: 'findOneAndUpdate',
        filter: { name: 'Ada', tenant: { $eq: 'core' }, age: { $gt: 1 } } as any,
        update: { $set: { age: '6' as any } },
        options: { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      })
      .exec();

    expect(inserted._id).toEqual(expect.any(String));
    expect(inserted.toObject()).toMatchObject({ name: 'Ada', tenant: 'core', age: 6, role: 'user' });
    expect(adapter.calls.insert[0]).toMatchObject({
      _id: expect.any(String),
      name: 'Ada',
      tenant: 'core',
      age: 6,
      role: 'user',
    });
    expect(adapter.calls.insert[0]).not.toHaveProperty('$gt');

    await new Query(model, model.schema, adapter)
      .setOperationDescriptor({
        op: 'findOneAndUpdate',
        filter: { name: 'Grace', tenant: 'core' } as any,
        update: { $set: { age: 7 } },
        options: { upsert: true },
      })
      .exec();
    expect(adapter.calls.insert[1]).toMatchObject({ name: 'Grace', tenant: 'core', age: 7 });
    expect(adapter.calls.insert[1]).not.toHaveProperty('role');
  });

  it('uses returnDocument precedence over new and returns before or after consistently', async () => {
    const adapter = new FakePersistenceAdapter([{ _id: 'u1', name: 'Ada', tenant: 'core', age: 1, role: 'user' }]);
    const model = makeFakeModel(adapter);

    const newTrue = await new Query(model, model.schema, adapter)
      .setOperationDescriptor({
        op: 'findOneAndUpdate',
        filter: { _id: 'u1' } as any,
        update: { $set: { age: 2 } },
        options: { new: true },
      })
      .exec();
    const beforeWins = await new Query(model, model.schema, adapter)
      .setOperationDescriptor({
        op: 'findOneAndUpdate',
        filter: { _id: 'u1' } as any,
        update: { $set: { age: 3 } },
        options: { new: true, returnDocument: 'before' },
      })
      .exec();
    const after = await new Query(model, model.schema, adapter)
      .setOperationDescriptor({
        op: 'findOneAndUpdate',
        filter: { _id: 'u1' } as any,
        update: { $set: { age: 4 } },
        options: { returnDocument: 'after' },
      })
      .exec();

    expect(newTrue.age).toBe(2);
    expect(beforeWins.age).toBe(2);
    expect(after.age).toBe(4);
  });

  it('rejects unsupported mutation option combinations before adapter execution', async () => {
    const adapter = new FakePersistenceAdapter([{ _id: 'u1', name: 'Ada', tenant: 'core', age: 1, role: 'user' }]);
    const model = makeFakeModel(adapter);

    expect(() =>
      new Query(model, model.schema, adapter).setOperationDescriptor({
        op: 'updateMany',
        filter: { tenant: 'core' } as any,
        update: { $set: { age: 2 } },
        options: { upsert: true } as any,
      }),
    ).toThrow(MutationOptionError);
    expect(() =>
      new Query(model, model.schema, adapter).setOperationDescriptor({
        op: 'findOneAndUpdate',
        filter: { tenant: 'core' } as any,
        update: { $set: { age: 2 } },
        options: { setDefaultsOnInsert: true } as any,
      }),
    ).toThrow(/setDefaultsOnInsert.*upsert/);
    expect(() =>
      new Query(model, model.schema, adapter).setOperationDescriptor({
        op: 'updateOne',
        filter: { tenant: 'core' } as any,
        update: { $set: { age: 2 } },
        options: { returnDocument: 'after' } as any,
      }),
    ).toThrow(/returnDocument.*updateOne/);
    expect(adapter.calls.updateMany).toHaveLength(0);
    expect(adapter.calls.updateOne).toHaveLength(0);
    expect(adapter.calls.findOneAndUpdate).toHaveLength(0);
  });
});
