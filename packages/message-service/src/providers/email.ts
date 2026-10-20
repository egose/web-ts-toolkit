/**
 * Email provider interface.
 * Host app implements this to send email notifications.
 * Pass `provider.sendNotification.bind(provider)` as `buildMessageSchema`'s
 * `emailNotifier`; methods are not automatically bound. Recipient lookup is
 * configured separately with `emailRecipientResolver` (local User.email by
 * default). Delivery is best-effort for new session-free saves, not a durable
 * outbox; failures are observed through `onEmailDeliveryFailure`.
 */
export interface EmailProvider {
  sendNotification(to: string, title: string, body: string): Promise<void>;
}

/**
 * No-op email provider that silently discards emails.
 * Useful for testing or when email is not needed.
 */
export class NoopEmailProvider implements EmailProvider {
  async sendNotification(_to: string, _title: string, _body: string): Promise<void> {}
}
