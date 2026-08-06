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

/**
 * Public DTOs carry a type-only {@link PublicListResult} brand that internal
 * service results lack. Public DTOs are therefore not structurally assignable
 * from internal results; the only way across the boundary is through this
 * serializer, which constructs a fresh plain object (the brand is type-only,
 * so it carries no runtime field and disappears from the serialized JSON) and
 * casts it to the public type. The cast is intentional: this is the single
 * crossing point between internal service results and the public response DTO.
 */
export const toPublicErrorResult = <TError>(result: ErrorResult<TError>): PublicErrorResult<TError> =>
  ({
    success: false,
    code: result.code,
    errors: result.errors,
  }) as PublicErrorResult<TError>;

export const toPublicSingleResult = <T>(result: SingleResult<T>): PublicSingleResult<T> =>
  ({
    success: true,
    kind: 'single',
    code: result.code,
    data: result.data,
  }) as PublicSingleResult<T>;

export const toPublicListResult = <T>(result: ListResult<T>): PublicListResult<T> =>
  ({
    success: true,
    kind: 'list',
    code: result.code,
    data: result.data,
    count: result.count,
    totalCount: result.totalCount ?? null,
  }) as PublicListResult<T>;

export const toPublicServiceResult = <T = unknown, TError = unknown>(
  result: ServiceResult<T, TError>,
): PublicServiceResult<T, TError> => {
  if (result.kind === 'error') {
    return toPublicErrorResult<TError>(result);
  }

  return result.kind === 'list' ? toPublicListResult(result) : toPublicSingleResult(result);
};
