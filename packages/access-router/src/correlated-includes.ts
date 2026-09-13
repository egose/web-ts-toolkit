import { cloneDeep, isArray, isPlainObject } from '@web-ts-toolkit/utils';
import { validateRequestComplexity, type RequestComplexityOptions } from './request-complexity';
import type { ValidationError } from './validation/types';
import { isValidFieldPath } from './helpers/sort-policy';
import type { CorrelatedInclude } from './interfaces/query-types';

export const PARENT_MARKER_KEY = '$parent';
export const ESCAPE_WRAPPER_KEY = '$escape';

const SUBQUERY_PAYLOAD_KEYS = new Set(['$$sq', '$$date']);
const MARKER_FORBIDDEN_OPERATOR_KEYS = new Set(['$text', '$where', '$comment']);
const LOGICAL_CLAUSE_KEYS = new Set(['$and', '$or', '$nor']);
const DANGEROUS_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);
const FIELD_SEGMENT_PATTERN = /^[A-Za-z_][A-Za-z0-9_$]*$/;
const ARRAY_INDEX_SEGMENT_PATTERN = /^(0|[1-9]\d*)$/;

const ownKeys = (value: object): string[] => Object.keys(value);

/**
 * Structural marker recognition (ACI-01 D2.1): a plain object whose own
 * enumerable keys are exactly `['$parent']`. The path value is validated
 * separately by {@link isValidParentRefPath}.
 */
export function isParentRefMarker(value: unknown): value is { $parent: unknown } {
  return isPlainObject(value) && ownKeys(value).length === 1 && ownKeys(value)[0] === PARENT_MARKER_KEY;
}

/**
 * Literal-object escape recognition (ACI-01 D2.2): a plain object whose own
 * enumerable keys are exactly `['$escape']`. Tested before the marker shape.
 */
export function isEscapedParentRef(value: unknown): value is { $escape: unknown } {
  return isPlainObject(value) && ownKeys(value).length === 1 && ownKeys(value)[0] === ESCAPE_WRAPPER_KEY;
}

function hasMarkerKey(value: object): boolean {
  return ownKeys(value).includes(PARENT_MARKER_KEY) || ownKeys(value).includes(ESCAPE_WRAPPER_KEY);
}

/** Dotted reference paths (`a.b.c`); rejects empty segments and prototype-pollution segments. */
export function isValidParentRefPath(path: unknown): path is string {
  if (typeof path !== 'string' || path.length === 0) return false;
  const segments = path.split('.');
  return segments.every(
    (segment) =>
      (FIELD_SEGMENT_PATTERN.test(segment) || ARRAY_INDEX_SEGMENT_PATTERN.test(segment)) &&
      !DANGEROUS_PATH_SEGMENTS.has(segment),
  );
}

/** ACI-01 D5.1 output paths: non-empty valid field path, never `_id`, never `$`-prefixed. */
export function isValidCorrelatedOutputPath(path: unknown): path is string {
  return (
    typeof path === 'string' && path.length > 0 && isValidFieldPath(path) && path !== '_id' && !path.startsWith('$')
  );
}

/** Deep structural scan for marker shapes, escape shapes, or malformed `$parent`/`$escape` carriers. */
export function containsParentMarkerShape(value: unknown): boolean {
  const seen = new Set<object>();
  const visit = (current: unknown): boolean => {
    if (isParentRefMarker(current) || isEscapedParentRef(current)) return true;
    if (isArray(current)) {
      if (seen.has(current)) return false;
      seen.add(current);
      return current.some(visit);
    }
    if (isPlainObject(current)) {
      if (seen.has(current)) return false;
      seen.add(current);
      if (hasMarkerKey(current)) return true;
      return Object.values(current).some(visit);
    }
    return false;
  };
  return visit(value);
}

export interface CorrelatedTemplateIssue {
  message: string;
  path: Array<string | number>;
}

