import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { Connection, Schema } from '../src/index';
import { createMemoryDatabase, createSqliteDatabase, SqliteStorageError } from '../src/storage/index';

interface CounterDoc {
  name: string;
  n: number;
  a: number;
  b: number;
}

let unique = 0;
const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe('MRX-06 atomic query mutations', () => {
  it('applies fifty concurrent increments under memory storage without losing writes', async () => {
    const conn = new Connection();
    const suffix = nextSuffix();
    await conn.connect(() => createMemoryDatabase({ name: `mrx06_memory_${suffix}` }));
    try {
      const Counter = conn.model<CounterDoc>('CounterMemory', makeCounterSchema(), `mrx06_memory_counters_${suffix}`);
      const created = await Counter.create({ name: 'counter', n: 0, a: 0, b: 0 });

      await Promise.all(
        Array.from({ length: 50 }, () => Counter.updateOne({ _id: created._id } as any, { $inc: { n: 1 } }).exec()),
      );

      const after = await Counter.findById(created._id);
      expect(after?.n).toBe(50);
    } finally {
      await conn.disconnect();
    }
  });

  it('preserves concurrent updates to different fields under memory storage', async () => {
    const conn = new Connection();
    const suffix = nextSuffix();
    await conn.connect(() => createMemoryDatabase({ name: `mrx06_fields_${suffix}` }));
    try {
      const Counter = conn.model<CounterDoc>('CounterFields', makeCounterSchema(), `mrx06_fields_counters_${suffix}`);
      const created = await Counter.create({ name: 'fields', n: 0, a: 0, b: 0 });

      await Promise.all([
        Counter.updateOne({ _id: created._id } as any, { $set: { a: 1 } }).exec(),
        Counter.updateOne({ _id: created._id } as any, { $set: { b: 1 } }).exec(),
      ]);

      const after = await Counter.findById(created._id);
      expect(after?.a).toBe(1);
      expect(after?.b).toBe(1);
    } finally {
      await conn.disconnect();
    }
  });

  it('applies fifty concurrent increments under SQLite when a supported backend is available', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mrx06-sqlite-'));
    tempDirs.push(dir);
    const suffix = nextSuffix();
    const conn = new Connection();
    try {
      await conn.connect(() =>
        createSqliteDatabase({ name: `mrx06_sqlite_${suffix}`, filePath: join(dir, 'counter.db') }),
      );
    } catch (error) {
      if (error instanceof SqliteStorageError) {
        expect(error.causes.some((cause) => cause.backend === 'memory')).toBe(false);
        console.warn(
          '[mrx06] no supported SQLite backend available; verified fail-closed behavior and skipped SQLite concurrency check',
        );
        return;
      }
      throw error;
    }

    try {
      expect(conn.ready().sqliteStorageInfo?.backend).not.toBe('memory');
      const Counter = conn.model<CounterDoc>('CounterSqlite', makeCounterSchema(), `mrx06_sqlite_counters_${suffix}`);
      const created = await Counter.create({ name: 'counter', n: 0, a: 0, b: 0 });

      await Promise.all(
        Array.from({ length: 50 }, () => Counter.updateOne({ _id: created._id } as any, { $inc: { n: 1 } }).exec()),
      );

      const after = await Counter.findById(created._id);
      expect(after?.n).toBe(50);
    } finally {
      await conn.disconnect();
    }
  }, 20_000);
});

