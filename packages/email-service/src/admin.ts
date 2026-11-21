import { ADMIN_MAINTENANCE_LIMIT, CALL_BUDGETS, MAX_OBSERVER_PENDING, STORE_PRIMITIVE_TIMEOUT_MS } from './constants';
import type { EmailActivity, EmailAdmin, EmailAdminOptions, MaintenanceOptions } from './contracts/admin';
import type { EmailClock } from './contracts/message';
import type { EmailStore, StoreCall } from './contracts/store';
import type { MaintenanceStop } from './contracts/worker';
import {
  activityQuery,
  readActivityCriteria,
  readActivityPage,
  readProjectionPermit,
} from './internal/activity-codecs';
import { createBudget, readCallOptions, systemEmailClock, type OperationBudget } from './internal/budget';
import { bindMethod, CallbackSlot, pendingCallback, requireCallback } from './internal/callbacks';
import { readJobSummary } from './internal/job-summary';
import { assertPortCapacity, readCapacityOption } from './internal/smtp-capacity';
import { runStoreCall } from './internal/store-call';
import { readResolution, readStoreId, readStoreNext } from './internal/store-codecs';
import { allowedErrorCode, boundedOption, invalid, readRecord, scopeToken } from './internal/validation';

const CONFIG = 'invalid_config';
const STORED = 'store_incompatible';
const STOP_CODES = ['aborted', 'deadline', CONFIG] as const;
const RESOLUTION_REJECTIONS = ['not_found', 'resolution_conflict', 'expired'] as const;
const CLEANUP_COUNTERS = {
  payload_pruned: 'payloadsPruned',
  retirement_started: 'retirementsStarted',
  purged: 'jobsPurged',
} as const;

type StoreOperation<T> = Omit<Parameters<typeof runStoreCall<T>>[2], 'maxMs'>;
type StepStop = Extract<MaintenanceStop, 'idle' | 'contended'>;

/**
 * Inspect and maintain redacted history in one scope on a caller-ready store. The host authorizes requests
 * and schedules maintenance. No admin operation submits mail; explicit redrive only requeues an eligible
 * unknown job for a future worker run and can duplicate a previously accepted submission.
 */
export function createEmailAdmin(options: EmailAdminOptions): EmailAdmin {
  return createEmailAdminWithClock(options, systemEmailClock);
}

