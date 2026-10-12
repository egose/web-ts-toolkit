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
import { getModelOptions } from '../options';
import { collectModelRequestFields } from '../acl/select-resolution';
import {
  getDocPermissions,
  genPagination,
  mapWithConcurrencyLimit,
  normalizeSelect,
  populateDoc,
  stripUnexposedDocPermissions,
  toObject,
} from '../helpers';
import { isFieldAllowed, isValidFieldPath, sanitizeSortFields, validateSortFields } from '../helpers/sort-policy';
import { excludeVirtualsFromAllowedSortFields } from '../helpers/sort-policy';
import { RequestConcurrencyScheduler, SharedHookGate, normalizeHookConcurrencyLimit } from '../helpers/concurrency';
import { resolveAlwaysSelectForAccess, type VirtualProjectionPlan } from '../acl/virtual-projection';
import { compactPersistedProjection, planAuthorizedModelProjection } from '../acl/output-projection';
import { captureModelAuthorizationConfiguration } from '../acl/model-output-planning';
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
import { assertPublicDefaults } from '../validation/public-admission';
import {
  createServiceExecution,
  deriveServiceExecution,
  readServiceExecution,
  registerServiceExecutors,
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
import { intersectFilters } from '../core-shared';
import { validateExpandedCorrelatedOperands } from '../correlated-includes';
import { finalizeModelOutput, type FinalizeSnapshot } from '../output/finalize-model-output';
import {
  VIRT_ASSOCIATION_FIELD,
  VIRT_ASSOCIATION_VALUES,
  excludeVirtualsFromAllowedFields,
  isVirtualDbPath,
  stripVirtualKeysFromFilter,
} from './base';
import { getPopulateTargetMeta, type PopulateTargetMeta } from '../acl/populate-target';
import { deepIsolateValue, getDocValue, setDocValue, isolateDocForOutput } from '../helpers/document';
import { getModelRef as getModelRefWithDotted } from '../meta';
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
import {
  resolveCreateArgs,
  resolveCreateOptions,
  resolveExistsOptions,
  resolveFindArgs,
  resolveFindByIdArgs,
  resolveFindByIdOptions,
  resolveFindOneArgs,
  resolveFindOneOptions,
  resolveFindOptions,
  resolveUpdateByIdArgs,
  resolveUpdateByIdOptions,
  resolveUpdateOneArgs,
  resolveUpdateOneOptions,
  resolveUpsertArgs,
  resolveUpsertOptions,
} from './model-service-defaults';

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
 * - `maxHookConcurrency` bounds active getter + row-finalization work via
 *   ONE bounded row map + shared `SharedHookGate` (stable order, limit-1
 *   completes, no persistence permits held).
 */
type VirtualOperationAccess = 'list' | 'create' | 'read' | 'update';

export class Service<TModel = unknown, TVirtuals extends object = Record<never, never>> extends Base<
  TModel,
  TVirtuals
> {
  protected model: any;
  protected options: ModelRouterOptions<TModel, TVirtuals>;
  public defaults: Defaults<TModel>;
  protected baseFields: string[];
  protected baseFieldsExt: string[];
  private readonly persist = <T>(operation: () => T | PromiseLike<T>): Promise<T> =>
    this.getCorrelatedExecState().scheduler.work(operation);

  public findRawParentDoc(args: { filter: Filter<TModel>; select: string; populate: unknown; lean: boolean }): any {
    return this.model.findOne({
      ...args,
      filter: args.filter as unknown as Filter,
      populate: args.populate as string | Populate[],
    });
  }

  protected createModelAdapter(modelName: string): any {
    return new MongooseModelAdapter(modelName);
  }

  protected getModelRouterOptions(modelName: string): ModelRouterOptions<TModel, TVirtuals> {
    return getModelOptions<TModel, TVirtuals>(modelName);
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
    lean?: boolean;
    includePaths?: string[];
    sharedGate?: SharedHookGate;
    privateAssociationField?: string;
  }): Promise<{ data: Record<string, unknown>; context: ServiceOutputContext }> {
    const { plan, context } = args;
    const { authorization, authorizationBinding: binding } = plan;
    const { access, configuration } = readServiceAuthorization(authorization!, binding!);
    const snapshot = isolateDocForOutput(args.doc) as Record<string, unknown>;
    // Hydrated parents can contain package-finalized target DTOs. Transfer each
    // child explicitly while making the plain projected input for this stage.
    for (const key of Object.keys(snapshot))
      transferDocumentAuthorizationGraph(getDocValue(args.doc as never, key), snapshot[key]);
    const savedIncludes = new Map<string, unknown>();
    for (const path of args.includePaths ?? []) {
      const value = get(snapshot, path);
      if (value !== undefined) {
        savedIncludes.set(path, value);
        unsetDocPath(snapshot, path);
      }
    }
    // Nested includes have consumed this fetch-only input. Detach their output
    // first, so an attachment deliberately reusing the FK path is preserved.
    if (args.privateAssociationField) unsetDocPath(snapshot, args.privateAssociationField);
    const gate = args.sharedGate ?? new SharedHookGate(this.getVirtualHookConcurrencyLimit());
    const handle = await resolveOutputDocumentAuthorization({
      authorization: authorization!,
      binding: binding!,
      snapshot,
      context,
      hookGate: gate,
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
      sharedGate: gate,
      concurrencyLimit: this.getVirtualHookConcurrencyLimit(),
      onFinalized: (_output, outputContext) => {
        finalizedContext = outputContext;
      },
    });
    // Finish metadata and include attachment on a fresh copy. Never mutate an
    // already-associated output or infer authority from serialized permissions.
    const output = deepIsolateValue(finalized);
    for (const [path, value] of savedIncludes) set(output, path, value);
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
      } else if (!args.includePermissions) this.addEmptyPermissions(output);
      stripUnexposedDocPermissions(this.modelName, output);
    }
    this.preservePermissionsVirtual(args.doc, output, args.lean);
    transferDocumentAuthorizationGraph(finalized, output);
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
      const macl = this.req?.macl as unknown as {
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
    try {
      return normalizeHookConcurrencyLimit(
        (this.getRequestComplexity() as { maxHookConcurrency?: unknown }).maxHookConcurrency,
        10,
      );
    } catch {
      return 10;
    }
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
   * before sub getters; only finalized children appear in getter views.
   * Uses ONE bounded row map + shared `SharedHookGate` (stable order,
   * peak ≤ `maxHookConcurrency`, limit-1 completes, no persistence permits
   * held). Callers must filter rows (existing row/operation filters) BEFORE
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
    const gate = new SharedHookGate(hookLimit);
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
    const limit = hookLimit ?? this.getVirtualHookConcurrencyLimit();
    const gate = sharedGate ?? new SharedHookGate(limit);
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
   * Preserve the `permissions` Mongoose virtual (from `permissionsPlugin`) for
   * hydrated outputs. `isolateDocForOutput` uses `toObject({ virtuals: false })`
   * so Mongoose getter virtuals never leak into package-virtual planning;
   * `lean: true` therefore drops them (explicit parity rule). For `lean: false`
   * (hydrated Mongoose documents) the historical contract exposes
   * `doc.permissions` as an alias of the document-permission field. The shared
   * finalizer keeps only the document-permission field, so restore the alias
   * here for backward compatibility when the input was hydrated and the
   * virtual existed. Lean outputs stay without the virtual. Models without
   * the plugin never had the virtual and stay unchanged.
   */
  private preservePermissionsVirtual(
    originalDoc: unknown,
    finalized: Record<string, unknown>,
    lean: boolean | undefined,
  ): void {
    try {
      if (lean) return;
      if (!isDocument(originalDoc)) return;
      const schema = (originalDoc as Document).schema;
      if (!schema?.virtualpath('permissions')) return;
      const docField =
        (this.options as { documentPermissionField?: string } | undefined)?.documentPermissionField ?? '_permissions';
      if (docField in finalized && !('permissions' in finalized)) {
        // Non-enumerable alias: service-direct `result.data.permissions`
        // keeps working (Mongoose virtual parity for hydrated outputs) while
        // `Object.keys`/JSON DTOs omit it, preserving the historical
        // `toObject({ virtuals: false })` output shape (only `_permissions`).
        Object.defineProperty(finalized, 'permissions', {
          value: (finalized as Record<string, unknown>)[docField],
          enumerable: false,
          writable: true,
          configurable: true,
        });
      }
    } catch {
      // never break output on metadata aliasing
    }
  }

  /**
   * VIRT-05 populate + association helpers.
   *
   * - Populate targets finalize with their own plan/context before parent
   *   getters (target trimming even without virtuals). Handles null, scalar
   *   IDs when population is skipped, arrays, and dotted paths through
   *   embedded arrays (e.g. `contacts.friend`). One evaluation per logical
   *   target output, no in-place mutation of shared/cached instances (targets
   *   are replaced, never mutated; parents are fresh per-query docs, consistent
   *   with `includeDocs` in-place attachment), isolated copies per parent,
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
    const effective = { populate: args?.populate ?? defaults?.populate, include: args?.include ?? defaults?.include };
    if (effective.include) {
      const processed = this.processInclude(effective.include as Include[]);
      effective.include = [...processed.includes, ...processed.correlatedIncludes];
    }
    return captureRelatedTargets(this.requestRuntime, this.modelName, effective);
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
      const modelName = getModelRefWithDotted(this.modelName, descriptor.path);
      if (!modelName) continue;
      if (!this.requestRuntime.hasModel(modelName)) {
        if (
          captured.relatedTargets.some((target) => target.path === descriptor.path && target.kind === 'passthrough')
        ) {
          result.push({ path: descriptor.path, select: descriptor.select });
        }
        continue;
      }
      const policy = relatedPolicy(state.authorization, state.binding, descriptor.path);
      const svc = this.req.macl.getPublicService(modelName);
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
      if (policy?.operation.mode !== 'grant' && !(await this.req.macl.isAllowed(modelName, targetAccess))) continue;
      // Match is a required relationship constraint, even when a transform rewrites ordinary input.
      const match = (descriptor.match ?? {}) as Filter;
      const query = await prepareModelQuery(svc, child, { kind: 'client-read', filter: match }, {}, true);
      const filter = readPreparedModelQuery(svc, child, query).filter;
      if (filter === false) continue;
      const childState = readServiceExecution(svc, child);
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
    const existing = cache.get(rawTarget as object);
    if (existing) {
      const source = await existing;
      const copy = deepIsolateValue(source);
      transferDocumentAuthorizationGraph(source, copy);
      return copy;
    }
    let targetMongooseModel: unknown;
    try {
      const inst = (this.requestRuntime as { getModelInstance?: (n: string) => unknown }).getModelInstance?.(
        meta.targetModelName,
      ) as { mongooseModel?: unknown } | unknown;
      void inst;
      targetMongooseModel = inst;
    } catch {
      targetMongooseModel = parentContext.mongooseModel;
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
    });
    cache.set(rawTarget as object, pending);
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
  ): Promise<void> {
    if (current === null || current === undefined) return;
    if (Array.isArray(current)) {
      for (const el of current) {
        await this.finalizePopulatePath(
          el,
          segments,
          segIdx,
          meta,
          parentOperation,
          parentContext,
          hookLimit,
          sharedGate,
        );
      }
      return;
    }
    if (typeof current !== 'object') return;
    if (segIdx >= segments.length) return;
    const key = segments[segIdx];
    let child: unknown;
    try {
      child = getDocValue(current as never, key);
      if (child === undefined) {
        try {
          child = get(current as object, key);
        } catch {
          return;
        }
      }
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
        for (const el of child) {
          if (el === null || el === undefined || this.isScalarPopulateValue(el)) {
            out.push(el);
            continue;
          }
          out.push(
            await this.finalizeSinglePopulateTarget(el, meta, parentOperation, parentContext, hookLimit, sharedGate),
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
      await this.finalizePopulatePath(doc, segments, 0, meta, parentOperation, parentContext, hookLimit, sharedGate);
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
    this.options = this.getModelRouterOptions(modelName);
    this.defaults = this.options.defaults || {};
    registerSubdocumentPopulateExecutor(this, (execution, populate) =>
      this.genExecutionPopulate(execution, 'read', populate),
    );
    this.baseFields = ['_id'];
    this.baseFieldsExt = this.baseFields.concat(this.options.documentPermissionField);
    registerServiceExecutors(this, {
      binding: () => ({
        request: this.req,
        runtime: this.requestRuntime,
        model: this.model.mongooseModel,
        modelName: this.modelName,
      }),
      configuration: () =>
        this.requestRuntime.getModelInstance(this.modelName)
          ? captureModelAuthorizationConfiguration(this.requestRuntime, this.modelName)
          : { catalog: { paths: [] }, ...this.options },
      permissions: () => this.req.macl.getPermissions?.() ?? new Permission({}),
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
        return resolveAuthorizedAccessFilter(this.req.macl, state.authorization, state.binding, filter, () =>
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
      groupedCount: (filter, field, values) => this.countPreparedByFieldValues(field, values, filter),
    });
  }

  public async findOne(
    filter: Filter<TModel>,
    args?: FindOneArgs<TModel>,
    options?: FindOneOptions<TModel, TVirtuals>,
  ): Promise<AuthorizedSingleResult<TModel> | ErrorResult> {
    try {
      this.admitServiceCall(args, options);
      const access = this.resolveFindOneOptions(options).access;
      const execution = createServiceExecution(
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
        this.captureRelated(args, this.defaults.findOneArgs),
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

    const { select: requestedSelect, sort, populate, include } = this.resolveFindOneArgs(args);
    const { includePermissions, includeFieldPermissions, access, populateAccess, lean } =
      this.resolveFindOneOptions(options);
    const state = readServiceExecution(this, execution);
    const virtualSnapshot = readServiceAuthorization(state.authorization, state.binding)
      .configuration as FinalizeSnapshot;

    let processedInclude: ReturnType<typeof this.processInclude>;
    try {
      processedInclude = this.processInclude(include);
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

    const { includes, correlatedIncludes, includeLocalFields, includePaths, correlatedReferenceFields } =
      processedInclude;
    const correlatedOutputPaths = correlatedIncludes.map((entry) => entry.path);
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

    let doc = await this.model.findOne({ ...query, select: dbSelect, lean });
    if (!doc) {
      this.completeOp('findOne', startedAt, Codes.NotFound, _filter);
      return { success: false, kind: 'error', code: Codes.NotFound, query };
    }

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
        const docList = [doc];
        await this.includeCorrelatedDocs(docList, correlatedIncludes, correlatedSnapshots, 0, state.authorization);
        doc = docList[0];
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
    const findOneGate = new SharedHookGate(findOneHookLimit);
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
        lean,
        includePaths: [...includePaths, ...correlatedOutputPaths],
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
      const { select, populate, include } = this.resolveFindByIdArgs(args);
      const { skim, includePermissions, includeFieldPermissions, access, populateAccess, lean } =
        this.resolveFindByIdOptions(options);
      const execution = createServiceExecution(
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
        this.captureRelated(args, this.defaults.findByIdArgs),
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
        },
        { skim, includePermissions, includeFieldPermissions, access, populateAccess, lean },
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
      const execution = createServiceExecution(
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
        this.captureRelated(args, this.defaults.findArgs),
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

    const {
      select: requestedSelect,
      populate,
      include,
      sort,
      skip,
      limit,
      page,
      pageSize,
    } = this.resolveFindArgs(args);
    const { includePermissions, includeFieldPermissions, includeCount, populateAccess, lean } =
      this.resolveFindOptions(options);

    let processedInclude: ReturnType<typeof this.processInclude>;
    try {
      processedInclude = this.processInclude(include);
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

    const { includes, correlatedIncludes, includeLocalFields, includePaths, correlatedReferenceFields } =
      processedInclude;
    const correlatedOutputPaths = correlatedIncludes.map((entry) => entry.path);

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
            withAssocSelect.some(
              (field) => field === p.path || field.startsWith(`${p.path}.`) || p.path.startsWith(`${field}.`),
            ),
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

    let docs = (await this.model.find({
      ...query,
      select: dbSelect,
      hardLimit: this.options.listHardLimit,
      lean,
    })) as any[];
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
    // its own input after detaching includes, preserving output attachments
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
      ? await this.getFieldPermissionAccess(docs.map((doc) => doc._id))
      : undefined;

    // VIRT-04 + VIRT-00A D7: ONE bounded row map + shared hook gate so peak
    // active getter work stays ≤ maxHookConcurrency (never rows×getters).
    // Stable index-keyed results preserve input order; no persistence permits
    // held while awaiting finalization/hooks; limit-1 completes.
    const hookLimit = this.getVirtualHookConcurrencyLimit();
    const sharedGate = new SharedHookGate(hookLimit);
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
        lean,
        includePaths: [...includePaths, ...correlatedOutputPaths],
        sharedGate,
        privateAssociationField,
      });
      outputContexts[i] = output.context;
      return decorate ? await decorate(output.data, output.context) : output.data;
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
      const execution = createServiceExecution(
        this,
        { operation: 'create', virtualAccess: 'create', outputAccess: 'read', docPermissionsAccess: 'create' },
        options?.authorization,
        'create',
        this.captureRelated(args, this.defaults.createArgs),
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
    const { populate, select } = this.resolveCreateArgs(args);
    const { includePermissions, includeFieldPermissions, populateAccess } = this.resolveCreateOptions(options);
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
    const createGate = new SharedHookGate(hookLimit);
    const outputContexts: ServiceOutputContext[] = [];

    const createdDocs = (await this.model.create(items)) as Array<ModelDocument<TModel>>;
    const docs = await mapWithConcurrencyLimit(createdDocs, maxBulkConcurrency, async (doc, index) => {
      contexts[index].currentDocument = doc;
      doc = assertModelDocument<TModel>(
        await this.afterPersist(doc, 'create', contexts[index]),
        this.modelName,
        'afterPersist',
      );
      contexts[index].currentDocument = doc;
      contexts[index].finalDocumentSnapshot = doc.toObject({ virtuals: false }) as Record<string, unknown>;
      if (resolvedPopulate.length > 0) await this.persist(() => populateDoc(doc as Document, resolvedPopulate));
      // VIRT-05: target-model finalization after `populateDoc` resolves, before
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
        lean: false,
        sharedGate: createGate,
      });
      outputContexts[index] = output.context;
      return decorate ? await decorate(output.data, output.context) : output.data;
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

      const output = await this.finalizeDirectOutput({
        doc: data,
        plan: newPlan,
        context: newContext,
        includePermissions,
        lean: false,
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
      const execution = createServiceExecution(
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
        this.captureRelated(args, this.defaults.updateOneArgs),
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
    const { populate, select } = this.resolveUpdateOneArgs(args);
    const { includePermissions, includeFieldPermissions, populateAccess } = this.resolveUpdateOneOptions(options);
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

    if (_populate) await this.persist(() => populateDoc(doc as Document, _populate));
    // VIRT-05: target-model finalization after `populateDoc` resolves, before
    // parent getters (own plans/contexts, trimming even without virtuals).
    if (_populate) {
      const updateHookLimit = this.getVirtualHookConcurrencyLimit();
      const updateGate = new SharedHookGate(updateHookLimit);
      await this.finalizePopulateForSingleDoc(
        doc,
        _populate as Populate[],
        context,
        initiatingOperation,
        updateHookLimit,
        updateGate,
      );
    }
    const output = await this.finalizeDirectOutput({
      doc,
      plan: updatePlan,
      context,
      includePermissions,
      includeFieldPermissions,
      lean: false,
    });
    const outputDoc = decorate ? await decorate(output.data, output.context) : output.data;

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
      const { populate, select } = this.resolveUpdateByIdArgs(args);
      const { skim, includePermissions, includeFieldPermissions, populateAccess } =
        this.resolveUpdateByIdOptions(options);
      const execution = createServiceExecution(
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
        this.captureRelated(args, this.defaults.updateByIdArgs),
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
      const execution = createServiceExecution(
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
        this.captureRelated(args, this.defaults.upsertArgs),
      );
      const { populate, select } = this.resolveUpsertArgs(args);
      const { skim, includePermissions, includeFieldPermissions, populateAccess } = this.resolveUpsertOptions(options);
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
        const createExecution = deriveServiceExecution(
          this,
          execution,
          { operation: 'upsert', virtualAccess: 'create', outputAccess: 'read', docPermissionsAccess: 'create' },
          'create',
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
    // VIRT-04: registered virtuals never reach the adapter because output
    // granted them. Explicit virtual check first (scope-aware, incl.
    // embedded DB paths), then persisted allowlist (filtered for virtuals).
    // Query fields are request-schema authority, not existing model output. No
    // document exists at this stage, so hooks receive only empty document grants.
    const requestFields = () => {
      const options = this.requestRuntime.getModelOptions(this.modelName);
      return collectModelRequestFields({
        req: this.req,
        permissionSchema: options.permissionSchema as Record<string, unknown>,
        modelPermissionPrefix: options.modelPermissionPrefix,
        access: 'read',
        permissions: this.req.macl.getPermissions(),
      });
    };
    try {
      const snapshot = this.captureVirtualSnapshot();
      if (isVirtualDbPath(field, snapshot as unknown as { virtuals?: Record<string, unknown> | null })) {
        return {
          success: false,
          kind: 'error',
          code: Codes.Forbidden,
          errors: [{ detail: `Distinct field not allowed: ${field}` }],
        };
      }
      const rawAllowed = await requestFields();
      const allowedFields = this.filterAllowedFieldsForVirtuals(rawAllowed, snapshot);
      if (!isFieldAllowed(field, allowedFields)) {
        return {
          success: false,
          kind: 'error',
          code: Codes.Forbidden,
          errors: [{ detail: `Distinct field not allowed: ${field}` }],
        };
      }
      return null;
    } catch {
      const allowedFields = await requestFields();
      if (!isFieldAllowed(field, allowedFields)) {
        return {
          success: false,
          kind: 'error',
          code: Codes.Forbidden,
          errors: [{ detail: `Distinct field not allowed: ${field}` }],
        };
      }
      return null;
    }
  }

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
   * Legacy trusted count helper. Package-owned correlated execution uses
   * authenticated prepared queries instead. This separate legacy helper is
   * not a row-authorization option and retains its existing contract.
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
   * Group target document IDs by original parent-key aliases using one aggregate.
   * Resolves the requested row policy (legacy count includes pass `count`), casts
   * authorized filters/foreign operands with the target schema, and deduplicates IDs
   * independently of pagination. Cast failures return BadRequest; false policy returns
   * Forbidden. Casting does not execute countDocuments middleware/plugins.
   */
  public async countByFieldValues(
    foreignField: string,
    values: unknown[],
    filter: Filter<TModel> = {},
    access: BaseFilterAccess = 'list',
  ): Promise<SingleResult<Map<string, Set<string>>> | ErrorResult> {
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
      const execution = createServiceExecution(this, {
        operation: 'count',
        rowAccess: access,
        virtualAccess: access,
        outputAccess: access,
        docPermissionsAccess: access,
      });
      const query = await prepareModelQuery(this, execution, { kind: 'mutation-lookup', filter }, {
        [foreignField]: { $in: uniqBy(values, (value) => String(value)) },
      } as Filter<TModel>);
      return await executePreparedGroupedCount(this, execution, query, foreignField, values);
    } catch (error) {
      const result = this.getClientRequestErrorResult(error);
      if (result) return result;
      throw error;
    }
  }

  private async countPreparedByFieldValues(
    foreignField: string,
    values: readonly unknown[],
    filter: Filter<TModel>,
  ): Promise<SingleResult<Map<string, Set<string>>> | ErrorResult> {
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
    const uniqueValues = uniqBy([...values], (value) => String(value));
    // Also constrain private callers; row transforms can never erase this join.
    filter = intersectFilters(filter, { [foreignField]: { $in: uniqueValues } } as Filter<TModel>);

    const query = { filter };

    if (filter === false) return { success: false, kind: 'error', code: Codes.Forbidden, query };
    let matchFilter = filter as Record<string, unknown>;
    let castValues = uniqueValues;
    try {
      if (this.model.castFilter) {
        matchFilter = this.model.castFilter(matchFilter);
        // Cast against the real foreign path, before projection renames it.
        // Keep this independent of ACL query transformation/scope composition.
        const foreignFilter = this.model.castFilter({ [foreignField]: { $in: uniqueValues } });
        castValues = foreignFilter[foreignField]?.$in;
        if (!Array.isArray(castValues) || castValues.length !== uniqueValues.length) {
          throw new Error('Foreign field query casting must retain the join operands');
        }
      }
    } catch {
      // Only synchronous schema casting is in this boundary, never persistence.
      // Avoid exposing values from trusted ACL filters in the client error detail.
      return {
        success: false,
        kind: 'error',
        code: Codes.BadRequest,
        errors: [{ detail: 'Invalid grouped include count filter or foreign-key value' }],
      };
    }

    const rows = (await this.model.aggregate([
      { $match: matchFilter },
      {
        $project: {
          foreignValues: {
            $cond: [{ $isArray: `$${foreignField}` }, `$${foreignField}`, [`$${foreignField}`]],
          },
        },
      },
      { $unwind: '$foreignValues' },
      { $match: { foreignValues: { $in: castValues } } },
      { $group: { _id: '$foreignValues', documentIds: { $addToSet: '$_id' } } },
    ])) as Array<{ _id: unknown; documentIds: unknown[] }>;

    const grouped = new Map<string, Set<string>>();
    for (const row of rows) {
      const key = String(row._id);
      const ids = grouped.get(key) ?? new Set<string>();
      for (const id of row.documentIds) ids.add(String(id));
      grouped.set(key, ids);
    }
    const counts = new Map<string, Set<string>>();
    for (let i = 0; i < uniqueValues.length; i++) {
      // Casting can normalize a key (uppercase ObjectId hex, string setters,
      // numeric strings). Attachment still looks up the original parent key.
      const ids = grouped.get(String(castValues[i]));
      if (ids) counts.set(String(uniqueValues[i]), ids);
    }

    return { success: true, kind: 'single', code: Codes.Success, data: counts, query };
  }

  public getDocPermissions(doc: unknown): Record<string, unknown> {
    return getDocPermissions(this.modelName, doc);
  }

  private resolveFindOneArgs(args: FindOneArgs<TModel> = {}) {
    return resolveFindOneArgs(this, args);
  }

  private resolveFindOneOptions(options: FindOneOptions = {}) {
    return resolveFindOneOptions(this, options);
  }

  private resolveFindByIdArgs(args: FindByIdArgs<TModel> = {}) {
    return resolveFindByIdArgs(this, args);
  }

  private resolveFindByIdOptions(options: FindByIdOptions = {}) {
    return resolveFindByIdOptions(this, options);
  }

  private resolveFindArgs(args: FindArgs<TModel> = {}) {
    return resolveFindArgs(this, args);
  }

  private resolveFindOptions(options: FindOptions = {}) {
    return resolveFindOptions(this, options);
  }

  private resolveCreateArgs(args: CreateArgs = {}) {
    return resolveCreateArgs(this, args);
  }

  private resolveCreateOptions(options: CreateOptions = {}) {
    return resolveCreateOptions(this, options);
  }

  private resolveUpdateOneArgs(args: UpdateOneArgs<TModel> = {}) {
    return resolveUpdateOneArgs(this, args);
  }

  private resolveUpdateOneOptions(options: UpdateOneOptions = {}) {
    return resolveUpdateOneOptions(this, options);
  }

  private resolveUpdateByIdArgs(args: UpdateByIdArgs<TModel> = {}) {
    return resolveUpdateByIdArgs(this, args);
  }

  private resolveUpdateByIdOptions(options: UpdateByIdOptions = {}) {
    return resolveUpdateByIdOptions(this, options);
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

  public async getParentDoc(
    id: SubdocumentId,
    sub: SubdocumentName,
    args?: SubdocumentParentArgs,
    options?: SubdocumentParentOptions,
  ) {
    return getParentDocImpl(this, id, sub, args, options);
  }
}
