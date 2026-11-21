import { MAX_RATE_DEFERRAL_MS, MAX_UNIX_MS } from '../constants';
import type { JobDisposition, RetryPolicy } from '../contracts/job';
import type { EmailEnvelope, ProviderRef, UnixMs } from '../contracts/message';
import type { AttemptReason, AttemptResult, ProviderResult, RecipientResult, RetryHint } from '../contracts/provider';
import type { EmailErrorCode } from '../errors';
import { encodeEvidence, sha256 } from './canonical-json';
import { recipientLimit, type CapacityContext } from './smtp-capacity';
import { integer, invalid, readArray, readRecord, unixMs } from './validation';

type Evidence = readonly [
  AttemptResult['outcome'],
  AttemptResult['retry'],
  readonly AttemptResult['stage'][],
  'pre' | 'smtp' | 'sendgrid' | 'provider' | 'launch' | 'recovery' | 'cancel',
];
const smtpStages = ['connect', 'tls', 'auth', 'envelope', 'data'] as const;
const providerStages = [...smtpStages, 'http'] as const;
const evidence: Readonly<Record<AttemptReason, Evidence>> = Object.freeze({
  smtp_accepted: ['accepted', 'never', ['data'], 'smtp'],
  smtp_partial: ['partially_accepted', 'never', ['data'], 'smtp'],
  smtp_transient_reply: ['rejected', 'safe_transient', smtpStages, 'smtp'],
  smtp_permanent_reply: ['rejected', 'never', smtpStages, 'smtp'],
  sendgrid_accepted: ['accepted', 'never', ['http'], 'sendgrid'],
  sendgrid_validated: ['validated', 'never', ['http'], 'sendgrid'],
  sendgrid_throttled: ['rejected', 'safe_transient', ['http'], 'sendgrid'],
  sendgrid_rejected: ['rejected', 'never', ['http'], 'sendgrid'],
  not_transmitted: ['unsubmitted', 'safe_transient', providerStages, 'provider'],
  provider_configuration: ['unsubmitted', 'never', providerStages, 'provider'],
  transport_uncertain: ['unknown', 'never', providerStages, 'provider'],
  provider_timeout: ['unknown', 'never', providerStages, 'provider'],
  provider_aborted: ['unknown', 'never', providerStages, 'provider'],
  attachment_unavailable: ['unsubmitted', 'safe_transient', ['attachment'], 'pre'],
  attachment_timeout: ['unsubmitted', 'safe_transient', ['attachment'], 'pre'],
  attachment_invalid: ['unsubmitted', 'never', ['attachment'], 'pre'],
  attachment_resolver_error: ['unsubmitted', 'never', ['attachment'], 'pre'],
  rate_deferred: ['unsubmitted', 'safe_transient', ['rate_limit'], 'pre'],
  rate_timeout: ['unsubmitted', 'safe_transient', ['rate_limit'], 'pre'],
  rate_error: ['unsubmitted', 'never', ['rate_limit'], 'pre'],
  profile_unavailable: ['unsubmitted', 'never', ['pre_handoff'], 'pre'],
  provider_preflight_error: ['unsubmitted', 'never', ['pre_handoff'], 'pre'],
  pre_handoff_timeout: ['unsubmitted', 'safe_transient', ['pre_handoff'], 'pre'],
  worker_stopped: ['unsubmitted', 'safe_transient', ['pre_handoff'], 'pre'],
  pre_handoff_lease_expired: ['unsubmitted', 'safe_transient', ['pre_handoff'], 'recovery'],
  launch_window_closed: ['unsubmitted', 'safe_transient', ['pre_handoff'], 'launch'],
  post_handoff_lease_expired: ['unknown', 'never', ['pre_handoff'], 'recovery'],
  expired: ['unsubmitted', 'never', ['pre_handoff'], 'pre'],
  cancelled: ['unsubmitted', 'never', ['pre_handoff'], 'cancel'],
});

export function readAttemptReason(value: unknown, code: EmailErrorCode): AttemptReason {
  if (typeof value !== 'string' || !Object.hasOwn(evidence, value)) invalid(code);
  return value as AttemptReason;
}

export function attemptOutcome(reason: AttemptReason): AttemptResult['outcome'] {
  return evidence[reason][0];
}

export function isSafeTransient(reason: AttemptReason): boolean {
  return evidence[reason][1] === 'safe_transient';
}

export const recipientGroups = ['to', 'cc', 'bcc'] as const;
export type RecipientCounts = Readonly<Record<RecipientResult['group'], number>>;

export function recipientCounts(envelope: EmailEnvelope): RecipientCounts {
  return Object.freeze({ to: envelope.to.length, cc: envelope.cc.length, bcc: envelope.bcc.length });
}

export function readRecipientCounts(input: unknown, code: EmailErrorCode, capacity?: CapacityContext): RecipientCounts {
  const limit = recipientLimit(capacity);
  const counts = readRecord(input, recipientGroups, [], code);
  const to = integer(counts.to, 0, limit, code);
  const cc = integer(counts.cc, 0, limit - to, code);
  const bcc = integer(counts.bcc, 0, limit - to - cc, code);
  if (to + cc + bcc === 0) invalid(code);
  return Object.freeze({ to, cc, bcc });
}