function scanTemplateValueNode(value: unknown, path: Array<string | number>, issues: CorrelatedTemplateIssue[]) {
  if (isEscapedParentRef(value)) {
    const inner = (value as { $escape: unknown }).$escape;
    if (
      !isParentRefMarker(inner) ||
      typeof (inner as { $parent: unknown }).$parent !== 'string' ||
      ((inner as { $parent: string }).$parent?.length ?? 0) === 0
    ) {
      issues.push({
        message: 'Invalid $escape payload: expected { "$escape": { "$parent": "<field>" } }',
        path,
      });
    }
    return;
  }

  if (isParentRefMarker(value)) {
    if (!isValidParentRefPath((value as { $parent: unknown }).$parent)) {
      issues.push({
        message: `Invalid $parent reference path at ${path.length === 0 ? '#' : path.join('.')}`,
        path,
      });
    }
    return;
  }

  if (isPlainObject(value)) {
    if (hasMarkerKey(value)) {
      issues.push({
        message: 'Malformed $parent reference: objects carrying $parent must be exactly { "$parent": "<field>" }',
        path,
      });
      return;
    }
    scanTemplateObjectEntries(value as Record<string, unknown>, path, issues);
    return;
  }

  if (isArray(value)) {
    value.forEach((item, index) => scanTemplateValueNode(item, [...path, index], issues));
  }
}

function scanTemplateObjectEntries(
  obj: Record<string, unknown>,
  basePath: Array<string | number>,
  issues: CorrelatedTemplateIssue[],
) {
  for (const [key, child] of Object.entries(obj)) {
    const childPath = [...basePath, key];
    if (key === PARENT_MARKER_KEY) {
      issues.push({ message: '$parent is never a field name in correlated templates', path: childPath });
      continue;
    }
    if (SUBQUERY_PAYLOAD_KEYS.has(key)) {
      if (containsParentMarkerShape(child)) {
        issues.push({
          message: `Unsupported $parent reference inside ${key}: markers are not resolved in subquery payloads`,
          path: childPath,
        });
      }
      continue;
    }
    if (MARKER_FORBIDDEN_OPERATOR_KEYS.has(key)) {
      if (containsParentMarkerShape(child)) {
        issues.push({
          message: `Unsupported $parent reference inside ${key}: markers are not resolved in ${key} values`,
          path: childPath,
        });
      }
      continue;
    }
    if (key === '$elemMatch') {
      if (isParentRefMarker(child) || isEscapedParentRef(child)) {
        issues.push({
          message: 'Unsupported $parent reference as a direct $elemMatch value',
          path: childPath,
        });
        continue;
      }
      scanTemplateValueNode(child, childPath, issues);
      continue;
    }
    if (LOGICAL_CLAUSE_KEYS.has(key)) {
      if (!isArray(child)) {
        scanTemplateValueNode(child, childPath, issues);
        continue;
      }
      child.forEach((clause, index) => {
        const clausePath = [...childPath, index];
        if (isParentRefMarker(clause) || isEscapedParentRef(clause)) {
          issues.push({
            message: `Unsupported $parent reference as a direct ${key} clause: clauses must be filter objects`,
            path: clausePath,
          });
          return;
        }
        if (isPlainObject(clause)) {
          scanTemplateObjectEntries(clause as Record<string, unknown>, clausePath, issues);
        }
      });
      continue;
    }
    scanTemplateValueNode(child, childPath, issues);
  }
}

/** Structural template validation for correlated filter templates (shared by direct and root validators). */
export function validateCorrelatedFilterTemplate(filter: unknown): CorrelatedTemplateIssue[] {
  const issues: CorrelatedTemplateIssue[] = [];
  if (!isPlainObject(filter)) {
    issues.push({ message: 'Correlated include filter must be an object', path: [] });
    return issues;
  }
  if (isParentRefMarker(filter) || isEscapedParentRef(filter)) {
    issues.push({ message: 'Correlated include filter must not itself be a $parent reference', path: [] });
    return issues;
  }
  scanTemplateObjectEntries(filter as Record<string, unknown>, [], issues);
  return issues;
}

/** Wire-shape validation for correlated identifier reads (`string | ParentRef`; escapes rejected). */
export function validateCorrelatedIdTemplate(id: unknown): CorrelatedTemplateIssue[] {
  if (typeof id === 'string') {
    return id.length > 0
      ? []
      : [{ message: 'Correlated include id must be a non-empty string or $parent reference', path: [] }];
  }
  if (isEscapedParentRef(id)) {
    return [{ message: 'Unsupported $escape as a correlated include id', path: [] }];
  }
  if (isParentRefMarker(id)) {
    return isValidParentRefPath((id as { $parent: unknown }).$parent)
      ? []
      : [{ message: 'Invalid $parent reference path in correlated include id', path: [] }];
  }
  return [{ message: 'Correlated include id must be a string or $parent reference', path: [] }];
}

/** Reports whether `select`/`sort` args carry reference markers (forbidden by ACI-01 D3.2/D8.1). */
export function findArgsMarkerIssue(value: unknown, where: string): CorrelatedTemplateIssue | null {
  if (value !== undefined && containsParentMarkerShape(value)) {
    return {
      message: `Unsupported $parent reference in ${where}: references are only supported in filter and id positions`,
      path: [],
    };
  }
  return null;
}

