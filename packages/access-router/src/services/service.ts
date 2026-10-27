import { Document } from 'mongoose';
import {
  castArray,
  cloneDeep,
  compact,
  forEach,
  get,
  isArray,
  isBoolean,
  isFunction,
  isNil,
  isPlainObject,
  omit,
  pick,
  set,
  uniq,
  uniqBy,
} from '@web-ts-toolkit/utils';
import { diff } from 'just-diff';
import MongooseModelAdapter, { admitModelPersistence } from '../model';
import { modelServiceGlobalOptions, modelServiceOptions } from '../acl/model-service-owner';
import { isDistinctFieldAuthorized } from '../acl/distinct-field-authorization';
import {
  getDocPermissions,
  genPagination,
  mapWithConcurrencyLimit,
  normalizeSelect,
  populateDoc,
  toObject,
} from '../helpers';
import { isValidFieldPath, sanitizeSortFields, validateSortFields } from '../helpers/sort-policy';
import { excludeVirtualsFromAllowedSortFields } from '../helpers/sort-policy';
import { RequestConcurrencyScheduler, type SharedHookGate } from '../helpers/concurrency';
import { getRequestWorkState } from '../helpers/request-work';
import { resolveAlwaysSelectForAccess, type VirtualProjectionPlan } from '../acl/virtual-projection';
import { compactPersistedProjection, planAuthorizedModelProjection } from '../acl/output-projection';
import { captureModelAuthorizationConfiguration, getCapturedAuthorizationOption } from '../acl/model-output-planning';
import {
  getVirtualPopulatePublicIdentity,
  getVirtualPopulateRow,
  loadVirtualPopulateOutputRows,
  planVirtualPopulateQuery,
} from '../acl/virtual-populate-execution';
import { resolveAuthorizedAccessFilter } from '../acl/filter-resolution';
import { getAuthorizationPermissions, readServiceAuthorization } from '../acl/service-authorization';
import {
  createServiceOutputContext,
  readDocumentAuthorization,
  transferDocumentAuthorizationGraph,
} from '../acl/document-authorization';
import { requestOutputFieldPaths, resolveOutputDocumentAuthorization } from '../acl/output-field-filter';
import { classifyEffectiveFieldAuthorization, extractOutputFieldRules } from '../acl/field-authorization';
import { authorizationError } from '../acl/authorization-snapshot';
import { assertHydrationDefaults, assertPublicDefaults } from '../validation/public-admission';
import {
  createServiceExecution,
  deriveServiceExecution,
  readServiceExecution,
  registerServiceExecutors,
  withExecutionQueryIntent,
} from '../acl/service-execution';
import { registerSubdocumentPopulateExecutor } from '../acl/subdocument-output';
import type { ServiceExecutionContext, PreparedModelQuery } from '../acl/service-execution';
import {
  prepareModelQuery,
  readPreparedModelQuery,
  resolveModelIdentifier,
  readModelIdentifier,
  isExecutionRowDenied,
  executePreparedFindOne,
  executePreparedFind,
  executePreparedUpdateOne,
  executePreparedCount,
  executePreparedGroupedCount,
  executeCreate,
} from '../acl/prepared-query';
import Permission from '../permission';
import { evaluateRouteGuard, intersectFilters } from '../core-shared';
import { validateExpandedCorrelatedOperands } from '../correlated-includes';
import { finalizeModelOutput, type FinalizeSnapshot } from '../output/finalize-model-output';
import { attachPermissionsAlias, removeGeneratedPermissionsAlias } from '../output/permissions-alias';
import { getIncludeOriginal, getIncludeSource, restoreIncludeOutput } from '../output/include-output';
import {
  VIRT_ASSOCIATION_FIELD,
  VIRT_ASSOCIATION_VALUES,
  excludeVirtualsFromAllowedFields,
  isVirtualDbPath,
  stripVirtualKeysFromFilter,
} from './base';
import { getPopulateTargetMeta, type PopulateTargetMeta } from '../acl/populate-target';
import { deepIsolateValue, getDocValue, setDocValue, isolateDocForOutput } from '../helpers/document';
import { captureRelatedTargets, createRelatedExecution, relatedPolicy } from '../acl/related-execution';
import { assertPopulateAccess } from '../acl/populate-access';
import { setPopulateTargetMeta } from '../acl/populate-target';
import { applyUpdate } from '../helpers/apply-update';
import {
  admitModelInput,
  assertModelInputComplexity,
  inputFetchPaths,
  requestInputFields,
  resolveInputDocumentGrants,
  sanitizePreparedInput,
  stripDocumentInputVirtuals,
} from '../acl/model-input-admission';
import {
  Filter,
  Include,
  ModelDocument,
  ModelRouterOptions,
  ModelHookContext,
  SubPopulate,
  DistinctArgs,
  Defaults,
  Populate,
  ModelRequest,
  HydrationMode,
  Projection,
  FindArgs,
  FindOptions,
  FindOneArgs,
  FindOneOptions,
  FindByIdArgs,
  FindByIdOptions,
  CreateArgs,
  CreateOptions,
  NewArgs,
  NewOptions,
  AuthorizedSingleResult,
  AuthorizedListResult,
  ServiceOutputContext,
  ServiceOutputDecorator,
  ErrorResult,
  UpdateOneArgs,
  UpdateOneOptions,
  UpdateByIdArgs,
  UpsertArgs,
  UpdateByIdOptions,
  UpsertOptions,
  BaseFilterAccess,
  ExistsOptions,
  ListResult,
  ServiceResult,
  SingleResult,
  SubQueryEntry,
  FindAccess,
  SubdocumentBulkUpdateInput,
  SubdocumentCreateInput,
  SubdocumentCreateOptions,
  SubdocumentId,
  SubdocumentListOptions,
  SubdocumentName,
  SubdocumentParentArgs,
  SubdocumentParentOptions,
  SubdocumentReadOptions,
  SubdocumentUpdateOptions,
  SubdocumentDeleteOptions,
  SubdocumentModel,
  SubdocumentVirtuals,
} from '../interfaces';
import { Codes, StatusCodes } from '../enums';
import { Base } from './base';
import {
  assertCountForeignFieldSize,
  castCountGroups,
  prepareCountValues,
  type GroupedCountInput,
} from './grouped-count';
import type { OpLogContext } from '../logger-helpers';
import { debug as debugLog, summarizeFilter } from '../logger-helpers';
import { isDocument } from '../lib';
import {
  bulkUpdateSub as bulkUpdateSubImpl,
  createSub as createSubImpl,
  deleteSub as deleteSubImpl,
  getParentDoc as getParentDocImpl,
  listSub as listSubImpl,
  readSub as readSubImpl,
  updateSub as updateSubImpl,
} from './model-subdocument-service';
import { resolveExistsOptions, resolveUpsertArgs, resolveUpsertOptions } from './model-service-defaults';
import { captureModelServiceIntent, type ModelServiceIntentMethod } from './model-service-intent';

type ServiceHookContext = ModelHookContext & {
  diff?(doc: Document): void;
  fieldPermissionAccess?: {
    readIds?: Set<string>;
    updateIds?: Set<string>;
  };
};

const assertModelDocument = <TModel>(
  value: unknown,
  modelName: string,
  hookName: 'transform' | 'afterPersist',
): ModelDocument<TModel> => {
  if (isDocument(value)) {
    return value as unknown as ModelDocument<TModel>;
  }

  throw new Error(`${hookName} hook for model=${modelName} must return a Mongoose document instance`);
};

const unsetDocPath = (doc: unknown, path: string): void => {
  const segments = path.split('.');
  let current: unknown = doc;
  // Unwrap mongoose documents to their underlying _doc for plain mutation.
  const unwrap = (value: unknown): unknown =>
    value != null && typeof value === 'object' && '_doc' in (value as Record<string, unknown>)
      ? (value as { _doc: unknown })._doc
      : value;
  current = unwrap(current);
  for (let i = 0; i < segments.length - 1; i++) {
    if (current == null || typeof current !== 'object') return;
    if (!Object.prototype.hasOwnProperty.call(current, segments[i])) return;
    current = unwrap((current as Record<string, unknown>)[segments[i]]);
  }
  if (current != null && typeof current === 'object') {
    delete (current as Record<string, unknown>)[segments[segments.length - 1]];
  }
};

/**
 * VIRT-04 direct-operation virtual wiring (VIRT-00A D1/D6/D7/D8).
 *
 * - Access matrix: list `list/list/list`; read/readFilter `read/read/read`
 *   (read using list fallback becomes `list/list/list` with
 *   `operation: 'read'` preserved); create/create-branch `create/read/create`;
 *   update/update-branch `update/read/update`; new template
 *   `create/create/create` (see `new()` note on ignored `args.select`).
 * - Effective mutation output selection is carried on the internal plan
 *   into the shared finalizer before evaluation (explicit select,
 *   `returningAll: false` implicits, decorator/task selection preserved
 *   via existing public picks after decorate/tasks). Mutations use ordinary
 *   internal `select`; initiating operation lives in private execution state.
 * - Output-only admission runs before validation/persistence; computed
 *   values are assigned only to output copies (finalizer), never to
 *   persisted docs/snapshots.
 * - Per-call row maps preserve order; request/runtime hook-chain admission
 *   shares one pool across independent services and reentrant descendants.
 *   Waiting ancestor frames are not separate permits. No persistence permit
 *   is held over hooks or recursive orchestration.
 */
type VirtualOperationAccess = 'list' | 'create' | 'read' | 'update';

export class Service<TModel = unknown, TVirtuals extends object = Record<never, never>> extends Base<
  TModel,
  TVirtuals