/** Internal elapsed clock seam; the store clock still governs all transitions and permit expiry. */
export function createEmailAdminWithClock(options: EmailAdminOptions, clock: EmailClock): EmailAdmin {
  const raw = readRecord(options, ['scope', 'store'], ['onActivity', 'smtpCapacity'], CONFIG);
  const { scope: input, store, onActivity: callback } = raw;
  const capacity = readCapacityOption(raw);
  assertPortCapacity(store, capacity);
  const scope = scopeToken(input, CONFIG);
  const findJob = bindMethod<EmailStore['findJob']>(store, 'findJob');
  const cancel = bindMethod<EmailStore['cancel']>(store, 'cancel');
  const resolveUnknown = bindMethod<EmailStore['resolveUnknown']>(store, 'resolveUnknown');
  const listActivities = bindMethod<EmailStore['listActivities']>(store, 'listActivities');
  const reserve = bindMethod<EmailStore['reserveProjection']>(store, 'reserveProjection');
  const put = bindMethod<EmailStore['putActivity']>(store, 'putActivity');
  const ack = bindMethod<EmailStore['ackProjection']>(store, 'ackProjection');
  const cleanupNext = bindMethod<EmailStore['cleanupNext']>(store, 'cleanupNext');
  const onActivity =
    callback === undefined ? undefined : (requireCallback(callback) as (activity: EmailActivity) => unknown);
  let observers = 0;
  let active = false;

  function observe(activity: EmailActivity, counts: { observerStarted: number; observerSkipped: number }) {
    if (!onActivity) return;
    if (observers >= MAX_OBSERVER_PENDING) {
      counts.observerSkipped++;
      return;
    }
    observers++;
    counts.observerStarted++;
    const slot = new CallbackSlot(() => observers--);
    try {
      const pending = pendingCallback(onActivity(activity));
      if (pending) slot.hold(pending);
    } catch {
      // Best effort, with no wait, retry or application error/diagnostic forwarding.
    } finally {
      slot.close();
    }
  }

  function readJob(jobId: string, value: unknown) {
    const job = readJobSummary(scope, value, capacity);
    if (job.jobId !== jobId) invalid(STORED);
    return job;
  }

  function callStore<T>(budget: OperationBudget, operation: StoreOperation<T>): Promise<T> {
    return runStoreCall(clock, budget, { ...operation, maxMs: STORE_PRIMITIVE_TIMEOUT_MS, capacity });
  }

  function write<T>(budget: OperationBudget, invoke: (call: StoreCall) => unknown, accept: (value: unknown) => T) {
    return callStore(budget, { effect: 'mutation', invoke, accept });
  }

  async function inOperation<T>(
    options: unknown,
    run: (budget: OperationBudget, signal: AbortSignal | undefined) => Promise<T>,
  ): Promise<T> {
    if (capacity && active) invalid('busy');
    active = true;
    try {
      const { timeoutMs, signal: source } = readCallOptions(options, CALL_BUDGETS.admissionOrAdmin);
      // Read cancellation from a native dependent signal, not caller-overridable properties.
      const signal = source && AbortSignal.any([source]);
      const budget = createBudget(clock, timeoutMs, signal);
      try {
        return await run(budget, signal);
      } finally {
        budget.close();
      }
    } finally {
      active = false;
    }
  }

  async function maintain(
    options: MaintenanceOptions,
    step: (budget: OperationBudget) => Promise<StepStop | undefined>,
  ) {
    const { limit: input, ...call } = readRecord(options, [], ['limit', 'signal', 'timeoutMs'], CONFIG);
    const limit = boundedOption(input, capacity?.limits.adminMaintenance ?? ADMIN_MAINTENANCE_LIMIT);
    return inOperation(call, async (budget, signal) => {
      let stop: MaintenanceStop = 'limit';
      for (let i = 0; i < limit; i++) {
        try {
          const next = await step(budget);
          if (!next) continue;
          stop = next;
        } catch (error) {
          // runStoreCall classifies a stopped, invoked mutation without usable evidence as unconfirmed.
          const code = allowedErrorCode(error, STOP_CODES);
          if (code === CONFIG) invalid(code);
          stop = code ?? 'store_error';
        }
        break;
      }
      const persistenceFailures = Number(stop === 'store_error');
      budget.remainingMs();
      const interrupted = allowedErrorCode(budget.signal.reason, STOP_CODES);
      if (interrupted === CONFIG) invalid(interrupted);
      if (signal?.aborted) stop = 'aborted';
      else if (interrupted) stop = interrupted;
      return { stop, persistenceFailures };
    });
  }

  const admin: EmailAdmin = {
    scope,
    getJob(jobId, options = {}) {
      return inOperation(options, (budget) => {
        const id = readStoreId(jobId);
        return callStore(budget, {
          effect: 'read',
          invoke: (call) => findJob(scope, id, call),
          accept: (value) => (value === null ? null : readJob(id, value)),
        });
      });
    },
    cancel(jobId, options = {}) {
      return inOperation(options, (budget) => {
        const id = readStoreId(jobId);
        return write(
          budget,
          (call) => cancel(scope, id, call),
          (value) => {
            const raw = readRecord(value, ['status'], ['job'], STORED);
            const { status } = raw;
            if (status === 'not_found' && !Object.hasOwn(raw, 'job')) return Object.freeze({ status });
            if (status !== 'cancelled' && status !== 'too_late') invalid(STORED);
            const job = readJob(id, raw.job);
            if ((status === 'cancelled') !== (job.state === 'terminal' && job.disposition === 'cancelled')) {
              invalid(STORED);
            }
            return Object.freeze({ status, job });
          },
        );
      });
    },
    resolveUnknown(command, options = {}) {
      return inOperation(options, (budget) => {
        const request = readResolution(command);
        return callStore(budget, {
          effect: 'mutation',
          definite: RESOLUTION_REJECTIONS,
          invoke: (call) => resolveUnknown(scope, request, call),
          accept(value) {
            const { status, job: raw } = readRecord(value, ['status', 'job'], [], STORED);
            const job = readJob(request.jobId, raw);
            const decision = job.resolutions.find(({ attemptId }) => attemptId === request.attemptId);
            if (decision?.action !== request.action || (status !== 'resolved' && status !== 'replayed')) {
              invalid(STORED);
            }
            if (
              status === 'resolved' &&
              (job.unknownOpen ||
                job.latestAttempt?.attemptId !== request.attemptId ||
                job.latestAttempt.outcome !== 'unknown' ||
                job.updatedAt !== decision.at ||
                (decision.action === 'redrive'
                  ? job.state !== 'queued' || job.nextAt !== decision.at
                  : job.state !== 'terminal' || job.disposition !== 'unknown'))
            ) {
              invalid(STORED);
            }
            return Object.freeze({ status, job });
          },
        });
      });
    },
    listActivities(query = {}, options = {}) {
      return inOperation(options, (budget) => {
        const criteria = readActivityCriteria(scope, query, capacity);
        const request = activityQuery(criteria);
        return callStore(budget, {
          effect: 'read',
          invoke: (call) => listActivities(scope, request, call),
          accept: (value) => readActivityPage(criteria, value),
        });
      });
    },
    async reconcile(options = {}) {
      const counts = { reserved: 0, acknowledged: 0, permitsExpired: 0, observerStarted: 0, observerSkipped: 0 };
      const report = await maintain(options, async (budget) => {
        const next = await write(
          budget,
          (call) => reserve(scope, call),
          (value) => readStoreNext(value, (permit) => readProjectionPermit(scope, permit, capacity)),
        );
        if (next.status !== 'applied') return next.status === 'none' ? 'idle' : 'contended';
        counts.reserved++;
        const permit = next.value;
        const present = await write(
          budget,
          (call) => put(scope, permit, call),
          (value) => readStatus(value, ['present', 'permit_expired']),
        );
        if (present === 'permit_expired') {
          counts.permitsExpired++;
          return;
        }
        const confirmed = await write(
          budget,
          (call) => ack(scope, permit, call),
          (value) => readStatus(value, ['acknowledged', 'already_acknowledged', 'stale']),
        );
        if (confirmed === 'stale') return 'contended';
        counts.acknowledged++;
        // Concurrent projectors can confirm the same ACK; only the newly confirmed write can notify.
        if (confirmed === 'acknowledged' && budget.remainingMs() > 0) observe(permit.activity, counts);
      });
      return Object.freeze({ ...report, ...counts });
    },
    async cleanup(options = {}) {
      const counts = { payloadsPruned: 0, retirementsStarted: 0, jobsPurged: 0 };
      const report = await maintain(options, async (budget) => {
        const next = await write(
          budget,
          (call) => cleanupNext(scope, call),
          (value) =>
            readStoreNext(value, (step) => readStatus(step, ['payload_pruned', 'retirement_started', 'purged'])),
        );
        if (next.status !== 'applied') return next.status === 'none' ? 'idle' : 'contended';
        counts[CLEANUP_COUNTERS[next.value]]++;
      });
      return Object.freeze({ ...report, ...counts });
    },
  };
  return Object.freeze(admin);
}

function readStatus<const T extends string>(value: unknown, allowed: readonly T[]): T {
  return allowed.find((status) => status === value) ?? invalid(STORED);
}
