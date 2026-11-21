import {
  EMAIL_FORMAT_VERSION,
  MAX_ATTEMPT_LEDGER,
  MAX_PREPARED_AT_SKEW_MS,
  PRIORITY,
  PROJECTION_DRAIN_MS,
  PROJECTION_PERMIT_MS,
  WORKER_LIMIT_BOUNDS,
} from '../constants';
import type { EmailJobState, EmailJobSummary, RetentionPolicy, RetryPolicy, UnknownResolution } from '../contracts/job';
import type {
  Correlation,
  EmailAdmissionKey,
  EmailSnapshot,
  ProviderRef,
  SmtpCapacity,
  TemplateIdentity,
  UnixMs,
} from '../contracts/message';
import type { AttemptCommit } from '../contracts/store';
import { activityDigest, activityFor, readDisposition } from './activity-codecs';
import {
  assertEvidenceContext,
  assertEvidencePhase,
  attemptEffect,
  readAttemptReason,
  readAttemptResult,
  readRecipientCounts,
  recipientCounts,
  type RecipientCounts,
} from './attempt-codecs';
import { canonicalJson } from './canonical-json';
import { encodeAdmissionKey, fingerprintFor, validateAdmissionKey } from './command-codecs';
import { readUnknownResolution } from './job-summary';
import { validateCorrelation, validateProviderRef, validateSnapshot, validateTemplateIdentity } from './message-codecs';
import { assertCapacityProvider, assertCapacityTag, capacityTag, type CapacityContext } from './smtp-capacity';
import { readLeaseToken, readRetentionPolicy, readRetryPolicy, readStoreId, timeAfter } from './store-codecs';
import { hashToken, integer, invalid, readArray, readRecord, scopeToken, unixMs } from './validation';

const STORED = 'store_incompatible';

export type ActiveLease = Readonly<{
  attemptId: string;
  token: string;
  startedAt: UnixMs;
  grantedAt: UnixMs;
  leaseEndsAt: UnixMs;
  handedOffAt?: UnixMs;
}>;
type Queued = Extract<EmailJobState, { state: 'queued' }>;
type Terminal = Extract<EmailJobState, { state: 'terminal' }> & Readonly<{ settledAt?: UnixMs }>;
export type JobState = Queued | Terminal | Readonly<{ state: 'leased'; lease: ActiveLease }>;

export type LedgerAttempt = Readonly<{
  commit: AttemptCommit;
  /** Private digest for exact owner-finish replay; never an owner token or part of a DTO. */
  ownerDigest?: string;
  digest: string;
  permitUntil?: UnixMs;
  projectionAckAt?: UnixMs;
}>;

/** Authoritative logical JSON, not a hydrated model or a physical database row. */
export type JobRecord = Readonly<{
  version: 1;
  smtpCapacity?: SmtpCapacity;
  scope: string;
  jobId: string;
  key: EmailAdmissionKey;
  admissionKey: string;
  fingerprint: string;
  /** V2 retains only the intent digest, so fingerprint integrity survives snapshot pruning. */
  intentHash?: string;
  snapshot?: EmailSnapshot;
  snapshotHash: string;
  retry: Readonly<RetryPolicy>;
  retention: Readonly<RetentionPolicy>;
  provider: ProviderRef;
  template: TemplateIdentity;
  correlation: Correlation;
  recipientCounts: RecipientCounts;
  scheduleAt: UnixMs | null;
  createdAt: UnixMs;
  updatedAt: UnixMs;
  expiresAt: UnixMs;
  priority: number;
  revision: string;
  state: JobState;
  attempts: readonly LedgerAttempt[];
  resolutions: readonly UnknownResolution[];
  projectionPermitUntil?: UnixMs;
  retiring?: true;
}>;

export function leasePhase(lease: ActiveLease): 'pre_handoff' | 'handed_off' {
  return lease.handedOffAt === undefined ? 'pre_handoff' : 'handed_off';
}

export function terminalState(
  disposition: Terminal['disposition'],
  terminalReason: Terminal['terminalReason'],
  now: UnixMs,
): Terminal {
  return Object.freeze({
    state: 'terminal',
    disposition,
    terminalReason,
    terminalAt: now,
    ...(disposition === 'unknown' ? {} : { settledAt: now }),
  });
}

