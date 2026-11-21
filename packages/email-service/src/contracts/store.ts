import type { EmailActivity, EmailActivityPage, EmailActivityQuery } from './admin';
import type {
  CancelResult,
  EmailJobSummary,
  JobDisposition,
  ResolveUnknownCommand,
  ResolveUnknownResult,
  RetentionPolicy,
  RetryPolicy,
} from './job';
import type {
  CallOptions,
  EmailAdmissionKey,
  EmailAttemptId,
  EmailClock,
  EmailJobId,
  EmailScope,
  EmailSnapshot,
  PreparedEmailCommand,
  SmtpCapacity,
  UnixMs,
} from './message';
import type { AttemptReason, AttemptResult } from './provider';

export type StoreCall = {
  signal: AbortSignal;
  timeoutMs: number;
  /** An opted-in store must check this exact binding before every primitive. V1 calls omit it. */
  readonly smtpCapacity?: SmtpCapacity;
};
export type StoreNext<T> =
  | { readonly status: 'applied'; readonly value: T }
  | { readonly status: 'none' | 'contended' };

export type StoreAdmission = {
  command: PreparedEmailCommand;
  jobId: EmailJobId;
  retry: RetryPolicy;
  retention: RetentionPolicy;
};

/** Private ownership secret. Generate independently with at least 128 random bits (e.g. 16 bytes as base64url). */
export type LeaseToken = string;
export type OwnerFence = {
  readonly jobId: EmailJobId;
  readonly attemptId: EmailAttemptId;
  readonly token: LeaseToken;
};

export type LeaseGrant = { readonly grantedAt: UnixMs; readonly leaseEndsAt: UnixMs };
export type HandoffGrant = LeaseGrant & { readonly handoffAt: UnixMs };

/** Private worker view with a sensitive snapshot and ownership token; not a public result. */
export type ClaimedEmail = {
  readonly job: EmailJobSummary;
  readonly snapshot: EmailSnapshot;
  readonly fence: OwnerFence;
  readonly lease: LeaseGrant;
  readonly ordinal: number;
  readonly manual: boolean;
};

/** A full claim window of due, expired jobs may hide eligible work. The signal itself makes no write. */
export type StoreClaimNext<T = ClaimedEmail> = StoreNext<T> | { readonly status: 'expiry_maintenance_required' };

export type AttemptCommit = {
  readonly jobId: EmailJobId;
  readonly attemptId: EmailAttemptId;
  readonly ordinal: number;
  readonly operationId: string;
  readonly startedAt: UnixMs;
  readonly handedOffAt?: UnixMs;
  readonly finishedAt: UnixMs;
  readonly result: AttemptResult;
  readonly disposition: JobDisposition | 'retry_scheduled';
  readonly reason: AttemptReason | 'attempts_exhausted';
  readonly retryAt?: UnixMs;
};

export type ProjectionPermit = {
  readonly activity: EmailActivity;
  readonly digest: string;
  readonly permitUntil: UnixMs;
};
export type CleanupStep = 'payload_pruned' | 'retirement_started' | 'purged';

/**
 * Scoped atomic lifecycle operations, not generic CRUD. Enforce scope in every row operation and use store
 * time for durable guards. Do not report an unconfirmed write as a definite miss or fall back to memory.
 * See the installed README for the versioned adapter contracts and current follow-ups.
 */
export interface EmailStore {
  readonly smtpCapacity?: SmtpCapacity;
  /** Call before use. Of the bundled stores, only V1 memory allows skipping readiness for legacy callers. */
  ready(options?: CallOptions): Promise<void>;
  findAdmission(
    scope: EmailScope,
    key: EmailAdmissionKey,
    call: StoreCall,
  ): Promise<{ readonly job: EmailJobSummary; readonly fingerprint: string } | null>;
  /**
   * `duplicate` confirms a scoped admission-key collision; read the current winner and compare fingerprints.
   * On a miss, new SMTP inserts require leaf attachments (no `message/*` or `multipart/*`).
   */
  insert(
    scope: EmailScope,
    admission: StoreAdmission,
    call: StoreCall,
  ): Promise<{ readonly status: 'inserted'; readonly job: EmailJobSummary } | { readonly status: 'duplicate' }>;
  findJob(scope: EmailScope, jobId: EmailJobId, call: StoreCall): Promise<EmailJobSummary | null>;
  findAttempt(
    scope: EmailScope,
    jobId: EmailJobId,
    attemptId: EmailAttemptId,
    call: StoreCall,
  ): Promise<AttemptCommit | null>;
  /**
   * Claim within a bounded window. `expiry_maintenance_required` means every candidate slot was filled
   * by a confirmed expired queued job, not that more jobs necessarily exist. Run bounded `expireNext`
   * calls in the same scope (or run a worker with a positive `maintenanceLimit`), then retry.
   */
  claimNext(
    scope: EmailScope,
    claim: { attemptId: EmailAttemptId; token: LeaseToken; leaseMs: number },
    call: StoreCall,
  ): Promise<StoreClaimNext>;
  /** Null on a fenced operation is a definite miss, never a lost ACK. */
  renew(scope: EmailScope, fence: OwnerFence, leaseMs: number, call: StoreCall): Promise<LeaseGrant | null>;
  /** A timely positive ACK of this exact mutation is required to authorize submission. */
  markHandoff(scope: EmailScope, fence: OwnerFence, leaseMs: number, call: StoreCall): Promise<HandoffGrant | null>;
  /** Atomically commit the attempt and resulting job state. Retry only the exact same fenced finish. */
  finish(
    scope: EmailScope,
    finish: {
      fence: OwnerFence;
      phase: 'pre_handoff' | 'handed_off';
      operationId: string;
      result: AttemptResult;
    },
    call: StoreCall,
  ): Promise<AttemptCommit | null>;
  recoverNext(scope: EmailScope, call: StoreCall): Promise<StoreNext<AttemptCommit>>;
  expireNext(scope: EmailScope, call: StoreCall): Promise<StoreNext<EmailJobSummary>>;
  cancel(scope: EmailScope, jobId: EmailJobId, call: StoreCall): Promise<CancelResult>;
  resolveUnknown(scope: EmailScope, command: ResolveUnknownCommand, call: StoreCall): Promise<ResolveUnknownResult>;
  /** Nonexclusive, finite write window for the first pending attempt. Not a public capability or authorization token. */
  reserveProjection(scope: EmailScope, call: StoreCall): Promise<StoreNext<ProjectionPermit>>;
  putActivity(scope: EmailScope, permit: ProjectionPermit, call: StoreCall): Promise<'present' | 'permit_expired'>;
  ackProjection(
    scope: EmailScope,
    permit: ProjectionPermit,
    call: StoreCall,
  ): Promise<'acknowledged' | 'already_acknowledged' | 'stale'>;
  listActivities(scope: EmailScope, query: EmailActivityQuery, call: StoreCall): Promise<EmailActivityPage>;
  cleanupNext(scope: EmailScope, call: StoreCall): Promise<StoreNext<CleanupStep>>;
}

/** Settings for a single-process, non-durable development/test store. */
export type MemoryEmailStoreOptions = {
  /** Opt into the SMTP queue format. Assign a different namespace to each independent backing. */
  smtpCapacity?: SmtpCapacity;
  /** Store wall time governs transitions; elapsed time enforces call budgets. Defaults to system time. */
  clock?: EmailClock;
  /** Across all scopes: default 256, range 1–4,096 (SMTP opt-in: default 8, range 1–16). */
  maxJobs?: number;
};
