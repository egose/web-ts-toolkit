import {
  CALL_BUDGETS,
  MAX_UNIX_MS,
  RETENTION_POLICY_BOUNDS,
  RETRY_POLICY_BOUNDS,
  STORE_PRIMITIVE_TIMEOUT_MS,
  WORKER_LIMIT_BOUNDS,
} from '../constants';
import type { ResolveUnknownCommand, RetentionPolicy, RetryPolicy } from '../contracts/job';
import type { UnixMs } from '../contracts/message';
import type { OwnerFence, StoreAdmission, StoreCall, StoreClaimNext, StoreNext } from '../contracts/store';
import type { EmailErrorCode } from '../errors';
import { assertEvidencePhase, readAttemptResult } from './attempt-codecs';
import { readCallOptions } from './budget';
import { encodeAdmissionKey, validatePreparedCommand } from './command-codecs';
import { assertCapacityTag, type CapacityContext } from './smtp-capacity';
import { integer, invalid, readRecord, uuidV4 } from './validation';

const REQUEST = 'invalid_command';
const LEASE = WORKER_LIMIT_BOUNDS.leaseMs;

/** Opaque random UUIDs, in the canonical spelling produced by Node's randomUUID(). */
export function readStoreId(value: unknown, code: EmailErrorCode = REQUEST): string {
  return uuidV4(value, code);
}

/** The caller generates an independent random secret (at least 128 bits); syntax alone cannot establish entropy. */
export function readLeaseToken(value: unknown, code: EmailErrorCode = REQUEST): string {
  if (
    typeof value !== 'string' ||
    value.length < 22 ||
    value.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(value) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  ) {
    invalid(code);
  }
  return value;
}

export function readLeaseMs(value: unknown): number {
  return integer(value, LEASE.min, LEASE.max, REQUEST);
}

/** An absent deadline cannot mature; clamping a retention deadline would shorten a promised minimum. */
export function timeAfter(start: UnixMs, delayMs: number): UnixMs | undefined {
  return delayMs <= MAX_UNIX_MS - start ? start + delayMs : undefined;
}

/** Child operations may have a shorter budget than the worker's public override floor. */
export function readStoreCall(input: unknown, worker = false, capacity?: CapacityContext): StoreCall {
  const code = 'invalid_config';
  const { smtpCapacity, ...raw } = readRecord(input, ['signal', 'timeoutMs'], capacity ? ['smtpCapacity'] : [], code);
  if (capacity) assertCapacityTag({ smtpCapacity }, capacity, 'store_incompatible');
  const max = worker ? WORKER_LIMIT_BOUNDS.storeTimeoutMs.max : CALL_BUDGETS.admissionOrAdmin.max;
  const timeoutMs = integer(raw.timeoutMs, 1, max, code);
  const call = readCallOptions(raw, { default: STORE_PRIMITIVE_TIMEOUT_MS, min: 1, max });
  if (!call.signal) invalid(code);
  return {
    signal: call.signal,
    timeoutMs: worker && !capacity ? timeoutMs : Math.min(timeoutMs, STORE_PRIMITIVE_TIMEOUT_MS),
  };
}

export function readStoreNext<T>(value: unknown, read: (input: unknown) => T): StoreNext<T>;
export function readStoreNext<T>(value: unknown, read: (input: unknown) => T, kind: 'claim'): StoreClaimNext<T>;
export function readStoreNext<T>(value: unknown, read: (input: unknown) => T, kind?: 'claim'): StoreClaimNext<T> {
  const code = 'store_incompatible';
  const raw = readRecord(value, ['status'], ['value'], code);
  if (raw.status === 'applied' && Object.hasOwn(raw, 'value')) {
    return Object.freeze({ status: raw.status, value: read(raw.value) });
  }
  if ((raw.status === 'none' || raw.status === 'contended') && !Object.hasOwn(raw, 'value')) {
    return Object.freeze({ status: raw.status });
  }
  if (kind === 'claim' && raw.status === 'expiry_maintenance_required' && !Object.hasOwn(raw, 'value')) {
    return Object.freeze({ status: raw.status });
  }
  return invalid(code);
}

