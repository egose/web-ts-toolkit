import { randomUUID } from 'node:crypto';
import {
  ACTIVITY_STUB_TTL_MS,
  EMAIL_FORMAT_VERSION,
  MAX_STORE_CANDIDATES,
  MAX_STORE_CAS_SUBMISSIONS,
} from '../../constants';
import type { ProjectionPermit, StoreNext } from '../../contracts/store';
import { activityPage, type ActivityCriteria, type StoredActivity } from '../../internal/activity-codecs';
import type { OperationBudget } from '../../internal/budget';
import type { JobRecord } from '../../internal/job-record';
import type { DecisionTime, JobDecision, JobGuard, JobWrite } from '../../internal/job-transitions';
import { capacityTag, type CapacityContext } from '../../internal/smtp-capacity';
import { readStoreId } from '../../internal/store-codecs';
import { invalid } from '../../internal/validation';
import {
  batch,
  doc,
  serverWindow,
  SIMPLE,
  type Binding,
  type BsonDocument,
  type MongoConnection,
  type Names,
} from './connection';
import { activityBson, activityKey, jobBson, jobIdKey, readActivityBson, readJobBson } from './records';
import {
  ACTIVITY_ID,
  ACTIVITY_PAGE,
  ADMISSION_ID,
  JOB_ACTIVITY_PAGE,
  JOB_ID,
  activityOrder,
  dueIndexes,
  indexName,
  jobActivityOrder,
  type DueKey,
} from './schema';

const NONE = Object.freeze({ status: 'none' } as const);
const CONTENDED = Object.freeze({ status: 'contended' } as const);
const NOT_APPLIED = Symbol('definite guard miss');

function writeCount(raw: BsonDocument, max: number): number {
  const { n } = raw;
  if (Object.hasOwn(raw, 'writeErrors') || typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > max)
    invalid('write_unconfirmed');
  return n;
}

function modifiedValue(reply: BsonDocument): unknown {
  if (Object.hasOwn(reply, 'writeErrors')) invalid('write_unconfirmed');
  const n = writeCount(doc(reply.lastErrorObject, 'write_unconfirmed'), 1);
  if (n !== (reply.value === null ? 0 : 1) || reply.value === undefined) invalid('write_unconfirmed');
  return reply.value;
}

function capacityFilter(capacity?: CapacityContext): BsonDocument {
  const binding = capacity?.binding;
  return binding
    ? {
        'smtpCapacity.format': binding.format,
        'smtpCapacity.namespace': binding.namespace,
        'smtpCapacity.maxRecipients': binding.maxRecipients,
      }
    : {};
}

function casFilter(
  { scope, jobId, revision, state, retiring, pendingAck, atOrAfter, before }: JobGuard,
  capacity?: CapacityContext,
): BsonDocument {
  const lease = state.state === 'leased' ? state.lease : undefined;
  return {
    _id: jobIdKey(scope, jobId),
    scope,
    jobId,
    version: EMAIL_FORMAT_VERSION,
    ...capacityFilter(capacity),
    revision,
    state: state.state,
    'lifecycle.state': state.state,
    retiring: retiring === true ? true : { $exists: false },
    ...(lease
      ? {
          'lifecycle.lease.attemptId': lease.attemptId,
          'lifecycle.lease.token': lease.token,
          'lifecycle.lease.startedAt': lease.startedAt,
          'lifecycle.lease.grantedAt': lease.grantedAt,
          'lifecycle.lease.leaseEndsAt': lease.leaseEndsAt,
          'lifecycle.lease.handedOffAt': lease.handedOffAt ?? { $exists: false },
          leaseEndsAt: lease.leaseEndsAt,
        }
      : { 'lifecycle.lease': { $exists: false } }),
    ...(pendingAck
      ? {
          attempts: {
            $elemMatch: {
              'commit.attemptId': pendingAck.attemptId,
              digest: pendingAck.digest,
              projectionAckAt: { $exists: false },
            },
          },
        }
      : {}),
    $expr: serverWindow(atOrAfter, before),
  };
}

/** A driver binding and one absolute budget are shared by all RPCs of a primitive. */
export class MongoOperations {
  constructor(
    private readonly io: MongoConnection,
    private readonly binding: Binding,
    private readonly budget: OperationBudget,
    private readonly names: Names,
    private readonly capacity?: CapacityContext,
  ) {}

  check(): void {
    this.budget.check();
  }

  now(): Promise<number> {
    return this.io.now(this.binding, this.budget);
  }

