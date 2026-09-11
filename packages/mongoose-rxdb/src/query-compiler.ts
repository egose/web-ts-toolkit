import type { FilterQuery, LooseFilterQuery, QueryOptions } from './types';

export interface MangoSelector {
  [k: string]: any;
}

export class QueryFilterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueryFilterError';
  }
}

const SAFE_OPERATORS = new Set([
  '$eq',
  '$gt',
  '$gte',
  '$lt',
  '$lte',
  '$ne',
  '$in',
  '$nin',
  '$exists',
  '$regex',
  '$options',
]);

const LOGICAL_OPERATORS = new Set(['$and', '$or', '$nor']);
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
export const MAX_FILTER_DEPTH = 20;
export const MAX_FILTER_NODES = 200;
export const MAX_LOGICAL_OPERANDS = 50;

interface NormalizeState {
  depth: number;
  nodes: number;
  ancestors: Set<object>;
}

function newFilterState(): NormalizeState {
  return { depth: 0, nodes: 0, ancestors: new Set() };
}

/**
 * Validates and clones an untrusted filter before it reaches a model query.
 *
 * Invalid top-level operators, malformed logical operands, dangerous object keys,
 * unsupported field operators, excessive recursion, and request-derived regex
 * throw `QueryFilterError`; rejected filters are never widened to `{}`. Only
 * `$and`, `$or`, `$nor`, and the documented Mango per-field operators are kept.
 *
 * Filter budget contract (BMRX-04): every filter copy/validation boundary
 * enforces a shared depth/total-node budget across logical operators and
 * literal objects/arrays. `MAX_FILTER_DEPTH` (20) bounds nesting of logical
 * filter objects and literal objects/arrays (mixed nesting counts together);
 * `MAX_FILTER_NODES` (200) bounds the total number of visited object/array
 * containers plus field/array entries; `MAX_LOGICAL_OPERANDS` (50) bounds
 * `$and`/`$or`/`$nor` operand counts and literal array lengths. Depth is
 * checked before allocating deeper output; cyclic inputs throw
 * `QueryFilterError` instead of recursing unbounded.
 *
 * Request-filter regex contract (BMRX-03): request-derived regex is rejected.
 * Any `RegExp` instance or `$regex`/`$options` operator in a request filter
 * throws `QueryFilterError` before any native regex is constructed or executed,
 * regardless of pattern simplicity or length. This replaces the previous
 * bypassable unsafe-shape heuristic. Trusted schema validators (`match`,
 * custom `validate`) are unrelated to this policy and keep working.
 *
 * Date selector contract (BMRX-23): every `Date` operand is normalized to its
 * stored ISO-string representation (`toISOString`); invalid dates throw
 * `QueryFilterError`. Raw/hydrated date values outside selector compilation
 * are unchanged.
 */
export function sanitizeFilter<T extends object>(filter: LooseFilterQuery<T> | undefined): FilterQuery<T> {
  if (filter === undefined) return filter as unknown as FilterQuery<T>;
  return normalizeFilterObject(filter, newFilterState()) as FilterQuery<T>;
}

function normalizeFilterObject(value: unknown, state: NormalizeState): MangoSelector {
  assertPlainObject(value, 'filter');
  assertAcyclic(state, value, 'filter');
  enterFilterNode(state);

  state.ancestors.add(value as object);
  try {
    const out: MangoSelector = Object.create(null);
    for (const [key, raw] of Object.entries(value as Record<string, any>)) {
      assertSafeKey(key);
      countFilterEntry(state, `filter.${key}`);
      if (LOGICAL_OPERATORS.has(key)) {
        out[key] = normalizeLogicalOperands(key, raw, state);
        continue;
      }
      if (key.startsWith('$')) throw new QueryFilterError(`Unsupported top-level filter operator: ${key}`);
      out[key] = normalizeFieldValue(key, raw, state);
    }
    return out;
  } finally {
    state.ancestors.delete(value as object);
  }
}

