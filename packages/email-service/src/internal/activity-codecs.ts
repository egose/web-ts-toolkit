import { Buffer } from 'node:buffer';
import {
  ACTIVITY_PAGE_LIMIT,
  EMAIL_FORMAT_VERSION,
  MAX_ACTIVITY_CURSOR_BYTES,
  MAX_ATTEMPT_LEDGER,
  PROJECTION_PERMIT_MS,
} from '../constants';
import type { EmailActivity, EmailActivityPage, EmailActivityQuery } from '../contracts/admin';
import type { EmailJobSummary, JobDisposition } from '../contracts/job';
import type { AttemptResult } from '../contracts/provider';
import type { AttemptCommit, ProjectionPermit } from '../contracts/store';
import type { EmailErrorCode } from '../errors';
import { assertEvidenceContext, assertEvidencePhase, readAttemptResult } from './attempt-codecs';
import { canonicalJson, hashJson } from './canonical-json';
import { validateCorrelation, validateProviderRef, validateTemplateIdentity } from './message-codecs';
import { readStoreId } from './store-codecs';
import { hashToken, integer, invalid, readArray, readRecord, scopeToken, unixMs } from './validation';

// Covers all 50 recipient outcomes and the maximum widths of v1 redacted metadata.
const ACTIVITY_BYTES = 8_192;
const dispositions = [
  'accepted',
  'partially_accepted',
  'validated',
  'rejected',
  'unknown',
  'failed',
  'expired',
  'cancelled',
] as const satisfies readonly JobDisposition[];

export function readDisposition(input: unknown, code: EmailErrorCode): JobDisposition | 'retry_scheduled' {
  const disposition = dispositions.find((value) => value === input);
  if (disposition) return disposition;
  if (input === 'retry_scheduled') return input;
  return invalid(code);
}

export function assertActivityDisposition(
  result: AttemptResult,
  disposition: EmailActivity['disposition'],
  code: EmailErrorCode,
) {
  const { outcome, reason } = result;
  if (outcome !== 'rejected' && outcome !== 'unsubmitted') {
    if (disposition !== outcome) invalid(code);
  } else if (reason === 'expired' || reason === 'cancelled') {
    if (disposition !== reason) invalid(code);
  } else if (
    disposition !== (outcome === 'rejected' ? 'rejected' : 'failed') &&
    !(result.retry === 'safe_transient' && (disposition === 'expired' || disposition === 'retry_scheduled'))
  ) {
    invalid(code);
  }
}

/** Read only plain, complete, redacted projections; an identity stub is not an activity. */
export function readActivity(
  scope: string,
  input: unknown,
  code: EmailErrorCode = 'store_incompatible',
): EmailActivity {
  const raw = readRecord(
    input,
    [
      'version',
      'scope',
      'jobId',
      'attemptId',
      'ordinal',
      'provider',
      'template',
      'correlation',
      'startedAt',
      'finishedAt',
      'result',
      'disposition',
    ],
    ['handedOffAt'],
    code,
  );
  if (raw.version !== EMAIL_FORMAT_VERSION || scopeToken(raw.scope, code) !== scope) invalid(code);
  const jobId = readStoreId(raw.jobId, code);
  const attemptId = readStoreId(raw.attemptId, code);
  const provider = validateProviderRef(raw.provider, code);
  const startedAt = unixMs(raw.startedAt, code);
  const finishedAt = unixMs(raw.finishedAt, code);
  const handedOffAt = Object.hasOwn(raw, 'handedOffAt') ? unixMs(raw.handedOffAt, code) : undefined;
  if (finishedAt < startedAt || (handedOffAt !== undefined && (handedOffAt < startedAt || handedOffAt > finishedAt))) {
    invalid(code);
  }
  const result = readAttemptResult(raw.result, code, true);
  assertEvidencePhase(result.reason, handedOffAt === undefined ? 'pre_handoff' : 'handed_off', 'ledger', code);
  // Full recipient accounting is checked against the authoritative row. Activity reads have only the redacted DTO.
  assertEvidenceContext(result, provider, attemptId, undefined, code);
  const disposition = readDisposition(raw.disposition, code);
  assertActivityDisposition(result, disposition, code);
  return Object.freeze({
    version: EMAIL_FORMAT_VERSION,
    scope,
    jobId,
    attemptId,
    ordinal: integer(raw.ordinal, 1, MAX_ATTEMPT_LEDGER, code),
    provider,
    template: validateTemplateIdentity(raw.template, code),
    correlation: validateCorrelation(raw.correlation, code),
    startedAt,
    ...(handedOffAt === undefined ? {} : { handedOffAt }),
    finishedAt,
    result,
    disposition,
  });
}

