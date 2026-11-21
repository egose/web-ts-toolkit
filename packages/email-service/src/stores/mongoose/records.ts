import { EMAIL_FORMAT_VERSION, MAX_ATTEMPT_LEDGER, MAX_UNIX_MS, MESSAGE_LIMITS, PRIORITY } from '../../constants';
import type { EmailActivity } from '../../contracts/admin';
import type { ProjectionPermit } from '../../contracts/store';
import { readStoredActivity, type StoredActivity } from '../../internal/activity-codecs';
import { jobSelectors, readJobRecord, type JobRecord, type JobSelectors } from '../../internal/job-record';
import { assertCapacityTag, recipientLimit, type CapacityContext } from '../../internal/smtp-capacity';
import { readStoreId } from '../../internal/store-codecs';
import { invalid, readRecord, scopeToken, unixMs } from '../../internal/validation';

const STORED = 'store_incompatible';
type Document = Record<string, unknown>;

type JobBson = Omit<JobRecord, 'state' | 'expiresAt'> &
  Omit<JobSelectors, 'queuedExpiresAt'> & {
    readonly _id: string;
    readonly lifecycle: JobRecord['state'];
    readonly messageExpiresAt: number;
    /** Only queued jobs participate in this index. */
    readonly expiresAt?: number;
  };
type ActivityBson = EmailActivity & Readonly<{ _id: string; complete: true; digest: string }>;

export function jobIdKey(scope: string, jobId: string): string {
  return `${scope}:${jobId}`;
}

export function activityKey({ scope, jobId, attemptId }: Pick<EmailActivity, 'scope' | 'jobId' | 'attemptId'>) {
  return { scope, jobId, attemptId };
}

export function jobBson(job: JobRecord): JobBson {
  const { state, expiresAt, ...logical } = job;
  const { queuedExpiresAt, ...selectors } = jobSelectors(job);
  return {
    _id: jobIdKey(job.scope, job.jobId),
    ...logical,
    ...selectors,
    lifecycle: state,
    messageExpiresAt: expiresAt,
    ...(queuedExpiresAt === undefined ? {} : { expiresAt: queuedExpiresAt }),
  };
}

export function activityBson({ activity, digest }: ProjectionPermit): Omit<ActivityBson, '_id'> {
  return { ...activity, complete: true, digest };
}

const jobRequired = [
  '_id',
  'version',
  'scope',
  'jobId',
  'key',
  'admissionKey',
  'fingerprint',
  'snapshotHash',
  'retry',
  'retention',
  'provider',
  'template',
  'correlation',
  'recipientCounts',
  'scheduleAt',
  'createdAt',
  'updatedAt',
  'messageExpiresAt',
  'priority',
  'revision',
  'lifecycle',
  'state',
  'attempts',
  'resolutions',
] as const satisfies readonly (keyof JobBson)[];
const jobOptional = [
  'snapshot',
  'projectionPermitUntil',
  'retiring',
  'nextAt',
  'expiresAt',
  'leaseEndsAt',
  'pendingAt',
  'nextCleanupAt',
] as const satisfies readonly (keyof JobBson)[];

export function readJobBson(scope: string, raw: unknown, capacity?: CapacityContext): JobRecord {
  const { _id, lifecycle, messageExpiresAt, state, nextAt, expiresAt, leaseEndsAt, pendingAt, nextCleanupAt, ...rest } =
    readRecord(raw, jobRequired, capacity ? [...jobOptional, 'smtpCapacity', 'intentHash'] : jobOptional, STORED);
  const job = readJobRecord(scope, { ...rest, state: lifecycle, expiresAt: messageExpiresAt }, capacity);
  const selectors = jobSelectors(job);
  for (const [key, value, expected] of [
    ['state', state, selectors.state],
    ['nextAt', nextAt, selectors.nextAt],
    ['expiresAt', expiresAt, selectors.queuedExpiresAt],
    ['leaseEndsAt', leaseEndsAt, selectors.leaseEndsAt],
    ['pendingAt', pendingAt, selectors.pendingAt],
    ['nextCleanupAt', nextCleanupAt, selectors.nextCleanupAt],
  ] as const) {
    if (expected === undefined ? Object.hasOwn(raw as object, key) : value !== expected) invalid(STORED);
  }
  if (_id !== jobIdKey(scope, job.jobId)) invalid(STORED);
  return job;
}

