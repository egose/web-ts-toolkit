import {
  castArray,
  cloneDeep,
  compact,
  flatten,
  forEach,
  get,
  isArray,
  isBoolean,
  isFunction,
  isNil,
  isPlainObject,
  set,
  uniq,
} from '@web-ts-toolkit/utils';
import { getGlobalOption, getModelNames, getModelOption } from '../options';
import { iterateQuery } from '../helpers';
import { deepIsolateValue, toObject } from '../helpers/document';
import { attachIncludeOutput, getIncludeSource, prepareIncludeOutput } from '../output/include-output';
import { isValidFieldPath } from '../helpers/sort-policy';
import { RequestConcurrencyScheduler } from '../helpers/concurrency';
import { PopulateAccessError } from '../acl/populate-access';
import { transferDocumentAuthorizationGraph } from '../acl/document-authorization';
import type {
  AllowedOutputFieldOptions,
  OutputFieldOptions,
  OutputPlanningOptions,
} from '../interfaces/service-authorization';
import type { PopulatePlanningOptions } from '../interfaces/service';
import { assertFieldHelperCall } from '../acl/field-helper-options';
import {
  assertPublicAdmission,
  forwardPublicArgs,
  forwardPublicOptions,
  pickPublicKeys,
  PublicAdmissionError,
  requestOnlyServiceOptions,
} from '../validation/public-admission';

/**
 * VIRT-05 private association transport for legacy list joins.
 *
 * Target `Service.find` fetches `foreignField` independently of output
 * selection (fetch-only, never an output grant), captures immutable values
 * before trim, and returns them as service-only result metadata aligned to
 * rows. `includeDocsList` builds its join index from those paired values +
 * finalized rows, never from trimmed output and never via an
 * output-field grant. Metadata lives on symbols outside serializers
 * and finalized output input; the association phase never reruns target
 * getters. Multiple parents receive isolated finalized copies.
 *
 * Symbols (not strings) keep the channel service-only: JSON/client input
 * cannot inject them, and they never appear in serialized DTOs.
 */
export const VIRT_ASSOCIATION_FIELD: unique symbol = Symbol('accessRouter.virtAssociationField');
export const VIRT_ASSOCIATION_VALUES: unique symbol = Symbol('accessRouter.virtAssociationValues');

const copyAuthorizedOutput = <T>(value: T): T => {
  const copy = deepIsolateValue(value);
  transferDocumentAuthorizationGraph(value, copy);
  return copy;
};

/**
 * VIRT-04 output-only guards at the model-aware service boundary
 * (VIRT-00A D8). Registered virtual names remain virtual even when no
 * getter applies or their output rule grants visibility. They must be
 * excluded from persisted projections, client write admission, and
 * database sort/filter/distinct operations. Unregistered names follow
 * existing persisted-field policy.
 */

type VirtualSnapshotLike = {
  virtuals?: Record<string, unknown> | null;
};

const isVirtualContainerValueForGuard = (value: unknown): value is { sub: Record<string, unknown> } =>
  isPlainObject(value) && 'sub' in (value as Record<string, unknown>);

const getScopeVirtualsForGuard = (
  rootVirtuals: Record<string, unknown> | null | undefined,
  scopePath: string[],
): Record<string, unknown> | null => {
  if (!rootVirtuals || !isPlainObject(rootVirtuals)) return null;
  if (scopePath.length === 0) return rootVirtuals;
  let current: unknown = rootVirtuals;
  for (let i = 0; i < scopePath.length; i += 2) {
    const field = scopePath[i];
    const subMarker = scopePath[i + 1];
    if (!field || subMarker !== 'sub') return null;
    if (!isPlainObject(current)) return null;
    const container = (current as Record<string, unknown>)[field];
    if (!isVirtualContainerValueForGuard(container)) return null;
    current = (container as { sub: Record<string, unknown> }).sub;
    if (!isPlainObject(current)) return null;
  }
  return current as Record<string, unknown>;
};

const getScopeVirtualLeafNames = (
  snapshot: VirtualSnapshotLike | null | undefined,
  scopePath: string[],
): Set<string> => {
  const scopeVirtuals = getScopeVirtualsForGuard(
    (snapshot?.virtuals ?? null) as Record<string, unknown> | null,
    scopePath,
  );
  if (!scopeVirtuals) return new Set();
  return new Set(
    Object.entries(scopeVirtuals)
      .filter(([, v]) => v !== undefined && !isVirtualContainerValueForGuard(v))
      .map(([k]) => k),
  );
};

const getScopeContainerNames = (snapshot: VirtualSnapshotLike | null | undefined, scopePath: string[]): Set<string> => {
  const scopeVirtuals = getScopeVirtualsForGuard(
    (snapshot?.virtuals ?? null) as Record<string, unknown> | null,
    scopePath,
  );
  if (!scopeVirtuals) return new Set();
  return new Set(
    Object.entries(scopeVirtuals)
      .filter(([, v]) => isVirtualContainerValueForGuard(v))
      .map(([k]) => k),
  );
};

/**
 * Scope-aware virtual DB-path predicate (VIRT-04 requirement 5).
 * Returns true for registered virtual leaves and any subpath under them,
 * for both top-level (`fullAddress`, `fullAddress.city`) and embedded DB
 * paths (`contacts.nick` for `contacts.sub.nick`). Persisted containers
 * and unrelated persisted paths return false. Definition `.sub` segments
 * never appear in DB paths and are not accepted here.
 */
export const isVirtualDbPath = (dbPath: string, snapshot: VirtualSnapshotLike | null | undefined): boolean => {
  if (typeof dbPath !== 'string' || dbPath.length === 0) return false;
  if (dbPath.includes('.sub.')) return true;
  const segments = dbPath.split('.');
  if (segments.length === 0) return false;
  let scopePath: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const leaves = getScopeVirtualLeafNames(snapshot, scopePath);
    if (leaves.has(segment)) return true;
    const containers = getScopeContainerNames(snapshot, scopePath);
    if (containers.has(segment)) {
      scopePath = [...scopePath, segment, 'sub'];
      continue;
    }
    // Persisted segment: a deeper virtual can only appear under a
    // container scope, and we already advanced through containers.
    // Remaining segments inside plain persisted objects cannot be
    // scope-aware virtuals without a container hop, so keep walking
    // only to allow `container.persisted.nestedVirtual` shapes where
    // the nested scope is itself a container. For v1 single-level
    // embedded scopes this terminates here.
    // If the current scope has nested containers, they would have been
    // matched above; otherwise this path is persisted.
    // To support recursive containers, continue without changing scope
    // only when the segment itself is not a container (persisted nesting).
    // A virtual leaf deeper inside persisted nesting is still detected
    // when its immediate scope matches (handled on later iterations only
    // if scope advanced). For now, treat persisted nesting as non-virtual
    // unless a container hop occurred.
    // Walk on: keep current scope for dotted persisted nesting, but do not
    // falsely claim virtual. Only container hops change scope.
    continue;
  }
  return false;
};

/** Exclude registered top-level virtual names from an allowlist (write/sort/distinct). */
export const excludeVirtualsFromAllowedFields = (
  allowedFields: string[],
  snapshot: VirtualSnapshotLike | null | undefined,
): string[] => {
  if (!Array.isArray(allowedFields)) return allowedFields;
  const rootLeaves = getScopeVirtualLeafNames(snapshot, []);
  if (rootLeaves.size === 0) return allowedFields;
  return allowedFields.filter((field) => {
    if (typeof field !== 'string') return true;
    // Dotted persisted grants (e.g. `profile.public`) are not top-level
    // virtuals; only exact top-level virtual leaves are excluded here.
    // Embedded DB paths are handled by `isVirtualDbPath` at sort/distinct
    // and by embedded sanitizers for writes/filters.
    const base = field.split('.')[0];
    // An exact top-level virtual leaf is always excluded, even with a
    // subpath (`fullAddress.city` never reaches the adapter).
    if (rootLeaves.has(base) && (field === base || field.startsWith(`${base}.`) || field.startsWith(`${base} `))) {
      // For dotted forms, confirm via scope-aware predicate to avoid
      // stripping persisted `base` prefixes that merely share a name.
      // Top-level leaves are authoritative, so exclude.
      return false;
    }
    if (rootLeaves.has(field)) return false;
    return true;
  });
};

