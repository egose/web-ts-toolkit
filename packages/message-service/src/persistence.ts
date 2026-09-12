import type mongoose from 'mongoose';
import { MessageTransactionRequiredError } from './errors';

// ---------------------------------------------------------------------------
// Internal persistence seam (MSGF-12)
//
// Small transaction boundary for the lifecycle writes documented as atomic
// (idempotent batch commit, action-claim archival). Callers resolve their
// `active`/`archive`/`request` models first with the service's owning-
// connection checks (`MessageService.resolveModel`), then run the unit of
// work through `runMessageTransaction`. Nothing here is a general repository
// framework: two call sites, one function, explicit failure.
//
// Not a public subpath export — imported only by `message-service.ts`.
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
 */
export async function runMessageTransaction<T>(
  activeModel: TransactionCapableActiveModel,
  operation: MessageTransactionOperation<T>,
): Promise<T> {
  const startSession = activeModel.db?.startSession;
  if (typeof startSession !== 'function') {
    throw new MessageTransactionRequiredError(
      new Error('message-service: atomic lifecycle write requires a Mongoose model with db.startSession support'),
    );
  }

  let session: mongoose.ClientSession;
  try {
    session = await startSession.call(activeModel.db);
  } catch (error) {
    throw isTransactionSupportError(error) ? new MessageTransactionRequiredError(error) : error;
  }

  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await operation(session);
    });
    return result;
  } catch (error) {
    throw isTransactionSupportError(error) ? new MessageTransactionRequiredError(error) : error;
  } finally {
    await session.endSession();
  }
}