function normalizeLogicalOperands(operator: string, value: unknown, state: NormalizeState): MangoSelector[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new QueryFilterError(`${operator} requires a non-empty array of filter objects`);
  }
  if (value.length > MAX_LOGICAL_OPERANDS) {
    throw new QueryFilterError(
      `${operator} has ${value.length} operands, exceeding the limit of ${MAX_LOGICAL_OPERANDS}`,
    );
  }
  return value.map((entry, index) => {
    if (!isPlainObject(entry)) throw new QueryFilterError(`${operator}[${index}] must be a filter object`);
    const previousDepth = state.depth;
    state.depth = previousDepth + 1;
    try {
      return normalizeFilterObject(entry, state);
    } finally {
      state.depth = previousDepth;
    }
  });
}

function normalizeFieldValue(field: string, value: unknown, state: NormalizeState): unknown {
  if (value instanceof RegExp) return normalizeRegexOperator(field, value, undefined);
  if (!isPlainObject(value)) return cloneLiteral(value, state, field);

  const entries = Object.entries(value as Record<string, any>);
  const operatorKeys = entries.filter(([key]) => key.startsWith('$')).map(([key]) => key);
  if (operatorKeys.length === 0) {
    const out: MangoSelector = Object.create(null);
    out.$eq = cloneLiteral(value, state, field);
    return out;
  }
  if (operatorKeys.length !== entries.length) {
    throw new QueryFilterError(`Filter for field ${field} cannot mix operators with literal keys`);
  }

  const out: MangoSelector = Object.create(null);
  for (const [operator, raw] of entries) {
    assertSafeKey(operator);
    if (!SAFE_OPERATORS.has(operator))
      throw new QueryFilterError(`Unsupported filter operator ${operator} for field ${field}`);
    if (operator === '$options') continue;
    if (operator === '$regex') {
      Object.assign(out, normalizeRegexOperator(field, raw, (value as Record<string, any>).$options));
    } else {
      out[operator] = cloneLiteral(raw, state, `${field}.${operator}`);
    }
  }
  if (hasOwn(value, '$options') && !hasOwn(value, '$regex')) {
    throw new QueryFilterError(
      `$options for field ${field} is not supported: request-derived regex filters are rejected`,
    );
  }
  return out;
}

function normalizeRegexOperator(field: string, _rawPattern: unknown, _rawFlags: unknown): never {
  throw new QueryFilterError(
    `$regex for field ${field} is not supported: request-derived regex filters are rejected; ` +
      `use an equality, range, or membership operator instead`,
  );
}

/**
 * BMRX-23 date selector contract (schema-free):
 * writes persist dates as ISO strings (`dateToStorage` → `toISOString`), so
 * every `Date` operand in a selector is normalized to its stored
 * representation (`toISOString`) at the query boundary — equality, range,
 * `$in`/`$nin`, and nested logical/membership/comparison paths alike. This
 * is intentionally schema-free: without schema knowledge the compiler cannot
 * distinguish date fields from mixed/object fields that also store Dates as
 * ISO strings, so all Dates normalize. Invalid dates throw
 * `QueryFilterError`. Raw builder/descriptor inputs keep `Date` instances;
 * only the compiled selector is normalized.
 */
function normalizeDateOperand(value: Date, path: string): string {
  if (Number.isNaN(value.getTime())) {
    throw new QueryFilterError(`Filter for ${path} requires a valid date`);
  }
  return value.toISOString();
}

function cloneLiteral(value: unknown, state: NormalizeState, path: string): unknown {
  if (value instanceof RegExp) return normalizeRegexOperator(path, value, undefined);
  if (value instanceof Date) return normalizeDateOperand(value, path);
  if (Array.isArray(value)) {
    assertAcyclic(state, value, path);
    if (value.length > MAX_LOGICAL_OPERANDS) {
      throw new QueryFilterError(
        `${path} array has ${value.length} items, exceeding the limit of ${MAX_LOGICAL_OPERANDS}`,
      );
    }
    const previousDepth = state.depth;
    state.depth = previousDepth + 1;
    enterFilterNode(state);
    state.ancestors.add(value);
    try {
      return value.map((item, index) => {
        countFilterEntry(state, `${path}[${index}]`);
        return cloneLiteral(item, state, `${path}[${index}]`);
      });
    } finally {
      state.ancestors.delete(value);
      state.depth = previousDepth;
    }
  }
  if (!isPlainObject(value)) {
    if (value && typeof value === 'object') {
      throw new QueryFilterError(`${path} must be a plain object, array, Date, or primitive value`);
    }
    return value;
  }

  assertAcyclic(state, value, path);
  const previousDepth = state.depth;
  state.depth = previousDepth + 1;
  enterFilterNode(state);
  state.ancestors.add(value as object);
  try {
    const out: MangoSelector = Object.create(null);
    for (const [key, nested] of Object.entries(value as Record<string, any>)) {
      assertSafeKey(key);
      countFilterEntry(state, `${path}.${key}`);
      out[key] = cloneLiteral(nested, state, `${path}.${key}`);
    }
    return out;
  } finally {
    state.ancestors.delete(value as object);
    state.depth = previousDepth;
  }
}

