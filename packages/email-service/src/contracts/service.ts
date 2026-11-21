import type { EmailErrorCode } from '../errors';
import type { EmailJobSummary, RetentionPolicy, RetryPolicy } from './job';
import type { CallOptions, EmailScope, PreparedEmailCommand, SmtpCapacity } from './message';
import type { EmailStore } from './store';
import type { EmailCommand, EmailTemplateRegistry, TemplateCommand, TemplateMap } from './template';
import type { EmailRunOptions, EmailRunReport, EmailWorker } from './worker';

export type AdmissionResult = { readonly status: 'enqueued' | 'replayed'; readonly job: EmailJobSummary };

/** Prepared-only admission. The relay does not need a template registry or delivery configuration. */
export interface EmailRelay {
  /**
   * Relay the same scoped outbox snapshot unchanged. Does not join a host transaction, rerender, or extend expiry.
   * A retained match replays; on a new admission SMTP `message/*` and `multipart/*` refs fail with `invalid_snapshot`.
   */
  enqueuePrepared(command: PreparedEmailCommand, options?: CallOptions): Promise<AdmissionResult>;
}

export type EmailRelayOptions = {
  /** The original scope of the staged command. */
  scope: EmailScope;
  /** Pass the exact store binding explicitly when relaying to an opted-in queue. */
  smtpCapacity?: SmtpCapacity;
  /** Admission primitives only. Ready the underlying store before use. */
  store: Pick<EmailStore, 'smtpCapacity' | 'findAdmission' | 'insert'>;
  retry?: Partial<RetryPolicy>;
  retention?: Partial<RetentionPolicy>;
};

export interface EmailService<T extends TemplateMap> extends EmailRelay {
  readonly scope: EmailScope;
  readonly smtpCapacity?: SmtpCapacity;
  /** Admit or replay by scoped stable intent; a committed replay does not prepare again. */
  enqueue(command: EmailCommand<T>, options?: CallOptions): Promise<AdmissionResult>;
}

export type EmailServiceOptions<T extends TemplateMap> = {
  scope: EmailScope;
  /** Must match the registry and store. Relay staged commands only through their original binding. */
  smtpCapacity?: SmtpCapacity;
  store: EmailStore;
  registry: EmailTemplateRegistry<T>;
  retry?: Partial<RetryPolicy>;
  retention?: Partial<RetentionPolicy>;
};

export type EmailBatchItem<T extends TemplateMap> = { itemId: string; command: TemplateCommand<T> };

export type EmailBatchResult = {
  readonly batchId: string;
  readonly items: readonly (
    | ({ readonly itemId: string } & AdmissionResult)
    | { readonly itemId: string; readonly status: 'failed'; readonly code: EmailErrorCode }
    | { readonly itemId: string; readonly status: 'not_started' }
  )[];
  readonly counts: {
    readonly enqueued: number;
    readonly replayed: number;
    readonly failed: number;
    readonly notStarted: number;
    readonly persistenceFailures: number;
  };
};

/** Producer-only batch admission; no worker or delivery methods. */
export interface EmailBatchAdmission<T extends TemplateMap> {
  /**
   * Validate 1–100 items up front, then admit them in input order under one timeout (default 30 seconds).
   * Replay the same batch/item IDs and intent to resume; earlier writes aren't rolled back on a failure.
   */
  enqueueBatch(
    batch: { batchId: string; items: readonly EmailBatchItem<T>[] },
    options?: CallOptions,
  ): Promise<EmailBatchResult>;
}

export type EmailBatchAdmissionOptions<T extends TemplateMap> = {
  /** Bound admission service or wrapper. A wrapper must honor the call's signal and timeout. */
  service: Pick<EmailService<T>, 'scope' | 'smtpCapacity' | 'enqueue'>;
  /** Pass the exact tuple explicitly when the service is opted in. */
  smtpCapacity?: SmtpCapacity;
};

export interface EmailBatchService<T extends TemplateMap> extends EmailBatchAdmission<T> {
  /** Run the same scope-wide worker, not a second delivery loop or a batch filter. */
  run(options?: EmailRunOptions): Promise<EmailRunReport>;
}

export type EmailBatchServiceOptions<T extends TemplateMap> = {
  /** Must share the worker's scope, underlying store and SMTP capacity binding, if enabled. */
  service: EmailService<T>;
  worker: EmailWorker;
  /** Pass the exact tuple explicitly when the service and worker are opted in. */
  smtpCapacity?: SmtpCapacity;
};
