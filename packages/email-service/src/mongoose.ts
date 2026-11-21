import { randomUUID } from 'node:crypto';
import type { Connection } from 'mongoose';
import { CALL_BUDGETS, MONGOOSE_DEFAULT_NAMES, STORE_PRIMITIVE_TIMEOUT_MS } from './constants';
import type { SmtpCapacity } from './contracts/message';
import type { EmailStore, StoreCall } from './contracts/store';
import { readActivityCriteria, readProjectionPermit } from './internal/activity-codecs';
import { createBudget, readCallOptions, systemEmailClock } from './internal/budget';
import { encodeAdmissionKey, validateAdmissionKey } from './internal/command-codecs';
import { copyCommit, jobSummary } from './internal/job-record';
import {
  acknowledgeJobProjection,
  cancelJob,
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
} from './internal/job-transitions';
import { capacityTag, readCapacityOption } from './internal/smtp-capacity';
import {
  readClaim,
  readFence,
  readFinish,
  readLeaseMs,
  readResolution,
  readStoreAdmission,
  readStoreCall,
  readStoreId,
} from './internal/store-codecs';
import { invalid, readRecord, scopeToken } from './internal/validation';
import { checkConnectionType, MongoConnection, SIMPLE, type Binding, type Names } from './stores/mongoose/connection';
import { MongoOperations } from './stores/mongoose/operations';
import { activityKey } from './stores/mongoose/records';
import {
  ACTIVITY_ID,
  ADMISSION_ID,
  JOB_ID,
  activitySchema,
  checkExistingCollection,
  indexName,
  jobSchema,
  prepareCollection,
} from './stores/mongoose/schema';

const MAX_IN_FLIGHT = 32;

/** Store on a caller-owned connection. Name overrides are V1-only and use ASCII letters, numbers and `_`. */
export type MongooseEmailStoreOptions = {
  /** Owns a separate jobs/activities pair under an immutable binding; do not combine with V1 name overrides. */
  smtpCapacity?: SmtpCapacity;
  /** Defaults to `email_jobs`. */
  jobsCollection?: string;
  /** Defaults to `email_activities`. */
  activitiesCollection?: string;
  /** Reserved connection-local model name (defaults to `EmailJobV1`). The store does not register a model. */
  jobsModelName?: string;
  /** Reserved connection-local model name (defaults to `EmailActivityV1`). The store does not register a model. */
  activitiesModelName?: string;
};

const NAME_KEYS = ['jobsCollection', 'activitiesCollection', 'jobsModelName', 'activitiesModelName'] as const;

function readStoreConfig(options: MongooseEmailStoreOptions) {
  const input = readRecord(options, [], [...NAME_KEYS, 'smtpCapacity'], 'invalid_config');
  const capacity = readCapacityOption(input);
  if (capacity) {
    if (NAME_KEYS.some((key) => Object.hasOwn(input, key))) invalid('invalid_config');
    const { namespace } = capacity.binding;
    const prefix = `email_smtp_v2.${namespace}`;
    const modelId = namespace.replaceAll('-', '_');
    const names: Names = Object.freeze({
      jobsCollection: `${prefix}.jobs`,
      activitiesCollection: `${prefix}.activities`,
      jobsModelName: `EmailSmtpV2Job_${modelId}`,
      activitiesModelName: `EmailSmtpV2Activity_${modelId}`,
    });
    return { names, capacity };
  }
  const names = { ...MONGOOSE_DEFAULT_NAMES } as Record<(typeof NAME_KEYS)[number], string>;
  for (const key of NAME_KEYS) {
    const value = input[key];
    if (value === undefined) continue;
    if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value)) invalid('invalid_config');
    names[key] = value;
  }
  if (names.jobsCollection === names.activitiesCollection || names.jobsModelName === names.activitiesModelName)
    invalid('invalid_config');
  return { names: Object.freeze(names), capacity };
}

/**
 * Durable store on an explicit caller-owned Mongoose 9.12.2+ connection. Open it yourself, then await
 * `store.ready()` before use. Requires a writable, journaled MongoDB 8.x WiredTiger replica set. The store
 * never registers models, connects, closes, or joins a caller session. Use dedicated private collections.
 * For `smtpCapacity`, readiness installs missing definitions in the bound pair, never changes V1 definitions.
 * After `write_unconfirmed` do not work an unconfirmed claim or launch after an unconfirmed handoff.
 */
