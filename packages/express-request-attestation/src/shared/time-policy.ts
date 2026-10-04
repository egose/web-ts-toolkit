/**
 * ATT-01 time acceptance and replay retention: one formula everywhere
 * (task section 4.4). Milliseconds consistently.
 *
 * ```text
 * reject future proof if timestampMs > nowMs + clockSkewMs
 * timeDeadline  = timestampMs + maxAgeMs + clockSkewMs
 * proofDeadline = min(timeDeadline, acceptedKey.acceptUntil)
 * reject when nowMs >= proofDeadline or acceptedKey is not active at nowMs
 * retainUntil   = proofDeadline + clusterClockGuardMs
 * ```
 *
 * `clusterClockGuardMs` is a declared maximum pairwise clock difference
 * between verifiers/replay stores, not an extra client freshness allowance.
 * Options: `maxAgeMs = 30000` (1000-120000); `clockSkewMs = 5000`
 * (0-30000); `clusterClockGuardMs = 5000` (0-30000).
 */
import { assertTimestampMs } from './canonical.js';
import {
  AttestationProtocolError,
  DEFAULT_CLOCK_SKEW_MS,
  DEFAULT_CLUSTER_CLOCK_GUARD_MS,
  DEFAULT_MAX_AGE_MS,
  GLOBAL_MAX_RETENTION_MS,
  MAX_CLOCK_SKEW_MS,
  MAX_CLUSTER_CLOCK_GUARD_MS,
  MAX_MAX_AGE_MS,
  MIN_CLOCK_SKEW_MS,
  MIN_CLUSTER_CLOCK_GUARD_MS,
  MIN_MAX_AGE_MS,
  type ProofTiming,
  type ResolvedTimePolicy,
  type RetentionAdmission,
  type TimePolicyOptions,
} from './types.js';

function assertPolicyField(name: string, value: number, min: number, max: number): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new AttestationProtocolError(`${name} must be a safe integer in [${min}, ${max}]`);
  }
}

/**
 * Validate partial overrides and return the frozen effective policy.
 * Unknown option keys are rejected so typos cannot silently widen windows.
 */
export function resolveTimePolicy(options: TimePolicyOptions = {}): ResolvedTimePolicy {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new AttestationProtocolError('time policy options must be an object');
  }
  const allowed = new Set(['maxAgeMs', 'clockSkewMs', 'clusterClockGuardMs']);
  for (const key of Object.keys(options)) {
    if (!allowed.has(key)) {
      throw new AttestationProtocolError(`unknown time policy option ${key}`);
    }
  }
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const clockSkewMs = options.clockSkewMs ?? DEFAULT_CLOCK_SKEW_MS;
  const clusterClockGuardMs = options.clusterClockGuardMs ?? DEFAULT_CLUSTER_CLOCK_GUARD_MS;
  assertPolicyField('maxAgeMs', maxAgeMs, MIN_MAX_AGE_MS, MAX_MAX_AGE_MS);
  assertPolicyField('clockSkewMs', clockSkewMs, MIN_CLOCK_SKEW_MS, MAX_CLOCK_SKEW_MS);
  assertPolicyField('clusterClockGuardMs', clusterClockGuardMs, MIN_CLUSTER_CLOCK_GUARD_MS, MAX_CLUSTER_CLOCK_GUARD_MS);
  return Object.freeze({ maxAgeMs, clockSkewMs, clusterClockGuardMs });
}

/**
 * Evaluate one proof's timing against a KNOWN key entry's acceptance window.
 *
 * Key-status ordering follows section 4.5: unknown/inactive well-formed key
 * IDs are `stale-key` (the caller determines key lookup; pass the entry's
 * window here), a known active key with an elapsed timestamp is `expired`,
 * and excessive future skew is `future`. The verifier repeats this check
 * after async provider work, immediately before reservation, and before
 * calling the handler after reservation (ATT-02).
 *
 * Deadline arithmetic must remain safe integers; a timestamp so large that
 * `timestampMs + maxAgeMs + clockSkewMs` leaves safe-integer range cannot
 * prove freshness and is rejected as `expired` with `null` deadlines.
 */
