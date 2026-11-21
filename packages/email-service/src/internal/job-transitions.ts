import { EMAIL_FORMAT_VERSION, MAX_ATTEMPT_LEDGER, MAX_PREPARED_AT_SKEW_MS, PROJECTION_PERMIT_MS } from '../constants';
import type { CancelResult, ResolveUnknownCommand, ResolveUnknownResult } from '../contracts/job';
import type { UnixMs } from '../contracts/message';
import type { AttemptResult } from '../contracts/provider';
import type {
  AttemptCommit,
  ClaimedEmail,
  CleanupStep,
  HandoffGrant,
  LeaseGrant,
  OwnerFence,
  ProjectionPermit,
} from '../contracts/store';
import { activityDigest, activityFor, type StoredActivity } from './activity-codecs';
import {
  assertEvidenceContext,
  assertEvidencePhase,
  attemptEffect,
  lifecycleEvidence,
  recipientCounts,
} from './attempt-codecs';
import { encodeEvidence, sha256 } from './canonical-json';
import {
  copyCommit,
  hasRedrive,
  jobSelectors,
  jobSummary,
  leasePhase,
  pendingAttempt,
  readStoredSnapshot,
  terminalState,
  type ActiveLease,
  type JobRecord,
  type LedgerAttempt,
} from './job-record';
import { capacityTag, type CapacityContext } from './smtp-capacity';
import { timeAfter, type ClaimRequest, type FinishRequest, type ValidatedAdmission } from './store-codecs';
import { invalid, unixMs } from './validation';

/** Trusted inputs from the adapter: sampled store time and a fresh independent revision UUID. */
export type DecisionTime = Readonly<{ now: UnixMs; revision: string }>;

/** A durable backend matches this exact identity, revision, phase and lease, and checks the half-open time
 * window at the mutation, using server time. The lower bound also covers all monotone due/expiry guards. */
export type JobGuard = Readonly<{
  scope: string;
  jobId: string;
  revision: string;
  state: JobRecord['state'];
  retiring?: true;
  pendingAck?: Readonly<{ attemptId: string; digest: string }>;
  atOrAfter: UnixMs;
  before?: UnixMs;
}>;

export type JobWrite =
  | Readonly<{ kind: 'replace'; guard: JobGuard; next: JobRecord }>
  | Readonly<{ kind: 'purge'; guard: JobGuard; attemptIds: readonly string[] }>;

/** Return `value` only after positive confirmation of the exact write, if one is required. */
export type JobDecision<T> = Readonly<{ value: T; write?: JobWrite }>;

function guard(job: JobRecord, { now }: DecisionTime, before?: UnixMs): JobGuard {
  if (unixMs(now, 'store_unavailable') < job.updatedAt || (before !== undefined && now >= before)) {
    invalid('store_unavailable');
  }
  return {
    scope: job.scope,
    jobId: job.jobId,
    revision: job.revision,
    state: job.state,
    ...(job.retiring ? { retiring: true } : {}),
    atOrAfter: now,
    ...(before === undefined ? {} : { before }),
  };
}

function replace<T>(
  job: JobRecord,
  time: DecisionTime,
  patch: JobRecord,
  value: (next: JobRecord) => T,
  before?: UnixMs,
  pendingAck?: JobGuard['pendingAck'],
): JobDecision<T> {
  const expect = guard(job, time, before);
  const next = Object.freeze({ ...patch, updatedAt: time.now, revision: time.revision });
  return {
    value: value(next),
    write: { kind: 'replace', guard: pendingAck ? { ...expect, pendingAck } : expect, next },
  };
}

