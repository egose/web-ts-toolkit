import type mongoose from 'mongoose';
import { MessageTransactionRequiredError } from './errors';
import type {
  MessageTransactionCleanupFailureEvent,
  MessageTransactionCleanupFailureObserver,
} from './types/transaction';

// ---------------------------------------------------------------------------
// Internal persistence seam (MSGF-12)
//
// Small transaction boundary for the lifecycle writes documented as atomic
// (idempotent batch commit, action-claim archival). Callers resolve their
// `active`/`archive`/`request` models first with the service's owning-
// connection checks (`MessageService.resolveModel`), then run the unit of
// work through `runMessageTransaction`. Nothing here is a general repository
// framework: one boundary for service writes and direct document archival.
//
// Not a public subpath export.
// ---------------------------------------------------------------------------

/** Active message model as resolved on its owning connection. */
export type TransactionCapableActiveModel = mongoose.Model<unknown> & {
  db?: { startSession?: () => Promise<mongoose.ClientSession> };
};

/**
 * Unit of work executed inside the transaction. Receives the started
 * session; every read/write belonging to the atomic unit must use it.
 */
export type MessageTransactionOperation<T> = (session: mongoose.ClientSession) => Promise<T>;

interface MessageTransactionOptions {
  operation: MessageTransactionCleanupFailureEvent['operation'];
  onTransactionCleanupFailure?: MessageTransactionCleanupFailureObserver;
  /** Borrowed session: run the transaction, but leave session cleanup to its owner. */
  session?: mongoose.ClientSession;
}

export function isDuplicateKeyError(error: unknown): error is { code: number } {
  return error instanceof Error && 'code' in error && error.code === 11000;
}

export function isTransactionSupportError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes('Transaction numbers are only allowed') ||
    error.message.includes('Transaction is not supported') ||
    error.message.includes('transactions are not supported')
  );
}

/**
 * Run `operation` inside a MongoDB transaction started on the active
 * model's owning connection.
 *
 * Fails closed with `MessageTransactionRequiredError` when the model
 * exposes no `db.startSession` capability (standalone servers, unit fakes
 * without a session seam) instead of silently executing sessionless — the
 * workflows using this seam are documented as atomic. Transaction-support
 * failures from `startSession()`/`withTransaction()` are wrapped the same
 * way so callers map one error type.
 * A resolved transaction is authoritative even if owned-session cleanup fails.
 * Borrowed sessions are never ended here. Cleanup observers cannot replace a
 * committed result or the primary transaction failure.
 */
export async function runMessageTransaction<T>(
  activeModel: TransactionCapableActiveModel,
  operation: MessageTransactionOperation<T>,
  options: MessageTransactionOptions,
): Promise<T> {
  const startSession = activeModel.db?.startSession;
  if (!options.session && typeof startSession !== 'function') {
    throw new MessageTransactionRequiredError(
      new Error('message-service: atomic lifecycle write requires a Mongoose model with db.startSession support'),
    );
  }

  let session: mongoose.ClientSession;
  try {
    session = options.session ?? (await startSession!.call(activeModel.db));
  } catch (error) {
    throw isTransactionSupportError(error) ? new MessageTransactionRequiredError(error) : error;
  }

  let committed = false;
  let originalError: unknown;
  let operationFailure: { error: unknown } | undefined;
  try {
    let result!: T;
    await session.withTransaction(async () => {
      // The driver may retry this callback. Only the latest attempt's failure
      // may take precedence over a secondary abortTransaction rejection.
      operationFailure = undefined;
      try {
        result = await operation(session);
      } catch (error) {
        operationFailure = { error };
        throw error;
      }
    });
    committed = true;
    return result;
  } catch (error) {
    const primary = operationFailure ? operationFailure.error : error;
    originalError = isTransactionSupportError(primary) ? new MessageTransactionRequiredError(primary) : primary;
    throw originalError;
  } finally {
    if (!options.session) {
      try {
        await session.endSession();
      } catch (error) {
        const event: MessageTransactionCleanupFailureEvent = {
          operation: options.operation,
          stage: 'endSession',
          error,
          ...(committed ? { outcome: 'committed' as const } : { outcome: 'failed' as const, originalError }),
        };
        try {
          await options.onTransactionCleanupFailure?.(event);
        } catch {
          // Diagnostics must never replace the business outcome.
        }
      }
    }
  }
}