function enterFilterNode(state: NormalizeState): void {
  if (state.depth > MAX_FILTER_DEPTH) {
    throw new QueryFilterError(`Filter nesting exceeds the limit of ${MAX_FILTER_DEPTH}`);
  }
  state.nodes += 1;
  if (state.nodes > MAX_FILTER_NODES) {
    throw new QueryFilterError(`Filter contains more than ${MAX_FILTER_NODES} nodes`);
  }
}

function countFilterEntry(state: NormalizeState, path: string): void {
  state.nodes += 1;
  if (state.nodes > MAX_FILTER_NODES) {
    throw new QueryFilterError(`Filter contains more than ${MAX_FILTER_NODES} nodes at ${path}`);
  }
}

function assertAcyclic(state: NormalizeState, value: object, path: string): void {
  if (state.ancestors.has(value)) {
    throw new QueryFilterError(`Cyclic filter value is not allowed: ${path}`);
  }
}

/**
 * Bounded copy for query builder/descriptor inputs (BMRX-04).
 *
 * Enforces the same `MAX_FILTER_DEPTH`/`MAX_FILTER_NODES`/
 * `MAX_LOGICAL_OPERANDS` budget as the compiler while copying, before any
 * unbounded intermediate clone is allocated. Unlike `cloneLiteral`, it
 * preserves `RegExp` instances (rejected later at `exec()` time by the
 * request-regex policy) and `Date` values by value, rejects dangerous keys
 * and cyclic inputs with `QueryFilterError`, and rejects non-plain objects.
 */
export function cloneBoundedInput<T>(value: T): T {
  return cloneBoundedValue(value, newFilterState(), 'input') as T;
}

function cloneBoundedValue(value: unknown, state: NormalizeState, path: string): unknown {
  if (value === undefined || value === null || typeof value !== 'object') return value;
  if (value instanceof Date) {
    countFilterEntry(state, path);
    return new Date(value.getTime());
  }
  if (value instanceof RegExp) {
    countFilterEntry(state, path);
    return new RegExp(value.source, value.flags);
  }
  if (Array.isArray(value)) {
    assertAcyclic(state, value, path);
    if (value.length > MAX_LOGICAL_OPERANDS) {
      throw new QueryFilterError(
        `${path} array has ${value.length} items, exceeding the limit of ${MAX_LOGICAL_OPERANDS}`,
      );
    }
    const previousDepth = state.depth;
    state.depth = previousDepth + 1;
    enterFilterNode(state);
    state.ancestors.add(value);
    try {
      return value.map((entry, index) => {
        countFilterEntry(state, `${path}[${index}]`);
        return cloneBoundedValue(entry, state, `${path}[${index}]`);
      });
    } finally {
      state.ancestors.delete(value);
      state.depth = previousDepth;
    }
  }
  if (!isPlainObject(value)) {
    throw new QueryFilterError(`${path} must be a plain object, array, Date, or primitive value`);
  }
  assertAcyclic(state, value, path);
  const previousDepth = state.depth;
  state.depth = previousDepth + 1;
  enterFilterNode(state);
  state.ancestors.add(value as object);
  try {
    const out: Record<string, any> = Object.create(null);
    for (const [key, nested] of Object.entries(value as Record<string, any>)) {
      assertSafeKey(key);
      countFilterEntry(state, `${path}.${key}`);
      out[key] = cloneBoundedValue(nested, state, `${path}.${key}`);
    }
    return out;
  } finally {
    state.ancestors.delete(value as object);
    state.depth = previousDepth;
  }
}

