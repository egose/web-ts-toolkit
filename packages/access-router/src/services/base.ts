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
import { iterateQuery, setDocValue } from '../helpers';
import { deepIsolateValue, toObject } from '../helpers/document';
import { isValidFieldPath } from '../helpers/sort-policy';
import { RequestConcurrencyScheduler } from '../helpers/concurrency';
import { PopulateAccessError } from '../acl/populate-access';

/**
 * VIRT-05 private association transport for legacy list joins.
 *
 * Target `Service.find` fetches `foreignField` independently of output
 * selection (fetch-only, never an output grant), captures immutable values
 * before trim, and returns them as service-only result metadata aligned to
 * rows. `includeDocsList` builds its join index from those paired values +
 * finalized rows, never from trimmed output and never via an
 * `overrides.select` bypass. Metadata lives on symbols outside serializers
 * and finalized output input; the association phase never reruns target
 * getters. Multiple parents receive isolated finalized copies.
 *
 * Symbols (not strings) keep the channel service-only: JSON/client input
 * cannot inject them, and they never appear in serialized DTOs.
 */
export const VIRT_ASSOCIATION_FIELD: unique symbol = Symbol('accessRouter.virtAssociationField');
export const VIRT_ASSOCIATION_VALUES: unique symbol = Symbol('accessRouter.virtAssociationValues');

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

/**
 * VIRT-06 sub-scope filter stripping for dedicated subdocument routes.
 *
 * Client `filter` keys for `listSub` are relative to the sub scope
 * (e.g. `{ nick: 'x' }` where `nick` is `contacts.sub.nick`). Root
 * `stripVirtualKeysFromFilter` would not catch those (it checks root
 * leaves + `contacts.*` DB paths). This strips sub-scope virtual leaves
 * (including logical/nested/dotted positions) so virtual-only sub filters
 * collapse to `{}` (match-all) rather than filtering on non-persisted
 * fields. `false`/`null`/non-objects pass through. Never throws.
 */
export const stripSubVirtualKeysFromFilter = <T>(
  filter: T,
  snapshot: VirtualSnapshotLike | null | undefined,
  sub: string,
): T => {
  if (filter === false || filter === null || filter === undefined) return filter;
  if (!isPlainObject(filter) && !Array.isArray(filter)) return filter;
  if (typeof sub !== 'string' || sub.length === 0) return filter;
  const scopePath = [sub, 'sub'];
  const leaves = getScopeVirtualLeafNames(snapshot, scopePath);
  const containers = getScopeContainerNames(snapshot, scopePath);
  if (leaves.size === 0 && containers.size === 0) return filter;
  const stripValue = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      const out: unknown[] = [];
      for (const entry of value) {
        const stripped = stripValue(entry);
        if (stripped === undefined) continue;
        if (isPlainObject(stripped) && Object.keys(stripped as Record<string, unknown>).length === 0) continue;
        out.push(stripped);
      }
      return out;
    }
    if (!isPlainObject(value)) return value;
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(record)) {
      if (LOGICAL_FILTER_KEYS.has(key)) {
        const stripped = stripValue(child);
        if (Array.isArray(stripped)) {
          if (stripped.length === 0) continue;
          out[key] = stripped;
        } else if (isPlainObject(stripped) && Object.keys(stripped as Record<string, unknown>).length === 0) {
          continue;
        } else if (stripped !== undefined) {
          out[key] = stripped;
        }
        continue;
      }
      if (isOperatorKey(key)) {
        const stripped = stripValue(child);
        if (stripped !== undefined) out[key] = stripped;
        continue;
      }
      if (key.includes('.')) {
        const base = key.split('.')[0];
        if (leaves.has(base)) continue;
        // Nested container dotted (e.g. `addresses.city` where city is virtual
        // of deeper scope)? Check deeper via isVirtualDbPath on absolute
        // `sub.base...` form as fallback.
        try {
          if (isVirtualDbPath(`${sub}.${key}`, snapshot)) continue;
        } catch {
          // keep on predicate failure
        }
        const stripped = stripValue(child);
        if (stripped === undefined) continue;
        out[key] = stripped;
        continue;
      }
      if (leaves.has(key)) continue;
      if (containers.has(key)) {
        if (isPlainObject(child)) {
          const nested = stripEmbeddedFilterObject(
            child as Record<string, unknown>,
            [...scopePath, key, 'sub'],
            snapshot,
          );
          if (nested === undefined) continue;
          out[key] = nested;
        } else {
          const stripped = stripValue(child);
          if (stripped !== undefined) out[key] = stripped;
        }
        continue;
      }
      if (isPlainObject(child)) {
        const stripped = stripValue(child);
        if (stripped === undefined) continue;
        if (Object.keys(stripped as Record<string, unknown>).length === 0) continue;
        out[key] = stripped;
        continue;
      }
      if (Array.isArray(child)) {
        const stripped = stripValue(child);
        if (stripped !== undefined) out[key] = stripped;
        continue;
      }
      out[key] = child;
    }
    return out;
  };
  return stripValue(filter) as T;
};

