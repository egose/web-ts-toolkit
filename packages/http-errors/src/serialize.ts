import { getCanonicalStatus, getStatusTitle } from './status';
import type {
  Aip193ErrorInfoDetail,
  Aip193ErrorPayload,
  HttpErrorShape,
  Rfc9457ErrorPayload,
  Rfc9457ValidationError,
} from './types';

const RFC_9457_DEFAULT_TYPE = 'about:blank';

const toAip193ErrorDetails = (error: HttpErrorShape, fallbackDomain: string): unknown[] => {
  const status = error.status ?? getCanonicalStatus(error.statusCode);

  return [
    createAip193ErrorInfoDetail(error.reason ?? status, error.domain ?? fallbackDomain, error.metadata),
    ...(error.errors !== undefined ? [{ type: 'bad_request', errors: error.errors }] : []),
    ...(error.details ?? []),
  ];
};

const toRfc9457Errors = <TError>(errors: unknown): TError[] | undefined =>
  Array.isArray(errors) ? (errors as TError[]) : undefined;

export const createAip193ErrorInfoDetail = (
  reason: string,
  domain: string,
  metadata?: Record<string, string>,
): Aip193ErrorInfoDetail => ({
  type: 'error_info',
  reason,
  domain,
  ...(metadata ? { metadata } : {}),
});

export const toAip193ErrorPayload = (error: HttpErrorShape, fallbackDomain = 'http-errors'): Aip193ErrorPayload => {
  const status = error.status ?? getCanonicalStatus(error.statusCode);
  const details = toAip193ErrorDetails(error, fallbackDomain);

  return {
    error: {
      code: error.statusCode,
      status,
      message: error.message,
      details,
    },
  };
};

export const toRfc9457ErrorPayload = <TError = unknown>(error: HttpErrorShape): Rfc9457ErrorPayload<TError> => {
  const errors = toRfc9457Errors<TError>(error.errors);

  return {
    type: error.type ?? RFC_9457_DEFAULT_TYPE,
    title: error.title ?? getStatusTitle(error.statusCode),
    status: error.statusCode,
    detail: error.message,
    ...(error.instance ? { instance: error.instance } : {}),
    ...(errors ? { errors } : {}),
  };
};

export const toRfc9457ValidationErrorPayload = (error: HttpErrorShape): Rfc9457ErrorPayload<Rfc9457ValidationError> =>
  toRfc9457ErrorPayload<Rfc9457ValidationError>(error);
