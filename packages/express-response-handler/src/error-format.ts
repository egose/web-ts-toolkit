import {
  createAip193ErrorInfoDetail,
  getCanonicalStatus,
  isHttpErrorStatusCode,
  toAip193ErrorPayload,
  toRfc9457ErrorPayload,
  validateHttpErrorStatusCode,
  type Aip193ErrorPayload,
  type HttpErrorShape,
  type Rfc9457ErrorPayload,
} from '@web-ts-toolkit/http-errors';
import { isArray, isPlainObject, isString, toStringRecord } from '@web-ts-toolkit/utils';

import type { ErrorMessageProvider, ErrorMessageResult, ErrorWithPayload } from './types';

export const FALLBACK_ERROR_STATUS = 500;
export const FALLBACK_ERROR_MESSAGE = 'Internal Server Error';

export const isValidErrorStatusCode = isHttpErrorStatusCode;

export const validateErrorStatusCode = (statusCode: unknown, source: string): number => {
  return validateHttpErrorStatusCode(statusCode, source);
};

export const toErrorStatusCode = (
  status: unknown,
  code: unknown,
  fallbackStatusCode = FALLBACK_ERROR_STATUS,
): number => {
  const statusCode = typeof status === 'number' ? status : code;

  if (statusCode === undefined) {
    return fallbackStatusCode;
  }

  return validateErrorStatusCode(statusCode, 'error status');
};

const toOptionalString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

const toMetadata = (value: unknown): Record<string, string> | undefined => {
  return toStringRecord(value);
};

const toArray = (value: unknown): unknown[] | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  return isArray(value) ? value : [value];
};

const describeThrown = (value: unknown): string => {
  try {
    if (value === null) {
      return 'null';
    }

    if (value === undefined) {
      return 'undefined';
    }

    if (typeof value === 'symbol') {
      return value.toString();
    }

    const stringified =
      typeof value === 'object' && value !== null ? (value as { message?: unknown }).message : undefined;

    if (typeof stringified === 'string' && stringified.length > 0) {
      return stringified;
    }

    return String(value);
  } catch {
    return FALLBACK_ERROR_MESSAGE;
  }
};

export const normalizeThrownError = (value: unknown): ErrorWithPayload => {
  if (value instanceof Error) {
    return value as ErrorWithPayload;
  }

  const message = describeThrown(value);

  if (isPlainObject(value)) {
    const record = value as Record<string, unknown>;
    const normalized: ErrorWithPayload = {
      ...record,
      message,
    } as ErrorWithPayload;

    return normalized;
  }

  return { message } as ErrorWithPayload;
};

const toHttpErrorShape = (error: ErrorWithPayload, fallbackDomain: string): HttpErrorShape => ({
  statusCode: error.statusCode ?? 500,
  status: error.status,
  message: error.message ?? '',
  reason: error.reason,
  domain: error.domain ?? fallbackDomain,
  metadata: toMetadata(error.metadata),
  details: toArray(error.details),
  errors: error.errors,
  type: error.type,
  title: error.title,
  instance: error.instance,
});

const toProblemDetailsSource = (result: ErrorMessageResult): Record<string, unknown> | undefined => {
  if (isPlainObject(result) && isPlainObject(result.error)) {
    return result.error;
  }

  return isPlainObject(result) ? result : undefined;
};

export const defaultErrorMessageProvider: ErrorMessageProvider = function (error) {
  void error;
  return FALLBACK_ERROR_MESSAGE;
};

export const toSimpleErrorPayload = (result: ErrorMessageResult): Record<string, unknown> =>
  isString(result) ? { message: result } : { ...result };

export const toStructuredHttpErrorPayload = (error: ErrorWithPayload, errorDomain: string): Aip193ErrorPayload =>
  toAip193ErrorPayload(toHttpErrorShape(error, errorDomain), errorDomain);

export const toRfc9457HttpErrorPayload = (error: ErrorWithPayload, errorDomain: string): Rfc9457ErrorPayload =>
  toRfc9457ErrorPayload(toHttpErrorShape(error, errorDomain));

export const toStructuredGenericErrorPayload = (
  result: ErrorMessageResult,
  errorDomain: string,
): Aip193ErrorPayload => {
  if (isPlainObject(result) && isPlainObject(result.error)) {
    const error = result.error;
    const statusCode = toErrorStatusCode(error.code, undefined);
    const status = typeof error.status === 'string' ? error.status : getCanonicalStatus(statusCode);
    const message = typeof error.message === 'string' ? error.message : '';
    const details = toArray(error.details);

    return {
      error: {
        code: statusCode,
        status,
        message,
        ...(details ? { details } : {}),
      },
    };
  }

  if (isPlainObject(result)) {
    const statusCode = toErrorStatusCode(result.code, undefined);
    const status = typeof result.status === 'string' ? result.status : getCanonicalStatus(statusCode);
    const message = typeof result.message === 'string' ? result.message : '';
    const details = toArray(result.details) || [createAip193ErrorInfoDetail(status, errorDomain)];

    return {
      error: {
        code: statusCode,
        status,
        message,
        ...(details ? { details } : {}),
      },
    };
  }

  return {
    error: {
      code: FALLBACK_ERROR_STATUS,
      status: getCanonicalStatus(FALLBACK_ERROR_STATUS),
      message: String(result),
      details: [createAip193ErrorInfoDetail(getCanonicalStatus(FALLBACK_ERROR_STATUS), errorDomain)],
    },
  };
};

export const toRfc9457GenericErrorPayload = (result: ErrorMessageResult): Rfc9457ErrorPayload => {
  const problem = toProblemDetailsSource(result);

  if (problem) {
    const statusCode = toErrorStatusCode(problem.status, problem.code);

    return toRfc9457ErrorPayload({
      statusCode,
      message: toOptionalString(problem.detail) ?? toOptionalString(problem.message) ?? '',
      errors: problem.errors,
      type: toOptionalString(problem.type),
      title: toOptionalString(problem.title),
      instance: toOptionalString(problem.instance),
    });
  }

  return toRfc9457ErrorPayload({
    statusCode: FALLBACK_ERROR_STATUS,
    message: String(result),
  });
};
