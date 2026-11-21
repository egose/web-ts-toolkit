import { randomUUID } from 'node:crypto';
import {
  CALL_BUDGETS,
  MAX_STORE_CANDIDATES,
  MAX_STORE_CAS_SUBMISSIONS,
  MEMORY_MAX_JOBS,
  STORE_PRIMITIVE_TIMEOUT_MS,
} from '../constants';
import type { EmailStore, MemoryEmailStoreOptions, StoreCall, StoreNext } from '../contracts/store';
import {
  activityPage,
  compareActivity,
  compareAscii,
  readActivityCriteria,
  readProjectionPermit,
  type StoredActivity,
} from '../internal/activity-codecs';
import { readCallOptions, readClock } from '../internal/budget';
import { encodeAdmissionKey, validateAdmissionKey } from '../internal/command-codecs';
import { copyCommit, jobSelectors, jobSummary, type JobRecord } from '../internal/job-record';
import {
  acknowledgeJobProjection,
  cancelJob,
  claimJob,
  cleanupJob,
  decideActivityPut,
  expireJob,
  finishJob,
  markJob,
  newJob,
  recoverJob,
  renewJob,
  reserveJobProjection,
  resolveJob,
  type DecisionTime,
  type JobDecision,
} from '../internal/job-transitions';
import { capacityTag, readCapacityOption } from '../internal/smtp-capacity';
import {
  readClaim,
  readFence,
  readFinish,
  readLeaseMs,
  readResolution,
  readStoreAdmission,
  readStoreCall,
  readStoreId,
} from '../internal/store-codecs';
import { boundedOption, invalid, readRecord, scopeToken, unixMs } from '../internal/validation';

const dueKeys = ['nextAt', 'queuedExpiresAt', 'leaseEndsAt', 'pendingAt', 'nextCleanupAt'] as const;
type DueKey = (typeof dueKeys)[number];
type Due = Readonly<{ at: number; priority: number; jobId: string }>;
type JobActivities = { byId: Map<string, StoredActivity>; ordered: StoredActivity[] };
type ScopeRows = {
  jobs: Map<string, JobRecord>;
  identities: Map<string, string>;
  due: Record<DueKey, Due[]>;
  activities: StoredActivity[];
  byJob: Map<string, JobActivities>;
};

function emptyScope(): ScopeRows {
  return {
    jobs: new Map(),
    identities: new Map(),
    due: { nextAt: [], queuedExpiresAt: [], leaseEndsAt: [], pendingAt: [], nextCleanupAt: [] },
    activities: [],
    byJob: new Map(),
  };
}

