import type { RxCollection, RxDocument } from './rx-types';
import { applyProjection, type CompiledQuery } from './query-compiler';

export interface PersistenceRecord {
  _id: string;
  [key: string]: unknown;
}

export type RxLikeDoc = PersistenceRecord;

export interface MutationCounts {
  matchedCount: number;
  modifiedCount: number;
}

export interface DeleteCounts {
  deletedCount: number;
}

export interface FindOneUpdateResult extends MutationCounts {
  before: PersistenceRecord | null;
  after: PersistenceRecord | null;
}

export type AtomicUpdater = (doc: PersistenceRecord) => PersistenceRecord | Promise<PersistenceRecord>;

export interface BulkInsertOptions {
  ordered?: boolean;
}

export interface BulkInsertResult {
  insertedCount: number;
  insertedIds: string[];
  records: PersistenceRecord[];
  errors: Array<{ index: number; error: unknown }>;
}

export class MutationPartialFailureError extends Error {
  public readonly matchedCount: number;
  public readonly modifiedCount: number;
  public readonly deletedCount: number;
  public readonly cause: unknown;

  constructor(
    operation: 'updateMany' | 'deleteMany',
    counts: { matchedCount?: number; modifiedCount?: number; deletedCount?: number },
    cause: unknown,
  ) {
    super(`${operation} failed after applying earlier matching documents`);
    this.name = 'MutationPartialFailureError';
    this.matchedCount = counts.matchedCount ?? 0;
    this.modifiedCount = counts.modifiedCount ?? 0;
    this.deletedCount = counts.deletedCount ?? 0;
    this.cause = cause;
  }
}

export class BulkWritePartialFailureError extends Error {
  public readonly operation: 'insertMany';
  public readonly ordered: boolean;
  public readonly insertedCount: number;
  public readonly insertedIds: string[];
  public readonly records: PersistenceRecord[];
  public readonly errors: Array<{ index: number; error: unknown }>;

  constructor(operation: 'insertMany', ordered: boolean, result: BulkInsertResult) {
    super(
      `${operation} failed after inserting ${result.insertedCount} document${result.insertedCount === 1 ? '' : 's'}`,
    );
    this.name = 'BulkWritePartialFailureError';
    this.operation = operation;
    this.ordered = ordered;
    this.insertedCount = result.insertedCount;
    this.insertedIds = result.insertedIds;
    this.records = result.records;
    this.errors = result.errors;
  }
}

export interface RxLikeCollection {
  find(compiled: CompiledQuery): Promise<PersistenceRecord[]>;
  findOne(compiled: CompiledQuery): Promise<PersistenceRecord | null>;
  count(compiled: CompiledQuery): Promise<number>;
  insert(doc: PersistenceRecord): Promise<PersistenceRecord>;
  insertMany(docs: PersistenceRecord[], options?: BulkInsertOptions): Promise<BulkInsertResult>;
  modify(id: string, next: PersistenceRecord): Promise<void>;
  incrementalModify(id: string, fn: AtomicUpdater): Promise<void>;
  updateOne(compiled: CompiledQuery, updater: AtomicUpdater): Promise<MutationCounts>;
  updateMany(compiled: CompiledQuery, updater: AtomicUpdater): Promise<MutationCounts>;
  findOneAndUpdate(compiled: CompiledQuery, updater: AtomicUpdater): Promise<FindOneUpdateResult>;
  deleteOne(compiled: CompiledQuery): Promise<DeleteCounts>;
  deleteMany(compiled: CompiledQuery): Promise<DeleteCounts>;
  findOneAndDelete(compiled: CompiledQuery): Promise<PersistenceRecord | null>;
  remove(id: string): Promise<void>;
}

const RXDB_METADATA_KEYS = new Set(['_rev', '_meta', '_attachments', '_deleted']);

export class RxCollectionAdapter implements RxLikeCollection {
  constructor(private rxCollection: RxCollection<any> | any) {}

  private native(): RxCollection<any> {
    return this.rxCollection as RxCollection<any>;
  }

  async find(compiled: CompiledQuery): Promise<PersistenceRecord[]> {
    let query = this.native().find({
      selector: compiled.selector,
    });
    if (compiled.sort) query = query.sort(compiled.sort as any);
    if (compiled.limit !== undefined) query = query.limit((compiled.skip ?? 0) + compiled.limit);
    let docs: RxDocument[] = await query.exec();
    if (compiled.skip !== undefined && compiled.skip > 0) docs = docs.slice(compiled.skip);
    return docs.map((d) => applyProjection(toPersistenceRecord(d.toJSON()), compiled.projection));
  }

