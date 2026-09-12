import mongoose, { type ClientSession, type Model, type Schema } from 'mongoose';
import { isFunction, isObject, isPlainObject } from '@web-ts-toolkit/utils';

import { isReference } from '../utils';

type QueryOptions = {
  lean?: boolean;
  populate?: unknown;
  select?: unknown;
  sort?: unknown;
  session?: ClientSession | null;
};

type QueryBuilder<TResult = unknown[]> = PromiseLike<TResult> & {
  lean(): QueryBuilder<TResult>;
  populate(value: unknown): QueryBuilder<TResult>;
  select(value: unknown): QueryBuilder<TResult>;
  sort(value: unknown): QueryBuilder<TResult>;
  session(value?: ClientSession | null): QueryBuilder<TResult>;
};

/**
 * MongoDB query operators accepted for a single document field in
 * {@link QueryFilter}. The runtime forwards relationship and full filters
 * straight to Mongoose `find()`, so operator objects (for example
 * `{ price: { $gt: 5 } }`) are evaluated by MongoDB rather than by this
 * package. Each field therefore accepts either its plain document value or
 * an operator object; top-level logical operators (`$and`/`$or`/`$not`/`$nor`)
 * remain available through the trailing `Record<string, unknown>` index.
 */
export type QueryOperators<TValue = unknown> = {
  $eq?: TValue;
  $ne?: TValue;
  $gt?: TValue;
  $gte?: TValue;
  $lt?: TValue;
  $lte?: TValue;
  $in?: TValue[];
  $nin?: TValue[];
  $exists?: boolean;
  $regex?: string | RegExp;
  $type?: string | string[];
  $not?: QueryOperators<TValue> | RegExp;
  $size?: number;
  $all?: TValue[];
  $elemMatch?: Record<string, unknown>;
};

/**
 * Typed dependent-collection filter. Each declared document field accepts its
 * plain value, a {@link QueryOperators} object, or `null`; undeclared paths
 * (including `$and`/`$or` operator payloads composed by
 * `extraForeignFilter`) are accepted through the index signature and passed
 * to Mongoose unchanged.
 */
export type QueryFilter<TDocument extends Record<string, unknown> = Record<string, unknown>> = {
  [K in keyof TDocument]?: TDocument[K] | QueryOperators<TDocument[K]> | null;
} & Record<string, unknown>;

/**
 * Dependents grouped by configured model name. The no-argument
 * `findDependents()`/`findOrphans()` overloads return a `Partial` map:
 * entries whose lookup is unsupported (for example `findOrphans()` for a
 * non-`_id` local key, dotted foreign path, dynamic `refPath`, or
 * `foreignFilter`-only relationship) or whose resolver produced a
 * nullish/non-object result are omitted rather than reported as empty
 * arrays, matching the `mergeResults` runtime behavior.
 */
export type CascadeDeleteDependencyMap<TModelName extends string, TDependentDocument = unknown> = Record<
  TModelName,
  TDependentDocument[]
>;

export type CascadeDeleteDocumentMethods<TModelName extends string, TDependentDocument = unknown> = {
  findDependents(): Promise<
    Partial<CascadeDeleteDependencyMap<TModelName, TDependentDocument>> & Record<string, unknown[]>
  >;
  findDependents(modelName: TModelName): Promise<TDependentDocument[]>;
  findDependents(modelName: string): Promise<unknown[] | null>;
};

export type CascadeDeleteModelStatics<TModelName extends string, TDependentDocument = unknown> = {
  findOrphans(): Promise<
    Partial<CascadeDeleteDependencyMap<TModelName, TDependentDocument>> & Record<string, unknown[]>
  >;
  findOrphans(modelName: TModelName): Promise<TDependentDocument[] | null>;
  findOrphans(modelName: string): Promise<unknown[] | null>;
};

type PluginDocumentContext = {
  get(path: string): unknown;
  toObject(options: { virtuals: false }): Record<string, unknown>;
  $session?(): ClientSession | null;
  constructor?: unknown;
};

type PluginModelContext = {
  distinct(path: string, filter?: unknown, options?: { session?: ClientSession | null }): Promise<unknown[]>;
  modelName: string;
  collection?: { conn?: unknown };
};

