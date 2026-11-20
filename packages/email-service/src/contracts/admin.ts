import type { CancelResult, EmailJobSummary, JobDisposition, ResolveUnknownCommand, ResolveUnknownResult } from './job';
import type {
  Awaitable,
  CallOptions,
  Correlation,
  EmailAttemptId,
  EmailJobId,
  EmailScope,
  ProviderRef,
  TemplateIdentity,
  UnixMs,
} from './message';
import type { AttemptResult } from './provider';
import type { EmailStore } from './store';
import type { MaintenanceStop } from './worker';

/** Redacted projection of a finalized attempt; never a queue payload or a delivery receipt. */
export type EmailActivity = {
  readonly version: 1;
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
/** One sequential sweep; limit defaults to 20 and accepts 1–100. */
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
  /** Read the job and its latest authoritative outcome, even before an activity is projected. */
  getJob(jobId: EmailJobId, options?: CallOptions): Promise<EmailJobSummary | null>;
  /** Cancel only before irreversible handoff and expiry; no remote recall. */
  cancel(jobId: EmailJobId, options?: CallOptions): Promise<CancelResult>;
  /** Dismiss or requeue an exact unknown attempt. Redrive can duplicate a previously accepted submission. */
  resolveUnknown(command: ResolveUnknownCommand, options?: CallOptions): Promise<ResolveUnknownResult>;
  /** Read a bounded page of committed activities (default 25, max 100), even if the source ACK is pending. */
  listActivities(query?: EmailActivityQuery, options?: CallOptions): Promise<EmailActivityPage>;
  /** Project from the authoritative ledger; no send can result from this operation. */
  reconcile(options?: MaintenanceOptions): Promise<ReconcileReport>;
  /** Prune or retire settled, fully projected jobs after their retention windows. */
  cleanup(options?: MaintenanceOptions): Promise<CleanupReport>;
}

export type EmailAdminOptions = {
  scope: EmailScope;
  store: EmailStore;
  /** Best effort after a new confirmed projection ACK. One unresolved callback per admin; no wait or retry. */
  onActivity?: (activity: EmailActivity) => Awaitable<void>;
};
