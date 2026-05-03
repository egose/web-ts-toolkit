import { getDefaultMessage } from './messages';
import { getCanonicalStatus } from './status';
import type { HttpErrorOptions } from './types';

type ErrorWithCaptureStackTrace = ErrorConstructor & {
  captureStackTrace?: (targetObject: object, constructorOpt?: Function) => void;
};

const ErrorCtor = Error as ErrorWithCaptureStackTrace;

const toMetadata = (metadata: HttpErrorOptions['metadata']): Record<string, string> | undefined => {
  if (!metadata) {
    return undefined;
  }

  return Object.entries(metadata).reduce<Record<string, string>>((result, [key, value]) => {
    result[key] = String(value);
    return result;
  }, {});
};

export class HttpError extends Error {
  readonly statusCode: number;
  readonly status: string;
  readonly date: Date;
  readonly reason?: string;
  readonly domain?: string;
  readonly metadata?: Record<string, string>;
  readonly details?: unknown[];
  readonly errors?: unknown;

  constructor(statusCode = 500, message?: string, options: HttpErrorOptions = {}) {
    super(message || getDefaultMessage(statusCode), options);

    if (ErrorCtor.captureStackTrace) {
      ErrorCtor.captureStackTrace(this, this.constructor);
    }

    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.status = options.status || getCanonicalStatus(statusCode);
    this.date = new Date();

    if (options.reason) {
      this.reason = options.reason;
    }

    if (options.domain) {
      this.domain = options.domain;
    }

    if (options.metadata) {
      this.metadata = toMetadata(options.metadata);
    }

    if (options.details) {
      this.details = options.details;
    }

    if (options.errors !== undefined) {
      this.errors = options.errors;
    }
  }
}

export class ClientError extends HttpError {
  constructor(statusCode = 400, message?: string, options: HttpErrorOptions = {}) {
    super(statusCode, message, options);
  }
}

export class ServerError extends HttpError {
  constructor(statusCode = 500, message?: string, options: HttpErrorOptions = {}) {
    super(statusCode, message, options);
  }
}
