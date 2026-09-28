import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Connection, Schema, type FilterQuery, type Model } from '../src/index';
import type { InternalModelRuntime } from '../src/model';
import { createMemoryDatabase, createSqliteDatabase, SqliteStorageError } from '../src/storage/index';
import { createBarrier } from './support/async';

interface Job {
  key: string;
  state: string;
  n: number;
}
type Mode = 'updateOne' | 'before' | 'after';
const modes: Mode[] = ['updateOne', 'before', 'after'];
let sequence = 0;

function upsert(model: Model<Job>, mode: Mode, explicitId: boolean, state = 'claimed') {
  const filter: FilterQuery<Job> = {
    key: 'job',
    state: 'ready',
    n: { $lt: 5 },
    ...(explicitId ? { _id: 'a' } : {}),
  };
  const update = { $set: { state }, $inc: { n: 1 } };
  return mode === 'updateOne'
    ? model.updateOne(filter, update, { upsert: true, sort: { _id: 1 } }).exec()
    : model.findOneAndUpdate(filter, update, { upsert: true, sort: { _id: 1 }, returnDocument: mode }).exec();
}

function expectInserted(result: any, mode: Mode, id: string, state = 'claimed') {
  if (mode === 'updateOne') {
    expect(result).toEqual({ matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: id });
  } else if (mode === 'before') {
    expect(result).toBeNull(); // Null does not mean that no insertion occurred.
  } else {
    expect(result.toObject()).toEqual({ _id: id, key: 'job', state, n: 1 });
  }
}

