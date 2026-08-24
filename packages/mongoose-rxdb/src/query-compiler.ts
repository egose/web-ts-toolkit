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
const MAX_FILTER_DEPTH = 20;
const MAX_FILTER_NODES = 200;
const MAX_LOGICAL_OPERANDS = 50;
const MAX_REGEX_PATTERN_LENGTH = 128;
const ALLOWED_REGEX_FLAGS = new Set(['i', 'm', 's', 'u']);

interface NormalizeState {
  depth: number;
  nodes: number;
}

/**
 * Validates and clones an untrusted filter before it reaches a model query.
 *
 * Invalid top-level operators, malformed logical operands, dangerous object keys,
 * unsupported field operators, excessive recursion, and unsafe regex patterns
 * throw `QueryFilterError`; rejected filters are never widened to `{}`. Only
 * `$and`, `$or`, `$nor`, and the documented Mango per-field operators are kept.
 */
export function sanitizeFilter<T extends object>(filter: LooseFilterQuery<T> | undefined): FilterQuery<T> {
  if (filter === undefined) return filter as unknown as FilterQuery<T>;
  return normalizeFilterObject(filter, { depth: 0, nodes: 0 }) as FilterQuery<T>;
}

function normalizeFilterObject(value: unknown, state: NormalizeState): MangoSelector {
  assertPlainObject(value, 'filter');
  enterFilterNode(state);

  const out: MangoSelector = Object.create(null);
  for (const [key, raw] of Object.entries(value as Record<string, any>)) {
    assertSafeKey(key);
    if (LOGICAL_OPERATORS.has(key)) {
      out[key] = normalizeLogicalOperands(key, raw, state);
      continue;
    }
    if (key.startsWith('$')) throw new QueryFilterError(`Unsupported top-level filter operator: ${key}`);
    out[key] = normalizeFieldValue(key, raw, state);
  }
  return out;
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
    throw new QueryFilterError(`$options requires $regex for field ${field}`);
  }
  return out;
}

function normalizeRegexOperator(field: string, rawPattern: unknown, rawFlags: unknown): MangoSelector {
  const pattern = rawPattern instanceof RegExp ? rawPattern.source : rawPattern;
  const flags = rawPattern instanceof RegExp ? rawPattern.flags : (rawFlags ?? '');
  if (typeof pattern !== 'string') throw new QueryFilterError(`$regex for field ${field} must be a string or RegExp`);
  if (typeof flags !== 'string') throw new QueryFilterError(`$options for field ${field} must be a string`);
  validateRegexPolicy(field, pattern, flags);
  const out: MangoSelector = Object.create(null);
  out.$regex = pattern;
  if (flags) out.$options = flags;
  return out;
}

function validateRegexPolicy(field: string, pattern: string, flags: string): void {
  if (pattern.length > MAX_REGEX_PATTERN_LENGTH) {
    throw new QueryFilterError(`$regex for field ${field} exceeds ${MAX_REGEX_PATTERN_LENGTH} characters`);
  }
  const seen = new Set<string>();
  for (const flag of flags) {
    if (!ALLOWED_REGEX_FLAGS.has(flag)) throw new QueryFilterError(`Unsupported regex flag ${flag} for field ${field}`);
    if (seen.has(flag)) throw new QueryFilterError(`Duplicate regex flag ${flag} for field ${field}`);
    seen.add(flag);
  }
  try {
    new RegExp(pattern, flags);
  } catch (error) {
    throw new QueryFilterError(`Invalid $regex for field ${field}: ${(error as Error).message}`);
  }
  if (hasUnsafeRegexShape(pattern)) {
    throw new QueryFilterError(`$regex for field ${field} exceeds the supported complexity policy`);
  }
}

function hasUnsafeRegexShape(pattern: string): boolean {
  const quantifiedGroup = String.raw`\((?:[^()\\]|\\.)*(?:[*+]|\{\d+,?\d*\})(?:[^()\\]|\\.)*\)(?:[*+?]|\{\d+,?\d*\})`;
  const quantifiedAlternation = String.raw`\((?:[^()\\]|\\.)*\|(?:[^()\\]|\\.)*\)(?:[*+?]|\{\d+,?\d*\})`;
  return (
    new RegExp(quantifiedGroup).test(pattern) ||
    new RegExp(quantifiedAlternation).test(pattern) ||
    /(^|[^\\])\.\*(?:.*(^|[^\\])\.\*)/.test(pattern) ||
    /\\[1-9]/.test(pattern) ||
    /\(\?<?[=!]/.test(pattern)
  );
}

function cloneLiteral(value: unknown, state: NormalizeState, path: string): unknown {
  if (value instanceof RegExp) return normalizeRegexOperator(path, value, undefined);
  if (Array.isArray(value)) {
    if (value.length > MAX_LOGICAL_OPERANDS) {
      throw new QueryFilterError(
        `${path} array has ${value.length} items, exceeding the limit of ${MAX_LOGICAL_OPERANDS}`,
      );
    }
    return value.map((item, index) => cloneLiteral(item, state, `${path}[${index}]`));
  }
  if (!isPlainObject(value)) {
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      throw new QueryFilterError(`${path} must be a plain object, array, RegExp, Date, or primitive value`);
    }
    return value;
  }

  enterFilterNode(state);
  const out: MangoSelector = Object.create(null);
  for (const [key, nested] of Object.entries(value as Record<string, any>)) {
    assertSafeKey(key);
    out[key] = cloneLiteral(nested, state, `${path}.${key}`);
  }
  return out;
}

