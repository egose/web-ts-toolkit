import { STORE_PRIMITIVE_TIMEOUT_MS } from '../constants';
import type { EmailRunEntry, EmailRunReport } from '../contracts/worker';
import type { OperationBudget } from './budget';
import { runStoreCall } from './store-call';
import { invalid } from './validation';
import type { WorkerConfig } from './worker-config';

type StoreOperation<T> = Parameters<typeof runStoreCall<T>>[2];

/** A failure closes the launch gate, not an already invoked provider's I/O budget. */
export class WorkerRun {
  readonly #noLaunch = new AbortController();
  #persistenceFailures = 0;

  constructor(
    readonly config: WorkerConfig,
    readonly budget: OperationBudget,
  ) {}

  get noLaunch(): AbortSignal {
    return this.#noLaunch.signal;
  }

  get persistenceFailures(): number {
    return this.#persistenceFailures;
  }

  canLaunch(): boolean {
    return this.budget.remainingMs() >= 1 && !this.noLaunch.aborted;
  }

  checkLaunch(): void {
    this.budget.check();
    if (this.noLaunch.aborted) invalid('aborted');
  }

  callStore<T>(
    budget: OperationBudget,
    operation: Omit<StoreOperation<T>, 'maxMs' | 'onError'> & { maxMs?: number; authorize?: true },
  ): Promise<T> {
    const { clock, limits, capacity } = this.config;
    let invoked = false;
    return runStoreCall(clock, budget, {
      ...operation,
      capacity,
      maxMs: Math.min(
        operation.maxMs ?? limits.storeTimeoutMs,
        limits.storeTimeoutMs,
        capacity ? STORE_PRIMITIVE_TIMEOUT_MS : Infinity,
      ),
      beforeInvoke: () => {
        if (operation.authorize) this.checkLaunch();
        operation.beforeInvoke?.();
      },
      invoke: (call, dispatchedAt) => {
        invoked = true;
        return operation.invoke(call, dispatchedAt);
      },
      onError: () => {
        if (!invoked) return;
        this.#persistenceFailures++;
        this.#noLaunch.abort();
      },
    });
  }
}

const statuses = {
  retry_scheduled: 'retryScheduled',
  accepted: 'accepted',
  partially_accepted: 'partiallyAccepted',
  validated: 'validated',
  rejected: 'rejected',
  unknown: 'unknown',
  failed: 'failed',
  expired: 'expired',
  cancelled: 'cancelled',
  unconfirmed: 'unconfirmed',
} as const satisfies Record<EmailRunEntry['status'], keyof EmailRunReport['counts']>;

export function runReport(
  stop: EmailRunReport['stop'],
  items: EmailRunEntry[],
  persistenceFailures: number,
): EmailRunReport {
  const counts = {
    claimed: 0,
    recovered: 0,
    expiredInSweep: 0,
    providerCalls: 0,
    submitted: 0,
    retryScheduled: 0,
    accepted: 0,
    partiallyAccepted: 0,
    validated: 0,
    rejected: 0,
    unknown: 0,
    failed: 0,
    expired: 0,
    cancelled: 0,
    unconfirmed: 0,
    persistenceFailures,
  };
  for (const item of items) {
    if (item.operation === 'claim') counts.claimed++;
    else if (item.operation === 'recover') counts.recovered++;
    else counts.expiredInSweep++;
    counts[statuses[item.status]]++;
    if (item.providerInvoked) counts.providerCalls++;
  }
  counts.submitted = counts.accepted + counts.partiallyAccepted;
  return Object.freeze({ stop, items: Object.freeze(items), counts: Object.freeze(counts) });
}
