import {
  createAip193ErrorInfoDetail,
  getCanonicalStatus,
  toAip193ErrorPayload,
  toRfc9457ErrorPayload,
  type Aip193ErrorPayload,
  type HttpErrorShape,
  type Rfc9457ErrorPayload,
} from '@web-ts-toolkit/http-errors';

import type { ErrorMessageProvider, ErrorMessageResult, ErrorWithPayload } from './types';

const isString = (value: unknown): value is string => typeof value === 'string';
const isPlainObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object';
const { isArray } = Array;

const toStatusCode = (status: unknown, code: unknown, fallbackStatusCode: number): number => {
  if (typeof status === 'number') {
    return status;
  }

  return typeof code === 'number' ? code : fallbackStatusCode;
};

const toOptionalString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

const toMetadata = (value: unknown): Record<string, string> | undefined => {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const metadata = Object.entries(value).reduce<Record<string, string>>((result, [key, entry]) => {
    result[key] = String(entry);
    return result;
  }, {});

  return Object.keys(metadata).length > 0 ? metadata : undefined;
};

const toArray = (value: unknown): unknown[] | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  return isArray(value) ? value : [value];
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
  const errorLike = error as ErrorWithPayload;

  return errorLike.message ?? errorLike._message ?? String(error);
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
    const statusCode = typeof error.code === 'number' ? error.code : 422;
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
    const statusCode = typeof result.code === 'number' ? result.code : 422;
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
      code: 422,
      status: getCanonicalStatus(422),
      message: String(result),
      details: [createAip193ErrorInfoDetail(getCanonicalStatus(422), errorDomain)],
    },
  };
};

export const toRfc9457GenericErrorPayload = (result: ErrorMessageResult): Rfc9457ErrorPayload => {
  const problem = toProblemDetailsSource(result);

  if (problem) {
    const statusCode = toStatusCode(problem.status, problem.code, 422);

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
    statusCode: 422,
    message: String(result),
  });
};
