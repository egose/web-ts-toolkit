import {
  BulkWritePartialFailureError,
  MutationPartialFailureError,
  type AtomicUpdater,
  type BulkInsertOptions,
  type BulkInsertResult,
  type PersistenceRecord,
  type RxLikeCollection,
} from '../../src/rx-adapter';
import { applyProjection, type CompiledQuery } from '../../src/query-compiler';

export interface FakeAdapterCalls {
  find: CompiledQuery[];
  findOne: CompiledQuery[];
  insert: PersistenceRecord[];
  insertMany: PersistenceRecord[][];
  modify: Array<{ id: string; next: any }>;
  incrementalModify: Array<{ id: string }>;
  updateOne: CompiledQuery[];
  updateMany: CompiledQuery[];
  findOneAndUpdate: CompiledQuery[];
  deleteOne: CompiledQuery[];
  deleteMany: CompiledQuery[];
  findOneAndDelete: CompiledQuery[];
  remove: string[];
  count: CompiledQuery[];
  bulkModify: Array<Array<{ id: string; next: any }>>;
  hydrate: PersistenceRecord[];
}

export interface FakeAdapterOptions {
  onModifyStart?: (id: string, next: any) => Promise<void> | void;
  onIncrementalModifyStart?: (id: string) => Promise<void> | void;
  onUpdateRecordStart?: (id: string) => Promise<void> | void;
  failUpdateIds?: Set<string>;
  failDeleteIds?: Set<string>;
}

export class FakePersistenceAdapter implements RxLikeCollection {
  readonly calls: FakeAdapterCalls = {
    find: [],
    findOne: [],
    insert: [],
    insertMany: [],
    modify: [],
    incrementalModify: [],
    updateOne: [],
    updateMany: [],
    findOneAndUpdate: [],
    deleteOne: [],
    deleteMany: [],
    findOneAndDelete: [],
    remove: [],
    count: [],
    bulkModify: [],
    hydrate: [],
  };

  private records = new Map<string, PersistenceRecord>();

  constructor(
    seed: PersistenceRecord[] = [],
    private readonly options: FakeAdapterOptions = {},
  ) {
    for (const record of seed) this.records.set(record._id, cloneRecord(record));
  }

  async find(compiled: CompiledQuery): Promise<PersistenceRecord[]> {
    this.calls.find.push(cloneCompiled(compiled));
    return this.applyQuery(compiled).map((record) => cloneRecord(record));
  }

  async findOne(compiled: CompiledQuery): Promise<PersistenceRecord | null> {
    this.calls.findOne.push(cloneCompiled(compiled));
    return this.applyQuery({ ...compiled, limit: 1 })[0] ?? null;
  }

  async insert(doc: PersistenceRecord): Promise<PersistenceRecord> {
    this.calls.insert.push(cloneRecord(doc));
    const record = withoutMetadata(cloneRecord(doc));
    if (!record._id) record._id = `fake-${this.records.size + 1}`;
    if (this.records.has(record._id)) throw new Error(`Duplicate document ${record._id}`);
    this.records.set(record._id, record);
    return cloneRecord(record);
  }

  async insertMany(docs: PersistenceRecord[], options: BulkInsertOptions = {}): Promise<BulkInsertResult> {
    this.calls.insertMany.push(docs.map(cloneRecord));
    const ordered = options.ordered !== false;
    const records: PersistenceRecord[] = [];
    const errors: Array<{ index: number; error: unknown }> = [];
    for (let index = 0; index < docs.length; index++) {
      const record = withoutMetadata(cloneRecord(docs[index]));
      if (!record._id) record._id = `fake-${this.records.size + records.length + 1}`;
      if (this.records.has(record._id) || records.some((entry) => entry._id === record._id)) {
        errors.push({ index, error: new Error(`Duplicate document ${record._id}`) });
        if (ordered) break;
        continue;
      }
      records.push(record);
    }
    for (const record of records) this.records.set(record._id, cloneRecord(record));
    const result: BulkInsertResult = {
      insertedCount: records.length,
      insertedIds: records.map((record) => record._id),
      records: records.map(cloneRecord),
      errors,
    };
    if (errors.length) throw new BulkWritePartialFailureError('insertMany', ordered, result);
    return result;
  }

