/**
 * ACI-04: client parent references (`parentField()`) and include composition
 * (`$include()`).
 *
 * Implements the ACI-01 contract decision (D1–D10) on the client:
 *
 * - `parentField(path)` builds the explicit structural marker
 *   `{ $parent: path }` (frozen). Magic `$field` strings are never markers.
 * - Each of the seven correlated-capable service methods scans its reference
 *   positions (`id` / `filter`) at call time. Markers present returns a
 *   frozen, non-thenable descriptor (no executor, zero HTTP possible);
 *   markers absent returns the ordinary executable lazy request with an
 *   attached pure `$include()` converter.
 * - `$include()` converts a frozen per-call snapshot into a detached,
 *   serializable wire payload (`mode: 'correlated'`, ACI-01 D1/D6) without
 *   performing HTTP or claiming execution ownership.
 * - Explicit unsupported per-call args/options fail loudly at `$include()`;
 *   inherited service/adapter defaults for those same keys are silently
 *   dropped (ACI-01 D9.1/D9.2).
 *
 * Browser note: plain objects/arrays/`Symbol` only — no Node built-ins and
 * no server runtime dependencies.
 */

import { isPlainObject } from '@web-ts-toolkit/utils';

import { CORRELATED_DESCRIPTOR_BRAND, CorrelatedIncludeError, isCorrelatedIncludeDescriptor } from './correlated-brand';
import { replaceSubQuery } from './helpers';
import type { CorrelatedInclude, CorrelatedIncludeOp, ParentRef } from './types';

/** Execution-only option keys (ACI-01 D9.1): explicit values throw at `$include()`; inherited defaults are ignored. */
const EXECUTION_OPTION_KEYS = [
  'skim',
  'includePermissions',
  'includeCount',
  'tryList',
  'populateAccess',
  'ignoreCache',
  'includeExtraHeaders',
  'sq',
] as const;

const DANGEROUS_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

const FORBIDDEN_MARKER_PARENTS = new Set(['$text', '$where', '$comment']);

const CLAUSE_PARENTS = new Set(['$and', '$or', '$nor']);

/**
 * Creates an explicit parent-field reference (ACI-01 D2.1). Validates only
 * `typeof path === 'string' && path.length > 0` here; dotted-segment and
 * dangerous-segment rules (ACI-01 D2.4) are enforced fail-fast when the
 * marker is consumed by a service method, matching the server verdict.
 *
 * The returned marker is frozen and resolves against the immediate parent
 * document on the outer server.
 */
export function parentField(path: string): ParentRef {
  if (typeof path !== 'string' || path.length === 0) {
    throw new CorrelatedIncludeError(
      "parentField(path) requires a non-empty string field path, e.g. parentField('_id')",
    );
  }
  return Object.freeze({ $parent: path });
}

const isLazyRequestLike = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && '__op' in value && '__query' in value;

/**
 * Snapshot-aware deep clone. Detaches plain objects/arrays (cycle- and
 * shared-reference-safe), clones `Date`/`RegExp` values, and preserves
 * embedded live lazy requests *by reference*: their `__query` metadata is
 * non-enumerable, so a naive structural clone would strip it and silently
 * break `$$sq` conversion. A live request's `__query` was already detached
 * from caller inputs when that request was created, so sharing the reference
 * inside a frozen snapshot is safe; the converter detaches the rewritten
 * `$$sq` payload afterwards. Exotic leaves (ObjectId, class instances) and
 * non-container roots pass through by reference — matching the existing
 * direct-execution aliasing for values the converter never interprets.
 */
const cloneSnapshotValue = (value: unknown, seen: WeakMap<object, unknown> = new WeakMap()): unknown => {
  if (value == null || typeof value !== 'object') return value;
  if (isLazyRequestLike(value)) return value;
  const cached = seen.get(value);
  if (cached !== undefined) return cached;
  if (value instanceof Date) return new Date(value.getTime());
  if (value instanceof RegExp) return new RegExp(value.source, value.flags);
  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(value, copy);
    for (const item of value) copy.push(cloneSnapshotValue(item, seen));
    return copy;
  }
  if (isPlainObject(value)) {
    const copy: Record<string, unknown> = {};
    seen.set(value, copy);
    for (const [key, item] of Object.entries(value)) copy[key] = cloneSnapshotValue(item, seen);
    return copy;
  }
  return value;
};

