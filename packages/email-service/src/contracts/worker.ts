import type {
  AttachmentResolver,
  Awaitable,
  CallOptions,
  EmailAttemptId,
  EmailClock,
  EmailJobId,
  EmailScope,
  ProviderRef,
  SmtpCapacity,
} from './message';
import type { JobDisposition } from './job';
import type { AttemptReason, ConfiguredEmailProvider } from './provider';
import type { EmailStore } from './store';

/**
 * A shared limiter must enforce the actual quota across workers/processes; a worker limiter is instance-local.
 * A deferral consumes a claim without calling `submit`; `retryAfterMs` is a floor, not a wait in the run.
 */
export type EmailRateLimiter = {
  scope: 'worker' | 'shared';
  tryAcquire(request: {
    scope: EmailScope;
    provider: ProviderRef;
    signal: AbortSignal;
  }): Awaitable<{ status: 'granted' } | { status: 'deferred'; retryAfterMs: number }>;
};

export type EmailWorkerLimits = {
  maxConcurrency: number;
  storeTimeoutMs: number;
  leaseMs: number;
  preHandoffTimeoutMs: number;
  attachmentTimeoutMs: number;
  rateTimeoutMs: number;
  providerTimeoutMs: number;
  finalizeGraceMs: number;
};

export type EmailRunOptions = CallOptions & {
  limit?: number;
  concurrency?: number;
  /** Max steps for each of lease recovery and queued expiry before claims. Zero skips both sweeps. */
  maintenanceLimit?: number;
};

export type EmailRunEntry = {
  readonly operation: 'claim' | 'recover' | 'expire';
  readonly jobId: EmailJobId;
  readonly attemptId?: EmailAttemptId;
  /** `unconfirmed` does not prove rollback or non-submission. Read the current job for a durable `unknown`. */
  readonly status: JobDisposition | 'retry_scheduled' | 'unconfirmed';
  /**
   * `profile_unavailable` is terminal `failed`; the attempt did not submit.
   * Replaying the same command does not reopen the job.
   */
  readonly reason?: AttemptReason | 'attempts_exhausted';
  /** A recovery reporting `false` says nothing about whether the previous owner called the provider. */
  readonly providerInvoked: boolean;
};

export type MaintenanceStop = 'limit' | 'idle' | 'contended' | 'aborted' | 'deadline' | 'store_error';

/** This run's confirmed progress, not an inventory of the whole queue. */
export type EmailRunReport = {
  /**
   * On `expiry_maintenance_required`, schedule another run for the same scope with a positive
   * `maintenanceLimit` (the default does this). A backlog may need several bounded runs; retrying
   * with zero maintenance alone does not clear it. The stop does not prove live work is waiting.
   */
  readonly stop: MaintenanceStop | 'shutdown' | 'callback_capacity' | 'expiry_maintenance_required';
  readonly items: readonly EmailRunEntry[];
  readonly counts: {
    readonly claimed: number;
    readonly recovered: number;
    readonly expiredInSweep: number;
    readonly providerCalls: number;
    /** Full plus partial submission acceptance; not sandbox validation or inbox delivery. */
    readonly submitted: number;
    readonly retryScheduled: number;
    readonly accepted: number;
    readonly partiallyAccepted: number;
    readonly validated: number;
    readonly rejected: number;
    readonly unknown: number;
    readonly failed: number;
    readonly expired: number;
    readonly cancelled: number;
    readonly unconfirmed: number;
    readonly persistenceFailures: number;
  };
};

export type EmailShutdownReport = {
  readonly status: 'stopped' | 'deadline';
  readonly activeRun: boolean;
  readonly pendingCallbacks: number;
};

export interface EmailWorker {
  readonly scope: EmailScope;
  readonly smtpCapacity?: SmtpCapacity;
  /**
   * Do bounded work in this scope without filtering claims by provider profile.
   * The host schedules runs; only one run per instance may be active.
   */
  run(options?: EmailRunOptions): Promise<EmailRunReport>;
  /** Stop permanently. `stopped` means no active run or provider I/O, not remote recall. */
  shutdown(options?: Pick<CallOptions, 'timeoutMs'>): Promise<EmailShutdownReport>;
}

/**
 * Dependencies for a bounded worker. Workers sharing a queue and scope compete for jobs.
 * Install new profiles and their resolvers on every competing worker before producers use them,
 * and keep old ones until their work drains. The host must verify coverage across processes.
 * Fleets that cannot share configuration need separately routed scopes or queues.
 */
export type EmailWorkerOptions = {
  scope: EmailScope;
  /** Must match the store and every profile. Only live SMTP profiles are allowed with this option. */
  smtpCapacity?: SmtpCapacity;
  store: EmailStore;
  /**
   * Supply at least one configured profile; an empty array throws `invalid_config` at construction.
   * Profile keys must be unique within this worker. Every competing worker needs the exact kind,
   * key and mode of every active profile in its scope. Workers never substitute another profile.
   */
  providers: readonly ConfiguredEmailProvider[];
  /** Supply a resolver for every `resolverKey` used by work in this scope on each competing worker. */
  attachmentResolvers?: Readonly<Record<string, AttachmentResolver>>;
  rateLimiter?: EmailRateLimiter;
  clock?: EmailClock;
  limits?: Partial<EmailWorkerLimits>;
};
