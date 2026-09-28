import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { partitionBulkInsert } from '../src/bulk-insert-passes';
import { BulkWritePartialFailureError, RxCollectionAdapter, type PersistenceRecord } from '../src/rx-adapter';

type Partition = typeof partitionBulkInsert;

// Pre-RMRX-06 algorithm, retained only as a partition-only comparison oracle.
const legacyPartition: Partition = (docs) => {
  const passes: ReturnType<Partition> = [];
  const passIdSets: Array<Set<string>> = [];
  for (let index = 0; index < docs.length; index++) {
    const id = docs[index]._id;
    let placed = false;
    for (let pass = 0; pass < passes.length; pass++) {
      if (!passIdSets[pass].has(id)) {
        passes[pass].docs.push(docs[index]);
        passes[pass].indexes.push(index);
        passIdSets[pass].add(id);
        placed = true;
        break;
      }
    }
    if (!placed) {
      passes.push({ docs: [docs[index]], indexes: [index] });
      passIdSets.push(new Set([id]));
    }
  }
  return passes;
};

// Instrument only the synchronous partition call, never native writes or assertions.
// Plain wrappers avoid retaining millions of spy call records on the old algorithm.
function countOperations(partition: Partition, docs: PersistenceRecord[]) {
  const counts = { has: 0, add: 0, get: 0, set: 0 };
  const { has, add } = Set.prototype;
  const { get, set } = Map.prototype;
  Set.prototype.has = function (value) {
    counts.has++;
    return has.call(this, value);
  };
  Set.prototype.add = function (value) {
    counts.add++;
    return add.call(this, value);
  };
  Map.prototype.get = function (key) {
    counts.get++;
    return get.call(this, key);
  };
  Map.prototype.set = function (key, value) {
    counts.set++;
    return set.call(this, key, value);
  };
  try {
    return { passes: partition(docs), counts };
  } finally {
    Set.prototype.has = has;
    Set.prototype.add = add;
    Map.prototype.get = get;
    Map.prototype.set = set;
  }
}

function medianMilliseconds(partition: Partition, docs: PersistenceRecord[]): number {
  for (let warmup = 0; warmup < 3; warmup++) partition(docs);
  const samples = Array.from({ length: 7 }, () => {
    const start = performance.now();
    partition(docs);
    return performance.now() - start;
  });
  return Number(samples.sort((a, b) => a - b)[3].toFixed(3));
}

function nativeHarness(options: { throwPass?: number; rejectFirstB?: boolean; bulk?: boolean } = {}) {
  const stored = new Map<string, PersistenceRecord>([['existing', { _id: 'existing', n: -1 }]]);
  const bulkCalls: PersistenceRecord[][] = [];
  const singleCalls: PersistenceRecord[] = [];
  const failures = new Map<number, unknown>();
  function write(doc: PersistenceRecord) {
    const error =
      typeof doc._id !== 'string'
        ? { status: 422, documentId: doc._id }
        : options.rejectFirstB && doc.n === 1
          ? { status: 422, id: doc._id }
          : stored.has(doc._id)
            ? { status: 409, writeRow: { document: { _id: doc._id } } }
            : undefined;
    if (error) {
      failures.set(doc.n as number, error);
      throw error;
    }
    stored.set(doc._id, { ...doc });
    return { toJSON: () => ({ ...doc, _rev: 'native-metadata' }) };
  }
  const native = {
    insert: async (doc: PersistenceRecord) => {
      singleCalls.push(doc);
      return write(doc);
    },
    bulkInsert:
      options.bulk === false
        ? undefined
        : async (docs: PersistenceRecord[]) => {
            const pass = bulkCalls.length;
            bulkCalls.push(docs);
            if (pass === options.throwPass) throw new Error('native pass rejected');
            const success: Array<ReturnType<typeof write>> = [];
            const error: unknown[] = [];
            for (const doc of docs) {
              try {
                success.push(write(doc));
              } catch (failure) {
                error.push(failure);
              }
            }
            // Native result order need not be input order; indexes must come from IDs.
            return { success: success.reverse(), error: error.reverse() };
          },
  };
  return { adapter: new RxCollectionAdapter(native), stored, bulkCalls, singleCalls, failures };
}