type DeleteCapableDocument = {
  deleteOne?: (options?: { session?: ClientSession | null }) => Promise<unknown>;
  remove?: (options?: { session?: ClientSession | null }) => Promise<unknown>;
  $session?: (session?: ClientSession) => unknown;
};

type OwningConnection = {
  model(name: string): Model<any>;
  getClient?: () => unknown;
};

type ExecutionContext = {
  connection: OwningConnection;
  Target: Model<any>;
  session: ClientSession | null;
};

export type FilterResolver<TDependentDocument extends Record<string, unknown> = Record<string, unknown>> =
  | QueryFilter<TDependentDocument>
  | ((document: unknown) => QueryFilter<TDependentDocument> | null | undefined);

export interface CascadeDeletePluginOptions<
  TModelName extends string = string,
  TDependentDocument extends Record<string, unknown> = Record<string, unknown>,
> {
  model: TModelName;
  localField?: string;
  foreignField?: string;
  foreignFilter?: FilterResolver<TDependentDocument>;
  extraForeignFilter?: FilterResolver<TDependentDocument>;
  /**
   * Maximum dependent deletes allowed in flight at once for this relationship.
   * Must be an integer >= 1. Defaults to 8. Inside an active transaction the
   * effective limit is forced to 1 (MOO-04 serialization) regardless of this
   * value. Public `findDependents()` is unaffected: it still returns an array.
   */
  maxConcurrency?: number;
  /**
   * Maximum dependent `_id`s acquired per internal ID-page query. Must be an
   * integer >= 1. Defaults to 100. Bounds acquisition memory; deletion work is
   * never all materialized or scheduled up front.
   */
  batchSize?: number;
}

const resolveFilter = <TDependentDocument extends Record<string, unknown>>(
  value: FilterResolver<TDependentDocument> | undefined,
  document?: unknown,
): QueryFilter<TDependentDocument> | null => {
  const result = isFunction(value) ? value(document) : value;

  if (!isPlainObject(result)) {
    return null;
  }

  return result;
};

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const isEmptyFilterObject = (value: Record<string, unknown>): boolean => Object.keys(value).length === 0;

const EMPTY_FULL_FILTER_MESSAGE =
  'cascadeDeletePlugin rejects empty foreignFilter by default because {} would match every document in the dependent collection; ' +
  'provide a non-empty filter object. Broad deletes are not implicitly enabled.';

const DEFAULT_MAX_CONCURRENCY = 8;
const DEFAULT_BATCH_SIZE = 100;

const assertPositiveIntOption = (value: unknown, name: string, modelName: string): void => {
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(
      `cascadeDeletePlugin for model "${modelName}" requires \`${name}\` to be an integer >= 1 when provided`,
    );
  }
};

const assertPluginOptions = (
  options: CascadeDeletePluginOptions<string, Record<string, unknown>> | undefined | null,
): void => {
  if (!isPlainObject(options)) {
    throw new Error('cascadeDeletePlugin requires options with a non-empty `model` name');
  }

  const { model, localField, foreignField, foreignFilter, extraForeignFilter } = options;

  if (!isNonEmptyString(model)) {
    throw new Error('cascadeDeletePlugin requires a non-empty `model` name');
  }

  if (localField !== undefined && !isNonEmptyString(localField)) {
    throw new Error('cascadeDeletePlugin requires `localField` to be a non-empty string when provided');
  }

  assertPositiveIntOption(options.maxConcurrency, 'maxConcurrency', model);
  assertPositiveIntOption(options.batchSize, 'batchSize', model);

  if (foreignField !== undefined && !isNonEmptyString(foreignField)) {
    throw new Error('cascadeDeletePlugin requires `foreignField` to be a non-empty string when provided');
  }

  if (foreignFilter !== undefined) {
    if (!isFunction(foreignFilter) && !isPlainObject(foreignFilter)) {
      throw new Error(
        `cascadeDeletePlugin invalid \`foreignFilter\` for model "${model}": expected a plain filter object or a resolver function`,
      );
    }

    if (isPlainObject(foreignFilter) && isEmptyFilterObject(foreignFilter as Record<string, unknown>)) {
      throw new Error(`cascadeDeletePlugin ${EMPTY_FULL_FILTER_MESSAGE}`);
    }
  } else if (!isNonEmptyString(localField) || !isNonEmptyString(foreignField)) {
    throw new Error(
      `cascadeDeletePlugin for model "${model}" requires either \`foreignFilter\` or both \`localField\` and \`foreignField\``,
    );
  }

  if (extraForeignFilter !== undefined) {
    if (!isFunction(extraForeignFilter) && !isPlainObject(extraForeignFilter)) {
      throw new Error(
        `cascadeDeletePlugin invalid \`extraForeignFilter\` for model "${model}": expected a plain filter object or a resolver function`,
      );
    }
  }
};