function collectFilterReferencePaths(filter: Record<string, unknown>): string[] {
  const paths: string[] = [];
  const seen = new Set<object>();
  const visitValue = (value: unknown) => {
    if (isParentRefMarker(value)) {
      if (typeof (value as { $parent: unknown }).$parent === 'string') {
        paths.push((value as { $parent: string }).$parent);
      }
      return;
    }
    if (isEscapedParentRef(value)) return;
    if (isArray(value)) {
      if (seen.has(value)) return;
      seen.add(value);
      value.forEach(visitValue);
      return;
    }
    if (isPlainObject(value)) {
      if (seen.has(value)) return;
      seen.add(value);
      for (const [key, child] of Object.entries(value)) {
        if (SUBQUERY_PAYLOAD_KEYS.has(key) || MARKER_FORBIDDEN_OPERATOR_KEYS.has(key)) continue;
        visitValue(child);
      }
    }
  };
  visitValue(filter);
  return paths;
}

/**
 * Every `$parent` path referenced by an include's own `id`/`filter`
 * (ACI-01 D7.1). Nested `args.include` subtrees are excluded: they resolve
 * later against the immediate parent document of the next level.
 */
export function collectCorrelatedReferencePaths(include: CorrelatedInclude): string[] {
  const paths: string[] = [];
  if (isParentRefMarker(include.id) && typeof (include as { id?: unknown }).id !== 'string') {
    const ref = (include as unknown as { id: { $parent: unknown } }).id;
    if (typeof ref.$parent === 'string') paths.push(ref.$parent);
  } else if (typeof (include as { id?: unknown }).id === 'string') {
    // literal id: no references
  }
  const filter = (include as { filter?: unknown }).filter;
  if (filter !== undefined) {
    paths.push(...collectFilterReferencePaths(filter as Record<string, unknown>));
  }
  return [...new Set(paths)];
}

export class CorrelatedReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CorrelatedReferenceError';
  }
}

const UNRESOLVABLE: unique symbol = Symbol('correlated-include-unresolvable');

