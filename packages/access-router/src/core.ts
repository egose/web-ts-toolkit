import { Response, NextFunction } from 'express';
import mongoose, { Model } from 'mongoose';
import {
  assign,
  castArray,
  compact,
  forEach,
  get,
  isArray,
  isBoolean,
  isFunction,
  isNaN,
  isNil,
  isString,
  isUndefined,
  pick,
  reduce,
  set,
  uniq,
} from '@web-ts-toolkit/utils';
import { getGlobalOption, getModelOption, getExactModelOption } from './options';
import { getModelRef } from './meta';
import {
  Populate,
  Projection,
  Filter,
  ModelHookContext,
  Validation,
  AccessRouterBaseRequest,
  ModelRequest,
  SelectAccess,
  RouteGuardAccess,
  RouteVariant,
  DocPermissionsAccess,
  BaseFilterAccess,
  DecorateAccess,
  DecorateAllAccess,
  ValidateAccess,
  PrepareAccess,
  TransformAccess,
  AfterPersistAccess,
  Task,
} from './interfaces';
import Permission, { Permissions } from './permission';
import { Service, PublicService, Base } from './services';
import { normalizeSelect, getDocPermissions, setDocValue, toObject, pickDocFields, genPagination } from './helpers';
import { copyAndDepopulate, copyPaths, countPaths, maskPaths, movePaths, sliceArrays } from './processors';
import { isDocument } from './lib';
import { MIDDLEWARE } from './symbols';
import { Cache } from './cache';
import { logger } from './logger';
import { warn as warnLog } from './logger-helpers';
import {
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
import { getActiveRuntime, runWithRuntime } from './runtime-context';
import { callHookChain, evaluateRouteGuard } from './core-shared';
import { resolveRouteOperationAccess } from './operation-access';
import { planVirtualProjection } from './acl/virtual-projection';
import { setPopulateTargetMeta, type PopulateTargetAccess } from './acl/populate-target';
import { assertPopulateAccess } from './acl/populate-access';

type InternalModelHookContext = ModelHookContext & {
  fieldPermissionAccess?: {
    readIds?: Set<string>;
    updateIds?: Set<string>;
  };
};

/**
 * Fresh non-empty leaf marking "no fields granted" inside `_view`/`_edit`.
 * Must stay a non-empty plain object at a `$`-prefixed key: Mongoose
 * `toObject()`/`toJSON()` (`minimize: true`) strips empty plain objects on
 * non-lean paths, and `$`-leading keys cannot collide with real field names.
 * Always call (never share one reference) so rows cannot alias each other's maps.
 */
const emptyPermissionLeaf = () => ({ $: '_' });

/** Strip `modelPermissionPrefix` for document-grant lookup (mirrors `genAllowedFields`). */
export const stripModelPermissionPrefix = (permissionKey: string, prefix: string): string => {
  if (!prefix) return permissionKey;
  if (permissionKey.startsWith(prefix)) return permissionKey.substring(prefix.length);
  return permissionKey;
};

/**
 * VIRT-03 scoped rule evaluation (VIRT-00A D1/D5).
 * Evaluates a single `permissionSchema` field rule for `outputAccess` against
 * actual global + document grants (global `has` OR prefixed doc-grant truthiness
 * for string/array rules; direct invocation for function rules with
 * `this` = request and `(permissions, docPermissions)` args; booleans as-is).
 * Bare `{ sub }` containers or unknown shapes deny. Never throws: function-rule
 * throws deny fail-closed.
 */
export const evaluateScopedAccessRule = async ({
  req,
  rule,
  globalPermissions,
  docPermissions,
  modelPermissionPrefix,
}: {
  req: unknown;
  rule: unknown;
  globalPermissions: { has: (key: string) => boolean } | null | undefined;
  docPermissions: Record<string, unknown> | null | undefined;
  modelPermissionPrefix: string;
}): Promise<boolean> => {
  if (rule === undefined) return false;
  if (isBoolean(rule)) return rule === true;
  const hasPermission = (key: string): boolean => {
    try {
      if (globalPermissions?.has(key)) return true;
    } catch {
      // fall through to doc grants
    }
    try {
      const stripped = stripModelPermissionPrefix(key, modelPermissionPrefix);
      return Boolean((docPermissions ?? {})[stripped]);
    } catch {
      return false;
    }
  };
  const { createValidator } = await import('./helpers');
  const { stringHandler, arrayHandler } = createValidator(hasPermission);
  if (isString(rule)) return stringHandler(rule);
  if (isArray(rule)) return arrayHandler(rule as string[] | string[][]);
  if (isFunction(rule)) {
    try {
      return Boolean(await (rule as Function).call(req, globalPermissions, docPermissions));
    } catch {
      return false;
    }
  }
  return false;
};

/**
 * Extract the `outputAccess` rule for a scoped `permissionSchema` field
 * (VIRT-03 trim + virtual auth). Mirrors planner/VIRT-02 semantics:
 * `{ read: <rule>, ... }` uses the requested access; bare rules pass through;
 * bare `{ sub }` containers (no grant) deny. Returns `undefined` for absent.
 */
export const extractScopedOutputRule = (
  scopedSchema: Record<string, unknown> | null | undefined,
  fieldName: string,
  outputAccess: string,
): unknown => {
  if (!scopedSchema || !(fieldName in scopedSchema)) return undefined;
  const raw = (scopedSchema as Record<string, unknown>)[fieldName];
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw) && typeof raw !== 'function') {
    const rec = raw as Record<string, unknown>;
    if (outputAccess in rec) return rec[outputAccess];
    // No rule for this access: check for a bare grant shape vs container.
    // A bare `{ sub }` container or unrelated object is not a grant → deny.
    return rec;
  }
  return raw;
};