async function partial(promise: Promise<unknown>): Promise<BulkWritePartialFailureError> {
  const result = await promise.catch((error: unknown) => error);
  expect(result).toBeInstanceOf(BulkWritePartialFailureError);
  return result as BulkWritePartialFailureError;
}

describe('RMRX-06 bulk pass behavior', () => {
  for (const size of [1, 64, 512]) {
    it(`attempts all ${size} identical IDs in separate native passes, preserving the first winner`, async () => {
      const h = nativeHarness();
      const docs = Array.from({ length: size }, (_, n) => ({ _id: 'dup', n }));
      const outcome =
        size === 1
          ? await h.adapter.insertMany(docs, { ordered: false })
          : await partial(h.adapter.insertMany(docs, { ordered: false }));
      expect(outcome.insertedCount).toBe(1);
      expect(outcome.insertedIds).toEqual(['dup']);
      expect(outcome.records).toEqual([{ _id: 'dup', n: 0 }]);
      expect(outcome.errors.map(({ index }) => index)).toEqual(Array.from({ length: size - 1 }, (_, n) => n + 1));
      expect(outcome.errors.every(({ error }) => (error as { status: number }).status === 409)).toBe(true);
      expect(h.bulkCalls).toEqual(docs.map((doc) => [doc]));
      expect(h.singleCalls).toEqual([]);
      expect(h.stored.get('dup')).toEqual(docs[0]);
    });
  }

  for (const throwPass of [undefined, 1]) {
    it(`preserves mixed passes, late successes and original native errors (throwing pass: ${throwPass})`, async () => {
      const h = nativeHarness({ throwPass, rejectFirstB: true });
      const docs = ['a', 'b', 'a', 'existing', 'b', 'c', 'a', 'b', 'c', 'late', 'existing'].map((_id, n) => ({
        _id,
        n,
      }));
      const error = await partial(h.adapter.insertMany(docs, { ordered: false }));
      expect(h.bulkCalls.map((pass) => pass.map((doc) => doc.n))).toEqual([
        [0, 1, 3, 5, 9],
        [2, 4, 8, 10],
        [6, 7],
      ]);
      expect(h.bulkCalls.every((pass) => new Set(pass.map((doc) => doc._id)).size === pass.length)).toBe(true);
      expect(h.singleCalls.map((doc) => doc.n)).toEqual(throwPass === undefined ? [] : [2, 4, 8, 10]);
      expect(error.ordered).toBe(false);
      expect(error.insertedCount).toBe(4);
      expect(error.insertedIds).toEqual(['late', 'c', 'a', 'b']);
      expect(error.records).toEqual([docs[9], docs[5], docs[0], docs[4]]);
      expect(error.errors.map(({ index }) => index)).toEqual([1, 2, 3, 6, 7, 8, 10]);
      for (const entry of error.errors) expect(entry.error).toBe(h.failures.get(entry.index));
      expect(h.stored.get('a')).toEqual(docs[0]);
      expect(h.stored.get('b')).toEqual(docs[4]);
      expect(h.stored.get('existing')).toEqual({ _id: 'existing', n: -1 });
    });
  }

  for (const ordered of [undefined, true, false]) {
    it(`retains sequential stop/continue semantics without native bulk (ordered: ${ordered})`, async () => {
      const h = nativeHarness({ bulk: false });
      const docs = ['a', 'a', 'later'].map((_id, n) => ({ _id, n }));
      const error = await partial(h.adapter.insertMany(docs, { ordered }));
      expect(error.ordered).toBe(ordered !== false);
      expect(error.insertedIds).toEqual(ordered === false ? ['a', 'later'] : ['a']);
      expect(error.errors.map(({ index }) => index)).toEqual([1]);
      expect(h.singleCalls).toEqual(ordered === false ? docs : docs.slice(0, 2));
      expect(h.bulkCalls).toEqual([]);
    });
  }

  it('bypasses available bulk in default and explicit ordered mode', async () => {
    for (const ordered of [undefined, true]) {
      const h = nativeHarness();
      const docs = ['a', 'a', 'later'].map((_id, n) => ({ _id, n }));
      const error = await partial(h.adapter.insertMany(docs, { ordered }));
      expect(error.insertedIds).toEqual(['a']);
      expect(error.errors.map(({ index }) => index)).toEqual([1]);
      expect(h.singleCalls).toEqual(docs.slice(0, 2));
      expect(h.bulkCalls).toEqual([]);
    }
  });

  it('keeps non-string-ID batches sequential with exact failed indexes', async () => {
    const h = nativeHarness();
    const docs = [
      { _id: 'a', n: 0 },
      { _id: 42, n: 1 },
      { _id: 'a', n: 2 },
      { _id: 'later', n: 3 },
    ];
    const error = await partial(h.adapter.insertMany(docs as PersistenceRecord[], { ordered: false }));
    expect(error.insertedIds).toEqual(['a', 'later']);
    expect(error.errors.map(({ index }) => index)).toEqual([1, 2]);
    expect(h.singleCalls).toEqual(docs);
    expect(h.bulkCalls).toEqual([]);
  });

  it('makes no native calls for empty batches', async () => {
    const h = nativeHarness();
    for (const ordered of [true, false]) {
      expect(await h.adapter.insertMany([], { ordered })).toEqual({
        insertedCount: 0,
        insertedIds: [],
        records: [],
        errors: [],
      });
    }
    expect(h.bulkCalls).toEqual([]);
    expect(h.singleCalls).toEqual([]);
  });
});