const assertFullFilterNotEmpty = (filter: Record<string, unknown>, modelName: string): void => {
  if (isEmptyFilterObject(filter)) {
    throw new Error(`cascadeDeletePlugin for model "${modelName}" ${EMPTY_FULL_FILTER_MESSAGE}`);
  }
};

const isMissingScalarKey = (value: unknown): boolean => {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string' && value.trim().length === 0) return true;
  return false;
};

const unwrapKeyValue = (value: unknown): unknown => {
  if (isPlainObject(value)) {
    const candidate = (value as Record<string, unknown>)._id;
    if (candidate !== undefined && candidate !== null) return candidate;
  }

  if (isObject(value)) {
    try {
      const candidate = (value as { _id?: unknown })._id;
      if (candidate !== undefined && candidate !== null) return candidate;
    } catch {
      // Fall through and use the raw value below.
    }
  }

  return value;
};

/**
 * Normalizes a relationship local value to the concrete key list used in the
 * dependent query. Returns `null` when there is no valid relationship to
 * query (missing/null/empty keys), so callers can skip the destructive query
 * instead of matching unrelated null/missing-key records.
 */
const normalizeKeyList = (localValue: unknown): unknown[] | null => {
  if (Array.isArray(localValue)) {
    const keys: unknown[] = [];

    for (const entry of localValue) {
      const unwrapped = unwrapKeyValue(entry);
      if (!isMissingScalarKey(unwrapped)) keys.push(unwrapped);
    }

    return keys.length > 0 ? keys : null;
  }

  const unwrapped = unwrapKeyValue(localValue);
  if (isMissingScalarKey(unwrapped)) return null;

  return [unwrapped];
};

const isPathDeselected = (owner: unknown, path: string): boolean => {
  try {
    const candidate = owner as {
      $isSelected?: (selectedPath: string) => unknown;
      isSelected?: (selectedPath: string) => unknown;
    };

    if (typeof candidate.$isSelected === 'function') {
      const result = candidate.$isSelected(path);
      if (typeof result === 'boolean') return result === false;
    }

    if (typeof candidate.isSelected === 'function') {
      const result = candidate.isSelected(path);
      if (typeof result === 'boolean') return result === false;
    }
  } catch {
    // Unknown selection state: treat as not provably deselected.
  }

  return false;
};

const buildRelationshipPredicate = (foreignField: string, localValue: unknown): Record<string, unknown> | null => {
  const keys = normalizeKeyList(localValue);
  if (!keys) return null;

  if (Array.isArray(localValue)) {
    return { [foreignField]: { $in: keys } };
  }

  return { [foreignField]: keys[0] };
};

/**
 * Composes supplemental constraints conjunctively so an extra filter can only
 * narrow the relationship predicate, never replace or widen it. An absent,
 * nullish, non-object, or empty extra filter leaves the relationship
 * predicate unchanged.
 */
const combineWithRelationship = (
  relationship: Record<string, unknown>,
  extra: Record<string, unknown> | null,
): Record<string, unknown> => {
  if (!extra || isEmptyFilterObject(extra)) return relationship;

  return { $and: [relationship, extra] };
};

const applyQueryOptions = <TResult>(query: QueryBuilder<TResult>, options: QueryOptions): QueryBuilder<TResult> => {
  let builder = query;

  if (options.select) {
    builder = builder.select(options.select as never);
  }

  if (options.sort) {
    builder = builder.sort(options.sort as never);
  }

  if (options.populate) {
    builder = builder.populate(options.populate as never);
  }

  if (options.lean) {
    builder = builder.lean();
  }

  if (options.session) {
    builder = builder.session(options.session);
  }

  return builder;
};

