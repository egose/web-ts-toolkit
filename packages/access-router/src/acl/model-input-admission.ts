/** Package-private persisted input admission. Never output planning or a public bypass. */
import { get, isPlainObject, set } from '@web-ts-toolkit/utils';
import type { ModelHookContext, ModelRequest } from '../interfaces';
import { mongo, type Document } from 'mongoose';
import type { FieldAuthorization } from '../interfaces/service-authorization';
import { deepIsolateValue, isMongooseDocument } from '../helpers/document';
import { warn as warnLog } from '../logger-helpers';
import {
  resolveRequestComplexity,
  validateRequestComplexity,
  type RequestComplexityOptions,
} from '../request-complexity';
import { collectModelRequestFields } from './select-resolution';
import { authorizationError, copyAuthorizationValue } from './authorization-snapshot';
import { getCapturedAuthorizationOption } from './model-output-planning';
import { isCatalogInputPath, isInputVirtualPath, isSafeInputPath, matchesCatalogPattern } from './field-catalog';
import { getAuthorizationPermissions, readServiceAuthorization } from './service-authorization';
import type {
  AuthorizationBinding,
  AuthorizationFieldCatalog,
  ResolvedServiceAuthorization,
} from './service-authorization';

const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const inside = (path: string, root: string) => path === root || path.startsWith(`${root}.`);
const record = (value: unknown): value is Record<string, unknown> => isPlainObject(value);

/**
 * Mongoose casts JS class/document containers as well as JSON. Make their own data
 * explicit before admission; never preserve custom serialization methods as writes.
 * Native persisted leaves retain their types and are detached by deepIsolateValue.
 */
function inputValue(value: unknown): unknown {
  if (typeof value === 'function' || typeof value === 'symbol') {
    authorizationError('input values must be persisted data, not functions or symbols');
  }
  if (isMongooseDocument(value)) return value.toObject({ virtuals: false, flattenMaps: true });
  if (
    value &&
    typeof value === 'object' &&
    !record(value) &&
    !Array.isArray(value) &&
    !(value instanceof Map) &&
    !(value instanceof Date) &&
    !(value instanceof RegExp) &&
    !ArrayBuffer.isView(value) &&
    !(value instanceof ArrayBuffer) &&
    !(value instanceof mongo.BSON.BSONValue)
  )
    return Object.fromEntries(Object.entries(value));
  return value;
}

const structuralLimits = { maxDepth: 100, maxNodes: 20000 };

