import { randomBytes, randomUUID } from 'node:crypto';
import type { StoreCall } from './contracts/store';
import type { EmailRunEntry, EmailRunReport, EmailWorker, EmailWorkerOptions } from './contracts/worker';
import { createBudget, createBudgetUntil, monotonicNow, waitForAbort } from './internal/budget';
import { CallbackSlot } from './internal/callbacks';
import { capacityTag } from './internal/smtp-capacity';
import { readStoreNext } from './internal/store-codecs';
import { allowedErrorCode, invalid } from './internal/validation';
import { processClaim } from './internal/worker-attempt';
import { readRunOptions, readShutdownOptions, readWorkerConfig, type RunOptions } from './internal/worker-config';
import { readClaimed, readQueuedExpiry, readRecovery } from './internal/worker-evidence';
import { runReport, WorkerRun } from './internal/worker-run';

type QueueStop = 'idle' | 'limit' | 'contended' | 'expiry_maintenance_required' | 'callback_capacity';

async function sweep<T>(
  run: WorkerRun,
  limit: number,
  items: EmailRunEntry[],
  invoke: (call: StoreCall) => unknown,
  read: (value: unknown) => T,
  entry: (value: T) => EmailRunEntry,
): Promise<boolean> {
  for (let i = 0; i < limit && run.canLaunch(); i++) {
    try {
      const next = await run.callStore(run.budget, {
        effect: 'mutation',
        authorize: true,
        invoke,
        accept: (value) => readStoreNext(value, read),
      });
      if (next.status !== 'applied') return next.status === 'contended';
      items.push(Object.freeze(entry(next.value)));
    } catch {
      break; // The run gate accounts for store errors and stop signals.
    }
  }
  return false;
}

function claimNext(run: WorkerRun) {
  const { clock, scope, store, limits, capacity } = run.config;
  const request = Object.freeze({
    attemptId: randomUUID(),
    token: randomBytes(16).toString('base64url'),
    leaseMs: limits.leaseMs,
  });
  let dispatchedAt: number;
  return run.callStore(run.budget, {
    effect: 'mutation',
    authorize: true,
    maxMs: limits.preHandoffTimeoutMs,
    invoke(call, start) {
      dispatchedAt = start;
      return store.claimNext(scope, request, call);
    },
    accept: (value) =>
      readStoreNext(
        value,
        (raw) => {
          const claim = readClaimed(raw, scope, request, capacity);
          return { claim, dispatchedAt, confirmedAt: monotonicNow(clock) };
        },
        'claim',
      ),
  });
}

/** One claim coordinator, with at most `concurrency` active items and at most `maxConcurrency` held slots. */
async function drainClaims(
  run: WorkerRun,
  options: RunOptions,
  items: EmailRunEntry[],
  slots: Set<CallbackSlot>,
): Promise<QueueStop> {
  const tasks: Promise<void>[] = [];
  let active = 0;
  let settled: (() => void) | undefined;
  let failed = false;
  let stop: QueueStop = 'idle';
  try {
    while (run.canLaunch() && !failed) {
      if (tasks.length === options.limit) {
        stop = 'limit';
        break;
      }
      if (active === options.concurrency || slots.size >= run.config.limits.maxConcurrency) {
        if (!active) {
          stop = 'callback_capacity';
          break;
        }
        await new Promise<void>((resolve) => {
          settled = resolve;
        });
        continue;
      }
      const slot = new CallbackSlot(() => slots.delete(slot));
      slots.add(slot);
      let next: Awaited<ReturnType<typeof claimNext>>;
      try {
        next = await claimNext(run);
      } catch {
        slot.close();
        break;
      }
      if (next.status !== 'applied') {
        slot.close();
        stop = next.status === 'none' ? 'idle' : next.status;
        break;
      }
      const { claim } = next.value;
      const index = items.length;
      items.push(
        Object.freeze({
          operation: 'claim',
          jobId: claim.fence.jobId,
          attemptId: claim.fence.attemptId,
          providerInvoked: false,
          status: 'unconfirmed',
        }),
      );
      active++;
      tasks.push(
        processClaim(run, claim, next.value, slot)
          .then(
            (entry) => {
              items[index] = entry;
            },
            () => {
              failed = true;
            },
          )
          .finally(() => {
            slot.close();
            active--;
            const wake = settled;
            settled = undefined;
            wake?.();
          }),
      );
    }
  } finally {
    // Even a nonconforming transport or store must settle before this run is no longer active.
    await Promise.all(tasks);
  }
  if (failed) invalid('invalid_config');
  return stop;
}