const getOwningConnection = (owner: unknown): OwningConnection => {
  const candidate =
    (owner as { collection?: { conn?: unknown } })?.collection?.conn ??
    (owner as { constructor?: { collection?: { conn?: unknown } } })?.constructor?.collection?.conn ??
    null;

  if (candidate && typeof (candidate as OwningConnection).model === 'function') {
    return candidate as OwningConnection;
  }

  return mongoose as unknown as OwningConnection;
};

const getBoundSession = (owner: unknown): ClientSession | null => {
  try {
    const session = (owner as { $session?: () => ClientSession | null })?.$session?.() ?? null;
    return (session ?? null) as ClientSession | null;
  } catch {
    return null;
  }
};

/**
 * Single execution-context boundary for cascade work.
 *
 * Resolves the dependent model through the owning model's connection (never the
 * global registry alone) and carries the effective session (explicit operation
 * option first, then the document-bound `$session()`).
 */
const resolveExecutionContext = (
  owner: unknown,
  targetModelName: string,
  explicitSession?: ClientSession | null,
): ExecutionContext => {
  const session = explicitSession ?? getBoundSession(owner) ?? null;
  const connection = getOwningConnection(owner);
  const Target = connection.model(targetModelName);

  return { connection, Target, session };
};

const isInTransaction = (session: ClientSession | null): boolean => {
  try {
    return typeof session?.inTransaction === 'function' ? session.inTransaction() : false;
  } catch {
    return false;
  }
};

const getSessionClient = (session: ClientSession | null): unknown => {
  if (!session) return null;
  return ((session as unknown as { client?: unknown }).client ?? null) as unknown;
};

const getConnectionClient = (connection: OwningConnection): unknown => {
  try {
    if (connection === (mongoose as unknown as OwningConnection)) {
      return mongoose.connection.getClient?.() ?? null;
    }

    return connection.getClient?.() ?? null;
  } catch {
    return null;
  }
};

const getTopologyType = (client: unknown): string | null => {
  try {
    const topology = (client as { topology?: { description?: { type?: unknown } } })?.topology;
    const type = topology?.description?.type;
    return typeof type === 'string' ? type : null;
  } catch {
    return null;
  }
};

/**
 * Rejects transaction modes the cascade cannot run atomically before the parent
 * document is removed. Cross-client sessions can never share one transaction,
 * and an active transaction on a standalone (`Single`) topology has no server
 * support, so both fail closed here instead of leaking part of the cascade
 * outside its session.
 */
const assertTransactionSupported = (context: ExecutionContext): void => {
  const { connection, session } = context;
  if (!session) return;

  const sessionClient = getSessionClient(session);
  const connectionClient = getConnectionClient(connection);
  if (sessionClient && connectionClient && sessionClient !== connectionClient) {
    throw new Error(
      'cascadeDeletePlugin does not support sessions bound to a different connection/client; pass a session from the owning model connection',
    );
  }

  if (isInTransaction(session)) {
    const topologyType = getTopologyType(sessionClient);
    if (topologyType === 'Single') {
      throw new Error(
        'cascadeDeletePlugin does not support transactions on a standalone MongoDB deployment; use a replica set or sharded cluster, or delete without a transaction',
      );
    }
  }
};

const supportsDeleteOne = (value: unknown): value is Required<Pick<DeleteCapableDocument, 'deleteOne'>> =>
  isObject(value) && typeof (value as DeleteCapableDocument).deleteOne === 'function';

const supportsRemove = (value: unknown): value is Required<Pick<DeleteCapableDocument, 'remove'>> =>
  isObject(value) && typeof (value as DeleteCapableDocument).remove === 'function';

const mergeResults = <TModelName extends string, TResult>(
  previousResults: unknown,
  modelName: TModelName,
  currentResults: TResult | null,
) => {
  const resultMap: Record<string, unknown> = isPlainObject(previousResults) ? previousResults : {};

  if (currentResults === null) {
    return resultMap;
  }

  return {
    ...resultMap,
    [modelName]: currentResults,
  };
};

type DependentFilterConfig = {
  model: string;
  localField?: string;
  foreignField?: string;
  foreignFilter?: FilterResolver<Record<string, unknown>>;
  extraForeignFilter?: FilterResolver<Record<string, unknown>>;
};

