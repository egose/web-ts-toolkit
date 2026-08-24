import type { ModelRouter } from '@web-ts-toolkit/access-router';

type ErrorRecord = Record<string, unknown>;

type ErrorCategory = 'cast' | 'conflict' | 'http' | 'unknown' | 'validation';

class PublicApiError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'PublicApiError';
    this.statusCode = statusCode;
  }
}

function errorRecord(error: unknown): ErrorRecord {
  return typeof error === 'object' && error !== null ? (error as ErrorRecord) : {};
}

function errorName(error: unknown): string | undefined {
  const name = errorRecord(error).name;
  return typeof name === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/u.test(name) ? name : undefined;
}

function errorCode(error: unknown): string | number | undefined {
  const code = errorRecord(error).code;
  if (typeof code === 'number' && Number.isSafeInteger(code)) return code;
  return typeof code === 'string' && /^[A-Z0-9_-]{1,32}$/u.test(code) ? code : undefined;
}

function errorStatus(error: unknown): number | undefined {
  const statusCode = errorRecord(error).statusCode;
  return typeof statusCode === 'number' && Number.isInteger(statusCode) ? statusCode : undefined;
}

function classifyError(error: unknown): ErrorCategory {
  const name = errorName(error);
  const code = errorCode(error);
  const labels = errorRecord(error).errorLabels;
  if (
    code === 11000 ||
    code === 11001 ||
    code === 112 ||
    (Array.isArray(labels) && labels.includes('TransientTransactionError'))
  ) {
    return 'conflict';
  }
  if (name === 'CastError') return 'cast';
  if (name === 'ValidationError' || name === 'ValidatorError' || name === 'ZodError') return 'validation';
  const statusCode = errorStatus(error);
  return statusCode !== undefined && statusCode >= 400 && statusCode < 500 ? 'http' : 'unknown';
}

function publicError(error: unknown): PublicApiError {
  const category = classifyError(error);
  if (category === 'cast' || category === 'validation') return new PublicApiError(400, 'Invalid request.');
  if (category === 'conflict') return new PublicApiError(409, 'Resource conflict.');

  const statusCode = errorStatus(error);
  if (category === 'http' && statusCode) {
    const messages: Record<number, string> = {
      400: 'Invalid request.',
      401: 'Authentication required.',
      403: 'Forbidden.',
      404: 'Resource not found.',
      409: 'Resource conflict.',
      413: 'Request too large.',
      422: 'Invalid request.',
      429: 'Too many requests.',
    };
    return new PublicApiError(statusCode, messages[statusCode] ?? 'Request failed.');
  }

  return new PublicApiError(500, 'Unexpected server error.');
}

export function logServerError(error: unknown, boundary: 'access-router' | 'express'): void {
  console.error(
    JSON.stringify({
      event: 'api_error',
      boundary,
      category: classifyError(error),
      name: errorName(error),
      code: errorCode(error),
      statusCode: errorStatus(error),
    }),
  );
}

export function configureApiErrorBoundary(modelRouters: ReadonlyArray<ModelRouter<any>>): void {
  const responseHandlers = new Set(modelRouters.map(({ router }) => router.responseHandler));
  for (const responseHandler of responseHandlers) {
    responseHandler.preError = (error) => {
      logServerError(error, 'access-router');
      throw publicError(error);
    };
    responseHandler.errorMessageProvider = () => ({
      status: 500,
      detail: 'Unexpected server error.',
    });
  }
}
