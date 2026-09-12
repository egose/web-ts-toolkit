import { isRuntimeError, markRuntimeError } from './runtime-contract';

// ---------------------------------------------------------------------------
// Shared message-service failure contract (MSGF-12)
//
// Internal module: imported by `message-service.ts` (which re-exports every
// symbol below so `src/index.ts`, routes, and schema code keep importing
// from `./message-service`), and by the internal `persistence.ts` seam.
// Not a public subpath export — the package publishes only the root entry.
// Cross-format branding (`Symbol.hasInstance` + `markRuntimeError`) is
// preserved verbatim from the pre-split service so packed ESM/CJS consumers
// keep working `instanceof` checks.
// ---------------------------------------------------------------------------

export const TRANSACTION_REQUIRED_MESSAGE =
  'message-service requires MongoDB replica set or sharded-cluster transactions for idempotent batch creation';

/** Model roles the service resolves on a Mongoose connection or resolver. */
export type MessageModelRole = 'active' | 'archive' | 'request' | 'user';

export class MessageNotFoundError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    return isRuntimeError(value, 'MessageNotFoundError');
  }

  constructor(messageId: string) {
    super(`message "${messageId}" not found`);
    this.name = 'MessageNotFoundError';
    markRuntimeError(this, this.name);
  }
}

export class MessageArchivedError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    return isRuntimeError(value, 'MessageArchivedError');
  }

  constructor(messageId: string) {
    super(`message "${messageId}" is archived`);
    this.name = 'MessageArchivedError';
    markRuntimeError(this, this.name);
  }
}

export class TemplateNotFoundError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    return isRuntimeError(value, 'TemplateNotFoundError');
  }

  constructor(templateCd: string) {
    super(`template "${templateCd}" not found`);
    this.name = 'TemplateNotFoundError';
    markRuntimeError(this, this.name);
  }
}

export class ActionNotFoundError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    return isRuntimeError(value, 'ActionNotFoundError');
  }

  constructor(templateCd: string, actionCd: string) {
    super(`action "${actionCd}" not found in template "${templateCd}"`);
    this.name = 'ActionNotFoundError';
    markRuntimeError(this, this.name);
  }
}

export class ActionNotAllowedError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    return isRuntimeError(value, 'ActionNotAllowedError');
  }

  constructor() {
    super('not allowed');
    this.name = 'ActionNotAllowedError';
    markRuntimeError(this, this.name);
  }
}

export class InvalidMessageUserError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    return isRuntimeError(value, 'InvalidMessageUserError');
  }

  constructor(message = 'user._id must be a non-empty string or ObjectId') {
    super(message);
    this.name = 'InvalidMessageUserError';
    markRuntimeError(this, this.name);
  }
}

export class ActionTemplateMismatchError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    return isRuntimeError(value, 'ActionTemplateMismatchError');
  }

  constructor(expectedTemplateCd: string, receivedTemplateCd: string) {
    super(`message template "${expectedTemplateCd}" does not match requested template "${receivedTemplateCd}"`);
    this.name = 'ActionTemplateMismatchError';
    markRuntimeError(this, this.name);
  }
}

export class ActionConflictError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    return isRuntimeError(value, 'ActionConflictError');
  }

  constructor(messageId: string) {
    super(`message "${messageId}" already has an action in progress`);
    this.name = 'ActionConflictError';
    markRuntimeError(this, this.name);
  }
}

export class ActionRetryableError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    return isRuntimeError(value, 'ActionRetryableError');
  }

  actionAttemptId: string;

  constructor(messageId: string, actionAttemptId: string, cause?: unknown) {
    super(`message "${messageId}" action attempt "${actionAttemptId}" failed before commit and may be retried`);
    this.name = 'ActionRetryableError';
    markRuntimeError(this, this.name);
    this.actionAttemptId = actionAttemptId;
    if (cause) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

export class ActionNotificationPendingError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    return isRuntimeError(value, 'ActionNotificationPendingError');
  }

  actionAttemptId: string;
  result: unknown;

  constructor(messageId: string, actionAttemptId: string, result: unknown, cause?: unknown) {
    super(`message "${messageId}" action committed but sender notification is pending`);
    this.name = 'ActionNotificationPendingError';
    markRuntimeError(this, this.name);
    this.actionAttemptId = actionAttemptId;
    this.result = result;
    if (cause) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

export class InvalidClientRequestIdError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    return isRuntimeError(value, 'InvalidClientRequestIdError');
  }

  constructor(message: string) {
    super(message);
    this.name = 'InvalidClientRequestIdError';
    markRuntimeError(this, this.name);
  }
}

export class InvalidPaginationValueError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    return isRuntimeError(value, 'InvalidPaginationValueError');
  }

  constructor(message: string) {
    super(message);
    this.name = 'InvalidPaginationValueError';
    markRuntimeError(this, this.name);
  }
}

export class InvalidMessageServiceOptionError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    return isRuntimeError(value, 'InvalidMessageServiceOptionError');
  }

  constructor(message: string) {
    super(message);
    this.name = 'InvalidMessageServiceOptionError';
    markRuntimeError(this, this.name);
  }
}