/**
 * Predicate boundary (MOO-05): resolves the dependent filter for one owner
 * document without touching connections, sessions, or queries. Returns `null`
 * for intentionally empty relations / nullish resolver results (zero
 * dependents). Throws for provably deselected local paths and empty
 * full-filter resolver results.
 */
const resolveDependentFilter = (
  owner: PluginDocumentContext,
  config: DependentFilterConfig,
): Record<string, unknown> | null => {
  const { model, localField, foreignField, foreignFilter, extraForeignFilter } = config;
  const document = owner.toObject({ virtuals: false });

  if (foreignFilter !== undefined) {
    const resolved = resolveFilter(foreignFilter as FilterResolver<Record<string, unknown>>, document);
    if (resolved === null) return null;
    assertFullFilterNotEmpty(resolved as Record<string, unknown>, model);
    return resolved as Record<string, unknown>;
  }

  if (localField && foreignField) {
    const localValue = owner.get(localField);

    if (normalizeKeyList(localValue) === null) {
      if (isPathDeselected(owner, localField)) {
        throw new Error(
          `cascadeDeletePlugin for model "${model}" cannot resolve dependents: localField "${localField}" was not selected on the document; ` +
            `load the document with that path projected instead of assuming an empty relation`,
        );
      }

      return null;
    }

    const relationship = buildRelationshipPredicate(foreignField, localValue);
    if (!relationship) return null;

    const extraFilter = resolveFilter(extraForeignFilter as FilterResolver<Record<string, unknown>>, document);
    return combineWithRelationship(relationship, extraFilter as Record<string, unknown> | null);
  }

  return null;
};

type TraversalLimits = {
  maxConcurrency: number;
  batchSize: number;
};

const resolveTraversalLimits = (options: { maxConcurrency?: unknown; batchSize?: unknown }): TraversalLimits => ({
  maxConcurrency: typeof options.maxConcurrency === 'number' ? options.maxConcurrency : DEFAULT_MAX_CONCURRENCY,
  batchSize: typeof options.batchSize === 'number' ? options.batchSize : DEFAULT_BATCH_SIZE,
});

const extractIdList = (rows: unknown[]): unknown[] =>
  rows.map((row) => {
    if (isPlainObject(row)) return (row as Record<string, unknown>)._id;
    if (isObject(row)) {
      try {
        const candidate = (row as { _id?: unknown })._id;
        if (candidate !== undefined) return candidate;
      } catch {
        // Fall through to the raw row below.
      }
    }
    return row;
  });

/**
 * Traversal boundary (MOO-06): bounded `_id` page acquisition. Only `_id`s are
 * materialized per page (`batchSize` rows, lean); full documents are loaded
 * one batch at a time by the caller, so wide relationships never materialize
 * or schedule the whole dependent set up front.
 */
const fetchDependentIdPage = async (
  Target: ExecutionContext['Target'],
  filter: Record<string, unknown>,
  session: ClientSession | null,
  lastId: unknown,
  batchSize: number,
): Promise<unknown[]> => {
  const paged = lastId === undefined ? filter : { $and: [filter, { _id: { $gt: lastId } }] };
  let query = Target.find(paged).select('_id').sort({ _id: 1 }).limit(batchSize).lean();
  if (session) query = query.session(session);
  const rows = (await query) as unknown[];
  return extractIdList(Array.isArray(rows) ? rows : []);
};

/**
 * Loads one fully hydrated dependent document (no `select` restriction) so
 * nested cascade hooks (`localField` reads) and custom document hooks/filter
 * resolvers observe the same fields as a directly loaded document. Returns
 * `null` when the row is already gone (raced diamond/delayed retry): the
 * caller skips it instead of failing the whole cascade.
 */
const loadHydratedDependent = async (
  Target: ExecutionContext['Target'],
  id: unknown,
  session: ClientSession | null,
): Promise<unknown> => {
  const query = Target.findById(id);
  const result = session ? await query.session(session) : await query;
  return result ?? null;
};

/**
 * Bounded in-flight execution. At most `limit` callbacks run concurrently;
 * no new work starts after the first failure (fail-fast). Callers choose the
 * limit; traversal forces `1` inside an active transaction (MOO-04).
 */
