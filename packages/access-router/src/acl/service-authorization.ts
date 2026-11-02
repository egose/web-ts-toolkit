/**
 * SVA-01 private primitives only. No service/planner/finalizer calls this module
 * until public admission (SVA-01A) is complete. Never re-export runtime issuers.
 */
import Permission from '../permission';
import { isOwnedPermission } from './owned-permissions';
import {
  isCatalogInputPath,
  isCatalogOutputPath,
  isSafeOutputPath,
  matchesCatalogPattern,
  prepareCapturedOutputCatalog,
  readOwnedAuthorizationCatalogWork,
} from './field-catalog';
import type { AccessRouterPermissions } from '../permission';
import type { AccessRouterRequest } from '../interfaces/request';
import type { Filter } from '../interfaces/query-types';
import type {
  FieldAuthorization,
  OperationAuthorization,
  RelatedAuthorization,
  ServiceAuthorization,
} from '../interfaces/service-authorization';
import { authorizationError, authorizationRecord, copyAuthorizationValue } from './authorization-snapshot';
import type { VirtualPopulateSnapshotToken } from './virtual-populate-dependencies';
import type { PopulatePolicyDefaultsToken } from './populate-policy';
import { assertNoServerModelControls } from '../validation/public-admission';
import { ownedAuthorizationConfiguration } from './captured-authorization-configuration';
import {
  assertAuthorizationModeOptions,
  authorizationControlError,
  serverAuthorizationControls,
} from './authorization-modes';
import type { AuthorizationMode } from '../interfaces/root';
export { ServiceAuthorizationError } from './authorization-snapshot';

export interface AuthorizationBinding {
  readonly request: AccessRouterRequest;
  readonly runtime: object;
  /** Actual registered model identity, not just its name. */
  readonly model: object;
  readonly modelName: string;
  readonly scopePath?: readonly string[];
}

export interface AuthorizationAccess {
  readonly operation: string;
  readonly rowAccess?: string;
  readonly virtualAccess: string;
  readonly outputAccess: string;
  readonly docPermissionsAccess: string;
}

/** SVA-02 supplies this catalog from schema.paths/child schemas and the virtual registry. */
export interface AuthorizationFieldCatalog {
  readonly paths: readonly string[];
  /** Persisted schema paths before output virtuals/virtual-only containers are added. */
  readonly persistedPaths?: readonly string[];
  readonly arrayPaths?: readonly string[];
  readonly schemaVirtualPaths?: readonly string[];
  /** Permission metadata ancestors cannot become replacement input boundaries. */
  readonly metadataPaths?: readonly string[];
  /** Internal schema Map patterns; `$*` is never accepted in a caller path. */
  readonly dynamicPaths?: readonly string[];
  readonly containerPaths?: readonly string[];
  readonly virtualPaths?: readonly string[];
  /** Registered virtual scope containers, including empty scopes, for input alias exclusion. */
  readonly virtualScopePaths?: readonly string[];
  readonly opaquePaths?: readonly string[];
  readonly referencePaths?: readonly string[];
  readonly protectedPaths?: readonly string[];
}

export interface AuthorizationConfiguration {
  readonly catalog: AuthorizationFieldCatalog;
  readonly readAuthorizationMode?: AuthorizationMode;
  readonly listAuthorizationMode?: AuthorizationMode;
  /** Opaque terminal private-input capture. Never related authority or public document metadata. */
  readonly virtualPopulateSnapshot?: VirtualPopulateSnapshotToken;
  /** Held runtime model defaults, distinct from this model's resolved flags. */
  readonly populatePolicyDefaults?: PopulatePolicyDefaultsToken;
  /** Target-owned private input admission mode, not public output/related authority. */
  readonly requireOperationAccessForPopulateDependencies?: boolean;
  /** Independent target-owned ordinary-populate operation admission. */
  readonly requireOperationAccessForPopulateQueries?: boolean;
  readonly documentPermissionField?: string;
  /** Captured permission schema, virtual descriptors, always-select and metadata posture. */
  readonly [key: string]: unknown;
}