export function smtpMessageId(attemptId: string): string {
  return `<${attemptId}@email.invalid>`;
}

function readHint(input: unknown, reason: AttemptReason, code: EmailErrorCode): RetryHint {
  if (reason !== 'rate_deferred' && reason !== 'sendgrid_throttled') invalid(code);
  const raw = readRecord(input, [], ['delayMs', 'notBefore'], code);
  const hasDelay = Object.hasOwn(raw, 'delayMs');
  const hasFloor = Object.hasOwn(raw, 'notBefore');
  if (!hasDelay && (!hasFloor || reason === 'rate_deferred')) invalid(code);
  return Object.freeze({
    ...(hasDelay
      ? {
          delayMs:
            reason === 'rate_deferred'
              ? integer(raw.delayMs, 1, MAX_RATE_DEFERRAL_MS, code)
              : integer(raw.delayMs, 0, Number.MAX_SAFE_INTEGER, code),
        }
      : {}),
    ...(hasFloor ? { notBefore: unixMs(raw.notBefore, code) } : {}),
  });
}

/**
 * Validate the exact normalized evidence tuple and its bounded fields. Contextual provider/envelope and
 * phase checks are separate so callers can validate shape before a row lookup. Projected evidence has no hint.
 */
export function readAttemptResult(
  input: unknown,
  code: EmailErrorCode = 'invalid_command',
  projected = false,
  capacity?: CapacityContext,
): AttemptResult {
  const raw = readRecord(
    input,
    ['outcome', 'retry', 'stage', 'reason'],
    ['retryHint', 'recipients', 'messageId', 'providerMessageId'],
    code,
  );
  const reason = readAttemptReason(raw.reason, code);
  const [outcome, retry, stages, origin] = evidence[reason];
  // Return an allowlisted value, not the caller's raw value.
  const stage = stages.find((value) => value === raw.stage);
  if (raw.outcome !== outcome || raw.retry !== retry || !stage) invalid(code);
  if (capacity && (origin === 'sendgrid' || stage === 'http')) invalid(code);
  const hasHint = Object.hasOwn(raw, 'retryHint');
  if ((projected && hasHint) || (!projected && reason === 'rate_deferred' && !hasHint)) invalid(code);

  const smtpSuccess = reason === 'smtp_accepted' || reason === 'smtp_partial';
  const hasRecipients = Object.hasOwn(raw, 'recipients');
  if (smtpSuccess && !hasRecipients) invalid(code);
  let recipients: readonly RecipientResult[] | undefined;
  if (hasRecipients) {
    if ((origin !== 'smtp' && origin !== 'provider') || (stage !== 'envelope' && stage !== 'data')) invalid(code);
    const seen = new Set<string>();
    const limit = recipientLimit(capacity);
    let previous = -1;
    recipients = readArray(raw.recipients, limit, code, (value) => {
      const { group, index: rawIndex, status } = readRecord(value, ['group', 'index', 'status'], [], code);
      if (group !== 'to' && group !== 'cc' && group !== 'bcc') invalid(code);
      if (status !== 'rejected' && (status !== 'accepted' || !smtpSuccess)) invalid(code);
      const index = integer(rawIndex, 0, limit - 1, code);
      if (capacity) {
        // Enforce the transport's original To/Cc/Bcc order, including for rejected subsets.
        const position = recipientGroups.indexOf(group) * limit + index;
        if (position <= previous) invalid(code);
        previous = position;
      } else {
        const key = `${group}:${index}`;
        if (seen.has(key)) invalid(code);
        seen.add(key);
      }
      return Object.freeze({ group, index, status });
    });
    const accepted = recipients.filter(({ status }) => status === 'accepted').length;
    if (
      (reason === 'smtp_accepted' && (!accepted || accepted !== recipients.length)) ||
      (reason === 'smtp_partial' && (!accepted || accepted === recipients.length))
    ) {
      invalid(code);
    }
  }

  const hasMessageId = Object.hasOwn(raw, 'messageId');
  const { messageId, providerMessageId } = raw;
  if (hasMessageId && (!smtpSuccess || typeof messageId !== 'string' || messageId.length !== 52)) invalid(code);
  const hasProviderId = Object.hasOwn(raw, 'providerMessageId');
  if (
    hasProviderId &&
    (reason !== 'sendgrid_accepted' ||
      typeof providerMessageId !== 'string' ||
      providerMessageId.length > 128 ||
      !/^[A-Za-z0-9][A-Za-z0-9._=-]{0,127}$/.test(providerMessageId))
  ) {
    invalid(code);
  }
  const result = Object.freeze({
    outcome,
    retry,
    stage,
    reason,
    ...(hasHint ? { retryHint: readHint(raw.retryHint, reason, code) } : {}),
    ...(recipients === undefined ? {} : { recipients }),
    ...(typeof messageId === 'string' ? { messageId } : {}),
    ...(typeof providerMessageId === 'string' ? { providerMessageId } : {}),
  });
  // Projected evidence is sized as part of the full activity, including metadata.
  if (capacity && !projected) encodeEvidence(result, code, capacity);
  return result;
}

