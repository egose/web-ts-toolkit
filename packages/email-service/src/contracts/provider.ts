import type { EmailAttemptId, EmailJobId, EmailSnapshot, ResolvedAttachment, UnixMs } from './message';

/** Outcome of submission only, never an inbox-delivery receipt. Sandbox is `validated`, not `accepted`. */
export type SubmissionOutcome =
  | 'unsubmitted'
  | 'accepted'
  | 'partially_accepted'
  | 'rejected'
  | 'unknown'
  | 'validated';
/** Only established transient nonacceptance/unsubmitted evidence may be safe to retry. */
export type RetryClass = 'never' | 'safe_transient';
export type SubmissionStage =
  | 'pre_handoff'
  | 'attachment'
  | 'rate_limit'
  | 'connect'
  | 'tls'
  | 'auth'
  | 'envelope'
  | 'data'
  | 'http';

/** Zero-based index in the frozen group; no addresses. SendGrid provides no synchronous recipient results. */
export type RecipientResult = {
  readonly group: 'to' | 'cc' | 'bcc';
  readonly index: number;
  readonly status: 'accepted' | 'rejected';
};

/** Either or both; apply the later safe retry floor without arithmetic overflow. */
export type RetryHint = { readonly delayMs?: number; readonly notBefore?: UnixMs };

/** Normalized, bounded evidence; never a raw SDK code or response message. */
export type ProviderReason =
  | 'smtp_accepted'
  | 'smtp_partial'
  | 'smtp_transient_reply'
  | 'smtp_permanent_reply'
  | 'sendgrid_accepted'
  | 'sendgrid_validated'
  | 'sendgrid_throttled'
  | 'sendgrid_rejected'
  | 'not_transmitted'
  | 'provider_configuration'
  | 'transport_uncertain'
  | 'provider_timeout'
  | 'provider_aborted';

export type AttemptReason =
  | ProviderReason
  | 'attachment_unavailable'
  | 'attachment_timeout'
  | 'attachment_invalid'
  | 'attachment_resolver_error'
  | 'rate_deferred'
  | 'rate_timeout'
  | 'rate_error'
  | 'profile_unavailable'
  | 'provider_preflight_error'
  | 'pre_handoff_timeout'
  | 'worker_stopped'
  | 'pre_handoff_lease_expired'
  | 'launch_window_closed'
  | 'post_handoff_lease_expired'
  | 'expired'
  | 'cancelled';

export type AttemptResult = {
  readonly outcome: SubmissionOutcome;
  readonly retry: RetryClass;
  readonly stage: SubmissionStage;
  readonly reason: AttemptReason;
  readonly retryHint?: RetryHint;
  readonly recipients?: readonly RecipientResult[];
  readonly messageId?: string;
  readonly providerMessageId?: string;
};

export type ProviderResult = Omit<AttemptResult, 'stage' | 'reason'> & {
  readonly stage: Exclude<SubmissionStage, 'pre_handoff' | 'attachment' | 'rate_limit'>;
  readonly reason: ProviderReason;
};

export type ProviderSubmission<M extends EmailSnapshot> = {
  readonly jobId: EmailJobId;
  readonly attemptId: EmailAttemptId;
  readonly snapshot: M;
  readonly attachments: readonly ResolvedAttachment[];
};

export type ProviderCall = { signal: AbortSignal; timeoutMs: number };
export type SmtpSnapshot = Extract<EmailSnapshot, { kind: 'smtp' }>;
export type SendGridSnapshot = Extract<EmailSnapshot, { kind: 'sendgrid' }>;

export interface PreparedEmailSubmission {
  /** One-shot I/O. Settle only once cancellation/deadline handling makes further send I/O impossible. */
  submit(context: ProviderCall): Promise<ProviderResult>;
}

export interface EmailProvider<M extends EmailSnapshot> {
  readonly ref: M['provider'];
  /** Validate and prepare without I/O. Direct unmanaged submission has no queue or retry guarantees. */
  prepare(input: ProviderSubmission<M>): PreparedEmailSubmission;
}

export type ConfiguredEmailProvider = EmailProvider<SmtpSnapshot> | EmailProvider<SendGridSnapshot>;