function assertSafeKey(key: string): void {
  if (DANGEROUS_KEYS.has(key)) throw new QueryFilterError(`Dangerous filter key is not allowed: ${key}`);
}

function assertPlainObject(value: unknown, label: string): asserts value is Record<string, any> {
  if (!isPlainObject(value)) throw new QueryFilterError(`${label} must be a plain object`);
}

function isPlainObject(value: unknown): value is Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value instanceof RegExp) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function translateFilter<T extends object>(filter: FilterQuery<T> | undefined): MangoSelector {
  if (filter === undefined) return Object.create(null);
  if (filter === null) {
    throw new QueryFilterError(
      'filter must be a plain object; explicit null is rejected — omit the filter or pass {} for match-all',
    );
  }
  const normalized = normalizeFilterObject(filter, newFilterState());
  return translateNormalized(normalized);
}

function translateNormalized(normalized: MangoSelector): MangoSelector {
  if (Object.keys(normalized).length === 0) return Object.create(null);
  const out: MangoSelector = Object.create(null);
  for (const [k, v] of Object.entries(normalized as Record<string, any>)) {
    if (k === '$and') out.$and = (v as MangoSelector[]).map((f) => translateNormalized(f));
    else if (k === '$or') out.$or = (v as MangoSelector[]).map((f) => translateNormalized(f));
    else if (k === '$nor') out.$nor = (v as MangoSelector[]).map((f) => translateNormalized(f));
    else if (k === '_id' && typeof v === 'object' && v !== null && !('$eq' in v)) {
      out._id = translateOps(v);
    } else if (typeof v === 'object' && v !== null && !Array.isArray(v) && hasOperator(v)) {
      out[k] = translateOps(v);
    } else if (v instanceof RegExp) {
      throw new QueryFilterError(`$regex for field ${k} is not supported: request-derived regex filters are rejected`);
    } else {
      out[k] = { $eq: v };
    }
  }
  return out;
}

function hasOperator(v: Record<string, any>): boolean {
  return Object.keys(v).some((k) => k.startsWith('$'));
}

function translateOps(v: Record<string, any>): any {
  const out: any = Object.create(null);
  for (const [op, val] of Object.entries(v)) {
    switch (op) {
      case '$eq':
        out.$eq = val;
        break;
      case '$ne':
        out.$ne = val;
        break;
      case '$gt':
        out.$gt = val;
        break;
      case '$gte':
        out.$gte = val;
        break;
      case '$lt':
        out.$lt = val;
        break;
      case '$lte':
        out.$lte = val;
        break;
      case '$in':
        out.$in = val;
        break;
      case '$nin':
        out.$nin = val;
        break;
      case '$exists':
        out.$exists = val;
        break;
      case '$regex':
      case '$options':
        throw new QueryFilterError(`$regex filters are not supported: request-derived regex filters are rejected`);
      default:
        throw new QueryFilterError(`Unsupported filter operator: ${op}`);
    }
  }
  return out;
}

export interface CompiledQuery {
  selector: MangoSelector;
  sort?: Record<string, 1 | -1>;
  limit?: number;
  skip?: number;
  projection?: NormalizedProjection;
}

export interface NormalizedProjection {
  mode: 'include' | 'exclude';
  fields: Record<string, 0 | 1>;
  includeId: boolean;
}

export class QueryOptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueryOptionError';
  }
}

const MAX_QUERY_LIMIT = Number.MAX_SAFE_INTEGER;
const MAX_QUERY_SKIP = Number.MAX_SAFE_INTEGER;

