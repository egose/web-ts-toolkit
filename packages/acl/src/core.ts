import { Response, NextFunction } from 'express';
import mongoose, { Model } from 'mongoose';
import assign from 'lodash/assign';
import castArray from 'lodash/castArray';
import compact from 'lodash/compact';
import difference from 'lodash/difference';
import forEach from 'lodash/forEach';
import get from 'lodash/get';
import intersection from 'lodash/intersection';
import isUndefined from 'lodash/isUndefined';
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
  callMiddlewareChain,
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
    baseFilter: Cache<string, any>;
  };

  constructor(req: Request) {
    this.req = req;
    this.caches = {
      baseFilter: new Cache<string, any>(),
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

  async genIDFilter(modelName: string, id: string) {
    const identifier = getModelOption(modelName, 'identifier');
    return resolveIdentifierFilter(this.req, identifier, id);
  }

  async genFilter(modelName: string, access: BaseFilterAccess = 'read', _filter: Filter = null): Promise<Filter> {
    const permissions = this.getGlobalPermissions();
    const cacheKey = `${modelName}_baseFilter_${access}`;

    return resolveAccessFilter({
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

  async genAllowedFields(modelName: string, doc: any, access: SelectAccess, baseFields = []) {
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

  async pickAllowedFields(modelName: string, doc: any, access: SelectAccess, baseFields = []) {
    const allowed = await this.genAllowedFields(modelName, doc, access, baseFields);
    return pickDocFields(doc, allowed);
  }

  async genSelect(
    modelName: string,
    access: SelectAccess,
    targetFields: Projection = null,
    skipChecks = true,
    subPaths = [],
  ) {
    let normalizedSelect = normalizeSelect(targetFields);

    const permissionSchema = getModelOption(modelName, ['permissionSchema'].concat(subPaths).join('.'));
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

    const mandatoryFields = subPaths.length > 0 ? [] : getModelOption(modelName, `mandatoryFields.${access}`, []);
    return fields.concat(mandatoryFields);
  }

  async genPopulate(modelName: string, access: SelectAccess | BaseFilterAccess = 'read', _populate: any = null) {
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

  async validate(modelName: string, allowedData: any, access: ValidateAccess, context: MiddlewareContext) {
    const validate = getModelOption(modelName, `validate.${access}`, null);

    if (isFunction(validate)) {
      const permissions = this.getGlobalPermissions();
      return validate.call(this.req, allowedData, permissions, context) as boolean | any[];
    } else if (isBoolean(validate) || isArray(validate)) {
      return validate;
    } else {
      return true;
    }
  }

  async prepare(modelName: string, allowedData: any, access: PrepareAccess, context: MiddlewareContext) {
    const prepare = getModelOption(modelName, `prepare.${access}`, null);
    const permissions = this.getGlobalPermissions();
    return callMiddlewareChain(this.req, prepare, allowedData, permissions, context);
  }

  async transform(modelName: string, doc: any, access: TransformAccess, context: MiddlewareContext) {
    const transform = getModelOption(modelName, `transform.${access}`, null);
    const permissions = this.getGlobalPermissions();
    return callMiddlewareChain(this.req, transform, doc, permissions, context);
  }

  async finalize(modelName: string, doc: any, access: FinalizeAccess, context: MiddlewareContext) {
    const finalize = getModelOption(modelName, `finalize.${access}`, null);
    const permissions = this.getGlobalPermissions();
    return callMiddlewareChain(this.req, finalize, doc, permissions, context);
  }

  async changes(modelName: string, doc: any, context: MiddlewareContext) {
    const changeOptions = getModelOption(modelName, `change`, {});

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

  async genDocPermissions(modelName: string, doc: any, access: DocPermissionsAccess, context: MiddlewareContext) {
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

  addEmptyPermissions(modelName: string, doc: any) {
    const docPermissionField = getModelOption(modelName, 'documentPermissionField');
    // Mongoose `toObject` method omits empty values
    setDocValue(doc, docPermissionField, { _view: { $: '_' }, _edit: { $: '_' } });
    return doc;
  }

  async addDocPermissions(modelName: string, doc: any, access: DocPermissionsAccess, context: MiddlewareContext) {
    const docPermissionField = getModelOption(modelName, 'documentPermissionField');
    const docPermissions = await this.genDocPermissions(modelName, doc, access, context);
    setDocValue(doc, docPermissionField, docPermissions);
    return doc;
  }

  async addFieldPermissions(modelName: string, doc: any, access: DocPermissionsAccess, context: MiddlewareContext) {
    const docPermissionField = getModelOption(modelName, 'documentPermissionField');
    const docId = String(doc._id);

    // TODO: do we need falsy fields as well?
    // const permissionSchemaKeys = getModelOption(modelName, 'permissionSchemaKeys');

    let readExists = true;
    let updateExists = true;

    if (access !== 'read') {
      readExists = context.fieldPermissionAccess?.readIds
        ? context.fieldPermissionAccess.readIds.has(docId)
        : (await this.req.macl.getService(modelName).exists({ _id: doc._id }, { access: 'read' })).data;
    }

    if (access !== 'update') {
      updateExists = context.fieldPermissionAccess?.updateIds
        ? context.fieldPermissionAccess.updateIds.has(docId)
        : (await this.req.macl.getService(modelName).exists({ _id: doc._id }, { access: 'update' })).data;
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

  async decorate(modelName: string, doc: any, access: DecorateAccess, context: MiddlewareContext) {
    const decorate = getModelOption(modelName, `decorate.${access}`, null);

    const permissions = this.getGlobalPermissions();
    context.docPermissions = getDocPermissions(modelName, doc);

    return callMiddlewareChain(this.req, decorate, doc, permissions, context);
  }

  async decorateAll(modelName: string, docs: any[], access: DecorateAllAccess, context: MiddlewareContext) {
    const decorateAll = getModelOption(modelName, `decorateAll.${access}`, null);
    const permissions = this.getGlobalPermissions();

    return callMiddlewareChain(this.req, decorateAll, docs, permissions, context);
  }

  runTasks(modelName: string, docObject: any, task: Task | Task[]) {
    const tasks = compact(castArray(task));
    if (tasks.length === 0) return docObject;

    forEach(tasks, (task) => {
      const { type, args, options } = task;

      switch (type) {
        case 'COPY_AND_DEPOPULATE':
          docObject = copyAndDepopulate(docObject, args, options);
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
          const opOption = getModelOption(modelName, `routeGuard.${op}`);
          return this.canActivate(opOption);
        }

        return this.canActivate(subFieldOption);
      }

      return this.canActivate(subOption);
    }

    const routeGuard = getModelOption(modelName, `routeGuard.${access}`);
    return this.canActivate(routeGuard);
  }

  getService(modelName: string) {
    return new Service(this.req, modelName);
  }

  getPublicService(modelName: string) {
    return new PublicService(this.req, modelName);
  }

  service(modelName: string) {
    return this.getPublicService(modelName);
  }

  svc(modelName: string) {
    return this.getPublicService(modelName);
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
