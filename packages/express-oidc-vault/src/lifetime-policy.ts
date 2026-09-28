import { DEFAULT_AUTHORIZATION_TRANSACTION_TTL_MS, DEFAULT_EXCHANGE_CODE_TTL_MS } from './constants';
import type { OidcVaultOptions } from './types';

// ECMAScript Date's range is narrower than the safe-integer range. Keeping
// epochs inside it also supports stores that serialize expiries as Dates.
const MAX_EPOCH_MS = 8_640_000_000_000_000;

export const isUsableEpochMs = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && Math.abs(value) <= MAX_EPOCH_MS;

export const computeExpiresAt = (now: number, ttlMs: number, name: string): number => {
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    throw new Error(`${name} must be a positive safe integer in milliseconds.`);
  }

  const expiresAt = now + ttlMs;
  if (!isUsableEpochMs(now) || !isUsableEpochMs(expiresAt) || expiresAt <= now) {
    throw new Error(`${name} must produce a usable epoch-millisecond expiry after now.`);
  }

  return expiresAt;
};

export const validateLifetimeOptions = (options: OidcVaultOptions, now: number): void => {
  computeExpiresAt(
    now,
    options.authorizationTransactionTtlMs === undefined
      ? DEFAULT_AUTHORIZATION_TRANSACTION_TTL_MS
      : options.authorizationTransactionTtlMs,
    'authorizationTransactionTtlMs',
  );
  computeExpiresAt(
    now,
    options.exchangeCodeTtlMs === undefined ? DEFAULT_EXCHANGE_CODE_TTL_MS : options.exchangeCodeTtlMs,
    'exchangeCodeTtlMs',
  );
  if (options.sessionTtlMs !== undefined) {
    computeExpiresAt(now, options.sessionTtlMs, 'sessionTtlMs');
  }
};
