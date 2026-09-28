import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { compileQuery, QueryFilterError } from '../src/query-compiler';
import { matchesSelector, RxCollectionAdapter, type PersistenceRecord } from '../src/rx-adapter';
import { createMemoryDatabase, createSqliteDatabase, SqliteStorageError } from '../src/storage/index';
import { createBarrier } from './support/async';

const records: PersistenceRecord[] = [
  {
    _id: 'a',
    tags: ['ready', 'blocked'],
    nullable: null,
    profile: { code: 'ready' },
    members: [{ code: 'ready' }, { code: 'blocked' }],
    text: '2026-01-01T00:00:00+02:00',
    born: '2026-01-01T00:00:00.000Z',
    n: 0,
  },
  {
    _id: 'b',
    tags: ['ready'],
    profile: { code: 'other' },
    members: [{ code: 'other' }],
    text: '2026-01-01T00:00:00.000Z',
    born: '2026-01-02T00:00:00.000Z',
    n: 0,
  },
  { _id: 'c', tags: [], nullable: 'present', members: [], text: 'ordinary', n: 0 },
];

const cases: Array<[string, Record<string, any>, string[]]> = [
  ['array scalar eq', { tags: { $eq: 'ready' } }, ['a', 'b']],
  ['array scalar ne', { tags: { $ne: 'blocked' } }, ['b', 'c']],
  ['array in', { tags: { $in: ['blocked'] } }, ['a']],
  ['array nin', { tags: { $nin: ['blocked'] } }, ['b', 'c']],
  ['whole array equality', { tags: { $eq: ['ready'] } }, ['b']],
  ['null eq includes missing', { nullable: { $eq: null } }, ['a', 'b']],
  ['null ne excludes missing', { nullable: { $ne: null } }, ['c']],
  ['null in includes missing', { nullable: { $in: [null] } }, ['a', 'b']],
  ['null nin excludes missing', { nullable: { $nin: [null] } }, ['c']],
  ['exists includes null', { nullable: { $exists: true } }, ['a', 'c']],
  ['missing exists', { nullable: { $exists: false } }, ['b']],
  ['dotted object', { 'profile.code': 'ready' }, ['a']],
  ['dotted array traversal', { 'members.code': 'ready' }, ['a']],
  ['dotted array nin', { 'members.code': { $nin: ['blocked'] } }, ['b', 'c']],
  ['numeric object array path', { 'members.1.code': 'blocked' }, ['a']],
  ['numeric primitive array path', { 'tags.0': 'ready' }, ['a', 'b']],
  ['missing numeric path', { 'members.1.code': { $exists: false } }, ['b', 'c']],
  ['string ordering is lexical', { text: { $lt: '2026-01-01T00:00:00.000Z' } }, ['a']],
  ['date-looking strings are not parsed', { text: { $gt: '2025-12-31T23:00:00.000Z' } }, ['a', 'b', 'c']],
  ['string equality is literal', { text: '2025-12-31T22:00:00.000Z' }, []],
  ['normalized Date equality', { born: new Date('2026-01-01T02:00:00+02:00') }, ['a']],
  ['normalized Date range', { born: { $gte: new Date('2026-01-02T00:00:00Z') } }, ['b']],
  ['normalized Date membership', { born: { $in: [new Date('2026-01-01T00:00:00Z')] } }, ['a']],
  ['normalized Date nin', { born: { $nin: [new Date('2026-01-01T00:00:00Z')] } }, ['b', 'c']],
  [
    'and/or/nor',
    { $and: [{ $or: [{ tags: 'blocked' }, { nullable: 'present' }] }, { $nor: [{ 'profile.code': 'other' }] }] },
    ['a', 'c'],
  ],
  ['combined numeric comparisons', { n: { $gt: -1, $gte: 0, $lt: 1, $lte: 0 } }, ['a', 'b', 'c']],
];

let unique = 0;
function name() {
  return `rmrx02_${Date.now()}_${++unique}`;
}

