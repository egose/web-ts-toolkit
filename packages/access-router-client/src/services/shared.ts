import { get, noop, set } from '@web-ts-toolkit/utils';
import { ResponseCallback } from '../types';
import { CustomHeaders } from '../enums';
import { ResultError, ServiceError } from './service';

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

  return <T extends { success: boolean }>(res: T, shouldThrowOnError = throwOnError) => {
    if (res.success) {
      successHandler(res);
      return res;
    }

    failureHandler(res);
    if (shouldThrowOnError) {
      throw new ServiceError(res as unknown as ResultError);
    }

    return res;
  };
};

export function processListResult<TResult, TData>(
  result: TResult,
  { includeCount, includeExtraHeaders }: { includeCount: boolean; includeExtraHeaders: boolean },
  wrapItem?: (item: TData) => unknown,
): TResult {
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
      const listData = result.raw as unknown as { count: number; rows: TData[] };
      result.totalCount = listData.count;
      result.raw = listData.rows;
    }
  }

  result.data = wrapItem ? (result.raw as TData[]).map(wrapItem) : result.raw;
  return result;
}
