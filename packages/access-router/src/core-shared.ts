import {
  castArray,
  arrayToRecord,
  hasOwn,
  isArray,
  isBoolean,
  isEmpty,
  isFunction,
  isPlainObject,
  isString,
} from '@web-ts-toolkit/utils';
import { isDeepStrictEqual } from 'node:util';
import { Cache } from './cache';
import { createValidator } from './helpers';
import { AccessRouterBaseRequest, Filter, Validation } from './interfaces';
import { getGlobalOption } from './options';
import { getActiveRuntime } from './runtime-context';
import Permission, { Permissions } from './permission';
import { extractScopedOutputRule } from './acl/field-authorization';

type OptionGetter = (key: string, defaultValue?: unknown) => unknown;

type FilterRecord = Record<string, unknown>;

type AndFilterRecord = FilterRecord & { $and: FilterRecord[] };

function isAndFilter<T = unknown>(filter: Filter<T> | null | undefined): filter is Filter<T> & AndFilterRecord {
  return (
    !!filter && isPlainObject(filter) && Object.keys(filter).length === 1 && isArray((filter as FilterRecord).$and)
  );
}

function isMergeableClause<T = unknown>(filter: Filter<T> | null | undefined): filter is Filter<T> & FilterRecord {
  return !!filter && isPlainObject(filter) && Object.keys(filter).every((key) => !key.startsWith('$'));
}

function optimizeAndFilter<T = unknown>(clausesInput: unknown[]): Filter<T> | null {
  const clauses: Record<string, unknown>[] = [];

  for (let x = 0; x < clausesInput.length; x++) {
    const clause = normalizeFilter<T>(clausesInput[x] as Filter<T> | null | undefined);
    if (clause === false) return false;
    if (!clause) continue;

    if (isAndFilter(clause)) {
      clauses.push(...clause.$and);
    } else {
      clauses.push(clause as FilterRecord);
    }
  }

  // Typed, lossless keys for the supported scalar domain. Exotic/BSON values
  // are kept as clauses (and can still merge by native equality below), never
  // conflated with JSON strings, objects or another required scope predicate.
  const dedupeKey = (value: unknown): string | undefined => {
    if (value instanceof RegExp) return `regexp:${JSON.stringify([value.source, value.flags])}`;
    if (value instanceof Date) return `date:${value.getTime()}`;
    if (isArray(value)) {
      const entries = Array.from(value, dedupeKey);
      return entries.every((entry) => entry !== undefined) ? `array:${JSON.stringify(entries)}` : undefined;
    }

    if (isPlainObject(value)) {
      const entries = Object.keys(value)
        .sort()
        .map((key) => [key, dedupeKey((value as Record<string, unknown>)[key])]);
      return entries.every(([, entry]) => entry !== undefined) ? `object:${JSON.stringify(entries)}` : undefined;
    }

    if (value === null) return 'null';
    if (typeof value === 'string') return `string:${JSON.stringify(value)}`;
    if (['boolean', 'number', 'bigint', 'undefined'].includes(typeof value)) return `${typeof value}:${String(value)}`;
    return undefined;
  };

  const dedupedClauses: Record<string, unknown>[] = [];
  const seenClauses = new Set<string>();
  for (let x = 0; x < clauses.length; x++) {
    const clause = clauses[x];
    const key = dedupeKey(clause);
    if (key !== undefined) {
      if (seenClauses.has(key)) continue;
      seenClauses.add(key);
    }
    dedupedClauses.push(clause);
  }

  const mergedClause: Record<string, unknown> = {};
  const remainingClauses: Record<string, unknown>[] = [];

  for (let x = 0; x < dedupedClauses.length; x++) {
    const clause = dedupedClauses[x];
    if (!isMergeableClause(clause)) {
      remainingClauses.push(clause);
      continue;
    }

    let canMerge = true;

    for (const [key, value] of Object.entries(clause)) {
      if (hasOwn(mergedClause, key) && !isDeepStrictEqual(mergedClause[key], value)) {
        canMerge = false;
        break;
      }
    }

    if (!canMerge) {
      remainingClauses.push(clause);
      continue;
    }

    Object.assign(mergedClause, clause);
  }

  const finalClauses = isEmpty(mergedClause) ? remainingClauses : [mergedClause, ...remainingClauses];

  if (finalClauses.length === 0) return null;
  if (finalClauses.length === 1) return finalClauses[0] as Filter<T>;

  return { $and: finalClauses } as Filter<T>;
}