  async modify(id: string, next: any): Promise<void> {
    this.calls.modify.push({ id, next: cloneRecord(next) });
    await this.options.onModifyStart?.(id, next);
    if (!this.records.has(id)) throw new Error(`Document ${id} not found`);
    this.records.set(id, { ...cloneRecord(next), _id: id });
  }

  async incrementalModify(id: string, fn: AtomicUpdater): Promise<void> {
    this.calls.incrementalModify.push({ id });
    await this.options.onIncrementalModifyStart?.(id);
    const current = this.records.get(id);
    if (!current) throw new Error(`Document ${id} not found`);
    this.records.set(id, sanitizeMutationResult(current, await fn(cloneRecord(current))));
  }

  async updateOne(
    compiled: CompiledQuery,
    updater: AtomicUpdater,
  ): Promise<{ matchedCount: number; modifiedCount: number }> {
    this.calls.updateOne.push(cloneCompiled(compiled));
    const doc = this.applyQuery({ ...compiled, limit: 1 })[0];
    if (!doc) return { matchedCount: 0, modifiedCount: 0 };
    const modified = await this.updateRecord(doc._id, updater);
    return { matchedCount: 1, modifiedCount: modified ? 1 : 0 };
  }

  async updateMany(
    compiled: CompiledQuery,
    updater: AtomicUpdater,
  ): Promise<{ matchedCount: number; modifiedCount: number }> {
    this.calls.updateMany.push(cloneCompiled(compiled));
    const docs = this.applyQuery(compiled);
    let matchedCount = 0;
    let modifiedCount = 0;
    for (const doc of docs) {
      try {
        const modified = await this.updateRecord(doc._id, updater);
        matchedCount++;
        if (modified) modifiedCount++;
      } catch (error) {
        throw new MutationPartialFailureError('updateMany', { matchedCount, modifiedCount }, error);
      }
    }
    return { matchedCount, modifiedCount };
  }

  async findOneAndUpdate(compiled: CompiledQuery, updater: AtomicUpdater) {
    this.calls.findOneAndUpdate.push(cloneCompiled(compiled));
    const before = this.applyQuery({ ...compiled, limit: 1 })[0] ?? null;
    if (!before) return { before: null, after: null, matchedCount: 0, modifiedCount: 0 };
    const modified = await this.updateRecord(before._id, updater);
    return {
      before,
      after: cloneRecord(this.records.get(before._id)!),
      matchedCount: 1,
      modifiedCount: modified ? 1 : 0,
    };
  }

  async deleteOne(compiled: CompiledQuery): Promise<{ deletedCount: number }> {
    this.calls.deleteOne.push(cloneCompiled(compiled));
    const doc = this.applyQuery({ ...compiled, limit: 1 })[0];
    if (!doc) return { deletedCount: 0 };
    if (this.options.failDeleteIds?.has(doc._id)) throw new Error(`delete failed for ${doc._id}`);
    this.records.delete(doc._id);
    return { deletedCount: 1 };
  }

  async deleteMany(compiled: CompiledQuery): Promise<{ deletedCount: number }> {
    this.calls.deleteMany.push(cloneCompiled(compiled));
    const docs = this.applyQuery(compiled);
    let deletedCount = 0;
    for (const doc of docs) {
      try {
        if (this.options.failDeleteIds?.has(doc._id)) throw new Error(`delete failed for ${doc._id}`);
        this.records.delete(doc._id);
        deletedCount++;
      } catch (error) {
        throw new MutationPartialFailureError('deleteMany', { deletedCount }, error);
      }
    }
    return { deletedCount };
  }

  async findOneAndDelete(compiled: CompiledQuery): Promise<PersistenceRecord | null> {
    this.calls.findOneAndDelete.push(cloneCompiled(compiled));
    const doc = this.applyQuery({ ...compiled, limit: 1 })[0] ?? null;
    if (!doc) return null;
    if (this.options.failDeleteIds?.has(doc._id)) throw new Error(`delete failed for ${doc._id}`);
    this.records.delete(doc._id);
    return doc;
  }

  async remove(id: string): Promise<void> {
    this.calls.remove.push(id);
    if (!this.records.delete(id)) throw new Error(`Document ${id} not found`);
  }

  async count(compiled: CompiledQuery): Promise<number> {
    this.calls.count.push(cloneCompiled(compiled));
    return this.applyQuery(compiled).length;
  }