type ActivityJob = Pick<EmailJobSummary, 'scope' | 'jobId' | 'provider' | 'template' | 'correlation'>;

export function activityFor(job: ActivityJob, commit: AttemptCommit): EmailActivity {
  const { outcome, retry, stage, reason, recipients, messageId, providerMessageId } = commit.result;
  return readActivity(job.scope, {
    version: EMAIL_FORMAT_VERSION,
    scope: job.scope,
    jobId: job.jobId,
    attemptId: commit.attemptId,
    ordinal: commit.ordinal,
    provider: job.provider,
    template: job.template,
    correlation: job.correlation,
    startedAt: commit.startedAt,
    ...(commit.handedOffAt === undefined ? {} : { handedOffAt: commit.handedOffAt }),
    finishedAt: commit.finishedAt,
    disposition: commit.disposition,
    result: {
      outcome,
      retry,
      stage,
      reason,
      ...(recipients === undefined ? {} : { recipients }),
      ...(messageId === undefined ? {} : { messageId }),
      ...(providerMessageId === undefined ? {} : { providerMessageId }),
    },
  });
}

export function activityDigest(activity: EmailActivity): string {
  return hashJson(activity, ACTIVITY_BYTES, 'store_incompatible');
}

export type StoredActivity = Readonly<{ activity: EmailActivity; digest: string }>;

export function readStoredActivity(
  scope: string,
  input: unknown,
  code: EmailErrorCode = 'store_incompatible',
): StoredActivity {
  const raw = readRecord(input, ['activity', 'digest'], [], code);
  const activity = readActivity(scope, raw.activity, code);
  const digest = hashToken(raw.digest, code);
  if (activityDigest(activity) !== digest) invalid(code);
  return Object.freeze({ activity, digest });
}

export function readProjectionPermit(scope: string, input: unknown): ProjectionPermit {
  const code = 'invalid_command';
  const {
    activity,
    digest,
    permitUntil: rawUntil,
  } = readRecord(input, ['activity', 'digest', 'permitUntil'], [], code);
  const stored = readStoredActivity(scope, { activity, digest }, code);
  const permitUntil = unixMs(rawUntil, code);
  if (permitUntil - stored.activity.finishedAt < PROJECTION_PERMIT_MS) invalid(code);
  return Object.freeze({ ...stored, permitUntil });
}

export type ActivityPosition = Pick<EmailActivity, 'finishedAt' | 'jobId' | 'attemptId'>;

export type ActivityCriteria = Readonly<{
  scope: string;
  jobId: string | null;
  from: number | null;
  before: number | null;
  limit: number;
  after?: ActivityPosition;
}>;

