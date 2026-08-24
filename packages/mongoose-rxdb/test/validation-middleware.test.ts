import { describe, expect, it } from 'vitest';
import { Document, MiddlewareEngine, Query, Schema, ValidationError } from '../src/index';
import { buildModel } from '../src/model';
import { FakePersistenceAdapter } from './support/fake-adapter';

function makeModel(adapter: FakePersistenceAdapter, schema: Schema<any>) {
  return {
    modelName: 'MiddlewareHarness',
    schema,
    collection: adapter,
    resolveCollection: () => Promise.resolve(adapter),
    mw: { exec: (_op: string, _target: unknown, next: () => unknown) => next() },
  };
}

describe('MRX-09 recursive validation', () => {
  it('returns validateSync errors synchronously without running async middleware', () => {
    const calls: string[] = [];
    const schema = new Schema({
      name: { type: String, required: true },
      age: {
        type: Number,
        validate: async () => false,
      },
    });
    schema.pre('validate', function () {
      calls.push('pre-validate');
    });
    const doc = new Document({ age: 1 }, schema, makeModel(new FakePersistenceAdapter(), schema));

    const error = doc.validateSync();

    expect(error).toBeInstanceOf(ValidationError);
    expect(Object.keys(error!.errors).sort()).toEqual(['age', 'name']);
    expect(error!.errors.age.message).toContain('cannot run during validateSync');
    expect(calls).toEqual([]);
  });

  it('aggregates nested schema and array-subdocument validation errors with full logical paths and subdocument context', async () => {
    const requiredContexts: any[] = [];
    const validatorContexts: any[] = [];
    const child = new Schema({
      enabled: Boolean,
      code: {
        type: String,
        required() {
          requiredContexts.push(this);
          return this.enabled;
        },
      },
      role: { type: String, enum: ['admin', 'user'] },
      score: {
        type: Number,
        validate: {
          validator(value: number) {
            validatorContexts.push(this);
            return value <= this.limit;
          },
          message: 'score exceeds limit',
        },
      },
      limit: Number,
    });
    const schema = new Schema({
      name: String,
      profile: child,
      members: [child],
      labels: [{ type: String, enum: ['safe'] }],
    });
    const doc = new Document(
      {
        name: 'root',
        profile: { enabled: true, role: 'owner', score: 5, limit: 3 },
        members: [{ enabled: true, role: 'user', score: 1, limit: 2 }],
        labels: ['safe', 'bad'],
      },
      schema,
      makeModel(new FakePersistenceAdapter(), schema),
    );

    const error = await doc.validate().catch((err) => err);

    expect(error).toBeInstanceOf(ValidationError);
    expect(Object.keys(error.errors).sort()).toEqual([
      'labels.1',
      'members.0.code',
      'profile.code',
      'profile.role',
      'profile.score',
    ]);
    expect(requiredContexts.map((ctx) => ctx.enabled)).toEqual([true, true]);
    expect(validatorContexts.map((ctx) => ctx.limit)).toEqual([3, 2]);
  });
});

