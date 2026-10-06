/**
 * VIRT-02 projection planner (fetch plan vs output plan).
 *
 * Pure planner: given the receiving model, a captured model-options/
 * definition snapshot, separate `virtualAccess` / `outputAccess` /
 * `docPermissionsAccess`, requested/effective select, `scopePath`, optional
 * authorized related descriptors, and internal fetch requirements, returns
 * separate output selection, persisted fetch selection, candidate virtual
 * descriptors with authorization state, virtual-only dependencies, and
 * child/related plans with provenance.
 *
 * Frozen contracts (VIRT-00A):
 * - D1: three accesses are separate; `operation` stays initiating.
 * - D2: `scopePath` is definition/permission path segments
 *   (`[]` at root, `['contacts','sub']` for `contacts.sub.displayName`);
 *   `dependsOn` resolves relative to that scope.
 * - D5: `dependsOn` are top-level persisted names relative to scope;
 *   dotted/virtual-to-virtual already rejected at config (VIRT-01).
 * - D6: effective virtual selection is computed before evaluation;
 *   internal-only deps never reach decorate/tasks as ordinary fields.
 * - D8: arbitrary select strings preserved; registered virtuals stay
 *   virtual (excluded from persisted projections, write admission, DB
 *   sort/filter/distinct).
 *
 * The planner NEVER runs getters (or permission functions). Document-
 * dependent/function rules are retained as `deferred` until the VIRT-03
 * finalizer evaluates actual grants. Definite denial (absent rule,
 * explicit deny, missing applicable getter, purely-global miss) omits the
 * candidate and fetches nothing for it.
 */
import { get, isArray, isBoolean, isFunction, isPlainObject, isString } from '@web-ts-toolkit/utils';
import { normalizeSelect } from '../helpers/query';
import { createValidator } from '../helpers';
import type { Projection } from '../interfaces';

/** Internal effective data policy, including trusted custom accesses; virtual configuration keys stay narrow. */
export type VirtualProjectionAccess = 'list' | 'create' | 'read' | 'update' | (string & {});

export type VirtualCandidateAuthState = 'granted' | 'deferred';

export interface VirtualProjectionSnapshot {
  permissionSchema?: Record<string, unknown> | null;
  virtuals?: Record<string, unknown> | null;
  /** Raw `alwaysSelectFields` option: array or per-access record. */
  alwaysSelectFields?: string[] | Record<string, string[]> | null;
  modelPermissionPrefix?: string;
  requireExplicitSelect?: boolean;
  documentPermissionField?: string;
}

export interface VirtualProjectionInternalFetch {
  /** System fields always retained for policy work (default `['_id']`). */
  baseFields?: string[];
  /** Association/join keys fetched privately (foreign keys, local fields...). */
  joinFields?: string[];
  /** Explicit identity retention (defaults to `_id` handling). */
  identityFields?: string[];
  /** Extra persisted fields forced internally (include locals, correlated refs). */
  extraPersistedFields?: string[];
  /** Trusted select override that must be stripped of virtuals without grant. */
  trustedOverrideSelect?: Projection;
}

export interface VirtualProjectionRelatedDescriptor {
  targetModelName: string;
  targetSnapshot: VirtualProjectionSnapshot;
  virtualAccess: VirtualProjectionAccess;
  outputAccess: VirtualProjectionAccess;
  docPermissionsAccess: VirtualProjectionAccess;
  requestedSelect?: Projection;
  effectiveSelect?: Projection;
  scopePath?: string[];
  internalFetch?: VirtualProjectionInternalFetch;
  related?: VirtualProjectionRelatedDescriptor[];
}

export interface PlanVirtualCandidate {
  name: string;
  descriptor: { get: (...args: never[]) => unknown; dependsOn: string[] };
  authState: VirtualCandidateAuthState;
  dependsOn: string[];
  virtualAccess: VirtualProjectionAccess;
  outputAccess: VirtualProjectionAccess;
}

