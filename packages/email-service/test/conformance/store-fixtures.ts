import { randomBytes, randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import {
  EmailError,
  type AttemptCommit,
  type AttemptResult,
  type ClaimedEmail,
  type EmailAdmissionKey,
  type EmailSnapshot,
  type EmailStore,
  type ProviderRef,
  type RetentionPolicy,
  type RetryPolicy,
  type StoreAdmission,
  type StoreCall,
  type StoreNext,
} from '../../src';
import { DEFAULT_EXPIRY_MS, DEFAULT_RETENTION_POLICY, DEFAULT_RETRY_POLICY } from '../../src/constants';
import { smtpMessageId } from '../../src/internal/attempt-codecs';
import { parseCommandIdentity } from '../../src/internal/command-codecs';
import { hashSnapshot } from '../../src/internal/message-codecs';

export const A = 'tenant-A';
export const B = 'tenant-B';
export const CALL: Readonly<StoreCall> = Object.freeze({ signal: new AbortController().signal, timeoutMs: 5_000 });
export const LIVE_LEASE = 60_000;
export const LEASE = 5_000;
export const DAY = DEFAULT_EXPIRY_MS;
export const SMTP = { kind: 'smtp', key: 'smtp-profile', mode: 'live' } as const;
export const GRID = { kind: 'sendgrid', key: 'grid-profile', mode: 'live' } as const;
export const SANDBOX = { ...GRID, key: 'sandbox-profile', mode: 'sandbox' } as const;
export const STOPPED = {
  outcome: 'unsubmitted',
  retry: 'safe_transient',
  stage: 'pre_handoff',
  reason: 'worker_stopped',
} as const;
export const AMBIGUOUS = { outcome: 'unknown', retry: 'never', stage: 'data', reason: 'transport_uncertain' } as const;
export const TRANSIENT = {
  outcome: 'rejected',
  retry: 'safe_transient',
  stage: 'data',
  reason: 'smtp_transient_reply',
} as const;
export const RECIPIENTS = [
  { group: 'to', index: 0, status: 'accepted' },
  { group: 'cc', index: 0, status: 'accepted' },
  { group: 'bcc', index: 0, status: 'accepted' },
] as const;

export interface StoreFixture {
  primary: EmailStore;
  peer: EmailStore;
  /** Sample the fixture's store time, not a worker time. No clock override of a production adapter. */
  now(): number | Promise<number>;
  close?(): void | Promise<void>;
}

export interface ExactClockFixture extends StoreFixture {
  advanceTo(target: number): void | Promise<void>;
}

export type SetupStore<F extends StoreFixture> = () => F | Promise<F>;

export function fixtureId(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

export function admission(
  scope: string,
  preparedAt: number,
  options: {
    key?: EmailAdmissionKey;
    jobId?: string;
    content?: string;
    intent?: string;
    provider?: ProviderRef;
    priority?: number;
    expiresAt?: number;
    scheduleAt?: number;
    retry?: Partial<RetryPolicy>;
    retention?: Partial<RetentionPolicy>;
  } = {},
): StoreAdmission {
  const provider = options.provider ?? SMTP;
  const content = options.content ?? 'Private content https://example.invalid/token';
  const snapshotBase = {
    version: 1,
    template: { key: 'example', revision: 'v1' },
    envelope: {
      from: { address: 'sender@example.invalid', name: 'Private sender' },
      to: [{ address: 'receiver@example.invalid', name: 'Private recipient' }],
      cc: [{ address: 'cc@example.invalid' }],
      bcc: [{ address: 'bcc@example.invalid' }],
    },
    preparedAt,
    expiresAt: options.expiresAt ?? preparedAt + DAY,
    priority: options.priority ?? 0,
    attachments: [],
    correlation: { intent: 'opaque-correlation' },
  } as const;
  const snapshot: EmailSnapshot =
    provider.kind === 'smtp'
      ? { ...snapshotBase, kind: 'smtp', provider, subject: 'Private subject', text: content }
      : { ...snapshotBase, kind: 'sendgrid', provider, templateId: `d-${'a0'.repeat(16)}`, data: { content } };
  const jobId = options.jobId ?? randomUUID();
  const key = options.key ?? { kind: 'single', idempotencyKey: jobId };
  const { identity } = parseCommandIdentity(scope, {
    key,
    provider,
    templateKey: snapshot.template.key,
    intent: options.intent ?? 'stable business intent',
    input: undefined,
    ...(options.scheduleAt === undefined ? {} : { scheduleAt: options.scheduleAt }),
  });
  const { templateKey, provider: profile, ...command } = identity;
  expect(templateKey).toBe(snapshot.template.key);
  expect(profile).toEqual(provider);
  return {
    command: { version: 1, ...command, snapshot, snapshotHash: hashSnapshot(snapshot) },
    jobId,
    retry: { ...DEFAULT_RETRY_POLICY, ...options.retry },
    retention: { ...DEFAULT_RETENTION_POLICY, ...options.retention },
  };
}

export function claimData(leaseMs = LIVE_LEASE, attemptId: string = randomUUID()) {
  return { leaseMs, attemptId, token: randomBytes(16).toString('base64url') };
}

export function applied<T>(next: StoreNext<T>): T {
  if (next.status !== 'applied') throw new Error(`Expected an applied store operation, got ${next.status}`);
  return next.value;
}

export async function insert(store: EmailStore, value: StoreAdmission) {
  const result = await store.insert(value.command.scope, value, CALL);
  if (result.status !== 'inserted') throw new Error('Expected a fresh store identity');
  return result.job;
}

export async function claim(store: EmailStore, scope: string, data = claimData()) {
  return applied(await store.claimNext(scope, data, CALL));
}

export function finishData(
  item: ClaimedEmail,
  result: AttemptResult,
  phase: 'pre_handoff' | 'handed_off' = 'handed_off',
) {
  return { fence: item.fence, phase, operationId: randomUUID(), result };
}

export function accepted(attemptId: string): AttemptResult {
  return {
    outcome: 'accepted',
    retry: 'never',
    stage: 'data',
    reason: 'smtp_accepted',
    recipients: RECIPIENTS,
    messageId: smtpMessageId(attemptId),
  };
}

export async function finishClaim(
  store: EmailStore,
  scope: string,
  data: ReturnType<typeof finishData>,
): Promise<AttemptCommit> {
  const result = await store.finish(scope, data, CALL);
  if (!result) throw new Error('Expected a confirmed attempt commit');
  return result;
}

/** Simulates the two possible sides of an uncertain write boundary, not a driver or failover. */
export async function lostAck<T>(mode: 'before_commit' | 'after_commit', write: () => Promise<T>): Promise<never> {
  if (mode === 'after_commit') await write();
  throw new EmailError('write_unconfirmed');
}