/**
 * Sanitize registered embedded virtual keys inside whole-object/array
 * grants (VIRT-04 requirement 4). Top-level virtuals are already excluded
 * via `excludeVirtualsFromAllowedFields` + `pick`; this removes virtual
 * leaves inside allowed containers (arrays/single-nested, one level plus
 * recursive container hops) without touching persisted siblings. Mutates
 * the supplied (already picked) object in place and returns it.
 */
export const sanitizeEmbeddedVirtualKeys = <T extends Record<string, unknown>>(
  data: T,
  snapshot: VirtualSnapshotLike | null | undefined,
): T => {
  if (!data || typeof data !== 'object') return data;
  const stripScope = (value: unknown, scopePath: string[]): void => {
    if (Array.isArray(value)) {
      for (const entry of value) stripScope(entry, scopePath);
      return;
    }
    if (!isPlainObject(value)) return;
    const record = value as Record<string, unknown>;
    const leaves = getScopeVirtualLeafNames(snapshot, scopePath);
    for (const leaf of leaves) {
      if (leaf in record) delete record[leaf];
    }
    const containers = getScopeContainerNames(snapshot, scopePath);
    for (const container of containers) {
      if (container in record) stripScope(record[container], [...scopePath, container, 'sub']);
    }
    // Recurse into plain persisted objects that may host nested
    // containers deeper than one hop (recursive `sub` scopes).
    for (const key of Object.keys(record)) {
      if (leaves.has(key) || containers.has(key)) continue;
      const child = record[key];
      if (Array.isArray(child) || isPlainObject(child)) {
        // Only recurse when the child scope could contain virtuals:
        // check for any container/leaf under an extended scope is
        // expensive; instead recurse conservatively into plain objects
        // that are not virtual leaves (already stripped).
        stripScope(child, scopePath);
      }
    }
  };
  stripScope(data, []);
  return data;
};

/**
 * VIRT-06 sub-scope write sanitizer.
 *
 * Strips registered embedded virtual leaves of scope `[sub,'sub']`
 * (including deeper nested containers + Mixed/whole-object plain nesting)
 * from subdocument write payloads (single objects or arrays). `data` is
 * already at sub scope (e.g. `{ displayName, nick }` for `contacts`), so
 * stripping starts at `[sub,'sub']`, not root. Mutates in place, returns it.
 * Keeps writes separate from computed output copies (finalizer isolates).
 */
export const sanitizeSubScopeVirtualKeys = <T>(
  data: T,
  snapshot: VirtualSnapshotLike | null | undefined,
  sub: string,
): T => {
  if (!data || typeof data !== 'object') return data;
  if (typeof sub !== 'string' || sub.length === 0) return data;
  const scopePath = [sub, 'sub'];
  const stripScope = (value: unknown, currentScope: string[]): void => {
    if (Array.isArray(value)) {
      for (const entry of value) stripScope(entry, currentScope);
      return;
    }
    if (!isPlainObject(value)) return;
    const record = value as Record<string, unknown>;
    const leaves = getScopeVirtualLeafNames(snapshot, currentScope);
    for (const leaf of leaves) {
      if (leaf in record) delete record[leaf];
    }
    const containers = getScopeContainerNames(snapshot, currentScope);
    for (const container of containers) {
      if (container in record) stripScope(record[container], [...currentScope, container, 'sub']);
    }
    for (const key of Object.keys(record)) {
      if (leaves.has(key) || containers.has(key)) continue;
      const child = record[key];
      if (Array.isArray(child) || isPlainObject(child)) {
        stripScope(child, currentScope);
      }
    }
  };
  stripScope(data, scopePath);
  return data;
};

const LOGICAL_FILTER_KEYS = new Set(['$and', '$or', '$nor']);
const isOperatorKey = (key: string): boolean => key.startsWith('$');

type VirtualFilterScope = Record<string, unknown> | null;
// Only an actual virtual removal produces this marker. Literal {}, [], and
// undefined are values, never evidence that a query clause was removed.
const REMOVED_VIRTUAL_FILTER = Symbol('removed virtual filter clause');

const rewriteFilterObject = (value: unknown, visit: (key: string, child: unknown) => unknown): unknown => {
  if (!isPlainObject(value)) return value;
  let changed = false;
  const entries: Array<[string, unknown]> = [];
  for (const [key, child] of Object.entries(value)) {
    const next = visit(key, child);
    if (!Object.is(next, child)) changed = true;
    if (next !== REMOVED_VIRTUAL_FILTER) entries.push([key, next]);
  }
  if (!changed) return value;
  return entries.length ? Object.fromEntries(entries) : REMOVED_VIRTUAL_FILTER;
};

const rewriteFilterClauses = (value: unknown, visit: (clause: unknown) => unknown): unknown => {
  if (!Array.isArray(value)) return value;
  let changed = false;
  const clauses: unknown[] = [];
  for (const clause of value) {
    const next = visit(clause);
    if (!Object.is(next, clause)) changed = true;
    if (next !== REMOVED_VIRTUAL_FILTER) clauses.push(next);
  }
  if (!changed) return value;
  return clauses.length ? clauses : REMOVED_VIRTUAL_FILTER;
};

/** A persisted path ends virtual lookup; unrelated data cannot reuse this scope's leaves. */
const resolveVirtualFilterField = (
  path: string,
  scope: VirtualFilterScope,
): VirtualFilterScope | typeof REMOVED_VIRTUAL_FILTER => {
  let inContainer = false;
  for (const segment of path.split('.')) {
    if (!scope) return null;
    if (inContainer && /^\d+$/.test(segment)) continue;
    if (!Object.hasOwn(scope, segment) || scope[segment] === undefined) return null;
    const definition = scope[segment];
    if (!isVirtualContainerValueForGuard(definition)) return REMOVED_VIRTUAL_FILTER;
    scope = isPlainObject(definition.sub) ? definition.sub : null;
    inContainer = true;
  }
  return scope;
};

/** Field operators with query children; every other operand is opaque literal data. */
const stripVirtualFilterOperator = (key: string, value: unknown, scope: VirtualFilterScope): unknown => {
  if (key === '$elemMatch') return stripVirtualFilterQuery(value, scope, true);
  if (key === '$not') {
    return rewriteFilterObject(value, (operator, operand) => stripVirtualFilterOperator(operator, operand, scope));
  }
  if (key === '$all') {
    return rewriteFilterClauses(value, (entry) => {
      if (!isPlainObject(entry) || Object.keys(entry).length !== 1 || !Object.hasOwn(entry, '$elemMatch')) return entry;
      return rewriteFilterObject(entry, (operator, operand) => stripVirtualFilterOperator(operator, operand, scope));
    });
  }
  return value;
};

const stripVirtualFilterQuery = (value: unknown, scope: VirtualFilterScope, element = false): unknown => {
  if (!scope) return value;
  return rewriteFilterObject(value, (key, child) => {
    if (LOGICAL_FILTER_KEYS.has(key)) {
      return rewriteFilterClauses(child, (clause) => stripVirtualFilterQuery(clause, scope));
    }
    if (isOperatorKey(key)) return element ? stripVirtualFilterOperator(key, child, scope) : child;
    const fieldScope = resolveVirtualFilterField(key, scope);
    if (fieldScope === REMOVED_VIRTUAL_FILTER) return REMOVED_VIRTUAL_FILTER;
    if (!fieldScope || !isPlainObject(child)) return child;
    if (Object.keys(child).some(isOperatorKey)) {
      return rewriteFilterObject(child, (operator, operand) =>
        stripVirtualFilterOperator(operator, operand, fieldScope),
      );
    }
    // Retain the established nested-field shorthand only for registered
    // embedded containers. $eq/$in and literal arrays never enter this branch.
    return stripVirtualFilterQuery(child, fieldScope);
  });
};

/**
 * Strip actual virtual field predicates before adapter dispatch (VIRT-04).
 * Query clauses retain their embedded scope; literal operands, including empty
 * objects/arrays and virtual-spelled data keys, stay intact. Only clauses emptied
 * by actual removal are pruned, so a wholly virtual filter becomes {}. Terminal
 * false, native values and malformed shapes pass through for existing validation.
 */
export const stripVirtualKeysFromFilter = <T>(filter: T, snapshot: VirtualSnapshotLike | null | undefined): T => {
  const stripped = stripVirtualFilterQuery(filter, getScopeVirtualsForGuard(snapshot?.virtuals, []));
  return (stripped === REMOVED_VIRTUAL_FILTER ? {} : stripped) as T;
};

