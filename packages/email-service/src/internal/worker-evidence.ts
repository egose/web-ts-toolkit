import {
  CLOCK_MARGIN_MS,
  MAX_ATTEMPT_LEDGER,
  MAX_PREPARED_AT_SKEW_MS,
  RETRY_POLICY_BOUNDS,
  WORKER_LIMIT_BOUNDS,
} from '../constants';
import type { AttemptCommit, ClaimedEmail, HandoffGrant, LeaseGrant } from '../contracts/store';
import { assertActivityDisposition, readDisposition } from './activity-codecs';
import {
  assertEvidenceContext,
  assertEvidencePhase,
  isSafeTransient,
  readAttemptReason,
  readAttemptResult,
  recipientCounts,
} from './attempt-codecs';
import { canonicalJson } from './canonical-json';
import { readJobSummary } from './job-summary';
import { validateSnapshot } from './message-codecs';
import { readFence, readStoreId, type ClaimRequest, type FinishRequest } from './store-codecs';
import { integer, invalid, readRecord, unixMs } from './validation';
import { sameProvider } from './worker-config';

const STORED = 'store_incompatible';
const MAX_ORDINARY_ATTEMPTS = RETRY_POLICY_BOUNDS.maxAttempts.max;

function readGrant(times: { grantedAt: unknown; leaseEndsAt: unknown }, leaseMs: number): LeaseGrant {
  const grantedAt = unixMs(times.grantedAt, STORED);
  const leaseEndsAt = unixMs(times.leaseEndsAt, STORED);
  if (leaseEndsAt - grantedAt !== leaseMs) invalid(STORED);
  return Object.freeze({ grantedAt, leaseEndsAt });
}

export function readClaimed(value: unknown, scope: string, expected: ClaimRequest): ClaimedEmail {
  const raw = readRecord(value, ['job', 'snapshot', 'fence', 'lease', 'ordinal', 'manual'], [], STORED);
  const job = readJobSummary(scope, raw.job);
  const { snapshot } = validateSnapshot(raw.snapshot);
  const fence = readFence(raw.fence);
  const lease = readGrant(readRecord(raw.lease, ['grantedAt', 'leaseEndsAt'], [], STORED), expected.leaseMs);
  const ordinal = integer(raw.ordinal, 1, MAX_ATTEMPT_LEDGER, STORED);
  const { manual } = raw;
  const { grantedAt } = lease;
  const [redrive, more] = job.resolutions;
  if (
    job.state !== 'leased' ||
    job.phase !== 'pre_handoff' ||
    fence.jobId !== job.jobId ||
    fence.attemptId !== expected.attemptId ||
    fence.token !== expected.token ||
    job.latestAttempt?.attemptId === fence.attemptId ||
    ordinal !== job.attemptCount ||
    typeof manual !== 'boolean' ||
    (manual
      ? redrive?.action !== 'redrive' ||
        more !== undefined ||
        redrive.at < job.createdAt ||
        redrive.at > grantedAt ||
        redrive.attemptId !== job.latestAttempt?.attemptId ||
        job.latestAttempt.outcome !== 'unknown'
      : redrive !== undefined ||
        ordinal > MAX_ORDINARY_ATTEMPTS ||
        (job.latestAttempt !== undefined && !isSafeTransient(job.latestAttempt.reason))) ||
    grantedAt !== job.updatedAt ||
    grantedAt < (job.scheduleAt ?? job.createdAt) ||
    grantedAt >= job.expiresAt ||
    snapshot.preparedAt - job.createdAt > MAX_PREPARED_AT_SKEW_MS ||
    snapshot.expiresAt !== job.expiresAt ||
    snapshot.priority !== job.priority ||
    !sameProvider(snapshot.provider, job.provider) ||
    snapshot.template.key !== job.template.key ||
    snapshot.template.revision !== job.template.revision ||
    canonicalJson(snapshot.correlation, 4_096, STORED).encoded !== canonicalJson(job.correlation, 4_096, STORED).encoded
  ) {
    invalid(STORED);
  }
  return Object.freeze({ job, snapshot, fence, lease, ordinal, manual });
}

export type RpcTimes = Readonly<{ dispatchedAt: number; confirmedAt: number }>;
export type TimedGrant = Readonly<RpcTimes & { grant: LeaseGrant }>;

