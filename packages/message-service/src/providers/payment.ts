import type { UserId } from '../types/message';

/**
 * Payment provider interface.
 *
 * Host apps implement this to handle payment sessions for messages
 * that require payment (e.g. Stripe, Adyen, Paddle).
 *
 * Every fresh item's nonempty `item.paymentCd || template.paymentCd || ''`
 * requires a session, even with no recipients. Empty item codes inherit the
 * template code; codes are passed through without trimming. Absent/null
 * providers raise `PaymentProviderRequiredError`; code-free creation and
 * completed replay (including legacy sessionless records) need no provider.
 * Session creation is not proof of payment: completion, capture, webhooks, and
 * payment-based business authorization remain host/provider responsibilities.
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
   * Create one checkout/session per payment-bearing prepared item, independently
   * of recipients, outside retryable transaction callbacks. `user` is
   * `(payerUser || user)._id`, not the prepared sender or recipient; only the
   * item's `priceArgs` is forwarded. Return a nonempty session id. A null/empty
   * result throws `Error('payment session creation failed')`; provider rejections
   * propagate unchanged (unless known-session compensation itself fails).
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
 * No-op payment provider that returns null for session creation and does nothing
 * for expire/refund. It cannot satisfy a nonempty payment code: fresh paid items
 * fail with `Error('payment session creation failed')`, even without recipients.
 * Code-free applications may omit the provider entirely; tests may use this
 * implementation to exercise the configured-provider null-return contract.
 */
export class NoopPaymentProvider implements PaymentProvider {
  async createSession(_user: UserId, _code: string, _priceArgs?: Record<string, unknown>): Promise<string | null> {
    return null;
  }

  async expireSession(_sessionId: string): Promise<void> {}

  async refundPayment(_sessionId: string): Promise<void> {}
}