function getOwnPathValue(parent: unknown, path: string): unknown {
  const segments = path.split('.');
  let current: unknown = parent;
  for (const segment of segments) {
    if (DANGEROUS_PATH_SEGMENTS.has(segment)) {
      throw new CorrelatedReferenceError(`Invalid $parent reference path: ${path}`);
    }
    if (typeof current !== 'object' || current === null) return undefined;
    if (!Object.prototype.hasOwnProperty.call(current, segment)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function cloneSubstitutedValue<T>(value: T): T {
  if (isPlainObject(value) || isArray(value)) return cloneDeep(value);
  return value;
}

function literalParentRefObject(path: string): { $parent: string } {
  const literal = {} as { $parent: string };
  Object.defineProperty(literal, PARENT_MARKER_KEY, {
    value: path,
    writable: true,
    enumerable: true,
    configurable: true,
  });
  return literal;
}

function resolveObjectEntries(obj: Record<string, unknown>, parent: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(obj)) {
    if (key === PARENT_MARKER_KEY) {
      throw new CorrelatedReferenceError('$parent is never a field name in correlated templates');
    }
    if (SUBQUERY_PAYLOAD_KEYS.has(key)) {
      if (containsParentMarkerShape(child)) {
        throw new CorrelatedReferenceError(`Unsupported $parent reference inside ${key}`);
      }
      out[key] = cloneSubstitutedValue(child);
      continue;
    }
    if (MARKER_FORBIDDEN_OPERATOR_KEYS.has(key)) {
      if (containsParentMarkerShape(child)) {
        throw new CorrelatedReferenceError(`Unsupported $parent reference inside ${key}`);
      }
      out[key] = cloneSubstitutedValue(child);
      continue;
    }
    if (key === '$elemMatch') {
      if (isParentRefMarker(child) || isEscapedParentRef(child)) {
        throw new CorrelatedReferenceError('Unsupported $parent reference as a direct $elemMatch value');
      }
      out[key] = resolveValueNode(child, parent, false);
      continue;
    }
    if (LOGICAL_CLAUSE_KEYS.has(key)) {
      if (!isArray(child)) {
        out[key] = resolveValueNode(child, parent, false);
        continue;
      }
      out[key] = child.map((clause) => {
        if (isParentRefMarker(clause) || isEscapedParentRef(clause)) {
          throw new CorrelatedReferenceError(`Unsupported $parent reference as a direct ${key} clause`);
        }
        if (!isPlainObject(clause)) return cloneSubstitutedValue(clause);
        return resolveObjectEntries(clause as Record<string, unknown>, parent);
      });
      continue;
    }
    if (key.startsWith('$')) {
      out[key] = resolveValueNode(child, parent, false);
      continue;
    }
    out[key] = resolveValueNode(child, parent, true);
  }
  return out;
}

/**
 * Single-pass pure value replacement (ACI-01 D3.3). Substituted parent
 * values are data: they are never re-scanned for operators or nested
 * markers. A marker resolving to a plain object in a bare field-value
 * position is wrapped in `$eq` so the object is matched literally and
 * cannot become executable filter syntax.
 */
function resolveValueNode(template: unknown, parent: unknown, bare: boolean): unknown {
  if (isEscapedParentRef(template)) {
    const inner = (template as { $escape: unknown }).$escape;
    if (
      !isParentRefMarker(inner) ||
      typeof (inner as { $parent: unknown }).$parent !== 'string' ||
      ((inner as { $parent: string }).$parent?.length ?? 0) === 0
    ) {
      throw new CorrelatedReferenceError('Invalid $escape payload: expected { "$escape": { "$parent": "<field>" } }');
    }
    return literalParentRefObject((inner as { $parent: string }).$parent);
  }

  if (isParentRefMarker(template)) {
    const path = (template as { $parent: unknown }).$parent;
    if (!isValidParentRefPath(path)) {
      throw new CorrelatedReferenceError(`Invalid $parent reference path: ${String(path)}`);
    }
    const value = getOwnPathValue(parent, path as string);
    if (value === undefined || value === null) throw UNRESOLVABLE;
    if (bare && isPlainObject(value)) return { $eq: cloneDeep(value) };
    return cloneSubstitutedValue(value);
  }

  if (isPlainObject(template)) {
    if (hasMarkerKey(template)) {
      throw new CorrelatedReferenceError(
        'Malformed $parent reference: objects carrying $parent must be exactly { "$parent": "<field>" }',
      );
    }
    return resolveObjectEntries(template as Record<string, unknown>, parent);
  }

  if (isArray(template)) {
    return template.map((item) => resolveValueNode(item, parent, false));
  }

  return template;
}

export type CorrelatedIdResolution = { status: 'resolved'; id: string } | { status: 'unresolvable' };

export type CorrelatedFilterResolution =
  | { status: 'resolved'; filter: Record<string, unknown> }
  | { status: 'unresolvable' };

function isUnresolvableSignal(error: unknown): boolean {
  return error === UNRESOLVABLE;
}

/**
 * Pure reference resolution for identifier reads (ACI-01 D4.5): strings are
 * used as-is, numbers/booleans/bigints coerce via `String()`, and objects,
 * arrays, `null`, and `undefined` are unresolvable.
 */
export function resolveCorrelatedIdTemplate(id: unknown, parent: unknown): CorrelatedIdResolution {
  try {
    if (typeof id === 'string') {
      if (id.length === 0) throw new CorrelatedReferenceError('Correlated include id must be a non-empty string');
      return { status: 'resolved', id };
    }
    if (isParentRefMarker(id)) {
      const path = (id as { $parent: unknown }).$parent;
      if (!isValidParentRefPath(path)) {
        throw new CorrelatedReferenceError(`Invalid $parent reference path: ${String(path)}`);
      }
      const value = getOwnPathValue(parent, path as string);
      if (typeof value === 'string') return { status: 'resolved', id: value };
      if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
        return { status: 'resolved', id: String(value) };
      }
      throw UNRESOLVABLE;
    }
    throw new CorrelatedReferenceError('Correlated include id must be a string or $parent reference');
  } catch (error) {
    if (isUnresolvableSignal(error)) return { status: 'unresolvable' };
    throw error;
  }
}

/**
 * Pure reference resolution for correlated filter templates. Any
 * unresolvable marker short-circuits the whole template to `unresolvable`
 * (ACI-01 D4.2); remaining markers are not resolved.
 */
export function resolveCorrelatedFilterTemplate(
  filter: Record<string, unknown>,
  parent: unknown,
): CorrelatedFilterResolution {
  try {
    if (!isPlainObject(filter) || isParentRefMarker(filter) || isEscapedParentRef(filter)) {
      throw new CorrelatedReferenceError('Correlated include filter must be an object');
    }
    return { status: 'resolved', filter: resolveObjectEntries(filter, parent) };
  } catch (error) {
    if (isUnresolvableSignal(error)) return { status: 'unresolvable' };
    throw error;
  }
}

/**
 * Post-expansion revalidation (ACI-01 D11.2): a short template may expand to
 * a large parent array or object, so the expanded operands are rechecked
 * against the node, depth, `$in`, and logical-clause budgets. Callers pass
 * the request-scoped complexity options explicitly.
 */
export function validateExpandedCorrelatedOperands(
  expanded: unknown,
  limits?: RequestComplexityOptions | null,
): ValidationError[] {
  return validateRequestComplexity(expanded, limits ?? null, 'filter');
}

export type CorrelatedIncludeShape = Pick<CorrelatedInclude, 'mode' | 'model' | 'op' | 'path'> & {
  id?: unknown;
  filter?: unknown;
  args?: unknown;
  options?: unknown;
  localField?: unknown;
  foreignField?: unknown;
};

const MAX_NESTED_INCLUDE_DEPTH = 10;

function validateCorrelatedArgsShape(args: unknown, op: string, depth: number): string[] {
  if (args === undefined) return [];
  if (!isPlainObject(args)) return ['Correlated include args must be an object'];
  const record = args as Record<string, unknown>;
  const allowed =
    op === 'list'
      ? new Set(['select', 'sort', 'skip', 'limit', 'page', 'pageSize', 'include'])
      : new Set(['select', 'sort', 'include']);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) return [`Unsupported correlated include arg: ${key}`];
  }
  if (op === 'count' && Object.keys(record).length > 0) return ['Count includes accept no args'];
  const selectIssue = findArgsMarkerIssue(record.select, 'args.select');
  if (selectIssue) return [selectIssue.message];
  const sortIssue = findArgsMarkerIssue(record.sort, 'args.sort');
  if (sortIssue) return [sortIssue.message];
  if (record.include !== undefined) {
    if (depth >= MAX_NESTED_INCLUDE_DEPTH) return ['Correlated include nesting exceeds the supported depth'];
    const nested = Array.isArray(record.include) ? record.include : [record.include];
    for (const entry of nested) {
      const errors = validateCorrelatedIncludeShape(entry, depth + 1);
      if (errors.length > 0) return errors;
    }
  }
  return [];
}

