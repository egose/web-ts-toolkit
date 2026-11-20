import type { EmailErrorCode } from '../errors';
import type { EmailJobSummary, RetentionPolicy, RetryPolicy } from './job';
import type { CallOptions, EmailScope, PreparedEmailCommand } from './message';
import type { EmailStore } from './store';
import type { EmailCommand, EmailTemplateRegistry, TemplateCommand, TemplateMap } from './template';
import type { EmailRunOptions, EmailRunReport, EmailWorker } from './worker';

export type AdmissionResult = { readonly status: 'enqueued' | 'replayed'; readonly job: EmailJobSummary };

export interface EmailService<T extends TemplateMap> {
  readonly scope: EmailScope;
  /** Admit or replay by scoped stable intent; a committed replay does not prepare again. */
  enqueue(command: EmailCommand<T>, options?: CallOptions): Promise<AdmissionResult>;
  /** Relay the same scoped outbox snapshot unchanged. Does not join a host transaction, rerender, or extend expiry. */
  enqueuePrepared(command: PreparedEmailCommand, options?: CallOptions): Promise<AdmissionResult>;
}

export type EmailServiceOptions<T extends TemplateMap> = {
  scope: EmailScope;
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

export interface EmailBatchService<T extends TemplateMap> {
  /**
   * Validate 1–100 items up front, then admit them in input order under one timeout (default 30 seconds).
   * Replay the same batch/item IDs and intent to resume; earlier writes aren't rolled back on a failure.
   */
  enqueueBatch(
    batch: { batchId: string; items: readonly EmailBatchItem<T>[] },
    options?: CallOptions,
  ): Promise<EmailBatchResult>;
  /** Run the same scope-wide worker, not a second delivery loop or a batch filter. */
  run(options?: EmailRunOptions): Promise<EmailRunReport>;
}

export type EmailBatchServiceOptions<T extends TemplateMap> = {
  /** Must share the worker's scope and underlying store. */
  service: EmailService<T>;
  worker: EmailWorker;
};