export function readRetryPolicy(input: unknown, code: EmailErrorCode = REQUEST): Readonly<RetryPolicy> {
  const raw = readRecord(input, ['maxAttempts', 'baseDelayMs', 'maxDelayMs'], [], code);
  const bounds = RETRY_POLICY_BOUNDS;
  const baseDelayMs = integer(raw.baseDelayMs, bounds.baseDelayMs.min, bounds.baseDelayMs.max, code);
  return Object.freeze({
    maxAttempts: integer(raw.maxAttempts, bounds.maxAttempts.min, bounds.maxAttempts.max, code),
    baseDelayMs,
    maxDelayMs: integer(raw.maxDelayMs, baseDelayMs, bounds.maxDelayMs.max, code),
  });
}

export function readRetentionPolicy(input: unknown, code: EmailErrorCode = REQUEST): Readonly<RetentionPolicy> {
  const { payloadMs, historyMs, idempotencyMs } = readRecord(
    input,
    ['payloadMs', 'historyMs', 'idempotencyMs'],
    [],
    code,
  );
  const bounds = RETENTION_POLICY_BOUNDS;
  return Object.freeze({
    payloadMs: integer(payloadMs, bounds.payloadMs.min, bounds.payloadMs.max, code),
    historyMs: integer(historyMs, bounds.historyMs.min, bounds.historyMs.max, code),
    idempotencyMs: integer(idempotencyMs, bounds.idempotencyMs.min, bounds.idempotencyMs.max, code),
  });
}

export type ValidatedAdmission = Readonly<StoreAdmission & { admissionKey: string }>;

export function readStoreAdmission(scope: string, input: unknown, capacity?: CapacityContext): ValidatedAdmission {
  const raw = readRecord(input, ['command', 'jobId', 'retry', 'retention'], [], REQUEST);
  const command = validatePreparedCommand(scope, raw.command, capacity);
  return Object.freeze({
    command,
    admissionKey: encodeAdmissionKey(command.key),
    jobId: readStoreId(raw.jobId),
    retry: readRetryPolicy(raw.retry),
    retention: readRetentionPolicy(raw.retention),
  });
}

export function readFence(input: unknown): OwnerFence {
  const { jobId, attemptId, token } = readRecord(input, ['jobId', 'attemptId', 'token'], [], REQUEST);
  return Object.freeze({ jobId: readStoreId(jobId), attemptId: readStoreId(attemptId), token: readLeaseToken(token) });
}

export type ClaimRequest = ReturnType<typeof readClaim>;
export function readClaim(input: unknown) {
  const { attemptId, token, leaseMs } = readRecord(input, ['attemptId', 'token', 'leaseMs'], [], REQUEST);
  return Object.freeze({
    attemptId: readStoreId(attemptId),
    token: readLeaseToken(token),
    leaseMs: readLeaseMs(leaseMs),
  });
}

export type FinishRequest = ReturnType<typeof readFinish>;
export function readFinish(input: unknown, capacity?: CapacityContext) {
  const { fence, phase, operationId, result } = readRecord(
    input,
    ['fence', 'phase', 'operationId', 'result'],
    [],
    REQUEST,
  );
  if (phase !== 'pre_handoff' && phase !== 'handed_off') invalid(REQUEST);
  const evidence = readAttemptResult(result, REQUEST, false, capacity);
  assertEvidencePhase(evidence.reason, phase, 'owner', REQUEST);
  return Object.freeze({ fence: readFence(fence), phase, operationId: readStoreId(operationId), result: evidence });
}

export function readResolution(input: unknown): Readonly<ResolveUnknownCommand> {
  const raw = readRecord(input, ['jobId', 'attemptId', 'action'], ['acknowledgeDuplicateRisk'], REQUEST);
  const ids = { jobId: readStoreId(raw.jobId), attemptId: readStoreId(raw.attemptId) };
  if (raw.action === 'dismiss' && !Object.hasOwn(raw, 'acknowledgeDuplicateRisk')) {
    return Object.freeze({ ...ids, action: raw.action });
  }
  if (raw.action === 'redrive' && raw.acknowledgeDuplicateRisk === true) {
    return Object.freeze({ ...ids, action: raw.action, acknowledgeDuplicateRisk: true });
  }
  return invalid(REQUEST);
}