function lowerBound<T>(ordered: readonly T[], test: (value: T) => boolean): number {
  let lo = 0;
  let hi = ordered.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (test(ordered[mid]!)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

function compareDue(a: Due, b: Due): number {
  return a.at - b.at || b.priority - a.priority || compareAscii(a.jobId, b.jobId);
}

function reindex(rows: ScopeRows, previous: JobRecord | undefined, next: JobRecord | undefined): void {
  const oldKeys = previous && jobSelectors(previous);
  const newKeys = next && jobSelectors(next);
  for (const key of dueKeys) {
    const oldAt = oldKeys?.[key];
    const newAt = newKeys?.[key];
    if (oldAt === newAt) continue;
    const index = rows.due[key];
    if (previous && oldAt !== undefined) {
      const entry = { at: oldAt, jobId: previous.jobId, priority: key === 'nextAt' ? previous.priority : 0 };
      index.splice(
        lowerBound(index, (candidate) => compareDue(candidate, entry) >= 0),
        1,
      );
    }
    if (next && newAt !== undefined) {
      const entry = { at: newAt, jobId: next.jobId, priority: key === 'nextAt' ? next.priority : 0 };
      index.splice(
        lowerBound(index, (candidate) => compareDue(candidate, entry) >= 0),
        0,
        entry,
      );
    }
  }
}

function putRow(rows: ScopeRows, stored: StoredActivity): void {
  const { jobId, attemptId } = stored.activity;
  let job = rows.byJob.get(jobId);
  if (!job) {
    job = { byId: new Map(), ordered: [] };
    rows.byJob.set(jobId, job);
  }
  job.byId.set(attemptId, stored);
  const index = (candidate: StoredActivity) => compareActivity(candidate.activity, stored.activity) >= 0;
  job.ordered.splice(lowerBound(job.ordered, index), 0, stored);
  rows.activities.splice(lowerBound(rows.activities, index), 0, stored);
}

function removeActivities(rows: ScopeRows, jobId: string, attemptIds: readonly string[]): void {
  const job = rows.byJob.get(jobId);
  if (!job) return;
  for (const attemptId of attemptIds) {
    const activity = job.byId.get(attemptId)?.activity;
    if (!activity) continue;
    const i = lowerBound(rows.activities, (candidate) => compareActivity(candidate.activity, activity) >= 0);
    rows.activities.splice(i, 1);
  }
  rows.byJob.delete(jobId);
}

const TIME_MISS = Symbol('time_miss');
const NONE = Object.freeze({ status: 'none' } as const);
const CONTENDED = Object.freeze({ status: 'contended' } as const);

/**
 * Single-process store for tests and development. State is lost on restart and is not shared across
 * instances or processes. Capacity is global across scopes; it never evicts a protected job or acts as
 * a fallback for another store. Uses the injected clock's wall time for store guards.
 */
export function createMemoryEmailStore(options: MemoryEmailStoreOptions = {}): EmailStore {
  const config = readRecord(options, [], ['clock', 'maxJobs', 'smtpCapacity'], 'invalid_config');
  const capacity = readCapacityOption(config);
  const clock = readClock(config.clock);
  const maxJobs = boundedOption(config.maxJobs, capacity?.limits.memoryJobs ?? MEMORY_MAX_JOBS);
  const scopes = new Map<string, ScopeRows>();
  let count = 0;
  let active = false;
  let ready = false;
  let lastWall = 0;

  function wallNow(): number {
    let now: number;
    try {
      now = unixMs(clock.now(), 'store_unavailable');
    } catch {
      return invalid('store_unavailable');
    }
    if (now < lastWall) invalid('store_unavailable');
    lastWall = now;
    return now;
  }

  function elapsedClock(): number {
    try {
      const now = clock.monotonicNow();
      if (Number.isFinite(now)) return now;
    } catch {
      invalid('store_unavailable');
    }
    return invalid('store_unavailable');
  }

  function atomic<T>(call: { signal?: AbortSignal; timeoutMs: number }, run: (check: () => void) => T): T {
    // All validation/decision/write steps are synchronous. A trusted injected clock may call back into
    // the store; even that cannot interleave a transition. No sleep/timer is needed for this adapter.
    if (active) invalid('busy');
    active = true;
    try {
      const signal = call.signal;
      if (signal && Reflect.get(AbortSignal.prototype, 'aborted', signal)) invalid('aborted');
      const start = elapsedClock();
      const check = () => {
        const elapsed = elapsedClock() - start;
        if (signal && Reflect.get(AbortSignal.prototype, 'aborted', signal)) invalid('aborted');
        if (elapsed < 0) invalid('store_unavailable');
        if (elapsed >= call.timeoutMs) invalid('deadline');
      };
      check();
      return run(check);
    } finally {
      active = false;
    }
  }

  function primitive<T>(call: StoreCall, worker: boolean, run: (check: () => void) => T): T {
    const safe = readStoreCall(call, worker, capacity);
    if (capacity && !ready) invalid('store_unavailable');
    return atomic(safe, run);
  }

  function read<T>(call: StoreCall, worker: boolean, get: () => T): T {
    return primitive(call, worker, (check) => {
      const value = get();
      check();
      return value;
    });
  }

  function apply<T>(rows: ScopeRows, row: JobRecord, plan: JobDecision<T> | null, check: () => void) {
    check();
    if (!plan) return null;
    const { write } = plan;
    if (write) {
      const now = wallNow();
      check();
      if (now < write.guard.atOrAfter || (write.guard.before !== undefined && now >= write.guard.before))
        return TIME_MISS;
      if (write.kind === 'replace') {
        reindex(rows, row, write.next);
        rows.jobs.set(row.jobId, write.next);
      } else {
        removeActivities(rows, row.jobId, write.attemptIds);
        reindex(rows, row, undefined);
        rows.jobs.delete(row.jobId);
        rows.identities.delete(row.admissionKey);
        count--;
        if (rows.jobs.size === 0) scopes.delete(row.scope);
      }
    }
    return plan.value;
  }

  function point<T>(
    scope: string,
    jobId: string,
    check: () => void,
    decide: (row: JobRecord, time: DecisionTime) => JobDecision<T> | null,
  ): T | null {
    const rows = scopes.get(scopeToken(scope));
    const row = rows?.jobs.get(jobId);
    if (!rows || !row) {
      check();
      return null;
    }
    for (let i = 0; i < MAX_STORE_CAS_SUBMISSIONS; i++) {
      const value = apply(rows, row, decide(row, { now: wallNow(), revision: randomUUID() }), check);
      if (value !== TIME_MISS) return value;
    }
    return invalid('busy');
  }

  function next<T>(
    scope: string,
    key: DueKey,
    check: () => void,
    decide: (row: JobRecord, time: DecisionTime) => JobDecision<T> | null,
  ): StoreNext<T> {
    const rows = scopes.get(scopeToken(scope));
    let now = wallNow();
    let misses = 0;
    if (rows) {
      const index = rows.due[key];
      for (let i = 0; i < MAX_STORE_CANDIDATES && i < index.length; i++) {
        const candidate = index[i]!;
        if (candidate.at > now) break;
        const row = rows.jobs.get(candidate.jobId)!;
        for (;;) {
          const value = apply(rows, row, decide(row, { now, revision: randomUUID() }), check);
          if (value === null) break;
          if (value !== TIME_MISS) return Object.freeze({ status: 'applied', value });
          if (++misses === MAX_STORE_CAS_SUBMISSIONS) return CONTENDED;
          now = wallNow();
        }
      }
    }
    check();
    return misses ? CONTENDED : NONE;
  }

  const store: EmailStore = {
    ...capacityTag(capacity),
    async ready(options = {}) {
      const call = readCallOptions(options, CALL_BUDGETS.admissionOrAdmin);
      atomic({ ...call, timeoutMs: Math.min(call.timeoutMs, STORE_PRIMITIVE_TIMEOUT_MS) }, (check) => {
        wallNow();
        check();
      });
      ready = true;
    },
    async findAdmission(scope, key, call) {
      return read(call, false, () => {
        const rows = scopes.get(scopeToken(scope));
        const encoded = encodeAdmissionKey(validateAdmissionKey(key));
        const id = rows?.identities.get(encoded);
        const row = id && rows?.jobs.get(id);
        return row ? Object.freeze({ job: jobSummary(row), fingerprint: row.fingerprint }) : null;
      });
    },
    async insert(scope, admission, call) {
      return primitive(call, false, (check) => {
        const parsed = readStoreAdmission(scope, admission, capacity);
        const rows = scopes.get(parsed.command.scope);
        if (rows?.identities.has(parsed.admissionKey)) {
          check();
          return Object.freeze({ status: 'duplicate' });
        }
        if (rows?.jobs.has(parsed.jobId)) invalid('invalid_command');
        const row = newJob(parsed, { now: wallNow(), revision: randomUUID() }, capacity);
        if (count >= maxJobs) invalid('store_capacity');
        const result = Object.freeze({ status: 'inserted', job: jobSummary(row) } as const);
        check();
        const target = rows ?? emptyScope();
        target.identities.set(row.admissionKey, row.jobId);
        target.jobs.set(row.jobId, row);
        reindex(target, undefined, row);
        if (!rows) scopes.set(row.scope, target);
        count++;
        return result;
      });
    },
    async findJob(scope, jobId, call) {
      return read(call, false, () => {
        const rows = scopes.get(scopeToken(scope));
        const id = readStoreId(jobId);
        const job = rows?.jobs.get(id);
        return job ? jobSummary(job) : null;
      });
    },
    async findAttempt(scope, jobId, attemptId, call) {
      return read(call, true, () => {
        const rows = scopes.get(scopeToken(scope));
        const job = readStoreId(jobId);
        const id = readStoreId(attemptId);
        const entry = rows?.jobs.get(job)?.attempts.find(({ commit }) => commit.attemptId === id);
        return entry ? copyCommit(entry.commit, capacity) : null;
      });
    },
    async claimNext(scope, claim, call) {
      return primitive(call, true, (check) => {
        const safe = readClaim(claim);
        return next(scope, 'nextAt', check, (row, time) => claimJob(row, safe, time, capacity));
      });
    },
    async renew(scope, fence, leaseMs, call) {
      return primitive(call, true, (check) => {
        const safe = readFence(fence);
        const duration = readLeaseMs(leaseMs);
        return point(scope, safe.jobId, check, (row, time) => renewJob(row, safe, duration, time));
      });
    },
    async markHandoff(scope, fence, leaseMs, call) {
      return primitive(call, true, (check) => {
        const safe = readFence(fence);
        const duration = readLeaseMs(leaseMs);
        return point(scope, safe.jobId, check, (row, time) => markJob(row, safe, duration, time));
      });
    },
    async finish(scope, finish, call) {
      return primitive(call, true, (check) => {
        const safe = readFinish(finish, capacity);
        return point(scope, safe.fence.jobId, check, (row, time) => finishJob(row, safe, time, capacity));
      });
    },
    async recoverNext(scope, call) {
      return primitive(call, true, (check) => {
        const operationId = randomUUID();
        return next(scope, 'leaseEndsAt', check, (row, time) => recoverJob(row, operationId, time, capacity));
      });
    },
    async expireNext(scope, call) {
      return primitive(call, true, (check) => next(scope, 'queuedExpiresAt', check, expireJob));
    },
    async cancel(scope, jobId, call) {
      return primitive(call, false, (check) => {
        const operationId = randomUUID();
        return (
          point(scope, readStoreId(jobId), check, (row, time) => cancelJob(row, operationId, time, capacity)) ??
          Object.freeze({ status: 'not_found' })
        );
      });
    },
    async resolveUnknown(scope, command, call) {
      return primitive(call, false, (check) => {
        const safe = readResolution(command);
        return point(scope, safe.jobId, check, (row, time) => resolveJob(row, safe, time)) ?? invalid('not_found');
      });
    },
    async reserveProjection(scope, call) {
      return primitive(call, false, (check) =>
        next(scope, 'pendingAt', check, (row, time) => reserveJobProjection(row, time, capacity)),
      );
    },
    async putActivity(scope, permit, call) {
      return primitive(call, false, (check) => {
        const safe = readProjectionPermit(scopeToken(scope), permit, capacity);
        const rows = scopes.get(scope);
        const { jobId, attemptId } = safe.activity;
        const existing = rows?.byJob.get(jobId)?.byId.get(attemptId);
        const decision = decideActivityPut(rows?.jobs.get(jobId), safe, existing, wallNow());
        check();
        if (decision !== 'insert') return decision;
        if (!rows) invalid('store_incompatible');
        const now = wallNow();
        check();
        if (now >= safe.permitUntil) return 'permit_expired';
        putRow(rows, Object.freeze({ activity: safe.activity, digest: safe.digest }));
        return 'present';
      });
    },
    async ackProjection(scope, permit, call) {
      return primitive(call, false, (check) => {
        const safe = readProjectionPermit(scopeToken(scope), permit, capacity);
        const { jobId, attemptId } = safe.activity;
        const proof = scopes.get(scope)?.byJob.get(jobId)?.byId.get(attemptId);
        return point(scope, jobId, check, (row, time) => acknowledgeJobProjection(row, safe, proof, time)) ?? 'stale';
      });
    },
    async listActivities(scope, query, call) {
      return read(call, false, () => {
        const criteria = readActivityCriteria(scopeToken(scope), query, capacity);
        const rows = scopes.get(scope);
        const { jobId, before, from, after, limit } = criteria;
        const index = (jobId === null ? rows?.activities : rows?.byJob.get(jobId)?.ordered) ?? [];
        const start = Math.max(
          before === null ? 0 : lowerBound(index, ({ activity }) => activity.finishedAt < before),
          after === undefined ? 0 : lowerBound(index, ({ activity }) => compareActivity(activity, after) > 0),
        );
        const end = from === null ? index.length : lowerBound(index, ({ activity }) => activity.finishedAt < from);
        const selected = index.slice(start, Math.min(end, start + limit + 1)).map(({ activity }) => activity);
        return activityPage(criteria, selected);
      });
    },
    async cleanupNext(scope, call) {
      return primitive(call, false, (check) => next(scope, 'nextCleanupAt', check, cleanupJob));
    },
  };
  return Object.freeze(store);
}