  async findOne(compiled: CompiledQuery): Promise<PersistenceRecord | null> {
    const skip = compiled.skip ?? 0;
    if (skip > 0) {
      const docs = await this.find({ ...compiled, skip, limit: 1 });
      return docs[0] ?? null;
    }
    let query = this.native().findOne({ selector: compiled.selector });
    if (compiled.sort) query = query.sort(compiled.sort as any);
    const doc: RxDocument | null = await query.exec();
    return doc ? applyProjection(toPersistenceRecord(doc.toJSON()), compiled.projection) : null;
  }

  async count(compiled: CompiledQuery): Promise<number> {
    const native = this.native() as any;
    let matched: number;
    if (typeof native.count === 'function') {
      const result = await native.count({ selector: compiled.selector }).exec();
      matched = typeof result === 'number' ? result : (result?.count ?? 0);
    } else {
      matched = (await this.queryDocs({ selector: compiled.selector })).length;
    }
    const afterSkip = Math.max(0, matched - (compiled.skip ?? 0));
    return compiled.limit === undefined ? afterSkip : Math.min(afterSkip, compiled.limit);
  }

  async insert(doc: PersistenceRecord): Promise<PersistenceRecord> {
    const result = await this.native().insert(doc);
    return toPersistenceRecord(result.toJSON());
  }

  async insertMany(docs: PersistenceRecord[], options: BulkInsertOptions = {}): Promise<BulkInsertResult> {
    const ordered = options.ordered !== false;
    const native = this.native() as RxCollection<any> & {
      bulkInsert?: (docs: PersistenceRecord[]) => Promise<{ success?: RxDocument[]; error?: unknown[] }>;
    };
    if (!native.bulkInsert || ordered) return this.insertManySequential(docs, ordered);

    const ids = new Map(docs.map((doc, index) => [doc._id, index]));
    const result = await native.bulkInsert(docs.map((doc) => cloneRecord(doc)));
    const records = (result.success ?? []).map((doc) => toPersistenceRecord(doc.toJSON()));
    const errors = (result.error ?? []).map((error) => ({ index: bulkErrorIndex(error, ids), error }));
    const bulkResult: BulkInsertResult = {
      insertedCount: records.length,
      insertedIds: records.map((record) => record._id),
      records,
      errors,
    };
    if (errors.length) throw new BulkWritePartialFailureError('insertMany', ordered, bulkResult);
    return bulkResult;
  }

  async modify(id: string, next: PersistenceRecord): Promise<void> {
    const doc = await this.native()
      .findOne({ selector: { _id: { $eq: id } } })
      .exec();
    if (!doc) throw new Error(`Document ${id} not found`);
    await doc.incrementalPatch(sanitizeMutationResult(toPersistenceRecord(doc.toJSON()), next));
  }

  async incrementalModify(id: string, fn: AtomicUpdater): Promise<void> {
    const doc = await this.native()
      .findOne({ selector: { _id: { $eq: id } } })
      .exec();
    if (!doc) throw new Error(`Document ${id} not found`);
    await doc.incrementalModify(async (d: any) =>
      sanitizeMutationResult(toPersistenceRecord(d), await fn(toPersistenceRecord(d))),
    );
  }

  async updateOne(compiled: CompiledQuery, updater: AtomicUpdater): Promise<MutationCounts> {
    const result = await this.updateFirstMatching(compiled, updater);
    return { matchedCount: result.before ? 1 : 0, modifiedCount: result.modified ? 1 : 0 };
  }

  async updateMany(compiled: CompiledQuery, updater: AtomicUpdater): Promise<MutationCounts> {
    const docs = await this.queryDocs(compiled);
    let matchedCount = 0;
    let modifiedCount = 0;
    for (const doc of docs) {
      try {
        const changed = await this.modifyDocument(doc, updater);
        matchedCount++;
        if (changed) modifiedCount++;
      } catch (error) {
        throw new MutationPartialFailureError('updateMany', { matchedCount, modifiedCount }, error);
      }
    }
    return { matchedCount, modifiedCount };
  }

  async findOneAndUpdate(compiled: CompiledQuery, updater: AtomicUpdater): Promise<FindOneUpdateResult> {
    const result = await this.updateFirstMatching(compiled, updater);
    return {
      before: result.before,
      after: result.after,
      matchedCount: result.before ? 1 : 0,
      modifiedCount: result.modified ? 1 : 0,
    };
  }

  async deleteOne(compiled: CompiledQuery): Promise<DeleteCounts> {
    const doc = await this.queryOneDoc(compiled);
    if (!doc) return { deletedCount: 0 };
    await doc.remove();
    return { deletedCount: 1 };
  }

