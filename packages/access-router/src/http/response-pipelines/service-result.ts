import type {
  ErrorResult,
  ListResult,
  PublicErrorResult,
  PublicListResult,
  PublicServiceResult,
  PublicSingleResult,
  ServiceResult,
  SingleResult,
} from '../../interfaces';

export const toPublicErrorResult = <TError>(result: ErrorResult<TError>): PublicErrorResult<TError> => ({
  success: false,
  code: result.code,
  errors: result.errors,
});

export const toPublicSingleResult = <T>(result: SingleResult<T>): PublicSingleResult<T> => ({
  success: true,
  kind: 'single',
  code: result.code,
  data: result.data,
});

export const toPublicListResult = <T>(result: ListResult<T>): PublicListResult<T> => ({
  success: true,
  kind: 'list',
  code: result.code,
  data: result.data,
  count: result.count,
  totalCount: result.totalCount ?? null,
});

export const toPublicServiceResult = <T = unknown, TError = unknown>(
  result: ServiceResult<T, TError>,
): PublicServiceResult<T, TError> => {
  if (!result.success) {
    return toPublicErrorResult(result);
  }

  return result.kind === 'list' ? toPublicListResult(result) : toPublicSingleResult(result);
};