export function hasRedrive(job: JobRecord): boolean {
  return job.resolutions.some(({ action }) => action === 'redrive');
}

export function pendingAttempt(job: JobRecord): LedgerAttempt | undefined {
  return job.attempts.find(({ projectionAckAt }) => projectionAckAt === undefined);
}

function retirementAt(job: JobRecord): UnixMs | undefined {
  if (job.state.state !== 'terminal' || job.state.settledAt === undefined || pendingAttempt(job)) return;
  const { settledAt } = job.state;
  const payload = timeAfter(settledAt, job.retention.payloadMs);
  const history = timeAfter(settledAt, job.retention.historyMs);
  const identity = timeAfter(settledAt, job.retention.idempotencyMs);
  const drain = job.projectionPermitUntil === undefined ? 0 : timeAfter(job.projectionPermitUntil, PROJECTION_DRAIN_MS);
  if (payload === undefined || history === undefined || identity === undefined || drain === undefined) return;
  return Math.max(payload, history, identity, drain);
}

function cleanupAt(job: JobRecord): UnixMs | undefined {
  if (job.retiring) return job.updatedAt;
  if (job.state.state !== 'terminal' || job.state.settledAt === undefined || pendingAttempt(job)) return;
  if (job.snapshot) {
    const payloadAt = timeAfter(job.state.settledAt, job.retention.payloadMs);
    if (payloadAt === undefined) return;
    return Math.max(payloadAt, job.attempts.at(-1)?.projectionAckAt ?? 0);
  }
  const retireAt = retirementAt(job);
  return retireAt === undefined ? undefined : Math.max(retireAt, job.updatedAt);
}

/** Separate from logical JSON. A backend stores/indexes only its physical representation of these keys. */
export type JobSelectors = Readonly<{
  state: JobState['state'];
  nextAt?: UnixMs;
  queuedExpiresAt?: UnixMs;
  leaseEndsAt?: UnixMs;
  pendingAt?: UnixMs;
  nextCleanupAt?: UnixMs;
}>;

export function jobSelectors(job: JobRecord): JobSelectors {
  const { state } = job;
  const pendingAt = pendingAttempt(job)?.commit.finishedAt;
  const nextCleanupAt = cleanupAt(job);
  return {
    state: state.state,
    ...(state.state === 'queued' ? { nextAt: state.nextAt, queuedExpiresAt: job.expiresAt } : {}),
    ...(state.state === 'leased' ? { leaseEndsAt: state.lease.leaseEndsAt } : {}),
    ...(pendingAt === undefined ? {} : { pendingAt }),
    ...(nextCleanupAt === undefined ? {} : { nextCleanupAt }),
  };
}

export function jobSummary(job: JobRecord): EmailJobSummary {
  const { state } = job;
  let summaryState: EmailJobState;
  if (state.state === 'terminal') {
    const { disposition, terminalReason, terminalAt } = state;
    summaryState = { state: 'terminal', disposition, terminalReason, terminalAt };
  } else if (state.state === 'leased') {
    summaryState = { state: 'leased', phase: leasePhase(state.lease) };
  } else {
    summaryState = { state: 'queued', nextAt: state.nextAt };
  }
  const latest = job.attempts.at(-1)?.commit;
  return Object.freeze({
    version: EMAIL_FORMAT_VERSION,
    ...(job.smtpCapacity ? { smtpCapacity: job.smtpCapacity } : {}),
    scope: job.scope,
    jobId: job.jobId,
    key: Object.freeze({ ...job.key }),
    provider: Object.freeze({ ...job.provider }),
    template: Object.freeze({ ...job.template }),
    correlation: validateCorrelation(job.correlation, STORED),
    scheduleAt: job.scheduleAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    expiresAt: job.expiresAt,
    priority: job.priority,
    attemptCount: job.attempts.length + Number(state.state === 'leased'),
    ...(latest
      ? {
          latestAttempt: Object.freeze({
            attemptId: latest.attemptId,
            outcome: latest.result.outcome,
            reason: latest.result.reason,
          }),
        }
      : {}),
    unknownOpen: state.state === 'terminal' && state.disposition === 'unknown' && state.settledAt === undefined,
    resolutions: Object.freeze(job.resolutions.map((entry) => Object.freeze({ ...entry }))),
    ...summaryState,
  });
}

