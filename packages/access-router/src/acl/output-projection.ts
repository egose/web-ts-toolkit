/** Canonical, schema-backed output planning. Retain this plan through finalization. */
import { types } from 'node:util';
import type { Projection } from '../interfaces';
import type { FieldAuthorization } from '../interfaces/service-authorization';
import { authorizationError } from './authorization-snapshot';
import { isCatalogOutputPath, isSafeOutputPath, matchesCatalogPattern } from './field-catalog';
import { selectCatalogOutputShape, type CatalogOutputSelection } from './output-selection';
import { resolveVirtualPopulateDependencies } from './virtual-populate-dependencies';
import { resolveDocumentPermissionsDefinition } from './document-permissions-definition';
import {
  getAuthorizationPermissions,
  readServiceAuthorization,
  type AuthorizationBinding,
  type AuthorizationConfiguration,
  type ResolvedServiceAuthorization,
} from './service-authorization';
import {
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
  const candidates = new Set(unique);
  return unique.filter((path) => {
    // Only a dotted ancestor can cover this path. Checking its actual ancestors
    // avoids an all-pairs scan for ordinary wide selections, without sorting or
    // changing the caller's deterministic projection order.
    for (let end = path.indexOf('.'); end !== -1; end = path.indexOf('.', end + 1)) {
      if (candidates.has(path.slice(0, end))) return false;
    }
    return true;
  });
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
    true,
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
  safeDefinitions = false,
): VirtualProjectionPlan {
  return expandCatalogProjection(args, selectCatalogOutputShape(args, outputFields, safeDefinitions), safeDefinitions);
}

/** Fetch-only expansion of the canonical selection. Raw value consumers never enter here. */
function expandCatalogProjection(
  args: PlanVirtualProjectionArgs,
  selection: CatalogOutputSelection,
  safeDefinitions: boolean,
): VirtualProjectionPlan {
  const { snapshot, outputAccess, virtualAccess, docPermissionsAccess, receivingModelName } = args;
  const catalog = snapshot.catalog!;
  const scope = (args.scopePath ?? []).filter((part) => part !== 'sub');
  const prefix = scope.length ? `${scope.join('.')}.` : '';
  const globalPermissions = args.globalPermissions ?? { has: () => false, hasKey: () => false };
  const full = (path: string) => `${prefix}${path}`;
  const virtual = (path: string) => catalog.virtualPaths?.some((p) => matchesCatalogPattern(p, path, true)) ?? false;
  const { shape, persisted, activeVirtuals } = selection;
  const candidates: VirtualProjectionPlan['candidates'] = [];
  const depProvenance: Record<string, string[]> = {};
  const allVirtuals = activeVirtuals.map((entry) => entry.relative);
  for (const { relative, descriptor } of activeVirtuals) {
    const name = relative.split('.').pop()!;
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
        authState: shape.fieldStates![relative] as 'granted' | 'deferred',
        virtualAccess,
        outputAccess,
      });
  }
  const children: Record<string, VirtualProjectionPlan> = {};
  for (const [name, selectedChild] of Object.entries(selection.children)) {
    const child = expandCatalogProjection(
      {
        ...args,
        scopePath: selectedChild.shape.scopePath,
        related: [],
        internalFetch: { baseFields: [] },
      },
      selectedChild,
      safeDefinitions,
    );
    if (safeDefinitions)
      Object.defineProperty(children, name, { value: child, enumerable: true, configurable: true, writable: true });
    else children[name] = child;
  }
  const internal = args.internalFetch ?? {};
  const { fetchIdRetained, outputIdExcluded } = shape;
  const identity = fetchIdRetained ? ['_id'] : [];
  const hookInputs = scope.length
    ? []
    : (resolveDocumentPermissionsDefinition(snapshot.docPermissions, docPermissionsAccess)?.dependsOn ?? []);
  const joins = [...(internal.joinFields ?? []), ...(internal.extraPersistedFields ?? [])];
  const forced = [...hookInputs, ...joins, ...(internal.baseFields ?? identity), ...(internal.identityFields ?? [])];
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
  const coveredOutput = (path: string) => persisted.some((p) => p === path || path.startsWith(`${p}.`));
  return {
    receivingModelName,
    scopePath: [...(args.scopePath ?? [])],
    responseScopePath: Object.freeze(scope),
    virtualAccess,
    outputAccess,
    docPermissionsAccess,
    selectionMode: shape.selectionMode,
    effectiveSelectNorm: shape.effectiveSelectNorm,
    outputPersistedFields: shape.outputPersistedFields,
    outputVirtualNames: shape.outputVirtualNames,
    outputSelection: shape.outputSelection,
    fieldStates: shape.fieldStates,
    minimalAncestorPaths: shape.minimalAncestorPaths,
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
