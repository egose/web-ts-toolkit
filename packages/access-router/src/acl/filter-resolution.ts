import type { Cache } from '../cache';
import { resolveAccessFilter, resolveIdentifierFilter } from '../core-shared';
import type { AccessRouterBaseRequest, Filter } from '../interfaces';
import type { Permissions } from '../permission';

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