/** The same query/value grammar, relative to a dedicated subdocument route (VIRT-06). */
export const stripSubVirtualKeysFromFilter = <T>(
  filter: T,
  snapshot: VirtualSnapshotLike | null | undefined,
  sub: string,
): T => {
  if (typeof sub !== 'string' || sub.length === 0) return filter;
  const stripped = stripVirtualFilterQuery(filter, getScopeVirtualsForGuard(snapshot?.virtuals, [sub, 'sub']));
  return (stripped === REMOVED_VIRTUAL_FILTER ? {} : stripped) as T;
};
import {
  ErrorResult,
  Filter,
  Include,
  CorrelatedInclude,
  LegacyInclude,
  ListResult,
  ModelHookContext,
  ModelRequest,
  Populate,
  Projection,
  SelectAccess,
  DocPermissionsAccess,
  DecorateAccess,
  DecorateAllAccess,
  ValidateAccess,
  PrepareAccess,
  TransformAccess,
  AfterPersistAccess,
  BaseFilterAccess,
  SingleResult,
  ServiceResult,
  SubQueryEntry,
  Task,
} from '../interfaces';
import {
  collectCorrelatedReferencePaths,
  containsParentMarkerShape,
  CorrelatedReferenceError,
  isCorrelatedInclude,
  resolveCorrelatedFilterTemplate,
  resolveCorrelatedIdTemplate,
  validateCorrelatedIncludeShape,
} from '../correlated-includes';
import { Codes, FilterOperator } from '../enums';
import { resolveRequestComplexity, validateRequestComplexity } from '../request-complexity';
import type { AccessRuntime } from '../runtime';
import { withCapturedPopulateModel } from '../model';
import type { Service } from './service';
import {
  bindModelOwnerMethods,
  captureModelServiceOwner,
  hasModelCoreOwner,
  withCapturedModelOperationGuard,
} from '../acl/model-service-owner';
import { getRequestWorkState } from '../helpers/request-work';
import { GroupedCountInputError, prepareCountGroups } from './grouped-count';
import {
  ServiceAuthorizationError,
  getAuthorizationPermissions,
  readServiceAuthorization,
  type AuthorizationConfiguration,
  type AuthorizationRelatedTarget,
  type ResolvedServiceAuthorization,
} from '../acl/service-authorization';
import { createRelatedExecution } from '../acl/related-execution';
import { createServiceExecution, getServiceExecutors, withExecutionHydration } from '../acl/service-execution';
import { isExecutionRowDenied } from '../acl/prepared-query';
import {
  prepareModelQuery,
  readPreparedModelQuery,
  resolveModelIdentifier,
  readModelIdentifier,
  executePreparedFindOne,
  executePreparedFind,
  executePreparedCount,
  executePreparedGroupedCount,
} from '../acl/prepared-query';

type CrossResourceModelOperation = 'list' | 'read' | 'count';

interface CorrelatedExecState {
  totalQueries: number;
  scheduler: RequestConcurrencyScheduler;
}

function getCorrelatedTemplateDepth(includes: CorrelatedInclude[]): number {
  let max = 0;
  const visit = (entries: unknown, depth: number) => {
    const list = castArray(entries as CorrelatedInclude | CorrelatedInclude[]).filter(Boolean);
    for (const entry of list) {
      if (!isPlainObject(entry)) continue;
      max = Math.max(max, depth);
      const nested = (entry as { args?: { include?: unknown } }).args?.include;
      if (nested !== undefined) {
        visit(nested as unknown, depth + 1);
      }
    }
  };
  if (includes.length > 0) visit(includes as unknown, 1);
  return max;
}
type ForeignKeyIndex<TValue> = Map<string, TValue[]>;

class ClientRequestError extends Error {
  readonly result: ErrorResult;

  constructor(result: ErrorResult) {
    super(String(result.code));
    this.result = result;
  }
}

export function validateClientFilter(filter: Filter | null | undefined): string[] {
  const errors: string[] = [];
  const complexityErrors = validateRequestComplexity(filter, getGlobalOption('requestComplexity'), 'filter');
  if (complexityErrors.length > 0) {
    return complexityErrors.map((error) => error.detail);
  }

  const blockedOperators = new Set(['$where', '$expr', '$function', '$accumulator']);

  const visit = (value: unknown, path: string) => {
    if (isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }

    if (!isPlainObject(value)) return;

    Object.entries(value).forEach(([key, child]) => {
      const nextPath = path ? `${path}.${key}` : key;

      if (blockedOperators.has(key)) {
        errors.push(`Unsupported filter operator: ${nextPath}`);
        return;
      }

      visit(child, nextPath);
    });
  };

  visit(filter, 'filter');
  return errors;
}

export class Base<TModel = unknown, TVirtuals extends object = Record<never, never>> {
  protected req: ModelRequest;
  protected modelName: string;
  protected readonly requestRuntime: AccessRuntime;
  protected readonly requestCore: ModelRequest['macl'];

  constructor(req: ModelRequest, modelName: string) {
    this.req = req;
    this.modelName = modelName;
    const owner = captureModelServiceOwner(req);
    this.requestRuntime = owner.runtime;
    this.requestCore = owner.core;
    bindModelOwnerMethods(this, owner.runtime);
  }

  public decorate<T>(doc: T, access: DecorateAccess, context: ModelHookContext): Promise<T> {
    return this.requestCore.decorate(this.modelName, doc, access, context);
  }

  public decorateAll<T>(docs: T[], access: DecorateAllAccess, context: ModelHookContext): Promise<T[]> {
    return this.requestCore.decorateAll(this.modelName, docs, access, context);
  }

  /**
   * Output-only existing paths; supplied options require purpose: 'output', never write admission.
   * Omission/undefined defaults to { purpose: 'output' }, not a request-schema allowlist.
   * Use the issued document result to reuse same-execution decisions after trimming.
   * Raw policy starts a fresh evaluation (see OutputFieldOptions).
   */
  public async genAllowedFields(
    doc: unknown,
    access: SelectAccess,
    options: AllowedOutputFieldOptions<TModel, TVirtuals> = { purpose: 'output' },
  ): Promise<string[]> {
    assertFieldHelperCall('genAllowedFields', arguments.length, 3, options);
    return this.requestCore.genAllowedFields<TModel, TVirtuals>(this.modelName, doc, access, options);
  }

  public genDocPermissions(
    doc: unknown,
    access: DocPermissionsAccess,
    context: ModelHookContext,
  ): Promise<Record<string, unknown>> {
    return this.requestCore.genDocPermissions(this.modelName, doc, access, context);
  }

  public genFilter(access?: BaseFilterAccess, filter?: Filter<TModel>): Promise<Filter<TModel>> {
    return this.requestCore.genFilter<TModel>(this.modelName, access, filter);
  }

  public getIdentifier(): string | null {
    return this.requestCore.getIdentifier(this.modelName);
  }

  public genIDFilter(id: string): Promise<Filter<TModel>> {
    return this.requestCore.genIDFilter<TModel>(this.modelName, id);
  }

  /** Request-only population; named scopePath uses response segments, never positional subPaths. */
  public async genPopulate(
    access?: SelectAccess,
    populate?: Populate | Populate[] | string | null,
    options: PopulatePlanningOptions = {},
  ): Promise<Populate[]> {
    assertFieldHelperCall('genPopulate', arguments.length, 3, options, 'populate');
    return this.requestCore.genPopulate(this.modelName, access, populate, options) as Promise<Populate[]>;
  }

  /**
   * Fresh output-only planner: selection stays independent of additive server authority.
   * Returns persisted fetch inputs including private identity/dependencies, not an output
   * allowlist. Document-dependent rules are deferred; no permission functions/getters run.
   * Configure extra projected hook inputs with alwaysSelectFields. Omitted/undefined
   * options equal {} (request-mode output); positional skipChecks/subPaths are removed.
   */
  public async genSelect(
    access: SelectAccess,
    targetFields?: Projection,
    options: OutputPlanningOptions<TModel, TVirtuals> = {},
  ): Promise<string[]> {
    assertFieldHelperCall('genSelect', arguments.length, 3, options);
    return this.requestCore.genSelect<TModel, TVirtuals>(this.modelName, access, targetFields, options);
  }

