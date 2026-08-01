import type { FilterQuery, QueryOptions } from './types';

export interface MangoSelector {
  [k: string]: any;
}

/**
 * Defends against query-selector injection: any nested object whose key starts with `$`
 * is wrapped in `{ $eq: <value> }` so user-supplied filters cannot smuggle in operators
 * like `$where`, `$regex`, or `$func`. Mirrors mongoose's `sanitizeFilter`.
 *
 * Only top-level logical operators (`$and`, `$or`, `$nor`) are preserved and recursed into.
 * Per-field operators in the Mango whitelist (`$eq`, `$gt`, `$gte`, `$lt`, `$lte`, `$ne`,
 * `$in`, `$nin`, `$exists`, `$regex`, `$options`) are passed through; any other `$`-prefixed
 * key is treated as an injection attempt and the whole object is wrapped as `$eq`.
 */
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

export function sanitizeFilter<T>(filter: FilterQuery<T> | undefined): FilterQuery<T> {
  if (!filter || typeof filter !== 'object') return filter as unknown as FilterQuery<T>;
  const out: any = {};
  for (const [k, v] of Object.entries(filter as Record<string, any>)) {
    if (k === '$and' || k === '$or' || k === '$nor') {
      out[k] = Array.isArray(v) ? v.map((f) => sanitizeFilter(f)) : v;
    } else if (k.startsWith('$')) {
      // top-level unknown operator — drop it defensively
      continue;
    } else if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof RegExp) && !isSafeOperatorMap(v)) {
      // nested object that is not a recognized Mango operator map → treat as literal value
      out[k] = { $eq: v };
    } else {
      out[k] = v;
    }
  }
  return out as FilterQuery<T>;
}

function isSafeOperatorMap(v: Record<string, any>): boolean {
  const keys = Object.keys(v);
  if (keys.length === 0) return false;
  return keys.every((k) => k.startsWith('$') && SAFE_OPERATORS.has(k));
}

export function translateFilter<T>(filter: FilterQuery<T> | undefined): MangoSelector {
  if (!filter || Object.keys(filter).length === 0) return {};
  const out: MangoSelector = {};
  for (const [k, v] of Object.entries(filter as Record<string, any>)) {
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
  const out: any = {};
  for (const [op, val] of Object.entries(v)) {
    switch (op) {
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
        out[op] = val;
    }
  }
  return out;
}

export interface CompiledQuery {
  selector: MangoSelector;
  sort?: Record<string, 1 | -1>;
  limit?: number;
  skip?: number;
  projection?: Record<string, 0 | 1>;
}

export function compileQuery<T>(filter: FilterQuery<T> | undefined, options: QueryOptions = {}): CompiledQuery {
  const compiled: CompiledQuery = { selector: translateFilter(filter) };
  if (options.sort) {
    const sort: Record<string, 1 | -1> = {};
    for (const [k, v] of Object.entries(options.sort)) {
      sort[k] = v === 1 || v === 'asc' || (v as string) === 'ascending' ? 1 : -1;
    }
    compiled.sort = sort;
  }
  if (options.limit !== undefined) compiled.limit = options.limit;
  if (options.skip !== undefined) compiled.skip = options.skip;
  if (options.projection) {
    if (typeof options.projection === 'string') {
      const proj: Record<string, 0 | 1> = {};
      for (const field of options.projection.split(/\s+/).filter(Boolean)) proj[field] = 1;
      compiled.projection = proj;
    } else {
      compiled.projection = options.projection as Record<string, 0 | 1>;
    }
  }
  return compiled;
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