/** Bound the actual JS containers admission traverses, including cycles and sparse arrays. */
function boundedInputValue<T>(input: T, limits = structuralLimits): T {
  const maxDepth = Math.min(limits.maxDepth, structuralLimits.maxDepth);
  const maxNodes = Math.min(limits.maxNodes, structuralLimits.maxNodes);
  const active = new WeakSet<object>();
  let nodes = 0;
  const visit = (raw: unknown, depth: number): unknown => {
    if (++nodes > maxNodes) authorizationError(`input exceeds maximum node budget of ${maxNodes}`);
    if (depth > maxDepth) authorizationError(`input exceeds maximum depth of ${maxDepth}`);
    const object = raw !== null && typeof raw === 'object' ? raw : undefined;
    if (object && active.has(object)) authorizationError('cyclic mutation input');
    if (object) active.add(object);
    try {
      let value = inputValue(raw);
      if (Array.isArray(value)) {
        // Check length before iterating: holes also consume the traversal budget.
        if (value.length > maxNodes - nodes) authorizationError(`input exceeds maximum node budget of ${maxNodes}`);
        const output = new Array(value.length);
        for (let index = 0; index < value.length; index++) {
          const entry = visit(value[index], depth + 1);
          if (own(value, String(index))) output[index] = entry;
        }
        return output;
      }
      if (value instanceof Map) {
        if (value.size > maxNodes - nodes) authorizationError(`input exceeds maximum node budget of ${maxNodes}`);
        value = Object.fromEntries(value);
      }
      if (!record(value)) return deepIsolateValue(value);
      const entries = Object.entries(value);
      if (entries.length > maxNodes - nodes) authorizationError(`input exceeds maximum node budget of ${maxNodes}`);
      const output: Record<string, unknown> = {};
      for (const [key, entry] of entries)
        Object.defineProperty(output, key, {
          value: visit(entry, depth + 1),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      return output;
    } finally {
      if (object) active.delete(object);
    }
  };
  return visit(input, 0) as T;
}

/** Preflight before parsers/hooks. Inspect composites without changing marker parsing semantics. */
export function assertModelInputComplexity(input: unknown, options: RequestComplexityOptions): void {
  const bounded = boundedInputValue(input, resolveRequestComplexity(options));
  const errors = validateRequestComplexity(bounded, options);
  if (errors.length) authorizationError(errors[0].detail);
}

/** Preserve legacy request-schema bracket/index aliases, without admitting dotted payload keys. */
function requestBoundaries(fields: readonly string[]): string[] {
  const result: string[] = [];
  const visit = (shape: object, prefix = '') => {
    for (const [key, value] of Object.entries(shape)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (value === true) result.push(path);
      else visit(value as object, path);
    }
  };
  for (const field of fields) visit(set({}, field, true));
  return [...new Set(result)];
}

function ownValue(data: unknown, parts: readonly string[]): { value: unknown } | undefined {
  let current = data;
  for (const part of parts) {
    current = inputValue(current);
    if (current instanceof Map) current = Object.fromEntries(current);
    if ((!record(current) && !Array.isArray(current)) || !own(current, part)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return { value: current };
}

function forbidden(catalog: AuthorizationFieldCatalog, path: string, requestIdentity: boolean): boolean {
  return (
    !isSafeInputPath(path, requestIdentity) ||
    isInputVirtualPath(catalog, path) ||
    [...(catalog.protectedPaths ?? []), ...(catalog.virtualPaths ?? []), ...(catalog.schemaVirtualPaths ?? [])].some(
      (p) => matchesCatalogPattern(p, path, true),
    )
  );
}

/**
 * Detached safe persisted values. Request-authorized containers retain their business
 * shape; elevated containers only admit schema/Mixed/Map children. Request boundaries
 * remain additive even beneath an elevated ancestor. Neither path accepts metadata.
 */
function copyInputValue(
  value: unknown,
  path: string,
  catalog: AuthorizationFieldCatalog,
  requestPaths: readonly string[],
  concretePath = path,
): unknown {
  value = inputValue(value);
  if (Array.isArray(value)) {
    return value.map((entry, index) => copyInputValue(entry, path, catalog, requestPaths, `${concretePath}.${index}`));
  }
  if (value instanceof Map) value = Object.fromEntries(value);
  if (!record(value)) return deepIsolateValue(value);
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    const child = path ? `${path}.${key}` : key;
    const concrete = concretePath ? `${concretePath}.${key}` : key;
    const requested = requestPaths.some((p) => inside(concrete, p));
    if (key.includes('.') || forbidden(catalog, child, requested)) continue;
    if (!requested && !isCatalogInputPath(catalog, child)) {
      // An explicit ancestor grant must not erase an independently request-admitted
      // descendant of a permissive schema. Keep only the necessary object structure.
      if (!requestPaths.some((p) => inside(p, concrete))) continue;
      const container = inputValue(entry);
      if (!record(container) && !Array.isArray(container) && !(container instanceof Map)) continue;
    }
    output[key] = copyInputValue(entry, child, catalog, requestPaths, concrete);
  }
  return output;
}

/**
 * Scrub virtual/control paths after trusted prepare. Business additions are deliberately
 * not re-authorized; identity setters retain their trusted meaning. Dotted/indexed
 * prepare paths use the same aliases as applyUpdate, including for virtual exclusion.
 */
export function sanitizePreparedInput<T>(value: T, catalog: AuthorizationFieldCatalog, path = ''): T {
  const scrub = (input: unknown, path: string): unknown => {
    if (path && forbidden(catalog, path, true)) return undefined;
    if (Array.isArray(input)) return input.map((entry) => scrub(entry, path));
    if (!record(input)) return input;
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(input)) {
      const [boundary] = requestBoundaries([key]);
      if (!boundary) continue;
      const logical = boundary
        .split('.')
        .filter((part) => !/^\d+$/.test(part))
        .join('.');
      const child = path ? `${path}.${logical}` : logical;
      if (forbidden(catalog, child, true)) continue;
      Object.defineProperty(result, key, {
        value: scrub(entry, child),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return result;
  };
  // Prepared business additions keep their authority, with finite structural caps.
  return scrub(boundedInputValue(value), path) as T;
}

/** Preserve document setters/dirty tracking; never replace a hydrated write document with a DTO. */
export function stripDocumentInputVirtuals(doc: Document, catalog: AuthorizationFieldCatalog): void {
  const virtuals = [...(catalog.virtualPaths ?? []), ...(catalog.schemaVirtualPaths ?? [])];
  const visit = (value: unknown, path: string, concrete: string) => {
    if (path && virtuals.some((p) => matchesCatalogPattern(p, path, true))) {
      // Client/prepare input was already scrubbed. Only remove transform-introduced
      // writes here; a leaf patch must not clean up unrelated persisted siblings.
      if (doc.isModified(concrete)) doc.set(concrete, undefined);
      return;
    }
    if (Array.isArray(value)) value.forEach((entry, index) => visit(entry, path, `${concrete}.${index}`));
    else if (record(value)) {
      for (const [key, entry] of Object.entries(value)) {
        visit(entry, path ? `${path}.${key}` : key, concrete ? `${concrete}.${key}` : key);
      }
    }
  };
  visit(doc.toObject({ virtuals: false, flattenMaps: true }), '', '');
}

/**
 * Shared with dedicated subdocument orchestration: the caller supplies its own
 * scoped request fields and already-validated input policy. This module grants no
 * parent/child rows or operations. `existing` is the original persisted snapshot.
 */
export function admitModelInput(args: {
  data: Record<string, unknown>;
  existing?: Record<string, unknown>;
  requestFields: readonly string[];
  inputFields: FieldAuthorization;
  catalog: AuthorizationFieldCatalog;
  /** F02 may admit a selected child using owning-model catalog paths. */
  scopePath?: string;
}): { allowedData: Record<string, unknown>; allowedFields: string[] } {
  const { existing, inputFields, catalog } = args;
  // Rebound parser/hook-produced values and normalize once before grant expansion.
  const data = boundedInputValue(args.data);
  const scope = args.scopePath ?? '';
  const logicalPath = (path: string) => [scope, path].filter(Boolean).join('.');
  const requestPaths = requestBoundaries(args.requestFields);
  const scopedRequests = requestPaths.map(logicalPath);
  const elevated: string[] = [];
  const expand = (
    value: unknown,
    current: unknown,
    parts: string[],
    concrete: string[],
    logical: string[],
    arrayElement = false,
  ) => {
    value = inputValue(value);
    if (value instanceof Map) value = Object.fromEntries(value);
    if (current instanceof Map) current = Object.fromEntries(current);
    if (isMongooseDocument(current)) current = current.toObject({ virtuals: false, flattenMaps: true });
    if (!parts.length) {
      elevated.push(concrete.join('.'));
      return;
    }
    const path = logicalPath(logical.join('.'));
    const schemaArray =
      !arrayElement && logical.length > 0 && catalog.arrayPaths?.some((p) => matchesCatalogPattern(p, path));
    if (Array.isArray(value) || Array.isArray(current) || schemaArray) {
      // Descendants cannot create/resize arrays, nor turn a scalar/null slot into an object.
      if (!Array.isArray(value) || !Array.isArray(current)) return;
      for (let index = 0; index < Math.min(value.length, current.length); index++) {
        if (!own(value, String(index)) || (!record(current[index]) && !Array.isArray(current[index]))) continue;
        expand(value[index], current[index], parts, [...concrete, String(index)], logical, true);
      }
      return;
    }
    if (!record(value) || (current != null && !record(current))) return;
    const [key, ...rest] = parts;
    if (!own(value, key)) return;
    expand(value[key], record(current) ? current[key] : undefined, rest, [...concrete, key], [...logical, key]);
  };
  const grants =
    inputFields.mode === 'grant'
      ? inputFields.paths
      : inputFields.mode === 'unrestricted'
        ? (catalog.persistedPaths ?? catalog.paths).filter(
            (p) => (!scope || p.startsWith(`${scope}.`)) && !p.includes('$*') && isCatalogInputPath(catalog, p),
          )
        : [];
  for (const path of grants) {
    const relative = scope ? path.slice(scope.length + 1) : path;
    if (scope && !path.startsWith(`${scope}.`)) continue;
    expand(data, existing, relative.split('.'), [], []);
  }

  const allowedData: Record<string, unknown> = {};
  const allowedFields = [...new Set([...requestPaths, ...elevated])];
  const selected: string[] = [];
  for (const field of [...allowedFields].sort((a, b) => a.split('.').length - b.split('.').length)) {
    if (selected.some((p) => inside(field, p))) continue;
    const parts = field.split('.');
    // Indices are private concrete setters, not grant/catalog segments.
    const path = logicalPath(parts.filter((part) => !/^\d+$/.test(part)).join('.'));
    const requested = requestPaths.includes(field);
    if (forbidden(catalog, path, requested)) continue;
    const supplied = ownValue(data, parts);
    if (!supplied) continue;
    set(allowedData, field, copyInputValue(supplied.value, path, catalog, scopedRequests, logicalPath(field)));
    selected.push(field);
  }
  return { allowedData, allowedFields };
}

/** Captured request rules, with private pre-write grants, never DTO `_permissions`. */
export async function requestInputFields(args: {
  authorization: ResolvedServiceAuthorization;
  binding: AuthorizationBinding;
  access: 'create' | 'update';
  grants?: Readonly<Record<string, unknown>>;
  /** Dedicated child request rules, not inherited parent-container write permission. */
  scopePath?: string;
}): Promise<string[]> {
  const { configuration } = readServiceAuthorization(args.authorization, args.binding);
  const permissions = getAuthorizationPermissions(args.authorization, args.binding);
  const grants = args.grants ?? {};
  const prefix = (configuration.modelPermissionPrefix as string) ?? '';
  return collectModelRequestFields({
    req: args.binding.request as ModelRequest,
    permissionSchema: (args.scopePath
      ? get(configuration.permissionSchema, [args.scopePath, 'sub'])
      : configuration.permissionSchema) as Record<string, unknown>,
    access: args.access,
    permissions,
    grants,
    modelPermissionPrefix: prefix,
  });
}

/** Separate pre-write stage; preserves the hydrated hook input without serializing grants onto it. */
export async function resolveInputDocumentGrants(args: {
  authorization: ResolvedServiceAuthorization;
  binding: AuthorizationBinding;
  doc: unknown;
  context: ModelHookContext;
}): Promise<Readonly<Record<string, unknown>>> {
  const { configuration } = readServiceAuthorization(args.authorization, args.binding);
  const hook = getCapturedAuthorizationOption(configuration, 'docPermissions.update');
  if (typeof hook !== 'function') return {};
  try {
    const grants = await hook.call(
      args.binding.request,
      args.doc,
      getAuthorizationPermissions(args.authorization, args.binding),
      args.context,
    );
    return record(grants) ? copyAuthorizationValue(grants) : {};
  } catch (error) {
    warnLog('docPermissions hook failed; applying empty document permissions', {
      modelName: args.binding.modelName,
      access: 'update',
      operation: args.context.operation,
      error: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
}

/** Include nested paths too: +parent alone does not override a child's select:false. */
export function inputFetchPaths(catalog: AuthorizationFieldCatalog): string[] {
  return [
    ...new Set(
      (catalog.persistedPaths ?? catalog.paths).filter((p) => !p.includes('$*') && isCatalogInputPath(catalog, p)),
    ),
  ];
}