  /** Alias of genSelect's output planner; virtuals never enter the returned DB projection. */
  public async genQuerySelect(
    access: SelectAccess,
    targetFields?: Projection,
    options: OutputPlanningOptions<TModel, TVirtuals> = {},
  ): Promise<string[]> {
    assertFieldHelperCall('genQuerySelect', arguments.length, 3, options);
    return this.genSelect(access, targetFields, options);
  }

  public addEmptyPermissions<T>(doc: T): T {
    return this.requestCore.addEmptyPermissions(this.modelName, doc);
  }

  public addDocPermissions<T>(doc: T, access: DocPermissionsAccess, context: ModelHookContext): Promise<T> {
    return this.requestCore.addDocPermissions(this.modelName, doc, access, context);
  }

  public addFieldPermissions<T extends { _id?: unknown }>(
    doc: T,
    access: DocPermissionsAccess,
    context: ModelHookContext,
  ): Promise<T> {
    return this.requestCore.addFieldPermissions(this.modelName, doc, access, context);
  }

  /**
   * Filter existing values without selection/getters, restoration, row checks or writes.
   * A raw policy starts fresh; an issued document handle reuses its stage after private
   * hook inputs/metadata are trimmed. These inputs are mutually exclusive. Handles
   * require unchanged original/package-associated output; caller copies do not qualify.
   * Omitted/undefined options equal {} (fresh request-mode output); hydrated inputs are isolated.
   * This generic return type does not guarantee every input field remains present.
   */
  public async pickAllowedFields<T>(
    doc: T,
    access: SelectAccess,
    options: OutputFieldOptions<TModel, TVirtuals> = {},
  ): Promise<T> {
    assertFieldHelperCall('pickAllowedFields', arguments.length, 3, options);
    return this.requestCore.pickAllowedFields<T, TModel, TVirtuals>(this.modelName, doc, access, options);
  }

  /** Alias of pickAllowedFields's output filter; never authorizes writes. */
  public async trimOutputFields<T>(
    doc: T,
    access: SelectAccess,
    options: OutputFieldOptions<TModel, TVirtuals> = {},
  ): Promise<T> {
    assertFieldHelperCall('trimOutputFields', arguments.length, 3, options);
    return this.pickAllowedFields(doc, access, options);
  }

  public prepare<T>(allowedData: T, access: PrepareAccess, context: ModelHookContext): Promise<T> {
    return this.requestCore.prepare(this.modelName, allowedData, access, context);
  }

  public runTasks<T extends object>(docObject: T, tasks: Task | Task[]): T {
    return this.requestCore.runTasks(this.modelName, docObject, tasks);
  }

  public transform<T>(doc: T, access: TransformAccess, context: ModelHookContext): Promise<T> {
    return this.requestCore.transform(this.modelName, doc, access, context);
  }

  public afterPersist<T>(doc: T, access: AfterPersistAccess, context: ModelHookContext): Promise<T> {
    return this.requestCore.afterPersist(this.modelName, doc, access, context);
  }

  public changes(doc: Record<string, unknown>, context: ModelHookContext): Promise<void> {
    return this.requestCore.changes(this.modelName, doc, context);
  }

  public beforeDelete<T>(doc: T, context: ModelHookContext): Promise<void> {
    return this.requestCore.beforeDelete(this.modelName, doc, context);
  }

  public afterDelete<T>(doc: T, context: ModelHookContext): Promise<void> {
    return this.requestCore.afterDelete(this.modelName, doc, context);
  }

  public validate(
    allowedData: unknown,
    access: ValidateAccess,
    context: ModelHookContext,
  ): Promise<boolean | unknown[]> {
    return this.requestCore.validate(this.modelName, allowedData, access, context);
  }

  public checkIfModelPermissionExists(accesses: DocPermissionsAccess[]) {
    const modelPermissionKeys = getModelOption(this.modelName, '_modelPermissionKeys' as never) as Record<
      string,
      string[]
    >;
    return accesses.some((access) => modelPermissionKeys[access]?.length > 0);
  }

  protected validateClientFilter(filter: Filter | null | undefined): string[] {
    return validateClientFilter(filter);
  }

  public getRequestComplexity() {
    const { scheduler, hookGate } = getRequestWorkState(this.req, this.requestRuntime);
    return {
      ...resolveRequestComplexity(this.requestRuntime.getGlobalOption('requestComplexity')),
      maxBulkConcurrency: scheduler.limit,
      maxHookConcurrency: hookGate.limit,
    };
  }

  protected getClientRequestErrorResult(error: unknown): ErrorResult | null {
    return error instanceof ClientRequestError ||
      error instanceof PopulateAccessError ||
      error instanceof PublicAdmissionError ||
      error instanceof GroupedCountInputError ||
      error instanceof ServiceAuthorizationError
      ? error.result
      : null;
  }

  protected throwClientRequestError(code: ErrorResult['code'], detail: string): never {
    throw new ClientRequestError({
      success: false,
      kind: 'error',
      code,
      errors: [{ detail }],
    });
  }

  protected async getAuthorizedTargetService(
    modelName: string,
    op: CrossResourceModelOperation,
    path?: string,
    parentAuthorization?: ResolvedServiceAuthorization,
  ) {
    const binding = parentAuthorization ? this.relatedBinding() : undefined;
    const captured = parentAuthorization ? readServiceAuthorization(parentAuthorization, binding!) : undefined;
    const target = captured?.relatedTargets.find((entry) => entry.path === path);
    const policy = path ? captured?.authorization.related[path] : undefined;
    if (target && target.modelName !== modelName)
      this.throwClientRequestError(Codes.BadRequest, `related model mismatch: ${path}`);
    // Package cores always have a registry. Keep the existing custom-core adapter
    // seam, whose target dispatch need not be backed by a Mongoose registry.
    if (hasModelCoreOwner(this.requestCore) && !target?.model && !this.requestRuntime.hasModel(modelName)) {
      this.throwClientRequestError(Codes.BadRequest, `Model ${modelName} not found`);
    }

    const allowed =
      policy?.operation.mode === 'grant' ||
      (target
        ? await getRequestWorkState(this.req, this.requestRuntime).hookGate.run(() =>
            withCapturedModelOperationGuard(
              this.requestCore,
              modelName,
              op,
              target.operationGuard,
              getAuthorizationPermissions(parentAuthorization!, binding!),
              () => this.requestCore.isAllowed(modelName, op),
            ),
          )
        : await this.requestCore.isAllowed(modelName, op));
    if (!allowed) {
      this.throwClientRequestError(Codes.Unauthorized, 'Unauthorized');
    }

    return target?.model
      ? withCapturedPopulateModel(this.requestRuntime, modelName, target.model, () =>
          this.requestCore.getPublicService(modelName),
        )
      : this.requestCore.getPublicService(modelName);
  }

  private relatedBinding() {
    // Authenticate the actual receiver, including recursively captured targets.
    // A live name lookup can no longer represent the source after an await.
    return getServiceExecutors(this as unknown as Service<TModel, TVirtuals>).binding();
  }

  private relatedExecution(
    svc: ReturnType<ModelRequest['macl']['getPublicService']>,
    include: Include,
    parentAuthorization?: ResolvedServiceAuthorization,
  ): import('../acl/service-execution').ServiceExecutionContext {
    const op = include.op;
    if (!parentAuthorization)
      return withExecutionHydration(
        svc,
        createServiceExecution(svc, {
          operation: op,
          rowAccess: op,
          virtualAccess: op,
          outputAccess: op,
          docPermissionsAccess: op,
        }),
        'lean',
      );
    return withExecutionHydration(
      svc,
      createRelatedExecution(
        svc,
        { operation: op, rowAccess: op, virtualAccess: op, outputAccess: op, docPermissionsAccess: op },
        parentAuthorization,
        this.relatedBinding(),
        include.path,
      ),
      'lean',
    );
  }