export function safeLeaseEnd({ dispatchedAt, grant }: TimedGrant): number {
  return dispatchedAt + (grant.leaseEndsAt - grant.grantedAt) - CLOCK_MARGIN_MS;
}

/** Store times stay in the prior live window. Compare elapsed intervals, not local and store walls. */
function assertLaterGrant(grant: LeaseGrant, last: TimedGrant, expiresAt: number, times: RpcTimes) {
  const elapsed = grant.grantedAt - last.grant.grantedAt;
  if (
    elapsed < Math.max(0, times.dispatchedAt - last.confirmedAt - CLOCK_MARGIN_MS) ||
    elapsed > times.confirmedAt - last.dispatchedAt + CLOCK_MARGIN_MS ||
    grant.grantedAt >= Math.min(last.grant.leaseEndsAt, expiresAt)
  ) {
    invalid(STORED);
  }
}

export function readRenewed(value: unknown, last: TimedGrant, claim: ClaimedEmail, leaseMs: number, times: RpcTimes) {
  const grant = readGrant(readRecord(value, ['grantedAt', 'leaseEndsAt'], [], STORED), leaseMs);
  assertLaterGrant(grant, last, claim.job.expiresAt, times);
  // A repeated grant (e.g. a stale echo) does not extend the worker's authorization window.
  if (grant.leaseEndsAt <= last.grant.leaseEndsAt) invalid(STORED);
  return grant;
}

export function readHandoff(value: unknown, last: TimedGrant, claim: ClaimedEmail, leaseMs: number, times: RpcTimes) {
  const raw = readRecord(value, ['grantedAt', 'leaseEndsAt', 'handoffAt'], [], STORED);
  const grant = readGrant(raw, leaseMs);
  const handoffAt = unixMs(raw.handoffAt, STORED);
  if (handoffAt !== grant.grantedAt) invalid(STORED);
  assertLaterGrant(grant, last, claim.job.expiresAt, times);
  return Object.freeze({ ...grant, handoffAt });
}

function readCommit(value: unknown): AttemptCommit {
  const raw = readRecord(
    value,
    ['jobId', 'attemptId', 'ordinal', 'operationId', 'startedAt', 'finishedAt', 'result', 'disposition', 'reason'],
    ['handedOffAt', 'retryAt'],
    STORED,
  );
  const startedAt = unixMs(raw.startedAt, STORED);
  const finishedAt = unixMs(raw.finishedAt, STORED);
  const handedOffAt = Object.hasOwn(raw, 'handedOffAt') ? unixMs(raw.handedOffAt, STORED) : undefined;
  const retryAt = Object.hasOwn(raw, 'retryAt') ? unixMs(raw.retryAt, STORED) : undefined;
  const result = readAttemptResult(raw.result, STORED);
  const disposition = readDisposition(raw.disposition, STORED);
  const reason = raw.reason === 'attempts_exhausted' ? raw.reason : readAttemptReason(raw.reason, STORED);
  assertEvidencePhase(result.reason, handedOffAt === undefined ? 'pre_handoff' : 'handed_off', 'ledger', STORED);
  assertActivityDisposition(result, disposition, STORED);
  const expectedReason =
    disposition === 'expired'
      ? 'expired'
      : result.retry === 'safe_transient' && (disposition === 'failed' || disposition === 'rejected')
        ? 'attempts_exhausted'
        : result.reason;
  if (
    finishedAt < startedAt ||
    (handedOffAt !== undefined && (handedOffAt < startedAt || handedOffAt > finishedAt)) ||
    reason !== expectedReason ||
    (retryAt !== undefined) !== (disposition === 'retry_scheduled') ||
    (retryAt !== undefined &&
      (retryAt <= finishedAt ||
        retryAt - finishedAt < (result.retryHint?.delayMs ?? 0) ||
        retryAt < (result.retryHint?.notBefore ?? 0)))
  ) {
    invalid(STORED);
  }
  return Object.freeze({
    jobId: readStoreId(raw.jobId, STORED),
    attemptId: readStoreId(raw.attemptId, STORED),
    ordinal: integer(raw.ordinal, 1, MAX_ATTEMPT_LEDGER, STORED),
    operationId: readStoreId(raw.operationId, STORED),
    startedAt,
    finishedAt,
    result,
    disposition,
    reason,
    ...(handedOffAt === undefined ? {} : { handedOffAt }),
    ...(retryAt === undefined ? {} : { retryAt }),
  });
}