async function seed(db: any) {
  const { items } = await db.addCollections({
    items: {
      schema: {
        version: 0,
        primaryKey: '_id',
        type: 'object',
        properties: {
          _id: { type: 'string', maxLength: 100 },
          tags: { type: 'array', items: { type: 'string' } },
          nullable: { type: ['string', 'null'] },
          profile: { type: 'object', properties: { code: { type: 'string' } } },
          members: { type: 'array', items: { type: 'object', properties: { code: { type: 'string' } } } },
          text: { type: 'string' },
          born: { type: 'string' },
          n: { type: 'number' },
        },
        required: ['_id', 'n'],
      },
    },
  });
  expect((await items.bulkInsert(structuredClone(records))).error).toHaveLength(0);
  return items;
}

async function parity(native: any, filter: Record<string, any>, expected: string[]) {
  const compiled = compileQuery(filter);
  const adapter = new RxCollectionAdapter(native);
  // The oracle is a real native read, never a fake adapter's local matcher.
  const read = await native.find({ selector: compiled.selector }).exec();
  expect(read.map((doc: any) => doc.primary).sort()).toEqual(expected);
  const all = await adapter.find(compileQuery({}));
  const result = await adapter.updateMany(compiled, (doc) => ({ ...doc, n: Number(doc.n) + 1 }));
  expect(result).toEqual({ matchedCount: expected.length, modifiedCount: expected.length });
  expect(
    all
      .filter((doc) => matchesSelector(doc, compiled.selector))
      .map((doc) => doc._id)
      .sort(),
  ).toEqual(expected);
  const after = await adapter.find(compileQuery({}));
  for (const doc of after) {
    const before = all.find((entry) => entry._id === doc._id)!;
    expect(doc.n).toBe(Number(before.n) + (expected.includes(doc._id) ? 1 : 0));
  }
  const noop = await adapter.findOneAndUpdate(compiled, (doc) => doc);
  // The numeric case changes its own predicate, so use the current read as oracle here.
  const currentRead = await native.findOne({ selector: compiled.selector }).exec();
  expect(noop.matchedCount).toBe(currentRead ? 1 : 0);
  expect(noop.modifiedCount).toBe(0);
  expect(noop.after).toEqual(noop.before);
  expect(noop.before?._id ?? null).toBe(currentRead?.primary ?? null);
}