export function compareAscii(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareActivity(a: ActivityPosition, b: ActivityPosition): number {
  return b.finishedAt - a.finishedAt || compareAscii(a.jobId, b.jobId) || compareAscii(a.attemptId, b.attemptId);
}

function cursorPayload(criteria: ActivityCriteria, position: ActivityPosition) {
  return {
    v: EMAIL_FORMAT_VERSION,
    s: criteria.scope,
    j: criteria.jobId,
    f: criteria.from,
    b: criteria.before,
    p: [position.finishedAt, position.jobId, position.attemptId],
  };
}

function encodeCursor(criteria: ActivityCriteria, position: ActivityPosition): string {
  const code = 'invalid_cursor';
  const { encoded } = canonicalJson(cursorPayload(criteria, position), MAX_ACTIVITY_CURSOR_BYTES, code);
  const cursor = Buffer.from(encoded).toString('base64url');
  if (cursor.length > MAX_ACTIVITY_CURSOR_BYTES) invalid(code);
  return cursor;
}

function decodeCursor(criteria: ActivityCriteria, cursor: unknown): ActivityPosition {
  const code = 'invalid_cursor';
  if (
    typeof cursor !== 'string' ||
    cursor.length === 0 ||
    cursor.length > MAX_ACTIVITY_CURSOR_BYTES ||
    !/^[A-Za-z0-9_-]+$/.test(cursor)
  ) {
    invalid(code);
  }
  let input: unknown;
  try {
    input = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    invalid(code);
  }
  const { p } = readRecord(input, ['v', 's', 'j', 'f', 'b', 'p'], [], code);
  const tuple = readArray(p, 3, code, (entry) => entry);
  const position = Object.freeze({
    finishedAt: unixMs(tuple[0], code),
    jobId: readStoreId(tuple[1], code),
    attemptId: readStoreId(tuple[2], code),
  });
  if (
    (criteria.jobId !== null && position.jobId !== criteria.jobId) ||
    (criteria.from !== null && position.finishedAt < criteria.from) ||
    (criteria.before !== null && position.finishedAt >= criteria.before) ||
    encodeCursor(criteria, position) !== cursor
  ) {
    invalid(code);
  }
  return position;
}

export function readActivityCriteria(scope: string, input: unknown): ActivityCriteria {
  const code = 'invalid_command';
  const raw = readRecord(input, [], ['jobId', 'from', 'before', 'limit', 'cursor'], code);
  const jobId = Object.hasOwn(raw, 'jobId') ? readStoreId(raw.jobId, code) : null;
  const from = Object.hasOwn(raw, 'from') ? unixMs(raw.from, code) : null;
  const before = Object.hasOwn(raw, 'before') ? unixMs(raw.before, code) : null;
  if (from !== null && before !== null && from > before) invalid(code);
  const limit = Object.hasOwn(raw, 'limit')
    ? integer(raw.limit, ACTIVITY_PAGE_LIMIT.min, ACTIVITY_PAGE_LIMIT.max, code)
    : ACTIVITY_PAGE_LIMIT.default;
  const criteria = { scope, jobId, from, before, limit };
  return Object.freeze({
    ...criteria,
    ...(Object.hasOwn(raw, 'cursor') ? { after: decodeCursor(criteria, raw.cursor) } : {}),
  });
}

/** Rebuild a validated, detached query; only the adapter builds backend selectors. */
export function activityQuery(criteria: ActivityCriteria): EmailActivityQuery {
  const { jobId, from, before, limit, after } = criteria;
  return Object.freeze({
    ...(jobId === null ? {} : { jobId }),
    ...(from === null ? {} : { from }),
    ...(before === null ? {} : { before }),
    limit,
    ...(after === undefined ? {} : { cursor: encodeCursor(criteria, after) }),
  });
}

function readOrderedActivities(criteria: ActivityCriteria, input: unknown, maxRows: number) {
  const code = 'store_incompatible';
  let previous = criteria.after;
  return readArray(input, maxRows, code, (row) => {
    const activity = readActivity(criteria.scope, row);
    if (
      (previous && compareActivity(previous, activity) >= 0) ||
      (criteria.jobId !== null && criteria.jobId !== activity.jobId) ||
      (criteria.from !== null && activity.finishedAt < criteria.from) ||
      (criteria.before !== null && activity.finishedAt >= criteria.before)
    ) {
      invalid(code);
    }
    previous = activity;
    return activity;
  });
}

/** Adapters select at most limit+1 complete, ordered rows using the normalized criteria before calling this. */
export function activityPage(criteria: ActivityCriteria, ordered: readonly EmailActivity[]): EmailActivityPage {
  const rows = readOrderedActivities(criteria, ordered, criteria.limit + 1);
  const more = rows.length > criteria.limit;
  const items = more ? Object.freeze(rows.slice(0, criteria.limit)) : rows;
  const last = items.at(-1);
  return Object.freeze({ items, ...(more && last ? { nextCursor: encodeCursor(criteria, last) } : {}) });
}

/** Decode a store reply before returning it across the admin boundary. */
export function readActivityPage(criteria: ActivityCriteria, input: unknown): EmailActivityPage {
  const code = 'store_incompatible';
  const raw = readRecord(input, ['items'], ['nextCursor'], code);
  const items = readOrderedActivities(criteria, raw.items, criteria.limit);
  if (!Object.hasOwn(raw, 'nextCursor')) return Object.freeze({ items });
  const last = items.at(-1);
  if (!last || items.length !== criteria.limit || raw.nextCursor !== encodeCursor(criteria, last)) invalid(code);
  return Object.freeze({ items, nextCursor: raw.nextCursor });
}