  async bulkModify(updates: Array<{ id: string; next: any }>): Promise<void> {
    this.calls.bulkModify.push(updates.map(({ id, next }) => ({ id, next: cloneRecord(next) })));
    for (const { id, next } of updates) await this.modify(id, next);
  }

  recordHydration(raw: PersistenceRecord): void {
    this.calls.hydrate.push(cloneRecord(raw));
  }

  snapshot(): PersistenceRecord[] {
    return Array.from(this.records.values()).map(cloneRecord);
  }

  private applyQuery(compiled: CompiledQuery): PersistenceRecord[] {
    let rows = Array.from(this.records.values()).filter((record) => matchesSelector(record, compiled.selector ?? {}));
    if (compiled.sort) rows = sortRows(rows, compiled.sort);
    if (compiled.skip !== undefined && compiled.skip > 0) rows = rows.slice(compiled.skip);
    if (compiled.limit !== undefined) rows = rows.slice(0, compiled.limit);
    return rows.map((record) => applyProjection(cloneRecord(record), compiled.projection));
  }

  private async updateRecord(id: string, updater: AtomicUpdater): Promise<boolean> {
    if (this.options.failUpdateIds?.has(id)) throw new Error(`update failed for ${id}`);
    const current = this.records.get(id);
    if (!current) throw new Error(`Document ${id} not found`);
    await this.options.onUpdateRecordStart?.(id);
    const next = sanitizeMutationResult(current, await updater(cloneRecord(current)));
    const modified = stableStringify(current) !== stableStringify(next);
    if (modified) this.records.set(id, next);
    return modified;
  }
}

function sanitizeMutationResult(current: PersistenceRecord, next: any): PersistenceRecord {
  const out = withoutMetadata(cloneRecord(next ?? {}));
  out._id = current._id;
  return out;
}

function withoutMetadata(value: PersistenceRecord): PersistenceRecord {
  delete (value as any)._rev;
  delete (value as any)._meta;
  delete (value as any)._attachments;
  delete (value as any)._deleted;
  return value;
}

export function cloneRecord<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneCompiled(compiled: CompiledQuery): CompiledQuery {
  return cloneRecord(compiled);
}

function matchesSelector(record: PersistenceRecord, selector: Record<string, any>): boolean {
  for (const [key, expected] of Object.entries(selector)) {
    if (key === '$and' && Array.isArray(expected)) {
      if (!expected.every((entry) => matchesSelector(record, entry))) return false;
      continue;
    }
    if (key === '$or' && Array.isArray(expected)) {
      if (!expected.some((entry) => matchesSelector(record, entry))) return false;
      continue;
    }
    if (key === '$nor' && Array.isArray(expected)) {
      if (expected.some((entry) => matchesSelector(record, entry))) return false;
      continue;
    }
    if (!matchesValue(record[key], expected)) return false;
  }
  return true;
}

function matchesValue(actual: any, expected: any): boolean {
  if (!expected || typeof expected !== 'object' || Array.isArray(expected)) return Object.is(actual, expected);
  for (const [op, value] of Object.entries(expected)) {
    if (op === '$eq' && !Object.is(actual, value)) return false;
    if (op === '$ne' && Object.is(actual, value)) return false;
    if (op === '$gt' && !(actual > value)) return false;
    if (op === '$gte' && !(actual >= value)) return false;
    if (op === '$lt' && !(actual < value)) return false;
    if (op === '$lte' && !(actual <= value)) return false;
    if (op === '$in' && (!Array.isArray(value) || !value.includes(actual))) return false;
    if (op === '$nin' && Array.isArray(value) && value.includes(actual)) return false;
    if (op === '$exists' && (value ? actual === undefined : actual !== undefined)) return false;
  }
  return true;
}

function sortRows(rows: PersistenceRecord[], sort: Record<string, 1 | -1 | 'asc' | 'desc'>): PersistenceRecord[] {
  const entries = Object.entries(sort);
  return [...rows].sort((left, right) => {
    for (const [key, direction] of entries) {
      if (left[key] === right[key]) continue;
      const order = left[key] < right[key] ? -1 : 1;
      return direction === 'asc' || direction === 1 ? order : -order;
    }
    return 0;
  });
}

function stableStringify(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
}
