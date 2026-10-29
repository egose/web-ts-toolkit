/** Canonical, schema-backed output planning. Retain this plan through finalization. */
import { types } from 'node:util';
import type { Projection } from '../interfaces';
import type { FieldAuthorization } from '../interfaces/service-authorization';
import { normalizeSelect } from '../helpers/query';
import { authorizationError } from './authorization-snapshot';
import { isCatalogOutputPath, isSafeOutputPath, matchesCatalogPattern } from './field-catalog';
import { classifyEffectiveFieldAuthorization, extractOutputFieldRules } from './field-authorization';
import { resolveVirtualPopulateDependencies } from './virtual-populate-dependencies';
import type { FieldAuthorizationState } from './field-authorization';
import {
  getAuthorizationPermissions,
  readServiceAuthorization,
  type AuthorizationBinding,
  type AuthorizationConfiguration,
  type ResolvedServiceAuthorization,
} from './service-authorization';
import {
  getScopeVirtualsObject,
  resolveAlwaysSelectForAccess,
  resolveSnapshotDescriptor,
  planVirtualProjection,
  type PlanVirtualProjectionArgs,
  type VirtualProjectionPlan,
  type VirtualProjectionSnapshot,
} from './virtual-projection';

// Only this authenticated planner issues field-set ownership. Public mutable
// arrays/flags, copied plans and caller-provided rule descriptors cannot issue it.
const staticPlanFields = new WeakMap<
  VirtualProjectionPlan,
  {
    authorization: ResolvedServiceAuthorization;
    binding: AuthorizationBinding;
    persisted: readonly string[];
    virtuals: readonly string[];
    children: VirtualProjectionPlan['childPlans'];
  }
>();

/** Descriptor-only admission: copy exact ordered primitive strings, never an iterator/getter. */
export function copyOutputDecisionFields(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) return;
  const length = Object.getOwnPropertyDescriptor(value, 'length')!.value as number;
  if (length > 20000) return;
  const fields: string[] = [];
  for (let index = 0; index < length; index++) {
    const slot = Object.getOwnPropertyDescriptor(value, String(index));
    if (!slot || !('value' in slot) || typeof slot.value !== 'string') return;
    fields.push(slot.value);
  }
  return Object.freeze(fields);
}

export function readStaticOutputPlanFields(
  plan: VirtualProjectionPlan,
  authorization: ResolvedServiceAuthorization,
): readonly string[] | undefined {
  const record = staticPlanFields.get(plan);
  if (!record || record.authorization !== authorization || types.isProxy(plan)) return;
  const ownValue = (key: string) => {
    const slot = Object.getOwnPropertyDescriptor(plan, key);
    return slot && 'value' in slot ? slot.value : undefined;
  };
  if (ownValue('authorization') !== authorization || ownValue('authorizationBinding') !== record.binding) return;
  // Traversal is a dynamic boundary. Initial implementation falls back as a whole.
  const children = ownValue('childPlans');
  if (children !== record.children || types.isProxy(children) || Reflect.ownKeys(children).length) return;
  const persisted = copyOutputDecisionFields(ownValue('outputPersistedFields'));
  const virtuals = copyOutputDecisionFields(ownValue('outputVirtualNames'));
  const same = (a: readonly string[] | undefined, b: readonly string[]) =>
    a?.length === b.length && a.every((field, index) => field === b[index]);
  if (!same(persisted, record.persisted) || !same(virtuals, record.virtuals)) return;
  return Object.freeze([...new Set([...record.persisted, ...record.virtuals])]);
}

/** Positive Mongo projection with deterministic ordering and no ancestor/descendant collisions. */
export function compactPersistedProjection(paths: readonly string[]): string[] {
  const unique = [...new Set(paths.filter((p) => p && !p.startsWith('-')))];
  return unique.filter((path) => !unique.some((parent) => parent !== path && path.startsWith(`${parent}.`)));
}

