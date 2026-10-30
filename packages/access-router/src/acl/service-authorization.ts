/**
 * SVA-01 private primitives only. No service/planner/finalizer calls this module
 * until public admission (SVA-01A) is complete. Never re-export runtime issuers.
 */
import Permission from '../permission';
import {
  isCatalogInputPath,
  isCatalogOutputPath,
  isSafeOutputPath,
  matchesCatalogPattern,
  prepareCapturedOutputCatalog,
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
  /** Captured server model option; alone it never issues relaxed document authority. */
  readonly unsafeSkipListDocumentSnapshotChecks?: boolean;
  readonly unsafeSkipReadDocumentSnapshotChecks?: boolean;
  readonly unsafeSkipListOutputSnapshotChecks?: boolean;
  readonly unsafeSkipReadOutputSnapshotChecks?: boolean;
  readonly unsafeSkipListNestedDocumentSnapshotChecks?: boolean;
  readonly unsafeSkipReadNestedDocumentSnapshotChecks?: boolean;
  readonly unsafeSkipListInitialOutputSnapshotCopy?: boolean;
  readonly unsafeSkipReadInitialOutputSnapshotCopy?: boolean;
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
  reusableFieldConfiguration?: boolean;
  permissions: AccessRouterPermissions;
  provenance: ResolvedServiceAuthorization;
  readonly validateDocumentSnapshots: boolean;
  /** Root-read origin, retained only by explicitly authenticated same-binding retries. */
  readonly readResponse: boolean;
  readonly nestedResponse: boolean;
  /** Only authenticated query descendants/retries inherit the initiating model's settings. */
  readonly responseSnapshots?: Readonly<{ skipOutput: boolean; skipNested: boolean; skipInitialOutputCopy: boolean }>;
  readonly validateOutputSnapshots: boolean;
  readonly skipInitialOutputSnapshotCopy: boolean;
}
const calls = new WeakMap<ResolvedServiceAuthorization, CallRecord>();

/** A detached native may normalize differently on its next copy (notably BSON
 * wire hooks). Prove reuse from the stored source, before a read can turn that
 * native into a seemingly immutable primitive. Functions retain identity on
 * copies; mutable function-backed lookup slots are handled by the field reader.
 */