async function runQueue(run: WorkerRun, options: RunOptions, slots: Set<CallbackSlot>, shutdown: AbortSignal) {
  const items: EmailRunEntry[] = [];
  const { scope, store, capacity } = run.config;
  const contended =
    (await sweep(
      run,
      options.maintenanceLimit,
      items,
      (call) => store.recoverNext(scope, call),
      (value) => readRecovery(value, capacity),
      (commit) => ({
        operation: 'recover',
        jobId: commit.jobId,
        attemptId: commit.attemptId,
        status: commit.disposition,
        reason: commit.reason,
        providerInvoked: false,
      }),
    )) ||
    (await sweep(
      run,
      options.maintenanceLimit,
      items,
      (call) => store.expireNext(scope, call),
      (value) => readQueuedExpiry(value, scope, capacity),
      (job) => ({
        operation: 'expire',
        jobId: job.jobId,
        status: 'expired',
        reason: 'expired',
        providerInvoked: false,
      }),
    ));
  const queueStop = contended ? 'contended' : await drainClaims(run, options, items, slots);
  const timeLeft = run.budget.remainingMs(); // Observe the deadline even if the timer has not fired.
  let stop: EmailRunReport['stop'];
  if (shutdown.aborted) stop = 'shutdown';
  else if (options.signal?.aborted) stop = 'aborted';
  else if (allowedErrorCode(run.budget.signal.reason, ['deadline'])) stop = 'deadline';
  else if (run.persistenceFailures) stop = 'store_error';
  else if (run.budget.signal.aborted) return invalid('invalid_config');
  else if (queueStop === 'contended' || queueStop === 'expiry_maintenance_required') stop = queueStop;
  else if (slots.size === run.config.limits.maxConcurrency) stop = 'callback_capacity';
  else if (queueStop === 'idle' && timeLeft < 1)
    stop = 'deadline'; // No positive integer RPC budget remains.
  else stop = queueStop;
  return runReport(stop, items, run.persistenceFailures);
}

/**
 * Create a scope-bound worker for a caller-ready store and exact provider profiles. The host schedules
 * bounded `run` calls; nothing polls on construction. `shutdown` is permanent and never closes the store.
 * A one-shot provider call requires a timely durable handoff acknowledgement, not a later read of a marker.
 * An empty provider array throws `invalid_config` before any work. For enqueue-only batches,
 * use `createEmailBatchAdmission({ service })` instead of constructing a worker.
 */
export function createEmailWorker(options: EmailWorkerOptions): EmailWorker {
  const config = readWorkerConfig(options);
  const { clock, scope, limits, capacity } = config;
  const shutdown = new AbortController();
  const slots = new Set<CallbackSlot>();
  let active: AbortController | undefined;
  const worker: EmailWorker = {
    scope,
    ...capacityTag(capacity),
    async run(options = {}) {
      if (shutdown.signal.aborted) invalid('closed');
      if (active) invalid('busy');
      const settings = readRunOptions(options, limits, capacity);
      const done = new AbortController();
      active = done;
      try {
        const signal = settings.signal ? AbortSignal.any([settings.signal, shutdown.signal]) : shutdown.signal;
        const budget = createBudget(clock, settings.timeoutMs, signal);
        try {
          return await runQueue(new WorkerRun(config, budget), settings, slots, shutdown.signal);
        } finally {
          budget.close();
        }
      } finally {
        active = undefined;
        done.abort();
      }
    },
    async shutdown(options = {}) {
      const { timeoutMs } = readShutdownOptions(options);
      const done = active;
      let end: number | undefined;
      try {
        if (done) end = monotonicNow(clock) + timeoutMs;
      } finally {
        shutdown.abort();
      }
      if (done && end !== undefined) {
        const wait = createBudgetUntil(clock, end, done.signal);
        try {
          await waitForAbort(wait.signal);
        } finally {
          wait.close();
        }
      }
      return Object.freeze({
        status: active ? 'deadline' : 'stopped',
        activeRun: active !== undefined,
        pendingCallbacks: [...slots].reduce((sum, slot) => sum + slot.pending, 0),
      });
    },
  };
  return Object.freeze(worker);
}