/**
 * Defense-in-depth shape validation for service-direct entry paths that
 * bypass HTTP schema validation. Returns human-readable error details;
 * an empty array means the entry is well-formed.
 */
export function validateCorrelatedIncludeShape(entry: unknown, depth = 0): string[] {
  if (!isPlainObject(entry)) return ['Correlated include must be an object'];
  const record = entry as Record<string, unknown>;
  if (record.mode !== 'correlated') return ['Correlated include mode must be "correlated"'];
  if (typeof record.model !== 'string' || record.model.length === 0)
    return ['Correlated include model must be a non-empty string'];
  if (record.op !== 'list' && record.op !== 'read' && record.op !== 'count') {
    return ['Correlated include op must be one of "list", "read", or "count"'];
  }
  if (!isValidCorrelatedOutputPath(record.path))
    return [`Invalid correlated include output path: ${String(record.path)}`];
  if ('localField' in record || 'foreignField' in record) {
    return ['Correlated includes must not carry localField or foreignField'];
  }
  if (record.options !== undefined && !(isPlainObject(record.options) && Object.keys(record.options).length === 0)) {
    return ['Correlated include options must be absent or empty'];
  }

  const hasId = record.id !== undefined;
  const hasFilter = record.filter !== undefined;
  if (record.op === 'read') {
    if (hasId === hasFilter) return ['Correlated read includes require exactly one of "id" or "filter"'];
    if (hasId) {
      const issues = validateCorrelatedIdTemplate(record.id);
      if (issues.length > 0) return [issues[0].message];
    } else {
      const issues = validateCorrelatedFilterTemplate(record.filter);
      if (issues.length > 0) return [issues[0].message];
    }
  } else {
    if (!hasFilter || hasId) return [`Correlated ${record.op} includes require a filter and no id`];
    const issues = validateCorrelatedFilterTemplate(record.filter);
    if (issues.length > 0) return [issues[0].message];
  }

  return validateCorrelatedArgsShape(record.args, record.op, depth);
}

/** Type guard for the discriminated correlated variant (`mode: 'correlated'`). */
export function isCorrelatedInclude(value: unknown): value is CorrelatedInclude {
  return isPlainObject(value) && (value as { mode?: unknown }).mode === 'correlated';
}
