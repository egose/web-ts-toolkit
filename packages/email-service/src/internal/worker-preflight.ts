import { MAX_RATE_DEFERRAL_MS } from '../constants';
import type { ResolvedAttachment } from '../contracts/message';
import type { AttemptReason, AttemptResult, PreparedEmailSubmission } from '../contracts/provider';
import type { ClaimedEmail } from '../contracts/store';
import { createChildBudget, type OperationBudget } from './budget';
import { bindMethod, readPortMember, runHostCallback, runSyncCallback, type CallbackSlot } from './callbacks';
import { copyAttachmentBytes } from './message-codecs';
import { allowedErrorCode, integer, invalid, readRecord } from './validation';
import { sameProvider, type WorkerConfig } from './worker-config';

type Submit = PreparedEmailSubmission['submit'];
type Preflight = { submit: Submit } | { result: AttemptResult };

const stages = {
  attachment_unavailable: ['attachment', 'safe_transient'],
  attachment_timeout: ['attachment', 'safe_transient'],
  attachment_invalid: ['attachment', 'never'],
  attachment_resolver_error: ['attachment', 'never'],
  rate_deferred: ['rate_limit', 'safe_transient'],
  rate_timeout: ['rate_limit', 'safe_transient'],
  rate_error: ['rate_limit', 'never'],
  profile_unavailable: ['pre_handoff', 'never'],
  provider_preflight_error: ['pre_handoff', 'never'],
  pre_handoff_timeout: ['pre_handoff', 'safe_transient'],
  worker_stopped: ['pre_handoff', 'safe_transient'],
  launch_window_closed: ['pre_handoff', 'safe_transient'],
} as const satisfies Partial<Record<AttemptReason, [AttemptResult['stage'], AttemptResult['retry']]>>;

export function unsubmitted(reason: keyof typeof stages, delayMs?: number): AttemptResult {
  const [stage, retry] = stages[reason];
  return Object.freeze({
    outcome: 'unsubmitted',
    stage,
    retry,
    reason,
    ...(delayMs === undefined ? {} : { retryHint: Object.freeze({ delayMs }) }),
  });
}

export function stoppedPreflight(error: unknown): AttemptResult {
  return unsubmitted(allowedErrorCode(error, ['deadline']) ? 'pre_handoff_timeout' : 'worker_stopped');
}

async function resolveAttachments(
  config: WorkerConfig,
  { snapshot }: ClaimedEmail,
  budget: OperationBudget,
  slot: CallbackSlot,
): Promise<{ attachments: readonly ResolvedAttachment[] } | { result: AttemptResult }> {
  const attachments: ResolvedAttachment[] = [];
  if (!snapshot.attachments.length) return { attachments: Object.freeze(attachments) };
  const stage = createChildBudget(config.clock, budget, config.limits.attachmentTimeoutMs);
  const context = Object.freeze({ scope: config.scope, signal: stage.signal });
  try {
    // A single stage budget across all refs. Exact byte lengths preserve the validated snapshot's aggregate cap.
    for (const ref of snapshot.attachments) {
      stage.check();
      const resolve = config.resolvers.get(ref.resolverKey);
      if (!resolve) return { result: unsubmitted('attachment_invalid') };
      const bytes = await runHostCallback(
        stage,
        slot,
        'preparation_failed',
        () => resolve(ref, context),
        (value) => {
          const raw = readRecord(value, ['status'], ['bytes'], 'invalid_snapshot');
          if (raw.status === 'unavailable' && !Object.hasOwn(raw, 'bytes')) return null;
          if (raw.status !== 'found') invalid('invalid_snapshot');
          return copyAttachmentBytes(ref, raw.bytes);
        },
      );
      if (!bytes) return { result: unsubmitted('attachment_unavailable') };
      attachments.push(Object.freeze({ ref, bytes }));
    }
    return { attachments: Object.freeze(attachments) };
  } catch (error) {
    budget.check();
    const code = allowedErrorCode(error, ['deadline', 'invalid_snapshot']);
    return {
      result: unsubmitted(
        code === 'deadline'
          ? 'attachment_timeout'
          : code === 'invalid_snapshot'
            ? 'attachment_invalid'
            : 'attachment_resolver_error',
      ),
    };
  } finally {
    stage.close();
  }
}

async function ratePermission(
  config: WorkerConfig,
  { snapshot }: ClaimedEmail,
  budget: OperationBudget,
  slot: CallbackSlot,
): Promise<AttemptResult | undefined> {
  if (!config.limiter) return;
  const { tryAcquire } = config.limiter;
  const stage = createChildBudget(config.clock, budget, config.limits.rateTimeoutMs);
  try {
    const retryAfter = await runHostCallback(
      stage,
      slot,
      'preparation_failed',
      () => tryAcquire(Object.freeze({ scope: config.scope, provider: snapshot.provider, signal: stage.signal })),
      (value) => {
        const raw = readRecord(value, ['status'], ['retryAfterMs'], 'invalid_config');
        if (raw.status === 'granted' && !Object.hasOwn(raw, 'retryAfterMs')) return undefined;
        if (raw.status !== 'deferred') invalid('invalid_config');
        return integer(raw.retryAfterMs, 1, MAX_RATE_DEFERRAL_MS, 'invalid_config');
      },
    );
    return retryAfter === undefined ? undefined : unsubmitted('rate_deferred', retryAfter);
  } catch (error) {
    budget.check();
    return unsubmitted(allowedErrorCode(error, ['deadline']) ? 'rate_timeout' : 'rate_error');
  } finally {
    stage.close();
  }
}

export async function prepareAttempt(
  config: WorkerConfig,
  claim: ClaimedEmail,
  budget: OperationBudget,
  slot: CallbackSlot,
): Promise<Preflight> {
  const { snapshot, fence } = claim;
  try {
    budget.check();
    const profile = config.profiles.get(snapshot.provider.key);
    if (!profile || !sameProvider(profile.ref, snapshot.provider))
      return { result: unsubmitted('profile_unavailable') };
    const resolved = await resolveAttachments(config, claim, budget, slot);
    if ('result' in resolved) return resolved;
    let submit: Submit;
    try {
      const prepared = runSyncCallback(budget, slot, 'preparation_failed', () =>
        profile.prepare(
          Object.freeze({
            jobId: fence.jobId,
            attemptId: fence.attemptId,
            snapshot,
            attachments: resolved.attachments,
          }),
        ),
      );
      if (readPortMember(prepared, 'then') !== undefined) invalid('preparation_failed');
      submit = bindMethod<Submit>(prepared, 'submit');
    } catch {
      budget.check();
      return { result: unsubmitted('provider_preflight_error') };
    }
    // Capture submit above, synchronously, so no provider-defined member lookup remains after the marker.
    const deferred = await ratePermission(config, claim, budget, slot);
    if (deferred) return { result: deferred };
    budget.check();
    return { submit };
  } catch (error) {
    return { result: stoppedPreflight(error) };
  }
}