export function copyCommit(commit: AttemptCommit, capacity?: CapacityContext): AttemptCommit {
  return Object.freeze({ ...commit, result: readAttemptResult(commit.result, STORED, false, capacity) });
}

type JobMetadata = Pick<
  JobRecord,
  'provider' | 'template' | 'correlation' | 'recipientCounts' | 'snapshotHash' | 'expiresAt' | 'priority' | 'createdAt'
>;

export function readStoredSnapshot(job: JobMetadata, input: unknown, capacity?: CapacityContext): EmailSnapshot {
  let validated;
  try {
    validated = validateSnapshot(input, capacity);
  } catch {
    return invalid(STORED);
  }
  const { snapshot, snapshotHash } = validated;
  const metadata = (value: Pick<JobRecord, 'provider' | 'template' | 'correlation'>, counts: RecipientCounts) =>
    canonicalJson([value.provider, value.template, value.correlation, counts], 4_096, STORED).encoded;
  if (
    snapshotHash !== job.snapshotHash ||
    snapshot.preparedAt - job.createdAt > MAX_PREPARED_AT_SKEW_MS ||
    snapshot.expiresAt !== job.expiresAt ||
    snapshot.priority !== job.priority ||
    metadata(snapshot, recipientCounts(snapshot.envelope)) !== metadata(job, job.recipientCounts)
  ) {
    invalid(STORED);
  }
  return snapshot;
}

function optionalTime(raw: object, key: string): UnixMs | undefined {
  return Object.hasOwn(raw, key) ? unixMs(Reflect.get(raw, key), STORED) : undefined;
}

function readState(input: unknown): JobState {
  const raw = readRecord(
    input,
    ['state'],
    ['nextAt', 'lease', 'disposition', 'terminalReason', 'terminalAt', 'settledAt'],
    STORED,
  );
  if (raw.state === 'queued') {
    const { nextAt } = readRecord(raw, ['state', 'nextAt'], [], STORED);
    return Object.freeze({ state: raw.state, nextAt: unixMs(nextAt, STORED) });
  }
  if (raw.state === 'leased') {
    const { lease } = readRecord(raw, ['state', 'lease'], [], STORED);
    const active = readRecord(
      lease,
      ['attemptId', 'token', 'startedAt', 'grantedAt', 'leaseEndsAt'],
      ['handedOffAt'],
      STORED,
    );
    const startedAt = unixMs(active.startedAt, STORED);
    const grantedAt = unixMs(active.grantedAt, STORED);
    const leaseEndsAt = unixMs(active.leaseEndsAt, STORED);
    const handedOffAt = optionalTime(active, 'handedOffAt');
    const bounds = WORKER_LIMIT_BOUNDS.leaseMs;
    integer(leaseEndsAt - grantedAt, bounds.min, bounds.max, STORED);
    if (grantedAt < startedAt || (handedOffAt !== undefined && handedOffAt !== grantedAt)) invalid(STORED);
    return Object.freeze({
      state: raw.state,
      lease: Object.freeze({
        attemptId: readStoreId(active.attemptId, STORED),
        token: readLeaseToken(active.token, STORED),
        startedAt,
        grantedAt,
        leaseEndsAt,
        ...(handedOffAt === undefined ? {} : { handedOffAt }),
      }),
    });
  }
  if (raw.state === 'terminal') {
    readRecord(raw, ['state', 'disposition', 'terminalReason', 'terminalAt'], ['settledAt'], STORED);
    const disposition = readDisposition(raw.disposition, STORED);
    if (disposition === 'retry_scheduled') invalid(STORED);
    const settledAt = optionalTime(raw, 'settledAt');
    return Object.freeze({
      state: raw.state,
      disposition,
      terminalReason:
        raw.terminalReason === 'attempts_exhausted'
          ? raw.terminalReason
          : readAttemptReason(raw.terminalReason, STORED),
      terminalAt: unixMs(raw.terminalAt, STORED),
      ...(settledAt === undefined ? {} : { settledAt }),
    });
  }
  return invalid(STORED);
}

