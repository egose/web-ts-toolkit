import type {
  AttachmentResolver,
  Awaitable,
  CallOptions,
  EmailAttemptId,
  EmailClock,
  EmailJobId,
  EmailScope,
  ProviderRef,
} from './message';
import type { JobDisposition } from './job';
import type { AttemptReason, ConfiguredEmailProvider } from './provider';
import type { EmailStore } from './store';

/** A shared limiter must enforce the actual quota across workers/processes; a worker limiter is instance-local. */
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

export type EmailRunOptions = CallOptions & { limit?: number; concurrency?: number; maintenanceLimit?: number };

export type EmailRunEntry = {
  readonly operation: 'claim' | 'recover' | 'expire';
  readonly jobId: EmailJobId;
  readonly attemptId?: EmailAttemptId;
  readonly status: JobDisposition | 'retry_scheduled' | 'unconfirmed';
  readonly reason?: AttemptReason | 'attempts_exhausted';
  readonly providerInvoked: boolean;
};

export type MaintenanceStop = 'limit' | 'idle' | 'contended' | 'aborted' | 'deadline' | 'store_error';

/** This run's confirmed progress, not an inventory of the whole queue. */
export type EmailRunReport = {
  readonly stop: MaintenanceStop | 'shutdown' | 'callback_capacity';
  readonly items: readonly EmailRunEntry[];
  readonly counts: {
    readonly claimed: number;
    readonly recovered: number;
    readonly expiredInSweep: number;
    readonly providerCalls: number;
    /** Full plus partial acceptance; sandbox validations do not count. */
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
  /** Do bounded work in this scope. The host schedules runs; only one run per instance may be active. */
  run(options?: EmailRunOptions): Promise<EmailRunReport>;
  /** Stop permanently. `stopped` means no active run or provider I/O, not remote recall. */
  shutdown(options?: Pick<CallOptions, 'timeoutMs'>): Promise<EmailShutdownReport>;
}

/** Dependencies for a bounded worker; provider profile keys must be unique. */
export type EmailWorkerOptions = {
  scope: EmailScope;
  store: EmailStore;
  providers: readonly ConfiguredEmailProvider[];
  attachmentResolvers?: Readonly<Record<string, AttachmentResolver>>;
  rateLimiter?: EmailRateLimiter;
  clock?: EmailClock;
  limits?: Partial<EmailWorkerLimits>;
};
