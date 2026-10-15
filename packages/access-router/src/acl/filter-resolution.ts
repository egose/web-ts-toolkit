import type { Cache } from '../cache';
import { resolveAccessFilter, resolveAccessFilterParts, resolveIdentifierFilter } from '../core-shared';
import { getAuthorizationPermissions, readServiceAuthorization } from './service-authorization';
import type { AuthorizationBinding, ResolvedServiceAuthorization } from './service-authorization';
import { deepIsolateValue } from '../helpers/document';
import { getCapturedAuthorizationOption } from './model-output-planning';
import type { AccessRouterBaseRequest, Filter } from '../interfaces';
import type { Permissions } from '../permission';

// Core owns the request cache. No authority-bearing public genFilter overload.
const rowCaches = new WeakMap<object, Cache<string, unknown>>();
export function registerRequestRowCache(core: object, cache: Cache<string, unknown>): void {
  rowCaches.set(core, cache);
}

export async function resolveAuthorizedAccessFilter(
  core: object,
  call: ResolvedServiceAuthorization,
  binding: AuthorizationBinding,
  filter: Filter,
  requestFallback: () => Promise<Filter>,
) {
  const state = readServiceAuthorization(call, binding);
  const cache = rowCaches.get(core);
  // Custom Core-compatible receivers retain their existing request-only hook.
  if (!cache && state.authorization.rows.mode === 'request') {
    const resolved = await requestFallback();
    return { transformed: resolved, scope: {}, filter: resolved };
  }
  return resolveAccessFilterParts({
    req: binding.request as AccessRouterBaseRequest,
    permissions: getAuthorizationPermissions(call, binding),
    cache: cache!,
    cacheKey: `${binding.modelName}_baseFilter_${state.access.rowAccess}`,
    access: state.access.rowAccess,
    filter,
    rows: deepIsolateValue(state.authorization.rows),
    getOption: (key) => getCapturedAuthorizationOption(state.configuration, key),
  });
}

export async function resolveIdentifierFilterForRequest<T = unknown>({
  req,
  idField,
  resolveIdFilter,
  id,
}: {
  req: AccessRouterBaseRequest;
  idField?: string;
  resolveIdFilter?: (this: AccessRouterBaseRequest, id: string) => Promise<Filter<T>> | Filter<T>;
  id: string;
}) {
  return resolveIdentifierFilter<T>(req, idField, resolveIdFilter, id);
}

export async function resolveAccessFilterForRequest<T = unknown>({
  req,
  permissions,
  cache,
  cacheKey,
  access,
  filter,
  getOption,
}: {
  req: AccessRouterBaseRequest;
  permissions: Permissions;
  cache: Cache<string, unknown>;
  cacheKey: string;
  access?: string;
  filter?: Filter<T>;
  getOption: (key: string, defaultValue?: unknown) => unknown;
}) {
  return resolveAccessFilter<T>({
    req,
    permissions,
    cache,
    cacheKey,
    access,
    filter,
    getOption,
  });
}