export function createMongooseEmailStore(connection: Connection, options: MongooseEmailStoreOptions = {}): EmailStore {
  checkConnectionType(connection);
  const { names, capacity } = readStoreConfig(options);
  const io = new MongoConnection(connection, names);
  let readyBinding: Binding | undefined;
  let preparing = false;
  let inFlight = 0;

  async function run<T>(call: StoreCall, worker: boolean, fn: (ops: MongoOperations) => Promise<T>): Promise<T> {
    const { signal, timeoutMs } = readStoreCall(call, worker, capacity);
    if (inFlight >= (capacity?.limits.mongoInFlight ?? MAX_IN_FLIGHT)) invalid('busy');
    const budget = createBudget(systemEmailClock, Math.min(timeoutMs, STORE_PRIMITIVE_TIMEOUT_MS), signal);
    inFlight++;
    try {
      budget.check();
      if (!readyBinding) invalid('store_unavailable');
      const binding = io.bind();
      if (binding.client !== readyBinding.client || binding.db !== readyBinding.db) invalid('store_unavailable');
      return await fn(new MongoOperations(io, binding, budget, names, capacity));
    } finally {
      inFlight--;
      budget.close();
    }
  }

  const store: EmailStore = {
    ...capacityTag(capacity),
    async ready(options = {}) {
      const { timeoutMs, signal } = readCallOptions(options, CALL_BUDGETS.admissionOrAdmin);
      if (preparing || inFlight) invalid('busy');
      const budget = createBudget(systemEmailClock, timeoutMs, signal);
      preparing = true;
      readyBinding = undefined;
      try {
        budget.check();
        const binding = io.bind();
        await io.verifyTopology(binding, budget);
        const jobs = jobSchema(names.jobsCollection, capacity);
        const activities = activitySchema(names.activitiesCollection, capacity);
        if (capacity) {
          await checkExistingCollection(io, binding, budget, jobs);
          await checkExistingCollection(io, binding, budget, activities);
        }
        // Establish jobs first: another cap for this namespace cannot win the activities half.
        await prepareCollection(io, binding, budget, jobs);
        await prepareCollection(io, binding, budget, activities);
        // Confirm the server can execute the actual exact read path on both namespaces. Probe
        // with a reserved, non-application identity; do not create a synthetic write in the queue.
        const jobId = randomUUID();
        const probe = { scope: '!readiness', jobId };
        for (const [find, filter, hint] of [
          [names.jobsCollection, probe, JOB_ID],
          [names.jobsCollection, { scope: probe.scope, admissionKey: '!readiness' }, ADMISSION_ID],
          [names.activitiesCollection, { ...probe, attemptId: randomUUID() }, ACTIVITY_ID],
        ] as const) {
          await io.read(binding, budget, {
            find,
            filter,
            hint: indexName(hint, capacity),
            collation: SIMPLE,
            readConcern: { level: 'linearizable' },
            singleBatch: true,
            limit: 1,
            batchSize: 1,
          });
        }
        await io.now(binding, budget);
        const current = io.bind();
        if (binding.client !== current.client || binding.db !== current.db) invalid('store_unavailable');
        budget.check();
        readyBinding = binding;
      } finally {
        budget.close();
        preparing = false;
      }
    },
    findAdmission(scope, key, call) {
      return run(call, false, async (ops) => {
        const job = await ops.byAdmission(scopeToken(scope), encodeAdmissionKey(validateAdmissionKey(key)));
        return job ? Object.freeze({ job: jobSummary(job), fingerprint: job.fingerprint }) : null;
      });
    },
    insert(scope, input, call) {
      return run(call, false, async (ops) => {
        const safe = readStoreAdmission(scopeToken(scope), input, capacity);
        if (await ops.byAdmission(scope, safe.admissionKey)) return Object.freeze({ status: 'duplicate' });
        if (await ops.byJob(scope, safe.jobId)) invalid('invalid_command');
        const job = newJob(safe, { now: await ops.now(), revision: randomUUID() }, capacity);
        const summary = jobSummary(job);
        return (await ops.insert(job)) === 'inserted'
          ? Object.freeze({ status: 'inserted', job: summary })
          : Object.freeze({ status: 'duplicate' });
      });
    },
    findJob(scope, jobId, call) {
      return run(call, false, async (ops) => {
        const job = await ops.byJob(scopeToken(scope), readStoreId(jobId));
        return job ? jobSummary(job) : null;
      });
    },
    findAttempt(scope, jobId, attemptId, call) {
      return run(call, true, async (ops) => {
        const id = readStoreId(attemptId);
        const job = await ops.byJob(scopeToken(scope), readStoreId(jobId));
        const commit = job?.attempts.find((entry) => entry.commit.attemptId === id)?.commit;
        return commit ? copyCommit(commit, capacity) : null;
      });
    },
    claimNext(scope, input, call) {
      return run(call, true, (ops) => {
        const safe = readClaim(input);
        return ops.claimNext(scopeToken(scope), safe);
      });
    },
    renew(scope, fence, leaseMs, call) {
      return run(call, true, (ops) => {
        const safe = readFence(fence);
        const duration = readLeaseMs(leaseMs);
        return ops.point(scopeToken(scope), safe.jobId, (job, time) => renewJob(job, safe, duration, time));
      });
    },
    markHandoff(scope, fence, leaseMs, call) {
      return run(call, true, (ops) => {
        const safe = readFence(fence);
        const duration = readLeaseMs(leaseMs);
        return ops.point(scopeToken(scope), safe.jobId, (job, time) => markJob(job, safe, duration, time));
      });
    },
    finish(scope, input, call) {
      return run(call, true, (ops) => {
        const safe = readFinish(input, capacity);
        return ops.point(scopeToken(scope), safe.fence.jobId, (job, time) => finishJob(job, safe, time, capacity));
      });
    },
    recoverNext(scope, call) {
      return run(call, true, (ops) => {
        const operationId = randomUUID();
        return ops.next(scopeToken(scope), 'leaseEndsAt', (job, time) => recoverJob(job, operationId, time, capacity));
      });
    },
    expireNext(scope, call) {
      return run(call, true, (ops) => ops.next(scopeToken(scope), 'expiresAt', expireJob));
    },
    cancel(scope, jobId, call) {
      return run(call, false, async (ops) => {
        const operationId = randomUUID();
        return (
          (await ops.point(scopeToken(scope), readStoreId(jobId), (job, time) =>
            cancelJob(job, operationId, time, capacity),
          )) ?? Object.freeze({ status: 'not_found' })
        );
      });
    },
    resolveUnknown(scope, input, call) {
      return run(call, false, async (ops) => {
        const safe = readResolution(input);
        return (
          (await ops.point(scopeToken(scope), safe.jobId, (job, time) => resolveJob(job, safe, time))) ??
          invalid('not_found')
        );
      });
    },
    reserveProjection(scope, call) {
      return run(call, false, (ops) =>
        ops.next(scopeToken(scope), 'pendingAt', (job, time) => reserveJobProjection(job, time, capacity)),
      );
    },
    putActivity(scope, input, call) {
      return run(call, false, async (ops) => {
        const permit = readProjectionPermit(scopeToken(scope), input, capacity);
        const identity = activityKey(permit.activity);
        const job = await ops.byJob(scope, identity.jobId);
        const activity = await ops.byActivity(identity);
        const now = await ops.now();
        const decision = decideActivityPut(job, permit, activity, now);
        ops.check();
        return decision === 'insert' ? ops.upsertActivity(permit, now) : decision;
      });
    },
    ackProjection(scope, input, call) {
      return run(call, false, async (ops) => {
        const permit = readProjectionPermit(scopeToken(scope), input, capacity);
        const identity = activityKey(permit.activity);
        return (
          (await ops.point(scope, identity.jobId, async (job, time) =>
            acknowledgeJobProjection(job, permit, await ops.byActivity(identity), time),
          )) ?? 'stale'
        );
      });
    },
    listActivities(scope, query, call) {
      return run(call, false, (ops) => ops.list(readActivityCriteria(scopeToken(scope), query, capacity)));
    },
    cleanupNext(scope, call) {
      return run(call, false, (ops) => ops.next(scopeToken(scope), 'nextCleanupAt', cleanupJob));
    },
  };
  return Object.freeze(store);
}
