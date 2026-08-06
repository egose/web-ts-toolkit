import { flattenDeep, isNil, isPlainObject, isString, reduce } from '@web-ts-toolkit/utils';
import { Projection, KeyValueProjection } from '../interfaces';

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
  hardLimit,
) {
  let _skip = 0;
  let _limit = normalizeSafeInteger(limit ?? pageSize, 1) ?? hardLimit;
  if (!Number.isSafeInteger(_limit) || _limit > hardLimit) _limit = hardLimit;

  const normalizedSkip = normalizeSafeInteger(skip, 0);
  const normalizedPage = normalizeSafeInteger(page, 0);

  if (normalizedSkip !== null) {
    _skip = normalizedSkip;
  } else if (normalizedPage !== null) {
    const npage = normalizedPage;
    if (npage > 1) _skip = (npage - 1) * _limit;
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
  if (isString(select)) return select.split(' ').map((v) => v.trim());
  return [];
}
