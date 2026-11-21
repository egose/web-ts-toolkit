import type { SmtpCapacity } from './contracts/message';
import type { EmailProvider, PreparedEmailSubmission, SmtpSnapshot } from './contracts/provider';
import { readProviderResult } from './internal/attempt-codecs';
import { readProviderCall, readProviderSubmission } from './internal/provider-preparation';
import { capacityTag } from './internal/smtp-capacity';
import { invalid } from './internal/validation';
import { prepareSmtpMessage } from './providers/smtp/mime';
import { readSmtpConfig } from './providers/smtp/options';
import { submitSmtp } from './providers/smtp/submit';

/** Configuration for a direct, unpooled ESMTP connection with verified TLS 1.2 or newer. */
export type SmtpProviderOptions = {
  key: string;
  /** Must match the prepared snapshot and worker for opted-in messages. Omit for the V1 cap of 50. */
  smtpCapacity?: SmtpCapacity;
  /** ASCII DNS hostname or IP literal, without a URL, port or IPv6 brackets. */
  host: string;
  /** Defaults to 465 for implicit TLS or 587 for required STARTTLS. */
  port?: number;
  tls: 'implicit' | 'starttls';
  /**
   * Optional DNS name for TLS SNI and server certificate verification. Otherwise verify `host`,
   * including IP SANs. This does not change the fixed `EHLO email.invalid` client greeting.
   */
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
  const { ref, capacity } = config;
  const provider: EmailProvider<SmtpSnapshot> = {
    ref,
    ...capacityTag(capacity),
    prepare(input) {
      const prepared = readProviderSubmission(input, ref, capacity);
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
            return readProviderResult(result, ref, attemptId, envelope, capacity);
          } catch {
            return readProviderResult(
              { outcome: 'unknown', retry: 'never', stage: result.stage, reason: 'transport_uncertain' },
              ref,
              attemptId,
              envelope,
              capacity,
            );
          }
        },
      } satisfies PreparedEmailSubmission);
    },
  };
  return Object.freeze(provider);
}
