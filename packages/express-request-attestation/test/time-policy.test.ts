/**
 * ATT-01 time-policy tests: option bounds, the single section 4.4 formula,
 * exact deadline/future/skew boundaries, key-activity ordering, retention
 * bounds, and safe-integer/overflow cases.
 */
import { describe, expect, it } from 'vitest';

import {
  checkRetentionAdmissible,
  evaluateProofTiming,
  maxStoreAdmissionMs,
  maxVerifierRemainingMs,
  resolveTimePolicy,
} from '../src/index.js';
import type { ResolvedTimePolicy } from '../src/index.js';

const NOW = 1_700_000_000_000;
const POLICY: ResolvedTimePolicy = resolveTimePolicy();

function timing(overrides: {
  timestampMs?: number;
  nowMs?: number;
  acceptFrom?: number;
  acceptUntil?: number;
  policy?: ResolvedTimePolicy;
}) {
  return evaluateProofTiming({
    timestampMs: overrides.timestampMs ?? NOW - 10_000,
    nowMs: overrides.nowMs ?? NOW,
    acceptFrom: overrides.acceptFrom ?? NOW - 60_000,
    acceptUntil: overrides.acceptUntil ?? NOW + 60_000,
    policy: overrides.policy ?? POLICY,
  });
}

describe('resolveTimePolicy', () => {
  it('applies section 4.4 defaults and freezes the result', () => {
    expect(POLICY).toEqual({ maxAgeMs: 30_000, clockSkewMs: 5_000, clusterClockGuardMs: 5_000 });
    expect(Object.isFrozen(POLICY)).toBe(true);
  });

  it('accepts documented range edges and rejects the rest', () => {
    expect(resolveTimePolicy({ maxAgeMs: 1_000 }).maxAgeMs).toBe(1_000);
    expect(resolveTimePolicy({ maxAgeMs: 120_000 }).maxAgeMs).toBe(120_000);
    expect(resolveTimePolicy({ clockSkewMs: 0 }).clockSkewMs).toBe(0);
    expect(resolveTimePolicy({ clockSkewMs: 30_000 }).clockSkewMs).toBe(30_000);
    expect(resolveTimePolicy({ clusterClockGuardMs: 0 }).clusterClockGuardMs).toBe(0);
    expect(resolveTimePolicy({ clusterClockGuardMs: 30_000 }).clusterClockGuardMs).toBe(30_000);
    for (const bad of [
      { maxAgeMs: 999 },
      { maxAgeMs: 120_001 },
      { maxAgeMs: 1000.5 },
      { clockSkewMs: -1 },
      { clockSkewMs: 30_001 },
      { clusterClockGuardMs: -1 },
      { clusterClockGuardMs: 30_001 },
      { maxAgeMs: Number.MAX_SAFE_INTEGER + 1 },
      { unknownOption: 1 },
    ]) {
      expect(() => resolveTimePolicy(bad as never), JSON.stringify(bad)).toThrow();
    }
  });
});