const activityIdentity = ['_id', 'scope', 'jobId', 'attemptId'] as const;
const activityRequired = [
  ...activityIdentity,
  'version',
  'complete',
  'digest',
  'ordinal',
  'provider',
  'template',
  'correlation',
  'startedAt',
  'finishedAt',
  'result',
  'disposition',
] as const satisfies readonly (keyof ActivityBson)[];
const activityOptional = ['handedOffAt'] as const;

/** A stub is not committed activity proof. Validate its entire shape, even when discarding it. */
export function readActivityBson(
  expectedScope: string,
  row: object,
  capacity?: CapacityContext,
): StoredActivity | undefined {
  if (!Object.hasOwn(row, 'complete')) {
    const { _id, scope, jobId, attemptId, stubDeleteAt, ...tag } = readRecord(
      row,
      [...activityIdentity, 'stubDeleteAt'],
      capacity ? ['smtpCapacity'] : [],
      STORED,
    );
    assertCapacityTag(tag, capacity, STORED);
    readStoreId(_id, STORED);
    readStoreId(jobId, STORED);
    readStoreId(attemptId, STORED);
    if (scopeToken(scope, STORED) !== expectedScope || !(stubDeleteAt instanceof Date)) invalid(STORED);
    unixMs(stubDeleteAt.getTime(), STORED);
    return;
  }
  const { _id, complete, digest, ...activity } = readRecord(
    row,
    activityRequired,
    capacity ? [...activityOptional, 'smtpCapacity', 'recipientCounts'] : activityOptional,
    STORED,
  );
  readStoreId(_id, STORED);
  const stored = readStoredActivity(expectedScope, { activity, digest }, STORED, capacity);
  if (complete !== true) invalid(STORED);
  return stored;
}

// The database enforces the private BSON layout and record versions. Cross-field rules, snapshot
// limits/hashes, and semantic evidence validation remain in the shared logical codecs.
function objectSchema(properties: Record<string, Document>, optional: readonly string[] = []): Document {
  const required = Object.keys(properties).filter((field) => !optional.includes(field));
  return {
    bsonType: 'object',
    ...(required.length ? { required } : {}),
    additionalProperties: false,
    properties,
  };
}

