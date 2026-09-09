import { describe, expect, it } from 'vitest';
import { Connection, Document, Query, Schema, ValidationError } from '../src/index';
import { createMemoryDatabase } from '../src/storage/index';
import { FakePersistenceAdapter } from './support/fake-adapter';

function makeNestedSchema() {
  const profile = new Schema({ a: Number, b: Number });
  return new Schema<any>({
    name: String,
    profile,
    tags: [String],
    meta: { type: Object },
  });
}

function makeModel(adapter: FakePersistenceAdapter, schema: Schema<any>) {
  return {
    modelName: 'NestedSaveHarness',
    schema,
    collection: adapter,
    resolveCollection: () => Promise.resolve(adapter),
    mw: { exec: (_op: string, _t: unknown, next: () => unknown) => next() },
  };
}

function seedNested() {
  return { _id: 'nested-1', name: 'Ada', profile: { a: 1, b: 1 }, tags: ['x'], meta: { note: 'base' } };
}

async function loadTwo(adapter: FakePersistenceAdapter, schema: Schema<any>) {
  const model = makeModel(adapter, schema);
  const mkQuery = () =>
    new Query<any | null, any>(model, model.schema, adapter)
      .where({ _id: 'nested-1' } as any)
      .setOp('findOne')
      .exec();
  const a = (await mkQuery()) as Document<any> & any;
  const b = (await mkQuery()) as Document<any> & any;
  return { a, b };
}