export function compileQuery<T extends object>(
  filter: FilterQuery<T> | undefined,
  options: QueryOptions = {},
): CompiledQuery {
  const compiled: CompiledQuery = { selector: translateFilter(filter) };
  if (options.sort) {
    const sort: Record<string, 1 | -1> = {};
    for (const [k, v] of Object.entries(options.sort)) {
      sort[k] = v === 1 || v === 'asc' || (v as string) === 'ascending' ? 1 : -1;
    }
    compiled.sort = sort;
  }
  if (options.limit !== undefined)
    compiled.limit = normalizeNonNegativeInteger('limit', options.limit, MAX_QUERY_LIMIT);
  if (options.skip !== undefined) compiled.skip = normalizeNonNegativeInteger('skip', options.skip, MAX_QUERY_SKIP);
  if (compiled.limit !== undefined && compiled.skip !== undefined && compiled.skip > MAX_QUERY_LIMIT - compiled.limit) {
    throw new QueryOptionError('Query skip + limit must not exceed the maximum safe integer.');
  }
  if (options.projection) {
    const normalized = normalizeProjection(options.projection);
    if (normalized) compiled.projection = normalized;
  }
  return compiled;
}

/**
 * Normalizes a projection into include/exclude mode.
 *
 * Contract:
 * - Omitted, `{}`, `''`, and whitespace-only projections all normalize to
 *   `undefined` (no projection; full document retained).
 * - Explicit `_id`-only projections (`{ _id: 1 }`, `' _id'`, `{ _id: 0 }`,
 *   `'-_id'` mixed with no other fields) are preserved.
 * - Every dotted path segment is validated before any adapter read: empty
 *   segments and `__proto__`/`prototype`/`constructor` segments throw
 *   `QueryOptionError`.
 * - Missing source fields are omitted (inclusion) or left as a no-op
 *   (exclusion). Numeric segments address array indexes: out-of-bounds or
 *   missing indexes are omitted (inclusion) or left as a no-op (exclusion).
 */
export function normalizeProjection(projection: QueryOptions['projection']): NormalizedProjection | undefined {
  if (!projection) return undefined;
  const fields: Record<string, 0 | 1> = Object.create(null);
  if (typeof projection === 'string') {
    const tokens = projection.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return undefined;
    for (const token of tokens) {
      const include = !token.startsWith('-');
      const field = include ? token : token.slice(1);
      if (!field) throw new QueryOptionError('Projection contains an empty field name.');
      assertSafeProjectionPath(field);
      fields[field] = include ? 1 : 0;
    }
  } else {
    const entries = Object.entries(projection);
    if (entries.length === 0) return undefined;
    for (const [field, rawValue] of entries) {
      assertSafeProjectionPath(field);
      const value = rawValue as 0 | 1 | boolean;
      if (value !== 0 && value !== 1 && value !== false && value !== true) {
        throw new QueryOptionError(`Projection for field "${field}" must be 0 or 1.`);
      }
      fields[field] = value === 0 || value === false ? 0 : 1;
    }
  }

  if (Object.keys(fields).length === 0) return undefined;
  let mode: 'include' | 'exclude' | undefined;
  for (const [field, value] of Object.entries(fields)) {
    if (field === '_id') continue;
    const fieldMode = value === 1 ? 'include' : 'exclude';
    if (mode && mode !== fieldMode)
      throw new QueryOptionError('Projection cannot mix inclusion and exclusion fields except for _id.');
    mode = fieldMode;
  }
  if (!mode) mode = fields._id === 0 ? 'exclude' : 'include';
  return { mode, fields, includeId: fields._id !== 0 };
}

function assertSafeProjectionPath(path: string): void {
  if (!path) throw new QueryOptionError('Projection contains an empty field name.');
  const segments = path.split('.');
  for (const segment of segments) {
    if (!segment) throw new QueryOptionError(`Projection path must not contain empty segments: ${path}`);
    if (DANGEROUS_KEYS.has(segment))
      throw new QueryOptionError(`Projection path contains a forbidden segment "${segment}": ${path}`);
  }
}

function isArrayIndexSegment(segment: string): boolean {
  return /^(0|[1-9]\d*)$/.test(segment);
}