const isMarkerShaped = (value: unknown): value is Record<string, unknown> =>
  isPlainObject(value) && Object.keys(value).length === 1 && Object.keys(value)[0] === '$parent';

const isEscapeShaped = (value: unknown): value is Record<string, unknown> =>
  isPlainObject(value) && Object.keys(value).length === 1 && Object.keys(value)[0] === '$escape';

const assertWellFormedMarker = (value: unknown, method: string): value is ParentRef => {
  if (!isMarkerShaped(value)) return false;
  const path = (value as Record<string, unknown>).$parent;
  if (typeof path !== 'string' || path.length === 0) {
    throw new CorrelatedIncludeError(
      `${method}: malformed parent reference — { $parent } must carry a non-empty string path`,
    );
  }
  for (const segment of path.split('.')) {
    if (segment.length === 0) {
      throw new CorrelatedIncludeError(
        `${method}: malformed parent reference — { $parent: '${path}' } has an empty path segment`,
      );
    }
    if (DANGEROUS_PATH_SEGMENTS.has(segment)) {
      throw new CorrelatedIncludeError(
        `${method}: parent reference path '${path}' traverses a forbidden segment ('${segment}')`,
      );
    }
  }
  return true;
};

type ScanContext = 'value' | 'andElement' | 'forbidden';

/**
 * Scans one filter node for live markers. Returns `true` when at least one
 * well-formed marker was found. Throws `CorrelatedIncludeError` for
 * descriptors embedded as filter values, malformed marker shapes (unchecked
 * JavaScript callers), and markers in forbidden positions (ACI-01 D3.2).
 *
 * Boundaries: `$escape` wrappers are opaque (recognition order: escape
 * before marker, ACI-01 D2.2); embedded lazy requests (`__op`/`__query`)
 * are opaque subqueries and never descended into; `select`/`sort` values
 * are never scanned (callers simply never pass them here — ACI-01 D8.1).
 */
const scanNode = (node: unknown, ctx: ScanContext, method: string): boolean => {
  if (isCorrelatedIncludeDescriptor(node)) {
    throw new CorrelatedIncludeError(
      `${method}: a correlated include descriptor cannot be embedded as a filter value — ` +
        `call $include(path) on it first, or restructure the query`,
    );
  }
  if (isLazyRequestLike(node)) return false;
  if (Array.isArray(node)) {
    let found = false;
    for (const element of node) {
      if (scanNode(element, ctx, method)) found = true;
    }
    return found;
  }
  if (!isPlainObject(node)) return false;

  const record = node as Record<string, unknown>;
  const keys = Object.keys(record);

  if (keys.length === 1 && keys[0] === '$parent') {
    if (ctx === 'forbidden') {
      throw new CorrelatedIncludeError(
        `${method}: parent references are not allowed inside $text/$where/$comment values`,
      );
    }
    if (ctx === 'andElement') {
      throw new CorrelatedIncludeError(
        `${method}: a bare parent reference cannot be a direct $and/$or/$nor clause — ` +
          `wrap it in a field condition instead`,
      );
    }
    return assertWellFormedMarker(record, method);
  }
  if (keys.length === 1 && keys[0] === '$escape') return false;
  if (keys.includes('$parent')) {
    throw new CorrelatedIncludeError(
      `${method}: malformed parent reference — extra keys alongside $parent are not allowed`,
    );
  }

  let found = false;
  for (const key of keys) {
    const child = record[key];
    if (ctx === 'forbidden' || FORBIDDEN_MARKER_PARENTS.has(key)) {
      // Forbidden positions apply at any filter depth (ACI-01 D3.2): once
      // inside `$text`/`$where`/`$comment`, every nested marker throws.
      if (scanNode(child, 'forbidden', method)) found = true;
    } else if (CLAUSE_PARENTS.has(key)) {
      if (Array.isArray(child)) {
        for (const element of child) {
          if (scanNode(element, 'andElement', method)) found = true;
        }
      } else if (scanNode(child, 'andElement', method)) {
        found = true;
      }
    } else if (key === '$elemMatch') {
      if (isMarkerShaped(child) || isEscapeShaped(child)) {
        throw new CorrelatedIncludeError(`${method}: a bare parent reference cannot be a direct $elemMatch value`);
      }
      if (scanNode(child, 'value', method)) found = true;
    } else if (scanNode(child, 'value', method)) {
      found = true;
    }
  }
  return found;
};

