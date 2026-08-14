import { toStringRecord } from '@web-ts-toolkit/utils';
import { getDefaultMessage } from './messages';
import {
  getCanonicalStatus,
  validateClientErrorStatusCode,
  validateHttpErrorStatusCode,
  validateServerErrorStatusCode,
} from './status';
import type { HttpErrorOptions } from './types';

type ErrorWithCaptureStackTrace = ErrorConstructor & {
  captureStackTrace?: (targetObject: object, constructorOpt?: abstract new (...args: never[]) => object) => void;
};

const ErrorCtor = Error as ErrorWithCaptureStackTrace;

/**
 * Base typed HTTP error with a numeric `statusCode` and machine-readable metadata.
 *
 * Accepts only finite integer status codes from 400 through 599. Structured options
 * are intended for external API payloads: serializers emit `message`, `details`,
 * `errors`, `metadata`, `type`, `title`, and `instance` verbatim, so do not store
 * secrets or log-only diagnostics in those fields.
 *
 * Top-level `metadata`, `details`, and array-valued `errors` are shallow snapshots:
 * the error owns frozen top-level records/arrays, but nested objects remain shared.
 *
 * @param statusCode HTTP error status code from 400 through 599. Defaults to 500.
 * @param message Public error message. Defaults to the package's status message.
 * @param options Optional cause and structured fields used by payload serializers.
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
  readonly metadata?: Readonly<Record<string, string>>;
  readonly details?: readonly unknown[];
  readonly errors?: unknown;
  readonly type?: string;
  readonly title?: string;
  readonly instance?: string;

  constructor(statusCode = 500, message?: string, options: HttpErrorOptions = {}) {
    const validatedStatusCode = validateHttpErrorStatusCode(statusCode);

    super(message ?? getDefaultMessage(validatedStatusCode), options);

    const { status, reason, domain, metadata, details, errors, type, title, instance } = options;

    if (ErrorCtor.captureStackTrace) {
      ErrorCtor.captureStackTrace(this, this.constructor as abstract new (...args: never[]) => object);
    }

    this.name = this.constructor.name;
    this.statusCode = validatedStatusCode;
    this.status = status ?? getCanonicalStatus(validatedStatusCode);
    this.date = new Date();

    if (reason !== undefined) {
      this.reason = reason;
    }

    if (domain !== undefined) {
      this.domain = domain;
    }

    const normalizedMetadata = toStringRecord(metadata);

    if (normalizedMetadata !== undefined) {
      this.metadata = Object.freeze(normalizedMetadata);
    }

    if (details !== undefined) {
      this.details = Object.freeze([...details]);
    }

    if (errors !== undefined) {
      this.errors = Array.isArray(errors) ? Object.freeze([...errors]) : errors;
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

/**
 * Base class for 4xx client errors.
 *
 * Accepts only finite integer status codes from 400 through 499 and otherwise has
 * the same payload, disclosure, and shallow ownership semantics as `HttpError`.
 *
 * @param statusCode HTTP client error status code from 400 through 499. Defaults to 400.
 * @param message Public error message. Defaults to the package's status message.
 * @param options Optional cause and structured fields used by payload serializers.
 */
export class ClientError extends HttpError {
  constructor(statusCode = 400, message?: string, options: HttpErrorOptions = {}) {
    super(validateClientErrorStatusCode(statusCode), message, options);
  }
}

/**
 * Base class for 5xx server errors.
 *
 * Accepts only finite integer status codes from 500 through 599 and otherwise has
 * the same payload, disclosure, and shallow ownership semantics as `HttpError`.
 *
 * @param statusCode HTTP server error status code from 500 through 599. Defaults to 500.
 * @param message Public error message. Defaults to the package's status message.
 * @param options Optional cause and structured fields used by payload serializers.
 */
export class ServerError extends HttpError {
  constructor(statusCode = 500, message?: string, options: HttpErrorOptions = {}) {
    super(validateServerErrorStatusCode(statusCode), message, options);
  }
}