const LOGICAL_FILTER_KEYS = new Set(['$and', '$or', '$nor']);

const isOperatorKey = (key: string): boolean => key.startsWith('$');

/**
 * Strip registered virtual names from a client filter before adapter
 * dispatch (VIRT-04 requirement 5). Covers logical (`$and`/`$or`/`$nor`),
 * nested object, and dotted positions. Virtual clauses are removed;
 * surviving siblings are preserved. Empty objects/arrays after stripping
 * are removed so a virtual-only filter collapses to `{}` (match-all)
 * rather than filtering on a non-existent field. `false` (terminal deny),
 * `null`, and non-object filters pass through untouched. Never throws:
 * malformed shapes are left for existing validation/casting.
 */
export const stripVirtualKeysFromFilter = <T>(filter: T, snapshot: VirtualSnapshotLike | null | undefined): T => {
  const stripValue = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      const out: unknown[] = [];
      for (const entry of value) {
        const stripped = stripValue(entry);
        if (stripped === undefined) continue;
        // Drop emptied clauses inside logical arrays.
        if (isPlainObject(stripped) && Object.keys(stripped as Record<string, unknown>).length === 0) continue;
        out.push(stripped);
      }
      return out;
    }
    if (!isPlainObject(value)) return value;
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(record)) {
      if (LOGICAL_FILTER_KEYS.has(key)) {
        const stripped = stripValue(child);
        if (Array.isArray(stripped)) {
          if (stripped.length === 0) continue;
          out[key] = stripped;
        } else if (isPlainObject(stripped) && Object.keys(stripped as Record<string, unknown>).length === 0) {
          continue;
        } else if (stripped !== undefined) {
          out[key] = stripped;
        }
        continue;
      }
      if (isOperatorKey(key)) {
        // Other operators (`$in`, `$eq`, etc. at field level are values,
        // not keys here; top-level unknown operators pass through).
        const stripped = stripValue(child);
        if (stripped !== undefined) out[key] = stripped;
        continue;
      }
      // Field key: dotted or nested. Dotted virtual DB paths strip wholly.
      if (key.includes('.')) {
        try {
          if (isVirtualDbPath(key, snapshot)) continue;
        } catch {
          // fall through to keep on predicate failure
        }
        const stripped = stripValue(child);
        if (stripped === undefined) continue;
        out[key] = stripped;
        continue;
      }
      // Top-level field: virtual leaf strips wholly (including operators
      // like `{ fullAddress: { $in: [...] } }`).
      const leaves = getScopeVirtualLeafNames(snapshot, []);
      if (leaves.has(key)) continue;
      const containers = getScopeContainerNames(snapshot, []);
      if (containers.has(key)) {
        // Container value may hold embedded virtuals in nested/dotted form.
        if (isPlainObject(child)) {
          const nestedStripped = stripEmbeddedFilterObject(
            child as Record<string, unknown>,
            [...[], key, 'sub'],
            snapshot,
          );
          if (nestedStripped === undefined) continue;
          out[key] = nestedStripped;
        } else {
          const stripped = stripValue(child);
          if (stripped !== undefined) out[key] = stripped;
        }
        continue;
      }
      // Persisted field: recurse into nested objects to catch
      // `contacts: { nick: virtual }` shapes.
      if (isPlainObject(child)) {
        const stripped = stripValue(child);
        if (stripped === undefined) continue;
        if (Object.keys(stripped as Record<string, unknown>).length === 0) {
          // An object that became empty after stripping virtuals inside
          // a persisted container should drop the clause, not match `{}`.
          // Only drop when the original contained a virtual; otherwise keep
          // empty objects for existing semantics.
          // Heuristic: if child had keys but all were stripped, drop.
          // Since we cannot distinguish here, drop empty nested objects
          // that resulted from stripping (persisted empty filters are rare
          // and collapsing to match-all is the safe virtual posture).
          continue;
        }
        out[key] = stripped;
        continue;
      }
      if (Array.isArray(child)) {
        const stripped = stripValue(child);
        if (stripped !== undefined) out[key] = stripped;
        continue;
      }
      out[key] = child;
    }
    return out;
  };

  if (filter === false || filter === null || filter === undefined) return filter;
  if (!isPlainObject(filter) && !Array.isArray(filter)) return filter;
  return stripValue(filter) as T;
};

