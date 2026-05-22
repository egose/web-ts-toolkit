import { Response, NextFunction } from 'express';
import { intersection } from '@web-ts-toolkit/utils';
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
  callHookChain,
  collectSchemaFields,
  evaluateRouteGuard,
  getRequestPermissions,
  resolveAccessFilter,
  resolveIdentifierFilter,
  setRequestPermissions,
} from './core-shared';

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
    return resolveIdentifierFilter<TData>(this.req, idField, resolveIdFilter, id);
  }

  async genFilter<TData = unknown>(
    dataName: string,
    access: BaseFilterAccess = 'read',
    _filter: Filter<TData> = null,
  ): Promise<Filter<TData>> {
    const permissions = this.getGlobalPermissions();
    const cacheKey = `${dataName}_baseFilter_${access}`;

    return resolveAccessFilter<TData>({
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

    return collectSchemaFields({
      req: this.req,
      permissionSchema,
      access,
      baseFields,
      hasPermission: (key) => permissions.has(key),
      functionArgs: [permissions],
    });
  }

  async pickAllowedFields<TDoc>(dataName: string, doc: TDoc, access: SelectAccess, baseFields = []): Promise<TDoc> {
    const allowed = await this.genAllowedFields(dataName, doc, access, baseFields);
    return pickDocFields(doc, allowed) as TDoc;
  }

  async genSelect(
    dataName: string,
    access: SelectAccess,
    targetFields: Projection = null,
    skipChecks = true,
    subPaths = [],
  ) {
    let normalizedSelect = normalizeSelect(targetFields);

    const permissionSchema = getDataOption(dataName, ['permissionSchema'].concat(subPaths).join('.')) as
      | Record<string, unknown>
      | null
      | undefined;
    if (!permissionSchema) return [];

    const permissions = this.getGlobalPermissions();

    let fields = await collectSchemaFields({
      req: this.req,
      permissionSchema,
      access,
      hasPermission: (key) => {
        if (permissions.hasKey(key)) {
          return permissions.has(key);
        }

        return !!skipChecks;
      },
      functionArgs: [permissions],
    });

    fields = intersection(normalizedSelect, fields);
    return fields;
  }

  async decorate<TDoc>(dataName: string, doc: TDoc, access: DecorateAccess, context: DataHookContext = {}) {
    const decorate = getDataOption(dataName, `decorate.${access}`, null) as Function | Function[];

    const permissions = this.getGlobalPermissions();
    return callHookChain(this.req, decorate, doc, permissions, {
      dataName,
      operation: access,
      ...context,
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

    return callHookChain(this.req, decorateAll, docs, permissions, {
      dataName,
      operation: access,
      ...context,
    });
  }

  getPermissions() {
    return getRequestPermissions(this.req);
  }

  async setPermissions() {
    await setRequestPermissions(this.req);
  }

  async canActivate(routeGuard: Validation) {
    const permissions = this.getGlobalPermissions();
    return evaluateRouteGuard(this.req, permissions, routeGuard);
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
    return this.req[PERMISSIONS] as Permission;
  }
}

export async function setDataCore(req: AccessRouterBaseRequest, _res: Response, next: NextFunction) {
  if (req[DATA_MIDDLEWARE]) return next();

  const core = new DataCore(req);
  await core.setPermissions();

  req.dacl = core;
  req[PERMISSIONS] = core.getPermissions();
  req[PERMISSION_KEYS] = req[PERMISSIONS].keys;
  req[DATA_MIDDLEWARE] = true;

  next();
}
