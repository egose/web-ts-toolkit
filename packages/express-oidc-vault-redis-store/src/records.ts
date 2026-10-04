import type {
  AuthorizationTransaction,
  ExchangeCodeRecord,
  OidcVaultDpopBinding,
  OidcVaultRecordBindingMatch,
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

export const isBindingHash = (value: unknown): value is string =>
  typeof value === 'string' && value.length === 43 && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value);

export const validateDpopBinding = (value: unknown): value is OidcVaultDpopBinding =>
  isPlainRecord(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) &&
  Object.keys(value).length === 2 &&
  Object.hasOwn(value, 'type') &&
  Object.hasOwn(value, 'jkt') &&
  value.type === 'dpop' &&
  isBindingHash(value.jkt);

export const validateRecordBinding = (record: { deviceBinding?: unknown; browserBindingHash?: unknown }): boolean =>
  (record.deviceBinding === undefined || validateDpopBinding(record.deviceBinding)) &&
  (record.browserBindingHash === undefined || isBindingHash(record.browserBindingHash)) &&
  (record.deviceBinding === undefined || record.browserBindingHash !== undefined);

export const validateBindingMatch = (value: unknown): value is OidcVaultRecordBindingMatch =>
  isPlainRecord(value) &&
  Object.hasOwn(value, 'deviceBinding') &&
  Object.hasOwn(value, 'browserBindingHash') &&
  (value.deviceBinding === null || validateDpopBinding(value.deviceBinding)) &&
  (value.browserBindingHash === null || isBindingHash(value.browserBindingHash));

export const assertRecordBinding = (record: { deviceBinding?: unknown; browserBindingHash?: unknown }): void => {
  if (!validateRecordBinding(record))
    throw new TypeError('OIDC vault store record has invalid device/browser binding.');
};

export const assertSessionBinding = (record: { deviceBinding?: unknown }): void => {
  if (record.deviceBinding !== undefined && !validateDpopBinding(record.deviceBinding)) {
    throw new TypeError('OIDC vault store session has invalid device binding.');
  }
};

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
  validateRecordBinding(value) &&
  isOptionalString(value.returnTo) &&
  isFiniteNumber(value.createdAt) &&
  isFiniteNumber(value.expiresAt) &&
  (value.metadata === undefined || isStringRecord(value.metadata));

export const validateExchangeCodeRecord = (value: unknown, code: string): value is ExchangeCodeRecord =>
  isPlainRecord(value) &&
  isString(value.code) &&
  value.code === code &&
  isString(value.sessionId) &&
  validateRecordBinding(value) &&
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
  (value.deviceBinding === undefined || validateDpopBinding(value.deviceBinding)) &&
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