/** Package-resolved requested descriptors, not a user-declared model registry. */
export interface AuthorizationRelatedTarget {
  readonly path: string;
  readonly modelName: string;
  readonly configuration: AuthorizationConfiguration;
  /** Actual source-ref target or include receiver, captured with this runtime's configuration. */
  readonly model?: import('mongoose').Model<unknown>;
  /** Effective include args/options, resolved with that target's captured defaults. */
  readonly queryIntent?: import('../services/model-service-intent').ModelServiceIntent;
  /** Existing include operation gate, resolved synchronously with its target. */
  readonly operationGuard?: unknown;
  readonly kind?: 'output' | 'count';
  readonly relatedTargets?: readonly AuthorizationRelatedTarget[];
  /** Captured supported raw-ref transport shape; exotic ordinary populates keep their adapter path. */
  readonly staticObjectIdReference?: boolean;
}

export type AuthorizationApplicability = 'service' | 'mutation' | 'create' | 'output';
export type ResolvedRows =
  | { readonly mode: 'request' | 'unrestricted' }
  | { readonly mode: 'scope'; readonly filter: Filter };
export interface NormalizedServiceAuthorization {
  readonly rows: ResolvedRows;
  readonly outputFields: FieldAuthorization;
  readonly inputFields: FieldAuthorization;
  readonly related: Readonly<Record<string, NormalizedRelatedAuthorization>>;
}
export interface NormalizedRelatedAuthorization extends NormalizedServiceAuthorization {
  readonly model: string;
  readonly operation: OperationAuthorization;
}

/** Package derivation must not turn normalized count defaults into supplied
 * output/related dimensions. Raw caller policy still receives strict validation.
 */
export function serviceAuthorizationInput(
  policy: NormalizedServiceAuthorization,
  targets: readonly AuthorizationRelatedTarget[],
): ServiceAuthorization {
  const related: Record<string, RelatedAuthorization> = {};
  for (const [path, child] of Object.entries(policy.related)) {
    const target = targets.find((entry) => entry.path === path);
    if (!target) authorizationError(`unused related path: ${path}`);
    related[path] =
      target.kind === 'count'
        ? { model: child.model, operation: child.operation, rows: child.rows }
        : {
            model: child.model,
            operation: child.operation,
            ...serviceAuthorizationInput(child, target.relatedTargets ?? []),
          };
  }
  return { rows: policy.rows, outputFields: policy.outputFields, related };
}

declare const resolvedAuthorizationBrand: unique symbol;
export interface ResolvedServiceAuthorization {
  readonly [resolvedAuthorizationBrand]: true;
}

interface CallRecord {
  binding: AuthorizationBinding;
  access: AuthorizationAccess;
  configuration: AuthorizationConfiguration;
  policy: NormalizedServiceAuthorization;
  relatedTargets: readonly AuthorizationRelatedTarget[];
  output: Readonly<{
    access: AuthorizationAccess;
    catalog: AuthorizationFieldCatalog;
    outputFields: FieldAuthorization;
  }>;
  permissions: AccessRouterPermissions;
  provenance: ResolvedServiceAuthorization;
  readonly queryOrigin?: 'read' | 'list';
  readonly sourceMode: AuthorizationMode;
  readonly fieldPolicyOwner?: ResolvedServiceAuthorization;
  view?: ServiceAuthorizationView;
}
const calls = new WeakMap<ResolvedServiceAuthorization, CallRecord>();
const capturedActors = new WeakSet<AccessRouterPermissions>();

