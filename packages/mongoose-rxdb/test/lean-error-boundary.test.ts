import { describe, expect, it } from 'vitest';
import { Connection } from '../src/model';
import { Schema } from '../src/schema';
import { createMemoryDatabase } from '../src/storage/index';
import { BulkWritePartialFailureError, MutationPartialFailureError } from '../src/rx-adapter';
import { WriteNormalizationError } from '../src/converter';
import * as root from '../src/index';

interface LeanUser {
  name: string;
  age: number;
}

function buildSchema() {
  return new Schema<LeanUser>({ name: String, age: Number });
}

describe('BMRX-24 lean result and public error discovery', () => {
  it('toggles lean reads at runtime without false hydrated methods', async () => {
    const conn = new Connection();
    await conn.connect(() => createMemoryDatabase({ name: 'bmrx24_lean' }));
    try {
      const M = conn.model('Bmrx24Lean', buildSchema());
      await M.create({ name: 'Ada', age: 36 });
      const leanMany = await M.find({ name: 'Ada' }).lean(true);
      expect(Array.isArray(leanMany)).toBe(true);
      expect(typeof (leanMany[0] as any).save).toBe('undefined');
      expect('save' in Object(leanMany[0])).toBe(false);
      expect((leanMany[0] as any).name).toBe('Ada');
      const restored = await M.find({ name: 'Ada' }).lean(true).lean(false);
      expect(typeof (restored[0] as any).save).toBe('function');
      const leanOne = await M.findOne({ name: 'Ada' }).lean(true);
      expect(leanOne !== null && typeof (leanOne as any).save).toBe('undefined');
      const missing = await M.findOne({ name: 'Nobody' }).lean(true);
      expect(missing).toBeNull();
    } finally {
      await conn.disconnect();
    }
  });

  it('preserves mutation and count result shapes through lean mapping', async () => {
    const conn = new Connection();
    await conn.connect(() => createMemoryDatabase({ name: 'bmrx24_counts' }));
    try {
      const M = conn.model('Bmrx24Counts', buildSchema());
      await M.create({ name: 'Ada', age: 36 });
      const upd = await M.updateOne({ name: 'Ada' }, { $inc: { age: 1 } });
      expect(upd).toMatchObject({ matchedCount: 1, modifiedCount: 1 });
      expect((upd as any).save).toBeUndefined();
      const counted = await M.countDocuments({});
      expect(counted).toBe(1);
      const del = await M.deleteOne({ name: 'Ada' });
      expect(del).toMatchObject({ deletedCount: 1 });
      // Runtime evidence: lean is document-only; non-document ops reject it.
      await expect(M.updateOne({ name: 'Ada' }, { $inc: { age: 1 } }).lean(true)).rejects.toThrow(
        /not supported for updateOne/,
      );
    } finally {
      await conn.disconnect();
    }
  });

  it('resolves option-based lean results with nullability', async () => {
    const conn = new Connection();
    await conn.connect(() => createMemoryDatabase({ name: 'bmrx24_optlean' }));
    try {
      const M = conn.model('Bmrx24OptLean', buildSchema());
      await M.create({ name: 'Ada', age: 36 });
      const optLean = await M.findOneAndUpdate(
        { name: 'Ada' },
        { $inc: { age: 1 } },
        { lean: true, returnDocument: 'after' },
      );
      expect(optLean !== null && typeof (optLean as any).save).toBe('undefined');
      expect((optLean as any).age).toBe(37);
      const optHydrated = await M.findOneAndUpdate({ name: 'Ada' }, { $inc: { age: 1 } });
      expect(typeof (optHydrated as any)?.save).toBe('function');
      const miss = await M.findOneAndDelete({ name: 'Nobody' }, { lean: true });
      expect(miss).toBeNull();
      await M.create({ name: 'Bob', age: 20 });
      const delLean = await M.findOneAndDelete({ name: 'Bob' }, { lean: true });
      expect(delLean !== null && typeof (delLean as any).save).toBe('undefined');
    } finally {
      await conn.disconnect();
    }
  });

  it('exposes intentionally public thrown errors from the package root', async () => {
    expect(root.WriteNormalizationError).toBe(WriteNormalizationError);
    expect(root.MutationPartialFailureError).toBe(MutationPartialFailureError);
    expect(typeof root.BulkWritePartialFailureError).toBe('function');
    const conn = new Connection();
    await conn.connect(() => createMemoryDatabase({ name: 'bmrx24_errors' }));
    try {
      const M = conn.model('Bmrx24Errors', buildSchema());
      await M.create({ name: 'Ada', age: Number.MAX_VALUE });
      await expect(M.updateOne({ name: 'Ada' }, { $inc: { age: Number.MAX_VALUE } })).rejects.toBeInstanceOf(
        WriteNormalizationError,
      );
      try {
        await M.updateOne({ name: 'Ada' }, { $inc: { age: Number.MAX_VALUE } });
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(root.WriteNormalizationError);
        expect((error as Error).name).toBe('WriteNormalizationError');
      }
      expect(new MutationPartialFailureError('updateMany', { matchedCount: 2 }, new Error('x'))).toBeInstanceOf(
        root.MutationPartialFailureError,
      );
      expect(
        new BulkWritePartialFailureError('insertMany', false, {
          insertedCount: 0,
          insertedIds: [],
          records: [],
          errors: [],
        }),
      ).toBeInstanceOf(root.BulkWritePartialFailureError);
    } finally {
      await conn.disconnect();
    }
  });
});