export interface VirtualProjectionPlan {
  receivingModelName: string;
  scopePath: string[];
  virtualAccess: VirtualProjectionAccess;
  outputAccess: VirtualProjectionAccess;
  docPermissionsAccess: VirtualProjectionAccess;
  selectionMode: 'all' | 'include' | 'exclude';
  /** Normalized effective select (empty = omitted/effectively empty). */
  effectiveSelectNorm: string[];
  /** Persisted output eligibility + virtual names eligible for output. */
  outputSelection: string[];
  outputPersistedFields: string[];
  outputVirtualNames: string[];
  /** Safe Mongoose projection: no virtuals, no `.sub` paths, no `-_id`. */
  persistedFetchSelection: string[];
  candidates: PlanVirtualCandidate[];
  virtualOnlyDeps: string[];
  internalOnlyFields: string[];
  depProvenance: Record<string, string[]>;
  outputIdExcluded: boolean;
  fetchIdRetained: boolean;
  internalIdentityFields: string[];
  internalJoinFields: string[];
  childPlans: Record<string, VirtualProjectionPlan>;
  relatedPlans: VirtualProjectionPlan[];
}

export interface PlanVirtualProjectionArgs {
  receivingModelName: string;
  snapshot: VirtualProjectionSnapshot;
  virtualAccess: VirtualProjectionAccess;
  outputAccess: VirtualProjectionAccess;
  docPermissionsAccess: VirtualProjectionAccess;
  requestedSelect?: Projection;
  /** When present (own property), overrides requireExplicitSelect computation. */
  effectiveSelect?: Projection;
  scopePath?: string[];
  related?: VirtualProjectionRelatedDescriptor[];
  internalFetch?: VirtualProjectionInternalFetch;
  globalPermissions?: { has: (key: string) => boolean; hasKey: (key: string) => boolean };
}

// ---------------------------------------------------------------------------
// Snapshot-scoped registry helpers (mirror runtime.ts VIRT-01, snapshot-based
// so in-flight planning/finalization stay coherent).
// ---------------------------------------------------------------------------

const isVirtualContainerValue = (value: unknown): value is { sub: Record<string, unknown> } =>
  isPlainObject(value) && 'sub' in (value as Record<string, unknown>);

const getScopeVirtualsObject = (
  rootVirtuals: Record<string, unknown> | null | undefined,
  scopePath: string[] | undefined,
): Record<string, unknown> | null => {
  if (!rootVirtuals || !isPlainObject(rootVirtuals)) return null;
  if (!scopePath || scopePath.length === 0) return rootVirtuals;
  let current: unknown = rootVirtuals;
  for (let i = 0; i < scopePath.length; i += 2) {
    const field = scopePath[i];
    const subMarker = scopePath[i + 1];
    if (!field || subMarker !== 'sub') return null;
    if (!isPlainObject(current)) return null;
    const container = (current as Record<string, unknown>)[field];
    if (!isVirtualContainerValue(container)) return null;
    current = (container as { sub: Record<string, unknown> }).sub;
    if (!isPlainObject(current)) return null;
  }
  return current as Record<string, unknown>;
};

const toSnapshotDescriptor = (
  leaf: unknown,
  sharedDependsOn: unknown,
): { get: (...args: never[]) => unknown; dependsOn: string[] } | null => {
  if (isFunction(leaf))
    return { get: leaf as (...args: never[]) => unknown, dependsOn: ((sharedDependsOn as string[]) ?? []) as string[] };
  if (!isPlainObject(leaf)) return null;
  const record = leaf as Record<string, unknown>;
  if (!isFunction(record.get)) return null;
  const dependsOn = (record.dependsOn ?? sharedDependsOn ?? []) as string[];
  return { get: record.get as (...args: never[]) => unknown, dependsOn: [...dependsOn] };
};

const resolveSnapshotDescriptor = (
  scopeVirtuals: Record<string, unknown> | null,
  virtualName: string,
  access: string,
): { get: (...args: never[]) => unknown; dependsOn: string[] } | undefined => {
  if (!scopeVirtuals || !(virtualName in scopeVirtuals)) return undefined;
  const entry = scopeVirtuals[virtualName];
  if (entry === undefined || isVirtualContainerValue(entry)) return undefined;
  if (isFunction(entry)) return { get: entry as (...args: never[]) => unknown, dependsOn: [] };
  if (!isPlainObject(entry)) return undefined;
  const record = entry as Record<string, unknown>;
  if ('get' in record) {
    return toSnapshotDescriptor(entry, undefined) ?? undefined;
  }
  const sharedDependsOn = record.dependsOn as string[] | undefined;
  const exact = record[access];
  if (exact !== undefined) {
    const descriptor = toSnapshotDescriptor(exact, sharedDependsOn);
    if (descriptor) return descriptor;
  }
  const fallback = record.default;
  if (fallback !== undefined) {
    const descriptor = toSnapshotDescriptor(fallback, sharedDependsOn);
    if (descriptor) return descriptor;
  }
  return undefined;
};

