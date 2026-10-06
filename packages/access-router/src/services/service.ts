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
import { planVirtualProjection, type VirtualProjectionPlan } from '../acl/virtual-projection';
import { finalizeModelOutput, type FinalizeSnapshot } from '../output/finalize-model-output';
import {
  VIRT_ASSOCIATION_FIELD,
  VIRT_ASSOCIATION_VALUES,
  excludeVirtualsFromAllowedFields,
  isVirtualDbPath,
  sanitizeEmbeddedVirtualKeys,
  stripVirtualKeysFromFilter,
} from './base';
import { getPopulateTargetMeta, type PopulateTargetMeta } from '../acl/populate-target';
import { deepIsolateValue, getDocValue, setDocValue } from '../helpers/document';
import { getActiveRuntime } from '../runtime-context';
import { getModelRef as getModelRefWithDotted } from '../meta';
import { applyUpdate } from '../helpers/apply-update';
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

const shouldKeepCorrelatedRef = (ref: string, keep: Set<string>): boolean => {
  if (keep.has(ref)) return true;
  const top = ref.split('.')[0];
  if (keep.has(top)) return true;
  // A selected dotted subpath (e.g. select a.b) implies its parent chain was
  // fetched; keep the parent object rather than stripping the whole branch.
  for (const kept of keep) {
    if (kept === ref || kept.startsWith(`${ref}.`) || ref.startsWith(`${kept}.`)) return true;
  }
  return false;
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
 *   via existing public picks after decorate/tasks). Internal create/update
 *   args omit `select`; `overrides.effectiveSelect` is the deliberate
 *   transport (see `interfaces/service-create.ts`, `service-update.ts`).
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

  /**
   * Router posture `stripPermissionsField`: drop the whole document
   * permissions field (including the empty placeholder) from output instead
   * of emitting permission metadata. Returns true when applied.
   */
  private stripPermissionsOutput(doc: unknown): boolean {
    if (!this.options.stripPermissionsField) return false;
    const field = this.options.documentPermissionField;
    if (field) unsetDocPath(doc, field);
    return true;
  }

  private asServiceHookContext(context: ModelHookContext): ServiceHookContext {
    return context as ServiceHookContext;
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

  public buildVirtualPlan(args: {
    snapshot: FinalizeSnapshot;
    virtualAccess: VirtualOperationAccess;
    outputAccess: VirtualOperationAccess;
    docPermissionsAccess: VirtualOperationAccess;
    requestedSelect?: Projection;
    effectiveSelect?: Projection;
    internalFetch?: {
      baseFields?: string[];
      joinFields?: string[];
      identityFields?: string[];
      extraPersistedFields?: string[];
      trustedOverrideSelect?: Projection;
    };
  }): VirtualProjectionPlan {
    const { snapshot, virtualAccess, outputAccess, docPermissionsAccess, internalFetch } = args;
    const hasEffective = Object.prototype.hasOwnProperty.call(args, 'effectiveSelect');
    return planVirtualProjection({
      receivingModelName: this.modelName,
      snapshot: {
        permissionSchema: snapshot.permissionSchema ?? null,
        virtuals: snapshot.virtuals ?? null,
        alwaysSelectFields: snapshot.alwaysSelectFields ?? null,
        modelPermissionPrefix: snapshot.modelPermissionPrefix ?? '',
        requireExplicitSelect: snapshot.requireExplicitSelect ?? false,
        documentPermissionField: snapshot.documentPermissionField ?? '_permissions',
      },
      virtualAccess,
      outputAccess,
      docPermissionsAccess,
      requestedSelect: args.requestedSelect,
      ...(hasEffective ? { effectiveSelect: args.effectiveSelect } : {}),
      scopePath: [],
      internalFetch: internalFetch ?? {},
      globalPermissions: this.getVirtualGlobalPermissions(),
    });
  }

  /**
   * VIRT-06 sub-scope planner.
   *
   * Builds a `planVirtualProjection` with `scopePath=[sub,'sub']` for
   * dedicated subdocument routes (`virtuals.<field>.sub.<name>.<access>`).
   * `dependsOn` resolves relative to that scope (VIRT-00A D5); literal
   * `.sub` segments never become DB/response names (planner strips them).
   * Uses the same coherent `snapshot` captured once per sub op.
   */
  public buildSubVirtualPlan(
    sub: string,
    snapshot: FinalizeSnapshot,
    virtualAccess: VirtualOperationAccess,
    outputAccess: VirtualOperationAccess,
    docPermissionsAccess: VirtualOperationAccess,
    requestedSelect?: Projection,
    effectiveSelect?: Projection,
  ): VirtualProjectionPlan {
    const hasEffective = effectiveSelect !== undefined || requestedSelect !== undefined;
    // For sub scopes, `requireExplicitSelect` still applies at sub level:
    // omitted sub select behaves per planner (all vs _id-only when required).
    // Pass through both so planner gating stays coherent.
    const args: {
      receivingModelName: string;
      snapshot: {
        permissionSchema: Record<string, unknown> | null;
        virtuals: Record<string, unknown> | null;
        alwaysSelectFields: string[] | Record<string, string[]> | null;
        modelPermissionPrefix: string;
        requireExplicitSelect: boolean;
        documentPermissionField: string;
      };
      virtualAccess: VirtualOperationAccess;
      outputAccess: VirtualOperationAccess;
      docPermissionsAccess: VirtualOperationAccess;
      requestedSelect?: Projection;
      effectiveSelect?: Projection;
      scopePath: string[];
      internalFetch: Record<string, never>;
      globalPermissions: { has: (key: string) => boolean; hasKey: (key: string) => boolean };
    } = {
      receivingModelName: this.modelName,
      snapshot: {
        permissionSchema: snapshot.permissionSchema ?? null,
        virtuals: snapshot.virtuals ?? null,
        alwaysSelectFields: snapshot.alwaysSelectFields ?? null,
        modelPermissionPrefix: snapshot.modelPermissionPrefix ?? '',
        requireExplicitSelect: snapshot.requireExplicitSelect ?? false,
        documentPermissionField: snapshot.documentPermissionField ?? '_permissions',
      },
      virtualAccess,
      outputAccess,
      docPermissionsAccess,
      scopePath: [sub, 'sub'],
      internalFetch: {},
      globalPermissions: this.getVirtualGlobalPermissions(),
    };
    if (requestedSelect !== undefined) args.requestedSelect = requestedSelect;
    if (hasEffective) args.effectiveSelect = (effectiveSelect ?? requestedSelect) as Projection;
    return planVirtualProjection(args);
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

  /**
   * Output-only write admission (VIRT-04 requirement 4). Excludes registered
   * virtual names for any access (including bare `true` rules and inactive
   * descriptors) and sanitizes registered embedded virtual keys inside
   * whole-object/array grants. Trusted prepare/transform authority is
   * preserved (this runs on client data before validation only); computed
   * values are assigned only to output copies by the finalizer.
   */
  private admitWriteDataForVirtuals<T extends Record<string, unknown>>(allowedData: T, snapshot: FinalizeSnapshot): T {
    return sanitizeEmbeddedVirtualKeys(
      allowedData,
      snapshot as unknown as { virtuals?: Record<string, unknown> | null },
    );
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
      const virtualValue = (originalDoc as unknown as { permissions?: unknown }).permissions;
      if (virtualValue === undefined) return;
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
    return dbSelect;
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

  private captureTargetSnapshotForPopulate(targetModelName: string): FinalizeSnapshot {
    try {
      const opts = getModelOptions(targetModelName) as Record<string, unknown>;
      return {
        permissionSchema: (opts.permissionSchema as Record<string, unknown> | null | undefined) ?? null,
        virtuals: (opts.virtuals as Record<string, unknown> | null | undefined) ?? null,
        alwaysSelectFields: (opts.alwaysSelectFields as string[] | Record<string, string[]> | null | undefined) ?? null,
        modelPermissionPrefix: (opts.modelPermissionPrefix as string | undefined) ?? '',
        requireExplicitSelect: (opts.requireExplicitSelect as boolean | undefined) ?? false,
        documentPermissionField: (opts.documentPermissionField as string | undefined) ?? '_permissions',
        exposedDocPermissionKeys: opts.exposedDocPermissionKeys as string[] | undefined,
        stripPermissionsField: (opts.stripPermissionsField as boolean | undefined) ?? false,
        disableFieldPermissions: (opts.disableFieldPermissions as boolean | undefined) ?? false,
      };
    } catch {
      return {
        permissionSchema: null,
        virtuals: null,
        alwaysSelectFields: null,
        modelPermissionPrefix: '',
        requireExplicitSelect: false,
        documentPermissionField: '_permissions',
      };
    }
  }

  private resolvePopulateMeta(entry: Populate): PopulateTargetMeta | undefined {
    const existing = getPopulateTargetMeta(entry);
    if (existing) return existing;
    // Fallback for trusted `overrides.populate` that bypassed `genPopulate`:
    // build a target plan on demand with the target's own definitions/access.
    // Unregistered targets stay raw (no trim), preserving
    // `requireRegisteredPopulateModels` semantics for the bypass path.
    try {
      const path = (entry as Populate).path;
      if (typeof path !== 'string' || path.length === 0) return undefined;
      const refModelName = getModelRefWithDotted(this.modelName, path);
      if (!refModelName) return undefined;
      const runtime = (this.requestRuntime as unknown as { hasModel?: (m: string) => boolean }) ?? getActiveRuntime();
      if (runtime?.hasModel && !runtime.hasModel(refModelName)) return undefined;
      const planAccess = (entry as Populate).access ?? 'read';
      const snapshot = this.captureTargetSnapshotForPopulate(refModelName);
      const plan = planVirtualProjection({
        receivingModelName: refModelName,
        snapshot: {
          permissionSchema: snapshot.permissionSchema ?? null,
          virtuals: snapshot.virtuals ?? null,
          alwaysSelectFields: snapshot.alwaysSelectFields ?? null,
          modelPermissionPrefix: snapshot.modelPermissionPrefix ?? '',
          requireExplicitSelect: snapshot.requireExplicitSelect ?? false,
          documentPermissionField: snapshot.documentPermissionField ?? '_permissions',
        },
        virtualAccess: planAccess,
        outputAccess: planAccess,
        docPermissionsAccess: planAccess,
        requestedSelect: (entry as Populate).select as never,
        internalFetch: { baseFields: ['_id'] },
        globalPermissions: this.getVirtualGlobalPermissions(),
      });
      const meta: PopulateTargetMeta = {
        targetModelName: refModelName,
        virtualAccess: planAccess,
        outputAccess: planAccess,
        docPermissionsAccess: planAccess,
        requestedSelect: (entry as Populate).select,
        plan,
        snapshot,
      };
      return meta;
    } catch {
      return undefined;
    }
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
    let targetMongooseModel: unknown;
    try {
      const inst = (this.requestRuntime as { getModelInstance?: (n: string) => unknown }).getModelInstance?.(
        meta.targetModelName,
      ) as { mongooseModel?: unknown } | unknown;
      void inst;
      targetMongooseModel = parentContext.mongooseModel;
    } catch {
      targetMongooseModel = parentContext.mongooseModel;
    }
    const targetContext: ModelHookContext = {
      mongooseModel: (targetMongooseModel as never) ?? parentContext.mongooseModel,
      modelName: meta.targetModelName,
      operation: parentContext.operation ?? parentOperation,
      resolvedQuery: parentContext.resolvedQuery ?? {},
    };
    const finalized = await finalizeModelOutput({
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
    return finalized;
  }

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
      const meta = this.resolvePopulateMeta(entry as Populate);
      // No retained plan (unregistered bypass): leave raw, preserving
      // `requireRegisteredPopulateModels: false` passthrough. Registered
      // targets always have plans (even without virtuals) so trimming still
      // closes the asymmetry.
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
    this.baseFields = ['_id'];
    this.baseFieldsExt = this.baseFields.concat(this.options.documentPermissionField);
  }

  public async findOne(
    filter: Filter<TModel>,
    args?: FindOneArgs<TModel>,
    options?: FindOneOptions,
  ): Promise<SingleResult<TModel> | ErrorResult> {
    // VIRT-04: capture one coherent snapshot for planning + finalization.
    const virtualSnapshot = this.captureVirtualSnapshot();
    const filterErrors = this.validateClientFilter(filter);
    if (filterErrors.length > 0) return { success: false, kind: 'error', code: Codes.BadRequest, errors: filterErrors };

    const { select: requestedSelect, sort, populate, include, overrides } = this.resolveFindOneArgs(args);
    const select = this.resolveEffectiveSelect(requestedSelect);
    const { skim, includePermissions, includeFieldPermissions, access, populateAccess, lean } =
      this.resolveFindOneOptions(options);

    const { filter: overrideFilter, select: overrideSelect, populate: overridePopulate } = overrides ?? {};

    let parsedFilter: Filter<TModel>;
    let processedInclude: ReturnType<typeof this.processInclude>;
    try {
      processedInclude = this.processInclude(include);
      // A trusted denial must not dispatch subqueries while parsing client data.
      parsedFilter = overrideFilter === false ? false : await this.parseClientData(filter);
    } catch (error) {
      const result = this.getClientRequestErrorResult(error);
      if (result) return result;
      throw error;
    }

    const queryParts = await Promise.all([
      overrideFilter ?? this.genFilter(access, parsedFilter),
      overrideSelect || this.genQuerySelect(access, select),
      overridePopulate || this.genPopulate(populateAccess || access, populate),
      this.genAllowedFields({}, access, this.baseFieldsExt),
    ]).catch((error: unknown) => {
      const result = this.getClientRequestErrorResult(error);
      if (result) return result;
      throw error;
    });
    if (!Array.isArray(queryParts)) return queryParts;
    let [_filter, _select, _populate, allowedSortFields] = queryParts;

    // VIRT-04: exclude registered virtuals from DB filter before dispatch.
    // `false` (terminal deny) passes through untouched.
    if (_filter !== false) {
      _filter = this.stripVirtualsFromFilterForSnapshot(_filter, virtualSnapshot);
    }

    const { includes, correlatedIncludes, includeLocalFields, includePaths, correlatedReferenceFields } =
      processedInclude;
    const correlatedOutputPaths = correlatedIncludes.map((entry) => entry.path);
    // VIRT-04: plan fetch vs output (VIRT-02) with effective accesses.
    // `access` is effective (`read` or `list` fallback); `operation` stays
    // initiating (`read`) per VIRT-00A D1.
    const effectiveAccess = access as VirtualOperationAccess;
    const virtualPlan = this.buildVirtualPlan({
      snapshot: virtualSnapshot,
      virtualAccess: effectiveAccess,
      outputAccess: effectiveAccess,
      docPermissionsAccess: effectiveAccess,
      requestedSelect,
      effectiveSelect: select,
      internalFetch: {
        baseFields: ['_id'],
        joinFields: [...includeLocalFields, ...correlatedReferenceFields],
        extraPersistedFields: [],
        trustedOverrideSelect: overrideSelect,
      },
    });
    const mergedSelect = uniq([
      ...normalizeSelect(_select),
      ...virtualPlan.persistedFetchSelection,
      ...includeLocalFields,
      ...correlatedReferenceFields,
    ]);
    const finalSelect = mergedSelect;
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
      select: finalSelect,
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
      operation: 'read',
      originalDocumentSnapshot: toObject(doc),
      resolvedQuery: query,
    };

    // Stable snapshot for correlated references (ACI-01 D7.3): fetched from
    // persistence including internal-only reference fields, before legacy
    // include attachment, decorate, and task mutation.
    const correlatedSnapshots = [cloneDeep(toObject(doc))];

    try {
      doc = await this.includeDocs(doc, includes);
      if (correlatedIncludes.length > 0) {
        const docList = [doc];
        await this.includeCorrelatedDocs(docList, correlatedIncludes, correlatedSnapshots);
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

    let includeDocPermissions = includePermissions;
    // Requested field maps need doc grants as grant input, so compute them
    // even under skim when field permissions are enabled.
    if (!includeDocPermissions && (!skim || includeFieldPermissions)) {
      includeDocPermissions = this.checkIfModelPermissionExists([access, 'read', 'update']);
    }
    // VIRT-04: virtuals need internal grants even when response metadata is
    // disabled. The existing skim check above already computes grants when a
    // docPermissions hook exists; when virtual candidates exist but no hook
    // output was requested, still compute so deferred rules evaluate.
    if (!includeDocPermissions && virtualPlan.candidates.length > 0) {
      includeDocPermissions = this.checkIfModelPermissionExists([effectiveAccess, 'read', 'update']);
    }
    if (includeDocPermissions) doc = await this.addDocPermissions(doc, effectiveAccess, context);
    if (includeFieldPermissions) doc = await this.addFieldPermissions(doc, effectiveAccess, context);
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
    // VIRT-04: preserve include outputs across the shared finalizer (VIRT-05
    // owns join-key transport + target re-finalization; here we keep already
    // finalized target rows without a second getter pass).
    const savedIncludeValues = new Map<string, unknown>();
    for (const incPath of [...includePaths, ...correlatedOutputPaths]) {
      try {
        const val = getDocValue(doc, incPath);
        if (val !== undefined) {
          savedIncludeValues.set(incPath, cloneDeep(val));
          unsetDocPath(doc, incPath);
        }
      } catch {
        // leave doc unchanged on path errors
      }
    }
    const suppliedGrants = getDocPermissions(this.modelName, doc) as Record<string, unknown>;
    const originalForPermissions = doc;
    let finalized: Record<string, unknown>;
    try {
      finalized = await finalizeModelOutput({
        receivingModelName: this.modelName,
        input: doc,
        virtualAccess: effectiveAccess,
        outputAccess: effectiveAccess,
        docPermissionsAccess: effectiveAccess,
        scopePath: [],
        plan: virtualPlan,
        snapshot: virtualSnapshot,
        request: this.req as unknown as never,
        context,
        operation: 'read',
        // VIRT-04: always supply grants (even empty) so the finalizer never
        // re-invokes the docPermissions hook. This preserves existing
        // skim/metadata posture for persisted fields (empty grants stay
        // denied) while still providing internal grants for virtuals when
        // they were computed above (candidates need). No second hook call.
        docPermissions: suppliedGrants ?? {},
        concurrencyLimit: findOneHookLimit,
        sharedGate: findOneGate,
      });
      this.preservePermissionsVirtual(originalForPermissions, finalized, lean);
    } catch (error) {
      const result = this.getClientRequestErrorResult(error);
      if (result) {
        this.completeOp('findOne', startedAt, result.code, _filter);
        return { ...result, query };
      }
      throw error;
    }
    // Restore include outputs (already finalized by target services).
    for (const [incPath, val] of savedIncludeValues) {
      try {
        set(finalized as object, incPath, val);
      } catch {
        // leave finalized unchanged on path errors
      }
    }
    doc = finalized as unknown as typeof doc;
    // Trusted override selects are fetch-only for virtuals (stripped without
    // grant in planning); persisted override output forcing is already
    // represented in the DB projection and finalizer output eligibility.
    // No second grant or denied-data reintroduction here.
    if (correlatedReferenceFields.length > 0) {
      const keep = new Set([
        ...normalizeSelect(_select),
        ...normalizeSelect(overrideSelect),
        ...this.baseFieldsExt,
        ...includePaths,
        ...correlatedOutputPaths,
      ]);
      for (const ref of correlatedReferenceFields) {
        if (!shouldKeepCorrelatedRef(ref, keep)) unsetDocPath(doc, ref);
      }
    }
    if (!this.stripPermissionsOutput(doc)) {
      if (!includePermissions && !includeFieldPermissions) doc = this.addEmptyPermissions(doc);
      stripUnexposedDocPermissions(this.modelName, doc);
    }

    this.completeOp('findOne', startedAt, Codes.Success, _filter);
    return { success: true, kind: 'single', code: Codes.Success, data: doc as TModel, query, context };
  }

  public async findById(
    id: string,
    args?: FindByIdArgs<TModel>,
    options?: FindByIdOptions,
  ): Promise<SingleResult<TModel> | ErrorResult> {
    const { select, populate, include, overrides } = this.resolveFindByIdArgs(args);
    const { skim, includePermissions, includeFieldPermissions, access, populateAccess, lean } =
      this.resolveFindByIdOptions(options);

    const { select: overrideSelect, populate: overridePopulate, idFilter: overrideIdFilter } = overrides ?? {};
    const filter = overrideIdFilter ?? (await this.genIDFilter(id));
    if (filter === false) return { success: false, kind: 'error', code: Codes.Forbidden, query: { filter } };

    return this.findOne(
      filter,
      {
        select,
        populate,
        include,
        overrides: {
          select: overrideSelect,
          populate: overridePopulate,
        },
      },
      { skim, includePermissions, includeFieldPermissions, access, populateAccess, lean },
    );
  }

  public async find(
    filter: Filter<TModel>,
    args?: FindArgs<TModel>,
    options?: FindOptions,
    decorate?: (doc: unknown, context?: ModelHookContext) => unknown,
  ): Promise<ListResult<TModel> | ErrorResult> {
    const virtualSnapshot = this.captureVirtualSnapshot();
    const filterErrors = this.validateClientFilter(filter);
    if (filterErrors.length > 0) return { success: false, kind: 'error', code: Codes.BadRequest, errors: filterErrors };

    const {
      select: requestedSelect,
      populate,
      include,
      sort,
      skip,
      limit,
      page,
      pageSize,
      overrides,
    } = this.resolveFindArgs(args);
    const select = this.resolveEffectiveSelect(requestedSelect);
    const { skim, includePermissions, includeFieldPermissions, includeCount, populateAccess, lean } =
      this.resolveFindOptions(options);

    const { filter: overrideFilter, select: overrideSelect, populate: overridePopulate } = overrides ?? {};

    let parsedFilter: Filter<TModel>;
    let processedInclude: ReturnType<typeof this.processInclude>;
    try {
      processedInclude = this.processInclude(include);
      // A trusted denial must not dispatch subqueries while parsing client data.
      parsedFilter = overrideFilter === false ? false : await this.parseClientData(filter);
    } catch (error) {
      const result = this.getClientRequestErrorResult(error);
      if (result) return result;
      throw error;
    }

    const queryParts = await Promise.all([
      overrideFilter ?? this.genFilter('list', parsedFilter),
      overrideSelect || this.genQuerySelect('list', select),
      overridePopulate || this.genPopulate(populateAccess, populate),
      genPagination({ skip, limit, page, pageSize }, this.options.listHardLimit),
      this.genAllowedFields({}, 'list', this.baseFieldsExt),
    ]).catch((error: unknown) => {
      const result = this.getClientRequestErrorResult(error);
      if (result) return result;
      throw error;
    });
    if (!Array.isArray(queryParts)) return queryParts;
    let [_filter, _select, _populate, pagination, rawAllowedSortFields] = queryParts;

    if (_filter !== false) {
      _filter = this.stripVirtualsFromFilterForSnapshot(_filter, virtualSnapshot);
    }

    const { includes, correlatedIncludes, includeLocalFields, includePaths, correlatedReferenceFields } =
      processedInclude;
    const correlatedOutputPaths = correlatedIncludes.map((entry) => entry.path);

    // VIRT-04: fetch vs output planning (VIRT-02) for list/list/list.
    const virtualPlan = this.buildVirtualPlan({
      snapshot: virtualSnapshot,
      virtualAccess: 'list',
      outputAccess: 'list',
      docPermissionsAccess: 'list',
      requestedSelect,
      effectiveSelect: select,
      internalFetch: {
        baseFields: ['_id'],
        joinFields: [...includeLocalFields, ...correlatedReferenceFields],
        extraPersistedFields: [],
        trustedOverrideSelect: overrideSelect,
      },
    });
    const baseSelect = normalizeSelect(_select);
    const finalSelect = uniq([
      ...baseSelect,
      ...virtualPlan.persistedFetchSelection,
      ...includeLocalFields,
      ...correlatedReferenceFields,
    ]);
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
        ? _populate.filter((p) => withAssocSelect.includes(p.path.split('.')[0]))
        : _populate;

    const allowedSortFields = this.filterAllowedFieldsForVirtuals(rawAllowedSortFields, virtualSnapshot);

    const effectiveAllowedSortFields = this.getEffectiveAllowedSortFields(allowedSortFields);
    const stripDisallowedSort = this.options?.stripDisallowedSort ?? false;
    const sanitizedSort = stripDisallowedSort ? sanitizeSortFields(sort, effectiveAllowedSortFields) : null;
    const effectiveSort = stripDisallowedSort ? (sanitizedSort?.sort as typeof sort) : sort;

    const query = {
      filter: _filter,
      select: withAssocSelect
        .concat(includeLocalFields, correlatedReferenceFields)
        .filter((v, i, a) => a.indexOf(v) === i),
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
      select: dbSelect.concat(includeLocalFields, correlatedReferenceFields).filter((v, i, a) => a.indexOf(v) === i),
      hardLimit: this.options.listHardLimit,
      lean,
    })) as any[];
    // VIRT-05 association capture (before trim/nested): immutable values
    // aligned to rows for the caller's join index.
    const capturedAssociation = findAssociationField
      ? this.captureAssociationValues(docs, findAssociationField)
      : undefined;
    // VIRT-05 getter isolation: association-only FKs (neither declared as a
    // virtual dependency nor ordinarily selected/allowed) must not leak into
    // target getter input. Strip them from raw docs before finalization (join
    // still works via captured values above). `_id` is always retained for
    // policy/identity work; output `-_id` is still honored by the finalizer.
    // Snapshots above already cloned raw values for nested correlation.
    if (findAssociationField && findAssociationField !== '_id') {
      try {
        const normalizedRequested = normalizeSelect(_select).map((t) => (t.startsWith('-') ? t.slice(1) : t));
        const isDep = (virtualPlan.virtualOnlyDeps ?? []).includes(findAssociationField);
        const isSelected = normalizedRequested.includes(findAssociationField);
        if (!isDep && !isSelected) {
          for (const d of docs) {
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

    const contexts: ModelHookContext[] = docs.map((doc) => ({
      mongooseModel: this.model.mongooseModel,
      modelName: this.modelName,
      operation: 'list',
      originalDocumentSnapshot: toObject(doc) as Record<string, unknown>,
      resolvedQuery: query,
    }));

    const _decorate: (...args: unknown[]) => unknown = isFunction(decorate) ? decorate : (v) => v;

    const correlatedSnapshots = docs.map((doc) => cloneDeep(toObject(doc)));

    try {
      docs = await this.includeDocs(docs, includes);
      if (correlatedIncludes.length > 0) {
        docs = (await this.includeCorrelatedDocs(docs, correlatedIncludes, correlatedSnapshots)) as any[];
      }
    } catch (error) {
      const result = this.getClientRequestErrorResult(error);
      if (result) {
        this.completeOp('find', startedAt, result.code, _filter);
        return { ...result, query };
      }
      throw error;
    }

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

      let includeDocPermissions = includePermissions;
      // Requested field maps need doc grants as grant input, so compute them
      // even under skim when field permissions are enabled.
      if (!includeDocPermissions && (!skim || includeFieldPermissions)) {
        includeDocPermissions = this.checkIfModelPermissionExists(['list', 'read', 'update']);
      }
      if (!includeDocPermissions && virtualPlan.candidates.length > 0) {
        includeDocPermissions = this.checkIfModelPermissionExists(['list', 'read', 'update']);
      }
      if (includeDocPermissions) doc = await this.addDocPermissions(doc, 'list', contexts[i]);
      if (includeFieldPermissions) doc = await this.addFieldPermissions(doc, 'list', contexts[i]);
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
      const savedIncludes = new Map<string, unknown>();
      for (const incPath of [...includePaths, ...correlatedOutputPaths]) {
        try {
          const val = getDocValue(doc, incPath);
          if (val !== undefined) {
            savedIncludes.set(incPath, cloneDeep(val));
            unsetDocPath(doc, incPath);
          }
        } catch {
          // leave unchanged
        }
      }
      const grants = getDocPermissions(this.modelName, doc) as Record<string, unknown>;
      const originalForPermissions = doc;
      const finalized: Record<string, unknown> = await finalizeModelOutput({
        receivingModelName: this.modelName,
        input: doc,
        virtualAccess: 'list',
        outputAccess: 'list',
        docPermissionsAccess: 'list',
        scopePath: [],
        plan: virtualPlan,
        snapshot: virtualSnapshot,
        request: this.req as unknown as never,
        context: contexts[i],
        operation: 'list',
        docPermissions: grants ?? {},
        concurrencyLimit: hookLimit,
        sharedGate,
      });
      this.preservePermissionsVirtual(originalForPermissions, finalized, lean);
      for (const [incPath, val] of savedIncludes) {
        try {
          set(finalized as object, incPath, val);
        } catch {
          // leave unchanged
        }
      }
      doc = finalized as unknown as typeof doc;
      if (correlatedReferenceFields.length > 0) {
        const keep = new Set([
          ...normalizeSelect(_select),
          ...normalizeSelect(overrideSelect),
          ...this.baseFieldsExt,
          ...includePaths,
          ...correlatedOutputPaths,
        ]);
        for (const ref of correlatedReferenceFields) {
          if (!shouldKeepCorrelatedRef(ref, keep)) unsetDocPath(doc, ref);
        }
      }
      doc = await _decorate(doc, contexts[i]);
      if (!this.stripPermissionsOutput(doc)) {
        if (!includePermissions && !includeFieldPermissions) doc = this.addEmptyPermissions(doc);
        stripUnexposedDocPermissions(this.modelName, doc);
      }

      return doc;
    });

    this.completeOp('find', startedAt, Codes.Success, _filter);
    const listResult = {
      success: true,
      kind: 'list',
      code: Codes.Success,
      data: docs as TModel[],
      count: docs.length,
      totalCount: includeCount ? await this.model.countDocuments(_filter) : null,
      query,
      contexts,
    } as ListResult<TModel> & Record<symbol, unknown>;
    // VIRT-05 association metadata (service-only, outside serializers): paired
    // immutable FK values for the caller's join index. Never output-granted.
    if (capturedAssociation) {
      (listResult as Record<symbol, unknown>)[VIRT_ASSOCIATION_VALUES] = capturedAssociation;
    }
    return listResult as ListResult<TModel>;
  }

  public async create(
    data: Record<string, unknown> | Record<string, unknown>[],
    args?: CreateArgs,
    options?: CreateOptions,
    decorate?: (doc: unknown, context?: ModelHookContext) => unknown,
  ): Promise<ListResult<TModel> | ErrorResult> {
    const virtualSnapshot = this.captureVirtualSnapshot();
    const { populate, overrides } = this.resolveCreateArgs(args);
    const { skim, includePermissions, includeFieldPermissions, populateAccess } = this.resolveCreateOptions(options);
    const initiatingOperation = (overrides as { operation?: string } | undefined)?.operation ?? 'create';
    const hasEffectiveSelect = overrides && Object.prototype.hasOwnProperty.call(overrides, 'effectiveSelect');
    const effectiveSelect = hasEffectiveSelect
      ? (overrides as { effectiveSelect?: Projection }).effectiveSelect
      : undefined;

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
      resolvedPopulate = populate ? await this.genPopulate(populateAccess, populate) : [];
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

      const rawAllowed = await this.genAllowedFields(item, 'create');
      // VIRT-04 output-only: exclude registered virtuals for any access.
      const allowedFields = this.filterAllowedFieldsForVirtuals(rawAllowed, virtualSnapshot);
      const allowedData = this.admitWriteDataForVirtuals(
        pick(item, allowedFields) as Record<string, unknown>,
        virtualSnapshot,
      );
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
      const preparedData = await this.prepare(allowedData, 'create', contexts[index]);
      contexts[index].preparedData = preparedData;
      return preparedData;
    });

    const _decorate: (...args: unknown[]) => unknown = isFunction(decorate) ? decorate : (v) => v;

    // VIRT-04: effective mutation selection into internal finalization (D6).
    // Explicit `select` or `undefined` (all); public `_create` still picks
    // after decorate/tasks. Dependencies fetched only for virtuals never
    // reach decorate/tasks as ordinary fields (finalizer strips internal-only).
    const createPlan = this.buildVirtualPlan({
      snapshot: virtualSnapshot,
      virtualAccess: 'create',
      outputAccess: 'read',
      docPermissionsAccess: 'create',
      requestedSelect: effectiveSelect,
      effectiveSelect,
      internalFetch: {},
    });
    const hookLimit = this.getVirtualHookConcurrencyLimit();
    const createGate = new SharedHookGate(hookLimit);

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
      let includeDocPermissions = includePermissions;
      // Requested field maps need doc grants as grant input, so compute them
      // even under skim when field permissions are enabled.
      if (!includeDocPermissions && (!skim || includeFieldPermissions)) {
        includeDocPermissions = this.checkIfModelPermissionExists(['create', 'read', 'update']);
      }
      if (!includeDocPermissions && createPlan.candidates.length > 0) {
        includeDocPermissions = this.checkIfModelPermissionExists(['create', 'read', 'update']);
      }
      if (includeDocPermissions) doc = await this.addDocPermissions(doc, 'create', contexts[index]);
      if (includeFieldPermissions) doc = await this.addFieldPermissions(doc, 'read', contexts[index]);
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
      const grants = getDocPermissions(this.modelName, doc) as Record<string, unknown>;
      const originalForPermissionsCreate = doc;
      const finalized: Record<string, unknown> = await finalizeModelOutput({
        receivingModelName: this.modelName,
        input: doc,
        virtualAccess: 'create',
        outputAccess: 'read',
        docPermissionsAccess: 'create',
        scopePath: [],
        plan: createPlan,
        snapshot: virtualSnapshot,
        request: this.req as unknown as never,
        context: contexts[index],
        operation: initiatingOperation,
        docPermissions: grants ?? {},
        concurrencyLimit: hookLimit,
        sharedGate: createGate,
      });
      this.preservePermissionsVirtual(originalForPermissionsCreate, finalized, false);
      let outputDoc: unknown = finalized;
      outputDoc = await _decorate(outputDoc, contexts[index]);
      if (!this.stripPermissionsOutput(outputDoc)) {
        if (!includePermissions && !includeFieldPermissions) outputDoc = this.addEmptyPermissions(outputDoc);
        stripUnexposedDocPermissions(this.modelName, outputDoc);
      }

      return outputDoc;
    });

    return {
      success: true,
      kind: 'list',
      code: Codes.Created,
      data: docs as TModel[],
      input: items,
      count: docs.length,
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
    args?: { select?: string[] },
    options?: { skim?: boolean; includePermissions?: boolean; includeFieldPermissions?: boolean },
  ): Promise<SingleResult<TModel>> {
    // VIRT-04 new template (VIRT-00A D1/D6): virtualAccess/outputAccess/
    // docPermissionsAccess are all `create`; `operation` stays initiating
    // (`new`). `args.select` CONTINUES to be ignored in v1 (all applicable
    // `create` virtuals considered, subject to explicit exclusion only via
    // future contract change). The previous implementation ignored that
    // argument; VIRT-04 documents the preserved behavior here and applies
    // selected authorized virtuals where required dependencies exist in the
    // default/template values (absent dependency → omit).
    const virtualSnapshot = this.captureVirtualSnapshot();
    const { skim, includePermissions: requestedPermissions } = options ?? {};
    const includePermissions = this.options.stripPermissionsField ? false : requestedPermissions;
    const data = await this.model.new();

    const newContext: ModelHookContext = {
      mongooseModel: this.model.mongooseModel,
      modelName: this.modelName,
      operation: 'new',
      originalDocumentSnapshot: toObject(data) as Record<string, unknown>,
      resolvedQuery: {},
    };

    // Effective selection is always "all" for new() (ignored args.select).
    const newPlan = this.buildVirtualPlan({
      snapshot: virtualSnapshot,
      virtualAccess: 'create',
      outputAccess: 'create',
      docPermissionsAccess: 'create',
      requestedSelect: undefined,
      effectiveSelect: undefined,
      internalFetch: {},
    });

    let includeDocPermissions = includePermissions;
    if (!includeDocPermissions && !skim) {
      includeDocPermissions = this.checkIfModelPermissionExists(['create', 'read', 'update']);
    }
    if (!includeDocPermissions && newPlan.candidates.length > 0) {
      includeDocPermissions = this.checkIfModelPermissionExists(['create', 'read', 'update']);
    }
    let doc: unknown = data;
    if (includeDocPermissions) doc = await this.addDocPermissions(doc, 'create', newContext);
    const grants = getDocPermissions(this.modelName, doc) as Record<string, unknown>;
    const originalForPermissionsNew = doc;
    const finalized = await finalizeModelOutput({
      receivingModelName: this.modelName,
      input: doc,
      virtualAccess: 'create',
      outputAccess: 'create',
      docPermissionsAccess: 'create',
      scopePath: [],
      plan: newPlan,
      snapshot: virtualSnapshot,
      request: this.req as unknown as never,
      context: newContext,
      operation: 'new',
      docPermissions: grants ?? {},
      concurrencyLimit: this.getVirtualHookConcurrencyLimit(),
    });
    this.preservePermissionsVirtual(originalForPermissionsNew, finalized, false);
    doc = finalized;
    if (!this.stripPermissionsOutput(doc)) {
      if (!includePermissions) doc = this.addEmptyPermissions(doc);
      stripUnexposedDocPermissions(this.modelName, doc);
    }

    return {
      success: true,
      kind: 'single',
      code: Codes.Success,
      data: doc as TModel,
    };
  }

  /**
   * Update at authorized policy paths: admitted leaves preserve omitted siblings;
   * whole-authorized objects/arrays replace. Shared by updateById and existing-row
   * upsert. Validation precedes trusted prepare output (not re-filtered); partial
   * prepare containers preserve omissions. Transform retains explicit document-setter
   * replacement authority. Send nested client JSON, not literal dotted update keys.
   */
  public async updateOne(
    filter: Filter<TModel>,
    data: Record<string, unknown>,
    args?: UpdateOneArgs<TModel>,
    options?: UpdateOneOptions,
    decorate?: (doc: unknown, context?: ModelHookContext) => unknown,
  ): Promise<SingleResult<TModel> | ErrorResult> {
    const virtualSnapshot = this.captureVirtualSnapshot();
    const filterErrors = this.validateClientFilter(filter);
    if (filterErrors.length > 0) return { success: false, kind: 'error', code: Codes.BadRequest, errors: filterErrors };

    const { populate, overrides } = this.resolveUpdateOneArgs(args);
    const { skim, includePermissions, includeFieldPermissions, populateAccess } = this.resolveUpdateOneOptions(options);
    const { filter: overrideFilter, populate: overridePopulate } = overrides ?? {};
    const initiatingOperation = (overrides as { operation?: string } | undefined)?.operation ?? 'update';
    const hasEffectiveSelect = overrides && Object.prototype.hasOwnProperty.call(overrides, 'effectiveSelect');
    const effectiveSelect = hasEffectiveSelect
      ? (overrides as { effectiveSelect?: Projection }).effectiveSelect
      : undefined;

    let _filter = await (overrideFilter ?? this.genFilter('update', filter));
    if (_filter !== false) {
      _filter = this.stripVirtualsFromFilterForSnapshot(_filter, virtualSnapshot);
    }
    let _populate: Populate[] | string;
    try {
      _populate = await (overridePopulate || this.genPopulate(populateAccess, populate));
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

    let doc = (await this.model.findOne({ filter: _filter })) as ModelDocument<TModel> | null;
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

    doc = await this.addDocPermissions(doc, 'update', context);

    context.docPermissions = this.getDocPermissions(doc) as Record<string, unknown>;
    context.currentDocument = doc;

    const rawAllowed = await this.genAllowedFields(doc, 'update');
    const allowedFields = this.filterAllowedFieldsForVirtuals(rawAllowed, virtualSnapshot);
    const allowedData = this.admitWriteDataForVirtuals(
      pick(data, allowedFields) as Record<string, unknown>,
      virtualSnapshot,
    );
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

    const prepared = await this.prepare(allowedData, 'update', context);

    context.preparedData = prepared;
    applyUpdate(doc, prepared, allowedFields);

    context.modifiedPaths = doc.modifiedPaths();
    doc = assertModelDocument<TModel>(await this.transform(doc, 'update', context), this.modelName, 'transform');
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

    let includeDocPermissions = includePermissions;
    // Requested field maps need doc grants as grant input, so compute them
    // even under skim when field permissions are enabled.
    if (!includeDocPermissions && (!skim || includeFieldPermissions)) {
      includeDocPermissions = this.checkIfModelPermissionExists(['read', 'update']);
    }
    // VIRT-04: effective mutation selection into internal finalization.
    const updatePlan = this.buildVirtualPlan({
      snapshot: virtualSnapshot,
      virtualAccess: 'update',
      outputAccess: 'read',
      docPermissionsAccess: 'update',
      requestedSelect: effectiveSelect,
      effectiveSelect,
      internalFetch: {},
    });
    if (!includeDocPermissions && updatePlan.candidates.length > 0) {
      includeDocPermissions = this.checkIfModelPermissionExists(['read', 'update']);
    }
    if (includeDocPermissions) doc = await this.addDocPermissions(doc, 'update', context);
    if (includeFieldPermissions) doc = await this.addFieldPermissions(doc, 'update', context);
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
    const grants = getDocPermissions(this.modelName, doc) as Record<string, unknown>;
    const originalForPermissionsUpdate = doc;
    const finalized: Record<string, unknown> = await finalizeModelOutput({
      receivingModelName: this.modelName,
      input: doc,
      virtualAccess: 'update',
      outputAccess: 'read',
      docPermissionsAccess: 'update',
      scopePath: [],
      plan: updatePlan,
      snapshot: virtualSnapshot,
      request: this.req as unknown as never,
      context,
      operation: initiatingOperation,
      docPermissions: grants ?? {},
      concurrencyLimit: this.getVirtualHookConcurrencyLimit(),
    });
    this.preservePermissionsVirtual(originalForPermissionsUpdate, finalized, false);

    let outputDoc: unknown = finalized;
    if (isFunction(decorate)) outputDoc = await decorate(outputDoc, context);
    if (!this.stripPermissionsOutput(outputDoc)) {
      if (!includePermissions && !includeFieldPermissions) outputDoc = this.addEmptyPermissions(outputDoc);
      stripUnexposedDocPermissions(this.modelName, outputDoc);
    }

    this.completeOp('updateOne', startedAt, Codes.Success, _filter);
    return { success: true, kind: 'single', code: Codes.Success, data: outputDoc as TModel, input: prepared };
  }

  public async updateById(
    id: string,
    data: Record<string, unknown>,
    args: UpdateByIdArgs<TModel> = {},
    options: UpdateByIdOptions = {},
    decorate?: (doc: unknown, context?: ModelHookContext) => unknown,
  ): Promise<SingleResult<TModel> | ErrorResult> {
    const { populate, overrides } = this.resolveUpdateByIdArgs(args);
    const { skim, includePermissions, includeFieldPermissions, populateAccess } =
      this.resolveUpdateByIdOptions(options);
    const { populate: overridePopulate, idFilter: overrideIdFilter } = overrides;
    const effectiveSelect = (overrides as { effectiveSelect?: Projection }).effectiveSelect;
    const initiatingOperation = (overrides as { operation?: string }).operation ?? 'update';
    const filter = overrideIdFilter ?? (await this.genIDFilter(id));
    if (filter === false) return { success: false, kind: 'error', code: Codes.Forbidden, query: { filter } };

    return this.updateOne(
      filter,
      data,
      {
        populate,
        overrides: {
          populate: overridePopulate,
          ...(Object.prototype.hasOwnProperty.call(overrides ?? {}, 'effectiveSelect') ? { effectiveSelect } : {}),
          ...(Object.prototype.hasOwnProperty.call(overrides ?? {}, 'operation')
            ? { operation: initiatingOperation }
            : {}),
        },
      },
      { skim, includePermissions, includeFieldPermissions, populateAccess },
      decorate,
    );
  }

  public async upsert(
    filter: Filter<TModel>,
    data: Record<string, unknown>,
    args?: UpsertArgs<TModel>,
    options?: UpsertOptions,
    decorate?: (doc: unknown, context?: ModelHookContext) => unknown,
  ): Promise<ServiceResult<TModel>> {
    const virtualSnapshot = this.captureVirtualSnapshot();
    const filterErrors = this.validateClientFilter(filter);
    if (filterErrors.length > 0) return { success: false, kind: 'error', code: Codes.BadRequest, errors: filterErrors };

    const { populate, overrides } = this.resolveUpsertArgs(args);
    const { skim, includePermissions, includeFieldPermissions, populateAccess } = this.resolveUpsertOptions(options);
    const { filter: overrideFilter, populate: overridePopulate } = overrides ?? {};
    const upsertEffectiveSelect = (overrides as { effectiveSelect?: Projection }).effectiveSelect;
    const hasUpsertEffective = overrides && Object.prototype.hasOwnProperty.call(overrides, 'effectiveSelect');
    let _filter = await (overrideFilter ?? this.genFilter('update', filter));
    if (_filter !== false) {
      _filter = this.stripVirtualsFromFilterForSnapshot(_filter, virtualSnapshot);
    }
    const query = { filter: _filter };

    const startedAt = this.beginOp('upsert', _filter);
    if (_filter === false) {
      this.completeOp('upsert', startedAt, Codes.Forbidden, _filter);
      return { success: false, kind: 'error', code: Codes.Forbidden, query };
    }

    const theone = await this.model.findOne({ filter: _filter });
    let result: ServiceResult<TModel>;
    if (theone) {
      // VIRT-00A D1: update branch keeps operation `upsert`; accesses
      // follow the taken branch (update/read/update).
      result = await this.updateOne(
        null,
        data,
        {
          populate,
          overrides: {
            filter: _filter,
            populate: overridePopulate,
            operation: 'upsert',
            ...(hasUpsertEffective ? { effectiveSelect: upsertEffectiveSelect } : {}),
          },
        },
        { skim, includePermissions, includeFieldPermissions, populateAccess },
        decorate,
      );
    } else {
      // VIRT-00A D1: create branch keeps operation `upsert`; accesses
      // follow the taken branch (create/read/create).
      result = await this.create(
        data,
        {
          populate,
          overrides: {
            populate: overridePopulate,
            operation: 'upsert',
            ...(hasUpsertEffective ? { effectiveSelect: upsertEffectiveSelect } : {}),
          },
        },
        {
          skim,
          includePermissions,
          includeFieldPermissions,
          populateAccess,
        },
        decorate,
      );
    }

    this.completeOp('upsert', startedAt, result.code, _filter);
    return result;
  }

  public async delete(id: string): Promise<SingleResult<unknown> | ErrorResult> {
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
      const rawAllowed = await this.genAllowedFields(null, 'read');
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
      const allowedFields = await this.genAllowedFields(null, 'read');
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
   * Trusted count for correlated includes (ACI-03): the caller already
   * resolved parent references, revalidated expanded operands, and applied
   * explicit `count` access via `genFilter`. This skips client-filter
   * validation and subquery parsing so substituted parent data stays inert.
   */
  public async countTrusted(authorizedFilter: Filter<TModel>): Promise<SingleResult<number> | ErrorResult> {
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

    const uniqueValues = uniqBy(values, (value) => String(value));
    filter = await this.genFilter(access, {
      ...(filter as object),
      [foreignField]: { $in: uniqueValues },
    } as Filter<TModel>);
    if (filter !== false) {
      try {
        const snapshot = this.captureVirtualSnapshot();
        filter = this.stripVirtualsFromFilterForSnapshot(filter, snapshot);
      } catch {
        // keep original on failure
      }
    }

    const query = { filter };

    if (filter === false) return { success: false, kind: 'error', code: Codes.Forbidden, query };
    let matchFilter = filter as Record<string, unknown>;
    let castValues = uniqueValues;
    try {
      if (this.model.castFilter) {
        matchFilter = this.model.castFilter(matchFilter);
        // Cast against the real foreign path, before projection renames it.
        // Keep this independent of ACL filter composition/overrides.
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

  async listSub(
    id: SubdocumentId,
    sub: SubdocumentName,
    options?: SubdocumentListOptions<TModel>,
  ): Promise<ListResult | ErrorResult> {
    return listSubImpl(this, id, sub, options);
  }

  public async readSub(
    id: SubdocumentId,
    sub: SubdocumentName,
    subId: SubdocumentId,
    options?: SubdocumentReadOptions,
  ): Promise<SingleResult | ErrorResult> {
    return readSubImpl(this, id, sub, subId, options);
  }

  /**
   * Apply authorized policy-path updates, preserving protected siblings, then save.
   * Output requires post-save parent read and subdocument read operation/row access;
   * hidden output is successful `data: null` (direct/root-entry 200), not a failed write.
   * Visible output uses read fields plus `_id`. Do not retry solely for null output.
   */
  public async updateSub(
    id: SubdocumentId,
    sub: SubdocumentName,
    subId: SubdocumentId,
    data: Record<string, unknown>,
  ): Promise<SingleResult | ErrorResult> {
    return updateSubImpl(
      this,
      this.persist,
      (access) => this.req.macl.isAllowed(this.modelName, access),
      id,
      sub,
      subId,
      data,
    );
  }

  /**
   * Save authorized targeted updates, then return readable targets in stored order.
   * Requires parent/subdocument read access for output, not subdocument list access;
   * uses read fields plus `_id`. Hidden output succeeds with `data: [], count: 0`
   * (direct/root-entry 200); count measures visible rows, not all updated rows.
   */
  public async bulkUpdateSub(
    id: SubdocumentId,
    sub: SubdocumentName,
    data: SubdocumentBulkUpdateInput | Record<string, unknown>,
  ): Promise<ListResult | ErrorResult> {
    return bulkUpdateSubImpl(
      this,
      this.persist,
      (access) => this.req.macl.isAllowed(this.modelName, access),
      id,
      sub,
      castArray(data),
    );
  }

  /**
   * Append/prepend admitted rows, then return the visible full array (including when
   * input is empty). Output requires post-save parent read and subdocument list AND
   * read guards/row filters; fields use read projection plus `_id`.
   * Hidden output succeeds with code `created`, `data: [], count: 0`
   * (direct/root-entry 201). Visible count/order follow filtered stored rows.
   * Empty output does not mean the write failed; addFirst is a service option.
   */
  public async createSub(
    id: SubdocumentId,
    sub: SubdocumentName,
    data: SubdocumentCreateInput,
    options?: SubdocumentCreateOptions,
  ): Promise<ListResult | ErrorResult> {
    return createSubImpl(
      this,
      this.persist,
      (access) => this.req.macl.isAllowed(this.modelName, access),
      id,
      sub,
      data,
      options,
    );
  }

  public async deleteSub(
    id: SubdocumentId,
    sub: SubdocumentName,
    subId: SubdocumentId,
  ): Promise<SingleResult | ErrorResult> {
    return deleteSubImpl(this, this.persist, id, sub, subId);
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
