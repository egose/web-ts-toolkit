import type { EmailProvider, PreparedEmailSubmission, SmtpSnapshot } from './contracts/provider';
import { readProviderResult } from './internal/attempt-codecs';
import { readProviderCall, readProviderSubmission } from './internal/provider-preparation';
import { invalid } from './internal/validation';
import { prepareSmtpMessage } from './providers/smtp/mime';
import { readSmtpConfig } from './providers/smtp/options';
import { submitSmtp } from './providers/smtp/submit';

/** Configuration for a direct, unpooled ESMTP connection with verified TLS 1.2 or newer. */
export type SmtpProviderOptions = {
  key: string;
  /** ASCII DNS hostname or IP literal, without a URL, port or IPv6 brackets. */
  host: string;
  /** Defaults to 465 for implicit TLS or 587 for required STARTTLS. */
  port?: number;
  tls: 'implicit' | 'starttls';
  /** Optional DNS name for SNI and certificate verification. Otherwise verify `host`, including IP SANs. */
  servername?: string;
  /** PEM CA certificates (one per entry). Replaces the default Node trust roots when provided. */
  ca?: readonly string[];
  /** Optional ESMTP PLAIN/LOGIN credentials, used only after certificate verification. */
  auth?: { user: string; pass: string };
};

/**
 * Create a live SMTP profile using the optional Nodemailer peer for MIME. Construction and
 * `prepare` do no network I/O. Each prepared `submit` is one-shot, with no retry or pool.
 * Acceptance only confirms SMTP submission, not inbox delivery. Direct use has no queue guarantees.
 */
export function createSmtpProvider(options: SmtpProviderOptions): EmailProvider<SmtpSnapshot> {
  const config = readSmtpConfig(options);
  const { ref } = config;
  const provider: EmailProvider<SmtpSnapshot> = {
    ref,
    prepare(input) {
      const prepared = readProviderSubmission(input, ref);
      const {
        attemptId,
        snapshot: { envelope },
      } = prepared;
      let message: ReturnType<typeof prepareSmtpMessage> | undefined = prepareSmtpMessage(prepared);
      return Object.freeze({
        async submit(context) {
          if (!message) invalid('closed');
          const call = readProviderCall(context);
          const send = message;
          message = undefined;
          const result = await submitSmtp(config, send, call);
          try {
            return readProviderResult(result, ref, attemptId, envelope);
          } catch {
            return readProviderResult(
              { outcome: 'unknown', retry: 'never', stage: result.stage, reason: 'transport_uncertain' },
              ref,
              attemptId,
              envelope,
            );
          }
        },
      } satisfies PreparedEmailSubmission);
    },
  };
  return Object.freeze(provider);
}
