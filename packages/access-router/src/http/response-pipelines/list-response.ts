import { CustomHeaders } from '../../enums';
import type { ListResult, Request } from '../../interfaces';

type ListQuery = {
  skip?: number;
  limit?: number;
};

export const formatListResponse = <T>(
  req: Request,
  result: Pick<ListResult<T>, 'data' | 'count' | 'totalCount' | 'query'>,
  includeCount?: boolean,
  includeExtraHeaders?: boolean,
) => {
  const { data, count: returnedCount, totalCount } = result;
  const query = (result.query ?? {}) as ListQuery;
  const rawLimit = Number(query.limit ?? 0);
  const skip = Number(query.skip ?? 0);
  const limit = rawLimit > 0 ? rawLimit : returnedCount;
  const pageSize = limit;
  const page = rawLimit > 0 ? Math.floor(skip / limit) + 1 : 1;
  const hasPreviousPage = skip > 0;
  const meta = {
    returnedCount,
    skip,
    limit,
    page,
    pageSize,
    hasPreviousPage,
    ...(includeCount && totalCount != null
      ? {
          totalCount,
          totalPages: limit > 0 ? Math.ceil(totalCount / limit) : 1,
          hasNextPage: skip + returnedCount < totalCount,
        }
      : {}),
  };

  if (includeExtraHeaders) {
    req.res.setHeader(CustomHeaders.ReturnedCount, returnedCount);
    req.res.setHeader(CustomHeaders.Page, page);
    req.res.setHeader(CustomHeaders.PageSize, pageSize);
    req.res.setHeader(CustomHeaders.HasPreviousPage, String(hasPreviousPage));

    if (includeCount && totalCount != null) {
      req.res.setHeader(CustomHeaders.TotalCount, totalCount);
      req.res.setHeader(CustomHeaders.TotalPages, meta.totalPages);
      req.res.setHeader(CustomHeaders.HasNextPage, String(meta.hasNextPage));
    }
  }

  return { data, meta };
};

export const formatCreatedData = <T>(result: Pick<ListResult<T>, 'count' | 'data'>) => {
  return result.count === 1 ? result.data[0] : result.data;
};

export const formatUpsertCreatedData = <T>(result: Pick<ListResult<T>, 'data'>) => {
  return result.data.length > 0 ? result.data[0] : null;
};