  protected processInclude(include: Include | Include[], authorization?: ResolvedServiceAuthorization) {
    assertPublicAdmission(include, 'include');
    const items = compact(castArray(include));
    const legacy: LegacyInclude[] = [];
    const correlated: CorrelatedInclude[] = [];
    const correlatedReferenceFields: string[] = [];

    for (const entry of items) {
      // Correlated entries are never silently dropped or reinterpreted as
      // legacy includes: malformed correlated input fails closed here so
      // service-direct callers get the same controlled error as HTTP
      // validation (ACI-02 requirement 1; execution lands in ACI-03).
      if (isCorrelatedInclude(entry)) {
        const shapeErrors = validateCorrelatedIncludeShape(entry);
        if (shapeErrors.length > 0) {
          this.throwClientRequestError(Codes.BadRequest, shapeErrors[0]);
        }
        correlated.push(entry);
        correlatedReferenceFields.push(...collectCorrelatedReferencePaths(entry));
        continue;
      }

      // A legacy-shaped entry carrying $parent markers is malformed
      // correlated input, never an ordinary legacy include (ACI-01 D1.2).
      // Nested includes own their marker scope: a correlated child is not a
      // marker on this legacy descriptor. Whole-tree control-slot admission
      // above still runs before any dispatch.
      if (containsParentMarkerShape({ ...entry, args: { ...entry.args, include: undefined } })) {
        this.throwClientRequestError(
          Codes.BadRequest,
          'Legacy includes must not contain $parent markers; use a correlated include (mode: "correlated")',
        );
      }

      const candidate = entry as Partial<LegacyInclude>;
      if (candidate.model && candidate.op && candidate.path && candidate.localField && candidate.foreignField) {
        legacy.push(entry as LegacyInclude);
      }
      // Preserve the legacy silent-drop for malformed legacy entries that
      // carry no correlated signals.
    }

    const seenCorrelatedPaths = new Set<string>();
    for (const entry of correlated) {
      if (seenCorrelatedPaths.has(entry.path)) {
        this.throwClientRequestError(Codes.BadRequest, `Duplicate correlated include output path: ${entry.path}`);
      }
      seenCorrelatedPaths.add(entry.path);
    }

    if (authorization) this.assertIncludeOutputPaths([...legacy, ...correlated], authorization);
    else this.assertIncludeOutputPaths([...legacy, ...correlated]);

    // include Include local fields and paths
    let includeLocalFields: string[] = [];
    let includePaths: string[] = [];

    forEach(legacy, (inc) => {
      includeLocalFields.push(inc.localField);
      includePaths.push(inc.path);
    });

    includeLocalFields = uniq(compact(includeLocalFields));
    includePaths = uniq(compact(includePaths));

    return {
      includes: legacy,
      correlatedIncludes: correlated,
      includeLocalFields,
      includePaths,
      correlatedReferenceFields: uniq(compact(correlatedReferenceFields)),
    };
  }

  private validateIncludeOutputPath(path: string, modelName: string, configuration?: AuthorizationConfiguration): void {
    const permissionField = configuration
      ? ((configuration.documentPermissionField ?? '_permissions') as string)
      : getModelOption(modelName, 'documentPermissionField');
    // Use the attachment helper's path semantics, including legacy bracket
    // notation. Reading either probe at the other path detects equal paths
    // and both ancestor directions without rejecting unrelated siblings.
    if (
      get(set({}, path, true), permissionField) !== undefined ||
      get(set({}, permissionField, true), path) !== undefined
    ) {
      this.throwClientRequestError(
        Codes.BadRequest,
        `Include output path ${path} overlaps document permission field ${permissionField} on model ${modelName}`,
      );
    }
    this.validateIncludeVirtualCollision(path, modelName, configuration);
  }

  /**
   * VIRT-05 preflight: request include output paths vs registered virtual
   * paths with ancestor/descendant checks per receiving scope, before any
   * target dispatch. Registered virtual names remain virtual even when no
   * getter applies; an include that would overwrite a virtual (equal,
   * ancestor, or descendant, including bracket equivalents) fails closed
   * with `BadRequest`. Ordinary non-virtual collisions stay permitted and
   * existing permission-metadata protections above are preserved.
   */
  private collectVirtualDbPathsForPreflight(modelName: string, configuration?: AuthorizationConfiguration): string[] {
    try {
      const virtuals = (configuration ? configuration.virtuals : getModelOption(modelName, 'virtuals', null)) as Record<
        string,
        unknown
      > | null;
      if (!virtuals || typeof virtuals !== 'object') return [];
      const out: string[] = [];
      const walk = (node: Record<string, unknown>, prefix: string): void => {
        for (const [key, value] of Object.entries(node)) {
          if (value === undefined) continue;
          if (isPlainObject(value) && 'sub' in (value as Record<string, unknown>)) {
            const sub = (value as { sub?: unknown }).sub;
            if (isPlainObject(sub)) walk(sub as Record<string, unknown>, prefix ? `${prefix}.${key}` : key);
            continue;
          }
          out.push(prefix ? `${prefix}.${key}` : key);
        }
      };
      walk(virtuals as Record<string, unknown>, '');
      return out;
    } catch {
      return [];
    }
  }

  private validateIncludeVirtualCollision(
    path: string,
    modelName: string,
    configuration?: AuthorizationConfiguration,
  ): void {
    if (typeof path !== 'string' || path.length === 0) return;
    let virtualPaths: string[];
    try {
      virtualPaths = this.collectVirtualDbPathsForPreflight(modelName, configuration);
    } catch {
      return;
    }
    if (virtualPaths.length === 0) return;
    const norm = (s: string): string => s.replace(/\[(\w+)\]/g, '.$1').replace(/^\.+/, '');
    const inc = norm(path);
    if (!inc) return;
    for (const raw of virtualPaths) {
      const virt = norm(raw);
      if (!virt) continue;
      if (inc === virt || inc.startsWith(`${virt}.`) || virt.startsWith(`${inc}.`)) {
        this.throwClientRequestError(
          Codes.BadRequest,
          `Include output path ${path} overlaps virtual ${raw} on model ${modelName}`,
        );
      }
    }
  }

  private assertIncludeOutputPaths(include: Include[], authorization?: ResolvedServiceAuthorization): void {
    if (include.length === 0) return;
    const captured = authorization ? readServiceAuthorization(authorization, this.relatedBinding()) : undefined;
    const pending: {
      entries: Include[];
      modelName: string;
      configuration?: AuthorizationConfiguration;
      targets?: readonly AuthorizationRelatedTarget[];
    }[] = [
      {
        entries: include,
        modelName: this.modelName,
        configuration: captured?.configuration,
        targets: captured?.relatedTargets,
      },
    ];
    const visited = new WeakMap<object, Set<string>>();
    while (pending.length > 0) {
      const { entries, modelName, configuration, targets } = pending.pop()!;
      if (modelName !== this.modelName && !getModelNames().includes(modelName)) {
        this.throwClientRequestError(Codes.BadRequest, `Model ${modelName} not found`);
      }
      for (const entry of entries) {
        if (!isPlainObject(entry)) continue;
        const models = visited.get(entry) ?? new Set<string>();
        if (models.has(modelName)) continue;
        models.add(modelName);
        visited.set(entry, models);
        if (typeof entry.path === 'string' && entry.path) {
          this.validateIncludeOutputPath(entry.path, modelName, configuration);
        }
        // Preflight nested descriptors too: a legacy parent can otherwise
        // swallow a target's error result, and earlier siblings could query.
        // Inner output belongs to the target model, not the outer source.
        // (This also covers nested `args.include` inside correlated entries:
        // correlated list/read entries carry `model`, so their nested output
        // is preflighted here against the intermediate target scope.)
        if ((entry.op === 'read' || entry.op === 'list') && typeof entry.model === 'string') {
          const nested = (entry.args as { include?: Include | Include[] } | undefined)?.include;
          const target = targets?.find((target) => target.path === entry.path);
          if (nested)
            pending.push({
              entries: compact(castArray(nested)),
              modelName: entry.model,
              configuration: target?.configuration,
              targets: target?.relatedTargets,
            });
        }
      }
    }
  }

  private getForeignKeyValues(value: unknown): unknown[] {
    return flatten(castArray(value));
  }

  private getForeignKey(value: unknown): string {
    return String(value);
  }

  private buildForeignKeyIndex<TValue>(rows: TValue[], foreignField: string): ForeignKeyIndex<TValue> {
    const index: ForeignKeyIndex<TValue> = new Map();

    for (const row of rows) {
      for (const value of this.getForeignKeyValues(get(row, foreignField))) {
        const key = this.getForeignKey(value);
        const values = index.get(key);
        if (values) values.push(row);
        else index.set(key, [row]);
      }
    }

    return index;
  }

  private getIndexedMatches<TValue>(index: ForeignKeyIndex<TValue>, localValue: unknown): TValue[] {
    const seen = new Set<TValue>();
    const matches: TValue[] = [];

    for (const value of this.getForeignKeyValues(localValue)) {
      for (const row of index.get(this.getForeignKey(value)) ?? []) {
        if (seen.has(row)) continue;
        seen.add(row);
        matches.push(row);
      }
    }

    return matches;
  }

