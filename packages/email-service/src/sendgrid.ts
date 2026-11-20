import type { EmailProvider, SendGridSnapshot } from './contracts/provider';
import { createSendGridProfile } from './providers/sendgrid/profile';

/** Instance-owned credentials for HTTPS Mail Send only, not for template administration. */
export type SendGridProviderOptions = {
  key: string;
  /** An explicit Mail Send bearer token. Keep it in host secret configuration, not snapshots or logs. */
  apiKey: string;
  /** Defaults to live; sandbox validation does not submit an email. */
  mode?: 'live' | 'sandbox';
};

/**
 * Create a SendGrid Mail Send profile with no SDK or peer. The endpoint is fixed and
 * TLS is verified. Construction and `prepare` do no network I/O; `submit` is one-shot
 * with no redirects or retries. Live acceptance is not inbox delivery. Direct use is unmanaged.
 */
export function createSendGridProvider(options: SendGridProviderOptions): EmailProvider<SendGridSnapshot> {
  return createSendGridProfile(options);
}
