import { toStringRecord } from '@web-ts-toolkit/utils';
import { getDefaultMessage } from './messages';
import { getCanonicalStatus } from './status';
import type { HttpErrorOptions } from './types';

type ErrorWithCaptureStackTrace = ErrorConstructor & {
  captureStackTrace?: (targetObject: object, constructorOpt?: abstract new (...args: never[]) => object) => void;
};

const ErrorCtor = Error as ErrorWithCaptureStackTrace;

/**
 * Base typed HTTP error with a numeric `statusCode` and machine-readable metadata.
 *
 * @example
 * throw new HttpError(503, 'please try again later');
 */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly status: string;
  readonly date: Date;
  readonly reason?: string;
  readonly domain?: string;
  readonly metadata?: Record<string, string>;
  readonly details?: unknown[];
  readonly errors?: unknown;
  readonly type?: string;
  readonly title?: string;
  readonly instance?: string;

  constructor(statusCode = 500, message?: string, options: HttpErrorOptions = {}) {
    super(message ?? getDefaultMessage(statusCode), options);

    const { status, reason, domain, metadata, details, errors, type, title, instance } = options;

    if (ErrorCtor.captureStackTrace) {
      ErrorCtor.captureStackTrace(this, this.constructor as abstract new (...args: never[]) => object);
    }

    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.status = status ?? getCanonicalStatus(statusCode);
    this.date = new Date();

    if (reason !== undefined) {
      this.reason = reason;
    }

    if (domain !== undefined) {
      this.domain = domain;
    }

    const normalizedMetadata = toStringRecord(metadata);

    if (normalizedMetadata !== undefined) {
      this.metadata = normalizedMetadata;
    }

    if (details !== undefined) {
      this.details = details;
    }

    if (errors !== undefined) {
      this.errors = errors;
    }

    if (type !== undefined) {
      this.type = type;
    }

    if (title !== undefined) {
      this.title = title;
    }

    if (instance !== undefined) {
      this.instance = instance;
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