describe('RMRX-02 native selector recheck parity', () => {
  it.each(cases)('real memory: %s', async (_label, filter, expected) => {
    const db = await createMemoryDatabase({ name: name() });
    try {
      await parity(await seed(db), filter, expected);
    } finally {
      await db.close();
    }
  });

  it.each(['deleteOne', 'deleteMany', 'findOneAndDelete'] as const)(
    'real memory: %s rechecks array membership',
    async (operation) => {
      const db = await createMemoryDatabase({ name: name() });
      try {
        const native = await seed(db);
        const adapter = new RxCollectionAdapter(native);
        const result = await adapter[operation](compileQuery({ tags: { $eq: 'blocked' } }));
        expect(result).toMatchObject(operation === 'findOneAndDelete' ? { _id: 'a' } : { deletedCount: 1 });
        expect((await adapter.find(compileQuery({}))).map((doc) => doc._id).sort()).toEqual(['b', 'c']);
      } finally {
        await db.close();
      }
    },
  );

  it.each(['updateOne', 'findOneAndUpdate'] as const)(
    'real memory: %s loses a $nin claim on native conflict retry',
    async (operation) => {
      const db = await createMemoryDatabase({ name: name() });
      try {
        await losingClaim(await seed(db), operation);
      } finally {
        await db.close();
      }
    },
  );

  it('runs the same predicate matrix and native conflict claim under supported SQLite', async (context) => {
    const dir = mkdtempSync(join(tmpdir(), 'rmrx02-sqlite-'));
    let db: any;
    try {
      try {
        db = await createSqliteDatabase({ name: name(), filePath: join(dir, 'selectors.db') });
      } catch (error) {
        if (!(error instanceof SqliteStorageError)) throw error;
        console.warn('[rmrx02] SQLite unavailable:', error.causes);
        context.skip();
        return;
      }
      expect(db.sqliteStorageInfo).toMatchObject({ persistent: true });
      expect(db.sqliteStorageInfo.backend).not.toBe('memory');
      console.info(`[rmrx02] SQLite predicate backend: ${db.sqliteStorageInfo.backend}`);
      const native = await seed(db);
      for (const [, filter, expected] of cases) {
        // Reset the counter so the numeric predicate has the same initial state.
        await new RxCollectionAdapter(native).updateMany(compileQuery({}), (doc) => ({ ...doc, n: 0 }));
        await parity(native, filter, expected);
      }
      await losingClaim(native, 'findOneAndUpdate');
    } finally {
      if (db) await db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it.each([{ tags: { $elemMatch: { $eq: 'blocked' } } }, { text: { $regex: '2026' } }, { $where: 'true' }])(
    'rejects unsupported filters before persistence: %j',
    async (filter) => {
      const db = await createMemoryDatabase({ name: name() });
      try {
        const native = await seed(db);
        const adapter = new RxCollectionAdapter(native);
        const updater = vi.fn((doc: PersistenceRecord) => ({ ...doc, n: 99 }));
        await expect((async () => adapter.updateMany(compileQuery(filter), updater))()).rejects.toBeInstanceOf(
          QueryFilterError,
        );
        expect(updater).not.toHaveBeenCalled();
        expect((await adapter.find(compileQuery({}))).every((doc) => doc.n === 0)).toBe(true);
      } finally {
        await db.close();
      }
    },
  );
});

async function losingClaim(native: any, operation: 'updateOne' | 'findOneAndUpdate') {
  const adapter = new RxCollectionAdapter(native);
  await adapter.updateMany(compileQuery({}), (doc) => ({ ...doc, tags: [], n: 0 }));
  const selected = await native.findOne('a').exec();
  const gate = createBarrier(1);
  const attempts = vi.fn();
  const original = selected.incrementalModify.bind(selected);
  const retrySpy = vi.spyOn(selected, 'incrementalModify').mockImplementation((fn: any) =>
    original((doc: any) => {
      attempts(doc);
      return fn(doc);
    }),
  );
  const selectionSpy = vi.spyOn(native, 'findOne');
  const updater = vi.fn(async (doc: PersistenceRecord) => {
    if (gate.entered === 0) await gate.wait();
    return { ...doc, n: Number(doc.n) + 1 };
  });
  const pending = adapter[operation](
    { ...compileQuery({ tags: { $nin: ['blocked'] } }), sort: { _id: 'asc' } },
    updater,
  );
  try {
    await gate.allEntered;
    // Non-incremental native patch commits while the first incremental attempt is paused,
    // forcing RxDB's real conflict retry to see the newly forbidden member.
    await selected.patch({ tags: ['blocked'] });
  } finally {
    gate.release();
  }
  try {
    const result = await pending;
    expect(attempts.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(attempts.mock.calls[0][0].tags).toEqual([]);
    expect(attempts.mock.calls.at(-1)![0].tags).toEqual(['blocked']);
    expect(updater).toHaveBeenCalledTimes(1);
    expect(result).toEqual(
      operation === 'updateOne'
        ? { matchedCount: 0, modifiedCount: 0 }
        : { matchedCount: 0, modifiedCount: 0, before: null, after: null },
    );
    expect(selectionSpy).toHaveBeenCalledTimes(1);
    expect((await adapter.find(compileQuery({}))).map((doc) => [doc._id, doc.n]).sort()).toEqual([
      ['a', 0],
      ['b', 0],
      ['c', 0],
    ]);
    expect(await adapter.findOne(compileQuery({ _id: 'a' }))).toMatchObject({ tags: ['blocked'], n: 0 });
  } finally {
    retrySpy.mockRestore();
    selectionSpy.mockRestore();
  }
}
