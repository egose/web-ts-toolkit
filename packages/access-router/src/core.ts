import { Response, NextFunction } from 'express';
import mongoose, { Model } from 'mongoose';
import {
  assign,
  castArray,
  compact,
  difference,
  forEach,
  get,
  intersection,
  isArray,
  isBoolean,
  isFunction,
  isNaN,
  isNil,
  isString,
  isUndefined,
  noop,
  pick,
  reduce,
  set,
} from '@web-ts-toolkit/utils';
import { getModelOption, getExactModelOption } from './options';
import { getModelRef } from './meta';
import {
  Populate,
  Projection,
  Filter,
  MiddlewareContext,
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
  FinalizeAccess,
  Task,
} from './interfaces';
import Permission, { Permissions } from './permission';
import { Service, PublicService, Base } from './services';
import { normalizeSelect, getDocPermissions, setDocValue, toObject, pickDocFields, genPagination } from './helpers';
import { copyAndDepopulate } from './processors';
import { isDocument } from './lib';
import { MIDDLEWARE, PERMISSIONS, PERMISSION_KEYS } from './symbols';
import { Cache } from './cache';
import { logger } from './logger';
import {
  callHookChain,
  collectSchemaFields,
  evaluateRouteGuard,
  getRequestPermissions,
  resolveAccessFilter,
  resolveIdentifierFilter,
  setRequestPermissions,
} from './core-shared';

export class Core {
  private req: Request;
  private caches: {
    baseFilter: Cache<string, unknown>;
  };

  constructor(req: Request) {
    this.req = req;
    this.caches = {
      baseFilter: new Cache<string, unknown>(),
    };
  }

  getIdentifier(modelName: string) {
    const identifier = getModelOption(modelName, 'identifier');

    if (isFunction(identifier)) {
      return null;
    }

    if (isString(identifier)) {
      return identifier;
    }

    return '_id';
  }

  async genIDFilter<TModel = unknown>(modelName: string, id: string): Promise<Filter<TModel>> {
    const identifier = getModelOption(modelName, 'identifier');
    return resolveIdentifierFilter<TModel>(this.req, identifier, id);
  }

  async genFilter<TModel = unknown>(
    modelName: string,
    access: BaseFilterAccess = 'read',
    _filter: Filter<TModel> = null,
  ): Promise<Filter<TModel>> {
    const permissions = this.getGlobalPermissions();
    const cacheKey = `${modelName}_baseFilter_${access}`;

    return resolveAccessFilter<TModel>({
      req: this.req,
      permissions,
      cache: this.caches.baseFilter,
      cacheKey,
      access,
      filter: _filter,
      getOption: (key, defaultValue) => getModelOption(modelName, key, defaultValue),
    });
  }

  private removePrefix(str, prefix) {
    if (!prefix) return str;

    if (str.startsWith(prefix)) {
      return str.substring(prefix.length);
    }
    return str;
  }

  async genAllowedFields(modelName: string, doc: unknown, access: SelectAccess, baseFields = []) {
    const permissionSchema = getModelOption(modelName, 'permissionSchema');

    const modelPermissionPrefix = getModelOption(modelName, 'modelPermissionPrefix', '');

    const permissions = this.getGlobalPermissions();
    const docPermissions = getDocPermissions(modelName, doc);

    return collectSchemaFields({
      req: this.req,
      permissionSchema,
      access,
      baseFields,
      hasPermission: (key) => permissions.has(key) || docPermissions[this.removePrefix(key, modelPermissionPrefix)],
      functionArgs: [permissions, docPermissions],
    });
  }

  async pickAllowedFields<T>(modelName: string, doc: T, access: SelectAccess, baseFields = []) {
    const allowed = await this.genAllowedFields(modelName, doc, access, baseFields);
    return pickDocFields(doc, allowed) as T;
  }

