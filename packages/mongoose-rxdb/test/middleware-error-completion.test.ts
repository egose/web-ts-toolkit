import { describe, expect, it } from 'vitest';
import { Document, Query, Schema } from '../src/index';
import { MiddlewareEngine } from '../src/middleware';
import { FakePersistenceAdapter } from './support/fake-adapter';

function makeModel(adapter: FakePersistenceAdapter, schema: Schema<any>) {
  return {
    modelName: 'ErrorCompletionHarness',
    schema,
    collection: adapter,
    resolveCollection: () => Promise.resolve(adapter),
    mw: { exec: (_op: string, _target: unknown, next: () => unknown) => next() },
  };
}

describe('BMRX-16 error middleware completion per operation', () => {
  it('runs save error hooks once for frozen errors without replacing the original', async () => {
    const adapter = new FakePersistenceAdapter();
    const schema = new Schema({ name: { type: String, required: true } });
    let calls = 0;
    let seen: unknown;
    schema.post('save', { errorHandler: true }, function (err: unknown) {
      calls += 1;
      seen = err;
    });
    void new Document({}, schema, makeModel(adapter, schema));
    const frozen = Object.freeze(new Error('frozen boom'));

    // Fail validation first, then throw the frozen error from a save pre-hook
    // so the save error path handles a frozen value.
    const schema2 = new Schema({ name: String });
    let calls2 = 0;
    schema2.pre('save', function () {
      throw frozen;
    });
    schema2.post('save', { errorHandler: true }, function (err: unknown) {
      calls2 += 1;
      expect(err).toBe(frozen);
    });
    const doc2 = new Document({ name: 'Ada' }, schema2, makeModel(adapter, schema2));

    await expect(doc2.save()).rejects.toBe(frozen);
    expect(calls2).toBe(1);
    expect(Object.isFrozen(frozen)).toBe(true);
    // No marker property may be added to a frozen error.
    expect((frozen as any).__mongooseRxdbsavePostErrorHandled).toBeUndefined();
    expect(calls).toBe(0);
    expect(seen).toBeUndefined();
  });

  it('runs query error hooks once for primitive throws without a second run', async () => {
    const schema = new Schema({ name: String });
    const adapter = new FakePersistenceAdapter([{ _id: 'q1', name: 'Ada' }]);
    const model = makeModel(adapter, schema);
    let calls = 0;
    let seen: unknown;
    schema.pre('find', function () {
      // Primitive throw: also exercises the frozen/marker-free path.
      throw 'primitive boom';
    });
    schema.post('find', { errorHandler: true }, function (err: unknown) {
      calls += 1;
      seen = err;
    });
    const query = new Query(model, schema, adapter).where({ name: 'Ada' } as any).setOp('find');

    await expect(query.exec()).rejects.toBe('primitive boom');
    expect(calls).toBe(1);
    expect(seen).toBe('primitive boom');
  });

  it('runs save error hooks once per operation for primitive throws (no outer rerun)', async () => {
    const adapter = new FakePersistenceAdapter();
    const schema = new Schema({ name: String });
    let calls = 0;
    schema.pre('save', function () {
      throw 'save primitive boom';
    });
    schema.post('save', { errorHandler: true }, function () {
      calls += 1;
    });
    const doc = new Document({ name: 'Ada' }, schema, makeModel(adapter, schema));

    await expect(doc.save()).rejects.toBe('save primitive boom');
    expect(calls).toBe(1);
  });

  it('does not suppress handling when one Error instance is reused across operations', async () => {
    const adapter = new FakePersistenceAdapter();
    const schema = new Schema({ name: String });
    let calls = 0;
    const shared = new Error('shared boom');
    schema.pre('save', function () {
      throw shared;
    });
    schema.post('save', { errorHandler: true }, function (err: unknown) {
      calls += 1;
      expect(err).toBe(shared);
    });
    const model = makeModel(adapter, schema);

    await expect(new Document({ name: 'A' }, schema, model).save()).rejects.toBe(shared);
    await expect(new Document({ name: 'B' }, schema, model).save()).rejects.toBe(shared);
    expect(calls).toBe(2);
    // Operation-local control must not mark the shared error.
    expect((shared as any).__mongooseRxdbsavePostErrorHandled).toBeUndefined();
    expect((shared as any).__mongooseRxdbvalidatePostErrorHandled).toBeUndefined();
    expect((shared as any).__mongooseRxdbsavePostErrorHandled).toBeUndefined();
  });

  it('runs throwing error hooks at most once and propagates the hook failure with cause', async () => {
    const adapter = new FakePersistenceAdapter();
    const schema = new Schema({ name: String });
    const order: string[] = [];
    const original = new Error('original boom');
    const hookFailure = new Error('hook boom');
    schema.pre('save', function () {
      throw original;
    });
    schema.post('save', { errorHandler: true }, function () {
      order.push('first');
      throw hookFailure;
    });
    schema.post('save', { errorHandler: true }, function () {
      order.push('second');
    });
    const doc = new Document({ name: 'Ada' }, schema, makeModel(adapter, schema));

    const caught = await doc.save().catch((err) => err);
    expect(caught).toBe(hookFailure);
    expect((caught as any).cause).toBe(original);
    // Throwing first hook skips the rest and the outer save catch never reruns.
    expect(order).toEqual(['first']);
  });

  it('propagates throwing query error hooks once with the original as cause', async () => {
    const schema = new Schema({ name: String });
    const adapter = new FakePersistenceAdapter([{ _id: 'q1', name: 'Ada' }]);
    const model = makeModel(adapter, schema);
    const order: string[] = [];
    const hookFailure = new Error('query hook boom');
    schema.pre('find', function () {
      throw new Error('query original');
    });
    schema.post('find', { errorHandler: true }, function () {
      order.push('first');
      throw hookFailure;
    });
    schema.post('find', { errorHandler: true }, function () {
      order.push('second');
    });

    const caught = await new Query(model, schema, adapter)
      .where({ name: 'Ada' } as any)
      .setOp('find')
      .exec()
      .catch((err) => err);
    expect(caught).toBe(hookFailure);
    expect((caught as any).cause).toBeInstanceOf(Error);
    expect(((caught as any).cause as Error).message).toBe('query original');
    expect(order).toEqual(['first']);
  });

  it('runs save error hooks once for validate failures (pre-save never runs)', async () => {
    const adapter = new FakePersistenceAdapter();
    const calls: string[] = [];
    const schema = new Schema({ name: { type: String, required: true } });
    schema.pre('save', function (next) {
      calls.push('pre');
      next();
      return Promise.resolve().then(() => calls.push('pre-promise'));
    });
    schema.post('save', { errorHandler: true }, function (err: Error) {
      calls.push(`save-error:${err.name}`);
    });
    const doc = new Document({}, schema, makeModel(adapter, schema));

    await expect(doc.save()).rejects.toBeInstanceOf(Error);
    // Validate fails before pre-save hooks run, so only the save error hook runs — exactly once.
    expect(calls).toEqual(['save-error:ValidationError']);
  });

  it('runs error middleware directly without mutating frozen errors', async () => {
    const schema = new Schema({ name: String });
    const mw = new MiddlewareEngine(schema);
    let calls = 0;
    schema.post('save', { errorHandler: true }, function () {
      calls += 1;
    });
    const frozen = Object.freeze(new Error('direct frozen'));
    const result = await mw.runPostError('save', {}, frozen);
    expect(result).toBe(frozen);
    expect(calls).toBe(1);
    await expect(mw.exec('save', {}, () => Promise.reject(frozen))).rejects.toBe(frozen);
    await expect(mw.exec('save', {}, () => Promise.reject(frozen))).rejects.toBe(frozen);
    expect(calls).toBe(3);
  });
});