/** Private executor seam: authenticate the call; use its captured catalog/rules/accesses/permissions. */
export function planAuthorizedModelProjection(args: {
  authorization: ResolvedServiceAuthorization;
  binding: AuthorizationBinding;
  requestedSelect?: Projection;
  effectiveSelect?: Projection;
  internalFetch?: PlanVirtualProjectionArgs['internalFetch'];
}): VirtualProjectionPlan {
  const { configuration, authorization, access } = readServiceAuthorization(args.authorization, args.binding);
  const snapshot = configuration as VirtualProjectionSnapshot;
  if (!snapshot.catalog) authorizationError('output planning requires a captured field catalog');
  const scope = [...(args.binding.scopePath ?? [])];
  if (scope.length && !isCatalogOutputPath(snapshot.catalog!, scope.join('.')))
    authorizationError('unknown output scope');
  const plan = planCatalogProjection(
    {
      receivingModelName: args.binding.modelName,
      snapshot,
      virtualAccess: access.virtualAccess,
      outputAccess: access.outputAccess,
      docPermissionsAccess: access.docPermissionsAccess,
      requestedSelect: args.requestedSelect,
      ...(Object.prototype.hasOwnProperty.call(args, 'effectiveSelect')
        ? { effectiveSelect: args.effectiveSelect }
        : {}),
      scopePath: scope.flatMap((part) => [part, 'sub']),
      internalFetch: args.internalFetch,
      globalPermissions: getAuthorizationPermissions(args.authorization, args.binding),
    },
    authorization.outputFields,
  );
  // Keep the authenticated owner separate from serialized output. Never recreate
  // this plan with live options/permissions after an asynchronous hook.
  plan.authorization = args.authorization;
  plan.authorizationBinding = Object.freeze({ ...args.binding, scopePath: Object.freeze(scope) });
  staticPlanFields.set(plan, {
    authorization: args.authorization,
    binding: plan.authorizationBinding,
    persisted: Object.freeze([...plan.outputPersistedFields]),
    virtuals: Object.freeze([...plan.outputVirtualNames]),
    children: plan.childPlans,
  });
  return plan;
}

