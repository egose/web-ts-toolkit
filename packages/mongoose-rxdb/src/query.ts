import type { FilterQuery, LeanResult, QueryOptions, UpdateQuery } from './types';
import type { RxLikeCollection, RxLikeDoc } from './rx-adapter';
import type { InternalModelRuntime } from './model';
import { cloneBoundedInput, compileQuery, QueryFilterError } from './query-compiler';
import { Document, validateObjectAgainstSchema } from './document';
import { applyNormalizedUpdate, documentToStorage, normalizeUpdatePlan, storageToDocument } from './converter';
import { Schema } from './schema';
import { MiddlewareEngine } from './middleware';

export type QueryOp =
  | 'find'
  | 'findOne'
  | 'count'
  | 'updateOne'
  | 'updateMany'
  | 'deleteOne'
  | 'deleteMany'
  | 'findOneAndUpdate'
  | 'findOneAndDelete';

export class MutationOptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MutationOptionError';
  }
}

export class QueryExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MongooseError';
  }
}

export interface QueryOperationDescriptor<DocType extends object = Record<string, unknown>> {
  readonly op: QueryOp;
  readonly filter?: FilterQuery<DocType>;
  readonly options?: QueryOptions;
  readonly update?: UpdateQuery<DocType>;
}

interface QueryExecutionState<DocType extends object = Record<string, unknown>> {
  readonly op: QueryOp;
  readonly filter: FilterQuery<DocType>;
  readonly options: QueryOptions;
  readonly update?: UpdateQuery<DocType>;
}

/**
 * BMRX-24: lean only transforms document-producing results.
 *
 * Hydrated documents (instances of `Document`) map to `LeanResult<Doc>`;
 * `UpdateResult`, `DeleteResult`, `number`, and other non-document results
 * pass through unchanged so `.lean()` cannot corrupt mutation counts.
 * `null` in a nullable document result is preserved. Projection
 * partial-result typing remains an explicit documented limitation: a
 * projected lean record is still typed as the full `LeanResult<Doc>`.
 */
export type LeanQueryResult<Result, Doc extends object> =
  Result extends ReadonlyArray<infer Element>
    ? Array<LeanDocumentElement<Element, Doc>>
    : LeanDocumentElement<Result, Doc>;

type LeanDocumentElement<Element, Doc extends object> = Element extends null
  ? null
  : Element extends Document<any>
    ? LeanResult<Doc>
    : Element;

/**
 * Thenable, chainable query builder returned by model read and mutation methods.
 *
 * Queries execute lazily through `exec()`, `await`, `.then()`, `.catch()`, or
 * `.finally()`, and are single-use. Call `clone()` before execution when another
 * variant of the same query must run.
 */
export class Query<
  ResultType = any,
  DocType extends object = Record<string, unknown>,
  TSchema extends Schema<DocType, any, any, any> = Schema<DocType, any, any, any>,
  HydratedType = ResultType,