export class Core {
  private req: ModelRequest;
  private caches: {
    baseFilter: Cache<string, unknown>;
  };
  private cachedPermissions: Permission | null = null;

  constructor(req: AccessRouterBaseRequest) {
    this.req = req as ModelRequest;
    this.caches = {
      baseFilter: new Cache<string, unknown>(),
    };
  }

  getIdentifier(modelName: string) {
    const resolveIdFilter = getModelOption(modelName, 'resolveIdFilter');
    const idField = getModelOption(modelName, 'idField');

    if (isFunction(resolveIdFilter)) {
      return null;
    }

    if (isString(idField)) {
      return idField;
    }

    return '_id';
  }

  async genIDFilter<TModel = unknown>(modelName: string, id: string): Promise<Filter<TModel>> {
    const idField = getModelOption(modelName, 'idField') as string | undefined;
    const resolveIdFilter = getModelOption(modelName, 'resolveIdFilter') as
      | ((this: ModelRequest, id: string) => Filter<TModel> | Promise<Filter<TModel>>)
      | undefined;
    return resolveIdentifierFilterForRequest<TModel>({ req: this.req, idField, resolveIdFilter, id });
  }

  async genFilter<TModel = unknown>(
    modelName: string,
    access: BaseFilterAccess = 'read',
    _filter: Filter<TModel> = null,
  ): Promise<Filter<TModel>> {
    const permissions = this.getGlobalPermissions();
    const cacheKey = `${modelName}_baseFilter_${access}`;

    return resolveAccessFilterForRequest<TModel>({
      req: this.req,
      permissions,
      cache: this.caches.baseFilter,
      cacheKey,
      access,
      filter: _filter,
      getOption: (key, defaultValue) => getModelOption(modelName, key, defaultValue),
    });
  }

  private removePrefix(str: string, prefix: string) {
    if (!prefix) return str;

    if (str.startsWith(prefix)) {
      return str.substring(prefix.length);
    }
    return str;
  }

  async genAllowedFields(modelName: string, doc: unknown, access: SelectAccess, baseFields: string[] = []) {
    const permissionSchema = getModelOption(modelName, 'permissionSchema');

    const modelPermissionPrefix = getModelOption(modelName, 'modelPermissionPrefix', '');

    const permissions = this.getGlobalPermissions();
    const docPermissions = getDocPermissions(modelName, doc);

    return collectAllowedFieldsForRequest({
      req: this.req,
      permissionSchema,
      access,
      baseFields,
      hasPermission: (key) =>
        permissions.has(key) || Boolean(docPermissions[this.removePrefix(key, modelPermissionPrefix)]),
      functionArgs: [permissions, docPermissions],
    });
  }

