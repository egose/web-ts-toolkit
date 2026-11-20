import { describe, expect, it } from 'vitest';
import type { ProviderResult, RetryPolicy } from '../../src';
import { MAX_UNIX_MS } from '../../src/constants';
import { attemptEffect } from '../../src/internal/attempt-codecs';
import { retryHint } from '../../src/providers/sendgrid/retry-hint';

const NOW = Date.UTC(2026, 10, 19, 12);
const KNOWN_DATE = Date.UTC(1994, 10, 6, 8, 49, 37);

describe('SendGrid throttle floors', () => {
  it.each(['Sun, 06 Nov 1994 08:49:37 GMT', 'Sunday, 06-Nov-94 08:49:37 GMT', 'Sun Nov  6 08:49:37 1994'])(
    'accepts the HTTP-date grammar for %s',
    (date) => {
      expect(retryHint(date, undefined, NOW)).toEqual({ notBefore: KNOWN_DATE });
      expect(retryHint(date, String(KNOWN_DATE / 1_000 + 2), NOW)).toEqual({ notBefore: KNOWN_DATE + 2_000 });
      expect(retryHint(date, String(KNOWN_DATE / 1_000 - 2), NOW)).toEqual({ notBefore: KNOWN_DATE });
    },
  );

  it.each([
    '-3',
    '+3',
    '1.5',
    '2e4',
    '3, 5',
    'Tomorrow',
    'Sun, 30 Feb 1994 08:49:37 GMT',
    'Mon, 06 Nov 1994 08:49:37 GMT',
    'Sun, 06 Nov 1994 08:49:60 GMT',
    'Sun, 06 Nov 1994 24:00:00 GMT',
    'Sun, 06 Nov 1994 08:49:37 UTC',
  ])('ignores the malformed hint %s without obscuring a valid reset', (value) => {
    expect(retryHint(value, '1.5', NOW)).toBeUndefined();
    expect(retryHint(value, '123', NOW)).toEqual({ notBefore: 123_000 });
  });

  it('preserves simultaneous relative and absolute floors, zero, and saturating arithmetic', () => {
    expect(retryHint('00010', '00123', NOW)).toEqual({ delayMs: 10_000, notBefore: 123_000 });
    expect(retryHint('0', undefined, NOW)).toEqual({ delayMs: 0 });
    expect(retryHint(undefined, '0', NOW)).toEqual({ notBefore: 0 });
    expect(retryHint('12', 'invalid', NOW)).toEqual({ delayMs: 12_000 });
    const huge = '9'.repeat(400);
    expect(retryHint(huge, huge, NOW)).toEqual({ delayMs: MAX_UNIX_MS, notBefore: MAX_UNIX_MS });
    expect(retryHint('Fri, 31 Dec 9999 23:59:60 GMT', undefined, NOW)).toEqual({ notBefore: MAX_UNIX_MS });
  });

  it('never shortens either valid floor when passed to the existing store decision', () => {
    const backoff: RetryPolicy = { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 500 };
    function decide(after: string, reset: number) {
      const result: ProviderResult = {
        outcome: 'rejected',
        retry: 'safe_transient',
        stage: 'http',
        reason: 'sendgrid_throttled',
        retryHint: retryHint(after, String(reset), NOW)!,
      };
      return attemptEffect(result, '01234567-89ab-4cde-abcd-0123456789ab', 1, false, backoff, NOW + 50_000, NOW);
    }
    expect(decide('15', NOW / 1_000 + 25)).toEqual({
      disposition: 'retry_scheduled',
      reason: 'sendgrid_throttled',
      retryAt: NOW + 25_000,
    });
    expect(decide('25', NOW / 1_000 + 15)).toEqual({
      disposition: 'retry_scheduled',
      reason: 'sendgrid_throttled',
      retryAt: NOW + 25_000,
    });
    expect(decide('9007199254740991', NOW / 1_000 + 10)).toEqual({ disposition: 'expired', reason: 'expired' });
  });
});