/** Call only after a genuine miss for the scoped admission identity. Never use freshness to reject a replay. */
export function newJob(admission: ValidatedAdmission, time: DecisionTime, capacity?: CapacityContext): JobRecord {
  const { command, jobId, retry, retention, admissionKey } = admission;
  const { scope, key, scheduleAt, fingerprint, snapshotHash, snapshot } = command;
  const now = unixMs(time.now, 'store_unavailable');
  if (snapshot.preparedAt - now > MAX_PREPARED_AT_SKEW_MS) invalid('invalid_snapshot');
  const nextAt = Math.max(now, scheduleAt ?? now);
  if (nextAt >= snapshot.expiresAt) invalid('expired');
  return Object.freeze({
    version: EMAIL_FORMAT_VERSION,
    ...capacityTag(capacity),
    ...(capacity ? { intentHash: command.intentHash } : {}),
    scope,
    jobId,
    key,
    admissionKey,
    fingerprint,
    snapshotHash,
    snapshot,
    retry,
    retention,
    provider: snapshot.provider,
    template: snapshot.template,
    correlation: snapshot.correlation,
    recipientCounts: recipientCounts(snapshot.envelope),
    scheduleAt,
    createdAt: now,
    updatedAt: now,
    expiresAt: snapshot.expiresAt,
    priority: snapshot.priority,
    revision: time.revision,
    state: Object.freeze({ state: 'queued', nextAt } as const),
    attempts: Object.freeze([]),
    resolutions: Object.freeze([]),
  });
}

function endOfGrant(now: UnixMs, leaseMs: number): UnixMs {
  return timeAfter(now, leaseMs) ?? invalid('store_unavailable');
}

function withLease(job: JobRecord, lease: ActiveLease): JobRecord {
  return { ...job, state: Object.freeze({ state: 'leased', lease: Object.freeze(lease) }) };
}

function liveLease(job: JobRecord, fence: OwnerFence, phase: ReturnType<typeof leasePhase>, now: UnixMs) {
  if (job.jobId !== fence.jobId || job.state.state !== 'leased') return;
  const { lease } = job.state;
  if (
    lease.attemptId !== fence.attemptId ||
    lease.token !== fence.token ||
    leasePhase(lease) !== phase ||
    now >= lease.leaseEndsAt
  ) {
    return;
  }
  return lease;
}

export function claimJob(
  job: JobRecord,
  claim: ClaimRequest,
  time: DecisionTime,
  capacity?: CapacityContext,
): JobDecision<ClaimedEmail> | null {
  const { now } = time;
  if (job.state.state !== 'queued' || job.state.nextAt > now || now >= job.expiresAt) return null;
  const manual = hasRedrive(job);
  const ordinal = job.attempts.length + 1;
  if (ordinal > MAX_ATTEMPT_LEDGER || (!manual && ordinal > job.retry.maxAttempts)) invalid('store_incompatible');
  if (job.attempts.some(({ commit }) => commit.attemptId === claim.attemptId)) invalid('invalid_command');
  const snapshot = readStoredSnapshot(job, job.snapshot, capacity);
  const lease = Object.freeze({
    attemptId: claim.attemptId,
    token: claim.token,
    startedAt: now,
    grantedAt: now,
    leaseEndsAt: endOfGrant(now, claim.leaseMs),
  });
  return replace(
    job,
    time,
    withLease(job, lease),
    (next) =>
      Object.freeze({
        job: jobSummary(next),
        snapshot,
        fence: Object.freeze({ jobId: job.jobId, attemptId: lease.attemptId, token: lease.token }),
        lease: Object.freeze({ grantedAt: lease.grantedAt, leaseEndsAt: lease.leaseEndsAt }),
        ordinal,
        manual,
      }),
    Math.min(job.expiresAt, lease.leaseEndsAt),
  );
}

export function renewJob(
  job: JobRecord,
  fence: OwnerFence,
  leaseMs: number,
  time: DecisionTime,
): JobDecision<LeaseGrant> | null {
  const lease = liveLease(job, fence, 'pre_handoff', time.now);
  if (!lease || time.now >= job.expiresAt) return null;
  const grant = Object.freeze({
    grantedAt: time.now,
    // A renewal never shortens a still-live grant, even if the caller requests a smaller duration.
    leaseEndsAt: Math.max(lease.leaseEndsAt, endOfGrant(time.now, leaseMs)),
  });
  return replace(
    job,
    time,
    withLease(job, { ...lease, ...grant }),
    () => grant,
    Math.min(job.expiresAt, lease.leaseEndsAt),
  );
}

