import type { CancelResult, EmailJobSummary, JobDisposition, ResolveUnknownCommand, ResolveUnknownResult } from './job';
import type {
  Awaitable,
  CallOptions,
  Correlation,
  EmailAttemptId,
  EmailJobId,
  EmailScope,
  ProviderRef,
  SmtpCapacity,
  TemplateIdentity,
  UnixMs,
} from './message';
import type { AttemptResult, RecipientResult } from './provider';
import type { EmailStore } from './store';
import type { MaintenanceStop } from './worker';

/** Redacted projection of a finalized attempt; never a queue payload or a delivery receipt. */
export type EmailActivity = {
  readonly version: 1;
  readonly smtpCapacity?: SmtpCapacity;
  /** Present in opted-in history; counts refer to the original To, Cc and Bcc groups, never addresses. */
  readonly recipientCounts?: Readonly<Record<RecipientResult['group'], number>>;
  readonly scope: EmailScope;
  readonly jobId: EmailJobId;
  readonly attemptId: EmailAttemptId;
  readonly ordinal: number;
  readonly provider: ProviderRef;
  readonly template: TemplateIdentity;
  readonly correlation: Correlation;
  readonly startedAt: UnixMs;
  readonly handedOffAt?: UnixMs;
  readonly finishedAt: UnixMs;
  readonly result: Omit<AttemptResult, 'retryHint'>;
  readonly disposition: JobDisposition | 'retry_scheduled';
};

/** `from` is inclusive; `before` is exclusive. Cursors are opaque and not authorization tokens. */
export type EmailActivityQuery = {
  jobId?: EmailJobId;
  from?: UnixMs;
  before?: UnixMs;
  limit?: number;
  cursor?: string;
};

export type EmailActivityPage = { readonly items: readonly EmailActivity[]; readonly nextCursor?: string };
/** One sequential sweep; V1 defaults to 20 (1–100); SMTP opt-in defaults to 4 (1–16). */
export type MaintenanceOptions = CallOptions & { limit?: number };

/** Confirmed work in this call, not a queue inventory. A confirmed idempotent ACK counts. */
export type ReconcileReport = {
  readonly stop: MaintenanceStop;
  readonly reserved: number;
  readonly acknowledged: number;
  readonly permitsExpired: number;
  readonly persistenceFailures: number;
  readonly observerStarted: number;
  readonly observerSkipped: number;
};

export type CleanupReport = {
  readonly stop: MaintenanceStop;
  readonly payloadsPruned: number;
  readonly retirementsStarted: number;
  readonly jobsPurged: number;
  readonly persistenceFailures: number;
};

export interface EmailAdmin {
  readonly scope: EmailScope;
  /** Read the job and its latest authoritative outcome, even before projection. Use this to verify a current hold. */
  getJob(jobId: EmailJobId, options?: CallOptions): Promise<EmailJobSummary | null>;
  /** Cancel only before irreversible handoff and expiry; no remote recall. */
  cancel(jobId: EmailJobId, options?: CallOptions): Promise<CancelResult>;
  /**
   * Dismiss or requeue the exact open unknown attempt. Redrive can duplicate a previously accepted submission.
   * After `write_unconfirmed`, check the current job's `resolutions` for the exact attempt and action.
   */
  resolveUnknown(command: ResolveUnknownCommand, options?: CallOptions): Promise<ResolveUnknownResult>;
  /**
   * Read committed activities even before source ACK. History is not an inventory of open holds.
   * V1 default/max: 25/100; SMTP opt-in: 8/16.
   */
  listActivities(query?: EmailActivityQuery, options?: CallOptions): Promise<EmailActivityPage>;
  /** Project from the authoritative ledger. Does not recover leases or send mail. */
  reconcile(options?: MaintenanceOptions): Promise<ReconcileReport>;
  /** Prune or retire settled, fully projected jobs after their retention windows. */
  cleanup(options?: MaintenanceOptions): Promise<CleanupReport>;
}

export type EmailAdminOptions = {
  scope: EmailScope;
  /** Must match the store. Opted-in history stays redacted and cursors remain bound to this tuple. */
  smtpCapacity?: SmtpCapacity;
  store: EmailStore;
  /** Best effort after a new confirmed projection ACK. One unresolved callback per admin; no wait or retry. */
  onActivity?: (activity: EmailActivity) => Awaitable<void>;
};
