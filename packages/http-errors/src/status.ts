export const canonicalStatusByHttpStatus = {
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
} as const;

type CanonicalStatusMap = typeof canonicalStatusByHttpStatus;
type CanonicalStatusCode = keyof CanonicalStatusMap;

export const getCanonicalStatus = (statusCode: number): string =>
  canonicalStatusByHttpStatus[statusCode as CanonicalStatusCode] || 'UNKNOWN';
