import type { UserId } from '../types/message';

/**
 * Payment provider interface.
 *
 * Host apps implement this to handle payment sessions for messages
 * that require payment (e.g. Stripe, Adyen, Paddle).
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
   * Expire a session that was never completed.
   * Should be idempotent.
   */
  expireSession(sessionId: string): Promise<void>;

  /**
   * Refund a completed payment.
   * Should be idempotent.
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