export function markJob(
  job: JobRecord,
  fence: OwnerFence,
  leaseMs: number,
  time: DecisionTime,
): JobDecision<HandoffGrant> | null {
  const lease = liveLease(job, fence, 'pre_handoff', time.now);
  if (!lease || time.now >= job.expiresAt) return null;
  const grant = Object.freeze({
    grantedAt: time.now,
    handoffAt: time.now,
    leaseEndsAt: endOfGrant(time.now, leaseMs),
  });
  return replace(
    job,
    time,
    withLease(job, {
      ...lease,
      grantedAt: grant.grantedAt,
      handedOffAt: grant.handoffAt,
      leaseEndsAt: grant.leaseEndsAt,
    }),
    () => grant,
    Math.min(job.expiresAt, lease.leaseEndsAt, grant.leaseEndsAt),
  );
}

function finalize(
  job: JobRecord,
  lease: ActiveLease,
  operationId: string,
  result: AttemptResult,
  time: DecisionTime,
  owner: boolean,
  capacity?: CapacityContext,
): JobDecision<AttemptCommit> {
  const { now } = time;
  const { attemptId, startedAt, handedOffAt } = lease;
  const ordinal = job.attempts.length + 1;
  const effect = attemptEffect(result, attemptId, ordinal, hasRedrive(job), job.retry, job.expiresAt, now);
  const commit: AttemptCommit = Object.freeze({
    jobId: job.jobId,
    attemptId,
    ordinal,
    operationId,
    startedAt,
    ...(handedOffAt === undefined ? {} : { handedOffAt }),
    finishedAt: now,
    result,
    ...effect,
  });
  const entry: LedgerAttempt = Object.freeze({
    commit,
    digest: activityDigest(activityFor(job, commit, capacity), capacity),
    ...(owner ? { ownerDigest: sha256(lease.token) } : {}),
  });
  const state =
    effect.disposition === 'retry_scheduled'
      ? Object.freeze({ state: 'queued', nextAt: effect.retryAt } as const)
      : terminalState(effect.disposition, effect.reason, now);
  let before = owner ? lease.leaseEndsAt : undefined;
  if (result.reason === 'cancelled' || (result.retry === 'safe_transient' && effect.disposition !== 'expired')) {
    before = Math.min(before ?? job.expiresAt, job.expiresAt);
  }
  return replace(
    job,
    time,
    { ...job, state, attempts: Object.freeze([...job.attempts, entry]) },
    () => copyCommit(commit, capacity),
    before,
  );
}

export function finishJob(
  job: JobRecord,
  request: FinishRequest,
  time: DecisionTime,
  capacity?: CapacityContext,
): JobDecision<AttemptCommit> | null {
  const { fence, phase, operationId, result } = request;
  if (job.jobId !== fence.jobId) return null;
  assertEvidencePhase(result.reason, phase, 'owner', 'invalid_command');
  const previous = job.attempts.find(({ commit }) => commit.attemptId === fence.attemptId);
  if (previous) {
    const { commit } = previous;
    const previousPhase = commit.handedOffAt === undefined ? 'pre_handoff' : 'handed_off';
    if (previous.ownerDigest !== sha256(fence.token) || commit.operationId !== operationId || previousPhase !== phase) {
      return null;
    }
    if (
      sha256(encodeEvidence(result, 'invalid_command', capacity)) !==
      sha256(encodeEvidence(commit.result, 'store_incompatible', capacity))
    ) {
      invalid('invalid_command');
    }
    return { value: copyCommit(commit, capacity) };
  }
  const lease = liveLease(job, fence, phase, time.now);
  if (!lease) return null;
  if (result.reason === 'expired' && time.now < job.expiresAt) invalid('invalid_command');
  assertEvidenceContext(result, job.provider, fence.attemptId, job.recipientCounts, 'invalid_command');
  return finalize(job, lease, operationId, result, time, true, capacity);
}

/** `operationId` is generated by the adapter for this recovery; it is not a new attempt ID. */
export function recoverJob(
  job: JobRecord,
  operationId: string,
  time: DecisionTime,
  capacity?: CapacityContext,
): JobDecision<AttemptCommit> | null {
  if (job.state.state !== 'leased' || time.now < job.state.lease.leaseEndsAt) return null;
  const { lease } = job.state;
  const reason = lease.handedOffAt === undefined ? 'pre_handoff_lease_expired' : 'post_handoff_lease_expired';
  return finalize(job, lease, operationId, lifecycleEvidence(reason), time, false, capacity);
}

