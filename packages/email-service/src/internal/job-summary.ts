import { EMAIL_FORMAT_VERSION, MAX_ATTEMPT_LEDGER, PRIORITY } from '../constants';
import type { EmailJobState, EmailJobSummary, UnknownResolution } from '../contracts/job';
import { readDisposition } from './activity-codecs';
import { attemptOutcome, readAttemptReason } from './attempt-codecs';
import { sameCommandMetadata, validateAdmissionKey, type CommandIdentity } from './command-codecs';
import { validateCorrelation, validateProviderRef, validateTemplateIdentity } from './message-codecs';
import { readStoreId } from './store-codecs';
import { integer, invalid, readArray, readRecord, scopeToken, unixMs } from './validation';

const STORED = 'store_incompatible';
const COMMON = [
  'version',
  'scope',
  'jobId',
  'key',
  'provider',
  'template',
  'correlation',
  'scheduleAt',
  'createdAt',
  'updatedAt',
  'expiresAt',
  'priority',
  'attemptCount',
  'unknownOpen',
  'resolutions',
  'state',
] as const;

export function readUnknownResolution(input: unknown): UnknownResolution {
  const { attemptId, at, action } = readRecord(input, ['attemptId', 'at', 'action'], [], STORED);
  if (action !== 'dismiss' && action !== 'redrive') invalid(STORED);
  return Object.freeze({ attemptId: readStoreId(attemptId, STORED), at: unixMs(at, STORED), action });
}

/** Decode the bounded redacted DTO, never returning store object identities, hidden fields or raw evidence. */
export function readJobSummary(scope: string, input: unknown): EmailJobSummary {
  const raw = readRecord(
    input,
    COMMON,
    ['latestAttempt', 'nextAt', 'phase', 'disposition', 'terminalReason', 'terminalAt'],
    STORED,
  );
  if (raw.version !== EMAIL_FORMAT_VERSION || scopeToken(raw.scope, STORED) !== scope) invalid(STORED);
  const createdAt = unixMs(raw.createdAt, STORED);
  const updatedAt = unixMs(raw.updatedAt, STORED);
  const expiresAt = unixMs(raw.expiresAt, STORED);
  const scheduleAt = raw.scheduleAt === null ? null : unixMs(raw.scheduleAt, STORED);
  const firstDue = Math.max(createdAt, scheduleAt ?? createdAt);
  if (updatedAt < createdAt || firstDue >= expiresAt) invalid(STORED);

  let state: EmailJobState;
  if (raw.state === 'queued') {
    readRecord(raw, [...COMMON, 'nextAt'], ['latestAttempt'], STORED);
    const nextAt = unixMs(raw.nextAt, STORED);
    if (nextAt < firstDue || nextAt >= expiresAt) invalid(STORED);
    state = { state: raw.state, nextAt };
  } else if (raw.state === 'leased') {
    readRecord(raw, [...COMMON, 'phase'], ['latestAttempt'], STORED);
    if (raw.phase !== 'pre_handoff' && raw.phase !== 'handed_off') invalid(STORED);
    state = { state: raw.state, phase: raw.phase };
  } else if (raw.state === 'terminal') {
    readRecord(raw, [...COMMON, 'disposition', 'terminalAt', 'terminalReason'], ['latestAttempt'], STORED);
    const terminalAt = unixMs(raw.terminalAt, STORED);
    const disposition = readDisposition(raw.disposition, STORED);
    if (terminalAt < createdAt || terminalAt > updatedAt || disposition === 'retry_scheduled') invalid(STORED);
    state = {
      state: raw.state,
      disposition,
      terminalAt,
      terminalReason:
        raw.terminalReason === 'attempts_exhausted'
          ? raw.terminalReason
          : readAttemptReason(raw.terminalReason, STORED),
    };
  } else {
    return invalid(STORED);
  }

  const active = Number(state.state === 'leased');
  const attemptCount = integer(raw.attemptCount, active, MAX_ATTEMPT_LEDGER, STORED);
  const latest = Object.hasOwn(raw, 'latestAttempt') ? readLatestAttempt(raw.latestAttempt) : undefined;
  const hasFinalized = attemptCount > active;
  if ((latest !== undefined) !== hasFinalized) invalid(STORED);
  const { unknownOpen } = raw;
  if (
    typeof unknownOpen !== 'boolean' ||
    (unknownOpen && !(state.state === 'terminal' && state.disposition === 'unknown'))
  ) {
    invalid(STORED);
  }
  const resolutions = readArray(raw.resolutions, Math.min(2, attemptCount - active), STORED, readUnknownResolution);
  return Object.freeze({
    version: EMAIL_FORMAT_VERSION,
    scope,
    jobId: readStoreId(raw.jobId, STORED),
    key: validateAdmissionKey(raw.key, STORED),
    provider: validateProviderRef(raw.provider, STORED),
    template: validateTemplateIdentity(raw.template, STORED),
    correlation: validateCorrelation(raw.correlation, STORED),
    scheduleAt,
    createdAt,
    updatedAt,
    expiresAt,
    priority: integer(raw.priority, PRIORITY.min, PRIORITY.max, STORED),
    attemptCount,
    ...(latest === undefined ? {} : { latestAttempt: latest }),
    unknownOpen,
    resolutions,
    ...state,
  });
}

/** New admissions return the initial queued summary; replays can return any current job state. */
export function matchesAdmissionJob(job: EmailJobSummary, identity: CommandIdentity, status: 'enqueued' | 'replayed') {
  return (
    job.scope === identity.scope &&
    sameCommandMetadata(job.key, job.template.key, job.provider, job.scheduleAt, identity) &&
    (status === 'replayed' ||
      (job.state === 'queued' &&
        job.attemptCount === 0 &&
        job.createdAt === job.updatedAt &&
        job.nextAt === Math.max(job.createdAt, job.scheduleAt ?? job.createdAt)))
  );
}

function readLatestAttempt(input: unknown): NonNullable<EmailJobSummary['latestAttempt']> {
  const latest = readRecord(input, ['attemptId', 'outcome', 'reason'], [], STORED);
  const reason = readAttemptReason(latest.reason, STORED);
  const outcome = attemptOutcome(reason);
  if (latest.outcome !== outcome) invalid(STORED);
  return Object.freeze({ attemptId: readStoreId(latest.attemptId, STORED), outcome, reason });
}