export function assertEvidencePhase(
  reason: AttemptReason,
  phase: 'pre_handoff' | 'handed_off',
  source: 'owner' | 'ledger',
  code: EmailErrorCode,
): void {
  const origin = evidence[reason][3];
  if (source === 'ledger') {
    if (origin === 'recovery' && (reason === 'post_handoff_lease_expired') === (phase === 'handed_off')) return;
    if (origin === 'cancel' && phase === 'pre_handoff') return;
  }
  const allowed =
    phase === 'pre_handoff'
      ? origin === 'pre'
      : origin === 'smtp' || origin === 'sendgrid' || origin === 'provider' || origin === 'launch';
  if (!allowed) invalid(code);
}

export function assertEvidenceContext(
  result: AttemptResult,
  provider: ProviderRef,
  attemptId: string,
  counts: RecipientCounts | undefined,
  code: EmailErrorCode,
): void {
  const { reason, stage, recipients, messageId } = result;
  const origin = evidence[reason][3];
  if (
    (origin === 'smtp' && provider.kind !== 'smtp') ||
    (origin === 'sendgrid' && provider.kind !== 'sendgrid') ||
    (origin === 'provider' &&
      (provider.kind === 'smtp' ? stage === 'http' : stage !== 'http' && stage !== 'connect' && stage !== 'tls')) ||
    (reason === 'sendgrid_accepted' && provider.mode !== 'live') ||
    (reason === 'sendgrid_validated' && provider.mode !== 'sandbox') ||
    (messageId !== undefined && messageId !== smtpMessageId(attemptId))
  ) {
    invalid(code);
  }
  if (recipients) {
    if (provider.kind !== 'smtp') invalid(code);
    if (counts) {
      if (recipients.some(({ group, index }) => index >= counts[group])) invalid(code);
      const needsPartition =
        reason === 'smtp_accepted' ||
        reason === 'smtp_partial' ||
        (stage === 'envelope' && (reason === 'smtp_transient_reply' || reason === 'smtp_permanent_reply'));
      if (needsPartition && recipients.length !== counts.to + counts.cc + counts.bcc) invalid(code);
    }
  }
}

/** Use after handoff; an invalid result is not safe retry evidence. */
export function readProviderResult(
  input: unknown,
  provider: ProviderRef,
  attemptId: string,
  envelope: EmailEnvelope,
  capacity?: CapacityContext,
) {
  const code = 'invalid_command';
  const result = readAttemptResult(input, code, false, capacity);
  const origin = evidence[result.reason][3];
  if (origin !== 'smtp' && origin !== 'sendgrid' && origin !== 'provider') invalid(code);
  assertEvidenceContext(result, provider, attemptId, recipientCounts(envelope), code);
  return result as ProviderResult;
}

/** Internal fixed evidence, checked by type and confined to lifecycle-generated results. */
export function lifecycleEvidence(
  reason: 'pre_handoff_lease_expired' | 'post_handoff_lease_expired' | 'cancelled',
): AttemptResult {
  const [outcome, retry] = evidence[reason];
  return Object.freeze({ outcome, retry, reason, stage: 'pre_handoff' });
}

export type AttemptEffect =
  | Readonly<{ disposition: JobDisposition; reason: AttemptReason | 'attempts_exhausted'; retryAt?: never }>
  | Readonly<{ disposition: 'retry_scheduled'; reason: AttemptReason; retryAt: UnixMs }>;

export function attemptEffect(
  result: AttemptResult,
  attemptId: string,
  ordinal: number,
  manual: boolean,
  policy: Readonly<RetryPolicy>,
  expiresAt: UnixMs,
  now: UnixMs,
): AttemptEffect {
  const { outcome, reason } = result;
  if (outcome !== 'unsubmitted' && outcome !== 'rejected') return { disposition: outcome, reason };
  if (reason === 'cancelled' || reason === 'expired') return { disposition: reason, reason };
  const disposition = outcome === 'unsubmitted' ? 'failed' : 'rejected';
  if (result.retry === 'never') return { disposition, reason };
  if (now >= expiresAt) return { disposition: 'expired', reason: 'expired' };
  if (manual || ordinal >= policy.maxAttempts) return { disposition, reason: 'attempts_exhausted' };

  const cap = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (ordinal - 1));
  const half = Math.floor(cap / 2);
  const jitter = half + (Number.parseInt(sha256(attemptId).slice(0, 8), 16) % (cap - half + 1));
  const delay = Math.max(jitter, result.retryHint?.delayMs ?? 0);
  const retryAt = Math.max(now + Math.min(delay, MAX_UNIX_MS - now), result.retryHint?.notBefore ?? 0);
  if (retryAt >= expiresAt) return { disposition: 'expired', reason: 'expired' };
  return { disposition: 'retry_scheduled', reason, retryAt };
}