/**
 * Call-time scan of a filter argument for the seven correlated-capable
 * methods. A bare marker as the whole filter is malformed (a filter must be
 * a field-condition object); anything else delegates to {@link scanNode}.
 */
export const scanFilterForRefs = (filter: unknown, method: string): boolean => {
  if (isMarkerShaped(filter)) {
    throw new CorrelatedIncludeError(
      `${method}: a bare parent reference cannot be the whole filter — ` + `wrap it in a field condition instead`,
    );
  }
  return scanNode(filter, 'value', method);
};

/**
 * Call-time scan of an identifier argument (basic/advanced `read`). Strings
 * are literals; well-formed markers select the descriptor overload;
 * marker-shaped garbage throws while unrelated values keep legacy behavior.
 * A `true` result narrows the caller to the `ParentRef` case.
 */
export const scanIdForRefs = (id: unknown, method: string): id is ParentRef => {
  if (typeof id === 'string') return false;
  if (isPlainObject(id)) {
    if (isMarkerShaped(id)) return assertWellFormedMarker(id, method);
    if (Object.keys(id).includes('$parent')) {
      throw new CorrelatedIncludeError(
        `${method}: malformed parent reference — extra keys alongside $parent are not allowed`,
      );
    }
  }
  return false;
};

/** Own-key check that treats explicit `undefined` as absent (matches `??` merge semantics). */
const isExplicit = (bag: Record<string, unknown>, key: string): boolean =>
  Object.hasOwn(bag, key) && bag[key] !== undefined;

const isLiveRequest = (value: unknown): boolean =>
  (typeof value === 'object' && value !== null && '__query' in value) ||
  (typeof value === 'object' && value !== null && typeof (value as { then?: unknown }).then === 'function');

/**
 * Call-time validation of `include` arrays: converted wire payloads and
 * legacy joins pass through, but unconverted descriptors and live lazy
 * requests are rejected with a controlled error instead of being serialized
 * as garbage. Only the top level is inspected so legacy entries carrying
 * subquery filter values keep their existing behavior.
 */
export const validateIncludeEntries = (include: unknown, method: string): void => {
  const entries = Array.isArray(include) ? include : [include];
  for (const entry of entries) {
    if (entry == null) continue;
    if (isCorrelatedIncludeDescriptor(entry)) {
      throw new CorrelatedIncludeError(
        `${method}: a correlated include descriptor cannot be embedded directly in 'include' — ` +
          `call $include(path) on it first and embed the converted payload`,
      );
    }
    if (isLiveRequest(entry)) {
      throw new CorrelatedIncludeError(
        `${method}: a live request cannot be embedded directly in 'include' — ` +
          `call $include(path) on it first and embed the converted payload`,
      );
    }
  }
};

/**
 * Transport guard (ACI-01 D9.1): descriptors have no transport, so any
 * supplied `axiosRequestConfig` on a reference-bearing call is a programming
 * error. An explicitly passed empty object carries no config and is allowed.
 */
export const assertNoTransportConfig = (config: unknown, method: string): void => {
  if (config != null && typeof config === 'object' && Object.keys(config).length > 0) {
    throw new CorrelatedIncludeError(
      `${method}: reference-bearing calls cannot carry axios transport config — ` +
        `descriptors have no transport and service-level callbacks never fire for them`,
    );
  }
};

/** Frozen per-call snapshot backing pure `$include()` conversion. */
export interface CorrelatedSource {
  readonly method: string;
  readonly model: string;
  readonly op: CorrelatedIncludeOp;
  /** True for basic `list()`/`count()` (supplemental-filter `$include` form). */
  readonly basic: boolean;
  readonly kind: 'id' | 'filter';
  readonly id?: unknown;
  readonly filter?: unknown;
  /** Frozen clone of the raw per-call args (separate from service defaults — ACI-01 D9.2). */
  readonly callArgs: Record<string, unknown>;
  /** Frozen clone of the raw per-call options (separate from service defaults — ACI-01 D9.2). */
  readonly callOptions: Record<string, unknown>;
  /** References to the frozen normalized service defaults (cloned at conversion). */
  readonly defaults: Record<string, unknown>;
}