const bsonObject = { bsonType: 'object' };
const string = { bsonType: 'string' };
const numeric = { bsonType: ['int', 'long', 'double'], multipleOf: 1 };
const version = { ...numeric, enum: [EMAIL_FORMAT_VERSION] };
const time = { ...numeric, minimum: 0, maximum: MAX_UNIX_MS };
const ordinal = { ...numeric, minimum: 1, maximum: MAX_ATTEMPT_LEDGER };
const scope = { bsonType: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' };
const uuidPattern = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const uuid = { bsonType: 'string', pattern: `^${uuidPattern}$` };
const digest = { bsonType: 'string', pattern: '^[0-9a-f]{64}$' };
const provider = objectSchema({
  kind: { enum: ['smtp', 'sendgrid'] },
  key: string,
  mode: { enum: ['live', 'sandbox'] },
});
const template = objectSchema({ key: string, revision: string });
const correlation = { ...bsonObject, maxProperties: MESSAGE_LIMITS.correlationEntries, additionalProperties: string };
const smtpProvider = objectSchema({ kind: { enum: ['smtp'] }, key: string, mode: { enum: ['live'] } });

function resultFields(capacity?: CapacityContext) {
  const max = recipientLimit(capacity);
  const recipient = objectSchema({
    group: { enum: ['to', 'cc', 'bcc'] },
    index: { ...numeric, minimum: 0, maximum: max - 1 },
    status: { enum: ['accepted', 'rejected'] },
  });
  return {
    outcome: string,
    retry: { enum: ['never', 'safe_transient'] },
    stage: string,
    reason: string,
    recipients: { bsonType: 'array', maxItems: max, items: recipient },
    messageId: { ...string, maxLength: '<00000000-0000-4000-8000-000000000000@email.invalid>'.length },
    ...(capacity ? {} : { providerMessageId: { ...string, maxLength: 128 } }),
  };
}
const resultOptional = ['recipients', 'messageId', 'providerMessageId'] as const;
function ledgerAttempt(capacity?: CapacityContext) {
  return objectSchema(
    {
      commit: objectSchema(
        {
          jobId: uuid,
          attemptId: uuid,
          ordinal,
          operationId: uuid,
          startedAt: time,
          handedOffAt: time,
          finishedAt: time,
          result: objectSchema(
            {
              ...resultFields(capacity),
              retryHint: objectSchema({ delayMs: numeric, notBefore: time }, ['delayMs', 'notBefore']),
            },
            [...resultOptional, 'retryHint'],
          ),
          disposition: string,
          reason: string,
          retryAt: time,
        },
        ['handedOffAt', 'retryAt'],
      ),
      digest,
      ownerDigest: digest,
      permitUntil: time,
      projectionAckAt: time,
    },
    ['ownerDigest', 'permitUntil', 'projectionAckAt'],
  );
}
const lifecycle = {
  oneOf: [
    objectSchema({ state: { enum: ['queued'] }, nextAt: time }),
    objectSchema({
      state: { enum: ['leased'] },
      lease: objectSchema(
        {
          attemptId: uuid,
          token: { bsonType: 'string', pattern: '^[A-Za-z0-9_-]{22,128}$' },
          startedAt: time,
          grantedAt: time,
          leaseEndsAt: time,
          handedOffAt: time,
        },
        ['handedOffAt'],
      ),
    }),
    objectSchema(
      {
        state: { enum: ['terminal'] },
        disposition: string,
        terminalReason: string,
        terminalAt: time,
        settledAt: time,
      },
      ['settledAt'],
    ),
  ],
};

function capacityField({ binding }: CapacityContext): Document {
  return {
    smtpCapacity: objectSchema({
      format: { enum: [binding.format] },
      namespace: { enum: [binding.namespace] },
      maxRecipients: { ...numeric, enum: [binding.maxRecipients] },
    }),
  };
}

function countsSchema(capacity?: CapacityContext) {
  const count = capacity ? { ...numeric, minimum: 0, maximum: recipientLimit(capacity) } : numeric;
  return objectSchema({ to: count, cc: count, bcc: count });
}

function smtpSnapshot(capacity: CapacityContext) {
  const mailbox = objectSchema({ address: string, name: string }, ['name']);
  const recipients = { bsonType: 'array', maxItems: recipientLimit(capacity), items: mailbox };
  return objectSchema(
    {
      version,
      ...capacityField(capacity),
      kind: { enum: ['smtp'] },
      provider: smtpProvider,
      template,
      envelope: objectSchema({ from: mailbox, to: recipients, cc: recipients, bcc: recipients, replyTo: mailbox }, [
        'replyTo',
      ]),
      preparedAt: time,
      expiresAt: time,
      priority: { ...numeric, minimum: PRIORITY.min, maximum: PRIORITY.max },
      attachments: { bsonType: 'array', maxItems: MESSAGE_LIMITS.attachments, items: bsonObject },
      correlation,
      subject: string,
      html: string,
      text: string,
    },
    ['html', 'text'],
  );
}

function withBsonLimit(validator: Document, maxBytes: number | undefined): Document {
  // Use the replica set's actual encoded size, including metadata, array indexes and stub dates.
  return maxBytes === undefined
    ? validator
    : {
        $and: [validator, { $expr: { $lte: [{ $bsonSize: '$$ROOT' }, maxBytes] } }],
      };
}

export function jobValidator(capacity?: CapacityContext): Document {
  const validator = {
    $jsonSchema: {
      ...objectSchema(
        {
          _id: string,
          version,
          ...(capacity ? { ...capacityField(capacity), intentHash: digest } : {}),
          scope,
          jobId: uuid,
          key: {
            oneOf: [
              objectSchema({ kind: { enum: ['single'] }, idempotencyKey: string }),
              objectSchema({ kind: { enum: ['batch'] }, batchId: string, itemId: string }),
            ],
          },
          admissionKey: string,
          fingerprint: digest,
          snapshotHash: digest,
          snapshot: capacity ? smtpSnapshot(capacity) : bsonObject,
          retry: objectSchema({ maxAttempts: numeric, baseDelayMs: numeric, maxDelayMs: numeric }),
          retention: objectSchema({ payloadMs: numeric, historyMs: numeric, idempotencyMs: numeric }),
          provider: capacity ? smtpProvider : provider,
          template,
          correlation,
          recipientCounts: countsSchema(capacity),
          scheduleAt: { anyOf: [time, { bsonType: 'null' }] },
          createdAt: time,
          updatedAt: time,
          messageExpiresAt: time,
          priority: { ...numeric, minimum: PRIORITY.min, maximum: PRIORITY.max },
          revision: uuid,
          lifecycle,
          state: { enum: ['queued', 'leased', 'terminal'] },
          attempts: { bsonType: 'array', items: ledgerAttempt(capacity), maxItems: MAX_ATTEMPT_LEDGER },
          resolutions: {
            bsonType: 'array',
            maxItems: 2,
            items: objectSchema({ attemptId: uuid, at: time, action: { enum: ['dismiss', 'redrive'] } }),
          },
          projectionPermitUntil: time,
          retiring: { enum: [true] },
          nextAt: time,
          expiresAt: time,
          leaseEndsAt: time,
          pendingAt: time,
          nextCleanupAt: time,
        } satisfies Record<Exclude<keyof JobBson, 'smtpCapacity' | 'intentHash'>, Document>,
        jobOptional,
      ),
      oneOf: [
        {
          properties: { state: { enum: ['queued'] } },
          required: ['nextAt', 'expiresAt'],
          not: { required: ['leaseEndsAt'] },
        },
        {
          properties: { state: { enum: ['leased'] } },
          required: ['leaseEndsAt'],
          not: { anyOf: [{ required: ['nextAt'] }, { required: ['expiresAt'] }] },
        },
        {
          properties: { state: { enum: ['terminal'] } },
          not: { anyOf: [{ required: ['nextAt'] }, { required: ['expiresAt'] }, { required: ['leaseEndsAt'] }] },
        },
      ],
    },
  };
  return withBsonLimit(validator, capacity?.limits.jobBsonBytes);
}

export function activityValidator(capacity?: CapacityContext): Document {
  const identity = { _id: uuid, scope, jobId: uuid, attemptId: uuid, ...(capacity ? capacityField(capacity) : {}) };
  const validator = {
    $jsonSchema: {
      oneOf: [
        objectSchema(
          {
            ...identity,
            version,
            complete: { enum: [true] },
            digest,
            ordinal,
            provider: capacity ? smtpProvider : provider,
            ...(capacity ? { recipientCounts: countsSchema(capacity) } : {}),
            template,
            correlation,
            startedAt: time,
            handedOffAt: time,
            finishedAt: time,
            result: objectSchema(resultFields(capacity), resultOptional),
            disposition: string,
          } satisfies Record<Exclude<keyof ActivityBson, 'smtpCapacity' | 'recipientCounts'>, Document>,
          activityOptional,
        ),
        objectSchema({ ...identity, stubDeleteAt: { bsonType: 'date' } }),
      ],
    },
  };
  return withBsonLimit(validator, capacity?.limits.activityBsonBytes);
}