function hasStableConfigurationCopies(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return true;
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.values(value).every(hasStableConfigurationCopies);
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

/** Authenticate the selected traversal edge; ordinary parent calls must remain strict. */
function nestedQueryResponse(input: ResolveServiceAuthorizationInput, access: AuthorizationAccess): boolean {
  const edge = input.snapshotDerivation;
  if (!edge || !input.parent) return false;
  assertAuthorizationBinding(input.parent, edge.parentBinding);
  const parent = callRecord(input.parent);
  if (
    !parent.responseSnapshots ||
    (input.applicability ?? 'service') !== 'service' ||
    !queryOutputAccess(access) ||
    !queryOutputAccess(parent.output.access)
  )
    return false;
  if (edge.kind === 'retry') {
    if (!parent.nestedResponse || access.operation !== 'read' || parent.output.access.operation !== 'read')
      return false;
    assertAuthorizationBinding(input.parent, input.binding);
    return true;
  }
  if (edge.kind === 'related') {
    const target = parent.relatedTargets.find((target) => target.path === edge.path);
    return (
      !!target &&
      target.kind !== 'count' &&
      target.modelName === input.binding.modelName &&
      scope(input.binding).length === 0
    );
  }
  if (edge.kind !== 'embedded') return false;
  // Embedded scopes keep the exact owning model/access, and extend its response scope.
  assertAuthorizationBinding(input.parent, { ...input.binding, scopePath: parent.binding.scopePath });
  const childScope = scope(input.binding),
    parentScope = scope(parent.binding);
  return (
    childScope.length > parentScope.length &&
    parentScope.every((part, index) => childScope[index] === part) &&
    Object.keys(parent.output.access).every(
      (key) => access[key as keyof AuthorizationAccess] === parent.output.access[key as keyof AuthorizationAccess],
    )
  );
}

/** Synchronous capture must occur before any operation hook/await. Omitted policy is request-only. */
export function resolveServiceAuthorization(input: ResolveServiceAuthorizationInput): ResolvedServiceAuthorization {
  const raw = copyAuthorizationValue(input.authorization);
  const configuration = copyAuthorizationValue(input.configuration, true);
  const targets = copyAuthorizationValue(input.relatedTargets ?? [], true);
  const access = copyAuthorizationValue(input.access);
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
  const permissions = new Permission(
    Object.fromEntries(input.requestPermissions.keys.map((key) => [key, input.requestPermissions.has(key) === true])),
  );
  // Permission owns only a boolean record and a string-key array. Freeze both
  // implementation fields as well as the view before any callback can see it.
  for (const value of Object.values(permissions)) if (value && typeof value === 'object') Object.freeze(value);
  Object.freeze(permissions);
  const readAccess = outputAccess.rowAccess;
  const readResponse =
    input.readResponse === true &&
    (input.applicability ?? 'service') === 'service' &&
    scopePath.length === 0 &&
    outputAccess.operation === 'read' &&
    (readAccess === 'read' || readAccess === 'list') &&
    outputAccess.outputAccess === readAccess &&
    outputAccess.virtualAccess === readAccess &&
    outputAccess.docPermissionsAccess === readAccess &&
    (input.parent === undefined || callRecord(input.parent).readResponse);
  // A retry may retain its originating read mode, but a parent/callback alone must
  // not relax related models, child scopes or write-derived read-like output.
  if (readResponse && input.parent) assertAuthorizationBinding(input.parent, input.binding);
  const nestedResponse = nestedQueryResponse(input, outputAccess);
  const listResponse =
    input.listResponse === true &&
    input.parent === undefined &&
    (input.applicability ?? 'service') === 'service' &&
    scopePath.length === 0 &&
    outputAccess.operation === 'list' &&
    outputAccess.rowAccess === 'list' &&
    queryOutputAccess(outputAccess);
  // TEMPORARY UNSAFE: keep separate root-source, descendant-source and output-value modes.
  // TODO: revisit/remove after measured query validation remediation. Never inherit from
  // target model flags or an ambient request context (including service calls inside hooks).
  const responseSnapshots =
    input.parent && (nestedResponse || readResponse)
      ? callRecord(input.parent).responseSnapshots
      : listResponse
        ? Object.freeze({
            skipOutput: configuration.unsafeSkipListOutputSnapshotChecks === true,
            skipNested: configuration.unsafeSkipListNestedDocumentSnapshotChecks === true,
            skipInitialOutputCopy:
              configuration.unsafeSkipListOutputSnapshotChecks === true &&
              configuration.unsafeSkipListInitialOutputSnapshotCopy === true,
          })
        : readResponse
          ? Object.freeze({
              skipOutput: configuration.unsafeSkipReadOutputSnapshotChecks === true,
              skipNested: configuration.unsafeSkipReadNestedDocumentSnapshotChecks === true,
              skipInitialOutputCopy:
                configuration.unsafeSkipReadOutputSnapshotChecks === true &&
                configuration.unsafeSkipReadInitialOutputSnapshotCopy === true,
            })
          : undefined;
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
    readResponse,
    nestedResponse,
    responseSnapshots,
    validateOutputSnapshots: responseSnapshots?.skipOutput !== true,
    skipInitialOutputSnapshotCopy: responseSnapshots?.skipInitialOutputCopy === true,
    validateDocumentSnapshots: !(
      (input.listResponse === true &&
        input.parent === undefined &&
        (input.applicability ?? 'service') === 'service' &&
        outputAccess.operation === 'list' &&
        outputAccess.rowAccess === 'list' &&
        outputAccess.outputAccess === 'list' &&
        scopePath.length === 0 &&
        configuration.unsafeSkipListDocumentSnapshotChecks === true) ||
      (readResponse && configuration.unsafeSkipReadDocumentSnapshotChecks === true) ||
      (nestedResponse && responseSnapshots?.skipNested === true)
    ),
  });
  return call;
}

