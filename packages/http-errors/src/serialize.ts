import { getCanonicalStatus } from './status';
import type { Aip193ErrorInfoDetail, Aip193ErrorPayload, HttpErrorShape } from './types';

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
  const status = error.status || getCanonicalStatus(error.statusCode);
  const details = [
    createAip193ErrorInfoDetail(error.reason || status, error.domain || fallbackDomain, error.metadata),
    ...(error.errors !== undefined ? [{ type: 'bad_request', errors: error.errors }] : []),
    ...(error.details || []),
  ];

  return {
    error: {
      code: error.statusCode,
      status,
      message: error.message,
      ...(details.length > 0 ? { details } : {}),
    },
  };
};