  private async time(): Promise<DecisionTime> {
    return { now: await this.now(), revision: randomUUID() };
  }

  private async find(
    find: string,
    filter: BsonDocument,
    hint: string,
    limit: number,
    level: 'linearizable' | 'majority',
    sort?: BsonDocument,
    projection?: BsonDocument,
  ): Promise<object[]> {
    const reply = await this.io.read(this.binding, this.budget, {
      find,
      filter,
      hint: indexName(hint, this.capacity),
      collation: SIMPLE,
      readConcern: { level },
      limit,
      batchSize: limit,
      singleBatch: true,
      ...(sort ? { sort } : {}),
      ...(projection ? { projection } : {}),
    });
    return batch(reply, limit, `${this.binding.db.databaseName}.${find}`);
  }

  async byJob(scope: string, jobId: string): Promise<JobRecord | undefined> {
    // The private collection is already the bounded namespace. Check the tuple on the exact
    // returned record rather than using a filter that could disguise a corrupt row as a miss.
    const [raw] = await this.find(this.names.jobsCollection, { scope, jobId }, JOB_ID, 1, 'linearizable');
    if (!raw) return;
    const job = readJobBson(scope, raw, this.capacity);
    if (job.jobId !== jobId) invalid('store_incompatible');
    this.check();
    return job;
  }

  async byAdmission(scope: string, admissionKey: string): Promise<JobRecord | undefined> {
    const [raw] = await this.find(this.names.jobsCollection, { scope, admissionKey }, ADMISSION_ID, 1, 'linearizable');
    if (!raw) return;
    const job = readJobBson(scope, raw, this.capacity);
    if (job.admissionKey !== admissionKey) invalid('store_incompatible');
    this.check();
    return job;
  }

  async byActivity(identity: ReturnType<typeof activityKey>): Promise<StoredActivity | undefined> {
    const [raw] = await this.find(this.names.activitiesCollection, identity, ACTIVITY_ID, 1, 'linearizable');
    if (!raw) return;
    const { jobId, attemptId } = doc(raw, 'store_incompatible');
    if (jobId !== identity.jobId || attemptId !== identity.attemptId) invalid('store_incompatible');
    const row = readActivityBson(identity.scope, raw, this.capacity);
    this.check();
    return row;
  }

  async insert(job: JobRecord): Promise<'inserted' | 'duplicate'> {
    const result = await this.io.write(this.binding, this.budget, {
      insert: this.names.jobsCollection,
      documents: [jobBson(job)],
    });
    if (result.kind !== 'ack') invalid('write_unconfirmed');
    const { n, writeErrors } = result.reply;
    if (n === 1 && !Object.hasOwn(result.reply, 'writeErrors')) return 'inserted';
    if (n === 0 && Array.isArray(writeErrors) && writeErrors.length === 1) {
      const { code } = doc(writeErrors[0], 'write_unconfirmed');
      if (code === 121) invalid('store_incompatible');
      if (code === 11000) {
        // Mongo can detect an as-yet uncommitted duplicate. Only a linearizable point read
        // confirms the winner and whether it owns the same scoped admission identity.
        let conflictingJob: JobRecord | undefined;
        try {
          if (await this.byAdmission(job.scope, job.admissionKey)) return 'duplicate';
          conflictingJob = await this.byJob(job.scope, job.jobId);
        } catch {
          // A failed confirmation proves neither identity. Let admission recheck the exact key rather
          // than reporting a definite pre-write failure.
          return invalid('write_unconfirmed');
        }
        if (conflictingJob) invalid('invalid_command');
      }
    }
    return invalid('write_unconfirmed');
  }

  private async replace(write: Extract<JobWrite, { kind: 'replace' }>): Promise<boolean> {
    const { guard, next } = write;
    const result = await this.io.write(
      this.binding,
      this.budget,
      {
        findAndModify: this.names.jobsCollection,
        query: casFilter(guard, this.capacity),
        // Treat the whole replacement as literal, including rendered strings beginning with '$'.
        update: [{ $replaceWith: { $literal: jobBson(next) } }],
        fields: { _id: 1, revision: 1 },
        new: true,
        hint: indexName(JOB_ID, this.capacity),
        collation: SIMPLE,
      },
      [121],
    );
    if (result.kind === 'definite_error') invalid('store_incompatible');
    const value = modifiedValue(result.reply);
    if (value === null) return false;
    const { _id, revision } = doc(value, 'write_unconfirmed');
    if (_id !== jobIdKey(next.scope, next.jobId) || revision !== next.revision) invalid('write_unconfirmed');
    return true;
  }