async function noMatchRace(model: Model<Job>, mode: Mode, explicitId: boolean) {
  const adapter = await (model as InternalModelRuntime<Job>).resolveCollection!();
  const insert = adapter.insert.bind(adapter);
  const gate = createBarrier(2);
  // Both native selecting reads have returned no match before either native insert starts.
  const insertSpy = vi.spyOn(adapter, 'insert').mockImplementation(async (record) => {
    await gate.wait();
    return insert(record);
  });
  const pending = Promise.allSettled([
    upsert(model, mode, explicitId, 'ready'),
    upsert(model, mode, explicitId, 'ready'),
  ]);
  try {
    try {
      await gate.allEntered;
      expect(insertSpy).toHaveBeenCalledTimes(2);
    } finally {
      gate.release();
    }
    const results = await pending;
    const rows = await model.find().lean();
    if (explicitId) {
      expect(rows).toEqual([{ _id: 'a', key: 'job', state: 'ready', n: 1 }]);
      const fulfilled = results.filter((result) => result.status === 'fulfilled');
      const rejected = results.filter((result) => result.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expectInserted(fulfilled[0].value, mode, 'a', 'ready');
      // Native RxDB insert conflict is propagated; no package retry-as-update occurs.
      expect(rejected[0].reason).toMatchObject({ code: 'CONFLICT', parameters: { id: 'a' } });
    } else {
      expect(rows).toHaveLength(2);
      expect(new Set(rows.map((row) => row._id)).size).toBe(2);
      for (const result of results) {
        expect(result.status).toBe('fulfilled');
        if (result.status === 'fulfilled') {
          const value = result.value as any;
          const id = mode === 'before' ? rows[0]._id! : (value.upsertedId ?? value._id);
          expect(rows.some((row) => row._id === id)).toBe(true);
          expectInserted(value, mode, id, 'ready');
        }
      }
      for (const row of rows) expect(row).toMatchObject({ key: 'job', state: 'ready', n: 1 });
    }
    // Both inserts match the original filter: duplicates are caused by the race,
    // not by changing a field that a subsequent serialized call could not match.
    expect(await model.countDocuments({ key: 'job', state: 'ready', n: { $lt: 5 } })).toBe(explicitId ? 1 : 2);
  } finally {
    await pending;
    insertSpy.mockRestore();
  }
}

async function losingPredicate(model: Model<Job>, native: any, mode: Mode, explicitId: boolean) {
  await model.create([
    { _id: 'a', key: 'job', state: 'ready', n: 0 },
    { _id: 'b', key: 'job', state: 'ready', n: 0 },
  ]);
  const selected = await native.findOne('a').exec();
  const original = selected.incrementalModify.bind(selected);
  const gate = createBarrier(1);
  const attempts: any[] = [];
  const retrySpy = vi.spyOn(selected, 'incrementalModify').mockImplementation((fn: any) =>
    original(async (current: any) => {
      attempts.push({ state: current.state, n: current.n });
      const next = await fn(current);
      if (attempts.length === 1) await gate.wait();
      return next;
    }),
  );
  const selectionSpy = vi.spyOn(native, 'findOne');
  const pending = Promise.allSettled([upsert(model, mode, explicitId)]);
  try {
    try {
      await gate.allEntered;
      // A genuine competing revision forces the incremental writer to retry its predicate.
      await selected.patch({ state: 'blocked', n: 10 });
    } finally {
      gate.release();
    }
    const [result] = await pending;
    expect(attempts.length).toBeGreaterThanOrEqual(2);
    expect(attempts[0]).toEqual({ state: 'ready', n: 0 });
    expect(attempts.at(-1)).toEqual({ state: 'blocked', n: 10 });
    expect(selectionSpy).toHaveBeenCalledTimes(1); // Never select the still-eligible b.
    const rows = await model.find().lean();
    expect(rows.find((row) => row._id === 'a')).toEqual({ _id: 'a', key: 'job', state: 'blocked', n: 10 });
    expect(rows.find((row) => row._id === 'b')).toEqual({ _id: 'b', key: 'job', state: 'ready', n: 0 });
    if (explicitId) {
      expect(rows).toHaveLength(2);
      expect(result.status).toBe('rejected');
      if (result.status === 'rejected') {
        expect(result.reason).toMatchObject({ code: 'CONFLICT', parameters: { id: 'a' } });
      }
    } else {
      expect(rows).toHaveLength(3);
      const inserted = rows.find((row) => row._id !== 'a' && row._id !== 'b')!;
      expect(inserted).toMatchObject({ key: 'job', state: 'claimed', n: 1 });
      expect(result.status).toBe('fulfilled');
      if (result.status === 'fulfilled') expectInserted(result.value, mode, inserted._id!);
    }
  } finally {
    await pending;
    retrySpy.mockRestore();
    selectionSpy.mockRestore();
  }
}

describe.each(['memory', 'sqlite'] as const)('RMRX-07 native %s upsert characterization', (backend) => {
  for (const mode of modes) {
    for (const explicitId of [false, true]) {
      it.each(['no-match race', 'predicate lost on retry'] as const)(
        `${mode}, ${explicitId ? 'same explicit ID' : 'generated IDs'}: %s`,
        async (scenario, context) => {
          const conn = new Connection();
          const dir = backend === 'sqlite' ? mkdtempSync(join(tmpdir(), 'rmrx07-')) : undefined;
          const name = `rmrx07_${Date.now()}_${++sequence}`;
          try {
            let db;
            try {
              db =
                backend === 'memory'
                  ? await createMemoryDatabase({ name })
                  : await createSqliteDatabase({ name, filePath: join(dir!, 'upsert.db') });
            } catch (error) {
              if (!(error instanceof SqliteStorageError)) throw error;
              console.warn('[rmrx07] SQLite unavailable:', error.causes);
              context.skip();
              return;
            }
            await conn.connect(() => Promise.resolve(db));
            if (backend === 'sqlite') {
              expect((db as any).sqliteStorageInfo).toMatchObject({ persistent: true });
              expect((db as any).sqliteBackend).not.toBe('memory');
            }
            const model = conn.model('Job', new Schema<Job>({ key: String, state: String, n: Number }), 'jobs');
            await (model as InternalModelRuntime<Job>).resolveCollection!();
            if (scenario === 'no-match race') await noMatchRace(model, mode, explicitId);
            else await losingPredicate(model, db.collections.jobs, mode, explicitId);
          } finally {
            try {
              await conn.disconnect();
            } finally {
              if (dir) rmSync(dir, { recursive: true, force: true });
            }
          }
        },
        15_000,
      );
    }
  }
});
