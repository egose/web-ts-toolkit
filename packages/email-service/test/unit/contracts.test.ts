import { describe, expect, it } from 'vitest';
import { EmailError, type EmailErrorCode } from '../../src';
import {
  ACTIVITY_STUB_TTL_MS,
  CLOCK_MARGIN_MS,
  DEFAULT_EXPIRY_MS,
  DEFAULT_RETENTION_POLICY,
  DEFAULT_RETRY_POLICY,
  DEFAULT_WORKER_LIMITS,
  EMAIL_FORMAT_VERSION,
  MAX_ATTEMPT_LEDGER,
  MAX_EXPIRY_MS,
  PROJECTION_DRAIN_MS,
  RETRY_POLICY_BOUNDS,
  WORKER_LIMIT_BOUNDS,
} from '../../src/constants';

describe('EmailError', () => {
  it('reports fixed diagnostics and distinguishes an uncertain write from store unavailability', () => {
    const error = new EmailError('write_unconfirmed');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('EmailError');
    expect(error.code).toBe('write_unconfirmed');
    expect(error.message).toBe('Email store write not confirmed; it may have committed.');
    expect(error).not.toHaveProperty('cause');
    expect(error.message).not.toBe(new EmailError('store_unavailable').message);
  });

  it('does not use arbitrary JS values or inherited keys in diagnostics', () => {
    const untypedValue = {
      toString() {
        throw new Error('An untrusted code must not be coerced.');
      },
    };
    for (const value of [untypedValue, 'constructor', 'synthetic-private-data']) {
      const error = new EmailError(value as EmailErrorCode);
      expect(error.code).toBe('invalid_config');
      expect(error.message).toBe('Invalid email service configuration.');
    }
  });
});

describe('V1 defaults', () => {
  it('keeps a finite immutable retry policy and room for exactly one manual redrive', () => {
    expect(EMAIL_FORMAT_VERSION).toBe(1);
    expect(DEFAULT_RETRY_POLICY).toEqual({ maxAttempts: 3, baseDelayMs: 1_000, maxDelayMs: 60_000 });
    expect(Object.isFrozen(DEFAULT_RETRY_POLICY)).toBe(true);
    expect(Object.isFrozen(RETRY_POLICY_BOUNDS.maxAttempts)).toBe(true);
    expect(MAX_ATTEMPT_LEDGER).toBe(11);
  });

  it('leaves the required lease and projection time margins', () => {
    const { leaseMs, storeTimeoutMs, providerTimeoutMs, finalizeGraceMs } = DEFAULT_WORKER_LIMITS;
    expect(leaseMs).toBeGreaterThanOrEqual(3 * storeTimeoutMs + CLOCK_MARGIN_MS);
    expect(leaseMs).toBeGreaterThanOrEqual(storeTimeoutMs + providerTimeoutMs + finalizeGraceMs + CLOCK_MARGIN_MS);
    expect(PROJECTION_DRAIN_MS).toBe(WORKER_LIMIT_BOUNDS.storeTimeoutMs.max + CLOCK_MARGIN_MS);
    expect(PROJECTION_DRAIN_MS).toBe(31_000);
    expect(ACTIVITY_STUB_TTL_MS).toBe(60_000);
  });

  it('distinguishes default expiry and retention windows', () => {
    expect(DEFAULT_EXPIRY_MS).toBe(86_400_000);
    expect(MAX_EXPIRY_MS).toBe(30 * DEFAULT_EXPIRY_MS);
    expect(DEFAULT_RETENTION_POLICY).toEqual({
      payloadMs: 7 * DEFAULT_EXPIRY_MS,
      historyMs: 30 * DEFAULT_EXPIRY_MS,
      idempotencyMs: 30 * DEFAULT_EXPIRY_MS,
    });
    expect(Object.isFrozen(DEFAULT_RETENTION_POLICY)).toBe(true);
  });
});
