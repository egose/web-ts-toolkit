import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BulkWritePartialFailureError, Connection, Schema } from '../src/index';
import { createMemoryDatabase, createSqliteDatabase, SqliteStorageError } from '../src/storage/index';

interface BulkDoc {
  name: string;
  n: number;
}

const tempDirs: string[] = [];
let unique = 0;

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function nextSuffix(): string {
  unique += 1;
  return `${Date.now()}_${unique}_${Math.random().toString(36).slice(2)}`;
}

function makeSchema(): Schema<BulkDoc> {
  return new Schema<BulkDoc>({ name: String, n: Number });
}

function nativeBulkCounter(adapter: unknown): { get(): number } {
  const native = (adapter as any).rxCollection ?? (adapter as any)['rxCollection'];
  if (!native || typeof native.bulkInsert !== 'function') throw new Error('native bulkInsert not available');
  let calls = 0;
  const original = native.bulkInsert.bind(native);
  native.bulkInsert = async (...args: any[]) => {
    calls += 1;
    return original(...args);
  };
  return { get: () => calls };
}

describe('BMRX-22 unordered bulk duplicates', () => {
  it('persists the first duplicate and unrelated IDs with exact failed indexes on real memory', async () => {
    const conn = new Connection();
    await conn.connect(() => createMemoryDatabase({ name: `bmrx22_dup_${nextSuffix()}` }));
    try {
      const suffix = nextSuffix();
      const Model = conn.model<BulkDoc>(`Bmrx22Dup${suffix}`, makeSchema(), `bmrx22_dup_${suffix}`);
      await Model.insertMany([{ _id: 'existing', name: 'Existing', n: 0 } as any]);
      const adapter = await Model.resolveCollection!();
      const counter = nativeBulkCounter(adapter);

      const error = await Model.insertMany(
        [
          { _id: 'dup', name: 'first', n: 1 },
          { _id: 'dup', name: 'second', n: 2 },
          { _id: 'unrelated', name: 'Unrelated', n: 3 },
        ] as any,
        { ordered: false },
      ).catch((err) => err);

      expect(error).toBeInstanceOf(BulkWritePartialFailureError);
      expect(error.ordered).toBe(false);
      expect(error.insertedCount).toBe(2);
      expect([...error.insertedIds].sort()).toEqual(['dup', 'unrelated']);
      expect(error.errors.map((entry: { index: number }) => entry.index)).toEqual([1]);
      expect(counter.get()).toBe(2);

      const stored = ((await Model.find({}).lean().exec()) as BulkDoc[] & { _id: string }[])
        .map((d: any) => d._id)
        .sort();
      expect(stored).toEqual(['dup', 'existing', 'unrelated']);
      const winner = await Model.findById('dup');
      expect(winner?.name).toBe('first');
    } finally {
      await conn.disconnect();
    }
  });

  it('combines within-batch duplicates with existing-ID conflicts on real memory', async () => {
    const conn = new Connection();
    await conn.connect(() => createMemoryDatabase({ name: `bmrx22_mix_${nextSuffix()}` }));
    try {
      const suffix = nextSuffix();
      const Model = conn.model<BulkDoc>(`Bmrx22Mix${suffix}`, makeSchema(), `bmrx22_mix_${suffix}`);
      await Model.insertMany([{ _id: 'existing', name: 'Existing', n: 0 } as any]);
      const adapter = await Model.resolveCollection!();
      const counter = nativeBulkCounter(adapter);

      const error = await Model.insertMany(
        [
          { _id: 'dup', name: 'first', n: 1 },
          { _id: 'existing', name: 'Conflict', n: 2 },
          { _id: 'valid', name: 'Valid', n: 3 },
          { _id: 'dup', name: 'second', n: 4 },
        ] as any,
        { ordered: false },
      ).catch((err) => err);

      expect(error).toBeInstanceOf(BulkWritePartialFailureError);
      expect(error.ordered).toBe(false);
      expect(error.insertedCount).toBe(2);
      expect([...error.insertedIds].sort()).toEqual(['dup', 'valid']);
      expect(error.errors.map((entry: { index: number }) => entry.index)).toEqual([1, 3]);
      expect(counter.get()).toBe(2);

      const stored = ((await Model.find({}).lean().exec()) as any[]).map((d: any) => d._id).sort();
      expect(stored).toEqual(['dup', 'existing', 'valid']);
      expect((await Model.findById('dup'))?.name).toBe('first');
      expect((await Model.findById('existing'))?.name).toBe('Existing');
    } finally {
      await conn.disconnect();
    }
  });

  it('preserves ordered stop-at-first-failure with duplicates on real memory', async () => {
    const conn = new Connection();
    await conn.connect(() => createMemoryDatabase({ name: `bmrx22_ord_${nextSuffix()}` }));
    try {
      const suffix = nextSuffix();
      const Model = conn.model<BulkDoc>(`Bmrx22Ord${suffix}`, makeSchema(), `bmrx22_ord_${suffix}`);

      const error = await Model.insertMany(
        [
          { _id: 'valid', name: 'Valid', n: 0 },
          { _id: 'dup', name: 'first', n: 1 },
          { _id: 'dup', name: 'second', n: 2 },
          { _id: 'later', name: 'Later', n: 3 },
        ] as any,
        { ordered: true },
      ).catch((err) => err);

      expect(error).toBeInstanceOf(BulkWritePartialFailureError);
      expect(error.ordered).toBe(true);
      expect(error.insertedCount).toBe(2);
      expect(error.errors.map((entry: { index: number }) => entry.index)).toEqual([2]);

      const stored = ((await Model.find({}).lean().exec()) as any[]).map((d: any) => d._id).sort();
      expect(stored).toEqual(['dup', 'valid']);
    } finally {
      await conn.disconnect();
    }
  });

  for (const size of [1, 100, 1_000]) {
    it(
      `keeps native bulkInsert calls bounded at size ${size} with one within-batch duplicate`,
      async () => {
        const conn = new Connection();
        await conn.connect(() => createMemoryDatabase({ name: `bmrx22_size_${size}_${nextSuffix()}` }));
        try {
          const suffix = nextSuffix();
          const Model = conn.model<BulkDoc>(
            `Bmrx22Size${size}${suffix}`,
            makeSchema(),
            `bmrx22_size_${size}_${suffix}`,
          );
          const adapter = await Model.resolveCollection!();
          const counter = nativeBulkCounter(adapter);

          const docs = Array.from({ length: size }, (_, index) => ({
            _id: `u${index}`,
            name: `User ${index}`,
            n: index,
          }));
          const batch = [...docs, { _id: 'u0', name: 'Duplicate of first', n: -1 }];

          const error = await Model.insertMany(batch as any, { ordered: false }).catch((err) => err);
          expect(error).toBeInstanceOf(BulkWritePartialFailureError);
          expect(error.insertedCount).toBe(size);
          expect(error.errors.map((entry: { index: number }) => entry.index)).toEqual([size]);
          // One pass holds every unique ID, the second holds only the repeated occurrence.
          expect(counter.get()).toBe(2);

          // Unique batches of the same sizes use a single native call.
          const conn2 = new Connection();
          await conn2.connect(() => createMemoryDatabase({ name: `bmrx22_unique_${size}_${nextSuffix()}` }));
          try {
            const suffix2 = nextSuffix();
            const Model2 = conn2.model<BulkDoc>(
              `Bmrx22Unique${size}${suffix2}`,
              makeSchema(),
              `bmrx22_unique_${size}_${suffix2}`,
            );
            const adapter2 = await Model2.resolveCollection!();
            const counter2 = nativeBulkCounter(adapter2);
            const inserted = await Model2.insertMany(docs as any, { ordered: false });
            expect(inserted).toHaveLength(size);
            expect(counter2.get()).toBe(1);
          } finally {
            await conn2.disconnect();
          }
        } finally {
          await conn.disconnect();
        }
      },
      size >= 1000 ? 30_000 : 10_000,
    );
  }

  it('preserves unordered duplicate outcomes under SQLite when available', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bmrx22-sqlite-'));
    tempDirs.push(dir);
    const conn = new Connection();
    try {
      await conn.connect(() =>
        createSqliteDatabase({ name: `bmrx22_sqlite_${nextSuffix()}`, filePath: join(dir, 'bulk.db') }),
      );
    } catch (error) {
      if (error instanceof SqliteStorageError) {
        console.warn(
          '[bmrx22] no supported SQLite backend available; verified fail-closed behavior and skipped SQLite bulk contract',
        );
        return;
      }
      throw error;
    }
    try {
      const suffix = nextSuffix();
      const Model = conn.model<BulkDoc>(`Bmrx22Sqlite${suffix}`, makeSchema(), `bmrx22_sqlite_${suffix}`);
      await Model.insertMany([{ _id: 'existing', name: 'Existing', n: 0 } as any]);
      const error = await Model.insertMany(
        [
          { _id: 'dup', name: 'first', n: 1 },
          { _id: 'existing', name: 'Conflict', n: 2 },
          { _id: 'valid', name: 'Valid', n: 3 },
          { _id: 'dup', name: 'second', n: 4 },
        ] as any,
        { ordered: false },
      ).catch((err) => err);
      expect(error).toBeInstanceOf(BulkWritePartialFailureError);
      expect(error.insertedCount).toBe(2);
      expect(error.errors.map((entry: { index: number }) => entry.index)).toEqual([1, 3]);
      const stored = ((await Model.find({}).lean().exec()) as any[]).map((d: any) => d._id).sort();
      expect(stored).toEqual(['dup', 'existing', 'valid']);
    } finally {
      await conn.disconnect();
    }
  }, 30_000);
});
