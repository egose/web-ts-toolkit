import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Connection, Query, Schema } from '../src/index';
import { QueryFilterError, sanitizeFilter, translateFilter } from '../src/query-compiler';
import { createMemoryDatabase, createSqliteDatabase, SqliteStorageError } from '../src/storage/index';
import { FakePersistenceAdapter } from './support/fake-adapter';

interface DateDoc {
  name: string;
  born: Date;
}

const D1 = new Date('2000-01-02T03:04:05.000Z');
const D2 = new Date('2001-02-03T04:05:06.000Z');
const D3 = new Date('2002-06-01T00:00:00.000Z');

function makeSchema() {
  return new Schema<DateDoc>({ name: String, born: Date });
}

function makeFakeModel(adapter: FakePersistenceAdapter, schema = makeSchema()) {
  return {
    modelName: 'Bmrx23Harness',
    schema,
    collection: adapter,
    resolveCollection: () => Promise.resolve(adapter),
    mw: { exec: (_op: string, _t: unknown, next: () => unknown) => next() },
  };
}

async function seedMemory(suffix: string) {
  const conn = new Connection();
  await conn.connect(() => createMemoryDatabase({ name: `bmrx23_${suffix}_${Date.now()}` }));
  const M = conn.model<DateDoc>(`Bmrx23_${suffix}`, makeSchema(), `bmrx23_${suffix}_${Date.now()}`);
  await M.create({ name: 'a', born: D1 } as any);
  await M.create({ name: 'b', born: D2 } as any);
  await M.create({ name: 'c', born: D3 } as any);
  return { conn, M };
}