/** Entry-owned actor view; internal dispatch can pass this same private capture once. */
export function captureAuthorizationPermissions(
  permissions: AccessRouterPermissions,
  outputOnly = false,
): AccessRouterPermissions {
  // Raw helpers may already receive exact, privately immutable Permission data.
  // Normal operations retain their distinct actor view and internal-child reuse.
  if (capturedActors.has(permissions) || (outputOnly && isOwnedPermission(permissions))) return permissions;
  const captured = new Permission(
    Object.fromEntries(permissions.keys.map((key) => [key, permissions.has(key) === true])),
  );
  capturedActors.add(captured);
  return captured;
}

interface ServiceAuthorizationView {
  readonly authorization: NormalizedServiceAuthorization;
  readonly configuration: AuthorizationConfiguration;
  readonly access: AuthorizationAccess;
  readonly relatedTargets: readonly AuthorizationRelatedTarget[];
}

/** Detached target containers reuse their already-detached, privately branded model captures. */
function captureRelatedTargetPreparation(
  targets: readonly AuthorizationRelatedTarget[],
): readonly AuthorizationRelatedTarget[] {
  let slots = 0;
  const capture = (
    entries: readonly AuthorizationRelatedTarget[],
    depth: number,
  ): readonly AuthorizationRelatedTarget[] => {
    if (depth > 100 || (slots += entries.length) > 20000)
      authorizationError('related capture exceeds structural limits');
    return Object.freeze(
      entries.map((entry) => {
        const { configuration, relatedTargets, ...rest } = entry;
        return Object.freeze({
          ...copyAuthorizationValue(rest, true),
          configuration: ownedAuthorizationConfiguration(configuration),
          relatedTargets: relatedTargets ? capture(relatedTargets, depth + 1) : undefined,
        });
      }),
    );
  };
  return capture(targets, 0);
}

/** Project only proven primitive fields, never arbitrary configuration/catalog extensions. */
function captureAuthorizationAccess(value: AuthorizationAccess): AuthorizationAccess {
  const input = authorizationRecord(value, 'access');
  const access: Record<string, string> = {};
  for (const key of ['operation', 'rowAccess', 'virtualAccess', 'outputAccess', 'docPermissionsAccess']) {
    if (key === 'rowAccess' && input[key] === undefined) continue;
    if (typeof input[key] !== 'string') authorizationError(`invalid access.${key}`);
    access[key] = input[key] as string;
  }
  return Object.freeze(access) as unknown as AuthorizationAccess;
}

function captureAuthorizationCatalog(value: AuthorizationFieldCatalog): AuthorizationFieldCatalog {
  // The fresh schema capture already owns dense frozen primitive-only arrays.
  // Keep that exact capture as the planning/evaluation owner, so both consumers
  // share its private eligibility index. Frozen application lookalikes do not
  // carry this brand and still receive the descriptor admission below.
  if (readOwnedAuthorizationCatalogWork(value)) {
    prepareCapturedOutputCatalog(value);
    return value;
  }
  const input = authorizationRecord(value, 'catalog');
  const catalog: Record<string, readonly string[]> = {};
  for (const key of [
    'paths',
    'persistedPaths',
    'arrayPaths',
    'schemaVirtualPaths',
    'metadataPaths',
    'dynamicPaths',
    'containerPaths',
    'virtualPaths',
    'virtualScopePaths',
    'opaquePaths',
    'referencePaths',
    'protectedPaths',
  ]) {
    const paths = input[key];
    if (key !== 'paths' && paths === undefined) continue;
    if (!Array.isArray(paths) || Array.from(paths).some((path) => typeof path !== 'string')) {
      authorizationError(`invalid catalog.${key}`);
    }
    // The snapshot copier already owns/freezes these arrays; validation proves
    // that sharing them cannot expose a mutable native leaf (including holes).
    catalog[key] = paths as readonly string[];
  }
  const captured = Object.freeze(catalog) as unknown as AuthorizationFieldCatalog;
  prepareCapturedOutputCatalog(captured);
  return captured;
}

export function assertAuthorizationPath(path: unknown): asserts path is string {
  if (typeof path !== 'string' || !isSafeOutputPath(path)) {
    authorizationError(`invalid response path: ${String(path)}`);
  }
}

