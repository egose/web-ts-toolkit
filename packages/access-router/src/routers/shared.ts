import { CustomHeaders } from '../enums';
import { ListResult, Request } from '../interfaces';

export const parseBooleanString = (str: string, defaultValue?: any) => (str ? str === 'true' : defaultValue);

export const getStringRouteParam = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? '';

export const formatListResponse = (
  req: Request,
  result: Pick<ListResult, 'data' | 'totalCount'>,
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

export const formatCreatedData = (result: Pick<ListResult, 'count' | 'data'>) => {
  return result.count === 1 ? result.data[0] : result.data;
};

export const formatUpsertCreatedData = (result: Pick<ListResult, 'data'>) => {
  return result.data.length > 0 ? result.data[0] : null;
};