const deepFreezeSnapshot = (value: unknown, seen: WeakSet<object> = new WeakSet<object>()): void => {
  if (value == null || typeof value !== 'object' || Object.isFrozen(value) || seen.has(value)) return;
  // Live subquery requests are shared by reference (see cloneSnapshotValue);
  // never freeze caller-visible request objects through the snapshot.
  if (isLazyRequestLike(value) || isCorrelatedIncludeDescriptor(value)) return;
  if (!isPlainObject(value) && !Array.isArray(value)) return;
  seen.add(value);
  Object.freeze(value);
  for (const item of Object.values(value)) deepFreezeSnapshot(item, seen);
};

export interface CaptureParams {
  method: string;
  model: string;
  op: CorrelatedIncludeOp;
  basic: boolean;
  kind: 'id' | 'filter';
  id?: unknown;
  filter?: unknown;
  callArgs?: unknown;
  callOptions?: unknown;
  defaults?: Record<string, unknown>;
}

/** Captures a frozen, detached snapshot of the per-call inputs at call time (ACI-01 D8.4). */
export const captureCorrelatedSource = (params: CaptureParams): CorrelatedSource => {
  const callArgs = isPlainObject(params.callArgs)
    ? (cloneSnapshotValue(params.callArgs) as Record<string, unknown>)
    : {};
  const callOptions = isPlainObject(params.callOptions)
    ? (cloneSnapshotValue(params.callOptions) as Record<string, unknown>)
    : {};
  const source: CorrelatedSource = {
    method: params.method,
    model: params.model,
    op: params.op,
    basic: params.basic,
    kind: params.kind,
    id: params.id === undefined ? undefined : cloneSnapshotValue(params.id),
    filter: params.filter === undefined ? undefined : cloneSnapshotValue(params.filter),
    callArgs,
    callOptions,
    defaults: params.defaults ?? {},
  };
  deepFreezeSnapshot(callArgs);
  deepFreezeSnapshot(callOptions);
  if (source.id !== undefined) deepFreezeSnapshot(source.id);
  if (source.filter !== undefined) deepFreezeSnapshot(source.filter);
  return Object.freeze(source);
};

export function assertValidIncludePath(path: unknown): asserts path is string {
  if (typeof path !== 'string' || path.length === 0) {
    throw new CorrelatedIncludeError('$include(path) requires an explicit non-empty output path');
  }
  if (path === '_id' || path.startsWith('$')) {
    throw new CorrelatedIncludeError(
      `$include(path) output path '${path}' is reserved — it must not equal _id or start with $`,
    );
  }
  for (const segment of path.split('.')) {
    if (segment.length === 0) {
      throw new CorrelatedIncludeError(`$include(path) output path '${path}' has an empty path segment`);
    }
  }
}

const READ_ARG_KEYS = ['select', 'sort', 'include'] as const;
const LIST_ARG_KEYS = ['select', 'sort', 'include', 'skip', 'limit', 'page', 'pageSize'] as const;
const PAGINATION_ARG_KEYS = ['skip', 'limit', 'page', 'pageSize'] as const;

/**
 * Pure metadata-to-include converter (ACI-01 D8.4/D9). Synchronously builds
 * a detached, serializable `mode: 'correlated'` payload from a frozen
 * snapshot: zero HTTP calls, no execution-ownership claims, independently
 * owned output on every call. Preserves supported service/adapter/per-call
 * defaults through the existing per-call-wins precedence, then filters to
 * the forwarding allowlist.
 */