> {
  protected model: any;
  protected get options(): ModelRouterOptions<TModel, TVirtuals> {
    return modelServiceOptions(this, () => this.getModelRouterOptions(this.modelName));
  }
  private defaultsOverride?: Defaults<TModel>;
  /**
   * Presentation/query defaults for this service instance; an explicit assignment
   * replaces the runtime defaults bag, not a per-bucket merge. Fetch mode belongs
   * to the owning model's hydration configuration and affects all its services.
   * Legacy method-option lean/hydration keys throw on assignment and before calls
   * if an assigned JavaScript bag is later mutated.
   */
  public get defaults(): Defaults<TModel> {
    return this.defaultsOverride ?? this.options.defaults ?? {};
  }
  public set defaults(value: Defaults<TModel>) {
    assertHydrationDefaults(value);
    this.defaultsOverride = value;
  }
  protected baseFields: string[];
  protected get baseFieldsExt(): string[] {
    return this.baseFields.concat(this.options.documentPermissionField);
  }
  private readonly hookGate = getRequestWorkState(this.req, this.requestRuntime).hookGate;
  private readonly persist = <T>(operation: () => T | PromiseLike<T>): Promise<T> =>
    this.getCorrelatedExecState().scheduler.work(operation);

  /** Raw hydrated parent/null. Fetch mode is fixed, independent of model read settings. */
  public findRawParentDoc(args: { filter: Filter<TModel>; select: string; populate: unknown }): any {
    return this.model.findOne({
      filter: args.filter as unknown as Filter,
      select: args.select,
      populate: args.populate as string | Populate[],
      lean: false,
    });
  }

  protected createModelAdapter(modelName: string): any {
    return new MongooseModelAdapter(modelName, this.requestRuntime);
  }

  protected getModelRouterOptions(modelName: string): ModelRouterOptions<TModel, TVirtuals> {
    return this.requestRuntime.getModelOptions<TModel, TVirtuals>(modelName);
  }

  /**
   * Router-level permission output postures (see `ModelRouterOptions`).
   * Absolute: they win over client input and per-operation `defaults`.
   */
  public getPermissionsPosture(): { stripPermissionsField: boolean; disableFieldPermissions: boolean } {
    return {
      stripPermissionsField: this.options.stripPermissionsField ?? false,
      disableFieldPermissions: this.options.disableFieldPermissions ?? false,
    };
  }

  private asServiceHookContext(context: ModelHookContext): ServiceHookContext {
    return context as ServiceHookContext;
  }

  /** Presence, not truthiness: never read a legacy slot or treat it as payload data. */
  private admitServiceCall(args?: unknown, options?: unknown, authorizationOptions = true): void {
    for (const [slot, value] of [
      ['args', args],
      ['options', options],
    ] as const) {
      if (
        value !== null &&
        (typeof value === 'object' || typeof value === 'function') &&
        'authorization' in value &&
        (slot === 'args' || !authorizationOptions)
      ) {
        authorizationError(`${slot}.authorization is unsupported here; inputFields requires model mutation options`);
      }
      if (value !== null && (typeof value === 'object' || typeof value === 'function') && 'overrides' in value) {
        authorizationError(
          `${slot}.overrides was removed; use ordinary select/populate/query predicates and per-call options.authorization. See the README service overrides migration table`,
        );
      }
    }
    assertPublicDefaults(this.defaults);
  }

  private executionOutputPlan(
    execution: ServiceExecutionContext,
    requestedSelect?: Projection,
    internalFetch: Parameters<typeof planAuthorizedModelProjection>[0]['internalFetch'] = {},
    ignoreSelect = false,
  ) {
    const { authorization, binding } = readServiceExecution(this, execution);
    return planAuthorizedModelProjection({
      authorization,
      binding,
      requestedSelect,
      internalFetch,
      ...(ignoreSelect ? { effectiveSelect: undefined } : {}),
    });
  }

  private preparedOutputIntent(
    execution: ServiceExecutionContext,
    method: ModelServiceIntentMethod,
    args?: FindArgs,
    options?: import('./model-service-intent').ModelServiceIntent['options'],
  ) {
    const state = readServiceExecution(this, execution);
    if (state.queryIntent) return state.queryIntent;
    // Private helper-only dispatches can supply package-owned arguments. Their
    // defaults/posture still come from operation capture, never the live service.
    const { configuration } = readServiceAuthorization(state.authorization, state.binding);
    return captureModelServiceIntent(
      {
        defaults: (configuration.defaults as Defaults | undefined) ?? {},
        getPermissionsPosture: () => ({
          stripPermissionsField: !!configuration.stripPermissionsField,
          disableFieldPermissions: !!configuration.disableFieldPermissions,
        }),
      },
      method,
      args,
      options,
    );
  }

  /** Raw result -> exact ref capture -> detached ordinary source/hook rows.
   * Private inputs travel separately through finalization, never through snapshots.
   */
  private async loadOutputPopulateDependencies(
    execution: ServiceExecutionContext,
    rows: readonly unknown[],
    plan: VirtualProjectionPlan,
    populate: readonly Populate[],
    sourcePopulate: readonly Populate[] = populate,
    hydration?: HydrationMode,
    sourceFields: readonly string[] = [],
    populateAdapter = false,
  ): Promise<Record<string, unknown>[]> {
    const state = readServiceExecution(this, execution);
    return loadVirtualPopulateOutputRows(
      {
        request: this.req,
        runtime: this.requestRuntime,
        family: state.family,
        permissions: getAuthorizationPermissions(state.authorization, state.binding),
        hydration: hydration ?? state.hydration,
        core: this.requestCore,
      },
      rows,
      plan,
      populate,
      [...plan.publicPersistedFetchSelection, ...sourcePopulate.map((entry) => entry.path), ...sourceFields],
      sourcePopulate.filter((entry) => !populate.includes(entry)),
      populateAdapter
        ? (output) =>
            this.persist(() =>
              this.model.mongooseModel.populate(
                output,
                sourcePopulate.filter((entry) => !populate.includes(entry)),
              ),
            )
        : undefined,
    );
  }

  /** Dependency-bearing post-lifecycle/template work uses detached output copies. */
  private async prepareDetachedOutputRows(
    execution: ServiceExecutionContext,
    rows: readonly unknown[],
    plan: VirtualProjectionPlan,
    populate: readonly Populate[],
  ): Promise<unknown[]> {
    const population = planVirtualPopulateQuery(plan, populate);
    if (!population.requiresCapture) {
      if (populate.length) for (const row of rows) await this.persist(() => populateDoc(row as Document, populate));
      return [...rows];
    }
    return this.loadOutputPopulateDependencies(
      execution,
      rows,
      plan,
      population.publicPopulate,
      populate,
      'hydrated',
      [],
      population.queryPopulate.length > 0,
    );
  }

  private requestSortFields(execution: ServiceExecutionContext): string[] {
    const { authorization, binding, access } = readServiceExecution(this, execution);
    const { configuration } = readServiceAuthorization(authorization, binding);
    const schema = configuration.permissionSchema as Record<string, unknown> | undefined;
    const globalPermissions = getAuthorizationPermissions(authorization, binding);
    return [
      '_id',
      ...Object.keys(schema ?? {}).filter(
        (path) =>
          classifyEffectiveFieldAuthorization({
            path,
            rules: extractOutputFieldRules(schema, path, access.outputAccess),
            globalPermissions,
            modelPermissionPrefix: configuration.modelPermissionPrefix as string,
          }) === 'granted',
      ),
    ];
  }

  /** One output stage per row, independent of metadata and of pre-write admission. */
  private async finalizeDirectOutput(args: {
    doc: unknown;
    plan: VirtualProjectionPlan;
    context: ModelHookContext;
    includePermissions?: boolean;
    includeFieldPermissions?: boolean;
    sharedGate?: SharedHookGate;
    privateAssociationField?: string;
  }): Promise<{ data: Record<string, unknown>; context: ServiceOutputContext }> {
    const { plan, context } = args;
    const { authorization, authorizationBinding: binding } = plan;
    const { access, configuration } = readServiceAuthorization(authorization!, binding!);
    const source = getIncludeSource(args.doc);
    const snapshot = isolateDocForOutput(source) as Record<string, unknown>;
    // Hydrated parents can contain package-finalized target DTOs. Transfer each
    // child explicitly while making the plain projected input for this stage.
    for (const key of Object.keys(snapshot))
      transferDocumentAuthorizationGraph(getDocValue(source as never, key), snapshot[key]);
    // Nested includes have consumed this fetch-only input. Their produced output
    // is held separately, so cleanup cannot remove an attachment reusing the FK.
    if (args.privateAssociationField) unsetDocPath(snapshot, args.privateAssociationField);
    const gate = this.hookGate;
    const handle = await resolveOutputDocumentAuthorization({
      authorization: authorization!,
      binding: binding!,
      snapshot,
      context,
    });
    const { stage, grants } = readDocumentAuthorization(handle, binding!);
    context.docPermissions = deepIsolateValue(grants);
    let finalizedContext!: ServiceOutputContext;
    const finalized = await finalizeModelOutput({
      receivingModelName: this.modelName,
      input: snapshot,
      plan,
      snapshot: configuration as FinalizeSnapshot,
      virtualAccess: access.virtualAccess,
      outputAccess: access.outputAccess,
      docPermissionsAccess: access.docPermissionsAccess,
      request: this.req,
      context,
      operation: access.operation,
      documentAuthorizationStage: stage,
      virtualPopulateRow: getVirtualPopulateRow(getIncludeOriginal(args.doc) as object),
      sharedGate: gate,
      concurrencyLimit: this.getVirtualHookConcurrencyLimit(),
      onFinalized: (_output, outputContext) => {
        finalizedContext = outputContext;
      },
    });
    // Finish metadata and include attachment on a fresh copy. Never mutate an
    // already-associated output or infer authority from serialized permissions.
    const output = deepIsolateValue(finalized);
    removeGeneratedPermissionsAlias(output);
    const includeOrigins = restoreIncludeOutput(args.doc, output);
    const field = (configuration.documentPermissionField as string) ?? '_permissions';
    unsetDocPath(output, field);
    if (!configuration.stripPermissionsField) {
      set(output, field, args.includePermissions || args.includeFieldPermissions ? deepIsolateValue(grants) : {});
      if (args.includeFieldPermissions && !configuration.disableFieldPermissions) {
        const rowAccess =
          this.asServiceHookContext(context).fieldPermissionAccess ??
          (await this.getFieldPermissionAccess([snapshot._id]));
        const id = String(snapshot._id);
        const views = rowAccess.readIds?.has(id) ? await requestOutputFieldPaths(handle, binding!, 'read') : [];
        const edits = rowAccess.updateIds?.has(id) ? await requestOutputFieldPaths(handle, binding!, 'update') : [];
        const map = (paths: string[]) =>
          paths.length ? Object.fromEntries(paths.map((path) => [path, true])) : { $: '_' };
        set(output, `${field}._view`, map(views));
        set(output, `${field}._edit`, map(edits));
      } else if (!args.includePermissions) set(output, field, { _view: { $: '_' }, _edit: { $: '_' } });
      // Use the captured posture, including for suspended calls and related work.
      const exposed = configuration.exposedDocPermissionKeys as string[] | undefined;
      if (exposed) {
        const metadata = get(output, field) as Record<string, unknown>;
        set(
          output,
          field,
          Object.fromEntries(
            Object.entries(metadata).filter(([key]) => key === '_view' || key === '_edit' || exposed.includes(key)),
          ),
        );
      }
      attachPermissionsAlias(output, field);
    }
    transferDocumentAuthorizationGraph(finalized, output, includeOrigins);
    return {
      data: output,
      context: createServiceOutputContext(finalizedContext, handle, {
        binding: binding!,
        output,
        outputAccess: access.outputAccess,
        authorization,
        stage,
      }),
    };
  }

  private getEffectiveAllowedSortFields(allowedSortFields: string[]): string[] {
    const extra = this.options?.sortableFields ?? [];
    const merged = extra.length > 0 ? [...allowedSortFields, ...extra] : allowedSortFields;
    // VIRT-04: registered virtuals stay virtual even when `sortableFields`
    // allowlists the same name or its output rule grants visibility. Never
    // send a virtual field to the adapter because output allowed it.
    try {
      const snapshot = this.captureVirtualSnapshot();
      const filtered = excludeVirtualsFromAllowedSortFields(merged, (field) =>
        isVirtualDbPath(field, snapshot as unknown as { virtuals?: Record<string, unknown> | null }),
      );
      // Also exclude top-level virtual leaves that `isVirtualDbPath` covers;
      // keep persisted `sortableFields` grants (e.g. denied-but-sortable).
      return excludeVirtualsFromAllowedFields(
        filtered,
        snapshot as unknown as { virtuals?: Record<string, unknown> | null },
      );
    } catch {
      return merged;
    }
  }

  /**
   * With `requireExplicitSelect`, an omitted client select behaves as an
   * `_id`-only projection, yielding field-less rows. Explicit selects pass
   * through untouched.
   */
  protected resolveEffectiveSelect(select: Projection | undefined): Projection | undefined {
    return this.options?.requireExplicitSelect && select === undefined ? ['_id'] : select;
  }

  /**
   * Capture a coherent virtual snapshot for an operation (VIRT-00A D1/D2,
   * VIRT-01 copy-on-write). Planner and finalizer use this same object for
   * the operation so in-flight descriptor replacement cannot mix versions.
   * Public for VIRT-06 subdocument routes (same coherence per sub op).
   */
  public captureVirtualSnapshot(): FinalizeSnapshot {
    const o = (this.options ?? {}) as Record<string, unknown>;
    return {
      permissionSchema: (o.permissionSchema as Record<string, unknown> | null | undefined) ?? null,
      virtuals: (o.virtuals as Record<string, unknown> | null | undefined) ?? null,
      alwaysSelectFields: (o.alwaysSelectFields as string[] | Record<string, string[]> | null | undefined) ?? null,
      modelPermissionPrefix: (o.modelPermissionPrefix as string | undefined) ?? '',
      requireExplicitSelect: (o.requireExplicitSelect as boolean | undefined) ?? false,
      documentPermissionField: (o.documentPermissionField as string | undefined) ?? '_permissions',
      exposedDocPermissionKeys: o.exposedDocPermissionKeys as string[] | undefined,
      stripPermissionsField: (o.stripPermissionsField as boolean | undefined) ?? false,
      disableFieldPermissions: (o.disableFieldPermissions as boolean | undefined) ?? false,
    };
  }

  public getVirtualGlobalPermissions(): { has: (key: string) => boolean; hasKey: (key: string) => boolean } {
    try {
      const macl = this.requestCore as unknown as {
        getPermissions?: () => { has: (k: string) => boolean; hasKey: (k: string) => boolean };
      };
      const perms = macl?.getPermissions?.();
      if (perms && typeof perms.has === 'function' && typeof perms.hasKey === 'function') return perms;
      if (perms && typeof (perms as { has?: unknown }).has === 'function') {
        return perms as { has: (key: string) => boolean; hasKey: (key: string) => boolean };
      }
    } catch {
      // fall through to deny-all for planning (finalizer re-evaluates with real grants)
    }
    return { has: () => false, hasKey: () => false };
  }

  public getVirtualHookConcurrencyLimit(): number {
    return this.hookGate.limit;
  }

  /**
   * VIRT-06 internal accessors for dedicated subdocument routes.
   * `model-subdocument-service` uses these instead of reaching into
   * protected `req`/`modelName`/`model`, preserving raw docs for
   * persistence (never substituting trimmed DTOs) and keeping request
   * ownership inside `Service`.
   */
  public getServiceRequest(): ModelRequest {
    return this.req;
  }

  public getServiceModelName(): string {
    return this.modelName;
  }

  public getServiceMongooseModel(): unknown {
    try {
      return (this.model as { mongooseModel?: unknown }).mongooseModel;
    } catch {
      return undefined;
    }
  }

  /**
   * VIRT-06 owning-parent internal grants (VIRT-00A D2).
   *
   * Dedicated subdocument routes reuse the owning parent's internally
   * computed `read` grants with scoped `permissionSchema.<field>.sub` rules;
   * v1 adds NO independent embedded `docPermissions` hook family. `operation`
   * stays the initiating sub op (`subList`/`subRead`/`subCreate`/`subUpdate`/
   * `subBulkUpdate`) for logs, while `docPermissionsAccess` is `read`.
   * Never throws: hook failure yields `{}` (fail-closed downstream).
   */
  public async getSubParentGrants(parentDoc: unknown, operation: string): Promise<Record<string, unknown>> {
    const mongooseModel = this.getServiceMongooseModel();
    const context: ModelHookContext = {
      mongooseModel: mongooseModel as never,
      modelName: this.modelName,
      operation,
      resolvedQuery: {},
    };
    try {
      const grants = (await this.genDocPermissions(parentDoc, 'read', context)) as unknown;
      if (grants != null && typeof grants === 'object' && !Array.isArray(grants)) {
        return grants as Record<string, unknown>;
      }
    } catch {
      // fail-closed below
    }
    return {};
  }

  /**
   * VIRT-06 bounded sub-row finalization (VIRT-00A D7, VIRT-03 strategy).
   *
   * Finalizes already-filtered (visible-only) sub rows through the shared
   * boundary with scope ` [sub,'sub']`, owning-parent `read` grants, and
   * scoped rules. Children (deeper nested + related via `related`) finalize
   * before sub getters; argument one has finalized public children. Declared
   * private populated inputs travel separately in argument four.
   * Uses a bounded row map + request/runtime hook-chain admission (stable
   * order, limit-one reentry, no persistence permits held). Waiting ancestor
   * callback frames do not consume extra permits. Callers must filter rows BEFORE
   * calling; hidden rows never reach getters. Never mutates inputs.
   */
  public async finalizeSubRowsWithVirtuals(args: {
    sub: string;
    rows: unknown[];
    plan: VirtualProjectionPlan;
    snapshot: FinalizeSnapshot;
    parentGrants: Record<string, unknown>;
    virtualAccess: VirtualOperationAccess;
    outputAccess: VirtualOperationAccess;
    docPermissionsAccess: VirtualOperationAccess;
    operation: string;
    related?: import('../output/finalize-model-output').FinalizeRelatedTarget[];
  }): Promise<Record<string, unknown>[]> {
    const {
      sub,
      rows,
      plan,
      snapshot,
      parentGrants,
      virtualAccess,
      outputAccess,
      docPermissionsAccess,
      operation,
      related,
    } = args;
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const hookLimit = this.getVirtualHookConcurrencyLimit();
    const gate = this.hookGate;
    const mongooseModel = this.getServiceMongooseModel();
    const { finalizeModelOutputs } = await import('../output/finalize-model-output');
    return finalizeModelOutputs({
      receivingModelName: this.modelName,
      inputs: rows,
      virtualAccess,
      outputAccess,
      docPermissionsAccess,
      scopePath: [sub, 'sub'],
      plan,
      snapshot,
      request: this.req as unknown as never,
      context: {
        mongooseModel: mongooseModel as never,
        modelName: this.modelName,
        operation,
        resolvedQuery: {},
      } as ModelHookContext,
      operation,
      docPermissions: parentGrants ?? {},
      concurrencyLimit: hookLimit,
      sharedGate: gate,
      ...(related ? { related } : {}),
    });
  }

  /**
   * VIRT-06 single sub-row finalization (same boundary/bounds as list).
   * Returns `null` when input is nullish (caller maps to `null` for
   * denied-post-persist single visibility, never a retryable error).
   */
  public async finalizeSingleSubRowWithVirtuals(args: {
    sub: string;
    row: unknown;
    plan: VirtualProjectionPlan;
    snapshot: FinalizeSnapshot;
    parentGrants: Record<string, unknown>;
    virtualAccess: VirtualOperationAccess;
    outputAccess: VirtualOperationAccess;
    docPermissionsAccess: VirtualOperationAccess;
    operation: string;
    related?: import('../output/finalize-model-output').FinalizeRelatedTarget[];
  }): Promise<Record<string, unknown> | null> {
    const { row } = args;
    if (row === null || row === undefined) return null;
    const outs = await this.finalizeSubRowsWithVirtuals({ ...args, rows: [row] });
    return outs[0] ?? null;
  }

  /**
   * VIRT-06 populate finalization for sub parents (VIRT-05 path).
   *
   * After Mongoose `populate` resolves on the raw parent (e.g.
   * `contacts.friend` via `genSubPopulate`), finalize each actual target
   * with its own plan/context before sub getters. Handles null/scalar/array
   * + dotted through embedded arrays; trims even without virtuals. Bounded
   * via shared gate; limit-1 completes. No-op when no entries.
   */
  public async finalizePopulateForSubParent(
    parentDoc: unknown,
    populateEntries: Populate[],
    parentOperation: string,
    hookLimit?: number,
    sharedGate?: SharedHookGate,
  ): Promise<void> {
    if (!parentDoc || !Array.isArray(populateEntries) || populateEntries.length === 0) return;
    const gate = this.hookGate;
    const limit = gate.limit;
    const mongooseModel = this.getServiceMongooseModel();
    const parentContext: ModelHookContext = {
      mongooseModel: mongooseModel as never,
      modelName: this.modelName,
      operation: parentOperation,
      resolvedQuery: {},
    };
    await this.finalizePopulateForSingleDoc(parentDoc, populateEntries, parentContext, parentOperation, limit, gate);
  }

  private filterAllowedFieldsForVirtuals(allowedFields: string[], snapshot: FinalizeSnapshot): string[] {
    return excludeVirtualsFromAllowedFields(
      allowedFields,
      snapshot as unknown as { virtuals?: Record<string, unknown> | null },
    );
  }

  private stripVirtualsFromFilterForSnapshot<T>(filter: T, snapshot: FinalizeSnapshot): T {
    return stripVirtualKeysFromFilter(filter, snapshot as unknown as { virtuals?: Record<string, unknown> | null });
  }

  /**
   * VIRT-05 populate + association helpers.
   *
   * - Populate targets finalize with their own plan/context before parent
   *   getters (target trimming even without virtuals). Handles null, scalar
   *   IDs when population is skipped, arrays, and dotted paths through
   *   embedded arrays (e.g. `contacts.friend`). One evaluation per logical
   *   target output, no in-place mutation of shared/cached instances (targets
   *   are replaced, never mutated; include parents use detached source views),
   *   isolated copies per parent,
   *   bounded via the shared `SharedHookGate` + `mapWithConcurrencyLimit`
   *   (no unbounded fan-out, limit-1 completes, no persistence permits held).
   * - Association transport stays service-only (symbols, outside serializers
   *   and finalized output input): `find` fetches `foreignField` fetch-only,
   *   captures immutable values before trim, and returns them aligned to rows.
   */
  private getAssociationFieldFromOptions(options: unknown): string | undefined {
    try {
      const field = (options as Record<symbol, unknown>)[VIRT_ASSOCIATION_FIELD] as unknown;
      if (typeof field === 'string' && field.length > 0) return field;
    } catch {
      // ignore
    }
    return undefined;
  }

  private buildDbSelectForAssociation(finalSelect: string[], associationField?: string): string[] {
    // DB fetches always retain `_id` for policy/association work; output
    // `-_id` is honored independently by the finalizer (`outputIdExcluded`).
    // Stripping `-_id` here never changes output (finalizer still strips)
    // but guarantees join keys survive when output excludes `_id`.
    const dbSelect = finalSelect.filter((t) => t !== '-_id');
    if (!dbSelect.includes('_id')) dbSelect.push('_id');
    if (associationField && typeof associationField === 'string' && associationField.length > 0) {
      if (!dbSelect.includes(associationField)) dbSelect.push(associationField);
    }
    return compactPersistedProjection(dbSelect);
  }

  private captureAssociationValues(docs: unknown[], associationField: string): unknown[] {
    return docs.map((doc) => {
      try {
        const plain = toObject(doc) as Record<string, unknown>;
        const val = get(plain as object, associationField);
        return deepIsolateValue(val);
      } catch {
        return undefined;
      }
    });
  }

  protected captureRelated(
    args?: { populate?: unknown; include?: unknown },
    defaults?: { populate?: unknown; include?: unknown },
  ): import('../acl/service-authorization').AuthorizationRelatedTarget[] {
    const globalOptions = modelServiceGlobalOptions(this, this.requestRuntime);
    const effective = { populate: args?.populate ?? defaults?.populate, include: args?.include ?? defaults?.include };
    if (effective.include) {
      const processed = this.processInclude(effective.include as Include[]);
      effective.include = [...processed.includes, ...processed.correlatedIncludes];
    }
    return captureRelatedTargets(this.requestRuntime, this.modelName, effective, 0, globalOptions);
  }

  /** Canonical population uses the target's retained policy for both fetch and output. */
  private async genExecutionPopulate(
    execution: ServiceExecutionContext,
    access: string,
    populate?: Populate | Populate[] | string | null,
  ): Promise<Populate[]> {
    assertPopulateAccess(access);
    if (!populate) return [];
    const state = readServiceExecution(this, execution);
    const captured = readServiceAuthorization(state.authorization, state.binding);
    const entries = Array.isArray(populate) ? populate : [populate];
    const result: Populate[] = [];
    for (const entry of entries) {
      const descriptor = typeof entry === 'string' ? { path: entry } : entry;
      const targetAccess = descriptor.access || access;
      assertPopulateAccess(targetAccess);
      const sourceState = classifyEffectiveFieldAuthorization({
        path: descriptor.path,
        rules: extractOutputFieldRules(captured.configuration.permissionSchema as never, descriptor.path, targetAccess),
        outputFields: captured.authorization.outputFields,
        globalPermissions: getAuthorizationPermissions(state.authorization, state.binding),
        modelPermissionPrefix: captured.configuration.modelPermissionPrefix as string,
      });
      if (sourceState === 'denied') continue;
      const target = captured.relatedTargets.find((target) => target.path === descriptor.path);
      const modelName = target?.modelName;
      if (!modelName) continue;
      if (target.kind === 'passthrough') {
        result.push({ path: descriptor.path, select: descriptor.select });
        continue;
      }
      const policy = relatedPolicy(state.authorization, state.binding, descriptor.path);
      const svc = this.requestCore.getPublicService(modelName);
      const child = createRelatedExecution(
        svc,
        {
          operation: state.access.operation,
          rowAccess: targetAccess,
          virtualAccess: targetAccess,
          outputAccess: targetAccess,
          docPermissionsAccess: targetAccess,
        },
        state.authorization,
        state.binding,
        descriptor.path,
      );
      if (isExecutionRowDenied(svc, child)) continue;
      const childState = readServiceExecution(svc, child);
      const targetConfiguration = readServiceAuthorization(childState.authorization, childState.binding).configuration;
      if (
        policy?.operation.mode !== 'grant' &&
        !(await this.hookGate.run(() =>
          evaluateRouteGuard(
            this.req,
            getAuthorizationPermissions(childState.authorization, childState.binding),
            getCapturedAuthorizationOption(targetConfiguration, `operationAccess.${targetAccess}`) as never,
          ),
        ))
      )
        continue;
      // Match is a required relationship constraint, even when a transform rewrites ordinary input.
      const match = (descriptor.match ?? {}) as Filter;
      const query = await prepareModelQuery(svc, child, { kind: 'client-read', filter: match }, {}, true);
      const filter = readPreparedModelQuery(svc, child, query).filter;
      if (filter === false) continue;
      const plan = planAuthorizedModelProjection({
        authorization: childState.authorization,
        binding: childState.binding,
        requestedSelect: descriptor.select,
      });
      const ret: Populate = { path: descriptor.path, select: [...plan.persistedFetchSelection], match: filter };
      setPopulateTargetMeta(ret, {
        targetModelName: modelName,
        virtualAccess: targetAccess,
        outputAccess: targetAccess,
        docPermissionsAccess: targetAccess,
        requestedSelect: descriptor.select,
        plan,
        snapshot: readServiceAuthorization(childState.authorization, childState.binding)
          .configuration as FinalizeSnapshot,
        fetchBinding: {
          runtime: this.requestRuntime,
          model: childState.binding.model as never,
          schema: (childState.binding.model as import('mongoose').Model<unknown>).schema,
          configuration: targetConfiguration,
          requestRead:
            targetAccess === 'read' &&
            policy?.operation.mode !== 'grant' &&
            readServiceAuthorization(childState.authorization, childState.binding).authorization.rows.mode ===
              'request',
          staticObjectIdReference: captured.relatedTargets.find((target) => target.path === descriptor.path)
            ?.staticObjectIdReference,
        },
      });
      result.push(ret);
    }
    return result;
  }

  private isScalarPopulateValue(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'bigint' ||
      typeof value === 'boolean'
    )
      return true;
    const record = value as Record<string, unknown>;
    if (typeof record._bsontype === 'string') return true;
    return false;
  }

  private async finalizeSinglePopulateTarget(
    rawTarget: unknown,
    meta: PopulateTargetMeta,
    parentOperation: string,
    parentContext: ModelHookContext,
    hookLimit: number,
    sharedGate: SharedHookGate,
    originalTarget: unknown = rawTarget,
  ): Promise<unknown> {
    if (rawTarget === null || rawTarget === undefined) return rawTarget;
    if (this.isScalarPopulateValue(rawTarget)) return rawTarget;
    // Only documents/plain objects finalize; primitives pass through.
    const isDoc = (() => {
      try {
        if (isPlainObject(rawTarget)) return true;
        // Hydrated Mongoose documents (including populated subdocs).
        const maybe = rawTarget as { _doc?: unknown; toObject?: unknown };
        if (maybe && typeof maybe === 'object' && '_doc' in maybe) return true;
        if (maybe && typeof maybe.toObject === 'function') return true;
      } catch {
        return false;
      }
      return false;
    })();
    if (!isDoc) return rawTarget;
    let cache = this.populateOutputCache.get(meta);
    if (!cache) {
      cache = new WeakMap();
      this.populateOutputCache.set(meta, cache);
    }
    // Include source copies retain the actual fetched target identity for cache
    // reuse. Never infer this identity from IDs/values or finalize the original.
    const originalKey = originalTarget && typeof originalTarget === 'object' ? originalTarget : (rawTarget as object);
    const cacheKey = getVirtualPopulatePublicIdentity(originalKey) ?? originalKey;
    const existing = cache.get(cacheKey);
    if (existing) {
      const source = await existing;
      const copy = deepIsolateValue(source);
      transferDocumentAuthorizationGraph(source, copy);
      return copy;
    }
    let targetMongooseModel: unknown = meta.fetchBinding?.model;
    if (!targetMongooseModel) {
      // Legacy helper descriptors have no execution binding. Canonical output
      // always keeps the admitted model rather than rereading a live registry.
      try {
        targetMongooseModel = this.requestRuntime.getModelInstance(meta.targetModelName);
      } catch {
        targetMongooseModel = parentContext.mongooseModel;
      }
    }
    const targetContext: ModelHookContext = {
      mongooseModel: (targetMongooseModel as never) ?? parentContext.mongooseModel,
      modelName: meta.targetModelName,
      operation: parentContext.operation ?? parentOperation,
      resolvedQuery: parentContext.resolvedQuery ?? {},
    };
    const pending = finalizeModelOutput({
      receivingModelName: meta.targetModelName,
      input: rawTarget,
      virtualAccess: meta.virtualAccess,
      outputAccess: meta.outputAccess,
      docPermissionsAccess: meta.docPermissionsAccess,
      scopePath: [],
      plan: meta.plan,
      snapshot: meta.snapshot,
      request: this.req as unknown as never,
      context: targetContext,
      operation: (parentContext.operation as string) ?? parentOperation,
      docPermissions: undefined,
      concurrencyLimit: hookLimit,
      sharedGate,
      virtualPopulateRow: getVirtualPopulateRow(originalKey) ?? getVirtualPopulateRow(rawTarget as object),
    });
    cache.set(cacheKey, pending);
    const finalized = await pending;
    const copy = deepIsolateValue(finalized);
    transferDocumentAuthorizationGraph(finalized, copy);
    return copy;
  }

  private readonly populateOutputCache = new WeakMap<PopulateTargetMeta, WeakMap<object, Promise<unknown>>>();

  private async finalizePopulatePath(
    current: unknown,
    segments: string[],
    segIdx: number,
    meta: PopulateTargetMeta,
    parentOperation: string,
    parentContext: ModelHookContext,
    hookLimit: number,
    sharedGate: SharedHookGate,
    original: unknown = current,
  ): Promise<void> {
    if (current === null || current === undefined) return;
    if (Array.isArray(current)) {
      for (const [index, el] of current.entries()) {
        await this.finalizePopulatePath(
          el,
          segments,
          segIdx,
          meta,
          parentOperation,
          parentContext,
          hookLimit,
          sharedGate,
          Array.isArray(original) ? original[index] : undefined,
        );
      }
      return;
    }
    if (typeof current !== 'object') return;
    if (segIdx >= segments.length) return;
    const key = segments[segIdx];
    let child: unknown;
    let originalChild: unknown;
    try {
      child = getDocValue(current as never, key);
      if (child === undefined) {
        try {
          child = get(current as object, key);
        } catch {
          return;
        }
      }
      originalChild = original === current ? child : getDocValue(original as never, key);
    } catch {
      return;
    }
    if (child === undefined || child === null) {
      // Null at leaf is a populate miss (stays null); null intermediate ends traversal.
      return;
    }
    if (segIdx === segments.length - 1) {
      // Leaf: finalize target doc(s), leave scalars untouched.
      if (Array.isArray(child)) {
        const out: unknown[] = [];
        for (const [index, el] of child.entries()) {
          if (el === null || el === undefined || this.isScalarPopulateValue(el)) {
            out.push(el);
            continue;
          }
          out.push(
            await this.finalizeSinglePopulateTarget(
              el,
              meta,
              parentOperation,
              parentContext,
              hookLimit,
              sharedGate,
              Array.isArray(originalChild) ? originalChild[index] : undefined,
            ),
          );
        }
        try {
          setDocValue(current as never, key, out);
        } catch {
          // leave unchanged on path errors
        }
      } else {
        if (this.isScalarPopulateValue(child)) return;
        const finalized = await this.finalizeSinglePopulateTarget(
          child,
          meta,
          parentOperation,
          parentContext,
          hookLimit,
          sharedGate,
          originalChild,
        );
        try {
          setDocValue(current as never, key, finalized);
        } catch {
          // leave unchanged
        }
      }
    } else {
      await this.finalizePopulatePath(
        child,
        segments,
        segIdx + 1,
        meta,
        parentOperation,
        parentContext,
        hookLimit,
        sharedGate,
        originalChild,
      );
    }
  }

  private async finalizePopulateForSingleDoc(
    doc: unknown,
    populateEntries: Populate[],
    parentContext: ModelHookContext,
    parentOperation: string,
    hookLimit: number,
    sharedGate: SharedHookGate,
  ): Promise<void> {
    if (!doc || !Array.isArray(populateEntries) || populateEntries.length === 0) return;
    for (const entry of populateEntries) {
      if (!entry || typeof (entry as Populate).path !== 'string') continue;
      const meta = getPopulateTargetMeta(entry);
      // Registered targets retain their plan at admission. Unregistered targets
      // follow the configured `requireRegisteredPopulateModels: false` passthrough.
      if (!meta) continue;
      const segments = (entry as Populate).path.split('.').filter(Boolean);
      if (segments.length === 0) continue;
      await this.finalizePopulatePath(
        getIncludeSource(doc),
        segments,
        0,
        meta,
        parentOperation,
        parentContext,
        hookLimit,
        sharedGate,
        getIncludeOriginal(doc),
      );
    }
  }

  private beginOp(
    op: string,
    filter: unknown,
    extra?: Omit<OpLogContext, 'op' | 'startedAt' | 'filterKeyValueCount'>,
  ): number {
    const startedAt = Date.now();
    debugLog({
      op,
      modelName: this.modelName,
      filterKeyValueCount: summarizeFilter(filter).filterKeyValueCount,
      startedAt,
      ...(extra ?? {}),
    } as OpLogContext);
    return startedAt;
  }

  private completeOp(
    op: string,
    startedAt: number,
    resultCode: string | number,
    filter: unknown,
    extra?: Omit<OpLogContext, 'op' | 'startedAt' | 'durationMs' | 'resultCode' | 'filterKeyValueCount'>,
  ): void {
    debugLog({
      op,
      modelName: this.modelName,
      filterKeyValueCount: summarizeFilter(filter).filterKeyValueCount,
      durationMs: Date.now() - startedAt,
      resultCode,
      ...(extra ?? {}),
    } as OpLogContext);
  }

  constructor(req: ModelRequest, modelName: string) {
    super(req, modelName);

    this.model = admitModelPersistence(this.createModelAdapter(modelName), this.getCorrelatedExecState().scheduler);
    registerSubdocumentPopulateExecutor(
      this,
      (execution, populate) => this.genExecutionPopulate(execution, 'read', populate),
      this.requestCore,
    );
    this.baseFields = ['_id'];
    registerServiceExecutors(this, {
      binding: () => ({
        request: this.req,
        runtime: this.requestRuntime,
        model: this.model.mongooseModel,
        modelName: this.modelName,
      }),
      configuration: () =>
        this.requestRuntime.getModelInstance(this.modelName)
          ? captureModelAuthorizationConfiguration(
              this.requestRuntime,
              this.modelName,
              { ...this.options, defaults: this.defaults },
              modelServiceGlobalOptions(this, this.requestRuntime),
            )
          : { catalog: { paths: [] }, ...this.options },
      permissions: () => this.requestCore.getPermissions?.() ?? new Permission({}),
      parse: (filter) => this.parseClientData(filter, this.getCorrelatedExecState().scheduler),
      validate: (filter, expanded) => {
        const errors = expanded
          ? validateExpandedCorrelatedOperands(filter, this.getRequestComplexity()).map((e) => e.detail)
          : this.validateClientFilter(filter);
        if (errors.length) this.throwClientRequestError(Codes.BadRequest, errors[0]);
      },
      strip: (execution, filter) => {
        const state = readServiceExecution(this, execution);
        const { configuration } = readServiceAuthorization(state.authorization, state.binding);
        return stripVirtualKeysFromFilter(filter, configuration as { virtuals?: Record<string, unknown> });
      },
      identifier: (id) => this.genIDFilter(id),
      authorize: (execution, filter) => {
        const state = readServiceExecution(this, execution);
        return resolveAuthorizedAccessFilter(this.requestCore, state.authorization, state.binding, filter, () =>
          this.genFilter(state.access.rowAccess as BaseFilterAccess, filter),
        ) as Promise<{ transformed: Filter<TModel>; scope: Filter<TModel>; filter: Filter<TModel> }>;
      },
      findOne: (execution, filter, args, options) => this.findOnePrepared(execution, filter, args, options),
      find: (execution, query, filter, args, options, decorate) =>
        this.findPrepared(execution, query, filter, args, options, decorate),
      updateOne: (execution, filter, data, args, options, decorate) =>
        this.updateOnePrepared(execution, filter, data, args, options, decorate),
      create: (execution, data, args, options, decorate) =>
        this.createPrepared(execution, data, args, options, decorate),
      exists: async (filter, includeId) => {
        const result = await this.model.exists(filter);
        return {
          success: true,
          kind: 'single',
          code: Codes.Success,
          data: includeId ? result : !!result,
          query: { filter },
        };
      },
      count: async (filter) => ({
        success: true,
        kind: 'single',
        code: Codes.Success,
        data: await this.model.countDocuments(filter),
        query: { filter },
      }),
      groupedCount: (filter, field, input) => this.countPreparedByFieldValueGroups(field, input, filter),
      subdocumentVisibility: ({ filter, select, populate }) =>
        this.model.findOne({ filter, select, populate, lean: true }),
    });
  }

  public async findOne(
    filter: Filter<TModel>,
    args?: FindOneArgs<TModel>,
    options?: FindOneOptions<TModel, TVirtuals>,
  ): Promise<AuthorizedSingleResult<TModel> | ErrorResult> {
    try {
      this.admitServiceCall(args, options);
      const intent = captureModelServiceIntent(this, 'findOne', args, options);
      const access = intent.options.access!;
      const execution = withExecutionQueryIntent(
        this,
        createServiceExecution(
          this,
          {
            operation: 'read',
            rowAccess: access,
            virtualAccess: access,
            outputAccess: access,
            docPermissionsAccess: access,
          },
          options?.authorization,
          'service',
          this.captureRelated(intent.args),
        ),
        intent,
      );
      const query = await prepareModelQuery(this, execution, { kind: 'client-read', filter });
      return await executePreparedFindOne(this, execution, query, args, options);
    } catch (error) {
      const result = this.getClientRequestErrorResult(error);
      if (result) return result;
      throw error;
    }
  }

  private async findOnePrepared(
    execution: ServiceExecutionContext,
    filter: Filter<TModel>,
    args?: FindOneArgs<TModel>,
    options?: FindOneOptions<TModel, TVirtuals>,
  ): Promise<AuthorizedSingleResult<TModel> | ErrorResult> {
    if (filter === false) return { success: false, kind: 'error', code: Codes.Forbidden, query: { filter } };

    const state = readServiceExecution(this, execution);
    const intent = this.preparedOutputIntent(execution, 'findOne', args, options);
    const { select: requestedSelect, sort, populate, include } = intent.args;
    const { includePermissions, includeFieldPermissions, populateAccess } = intent.options;
    const access = state.access.rowAccess!;
    const virtualSnapshot = readServiceAuthorization(state.authorization, state.binding)
      .configuration as FinalizeSnapshot;

    let processedInclude: ReturnType<typeof this.processInclude>;
    try {
      processedInclude = this.processInclude(include, state.authorization);
    } catch (error) {
      const result = this.getClientRequestErrorResult(error);
      if (result) return result;
      throw error;
    }

    const queryParts = await Promise.all([
      filter,
      this.genExecutionPopulate(execution, populateAccess || access, populate),
      this.requestSortFields(execution),
    ]).catch((error: unknown) => {
      const result = this.getClientRequestErrorResult(error);
      if (result) return result;
      throw error;
    });
    if (!Array.isArray(queryParts)) return queryParts;
    const [_filter, _populate, allowedSortFields] = queryParts;

    const { includes, correlatedIncludes, includeLocalFields, correlatedReferenceFields } = processedInclude;
    // VIRT-04: plan fetch vs output (VIRT-02) with effective accesses.
    // `access` is effective (`read` or `list` fallback); `operation` stays
    // initiating (`read`) per VIRT-00A D1.
    const virtualPlan = this.executionOutputPlan(execution, requestedSelect, {
      baseFields: ['_id'],
      joinFields: [...includeLocalFields, ...correlatedReferenceFields],
    });
    // One retained plan owns fetch selection; no legacy genSelect union.
    const finalSelect = virtualPlan.persistedFetchSelection;
    // VIRT-05: private association transport needs `_id`/FK in DB even when
    // output excludes them. `finalSelect` stays reporting-accurate (may hold
    // `-_id`); `dbSelect` strips it for the actual fetch (output `-_id` is
    // still honored by the finalizer independently).
    const findOneAssociationField = this.getAssociationFieldFromOptions(options);
    const dbSelect = this.buildDbSelectForAssociation(finalSelect, findOneAssociationField);

    // VIRT-04: allowed sort excludes virtuals even when output grants them.
    const rawAllowed = this.filterAllowedFieldsForVirtuals(allowedSortFields, virtualSnapshot);
    const effectiveAllowedSortFields = this.getEffectiveAllowedSortFields(rawAllowed);
    const stripDisallowedSort = this.options?.stripDisallowedSort ?? false;
    const sanitizedSort = stripDisallowedSort ? sanitizeSortFields(sort, effectiveAllowedSortFields) : null;
    const effectiveSort = stripDisallowedSort ? (sanitizedSort?.sort as typeof sort) : sort;

    const query = {
      filter: _filter,
      select: dbSelect,
      sort: effectiveSort,
      populate: _populate,
    };

    const startedAt = this.beginOp('findOne', _filter, {
      sort: effectiveSort,
      selectCount: finalSelect.length,
      populateCount: Array.isArray(_populate) ? _populate.length : _populate ? 1 : 0,
    });

    if (_filter === false) {
      this.completeOp('findOne', startedAt, Codes.Forbidden, _filter);
      return { success: false, kind: 'error', code: Codes.Forbidden, query };
    }

    if (stripDisallowedSort) {
      // Disallowed keys already omitted from effectiveSort; malformed syntax still fails.
      if (sanitizedSort && sanitizedSort.errors.length > 0) {
        this.completeOp('findOne', startedAt, Codes.BadRequest, _filter);
        return { success: false, kind: 'error', code: Codes.BadRequest, errors: sanitizedSort.errors, query };
      }
    } else {
      const sortErrors = validateSortFields(sort, effectiveAllowedSortFields);
      if (sortErrors.length > 0) {
        this.completeOp('findOne', startedAt, Codes.BadRequest, _filter);
        return { success: false, kind: 'error', code: Codes.BadRequest, errors: sortErrors, query };
      }
    }

    const population = planVirtualPopulateQuery(virtualPlan, _populate);
    let doc = await this.model.findOne({
      ...query,
      populate: population.queryPopulate,
      select: dbSelect,
      lean: state.hydration === 'lean',
    });
    if (!doc) {
      this.completeOp('findOne', startedAt, Codes.NotFound, _filter);
      return { success: false, kind: 'error', code: Codes.NotFound, query };
    }
    if (population.requiresCapture)
      [doc] = await this.loadOutputPopulateDependencies(
        execution,
        [doc],
        virtualPlan,
        population.publicPopulate,
        _populate,
        undefined,
        findOneAssociationField ? [findOneAssociationField] : [],
      );

    const context: ModelHookContext = {
      mongooseModel: this.model.mongooseModel,
      modelName: this.modelName,
      // VIRT-00A D1: operation stays initiating (`read`), never the
      // fallback/effective visibility. Effective accesses carry `access`.
      operation: state.access.operation,
      originalDocumentSnapshot: toObject(doc),
      resolvedQuery: query,
    };

    // Stable snapshot for correlated references (ACI-01 D7.3): fetched from
    // persistence including internal-only reference fields, before legacy
    // include attachment, decorate, and task mutation.
    const correlatedSnapshots = [cloneDeep(toObject(doc))];

    try {
      doc = await this.includeDocs(doc, includes, state.authorization);
      if (correlatedIncludes.length > 0) {
        [doc] = await this.includeCorrelatedDocs(
          [doc],
          correlatedIncludes,
          correlatedSnapshots,
          0,
          state.authorization,
        );
      }
    } catch (error) {
      const result = this.getClientRequestErrorResult(error);
      if (result) {
        this.completeOp('findOne', startedAt, result.code, _filter);
        return { ...result, query };
      }
      throw error;
    }

    // VIRT-05: finalize populate targets with their own plans before parent
    // getters (target trimming even without virtuals; null/scalar/array +
    // dotted through embedded arrays; one evaluation per output, isolated
    // copies, bounded via shared gate). Parent grants above stay raw;
    // snapshots were already cloned pre-attachment.
    const findOneHookLimit = this.getVirtualHookConcurrencyLimit();
    const findOneGate = this.hookGate;
    if (Array.isArray(_populate) && _populate.length > 0) {
      try {
        await this.finalizePopulateForSingleDoc(
          doc,
          _populate as Populate[],
          context,
          'read',
          findOneHookLimit,
          findOneGate,
        );
      } catch (error) {
        const result = this.getClientRequestErrorResult(error);
        if (result) {
          this.completeOp('findOne', startedAt, result.code, _filter);
          return { ...result, query };
        }
        throw error;
      }
    }
    let output: Awaited<ReturnType<Service<TModel, TVirtuals>['finalizeDirectOutput']>>;
    try {
      output = await this.finalizeDirectOutput({
        doc,
        plan: virtualPlan,
        context,
        includePermissions,
        includeFieldPermissions,
        sharedGate: findOneGate,
      });
    } catch (error) {
      const result = this.getClientRequestErrorResult(error);
      if (result) {
        this.completeOp('findOne', startedAt, result.code, _filter);
        return { ...result, query };
      }
      throw error;
    }
    this.completeOp('findOne', startedAt, Codes.Success, _filter);
    return {
      success: true,
      kind: 'single',
      code: Codes.Success,
      data: output.data as TModel,
      query,
      context: output.context,
    };
  }

  public async findById(
    id: string,
    args?: FindByIdArgs<TModel>,
    options?: FindByIdOptions<TModel, TVirtuals>,
  ): Promise<AuthorizedSingleResult<TModel> | ErrorResult> {
    try {
      this.admitServiceCall(args, options);
      const intent = captureModelServiceIntent(this, 'findById', args, options);
      const { select, populate, include, sort } = intent.args;
      const { skim, includePermissions, includeFieldPermissions, access = 'read', populateAccess } = intent.options;
      const execution = withExecutionQueryIntent(
        this,
        createServiceExecution(
          this,
          {
            operation: 'read',
            rowAccess: access,
            virtualAccess: access,
            outputAccess: access,
            docPermissionsAccess: access,
          },
          options?.authorization,
          'service',
          this.captureRelated(intent.args),
          undefined,
          undefined,
          undefined,
          'findById',
        ),
        intent,
      );
      const filter = readModelIdentifier(this, execution, await resolveModelIdentifier(this, execution, id));
      const query = await prepareModelQuery(this, execution, { kind: 'client-read', filter });
      return await executePreparedFindOne(
        this,
        execution,
        query,
        {
          select,
          populate,
          include,
          sort,
        },
        { skim, includePermissions, includeFieldPermissions, access, populateAccess },
      );
    } catch (error) {
      const result = this.getClientRequestErrorResult(error);
      if (result) return result;
      throw error;
    }
  }

  public async find(
    filter: Filter<TModel>,
    args?: FindArgs<TModel>,
    options?: FindOptions<TModel, TVirtuals>,
    decorate?: ServiceOutputDecorator,
  ): Promise<AuthorizedListResult<TModel> | ErrorResult> {
    try {
      this.admitServiceCall(args, options);
      const intent = captureModelServiceIntent(this, 'find', args, options);
      const execution = withExecutionQueryIntent(
        this,
        createServiceExecution(
          this,
          {
            operation: 'list',
            rowAccess: 'list',
            virtualAccess: 'list',
            outputAccess: 'list',
            docPermissionsAccess: 'list',
          },
          options?.authorization,
          'service',
          this.captureRelated(intent.args),
        ),
        intent,
      );
      const query = await prepareModelQuery(this, execution, { kind: 'client-read', filter });
      return await executePreparedFind(this, execution, query, args, options, decorate);
    } catch (error) {
      const result = this.getClientRequestErrorResult(error);
      if (result) return result;
      throw error;
    }
  }

  private async findPrepared(
    execution: ServiceExecutionContext,
    preparedQuery: PreparedModelQuery,
    filter: Filter<TModel>,
    args?: FindArgs<TModel>,
    options?: FindOptions<TModel, TVirtuals>,
    decorate?: ServiceOutputDecorator,
  ): Promise<AuthorizedListResult<TModel> | ErrorResult> {
    if (filter === false) return { success: false, kind: 'error', code: Codes.Forbidden, query: { filter } };
    const state = readServiceExecution(this, execution);
    const virtualSnapshot = readServiceAuthorization(state.authorization, state.binding)
      .configuration as FinalizeSnapshot;

    const intent = this.preparedOutputIntent(execution, 'find', args, options);
    const { select: requestedSelect, populate, include, sort, skip, limit, page, pageSize } = intent.args;
    const { includePermissions, includeFieldPermissions, includeCount, populateAccess } = intent.options;

    let processedInclude: ReturnType<typeof this.processInclude>;
    try {
      processedInclude = this.processInclude(include, state.authorization);
    } catch (error) {
      const result = this.getClientRequestErrorResult(error);
      if (result) return result;
      throw error;
    }

    const queryParts = await Promise.all([
      filter,
      this.genExecutionPopulate(execution, populateAccess, populate),
      genPagination({ skip, limit, page, pageSize }, this.options.listHardLimit),
      this.requestSortFields(execution),
    ]).catch((error: unknown) => {
      const result = this.getClientRequestErrorResult(error);
      if (result) return result;
      throw error;
    });
    if (!Array.isArray(queryParts)) return queryParts;
    const [_filter, _populate, pagination, rawAllowedSortFields] = queryParts;

    const { includes, correlatedIncludes, includeLocalFields, correlatedReferenceFields } = processedInclude;

    // VIRT-04: fetch vs output planning (VIRT-02) for list/list/list.
    const virtualPlan = this.executionOutputPlan(execution, requestedSelect, {
      baseFields: ['_id'],
      joinFields: [...includeLocalFields, ...correlatedReferenceFields],
    });
    const _select = virtualPlan.outputSelection;
    const finalSelect = virtualPlan.persistedFetchSelection;
    // VIRT-05 association: fetch FK fetch-only even when output omits/denies
    // it or excludes `_id`. `finalSelect` stays reporting-accurate;
    // `dbSelect` strips `-_id` for the actual fetch (output still honored).
    const findAssociationField = this.getAssociationFieldFromOptions(options);
    const withAssocSelect =
      findAssociationField && !finalSelect.includes(findAssociationField)
        ? [...finalSelect, findAssociationField]
        : finalSelect;
    const dbSelect = this.buildDbSelectForAssociation(withAssocSelect, findAssociationField);

    // filter populated fields based on select fields (persisted only; virtuals never populate paths)
    const filteredPopulate =
      isArray(withAssocSelect) && isArray(_populate)
        ? _populate.filter((p) =>
            [
              ...virtualPlan.publicPersistedFetchSelection,
              ...(findAssociationField ? [findAssociationField] : []),
            ].some((field) => field === p.path || field.startsWith(`${p.path}.`) || p.path.startsWith(`${field}.`)),
          )
        : _populate;

    const allowedSortFields = this.filterAllowedFieldsForVirtuals(rawAllowedSortFields, virtualSnapshot);

    const effectiveAllowedSortFields = this.getEffectiveAllowedSortFields(allowedSortFields);
    const stripDisallowedSort = this.options?.stripDisallowedSort ?? false;
    const sanitizedSort = stripDisallowedSort ? sanitizeSortFields(sort, effectiveAllowedSortFields) : null;
    const effectiveSort = stripDisallowedSort ? (sanitizedSort?.sort as typeof sort) : sort;

    const query = {
      filter: _filter,
      select: dbSelect,
      populate: filteredPopulate,
      sort: effectiveSort,
      ...pagination,
    };

    const startedAt = this.beginOp('find', _filter, {
      sort: effectiveSort,
      skip: pagination.skip,
      limit: pagination.limit,
      selectCount: finalSelect.concat(includeLocalFields, correlatedReferenceFields).length,
      populateCount: Array.isArray(filteredPopulate) ? filteredPopulate.length : filteredPopulate ? 1 : 0,
    });

    if (_filter === false) {
      this.completeOp('find', startedAt, Codes.Forbidden, _filter);
      return { success: false, kind: 'error', code: Codes.Forbidden, query };
    }

    if (stripDisallowedSort) {
      // Disallowed keys already omitted from effectiveSort; malformed syntax still fails.
      if (sanitizedSort && sanitizedSort.errors.length > 0) {
        this.completeOp('find', startedAt, Codes.BadRequest, _filter);
        return { success: false, kind: 'error', code: Codes.BadRequest, errors: sanitizedSort.errors, query };
      }
    } else {
      const sortErrors = validateSortFields(sort, effectiveAllowedSortFields);
      if (sortErrors.length > 0) {
        this.completeOp('find', startedAt, Codes.BadRequest, _filter);
        return { success: false, kind: 'error', code: Codes.BadRequest, errors: sortErrors, query };
      }
    }

    const population = planVirtualPopulateQuery(virtualPlan, filteredPopulate);
    let docs = (await this.model.find({
      ...query,
      populate: population.queryPopulate,
      select: dbSelect,
      hardLimit: this.options.listHardLimit,
      lean: state.hydration === 'lean',
    })) as any[];
    if (population.requiresCapture)
      docs = await this.loadOutputPopulateDependencies(
        execution,
        docs,
        virtualPlan,
        population.publicPopulate,
        filteredPopulate,
        undefined,
        findAssociationField ? [findAssociationField] : [],
      );
    // VIRT-05 association capture (before trim/nested): immutable values
    // aligned to rows for the caller's join index.
    const capturedAssociation = findAssociationField
      ? this.captureAssociationValues(docs, findAssociationField)
      : undefined;
    // A foreign field can also be a nested include's local/reference input.
    // Keep it until all nested dispatch has consumed the original snapshots.
    const correlatedSnapshots = docs.map((doc) => cloneDeep(toObject(doc)));
    try {
      docs = await this.includeDocs(docs, includes, state.authorization);
      if (correlatedIncludes.length > 0) {
        docs = (await this.includeCorrelatedDocs(
          docs,
          correlatedIncludes,
          correlatedSnapshots,
          0,
          state.authorization,
        )) as any[];
      }
    } catch (error) {
      const result = this.getClientRequestErrorResult(error);
      if (result) {
        this.completeOp('find', startedAt, result.code, _filter);
        return { ...result, query };
      }
      throw error;
    }
    // VIRT-05 getter isolation: association-only FKs (neither declared as a
    // virtual dependency nor ordinarily selected/allowed) must not leak into
    // target getter input. Strip diagnostic snapshots now; the finalizer strips
    // its own source input independently of produced include attachments,
    // even when they reuse this path. `_id` is always retained for policy work.
    let privateAssociationField: string | undefined;
    if (findAssociationField && findAssociationField !== '_id') {
      try {
        const normalizedRequested = normalizeSelect(_select).map((t) => (t.startsWith('-') ? t.slice(1) : t));
        const overlapsAssociation = (path: string) =>
          path === findAssociationField ||
          path.startsWith(`${findAssociationField}.`) ||
          findAssociationField.startsWith(`${path}.`);
        const isDep = Object.keys(virtualPlan.depProvenance).some(overlapsAssociation);
        const isHookInput = [
          ...resolveAlwaysSelectForAccess(virtualSnapshot.alwaysSelectFields, virtualPlan.outputAccess),
          ...resolveAlwaysSelectForAccess(virtualSnapshot.alwaysSelectFields, virtualPlan.docPermissionsAccess),
        ].some(overlapsAssociation);
        const isSelected = normalizedRequested.includes(findAssociationField);
        if (!isDep && !isHookInput && !isSelected) {
          privateAssociationField = findAssociationField;
          for (const d of correlatedSnapshots) {
            try {
              unsetDocPath(d, findAssociationField);
            } catch {
              // leave unchanged
            }
          }
        }
      } catch {
        // never break fetch on isolation bookkeeping
      }
    }

    const contexts: ModelHookContext[] = correlatedSnapshots.map((doc) => ({
      mongooseModel: this.model.mongooseModel,
      modelName: this.modelName,
      operation: 'list',
      originalDocumentSnapshot: toObject(doc) as Record<string, unknown>,
      resolvedQuery: query,
    }));

    const outputContexts: ServiceOutputContext[] = [];

    const fieldPermissionAccess = includeFieldPermissions
      ? await this.getFieldPermissionAccess(docs.map((doc) => getDocValue(getIncludeSource(doc) as never, '_id')))
      : undefined;

    // Bound row workers per call and hook chains per request/runtime. Preserve
    // input/context indices even when unrelated services interleave. Neither
    // row traversal nor hooks hold a persistence permit.
    const hookLimit = this.getVirtualHookConcurrencyLimit();
    const sharedGate = this.hookGate;
    docs = await mapWithConcurrencyLimit(docs, hookLimit, async (doc, i) => {
      this.asServiceHookContext(contexts[i]).fieldPermissionAccess = fieldPermissionAccess;

      // VIRT-05: target-model finalization before parent getters (own plan/
      // context, trimming even without virtuals). Snapshots above stay raw;
      // grants above stay raw; shared gate bounds peak work.
      if (Array.isArray(filteredPopulate) && filteredPopulate.length > 0) {
        await this.finalizePopulateForSingleDoc(
          doc,
          filteredPopulate as Populate[],
          contexts[i],
          'list',
          hookLimit,
          sharedGate,
        );
      }
      const output = await this.finalizeDirectOutput({
        doc,
        plan: virtualPlan,
        context: contexts[i],
        includePermissions,
        includeFieldPermissions,
        sharedGate,
        privateAssociationField,
      });
      outputContexts[i] = output.context;
      return decorate ? await sharedGate.run(() => decorate(output.data, output.context)) : output.data;
    });

    this.completeOp('find', startedAt, Codes.Success, _filter);
    const listResult = {
      success: true,
      kind: 'list',
      code: Codes.Success,
      data: docs as TModel[],
      count: docs.length,
      totalCount: includeCount
        ? await (async () => {
            const count = await executePreparedCount(this, execution, preparedQuery);
            if (count.kind === 'error') this.throwClientRequestError(count.code, 'Prepared total count failed');
            return count.data;
          })()
        : null,
      query,
      contexts: Object.freeze(outputContexts),
    } as AuthorizedListResult<TModel> & Record<symbol, unknown>;
    // VIRT-05 association metadata (service-only, outside serializers): paired
    // immutable FK values for the caller's join index. Never output-granted.
    if (capturedAssociation) {
      (listResult as Record<symbol, unknown>)[VIRT_ASSOCIATION_VALUES] = capturedAssociation;
    }
    return listResult;
  }

  public async create(
    data: Record<string, unknown> | Record<string, unknown>[],
    args?: CreateArgs,
    options?: CreateOptions<TModel, TVirtuals>,
    decorate?: ServiceOutputDecorator,
  ): Promise<AuthorizedListResult<TModel> | ErrorResult> {
    try {
      this.admitServiceCall(args, options);
      const intent = captureModelServiceIntent(this, 'create', args, options);
      const execution = withExecutionQueryIntent(
        this,
        createServiceExecution(
          this,
          { operation: 'create', virtualAccess: 'create', outputAccess: 'read', docPermissionsAccess: 'create' },
          options?.authorization,
          'create',
          this.captureRelated(intent.args),
        ),
        intent,
      );
      return await executeCreate(this, execution, data, args, options, decorate);
    } catch (error) {
      const result = this.getClientRequestErrorResult(error);
      if (result) return result;
      throw error;
    }
  }

  private async createPrepared(
    execution: ServiceExecutionContext,
    data: Record<string, unknown> | Record<string, unknown>[],
    args?: CreateArgs,
    options?: CreateOptions<TModel, TVirtuals>,
    decorate?: ServiceOutputDecorator,
  ): Promise<AuthorizedListResult<TModel> | ErrorResult> {
    assertModelInputComplexity(data, this.getRequestComplexity());
    const state = readServiceExecution(this, execution);
    const captured = readServiceAuthorization(state.authorization, state.binding);
    const intent = this.preparedOutputIntent(execution, 'create', args, options);
    const { populate, select } = intent.args;
    const { includePermissions, includeFieldPermissions, populateAccess } = intent.options;
    const initiatingOperation = state.access.operation;
    const createPlan = this.executionOutputPlan(execution, select);

    const isArr = Array.isArray(data);
    let dataArr = isArr ? data : [data];
    const { maxBulkItems, maxBulkConcurrency } = this.getRequestComplexity();
    if (dataArr.length > maxBulkItems) {
      return {
        success: false,
        kind: 'error',
        code: Codes.BadRequest,
        errors: [{ detail: `Bulk create exceeds maximum item count of ${maxBulkItems}` }],
      };
    }

    const parseErrors: Array<{ index: number; code: ErrorResult['code']; errors: unknown[] }> = [];
    const parseScheduler = new RequestConcurrencyScheduler(maxBulkConcurrency);
    try {
      const parsedData = await parseScheduler.map(dataArr, async (d, index) => {
        try {
          return await this.parseClientData(d, parseScheduler, true);
        } catch (error) {
          const result = this.getClientRequestErrorResult(error);
          if (!result) throw error;
          parseErrors.push({
            index,
            code: result.code,
            errors: (result.errors ?? []).map((issue) => this.formatBulkValidationIssue(issue, isArr ? index : null)),
          });
          return undefined;
        }
      });

      if (parseErrors.length > 0) {
        const sortedErrors = parseErrors.slice().sort((a, b) => a.index - b.index);
        return {
          success: false,
          kind: 'error',
          code: sortedErrors[0]?.code ?? Codes.BadRequest,
          errors: sortedErrors.flatMap((entry) => entry.errors),
        };
      }

      dataArr = parsedData as Record<string, unknown>[];
    } catch (error) {
      const result = this.getClientRequestErrorResult(error);
      if (result) return result;
      throw error;
    }

    let resolvedPopulate: Populate[];
    try {
      resolvedPopulate = populate ? await this.genExecutionPopulate(execution, populateAccess, populate) : [];
    } catch (error) {
      const result = this.getClientRequestErrorResult(error);
      if (result) return result;
      throw error;
    }

    const contexts: ModelHookContext[] = [];

    // ARF-05: validate every admitted item with bounded concurrency and
    // collect per-item errors in stable input-index order. The previous
    // implementation used a single shared `validationError` and skipped
    // remaining items once any worker failed, which made the winning item
    // nondeterministic under concurrency > 1 and dropped errors from other
    // invalid items.
    const validationErrors: Array<{ index: number; errors: unknown[] }> = [];
    const validationItems = await mapWithConcurrencyLimit(dataArr, maxBulkConcurrency, async (item, index) => {
      const context: ModelHookContext = {
        mongooseModel: this.model.mongooseModel,
        modelName: this.modelName,
        operation: initiatingOperation,
        originalData: item,
        resolvedQuery: resolvedPopulate.length > 0 ? { populate: resolvedPopulate } : {},
      };

      const { allowedFields, allowedData } = admitModelInput({
        data: item,
        requestFields: await requestInputFields({ ...state, access: 'create' }),
        inputFields: captured.authorization.inputFields,
        catalog: captured.configuration.catalog,
      });
      context.allowedFields = allowedFields;
      context.allowedData = allowedData;

      const validated = await this.validate(allowedData, 'create', context);
      if (isBoolean(validated)) {
        if (!validated) {
          validationErrors.push({ index, errors: [] });
          return undefined;
        }
      } else if (isArray(validated)) {
        if (validated.length > 0) {
          validationErrors.push({
            index,
            errors: isArr ? validated.map((issue) => this.formatBulkValidationIssue(issue, index)) : validated,
          });
          return undefined;
        }
      }

      contexts[index] = context;
      return allowedData;
    });

    if (validationErrors.length > 0) {
      const aggregate = validationErrors
        .slice()
        .sort((a, b) => a.index - b.index)
        .flatMap((entry) => entry.errors);

      if (isArr) {
        return { success: false, kind: 'error', code: Codes.BadRequest, errors: aggregate };
      }
      const single = validationErrors[0];
      return {
        success: false,
        kind: 'error',
        code: Codes.BadRequest,
        errors: single?.errors ?? [],
      };
    }

    const items = await mapWithConcurrencyLimit(validationItems, maxBulkConcurrency, async (allowedData, index) => {
      const preparedData = sanitizePreparedInput(
        await this.prepare(allowedData, 'create', contexts[index]),
        captured.configuration.catalog,
      );
      contexts[index].preparedData = preparedData;
      return preparedData;
    });

    const hookLimit = this.getVirtualHookConcurrencyLimit();
    const createGate = this.hookGate;
    const outputContexts: ServiceOutputContext[] = [];

    const createdDocs = (await this.model.create(items)) as Array<ModelDocument<TModel>>;
    const persistedDocs = await mapWithConcurrencyLimit(createdDocs, maxBulkConcurrency, async (doc, index) => {
      contexts[index].currentDocument = doc;
      doc = assertModelDocument<TModel>(
        await this.afterPersist(doc, 'create', contexts[index]),
        this.modelName,
        'afterPersist',
      );
      contexts[index].currentDocument = doc;
      contexts[index].finalDocumentSnapshot = doc.toObject({ virtuals: false }) as Record<string, unknown>;
      return doc;
    });
    const detached = await this.prepareDetachedOutputRows(execution, persistedDocs, createPlan, resolvedPopulate);
    const docs = await mapWithConcurrencyLimit(detached, maxBulkConcurrency, async (doc, index) => {
      // Target-model finalization on detached populated output, before
      // parent getters (own plans/contexts, trimming even without virtuals).
      if (resolvedPopulate.length > 0) {
        await this.finalizePopulateForSingleDoc(
          doc,
          resolvedPopulate as Populate[],
          contexts[index],
          initiatingOperation,
          hookLimit,
          createGate,
        );
      }
      const output = await this.finalizeDirectOutput({
        doc,
        plan: createPlan,
        context: contexts[index],
        includePermissions,
        includeFieldPermissions,
        sharedGate: createGate,
      });
      outputContexts[index] = output.context;
      return decorate ? await createGate.run(() => decorate(output.data, output.context)) : output.data;
    });

    return {
      success: true,
      kind: 'list',
      code: Codes.Created,
      data: docs as TModel[],
      input: items,
      count: docs.length,
      contexts: Object.freeze(outputContexts),
    };
  }

  private formatBulkValidationIssue(issue: unknown, index: number | null) {
    if (!issue || typeof issue !== 'object') {
      return {
        detail: typeof issue === 'string' && issue.length > 0 ? issue : 'Bad Request',
        ...(index === null ? {} : { pointer: `#/${index}` }),
      };
    }

    const typedIssue = issue as { detail?: string; message?: string; pointer?: string; path?: Array<string | number> };
    const detail = typedIssue.detail ?? typedIssue.message ?? 'Bad Request';

    if (index === null) {
      return typedIssue.pointer || typedIssue.path
        ? {
            detail,
            ...(typedIssue.pointer ? { pointer: typedIssue.pointer } : {}),
          }
        : { detail };
    }

    if (typedIssue.pointer?.startsWith('#/')) {
      return { ...typedIssue, detail, pointer: `#/${index}${typedIssue.pointer.slice(1)}` };
    }

    if (typedIssue.path) {
      return { ...typedIssue, detail, pointer: `#/${[index, ...typedIssue.path].join('/')}` };
    }

    return { ...typedIssue, detail, pointer: `#/${index}` };
  }

  public async new(
    args?: NewArgs,
    options?: NewOptions<TModel, TVirtuals>,
  ): Promise<AuthorizedSingleResult<TModel> | ErrorResult> {
    // VIRT-04 new template (VIRT-00A D1/D6): virtualAccess/outputAccess/
    // docPermissionsAccess are all `create`; `operation` stays initiating
    // (`new`). `args.select` CONTINUES to be ignored in v1 (all applicable
    // `create` virtuals considered, subject to explicit exclusion only via
    // future contract change). The previous implementation ignored that
    // argument; VIRT-04 documents the preserved behavior here and applies
    // selected authorized virtuals where required dependencies exist in the
    // default/template values (absent dependency → omit).
    try {
      this.admitServiceCall(args, options);
      const execution = createServiceExecution(
        this,
        { operation: 'new', virtualAccess: 'create', outputAccess: 'create', docPermissionsAccess: 'create' },
        options?.authorization,
        'output',
      );
      const newPlan = this.executionOutputPlan(execution, undefined, {}, true);
      const { includePermissions: requestedPermissions } = options ?? {};
      const includePermissions = this.options.stripPermissionsField ? false : requestedPermissions;
      const data = await this.model.new();

      const newContext: ModelHookContext = {
        mongooseModel: this.model.mongooseModel,
        modelName: this.modelName,
        operation: 'new',
        originalDocumentSnapshot: toObject(data) as Record<string, unknown>,
        resolvedQuery: {},
      };
      const [detached] = await this.prepareDetachedOutputRows(execution, [data], newPlan, []);

      const output = await this.finalizeDirectOutput({
        doc: detached,
        plan: newPlan,
        context: newContext,
        includePermissions,
      });

      return {
        success: true,
        kind: 'single',
        code: Codes.Success,
        data: output.data as TModel,
        context: output.context,
      };
    } catch (error) {
      const result = this.getClientRequestErrorResult(error);
      if (result) return result;
      throw error;
    }
  }

  /**
   * Update at authorized policy paths: admitted leaves preserve omitted siblings;
   * whole-authorized objects/arrays replace. Input grants are additive, independent
   * of output and rows. Descendant array grants patch existing objects by index;
   * only container authority can create/resize/replace arrays. Shared by updateById
   * and existing-row upsert. Validation precedes trusted prepare output; partial
   * prepare containers preserve omissions. Transform retains explicit document-setter
   * replacement authority. Send nested client JSON, not literal dotted update keys.
   */
  public async updateOne(
    filter: Filter<TModel>,
    data: Record<string, unknown>,
    args?: UpdateOneArgs<TModel>,
    options?: UpdateOneOptions<TModel, TVirtuals>,
    decorate?: ServiceOutputDecorator,
  ): Promise<AuthorizedSingleResult<TModel> | ErrorResult> {
    try {
      this.admitServiceCall(args, options);
      const intent = captureModelServiceIntent(this, 'updateOne', args, options);
      const execution = withExecutionQueryIntent(
        this,
        createServiceExecution(
          this,
          {
            operation: 'update',
            rowAccess: 'update',
            virtualAccess: 'update',
            outputAccess: 'read',
            docPermissionsAccess: 'update',
          },
          options?.authorization,
          'mutation',
          this.captureRelated(intent.args),
        ),
        intent,
      );
      const query = await prepareModelQuery(this, execution, { kind: 'mutation-lookup', filter });
      return await executePreparedUpdateOne(this, execution, query, data, args, options, decorate);
    } catch (error) {
      const result = this.getClientRequestErrorResult(error);
      if (result) return result;
      throw error;
    }
  }

  private async updateOnePrepared(
    execution: ServiceExecutionContext,
    filter: Filter<TModel>,
    data: Record<string, unknown>,
    args?: UpdateOneArgs<TModel>,
    options?: UpdateOneOptions<TModel, TVirtuals>,
    decorate?: ServiceOutputDecorator,
  ): Promise<AuthorizedSingleResult<TModel> | ErrorResult> {
    if (filter === false) return { success: false, kind: 'error', code: Codes.Forbidden, query: { filter } };
    assertModelInputComplexity(data, this.getRequestComplexity());

    const state = readServiceExecution(this, execution);
    const captured = readServiceAuthorization(state.authorization, state.binding);
    const intent = this.preparedOutputIntent(execution, 'updateOne', args, options);
    const { populate, select } = intent.args;
    const { includePermissions, includeFieldPermissions, populateAccess } = intent.options;
    const initiatingOperation = state.access.operation;
    const updatePlan = this.executionOutputPlan(execution, select);

    const _filter = filter;
    let _populate: Populate[];
    try {
      _populate = await this.genExecutionPopulate(execution, populateAccess, populate);
    } catch (error) {
      const result = this.getClientRequestErrorResult(error);
      if (result) return result;
      throw error;
    }

    const query = { filter: _filter, populate: _populate };

    const startedAt = this.beginOp('updateOne', _filter, {
      populateCount: Array.isArray(_populate) ? _populate.length : _populate ? 1 : 0,
    });

    if (_filter === false) {
      this.completeOp('updateOne', startedAt, Codes.Forbidden, _filter);
      return { success: false, kind: 'error', code: Codes.Forbidden, query };
    }

    // Preserve the full hydrated write document; positively include schema-hidden
    // output dependencies without substituting an output projection for write input.
    let doc = (await this.model.findOne({
      filter: _filter,
      select: uniq([...updatePlan.persistedFetchSelection, ...inputFetchPaths(captured.configuration.catalog)]).map(
        (path) => `+${path}`,
      ),
    })) as ModelDocument<TModel> | null;
    if (!doc) {
      this.completeOp('updateOne', startedAt, Codes.NotFound, _filter);
      return { success: false, kind: 'error', code: Codes.NotFound, query };
    }

    const context: ModelHookContext = {
      mongooseModel: this.model.mongooseModel,
      modelName: this.modelName,
      operation: initiatingOperation,
      resolvedQuery: query,
    };

    try {
      data = await this.parseClientData(data);
    } catch (error) {
      const result = this.getClientRequestErrorResult(error);
      if (result) {
        this.completeOp('updateOne', startedAt, result.code, _filter);
        return result;
      }
      throw error;
    }

    // see https://mongoosejs.com/docs/api/document.html#Document.prototype.toObject()
    context.originalDocumentSnapshot = doc.toObject({ virtuals: false }) as Record<string, unknown>;
    context.originalData = data;

    context.currentDocument = doc;
    const grants = await resolveInputDocumentGrants({ ...state, doc, context });
    context.docPermissions = deepIsolateValue(grants);
    const { allowedFields, allowedData } = admitModelInput({
      data,
      existing: context.originalDocumentSnapshot,
      requestFields: await requestInputFields({ ...state, access: 'update', grants }),
      inputFields: captured.authorization.inputFields,
      catalog: captured.configuration.catalog,
    });
    context.allowedFields = allowedFields;
    context.allowedData = allowedData;

    const validated = await this.validate(allowedData, 'update', context);
    if (isBoolean(validated)) {
      if (!validated) {
        this.completeOp('updateOne', startedAt, Codes.BadRequest, _filter);
        return { success: false, kind: 'error', code: Codes.BadRequest };
      }
    } else if (isArray(validated)) {
      if (validated.length > 0) {
        this.completeOp('updateOne', startedAt, Codes.BadRequest, _filter);
        return { success: false, kind: 'error', code: Codes.BadRequest, errors: validated };
      }
    }

    const prepared = sanitizePreparedInput(
      await this.prepare(allowedData, 'update', context),
      captured.configuration.catalog,
    );

    context.preparedData = prepared;
    applyUpdate(doc, prepared, allowedFields);

    context.modifiedPaths = doc.modifiedPaths();
    doc = assertModelDocument<TModel>(await this.transform(doc, 'update', context), this.modelName, 'transform');
    stripDocumentInputVirtuals(doc, captured.configuration.catalog);
    context.currentDocument = doc;
    doc = await this.persist(() => doc!.save());

    const diffExcludeFields = [this.options.documentPermissionField, '__v'];
    this.asServiceHookContext(context).diff = (d) => {
      context.changes =
        diff(
          omit(context.originalDocumentSnapshot, diffExcludeFields),
          omit(d.toObject({ virtuals: false }), diffExcludeFields),
        ) || [];

      context.modifiedPaths = uniq(context.changes.map((di) => (di.path.length > 0 ? String(di.path[0]) : '')));
    };

    doc = assertModelDocument<TModel>(await this.afterPersist(doc, 'update', context), this.modelName, 'afterPersist');
    context.currentDocument = doc;
    context.finalDocumentSnapshot = doc.toObject({ virtuals: false }) as Record<string, unknown>;
    this.asServiceHookContext(context).diff(doc);

    await this.changes(doc.toObject({ virtuals: false }) as Record<string, unknown>, context);

    const [detached] = await this.prepareDetachedOutputRows(execution, [doc], updatePlan, _populate);
    // Target-model finalization on detached populated output, before
    // parent getters (own plans/contexts, trimming even without virtuals).
    if (_populate) {
      const updateHookLimit = this.getVirtualHookConcurrencyLimit();
      const updateGate = this.hookGate;
      await this.finalizePopulateForSingleDoc(
        detached,
        _populate as Populate[],
        context,
        initiatingOperation,
        updateHookLimit,
        updateGate,
      );
    }
    const output = await this.finalizeDirectOutput({
      doc: detached,
      plan: updatePlan,
      context,
      includePermissions,
      includeFieldPermissions,
    });
    const outputDoc = decorate ? await this.hookGate.run(() => decorate(output.data, output.context)) : output.data;

    this.completeOp('updateOne', startedAt, Codes.Success, _filter);
    return {
      success: true,
      kind: 'single',
      code: Codes.Success,
      data: outputDoc as TModel,
      input: prepared,
      context: output.context,
    };
  }

  public async updateById(
    id: string,
    data: Record<string, unknown>,
    args: UpdateByIdArgs<TModel> = {},
    options: UpdateByIdOptions<TModel, TVirtuals> = {},
    decorate?: ServiceOutputDecorator,
  ): Promise<AuthorizedSingleResult<TModel> | ErrorResult> {
    try {
      this.admitServiceCall(args, options);
      const intent = captureModelServiceIntent(this, 'updateById', args, options);
      const { populate, select } = intent.args;
      const { skim, includePermissions, includeFieldPermissions, populateAccess } = intent.options;
      const execution = withExecutionQueryIntent(
        this,
        createServiceExecution(
          this,
          {
            operation: 'update',
            rowAccess: 'update',
            virtualAccess: 'update',
            outputAccess: 'read',
            docPermissionsAccess: 'update',
          },
          options?.authorization,
          'mutation',
          this.captureRelated(intent.args),
        ),
        intent,
      );
      const filter = readModelIdentifier(this, execution, await resolveModelIdentifier(this, execution, id));
      const query = await prepareModelQuery(this, execution, { kind: 'mutation-lookup', filter });
      return await executePreparedUpdateOne(
        this,
        execution,
        query,
        data,
        {
          populate,
          select,
        },
        { skim, includePermissions, includeFieldPermissions, populateAccess },
        decorate,
      );
    } catch (error) {
      const result = this.getClientRequestErrorResult(error);
      if (result) return result;
      throw error;
    }
  }

  public async upsert(
    filter: Filter<TModel>,
    data: Record<string, unknown>,
    args?: UpsertArgs<TModel>,
    options?: UpsertOptions<TModel, TVirtuals>,
    decorate?: ServiceOutputDecorator,
  ): Promise<AuthorizedSingleResult<TModel> | AuthorizedListResult<TModel> | ErrorResult> {
    try {
      this.admitServiceCall(args, options);
      const upsertArgs = this.resolveUpsertArgs(args);
      const upsertOptions = this.resolveUpsertOptions(options);
      const updateIntent = captureModelServiceIntent(this, 'updateOne', upsertArgs, upsertOptions);
      const createIntent = captureModelServiceIntent(this, 'create', upsertArgs, upsertOptions);
      // The branch is known only after lookup. Capture both possible ordinary
      // target sets now; only the taken branch's owned intent executes/outputs.
      const related = uniqBy(
        [...this.captureRelated(updateIntent.args), ...this.captureRelated(createIntent.args)],
        (target) => target.path,
      );
      const execution = withExecutionQueryIntent(
        this,
        createServiceExecution(
          this,
          {
            operation: 'upsert',
            rowAccess: 'update',
            virtualAccess: 'update',
            outputAccess: 'read',
            docPermissionsAccess: 'update',
          },
          options?.authorization,
          'mutation',
          related,
        ),
        updateIntent,
      );
      const { populate, select } = updateIntent.args;
      const { skim, includePermissions, includeFieldPermissions, populateAccess } = updateIntent.options;
      const preparedQuery = await prepareModelQuery(this, execution, { kind: 'mutation-lookup', filter });
      const _filter = readPreparedModelQuery(this, execution, preparedQuery).filter;
      const query = { filter: _filter };

      const startedAt = this.beginOp('upsert', _filter);
      if (_filter === false) {
        this.completeOp('upsert', startedAt, Codes.Forbidden, _filter);
        return { success: false, kind: 'error', code: Codes.Forbidden, query };
      }

      const theone = await this.model.findOne({ filter: _filter });
      let result: AuthorizedSingleResult<TModel> | AuthorizedListResult<TModel> | ErrorResult;
      if (theone) {
        // VIRT-00A D1: update branch keeps operation `upsert`; accesses
        // follow the taken branch (update/read/update).
        const updateArgs = {
          populate,
          select,
        };
        const updateOptions = { skim, includePermissions, includeFieldPermissions, populateAccess };
        result = await executePreparedUpdateOne(
          this,
          execution,
          preparedQuery,
          data,
          updateArgs,
          updateOptions,
          decorate,
        );
      } else {
        // VIRT-00A D1: create branch keeps operation `upsert`; accesses
        // follow the taken branch (create/read/create).
        const createExecution = withExecutionQueryIntent(
          this,
          deriveServiceExecution(
            this,
            execution,
            { operation: 'upsert', virtualAccess: 'create', outputAccess: 'read', docPermissionsAccess: 'create' },
            'create',
          ),
          createIntent,
        );
        result = await executeCreate(
          this,
          createExecution,
          data,
          {
            populate,
            select,
          },
          { skim, includePermissions, includeFieldPermissions, populateAccess },
          decorate,
        );
      }

      this.completeOp('upsert', startedAt, result.code, _filter);
      return result;
    } catch (error) {
      const result = this.getClientRequestErrorResult(error);
      if (result) return result;
      throw error;
    }
  }

  public async delete(id: string): Promise<SingleResult<unknown> | ErrorResult> {
    if (arguments.length > 1) {
      return {
        success: false,
        kind: 'error',
        code: Codes.BadRequest,
        errors: [{ detail: 'delete does not accept authorization options' }],
      };
    }
    const filter = await this.genFilter('delete', await this.genIDFilter(id));

    const query = { filter };

    const startedAt = this.beginOp('delete', filter);

    if (filter === false) {
      this.completeOp('delete', startedAt, Codes.Forbidden, filter);
      return { success: false, kind: 'error', code: Codes.Forbidden, query };
    }
    let doc = (await this.model.findOne({ filter })) as ModelDocument<TModel> | null;
    if (!doc) {
      this.completeOp('delete', startedAt, Codes.NotFound, filter);
      return { success: false, kind: 'error', code: Codes.NotFound, query };
    }

    const context: ModelHookContext = {
      mongooseModel: this.model.mongooseModel,
      modelName: this.modelName,
      operation: 'delete',
      originalDocumentSnapshot: toObject(doc) as Record<string, unknown>,
      currentDocument: doc,
      resolvedQuery: query,
    };

    await this.beforeDelete(doc, context);

    // this function utilizes the 'deleteOne' method to delete the document,
    // triggering 'deleteOne' hooks, as opposed to using 'findOneAndDelete'.
    // see https://mongoosejs.com/docs/api/model.html#Model.prototype.deleteOne()
    await this.persist(() =>
      'deleteOne' in doc! ? doc.deleteOne() : (doc as Document & { remove: () => Promise<unknown> }).remove(),
    );

    context.finalDocumentSnapshot = toObject(doc) as Record<string, unknown>;
    await this.afterDelete(doc, context);

    this.completeOp('delete', startedAt, Codes.Success, filter);
    return { success: true, kind: 'single', code: Codes.Success, data: doc._id, query };
  }

  /**
   * Check existence under row policy (read by default). Terminal false returns a
   * Forbidden ErrorResult before adapter dispatch, in both includeId modes.
   * Allowed matches return true or an `{ _id }` record; misses return false or null.
   * Custom HTTP routes must map ErrorResult to their intended response status.
   */
  public async exists(
    filter: Filter<TModel>,
    options: ExistsOptions & { includeId: true },
  ): Promise<SingleResult<unknown> | ErrorResult>;
  /** Boolean existence; terminal false policy returns Forbidden, not successful false. */
  public async exists(filter: Filter<TModel>, options?: ExistsOptions): Promise<SingleResult<boolean> | ErrorResult>;
  public async exists(filter: Filter<TModel>, options?: ExistsOptions): Promise<SingleResult<unknown> | ErrorResult> {
    try {
      this.admitServiceCall(undefined, options, false);
    } catch (error) {
      const result = this.getClientRequestErrorResult(error);
      if (result) return result;
      throw error;
    }
    const virtualSnapshot = this.captureVirtualSnapshot();
    const filterErrors = this.validateClientFilter(filter);
    if (filterErrors.length > 0) return { success: false, kind: 'error', code: Codes.BadRequest, errors: filterErrors };

    const { access, includeId } = this.resolveExistsOptions(options);

    filter = await this.genFilter(access, filter);
    // VIRT-04: virtual-name exclusion still applies to DB inputs; no getters run.
    if (filter !== false) {
      filter = this.stripVirtualsFromFilterForSnapshot(filter, virtualSnapshot);
    }
    if (filter === false) return { success: false, kind: 'error', code: Codes.Forbidden, query: { filter } };
    const result = await this.model.exists(filter);
    return {
      success: true,
      kind: 'single',
      code: Codes.Success,
      data: includeId ? result : !!result,
      query: { filter },
    };
  }

  protected isValidDistinctFieldName(field: unknown): boolean {
    return isValidFieldPath(field);
  }

  protected async authorizeDistinctField(field: string): Promise<ErrorResult | null> {
    try {
      // No document exists here. Request rules must prove disclosure of the
      // complete raw value, without field callbacks, document or backend grants.
      const configuration = captureModelAuthorizationConfiguration(this.requestRuntime, this.modelName);
      if (
        !isVirtualDbPath(field, { virtuals: configuration.virtuals as Record<string, unknown> | null | undefined }) &&
        isDistinctFieldAuthorized({
          field,
          schema: this.model.mongooseModel.schema,
          configuration,
          permissions: this.requestCore.getPermissions(),
        })
      )
        return null;
    } catch {
      // An unprovable schema/policy decision is denial, never an allowlist retry.
    }
    return {
      success: false,
      kind: 'error',
      code: Codes.Forbidden,
      errors: [{ detail: `Distinct field not allowed: ${field}` }],
    };
  }

  /**
   * Raw distinct values under request read/row policy; backend output grants do not apply.
   * Before persistence, the explicit field rule and every returned descendant must be
   * request-proven. Callable/document-dependent rules, protected/virtual values, Mixed,
   * whole Maps and other unprovable composites return Forbidden. Explicit typed scalar
   * children remain eligible. Values are never trimmed or re-deduplicated after Mongo.
   */
  public async distinct(field: string, args?: DistinctArgs<TModel>): Promise<ListResult<unknown> | ErrorResult> {
    if (arguments.length > 2) {
      return {
        success: false,
        kind: 'error',
        code: Codes.BadRequest,
        errors: [{ detail: 'distinct does not accept authorization options' }],
      };
    }
    try {
      this.admitServiceCall(args);
    } catch (error) {
      const result = this.getClientRequestErrorResult(error);
      if (result) return result;
      throw error;
    }
    const virtualSnapshot = this.captureVirtualSnapshot();
    if (!this.isValidDistinctFieldName(field)) {
      return {
        success: false,
        kind: 'error',
        code: Codes.BadRequest,
        errors: [{ detail: `Invalid distinct field: ${field}` }],
      };
    }

    const fieldError = await this.authorizeDistinctField(field);
    if (fieldError) return fieldError;

    let { filter } = args ?? {};
    const filterErrors = this.validateClientFilter(filter);
    if (filterErrors.length > 0) return { success: false, kind: 'error', code: Codes.BadRequest, errors: filterErrors };

    filter = await this.genFilter('read', filter);
    if (filter !== false) {
      filter = this.stripVirtualsFromFilterForSnapshot(filter, virtualSnapshot);
    }

    const query = { filter };

    if (filter === false) return { success: false, kind: 'error', code: Codes.Forbidden, query };

    const result = await this.model.distinct(field, filter);

    return { success: true, kind: 'list', code: Codes.Success, data: result, count: result.length, query };
  }

  /**
   * Exact numeric count under request row policy, independent of list pagination.
   * `access` selects baseFilter/overrideFilter access (default `list`; pass `count`
   * for count policy). Custom entrypoints establish their own operation guard.
   * False is terminal Forbidden; an allowed miss succeeds with zero. No output
   * fields/getters are computed, and no authorization-options argument is accepted.
   * For per-key numeric counts use countByFieldValues; for one union use an ordinary
   * `$in` filter here instead of summing overlapping per-key counts.
   */
  public async count(
    filter: Filter<TModel>,
    access: BaseFilterAccess = 'list',
  ): Promise<SingleResult<number> | ErrorResult> {
    if (arguments.length > 2 || typeof access !== 'string') {
      return {
        success: false,
        kind: 'error',
        code: Codes.BadRequest,
        errors: [{ detail: 'count accepts an access name, not authorization options' }],
      };
    }
    const virtualSnapshot = this.captureVirtualSnapshot();
    const filterErrors = this.validateClientFilter(filter);
    if (filterErrors.length > 0) return { success: false, kind: 'error', code: Codes.BadRequest, errors: filterErrors };

    filter = await this.genFilter(access, filter);
    if (filter !== false) {
      filter = this.stripVirtualsFromFilterForSnapshot(filter, virtualSnapshot);
    }

    const query = { filter };

    if (filter === false) return { success: false, kind: 'error', code: Codes.Forbidden, query };

    return { success: true, kind: 'single', code: Codes.Success, data: await this.model.countDocuments(filter), query };
  }

  /**
   * Legacy count of an already-authorized server predicate. The caller supplies the
   * complete row constraint: this helper does not run client parsing/validation or
   * baseFilter/overrideFilter. False remains Forbidden and virtual predicates are
   * excluded. It accepts no authorization/options argument. Prefer count for request
   * policy. Package-owned correlated execution uses authenticated prepared queries
   * instead; this is not a public prepared-query capability or a wire option.
   */
  public async countTrusted(authorizedFilter: Filter<TModel>): Promise<SingleResult<number> | ErrorResult> {
    if (arguments.length > 1) {
      return {
        success: false,
        kind: 'error',
        code: Codes.BadRequest,
        errors: [{ detail: 'countTrusted does not accept authorization options' }],
      };
    }
    // VIRT-04: even trusted filters never send virtual names to the adapter.
    // No getters run for scalar/identity-only operations.
    const query = { filter: authorizedFilter };
    if (authorizedFilter === false) return { success: false, kind: 'error', code: Codes.Forbidden, query };
    let effective = authorizedFilter;
    try {
      const snapshot = this.captureVirtualSnapshot();
      effective = this.stripVirtualsFromFilterForSnapshot(authorizedFilter, snapshot);
    } catch {
      // keep original on snapshot failure
    }
    return {
      success: true,
      kind: 'single',
      code: Codes.Success,
      data: await this.model.countDocuments(effective),
      query: { filter: effective },
    };
  }

  /**
   * Exact numeric document counts per original `String(value)` alias, in one Mongo
   * aggregate independent of list pagination. Includes zero for missing keys; repeated
   * original aliases use their first operand. Distinct aliases normalized by schema
   * casting/setters get equal counts. Each group uses Mongo query `$in` semantics,
   * including literal array/object equality, null/missing and dotted array traversal.
   * Repeated foreign/nested array entries count once.
   * Counts for different keys can overlap: do not sum them to count a multi-key union.
   *
   * BREAKING: returns Map<string, number>, replacing the former unbounded ID-set API.
   * Legacy includes privately count whole parent-key groups; no target IDs are returned.
   * Resolves the requested row policy (default `list`; pass `count` for count policy).
   * No authorization/prepared options are accepted. False policy returns Forbidden;
   * schema-cast/input-limit failures return BadRequest, before aggregate dispatch.
   * Casting uses the owning schema, without executing countDocuments middleware.
   *
   * Fixed per-call bounds: 1,000 input values/groups, 10,000 key occurrences, 64 KiB
   * per BSON key/alias, 1 MiB cumulative BSON-key plus alias bytes, depth 8 / 20,000
   * key nodes, 1,024 foreign-path bytes. Raw and cast grouped operands are bounded.
   * Operands are snapshotted before awaited hooks; regex/executable keys are rejected.
   * Plain object operands beginning with `$` reject unless they contain both `$ref`
   * and `$id` (Mongo's literal DBRef exception). Nested literal dollar fields are data.
   *
   * @returns A SingleResult with Map<string, number> data, or an ErrorResult. Check
   * success before data; migrate `data.get(key)?.size` to `data.get(key) ?? 0`.
   * @example
   * ```ts
   * import type { ModelRequest } from '@web-ts-toolkit/access-router/advanced';
   * export async function invoiceCounts(req: ModelRequest) {
   *   const lines = req.macl.getService<{ invoiceId: string }>('InvoiceLine');
   *   const result = await lines.countByFieldValues('invoiceId', ['a', 'b'], {}, 'count');
   *   if (result.success) return Object.fromEntries(result.data);
   *   return result;
   * }
   * ```
   */
  public async countByFieldValues(
    foreignField: string,
    values: readonly unknown[],
    filter: Filter<TModel> = {},
    access: BaseFilterAccess = 'list',
  ): Promise<SingleResult<Map<string, number>> | ErrorResult> {
    if (arguments.length > 4 || typeof access !== 'string') {
      return {
        success: false,
        kind: 'error',
        code: Codes.BadRequest,
        errors: [{ detail: 'countByFieldValues accepts an access name, not authorization options' }],
      };
    }
    if (!isValidFieldPath(foreignField)) {
      return {
        success: false,
        kind: 'error',
        code: Codes.BadRequest,
        errors: [{ detail: `Invalid include foreignField: ${foreignField}` }],
      };
    }
    // VIRT-04: virtual join keys never reach the adapter.
    try {
      const snapshot = this.captureVirtualSnapshot();
      if (isVirtualDbPath(foreignField, snapshot as unknown as { virtuals?: Record<string, unknown> | null })) {
        return {
          success: false,
          kind: 'error',
          code: Codes.BadRequest,
          errors: [{ detail: `Invalid include foreignField: ${foreignField}` }],
        };
      }
    } catch {
      // keep existing validation on snapshot failure
    }

    const filterErrors = this.validateClientFilter(filter);
    if (filterErrors.length > 0) return { success: false, kind: 'error', code: Codes.BadRequest, errors: filterErrors };

    try {
      assertCountForeignFieldSize(foreignField);
      const input = prepareCountValues(values);
      const execution = createServiceExecution(this, {
        operation: 'count',
        rowAccess: access,
        virtualAccess: access,
        outputAccess: access,
        docPermissionsAccess: access,
      });
      const query = await prepareModelQuery(this, execution, { kind: 'mutation-lookup', filter }, {
        [foreignField]: { $in: input.values },
      } as Filter<TModel>);
      const result = await executePreparedGroupedCount(this, execution, query, foreignField, input);
      if (result.success === false) return result;
      return { ...result, data: new Map(input.aliases.map((alias, index) => [alias, result.data[index]])) };
    } catch (error) {
      const result = this.getClientRequestErrorResult(error);
      if (result) return result;
      throw error;
    }
  }

  private async countPreparedByFieldValueGroups(
    foreignField: string,
    input: GroupedCountInput,
    filter: Filter<TModel>,
  ): Promise<SingleResult<number[]> | ErrorResult> {
    if (
      !isValidFieldPath(foreignField) ||
      isVirtualDbPath(foreignField, this.captureVirtualSnapshot() as { virtuals?: Record<string, unknown> })
    ) {
      return {
        success: false,
        kind: 'error',
        code: Codes.BadRequest,
        errors: [{ detail: `Invalid include foreignField: ${foreignField}` }],
      };
    }
    assertCountForeignFieldSize(foreignField);
    const uniqueValues = input.values;
    // Also constrain private callers; row transforms can never erase this join.
    filter = intersectFilters(filter, { [foreignField]: { $in: uniqueValues } } as Filter<TModel>);

    const query = { filter };

    if (filter === false) return { success: false, kind: 'error', code: Codes.Forbidden, query };
    let matchFilter = filter as Record<string, unknown>;
    let castValues = uniqueValues;
    let groups: ReturnType<typeof castCountGroups>;
    try {
      if (this.model.castFilter) {
        matchFilter = this.model.castFilter(matchFilter);
        // Cast against the real foreign path, before projection renames it.
        // Keep this independent of ACL query transformation/scope composition.
        const foreignFilter = this.model.castFilter({ [foreignField]: { $in: uniqueValues } });
        castValues = foreignFilter[foreignField]?.$in;
      }
      groups = castCountGroups(input, castValues);
    } catch {
      // Only synchronous schema casting is in this boundary, never persistence.
      // Avoid exposing values from trusted ACL filters in the client error detail.
      return {
        success: false,
        kind: 'error',
        code: Codes.BadRequest,
        errors: [{ detail: 'Invalid grouped count filter or foreign-key value, or count input limit exceeded' }],
      };
    }

    if (groups.length === 0) return { success: true, kind: 'single', code: Codes.Success, data: [], query };

    // Native query matching is essential: aggregation $in/$setIntersection on a
    // dotted field expression is not equivalent for literal arrays or multikey
    // traversal (including missing children). Share one authorized candidate stream
    // across bounded count-only facets, rather than approximating the query matcher.
    const foreignRoot = foreignField.split('.')[0];
    const rows = (await this.model.aggregate([
      { $match: matchFilter },
      // Keep the whole join subtree so projection cannot alter equality/traversal.
      // Target identity is discarded unless it is itself the join input.
      { $project: { _id: 0, [foreignRoot]: 1 } },
      {
        $facet: Object.fromEntries(
          groups.map(({ group, keys }) => [
            `g${group}`,
            [
              { $match: { [foreignField]: { $in: keys } } },
              { $count: 'count' },
              { $project: { _id: { $literal: group }, count: 1 } },
            ],
          ]),
        ),
      },
      // Each facet emits zero or one numeric row. Neither facet state nor its
      // result document grows with the number/size of matching target identities.
      { $project: { rows: { $concatArrays: groups.map(({ group }) => `$g${group}`) } } },
      { $unwind: '$rows' },
      { $replaceRoot: { newRoot: '$rows' } },
    ])) as Array<{ _id: number; count: number }>;

    // Only bounded group ordinals and numbers cross the adapter boundary. No
    // document identity is projected, accumulated, scanned or unioned in Node.
    const counts = new Array<number>(input.groups.length).fill(0);
    if (rows.length > counts.length) throw new Error('Invalid numeric grouped count result');
    for (const row of rows) {
      if (
        !Number.isSafeInteger(row._id) ||
        row._id < 0 ||
        row._id >= counts.length ||
        !Number.isSafeInteger(row.count) ||
        row.count < 0
      )
        throw new Error('Invalid numeric grouped count result');
      counts[row._id] = row.count;
    }

    return { success: true, kind: 'single', code: Codes.Success, data: counts, query };
  }

  public getDocPermissions(doc: unknown): Record<string, unknown> {
    return getDocPermissions(this.modelName, doc);
  }

  private resolveUpsertArgs(args: UpsertArgs<TModel> = {}) {
    return resolveUpsertArgs(this, args);
  }

  private resolveUpsertOptions(options: UpsertOptions = {}) {
    return resolveUpsertOptions(this, options);
  }

  private resolveExistsOptions(options: ExistsOptions = {}) {
    return resolveExistsOptions(this, options);
  }

  private async getFieldPermissionAccess(ids: unknown[]) {
    const uniqueIds = compact(uniqBy(ids, (id) => String(id)).map((id) => String(id)));
    if (uniqueIds.length === 0) {
      return {
        readIds: new Set<string>(),
        updateIds: new Set<string>(),
      };
    }

    const [readIds, updateIds] = await Promise.all([
      this.getAccessibleIdSet(uniqueIds, 'read'),
      this.getAccessibleIdSet(uniqueIds, 'update'),
    ]);

    return { readIds, updateIds };
  }

  private async getAccessibleIdSet(ids: string[], access: BaseFilterAccess) {
    const idFilter = { _id: { $in: ids } } as Filter<TModel>;
    const filter = await this.genFilter(access, idFilter);
    if (filter === false) return new Set<string>();

    const docs = (await this.model.find({ filter, select: '_id', lean: true })) as Array<{ _id: unknown }>;
    return new Set<string>(docs.map((doc) => String(doc._id)));
  }

  /** Dedicated child list; trusted policy uses independent parent-read/child-list gates and rows. */
  async listSub<S extends string>(
    id: SubdocumentId,
    sub: S,
    options?: SubdocumentListOptions<TModel, SubdocumentModel<TModel, S>, SubdocumentVirtuals<TVirtuals, S>>,
  ): Promise<ListResult | ErrorResult> {
    return listSubImpl(this, id, sub, options);
  }

  /** Child-relative output grants never elevate referenced populate targets or the owning parent. */
  public async readSub<S extends string>(
    id: SubdocumentId,
    sub: S,
    subId: SubdocumentId,
    options?: SubdocumentReadOptions<TModel, SubdocumentModel<TModel, S>, SubdocumentVirtuals<TVirtuals, S>>,
  ): Promise<SingleResult | ErrorResult> {
    return readSubImpl(this, id, sub, subId, options);
  }

  /**
   * Apply authorized policy-path updates, preserving protected siblings, then save.
   * Output requires post-save parent read and subdocument read operation/row access;
   * hidden output is successful `data: null` (direct/root-entry 200), not a failed write.
   * Visible output uses read fields plus `_id`. Do not retry solely for null output.
   * Trusted options.authorization.child.inputFields admits writes; response authority
   * belongs only in authorization.visibility. Missing dimensions use request rules.
   */
  public async updateSub<S extends string>(
    id: SubdocumentId,
    sub: S,
    subId: SubdocumentId,
    data: Record<string, unknown>,
    options?: SubdocumentUpdateOptions<TModel, SubdocumentModel<TModel, S>, SubdocumentVirtuals<TVirtuals, S>>,
  ): Promise<SingleResult | ErrorResult> {
    return updateSubImpl(this, this.persist, id, sub, subId, data, options);
  }

  /**
   * Save authorized targeted updates, then return readable targets in stored order.
   * Requires parent/subdocument read access for output, not subdocument list access;
   * uses read fields plus `_id`. Hidden output succeeds with `data: [], count: 0`
   * (direct/root-entry 200); count measures visible rows, not all updated rows.
   */
  public async bulkUpdateSub<S extends string>(
    id: SubdocumentId,
    sub: S,
    data: SubdocumentBulkUpdateInput | Record<string, unknown>,
    options?: SubdocumentUpdateOptions<TModel, SubdocumentModel<TModel, S>, SubdocumentVirtuals<TVirtuals, S>>,
  ): Promise<ListResult | ErrorResult> {
    return bulkUpdateSubImpl(this, this.persist, id, sub, castArray(data), options);
  }

  /**
   * Append/prepend admitted rows, then return the visible full array (including when
   * input is empty). Output requires post-save parent read and subdocument list AND
   * read guards/row filters; fields use read projection plus `_id`.
   * Hidden output succeeds with code `created`, `data: [], count: 0`
   * (direct/root-entry 201). Visible count/order follow filtered stored rows.
   * Empty output does not mean the write failed; addFirst is a service option.
   */
  public async createSub<S extends string>(
    id: SubdocumentId,
    sub: S,
    data: SubdocumentCreateInput,
    options?: SubdocumentCreateOptions<TModel, SubdocumentModel<TModel, S>, SubdocumentVirtuals<TVirtuals, S>>,
  ): Promise<ListResult | ErrorResult> {
    return createSubImpl(this, this.persist, id, sub, data, options);
  }

  /** Trusted parent-update/child-delete gates and rows; no fields/visibility policy. Returns the removed ID. */
  public async deleteSub<S extends string>(
    id: SubdocumentId,
    sub: S,
    subId: SubdocumentId,
    options?: SubdocumentDeleteOptions<TModel, SubdocumentModel<TModel, S>>,
  ): Promise<SingleResult | ErrorResult> {
    return deleteSubImpl(this, this.persist, id, sub, subId, options);
  }

  /** Raw hydrated parent/null, with row policy and populate; no finalized permission metadata. */
  public async getParentDoc(
    id: SubdocumentId,
    sub: SubdocumentName,
    args?: SubdocumentParentArgs,
    options?: SubdocumentParentOptions,
  ) {
    return getParentDocImpl(this, id, sub, args, options);
  }
}