const stripEmbeddedFilterObject = (
  obj: Record<string, unknown>,
  scopePath: string[],
  snapshot: VirtualSnapshotLike | null | undefined,
): Record<string, unknown> | undefined => {
  const leaves = getScopeVirtualLeafNames(snapshot, scopePath);
  const containers = getScopeContainerNames(snapshot, scopePath);
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(obj)) {
    if (leaves.has(key)) continue;
    if (containers.has(key)) {
      if (isPlainObject(child)) {
        const nested = stripEmbeddedFilterObject(
          child as Record<string, unknown>,
          [...scopePath, key, 'sub'],
          snapshot,
        );
        if (nested === undefined) continue;
        out[key] = nested;
      } else {
        out[key] = child;
      }
      continue;
    }
    if (isPlainObject(child)) {
      const stripped = stripVirtualKeysFromFilter(child, snapshot);
      if (isPlainObject(stripped) && Object.keys(stripped as Record<string, unknown>).length === 0) continue;
      out[key] = stripped as Record<string, unknown>;
      continue;
    }
    // Dotted keys inside nested objects (e.g. `{ contacts: { 'nick.x': 1 } }`):
    // check leaf-relative virtual.
    if (typeof key === 'string' && key.includes('.')) {
      const base = key.split('.')[0];
      if (leaves.has(base)) continue;
    }
    out[key] = child;
  }
  if (Object.keys(out).length === 0) return undefined;
  return out;
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
  validateExpandedCorrelatedOperands,
} from '../correlated-includes';
import { Codes, FilterOperator } from '../enums';
import { resolveRequestComplexity, validateRequestComplexity } from '../request-complexity';
import { getActiveRuntime } from '../runtime-context';
import { defaultRuntime } from '../runtime';
import { getRequestWorkState } from '../helpers/request-work';

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
type ForeignKeyCountIndex = Map<string, Set<string>>;

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
  protected readonly requestRuntime = getActiveRuntime() ?? defaultRuntime;

  constructor(req: ModelRequest, modelName: string) {
    this.req = req;
    this.modelName = modelName;
  }

  public decorate<T>(doc: T, access: DecorateAccess, context: ModelHookContext): Promise<T> {
    return this.req.macl.decorate(this.modelName, doc, access, context);
  }

  public decorateAll<T>(docs: T[], access: DecorateAllAccess, context: ModelHookContext): Promise<T[]> {
    return this.req.macl.decorateAll(this.modelName, docs, access, context);
  }

  public genAllowedFields(doc: unknown, access: SelectAccess, baseFields?: string[]): Promise<string[]> {
    return this.req.macl.genAllowedFields(this.modelName, doc, access, baseFields);
  }

  public genDocPermissions(
    doc: unknown,
    access: DocPermissionsAccess,
    context: ModelHookContext,
  ): Promise<Record<string, unknown>> {
    return this.req.macl.genDocPermissions(this.modelName, doc, access, context);
  }

  public genFilter(access?: BaseFilterAccess, filter?: Filter<TModel>): Promise<Filter<TModel>> {
    return this.req.macl.genFilter<TModel>(this.modelName, access, filter);
  }

  public getIdentifier(): string | null {
    return this.req.macl.getIdentifier(this.modelName);
  }

  public genIDFilter(id: string): Promise<Filter<TModel>> {
    return this.req.macl.genIDFilter<TModel>(this.modelName, id);
  }

  public genPopulate(
    access?: SelectAccess,
    populate?: Populate | Populate[] | string | null,
    subPaths?: string[],
  ): Promise<Populate[]> {
    return this.req.macl.genPopulate(this.modelName, access, populate, subPaths) as Promise<Populate[]>;
  }

  public genSelect(
    access: SelectAccess,
    targetFields?: Projection,
    skipChecks?: boolean,
    subPaths?: string[],
  ): Promise<string[]> {
    return this.req.macl.genSelect(this.modelName, access, targetFields, skipChecks, subPaths);
  }

  public genQuerySelect(
    access: SelectAccess,
    targetFields?: Projection,
    skipChecks?: boolean,
    subPaths?: string[],
  ): Promise<string[]> {
    return this.genSelect(access, targetFields, skipChecks, subPaths);
  }

  public addEmptyPermissions<T>(doc: T): T {
    return this.req.macl.addEmptyPermissions(this.modelName, doc);
  }

  public addDocPermissions<T>(doc: T, access: DocPermissionsAccess, context: ModelHookContext): Promise<T> {
    return this.req.macl.addDocPermissions(this.modelName, doc, access, context);
  }

  public addFieldPermissions<T extends { _id?: unknown }>(
    doc: T,
    access: DocPermissionsAccess,
    context: ModelHookContext,
  ): Promise<T> {
    return this.req.macl.addFieldPermissions(this.modelName, doc, access, context);
  }

  public pickAllowedFields<T>(doc: T, access: SelectAccess, baseFields?: string[]): Promise<T> {
    return this.req.macl.pickAllowedFields(this.modelName, doc, access, baseFields);
  }

  public trimOutputFields<T>(doc: T, access: SelectAccess, baseFields?: string[]): Promise<T> {
    return this.pickAllowedFields(doc, access, baseFields);
  }

  public prepare<T>(allowedData: T, access: PrepareAccess, context: ModelHookContext): Promise<T> {
    return this.req.macl.prepare(this.modelName, allowedData, access, context);
  }

  public runTasks<T extends object>(docObject: T, tasks: Task | Task[]): T {
    return this.req.macl.runTasks(this.modelName, docObject, tasks);
  }

  public transform<T>(doc: T, access: TransformAccess, context: ModelHookContext): Promise<T> {
    return this.req.macl.transform(this.modelName, doc, access, context);
  }

  public afterPersist<T>(doc: T, access: AfterPersistAccess, context: ModelHookContext): Promise<T> {
    return this.req.macl.afterPersist(this.modelName, doc, access, context);
  }

  public changes(doc: Record<string, unknown>, context: ModelHookContext): Promise<void> {
    return this.req.macl.changes(this.modelName, doc, context);
  }

  public beforeDelete<T>(doc: T, context: ModelHookContext): Promise<void> {
    return this.req.macl.beforeDelete(this.modelName, doc, context);
  }

  public afterDelete<T>(doc: T, context: ModelHookContext): Promise<void> {
    return this.req.macl.afterDelete(this.modelName, doc, context);
  }

  public validate(
    allowedData: unknown,
    access: ValidateAccess,
    context: ModelHookContext,
  ): Promise<boolean | unknown[]> {
    return this.req.macl.validate(this.modelName, allowedData, access, context);
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
    return resolveRequestComplexity(getGlobalOption('requestComplexity'));
  }

  protected getClientRequestErrorResult(error: unknown): ErrorResult | null {
    return error instanceof ClientRequestError || error instanceof PopulateAccessError ? error.result : null;
  }

  protected throwClientRequestError(code: ErrorResult['code'], detail: string): never {
    throw new ClientRequestError({
      success: false,
      kind: 'error',
      code,
      errors: [{ detail }],
    });
  }

  protected async getAuthorizedTargetService(modelName: string, op: CrossResourceModelOperation) {
    const runtime = getActiveRuntime();
    if (runtime && !runtime.hasModel(modelName)) {
      this.throwClientRequestError(Codes.BadRequest, `Model ${modelName} not found`);
    }

    const allowed = await this.req.macl.isAllowed(modelName, op);
    if (!allowed) {
      this.throwClientRequestError(Codes.Unauthorized, 'Unauthorized');
    }

    return this.req.macl.getPublicService(modelName);
  }

  protected processInclude(include: Include | Include[]) {
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
      if (containsParentMarkerShape(entry)) {
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

    this.assertIncludeOutputPaths([...legacy, ...correlated]);

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

  private validateIncludeOutputPath(path: string, modelName: string): void {
    const permissionField = getModelOption(modelName, 'documentPermissionField');
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
    this.validateIncludeVirtualCollision(path, modelName);
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
  private collectVirtualDbPathsForPreflight(modelName: string): string[] {
    try {
      const virtuals = getModelOption(modelName, 'virtuals', null) as Record<string, unknown> | null;
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

  private validateIncludeVirtualCollision(path: string, modelName: string): void {
    if (typeof path !== 'string' || path.length === 0) return;
    let virtualPaths: string[];
    try {
      // Prefer the runtime registry (VIRT-01) when available; fall back to
      // the raw option walk above for embedded containers.
      const runtime = this.requestRuntime;
      const rootNames: string[] = (() => {
        try {
          return runtime.getVirtualNames(modelName, []) ?? [];
        } catch {
          return [];
        }
      })();
      void rootNames;
      virtualPaths = this.collectVirtualDbPathsForPreflight(modelName);
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

  private assertIncludeOutputPaths(include: Include[]): void {
    const pending = [{ entries: include, modelName: this.modelName }];
    const visited = new WeakMap<object, Set<string>>();
    while (pending.length > 0) {
      const { entries, modelName } = pending.pop()!;
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
          this.validateIncludeOutputPath(entry.path, modelName);
        }
        // Preflight nested descriptors too: a legacy parent can otherwise
        // swallow a target's error result, and earlier siblings could query.
        // Inner output belongs to the target model, not the outer source.
        // (This also covers nested `args.include` inside correlated entries:
        // correlated list/read entries carry `model`, so their nested output
        // is preflighted here against the intermediate target scope.)
        if ((entry.op === 'read' || entry.op === 'list') && typeof entry.model === 'string') {
          const nested = (entry.args as { include?: Include | Include[] } | undefined)?.include;
          if (nested) pending.push({ entries: compact(castArray(nested)), modelName: entry.model });
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

  private getIndexedCount(index: ForeignKeyCountIndex, localValue: unknown): number {
    const ids = new Set<string>();

    for (const value of this.getForeignKeyValues(localValue)) {
      for (const id of index.get(this.getForeignKey(value)) ?? []) {
        ids.add(id);
      }
    }

    return ids.size;
  }

  private sanitizeIncludeArgs(args: unknown): Record<string, unknown> {
    if (!isPlainObject(args)) return {};
    const { overrides: _clientOverrides, ...trustedArgs } = args as Record<string, unknown>;
    return trustedArgs;
  }

  private assertIncludeForeignField(include: LegacyInclude): void {
    if (!isValidFieldPath(include.foreignField)) {
      this.throwClientRequestError(Codes.BadRequest, `Invalid include foreignField: ${include.foreignField}`);
    }
  }

  protected async includeDocs<TDoc>(docs: TDoc | TDoc[], include: Include | Include[]): Promise<TDoc | TDoc[]> {
    if (!include) return docs;

    const includes = compact(castArray(include));
    if (includes.length === 0) return docs;

    const isSingle = !isArray(docs);
    let docList: TDoc[] = isSingle ? [docs as TDoc] : (docs as TDoc[]);

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
          docList = await this.includeDocsCount<TDoc>(docList, include);
          break;
        case 'read':
          docList = await this.includeDocsRead<TDoc>(docList, include);
          break;
        case 'list':
          docList = await this.includeDocsList<TDoc>(docList, include);
          break;
      }
    }

    return isSingle ? docList[0] : docList;
  }

  private async includeDocsRead<TDoc>(docs: TDoc[], include: LegacyInclude): Promise<TDoc[]> {
    const { model, path, localField, foreignField, filter: _filters, args = {}, options = {} } = include;

    const svc = await this.getAuthorizedTargetService(model, 'read');

    for (let y = 0; y < docs.length; y++) {
      const doc = docs[y];
      const localValue = get(doc, localField);
      const filter = { ...(_filters ?? {}), [foreignField]: { $in: this.getForeignKeyValues(localValue) } };
      const trustedOptions = {
        ...(options as Record<string, unknown>),
        access: 'read',
        lean: true,
        includePermissions: false,
        includeFieldPermissions: false,
      };
      const result = await svc.findOne(filter, this.sanitizeIncludeArgs(args) as never, trustedOptions as never);

      if (!result.success && result.code === Codes.BadRequest) throw new ClientRequestError(result);
      if (result.success) {
        setDocValue(doc, path, result.data);
      }
    }

    return docs;
  }

  private async includeDocsList<TDoc>(docs: TDoc[], include: LegacyInclude): Promise<TDoc[]> {
    const { model, op, path, localField, foreignField, filter: _filters, args = {}, options = {} } = include;

    const svc = await this.getAuthorizedTargetService(model, op);

    const includeLocalValues: unknown[] = [];
    forEach(docs, (doc) => {
      includeLocalValues.push(...this.getForeignKeyValues(get(doc, localField)));
    });

    const filter = { ...(_filters ?? {}), [foreignField]: { $in: flatten(includeLocalValues) } };
    const authorizedFilter = await svc.genFilter(op, filter);
    const trustedArgs = {
      ...this.sanitizeIncludeArgs(args),
      overrides: {
        filter: authorizedFilter,
      },
    };
    // VIRT-05: private association transport. Fetch `foreignField`
    // independently of output selection (fetch-only, never an output grant),
    // capture immutable values before trim, index from those paired with
    // finalized rows. No `overrides.select` bypass, no join-key exposure, no
    // getter rerun. Service-only symbols stay outside serializers/output.
    const trustedOptions = {
      ...(options as Record<string, unknown>),
      lean: true,
      includePermissions: false,
      includeFieldPermissions: false,
      includeCount: false,
      [VIRT_ASSOCIATION_FIELD]: foreignField,
    };
    const trustedResult = await svc.find(filter, trustedArgs as never, trustedOptions as never);

    if (!trustedResult.success && trustedResult.code === Codes.BadRequest) throw new ClientRequestError(trustedResult);
    if (!trustedResult.success) return docs;

    // Materialize each returned row once. Per-parent isolation must copy stable
    // values rather than re-evaluate target presentation accessors for every match.
    const finalizedRows = (trustedResult.data as unknown[]).map((row) => deepIsolateValue(row));
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
      // Fallback for targets that did not capture (e.g. older overrides):
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
      const isolated = matches.map((m) => deepIsolateValue(m));
      setDocValue(doc, path, op === 'list' ? isolated : isolated[0]);
    }

    return docs;
  }

  private async includeDocsCount<TDoc>(docs: TDoc[], include: LegacyInclude): Promise<TDoc[]> {
    const { model, path, localField, foreignField, filter: _filters } = include;

    const svc = await this.getAuthorizedTargetService(model, 'count');

    const localValues = docs.flatMap((doc) => this.getForeignKeyValues(get(doc, localField)));
    const result = await svc.countByFieldValues(foreignField, localValues, _filters ?? {}, 'count');

    if (!result.success && result.code === Codes.BadRequest) throw new ClientRequestError(result);
    if (!result.success) return docs;

    for (let y = 0; y < docs.length; y++) {
      const doc = docs[y];
      setDocValue(doc, path, this.getIndexedCount(result.data, get(doc, localField)));
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
  ): Promise<TDoc[]> {
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
    const resolvedSnapshots: unknown[] = snapshots ?? docs.map((doc) => cloneDeep(toObject(doc)) as unknown);

    for (const include of correlatedIncludes) {
      switch (include.op) {
        case 'read':
          await this.includeCorrelatedRead(docs, include, resolvedSnapshots, state, depth);
          break;
        case 'list':
          await this.includeCorrelatedList(docs, include, resolvedSnapshots, state, depth);
          break;
        case 'count':
          await this.includeCorrelatedCount(docs, include, resolvedSnapshots, state, depth);
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
  ): Promise<void> {
    const svc = await this.getAuthorizedTargetService(include.model, 'read');
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
          setDocValue(docs[index], include.path, null);
          return;
        }
        const resolvedId = (resolution as { id: string }).id;
        // Preserve custom identifier behavior via the target's genIDFilter,
        // then authorize the resulting filter with explicit read access.
        // No read->list fallback by construction (Service.findOne has none).
        let idFilter: Filter;
        try {
          idFilter = await svc.genIDFilter(resolvedId);
        } catch (error) {
          const clientResult = this.getClientRequestErrorResult(error);
          if (clientResult) throw new ClientRequestError(clientResult);
          throw error;
        }
        const authorized = await svc.genFilter('read', idFilter);
        if (authorized === false) {
          throw new ClientRequestError({ success: false, kind: 'error', code: Codes.Forbidden });
        }
        this.claimCorrelatedQuerySlot();
        let result: SingleResult | ErrorResult;
        try {
          result = await svc.findOne(
            {},
            {
              select: select as never,
              sort: sort as never,
              include: nestedInclude as never,
              overrides: { filter: authorized as never },
            },
            { access: 'read', lean: true, includePermissions: false, includeFieldPermissions: false } as never,
          );
        } catch (error) {
          const clientResult = this.getClientRequestErrorResult(error);
          if (clientResult) throw new ClientRequestError(clientResult);
          throw error;
        }
        if (result.success) {
          setDocValue(docs[index], include.path, result.data);
        } else if (result.code === Codes.NotFound) {
          setDocValue(docs[index], include.path, null);
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
        setDocValue(docs[index], include.path, null);
        return;
      }
      const expanded = resolution.filter;
      const operandErrors = validateExpandedCorrelatedOperands(expanded, this.getRequestComplexity());
      if (operandErrors.length > 0) {
        throw new ClientRequestError({
          success: false,
          kind: 'error',
          code: Codes.BadRequest,
          errors: [{ detail: operandErrors[0].detail }],
        });
      }
      const authorized = await svc.genFilter('read', expanded as never);
      if (authorized === false) {
        throw new ClientRequestError({ success: false, kind: 'error', code: Codes.Forbidden });
      }
      this.claimCorrelatedQuerySlot();
      let result: SingleResult | ErrorResult;
      try {
        result = await svc.findOne(
          {},
          {
            select: select as never,
            sort: sort as never,
            include: nestedInclude as never,
            overrides: { filter: authorized as never },
          },
          { access: 'read', lean: true, includePermissions: false, includeFieldPermissions: false } as never,
        );
      } catch (error) {
        const clientResult = this.getClientRequestErrorResult(error);
        if (clientResult) throw new ClientRequestError(clientResult);
        throw error;
      }
      if (result.success) {
        setDocValue(docs[index], include.path, result.data);
      } else if (result.code === Codes.NotFound) {
        setDocValue(docs[index], include.path, null);
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
  ): Promise<void> {
    const svc = await this.getAuthorizedTargetService(include.model, 'list');
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
        setDocValue(docs[index], include.path, []);
        return;
      }
      const expanded = resolution.filter;
      const operandErrors = validateExpandedCorrelatedOperands(expanded, this.getRequestComplexity());
      if (operandErrors.length > 0) {
        throw new ClientRequestError({
          success: false,
          kind: 'error',
          code: Codes.BadRequest,
          errors: [{ detail: operandErrors[0].detail }],
        });
      }
      const authorized = await svc.genFilter('list', expanded as never);
      if (authorized === false) {
        throw new ClientRequestError({ success: false, kind: 'error', code: Codes.Forbidden });
      }
      this.claimCorrelatedQuerySlot();
      let result: ListResult | ErrorResult;
      try {
        result = await svc.find(
          {},
          {
            select: select as never,
            sort: sort as never,
            skip: skip as never,
            limit: limit as never,
            page: page as never,
            pageSize: pageSize as never,
            include: nestedInclude as never,
            overrides: { filter: authorized as never },
          },
          { includeCount: false, lean: true, includePermissions: false, includeFieldPermissions: false } as never,
        );
      } catch (error) {
        const clientResult = this.getClientRequestErrorResult(error);
        if (clientResult) throw new ClientRequestError(clientResult);
        throw error;
      }
      if (result.success) {
        setDocValue(docs[index], include.path, result.data);
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
  ): Promise<void> {
    const svc = await this.getAuthorizedTargetService(include.model, 'count');
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
        setDocValue(docs[index], include.path, 0);
        return;
      }
      const expanded = resolution.filter;
      const operandErrors = validateExpandedCorrelatedOperands(expanded, this.getRequestComplexity());
      if (operandErrors.length > 0) {
        throw new ClientRequestError({
          success: false,
          kind: 'error',
          code: Codes.BadRequest,
          errors: [{ detail: operandErrors[0].detail }],
        });
      }
      // Explicit count access (never the Service.count list default) and
      // count semantics independent of any list limit.
      const authorized = await svc.genFilter('count', expanded as never);
      if (authorized === false) {
        throw new ClientRequestError({ success: false, kind: 'error', code: Codes.Forbidden });
      }
      this.claimCorrelatedQuerySlot();
      let result: SingleResult<number> | ErrorResult;
      try {
        result = await svc.countTrusted(authorized as never);
      } catch (error) {
        const clientResult = this.getClientRequestErrorResult(error);
        if (clientResult) throw new ClientRequestError(clientResult);
        throw error;
      }
      if (result.success) {
        setDocValue(docs[index], include.path, result.data);
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
    const { model, op, id, filter, args, options, sqOptions = {} } = sq;

    let result!: ErrorResult | SingleResult | ListResult;

    if (op === 'list') {
      const svc = await this.getAuthorizedTargetService(model, 'list');
      result = await svc._list(filter, args as never, options as never);
    } else if (op === 'read') {
      const svc = await this.getAuthorizedTargetService(model, 'read');
      // ARF-01: cross-resource read subqueries must not fall back to the
      // target list access path. The fallback is authorized separately above
      // and target list row/field policy would never be re-evaluated.
      const readOptions = { ...(options as object), tryList: false } as never;
      if (id) {
        result = await svc._read(id, args as never, readOptions);
      } else if (filter) {
        result = await svc._readFilter(filter, args as never, readOptions);
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
