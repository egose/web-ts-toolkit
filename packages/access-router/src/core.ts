import { Response, NextFunction } from 'express';
import mongoose, { Model } from 'mongoose';
import { assertPublicAdmission } from './validation/public-admission';
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
import { getModelOption, getExactModelOption } from './options';
import {
  Populate,
  PopulatePlanningOptions,
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
import { normalizeSelect, getDocPermissions, setDocValue, genPagination } from './helpers';
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
import {
  registerRequestRowCache,
  resolveAccessFilterForRequest,
  resolveIdentifierFilterForRequest,
} from './acl/filter-resolution';
import { runDecorateAllHook, runDecorateHook } from './acl/hook-runner';
import { collectModelRequestFields, resolveSelectForRequest, stripVirtuals } from './acl/select-resolution';
import { assertFieldHelperCall, requestFieldScope } from './acl/field-helper-options';
import type { AccessRuntime } from './runtime';
import { defaultRuntime } from './runtime';
import { getActiveRuntime, runWithRuntime } from './runtime-context';
import { callHookChain, evaluateRouteGuard, intersectFilters } from './core-shared';
import { resolveRouteOperationAccess } from './operation-access';
import { planVirtualProjection, resolveAlwaysSelectForAccess } from './acl/virtual-projection';
import { setPopulateTargetMeta, type PopulateTargetAccess } from './acl/populate-target';
import { assertPopulateAccess } from './acl/populate-access';
import type {
  AllowedOutputFieldOptions,
  OutputFieldOptions,
  OutputPlanningOptions,
} from './interfaces/service-authorization';
import {
  captureModelAuthorizationConfiguration,
  getCapturedAuthorizationOption,
  planModelOutputForHelper,
} from './acl/model-output-planning';
import { captureRelatedTargets } from './acl/related-execution';
import { copyAuthorizationValue } from './acl/authorization-snapshot';
import { deepIsolateValue } from './helpers/document';
import type { AuthorizationConfiguration } from './acl/service-authorization';
import { filterModelOutputForHelper } from './acl/output-field-filter';
import { getRequestWorkState } from './helpers/request-work';
import {
  constructOwnedModelService,
  consumeCapturedModelOperationGuard,
  modelServiceGlobalOptions,
  registerModelCoreOwner,
  withCapturedModelOperationGuard,
} from './acl/model-service-owner';

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

// Compatibility source exports; planner and finalizer share the same implementation.
export {
  evaluateScopedAccessRule,
  extractScopedOutputRule,
  stripModelPermissionPrefix,
} from './acl/field-authorization';

export class Core {
  private req: ModelRequest;
  private readonly requestRuntime = getActiveRuntime() ?? defaultRuntime;
  private caches: {
    baseFilter: Cache<string, unknown>;
  };
  private cachedPermissions: Permission | null = null;

  constructor(req: AccessRouterBaseRequest) {
    this.req = req as ModelRequest;
    this.caches = {
      baseFilter: new Cache<string, unknown>(),
    };
    registerRequestRowCache(this, this.caches.baseFilter);
    registerModelCoreOwner(this, this.req, this.requestRuntime);
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

  /**
   * Existing output paths authorized by a fresh output-only policy or an authenticated
   * same-stage result. Supplied options require purpose: 'output'; omission/undefined
   * defaults to { purpose: 'output' }. Never a request-schema allowlist or write admission.
   * Only a document handle reuses decisions after projected hook inputs are trimmed.
   */
  async genAllowedFields<TModel = unknown, TVirtuals extends object = Record<never, never>>(
    modelName: string,
    doc: unknown,
    access: SelectAccess,
    options: AllowedOutputFieldOptions<TModel, TVirtuals> = { purpose: 'output' },
  ): Promise<string[]> {
    assertFieldHelperCall('genAllowedFields', arguments.length, 4, options);
    return (
      await filterModelOutputForHelper({
        request: this.req,
        runtime: this.requestRuntime,
        modelName,
        access,
        doc,
        options,
        permissions: this.getGlobalPermissions(),
        purpose: 'output',
      })
    ).fields;
  }

  /**
   * Filter existing values only: no selection, getters, restoration, row checks or writes.
   * Raw policy is fresh evaluation; a document handle reuses original decisions after
   * private hook inputs/metadata are trimmed. These inputs are mutually exclusive.
   * Omitted/undefined options equal {} (fresh request-mode output). Helpers isolate
   * output; only original/package-associated unchanged copies
   * accept the handle. The return generic does not guarantee every field is present.
   */
  async pickAllowedFields<T, TModel = unknown, TVirtuals extends object = Record<never, never>>(
    modelName: string,
    doc: T,
    access: SelectAccess,
    options: OutputFieldOptions<TModel, TVirtuals> = {},
  ): Promise<T> {
    assertFieldHelperCall('pickAllowedFields', arguments.length, 4, options);
    return (
      await filterModelOutputForHelper({
        request: this.req,
        runtime: this.requestRuntime,
        modelName,
        access,
        doc,
        options,
        permissions: this.getGlobalPermissions(),
      })
    ).output as T;
  }

  /** Alias of pickAllowedFields; performs no selection, getter invocation, row checks or write admission. */
  async trimOutputFields<T, TModel = unknown, TVirtuals extends object = Record<never, never>>(
    modelName: string,
    doc: T,
    access: SelectAccess,
    options: OutputFieldOptions<TModel, TVirtuals> = {},
  ): Promise<T> {
    assertFieldHelperCall('trimOutputFields', arguments.length, 4, options);
    return this.pickAllowedFields<T, TModel, TVirtuals>(modelName, doc, access, options);
  }

  /**
   * Output-only planning: grants are additive; returns persisted fetch inputs,
   * including private dependencies. Omitted/undefined options equal {} (request).
   * No permission functions/getters run. Positional skipChecks/subPaths are removed.
   */
  async genSelect<TModel = unknown, TVirtuals extends object = Record<never, never>>(
    modelName: string,
    access: SelectAccess,
    targetFields?: Projection,
    options: OutputPlanningOptions<TModel, TVirtuals> = {},
  ): Promise<string[]> {
    assertFieldHelperCall('genSelect', arguments.length, 4, options);
    return planModelOutputForHelper({
      request: this.req,
      runtime: this.requestRuntime,
      modelName,
      access,
      select: targetFields,
      permissions: this.getGlobalPermissions(),
      options,
    }).persistedFetchSelection;
  }

  /** Alias of named genSelect: fresh output planning, returning fetch inputs rather than output grants. */
  async genQuerySelect<TModel = unknown, TVirtuals extends object = Record<never, never>>(
    modelName: string,
    access: SelectAccess,
    targetFields?: Projection,
    options: OutputPlanningOptions<TModel, TVirtuals> = {},
  ): Promise<string[]> {
    assertFieldHelperCall('genQuerySelect', arguments.length, 4, options);
    return this.genSelect<TModel, TVirtuals>(modelName, access, targetFields, options);
  }

  /** Persisted request-only populate admission; fetch planning is not field authority. */
  private async requestPopulateSelect(
    configuration: AuthorizationConfiguration,
    permissions: Permission,
    access: SelectAccess,
    targetFields: Projection = null,
    scopePath: readonly string[] = [],
  ) {
    const subPaths = scopePath.flatMap((part) => [part, 'sub']);
    const permissionSchema = get(configuration, ['permissionSchema', ...subPaths]) as
      | Record<string, unknown>
      | null
      | undefined;

    // Registered virtuals never become persisted request fields. Private target
    // hook inputs are added separately after source admission in genPopulate.
    // Inapplicable names stay stripped via the full registry.
    const prefix = scopePath.length ? `${scopePath.join('.')}.` : '';
    const virtualNames = (configuration.catalog.virtualPaths ?? [])
      .filter((path) => path.startsWith(prefix))
      .map((path) => path.slice(prefix.length))
      .filter((path) => !path.includes('.'));
    return resolveSelectForRequest({
      req: this.req,
      permissionSchema,
      access,
      targetFields,
      hasPermission: (key) => permissions.hasKey(key) && permissions.has(key),
      functionArgs: [permissions],
      mode: 'model',
      virtualNames,
    });
  }

  /** Request-only population. Use named response scopePath; positional subPaths are removed. */
  async genPopulate(
    modelName: string,
    access: SelectAccess | BaseFilterAccess = 'read',
    _populate: Populate | Populate[] | string | null = null,
    options: PopulatePlanningOptions = {},
  ) {
    assertFieldHelperCall('genPopulate', arguments.length, 4, options, 'populate');
    const scopePath = requestFieldScope(options);
    assertPublicAdmission(_populate, 'populate');
    assertPopulateAccess(access);
    if (!_populate) return [];

    const descriptors = copyAuthorizationValue(Array.isArray(_populate) ? _populate : [_populate], true);
    // Preflight every descriptor before concurrent admission, including a reserved
    // option hidden by a valid override. No route key may select target data policy.
    for (const p of descriptors) {
      if (!isString(p)) assertPopulateAccess(p.access);
    }
    const runtime = this.requestRuntime;
    const globalOptions = modelServiceGlobalOptions(this, runtime);
    const relatedTargets = captureRelatedTargets(runtime, modelName, { populate: descriptors }, 0, globalOptions);
    const sourceConfiguration = captureModelAuthorizationConfiguration(runtime, modelName, undefined, globalOptions);
    const originalPermissions = this.getGlobalPermissions();
    const permissions = new Permission(
      Object.fromEntries(originalPermissions.keys.map((key) => [key, originalPermissions.has(key)])),
    );
    const populate = compact(
      await Promise.all(
        descriptors.map(async (p: Populate | string) => {
          const populateAccess = !isString(p) && p.access ? p.access : access;
          assertPopulateAccess(populateAccess);
          const originalSelect: unknown = isString(p) ? undefined : (p as Populate).select;
          const ret: Populate = isString(p)
            ? { path: p }
            : {
                path: p.path,
                select: normalizeSelect(p.select),
              };

          const scopePrefix = scopePath.join('.');
          const pathForSourcePermission =
            scopePrefix && ret.path.startsWith(`${scopePrefix}.`) ? ret.path.slice(scopePrefix.length + 1) : ret.path;
          const parentPath = pathForSourcePermission.includes('.')
            ? pathForSourcePermission.split('.')[0]
            : pathForSourcePermission;
          const allowedParentPaths = await this.requestPopulateSelect(
            sourceConfiguration,
            permissions,
            populateAccess as SelectAccess,
            [parentPath],
            scopePath,
          );
          if (!allowedParentPaths.includes(parentPath)) return null;

          const target = relatedTargets.find((entry) => entry.path === ret.path);
          if (!target) return null;
          const refModelName = target.modelName;
          const targetConfiguration = target.configuration;
          if (
            targetConfiguration.requireOperationAccessForPopulateQueries !== false &&
            !(await withCapturedModelOperationGuard(
              this,
              refModelName,
              populateAccess,
              getCapturedAuthorizationOption(targetConfiguration, `operationAccess.${populateAccess}`),
              permissions,
              () => this.isAllowed(refModelName, populateAccess),
            ))
          ) {
            return null;
          }

          ret.select = await this.requestPopulateSelect(
            targetConfiguration,
            permissions,
            populateAccess as SelectAccess,
            ret.select,
          );
          // Fetch-only target hook inputs have no role in source-field admission.
          const hookInputs = resolveAlwaysSelectForAccess(
            targetConfiguration.alwaysSelectFields as import('./acl/virtual-projection').VirtualProjectionSnapshot['alwaysSelectFields'],
            populateAccess,
          );
          ret.select = uniq([
            ...ret.select,
            ...stripVirtuals(hookInputs, [...(targetConfiguration.catalog.virtualPaths ?? [])]),
          ]);
          const match = (isString(p) ? {} : (p.match ?? {})) as Filter;
          // Hooks may rewrite ordinary input in place; the captured required
          // relationship match (including native leaves) must remain independent.
          const filter = await resolveAccessFilterForRequest({
            req: this.req,
            permissions,
            cache: this.caches.baseFilter,
            cacheKey: `${refModelName}_baseFilter_${populateAccess}`,
            access: populateAccess,
            filter: deepIsolateValue(match),
            getOption: (key) => getCapturedAuthorizationOption(targetConfiguration, key),
          });
          if (filter === false) return null;

          // Detach the result from the capture, hook-returned values and row cache.
          ret.match = deepIsolateValue(intersectFilters(match, filter));
          // VIRT-05: retain per-entry target plans (original selection,
          // captured descriptors, dependency fetch, effective accesses).
          // Mongoose descriptors stay enumerable `{ path, select, match }`;
          // internal metadata is non-enumerable under a Symbol (separate by
          // construction, invisible to Mongoose/JSON). Dotted paths through
          // embedded arrays (e.g. `contacts.friend`) are supported as single
          // entries; no recursive populate API is invented. Parent-path /
          // target-operation / terminal-filter denial are independent of required target configuration;
          // global-only virtual denial is NOT reinterpreted here — deferred
          // candidates stay in the plan for post-fetch evaluation.
          // Target finalization must retain the same trusted data policy used
          // for admission/selection, including non-reserved custom accesses.
          const planAccess: PopulateTargetAccess = populateAccess;
          const targetSnapshot = targetConfiguration as import('./output/finalize-model-output').FinalizeSnapshot;
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
            globalPermissions: permissions,
          });
          // Merge virtual dependency fetch requirements into the Mongoose
          // query projection (fetch-only, never an output grant). Only
          // `virtualOnlyDeps` (+ `_id`) are added to the authorized
          // request-only selection: denied output fields stay query-restricted
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
        docPermissions = await getRequestWorkState(this.req, this.requestRuntime).hookGate.run(() =>
          docPermissionsFn.call(this.req, doc, permissions, context),
        );
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
        const existsResult = await this.getService(modelName).exists({ _id: doc._id }, { access: 'read' });
        readExists = existsResult.success ? !!existsResult.data : false;
      }
    }

    if (access !== 'update') {
      if (context.fieldPermissionAccess?.updateIds) {
        updateExists = context.fieldPermissionAccess.updateIds.has(docId);
      } else {
        const existsResult = await this.getService(modelName).exists({ _id: doc._id }, { access: 'update' });
        updateExists = existsResult.success ? !!existsResult.data : false;
      }
    }

    // Metadata describes this request actor. Existing serialized document grants
    // remain metadata inputs here; never invoke output helpers or a fresh doc hook.
    const requestFields = (fieldAccess: SelectAccess) =>
      collectModelRequestFields({
        req: this.req,
        permissionSchema: getModelOption(modelName, 'permissionSchema'),
        access: fieldAccess,
        permissions: this.getGlobalPermissions(),
        grants: getDocPermissions(modelName, doc),
        modelPermissionPrefix: getModelOption(modelName, 'modelPermissionPrefix', ''),
      });
    const [views, edits] = await Promise.all([
      readExists ? requestFields('read') : [],
      updateExists ? requestFields('update') : [],
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

    return runDecorateHook({ req: this.req, runtime: this.requestRuntime, hook: decorate, doc, permissions, context });
  }

  async decorateAll<T>(
    modelName: string,
    docs: T[],
    access: DecorateAllAccess,
    context: ModelHookContext,
  ): Promise<T[]> {
    const decorateAll = getModelOption(modelName, `decorateAll.${access}`, null) as Function | Function[];
    const permissions = this.getGlobalPermissions();

    return runDecorateAllHook({
      req: this.req,
      runtime: this.requestRuntime,
      hook: decorateAll,
      docs,
      permissions,
      context,
    });
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
    const captured = consumeCapturedModelOperationGuard(this, modelName, access);
    if (captured) return evaluateRouteGuard(this.req, captured.permissions, captured.guard as Validation);
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

  /** Acquire a model service for trusted server calls; authorization belongs to each call's options, never defaults. */
  getService<TModel = unknown, TVirtuals extends object = Record<never, never>>(modelName: string) {
    return constructOwnedModelService(this, () => new Service<TModel, TVirtuals>(this.req, modelName));
  }

  getPublicService<TModel = unknown, TVirtuals extends object = Record<never, never>>(modelName: string) {
    return constructOwnedModelService(this, () => new PublicService<TModel, TVirtuals>(this.req, modelName));
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
