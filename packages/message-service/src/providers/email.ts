/**
 * Email provider interface.
 * Host app implements this to send email notifications.
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