describe('MRX-09 middleware ordering and completion', () => {
  it('runs validate middleware around validation and save error middleware for validation failures', async () => {
    const adapter = new FakePersistenceAdapter();
    const calls: string[] = [];
    const schema = new Schema({ name: { type: String, required: true } });
    schema.pre('validate', function (next) {
      calls.push(`pre-validate:${this instanceof Document}`);
      next();
    });
    schema.post('validate', function () {
      calls.push('post-validate');
    });
    schema.pre('save', function () {
      calls.push('pre-save');
    });
    schema.post('save', { errorHandler: true }, function (err: Error) {
      calls.push(`save-error:${err.name}`);
    });
    const doc = new Document({}, schema, makeModel(adapter, schema));

    await expect(doc.validate()).rejects.toBeInstanceOf(ValidationError);
    await expect(doc.save()).rejects.toBeInstanceOf(ValidationError);

    expect(calls).toEqual(['pre-validate:true', 'pre-validate:true', 'save-error:ValidationError']);
    expect(adapter.calls.insert).toHaveLength(0);
  });

  it('runs successful validate and save hooks with documented callback post argument order', async () => {
    const adapter = new FakePersistenceAdapter();
    const calls: string[] = [];
    const schema = new Schema({ name: { type: String, required: true } });
    schema.pre('validate', function () {
      calls.push('pre-validate');
    });
    schema.post('validate', function () {
      calls.push('post-validate');
    });
    schema.pre('save', function (next) {
      calls.push('pre-save');
      next();
      return Promise.resolve();
    });
    schema.post('save', function (result: any, next: (err?: Error) => void) {
      calls.push(`post-save:${result.name}`);
      next();
    });
    const doc = new Document({ name: 'Ada' }, schema, makeModel(adapter, schema));

    await doc.save();

    expect(calls).toEqual(['pre-validate', 'post-validate', 'pre-save', 'post-save:Ada']);
    expect(adapter.calls.insert).toHaveLength(1);
  });

  it('honors validateBeforeSave: false while retaining explicit validate()', async () => {
    const adapter = new FakePersistenceAdapter();
    const schema = new Schema({ name: { type: String, required: true } }, { validateBeforeSave: false });
    const doc = new Document({}, schema, makeModel(adapter, schema));

    await expect(doc.validate()).rejects.toBeInstanceOf(ValidationError);
    await expect(doc.save()).resolves.toBe(doc);
    expect(adapter.calls.insert).toHaveLength(1);
  });

  it('settles once when callback middleware also returns a promise', async () => {
    const adapter = new FakePersistenceAdapter();
    const calls: string[] = [];
    const schema = new Schema({ name: String });
    schema.pre('save', function (next) {
      calls.push('pre');
      next();
      return Promise.resolve().then(() => calls.push('pre-promise'));
    });
    schema.post('save', function (result: any, next: (err?: Error) => void) {
      calls.push(`post:${result.name}`);
      next();
      return Promise.resolve().then(() => calls.push('post-promise'));
    });
    const doc = new Document({ name: 'Mixed' }, schema, makeModel(adapter, schema));

    await expect(doc.save()).resolves.toBe(doc);
    await Promise.resolve();

    expect(calls).toEqual(['pre', 'pre-promise', 'post:Mixed', 'post-promise']);
    expect(adapter.calls.insert).toHaveLength(1);
  });
});