export function evaluateProofTiming(input: {
  readonly timestampMs: number;
  readonly nowMs: number;
  readonly acceptFrom: number;
  readonly acceptUntil: number;
  readonly policy: ResolvedTimePolicy;
}): ProofTiming {
  assertTimestampMs('timestampMs', input.timestampMs);
  assertTimestampMs('nowMs', input.nowMs);
  assertTimestampMs('acceptFrom', input.acceptFrom);
  assertTimestampMs('acceptUntil', input.acceptUntil);
  if (input.acceptFrom >= input.acceptUntil) {
    throw new AttestationProtocolError('key acceptance window must satisfy acceptFrom < acceptUntil');
  }
  const { timestampMs, nowMs, acceptFrom, acceptUntil, policy } = input;
  const active = acceptFrom <= nowMs && nowMs < acceptUntil;
  if (!active) {
    // Retired or not-yet-active keys are stale even with a fresh timestamp.
    // Bound the reported deadlines without overflowing.
    const timeDeadlineMs = safeAdd3(timestampMs, policy.maxAgeMs, policy.clockSkewMs);
    const proofDeadlineMs = timeDeadlineMs === null ? acceptUntil : Math.min(timeDeadlineMs, acceptUntil);
    return {
      decision: 'stale-key',
      timeDeadlineMs,
      proofDeadlineMs,
      retainUntilMs: safeAdd(proofDeadlineMs, policy.clusterClockGuardMs),
    };
  }
  if (timestampMs > nowMs + policy.clockSkewMs) {
    const timeDeadlineMs = safeAdd3(timestampMs, policy.maxAgeMs, policy.clockSkewMs);
    const proofDeadlineMs = timeDeadlineMs === null ? acceptUntil : Math.min(timeDeadlineMs, acceptUntil);
    return {
      decision: 'future',
      timeDeadlineMs,
      proofDeadlineMs,
      retainUntilMs: safeAdd(proofDeadlineMs, policy.clusterClockGuardMs),
    };
  }
  const timeDeadlineMs = safeAdd3(timestampMs, policy.maxAgeMs, policy.clockSkewMs);
  if (timeDeadlineMs === null) {
    return { decision: 'expired', timeDeadlineMs: null, proofDeadlineMs: null, retainUntilMs: null };
  }
  const proofDeadlineMs = Math.min(timeDeadlineMs, acceptUntil);
  if (nowMs >= proofDeadlineMs) {
    return {
      decision: 'expired',
      timeDeadlineMs,
      proofDeadlineMs,
      retainUntilMs: safeAdd(proofDeadlineMs, policy.clusterClockGuardMs),
    };
  }
  return {
    decision: 'valid',
    timeDeadlineMs,
    proofDeadlineMs,
    retainUntilMs: safeAdd(proofDeadlineMs, policy.clusterClockGuardMs),
  };
}

function safeAdd(first: number, second: number): number | null {
  const sum = first + second;
  return Number.isSafeInteger(sum) ? sum : null;
}

function safeAdd3(first: number, second: number, third: number): number | null {
  const sum = first + second + third;
  return Number.isSafeInteger(sum) ? sum : null;
}

/**
 * Maximum remaining retention measured AT a verifier:
 * `maxAgeMs + 2 * clockSkewMs + clusterClockGuardMs` (default 45000 ms).
 */
export function maxVerifierRemainingMs(policy: ResolvedTimePolicy): number {
  return policy.maxAgeMs + 2 * policy.clockSkewMs + policy.clusterClockGuardMs;
}

/**
 * Store admission bound: `maxAgeMs + 2 * clockSkewMs + 2 * clockGuardMs`
 * (default 50000 ms). A store clock may additionally trail the verifier by
 * the declared guard. Capped globally at 240000 ms.
 */
export function maxStoreAdmissionMs(policy: ResolvedTimePolicy): number {
  return Math.min(GLOBAL_MAX_RETENTION_MS, policy.maxAgeMs + 2 * policy.clockSkewMs + 2 * policy.clusterClockGuardMs);
}

/**
 * Check whether a store may admit `retainUntilMs` at `nowMs`. Stores reject
 * unsafe, already-expired, or overlong retention INSTEAD of truncating it.
 */
export function checkRetentionAdmissible(input: {
  readonly retainUntilMs: number;
  readonly nowMs: number;
  readonly policy: ResolvedTimePolicy;
}): RetentionAdmission {
  assertTimestampMs('retainUntilMs', input.retainUntilMs);
  assertTimestampMs('nowMs', input.nowMs);
  const { retainUntilMs, nowMs, policy } = input;
  if (retainUntilMs <= nowMs) {
    return 'expired';
  }
  const remaining = retainUntilMs - nowMs;
  if (!Number.isSafeInteger(remaining)) {
    return 'overlong';
  }
  if (remaining > GLOBAL_MAX_RETENTION_MS) {
    return 'overlong';
  }
  if (remaining > maxStoreAdmissionMs(policy)) {
    return 'overlong';
  }
  return 'admissible';
}
