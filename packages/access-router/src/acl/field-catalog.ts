/** Owned schema catalog: never discovers authority by enumerating a returned document. */
import type { Schema, SchemaType } from 'mongoose';
import { types } from 'node:util';
import type { AuthorizationFieldCatalog } from './service-authorization';
import {
  currentOutputWorkLedger,
  debitOutputPayload,
  debitOutputWork,
  prepareOutputWorkString,
} from './output-work-ledger';

// Only the constructor below admits these frozen primitive-only arrays. This
// records ownership of a fresh capture, never a live schema-identity cache.
const ownedCatalogs = new WeakMap<object, { readonly slots: number; readonly depth: number }>();
export function readOwnedAuthorizationCatalogWork(value: object) {
  return ownedCatalogs.get(value);
}

interface PreparedOutputCatalog {
  readonly paths: Set<string>;
  readonly results: Map<string, boolean>;
}
const preparedOutputCatalogs = new WeakMap<AuthorizationFieldCatalog, PreparedOutputCatalog | number | false>();

/** Private capture seam, not authority. Prepare only closed dense own-string
 * arrays; missing optional slots can resolve inherited application getters later.
 * No configuration normalization, row decision or binding check is reused here.
 */
export function prepareCapturedOutputCatalog(catalog: AuthorizationFieldCatalog): void {
  if (preparedOutputCatalogs.has(catalog)) return;
  // The fresh constructor already proved every own array/primitive. Share its
  // index across planning and evaluation, without re-proving density or losing
  // the first lookups before a warmup threshold. This records no field decision.
  // Unbranded captures keep lazy descriptor admission for short-lived scopes.
  if (ownedCatalogs.has(catalog)) debitOutputWork(undefined, catalog.paths.length + 2);
  preparedOutputCatalogs.set(
    catalog,
    ownedCatalogs.has(catalog) ? { paths: new Set(catalog.paths), results: new Map() } : 0,
  );
}

/** Explicit collection settlement; no live catalog/index preparation survives it. */
export function clearCapturedOutputCatalog(catalog: AuthorizationFieldCatalog): void {
  const prepared = preparedOutputCatalogs.get(catalog);
  if (prepared && typeof prepared !== 'number') {
    prepared.paths.clear();
    prepared.results.clear();
  }
  preparedOutputCatalogs.delete(catalog);
  ownedCatalogs.delete(catalog);
}

function prepareOutputCatalog(catalog: AuthorizationFieldCatalog): PreparedOutputCatalog | false {
  if (types.isProxy(catalog) || Object.getPrototypeOf(catalog) !== Object.prototype || !Object.isFrozen(catalog))
    return false;
  const paths = new Set<string>();
  for (const key of ['paths', 'protectedPaths', 'referencePaths', 'virtualPaths', 'dynamicPaths', 'opaquePaths']) {
    const slot = Object.getOwnPropertyDescriptor(catalog, key);
    if (!slot || !('value' in slot)) return false;
    const entries = slot.value;
    if (
      !Array.isArray(entries) ||
      types.isProxy(entries) ||
      Object.getPrototypeOf(entries) !== Array.prototype ||
      !Object.isFrozen(entries)
    )
      return false;
    const length = Object.getOwnPropertyDescriptor(entries, 'length')!.value as number;
    if (length > 20000 || Reflect.ownKeys(entries).length !== length + 1) return false;
    for (let index = 0; index < length; index++) {
      const entry = Object.getOwnPropertyDescriptor(entries, String(index));
      if (!entry || !('value' in entry) || typeof entry.value !== 'string') return false;
      if (key === 'paths') paths.add(entry.value);
    }
  }
  return { paths, results: new Map() };
}

type CatalogSchemaType = SchemaType & {
  schema?: Schema;
  caster?: CatalogSchemaType;
  $embeddedSchemaType?: CatalogSchemaType;
  embeddedSchemaType?: CatalogSchemaType;
  $isMongooseDocumentArray?: boolean;
  $isSchemaMap?: boolean;
  $__schemaType?: CatalogSchemaType;
};