const hasModelPermissionValue = (value: unknown, modelPermissionPrefix: string): boolean => {
  if (!modelPermissionPrefix) return true;
  if (isString(value)) {
    return value
      .trim()
      .split(' ')
      .some((item) => item.startsWith(modelPermissionPrefix));
  }
  if (isArray(value)) {
    return (value as unknown[]).some((item) => {
      if (isString(item) || isArray(item)) {
        return hasModelPermissionValue(item, modelPermissionPrefix);
      }
      return true;
    });
  }
  return isFunction(value);
};

/** Scoped permissionSchema object for a scopePath (VIRT-00A D2). */
const getScopedPermissionSchema = (
  root: Record<string, unknown> | null | undefined,
  scopePath: string[],
): Record<string, unknown> | null => {
  if (!root || !isPlainObject(root)) return null;
  if (scopePath.length === 0) return root;
  const scoped = get(root as object, scopePath.join('.')) as unknown;
  return isPlainObject(scoped) ? (scoped as Record<string, unknown>) : null;
};

/** Resolve `alwaysSelectFields` for an access from raw option shapes. */
export const resolveAlwaysSelectForAccess = (
  raw: VirtualProjectionSnapshot['alwaysSelectFields'],
  access: string,
): string[] => {
  if (!raw) return [];
  if (isArray(raw)) return [...(raw as string[])];
  if (isPlainObject(raw)) {
    const record = raw as Record<string, unknown>;
    const exact = record[access];
    if (isArray(exact)) return [...(exact as string[])];
    const def = record.default;
    if (isArray(def)) return [...(def as string[])];
    return [];
  }
  return [];
};

/** Strip registered virtual names from a normalized select (both `v`/`-v`). */
export const stripVirtualsFromNormalizedSelect = (normalized: string[], virtualNames: Set<string>): string[] =>
  normalized.filter((token) => {
    const base = token.startsWith('-') ? token.slice(1) : token;
    // Never emit `.sub` definition paths into DB projections.
    if (base.includes('.sub.')) return false;
    if (virtualNames.has(base)) return false;
    return true;
  });

/** Whether a token's base name is a registered virtual in this scope. */
export const isVirtualSelectToken = (token: string, virtualNames: Set<string>): boolean => {
  const base = token.startsWith('-') ? token.slice(1) : token;
  if (base.includes('.sub.')) return true;
  return virtualNames.has(base);
};

// ---------------------------------------------------------------------------
// Planner
// ---------------------------------------------------------------------------

const stripLeadingDash = (token: string): string => (token.startsWith('-') ? token.slice(1) : token);

const dbPrefixForScope = (scopePath: string[]): string[] => scopePath.filter((segment) => segment !== 'sub');

const toDbPath = (scopePath: string[], dep: string): string => {
  const prefix = dbPrefixForScope(scopePath);
  return prefix.length > 0 ? `${prefix.join('.')}.${dep}` : dep;
};

