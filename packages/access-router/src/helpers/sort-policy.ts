import type { Sort, SortOrder } from '../interfaces';

export type SortDirection = 'asc' | 'desc';

export interface NormalizedSortField {
  field: string;
  direction: SortDirection;
}

export interface SortValidationError {
  detail: string;
  pointer?: string;
}

const validSortOrders: SortOrder[] = [1, -1, 'asc', 'ascending', 'desc', 'descending'];
const fieldPathPattern = /^[A-Za-z_][A-Za-z0-9_$]*(\.[A-Za-z_][A-Za-z0-9_$]*)*$/;

const sortDirection = (order: SortOrder): SortDirection =>
  order === -1 || order === 'desc' || order === 'descending' ? 'desc' : 'asc';

const sortError = (detail: string): SortValidationError => ({ detail, pointer: '#/sort' });

export function isValidFieldPath(field: unknown): field is string {
  return typeof field === 'string' && fieldPathPattern.test(field);
}

export function isFieldAllowed(field: string, allowedFields: string[]): boolean {
  return new Set(allowedFields.concat(['id', '_id'])).has(field);
}

/**
 * VIRT-04 output-only DB guard (VIRT-00A D8).
 *
 * Registered virtual names remain virtual even when no getter applies or
 * their output rule grants visibility. They must never reach the adapter
 * via sort/filter/distinct, even when `sortableFields` or a permission
 * rule would otherwise allow the same name. `isVirtualPath` is the
 * receiving-model scope-aware predicate (top-level + embedded DB paths,
 * e.g. `fullAddress` and `contacts.nick`); it returns true for virtual
 * paths including subpaths under a virtual leaf.
 *
 * This helper only filters the allowlist; `validateSortFields` (strict
 * `BadRequest`) and `sanitizeSortFields` (strip posture) then control the
 * attempt before adapter dispatch with existing persisted-field semantics.
 */
export function excludeVirtualsFromAllowedSortFields(
  allowedFields: string[],
  isVirtualPath: (field: string) => boolean,
): string[] {
  if (!Array.isArray(allowedFields) || allowedFields.length === 0) return allowedFields;
  return allowedFields.filter((field) => {
    try {
      return !isVirtualPath(field);
    } catch {
      return true;
    }
  });
}

export function normalizeSort(sort: Sort | Map<string, SortOrder>): {
  fields: NormalizedSortField[];
  errors: SortValidationError[];
} {
  if (sort === null || sort === undefined || sort === '') return { fields: [], errors: [] };

  if (typeof sort === 'string') {
    const fields = sort
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((raw) => {
        const desc = raw.startsWith('-');
        return { raw, field: desc ? raw.slice(1) : raw, direction: desc ? ('desc' as const) : ('asc' as const) };
      });

    const errors = fields
      .filter(({ field }) => !isValidFieldPath(field))
      .map(({ raw }) => sortError(`Invalid sort field: ${raw}`));

    return { fields: errors.length > 0 ? [] : fields.map(({ field, direction }) => ({ field, direction })), errors };
  }

  const entries = sort instanceof Map ? Array.from(sort.entries()) : Array.isArray(sort) ? sort : Object.entries(sort);
  const errors: SortValidationError[] = [];
  const fields: NormalizedSortField[] = [];

  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length !== 2) {
      errors.push(sortError('Invalid sort entry: expected [field, order]'));
      continue;
    }

    const [field, order] = entry as [unknown, unknown];
    if (!isValidFieldPath(field)) {
      errors.push(sortError(`Invalid sort field: ${String(field)}`));
      continue;
    }

    if (!validSortOrders.includes(order as SortOrder)) {
      errors.push(sortError(`Invalid sort order for field: ${field}`));
      continue;
    }

    fields.push({ field, direction: sortDirection(order as SortOrder) });
  }

  return { fields: errors.length > 0 ? [] : fields, errors };
}

export function validateSortFields(
  sort: Sort | Map<string, SortOrder>,
  allowedFields: string[],
): SortValidationError[] {
  const { fields, errors } = normalizeSort(sort);
  if (errors.length > 0) return errors;

  return fields
    .filter(({ field }) => !isFieldAllowed(field, allowedFields))
    .map(({ field }) => sortError(`Sort field is not allowed: ${field}`));
}

export function normalizeSortForOrderBy(sort: Sort | Map<string, SortOrder>): {
  fields: string[];
  orders: SortDirection[];
} {
  const normalized = normalizeSort(sort);
  return {
    fields: normalized.fields.map(({ field }) => field),
    orders: normalized.fields.map(({ direction }) => direction),
  };
}

export interface SanitizedSort {
  /** Sort value to send upstream (`undefined` means omit / no sort). */
  sort: Sort | Map<string, SortOrder> | undefined;
  /** Disallowed field names that were removed. */
  stripped: string[];
  /** Malformed-sort errors; disallowed fields are NOT included here. */
  errors: SortValidationError[];
}

/**
 * Remove disallowed sort keys while preserving the caller's input shape
 * (string / object / tuple array / Map). Syntax errors are returned as
 * `errors`; disallowed keys are listed in `stripped` instead of erroring.
 * When nothing is stripped the original `sort` reference is returned as-is;
 * when every key is stripped `sort` is `undefined` so upstream applies no sort.
 */
export function sanitizeSortFields(sort: Sort | Map<string, SortOrder>, allowedFields: string[]): SanitizedSort {
  const { fields, errors } = normalizeSort(sort);
  if (errors.length > 0) return { sort: undefined, stripped: [], errors };

  const allowedSet = new Set(allowedFields.concat(['id', '_id']));
  const kept = fields.filter(({ field }) => allowedSet.has(field));
  const stripped = fields.filter(({ field }) => !allowedSet.has(field)).map(({ field }) => field);

  if (stripped.length === 0) return { sort: sort as Sort | Map<string, SortOrder> | undefined, stripped, errors: [] };
  if (kept.length === 0) return { sort: undefined, stripped, errors: [] };

  if (typeof sort === 'string') {
    return {
      sort: kept.map(({ field, direction }) => (direction === 'desc' ? `-${field}` : field)).join(' '),
      stripped,
      errors: [],
    };
  }

  if (sort instanceof Map) {
    return {
      sort: new Map(kept.map(({ field, direction }) => [field, direction] as [string, SortOrder])),
      stripped,
      errors: [],
    };
  }

  if (Array.isArray(sort)) {
    return {
      sort: kept.map(({ field, direction }) => [field, direction] as [string, SortOrder]),
      stripped,
      errors: [],
    };
  }

  return {
    sort: Object.fromEntries(kept.map(({ field, direction }) => [field, direction])) as Sort,
    stripped,
    errors: [],
  };
}