const safeSegment = (part: string) =>
  !!part &&
  part !== 'sub' &&
  !['__proto__', 'constructor', 'prototype', '_doc', '__v'].includes(part) &&
  !/^[+$-]|[\s*]/.test(part) &&
  !part.includes('[') &&
  !part.includes(']') &&
  !/^\d+$/.test(part) &&
  !hasControlCharacter(part);

function hasControlCharacter(part: string): boolean {
  for (let index = 0; index < part.length; index++) {
    const code = part.charCodeAt(index);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

function prepareCatalogPathParts(path: string): void {
  const ledger = currentOutputWorkLedger();
  if (ledger) {
    // This explicit router string/segment preparation is NOT an opaque native
    // normalizer. Admit it before allocating split's segment buffer.
    let segments = 1;
    for (let index = 0; index < path.length; index++) if (path.charCodeAt(index) === 46) segments++;
    debitOutputWork(ledger, segments);
    debitOutputPayload(ledger, path);
  }
}

function catalogPathParts(path: string): string[] {
  prepareCatalogPathParts(path);
  return path.split('.');
}

export const isSafeOutputPath = (path: string): boolean => catalogPathParts(path).every(safeSegment);

const inputControlSegments = new Set([
  '_permissions',
  '_view',
  '_edit',
  'documentAuthorization',
  'documentAuthorizationStage',
  'resolvedAuthorization',
  'execution',
  'executionContext',
  'serviceExecutionContext',
  'preparedQuery',
  'preparedFilter',
  'preparedModelQuery',
  'resolvedIdentifier',
  'skipParsing',
  'skipAuthorization',
  'alreadyAuthorized',
]);

/** Identity is not elevatable; request-authorized IDs retain their existing behavior. */
export function isSafeInputPath(path: string, requestIdentity = false): boolean {
  return (
    isSafeOutputPath(path) &&
    path.split('.').every((part) => !inputControlSegments.has(part) && (requestIdentity || part !== '_id'))
  );
}

/** Persisted-only view. Output registries never manufacture writable containers. */
export function isCatalogInputPath(catalog: AuthorizationFieldCatalog, path: string): boolean {
  if (!isSafeInputPath(path) || !isCatalogOutputPath(catalog, path) || isInputVirtualPath(catalog, path)) return false;
  if (catalog.metadataPaths?.some((p) => matchesCatalogPattern(path, p, true))) return false;
  if (
    [...(catalog.virtualPaths ?? []), ...(catalog.schemaVirtualPaths ?? [])].some((p) =>
      matchesCatalogPattern(p, path, true),
    )
  )
    return false;
  return (
    (catalog.persistedPaths ?? catalog.paths).some((p) => matchesCatalogPattern(p, path)) ||
    !!catalog.opaquePaths?.some((p) => matchesCatalogPattern(p, path, true))
  );
}

/**
 * Preserve request-input virtual-name exclusion through Mixed/plain nesting. An
 * ordinary container keeps the current virtual scope; a registered `sub` container
 * enters its own scope. This does not make same-named fields in other scopes virtual.
 * Consult only the captured catalog, never output grants or live registry mutation.
 */
export function isInputVirtualPath(catalog: AuthorizationFieldCatalog, path: string): boolean {
  let scope = '';
  for (const part of path.split('.')) {
    const scoped = scope ? `${scope}.${part}` : part;
    if (catalog.virtualPaths?.includes(scoped)) return true;
    if (catalog.virtualScopePaths?.includes(scoped)) scope = scoped;
  }
  return false;
}

/** `$*` exists only inside the captured catalog, never in a caller grant. */
export function matchesCatalogPattern(pattern: string, path: string, descendants = false): boolean {
  debitOutputWork();
  // Literal primitive paths need no segment arrays. Keep dot-boundary ancestry
  // (including empty segments) and the original matcher for maps/non-primitives.
  if (typeof pattern === 'string' && typeof path === 'string' && !pattern.includes('$*')) {
    return pattern === path || (!!descendants && path.startsWith(pattern) && path[pattern.length] === '.');
  }
  // Keep these native call sites (and their split order/errors) for non-primitive
  // operands; admission still precedes each explicit router-owned split buffer.
  prepareCatalogPathParts(pattern);
  const expected = pattern.split('.');
  prepareCatalogPathParts(path);
  const actual = path.split('.');
  return (
    (descendants ? actual.length >= expected.length : actual.length === expected.length) &&
    expected.every((part, index) => part === '$*' || part === actual[index])
  );
}

export function isCatalogOutputPath(catalog: AuthorizationFieldCatalog, path: string): boolean {
  debitOutputWork();
  let prepared = typeof path === 'string' ? preparedOutputCatalogs.get(catalog) : undefined;
  if (typeof prepared === 'number') {
    const lookups = prepared + 1;
    prepared = lookups < 32 ? lookups : prepareOutputCatalog(catalog);
    preparedOutputCatalogs.set(catalog, prepared);
    if (typeof prepared === 'number') return catalogOutputPath(catalog, path);
  }
  const cached = prepared ? prepared.results.get(path) : undefined;
  if (cached !== undefined) return cached;
  const allowed = catalogOutputPath(catalog, path, prepared ? prepared.paths : undefined);
  // Retained handles/helpers must not turn arbitrary dynamic keys into an
  // unbounded cache. Saturation changes work only, never the eligibility result.
  if (prepared && prepared.results.size < 20000) prepared.results.set(path, allowed);
  return allowed;
}

function catalogOutputPath(catalog: AuthorizationFieldCatalog, path: string, paths?: ReadonlySet<string>): boolean {
  if (!isSafeOutputPath(path)) return false;
  if (catalog.protectedPaths?.some((p) => matchesCatalogPattern(p, path, true))) return false;
  if (catalog.referencePaths?.some((p) => matchesCatalogPattern(p, path, true) && !matchesCatalogPattern(p, path)))
    return false;
  if (catalog.virtualPaths?.some((p) => matchesCatalogPattern(p, path, true) && !matchesCatalogPattern(p, path)))
    return false;
  return (
    (paths
      ? paths.has(path)
      : catalog.paths.some((entry) => {
          debitOutputWork();
          return entry === path;
        })) ||
    !!catalog.dynamicPaths?.some((p) => matchesCatalogPattern(p, path)) ||
    !!catalog.opaquePaths?.some((p) => matchesCatalogPattern(p, path, true))
  );
}

export function captureAuthorizationFieldCatalog(
  schema: Schema,
  virtuals: Record<string, unknown> | null | undefined,
  documentPermissionField = '_permissions',
): AuthorizationFieldCatalog {
  debitOutputPayload(currentOutputWorkLedger(), documentPermissionField);
  const paths = new Set<string>();
  const containers = new Set<string>();
  const opaque = new Set<string>();
  const references = new Set<string>();
  const virtualPaths = new Set<string>();
  const virtualScopes = new Set<string>();
  const schemaVirtualPaths = new Set<string>();
  const arrays = new Set<string>();
  const protectedPaths = new Set<string>([documentPermissionField, '_doc', '$__', '__v']);
  const add = (path: string) => {
    debitOutputWork();
    debitOutputPayload(currentOutputWorkLedger(), path);
    // Internal map patterns have one safe arbitrary-key segment.
    if (catalogPathParts(path).every((part) => part === '$*' || safeSegment(part))) paths.add(path);
  };
  const ancestors = (path: string) => {
    const parts = catalogPathParts(path);
    for (let n = 1; n < parts.length; n++) {
      debitOutputWork(undefined, n);
      const parent = prepareOutputWorkString(parts.slice(0, n));
      add(parent);
      containers.add(parent);
    }
  };
  const visitType = (type: CatalogSchemaType, path: string, active: Set<Schema>) => {
    debitOutputWork();
    add(path);
    ancestors(path);
    const element = type.$embeddedSchemaType ?? type.embeddedSchemaType ?? type.caster;
    if (type.instance === 'Array' || type.$isMongooseDocumentArray) arrays.add(path);
    if (type.options?.ref || type.options?.refPath || element?.options?.ref || element?.options?.refPath) {
      references.add(path);
      return;
    }
    if (type.$isSchemaMap || type.instance === 'Map') {
      // Scalar maps accept keys, not arbitrary interiors; Mixed maps accept both.
      const value = type.$__schemaType;
      if (value) visitType(value, prepareOutputWorkString([path, '$*']), active);
      else opaque.add(path);
      containers.delete(path); // omitted selection includes the declared Map root
      return;
    }
    const child = type.schema ?? element?.schema;
    if (child) {
      containers.add(path);
      if (!active.has(child)) visitSchema(child, path, new Set([...active, child]));
      return;
    }
    if (type.instance === 'Mixed' || element?.instance === 'Mixed') opaque.add(path);
  };
  const visitSchema = (current: Schema, prefix: string, active: Set<Schema>) => {
    debitOutputWork();
    const version = current.options.versionKey;
    if (typeof version === 'string') protectedPaths.add(prefix ? `${prefix}.${version}` : version);
    for (const name of Object.keys(current.virtuals)) {
      debitOutputWork();
      schemaVirtualPaths.add(prefix ? prepareOutputWorkString([prefix, name]) : name);
    }
    for (const [name, raw] of Object.entries(current.paths)) {
      debitOutputWork();
      if (name.includes('$*')) continue; // traversed through the owning Map type
      visitType(raw as CatalogSchemaType, prefix ? prepareOutputWorkString([prefix, name]) : name, active);
    }
  };
  visitSchema(schema, '', new Set([schema]));
  const copyPaths = (values: ReadonlySet<string> | readonly string[]) => {
    debitOutputWork(undefined, 1 + (Array.isArray(values) ? values.length : (values as ReadonlySet<string>).size));
    return [...values];
  };
  const persistedPaths = copyPaths(paths);
  const visitVirtuals = (record: Record<string, unknown> | null | undefined, prefix: string) => {
    for (const [name, value] of Object.entries(record ?? {})) {
      debitOutputWork();
      if (value === undefined) continue;
      const path = prefix ? prepareOutputWorkString([prefix, name]) : name;
      debitOutputPayload(currentOutputWorkLedger(), path);
      if (!isSafeOutputPath(path)) continue;
      if (value && typeof value === 'object' && 'sub' in value) {
        // Registered embedded containers are receiving-model scopes, never ref interiors.
        if (references.has(path)) continue;
        virtualScopes.add(path);
        add(path);
        containers.add(path);
        visitVirtuals((value as { sub: Record<string, unknown> }).sub, path);
      } else {
        add(path);
        ancestors(path);
        virtualPaths.add(path);
      }
    }
  };
  visitVirtuals(virtuals, '');
  const protectedEntries = copyPaths(protectedPaths);
  // Each explicit array traversal/copy is router work and reserves BEFORE its
  // output buffer. The capture copier's branded preload must not charge it again.
  const filterPaths = (values: readonly string[], keep: (path: string) => boolean) => {
    debitOutputWork(undefined, values.length + 1);
    return values.filter(keep);
  };
  const eligible = filterPaths(
    copyPaths(paths),
    (p) => !protectedEntries.some((v) => matchesCatalogPattern(v, p, true)),
  );
  debitOutputWork(undefined, 3); // catalog record and the fixed metadata array/slot
  const catalog = Object.freeze({
    paths: Object.freeze(filterPaths(eligible, (p) => !p.includes('$*'))),
    persistedPaths: Object.freeze(persistedPaths),
    arrayPaths: Object.freeze(copyPaths(arrays)),
    schemaVirtualPaths: Object.freeze(copyPaths(schemaVirtualPaths)),
    metadataPaths: Object.freeze([documentPermissionField]),
    dynamicPaths: Object.freeze(filterPaths(eligible, (p) => p.includes('$*'))),
    containerPaths: Object.freeze(copyPaths(containers)),
    opaquePaths: Object.freeze(copyPaths(opaque)),
    referencePaths: Object.freeze(copyPaths(references)),
    virtualPaths: Object.freeze(copyPaths(virtualPaths)),
    virtualScopePaths: Object.freeze(copyPaths(virtualScopes)),
    protectedPaths: Object.freeze(protectedEntries),
  });
  if (typeof documentPermissionField === 'string') {
    const arrays = Object.values(catalog);
    // Exact graph work that the general copier would charge: one record, each
    // array and each primitive string. Reuse must not replenish its budget.
    ownedCatalogs.set(
      catalog,
      Object.freeze({ slots: 1 + arrays.length + arrays.reduce((sum, paths) => sum + paths.length, 0), depth: 2 }),
    );
  }
  return catalog;
}