function readLedgerAttempt(
  input: unknown,
  job: Pick<
    JobRecord,
    'scope' | 'jobId' | 'provider' | 'template' | 'correlation' | 'recipientCounts' | 'expiresAt' | 'updatedAt'
  >,
  capacity?: CapacityContext,
): LedgerAttempt {
  const entry = readRecord(input, ['commit', 'digest'], ['ownerDigest', 'permitUntil', 'projectionAckAt'], STORED);
  const raw = readRecord(
    entry.commit,
    ['jobId', 'attemptId', 'ordinal', 'operationId', 'startedAt', 'finishedAt', 'result', 'disposition', 'reason'],
    ['handedOffAt', 'retryAt'],
    STORED,
  );
  const attemptId = readStoreId(raw.attemptId, STORED);
  const startedAt = unixMs(raw.startedAt, STORED);
  const handedOffAt = optionalTime(raw, 'handedOffAt');
  const finishedAt = unixMs(raw.finishedAt, STORED);
  const retryAt = optionalTime(raw, 'retryAt');
  const result = readAttemptResult(raw.result, STORED, false, capacity);
  const ownerDigest = Object.hasOwn(entry, 'ownerDigest') ? hashToken(entry.ownerDigest, STORED) : undefined;
  const internal =
    result.reason === 'pre_handoff_lease_expired' ||
    result.reason === 'post_handoff_lease_expired' ||
    result.reason === 'cancelled';
  if (
    raw.jobId !== job.jobId ||
    startedAt >= job.expiresAt ||
    finishedAt < startedAt ||
    finishedAt > job.updatedAt ||
    (handedOffAt !== undefined &&
      (handedOffAt < startedAt || handedOffAt >= job.expiresAt || handedOffAt > finishedAt)) ||
    (result.reason === 'cancelled' && finishedAt >= job.expiresAt) ||
    (result.reason === 'expired' && finishedAt < job.expiresAt) ||
    (result.reason === 'pre_handoff_lease_expired' && finishedAt - startedAt < WORKER_LIMIT_BOUNDS.leaseMs.min) ||
    (result.reason === 'post_handoff_lease_expired' &&
      (handedOffAt === undefined || finishedAt - handedOffAt < WORKER_LIMIT_BOUNDS.leaseMs.min)) ||
    (ownerDigest === undefined) !== internal
  ) {
    invalid(STORED);
  }
  assertEvidencePhase(result.reason, handedOffAt === undefined ? 'pre_handoff' : 'handed_off', 'ledger', STORED);
  assertEvidenceContext(result, job.provider, attemptId, job.recipientCounts, STORED);
  const commit = Object.freeze({
    jobId: job.jobId,
    attemptId,
    ordinal: integer(raw.ordinal, 1, MAX_ATTEMPT_LEDGER, STORED),
    operationId: readStoreId(raw.operationId, STORED),
    startedAt,
    ...(handedOffAt === undefined ? {} : { handedOffAt }),
    finishedAt,
    result,
    disposition: readDisposition(raw.disposition, STORED),
    reason: raw.reason === 'attempts_exhausted' ? raw.reason : readAttemptReason(raw.reason, STORED),
    ...(retryAt === undefined ? {} : { retryAt }),
  });
  const permitUntil = optionalTime(entry, 'permitUntil');
  const projectionAckAt = optionalTime(entry, 'projectionAckAt');
  if (
    (permitUntil !== undefined &&
      (permitUntil - finishedAt < PROJECTION_PERMIT_MS || permitUntil - job.updatedAt > PROJECTION_PERMIT_MS)) ||
    (projectionAckAt !== undefined &&
      (permitUntil === undefined ||
        projectionAckAt < permitUntil - PROJECTION_PERMIT_MS ||
        projectionAckAt > job.updatedAt))
  ) {
    invalid(STORED);
  }
  const digest = hashToken(entry.digest, STORED);
  if (digest !== activityDigest(activityFor(job, commit, capacity), capacity)) invalid(STORED);
  return Object.freeze({
    commit,
    digest,
    ...(ownerDigest === undefined ? {} : { ownerDigest }),
    ...(permitUntil === undefined ? {} : { permitUntil }),
    ...(projectionAckAt === undefined ? {} : { projectionAckAt }),
  });
}