  async deleteMany(compiled: CompiledQuery): Promise<DeleteCounts> {
    const docs = await this.queryDocs(compiled);
    let deletedCount = 0;
    for (const doc of docs) {
      try {
        await doc.remove();
        deletedCount++;
      } catch (error) {
        throw new MutationPartialFailureError('deleteMany', { deletedCount }, error);
      }
    }
    return { deletedCount };
  }

  async findOneAndDelete(compiled: CompiledQuery): Promise<RxLikeDoc | null> {
    const doc = await this.queryOneDoc(compiled);
    if (!doc) return null;
    const before = toPersistenceRecord(doc.toJSON());
    await doc.remove();
    return before;
  }

  async remove(id: string): Promise<void> {
    const doc = await this.native()
      .findOne({ selector: { _id: { $eq: id } } })
      .exec();
    if (!doc) throw new Error(`Document ${id} not found`);
    await doc.remove();
  }

  private async updateFirstMatching(
    compiled: CompiledQuery,
    updater: AtomicUpdater,
  ): Promise<{ before: RxLikeDoc | null; after: RxLikeDoc | null; modified: boolean }> {
    const doc = await this.queryOneDoc(compiled);
    if (!doc) return { before: null, after: null, modified: false };
    const before = toPersistenceRecord(doc.toJSON());
    let after = before;
    const modified = await this.modifyDocument(doc, async (current) => {
      const next = await updater(current);
      after = sanitizeMutationResult(current, next);
      return after;
    });
    return { before, after, modified };
  }

  private async modifyDocument(doc: RxDocument, updater: AtomicUpdater): Promise<boolean> {
    let modified = false;
    await doc.incrementalModify(async (currentDoc: any) => {
      const current = toPersistenceRecord(currentDoc);
      const next = sanitizeMutationResult(current, await updater(cloneRecord(current)));
      modified = !recordsEqual(current, next);
      return modified ? next : current;
    });
    return modified;
  }

  private async queryOneDoc(compiled: CompiledQuery): Promise<RxDocument | null> {
    let query = this.native().findOne({ selector: compiled.selector });
    if (compiled.sort) query = query.sort(compiled.sort as any);
    const doc: RxDocument | null = await query.exec();
    return doc ?? null;
  }

  private async queryDocs(compiled: CompiledQuery): Promise<RxDocument[]> {
    let query = this.native().find({ selector: compiled.selector });
    if (compiled.sort) query = query.sort(compiled.sort as any);
    if (compiled.limit !== undefined) query = query.limit((compiled.skip ?? 0) + compiled.limit);
    let docs: RxDocument[] = await query.exec();
    if (compiled.skip !== undefined && compiled.skip > 0) docs = docs.slice(compiled.skip);
    return docs;
  }

  private async insertManySequential(docs: PersistenceRecord[], ordered: boolean): Promise<BulkInsertResult> {
    const records: PersistenceRecord[] = [];
    const errors: Array<{ index: number; error: unknown }> = [];
    for (let index = 0; index < docs.length; index++) {
      try {
        records.push(await this.insert(docs[index]));
      } catch (error) {
        errors.push({ index, error });
        if (ordered) break;
      }
    }
    const result: BulkInsertResult = {
      insertedCount: records.length,
      insertedIds: records.map((record) => record._id),
      records,
      errors,
    };
    if (errors.length) throw new BulkWritePartialFailureError('insertMany', ordered, result);
    return result;
  }
}

function sanitizeMutationResult(current: PersistenceRecord, proposed: any): PersistenceRecord {
  const out = toPersistenceRecord(proposed ?? {});
  out._id = current._id;
  return out;
}

function toPersistenceRecord(value: any): PersistenceRecord {
  const out: any = Object.create(null);
  for (const [key, nested] of Object.entries(value ?? {})) {
    if (RXDB_METADATA_KEYS.has(key)) continue;
    out[key] = cloneRecord(nested);
  }
  return out as PersistenceRecord;
}

function cloneRecord<T>(value: T): T {
  if (value === undefined || value === null || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function recordsEqual(left: PersistenceRecord, right: PersistenceRecord): boolean {
  return stableStringify(left) === stableStringify(right);
}

function bulkErrorIndex(error: unknown, ids: Map<string, number>): number {
  const value = error as { documentId?: unknown; id?: unknown; writeRow?: { document?: { _id?: unknown } } };
  const id = value.documentId ?? value.id ?? value.writeRow?.document?._id;
  return typeof id === 'string' ? (ids.get(id) ?? -1) : -1;
}

function stableStringify(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
}

export async function createCollectionLike(rxCollection: any): Promise<RxLikeCollection> {
  return new RxCollectionAdapter(rxCollection);
}

export default RxCollectionAdapter;