const runWithConcurrencyLimit = async <T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> => {
  if (items.length === 0) return;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  let next = 0;
  let failed = false;
  let firstError: unknown = null;

  const workers = Array.from({ length: workerCount }, () => {
    const run = async (): Promise<void> => {
      while (true) {
        if (failed) return;
        const index = next;
        next += 1;
        if (index >= items.length) return;
        try {
          await task(items[index]);
        } catch (error) {
          if (!failed) {
            failed = true;
            firstError = error;
          }
          throw error;
        }
      }
    };
    return run();
  });

  try {
    await Promise.all(workers);
  } catch {
    throw firstError;
  }
};

/**
 * Cascades document `deleteOne()` to configured dependent models.
 *
 * Supported operations: only document `deleteOne()` (and legacy document
 * `remove()` for dependents) is intercepted, through
 * `pre('deleteOne', { document: true, query: false })` and
 * `post('deleteOne', { document: true, query: false })`. Query helpers such
 * as `deleteMany()`, `findOneAndDelete()`, `updateOne()`, and query
 * `deleteOne()` bypass the cascade entirely. `findDependents()` is a
 * document method; `findOrphans()` is a model static with the support matrix
 * documented on {@link CascadeDeleteDependencyMap} (unsupported shapes
 * resolve to `null` and are omitted from the no-argument map).
 *
 * Post-delete failure timing: the `post('deleteOne')` hook runs after the
 * parent document is already removed. A later dependent failure therefore
 * rejects the parent `deleteOne()` promise without restoring the parent —
 * see the traversal contract below for the transactional abort path.
 *
 * Supported behavior: dependent models resolve through the owning model's
 * connection (duplicate names on other connections stay isolated); the
 * effective session (explicit `deleteOne({ session })` option, else the
 * document-bound `$session()`) flows through dependent reads and deletes,
 * including nested cascades; inside an active transaction dependent deletes run
 * serially on that session so replica-set commit/abort covers parent and
 * dependents together. Unsupported modes fail before the parent is removed: a
 * session from a different connection/client, or an active transaction on a
 * standalone (`Single`) topology.
 *
 * Predicate fail-closed contract (MOO-05):
 *
 * - Relationship mode (`localField` + `foreignField`) never issues a
 *   destructive query without a valid relationship. Missing/`null`/empty
 *   local keys (including empty reference arrays and arrays containing only
 *   nullish entries) resolve to zero dependents and delete nothing, so
 *   unrelated records with a missing/`null` foreign key survive. A local field
 *   that was omitted by a projection is distinguished from an intentionally
 *   empty relation: when the path is provably deselected (`$isSelected()`
 *   returns `false`) the lookup throws instead of silently reporting zero
 *   dependents.
 * - Supplemental `extraForeignFilter` constraints are composed conjunctively
 *   (`{ $and: [relationship, extra] }`). An extra filter on the relationship
 *   field therefore intersects instead of replacing or widening the deletion
 *   set; `$or`/`$and`/operator payloads inside the extra filter stay
 *   constrained by the relationship predicate. An absent, nullish,
 *   non-object, or empty extra filter leaves the relationship unchanged.
 * - Explicit full-filter mode (`foreignFilter`) is a separately documented
 *   contract: the resolved filter is used as-is with no relationship
 *   predicate, and any configured `extraForeignFilter` is ignored. A resolver
 *   returning `null`/`undefined`/non-object resolves to zero dependents.
 *   Maintainer decision: an intentionally empty full filter (`{}`) is rejected
 *   by default — statically at `schema.plugin(...)` time and dynamically when
 *   a resolver returns `{}` — because it would match the whole dependent
 *   collection. There is currently no broad-delete opt-in flag.
 * - Option validation runs at `schema.plugin(...)` time: `model` must be a
 *   non-empty string, relationship mode requires both `localField` and
 *   `foreignField`, static `foreignFilter`/`extraForeignFilter` values must be
 *   plain objects (or resolver functions), and a static empty `foreignFilter`
 *   throws. Invalid runtime resolver results fail closed as described above.
 *
 * Traversal/bounds contract (MOO-06):
 *
 * - Deletion never uses bulk writes: every dependent is removed through its
 *   own hydrated document `deleteOne()` (or legacy `remove()`), so nested
 *   cascade middleware and custom document hooks always run with full field
 *   state. Public `findDependents()` keeps its array-returning API for
 *   convenience; internal deletion traversal pages `_id`s (`batchSize`,
 *   default 100) and loads full documents per page instead.
 * - In-flight deletes are bounded by `maxConcurrency` (default 8, integer
 *   >= 1). Inside an active transaction the effective limit is forced to 1 to
 *   preserve MOO-04 serialization. No new deletes start after the first
 *   failure (fail-fast).
 * - Partial failure: `post('deleteOne')` runs after the parent is already
 *   removed. Outside a transaction a dependent failure rejects the parent
 *   `deleteOne()` promise but cannot restore the parent or already-deleted
 *   dependents; remaining batches are never fetched. Inside a transaction the
 *   caller observes the rejection before commit and can abort to restore
 *   parent and dependents together. A dependent row that is already gone when
 *   re-loaded (concurrent diamond, delayed retry) is skipped, not treated as
 *   a failure.
 * - Repeated references to the same `_id` within one relationship delete that
 *   row once per level (deduplicated by `_id`). Diamonds (two middles sharing
 *   one leaf) and cycles (A <-> B) always terminate: deletions are monotonic
 *   (deleted rows never reappear in later pages/levels) and every level
 *   re-queries live state, so already-deleted parents resolve to zero further
 *   dependents. Cross-level diamonds run leaf hooks at least once; concurrent
 *   copies may each fire leaf middleware before either observes the other's
 *   delete (at-least-once, never suppressed via bulk paths). No performance
 *   claim beyond the measured fan-out experiment recorded with the tests is
 *   made here.
 */
