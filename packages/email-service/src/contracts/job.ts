import type { AttemptReason, SubmissionOutcome } from './provider';
import type {
  Correlation,
  EmailAdmissionKey,
  EmailAttemptId,
  EmailJobId,
  EmailScope,
  ProviderRef,
  SmtpCapacity,
  TemplateIdentity,
  UnixMs,
} from './message';

/**
 * Frozen at admission. `maxAttempts` defaults to 3 claims, including quota deferrals with no provider call.
 * Safe transient retries use jittered exponential backoff (default 1 s base, 60 s cap) and any later retry
 * floor from the limiter or provider. No retry is scheduled at or after expiry.
 */
export type RetryPolicy = { maxAttempts: number; baseDelayMs: number; maxDelayMs: number };
/** Minimum windows from a settled terminal transition, not promised deletion times. */
export type RetentionPolicy = { payloadMs: number; historyMs: number; idempotencyMs: number };

/** Why processing ended, distinct from an individual submission outcome. */
export type JobDisposition =
  | 'accepted'
  | 'partially_accepted'
  | 'validated'
  | 'rejected'
  | 'unknown'
  | 'failed'
  | 'expired'
  | 'cancelled';

export type UnknownResolution = {
  readonly attemptId: EmailAttemptId;
  readonly at: UnixMs;
  readonly action: 'dismiss' | 'redrive';
};

export type EmailJobState =
  | { readonly state: 'queued'; readonly nextAt: UnixMs }
  | { readonly state: 'leased'; readonly phase: 'pre_handoff' | 'handed_off' }
  | {
      readonly state: 'terminal';
      readonly disposition: JobDisposition;
      readonly terminalAt: UnixMs;
      readonly terminalReason: AttemptReason | 'attempts_exhausted';
    };

/** Authoritative redacted job state, available without waiting for activity projection. */
export type EmailJobSummary = EmailJobState & {
  readonly version: 1;
  readonly smtpCapacity?: SmtpCapacity;
  readonly scope: EmailScope;
  readonly jobId: EmailJobId;
  readonly key: EmailAdmissionKey;
  readonly provider: ProviderRef;
  readonly template: TemplateIdentity;
  readonly correlation: Correlation;
  readonly scheduleAt: UnixMs | null;
  readonly createdAt: UnixMs;
  readonly updatedAt: UnixMs;
  readonly expiresAt: UnixMs;
  readonly priority: number;
  readonly attemptCount: number;
  readonly latestAttempt?: {
    readonly attemptId: EmailAttemptId;
    readonly outcome: SubmissionOutcome;
    readonly reason: AttemptReason;
  };
  readonly unknownOpen: boolean;
  readonly resolutions: readonly UnknownResolution[];
};

export type CancelResult =
  | { readonly status: 'cancelled' | 'too_late'; readonly job: EmailJobSummary }
  | { readonly status: 'not_found' };

/**
 * Resolve only the current open unknown attempt. Dismiss leaves the outcome unchanged, even after expiry.
 * Redrive requires a retained unexpired snapshot and no previous redrive; it adds one claim on that same
 * snapshot and can duplicate an already accepted message. Quiesce suspected old workers and review evidence first.
 */
export type ResolveUnknownCommand = { jobId: EmailJobId; attemptId: EmailAttemptId } & (
  | { action: 'dismiss' }
  | { action: 'redrive'; acknowledgeDuplicateRisk: true }
);

export type ResolveUnknownResult = { readonly status: 'resolved' | 'replayed'; readonly job: EmailJobSummary };
