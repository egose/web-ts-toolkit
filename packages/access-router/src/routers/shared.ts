import { CustomHeaders } from '../enums';
import { Request, ServiceResult } from '../interfaces';

export const parseBooleanString = (str: string, defaultValue?: any) => (str ? str === 'true' : defaultValue);

export const getStringRouteParam = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? '';

export const formatListResponse = (
  req: Request,
  result: Pick<ServiceResult, 'data' | 'totalCount'>,
  includeCount?: boolean,
  includeExtraHeaders?: boolean,
) => {
  const { data, totalCount } = result;

  if (includeCount) {
    if (includeExtraHeaders) {
      req.res.setHeader(CustomHeaders.TotalCount, totalCount);
      return data;
    }

    return { count: totalCount, rows: data };
  }

  return data;
};

export const formatCreatedData = (result: Pick<ServiceResult, 'count' | 'data'>) => {
  return result.count === 1 ? result.data[0] : result.data;
};

export const formatUpsertCreatedData = (result: Pick<ServiceResult, 'data'>) => {
  return result.data.length > 0 ? result.data[0] : null;
};
