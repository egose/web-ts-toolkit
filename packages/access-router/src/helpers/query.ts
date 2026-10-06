import { flattenDeep, isNil, isPlainObject, isString, reduce } from '@web-ts-toolkit/utils';
import { Projection, KeyValueProjection } from '../interfaces';

export const DEFAULT_LIST_HARD_LIMIT = 1000;

const normalizeSafeInteger = (value: number | string | undefined, min: number): number | null => {
  if (isNil(value)) return null;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min) return null;

  return parsed;
};

export function genPagination(
  {
    skip,
    limit,
    page,
    pageSize,
  }: {
    skip?: number | string;
    limit?: number | string;
    page?: number | string;
    pageSize?: number | string;
  },
  hardLimit?: number,
) {
  const resolvedHardLimit = normalizeSafeInteger(hardLimit, 1) ?? DEFAULT_LIST_HARD_LIMIT;
  let _skip = 0;
  let _limit = normalizeSafeInteger(limit ?? pageSize, 1) ?? resolvedHardLimit;
  if (!Number.isSafeInteger(_limit) || _limit > resolvedHardLimit) _limit = resolvedHardLimit;

  const normalizedSkip = normalizeSafeInteger(skip, 0);
  const normalizedPage = normalizeSafeInteger(page, 0);

  if (normalizedSkip !== null) {
    _skip = normalizedSkip;
  } else if (normalizedPage !== null) {
    const npage = normalizedPage;
    if (npage > 1) {
      const derivedSkip = (npage - 1) * _limit;
      _skip = Number.isSafeInteger(derivedSkip) ? derivedSkip : Number.MAX_SAFE_INTEGER;
    }
  }

  // ARF-04: guard against an impossible offset. An overshoot at the very end
  // of the safe integer range is harmless (returns an empty page), but a
  // negative or non-finite value must never reach the persistence adapter.
  if (!Number.isSafeInteger(_skip) || _skip < 0) {
    return { skip: 0, limit: _limit };
  }

  return { skip: _skip, limit: _limit };
}

export function parseSortString(sortString: string): { sortKey: string; sortOrder: 'asc' | 'desc' } {
  if (!sortString) return { sortKey: '', sortOrder: 'asc' };

  if (sortString.startsWith('-')) {
    return { sortKey: sortString.substring(1), sortOrder: 'desc' };
  } else {
    return { sortKey: sortString, sortOrder: 'asc' };
  }
}

/**
 * Normalize a `select` query param (`?select=name,secret`, `?select=name secret`,
 * or repeated `?select=name&select=secret`) into a field list. Returns
 * `undefined` when absent or empty so callers keep omitted-select semantics
 * (including `requireExplicitSelect` handling downstream).
 *
 * VIRT-08 (VIRT-00A D8): the select grammar preserves arbitrary-string
 * acceptance. Registered virtual names (e.g. `fullAddress`, `-fullAddress`)
 * are accepted here like any persisted name; model-aware virtual exclusion
 * happens downstream in the planner/service boundary (VIRT-02/VIRT-04), never
 * as a validation rejection. No getter runs during parsing.
 */
export function parseSelectParam(select: string | string[] | undefined): string[] | undefined {
  if (select === undefined) return undefined;
  const values = Array.isArray(select) ? select : [select];
  const fields = values.flatMap((value) => String(value).split(/[\s,]+/)).filter(Boolean);
  return fields.length > 0 ? fields : undefined;
}

/**
 * Normalize service-direct `select` shapes (string/array/projection-object)
 * into a flat token list (`name`, `-name`).
 *
 * VIRT-08 (VIRT-00A D8): shares `parseSelectParam` comma/space splitting so
 * HTTP query and service-direct string forms agree
 * (`"name,fullAddress"` ≡ `"name fullAddress"` ≡ `["name","fullAddress"]`).
 * Arbitrary strings (including registered virtuals and ordinary persisted
 * dotted paths such as `address.city`) are preserved, not rejected.
 */
export function normalizeSelect(select: Projection): string[] {
  if (Array.isArray(select)) return flattenDeep(select.map(normalizeSelect));
  if (isPlainObject(select)) {
    return reduce(
      select as KeyValueProjection,
      (ret, val, key) => {
        if (val === 1) ret.push(key);
        else if (val === -1) ret.push(`-${key}`);
        return ret;
      },
      [],
    );
  }
  if (isString(select))
    return String(select)
      .split(/[\s,]+/)
      .map((v) => v.trim())
      .filter(Boolean);
  return [];
}

/**
 * VIRT-02 select-shape helpers (pure, no virtual-registry knowledge).
 * The planner in `src/acl/virtual-projection.ts` uses these to preserve
 * `resolveSelectForRequest` inclusion/exclusion semantics and ARC-21 `_id`
 * identity across array/string/projection-object forms.
 */
export type VirtualSelectMode = 'all' | 'include' | 'exclude';

/** Omitted (`undefined`) or effectively empty (normalizes to `[]`). */
export function isEffectivelyEmptySelect(select: Projection | undefined | null): boolean {
  return normalizeSelect((select ?? null) as Projection).length === 0;
}

/** Classify a normalized select into omitted/empty vs include vs exclude. */
export function getVirtualSelectMode(normalized: string[]): VirtualSelectMode {
  if (normalized.length === 0) return 'all';
  return normalized.every((v) => v.startsWith('-')) ? 'exclude' : 'include';
}

/** Whether an (already normalized) select explicitly strips `_id`. */
export function hasIdExclusion(normalized: string[]): boolean {
  return normalized.includes('-_id');
}