export function applyProjection<T extends Record<string, any>>(record: T, projection?: NormalizedProjection): T {
  if (!projection) return cloneProjectedValue(record);
  if (projection.mode === 'include') {
    const out: Record<string, any> = Object.create(null);
    if (projection.includeId && hasOwn(record, '_id') && (record as Record<string, any>)._id !== undefined)
      out._id = cloneProjectedValue((record as Record<string, any>)._id);
    for (const [field, value] of Object.entries(projection.fields)) {
      if (field === '_id' || value !== 1) continue;
      applyIncludePath(out, record as Record<string, any>, field.split('.'));
    }
    return out as T;
  }

  const out = cloneProjectedValue(record) as Record<string, any>;
  for (const [field, value] of Object.entries(projection.fields)) {
    if (field === '_id') continue;
    if (value === 0) applyExcludePath(out, field.split('.'));
  }
  if (!projection.includeId) delete out._id;
  return out as T;
}

/**
 * Copies one include path from source into target, array-aware.
 * Non-numeric segments applied to an array are mapped over every element;
 * numeric segments address a single array index. Missing fields/indexes are
 * omitted without creating placeholders beyond preserving array positions
 * that actually contributed a value.
 */
function applyIncludePath(target: Record<string, any>, source: Record<string, any>, segments: string[]): void {
  if (segments.length === 0) return;
  if (source == null || typeof source !== 'object') return;
  if (Array.isArray(source)) {
    applyIncludeIntoArray(target as unknown as unknown[], source, segments);
    return;
  }
  const segment = segments[0];
  const rest = segments.slice(1);
  if (!hasOwn(source, segment)) return;
  const child = (source as Record<string, any>)[segment];
  if (rest.length === 0) {
    (target as Record<string, any>)[segment] = cloneProjectedValue(child);
    return;
  }
  if (child == null || typeof child !== 'object') return;
  if (Array.isArray(child)) {
    const slot: unknown[] = [];
    applyIncludeIntoArray(slot, child, rest);
    // Only attach the array when at least one element contributed.
    if (slot.length > 0 && slot.some((entry) => entry !== undefined)) {
      // Preserve positions: holes stay holes so indexes keep their meaning.
      (target as Record<string, any>)[segment] = slot;
    }
    return;
  }
  let slot = (target as Record<string, any>)[segment];
  if (!slot || typeof slot !== 'object' || Array.isArray(slot)) slot = Object.create(null);
  (target as Record<string, any>)[segment] = slot;
  applyIncludePath(slot, child as Record<string, any>, rest);
}

function applyIncludeIntoArray(target: unknown[], source: unknown[], segments: string[]): void {
  const segment = segments[0];
  const rest = segments.slice(1);
  if (isArrayIndexSegment(segment)) {
    const index = Number(segment);
    if (!hasOwn(source, segment) || index >= source.length) return;
    const child = (source as unknown[])[index];
    if (rest.length === 0) {
      target[index] = cloneProjectedValue(child);
      if (target.length < source.length) target.length = source.length;
      return;
    }
    if (child == null || typeof child !== 'object') return;
    if (Array.isArray(child)) {
      const slot: unknown[] = [];
      applyIncludeIntoArray(slot, child, rest);
      if (slot.length > 0) {
        target[index] = slot;
        if (target.length < source.length) target.length = source.length;
      }
      return;
    }
    const slot: Record<string, any> = Object.create(null);
    applyIncludePath(slot, child as Record<string, any>, rest);
    if (Object.keys(slot).length > 0) {
      target[index] = slot;
      if (target.length < source.length) target.length = source.length;
    }
    return;
  }
  for (let index = 0; index < source.length; index++) {
    if (!hasOwn(source, String(index))) continue;
    const child = (source as unknown[])[index];
    if (child == null || typeof child !== 'object') continue;
    if (Array.isArray(child)) {
      const slot: unknown[] = [];
      applyIncludeIntoArray(slot, child, segments);
      if (slot.length > 0) target[index] = slot;
      continue;
    }
    const slot: Record<string, any> =
      target[index] && typeof target[index] === 'object' && !Array.isArray(target[index])
        ? (target[index] as Record<string, any>)
        : Object.create(null);
    const before = Object.keys(slot).length;
    applyIncludePath(slot, child as Record<string, any>, segments);
    if (Object.keys(slot).length > before) target[index] = slot;
  }
  if (target.length > 0) target.length = source.length;
}