export function normalizeFilter<T = unknown>(filter: Filter<T> | null | undefined): Filter<T> | null {
  if (filter === false) return false;
  if (!filter || !isPlainObject(filter) || isEmpty(filter)) return null;

  if (!isAndFilter(filter)) {
    return filter;
  }

  return optimizeAndFilter<T>(filter.$and);
}

export async function resolveIdentifierFilter<T = unknown>(
  req: AccessRouterBaseRequest,
  idField: string | undefined,
  resolveIdFilter: ((this: AccessRouterBaseRequest, id: string) => Promise<Filter<T>> | Filter<T>) | undefined,
  id: string,
): Promise<Filter<T>> {
  if (isFunction(resolveIdFilter)) {
    return (await resolveIdFilter.call(req, id)) as Filter<T>;
  }

  if (isString(idField)) {
    return { [idField]: id } as Filter<T>;
  }

  return { _id: id } as Filter<T>;
}

/** AND, never object-spread: fixed joins/scopes must survive query rewriting. */
export function intersectFilters<T = unknown>(...filters: (Filter<T> | undefined)[]): Filter<T> {
  return optimizeAndFilter<T>(filters) ?? {};
}

export async function resolveAccessFilterParts<T = unknown>({
  req,
  permissions,
  cache,
  cacheKey,
  access = 'read',
  filter = null,
  getOption,
  rows = { mode: 'request' },
}: {
  req: AccessRouterBaseRequest;
  permissions: Permissions;
  cache: Cache<string, unknown>;
  cacheKey: string;
  access?: string;
  filter?: Filter<T>;
  getOption: OptionGetter;
  rows?: { readonly mode: 'request' | 'unrestricted' } | { readonly mode: 'scope'; readonly filter: Filter<T> };
}): Promise<{ transformed: Filter<T>; scope: Filter<T>; filter: Filter<T> }> {
  let nextFilter = normalizeFilter<T>(filter);

  if (nextFilter === false || (rows.mode === 'scope' && rows.filter === false)) {
    return { transformed: false, scope: false, filter: false };
  }

  const overrideFilterFn = getOption(`overrideFilter.${access}`, null);
  // Capture both policy functions before a transform can suspend. Fresh calls
  // may see replacement options, but this call must retain its original policy.
  const baseFilterFn = rows.mode === 'request' ? getOption(`baseFilter.${access}`, null) : null;
  if (nextFilter !== false && isFunction(overrideFilterFn)) {
    nextFilter = normalizeFilter<T>(await overrideFilterFn.call(req, nextFilter, permissions));
  }

  if (nextFilter === false) return { transformed: false, scope: {}, filter: false };

  if (rows.mode !== 'request') {
    const scope = rows.mode === 'scope' ? rows.filter : {};
    return { transformed: nextFilter ?? {}, scope, filter: intersectFilters(nextFilter, scope) };
  }

  if (!isFunction(baseFilterFn)) return { transformed: nextFilter ?? {}, scope: {}, filter: nextFilter ?? {} };

  // The cache belongs to a core, access AND policy version. Replacing a policy
  // on a retained service must not reuse an earlier function's cached grant.
  const cached = cache.get(cacheKey) as { resolver: unknown; filter: Filter<T> | null } | undefined;
  const reusable = cached?.resolver === baseFilterFn;
  const baseFilter = normalizeFilter<T>(
    (reusable ? cached.filter : await baseFilterFn.call(req, permissions)) as Filter<T> | null | undefined,
  );

  if (!reusable) {
    cache.set(cacheKey, { resolver: baseFilterFn, filter: baseFilter });
  }

  return { transformed: nextFilter ?? {}, scope: baseFilter ?? {}, filter: intersectFilters(baseFilter, nextFilter) };
}

export async function resolveAccessFilter<T = unknown>(
  input: Parameters<typeof resolveAccessFilterParts<T>>[0],
): Promise<Filter<T>> {
  return (await resolveAccessFilterParts(input)).filter;
}