/** Detached frozen records/arrays; mutable BSON/Date/Map leaves are detached on every read. */
export function readServiceAuthorization(call: ResolvedServiceAuthorization, binding: AuthorizationBinding) {
  assertAuthorizationBinding(call, binding);
  const record = callRecord(call);
  return copyAuthorizationValue(
    {
      authorization: record.policy,
      configuration: record.configuration,
      access: record.access,
      relatedTargets: record.relatedTargets,
    },
    true,
  );
}

/** Private access-only read; no policy/configuration/related graph traversal. */
export function readServiceAuthorizationAccess(call: ResolvedServiceAuthorization, binding: AuthorizationBinding) {
  assertAuthorizationBinding(call, binding);
  return callRecord(call).output.access;
}

/** Private captured mode, not a live runtime switch or caller-provided certificate. */
export function requiresDocumentSnapshotChecks(call: ResolvedServiceAuthorization, binding: AuthorizationBinding) {
  assertAuthorizationBinding(call, binding);
  return callRecord(call).validateDocumentSnapshots;
}

/** Output value comparisons only. Exact object associations and graph identities always run. */
export function requiresOutputSnapshotChecks(call: ResolvedServiceAuthorization, binding: AuthorizationBinding) {
  assertAuthorizationBinding(call, binding);
  return callRecord(call).validateOutputSnapshots;
}

/** Private mode lookup, NOT a binding/ownership certificate. Association authenticates
 * its owner/ordinary tuple before omission; copying retains the later binding check.
 */
export function skipsInitialOutputSnapshotCopy(call: ResolvedServiceAuthorization) {
  const record = callRecord(call);
  return !record.validateOutputSnapshots && record.skipInitialOutputSnapshotCopy;
}

/** Hydration is open configuration: detach this slice, never the unrelated call graph. */
export function readServiceAuthorizationHydration(call: ResolvedServiceAuthorization, binding: AuthorizationBinding) {
  assertAuthorizationBinding(call, binding);
  return copyAuthorizationValue({ hydration: callRecord(call).configuration.hydration }, true);
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
  return copyAuthorizationValue(outputMetadata(callRecord(call).configuration), true);
}

/** Hook lookup is open configuration: keep native/function-backed parents resolution-local. */
export function readServiceDocumentPermissions(call: ResolvedServiceAuthorization, binding: AuthorizationBinding) {
  assertAuthorizationBinding(call, binding);
  const record = callRecord(call);
  return Object.freeze({
    catalog: record.output.catalog,
    ...copyAuthorizationValue({ docPermissions: record.configuration.docPermissions }, true),
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
    ...copyAuthorizationValue(
      {
        ...outputMetadata(record.configuration),
        virtuals: record.configuration.virtuals,
        docPermissions: record.configuration.docPermissions,
      },
      true,
    ),
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
  const reusable = reusableOutputFieldConfiguration(record);
  return Object.freeze({
    access: record.output.access,
    catalog: record.output.catalog,
    outputFields: record.output.outputFields,
    reusable,
    ...copyAuthorizationValue(
      {
        permissionSchema: record.configuration.permissionSchema,
        modelPermissionPrefix: record.configuration.modelPermissionPrefix,
      },
      true,
    ),
  });
}

function reusableOutputFieldConfiguration(record: CallRecord): boolean {
  return (record.reusableFieldConfiguration ??=
    hasStableConfigurationCopies(record.configuration.permissionSchema) &&
    // Coercion methods can observe an object's identity even without native
    // leaves. Keep those receivers local to the original resolution boundary.
    (record.configuration.modelPermissionPrefix === null ||
      typeof record.configuration.modelPermissionPrefix !== 'object'));
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
  return (
    reusableOutputFieldConfiguration(record) && typeof (record.configuration.modelPermissionPrefix ?? '') === 'string'
  );
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