  private sanitizeIncludeArgs(args: unknown, op: 'list' | 'read'): Record<string, unknown> {
    assertPublicAdmission(args);
    return pickPublicKeys(
      args,
      op === 'list'
        ? ['select', 'populate', 'include', 'sort', 'skip', 'limit', 'page', 'pageSize']
        : ['select', 'populate', 'include', 'sort'],
    );
  }

  private assertIncludeForeignField(include: LegacyInclude): void {
    if (!isValidFieldPath(include.foreignField)) {
      this.throwClientRequestError(Codes.BadRequest, `Invalid include foreignField: ${include.foreignField}`);
    }
  }

  protected async includeDocs<TDoc>(
    docs: TDoc | TDoc[],
    include: Include | Include[],
    parentAuthorization?: ResolvedServiceAuthorization,
  ): Promise<TDoc | TDoc[]> {
    assertPublicAdmission(include, 'include');
    if (!include) return docs;

    const includes = compact(castArray(include));
    if (includes.length === 0) return docs;

    const isSingle = !isArray(docs);
    let docList = (isSingle ? [docs as TDoc] : (docs as TDoc[])).map(prepareIncludeOutput);

    for (let x = 0; x < includes.length; x++) {
      const include = includes[x];
      // Correlated execution lands in ACI-03. Reaching the legacy executor
      // with a correlated entry is a programming error: fail closed instead
      // of silently skipping the include.
      if (isCorrelatedInclude(include)) {
        this.throwClientRequestError(
          Codes.BadRequest,
          'Correlated includes are not supported by the legacy include executor',
        );
      }
      this.assertIncludeForeignField(include);

      switch (include.op) {
        case 'count':
          docList = await this.includeDocsCount<TDoc>(docList, include, parentAuthorization);
          break;
        case 'read':
          docList = await this.includeDocsRead<TDoc>(docList, include, parentAuthorization);
          break;
        case 'list':
          docList = await this.includeDocsList<TDoc>(docList, include, parentAuthorization);
          break;
      }
    }

    return isSingle ? docList[0] : docList;
  }

  private async includeDocsRead<TDoc>(
    docs: TDoc[],
    include: LegacyInclude,
    parentAuthorization?: ResolvedServiceAuthorization,
  ): Promise<TDoc[]> {
    const { model, path, localField, foreignField, filter: _filters, args = {}, options = {} } = include;

    const svc = await this.getAuthorizedTargetService(model, 'read', path, parentAuthorization);

    for (let y = 0; y < docs.length; y++) {
      const doc = docs[y];
      const localValue = get(doc, localField);
      const execution = this.relatedExecution(svc, include, parentAuthorization);
      const prepared = await prepareModelQuery(
        svc,
        execution,
        { kind: 'client-read', filter: _filters ?? {} },
        { [foreignField]: { $in: this.getForeignKeyValues(localValue) } },
        true,
      );
      const { skim, populateAccess } = forwardPublicOptions(options, 'read');
      const trustedOptions = requestOnlyServiceOptions({
        skim,
        populateAccess,
        access: 'read' as const,
        includePermissions: false,
        includeFieldPermissions: false,
      });
      const result = await executePreparedFindOne(
        svc,
        execution,
        prepared,
        this.sanitizeIncludeArgs(args, 'read') as never,
        trustedOptions,
      );

      if (!result.success && result.code === Codes.BadRequest) throw new ClientRequestError(result);
      if (result.success) {
        attachIncludeOutput(doc, path, result.data);
      }
    }

    return docs;
  }

  private async includeDocsList<TDoc>(
    docs: TDoc[],
    include: LegacyInclude,
    parentAuthorization?: ResolvedServiceAuthorization,
  ): Promise<TDoc[]> {
    const { model, op, path, localField, foreignField, filter: _filters, args = {}, options = {} } = include;

    const svc = await this.getAuthorizedTargetService(model, op, path, parentAuthorization);

    const includeLocalValues: unknown[] = [];
    forEach(docs, (doc) => {
      includeLocalValues.push(...this.getForeignKeyValues(get(doc, localField)));
    });

    const execution = this.relatedExecution(svc, include, parentAuthorization);
    const prepared = await prepareModelQuery(
      svc,
      execution,
      { kind: 'client-read', filter: _filters ?? {} },
      { [foreignField]: { $in: flatten(includeLocalValues) } },
      true,
    );
    const trustedArgs = this.sanitizeIncludeArgs(args, 'list');
    // VIRT-05: private association transport. Fetch `foreignField`
    // independently of output selection (fetch-only, never an output grant),
    // capture immutable values before trim, index from those paired with
    // finalized rows. No implicit output grant, no join-key exposure, no
    // getter rerun. Service-only symbols stay outside serializers/output.
    const { skim, populateAccess } = forwardPublicOptions(options, 'list');
    const trustedOptions = {
      ...requestOnlyServiceOptions({
        skim,
        populateAccess,
        includePermissions: false,
        includeFieldPermissions: false,
        includeCount: false,
      }),
      [VIRT_ASSOCIATION_FIELD]: foreignField,
    };
    const trustedResult = await executePreparedFind(
      svc,
      execution,
      prepared,
      trustedArgs as never,
      trustedOptions as never,
    );

    if (!trustedResult.success && trustedResult.code === Codes.BadRequest) throw new ClientRequestError(trustedResult);
    if (!trustedResult.success) return docs;

    // Materialize each returned row once. Per-parent isolation must copy stable
    // values rather than re-evaluate target presentation accessors for every match.
    const finalizedRows = (trustedResult.data as unknown[]).map((row) => copyAuthorizedOutput(row));
    let index: ForeignKeyIndex<unknown>;
    const paired = (trustedResult as unknown as Record<symbol, unknown>)[VIRT_ASSOCIATION_VALUES] as
      | unknown[]
      | undefined;
    if (Array.isArray(paired) && paired.length === finalizedRows.length) {
      index = new Map<string, unknown[]>();
      for (let i = 0; i < finalizedRows.length; i++) {
        for (const value of this.getForeignKeyValues(paired[i])) {
          // Skip absent (undefined) association slots; present null/0/false
          // still index as keys via String() to match local-side semantics.
          if (value === undefined) continue;
          const key = this.getForeignKey(value);
          const bucket = index.get(key);
          if (bucket) bucket.push(finalizedRows[i]);
          else index.set(key, [finalizedRows[i]]);
        }
      }
    } else {
      // Custom target executors may return rows without association metadata:
      // index from trimmed rows. Omitted/denied FKs miss here, which is why
      // the private transport above is required for the symmetric contract.
      index = this.buildForeignKeyIndex(finalizedRows, foreignField);
    }

    for (let y = 0; y < docs.length; y++) {
      const doc = docs[y];
      const matches = this.getIndexedMatches(index, get(doc, localField));
      // Isolated copies per parent: multiple parents sharing one logical
      // target must not alias mutable output. Cloning finalized rows (never
      // raw hidden keys) preserves trim/virtuals without rerunning getters.
      const isolated = matches.map((m) => copyAuthorizedOutput(m));
      attachIncludeOutput(doc, path, op === 'list' ? isolated : isolated[0]);
    }

    return docs;
  }

  private async includeDocsCount<TDoc>(
    docs: TDoc[],
    include: LegacyInclude,
    parentAuthorization?: ResolvedServiceAuthorization,
  ): Promise<TDoc[]> {
    const { model, path, localField, foreignField, filter: _filters } = include;

    const svc = await this.getAuthorizedTargetService(model, 'count', path, parentAuthorization);

    const groups = prepareCountGroups(docs, (doc) => get(doc, localField));
    const execution = this.relatedExecution(svc, include, parentAuthorization);
    const prepared = await prepareModelQuery(
      svc,
      execution,
      { kind: 'mutation-lookup', filter: _filters ?? {} },
      { [foreignField]: { $in: groups.values } },
      true,
    );
    const result = await executePreparedGroupedCount(svc, execution, prepared, foreignField, groups);

    if (!result.success && result.code === Codes.BadRequest) throw new ClientRequestError(result);
    if (!result.success) return docs;

    for (let y = 0; y < docs.length; y++) {
      const doc = docs[y];
      attachIncludeOutput(doc, path, result.data[y]);
    }

    return docs;
  }