export function readRecovery(value: unknown): AttemptCommit {
  const commit = readCommit(value);
  const { result, startedAt, handedOffAt, finishedAt } = commit;
  if (
    (result.reason !== 'pre_handoff_lease_expired' && result.reason !== 'post_handoff_lease_expired') ||
    finishedAt - (handedOffAt ?? startedAt) < WORKER_LIMIT_BOUNDS.leaseMs.min
  ) {
    invalid(STORED);
  }
  return commit;
}

export function readQueuedExpiry(value: unknown, scope: string) {
  const job = readJobSummary(scope, value);
  if (
    job.state !== 'terminal' ||
    job.disposition !== 'expired' ||
    job.terminalReason !== 'expired' ||
    job.terminalAt < job.expiresAt ||
    job.updatedAt !== job.terminalAt
  ) {
    invalid(STORED);
  }
  return job;
}

export type OwnedEvidence = Readonly<{
  claim: ClaimedEmail;
  /** Last positively confirmed pre-handoff grant. */
  lease: TimedGrant;
  handoff: (TimedGrant & { grant: HandoffGrant }) | 'unconfirmed' | undefined;
}>;

/** A direct finish ACK must match the exact request. A point read may also show an independently stored winner. */
export function readOwnedCommit(
  value: unknown,
  { claim, lease, handoff }: OwnedEvidence,
  request: FinishRequest | undefined,
  providerInvoked: boolean,
  direct: boolean,
): AttemptCommit {
  const commit = readCommit(value);
  const { attemptId, startedAt, handedOffAt, finishedAt, result, disposition, retryAt } = commit;
  const { job, snapshot, fence, ordinal, manual } = claim;
  const { expiresAt } = job;
  const canHaveRetryBudget = !manual && ordinal < MAX_ORDINARY_ATTEMPTS;
  const last = handoff && handoff !== 'unconfirmed' ? handoff.grant : lease.grant;
  const markedLeaseMs = claim.lease.leaseEndsAt - claim.lease.grantedAt;
  if (
    commit.jobId !== fence.jobId ||
    attemptId !== fence.attemptId ||
    startedAt !== claim.lease.grantedAt ||
    commit.ordinal !== ordinal ||
    finishedAt < last.grantedAt ||
    (handoff !== 'unconfirmed' && handedOffAt !== handoff?.grant.handoffAt) ||
    (handedOffAt !== undefined &&
      (handedOffAt < lease.grant.grantedAt || handedOffAt >= Math.min(expiresAt, lease.grant.leaseEndsAt))) ||
    (result.reason === 'cancelled' && finishedAt >= expiresAt) ||
    (result.reason === 'expired' && finishedAt < expiresAt) ||
    (result.reason === 'pre_handoff_lease_expired' && finishedAt < lease.grant.leaseEndsAt) ||
    (result.reason === 'post_handoff_lease_expired' &&
      (handedOffAt === undefined || finishedAt - handedOffAt < markedLeaseMs)) ||
    (handedOffAt !== undefined &&
      result.reason !== 'post_handoff_lease_expired' &&
      (result.reason === 'launch_window_closed' ? providerInvoked || handoff === 'unconfirmed' : !providerInvoked)) ||
    (result.retry === 'safe_transient' && finishedAt >= expiresAt && disposition !== 'expired') ||
    (result.retry === 'safe_transient' && finishedAt < expiresAt && disposition === 'expired' && !canHaveRetryBudget) ||
    (retryAt !== undefined && (!canHaveRetryBudget || retryAt >= expiresAt))
  ) {
    invalid(STORED);
  }
  assertEvidenceContext(result, snapshot.provider, attemptId, recipientCounts(snapshot.envelope), STORED);
  if (request && commit.operationId === request.operationId) {
    const phase = handedOffAt === undefined ? 'pre_handoff' : 'handed_off';
    if (
      phase !== request.phase ||
      finishedAt >= last.leaseEndsAt ||
      canonicalJson(result, 8_192, STORED).encoded !== canonicalJson(request.result, 8_192, STORED).encoded
    ) {
      invalid(STORED);
    }
  } else if (direct) {
    invalid(STORED);
  }
  return commit;
}