function enterFilterNode(state: NormalizeState): void {
  if (state.depth > MAX_FILTER_DEPTH) {
    throw new QueryFilterError(`Filter nesting exceeds the limit of ${MAX_FILTER_DEPTH}`);
  }
  state.nodes += 1;
  if (state.nodes > MAX_FILTER_NODES) {
    throw new QueryFilterError(`Filter contains more than ${MAX_FILTER_NODES} object nodes`);
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
  if (filter === undefined || filter === null) return Object.create(null);
  const normalized = normalizeFilterObject(filter, { depth: 0, nodes: 0 });
  if (Object.keys(normalized).length === 0) return Object.create(null);
  const out: MangoSelector = Object.create(null);
  for (const [k, v] of Object.entries(normalized as Record<string, any>)) {
    if (k === '$and') out.$and = (v as FilterQuery<T>[]).map((f) => translateFilter(f));
    else if (k === '$or') out.$or = (v as FilterQuery<T>[]).map((f) => translateFilter(f));
    else if (k === '$nor') out.$nor = (v as FilterQuery<T>[]).map((f) => translateFilter(f));
    else if (k === '_id' && typeof v === 'object' && v !== null && !('$eq' in v)) {
      out._id = translateOps(v);
    } else if (typeof v === 'object' && v !== null && !Array.isArray(v) && hasOperator(v)) {
      out[k] = translateOps(v);
    } else if (v instanceof RegExp) {
      out[k] = { $regex: v.source, $options: v.flags };
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
        out.$regex = typeof val === 'string' ? val : val.source;
        if (v.$options) out.$options = v.$options;
        break;
      case '$options':
        break;
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
    compiled.projection = normalizeProjection(options.projection);
  }
  return compiled;
}

export function normalizeProjection(projection: QueryOptions['projection']): NormalizedProjection | undefined {
  if (!projection) return undefined;
  const fields: Record<string, 0 | 1> = Object.create(null);
  if (typeof projection === 'string') {
    for (const token of projection.split(/\s+/).filter(Boolean)) {
      const include = !token.startsWith('-');
      const field = include ? token : token.slice(1);
      if (!field) throw new QueryOptionError('Projection contains an empty field name.');
      fields[field] = include ? 1 : 0;
    }
  } else {
    for (const [field, rawValue] of Object.entries(projection)) {
      const value = rawValue as 0 | 1 | boolean;
      if (value !== 0 && value !== 1 && value !== false && value !== true) {
        throw new QueryOptionError(`Projection for field "${field}" must be 0 or 1.`);
      }
      fields[field] = value === 0 || value === false ? 0 : 1;
    }
  }

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

export function applyProjection<T extends Record<string, any>>(record: T, projection?: NormalizedProjection): T {
  if (!projection) return cloneProjectedValue(record);
  if (projection.mode === 'include') {
    const out: Record<string, any> = Object.create(null);
    if (projection.includeId && record._id !== undefined) out._id = cloneProjectedValue(record._id);
    for (const [field, value] of Object.entries(projection.fields)) {
      if (field === '_id' || value !== 1) continue;
      const fieldValue = getDottedValue(record, field);
      if (fieldValue !== undefined) setDottedValue(out, field, cloneProjectedValue(fieldValue));
    }
    return out as T;
  }

  const out = cloneProjectedValue(record) as Record<string, any>;
  for (const [field, value] of Object.entries(projection.fields)) {
    if (field === '_id') continue;
    if (value === 0) unsetDottedValue(out, field);
  }
  if (!projection.includeId) delete out._id;
  return out as T;
}

function normalizeNonNegativeInteger(name: 'limit' | 'skip', value: number, max: number): number {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new QueryOptionError(`Query ${name} must be a non-negative safe integer.`);
  }
  return value;
}

function getDottedValue(target: any, path: string): any {
  let cursor = target;
  for (const segment of path.split('.')) {
    if (!segment) throw new QueryOptionError(`Projection path must not contain empty segments: ${path}`);
    if (cursor == null || typeof cursor !== 'object') return undefined;
    cursor = cursor[segment];
  }
  return cursor;
}

function setDottedValue(target: Record<string, any>, path: string, value: any): void {
  const segments = path.split('.');
  let cursor = target;
  for (let index = 0; index < segments.length - 1; index++) {
    const segment = segments[index];
    if (!segment) throw new QueryOptionError(`Projection path must not contain empty segments: ${path}`);
    if (!cursor[segment] || typeof cursor[segment] !== 'object' || Array.isArray(cursor[segment]))
      cursor[segment] = Object.create(null);
    cursor = cursor[segment];
  }
  const leaf = segments[segments.length - 1];
  if (!leaf) throw new QueryOptionError(`Projection path must not contain empty segments: ${path}`);
  cursor[leaf] = value;
}

function unsetDottedValue(target: Record<string, any>, path: string): void {
  const segments = path.split('.');
  let cursor: any = target;
  for (let index = 0; index < segments.length - 1; index++) {
    const segment = segments[index];
    if (!segment) throw new QueryOptionError(`Projection path must not contain empty segments: ${path}`);
    cursor = cursor[segment];
    if (!cursor || typeof cursor !== 'object') return;
  }
  const leaf = segments[segments.length - 1];
  if (!leaf) throw new QueryOptionError(`Projection path must not contain empty segments: ${path}`);
  delete cursor[leaf];
}

function cloneProjectedValue<T>(value: T): T {
  if (value === undefined || value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map((entry) => cloneProjectedValue(entry)) as T;
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
