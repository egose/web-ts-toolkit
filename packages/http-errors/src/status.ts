import assert from 'node:assert';
import { STATUS_CODES } from 'node:http';

const canonicalStatusLookup = Object.freeze({
  400: 'INVALID_ARGUMENT',
  401: 'UNAUTHENTICATED',
  403: 'PERMISSION_DENIED',
  404: 'NOT_FOUND',
  409: 'ABORTED',
  412: 'FAILED_PRECONDITION',
  429: 'RESOURCE_EXHAUSTED',
  500: 'INTERNAL',
  501: 'UNIMPLEMENTED',
  503: 'UNAVAILABLE',
  504: 'DEADLINE_EXCEEDED',
} as const);

export const canonicalStatusByHttpStatus: Readonly<typeof canonicalStatusLookup> = Object.freeze({
  ...canonicalStatusLookup,
});

type CanonicalStatusMap = typeof canonicalStatusLookup;
type CanonicalStatusCode = keyof CanonicalStatusMap;

export const getCanonicalStatus = (statusCode: number): string =>
  canonicalStatusLookup[statusCode as CanonicalStatusCode] || 'UNKNOWN';

export const getStatusTitle = (statusCode: number): string => STATUS_CODES[statusCode] || 'Unknown Error';

export const isHttpErrorStatusCode = (statusCode: unknown): statusCode is number =>
  typeof statusCode === 'number' &&
  Number.isFinite(statusCode) &&
  Number.isInteger(statusCode) &&
  statusCode >= 400 &&
  statusCode <= 599;

export const validateHttpErrorStatusCode = (statusCode: unknown, source = 'statusCode'): number => {
  assert.ok(
    isHttpErrorStatusCode(statusCode),
    `${source} must be an integer HTTP error status code between 400 and 599`,
  );
  return statusCode;
};

export const validateClientErrorStatusCode = (statusCode: unknown, source = 'statusCode'): number => {
  validateHttpErrorStatusCode(statusCode, source);
  assert.ok(typeof statusCode === 'number' && statusCode <= 499, `${source} must be a 4xx HTTP error status code`);
  return statusCode;
};

export const validateServerErrorStatusCode = (statusCode: unknown, source = 'statusCode'): number => {
  validateHttpErrorStatusCode(statusCode, source);
  assert.ok(typeof statusCode === 'number' && statusCode >= 500, `${source} must be a 5xx HTTP error status code`);
  return statusCode;
};
