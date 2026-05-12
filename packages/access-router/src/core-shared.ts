import castArray from 'lodash/castArray';
import isArray from 'lodash/isArray';
import isBoolean from 'lodash/isBoolean';
import isEmpty from 'lodash/isEmpty';
import isFunction from 'lodash/isFunction';
import isPlainObject from 'lodash/isPlainObject';
import isString from 'lodash/isString';
import { Cache } from './cache';
import { createValidator } from './helpers';
import { Request, Filter, Validation } from './interfaces';
import { arrToObj } from './lib';
import { getGlobalOption } from './options';
import Permission, { Permissions } from './permission';

type OptionGetter = (key: string, defaultValue?: unknown) => unknown;

function normalizeFilter(filter: Filter | null | undefined): Filter | null {
  if (filter === false) return false;
  if (!filter || !isPlainObject(filter) || isEmpty(filter)) return null;

  if (Object.keys(filter).length !== 1 || !isArray(filter.$and)) {
    return filter;
  }

  const clauses: Record<string, unknown>[] = [];

  for (let x = 0; x < filter.$and.length; x++) {
    const clause = normalizeFilter(filter.$and[x] as Filter | null | undefined);
    if (clause === false) return false;
    if (clause) clauses.push(clause);
  }

  if (clauses.length === 0) return null;
  if (clauses.length === 1) return clauses[0];

  return { $and: clauses };
}

export async function resolveIdentifierFilter(req: Request, identifier: string | Function | undefined, id: string) {
  if (isString(identifier)) {
    return { [identifier]: id };
  }

  if (isFunction(identifier)) {
    return identifier.call(req, id);
  }

  return { _id: id };
}

export async function resolveAccessFilter({
  req,
  permissions,
  cache,
  cacheKey,
  access = 'read',
  filter = null,
  getOption,
}: {
  req: Request;
  permissions: Permissions;
  cache: Cache<string, unknown>;
  cacheKey: string;
  access?: string;
  filter?: Filter;
  getOption: OptionGetter;
}): Promise<Filter> {
  let nextFilter = normalizeFilter(filter);

  const overrideFilterFn = getOption(`overrideFilter.${access}`, null);
  if (isFunction(overrideFilterFn)) {
    nextFilter = normalizeFilter(await overrideFilterFn.call(req, nextFilter, permissions));
  }

  const baseFilterFn = getOption(`baseFilter.${access}`, null);
  if (!isFunction(baseFilterFn)) return nextFilter || {};

  const baseFilter = normalizeFilter(
    (cache.has(cacheKey) ? cache.get(cacheKey) : await baseFilterFn.call(req, permissions)) as
      | Filter
      | null
      | undefined,
  );

  if (!cache.has(cacheKey)) {
    cache.set(cacheKey, baseFilter);
  }

  if (baseFilter === false) return false;
  if (!baseFilter) return nextFilter || {};
  if (!nextFilter) return baseFilter;

  return { $and: [baseFilter, nextFilter] };
}

export function getRequestPermissions(req: Request) {
  const requestPermissionField = getGlobalOption('requestPermissionField');
  return new Permission(req[requestPermissionField] || {});
}

export async function setRequestPermissions(req: Request) {
  const requestPermissionField = getGlobalOption('requestPermissionField');
  if (req[requestPermissionField]) return;

  const globalPermissions = getGlobalOption('globalPermissions');
  if (!isFunction(globalPermissions)) return;

  const permissions = await globalPermissions.call(req, req);
  if (isPlainObject(permissions)) req[requestPermissionField] = permissions;
  else if (isArray(permissions)) req[requestPermissionField] = arrToObj(permissions);
  else if (isString(permissions)) req[requestPermissionField] = { [permissions]: true };
}

export async function evaluateRouteGuard(req: Request, permissions: Permissions, routeGuard: Validation) {
  const phas = (key) => permissions.has(key);
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

export async function callMiddlewareChain<TDoc, TContext>(
  req: Request,
  middleware: Function | Function[],
  doc: TDoc,
  permissions: Permissions,
  context: TContext,
): Promise<TDoc> {
  const middlewares = castArray(middleware);
  for (let x = 0; x < middlewares.length; x++) {
    if (isFunction(middlewares[x])) {
      doc = (await middlewares[x].call(req, doc, permissions, context)) as TDoc;
    }
  }

  return doc;
}

export async function collectSchemaFields({
  req,
  permissionSchema,
  access,
  baseFields = [],
  hasPermission,
  functionArgs = [],
}: {
  req: Request;
  permissionSchema: Record<string, unknown> | null | undefined;
  access: string;
  baseFields?: string[];
  hasPermission: (key: string) => boolean;
  functionArgs?: unknown[];
}) {
  const fields = [...(baseFields ?? [])];
  if (!permissionSchema) return fields;

  const { stringHandler, arrayHandler } = createValidator(hasPermission);
  const keys = Object.keys(permissionSchema);

  for (let x = 0; x < keys.length; x++) {
    const key = keys[x];
    if (baseFields.includes(key)) continue;

    const val = permissionSchema[key];
    const value = (val && val[access]) || val;

    if (isBoolean(value)) {
      if (value) fields.push(key);
    } else if (isString(value)) {
      if (stringHandler(value)) fields.push(key);
    } else if (isArray(value)) {
      if (arrayHandler(value)) fields.push(key);
    } else if (isFunction(value)) {
      if (await value.call(req, ...functionArgs)) fields.push(key);
    }
  }

  return fields;
}