export function getRequestPermissions(req: AccessRouterBaseRequest) {
  const requestPermissionField = getGlobalOption('requestPermissionField');
  return new Permission((req[requestPermissionField] as { [key: string]: boolean }) || {});
}

// Tracks which runtime populated the request permission field so a shared
// request gets independent runtime-owned state. A field value present without
// a recorded owner is treated as application-supplied and preserved.
const permissionFieldOwners = new WeakMap<object, Map<string, unknown>>();

function getPermissionFieldOwnerMap(req: AccessRouterBaseRequest): Map<string, unknown> {
  let owners = permissionFieldOwners.get(req);
  if (!owners) {
    owners = new Map<string, unknown>();
    permissionFieldOwners.set(req, owners);
  }
  return owners;
}

export async function setRequestPermissions(req: AccessRouterBaseRequest) {
  const requestPermissionField = getGlobalOption('requestPermissionField') as string;
  const activeRuntime = getActiveRuntime();
  const owners = getPermissionFieldOwnerMap(req);
  const owner = owners.get(requestPermissionField);
  const hasFieldValue = Boolean(req[requestPermissionField]);

  // Same runtime already resolved (or attempted) this field: do not rerun.
  if (owner === activeRuntime) return;
  // Application-supplied value with no runtime owner: preserve it.
  if (hasFieldValue && owner === undefined) return;
  // Otherwise the field is absent (first resolution) or owned by another
  // runtime on this shared request: resolve independently and take ownership.

  const globalPermissions = getGlobalOption('globalPermissions');
  const permissions = isFunction(globalPermissions) ? await globalPermissions.call(req, req) : undefined;

  // Empty results also replace prior runtime-owned grants, without mutating
  // the previous map. Missing/non-callable resolvers follow the same rule.
  if (isPlainObject(permissions)) req[requestPermissionField] = permissions;
  else if (isArray(permissions)) req[requestPermissionField] = arrayToRecord(permissions as string[]);
  else if (isString(permissions)) req[requestPermissionField] = { [permissions]: true };
  else req[requestPermissionField] = {};

  owners.set(requestPermissionField, activeRuntime);
}

export async function evaluateRouteGuard(
  req: AccessRouterBaseRequest,
  permissions: Permissions,
  routeGuard: Validation,
) {
  const phas = (key: string) => permissions.has(key);
  const { stringHandler, arrayHandler } = createValidator(phas);

  if (isBoolean(routeGuard)) {
    return routeGuard === true;
  }

  if (isString(routeGuard)) {
    return stringHandler(routeGuard);
  }

  if (isArray(routeGuard)) {
    return arrayHandler(routeGuard);
  }

  if (isFunction(routeGuard)) {
    return routeGuard.call(req, permissions);
  }

  return false;
}

export async function callHookChain<TDoc, TContext>(
  req: AccessRouterBaseRequest,
  hook: Function | Function[],
  doc: TDoc,
  permissions: Permissions,
  context: TContext,
): Promise<TDoc> {
  const hooks = castArray(hook);
  for (let x = 0; x < hooks.length; x++) {
    if (isFunction(hooks[x])) {
      doc = (await hooks[x].call(req, doc, permissions, context)) as TDoc;
    }
  }

  return doc;
}

export async function collectSchemaFields({
  req,
  permissionSchema,
  access,
  hasPermission,
  functionArgs = [],
}: {
  req: AccessRouterBaseRequest;
  permissionSchema: Record<string, unknown> | null | undefined;
  access: string;
  hasPermission: (key: string) => boolean;
  functionArgs?: unknown[];
}) {
  const fields: string[] = [];
  if (!permissionSchema) return fields;

  const { stringHandler, arrayHandler } = createValidator(hasPermission);
  const keys = Object.keys(permissionSchema);

  for (let x = 0; x < keys.length; x++) {
    const key = keys[x];
    const value = extractScopedOutputRule(permissionSchema, key, access);

    if (isBoolean(value)) {
      if (value) fields.push(key);
    } else if (isString(value)) {
      if (stringHandler(value)) fields.push(key);
    } else if (isArray(value)) {
      if (arrayHandler(value as string[] | string[][])) fields.push(key);
    } else if (isFunction(value)) {
      if (await value.call(req, ...functionArgs)) fields.push(key);
    }
  }

  return fields;
}