/** Bounded consistency check: reconstruct eligibility and adjudication from the immutable ledger. */
function assertHistory(job: JobRecord): void {
  const { state, retry, expiresAt } = job;
  const seen = new Set<string>();
  let nextAt: UnixMs | undefined = Math.max(job.createdAt, job.scheduleAt ?? job.createdAt);
  let transitionAt = job.createdAt;
  let resolved = 0;
  let manual = false;
  let terminal: Terminal | undefined;
  let highWater: UnixMs | undefined;
  let pending = false;
  let lastAck = 0;
  for (const { commit, permitUntil, projectionAckAt } of job.attempts) {
    const { attemptId, ordinal, startedAt, finishedAt, result, disposition, reason, retryAt } = commit;
    if (
      nextAt === undefined ||
      startedAt < nextAt ||
      seen.has(attemptId) ||
      ordinal !== seen.size + 1 ||
      (!manual && ordinal > retry.maxAttempts)
    ) {
      invalid(STORED);
    }
    seen.add(attemptId);
    const expected = attemptEffect(result, attemptId, ordinal, manual, retry, expiresAt, finishedAt);
    if (disposition !== expected.disposition || reason !== expected.reason || retryAt !== expected.retryAt)
      invalid(STORED);
    if (permitUntil !== undefined) {
      if (pending || permitUntil - PROJECTION_PERMIT_MS < lastAck) invalid(STORED);
      highWater = permitUntil;
    }
    if (projectionAckAt === undefined) pending = true;
    else lastAck = projectionAckAt;
    transitionAt = finishedAt;
    nextAt = retryAt;
    if (disposition === 'retry_scheduled') continue;
    terminal = terminalState(disposition, reason, finishedAt);
    const resolution = job.resolutions[resolved];
    if (disposition === 'unknown' && resolution?.attemptId === attemptId) {
      resolved++;
      if (resolution.at < finishedAt || resolution.at > job.updatedAt) invalid(STORED);
      transitionAt = resolution.at;
      if (resolution.action === 'dismiss') {
        terminal = { ...terminal, settledAt: resolution.at };
      } else {
        if (manual || resolution.at >= expiresAt) invalid(STORED);
        manual = true;
        terminal = undefined;
        nextAt = resolution.at;
      }
    }
  }
  if (resolved !== job.resolutions.length || highWater !== job.projectionPermitUntil) invalid(STORED);
  if (state.state === 'queued') {
    if (nextAt === undefined || nextAt !== state.nextAt || (!manual && seen.size >= retry.maxAttempts)) invalid(STORED);
  } else if (state.state === 'leased') {
    const { lease } = state;
    if (
      nextAt === undefined ||
      lease.startedAt < nextAt ||
      lease.startedAt >= expiresAt ||
      lease.grantedAt >= expiresAt ||
      lease.grantedAt > job.updatedAt ||
      seen.has(lease.attemptId) ||
      (!manual && seen.size >= retry.maxAttempts)
    ) {
      invalid(STORED);
    }
  } else {
    if (!terminal) {
      const { disposition, terminalAt } = state;
      const expired = terminalAt >= expiresAt;
      if (
        nextAt === undefined ||
        (disposition !== 'expired' && disposition !== 'cancelled') ||
        (disposition === 'expired') !== expired ||
        terminalAt < transitionAt
      ) {
        invalid(STORED);
      }
      terminal = terminalState(disposition, disposition, terminalAt);
    }
    if (
      state.disposition !== terminal.disposition ||
      state.terminalReason !== terminal.terminalReason ||
      state.terminalAt !== terminal.terminalAt ||
      state.terminalAt > job.updatedAt ||
      state.settledAt !== terminal.settledAt
    ) {
      invalid(STORED);
    }
  }
  if (!job.snapshot) {
    const pruneAt =
      state.state === 'terminal' && state.settledAt !== undefined && !pendingAttempt(job)
        ? timeAfter(state.settledAt, job.retention.payloadMs)
        : undefined;
    if (pruneAt === undefined || pruneAt > job.updatedAt) invalid(STORED);
  }
  if (job.retiring) {
    const retireAt = retirementAt(job);
    if (job.snapshot || retireAt === undefined || retireAt > job.updatedAt) invalid(STORED);
  }
}