export class ClientRequestPendingError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    return isRuntimeError(value, 'ClientRequestPendingError');
  }

  constructor(clientRequestId: string) {
    super(
      `clientRequestId "${clientRequestId}" is still pending; retry after the current reservation completes or its lease expires`,
    );
    this.name = 'ClientRequestPendingError';
    markRuntimeError(this, this.name);
  }
}

export class ClientRequestFailedError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    return isRuntimeError(value, 'ClientRequestFailedError');
  }

  /**
   * Scoped request id for this recorded failure. Safe to expose: it is the
   * caller-supplied id within the caller's own owner/template scope.
   */
  clientRequestId: string;
  /**
   * Recorded terminal-failure diagnostic (the `failureMessage` persisted on
   * the request record). Retained for internal observers/direct-service
   * callers; never serialized into HTTP responses. See `route-factory`
   * `mapServiceError`, which returns a stable public message without it.
   */
  failureReason: string | null;

  constructor(clientRequestId: string, reason?: string | null) {
    super(`clientRequestId "${clientRequestId}" previously failed; retry with a new clientRequestId`);
    this.name = 'ClientRequestFailedError';
    markRuntimeError(this, this.name);
    this.clientRequestId = clientRequestId;
    this.failureReason = reason ?? null;
    if (reason != null) {
      (this as Error & { cause?: unknown }).cause = reason;
    }
  }
}

export class ClientRequestInconsistentStateError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    return isRuntimeError(value, 'ClientRequestInconsistentStateError');
  }

  constructor(clientRequestId: string, message: string) {
    super(`clientRequestId "${clientRequestId}" has inconsistent persisted state: ${message}`);
    this.name = 'ClientRequestInconsistentStateError';
    markRuntimeError(this, this.name);
  }
}

export class MessageTransactionRequiredError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    return isRuntimeError(value, 'MessageTransactionRequiredError');
  }

  constructor(cause?: unknown) {
    super(TRANSACTION_REQUIRED_MESSAGE);
    this.name = 'MessageTransactionRequiredError';
    markRuntimeError(this, this.name);
    if (cause) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

export class MessageModelResolutionError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    return isRuntimeError(value, 'MessageModelResolutionError');
  }

  role: MessageModelRole;
  modelName: string;
  connectionName: string;

  constructor(role: MessageModelRole, modelName: string, connectionName: string, cause?: unknown) {
    super(`message-service could not resolve ${role} model "${modelName}" on ${connectionName}`);
    this.name = 'MessageModelResolutionError';
    markRuntimeError(this, this.name);
    this.role = role;
    this.modelName = modelName;
    this.connectionName = connectionName;
    if (cause) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

export class PaymentSessionCompensationError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    return (
      isRuntimeError(value, 'PaymentSessionCompensationError') ||
      isRuntimeError(value, 'PaymentSessionCompensationAggregateError')
    );
  }

  sessionId: string;
  operation: 'expire';
  compensationError: unknown;
  originalError: unknown;
  hookError?: unknown;

  constructor(
    sessionId: string,
    operation: 'expire',
    compensationError: unknown,
    originalError: unknown,
    hookError?: unknown,
  ) {
    super(`payment session compensation failed for session "${sessionId}" during ${operation}`);
    this.name = 'PaymentSessionCompensationError';
    markRuntimeError(this, this.name);
    this.sessionId = sessionId;
    this.operation = operation;
    this.compensationError = compensationError;
    this.originalError = originalError;
    this.hookError = hookError;
    (this as Error & { cause?: unknown }).cause = compensationError;
  }
}

/**
 * One failed `expireSession` (or compensation-hook) attempt within a batch.
 */
export interface PaymentSessionCompensationFailure {
  sessionId: string;
  compensationError: unknown;
  hookError?: unknown;
}

/**
 * Thrown when compensating a multi-session batch leaves one or more
 * uncommitted sessions unexpired.
 *
 * Extends `PaymentSessionCompensationError` so existing single-session
 * `instanceof` checks keep working. `sessionId`/`compensationError`/
 * `hookError` mirror the first failure for backwards compatibility; the full
 * per-session list lives in `failures` and `originalError` is the failure
 * that triggered compensation. Every known session is attempted even when an
 * earlier cleanup fails, and the hook is invoked once per failed session.
 */
export class PaymentSessionCompensationAggregateError extends PaymentSessionCompensationError {
  static [Symbol.hasInstance](value: unknown): boolean {
    return isRuntimeError(value, 'PaymentSessionCompensationAggregateError');
  }

  failures: PaymentSessionCompensationFailure[];

  constructor(failures: PaymentSessionCompensationFailure[], originalError: unknown) {
    const first = failures[0];
    super(first.sessionId, 'expire', first.compensationError, originalError, first.hookError);
    this.name = 'PaymentSessionCompensationAggregateError';
    markRuntimeError(this, this.name);
    this.failures = failures;
    if (failures.length > 1) {
      this.message =
        `payment session compensation failed for ${failures.length} sessions ` +
        `(${failures.map((f) => `"${f.sessionId}"`).join(', ')}) during expire`;
    }
  }
}