describe('BMRX-23 date selector normalization', () => {
  it('normalizes Date operands to ISO strings at the schema-free compiler boundary', () => {
    const input = { born: new Date(D1.getTime()) } as any;
    const sanitized = sanitizeFilter(input) as any;
    expect(sanitized.born).toBe(D1.toISOString());
    expect(input.born).toBeInstanceOf(Date);

    const translated = translateFilter({ born: new Date(D1.getTime()) } as any) as any;
    expect(translated.born).toEqual({ $eq: D1.toISOString() });

    const ranged = translateFilter({
      born: { $gte: new Date(D1.getTime()), $lte: new Date(D2.getTime()) },
    } as any) as any;
    expect(ranged.born).toEqual({ $gte: D1.toISOString(), $lte: D2.toISOString() });

    const membership = translateFilter({
      born: { $in: [new Date(D1.getTime()), new Date(D2.getTime())] },
    } as any) as any;
    expect(membership.born).toEqual({ $in: [D1.toISOString(), D2.toISOString()] });

    const logical = translateFilter({
      $or: [{ born: new Date(D1.getTime()) }, { born: { $gt: new Date(D2.getTime()) } }],
    } as any) as any;
    expect(logical.$or).toEqual([{ born: { $eq: D1.toISOString() } }, { born: { $gt: D2.toISOString() } }]);
  });

  it('rejects invalid dates with QueryFilterError and leaves data unchanged', async () => {
    const bad = new Date(NaN);
    expect(() => sanitizeFilter({ born: bad } as any)).toThrow(QueryFilterError);
    expect(() => translateFilter({ born: bad } as any)).toThrow(QueryFilterError);
    expect(() => sanitizeFilter({ born: { $in: [bad] } } as any)).toThrow(QueryFilterError);

    const adapter = new FakePersistenceAdapter([{ _id: 'a', born: D1.toISOString() }]);
    const model = makeFakeModel(adapter);
    await expect(
      new Query(model, model.schema, adapter as any)
        .setOperationDescriptor({ op: 'find', filter: { born: bad } as any })
        .exec(),
    ).rejects.toBeInstanceOf(QueryFilterError);
    expect(adapter.calls.find).toHaveLength(0);
    expect(adapter.snapshot()).toHaveLength(1);
  });

  it('matches equality, ranges, in/nin, and nested logical selectors over stored dates', async () => {
    const { conn, M } = await seedMemory('read');
    try {
      expect(
        (
          (await M.find({ born: new Date(D1.getTime()) } as any)
            .lean()
            .exec()) as any[]
        ).map((d) => d.name),
      ).toEqual(['a']);
      expect(
        (
          (await M.find({ born: D1.toISOString() } as any)
            .lean()
            .exec()) as any[]
        ).map((d) => d.name),
      ).toEqual(['a']);

      const ranged = (await M.find({ born: { $gte: new Date(D2.getTime()), $lte: new Date(D3.getTime()) } } as any)
        .lean()
        .exec()) as any[];
      expect(ranged.map((d) => d.name).sort()).toEqual(['b', 'c']);

      const inned = (await M.find({ born: { $in: [new Date(D1.getTime()), new Date(D3.getTime())] } } as any)
        .lean()
        .exec()) as any[];
      expect(inned.map((d) => d.name).sort()).toEqual(['a', 'c']);

      const ninned = (await M.find({ born: { $nin: [new Date(D1.getTime())] } } as any)
        .lean()
        .exec()) as any[];
      expect(ninned.map((d) => d.name).sort()).toEqual(['b', 'c']);

      const logical = (await M.find({
        $or: [{ born: new Date(D1.getTime()) }, { born: { $gt: new Date(D2.getTime()) } }],
      } as any)
        .lean()
        .exec()) as any[];
      expect(logical.map((d) => d.name).sort()).toEqual(['a', 'c']);

      expect(await M.countDocuments({ born: { $gte: new Date(D2.getTime()) } } as any).exec()).toBe(2);
    } finally {
      await conn.disconnect();
    }
  });

  it('applies date predicates to update/delete and keeps builder raw Dates with hydrated Dates', async () => {
    const { conn, M } = await seedMemory('write');
    try {
      const dateOperand = new Date(D1.getTime());
      const q = M.find({ born: dateOperand } as any);
      expect((q.getFilter() as any).born).toBeInstanceOf(Date);
      expect((q.getFilter() as any).born).not.toBe(dateOperand);
      expect(((await q.lean().exec()) as any[]).map((d) => d.name)).toEqual(['a']);

      const updated = await M.updateMany(
        { born: new Date(D1.getTime()) } as any,
        { $set: { name: 'a2' } } as any,
      ).exec();
      expect(updated).toMatchObject({ matchedCount: 1, modifiedCount: 1 });
      expect(
        (
          (await M.find({ born: new Date(D1.getTime()) } as any)
            .lean()
            .exec()) as any[]
        )[0].name,
      ).toBe('a2');

      const deleted = await M.deleteMany({ born: { $gte: new Date(D3.getTime()) } } as any).exec();
      expect(deleted).toEqual({ deletedCount: 1 });
      expect(await M.countDocuments({} as any).exec()).toBe(2);

      const created = await M.create({ name: 'd', born: new Date(D3.getTime()) } as any);
      expect(created.toObject().born).toBeInstanceOf(Date);
      const reloaded = await M.findById(created._id);
      expect(reloaded!.toObject().born).toBeInstanceOf(Date);
      expect((reloaded!.toObject().born as Date).getTime()).toBe(D3.getTime());
    } finally {
      await conn.disconnect();
    }
  });

  it('matches date selectors under SQLite when a backend is available', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bmrx23-sqlite-'));
    const conn = new Connection();
    try {
      await conn.connect(() =>
        createSqliteDatabase({ name: `bmrx23_sqlite_${Date.now()}`, filePath: join(dir, 'dates.db') }),
      );
    } catch (error) {
      if (error instanceof SqliteStorageError) {
        console.warn(
          '[bmrx23] no supported SQLite backend available; verified fail-closed behavior and skipped SQLite date contract',
        );
        return;
      }
      throw error;
    }
    try {
      const suffix = Date.now();
      const M = conn.model<DateDoc>(`Bmrx23Sqlite${suffix}`, makeSchema(), `bmrx23_sqlite_${suffix}`);
      await M.create({ name: 'a', born: D1 } as any);
      await M.create({ name: 'b', born: D2 } as any);
      expect(
        (
          (await M.find({ born: new Date(D1.getTime()) } as any)
            .lean()
            .exec()) as any[]
        ).map((d) => d.name),
      ).toEqual(['a']);
      const ranged = (await M.find({ born: { $gte: new Date(D1.getTime()), $lte: new Date(D2.getTime()) } } as any)
        .lean()
        .exec()) as any[];
      expect(ranged).toHaveLength(2);
      expect(await M.countDocuments({ born: { $gt: new Date(D1.getTime()) } } as any).exec()).toBe(1);
    } finally {
      await conn.disconnect();
    }
  }, 30_000);
});