  protected getCorrelatedExecState(): CorrelatedExecState {
    return getRequestWorkState(this.req, this.requestRuntime);
  }

  protected claimCorrelatedQuerySlot(): void {
    const limits = this.getRequestComplexity();
    const state = this.getCorrelatedExecState();
    if (state.totalQueries >= limits.maxCorrelatedQueries) {
      this.throwClientRequestError(
        Codes.BadRequest,
        `Correlated include query budget exceeded (max ${limits.maxCorrelatedQueries})`,
      );
    }
    state.totalQueries += 1;
  }

  private sanitizeCorrelatedArgs(include: CorrelatedInclude): {
    select?: unknown;
    sort?: unknown;
    skip?: unknown;
    limit?: unknown;
    page?: unknown;
    pageSize?: unknown;
    nestedInclude?: unknown;
  } {
    const args = (include.args ?? {}) as Record<string, unknown>;
    if (include.op === 'list') {
      const { select, sort, skip, limit, page, pageSize, include: nestedInclude } = args;
      return { select, sort, skip, limit, page, pageSize, nestedInclude };
    }
    const { select, sort, include: nestedInclude } = args;
    return { select, sort, nestedInclude };
  }

  protected async includeCorrelatedDocs<TDoc>(
    docs: TDoc[],
    correlatedIncludes: CorrelatedInclude[],
    snapshots?: unknown[],
    depth = 0,
    parentAuthorization?: ResolvedServiceAuthorization,
  ): Promise<TDoc[]> {
    assertPublicAdmission(correlatedIncludes, 'include');
    if (correlatedIncludes.length === 0) return docs;

    const limits = this.getRequestComplexity();
    const templateDepth = getCorrelatedTemplateDepth(correlatedIncludes);
    if (depth + templateDepth > limits.maxCorrelatedDepth) {
      this.throwClientRequestError(
        Codes.BadRequest,
        `Correlated include depth exceeded (max ${limits.maxCorrelatedDepth})`,
      );
    }

    const state = this.getCorrelatedExecState();
    docs = docs.map(prepareIncludeOutput);
    const resolvedSnapshots: unknown[] =
      snapshots ?? docs.map((doc) => cloneDeep(toObject(getIncludeSource(doc))) as unknown);

    for (const include of correlatedIncludes) {
      switch (include.op) {
        case 'read':
          await this.includeCorrelatedRead(docs, include, resolvedSnapshots, state, depth, parentAuthorization);
          break;
        case 'list':
          await this.includeCorrelatedList(docs, include, resolvedSnapshots, state, depth, parentAuthorization);
          break;
        case 'count':
          await this.includeCorrelatedCount(docs, include, resolvedSnapshots, state, depth, parentAuthorization);
          break;
        default:
          this.throwClientRequestError(
            Codes.BadRequest,
            `Unsupported correlated include op: ${(include as { op?: unknown }).op}`,
          );
      }
    }

    return docs;
  }

  private async includeCorrelatedRead<TDoc>(
    docs: TDoc[],
    include: CorrelatedInclude,
    snapshots: unknown[],
    state: CorrelatedExecState,
    depth: number,
    parentAuthorization?: ResolvedServiceAuthorization,
  ): Promise<void> {
    const svc = await this.getAuthorizedTargetService(include.model, 'read', include.path, parentAuthorization);
    const execution = this.relatedExecution(svc, include, parentAuthorization);
    if (isExecutionRowDenied(svc, execution))
      throw new ClientRequestError({ success: false, kind: 'error', code: Codes.Forbidden });
    const { select, sort, nestedInclude } = this.sanitizeCorrelatedArgs(include);
    const hasId = (include as { id?: unknown }).id !== undefined;

    if (hasId) {
      const idTemplate = (include as { id: unknown }).id;
      const tasks = docs.map((_, index) => ({ index, snapshot: snapshots[index] }));
      await state.scheduler.map(tasks, async ({ index, snapshot }) => {
        let resolution: { status: string; id?: string };
        try {
          resolution = resolveCorrelatedIdTemplate(idTemplate, snapshot);
        } catch (error) {
          if (error instanceof CorrelatedReferenceError) {
            throw new ClientRequestError({
              success: false,
              kind: 'error',
              code: Codes.BadRequest,
              errors: [{ detail: error.message }],
            });
          }
          throw error;
        }
        if (resolution.status === 'unresolvable') {
          attachIncludeOutput(docs[index], include.path, null);
          return;
        }
        const resolvedId = (resolution as { id: string }).id;
        // Preserve custom identifier behavior via the target's genIDFilter,
        // then authorize the resulting filter with explicit read access.
        // No read->list fallback by construction (Service.findOne has none).
        let idFilter: Filter;
        try {
          idFilter = readModelIdentifier(svc, execution, await resolveModelIdentifier(svc, execution, resolvedId));
        } catch (error) {
          const clientResult = this.getClientRequestErrorResult(error);
          if (clientResult) throw new ClientRequestError(clientResult);
          throw error;
        }
        const prepared = await prepareModelQuery(svc, execution, { kind: 'expanded', filter: idFilter }, idFilter);
        if (readPreparedModelQuery(svc, execution, prepared).filter === false) {
          throw new ClientRequestError({ success: false, kind: 'error', code: Codes.Forbidden });
        }
        this.claimCorrelatedQuerySlot();
        let result: SingleResult | ErrorResult;
        try {
          result = await executePreparedFindOne(
            svc,
            execution,
            prepared,
            {
              select: select as never,
              sort: sort as never,
              include: nestedInclude as never,
            },
            requestOnlyServiceOptions({
              access: 'read',
              includePermissions: false,
              includeFieldPermissions: false,
            }) as never,
          );
        } catch (error) {
          const clientResult = this.getClientRequestErrorResult(error);
          if (clientResult) throw new ClientRequestError(clientResult);
          throw error;
        }
        if (result.success) {
          attachIncludeOutput(docs[index], include.path, result.data);
        } else if (result.code === Codes.NotFound) {
          attachIncludeOutput(docs[index], include.path, null);
        } else {
          throw new ClientRequestError(result as ErrorResult);
        }
      });
      return;
    }

    const filterTemplate = (include as { filter: Record<string, unknown> }).filter;
    const templateErrors = this.validateClientFilter(filterTemplate as never);
    if (templateErrors.length > 0) {
      this.throwClientRequestError(Codes.BadRequest, templateErrors[0]);
    }
    let parsedTemplate: Record<string, unknown>;
    try {
      parsedTemplate = (await this.parseClientData(
        filterTemplate as Record<string, unknown>,
        state.scheduler,
      )) as Record<string, unknown>;
    } catch (error) {
      const clientResult = this.getClientRequestErrorResult(error);
      if (clientResult) throw new ClientRequestError(clientResult);
      throw error;
    }
    const tasks = docs.map((_, index) => ({ index, snapshot: snapshots[index] }));
    await state.scheduler.map(tasks, async ({ index, snapshot }) => {
      let resolution;
      try {
        resolution = resolveCorrelatedFilterTemplate(parsedTemplate, snapshot);
      } catch (error) {
        if (error instanceof CorrelatedReferenceError) {
          throw new ClientRequestError({
            success: false,
            kind: 'error',
            code: Codes.BadRequest,
            errors: [{ detail: error.message }],
          });
        }
        throw error;
      }
      if (resolution.status === 'unresolvable') {
        attachIncludeOutput(docs[index], include.path, null);
        return;
      }
      const expanded = resolution.filter;
      const prepared = await prepareModelQuery(svc, execution, { kind: 'expanded', filter: expanded }, expanded);
      if (readPreparedModelQuery(svc, execution, prepared).filter === false) {
        throw new ClientRequestError({ success: false, kind: 'error', code: Codes.Forbidden });
      }
      this.claimCorrelatedQuerySlot();
      let result: SingleResult | ErrorResult;
      try {
        result = await executePreparedFindOne(
          svc,
          execution,
          prepared,
          {
            select: select as never,
            sort: sort as never,
            include: nestedInclude as never,
          },
          requestOnlyServiceOptions({
            access: 'read',
            includePermissions: false,
            includeFieldPermissions: false,
          }) as never,
        );
      } catch (error) {
        const clientResult = this.getClientRequestErrorResult(error);
        if (clientResult) throw new ClientRequestError(clientResult);
        throw error;
      }
      if (result.success) {
        attachIncludeOutput(docs[index], include.path, result.data);
      } else if (result.code === Codes.NotFound) {
        attachIncludeOutput(docs[index], include.path, null);
      } else {
        throw new ClientRequestError(result as ErrorResult);
      }
    });
    void depth;
  }