export function planVirtualProjection(args: PlanVirtualProjectionArgs): VirtualProjectionPlan {
  const {
    receivingModelName,
    snapshot,
    virtualAccess,
    outputAccess,
    docPermissionsAccess,
    scopePath = [],
    related = [],
    internalFetch = {},
    globalPermissions = { has: () => false, hasKey: () => false },
  } = args;
  const hasEffective = Object.prototype.hasOwnProperty.call(args, 'effectiveSelect');
  const requestedSelect = args.requestedSelect;
  const requireExplicitSelect = snapshot.requireExplicitSelect ?? false;

  // Effective select: explicit override wins; otherwise apply
  // requireExplicitSelect omitted (`undefined`) => `['_id']` (service.ts:226-227).
  const effectiveRaw: Projection | undefined = hasEffective
    ? (args.effectiveSelect as Projection | undefined)
    : requireExplicitSelect && requestedSelect === undefined
      ? ['_id']
      : requestedSelect;

  const effectiveNorm = normalizeSelect(effectiveRaw ?? null);
  const selectionMode: VirtualProjectionPlan['selectionMode'] =
    effectiveNorm.length === 0 ? 'all' : effectiveNorm.every((v) => v.startsWith('-')) ? 'exclude' : 'include';
  const outputIdExcluded = effectiveNorm.includes('-_id');

  const scopeVirtuals = getScopeVirtualsObject(snapshot.virtuals ?? null, scopePath);
  const registryNames = scopeVirtuals
    ? Object.entries(scopeVirtuals)
        .filter(([, v]) => v !== undefined && !isVirtualContainerValue(v))
        .map(([k]) => k)
    : [];
  const registrySet = new Set(registryNames);

  const scopedPermissionSchema = getScopedPermissionSchema(
    (snapshot.permissionSchema ?? null) as Record<string, unknown> | null,
    scopePath,
  );
  const modelPermissionPrefix = snapshot.modelPermissionPrefix ?? '';
  const { stringHandler, arrayHandler } = createValidator(
    (key: string) => globalPermissions.hasKey(key) && globalPermissions.has(key),
  );

  // Always-select (forced fetch, never a grant): strip virtuals up front.
  // Embedded scopes never carry alwaysSelect (core.ts:204-205).
  const rawAlways = scopePath.length > 0 ? [] : resolveAlwaysSelectForAccess(snapshot.alwaysSelectFields, outputAccess);
  const alwaysStripped = stripVirtualsFromNormalizedSelect(
    normalizeSelect(rawAlways as unknown as Projection),
    registrySet,
  ).filter((t) => !t.startsWith('-') && !t.includes('.sub.'));

  // Trusted override select: strip virtuals without granting auth.
  const overrideNorm = normalizeSelect((internalFetch.trustedOverrideSelect ?? null) as Projection);
  const overrideStripped = stripVirtualsFromNormalizedSelect(overrideNorm, registrySet);

  // Persisted defined keys for this scope (excluding virtual leaves).
  const persistedDefined: string[] = scopedPermissionSchema
    ? Object.keys(scopedPermissionSchema).filter((k) => !registrySet.has(k) && k !== 'sub')
    : [];

  // ---- Output persisted eligibility (independent of internal fetch) ----
  // Mirrors resolveSelectForRequest inclusion/exclusion shape, but scoped to
  // defined persisted keys (+ `_id` identity). No permission strictness here:
  // doc-grant enforcement stays with the VIRT-03 finalizer via outputAccess.
  let outputPersisted: string[];
  if (selectionMode === 'all') {
    outputPersisted = [...persistedDefined];
    // Omit `_id` from the defined list; identity handled via flags.
    outputPersisted = outputPersisted.filter((f) => f !== '_id');
  } else if (selectionMode === 'exclude') {
    const excluded = new Set(effectiveNorm.map(stripLeadingDash));
    outputPersisted = persistedDefined.filter((f) => !excluded.has(f) && f !== '_id');
  } else {
    const includeSet = new Set(effectiveNorm.filter((t) => !t.startsWith('-')).map(stripLeadingDash));
    outputPersisted = persistedDefined.filter((f) => includeSet.has(f));
    // Unknown names follow persisted policy: dropped (not in defined).
    // `_id` handled via flags, not as a defined field.
  }

  // ---- Virtual candidates: classify registry before access applicability --
  const candidates: PlanVirtualCandidate[] = [];
  const excludedSet = selectionMode === 'exclude' ? new Set(effectiveNorm.map(stripLeadingDash)) : new Set<string>();
  const includeSet =
    selectionMode === 'include' ? new Set(effectiveNorm.filter((t) => !t.startsWith('-')).map(stripLeadingDash)) : null;

  for (const name of registryNames) {
    // Selection gating first (cheap, no auth work for skipped).
    if (selectionMode === 'include' && (!includeSet || !includeSet.has(name))) continue;
    if (selectionMode === 'exclude' && excludedSet.has(name)) continue;

    const descriptor = resolveSnapshotDescriptor(scopeVirtuals, name, virtualAccess);
    if (!descriptor) continue; // inapplicable stays virtual, never persisted.

    const rawRule = scopedPermissionSchema?.[name] as
      | Record<string, unknown>
      | string
      | string[]
      | boolean
      | Function
      | undefined;
    let rule: unknown;
    if (rawRule !== null && typeof rawRule === 'object' && !isArray(rawRule) && !isFunction(rawRule)) {
      const rec = rawRule as Record<string, unknown>;
      rule = outputAccess in rec ? rec[outputAccess] : rec;
      // A bare `{ sub }` container or unrelated object is not a virtual grant.
      if (rule !== null && typeof rule === 'object' && !isArray(rule) && !isFunction(rule)) continue; // absent/deny
    } else {
      rule = rawRule;
    }

    if (rule === undefined) continue; // absent rule => definite denial.
    if (isBoolean(rule)) {
      if (!rule) continue; // explicit deny fetches nothing.
      candidates.push({
        name,
        descriptor,
        authState: 'granted',
        dependsOn: [...descriptor.dependsOn],
        virtualAccess,
        outputAccess,
      });
      continue;
    }
    if (isFunction(rule)) {
      // Never evaluate permission functions during planning; retain for finalizer.
      candidates.push({
        name,
        descriptor,
        authState: 'deferred',
        dependsOn: [...descriptor.dependsOn],
        virtualAccess,
        outputAccess,
      });
      continue;
    }
    if (isString(rule)) {
      if (stringHandler(rule)) {
        candidates.push({
          name,
          descriptor,
          authState: 'granted',
          dependsOn: [...descriptor.dependsOn],
          virtualAccess,
          outputAccess,
        });
      } else if (hasModelPermissionValue(rule, modelPermissionPrefix)) {
        candidates.push({
          name,
          descriptor,
          authState: 'deferred',
          dependsOn: [...descriptor.dependsOn],
          virtualAccess,
          outputAccess,
        });
      }
      // Purely-global miss => definite denial (omit, fetch nothing).
      continue;
    }
    if (isArray(rule)) {
      if (arrayHandler(rule as string[] | string[][])) {
        candidates.push({
          name,
          descriptor,
          authState: 'granted',
          dependsOn: [...descriptor.dependsOn],
          virtualAccess,
          outputAccess,
        });
      } else if (hasModelPermissionValue(rule, modelPermissionPrefix)) {
        candidates.push({
          name,
          descriptor,
          authState: 'deferred',
          dependsOn: [...descriptor.dependsOn],
          virtualAccess,
          outputAccess,
        });
      }
      continue;
    }
    // Any other rule shape => definite denial.
  }

  const outputVirtualNames = candidates.map((c) => c.name);
  const outputSelection = [...outputPersisted, ...outputVirtualNames];
  if (outputIdExcluded) outputSelection.push('-_id');

  // ---- Fetch construction: deps outside output grants only here ---------
  const outputPersistedSet = new Set(outputPersisted);
  // VIRT-12-F03 least-privilege fetch: definite denials stay out of the DB
  // projection unless retained as a virtual dependency. Mirrors candidate
  // classification (granted/deferred fetchable; explicit `false`, absent,
  // non-grant objects, and purely-global misses denied). Output eligibility
  // (`outputPersistedFields`) stays broad on purpose — the VIRT-03 finalizer
  // enforces `outputAccess` with real doc grants — but the fetch set must
  // never load `false`-ruled non-dependency contents into app memory.
  const isPersistedFetchable = (field: string): boolean => {
    const rawRule = scopedPermissionSchema?.[field] as
      | Record<string, unknown>
      | string
      | string[]
      | boolean
      | Function
      | undefined;
    let rule: unknown;
    if (rawRule !== null && typeof rawRule === 'object' && !isArray(rawRule) && !isFunction(rawRule)) {
      const rec = rawRule as Record<string, unknown>;
      rule = outputAccess in rec ? rec[outputAccess] : rec;
      if (rule !== null && typeof rule === 'object' && !isArray(rule) && !isFunction(rule)) return false;
    } else {
      rule = rawRule;
    }
    if (rule === undefined) return false;
    if (isBoolean(rule)) return rule;
    // Permission functions are never evaluated during planning; retain for
    // post-fetch evaluation (deferred).
    if (isFunction(rule)) return true;
    if (isString(rule)) {
      if (stringHandler(rule)) return true;
      if (hasModelPermissionValue(rule, modelPermissionPrefix)) return true;
      return false;
    }
    if (isArray(rule)) {
      if (arrayHandler(rule as string[] | string[][])) return true;
      if (hasModelPermissionValue(rule, modelPermissionPrefix)) return true;
      return false;
    }
    return false;
  };
  const depProvenance: Record<string, string[]> = {};
  // Relative to this scope (e.g. `displayName` inside `contacts.sub`).
  // Parents prefix these to absolute DB paths; never `*.sub.*` def paths.
  const depRelative = new Set<string>();
  for (const cand of candidates) {
    for (const dep of cand.dependsOn) {
      depRelative.add(dep);
      if (!depProvenance[dep]) depProvenance[dep] = [];
      if (!depProvenance[dep].includes(cand.name)) depProvenance[dep].push(cand.name);
    }
  }

  const virtualOnlyDeps: string[] = [...depRelative].filter((dep) => !outputPersistedSet.has(dep));

  const baseFields = internalFetch.baseFields ?? ['_id'];
  const joinFields = [...(internalFetch.joinFields ?? []), ...(internalFetch.extraPersistedFields ?? [])].filter(
    (f) => !f.includes('.sub.') && !registrySet.has(f.startsWith('-') ? f.slice(1) : f),
  );
  const identityFields = internalFetch.identityFields ?? [];

  // Persisted fetch = authorized output persisted (definite denials excluded)
  // + virtual deps (even when denied, stripped post-fetch) + alwaysSelect +
  // trusted overrides (stripped) + internal join/extra + identity. Never
  // virtual names, never `.sub` definition paths, never `-_id`. All paths
  // here are relative to this scope (root absolute == relative).
  const fetchSet = new Set<string>();
  for (const f of outputPersisted) {
    if (isPersistedFetchable(f)) fetchSet.add(f);
  }
  for (const d of depRelative) fetchSet.add(d);
  for (const f of alwaysStripped) fetchSet.add(f);
  for (const f of overrideStripped.filter((t) => !t.startsWith('-'))) fetchSet.add(stripLeadingDash(f));
  for (const f of joinFields.filter((t) => !t.startsWith('-'))) fetchSet.add(stripLeadingDash(f));
  for (const f of [...baseFields, ...identityFields]) {
    const leaf = stripLeadingDash(f);
    if (leaf && leaf !== '-_id' && !leaf.includes('.sub.') && !registrySet.has(leaf)) fetchSet.add(leaf);
  }
  // Internal `_id` retention for policy/association work; output `-_id`
  // honored independently via `outputIdExcluded`.
  const fetchIdRetained = true;
  if (fetchIdRetained) fetchSet.add('_id');
  fetchSet.delete('-_id');

  // Defer fetch-list construction until after child retention: the final
  // rebuild below keeps deterministic order + safe minimal projection.
  // (An intermediate assignment here would be overwritten before use.)
  let persistedFetchSelection: string[];

  const internalOnlyFields = [...fetchSet].filter(
    (f) => !outputPersistedSet.has(f) && !(f === '_id' && !outputIdExcluded && selectionMode !== 'all' ? false : false),
  );
  // `_id` internal-only when output excludes it; otherwise it is shared.
  const internalOnly = new Set<string>([
    ...virtualOnlyDeps,
    ...alwaysStripped.filter((f) => !outputPersistedSet.has(f)),
    ...joinFields.filter((f) => !outputPersistedSet.has(stripLeadingDash(f))),
  ]);
  if (outputIdExcluded) internalOnly.add('_id');
  // Trusted-override extras that are not output-eligible stay internal.
  for (const f of overrideStripped.filter((t) => !t.startsWith('-')).map(stripLeadingDash)) {
    if (!outputPersistedSet.has(f)) internalOnly.add(f);
  }

  // ---- Child plans: embedded scopes retain containers without DB `.sub` --
  const childPlans: Record<string, VirtualProjectionPlan> = {};
  if (scopeVirtuals) {
    for (const [containerName, raw] of Object.entries(scopeVirtuals)) {
      if (!isVirtualContainerValue(raw)) continue;
      const childScopePath = [...scopePath, containerName, 'sub'];
      // Child selection: when the parent explicitly includes, only build a
      // populated child when the container (or a dotted child path) is
      // requested; omitted/empty parents consider all child applicables.
      let childRequested: Projection | undefined;
      let childEffective: Projection | undefined;
      if (selectionMode === 'all') {
        childRequested = undefined;
        childEffective = undefined;
      } else if (selectionMode === 'include') {
        const wantsContainer =
          effectiveNorm.includes(containerName) ||
          effectiveNorm.some((t) => t === containerName || t.startsWith(`${containerName}.`));
        if (!wantsContainer) continue;
        // A bare container inclusion considers all child applicables.
        childRequested = undefined;
        childEffective = undefined;
      } else {
        // Exclusion mode: propagate exclusions scoped to this container.
        const prefix = `${containerName}.`;
        const childExcludes = effectiveNorm
          .filter((t) => t.startsWith('-') && stripLeadingDash(t).startsWith(prefix))
          .map((t) => `-${stripLeadingDash(t).slice(prefix.length)}`);
        // Also handle definition-path exclusions (`contacts.sub.x`).
        const defPrefix = `${containerName}.sub.`;
        for (const t of effectiveNorm) {
          if (t.startsWith('-') && stripLeadingDash(t).startsWith(defPrefix)) {
            childExcludes.push(`-${stripLeadingDash(t).slice(defPrefix.length)}`);
          }
        }
        childRequested = childExcludes.length > 0 ? childExcludes : undefined;
        childEffective = childRequested;
      }
      const child = planVirtualProjection({
        receivingModelName,
        snapshot,
        virtualAccess,
        outputAccess,
        docPermissionsAccess,
        requestedSelect: childRequested,
        effectiveSelect: childEffective,
        scopePath: childScopePath,
        globalPermissions,
      });
      childPlans[containerName] = child;
      // Retain needed containers in the parent fetch as real DB paths
      // (never `*.sub.*` definition paths). Fetching the container whole
      // already brings all child deps/output fields, so subpaths are NOT
      // added here: MongoDB rejects projections containing both an ancestor
      // (`contacts`) and a descendant (`contacts.displayName`) with
      // "Path collision". Container-only retention is safe (finalizer trims
      // denied/unselected fields) and avoids the collision.
      if (child.candidates.length > 0 || child.persistedFetchSelection.length > 0) {
        // Ensure the container itself is fetchable for embedded traversal.
        const containerDb = toDbPath(scopePath, containerName);
        if (!containerDb.includes('.sub.')) fetchSet.add(containerDb);
      }
    }
  }
  // Rebuild fetch list after child retention (keeps deterministic order).
  persistedFetchSelection = [...fetchSet].filter((f) => f !== '-_id');
  if (persistedFetchSelection.length === 0) persistedFetchSelection = ['_id'];
  {
    const head = outputPersisted.filter((f) => fetchSet.has(f));
    const rest = persistedFetchSelection.filter((f) => !head.includes(f)).sort();
    persistedFetchSelection = [...head, ...rest];
  }

  // ---- Related plans: target's own defs/access (VIRT-05 owns row policy) --
  const relatedPlans: VirtualProjectionPlan[] = (related ?? []).map((rel) =>
    planVirtualProjection({
      receivingModelName: rel.targetModelName,
      snapshot: rel.targetSnapshot,
      virtualAccess: rel.virtualAccess,
      outputAccess: rel.outputAccess,
      docPermissionsAccess: rel.docPermissionsAccess,
      requestedSelect: rel.requestedSelect,
      ...(Object.prototype.hasOwnProperty.call(rel, 'effectiveSelect') ? { effectiveSelect: rel.effectiveSelect } : {}),
      scopePath: rel.scopePath ?? [],
      related: rel.related,
      internalFetch: rel.internalFetch,
      globalPermissions,
    }),
  );

  const internalIdentityFields = fetchIdRetained ? ['_id'] : [];
  const internalJoinFields = [...new Set(joinFields.map(stripLeadingDash))];

  return {
    receivingModelName,
    scopePath: [...scopePath],
    virtualAccess,
    outputAccess,
    docPermissionsAccess,
    selectionMode,
    effectiveSelectNorm: [...effectiveNorm],
    outputSelection: [...outputSelection],
    outputPersistedFields: [...outputPersisted],
    outputVirtualNames: [...outputVirtualNames],
    persistedFetchSelection: [...persistedFetchSelection],
    candidates: candidates.map((c) => ({ ...c, dependsOn: [...c.dependsOn] })),
    virtualOnlyDeps: [...virtualOnlyDeps].sort(),
    internalOnlyFields: [...internalOnly].sort(),
    depProvenance: Object.fromEntries(Object.entries(depProvenance).map(([k, v]) => [k, [...v]])),
    outputIdExcluded,
    fetchIdRetained,
    internalIdentityFields,
    internalJoinFields,
    childPlans,
    relatedPlans,
  };
}

/** Strip virtual names from an arbitrary projection input (VIRT-00A D8). */
export const stripVirtualNamesFromProjection = (select: Projection, virtualNames: string[] | Set<string>): string[] => {
  const set = virtualNames instanceof Set ? virtualNames : new Set(virtualNames);
  return stripVirtualsFromNormalizedSelect(normalizeSelect(select), set);
};