describe('evaluateProofTiming (one formula everywhere)', () => {
  it('accepts a fresh proof and reports exact deadlines', () => {
    const ts = NOW - 10_000;
    const result = timing({ timestampMs: ts });
    expect(result.decision).toBe('valid');
    // timeDeadline = ts + maxAge + skew; proofDeadline = min(., acceptUntil).
    expect(result.timeDeadlineMs).toBe(ts + 30_000 + 5_000);
    expect(result.proofDeadlineMs).toBe(ts + 35_000);
    expect(result.retainUntilMs).toBe(ts + 35_000 + 5_000);
  });

  it('enforces the future-skew boundary exactly', () => {
    expect(timing({ timestampMs: NOW + 5_000 }).decision).toBe('valid');
    expect(timing({ timestampMs: NOW + 5_001 }).decision).toBe('future');
  });

  it('rejects when now reaches the proof deadline', () => {
    const ts = NOW - 35_000;
    // timeDeadline = NOW exactly -> expired at equality.
    expect(timing({ timestampMs: ts }).decision).toBe('expired');
    expect(timing({ timestampMs: ts + 1 }).decision).toBe('valid');
  });

  it('clamps the proof deadline to a retiring key', () => {
    const acceptUntil = NOW + 1_000;
    const valid = timing({ acceptUntil, nowMs: NOW });
    expect(valid.decision).toBe('valid');
    expect(valid.proofDeadlineMs).toBe(acceptUntil);
    expect(valid.retainUntilMs).toBe(acceptUntil + 5_000);
    // At the retirement instant the key is no longer active -> stale-key,
    // even though the timestamp itself is still fresh.
    expect(timing({ acceptUntil, nowMs: acceptUntil }).decision).toBe('stale-key');
  });

  it('reports stale-key for retired or not-yet-active keys before expiry', () => {
    expect(timing({ acceptUntil: NOW - 1 }).decision).toBe('stale-key');
    expect(timing({ acceptFrom: NOW + 1 }).decision).toBe('stale-key');
    // Unknown-key-shaped input (empty window) is a programmer error, surfaced loudly.
    expect(() => timing({ acceptFrom: NOW, acceptUntil: NOW })).toThrow();
  });

  it('rejects unrepresentable deadlines as expired without overflowing', () => {
    // A far-future timestamp is `future` per the formula, even near MAX_SAFE_INTEGER.
    expect(timing({ timestampMs: Number.MAX_SAFE_INTEGER }).decision).toBe('future');
    // Overflow inside the acceptance window (clock near the safe-integer
    // ceiling) cannot prove freshness and is rejected as `expired`.
    const nearCeiling = Number.MAX_SAFE_INTEGER - 12_000;
    const result = timing({
      timestampMs: nearCeiling + 2_000,
      nowMs: nearCeiling,
      acceptFrom: nearCeiling - 1_000,
      acceptUntil: Number.MAX_SAFE_INTEGER,
    });
    expect(result.decision).toBe('expired');
    expect(result.timeDeadlineMs).toBeNull();
    expect(result.proofDeadlineMs).toBeNull();
    expect(result.retainUntilMs).toBeNull();
  });

  it('validates timestamp and clock inputs', () => {
    for (const bad of [-1, 1.5, Number.NaN, 'x']) {
      expect(() => timing({ timestampMs: bad as never })).toThrow();
      expect(() => timing({ nowMs: bad as never })).toThrow();
    }
  });
});

describe('retention bounds', () => {
  it('computes the documented default maxima', () => {
    // Verifier: maxAge + 2*skew + guard = 45000. Store: + guard again = 50000.
    expect(maxVerifierRemainingMs(POLICY)).toBe(45_000);
    expect(maxStoreAdmissionMs(POLICY)).toBe(50_000);
  });

  it('caps store admission at the 240000 ms global profile cap', () => {
    const maxed = resolveTimePolicy({ maxAgeMs: 120_000, clockSkewMs: 30_000, clusterClockGuardMs: 30_000 });
    expect(maxStoreAdmissionMs(maxed)).toBe(240_000);
    expect(maxVerifierRemainingMs(maxed)).toBe(210_000);
  });

  it('admits, expires, or rejects overlong retention without truncating', () => {
    expect(checkRetentionAdmissible({ retainUntilMs: NOW, nowMs: NOW, policy: POLICY })).toBe('expired');
    expect(checkRetentionAdmissible({ retainUntilMs: NOW - 1, nowMs: NOW, policy: POLICY })).toBe('expired');
    expect(checkRetentionAdmissible({ retainUntilMs: NOW + 50_000, nowMs: NOW, policy: POLICY })).toBe('admissible');
    expect(checkRetentionAdmissible({ retainUntilMs: NOW + 50_001, nowMs: NOW, policy: POLICY })).toBe('overlong');
    expect(checkRetentionAdmissible({ retainUntilMs: NOW + 240_001, nowMs: NOW, policy: POLICY })).toBe('overlong');
  });
});
