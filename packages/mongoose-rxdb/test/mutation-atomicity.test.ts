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

function makeCounterSchema(): Schema<CounterDoc> {
  return new Schema<CounterDoc>({ name: String, n: Number, a: Number, b: Number });
}

function nextSuffix(): string {
  unique += 1;
  return `${Date.now()}_${unique}`;
}