describe('BMRX-07 atomic conditional mutations and preimages', () => {
  it('permits only one successful claim for concurrent conditional increments', async () => {
    const conn = new Connection();
    const suffix = nextSuffix();
    await conn.connect(() => createMemoryDatabase({ name: `bmrx07_claim_${suffix}` }));
    try {
      const Counter = conn.model<CounterDoc>('CounterClaim', makeCounterSchema(), `bmrx07_claim_counters_${suffix}`);
      const created = await Counter.create({ name: 'one', n: 0, a: 0, b: 0 });

      const results = await Promise.all(
        Array.from({ length: 3 }, () =>
          Counter.updateOne({ _id: created._id, n: 0 } as any, { $inc: { n: 1 } }).exec(),
        ),
      );

      const matched = results.filter((r) => r.matchedCount === 1);
      expect(matched).toHaveLength(1);
      expect(results.filter((r) => r.matchedCount === 0)).toHaveLength(2);
      const after = await Counter.findById(created._id);
      expect(after?.n).toBe(1);
    } finally {
      await conn.disconnect();
    }
  });

  it('returns truthful before/after preimages for concurrent unconditional increments', async () => {
    const conn = new Connection();
    const suffix = nextSuffix();
    await conn.connect(() => createMemoryDatabase({ name: `bmrx07_preimage_${suffix}` }));
    try {
      const Counter = conn.model<CounterDoc>(
        'CounterPreimage',
        makeCounterSchema(),
        `bmrx07_preimage_counters_${suffix}`,
      );
      const created = await Counter.create({ name: 'one', n: 0, a: 0, b: 0 });

      const befores = await Promise.all(
        Array.from({ length: 3 }, () =>
          Counter.findOneAndUpdate({ _id: created._id } as any, { $inc: { n: 1 } }).exec(),
        ),
      );

      const beforeValues = (befores as any[]).map((d) => d?.n).sort((x: number, y: number) => x - y);
      expect(beforeValues).toEqual([0, 1, 2]);
      const after = await Counter.findById(created._id);
      expect(after?.n).toBe(3);
    } finally {
      await conn.disconnect();
    }
  });

  it('permits only one conditional findOneAndUpdate claim with committed before/after', async () => {
    const conn = new Connection();
    const suffix = nextSuffix();
    await conn.connect(() => createMemoryDatabase({ name: `bmrx07_fou_${suffix}` }));
    try {
      const Counter = conn.model<CounterDoc>('CounterFou', makeCounterSchema(), `bmrx07_fou_counters_${suffix}`);
      const created = await Counter.create({ name: 'one', n: 0, a: 0, b: 0 });

      const results = await Promise.all(
        Array.from({ length: 3 }, () =>
          Counter.findOneAndUpdate({ _id: created._id, n: 0 } as any, { $inc: { n: 1 } }, { new: true }).exec(),
        ),
      );

      const claimed = results.filter((d) => d !== null);
      expect(claimed).toHaveLength(1);
      expect((claimed[0] as any)?.n).toBe(1);
      const after = await Counter.findById(created._id);
      expect(after?.n).toBe(1);
    } finally {
      await conn.disconnect();
    }
  });

  it('keeps updateMany predicate correctness with truthful counts', async () => {
    const conn = new Connection();
    const suffix = nextSuffix();
    await conn.connect(() => createMemoryDatabase({ name: `bmrx07_many_${suffix}` }));
    try {
      const Counter = conn.model<CounterDoc>('CounterMany', makeCounterSchema(), `bmrx07_many_counters_${suffix}`);
      await Counter.create({ name: 'a', n: 0, a: 0, b: 0 });
      await Counter.create({ name: 'b', n: 0, a: 0, b: 0 });
      await Counter.create({ name: 'c', n: 5, a: 0, b: 0 });

      const result = await Counter.updateMany({ n: 0 } as any, { $inc: { n: 1 } }).exec();
      expect(result.matchedCount).toBe(2);
      expect(result.modifiedCount).toBe(2);
      const docs = await Counter.find({}).exec();
      const byName = new Map(docs.map((d: any) => [d.name, d.n]));
      expect(byName.get('a')).toBe(1);
      expect(byName.get('b')).toBe(1);
      expect(byName.get('c')).toBe(5);

      const stale = await Counter.updateOne({ n: 999 } as any, { $inc: { n: 1 } }).exec();
      expect(stale.matchedCount).toBe(0);
      expect(stale.modifiedCount).toBe(0);
    } finally {
      await conn.disconnect();
    }
  });

  it('leaves non-matching deletes untouched with truthful counts', async () => {
    const conn = new Connection();
    const suffix = nextSuffix();
    await conn.connect(() => createMemoryDatabase({ name: `bmrx07_del_${suffix}` }));
    try {
      const Counter = conn.model<CounterDoc>('CounterDel', makeCounterSchema(), `bmrx07_del_counters_${suffix}`);
      const created = await Counter.create({ name: 'one', n: 1, a: 0, b: 0 });

      const missed = await Counter.deleteOne({ _id: created._id, n: 0 } as any).exec();
      expect(missed.deletedCount).toBe(0);
      expect(await Counter.findById(created._id)).not.toBeNull();

      const hit = await Counter.deleteOne({ _id: created._id, n: 1 } as any).exec();
      expect(hit.deletedCount).toBe(1);
      expect(await Counter.findById(created._id)).toBeNull();
    } finally {
      await conn.disconnect();
    }
  });
});

function makeCounterSchema(): Schema<CounterDoc> {
  return new Schema<CounterDoc>({ name: String, n: Number, a: Number, b: Number });
}

function nextSuffix(): string {
  unique += 1;
  return `${Date.now()}_${unique}`;
}