export function expireJob(job: JobRecord, time: DecisionTime): JobDecision<ReturnType<typeof jobSummary>> | null {
  if (job.state.state !== 'queued' || time.now < job.expiresAt) return null;
  return replace(job, time, { ...job, state: terminalState('expired', 'expired', time.now) }, jobSummary);
}

export function cancelJob(
  job: JobRecord,
  operationId: string,
  time: DecisionTime,
  capacity?: CapacityContext,
): JobDecision<CancelResult> {
  const { state } = job;
  if (state.state === 'terminal') {
    return {
      value: Object.freeze({
        status: state.disposition === 'cancelled' ? 'cancelled' : 'too_late',
        job: jobSummary(job),
      }),
    };
  }
  if (time.now >= job.expiresAt || (state.state === 'leased' && state.lease.handedOffAt !== undefined)) {
    return { value: Object.freeze({ status: 'too_late', job: jobSummary(job) }) };
  }
  if (state.state === 'leased') {
    const decision = finalize(job, state.lease, operationId, lifecycleEvidence('cancelled'), time, false, capacity);
    const { write } = decision;
    if (write?.kind !== 'replace') invalid('store_incompatible');
    return { write, value: Object.freeze({ status: 'cancelled', job: jobSummary(write.next) }) };
  }
  return replace(
    job,
    time,
    { ...job, state: terminalState('cancelled', 'cancelled', time.now) },
    (next) => Object.freeze({ status: 'cancelled', job: jobSummary(next) }),
    job.expiresAt,
  );
}

export function resolveJob(
  job: JobRecord,
  request: ResolveUnknownCommand,
  time: DecisionTime,
): JobDecision<ResolveUnknownResult> {
  if (job.jobId !== request.jobId) invalid('not_found');
  const replay = job.resolutions.find(({ attemptId }) => attemptId === request.attemptId);
  if (replay) {
    if (replay.action !== request.action) invalid('resolution_conflict');
    return { value: Object.freeze({ status: 'replayed', job: jobSummary(job) }) };
  }
  const { state } = job;
  if (
    state.state !== 'terminal' ||
    state.disposition !== 'unknown' ||
    state.settledAt !== undefined ||
    job.attempts.at(-1)?.commit.attemptId !== request.attemptId
  ) {
    invalid('resolution_conflict');
  }
  const redrive = request.action === 'redrive';
  if (redrive) {
    if (hasRedrive(job) || !job.snapshot) invalid('resolution_conflict');
    if (time.now >= job.expiresAt) invalid('expired');
  }
  const resolutions = Object.freeze([
    ...job.resolutions,
    Object.freeze({ attemptId: request.attemptId, action: request.action, at: time.now }),
  ]);
  const nextState = redrive
    ? Object.freeze({ state: 'queued', nextAt: time.now } as const)
    : Object.freeze({ ...state, settledAt: time.now });
  return replace(
    job,
    time,
    { ...job, resolutions, state: nextState },
    (next) => Object.freeze({ status: 'resolved', job: jobSummary(next) }),
    redrive ? job.expiresAt : undefined,
  );
}

function replaceAttempt(job: JobRecord, previous: LedgerAttempt, entry: LedgerAttempt): readonly LedgerAttempt[] {
  return Object.freeze(job.attempts.map((attempt) => (attempt === previous ? Object.freeze(entry) : attempt)));
}

export function reserveJobProjection(
  job: JobRecord,
  time: DecisionTime,
  capacity?: CapacityContext,
): JobDecision<ProjectionPermit> | null {
  const entry = pendingAttempt(job);
  if (job.retiring || !entry || entry.commit.finishedAt > time.now) return null;
  const permitUntil = timeAfter(time.now, PROJECTION_PERMIT_MS) ?? invalid('store_unavailable');
  const activity = activityFor(job, entry.commit, capacity);
  const permit = Object.freeze({ activity, digest: entry.digest, permitUntil });
  const attempts = replaceAttempt(job, entry, { ...entry, permitUntil });
  return replace(
    job,
    time,
    { ...job, attempts, projectionPermitUntil: Math.max(job.projectionPermitUntil ?? 0, permitUntil) },
    () => permit,
    permitUntil,
  );
}

