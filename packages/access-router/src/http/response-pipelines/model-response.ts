import JsonRouter from '@web-ts-toolkit/express-json-router';
import type { ListResult, Request, ServiceResult, SingleResult } from '../../interfaces';
import { formatCreatedData, formatListResponse, formatUpsertCreatedData } from './list-response';

const success = JsonRouter.success;

export function unwrapServiceData<T>(result: SingleResult<T> | ListResult<T>) {
  return result.data;
}

export function formatModelListResponse<T>(
  req: Request,
  result: Pick<ListResult<T>, 'data' | 'count' | 'totalCount' | 'query'>,
  includeCount?: boolean,
  includeExtraHeaders?: boolean,
) {
  return formatListResponse(req, result, includeCount, includeExtraHeaders);
}

export function formatModelCreatedResponse<T>(result: Pick<ListResult<T>, 'count' | 'data'>) {
  return new success.Created(formatCreatedData(result));
}

export function formatModelUpsertResponse<T>(result: ServiceResult<T>) {
  return result.kind === 'list' ? new success.Created(formatUpsertCreatedData(result)) : result.data;
}