describe('BMRX-08 nested save intent and final-candidate validation', () => {
  it('preserves disjoint nested edits across two loaded documents', async () => {
    const schema = makeNestedSchema();
    const adapter = new FakePersistenceAdapter([seedNested()]);
    const { a, b } = await loadTwo(adapter, schema);
    a.profile.a = 2;
    b.profile.b = 3;
    await a.save();
    await b.save();
    expect(adapter.snapshot()[0]).toMatchObject({ profile: { a: 2, b: 3 } });
  });

  it('last-writer-wins on overlapping leaves and replaces whole arrays', async () => {
    const schema = makeNestedSchema();
    const adapter = new FakePersistenceAdapter([seedNested()]);
    const { a, b } = await loadTwo(adapter, schema);
    a.profile.a = 10;
    b.profile.a = 20;
    await a.save();
    await b.save();
    expect(adapter.snapshot()[0].profile.a).toBe(20);

    const reloaded = await loadTwo(adapter, schema);
    reloaded.a.tags = ['replaced', 'array'] as any;
    await reloaded.a.save();
    expect(adapter.snapshot()[0].tags).toEqual(['replaced', 'array']);
  });

  it('treats explicit whole-object assignment as intentional replacement', async () => {
    const schema = makeNestedSchema();
    const adapter = new FakePersistenceAdapter([seedNested()]);
    const { a, b } = await loadTwo(adapter, schema);
    (a as any).profile = { a: 9, b: 9 };
    b.profile.a = 5;
    await b.save();
    await a.save();
    // replacement second overwrites the subtree
    expect(adapter.snapshot()[0].profile).toEqual({ a: 9, b: 9 });
  });

  it('rejects stale cross-field candidates when validation is enabled', async () => {
    const schema = new Schema<any>({
      used: {
        type: Number,
        validate: {
          validator(this: any, value: number) {
            return value <= this.limit;
          },
          message: 'used exceeds limit',
        },
      },
      limit: Number,
    });
    const adapter = new FakePersistenceAdapter([{ _id: 'v-1', used: 2, limit: 10 }]);
    const model = makeModel(adapter, schema);
    const mkQuery = () =>
      new Query<any | null, any>(model, model.schema, adapter)
        .where({ _id: 'v-1' } as any)
        .setOp('findOne')
        .exec();
    const stale = (await mkQuery()) as Document<any> & any;
    const other = (await mkQuery()) as Document<any> & any;
    other.limit = 5;
    await other.save();
    stale.used = 8;
    await expect(stale.save()).rejects.toBeInstanceOf(ValidationError);
    expect(adapter.snapshot()[0]).toMatchObject({ used: 2, limit: 5 });
    // failed save remains retryable with dirty state intact
    expect(stale.isModified()).toBe(true);
    stale.used = 4;
    await stale.save();
    expect(adapter.snapshot()[0]).toMatchObject({ used: 4, limit: 5 });
  });

  it('runs validate/save middleware once per save and skips validation when disabled', async () => {
    const schema = new Schema<any>({
      used: {
        type: Number,
        validate: {
          validator(this: any, value: number) {
            return value <= this.limit;
          },
          message: 'used exceeds limit',
        },
      },
      limit: Number,
    });
    const calls: string[] = [];
    schema.pre('validate', function () {
      calls.push('pre-validate');
    });
    schema.post('validate', function () {
      calls.push('post-validate');
    });
    schema.pre('save', function () {
      calls.push('pre-save');
    });
    schema.post('save', function () {
      calls.push('post-save');
    });
    const adapter = new FakePersistenceAdapter([{ _id: 'v-2', used: 2, limit: 10 }]);
    const model = makeModel(adapter, schema) as any;
    // wire real middleware engine for this model
    const { MiddlewareEngine } = await import('../src/index');
    model.mw = new MiddlewareEngine(schema);
    const doc = (await new Query<any | null, any>(model, model.schema, adapter)
      .where({ _id: 'v-2' } as any)
      .setOp('findOne')
      .exec()) as Document<any> & any;
    // mutate adapter directly to simulate another writer lowering limit
    const other = (await new Query<any | null, any>(model, model.schema, adapter)
      .where({ _id: 'v-2' } as any)
      .setOp('findOne')
      .exec()) as Document<any> & any;
    other.limit = 5;
    // bypass validation for the other writer by disabling temporarily
    await other.save();
    doc.used = 8;
    await expect(doc.save()).rejects.toBeInstanceOf(ValidationError);
    expect(calls.filter((c) => c === 'pre-validate')).toHaveLength(2);
    expect(calls.filter((c) => c === 'pre-save')).toHaveLength(2);

    const noValidateSchema = new Schema<any>(
      {
        used: {
          type: Number,
          validate: {
            validator(this: any, value: number) {
              return value <= this.limit;
            },
            message: 'used exceeds limit',
          },
        },
        limit: Number,
      },
      { validateBeforeSave: false },
    );
    const adapter2 = new FakePersistenceAdapter([{ _id: 'v-3', used: 2, limit: 10 }]);
    const model2 = makeModel(adapter2, noValidateSchema);
    const stale2 = (await new Query<any | null, any>(model2, model2.schema, adapter2)
      .where({ _id: 'v-3' } as any)
      .setOp('findOne')
      .exec()) as Document<any> & any;
    const other2 = (await new Query<any | null, any>(model2, model2.schema, adapter2)
      .where({ _id: 'v-3' } as any)
      .setOp('findOne')
      .exec()) as Document<any> & any;
    other2.limit = 5;
    await other2.save();
    stale2.used = 8;
    await stale2.save();
    expect(adapter2.snapshot()[0]).toMatchObject({ used: 8, limit: 5 });
  });

  it('avoids mutation for unchanged saves', async () => {
    const schema = makeNestedSchema();
    const adapter = new FakePersistenceAdapter([seedNested()]);
    const model = makeModel(adapter, schema);
    const doc = (await new Query<any | null, any>(model, model.schema, adapter)
      .where({ _id: 'nested-1' } as any)
      .setOp('findOne')
      .exec()) as Document<any> & any;
    await doc.save();
    expect(adapter.calls.incrementalModify).toHaveLength(0);
  });

  it('preserves disjoint nested saves on real memory storage', async () => {
    const conn = new Connection();
    await conn.connect(() => createMemoryDatabase({ name: `bmrx08_nested_${Date.now()}` }));
    try {
      const profile = new Schema({ a: Number, b: Number });
      const schema = new Schema({ name: String, profile });
      const M = conn.model('Bmrx08Nested', schema, `bmrx08_nested_${Date.now()}`);
      const created = await (M as any).create({ name: 'Ada', profile: { a: 1, b: 1 } });
      const a = await (M as any).findById(created._id);
      const b = await (M as any).findById(created._id);
      a.profile.a = 2;
      b.profile.b = 3;
      await a.save();
      await b.save();
      const after = await (M as any).findById(created._id);
      expect(after.profile.a).toBe(2);
      expect(after.profile.b).toBe(3);
    } finally {
      await conn.disconnect();
    }
  });
});
