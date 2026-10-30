/** Owned schema catalog: never discovers authority by enumerating a returned document. */
import type { Schema, SchemaType } from 'mongoose';
import { types } from 'node:util';
import type { AuthorizationFieldCatalog } from './service-authorization';

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
  // Short-lived child scopes must not pay for indexes or a second density walk.
  // Admit preparation only after enough lookups to amortize its construction.
  preparedOutputCatalogs.set(catalog, 0);
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
  ![...part].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);

export const isSafeOutputPath = (path: string): boolean => path.split('.').every(safeSegment);

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
  // Literal primitive paths need no segment arrays. Keep dot-boundary ancestry
  // (including empty segments) and the original matcher for maps/non-primitives.
  if (typeof pattern === 'string' && typeof path === 'string' && !pattern.includes('$*')) {
    return pattern === path || (!!descendants && path.startsWith(pattern) && path[pattern.length] === '.');
  }
  const expected = pattern.split('.');
  const actual = path.split('.');
  return (
    (descendants ? actual.length >= expected.length : actual.length === expected.length) &&
    expected.every((part, index) => part === '$*' || part === actual[index])
  );
}

export function isCatalogOutputPath(catalog: AuthorizationFieldCatalog, path: string): boolean {
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
    (paths ? paths.has(path) : catalog.paths.includes(path)) ||
    !!catalog.dynamicPaths?.some((p) => matchesCatalogPattern(p, path)) ||
    !!catalog.opaquePaths?.some((p) => matchesCatalogPattern(p, path, true))
  );
}

export function captureAuthorizationFieldCatalog(
  schema: Schema,
  virtuals: Record<string, unknown> | null | undefined,
  documentPermissionField = '_permissions',
): AuthorizationFieldCatalog {
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
    // Internal map patterns have one safe arbitrary-key segment.
    if (path.split('.').every((part) => part === '$*' || safeSegment(part))) paths.add(path);
  };
  const ancestors = (path: string) => {
    const parts = path.split('.');
    for (let n = 1; n < parts.length; n++) {
      const parent = parts.slice(0, n).join('.');
      add(parent);
      containers.add(parent);
    }
  };
  const visitType = (type: CatalogSchemaType, path: string, active: Set<Schema>) => {
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
      if (value) visitType(value, `${path}.$*`, active);
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
    const version = current.options.versionKey;
    if (typeof version === 'string') protectedPaths.add(prefix ? `${prefix}.${version}` : version);
    for (const name of Object.keys(current.virtuals)) {
      schemaVirtualPaths.add(prefix ? `${prefix}.${name}` : name);
    }
    for (const [name, raw] of Object.entries(current.paths)) {
      if (name.includes('$*')) continue; // traversed through the owning Map type
      visitType(raw as CatalogSchemaType, prefix ? `${prefix}.${name}` : name, active);
    }
  };
  visitSchema(schema, '', new Set([schema]));
  const persistedPaths = [...paths];
  const visitVirtuals = (record: Record<string, unknown> | null | undefined, prefix: string) => {
    for (const [name, value] of Object.entries(record ?? {})) {
      if (value === undefined) continue;
      const path = prefix ? `${prefix}.${name}` : name;
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
  const eligible = [...paths].filter((p) => ![...protectedPaths].some((v) => matchesCatalogPattern(v, p, true)));
  return Object.freeze({
    paths: Object.freeze(eligible.filter((p) => !p.includes('$*'))),
    persistedPaths: Object.freeze(persistedPaths),
    arrayPaths: Object.freeze([...arrays]),
    schemaVirtualPaths: Object.freeze([...schemaVirtualPaths]),
    metadataPaths: Object.freeze([documentPermissionField]),
    dynamicPaths: Object.freeze(eligible.filter((p) => p.includes('$*'))),
    containerPaths: Object.freeze([...containers]),
    opaquePaths: Object.freeze([...opaque]),
    referencePaths: Object.freeze([...references]),
    virtualPaths: Object.freeze([...virtualPaths]),
    virtualScopePaths: Object.freeze([...virtualScopes]),
    protectedPaths: Object.freeze([...protectedPaths]),
  });
}
