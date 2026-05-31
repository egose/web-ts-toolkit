import { Response, NextFunction } from 'express';
import { getDataOption } from './options';
import {
  Projection,
  Filter,
  DataHookContext,
  Validation,
  AccessRouterBaseRequest,
  DataRequest,
  SelectAccess,
  RouteGuardAccess,
  BaseFilterAccess,
  DecorateAccess,
  DecorateAllAccess,
} from './interfaces';
import Permission from './permission';
import { DataService } from './services';
import { normalizeSelect, pickDocFields } from './helpers';
import { DATA_MIDDLEWARE, PERMISSIONS, PERMISSION_KEYS } from './symbols';
import { Cache } from './cache';
import {
  canActivateRequest,
  getGlobalPermissions,
  getResolvedRequestPermissions,
  initializeAclRequest,
  setResolvedRequestPermissions,
} from './acl/request-context';
import { resolveAccessFilterForRequest, resolveIdentifierFilterForRequest } from './acl/filter-resolution';
import { runDecorateAllHook, runDecorateHook } from './acl/hook-runner';
import {
  collectAllowedFieldsForRequest,
  pickAllowedFieldsForRequest,
  resolveSelectForRequest,
} from './acl/select-resolution';
import type { AccessRuntime } from './runtime';
import { defaultRuntime } from './runtime';
import { runWithRuntime } from './runtime-context';

export class DataCore {
  private req: DataRequest;
  private caches: {
    baseFilter: Cache<string, Filter>;
  };

  constructor(req: AccessRouterBaseRequest) {
    this.req = req as DataRequest;
    this.caches = {
      baseFilter: new Cache<string, Filter>(),
    };
  }

  async genIDFilter<TData = unknown>(dataName: string, id: string): Promise<Filter<TData>> {
    const idField = getDataOption(dataName, 'idField') as string | undefined;
    const resolveIdFilter = getDataOption(dataName, 'resolveIdFilter') as
      | ((this: DataRequest, id: string) => Filter<TData> | Promise<Filter<TData>>)
      | undefined;
    return resolveIdentifierFilterForRequest<TData>({ req: this.req, idField, resolveIdFilter, id });
  }

  async genFilter<TData = unknown>(
    dataName: string,
    access: BaseFilterAccess = 'read',
    _filter: Filter<TData> = null,
  ): Promise<Filter<TData>> {
    const permissions = this.getGlobalPermissions();
    const cacheKey = `${dataName}_baseFilter_${access}`;

    return resolveAccessFilterForRequest<TData>({
      req: this.req,
      permissions,
      cache: this.caches.baseFilter,
      cacheKey,
      access,
      filter: _filter,
      getOption: (key, defaultValue) => getDataOption(dataName, key, defaultValue),
    });
  }

  async genAllowedFields(dataName: string, _doc: unknown, access: SelectAccess, baseFields = []) {
    const permissionSchema = getDataOption(dataName, 'permissionSchema');

    const permissions = this.getGlobalPermissions();

    return collectAllowedFieldsForRequest({
      req: this.req,
      permissionSchema,
      access,
      baseFields,
      hasPermission: (key) => permissions.has(key),
      functionArgs: [permissions],
    });
  }

  async pickAllowedFields<TDoc>(dataName: string, doc: TDoc, access: SelectAccess, baseFields = []): Promise<TDoc> {
    const permissionSchema = getDataOption(dataName, 'permissionSchema') as Record<string, unknown> | null | undefined;
    const permissions = this.getGlobalPermissions();

    return pickAllowedFieldsForRequest({
      req: this.req,
      doc,
      permissionSchema,
      access,
      baseFields,
      hasPermission: (key) => permissions.has(key),
      functionArgs: [permissions],
    });
  }

  async genSelect(
    dataName: string,
    access: SelectAccess,
    targetFields: Projection = null,
    skipChecks = true,
    subPaths = [],
  ) {
    const permissionSchema = getDataOption(dataName, ['permissionSchema'].concat(subPaths).join('.')) as
      | Record<string, unknown>
      | null
      | undefined;

    const permissions = this.getGlobalPermissions();

    return resolveSelectForRequest({
      req: this.req,
      permissionSchema,
      access,
      targetFields,
      skipChecks,
      hasPermission: (key) => permissions.hasKey(key) && permissions.has(key),
      functionArgs: [permissions],
      mode: 'data',
    });
  }

  async decorate<TDoc>(dataName: string, doc: TDoc, access: DecorateAccess, context: DataHookContext = {}) {
    const decorate = getDataOption(dataName, `decorate.${access}`, null) as Function | Function[];

    const permissions = this.getGlobalPermissions();
    return runDecorateHook({
      req: this.req,
      hook: decorate,
      doc,
      permissions,
      context: {
        dataName,
        operation: access,
        ...context,
      },
    });
  }

  async decorateAll<TDoc>(
    dataName: string,
    docs: TDoc[],
    access: DecorateAllAccess,
    context: DataHookContext = {},
  ): Promise<TDoc[]> {
    const decorateAll = getDataOption(dataName, `decorateAll.${access}`, null) as Function | Function[];
    const permissions = this.getGlobalPermissions();

    return runDecorateAllHook({
      req: this.req,
      hook: decorateAll,
      docs,
      permissions,
      context: {
        dataName,
        operation: access,
        ...context,
      },
    });
  }

  getPermissions() {
    return getResolvedRequestPermissions(this.req);
  }

  async setPermissions() {
    await setResolvedRequestPermissions(this.req);
  }

  async canActivate(routeGuard: Validation) {
    return canActivateRequest(this.req, routeGuard);
  }

  async isAllowed(dataName: string, access: RouteGuardAccess | string) {
    const operationAccess = getDataOption(dataName, `operationAccess.${access}`) as Validation;
    return this.canActivate(operationAccess);
  }

  getService<TData = unknown>(dataName: string) {
    return new DataService<TData>(this.req, dataName);
  }

  service<TData = unknown>(dataName: string) {
    return this.getService<TData>(dataName);
  }

  svc<TData = unknown>(dataName: string) {
    return this.getService<TData>(dataName);
  }

  private getGlobalPermissions() {
    return getGlobalPermissions(this.req);
  }
}

export const createSetDataCore = (runtime: AccessRuntime = defaultRuntime) => {
  return async function setDataCoreMiddleware(req: AccessRouterBaseRequest, _res: Response, next: NextFunction) {
    return runWithRuntime(runtime, async () => {
      await initializeAclRequest({
        req,
        flag: DATA_MIDDLEWARE,
        createCore: (request) => new DataCore(request),
        assignCore: (core) => {
          req.dacl = core;
        },
      });

      next();
    });
  };
};

export const setDataCore = createSetDataCore(defaultRuntime);