/** Exact activity identity and digest, under an issued window. Older overlapping windows remain usable;
 * the high-water bound prevents a supplied deadline from extending protection or recreation past drain. */
function matchingProjection(job: JobRecord | undefined, permit: ProjectionPermit): LedgerAttempt | undefined {
  const { scope, jobId, attemptId } = permit.activity;
  if (!job || job.scope !== scope || job.jobId !== jobId) return;
  return job.attempts.find(
    (entry) =>
      entry.commit.attemptId === attemptId &&
      entry.digest === permit.digest &&
      entry.permitUntil !== undefined &&
      permit.permitUntil <= entry.permitUntil &&
      permit.permitUntil - entry.commit.finishedAt >= PROJECTION_PERMIT_MS,
  );
}

function assertMatchingActivity(stored: StoredActivity, permit: ProjectionPermit): void {
  const { activity } = permit;
  if (
    stored.activity.scope !== activity.scope ||
    stored.activity.jobId !== activity.jobId ||
    stored.activity.attemptId !== activity.attemptId ||
    stored.digest !== permit.digest
  ) {
    invalid('store_incompatible');
  }
}

/**
 * The adapter verifies the exact existing complete row (not a stub). 'insert' still requires a backend write
 * that checks NOW < permitUntil and preserves existing complete rows. Never reconstruct an ACKed deletion.
 */
export function decideActivityPut(
  job: JobRecord | undefined,
  permit: ProjectionPermit,
  existing: StoredActivity | undefined,
  now: UnixMs,
): 'insert' | 'present' | 'permit_expired' {
  if (existing) assertMatchingActivity(existing, permit);
  if (!existing && now >= permit.permitUntil) return 'permit_expired';
  const entry = matchingProjection(job, permit);
  if (!entry) invalid('invalid_command');
  if (existing) return 'present';
  if (entry.projectionAckAt !== undefined || job?.retiring) invalid('store_incompatible');
  if (now < permit.permitUntil - PROJECTION_PERMIT_MS) invalid('store_unavailable');
  return 'insert';
}

/** `proof` must come from the adapter's authoritative exact activity read, not the caller's permit. */
export function acknowledgeJobProjection(
  job: JobRecord,
  permit: ProjectionPermit,
  proof: StoredActivity | undefined,
  time: DecisionTime,
): JobDecision<'acknowledged' | 'already_acknowledged' | 'stale'> {
  const entry = matchingProjection(job, permit);
  if (!entry) return { value: 'stale' };
  if (proof) assertMatchingActivity(proof, permit);
  if (entry.projectionAckAt !== undefined) return { value: 'already_acknowledged' };
  if (!proof || job.retiring) return { value: 'stale' };
  if (time.now < permit.permitUntil - PROJECTION_PERMIT_MS) invalid('store_unavailable');
  const attempts = replaceAttempt(job, entry, { ...entry, projectionAckAt: time.now });
  return replace(job, time, { ...job, attempts }, () => 'acknowledged', undefined, {
    attemptId: entry.commit.attemptId,
    digest: entry.digest,
  });
}

export function cleanupJob(job: JobRecord, time: DecisionTime): JobDecision<CleanupStep> | null {
  const due = jobSelectors(job).nextCleanupAt;
  if (due === undefined || due > time.now) return null;
  if (job.retiring) {
    return {
      write: {
        kind: 'purge',
        guard: guard(job, time),
        attemptIds: Object.freeze(job.attempts.map(({ commit }) => commit.attemptId)),
      },
      value: 'purged',
    };
  }
  if (job.snapshot) {
    const pruned = { ...job };
    delete pruned.snapshot;
    return replace(job, time, pruned, () => 'payload_pruned');
  }
  return replace(job, time, { ...job, retiring: true }, () => 'retirement_started');
}
