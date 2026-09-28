import type { RxCollection, RxDocument } from './rx-types';
import { applyProjection, translateFilter, type CompiledQuery } from './query-compiler';
import { createSelectorMatcher } from './selector-matcher';
import { partitionBulkInsert } from './bulk-insert-passes';

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
    return this.insertManyUnordered(docs);
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
    const doc = await this.queryOneDoc(compiled);
    if (!doc) return { matchedCount: 0, modifiedCount: 0 };
    const result = await this.conditionalModify(doc, compiled.selector, updater);
    return { matchedCount: result.matched ? 1 : 0, modifiedCount: result.matched && result.modified ? 1 : 0 };
  }

  async updateMany(compiled: CompiledQuery, updater: AtomicUpdater): Promise<MutationCounts> {
    const docs = await this.queryDocs(compiled);
    let matchedCount = 0;
    let modifiedCount = 0;
    for (const doc of docs) {
      try {
        const result = await this.conditionalModify(doc, compiled.selector, updater);
        if (!result.matched) continue;
        matchedCount++;
        if (result.modified) modifiedCount++;
      } catch (error) {
        throw new MutationPartialFailureError('updateMany', { matchedCount, modifiedCount }, error);
      }
    }
    return { matchedCount, modifiedCount };
  }

  async findOneAndUpdate(compiled: CompiledQuery, updater: AtomicUpdater): Promise<FindOneUpdateResult> {
    const doc = await this.queryOneDoc(compiled);
    if (!doc) return { before: null, after: null, matchedCount: 0, modifiedCount: 0 };
    const result = await this.conditionalModify(doc, compiled.selector, updater);
    if (!result.matched) return { before: null, after: null, matchedCount: 0, modifiedCount: 0 };
    return {
      before: result.before,
      after: result.after,
      matchedCount: 1,
      modifiedCount: result.modified ? 1 : 0,
    };
  }

  async deleteOne(compiled: CompiledQuery): Promise<DeleteCounts> {
    const doc = await this.queryOneDoc(compiled);
    if (!doc) return { deletedCount: 0 };
    if (!(await this.removeIfMatches(doc, compiled.selector))) return { deletedCount: 0 };
    return { deletedCount: 1 };
  }

  async deleteMany(compiled: CompiledQuery): Promise<DeleteCounts> {
    const docs = await this.queryDocs(compiled);
    let deletedCount = 0;
    for (const doc of docs) {
      try {
        if (await this.removeIfMatches(doc, compiled.selector)) deletedCount++;
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
    if (!this.selectorMatcher(compiled.selector)(before)) return null;
    const removed = await this.removeIfMatches(doc, compiled.selector);
    return removed ? before : null;
  }

  async remove(id: string): Promise<void> {
    const doc = await this.native()
      .findOne({ selector: { _id: { $eq: id } } })
      .exec();
    if (!doc) throw new Error(`Document ${id} not found`);
    await doc.remove();
  }

  /**
   * BMRX-07 atomic conditional-mutation contract:
   * - The selector is rechecked against the current record inside the native
   *   `incrementalModify` retry boundary on every attempt. A doc that no
   *   longer matches yields no match (matchedCount 0 / null) and is left
   *   unmodified; the adapter does not retry selection against a different
   *   document. Callers needing claim semantics should use a single-document
   *   predicate (e.g. `_id` plus the expected value) and treat no-match as a
   *   failed claim.
   * - `before`/`after` are captured from the successful attempt's current
   *   record inside the retry boundary, so concurrent committed transitions
   *   report truthful preimages. Counts reflect write-time matching, not
   *   query-time selection. No multi-record transaction is claimed:
   *   `updateMany`/`deleteMany` apply per-document conditionally and report
   *   truthful per-document counts (partial failures throw
   *   `MutationPartialFailureError` with counts applied so far).
   * - Deletes are best-effort conditional: the selector is rechecked against
   *   the latest snapshot immediately before native `remove()`, which has no
   *   server-side predicate. A concurrent writer can still change the record
   *   between the recheck and the removal, so delete selection/write races
   *   cannot be closed fully with the native API (see follow-up note in
   *   BMRX-07 evidence).
   */
  private async conditionalModify(
    doc: RxDocument,
    selector: CompiledQuery['selector'],
    updater: AtomicUpdater,
  ): Promise<{ matched: boolean; modified: boolean; before: RxLikeDoc | null; after: RxLikeDoc | null }> {
    // Compile once, but evaluate against the current record on every retry.
    const matches = this.selectorMatcher(selector);
    let matched = false;
    let modified = false;
    let before: RxLikeDoc | null = null;
    let after: RxLikeDoc | null = null;
    await doc.incrementalModify(async (currentDoc: any) => {
      const current = toPersistenceRecord(currentDoc);
      if (!matches(current)) {
        matched = false;
        modified = false;
        before = null;
        after = null;
        return current;
      }
      matched = true;
      before = cloneRecord(current);
      const next = sanitizeMutationResult(current, await updater(cloneRecord(current)));
      after = cloneRecord(next);
      modified = !recordsEqual(current, next);
      return modified ? next : current;
    });
    return { matched, modified, before, after };
  }

  /**
   * Best-effort conditional removal: rechecks the selector against the latest
   * snapshot immediately before native `remove()`. Returns true when the
   * removal was issued. Native `remove()` carries no predicate, so this
   * narrows but does not eliminate the selection/write race.
   */
  private async removeIfMatches(doc: RxDocument, selector: CompiledQuery['selector']): Promise<boolean> {
    const latest = toPersistenceRecord(doc.toJSON());
    if (!this.selectorMatcher(selector)(latest)) return false;
    await doc.remove();
    return true;
  }

  private async queryOneDoc(compiled: CompiledQuery): Promise<RxDocument | null> {
    let query = this.native().findOne({ selector: compiled.selector });
    if (compiled.sort) query = query.sort(compiled.sort as any);
    const doc: RxDocument | null = await query.exec();
    return doc ?? null;
  }

  private selectorMatcher(selector: CompiledQuery['selector']): (record: PersistenceRecord) => boolean {
    return createSelectorMatcher(selector, this.native().schema?.jsonSchema);
  }

  private async queryDocs(compiled: CompiledQuery): Promise<RxDocument[]> {
    let query = this.native().find({ selector: compiled.selector });
    if (compiled.sort) query = query.sort(compiled.sort as any);
    if (compiled.limit !== undefined) query = query.limit((compiled.skip ?? 0) + compiled.limit);
    let docs: RxDocument[] = await query.exec();
    if (compiled.skip !== undefined && compiled.skip > 0) docs = docs.slice(compiled.skip);
    return docs;
  }

  /**
   * BMRX-22 unordered bulk contract: native `bulkInsert` rejects a batch
   * containing repeated `_id` values with a raw `COL22` error and inserts
   * nothing, so an unordered batch is partitioned into the minimum number of
   * passes such that every pass holds unique `_id` values. Passes run in
   * order and each pass preserves input order, so the first occurrence of a
   * repeated ID is always attempted first; later occurrences then fail with
   * the native 409 conflict against the stored winner (or against a
   * pre-existing record). Each pass is a single native `bulkInsert` call, so
   * the native call count equals the maximum within-batch ID frequency (1
   * when all IDs are unique). Errors carry their original input index and
   * are sorted by index; successes aggregate across passes. A pass whose
   * native call throws (defensive: partitioned passes hold unique IDs and
   * should not hit `COL22`) falls back to per-document single inserts for
   * that pass only, preserving the partial-success contract. Batches with a
   * non-string `_id` bypass partitioning via sequential unordered inserts so
   * error attribution never guesses. Ordered mode stays sequential and is
   * unchanged. No read-before-insert uniqueness check is performed; all
   * conflicts come from native write errors. Partitioning uses a per-ID
   * occurrence counter for linear work; duplicate native writes still require
   * the same number of passes.
   */
  private async insertManyUnordered(docs: PersistenceRecord[]): Promise<BulkInsertResult> {
    if (!docs.every((doc) => typeof doc?._id === 'string')) {
      return this.insertManySequential(docs, false);
    }
    const passes = partitionBulkInsert(docs);
    const native = this.native() as RxCollection<any> & {
      bulkInsert?: (docs: PersistenceRecord[]) => Promise<{ success?: RxDocument[]; error?: unknown[] }>;
    };
    const records: PersistenceRecord[] = [];
    const errors: Array<{ index: number; error: unknown }> = [];
    for (const pass of passes) {
      const ids = new Map<string, number>(pass.docs.map((doc, position) => [doc._id, pass.indexes[position]]));
      let result: { success?: RxDocument[]; error?: unknown[] };
      try {
        result = await native.bulkInsert!(pass.docs.map((doc) => cloneRecord(doc)));
      } catch {
        for (let position = 0; position < pass.docs.length; position++) {
          try {
            records.push(await this.insert(pass.docs[position]));
          } catch (singleError) {
            errors.push({ index: pass.indexes[position], error: singleError });
          }
        }
        continue;
      }
      for (const doc of result.success ?? []) records.push(toPersistenceRecord(doc.toJSON()));
      for (const error of result.error ?? []) errors.push({ index: bulkErrorIndex(error, ids), error });
    }
    errors.sort((left, right) => left.index - right.index);
    const bulkResult: BulkInsertResult = {
      insertedCount: records.length,
      insertedIds: records.map((record) => record._id),
      records,
      errors,
    };
    if (errors.length) throw new BulkWritePartialFailureError('insertMany', false, bulkResult);
    return bulkResult;
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

/**
 * Match a persistence record using RxDB semantics and the supported selector
 * normalization policy (including Date operands). Unsupported filters throw
 * `QueryFilterError`. Retained for source-level compatibility; this helper is
 * not an exported package entrypoint. Mutation retries reuse a compiled matcher.
 */
export function matchesSelector(record: PersistenceRecord, selector: Record<string, any> | undefined): boolean {
  return createSelectorMatcher(translateFilter(selector))(record);
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
