import { Response, NextFunction } from 'express';
import { getDataOption } from './options';
import {
  Projection,
  Filter,
  DataHookContext,
  DataFieldOptions,
  Validation,
  AccessRouterBaseRequest,
  DataRequest,
  SelectAccess,
  RouteGuardAccess,
  OperationAccessContext,
  BaseFilterAccess,
  DecorateAccess,
  DecorateAllAccess,
} from './interfaces';
import Permission from './permission';
import { EMPTY_DOCUMENT_GRANTS } from './acl/document-grants';
import { DataService } from './services';
import { DATA_MIDDLEWARE } from './symbols';
import { Cache } from './cache';
import {
  getGlobalPermissions,
  getResolvedRequestPermissions,
  initializeAclRequest,
  setResolvedRequestPermissions,
} from './acl/request-context';
import { evaluateRouteGuard } from './core-shared';
import { resolveAccessFilterForRequest, resolveIdentifierFilterForRequest } from './acl/filter-resolution';
import { runDecorateAllHook, runDecorateHook } from './acl/hook-runner';
import {
  collectAllowedFieldsForRequest,
  pickAllowedFieldsForRequest,
  resolveSelectForRequest,
} from './acl/select-resolution';
import type { AccessRuntime } from './runtime';
import { defaultRuntime } from './runtime';
import { getActiveRuntime, runWithRuntime } from './runtime-context';
import { getRequestWorkState } from './helpers/request-work';
import { createOperationAccessReaders, resolveRouteOperationAccess } from './operation-access';
import { assertFieldHelperCall, requestFieldScope } from './acl/field-helper-options';

export class DataCore {
  private req: DataRequest;
  private readonly requestRuntime = getActiveRuntime() ?? defaultRuntime;
  private caches: {
    baseFilter: Cache<string, Filter>;
  };
  private cachedPermissions: Permission | null = null;

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

  /** Request-schema allowlist, independent of doc values. No model hooks or backend elevation. */
  async genAllowedFields(dataName: string, _doc: unknown, access: SelectAccess, options: DataFieldOptions = {}) {
    assertFieldHelperCall('genAllowedFields', arguments.length, 4, options, 'data');
    const permissionSchema = this.fieldPermissionSchema(dataName, options);

    const permissions = this.getGlobalPermissions();

    return getRequestWorkState(this.req, this.requestRuntime).hookGate.run(() =>
      collectAllowedFieldsForRequest({
        req: this.req,
        permissionSchema,
        access,
        hasPermission: (key) => permissions.has(key),
        functionArgs: [permissions, EMPTY_DOCUMENT_GRANTS],
      }),
    );
  }

  /** Request-only existing-value pick. No automatic identity/metadata retention; options default to {}. */
  async pickAllowedFields<TDoc>(
    dataName: string,
    doc: TDoc,
    access: SelectAccess,
    options: DataFieldOptions = {},
  ): Promise<TDoc> {
    assertFieldHelperCall('pickAllowedFields', arguments.length, 4, options, 'data');
    const permissionSchema = this.fieldPermissionSchema(dataName, options);
    const permissions = this.getGlobalPermissions();

    return getRequestWorkState(this.req, this.requestRuntime).hookGate.run(() =>
      pickAllowedFieldsForRequest({
        req: this.req,
        doc,
        permissionSchema,
        access,
        hasPermission: (key) => permissions.has(key),
        functionArgs: [permissions, EMPTY_DOCUMENT_GRANTS],
      }),
    );
  }

  /**
   * Request-only requested-token intersection. Omitted/null/empty/exclusion-only select
   * yields []; DataService then applies no extra projection after request trimming.
   * Named options default to {}; legacy elevation and positional arguments are removed.
   */
  async genSelect(
    dataName: string,
    access: SelectAccess,
    targetFields: Projection = null,
    options: DataFieldOptions = {},
  ) {
    assertFieldHelperCall('genSelect', arguments.length, 4, options, 'data');
    const permissionSchema = this.fieldPermissionSchema(dataName, options);

    const permissions = this.getGlobalPermissions();

    return getRequestWorkState(this.req, this.requestRuntime).hookGate.run(() =>
      resolveSelectForRequest({
        req: this.req,
        permissionSchema,
        access,
        targetFields,
        hasPermission: (key) => permissions.hasKey(key) && permissions.has(key),
        functionArgs: [permissions, EMPTY_DOCUMENT_GRANTS],
        mode: 'data',
      }),
    );
  }

  private fieldPermissionSchema(dataName: string, options: DataFieldOptions) {
    const scopePath = requestFieldScope(options);
    return getDataOption(dataName, ['permissionSchema', ...scopePath.flatMap((part) => [part, 'sub'])].join('.')) as
      | Record<string, unknown>
      | null
      | undefined;
  }

  async decorate<TDoc>(dataName: string, doc: TDoc, access: DecorateAccess, context: DataHookContext = {}) {
    const decorate = getDataOption(dataName, `decorate.${access}`, null) as Function | Function[];

    const permissions = this.getGlobalPermissions();
    return runDecorateHook({
      req: this.req,
      runtime: this.requestRuntime,
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
      runtime: this.requestRuntime,
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
    if (this.cachedPermissions) return this.cachedPermissions;
    return getGlobalPermissions(this.req) ?? getResolvedRequestPermissions(this.req);
  }

  async setPermissions() {
    await setResolvedRequestPermissions(this.req);
    this.cachedPermissions = getResolvedRequestPermissions(this.req);
  }

  async canActivate(routeGuard: Validation): Promise<boolean> {
    return evaluateRouteGuard(this.req, this.getGlobalPermissions(), routeGuard);
  }

  async isAllowed(dataName: string, access: RouteGuardAccess | string): Promise<boolean> {
    return this.resolveOperationAccess(dataName, access);
  }

  /** Authorize entry using explicit server-owned basic/advanced/root metadata. */
  async isAllowedRoute(
    dataName: string,
    baseAccess: RouteGuardAccess | string,
    context: OperationAccessContext,
  ): Promise<boolean> {
    return this.resolveOperationAccess(dataName, baseAccess, context);
  }

  /** Data policy has no model-default reader; base calls never select entry members. */
  private async resolveOperationAccess(
    dataName: string,
    baseAccess: string,
    context?: OperationAccessContext,
  ): Promise<boolean> {
    return resolveRouteOperationAccess({
      baseAccess,
      context,
      ...createOperationAccessReaders(this.requestRuntime.getDataOptions(dataName)),
      canActivate: (guard) => this.canActivate(guard),
    });
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
    if (this.cachedPermissions) return this.cachedPermissions;
    return getGlobalPermissions(this.req);
  }
}

export const createSetDataCore = (runtime: AccessRuntime = defaultRuntime) => {
  return async function setDataCoreMiddleware(req: AccessRouterBaseRequest, _res: Response, next: NextFunction) {
    return runWithRuntime(runtime, async () => {
      await initializeAclRequest({
        req,
        flag: DATA_MIDDLEWARE,
        runtime,
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