  private async includeCorrelatedList<TDoc>(
    docs: TDoc[],
    include: CorrelatedInclude,
    snapshots: unknown[],
    state: CorrelatedExecState,
    depth: number,
    parentAuthorization?: ResolvedServiceAuthorization,
  ): Promise<void> {
    const svc = await this.getAuthorizedTargetService(include.model, 'list', include.path, parentAuthorization);
    const execution = this.relatedExecution(svc, include, parentAuthorization);
    if (isExecutionRowDenied(svc, execution))
      throw new ClientRequestError({ success: false, kind: 'error', code: Codes.Forbidden });
    const { select, sort, skip, limit, page, pageSize, nestedInclude } = this.sanitizeCorrelatedArgs(include);
    const filterTemplate = (include as { filter: Record<string, unknown> }).filter;
    const templateErrors = this.validateClientFilter(filterTemplate as never);
    if (templateErrors.length > 0) {
      this.throwClientRequestError(Codes.BadRequest, templateErrors[0]);
    }
    let parsedTemplate: Record<string, unknown>;
    try {
      parsedTemplate = (await this.parseClientData(
        filterTemplate as Record<string, unknown>,
        state.scheduler,
      )) as Record<string, unknown>;
    } catch (error) {
      const clientResult = this.getClientRequestErrorResult(error);
      if (clientResult) throw new ClientRequestError(clientResult);
      throw error;
    }
    const tasks = docs.map((_, index) => ({ index, snapshot: snapshots[index] }));
    await state.scheduler.map(tasks, async ({ index, snapshot }) => {
      let resolution;
      try {
        resolution = resolveCorrelatedFilterTemplate(parsedTemplate, snapshot);
      } catch (error) {
        if (error instanceof CorrelatedReferenceError) {
          throw new ClientRequestError({
            success: false,
            kind: 'error',
            code: Codes.BadRequest,
            errors: [{ detail: error.message }],
          });
        }
        throw error;
      }
      if (resolution.status === 'unresolvable') {
        attachIncludeOutput(docs[index], include.path, []);
        return;
      }
      const expanded = resolution.filter;
      const prepared = await prepareModelQuery(svc, execution, { kind: 'expanded', filter: expanded }, expanded);
      if (readPreparedModelQuery(svc, execution, prepared).filter === false) {
        throw new ClientRequestError({ success: false, kind: 'error', code: Codes.Forbidden });
      }
      this.claimCorrelatedQuerySlot();
      let result: ListResult | ErrorResult;
      try {
        result = await executePreparedFind(
          svc,
          execution,
          prepared,
          {
            select: select as never,
            sort: sort as never,
            skip: skip as never,
            limit: limit as never,
            page: page as never,
            pageSize: pageSize as never,
            include: nestedInclude as never,
          },
          requestOnlyServiceOptions({
            includeCount: false,
            includePermissions: false,
            includeFieldPermissions: false,
          }) as never,
        );
      } catch (error) {
        const clientResult = this.getClientRequestErrorResult(error);
        if (clientResult) throw new ClientRequestError(clientResult);
        throw error;
      }
      if (result.success) {
        attachIncludeOutput(docs[index], include.path, result.data);
      } else {
        throw new ClientRequestError(result as ErrorResult);
      }
    });
    void depth;
  }

  private async includeCorrelatedCount<TDoc>(
    docs: TDoc[],
    include: CorrelatedInclude,
    snapshots: unknown[],
    state: CorrelatedExecState,
    depth: number,
    parentAuthorization?: ResolvedServiceAuthorization,
  ): Promise<void> {
    const svc = await this.getAuthorizedTargetService(include.model, 'count', include.path, parentAuthorization);
    const execution = this.relatedExecution(svc, include, parentAuthorization);
    if (isExecutionRowDenied(svc, execution))
      throw new ClientRequestError({ success: false, kind: 'error', code: Codes.Forbidden });
    const filterTemplate = (include as { filter: Record<string, unknown> }).filter;
    const templateErrors = this.validateClientFilter(filterTemplate as never);
    if (templateErrors.length > 0) {
      this.throwClientRequestError(Codes.BadRequest, templateErrors[0]);
    }
    const tasks = docs.map((_, index) => ({ index, snapshot: snapshots[index] }));
    await state.scheduler.map(tasks, async ({ index, snapshot }) => {
      let resolution;
      try {
        resolution = resolveCorrelatedFilterTemplate(filterTemplate as Record<string, unknown>, snapshot);
      } catch (error) {
        if (error instanceof CorrelatedReferenceError) {
          throw new ClientRequestError({
            success: false,
            kind: 'error',
            code: Codes.BadRequest,
            errors: [{ detail: error.message }],
          });
        }
        throw error;
      }
      if (resolution.status === 'unresolvable') {
        attachIncludeOutput(docs[index], include.path, 0);
        return;
      }
      const expanded = resolution.filter;
      // Explicit count access (never the Service.count list default) and
      // count semantics independent of any list limit.
      const prepared = await prepareModelQuery(svc, execution, { kind: 'expanded', filter: expanded }, expanded);
      if (readPreparedModelQuery(svc, execution, prepared).filter === false) {
        throw new ClientRequestError({ success: false, kind: 'error', code: Codes.Forbidden });
      }
      this.claimCorrelatedQuerySlot();
      let result: SingleResult<number> | ErrorResult;
      try {
        result = await executePreparedCount(svc, execution, prepared);
      } catch (error) {
        const clientResult = this.getClientRequestErrorResult(error);
        if (clientResult) throw new ClientRequestError(clientResult);
        throw error;
      }
      if (result.success) {
        attachIncludeOutput(docs[index], include.path, result.data);
      } else {
        throw new ClientRequestError(result as ErrorResult);
      }
    });
    void depth;
  }

  protected async parseClientData<TValue>(
    filter: TValue,
    scheduler = new RequestConcurrencyScheduler(this.getRequestComplexity().maxBulkConcurrency),
    scheduled = false,
  ): Promise<TValue> {
    assertPublicAdmission(filter, 'data');
    const result = await iterateQuery(
      filter,
      async (fo: FilterOperator, val: unknown, key: string) => {
        switch (fo) {
          case FilterOperator.SubQuery:
            return this.handleSubQuery(val as SubQueryEntry, key);
          case FilterOperator.Date:
            return this.handleDate(val, key);
          default:
            return null;
        }
      },
      scheduler,
      scheduled,
    );

    return result as TValue;
  }

  private async handleSubQuery(sq: SubQueryEntry, key: string) {
    assertPublicAdmission(sq);
    const { model, op, id, filter, args, options, sqOptions = {} } = sq;

    let result!: ErrorResult | SingleResult | ListResult;

    if (op === 'list') {
      const svc = await this.getAuthorizedTargetService(model, 'list');
      result = await svc._list(filter, forwardPublicArgs(args, 'list'), forwardPublicOptions(options, 'list'));
    } else if (op === 'read') {
      const svc = await this.getAuthorizedTargetService(model, 'read');
      // ARF-01: cross-resource read subqueries must not fall back to the
      // target list access path. The fallback is authorized separately above
      // and target list row/field policy would never be re-evaluated.
      const readOptions = { ...forwardPublicOptions(options, 'read'), tryList: false };
      const readArgs = forwardPublicArgs(args, 'read');
      if (id) {
        result = await svc._read(id, readArgs, readOptions);
      } else if (filter) {
        result = await svc._readFilter(filter, readArgs, readOptions);
      } else {
        this.throwClientRequestError(Codes.BadRequest, `Subquery for field ${key} requires an id or filter`);
      }
    } else {
      this.throwClientRequestError(Codes.BadRequest, `Unsupported subquery operation: ${op}`);
    }

    if (!result.success) {
      throw new ClientRequestError(result as ErrorResult);
    }

    let ret = result.data;
    if (sqOptions.path) {
      ret = isArray(ret) ? flatten(ret.map((v) => get(v, sqOptions.path))) : get(ret, sqOptions.path);
    }

    if (sqOptions.compact) {
      ret = compact(castArray(ret));
    }

    return ret;
  }

  private handleDate(val: unknown, key: string) {
    if (val instanceof Date) return val;
    if (typeof val === 'string' || typeof val === 'number') return new Date(val);
    return new Date();
  }
}