function overlaps(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b}.`) || b.startsWith(`${a}.`);
}

function assertUnprotected(path: string, configuration: AuthorizationConfiguration): void {
  assertAuthorizationPath(path);
  // Metadata ancestors reject as well. Implementation descendants (e.g. a
  // child's version key) stay excluded by the catalog without prohibiting an
  // otherwise valid grant to the whole embedded business container.
  if (
    overlaps(path, configuration.documentPermissionField ?? '_permissions') ||
    configuration.catalog.protectedPaths?.some((p) => matchesCatalogPattern(p, path, true))
  ) {
    authorizationError(`protected output path: ${path}`);
  }
}

function assertCatalogPath(path: string, configuration: AuthorizationConfiguration): void {
  assertUnprotected(path, configuration);
  const catalog = configuration.catalog;
  if (
    catalog.referencePaths?.some((ref) => matchesCatalogPattern(ref, path, true) && !matchesCatalogPattern(ref, path))
  ) {
    authorizationError(`referenced fields require related authority: ${path}`);
  }
  if (!isCatalogOutputPath(catalog, path)) {
    authorizationError(`unknown output path: ${path}`);
  }
}

export function assertAuthorizationKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  for (const key of serverAuthorizationControls)
    if (key in value) authorizationError(`${label}.${authorizationControlError(key)}`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) authorizationError(`unsupported ${label} key: ${key}`);
}

function normalizeRows(value: unknown): ResolvedRows {
  if (value === undefined) return { mode: 'request' };
  const input = authorizationRecord(value, 'rows');
  if (input.mode === 'request' || input.mode === 'unrestricted') {
    assertAuthorizationKeys(input, ['mode'], 'rows');
    return { mode: input.mode };
  }
  if (input.mode === 'scope') {
    assertAuthorizationKeys(input, ['mode', 'filter'], 'rows');
    if (input.filter !== false) authorizationRecord(input.filter, 'scope.filter');
    return { mode: 'scope', filter: input.filter as Filter };
  }
  return authorizationError('unknown rows mode');
}

function normalizeFields(
  value: unknown,
  configuration: AuthorizationConfiguration,
  dimension: 'outputFields' | 'inputFields' = 'outputFields',
): FieldAuthorization {
  if (value === undefined) return { mode: 'request' };
  const input = authorizationRecord(value, dimension);
  if (input.mode === 'request' || input.mode === 'unrestricted') {
    assertAuthorizationKeys(input, ['mode'], dimension);
    return { mode: input.mode };
  }
  if (input.mode === 'grant') {
    assertAuthorizationKeys(input, ['mode', 'paths'], dimension);
    if (!Array.isArray(input.paths)) authorizationError('grant.paths must be an array');
    // Array.from also visits holes; sparse paths are malformed rather than silently skipped.
    const paths = Array.from(input.paths as unknown[]).map((path) => {
      assertAuthorizationPath(path);
      assertCatalogPath(path, configuration);
      if (dimension === 'inputFields' && !isCatalogInputPath(configuration.catalog, path)) {
        authorizationError(`ineligible persisted input path: ${path}`);
      }
      return path;
    });
    return { mode: 'grant', paths: [...new Set(paths)] };
  }
  return authorizationError(`unknown ${dimension} mode`);
}

function normalizeOperation(value: unknown): OperationAuthorization {
  if (value === undefined) return { mode: 'request' };
  const input = authorizationRecord(value, 'related.operation');
  assertAuthorizationKeys(input, ['mode'], 'related.operation');
  if (input.mode !== 'request' && input.mode !== 'grant') authorizationError('unknown operation mode');
  return { mode: input.mode as 'request' | 'grant' };
}

function normalizePolicy(
  value: unknown,
  applicability: AuthorizationApplicability,
  configuration: AuthorizationConfiguration,
  targets: readonly AuthorizationRelatedTarget[],
): NormalizedServiceAuthorization {
  const input = value === undefined ? {} : authorizationRecord(value, 'authorization');
  assertAuthorizationKeys(
    input,
    applicability === 'output'
      ? ['outputFields']
      : applicability === 'create'
        ? ['inputFields', 'outputFields', 'related']
        : applicability === 'mutation'
          ? ['inputFields', 'rows', 'outputFields', 'related']
          : ['rows', 'outputFields', 'related'],
    'authorization',
  );
  const related: Record<string, NormalizedRelatedAuthorization> = {};
  if (input.related !== undefined) {
    for (const [path, entry] of Object.entries(authorizationRecord(input.related, 'related'))) {
      assertUnprotected(path, configuration);
      const matches = targets.filter((target) => target.path === path);
      if (matches.length !== 1) authorizationError(`unused or ambiguous related path: ${path}`);
      const target = matches[0];
      const child = authorizationRecord(entry, `related.${path}`);
      assertAuthorizationKeys(
        child,
        target.kind === 'count'
          ? ['model', 'operation', 'rows']
          : ['model', 'operation', 'rows', 'outputFields', 'related'],
        `related.${path}`,
      );
      if (typeof child.model !== 'string' || !child.model || child.model !== target.modelName) {
        authorizationError(`related model mismatch: ${path}`);
      }
      const { model, operation, ...policy } = child;
      related[path] = {
        model: model as string,
        operation: normalizeOperation(operation),
        ...normalizePolicy(policy, 'service', target.configuration, target.relatedTargets ?? []),
      };
    }
  }
  return {
    rows: normalizeRows(input.rows),
    outputFields: normalizeFields(input.outputFields, configuration),
    inputFields: normalizeFields(input.inputFields, configuration, 'inputFields'),
    related,
  };
}

function scope(binding: AuthorizationBinding): readonly string[] {
  return binding.scopePath ?? [];
}

function sameScope(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((part, index) => part === b[index]);
}

function callRecord(call: ResolvedServiceAuthorization): CallRecord {
  const record = calls.get(call);
  if (!record) authorizationError('invalid resolved call');
  return record;
}

export function assertAuthorizationBinding(call: ResolvedServiceAuthorization, binding: AuthorizationBinding): void {
  const expected = callRecord(call).binding;
  if (
    expected.request !== binding.request ||
    expected.runtime !== binding.runtime ||
    expected.model !== binding.model ||
    expected.modelName !== binding.modelName ||
    !sameScope(scope(expected), scope(binding))
  ) {
    authorizationError('request/runtime/model/scope binding mismatch');
  }
}

export interface ResolveServiceAuthorizationInput {
  readonly binding: AuthorizationBinding;
  readonly access: AuthorizationAccess;
  readonly configuration: AuthorizationConfiguration;
  readonly requestPermissions: AccessRouterPermissions;
  readonly authorization?: unknown;
  readonly applicability?: AuthorizationApplicability;
  readonly relatedTargets?: readonly AuthorizationRelatedTarget[];
  /** Explicit package-derived branch/target; supplies provenance only, never implicit authority. */
  readonly parent?: ResolvedServiceAuthorization;
  /** Package-only admission from a top-level list execution, never a helper/wire option. */
  readonly listResponse?: boolean;
  /** Package-only root-read/retry admission, not related/embedded or standalone helper authority. */
  readonly readResponse?: boolean;
  /** Explicit package traversal, never inferred from a shared parent/provenance alone. */
  readonly snapshotDerivation?: {
    readonly kind: 'embedded' | 'related' | 'retry';
    readonly parentBinding: AuthorizationBinding;
    readonly path?: string;
  };
}

function queryOutputAccess(access: AuthorizationAccess): boolean {
  return (
    (access.operation === 'read' || access.operation === 'list') &&
    (access.rowAccess === 'read' || access.rowAccess === 'list') &&
    access.outputAccess === access.rowAccess &&
    access.virtualAccess === access.rowAccess &&
    access.docPermissionsAccess === access.rowAccess
  );
}

/** Authenticate an actual embedded/target/retry edge and share only owned preparation. */
export function deriveQueryAuthorization(
  input: ResolveServiceAuthorizationInput,
): ResolvedServiceAuthorization | undefined {
  if (!input.parent || !input.snapshotDerivation) return;
  const parent = callRecord(input.parent),
    edge = input.snapshotDerivation;
  const access = captureAuthorizationAccess(input.access);
  assertAuthorizationBinding(input.parent, edge.parentBinding);
  if (parent.binding.request !== input.binding.request || parent.binding.runtime !== input.binding.runtime)
    authorizationError('derived call request/runtime mismatch');
  if (edge.kind === 'retry' && (parent.queryOrigin !== 'read' || !queryOutputAccess(access))) return;
  const target = edge.kind === 'related' ? parent.relatedTargets.find((entry) => entry.path === edge.path) : undefined;
  if (edge.kind === 'related') {
    if (!target) authorizationError('unknown related output edge');
    if (
      target.modelName !== input.binding.modelName ||
      (target.model && target.model !== input.binding.model) ||
      scope(input.binding).length
    )
      authorizationError('related model/scope mismatch');
    if (target.kind === 'count') return;
  } else {
    assertAuthorizationBinding(input.parent, { ...input.binding, scopePath: parent.binding.scopePath });
    if (edge.kind === 'retry') assertAuthorizationBinding(input.parent, input.binding);
    else {
      const childScope = scope(input.binding),
        parentScope = scope(parent.binding);
      if (
        childScope.length <= parentScope.length ||
        !parentScope.every((part, index) => childScope[index] === part) ||
        Object.keys(parent.access).some(
          (key) => access[key as keyof AuthorizationAccess] !== parent.access[key as keyof AuthorizationAccess],
        )
      )
        authorizationError('embedded scope/access mismatch');
      if (!isCatalogOutputPath(parent.output.catalog, childScope.join('.'))) authorizationError('unknown output scope');
    }
  }
  const configuration = target?.configuration ?? parent.configuration;
  const relatedTargets = target ? (target.relatedTargets ?? []) : parent.relatedTargets;
  const policy = target
    ? (parent.policy.related[target.path] ??
      copyAuthorizationValue(normalizePolicy(undefined, 'service', configuration, relatedTargets)))
    : parent.policy;
  const queryOrigin =
    edge.kind === 'related'
      ? parent.queryOrigin && queryOutputAccess(access)
        ? (access.rowAccess as 'read' | 'list')
        : undefined
      : parent.queryOrigin;
  const call = Object.freeze(Object.create(null)) as ResolvedServiceAuthorization;
  calls.set(call, {
    binding: Object.freeze({ ...input.binding, scopePath: Object.freeze([...scope(input.binding)]) }),
    access,
    configuration,
    policy,
    relatedTargets,
    output: Object.freeze({
      access,
      catalog: target ? captureAuthorizationCatalog(configuration.catalog) : parent.output.catalog,
      outputFields: policy.outputFields,
    }),
    permissions: parent.permissions,
    provenance: parent.provenance,
    queryOrigin,
    sourceMode: edge.kind === 'related' ? modeFor(configuration, queryOrigin) : parent.sourceMode,
    fieldPolicyOwner: target ? call : (parent.fieldPolicyOwner ?? input.parent),
    view: undefined,
  });
  return call;
}

function modeFor(configuration: AuthorizationConfiguration, origin?: 'read' | 'list'): AuthorizationMode {
  return origin
    ? (configuration[origin === 'read' ? 'readAuthorizationMode' : 'listAuthorizationMode'] ?? 'isolated')
    : 'isolated';
}

/** Synchronous capture must occur before any operation hook/await. Omitted policy is request-only. */
export function resolveServiceAuthorization(input: ResolveServiceAuthorizationInput): ResolvedServiceAuthorization {
  // Independent operations capture the initialized actor once. Internal children
  // retain that exact private view, never re-read a live request field or full map.
  if (input.parent) {
    const parent = callRecord(input.parent).binding;
    if (parent.request !== input.binding.request || parent.runtime !== input.binding.runtime)
      authorizationError('derived call request/runtime mismatch');
  }
  const permissions = input.parent
    ? callRecord(input.parent).permissions
    : captureAuthorizationPermissions(input.requestPermissions, input.applicability === 'output');
  assertNoServerModelControls(input.authorization, authorizationError, 'policy');
  assertAuthorizationModeOptions(input.configuration, true);
  const derived = deriveQueryAuthorization(input);
  if (derived) return derived;
  const candidateAccess = captureAuthorizationAccess(input.access);
  const rootQuery = !input.parent && (input.applicability ?? 'service') === 'service' && !scope(input.binding).length;
  const queryOrigin =
    rootQuery && queryOutputAccess(candidateAccess)
      ? input.readResponse === true && candidateAccess.operation === 'read'
        ? 'read'
        : input.listResponse === true && candidateAccess.operation === 'list'
          ? 'list'
          : undefined
      : undefined;
  const sourceMode = modeFor(input.configuration, queryOrigin);
  const raw = copyAuthorizationValue(input.authorization);
  const configuration = ownedAuthorizationConfiguration(input.configuration);
  const targets = captureRelatedTargetPreparation(input.relatedTargets ?? []);
  const access = candidateAccess;
  const outputAccess = captureAuthorizationAccess(access);
  const catalog = captureAuthorizationCatalog(configuration.catalog);
  const policy = copyAuthorizationValue(normalizePolicy(raw, input.applicability ?? 'service', configuration, targets));
  const scopePath = Array.from(scope(input.binding));
  for (const part of scopePath) {
    assertAuthorizationPath(part);
    if (part.includes('.')) authorizationError('scopePath requires response segments');
  }
  if (input.parent) {
    const parent = callRecord(input.parent).binding;
    if (parent.request !== input.binding.request || parent.runtime !== input.binding.runtime) {
      authorizationError('derived call request/runtime mismatch');
    }
  }
  const call = Object.freeze(Object.create(null)) as ResolvedServiceAuthorization;
  calls.set(call, {
    binding: Object.freeze({ ...input.binding, scopePath: Object.freeze(scopePath) }),
    access,
    configuration,
    policy,
    relatedTargets: targets,
    // normalizeFields constructs only mode strings and validated string paths.
    output: Object.freeze({ access: outputAccess, catalog, outputFields: policy.outputFields }),
    permissions,
    provenance: input.parent ? callRecord(input.parent).provenance : call,
    queryOrigin,
    sourceMode,
    fieldPolicyOwner: undefined,
    view: undefined,
  });
  return call;
}

/** Private owned preparation. Copy mutable native policy values at their actual exposure boundary. */
export function readServiceAuthorization(call: ResolvedServiceAuthorization, binding: AuthorizationBinding) {
  assertAuthorizationBinding(call, binding);
  const record = callRecord(call);
  return (record.view ??= Object.freeze({
    authorization: record.policy,
    configuration: record.configuration,
    access: record.access,
    relatedTargets: record.relatedTargets,
  }));
}

/** Embedded scopes share preparation, never grants or per-stage result owners. Targets have their own key. */
export function serviceOutputFieldPolicyOwner(call: ResolvedServiceAuthorization, binding: AuthorizationBinding) {
  const record = callRecord(call);
  assertAuthorizationBinding(call, binding);
  return record.fieldPolicyOwner ?? call;
}

/** Private access-only read; no policy/configuration/related graph traversal. */
export function readServiceAuthorizationAccess(call: ResolvedServiceAuthorization, binding: AuthorizationBinding) {
  assertAuthorizationBinding(call, binding);
  return callRecord(call).output.access;
}

/** Captured source-only mode. No per-call/public selector or borrowed authority. */
export function readServiceAuthorizationMode(
  call: ResolvedServiceAuthorization,
  binding: AuthorizationBinding,
): AuthorizationMode {
  assertAuthorizationBinding(call, binding);
  return callRecord(call).sourceMode;
}

/** Hydration is open configuration: detach this slice, never the unrelated call graph. */
export function readServiceAuthorizationHydration(call: ResolvedServiceAuthorization, binding: AuthorizationBinding) {
  assertAuthorizationBinding(call, binding);
  const record = callRecord(call);
  return Object.freeze({ hydration: record.configuration.hydration });
}

function outputMetadata(configuration: AuthorizationConfiguration) {
  return {
    documentPermissionField: configuration.documentPermissionField,
    exposedDocPermissionKeys: configuration.exposedDocPermissionKeys,
    stripPermissionsField: configuration.stripPermissionsField,
    disableFieldPermissions: configuration.disableFieldPermissions,
  };
}

/** Row presentation needs only metadata posture, never query/default/related policy. */
export function readServiceOutputMetadata(call: ResolvedServiceAuthorization, binding: AuthorizationBinding) {
  assertAuthorizationBinding(call, binding);
  const record = callRecord(call);
  return Object.freeze(outputMetadata(record.configuration));
}

/** Hook lookup is open configuration: keep native/function-backed parents resolution-local. */
export function readServiceDocumentPermissions(call: ResolvedServiceAuthorization, binding: AuthorizationBinding) {
  assertAuthorizationBinding(call, binding);
  const record = callRecord(call);
  return Object.freeze({
    catalog: record.output.catalog,
    docPermissions: record.configuration.docPermissions,
  });
}

/** Finalization owns detached virtual/metadata/hook slices. Field rules have their
 * own call-scoped reader; filters, defaults and related targets are not row work.
 */
export function readServiceFinalizerConfiguration(call: ResolvedServiceAuthorization, binding: AuthorizationBinding) {
  assertAuthorizationBinding(call, binding);
  const record = callRecord(call);
  return Object.freeze({
    catalog: record.output.catalog,
    ...outputMetadata(record.configuration),
    virtuals: record.configuration.virtuals,
    docPermissions: record.configuration.docPermissions,
  });
}

/** Private recursively immutable projection, authenticated even on repeated reads. */
export function readServiceOutputPolicy(call: ResolvedServiceAuthorization, binding: AuthorizationBinding) {
  assertAuthorizationBinding(call, binding);
  return callRecord(call).output;
}

/** Rules are open configuration, not proven immutable: detach just this slice on every read. */
export function readServiceOutputFieldAuthorization(call: ResolvedServiceAuthorization, binding: AuthorizationBinding) {
  assertAuthorizationBinding(call, binding);
  const record = callRecord(call);
  return Object.freeze({
    access: record.output.access,
    catalog: record.output.catalog,
    outputFields: record.output.outputFields,
    reusable: true,
    permissionSchema: record.configuration.permissionSchema,
    modelPermissionPrefix: record.configuration.modelPermissionPrefix,
  });
}

/** Same stored-source eligibility as the field reader, without an observable
 * speculative native copy before falling back to the legacy field evaluator.
 * Necessary, not sufficient: the field module must also prove each lookup route.
 */
export function canPrepareStaticOutputPolicy(
  call: ResolvedServiceAuthorization,
  binding: AuthorizationBinding,
): boolean {
  assertAuthorizationBinding(call, binding);
  const record = callRecord(call);
  return typeof (record.configuration.modelPermissionPrefix ?? '') === 'string';
}

export function getAuthorizationPermissions(
  call: ResolvedServiceAuthorization,
  binding: AuthorizationBinding,
): AccessRouterPermissions {
  assertAuthorizationBinding(call, binding);
  return callRecord(call).permissions;
}

export function getAuthorizationProvenance(call: ResolvedServiceAuthorization): ResolvedServiceAuthorization {
  return callRecord(call).provenance;
}