  async pickAllowedFields<T>(modelName: string, doc: T, access: SelectAccess, baseFields: string[] = []) {
    const permissionSchema = getModelOption(modelName, 'permissionSchema') as
      | Record<string, unknown>
      | null
      | undefined;
    const modelPermissionPrefix = getModelOption(modelName, 'modelPermissionPrefix', '');
    const permissions = this.getGlobalPermissions();
    const docPermissions = getDocPermissions(modelName, doc);

    return pickAllowedFieldsForRequest({
      req: this.req,
      doc,
      permissionSchema,
      access,
      baseFields,
      hasPermission: (key) =>
        permissions.has(key) || Boolean(docPermissions[this.removePrefix(key, modelPermissionPrefix)]),
      functionArgs: [permissions, docPermissions],
    });
  }

  async genSelect(
    modelName: string,
    access: SelectAccess,
    targetFields: Projection = null,
    skipChecks = true,
    subPaths: string[] = [],
  ) {
    const permissionSchema = getModelOption(modelName, ['permissionSchema'].concat(subPaths).join('.')) as
      | Record<string, unknown>
      | null
      | undefined;

    const permissions = this.getGlobalPermissions();

    const alwaysSelectFields =
      subPaths.length > 0 ? [] : (getModelOption(modelName, `alwaysSelectFields.${access}`, []) as string[]);
    // VIRT-02: registered virtuals stay virtual (never persisted). Strip them
    // from every projection input (target + alwaysSelect + trusted overrides
    // via resolveSelectForRequest) and from the persisted schema copy, without
    // granting auth. Inapplicable names stay stripped via the full registry.
    let virtualNames: string[];
    try {
      const runtime = getActiveRuntime() ?? defaultRuntime;
      virtualNames = runtime.getVirtualNames(modelName, subPaths);
    } catch {
      virtualNames = [];
    }
    return resolveSelectForRequest({
      req: this.req,
      permissionSchema,
      access,
      targetFields,
      skipChecks,
      hasPermission: (key) => permissions.hasKey(key) && permissions.has(key),
      functionArgs: [permissions],
      mode: 'model',
      alwaysSelectFields,
      virtualNames,
    });
  }