describe('RMRX-06 partition-only scaling', () => {
  it('matches legacy pass contents for every sequence of up to seven IDs from a three-ID alphabet', () => {
    for (let size = 0; size <= 7; size++) {
      for (let sequence = 0; sequence < 3 ** size; sequence++) {
        const docs = Array.from({ length: size }, (_, n) => ({
          _id: ['', '__proto__', 'constructor'][Math.floor(sequence / 3 ** n) % 3],
          n,
        }));
        const passes = partitionBulkInsert(docs);
        expect(passes).toEqual(legacyPartition(docs));
        for (const pass of passes) {
          for (let n = 0; n < pass.docs.length; n++) expect(pass.docs[n]).toBe(docs[pass.indexes[n]]);
        }
      }
    }
  });

  it('uses linear dictionary work; reports old/new counts and informational uninstrumented timings', () => {
    // Normal verification asserts deterministic counts only. Opt in to repeated
    // timing samples with RMRX_BULK_MEASURE=1 and --silent=false to print them.
    const measure = process.env.RMRX_BULK_MEASURE === '1';
    const rows: Array<Record<string, string | number>> = [];
    for (const shape of ['all-duplicate', 'mostly-unique', 'all-unique']) {
      for (const size of [256, 1_024, 4_096]) {
        // Mostly unique: every 16th entry shares one ID (6.25% hot-ID entries).
        const docs = Array.from({ length: size }, (_, n) => ({
          _id: shape === 'all-duplicate' || (shape === 'mostly-unique' && n % 16 === 0) ? 'hot' : `id-${n}`,
        }));
        const old = countOperations(legacyPartition, docs);
        const current = countOperations(partitionBulkInsert, docs);
        const frequency = shape === 'all-duplicate' ? size : shape === 'mostly-unique' ? size / 16 : 1;
        const expectedHas = shape === 'all-unique' ? size - 1 : (frequency * (frequency - 1)) / 2 + size - frequency;
        expect(old.counts).toEqual({ has: expectedHas, add: size, get: 0, set: 0 });
        expect(current.passes).toEqual(old.passes);
        expect(current.passes).toHaveLength(frequency);
        expect(current.counts).toEqual({ has: 0, add: 0, get: size, set: size });
        if (measure) {
          rows.push({
            shape,
            size,
            passes: frequency,
            oldHas: old.counts.has,
            oldAdd: old.counts.add,
            newGet: current.counts.get,
            newSet: current.counts.set,
            oldMs: medianMilliseconds(legacyPartition, docs),
            newMs: medianMilliseconds(partitionBulkInsert, docs),
          });
        }
      }
    }
    if (measure) {
      console.info(
        '[RMRX-06] partition only; 3 warmups, median of 7, milliseconds; no timing assertions or native I/O',
      );
      console.table(rows);
    }
  }, 60_000);
});
