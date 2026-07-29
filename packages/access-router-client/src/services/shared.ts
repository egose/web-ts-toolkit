import { get, noop, set } from '@web-ts-toolkit/utils';
import { ResponseCallback } from '../types';
import { CustomHeaders } from '../enums';
import { ResultError, ServiceError } from './service';

type ListResultShape = {
  raw: unknown;
  data: unknown;
  totalCount?: number;
  headers: Record<string, unknown>;
};

const toResultError = (result: { success: boolean } & Partial<ResultError>): ResultError => ({
  success: false,
  raw: result.raw ?? null,
  data: result.data ?? null,
  message: result.message ?? '',
  status: result.status ?? 0,
  headers: result.headers ?? {},
});

const isLegacyListPayload = <TData>(value: unknown): value is { count: number; rows: TData[] } => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return 'count' in value && typeof value.count === 'number' && 'rows' in value && Array.isArray(value.rows);
};

export const setDefaultObjectProp = (obj: object, key: string, value: unknown) => {
  if (!get(obj, key)) {
    set(obj, key, value);
  }
};

export const createResponseHandler = (
  onSuccess: ResponseCallback,
  onFailure: ResponseCallback,
  throwOnError: boolean,
) => {
  const successHandler = onSuccess ?? noop;
  const failureHandler = onFailure ?? noop;

  return <T extends { success: boolean }>(res: T, shouldThrowOnError = throwOnError): T => {
    if (res.success) {
      successHandler(res);
      return res;
    }

    failureHandler(res);
    if (shouldThrowOnError) {
      throw new ServiceError(toResultError(res));
    }

    return res;
  };
};

export function processListResult<TResult, TData>(
  result: TResult & ListResultShape,
  { includeCount, includeExtraHeaders }: { includeCount: boolean; includeExtraHeaders: boolean },
  wrapItem?: (item: TData) => unknown,
): TResult & ListResultShape {
  const wrappedRows = get(result, 'raw.data');
  const wrappedTotalCount = get(result, 'raw.meta.totalCount');

  if (Array.isArray(wrappedRows)) {
    const rows = wrappedRows as TData[];
    result.raw = wrappedRows;

    if (includeCount) {
      if (includeExtraHeaders) {
        const totalCount = get(result, `headers.${CustomHeaders.TotalCount}`, 0);
        result.totalCount = Number(totalCount);
      } else {
        result.totalCount = Number(wrappedTotalCount ?? rows.length);
      }
    }
  } else if (includeCount) {
    if (includeExtraHeaders) {
      const totalCount = get(result, `headers.${CustomHeaders.TotalCount}`, 0);
      result.totalCount = Number(totalCount);
    } else {
      if (isLegacyListPayload<TData>(result.raw)) {
        result.totalCount = result.raw.count;
        result.raw = result.raw.rows;
      } else {
        result.totalCount = 0;
        result.raw = [];
      }
    }
  }

  result.data = wrapItem ? (result.raw as TData[]).map(wrapItem) : result.raw;
  return result;
}