/**
 * Removes one exclude path from target, array-aware. Own properties only:
 * inherited members such as array `map` or object `constructor` are never
 * followed or deleted. Missing fields/indexes are a no-op.
 */
function applyExcludePath(target: Record<string, any>, segments: string[]): void {
  if (segments.length === 0) return;
  if (target == null || typeof target !== 'object') return;
  if (Array.isArray(target)) {
    applyExcludeFromArray(target, segments);
    return;
  }
  const segment = segments[0];
  const rest = segments.slice(1);
  if (!hasOwn(target, segment)) return;
  if (rest.length === 0) {
    delete (target as Record<string, any>)[segment];
    return;
  }
  const child = (target as Record<string, any>)[segment];
  if (child == null || typeof child !== 'object') return;
  if (Array.isArray(child)) applyExcludeFromArray(child as unknown[], rest);
  else applyExcludePath(child as Record<string, any>, rest);
}

function applyExcludeFromArray(target: unknown[], segments: string[]): void {
  const segment = segments[0];
  const rest = segments.slice(1);
  if (isArrayIndexSegment(segment)) {
    const index = Number(segment);
    if (!hasOwn(target, segment) || index >= target.length) return;
    if (rest.length === 0) {
      target.splice(index, 1);
      return;
    }
    const child = target[index];
    if (child == null || typeof child !== 'object') return;
    if (Array.isArray(child)) applyExcludeFromArray(child as unknown[], rest);
    else applyExcludePath(child as Record<string, any>, rest);
    return;
  }
  for (let index = 0; index < target.length; index++) {
    if (!hasOwn(target, String(index))) continue;
    const child = target[index];
    if (child == null || typeof child !== 'object') continue;
    if (Array.isArray(child)) applyExcludeFromArray(child as unknown[], segments);
    else applyExcludePath(child as Record<string, any>, segments);
  }
}

function normalizeNonNegativeInteger(name: 'limit' | 'skip', value: number, max: number): number {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new QueryOptionError(`Query ${name} must be a non-negative safe integer.`);
  }
  return value;
}

function cloneProjectedValue<T>(value: T): T {
  if (value === undefined || value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) {
    const out: unknown[] = new Array(value.length);
    for (let index = 0; index < value.length; index++) {
      if (hasOwn(value, String(index))) out[index] = cloneProjectedValue((value as unknown[])[index]);
    }
    return out as T;
  }
  const out: Record<string, any> = Object.create(null);
  for (const [key, nested] of Object.entries(value as Record<string, any>)) out[key] = cloneProjectedValue(nested);
  return out as T;
}

export function applyUpdate(doc: any, update: any): any {
  if (doc == null) return doc;
  const out: any = { ...doc };
  if (update.$set) Object.assign(out, update.$set);
  if (update.$unset) for (const k of Object.keys(update.$unset)) delete out[k];
  if (update.$inc) for (const [k, v] of Object.entries(update.$inc)) out[k] = (out[k] ?? 0) + (v as number);
  if (update.$mul) for (const [k, v] of Object.entries(update.$mul)) out[k] = (out[k] ?? 0) * (v as number);
  if (update.$min)
    for (const [k, v] of Object.entries(update.$min)) if (out[k] === undefined || (v as number) < out[k]) out[k] = v;
  if (update.$max)
    for (const [k, v] of Object.entries(update.$max)) if (out[k] === undefined || (v as number) > out[k]) out[k] = v;
  if (update.$push) {
    for (const [k, v] of Object.entries(update.$push)) {
      out[k] = Array.isArray(out[k]) ? [...out[k], v] : [v];
    }
  }
  if (update.$addToSet) {
    for (const [k, v] of Object.entries(update.$addToSet)) {
      out[k] = Array.isArray(out[k]) ? (out[k].includes(v) ? out[k] : [...out[k], v]) : [v];
    }
  }
  if (update.$pull) {
    for (const [k, v] of Object.entries(update.$pull)) {
      if (!Array.isArray(out[k])) continue;
      out[k] = out[k].filter((item: any) => item !== v);
    }
  }
  for (const [k, v] of Object.entries(update)) {
    if (!k.startsWith('$')) out[k] = v;
  }
  return out;
}