describe('MRX-09 retained hook matrix', () => {
  function makeQueryCase(op: string) {
    const schema = new Schema({ name: String, age: Number });
    const adapter = new FakePersistenceAdapter([{ _id: 'q1', name: 'Ada', age: 1 }]);
    const model = makeModel(adapter, schema);
    const query = new Query(model, schema, adapter).where({ name: 'Ada' } as any).setOp(op as any);
    if (op === 'updateOne' || op === 'updateMany' || op === 'findOneAndUpdate')
      query.setUpdate({ $set: { age: 2 } } as any);
    return { schema, adapter, query };
  }

  for (const op of [
    'find',
    'findOne',
    'updateOne',
    'updateMany',
    'deleteOne',
    'deleteMany',
    'findOneAndUpdate',
    'findOneAndDelete',
  ]) {
    it(`runs ${op} query hooks with Query context and error middleware`, async () => {
      const { schema, adapter, query } = makeQueryCase(op);
      const calls: string[] = [];
      schema.pre(op as any, function () {
        calls.push(`pre:${this instanceof Query}:${this.getFilter().name}`);
      });
      schema.post(op as any, function (result: any, next: (err?: Error) => void) {
        calls.push(`post:${Array.isArray(result) ? result.length : result === null ? 'null' : 'ok'}`);
        next();
      });

      await query.exec();

      expect(calls).toEqual(['pre:true:Ada', expect.stringMatching(/^post:/)]);

      schema.pre(op as any, function () {
        throw new Error(`blocked ${op}`);
      });
      schema.post(op as any, { errorHandler: true }, function (err: Error) {
        calls.push(`error:${err.message}`);
      });
      const failing = makeQueryCase(op).query;
      (failing as any).schema = schema;
      (failing as any).mw = new MiddlewareEngine(schema);

      await expect(failing.exec()).rejects.toThrow(`blocked ${op}`);
      expect(calls.at(-1)).toBe(`error:blocked ${op}`);
      expect(adapter).toBeTruthy();
    });
  }

  it('runs remove and document deleteOne hooks separately with document context and error middleware', async () => {
    const schema = new Schema({ name: String });
    const adapter = new FakePersistenceAdapter([
      { _id: 'd1', name: 'Ada' },
      { _id: 'd2', name: 'Grace' },
    ]);
    const model = makeModel(adapter, schema);
    const calls: string[] = [];
    schema.pre('remove', function () {
      calls.push(`pre-remove:${this instanceof Document}`);
    });
    schema.post('remove', function (result: any) {
      calls.push(`post-remove:${result._id}`);
    });
    schema.pre('deleteOne', function () {
      calls.push(`pre-deleteOne:${this instanceof Document}`);
    });
    schema.post('deleteOne', function (result: any) {
      calls.push(`post-deleteOne:${result._id}`);
    });

    await new Document({ name: 'Ada' }, schema, model, { isNew: false, id: 'd1' }).remove();
    await new Document({ name: 'Grace' }, schema, model, { isNew: false, id: 'd2' }).deleteOne();

    expect(calls).toEqual(['pre-remove:true', 'post-remove:d1', 'pre-deleteOne:true', 'post-deleteOne:d2']);
  });

  it('runs insertMany hooks with model context and init hooks on hydration', async () => {
    const schema = new Schema({ name: String });
    const adapter = new FakePersistenceAdapter([{ _id: 'existing', name: 'Hydrate' }]);
    const calls: string[] = [];
    schema.pre('insertMany', function (next, docs: any[]) {
      calls.push(`pre-insertMany:${this.modelName}:${docs.length}`);
      next();
    });
    schema.post('insertMany', function (result: any[]) {
      calls.push(`post-insertMany:${result.length}`);
    });
    schema.post('init', function (result: any) {
      calls.push(`post-init:${result.name}`);
    });
    const model = buildModel(
      {
        ensureCollection: () => ({
          normalizedName: 'hook_matrix',
          fingerprint: 'same',
          promise: Promise.resolve(adapter),
        }),
        resolveModelCollection: () => Promise.resolve(adapter),
        models: new Map([['HookMatrix', null]]),
      } as any,
      'HookMatrix',
      schema,
      'hook_matrix',
    ) as any;
    model.connection.models.set('HookMatrix', model);

    await model.insertMany([{ name: 'A' }, { name: 'B' }]);
    await new Query(model, schema, adapter)
      .where({ _id: 'existing' } as any)
      .setOp('findOne')
      .exec();

    expect(calls).toEqual(['pre-insertMany:HookMatrix:2', 'post-insertMany:2', 'post-init:Hydrate']);
  });

  it('runs error middleware for insertMany and init failures', async () => {
    const schema = new Schema({ name: String });
    const adapter = new FakePersistenceAdapter([{ _id: 'existing', name: 'Hydrate' }]);
    const calls: string[] = [];
    schema.pre('insertMany', function () {
      throw new Error('insertMany blocked');
    });
    schema.post('insertMany', { errorHandler: true }, function (err: Error) {
      calls.push(`insertMany-error:${err.message}`);
    });
    schema.pre('init', function () {
      throw new Error('init blocked');
    });
    schema.post('init', { errorHandler: true }, function (err: Error) {
      calls.push(`init-error:${err.message}`);
    });
    const model = buildModel(
      {
        ensureCollection: () => ({
          normalizedName: 'hook_error_matrix',
          fingerprint: 'same',
          promise: Promise.resolve(adapter),
        }),
        resolveModelCollection: () => Promise.resolve(adapter),
        models: new Map([['HookErrorMatrix', null]]),
      } as any,
      'HookErrorMatrix',
      schema,
      'hook_error_matrix',
    ) as any;
    model.connection.models.set('HookErrorMatrix', model);

    await expect(model.insertMany([{ name: 'A' }])).rejects.toThrow('insertMany blocked');
    await expect(
      new Query(model, schema, adapter)
        .where({ _id: 'existing' } as any)
        .setOp('findOne')
        .exec(),
    ).rejects.toThrow('init blocked');

    expect(calls).toEqual(['insertMany-error:insertMany blocked', 'init-error:init blocked']);
  });
});
