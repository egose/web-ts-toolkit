/** Diagnostics for a package-owned session whose `endSession()` rejected. */
export type MessageTransactionCleanupFailureEvent = {
  operation: 'createBatch' | 'actionArchive' | 'directArchive';
  stage: 'endSession';
  error: unknown;
} & (
  | { outcome: 'committed'; originalError?: never }
  | {
      /** Transaction rejected; this does not certify rollback of an ambiguous commit. */
      outcome: 'failed';
      originalError: unknown;
    }
);

/**
 * Best-effort diagnostic observer, awaited after session cleanup rejects.
 * Throws/rejections are swallowed to preserve the committed result or primary
 * transaction error. Keep it bounded; it is not a retry/compensation hook.
 * Caller-owned sessions are never ended or reported by the package.
 */
export type MessageTransactionCleanupFailureObserver = (
  event: MessageTransactionCleanupFailureEvent,
) => void | Promise<void>;