  async genPopulate(
    modelName: string,
    access: SelectAccess | BaseFilterAccess = 'read',
    _populate: Populate | Populate[] | string | null = null,
    subPaths: string[] = [],
  ) {
    assertPopulateAccess(access);
    if (!_populate) return [];

    let populate = Array.isArray(_populate) ? _populate : [_populate];
    // Preflight every descriptor before concurrent admission, including a reserved
    // option hidden by a valid override. No route key may select target data policy.
    for (const p of populate) {
      if (!isString(p)) assertPopulateAccess(p.access);
    }
    populate = compact(
      await Promise.all(
        populate.map(async (p: Populate | string) => {
          const populateAccess = !isString(p) && p.access ? p.access : access;
          assertPopulateAccess(populateAccess);
          const originalSelect: unknown = isString(p) ? undefined : (p as Populate).select;
          const ret: Populate = isString(p)
            ? { path: p }
            : {
                path: p.path,
                select: normalizeSelect(p.select),
              };

          const pathForSourcePermission =
            subPaths.length > 0 && ret.path.startsWith(`${subPaths[0]}.`)
              ? ret.path.slice(subPaths[0].length + 1)
              : ret.path;
          const parentPath = pathForSourcePermission.includes('.')
            ? pathForSourcePermission.split('.')[0]
            : pathForSourcePermission;
          const allowedParentPaths = await this.genSelect(
            modelName,
            populateAccess as SelectAccess,
            [parentPath],
            false,
            subPaths,
          );
          if (!allowedParentPaths.includes(parentPath)) return null;

          const refModelName = getModelRef(modelName, ret.path);
          if (!refModelName) return null;

          const runtime = getActiveRuntime();
          if (!runtime) return null;

          const requireRegisteredPopulateModels = getGlobalOption('requireRegisteredPopulateModels', true);

          if (!runtime.hasModel(refModelName)) {
            return requireRegisteredPopulateModels ? null : ret;
          }

          const allowedTargetOperation = await this.req.macl.isAllowed(refModelName, populateAccess);
          if (!allowedTargetOperation) {
            return null;
          }

          ret.select = await this.genSelect(refModelName, populateAccess as SelectAccess, ret.select, false);
          const filter = await this.genFilter(refModelName, populateAccess as BaseFilterAccess, null);
          if (filter === false) return null;

          ret.match = filter;
          // VIRT-05: retain per-entry target plans (original selection,
          // captured descriptors, dependency fetch, effective accesses).
          // Mongoose descriptors stay enumerable `{ path, select, match }`;
          // internal metadata is non-enumerable under a Symbol (separate by
          // construction, invisible to Mongoose/JSON). Dotted paths through
          // embedded arrays (e.g. `contacts.friend`) are supported as single
          // entries; no recursive populate API is invented. Parent-path /
          // target-operation / terminal-filter denial and
          // `requireRegisteredPopulateModels` above are preserved unchanged;
          // global-only virtual denial is NOT reinterpreted here — deferred
          // candidates stay in the plan for post-fetch evaluation.
          try {
            // Target finalization must retain the same trusted data policy used
            // for admission/selection, including non-reserved custom accesses.
            const planAccess: PopulateTargetAccess = populateAccess;
            const targetSnapshot = {
              permissionSchema:
                (getModelOption(refModelName, 'permissionSchema', null) as Record<string, unknown> | null) ?? null,
              virtuals: (getModelOption(refModelName, 'virtuals', null) as Record<string, unknown> | null) ?? null,
              alwaysSelectFields:
                (getModelOption(refModelName, 'alwaysSelectFields', null) as
                  | string[]
                  | Record<string, string[]>
                  | null) ?? null,
              modelPermissionPrefix: (getModelOption(refModelName, 'modelPermissionPrefix', '') as string) ?? '',
              requireExplicitSelect: (getModelOption(refModelName, 'requireExplicitSelect', false) as boolean) ?? false,
              documentPermissionField:
                (getModelOption(refModelName, 'documentPermissionField', '_permissions') as string) ?? '_permissions',
              exposedDocPermissionKeys: getModelOption(refModelName, 'exposedDocPermissionKeys', undefined) as
                | string[]
                | undefined,
              stripPermissionsField: (getModelOption(refModelName, 'stripPermissionsField', false) as boolean) ?? false,
              disableFieldPermissions:
                (getModelOption(refModelName, 'disableFieldPermissions', false) as boolean) ?? false,
            };
            const perms = this.getPermissions() as unknown as {
              has: (k: string) => boolean;
              hasKey: (k: string) => boolean;
            };
            const globalForPlan =
              perms && typeof perms.has === 'function' && typeof perms.hasKey === 'function'
                ? perms
                : { has: () => false, hasKey: () => false };
            const targetPlan = planVirtualProjection({
              receivingModelName: refModelName,
              snapshot: {
                permissionSchema: targetSnapshot.permissionSchema,
                virtuals: targetSnapshot.virtuals,
                alwaysSelectFields: targetSnapshot.alwaysSelectFields,
                modelPermissionPrefix: targetSnapshot.modelPermissionPrefix,
                requireExplicitSelect: targetSnapshot.requireExplicitSelect,
                documentPermissionField: targetSnapshot.documentPermissionField,
              },
              virtualAccess: planAccess,
              outputAccess: planAccess,
              docPermissionsAccess: planAccess,
              requestedSelect: originalSelect as never,
              internalFetch: { baseFields: ['_id'] },
              globalPermissions: globalForPlan,
            });
            // Merge virtual dependency fetch requirements into the Mongoose
            // query projection (fetch-only, never an output grant). Only
            // `virtualOnlyDeps` (+ `_id`) are added to the authorized
            // `genSelect` result: denied output fields stay query-restricted
            // (no leak on paths without target finalization, e.g. legacy
            // subdocument populate owned by VIRT-06), while virtual deps are
            // fetched internally and stripped by the target finalizer. Strip
            // `-_id` for DB fetches: fetch always retains `_id` for policy
            // work; output `-_id` is honored independently by the finalizer.
            const merged = uniq([...normalizeSelect(ret.select), ...(targetPlan.virtualOnlyDeps ?? [])]).filter(
              (t) => t !== '-_id' && !t.includes('.sub.'),
            );
            if (!merged.includes('_id')) merged.push('_id');
            ret.select = merged;
            setPopulateTargetMeta(ret, {
              targetModelName: refModelName,
              virtualAccess: planAccess,
              outputAccess: planAccess,
              docPermissionsAccess: planAccess,
              requestedSelect: originalSelect,
              plan: targetPlan,
              snapshot: targetSnapshot,
            });
          } catch {
            // Planning must never break admission: on snapshot/planner
            // failure keep the Mongoose descriptor without internal metadata.
            // The service layer falls back to building a target plan on demand.
          }
          return ret;
        }),
      ),
    );

    return populate;
  }