/** Catalog-less callers remain on the isolated legacy planner entry in virtual-projection. */
export function planCatalogProjection(
  args: PlanVirtualProjectionArgs,
  outputFields: FieldAuthorization = { mode: 'request' },
): VirtualProjectionPlan {
  const { snapshot, outputAccess, virtualAccess, docPermissionsAccess, receivingModelName } = args;
  const catalog = snapshot.catalog!;
  const scope = (args.scopePath ?? []).filter((part) => part !== 'sub');
  const prefix = scope.length ? `${scope.join('.')}.` : '';
  const globalPermissions = args.globalPermissions ?? { has: () => false, hasKey: () => false };
  const raw = Object.prototype.hasOwnProperty.call(args, 'effectiveSelect')
    ? args.effectiveSelect
    : snapshot.requireExplicitSelect && args.requestedSelect === undefined
      ? ['_id']
      : args.requestedSelect;
  const normalized = normalizeSelect(raw ?? null);
  const mode = !normalized.length ? 'all' : normalized.every((p) => p.startsWith('-')) ? 'exclude' : 'include';
  const includes = normalized.filter((p) => !p.startsWith('-'));
  const excludes = normalized.filter((p) => p.startsWith('-')).map((p) => p.slice(1));
  const selected = (relative: string) =>
    !excludes.some((p) => relative === p || relative.startsWith(`${p}.`)) &&
    (mode !== 'include' || includes.some((p) => relative === p || relative.startsWith(`${p}.`)));
  const full = (path: string) => `${prefix}${path}`;
  const virtual = (path: string) => catalog.virtualPaths?.some((p) => matchesCatalogPattern(p, path, true)) ?? false;
  const container = (path: string) => catalog.containerPaths?.some((p) => matchesCatalogPattern(p, path)) ?? false;
  const valid = (path: string) => isCatalogOutputPath(catalog, path);
  const universe = new Set(catalog.paths.filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length)));
  for (const token of includes) if (valid(full(token))) universe.add(token);
  // Grants enlarge omitted/exclusion eligibility, never the caller's explicit selection.
  if (outputFields.mode === 'grant')
    for (const path of outputFields.paths) {
      if (path.startsWith(prefix)) universe.add(path.slice(prefix.length));
    }
  // A named Map key can denote an embedded subtree. Instantiate only keys
  // explicitly supplied by selection/grants, never arbitrary stored keys.
  const explicitPaths = [...includes.map(full), ...(outputFields.mode === 'grant' ? outputFields.paths : [])];
  for (const explicit of explicitPaths.filter(valid)) {
    const parts = explicit.split('.');
    for (const pattern of catalog.dynamicPaths ?? []) {
      const template = pattern.split('.');
      if (!template.every((part, index) => (part === '$*' ? !!parts[index] : !parts[index] || part === parts[index])))
        continue;
      const path = template.map((part, index) => (part === '$*' ? parts[index] : part)).join('.');
      if (path.startsWith(prefix)) universe.add(path.slice(prefix.length));
    }
  }
  // Opaque descendants named by request rules are explicit, known candidates too.
  const addRulePaths = (record: Record<string, unknown> | null | undefined, parent = '') => {
    for (const [name, value] of Object.entries(record ?? {})) {
      const path = parent ? `${parent}.${name}` : name;
      if (path.startsWith(prefix) && valid(path)) universe.add(path.slice(prefix.length));
      if (value && typeof value === 'object' && 'sub' in value)
        addRulePaths((value as { sub: Record<string, unknown> }).sub, path);
    }
  };
  addRulePaths(snapshot.permissionSchema);

  const states: Record<string, FieldAuthorizationState> = {};
  const persisted: string[] = [];
  const virtualLeaves: string[] = [];
  for (const relative of universe) {
    const path = full(relative);
    if (!relative || !valid(path) || container(path) || !selected(relative)) continue;
    // An explicitly selected dynamic branch does not load the whole opaque root.
    const state = classifyEffectiveFieldAuthorization({
      path,
      rules: extractOutputFieldRules(snapshot.permissionSchema, path, outputAccess),
      outputFields,
      globalPermissions,
      modelPermissionPrefix: snapshot.modelPermissionPrefix,
    });
    states[relative] = state;
    if (state === 'denied' || relative === '_id') continue;
    if (virtual(path)) virtualLeaves.push(relative);
    else persisted.push(relative);
  }

  const candidates: VirtualProjectionPlan['candidates'] = [];
  const depProvenance: Record<string, string[]> = {};
  const allVirtuals: string[] = [];
  for (const relative of virtualLeaves) {
    const segments = full(relative).split('.');
    const name = segments.pop()!;
    const registry = getScopeVirtualsObject(
      snapshot.virtuals,
      segments.flatMap((part) => [part, 'sub']),
    );
    const descriptor = resolveSnapshotDescriptor(registry, name, virtualAccess);
    if (!descriptor) continue;
    allVirtuals.push(relative);
    for (const dependency of descriptor.dependsOn) {
      const localPrefix = relative.includes('.') ? relative.slice(0, relative.lastIndexOf('.') + 1) : '';
      const dep = `${localPrefix}${dependency}`;
      if (!depProvenance[dep]) depProvenance[dep] = [];
      depProvenance[dep].push(relative);
    }
    if (!relative.includes('.'))
      candidates.push({
        name,
        descriptor,
        dependsOn: [...descriptor.dependsOn],
        populateDependencies: resolveVirtualPopulateDependencies(
          snapshot as AuthorizationConfiguration,
          args.scopePath ?? [],
          name,
          virtualAccess,
        ),
        authState: states[relative] as 'granted' | 'deferred',
        virtualAccess,
        outputAccess,
      });
  }
  const ancestors = new Set<string>();
  for (const path of [...persisted, ...allVirtuals]) {
    const parts = path.split('.');
    for (let i = 1; i < parts.length; i++) ancestors.add(parts.slice(0, i).join('.'));
  }
  const children: Record<string, VirtualProjectionPlan> = {};
  for (const name of [...ancestors].filter((p) => !p.includes('.'))) {
    // A direct opaque root is already an atomic output; explicit descendant
    // paths still get a child plan for minimal branch projection downstream.
    const childIncludes = includes.filter((p) => p.startsWith(`${name}.`)).map((p) => p.slice(name.length + 1));
    const childExcludes = excludes.filter((p) => p.startsWith(`${name}.`)).map((p) => `-${p.slice(name.length + 1)}`);
    const childSelect =
      mode === 'include' && !includes.includes(name) ? [...childIncludes, ...childExcludes] : childExcludes;
    children[name] = planCatalogProjection(
      {
        ...args,
        scopePath: [...(args.scopePath ?? []), name, 'sub'],
        requestedSelect: childSelect,
        effectiveSelect: childSelect,
        related: [],
        internalFetch: { baseFields: [] },
      },
      outputFields,
    );
  }
  const internal = args.internalFetch ?? {};
  const fetchIdRetained =
    scope.length === 0 ||
    catalog.paths.includes(full('_id')) ||
    !!catalog.dynamicPaths?.some((p) => p.endsWith('._id') && matchesCatalogPattern(p, full('_id')));
  const identity = fetchIdRetained ? ['_id'] : [];
  const always = scope.length
    ? []
    : [
        ...new Set([
          ...resolveAlwaysSelectForAccess(snapshot.alwaysSelectFields, outputAccess),
          ...resolveAlwaysSelectForAccess(snapshot.alwaysSelectFields, docPermissionsAccess),
        ]),
      ];
  const joins = [...(internal.joinFields ?? []), ...(internal.extraPersistedFields ?? [])];
  const forced = [...always, ...joins, ...(internal.baseFields ?? identity), ...(internal.identityFields ?? [])];
  const fetchSafe = (path: string) => isSafeOutputPath(path) && !virtual(full(path));
  const dependencies = Object.keys(depProvenance).filter(fetchSafe);
  // Preserve each selected child's actual plan, including its declared private
  // identity. Plain nested/Mixed containers without a declared _id gain none.
  const childFetch = Object.entries(children).flatMap(([name, child]) => {
    if (child.persistedFetchSelection.length) return child.persistedFetchSelection.map((p) => `${name}.${p}`);
    // A zero-dependency embedded virtual still needs its stored container's
    // presence/array shape. With no declared identity/dependency, retain that
    // container privately; it confers no child output authority.
    depProvenance[name] = allVirtuals.filter((p) => p.startsWith(`${name}.`));
    return [name];
  });
  const publicChildFetch = Object.entries(children).flatMap(([name, child]) =>
    child.publicPersistedFetchSelection.length
      ? child.publicPersistedFetchSelection.map((path) => `${name}.${path}`)
      : [name],
  );
  const publicPersistedFetchSelection = compactPersistedProjection([
    ...persisted,
    ...dependencies,
    ...forced.filter(fetchSafe),
    ...identity,
    ...publicChildFetch,
  ]);
  const publicStructurePaths = Object.entries(children).flatMap(([name, child]) => {
    // An independently retained local/hook/join container keeps its old full view.
    if ([...persisted, ...dependencies, ...forced].some((path) => name === path || name.startsWith(`${path}.`)))
      return [];
    return child.publicPersistedFetchSelection.length
      ? (child.publicStructurePaths ?? []).map((path) => `${name}.${path}`)
      : [name];
  });
  const populateRefs = candidates.flatMap((candidate) => candidate.populateDependencies.map((dep) => dep.path));
  const privateFields = [...dependencies, ...populateRefs, ...forced.filter(fetchSafe), ...identity, ...childFetch];
  const fetch = compactPersistedProjection([...persisted, ...privateFields]);
  const outputIdExcluded = excludes.includes('_id');
  const coveredOutput = (path: string) => persisted.some((p) => p === path || path.startsWith(`${p}.`));
  const outputPersisted = [...new Set([...persisted.filter((p) => !p.includes('.')), ...Object.keys(children)])];
  return {
    receivingModelName,
    scopePath: [...(args.scopePath ?? [])],
    responseScopePath: Object.freeze(scope),
    virtualAccess,
    outputAccess,
    docPermissionsAccess,
    selectionMode: mode,
    effectiveSelectNorm: normalized,
    outputPersistedFields: outputPersisted,
    outputVirtualNames: candidates.map((c) => c.name),
    outputSelection: [...outputPersisted, ...candidates.map((c) => c.name), ...(outputIdExcluded ? ['-_id'] : [])],
    fieldStates: Object.freeze(states),
    minimalAncestorPaths: Object.freeze([...ancestors]),
    persistedFetchSelection: fetch,
    publicPersistedFetchSelection,
    publicStructurePaths,
    candidates,
    depProvenance,
    virtualOnlyDeps: Object.keys(depProvenance).filter((p) => fetchSafe(p) && !coveredOutput(p)),
    internalOnlyFields: [
      ...new Set(privateFields.filter((p) => !coveredOutput(p) && (p !== '_id' || outputIdExcluded))),
    ],
    outputIdExcluded,
    fetchIdRetained,
    internalIdentityFields: identity,
    internalJoinFields: [...new Set(joins)],
    childPlans: children,
    // A parent never supplies its authority to a target; related execution will
    // call planAuthorizedModelProjection with the independently derived owner.
    relatedPlans: (args.related ?? []).map((rel) =>
      planVirtualProjection({
        ...rel,
        receivingModelName: rel.targetModelName,
        snapshot: rel.targetSnapshot,
        globalPermissions,
      }),
    ),
  };
}
