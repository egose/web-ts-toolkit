import { createHash } from 'node:crypto';

import type { Request } from 'express';

import { isValidCookieName } from './cookies';
import { isCanonicalDpopJkt } from './device-binding-policy';
import { readDpopRawHeader } from './dpop-proof';
import { OidcVaultHttpError } from './errors';
import type { OidcVaultFingerprintRecognitionOptions } from './types';

export const FINGERPRINT_RECOGNITION_METADATA_KEY = 'oidcVaultFingerprintRecognition';

export interface ResolvedOidcVaultFingerprintRecognitionOptions {
  readonly headerName: string;
}

/** Private portable recognition evidence, never a sender constraint or public token claim. */
export interface FingerprintRecognition {
  readonly version: 1;
  readonly hash: string;
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && [Object.prototype, null].includes(Object.getPrototypeOf(value));

const COLLIDING_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'www-authenticate',
  'proxy-authenticate',
  'authentication-info',
  'proxy-authentication-info',
  'dpop',
  'dpop-nonce',
  'cookie',
  'set-cookie',
  'origin',
  'referer',
  'host',
  'forwarded',
  'accept',
  'accept-charset',
  'accept-encoding',
  'accept-language',
  'connection',
  'keep-alive',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

/** HTTP field names use the same token grammar as cookie names; capture the option once, without trimming. */
export const resolveFingerprintRecognitionOptions = (
  value: OidcVaultFingerprintRecognitionOptions | undefined,
): ResolvedOidcVaultFingerprintRecognitionOptions | undefined => {
  if (value === undefined) return undefined;
  if (!isPlainRecord(value)) throw new Error('fingerprintRecognition must be a plain options object.');
  const { headerName } = value;
  const name: unknown = headerName === undefined ? 'X-Device-Fingerprint' : headerName;
  if (!isValidCookieName(name)) throw new Error('fingerprintRecognition.headerName must be a valid HTTP field name.');
  const normalized = name.toLowerCase();
  if (
    COLLIDING_HEADERS.has(normalized) ||
    ['content-', 'x-forwarded-', 'access-control-', 'sec-fetch-'].some((prefix) => normalized.startsWith(prefix))
  ) {
    throw new Error(
      'fingerprintRecognition.headerName must not collide with authentication, cookie, origin, content, or transport headers.',
    );
  }
  return Object.freeze({ headerName: name });
};

const invalidFingerprint = (): OidcVaultHttpError =>
  new OidcVaultHttpError(400, 'OIDC_VAULT_INVALID_FINGERPRINT', 'Fingerprint signal is invalid.');

/** Capture only a bounded hash before async work; absent means intentionally unenrolled. No joined-header fallback. */
export const captureFingerprintRecognition = (
  req: Pick<Request, 'rawHeaders'>,
  policy: ResolvedOidcVaultFingerprintRecognitionOptions | undefined,
): Readonly<FingerprintRecognition> | undefined => {
  if (policy === undefined) return undefined;
  const { count, value } = readDpopRawHeader(req, policy.headerName);
  if (count === 0) return undefined;
  if (count !== 1 || typeof value !== 'string' || value.length === 0 || value.length > 256) throw invalidFingerprint();
  for (let index = 0; index < value.length; index++) {
    const byte = value.charCodeAt(index);
    if (byte < 0x20 || byte > 0x7e) throw invalidFingerprint();
  }
  // Every allowed character is one ASCII byte. Do not trim, case-fold, split
  // commas, or otherwise normalize the application's opaque single signal.
  return Object.freeze({ version: 1, hash: createHash('sha256').update(value, 'ascii').digest('base64url') });
};

/** Undefined alone is unenrolled. Invalid persisted evidence must not silently become a legacy session. */
export const snapshotFingerprintRecognition = (
  metadata: Record<string, unknown> | undefined,
): Readonly<FingerprintRecognition> | undefined => {
  if (metadata === undefined || !Object.hasOwn(metadata, FINGERPRINT_RECOGNITION_METADATA_KEY)) return undefined;
  const value: unknown = metadata?.[FINGERPRINT_RECOGNITION_METADATA_KEY];
  if (value === undefined) return undefined;
  if (!isPlainRecord(value)) throw new TypeError('Stored fingerprint recognition metadata is invalid.');
  const { version, hash } = value;
  if (
    Object.keys(value).length !== 2 ||
    !Object.hasOwn(value, 'version') ||
    !Object.hasOwn(value, 'hash') ||
    version !== 1 ||
    !isCanonicalDpopJkt(hash)
  ) {
    throw new TypeError('Stored fingerprint recognition metadata is invalid.');
  }
  return Object.freeze({ version, hash });
};

export const fingerprintRecognitionMatches = (
  actual: Readonly<FingerprintRecognition> | undefined,
  original: Readonly<FingerprintRecognition> | undefined,
): boolean => actual?.hash === original?.hash;

/** Exchange/refresh preflight only; this cannot enroll a session, rotate evidence, or satisfy required DPoP. */
export const assertFingerprintRecognition = (
  policy: ResolvedOidcVaultFingerprintRecognitionOptions | undefined,
  original: Readonly<FingerprintRecognition> | undefined,
  supplied: Readonly<FingerprintRecognition> | undefined,
): void => {
  if (policy !== undefined && original !== undefined && !fingerprintRecognitionMatches(supplied, original)) {
    throw new OidcVaultHttpError(
      403,
      'OIDC_VAULT_FINGERPRINT_REAUTH_REQUIRED',
      'Browser recognition changed; sign in again.',
    );
  }
};

/** Restore the reserved field after a mutable hook, skipping its replacement getter. Other metadata stays application-owned. */
export const withFingerprintRecognitionMetadata = (
  metadata: Record<string, unknown> | undefined,
  original: Readonly<FingerprintRecognition> | undefined,
): Record<string, unknown> | undefined => {
  if (metadata === undefined && original === undefined) return undefined;
  if (
    original === undefined &&
    metadata !== undefined &&
    !Object.hasOwn(metadata, FINGERPRINT_RECOGNITION_METADATA_KEY)
  )
    return metadata;
  const restored: Record<string, unknown> = {};
  for (const name of Object.keys(metadata ?? {})) {
    if (name !== FINGERPRINT_RECOGNITION_METADATA_KEY)
      Object.defineProperty(restored, name, {
        value: Reflect.get(metadata!, name),
        enumerable: true,
        configurable: true,
        writable: true,
      });
  }
  if (original !== undefined) restored[FINGERPRINT_RECOGNITION_METADATA_KEY] = { version: 1, hash: original.hash };
  return restored;
};