  async genSelect(
    modelName: string,
    access: SelectAccess,
    targetFields: Projection = null,
    skipChecks = true,
    subPaths = [],
  ) {
    let normalizedSelect = normalizeSelect(targetFields);

    const permissionSchema = getModelOption(modelName, ['permissionSchema'].concat(subPaths).join('.')) as
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
        if (permissions.prop(key)) {
          return permissions.has(key);
        }

        return !!skipChecks;
      },
      functionArgs: [permissions],
    });

    if (normalizedSelect.length > 0) {
      const excludeid = normalizedSelect.includes('-_id');
      const excludeall = normalizedSelect.every((v) => v.startsWith('-'));
      if (excludeall) {
        normalizedSelect = normalizedSelect.map((v) => v.substring(1));
        fields = difference(fields, normalizedSelect);
        if (excludeid) fields.push('-_id');
      } else {
        fields = intersection(normalizedSelect, fields.concat(excludeid ? '-_id' : '_id'));
      }
    }

    const mandatoryFields =
      subPaths.length > 0 ? [] : (getModelOption(modelName, `mandatoryFields.${access}`, []) as string[]);
    return fields.concat(mandatoryFields);
  }

  async genPopulate(
    modelName: string,
    access: SelectAccess | BaseFilterAccess = 'read',
    _populate: Populate | Populate[] | string | null = null,
  ) {
    if (!_populate) return [];

    let populate = Array.isArray(_populate) ? _populate : [_populate];
    populate = compact(
      await Promise.all(
        populate.map(async (p: Populate | string) => {
          const populateAccess = !isString(p) && p.access ? p.access : access;
          const ret: Populate = isString(p)
            ? { path: p }
            : {
                path: p.path,
                select: normalizeSelect(p.select),
              };

          const allowedParentPaths = await this.genSelect(modelName, populateAccess as SelectAccess, [ret.path], false);
          if (!allowedParentPaths.includes(ret.path)) return null;

          const refModelName = getModelRef(modelName, ret.path);
          if (!refModelName) return null;

          ret.select = await this.genSelect(refModelName, populateAccess as SelectAccess, ret.select, false);
          const filter = await this.genFilter(refModelName, populateAccess as BaseFilterAccess, null);
          if (filter === false) return null;

          ret.match = filter;
          return ret;
        }),
      ),
    );

    return populate;
  }

  async validate(modelName: string, allowedData: unknown, access: ValidateAccess, context: MiddlewareContext) {
    const validate = getModelOption(modelName, `validate.${access}`, null);

    if (isFunction(validate)) {
      const permissions = this.getGlobalPermissions();
      return validate.call(this.req, allowedData, permissions, context) as boolean | unknown[];
    } else if (isBoolean(validate) || isArray(validate)) {
      return validate;
    } else {
      return true;
    }
  }

  async prepare<T>(modelName: string, allowedData: T, access: PrepareAccess, context: MiddlewareContext): Promise<T> {
    const prepare = getModelOption(modelName, `prepare.${access}`, null) as Function | Function[];
    const permissions = this.getGlobalPermissions();
    return callHookChain(this.req, prepare, allowedData, permissions, context);
  }

  async transform<T>(modelName: string, doc: T, access: TransformAccess, context: MiddlewareContext): Promise<T> {
    const transform = getModelOption(modelName, `transform.${access}`, null) as Function | Function[];
    const permissions = this.getGlobalPermissions();
    return callHookChain(this.req, transform, doc, permissions, context);
  }

  async finalize<T>(modelName: string, doc: T, access: FinalizeAccess, context: MiddlewareContext): Promise<T> {
    const finalize = getModelOption(modelName, `finalize.${access}`, null) as Function | Function[];
    const permissions = this.getGlobalPermissions();
    return callHookChain(this.req, finalize, doc, permissions, context);
  }

  async changes(modelName: string, doc: Record<string, unknown>, context: MiddlewareContext) {
    const changeOptions = getModelOption(modelName, `change`, {}) as Record<string, unknown>;

    for (let x = 0; x < context.modifiedPaths.length; x++) {
      const mpath = context.modifiedPaths[x];

      if (isFunction(changeOptions[mpath])) {
        await changeOptions[mpath].call(
          this.req,
          context.originalDocObject[mpath],
          doc[mpath],
          context.changes.filter((di) => di.path.length > 0 && di.path[0] === mpath),
          context,
        );
      }
    }
  }

  async genDocPermissions(modelName: string, doc: unknown, access: DocPermissionsAccess, context: MiddlewareContext) {
    const docPermissionsFn = getModelOption(modelName, `docPermissions.${access}`, null);
    let docPermissions = {};

    if (isFunction(docPermissionsFn)) {
      const permissions = this.getGlobalPermissions();
      try {
        docPermissions = await docPermissionsFn.call(this.req, doc, permissions, context);
      } catch (error) {
        logger.warn(
          `docPermissions hook failed for model=${modelName} access=${access}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return docPermissions;
  }

  addEmptyPermissions<T>(modelName: string, doc: T): T {
    const docPermissionField = getModelOption(modelName, 'documentPermissionField');
    // Mongoose `toObject` method omits empty values
    setDocValue(doc, docPermissionField, { _view: { $: '_' }, _edit: { $: '_' } });
    return doc;
  }

  async addDocPermissions<T>(
    modelName: string,
    doc: T,
    access: DocPermissionsAccess,
    context: MiddlewareContext,
  ): Promise<T> {
    const docPermissionField = getModelOption(modelName, 'documentPermissionField');
    const docPermissions = await this.genDocPermissions(modelName, doc, access, context);
    setDocValue(doc, docPermissionField, docPermissions);
    return doc;
  }

  async addFieldPermissions<T extends { _id?: unknown }>(
    modelName: string,
    doc: T,
    access: DocPermissionsAccess,
    context: MiddlewareContext,
  ): Promise<T> {
    const docPermissionField = getModelOption(modelName, 'documentPermissionField');
    const docId = String(doc._id);

    // TODO: do we need falsy fields as well?
    // const permissionSchemaKeys = getModelOption(modelName, 'permissionSchemaKeys');

    let readExists = true;
    let updateExists = true;

    if (access !== 'read') {
      if (context.fieldPermissionAccess?.readIds) {
        readExists = context.fieldPermissionAccess.readIds.has(docId);
      } else {
        const existsResult = await this.req.macl.getService(modelName).exists({ _id: doc._id }, { access: 'read' });
        readExists = existsResult.success ? !!existsResult.data : false;
      }
    }

    if (access !== 'update') {
      if (context.fieldPermissionAccess?.updateIds) {
        updateExists = context.fieldPermissionAccess.updateIds.has(docId);
      } else {
        const existsResult = await this.req.macl.getService(modelName).exists({ _id: doc._id }, { access: 'update' });
        updateExists = existsResult.success ? !!existsResult.data : false;
      }
    }

    const [views, edits] = await Promise.all([
      readExists ? this.genAllowedFields(modelName, doc, 'read') : [],
      updateExists ? this.genAllowedFields(modelName, doc, 'update') : [],
    ]);

    const viewObj = reduce(
      views,
      (ret, view) => {
        ret[view] = true;
        return ret;
      },
      {},
    );

    const editObj = reduce(
      edits,
      (ret, view) => {
        ret[view] = true;
        return ret;
      },
      {},
    );

    setDocValue(doc, `${docPermissionField}._view`, viewObj);
    setDocValue(doc, `${docPermissionField}._edit`, editObj);

    return doc;
  }

  async decorate<T>(modelName: string, doc: T, access: DecorateAccess, context: MiddlewareContext): Promise<T> {
    const decorate = getModelOption(modelName, `decorate.${access}`, null) as Function | Function[];

    const permissions = this.getGlobalPermissions();
    context.docPermissions = getDocPermissions(modelName, doc) as Record<string, unknown>;

    return callHookChain(this.req, decorate, doc, permissions, context);
  }

  async decorateAll<T>(
    modelName: string,
    docs: T[],
    access: DecorateAllAccess,
    context: MiddlewareContext,
  ): Promise<T[]> {
    const decorateAll = getModelOption(modelName, `decorateAll.${access}`, null) as Function | Function[];
    const permissions = this.getGlobalPermissions();

    return callHookChain(this.req, decorateAll, docs, permissions, context);
  }

  runTasks<T extends object>(modelName: string, docObject: T, task: Task | Task[]): T {
    const tasks = compact(castArray(task));
    if (tasks.length === 0) return docObject;

    forEach(tasks, (task) => {
      const { type, args, options } = task;

      switch (type) {
        case 'COPY_AND_DEPOPULATE':
          docObject = copyAndDepopulate(
            docObject,
            args as Array<{ src: string; dest: string }>,
            options as { mutable?: boolean; idField?: string },
          ) as T;
          break;
      }
    });

    return docObject;
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

  async isAllowed(modelName: string, access: RouteGuardAccess | string) {
    if (access.startsWith('subs')) {
      const keys = access.split('.');
      if (keys.length < 3) {
        return false;
      }

      const [, field, op] = keys;
      const subOption = getExactModelOption(modelName, `routeGuard.${access}`);
      if (isUndefined(subOption)) {
        const subFieldOption = getExactModelOption(modelName, `routeGuard.subs.${field}`);
        if (isUndefined(subFieldOption)) {
          const opOption = getModelOption(modelName, `routeGuard.${op}`) as Validation;
          return this.canActivate(opOption);
        }

        return this.canActivate(subFieldOption as Validation);
      }

      return this.canActivate(subOption as Validation);
    }

    const routeGuard = getModelOption(modelName, `routeGuard.${access}`) as Validation;
    return this.canActivate(routeGuard);
  }

  getService<TModel = unknown>(modelName: string) {
    return new Service<TModel>(this.req, modelName);
  }

  getPublicService<TModel = unknown>(modelName: string) {
    return new PublicService<TModel>(this.req, modelName);
  }

  service<TModel = unknown>(modelName: string) {
    return this.getPublicService<TModel>(modelName);
  }

  svc<TModel = unknown>(modelName: string) {
    return this.getPublicService<TModel>(modelName);
  }

  private getGlobalPermissions() {
    return this.req[PERMISSIONS] as Permission;
  }
}

export async function setCore(req: Request, res: Response, next: NextFunction) {
  if (req[MIDDLEWARE]) return next();

  const core = new Core(req);
  await core.setPermissions();

  req.macl = core;
  req[PERMISSIONS] = core.getPermissions();
  req[PERMISSION_KEYS] = req[PERMISSIONS].$_permissionKeys;
  req[MIDDLEWARE] = true;

  next();
}
