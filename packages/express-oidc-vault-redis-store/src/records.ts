import type {
  AuthorizationTransaction,
  ExchangeCodeRecord,
  OidcVaultSession,
} from '@web-ts-toolkit/express-oidc-vault';

export const serialize = (value: unknown): string => JSON.stringify(value);

/**
 * Thrown when a stored Redis value cannot be parsed or fails structural
 * validation (including identity mismatch with the requested key). The message
 * never includes stored token or refresh values.
 * Malformed one-time records are consumed atomically and return `null`; they
 * fail closed without throwing this error. Malformed sessions are deleted when
 * encountered through reads or indexed revocation.
 */
export class OidcVaultRedisStoreRecordError extends Error {
  constructor(recordKind: string) {
    super(`OIDC vault Redis store found malformed ${recordKind} record.`);
    this.name = 'OidcVaultRedisStoreRecordError';
  }
}

export type StoredRecordKind = 'authorization transaction' | 'exchange code' | 'session' | 'rotated session alias';

export const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isString = (value: unknown): value is string => typeof value === 'string';

const isOptionalString = (value: unknown): value is string | undefined => value === undefined || isString(value);

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const isOptionalFiniteNumber = (value: unknown): value is number | undefined =>
  value === undefined || isFiniteNumber(value);

const isStringRecord = (value: unknown): value is Record<string, unknown> => isPlainRecord(value);

// Require the lookup identity at the validation boundary, before a decoded
// record can be returned or used to derive mutation keys.
export const validateAuthorizationTransaction = (value: unknown, state: string): value is AuthorizationTransaction =>
  isPlainRecord(value) &&
  isString(value.state) &&
  value.state === state &&
  isString(value.nonce) &&
  isString(value.pkceVerifier) &&
  isString(value.codeChallenge) &&
  isOptionalString(value.returnTo) &&
  isFiniteNumber(value.createdAt) &&
  isFiniteNumber(value.expiresAt) &&
  (value.metadata === undefined || isStringRecord(value.metadata));

export const validateExchangeCodeRecord = (value: unknown, code: string): value is ExchangeCodeRecord =>
  isPlainRecord(value) &&
  isString(value.code) &&
  value.code === code &&
  isString(value.sessionId) &&
  isOptionalString(value.returnTo) &&
  isFiniteNumber(value.createdAt) &&
  isFiniteNumber(value.expiresAt);

const validateProviderMetadata = (value: unknown): boolean =>
  value === undefined || (isPlainRecord(value) && isOptionalString(value.issuer) && isOptionalString(value.clientId));

export const validateSession = (value: unknown, sessionId: string): value is OidcVaultSession =>
  isPlainRecord(value) &&
  isString(value.sessionId) &&
  value.sessionId === sessionId &&
  isOptionalString(value.logicalSessionId) &&
  isString(value.subject) &&
  isOptionalString(value.providerSessionId) &&
  validateProviderMetadata(value.provider) &&
  isString(value.refreshToken) &&
  isString(value.idToken) &&
  isOptionalString(value.accessToken) &&
  isOptionalString(value.scope) &&
  isOptionalFiniteNumber(value.expiresAt) &&
  isFiniteNumber(value.createdAt) &&
  isFiniteNumber(value.updatedAt) &&
  (value.user === undefined || isPlainRecord(value.user)) &&
  (value.metadata === undefined || isPlainRecord(value.metadata));

export const parseStoredJson = <T>(
  value: string | null,
  recordKind: StoredRecordKind,
  validate: (parsed: unknown) => parsed is T,
): T | null => {
  if (value === null) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new OidcVaultRedisStoreRecordError(recordKind);
  }

  if (!validate(parsed)) {
    throw new OidcVaultRedisStoreRecordError(recordKind);
  }

  return parsed;
};
