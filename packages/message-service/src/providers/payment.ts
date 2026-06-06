import type { UserId } from '../types/message';

/**
 * Payment provider interface.
 * Host app implements this to handle payment sessions (e.g. Stripe).
 */
export interface PaymentProvider {
  createSession(user: UserId, code: string, priceArgs?: Record<string, unknown>): Promise<string | null>;
  expireSession(sessionId: string): Promise<void>;
  refundPayment(sessionId: string): Promise<void>;
}

/**
 * No-op payment provider that returns null for session creation
 * and does nothing for expire/refund.
 * Useful for apps that don't use payments.
 */
export class NoopPaymentProvider implements PaymentProvider {
  async createSession(_user: UserId, _code: string, _priceArgs?: Record<string, unknown>): Promise<string | null> {
    return null;
  }

  async expireSession(_sessionId: string): Promise<void> {
    // no-op
  }

  async refundPayment(_sessionId: string): Promise<void> {
    // no-op
  }
}