export function cascadeDeletePlugin<
  TModelName extends string = string,
  TDependentDocument extends Record<string, unknown> = Record<string, unknown>,
>(schema: Schema, options: CascadeDeletePluginOptions<TModelName, TDependentDocument>) {
  assertPluginOptions(options as CascadeDeletePluginOptions<string, Record<string, unknown>>);
  const { model, localField, foreignField, foreignFilter, extraForeignFilter } = options ?? {};
  const filterConfig: DependentFilterConfig = {
    model,
    localField,
    foreignField,
    foreignFilter: foreignFilter as FilterResolver<Record<string, unknown>> | undefined,
    extraForeignFilter: extraForeignFilter as FilterResolver<Record<string, unknown>> | undefined,
  };
  const traversalLimits = resolveTraversalLimits(options ?? {});

  const findDependents = async function (this: PluginDocumentContext, queryOptions: QueryOptions) {
    const context = resolveExecutionContext(this, model, queryOptions?.session ?? null);
    const { Target, session } = context;
    const query = resolveDependentFilter(this, filterConfig);
    if (!query || !isPlainObject(query)) {
      return [];
    }

    const mergedOptions: QueryOptions = session ? { ...queryOptions, session } : queryOptions;
    return await applyQueryOptions(Target.find(query) as QueryBuilder<unknown[]>, mergedOptions);
  };

  const findOrphans = async function (this: PluginModelContext, queryOptions: QueryOptions) {
    if (!localField || !foreignField) return null;

    const context = resolveExecutionContext(this, model, queryOptions?.session ?? null);
    const { Target, session } = context;

    const schemaValue = (Target.schema.obj as Record<string, unknown>)[foreignField];
    if (!schemaValue) return null;

    const isMyRef = isReference(schemaValue, this.modelName);
    if (!isMyRef) return null;

    const ids = session != null ? await this.distinct('_id', {}, { session }) : await this.distinct('_id');
    const extraFilter = resolveFilter(extraForeignFilter);
    const relationship = {
      [foreignField]: { $not: { $in: ids } },
    } as QueryFilter<TDependentDocument>;
    const query = combineWithRelationship(
      relationship as Record<string, unknown>,
      extraFilter as Record<string, unknown> | null,
    ) as QueryFilter<TDependentDocument>;

    const mergedOptions: QueryOptions = session ? { ...queryOptions, session } : queryOptions;
    return await applyQueryOptions(Target.find(query) as QueryBuilder<unknown[]>, mergedOptions);
  };

  const deleteDependents = async function (
    this: PluginDocumentContext,
    operationOptions?: { session?: ClientSession | null },
  ) {
    const context = resolveExecutionContext(this, model, operationOptions?.session ?? null);
    assertTransactionSupported(context);
    const { Target, session } = context;
    const filter = resolveDependentFilter(this, filterConfig);
    if (!filter || !isPlainObject(filter)) {
      return;
    }

    const deleteSingle = async (document: unknown) => {
      if (session != null && typeof (document as DeleteCapableDocument).$session === 'function') {
        try {
          await (document as DeleteCapableDocument).$session?.(session);
        } catch {
          // Fall through to the explicit operation option below.
        }
      }

      if (supportsDeleteOne(document)) {
        return session != null ? document.deleteOne({ session }) : document.deleteOne();
      }

      if (supportsRemove(document)) {
        return session != null ? document.remove({ session }) : document.remove();
      }

      return Promise.resolve();
    };

    const deleteById = async (id: unknown): Promise<void> => {
      const hydrated = await loadHydratedDependent(Target, id, session);
      if (!hydrated) return;
      await deleteSingle(hydrated);
    };

    // MongoDB transactions reject concurrent operations on one session, so the
    // effective in-flight limit is serialized to 1 once a transaction is
    // active, regardless of the configured maxConcurrency.
    const effectiveConcurrency = session != null && isInTransaction(session) ? 1 : traversalLimits.maxConcurrency;

    const seen = new Set<string>();
    let lastId: unknown;
    let firstPage = true;
    for (;;) {
      const ids = await fetchDependentIdPage(
        Target,
        filter,
        session,
        firstPage ? undefined : lastId,
        traversalLimits.batchSize,
      );
      firstPage = false;
      if (ids.length === 0) return;

      const fresh = ids.filter((id) => {
        const key = typeof id === 'object' && id !== null ? String(id) : `${typeof id}:${String(id)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Bounded in-flight deletion with fail-fast semantics: a rejection
      // stops further batches (parent is already deleted outside a
      // transaction, so remaining dependents are left for operator retry).
      await runWithConcurrencyLimit(fresh, effectiveConcurrency, deleteById);

      lastId = ids[ids.length - 1];
      if (ids.length < traversalLimits.batchSize) return;
    }
  };

  schema.pre('deleteOne', { document: true, query: false }, async function preDeleteOne(...args: unknown[]) {
    const explicitSession = ((args[1] as { session?: ClientSession | null } | undefined)?.session ??
      (args[0] as { session?: ClientSession | null } | undefined)?.session ??
      null) as ClientSession | null;
    assertTransactionSupported(resolveExecutionContext(this, model, explicitSession));
  });

  schema.post('deleteOne', { document: true, query: false }, async function postDeleteOne() {
    await deleteDependents.call(this);
  });

  const methodFnName = 'findDependents';
  const prevMethodFn = schema.methods[methodFnName] as
    | ((this: PluginDocumentContext, modelName?: string) => Promise<unknown>)
    | undefined;

  schema.method(methodFnName, async function methodFn(this: PluginDocumentContext, modelName?: string) {
    if (modelName) {
      if (modelName === model) {
        return findDependents.call(this, {});
      }

      return prevMethodFn ? prevMethodFn.call(this, modelName) : null;
    }

    const previousResults = prevMethodFn ? await prevMethodFn.call(this) : {};

    return mergeResults(previousResults, model, await findDependents.call(this, {}));
  });

  const staticFnName = 'findOrphans';
  const prevStaticFn = schema.statics[staticFnName] as
    | ((this: PluginModelContext, modelName?: string) => Promise<unknown>)
    | undefined;

  schema.static(staticFnName, async function methodFn(this: PluginModelContext, modelName?: string) {
    if (modelName) {
      if (modelName === model) {
        return findOrphans.call(this, {});
      }

      return prevStaticFn ? prevStaticFn.call(this, modelName) : null;
    }

    const previousResults = prevStaticFn ? await prevStaticFn.call(this) : {};
    const currentResults = await findOrphans.call(this, {});

    return mergeResults(previousResults, model, currentResults);
  });
}
