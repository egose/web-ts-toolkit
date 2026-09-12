import type { UserId } from '../types/message';

/**
 * Payment provider interface.
 *
 * Host apps implement this to handle payment sessions for messages
 * that require payment (e.g. Stripe, Adyen, Paddle).
 *
 * Message creation may create external sessions before MongoDB commit. If any
 * prepared item, model/session setup step, or idempotent batch transaction
 * fails before commit, `MessageService` calls `expireSession()` for every
 * newly created uncommitted session tracked from preparation through the
 * commit attempt — including sessions from earlier batch items when a later
 * item's provider/render step fails, and sessions left uncommitted by model
 * resolution, `startSession()`, persistence, or rollback failures. Every
 * known session is attempted even when an earlier expiration or the
 * `onPaymentCompensationFailure` observer fails; multi-session batches then
 * throw `PaymentSessionCompensationAggregateError` (a
 * `PaymentSessionCompensationError` carrying every per-session failure in
 * `failures` with the triggering error as `originalError`), while a lone
 * session keeps the single-session `PaymentSessionCompensationError` shape.
 * Providers must make expiration idempotent because callers may retry cleanup
 * after ambiguous network or provider failures. Committed sessions are never
 * expired because post-commit housekeeping failed; a completed same-scope
 * retry replays the committed batch without creating replacement sessions.
 * Non-idempotent sequential creation keeps per-item semantics: only the
 * failing item is compensated, already-committed items are retained.
 * Process death before a returned session is recorded, or any ambiguous
 * provider/commit outcome this process cannot observe, must be reconciled
 * with the provider out of band. If expiration itself fails, message creation
 * fails with the compensation error and the optional service hook is invoked
 * once per failed session for observability.
 *
 * `priceArgs` is intentionally a free-form `Record<string, unknown>` so
 * providers can accept their own metadata (currency, line items, etc.).
 * Templates should document what they pass.
 */
export interface PaymentProvider {
  /**
   * Create a checkout/session for the given user and pricing code.
   * Return the session id, or `null` to indicate the session could not
   * be created (the message creation flow will throw in that case).
   */
  createSession(user: UserId, code: string, priceArgs?: Record<string, unknown>): Promise<string | null>;

  /**
   * Expire a session that was never committed to a usable message.
   * Must be idempotent.
   */
  expireSession(sessionId: string): Promise<void>;

  /**
   * Refund a completed payment.
   * Must be idempotent.
   */
  refundPayment(sessionId: string): Promise<void>;
}

/**
 * No-op payment provider that returns null for session creation
 * and does nothing for expire/refund. Useful for apps that don't use payments
 * or for tests.
 */
export class NoopPaymentProvider implements PaymentProvider {
  async createSession(_user: UserId, _code: string, _priceArgs?: Record<string, unknown>): Promise<string | null> {
    return null;
  }

  async expireSession(_sessionId: string): Promise<void> {}

  async refundPayment(_sessionId: string): Promise<void> {}
}
