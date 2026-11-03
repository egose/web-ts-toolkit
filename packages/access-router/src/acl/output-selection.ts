/** Canonical output eligibility, independent of database fetch/dependency expansion. */
import { normalizeSelect } from '../helpers/query';
import type { FieldAuthorization } from '../interfaces/service-authorization';
import { authorizationError } from './authorization-snapshot';
import { isCatalogOutputPath, isSafeOutputPath, matchesCatalogPattern } from './field-catalog';
import {
  classifyEffectiveFieldAuthorization,
  extractOutputFieldRules,
  type FieldAuthorizationState,
} from './field-authorization';
import {
  getAuthorizationPermissions,
  readServiceAuthorization,
  type AuthorizationBinding,
  type ResolvedServiceAuthorization,
} from './service-authorization';
import {
  getScopeVirtualsObject,
  resolveSnapshotDescriptor,
  type ResolvedVirtualDescriptor,
} from './virtual-descriptor';
import type { PlanVirtualProjectionArgs, VirtualProjectionAccess } from './virtual-projection';
import { debitOutputWork } from './output-work-ledger';

/** Private structural input to both query finalization and existing-value filtering. */
export interface OutputSelectionShape {
  authorization?: ResolvedServiceAuthorization;
  authorizationBinding?: AuthorizationBinding;
  receivingModelName: string;
  scopePath: string[];
  responseScopePath?: readonly string[];
  virtualAccess: VirtualProjectionAccess;
  outputAccess: VirtualProjectionAccess;
  docPermissionsAccess: VirtualProjectionAccess;
  selectionMode: 'all' | 'include' | 'exclude';
  effectiveSelectNorm: string[];
  outputSelection: string[];
  outputPersistedFields: string[];
  outputVirtualNames: string[];
  fieldStates?: Readonly<Record<string, FieldAuthorizationState>>;
  minimalAncestorPaths?: readonly string[];
  outputIdExcluded: boolean;
  fetchIdRetained: boolean;
  childPlans: Record<string, OutputSelectionShape>;
}

type OutputSelectionArgs = Pick<
  PlanVirtualProjectionArgs,
  | 'receivingModelName'
  | 'snapshot'
  | 'virtualAccess'
  | 'outputAccess'
  | 'docPermissionsAccess'
  | 'requestedSelect'
  | 'effectiveSelect'
  | 'scopePath'
  | 'globalPermissions'
>;

export interface CatalogOutputSelection {
  shape: OutputSelectionShape;
  persisted: string[];
  activeVirtuals: { relative: string; descriptor: ResolvedVirtualDescriptor }[];
  children: Record<string, CatalogOutputSelection>;
}