  private async purge({ guard, attemptIds }: Extract<JobWrite, { kind: 'purge' }>): Promise<boolean> {
    if (!guard.retiring) invalid('store_incompatible');
    const { scope, jobId } = guard;
    if (attemptIds.length) {
      // Pin the physical activity IDs, then confirm the source still has this retiring
      // revision. A paused cleaner must not delete a later incarnation of the same logical IDs.
      const exact: { _id: string; scope: string; jobId: string; attemptId: string }[] = [];
      for (const attemptId of attemptIds) {
        const identity = { scope, jobId, attemptId };
        const [raw] = await this.find(this.names.activitiesCollection, identity, ACTIVITY_ID, 1, 'linearizable');
        if (raw) {
          readActivityBson(scope, raw, this.capacity);
          exact.push({ ...identity, _id: readStoreId(doc(raw, 'store_incompatible')._id, 'store_incompatible') });
        }
      }
      const source = await this.byJob(scope, jobId);
      if (source?.revision !== guard.revision || !source.retiring) return false;
      if (exact.length) {
        const outcome = await this.io.write(this.binding, this.budget, {
          delete: this.names.activitiesCollection,
          // An exact indexed delete per attempt in one ordered command.
          deletes: exact.map((identity) => ({
            q: { ...identity, ...capacityFilter(this.capacity), $expr: serverWindow(guard.atOrAfter) },
            limit: 1,
            hint: indexName(ACTIVITY_ID, this.capacity),
            collation: SIMPLE,
          })),
        });
        if (outcome.kind !== 'ack') invalid('write_unconfirmed');
        writeCount(outcome.reply, exact.length);
        // A concurrent cleaner's maybe-uncommitted delete must not look like a proven
        // absence just because our delete is a no-op. Read back the bounded logical keys.
        for (const { attemptId } of exact) {
          if (await this.byActivity({ scope, jobId, attemptId })) return false;
        }
      }
    }
    const outcome = await this.io.write(this.binding, this.budget, {
      delete: this.names.jobsCollection,
      deletes: [
        {
          q: casFilter(guard, this.capacity),
          limit: 1,
          hint: indexName(JOB_ID, this.capacity),
          collation: SIMPLE,
        },
      ],
    });
    if (outcome.kind !== 'ack') invalid('write_unconfirmed');
    return writeCount(outcome.reply, 1) === 1;
  }

  private async apply<T>(decision: JobDecision<T> | null): Promise<T | null | typeof NOT_APPLIED> {
    this.check();
    const { write } = decision ?? {};
    if (write) {
      const ok = write.kind === 'replace' ? await this.replace(write) : await this.purge(write);
      if (!ok) return NOT_APPLIED;
    }
    return decision?.value ?? null;
  }

  async point<T>(
    scope: string,
    jobId: string,
    decide: (job: JobRecord, time: DecisionTime) => JobDecision<T> | null | Promise<JobDecision<T> | null>,
  ): Promise<T | null> {
    for (let i = 0; i < MAX_STORE_CAS_SUBMISSIONS; i++) {
      const job = await this.byJob(scope, jobId);
      if (!job) return null;
      const value = await this.apply(await decide(job, await this.time()));
      if (value !== NOT_APPLIED) return value;
    }
    return invalid('busy');
  }

  async next<T>(
    scope: string,
    due: DueKey,
    decide: (job: JobRecord, time: DecisionTime) => JobDecision<T> | null,
  ): Promise<StoreNext<T>> {
    const selectionAt = await this.now();
    const { name, state, sort } = dueIndexes[due];
    const candidates = await this.find(
      this.names.jobsCollection,
      {
        scope,
        ...(state ? { state } : {}),
        [due]: { $exists: true, $lte: selectionAt },
      },
      name,
      this.capacity?.limits.dueCandidates ?? MAX_STORE_CANDIDATES,
      'majority',
      sort,
      { _id: 0, jobId: 1 },
    );
    let contended = false;
    let submissions = 0;
    for (const row of candidates) {
      const { jobId } = doc(row, 'store_incompatible');
      // Selection is not proof. Resolve the current scoped identity before planning the write.
      const job = await this.byJob(scope, readStoreId(jobId, 'store_incompatible'));
      if (!job) {
        contended = true;
        continue;
      }
      const time = await this.time();
      const decision = decide(job, time);
      if (!decision) {
        contended = true;
        continue;
      }
      const value = await this.apply(decision);
      if (value !== NOT_APPLIED) {
        if (value === null) invalid('store_incompatible');
        return Object.freeze({ status: 'applied', value });
      }
      contended = true;
      if (++submissions === MAX_STORE_CAS_SUBMISSIONS) break;
    }
    this.check();
    return contended ? CONTENDED : NONE;
  }