> implements PromiseLike<ResultType> {
  private filter: FilterQuery<DocType> = {};
  private options: QueryOptions = {};
  private op: QueryOp = 'find';
  private updateDoc: any;
  private currentField?: string;
  private mw: MiddlewareEngine;
  private executionStarted = false;

  constructor(
    public model: any,
    public schema: TSchema,
    public collection: RxLikeCollection | null,
  ) {
    this.mw = new MiddlewareEngine(schema);
  }

  where(field: Extract<keyof DocType, string> | '_id'): this;
  where(field: FilterQuery<DocType>): this;
  where(field: Extract<keyof DocType, string> | '_id' | FilterQuery<DocType>): this {
    if (field === null) {
      throw new QueryFilterError(
        'filter must be a plain object; explicit null is rejected — omit the filter or pass {} for match-all',
      );
    }
    if (typeof field === 'object') {
      const cloned = cloneBoundedInput(field) as Record<string, any>;
      for (const [key, value] of Object.entries(cloned)) {
        const existing = (this.filter as any)[key];
        if (isFieldOperatorMap(existing) && isFieldOperatorMap(value)) {
          (this.filter as any)[key] = { ...existing, ...value };
        } else {
          (this.filter as any)[key] = value;
        }
      }
    } else this.currentField = field;
    return this;
  }

  /**
   * Builder filter-merging contract (BMRX-06):
   * - Different compatible field operators accumulate
   *   (`.where('n').gte(3).lte(7)` → `{ n: { $gte: 3, $lte: 7 } }`).
   * - A repeated operator replaces only that operator key
   *   (`.gt(1).gt(2)` → `{ $gt: 2 }`, other keys retained).
   * - `equals()` replaces the whole field condition with the cloned value.
   * - All mutable operands are snapshotted with `cloneBoundedInput`
   *   (BMRX-04 budget), so later caller mutation cannot change the query.
   */
  equals(value: any): this {
    if (this.currentField) this.filter[this.currentField as keyof FilterQuery<DocType>] = cloneBoundedInput(value);
    return this;
  }

  gt(value: any): this {
    if (this.currentField) setFieldOperator(this.filter as Record<string, any>, this.currentField, '$gt', value);
    return this;
  }

  gte(value: any): this {
    if (this.currentField) setFieldOperator(this.filter as Record<string, any>, this.currentField, '$gte', value);
    return this;
  }

  lt(value: any): this {
    if (this.currentField) setFieldOperator(this.filter as Record<string, any>, this.currentField, '$lt', value);
    return this;
  }

  lte(value: any): this {
    if (this.currentField) setFieldOperator(this.filter as Record<string, any>, this.currentField, '$lte', value);
    return this;
  }

  ne(value: any): this {
    if (this.currentField) setFieldOperator(this.filter as Record<string, any>, this.currentField, '$ne', value);
    return this;
  }

  in(values: any[]): this {
    if (this.currentField) setFieldOperator(this.filter as Record<string, any>, this.currentField, '$in', values);
    return this;
  }

  nin(values: any[]): this {
    if (this.currentField) setFieldOperator(this.filter as Record<string, any>, this.currentField, '$nin', values);
    return this;
  }

  exists(flag = true): this {
    if (this.currentField)
      setFieldOperator(this.filter as Record<string, any>, this.currentField, '$exists', cloneBoundedInput(flag));
    return this;
  }

  /**
   * Request-derived regex filters are rejected at execution time with
   * `QueryFilterError` (BMRX-03); the builder records the intent but
   * `exec()` fails before any adapter call. Use equality, range, or
   * membership operators for request filters instead.
   */
  regex(pattern: RegExp): this {
    if (this.currentField) {
      const target = (this.filter as Record<string, any>)[this.currentField];
      const next = { $regex: pattern.source, $options: pattern.flags };
      (this.filter as any)[this.currentField] = isFieldOperatorMap(target) ? { ...target, ...next } : next;
    }
    return this;
  }

  or(conditions: FilterQuery<DocType>[]): this {
    (this.filter as any).$or = cloneBoundedInput(conditions);
    return this;
  }

  and(conditions: FilterQuery<DocType>[]): this {
    (this.filter as any).$and = cloneBoundedInput(conditions);
    return this;
  }

  nor(conditions: FilterQuery<DocType>[]): this {
    (this.filter as any).$nor = cloneBoundedInput(conditions);
    return this;
  }

  limit(n: number): this {
    this.options.limit = n;
    return this;
  }

  skip(n: number): this {
    this.options.skip = n;
    return this;
  }

  sort(spec: Record<string, 1 | -1 | 'asc' | 'desc'>): this {
    this.options.sort = cloneBoundedInput(spec);
    return this;
  }

  select(projection: Record<string, 0 | 1> | string): this {
    this.options.projection = cloneBoundedInput(projection);
    return this;
  }

  /**
   * BMRX-24: `.lean(true)` maps only document-producing results to
   * `LeanResult<Doc>`; counts and mutation results are preserved unchanged.
   * `.lean(false)` restores the pre-lean hydrated result type tracked in
   * `HydratedType`, so toggling back does not leave a false lean type.
   */
  lean(): Query<LeanQueryResult<HydratedType, DocType>, DocType, TSchema, HydratedType>;
  lean(flag: true): Query<LeanQueryResult<HydratedType, DocType>, DocType, TSchema, HydratedType>;
  lean(flag: false): Query<HydratedType, DocType, TSchema, HydratedType>;
  lean(flag = true): Query<any, DocType, TSchema, HydratedType> {
    this.options.lean = flag;
    return this as unknown as Query<any, DocType, TSchema, HydratedType>;
  }

  setOp(op: QueryOp): this {
    this.op = op;
    return this;
  }

  setUpdate(update: UpdateQuery<DocType>): this {
    this.updateDoc = cloneBoundedInput(update);
    return this;
  }

  setOperationDescriptor(descriptor: QueryOperationDescriptor<DocType>): this {
    const immutable = freezeOperationDescriptor(descriptor);
    this.op = immutable.op;
    this.filter = cloneBoundedInput(resolveDescriptorFilter(immutable.filter)) as FilterQuery<DocType>;
    this.options = normalizeOptionsForOperation(immutable.op, cloneBoundedInput(immutable.options ?? {}));
    this.updateDoc = immutable.update === undefined ? undefined : cloneBoundedInput(immutable.update);
    return this;
  }

  getFilter(): FilterQuery<DocType> {
    return this.filter;
  }

  getOptions(): QueryOptions {
    return this.options;
  }

  getUpdate(): UpdateQuery<DocType> | undefined {
    return this.updateDoc;
  }

  clone(): Query<ResultType, DocType, TSchema, HydratedType> {
    const c = new Query<ResultType, DocType, TSchema, HydratedType>(this.model, this.schema, this.collection);
    c.filter = cloneBoundedInput(this.filter) as FilterQuery<DocType>;
    c.options = cloneBoundedInput(this.options);
    c.op = this.op;
    c.updateDoc = cloneBoundedInput(this.updateDoc);
    c.currentField = this.currentField;
    return c;
  }

  async exec(): Promise<ResultType> {
    if (this.executionStarted) throw new QueryExecutionError(`Query was already executed: ${this.op}`);
    this.executionStarted = true;
    const state = this.snapshotExecutionState();
    return this.mw.exec(state.op as string, this, () => this.execute(state));
  }

  private async resolveCollection(): Promise<RxLikeCollection> {
    const runtime = this.model as InternalModelRuntime<DocType>;
    if (typeof runtime.resolveCollection === 'function') {
      this.collection = await runtime.resolveCollection();
      return this.collection as RxLikeCollection;
    }
    if (this.collection) return this.collection;
    if (!this.collection)
      throw new Error(`Model "${this.model?.modelName ?? 'unknown'}" is not attached to a collection.`);
    return this.collection;
  }

  private async execute(state: QueryExecutionState<DocType>): Promise<any> {
    this.collection = await this.resolveCollection();
    const compiled = compileQuery(state.filter, state.options);
    switch (state.op) {
      case 'find':
        return await this.runFind(compiled, state);
      case 'findOne':
        return await this.runFindOne(compiled, state);
      case 'count':
        return await this.runCount(compiled);
      case 'updateOne':
        return await this.runUpdate(compiled, false, state);
      case 'updateMany':
        return await this.runUpdate(compiled, true, state);
      case 'deleteOne':
        return await this.runDelete(compiled, false);
      case 'deleteMany':
        return await this.runDelete(compiled, true);
      case 'findOneAndUpdate':
        return await this.runFindOneAndUpdate(compiled, state);
      case 'findOneAndDelete':
        return await this.runFindOneAndDelete(compiled, state);
      default:
        throw new Error(`Unsupported query op: ${this.op}`);
    }
  }

  private snapshotExecutionState(): QueryExecutionState<DocType> {
    const op = this.op;
    return {
      op,
      filter: cloneBoundedInput(this.filter) as FilterQuery<DocType>,
      options: normalizeOptionsForOperation(op, cloneBoundedInput(this.options)),
      update: cloneBoundedInput(this.updateDoc),
    };
  }

  private async runFind(
    compiled: ReturnType<typeof compileQuery>,
    state: QueryExecutionState<DocType>,
  ): Promise<any[]> {
    const records = await this.collection!.find(compiled);
    if (state.options.lean) return records.map((record) => storageToDocument(record, this.schema));
    return Promise.all(records.map((record) => this.hydrate(record)));
  }

  private async runFindOne(
    compiled: ReturnType<typeof compileQuery>,
    state: QueryExecutionState<DocType>,
  ): Promise<any | null> {
    const doc = await this.collection!.findOne({ ...compiled, limit: 1 });
    if (!doc) return null;
    return state.options.lean ? storageToDocument(doc, this.schema) : this.hydrate(doc);
  }

  private async runCount(compiled: ReturnType<typeof compileQuery>): Promise<number> {
    return this.collection!.count({ selector: compiled.selector, skip: compiled.skip, limit: compiled.limit });
  }

  private async runUpdate(
    compiled: ReturnType<typeof compileQuery>,
    many: boolean,
    state: QueryExecutionState<DocType>,
  ): Promise<{ matchedCount: number; modifiedCount: number; upsertedCount?: number; upsertedId?: string }> {
    const plan = normalizeUpdatePlan(state.update, this.schema, { allowImmutable: state.options.upsert === true });
    const updater = async (doc: RxLikeDoc) => {
      const next = applyNormalizedUpdate(doc, plan, this.schema);
      if (state.options.runValidators) await validateObjectAgainstSchema(next, this.schema);
      return next;
    };
    const result = many
      ? await this.collection!.updateMany(compiled, updater)
      : await this.collection!.updateOne(compiled, updater);
    if (!many && result.matchedCount === 0 && state.options.upsert) {
      const inserted = await this.insertUpsert(compiled, plan, state);
      return { ...result, upsertedCount: 1, upsertedId: inserted._id };
    }
    return result;
  }

  private async runDelete(compiled: ReturnType<typeof compileQuery>, many: boolean): Promise<{ deletedCount: number }> {
    return many ? this.collection!.deleteMany(compiled) : this.collection!.deleteOne(compiled);
  }

  private async runFindOneAndUpdate(
    compiled: ReturnType<typeof compileQuery>,
    state: QueryExecutionState<DocType>,
  ): Promise<any | null> {
    const plan = normalizeUpdatePlan(state.update, this.schema, { allowImmutable: state.options.upsert === true });
    const result = await this.collection!.findOneAndUpdate(compiled, async (current) => {
      const next = applyNormalizedUpdate(current, plan, this.schema);
      if (state.options.runValidators) await validateObjectAgainstSchema(next, this.schema);
      return next;
    });
    if (!result.before) {
      if (state.options.upsert && state.update) {
        const inserted = await this.insertUpsert(compiled, plan, state);
        return wantsDocumentAfter(state.options) ? this.resultDocument(inserted, state) : null;
      }
      return null;
    }
    return wantsDocumentAfter(state.options)
      ? result.after
        ? this.resultDocument(result.after, state)
        : null
      : result.before
        ? this.resultDocument(result.before, state)
        : null;
  }

  private async runFindOneAndDelete(
    compiled: ReturnType<typeof compileQuery>,
    state: QueryExecutionState<DocType>,
  ): Promise<any | null> {
    const doc = await this.collection!.findOneAndDelete(compiled);
    if (!doc) return null;
    return this.resultDocument(doc, state);
  }

  private async insertUpsert(
    compiled: ReturnType<typeof compileQuery>,
    plan: ReturnType<typeof normalizeUpdatePlan>,
    state: QueryExecutionState<DocType>,
  ): Promise<RxLikeDoc> {
    const base = equalityFieldsForUpsert(compiled.selector);
    if (!base._id) base._id = createId();
    const normalized = documentToStorage(
      applyNormalizedUpdate(base, plan, this.schema, { skipImmutableCheck: true }),
      this.schema,
      {
        allowId: true,
        applyDefaults: state.options.setDefaultsOnInsert === true,
      },
    );
    if (!normalized._id) normalized._id = createId();
    await validateObjectAgainstSchema(normalized, this.schema);
    return this.collection!.insert(normalized);
  }

  private async resultDocument(raw: RxLikeDoc, state: QueryExecutionState<DocType>): Promise<any> {
    if (state.options.lean) return storageToDocument(raw, this.schema);
    return this.hydrate(raw);
  }

  private async hydrate(raw: RxLikeDoc): Promise<Document<DocType>> {
    const doc = new Document<DocType>(
      storageToDocument(raw, this.schema) as unknown as Partial<DocType>,
      this.schema,
      this.model,
      {
        isNew: false,
        id: raw._id,
        applyDefaults: false,
      },
    );
    return this.mw.exec('init', doc, async () => doc);
  }

  then<TResult1 = ResultType, TResult2 = never>(
    onFulfilled?: ((value: ResultType) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.exec().then(onFulfilled, onRejected);
  }

  catch<TResult = never>(
    onRejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
  ): Promise<ResultType | TResult> {
    return this.exec().catch(onRejected);
  }

  finally(onFinally?: (() => void) | null): Promise<ResultType> {
    return this.exec().finally(onFinally);
  }

  get [Symbol.toStringTag]() {
    return 'MongooseLikeQuery';
  }
}

function createId(): string {
  return (globalThis.crypto?.randomUUID?.() as string) ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * BMRX-05 direct-boundary policy: an omitted filter (`undefined`) is an
 * intentional match-all (`{}`), while an explicit `null` filter is rejected
 * with `QueryFilterError` instead of being silently widened to match-all.
 */
function resolveDescriptorFilter<DocType extends object>(filter: QueryOperationDescriptor<DocType>['filter']) {
  if (filter === undefined) return {};
  if (filter === null) {
    throw new QueryFilterError(
      'filter must be a plain object; explicit null is rejected — omit the filter or pass {} for match-all',
    );
  }
  return filter;
}

function freezeOperationDescriptor<DocType extends object>(
  descriptor: QueryOperationDescriptor<DocType>,
): QueryOperationDescriptor<DocType> {
  return Object.freeze({
    op: descriptor.op,
    filter: deepFreeze(cloneBoundedInput(resolveDescriptorFilter(descriptor.filter))) as FilterQuery<DocType>,
    options: deepFreeze(cloneBoundedInput(descriptor.options ?? {})) as QueryOptions,
    update:
      descriptor.update === undefined
        ? undefined
        : (deepFreeze(cloneBoundedInput(descriptor.update)) as UpdateQuery<DocType>),
  });
}

function normalizeOptionsForOperation(op: QueryOp, options: QueryOptions): QueryOptions {
  const supported = supportedOptionsForOperation(op);
  const normalized: QueryOptions = {};
  for (const [key, value] of Object.entries(options) as Array<[keyof QueryOptions | string, any]>) {
    if (value === undefined) continue;
    if (!supported.has(key as keyof QueryOptions)) {
      throw new MutationOptionError(
        `Option "${key}" is not supported for ${op}. Supported options: ${Array.from(supported).join(', ') || 'none'}.`,
      );
    }
    (normalized as any)[key] = value;
  }
  if (
    normalized.returnDocument !== undefined &&
    normalized.returnDocument !== 'before' &&
    normalized.returnDocument !== 'after'
  ) {
    throw new MutationOptionError('Option "returnDocument" must be either "before" or "after".');
  }
  if (normalized.setDefaultsOnInsert !== undefined && normalized.upsert !== true) {
    throw new MutationOptionError('Option "setDefaultsOnInsert" is only supported when "upsert" is true.');
  }
  if (normalized.new !== undefined && typeof normalized.new !== 'boolean') {
    throw new MutationOptionError('Option "new" must be a boolean.');
  }
  if (normalized.upsert !== undefined && typeof normalized.upsert !== 'boolean') {
    throw new MutationOptionError('Option "upsert" must be a boolean.');
  }
  if (normalized.runValidators !== undefined && typeof normalized.runValidators !== 'boolean') {
    throw new MutationOptionError('Option "runValidators" must be a boolean.');
  }
  if (normalized.setDefaultsOnInsert !== undefined && typeof normalized.setDefaultsOnInsert !== 'boolean') {
    throw new MutationOptionError('Option "setDefaultsOnInsert" must be a boolean.');
  }
  return normalized;
}

function supportedOptionsForOperation(op: QueryOp): Set<keyof QueryOptions> {
  switch (op) {
    case 'find':
    case 'findOne':
      return new Set(['sort', 'limit', 'skip', 'projection', 'lean']);
    case 'count':
      return new Set(['sort', 'limit', 'skip']);
    case 'updateOne':
      return new Set(['sort', 'upsert', 'runValidators', 'setDefaultsOnInsert']);
    case 'updateMany':
      return new Set(['sort', 'runValidators']);
    case 'deleteOne':
      return new Set(['sort']);
    case 'deleteMany':
      return new Set();
    case 'findOneAndUpdate':
      return new Set(['sort', 'upsert', 'new', 'returnDocument', 'runValidators', 'setDefaultsOnInsert', 'lean']);
    case 'findOneAndDelete':
      return new Set(['sort', 'lean']);
  }
}

function wantsDocumentAfter(options: QueryOptions): boolean {
  if (options.returnDocument !== undefined) return options.returnDocument === 'after';
  return options.new === true;
}

function equalityFieldsForUpsert(selector: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = Object.create(null);
  for (const [path, condition] of Object.entries(selector)) {
    if (path.startsWith('$')) continue;
    if (!condition || typeof condition !== 'object' || Array.isArray(condition)) continue;
    const keys = Object.keys(condition);
    if (keys.length === 1 && keys[0] === '$eq') setDottedValue(out, path, cloneBoundedInput(condition.$eq));
  }
  return out;
}

function setFieldOperator(target: Record<string, any>, field: string, operator: string, value: any): void {
  const cloned = cloneBoundedInput(value);
  const existing = target[field];
  if (isFieldOperatorMap(existing)) target[field] = { ...existing, [operator]: cloned };
  else target[field] = { [operator]: cloned };
}

function isFieldOperatorMap(value: unknown): value is Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value instanceof Date || value instanceof RegExp) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => key.startsWith('$'));
}

function setDottedValue(target: Record<string, any>, path: string, value: any): void {
  const segments = path.split('.');
  let cursor: Record<string, any> = target;
  for (let index = 0; index < segments.length - 1; index++) {
    const segment = segments[index];
    if (!cursor[segment] || typeof cursor[segment] !== 'object' || Array.isArray(cursor[segment]))
      cursor[segment] = Object.create(null);
    cursor = cursor[segment];
  }
  cursor[segments[segments.length - 1]] = value;
}

function deepFreeze<T>(value: T, seen: Set<object> = new Set()): T {
  if (!value || typeof value !== 'object' || value instanceof Date || value instanceof RegExp) return value;
  if (seen.has(value as object)) return value;
  seen.add(value as object);
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, any>)) deepFreeze(nested, seen);
  return value;
}

export default Query;