/** One candidate grammar/classifier for all catalog-backed output consumers. Never runs a getter. */
export function selectCatalogOutputShape(
  args: OutputSelectionArgs,
  outputFields: FieldAuthorization = { mode: 'request' },
  safeDefinitions = false,
): CatalogOutputSelection {
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
    !excludes.some((p) => {
      debitOutputWork();
      return relative === p || relative.startsWith(`${p}.`);
    }) &&
    (mode !== 'include' ||
      includes.some((p) => {
        debitOutputWork();
        return relative === p || relative.startsWith(`${p}.`);
      }));
  const full = (path: string) => `${prefix}${path}`;
  const virtual = (path: string) => catalog.virtualPaths?.some((p) => matchesCatalogPattern(p, path, true)) ?? false;
  const container = (path: string) => catalog.containerPaths?.some((p) => matchesCatalogPattern(p, path)) ?? false;
  const valid = (path: string) => isCatalogOutputPath(catalog, path);
  const universe = new Set(
    catalog.paths
      .filter((p) => {
        debitOutputWork();
        return p.startsWith(prefix);
      })
      .map((p) => p.slice(prefix.length)),
  );
  for (const token of includes) {
    debitOutputWork();
    if (valid(full(token))) universe.add(token);
  }
  // Grants enlarge eligibility, not the caller's explicit selection.
  if (outputFields.mode === 'grant')
    for (const path of outputFields.paths) {
      debitOutputWork();
      if (path.startsWith(prefix)) universe.add(path.slice(prefix.length));
    }
  const explicitPaths = [...includes.map(full), ...(outputFields.mode === 'grant' ? outputFields.paths : [])];
  for (const explicit of explicitPaths.filter(valid)) {
    const parts = explicit.split('.');
    for (const pattern of catalog.dynamicPaths ?? []) {
      debitOutputWork();
      const template = pattern.split('.');
      if (!template.every((part, index) => (part === '$*' ? !!parts[index] : !parts[index] || part === parts[index])))
        continue;
      const path = template.map((part, index) => (part === '$*' ? parts[index] : part)).join('.');
      if (path.startsWith(prefix)) universe.add(path.slice(prefix.length));
    }
  }
  const addRulePaths = (record: Record<string, unknown> | null | undefined, parent = '') => {
    for (const [name, value] of Object.entries(record ?? {})) {
      debitOutputWork();
      const path = parent ? `${parent}.${name}` : name;
      if (path.startsWith(prefix) && valid(path)) universe.add(path.slice(prefix.length));
      if (value && typeof value === 'object' && 'sub' in value)
        addRulePaths((value as { sub: Record<string, unknown> }).sub, path);
    }
  };
  addRulePaths(snapshot.permissionSchema);
  const states: Record<string, FieldAuthorizationState> = {};
  const persisted: string[] = [],
    virtualLeaves: string[] = [];
  for (const relative of universe) {
    debitOutputWork();
    const path = full(relative);
    if (!relative || !valid(path) || container(path) || !selected(relative)) continue;
    const state = classifyEffectiveFieldAuthorization({
      path,
      rules: extractOutputFieldRules(snapshot.permissionSchema, path, outputAccess),
      outputFields,
      globalPermissions,
      modelPermissionPrefix: snapshot.modelPermissionPrefix,
    });
    if (safeDefinitions)
      Object.defineProperty(states, relative, { value: state, enumerable: true, configurable: true, writable: true });
    else states[relative] = state;
    if (state === 'denied' || relative === '_id') continue;
    if (virtual(path)) virtualLeaves.push(relative);
    else persisted.push(relative);
  }
  const activeVirtuals: CatalogOutputSelection['activeVirtuals'] = [];
  for (const relative of virtualLeaves) {
    const segments = full(relative).split('.'),
      name = segments.pop()!;
    const registry = getScopeVirtualsObject(
      snapshot.virtuals,
      segments.flatMap((part) => [part, 'sub']),
    );
    // Keep descriptor copying/validation even for a stored helper virtual value.
    const descriptor = resolveSnapshotDescriptor(registry, name, virtualAccess);
    if (descriptor) activeVirtuals.push({ relative, descriptor });
  }
  const ancestors = new Set<string>();
  for (const path of [...persisted, ...activeVirtuals.map((entry) => entry.relative)]) {
    const parts = path.split('.');
    for (let i = 1; i < parts.length; i++) ancestors.add(parts.slice(0, i).join('.'));
  }
  const children: CatalogOutputSelection['children'] = {},
    childPlans: OutputSelectionShape['childPlans'] = {};
  for (const name of [...ancestors].filter((p) => !p.includes('.'))) {
    const childIncludes = includes.filter((p) => p.startsWith(`${name}.`)).map((p) => p.slice(name.length + 1));
    const childExcludes = excludes.filter((p) => p.startsWith(`${name}.`)).map((p) => `-${p.slice(name.length + 1)}`);
    const childSelect =
      mode === 'include' && !includes.includes(name) ? [...childIncludes, ...childExcludes] : childExcludes;
    const child = selectCatalogOutputShape(
      {
        ...args,
        scopePath: [...(args.scopePath ?? []), name, 'sub'],
        requestedSelect: childSelect,
        effectiveSelect: childSelect,
      },
      outputFields,
      safeDefinitions,
    );
    for (const [record, value] of [
      [children, child],
      [childPlans, child.shape],
    ] as const) {
      if (safeDefinitions)
        Object.defineProperty(record, name, { value, enumerable: true, configurable: true, writable: true });
      else Object.assign(record, { [name]: value });
    }
  }
  const fetchIdRetained =
    scope.length === 0 ||
    catalog.paths.includes(full('_id')) ||
    !!catalog.dynamicPaths?.some((p) => p.endsWith('._id') && matchesCatalogPattern(p, full('_id')));
  const outputPersisted = [...new Set([...persisted.filter((p) => !p.includes('.')), ...Object.keys(childPlans)])];
  const outputVirtualNames = activeVirtuals
    .filter((entry) => !entry.relative.includes('.'))
    .map((entry) => entry.relative);
  const outputIdExcluded = excludes.includes('_id');
  return {
    shape: {
      receivingModelName,
      scopePath: [...(args.scopePath ?? [])],
      responseScopePath: Object.freeze(scope),
      virtualAccess,
      outputAccess,
      docPermissionsAccess,
      selectionMode: mode,
      effectiveSelectNorm: normalized,
      outputPersistedFields: outputPersisted,
      outputVirtualNames,
      outputSelection: [...outputPersisted, ...outputVirtualNames, ...(outputIdExcluded ? ['-_id'] : [])],
      fieldStates: Object.freeze(states),
      minimalAncestorPaths: Object.freeze([...ancestors]),
      outputIdExcluded,
      fetchIdRetained,
      childPlans,
    },
    persisted,
    activeVirtuals,
    children,
  };
}

/** Fresh helper selection of safe present literal roots, never a database fetch plan. */
export function prepareExistingOutputShape(
  authorization: ResolvedServiceAuthorization,
  binding: AuthorizationBinding,
  source: Record<string, unknown>,
): OutputSelectionShape {
  const { configuration, authorization: policy, access } = readServiceAuthorization(authorization, binding);
  const scope = [...(binding.scopePath ?? [])];
  if (scope.length && !isCatalogOutputPath(configuration.catalog, scope.join('.')))
    authorizationError('unknown output scope');
  const { shape } = selectCatalogOutputShape(
    {
      receivingModelName: binding.modelName,
      snapshot: configuration,
      ...access,
      scopePath: scope.flatMap((part) => [part, 'sub']),
      effectiveSelect: Object.keys(source).filter((key) => {
        debitOutputWork();
        return !key.includes('.') && isSafeOutputPath(key);
      }),
      globalPermissions: getAuthorizationPermissions(authorization, binding),
    },
    policy.outputFields,
    true,
  );
  shape.authorization = authorization;
  shape.authorizationBinding = Object.freeze({ ...binding, scopePath: Object.freeze(scope) });
  return shape;
}