export const convertCorrelatedSource = (
  source: CorrelatedSource,
  path: string,
  supplemental?: unknown,
): CorrelatedInclude<string, unknown, CorrelatedIncludeOp> => {
  assertValidIncludePath(path);

  let innerFilter: unknown;
  if (source.basic) {
    if (!isPlainObject(supplemental) || !isExplicit(supplemental as Record<string, unknown>, 'filter')) {
      throw new CorrelatedIncludeError(
        `${source.method}.$include(path) requires a supplemental { filter } option — ` +
          `basic methods have no filter of their own`,
      );
    }
    const extra = Object.keys(supplemental).filter((key) => key !== 'filter');
    if (extra.length > 0) {
      throw new CorrelatedIncludeError(
        `${source.method}.$include(path) accepts only { filter } — unknown option(s): ${extra.join(', ')}`,
      );
    }
    const rawFilter = (supplemental as Record<string, unknown>).filter;
    scanFilterForRefs(rawFilter, source.method);
    // Rewrite subqueries against the caller-owned value first (reads live
    // `__query` metadata), then detach the rewritten payload so the wire
    // output never aliases caller inputs or live requests.
    innerFilter = cloneSnapshotValue(replaceSubQuery(rawFilter as Parameters<typeof replaceSubQuery>[0]));
  } else {
    if (supplemental !== undefined) {
      throw new CorrelatedIncludeError(
        `${source.method}.$include(path) takes no filter option — ` +
          `advanced methods use their existing filter argument and the supplemental filter ` +
          `is for basic list()/count() only`,
      );
    }
    if (source.kind === 'filter') {
      scanFilterForRefs(source.filter, source.method);
      // `replaceSubQuery` is pure (never mutates), so it runs directly on
      // the frozen snapshot; the result is detached below.
      innerFilter = cloneSnapshotValue(replaceSubQuery(source.filter as Parameters<typeof replaceSubQuery>[0]));
    }
  }

  if (isExplicit(source.callArgs, 'populate')) {
    throw new CorrelatedIncludeError(
      `${source.method}.$include(path): per-call 'populate' is not forwarded into correlated includes in v1 — ` +
        `remove it from this call (inherited default populate is dropped silently)`,
    );
  }
  if (isExplicit(source.callArgs, 'tasks')) {
    throw new CorrelatedIncludeError(
      `${source.method}.$include(path): per-call 'tasks' are never forwarded into correlated includes — ` +
        `remove them from this call (inherited default tasks are ignored)`,
    );
  }
  for (const key of EXECUTION_OPTION_KEYS) {
    if (isExplicit(source.callOptions, key)) {
      throw new CorrelatedIncludeError(
        `${source.method}.$include(path): per-call option '${key}' is execution-only and is not ` +
          `forwarded into correlated includes — remove it from this call ` +
          `(inherited defaults are ignored; the server forces lean/access/tryList semantics)`,
      );
    }
  }

  const allowKeys: readonly string[] =
    source.op === 'list' && !source.basic
      ? LIST_ARG_KEYS
      : source.op === 'list'
        ? PAGINATION_ARG_KEYS
        : source.op === 'read' && !source.basic
          ? READ_ARG_KEYS
          : [];
  const args: Record<string, unknown> = {};
  for (const key of allowKeys) {
    const effective = (source.callArgs[key] ?? source.defaults[key]) as unknown;
    if (effective === undefined) continue;
    if (key === 'include') {
      const entries = Array.isArray(effective) ? effective : [effective];
      validateIncludeEntries(entries, source.method);
    }
    args[key] = cloneSnapshotValue(effective);
  }

  const wire: Record<string, unknown> = {
    mode: 'correlated',
    model: source.model,
    op: source.op,
    path,
  };
  if (source.kind === 'id') {
    wire.id = cloneSnapshotValue(source.id);
  } else {
    wire.filter = innerFilter;
  }
  if (Object.keys(args).length > 0) wire.args = args;
  return wire as unknown as CorrelatedInclude<string, unknown, CorrelatedIncludeOp>;
};

/** Creates the frozen, non-thenable descriptor returned for reference-bearing calls (ACI-01 D8.1). */
export const createCorrelatedDescriptor = (source: CorrelatedSource): unknown => {
  const descriptor = {
    [CORRELATED_DESCRIPTOR_BRAND]: true as const,
    // Extra arguments are forwarded (not dropped) so the converter's
    // basic/advanced exclusivity rules reject them with controlled errors.
    $include: (path: string, supplemental?: unknown) => convertCorrelatedSource(source, path, supplemental),
  };
  return Object.freeze(descriptor);
};

/**
 * Attaches the pure `$include()` converter to an ordinary executable lazy
 * request from one of the seven methods. Non-enumerable, so lazy execution,
 * grouping (`{ ...prom.__query }`), and serialization behavior are
 * preserved; conversion reads the frozen snapshot and never claims
 * execution ownership.
 */
export const attachIncludable = <T extends object>(request: T, source: CorrelatedSource): T => {
  const $include = (path: string, supplemental?: unknown) => convertCorrelatedSource(source, path, supplemental);
  Object.defineProperty(request, '$include', {
    value: $include,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return request;
};
