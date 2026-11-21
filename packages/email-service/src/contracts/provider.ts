import type { EmailAttemptId, EmailJobId, EmailSnapshot, ResolvedAttachment, SmtpCapacity, UnixMs } from './message';

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
export type ProviderReason = ProviderResult['reason'];

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

type ProviderStage = Exclude<SubmissionStage, 'pre_handoff' | 'attachment' | 'rate_limit'>;
type SmtpStage = Exclude<ProviderStage, 'http'>;
type EvidenceField = 'recipients' | 'messageId' | 'providerMessageId' | 'retryHint';

type ProviderEvidence<
  Reason extends string,
  Outcome extends SubmissionOutcome,
  Retry extends RetryClass,
  Stage extends ProviderStage,
  Details = Record<never, never>,
> = Readonly<{ reason: Reason; outcome: Outcome; retry: Retry; stage: Stage }> &
  Readonly<Details> & { readonly [Field in Exclude<EvidenceField, keyof Details>]?: never };

export type RecipientWithStatus<Status extends RecipientResult['status']> = RecipientResult & {
  readonly status: Status;
};

export type AcceptedSmtpRecipients = readonly [RecipientWithStatus<'accepted'>, ...RecipientWithStatus<'accepted'>[]];

export type MixedSmtpRecipients = readonly [RecipientResult, RecipientResult, ...RecipientResult[]] & {
  // Phantom only. A structural, uninhabitable marker preserves compatibility across ESM and CJS declarations.
  readonly __checkedSmtpMixedRecipients: never;
};

type SmtpAcceptance<Recipients extends readonly RecipientResult[]> = {
  recipients: Recipients;
  messageId?: string;
};

export type RejectedRecipients =
  | { readonly recipients?: never }
  | { readonly stage: 'envelope' | 'data'; readonly recipients: readonly RecipientWithStatus<'rejected'>[] };

export type ThrottleHint = RetryHint & (Readonly<{ delayMs: number }> | Readonly<{ notBefore: UnixMs }>);

type TransportEvidence<
  Reason extends string,
  Outcome extends SubmissionOutcome,
  Retry extends RetryClass,
> = Reason extends string ? ProviderEvidence<Reason, Outcome, Retry, ProviderStage, RejectedRecipients> : never;

/**
 * Submission evidence discriminated by `reason`. Full SMTP acceptance requires a nonempty
 * all-accepted tuple. Use `createSmtpAcceptanceResult` to check a dynamic list or produce
 * partial acceptance. The worker still checks the actual envelope and profile kind/mode.
 * Invalid evidence after handoff is unknown, not permission to retry.
 */
export type ProviderResult =
  | ProviderEvidence<'smtp_accepted', 'accepted', 'never', 'data', SmtpAcceptance<AcceptedSmtpRecipients>>
  | ProviderEvidence<'smtp_partial', 'partially_accepted', 'never', 'data', SmtpAcceptance<MixedSmtpRecipients>>
  | ProviderEvidence<'smtp_transient_reply', 'rejected', 'safe_transient', SmtpStage, RejectedRecipients>
  | ProviderEvidence<'smtp_permanent_reply', 'rejected', 'never', SmtpStage, RejectedRecipients>
  | ProviderEvidence<'sendgrid_accepted', 'accepted', 'never', 'http', { providerMessageId?: string }>
  | ProviderEvidence<'sendgrid_validated', 'validated', 'never', 'http'>
  | ProviderEvidence<'sendgrid_throttled', 'rejected', 'safe_transient', 'http', { retryHint?: ThrottleHint }>
  | ProviderEvidence<'sendgrid_rejected', 'rejected', 'never', 'http'>
  | TransportEvidence<'not_transmitted', 'unsubmitted', 'safe_transient'>
  | TransportEvidence<'provider_configuration', 'unsubmitted', 'never'>
  | TransportEvidence<'transport_uncertain' | 'provider_timeout' | 'provider_aborted', 'unknown', 'never'>;

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
  readonly smtpCapacity?: SmtpCapacity;
  /** Validate and prepare without I/O. Direct unmanaged submission has no queue or retry guarantees. */
  prepare(input: ProviderSubmission<M>): PreparedEmailSubmission;
}

export type ConfiguredEmailProvider = EmailProvider<SmtpSnapshot> | EmailProvider<SendGridSnapshot>;