/** Decode a mapped physical row at the storage boundary, rejecting malformed or inconsistent logical JSON. */
export function readJobRecord(scope: string, input: unknown, capacity?: CapacityContext): JobRecord {
  const raw = readRecord(
    input,
    [
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
      'expiresAt',
      'priority',
      'revision',
      'state',
      'attempts',
      'resolutions',
    ],
    ['snapshot', 'projectionPermitUntil', 'retiring', 'smtpCapacity', 'intentHash'],
    STORED,
  );
  if (raw.version !== EMAIL_FORMAT_VERSION || scopeToken(raw.scope, STORED) !== scope) invalid(STORED);
  assertCapacityTag(raw, capacity, STORED);
  const recipients = readRecipientCounts(raw.recipientCounts, STORED, capacity);
  const key = validateAdmissionKey(raw.key, STORED);
  const admissionKey = encodeAdmissionKey(key);
  if (raw.admissionKey !== admissionKey) invalid(STORED);
  if (!capacity && Object.hasOwn(raw, 'intentHash')) invalid(STORED);
  const intentHash = capacity ? hashToken(raw.intentHash, STORED) : undefined;
  const base = {
    version: EMAIL_FORMAT_VERSION,
    ...capacityTag(capacity),
    scope,
    jobId: readStoreId(raw.jobId, STORED),
    key,
    admissionKey,
    fingerprint: hashToken(raw.fingerprint, STORED),
    ...(intentHash === undefined ? {} : { intentHash }),
    snapshotHash: hashToken(raw.snapshotHash, STORED),
    retry: readRetryPolicy(raw.retry, STORED),
    retention: readRetentionPolicy(raw.retention, STORED),
    provider: validateProviderRef(raw.provider, STORED),
    template: validateTemplateIdentity(raw.template, STORED),
    correlation: validateCorrelation(raw.correlation, STORED),
    recipientCounts: recipients,
    scheduleAt: raw.scheduleAt === null ? null : unixMs(raw.scheduleAt, STORED),
    createdAt: unixMs(raw.createdAt, STORED),
    updatedAt: unixMs(raw.updatedAt, STORED),
    expiresAt: unixMs(raw.expiresAt, STORED),
    priority: integer(raw.priority, PRIORITY.min, PRIORITY.max, STORED),
    revision: readStoreId(raw.revision, STORED),
    state: readState(raw.state),
  } as const;
  assertCapacityProvider(base.provider, capacity, STORED);
  if (
    intentHash !== undefined &&
    base.fingerprint !== fingerprintFor({ ...base, templateKey: base.template.key, intentHash }, capacity)
  ) {
    invalid(STORED);
  }
  if (
    base.createdAt > base.updatedAt ||
    Math.max(base.createdAt, base.scheduleAt ?? 0) >= base.expiresAt ||
    (base.provider.kind === 'sendgrid' && !recipients.to)
  ) {
    invalid(STORED);
  }
  const projectionPermitUntil = optionalTime(raw, 'projectionPermitUntil');
  const retiring = Object.hasOwn(raw, 'retiring');
  if (retiring && raw.retiring !== true) invalid(STORED);
  // The checked snapshot, up to 11 bounded ledger entries and shape-bounded metadata
  // (including Mongo selectors) fit the 3 MiB V2 job budget without serializing the full job.
  const job: JobRecord = Object.freeze({
    ...base,
    ...(Object.hasOwn(raw, 'snapshot') ? { snapshot: readStoredSnapshot(base, raw.snapshot, capacity) } : {}),
    attempts: readArray(raw.attempts, MAX_ATTEMPT_LEDGER, STORED, (entry) => readLedgerAttempt(entry, base, capacity)),
    resolutions: readArray(raw.resolutions, 2, STORED, readUnknownResolution),
    ...(projectionPermitUntil === undefined ? {} : { projectionPermitUntil }),
    ...(retiring ? { retiring: true } : {}),
  });
  assertHistory(job);
  return job;
}