  async upsertActivity(permit: ProjectionPermit, sampledAt: number): Promise<'present' | 'permit_expired'> {
    const identity = activityKey(permit.activity);
    const activity = activityBson(permit);
    const candidateId = randomUUID();
    const result = await this.io.write(
      this.binding,
      this.budget,
      {
        findAndModify: this.names.activitiesCollection,
        query: { ...identity, ...capacityFilter(this.capacity) },
        new: true,
        upsert: true,
        hint: indexName(ACTIVITY_ID, this.capacity),
        collation: SIMPLE,
        update: [
          {
            $replaceWith: {
              $switch: {
                branches: [
                  { case: { $eq: ['$complete', true] }, then: '$$ROOT' },
                  {
                    case: serverWindow(sampledAt, permit.permitUntil),
                    then: {
                      $mergeObjects: [
                        { $literal: activity },
                        { _id: { $ifNull: ['$_id', { $literal: candidateId }] } },
                      ],
                    },
                  },
                  { case: { $eq: [{ $type: '$stubDeleteAt' }, 'date'] }, then: '$$ROOT' },
                ],
                default: {
                  $mergeObjects: [
                    { $literal: { ...identity, ...capacityTag(this.capacity) } },
                    { _id: { $literal: candidateId }, stubDeleteAt: { $add: ['$$NOW', ACTIVITY_STUB_TTL_MS] } },
                  ],
                },
              },
            },
          },
        ],
      },
      [11000, 121],
    );
    if (result.kind === 'definite_error' && result.code === 121) invalid('store_incompatible');
    let confirmedComplete = false;
    if (result.kind === 'ack') {
      const row = readActivityBson(
        identity.scope,
        doc(modifiedValue(result.reply), 'write_unconfirmed'),
        this.capacity,
      );
      if (row && row.digest !== permit.digest) invalid('store_incompatible');
      confirmedComplete = row !== undefined;
    }
    // Even a no-op over an existing row or a concurrent insert collision needs exact committed proof.
    let stored: StoredActivity | undefined;
    try {
      stored = await this.byActivity(identity);
    } catch {
      return invalid('write_unconfirmed');
    }
    if (stored) {
      if (stored.digest !== permit.digest) invalid('store_incompatible');
      return 'present';
    }
    if (confirmedComplete) invalid('write_unconfirmed');
    // The write returned only a stub, not an activity. Distinguish expiry from an
    // observed backward time step without authorizing a second put.
    let now: number;
    try {
      now = await this.now();
    } catch {
      return invalid('write_unconfirmed');
    }
    if (now >= permit.permitUntil) return 'permit_expired';
    return invalid('write_unconfirmed');
  }

  async list(criteria: ActivityCriteria) {
    const { scope, jobId, from, before, after, limit } = criteria;
    const base = {
      scope,
      complete: true,
      ...(jobId === null ? {} : { jobId }),
    };
    const hint = jobId === null ? ACTIVITY_PAGE : JOB_ACTIVITY_PAGE;
    const sort = jobId === null ? activityOrder : jobActivityOrder;
    const rows: object[] = [];
    const readRange = async (bounds: BsonDocument) => {
      if (rows.length <= limit)
        rows.push(
          ...(await this.find(
            this.names.activitiesCollection,
            { ...base, ...bounds },
            hint,
            limit + 1 - rows.length,
            'majority',
            sort,
          )),
        );
    };
    // Split the lexicographic tail into ordered, disjoint index ranges. Each branch starts
    // at the cursor bound, not a post-filtered scan of previously returned rows.
    if (after) {
      await readRange({ jobId: after.jobId, finishedAt: after.finishedAt, attemptId: { $gt: after.attemptId } });
      if (jobId === null) await readRange({ finishedAt: after.finishedAt, jobId: { $gt: after.jobId } });
    }
    const range = {
      ...(from === null ? {} : { $gte: from }),
      ...(after ? { $lt: after.finishedAt } : before === null ? {} : { $lt: before }),
    };
    await readRange(Object.keys(range).length ? { finishedAt: range } : {});
    const page = activityPage(
      criteria,
      rows.map((row) => readActivityBson(scope, row, this.capacity)?.activity ?? invalid('store_incompatible')),
    );
    this.check();
    return page;
  }
}
