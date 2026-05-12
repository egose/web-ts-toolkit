import { Response, NextFunction } from 'express';
import mongoose, { Model } from 'mongoose';
import assign from 'lodash/assign';
import castArray from 'lodash/castArray';
import compact from 'lodash/compact';
import difference from 'lodash/difference';
import forEach from 'lodash/forEach';
import get from 'lodash/get';
import intersection from 'lodash/intersection';
import isArray from 'lodash/isArray';
import isBoolean from 'lodash/isBoolean';
import isFunction from 'lodash/isFunction';
import isNaN from 'lodash/isNaN';
import isString from 'lodash/isString';
import isNil from 'lodash/isNil';
import noop from 'lodash/noop';
import pick from 'lodash/pick';
import set from 'lodash/set';
import reduce from 'lodash/reduce';
import { getDataOption } from './options';
import {
  Populate,
  Projection,
  Filter,
  MiddlewareContext,
  DataMiddlewareContext,
  Validation,
  Request,
  SelectAccess,
  RouteGuardAccess,
  DocPermissionsAccess,
  BaseFilterAccess,
  DecorateAccess,
  DecorateAllAccess,
  ValidateAccess,
  PrepareAccess,
  TransformAccess,
  Task,
} from './interfaces';
import Permission, { Permissions } from './permission';
import { DataService } from './services';
import { normalizeSelect, setDocValue, toObject, pickDocFields, genPagination } from './helpers';
import { copyAndDepopulate } from './processors';
import { isDocument } from './lib';
import { DATA_MIDDLEWARE, PERMISSIONS, PERMISSION_KEYS } from './symbols';
import { Cache } from './cache';
import {
  callMiddlewareChain,
  collectSchemaFields,
  evaluateRouteGuard,
  getRequestPermissions,
  resolveAccessFilter,
  resolveIdentifierFilter,
  setRequestPermissions,
} from './core-shared';

export class DataCore {
  private req: Request;
  private caches: {
    baseFilter: Cache<string, Filter>;
  };

  constructor(req: Request) {
    this.req = req;
    this.caches = {
      baseFilter: new Cache<string, Filter>(),
    };
  }

  async genIDFilter(dataName: string, id: string) {
    const identifier = getDataOption(dataName, 'identifier');
    return resolveIdentifierFilter(this.req, identifier, id);
  }

  async genFilter(dataName: string, access: BaseFilterAccess = 'read', _filter: Filter = null): Promise<Filter> {
    const permissions = this.getGlobalPermissions();
    const cacheKey = `${dataName}_baseFilter_${access}`;

    return resolveAccessFilter({
      req: this.req,
      permissions,
      cache: this.caches.baseFilter,
      cacheKey,
      access,
      filter: _filter,
      getOption: (key, defaultValue) => getDataOption(dataName, key, defaultValue),
    });
  }

  async genAllowedFields(dataName: string, doc: unknown, access: SelectAccess, baseFields = []) {
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

    const permissionSchema = getDataOption(dataName, ['permissionSchema'].concat(subPaths).join('.'));
    if (!permissionSchema) return [];

    const permissions = this.getGlobalPermissions();

    let fields = await collectSchemaFields({
      req: this.req,
      permissionSchema,
      access,
      hasPermission: (key) => {
        if (permissions.prop(key)) {
          return permissions.has(key);
        }

        return !!skipChecks;
      },
      functionArgs: [permissions],
    });

    fields = intersection(normalizedSelect, fields);
    return fields;
  }

  async decorate<TDoc>(dataName: string, doc: TDoc, access: DecorateAccess, context: DataMiddlewareContext = {}) {
    const decorate = getDataOption(dataName, `decorate.${access}`, null);

    const permissions = this.getGlobalPermissions();
    return callMiddlewareChain(this.req, decorate, doc, permissions, context);
  }

  async decorateAll<TDoc>(dataName: string, docs: TDoc[], access: DecorateAllAccess): Promise<TDoc[]> {
    const decorateAll = getDataOption(dataName, `decorateAll.${access}`, null);
    const permissions = this.getGlobalPermissions();

    return callMiddlewareChain(this.req, decorateAll, docs, permissions, {});
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
    const routeGuard = getDataOption(dataName, `routeGuard.${access}`);
    return this.canActivate(routeGuard);
  }

  getService(dataName: string) {
    return new DataService(this.req, dataName);
  }

  service(dataName: string) {
    return this.getService(dataName);
  }

  svc(dataName: string) {
    return this.getService(dataName);
  }

  private getGlobalPermissions() {
    return this.req[PERMISSIONS] as Permission;
  }
}

export async function setDataCore(req: Request, res: Response, next: NextFunction) {
  if (req[DATA_MIDDLEWARE]) return next();

  const core = new DataCore(req);
  await core.setPermissions();

  req.dacl = core;
  req[PERMISSIONS] = core.getPermissions();
  req[PERMISSION_KEYS] = req[PERMISSIONS].$_permissionKeys;
  req[DATA_MIDDLEWARE] = true;

  next();
}
