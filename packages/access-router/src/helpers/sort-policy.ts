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