  async validate(modelName: string, allowedData: unknown, access: ValidateAccess, context: ModelHookContext) {
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

  async prepare<T>(modelName: string, allowedData: T, access: PrepareAccess, context: ModelHookContext): Promise<T> {
    const prepare = getModelOption(modelName, `prepare.${access}`, null) as Function | Function[];
    const permissions = this.getGlobalPermissions();
    return callHookChain(this.req, prepare, allowedData, permissions, context);
  }

  async transform<T>(modelName: string, doc: T, access: TransformAccess, context: ModelHookContext): Promise<T> {
    const transform = getModelOption(modelName, `transform.${access}`, null) as Function | Function[];
    const permissions = this.getGlobalPermissions();
    return callHookChain(this.req, transform, doc, permissions, context);
  }

  async afterPersist<T>(modelName: string, doc: T, access: AfterPersistAccess, context: ModelHookContext): Promise<T> {
    const afterPersist = getModelOption(modelName, `afterPersist.${access}`, null) as Function | Function[];
    const permissions = this.getGlobalPermissions();
    return callHookChain(this.req, afterPersist, doc, permissions, context);
  }

  async changes(modelName: string, doc: Record<string, unknown>, context: ModelHookContext) {
    const changeOptions = getModelOption(modelName, `onChange`, {}) as Record<string, unknown>;

    for (let x = 0; x < context.modifiedPaths.length; x++) {
      const mpath = context.modifiedPaths[x];

      if (isFunction(changeOptions[mpath])) {
        await changeOptions[mpath].call(
          this.req,
          context.originalDocumentSnapshot[mpath],
          doc[mpath],
          context.changes.filter((di) => di.path.length > 0 && di.path[0] === mpath),
          context,
        );
      }
    }
  }

  async beforeDelete<T>(modelName: string, doc: T, context: ModelHookContext): Promise<void> {
    const beforeDelete = getModelOption(modelName, 'beforeDelete', null) as Function | Function[];
    const permissions = this.getGlobalPermissions();
    await callHookChain(this.req, beforeDelete, doc, permissions, context);
  }

  async afterDelete<T>(modelName: string, doc: T, context: ModelHookContext): Promise<void> {
    const afterDelete = getModelOption(modelName, 'afterDelete', null) as Function | Function[];
    const permissions = this.getGlobalPermissions();
    await callHookChain(this.req, afterDelete, doc, permissions, context);
  }

  async genDocPermissions(modelName: string, doc: unknown, access: DocPermissionsAccess, context: ModelHookContext) {
    const docPermissionsFn = getModelOption(modelName, `docPermissions.${access}`, null);
    let docPermissions = {};

    if (isFunction(docPermissionsFn)) {
      const permissions = this.getGlobalPermissions();
      try {
        docPermissions = await docPermissionsFn.call(this.req, doc, permissions, context);
      } catch (error) {
        // docPermissions failures are fail-closed: keep request handling alive,
        // attach an empty permissions object, and emit a structured warning.
        warnLog('docPermissions hook failed; applying empty document permissions', {
          modelName,
          access,
          operation: context.operation,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return docPermissions;
  }

  /**
   * VIRT-03 internal grant resolution (VIRT-00A D1/D2).
   *
   * Returns full internal document grants for virtual authorization without
   * consulting response-metadata switches (`includePermissions`,
   * `includeFieldPermissions`, `skim`, `stripPermissionsField`,
   * `exposedDocPermissionKeys`, `disableFieldPermissions`): those switches
   * affect serialization at the caller boundary only, never authorization
   * inputs. When `supplied` is a plain object it is reused as-is (no second
   * hook invocation for the same output-stage access); otherwise the correct
   * `docPermissionsAccess` hook runs once. The result populates scope-aware
   * `context.docPermissions` (full grants, distinct from serialized metadata).
   */
  async resolveFinalizerDocPermissions(
    modelName: string,
    doc: unknown,
    access: DocPermissionsAccess,
    context: ModelHookContext,
    supplied?: unknown,
  ): Promise<Record<string, unknown>> {
    if (supplied != null && typeof supplied === 'object' && !Array.isArray(supplied)) {
      const grants = supplied as Record<string, unknown>;
      (context as ModelHookContext).docPermissions = grants;
      return grants;
    }
    const grants = (await this.genDocPermissions(modelName, doc, access, context)) as Record<string, unknown>;
    (context as ModelHookContext).docPermissions = grants;
    return grants;
  }

  addEmptyPermissions<T>(modelName: string, doc: T): T {
    const docPermissionField = getModelOption(modelName, 'documentPermissionField');
    // Mongoose `toObject()`/`toJSON()` default to `minimize: true`, which recursively
    // strips `undefined` values and empty plain objects (other falsy values such as
    // `null`, `0`, `false`, `''` and empty arrays are kept). The placeholder must be
    // non-empty at every nesting level so the permission field survives serialization
    // on non-lean paths, and its `$`-prefixed key cannot collide with real field names.
    // Keep in sync with `addFieldPermissions` below.
    setDocValue(doc, docPermissionField, { _view: emptyPermissionLeaf(), _edit: emptyPermissionLeaf() });
    return doc;
  }

  async addDocPermissions<T>(
    modelName: string,
    doc: T,
    access: DocPermissionsAccess,
    context: ModelHookContext,
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
    context: InternalModelHookContext,
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
      (ret: Record<string, boolean>, view: string) => {
        ret[view] = true;
        return ret;
      },
      {} as Record<string, boolean>,
    );

    const editObj = reduce(
      edits,
      (ret: Record<string, boolean>, view: string) => {
        ret[view] = true;
        return ret;
      },
      {} as Record<string, boolean>,
    );

    // An empty grant map would be stripped by Mongoose `toObject()`/`toJSON()`
    // minimization on non-lean paths, so substitute the same non-empty
    // placeholder `addEmptyPermissions` uses. This keeps list (lean) and read
    // (non-lean) output consistent.
    setDocValue(doc, `${docPermissionField}._view`, Object.keys(viewObj).length > 0 ? viewObj : emptyPermissionLeaf());
    setDocValue(doc, `${docPermissionField}._edit`, Object.keys(editObj).length > 0 ? editObj : emptyPermissionLeaf());

    return doc;
  }

  async decorate<T>(modelName: string, doc: T, access: DecorateAccess, context: ModelHookContext): Promise<T> {
    const decorate = getModelOption(modelName, `decorate.${access}`, null) as Function | Function[];

    const permissions = this.getGlobalPermissions();
    context.docPermissions = getDocPermissions(modelName, doc) as Record<string, unknown>;

    return runDecorateHook({ req: this.req, hook: decorate, doc, permissions, context });
  }

  async decorateAll<T>(
    modelName: string,
    docs: T[],
    access: DecorateAllAccess,
    context: ModelHookContext,
  ): Promise<T[]> {
    const decorateAll = getModelOption(modelName, `decorateAll.${access}`, null) as Function | Function[];
    const permissions = this.getGlobalPermissions();

    return runDecorateAllHook({ req: this.req, hook: decorateAll, docs, permissions, context });
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
        case 'COPY':
          docObject = copyPaths(
            docObject,
            args as Array<{ src: string; dest: string }>,
            options as { mutable?: boolean },
          ) as T;
          break;
        case 'MOVE':
          docObject = movePaths(
            docObject,
            args as Array<{ src: string; dest: string }>,
            options as { mutable?: boolean },
          ) as T;
          break;
        case 'SLICE':
          docObject = sliceArrays(
            docObject,
            args as Array<{ src: string; dest?: string; skip?: number; limit?: number }>,
            options as { mutable?: boolean; maxSlice?: number },
          ) as T;
          break;
        case 'COUNT':
          docObject = countPaths(
            docObject,
            args as Array<{ src: string; dest: string }>,
            options as { mutable?: boolean },
          ) as T;
          break;
        case 'MASK':
          docObject = maskPaths(
            docObject,
            args as Array<{ src: string; replacement?: unknown }>,
            options as { mutable?: boolean },
          ) as T;
          break;
      }
    });

    return docObject;
  }

  getPermissions() {
    if (this.cachedPermissions) return this.cachedPermissions;
    return getResolvedRequestPermissions(this.req);
  }

  async setPermissions() {
    await setResolvedRequestPermissions(this.req);
    this.cachedPermissions = getResolvedRequestPermissions(this.req);
  }

  async canActivate(routeGuard: Validation): Promise<boolean> {
    return evaluateRouteGuard(this.req, this.getGlobalPermissions(), routeGuard);
  }

  async isAllowed(modelName: string, access: RouteGuardAccess | string): Promise<boolean> {
    if (access.startsWith('subs')) {
      const keys = access.split('.');
      if (keys.length < 3) {
        return false;
      }

      const [, field, op] = keys;
      const subOption = getExactModelOption(modelName, `operationAccess.${access}`);
      if (isUndefined(subOption)) {
        const subFieldOption = getExactModelOption(modelName, `operationAccess.subs.${field}`);
        if (isUndefined(subFieldOption)) {
          const opOption = getModelOption(modelName, `operationAccess.${op}`) as Validation;
          return this.canActivate(opOption);
        }

        return this.canActivate(subFieldOption as Validation);
      }

      return this.canActivate(subOption as Validation);
    }

    const operationAccess = getModelOption(modelName, `operationAccess.${access}`) as Validation;
    return this.canActivate(operationAccess);
  }

  /** Authorize route entry using explicit server-owned basic/advanced metadata. */
  async isAllowedRoute(
    modelName: string,
    baseAccess: RouteGuardAccess | string,
    variant: RouteVariant,
  ): Promise<boolean> {
    return resolveRouteOperationAccess({
      baseAccess,
      variant,
      getExactOption: (key) => getExactModelOption(modelName, key),
      isAllowedBase: (access) => this.isAllowed(modelName, access),
      canActivate: (guard) => this.canActivate(guard),
      subdocuments: true,
    });
  }

  getService<TModel = unknown, TVirtuals extends object = Record<never, never>>(modelName: string) {
    return new Service<TModel, TVirtuals>(this.req, modelName);
  }

  getPublicService<TModel = unknown, TVirtuals extends object = Record<never, never>>(modelName: string) {
    return new PublicService<TModel, TVirtuals>(this.req, modelName);
  }

  service<TModel = unknown, TVirtuals extends object = Record<never, never>>(modelName: string) {
    return this.getPublicService<TModel, TVirtuals>(modelName);
  }

  svc<TModel = unknown, TVirtuals extends object = Record<never, never>>(modelName: string) {
    return this.getPublicService<TModel, TVirtuals>(modelName);
  }

  private getGlobalPermissions() {
    if (this.cachedPermissions) return this.cachedPermissions;
    return getGlobalPermissions(this.req);
  }
}

export const createSetCore = (runtime: AccessRuntime = defaultRuntime) => {
  return async function setCoreMiddleware(req: AccessRouterBaseRequest, _res: Response, next: NextFunction) {
    return runWithRuntime(runtime, async () => {
      await initializeAclRequest({
        req,
        flag: MIDDLEWARE,
        runtime,
        createCore: (request) => new Core(request),
        assignCore: (core) => {
          req.macl = core;
        },
      });

      next();
    });
  };
};

export const setCore = createSetCore(defaultRuntime);
