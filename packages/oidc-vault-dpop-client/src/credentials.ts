import { base64url, decodeJwt, decodeProtectedHeader } from 'jose';

import { OidcVaultDpopClientError } from './errors';
import type { OidcVaultSessionTransport, OidcVaultUserProfile } from './wire';

/** Contract-checked browser credential. Decoding does not authenticate the JWT; the API must verify it. */
export interface DpopAccessToken {
  readonly accessToken: string;
  readonly tokenType: 'DPoP';
  /** Safe epoch milliseconds, capped by JWT exp and response/peer lifetime. May already be expired (e.g. expiresIn: 0); check before reuse. */
  readonly expiresAt: number;
  /** Exact canonical RFC 7638 SHA-256 thumbprint from the one-field cnf object, matching the persistent browser key. */
  readonly jkt: string;
  /** Opaque response generation for cookie-peer coordination, not a server session handle. */
  readonly generation: string;
  readonly user?: OidcVaultUserProfile;
}

/**
 * Unbound app-local credential, never a provider token. Theft permits replay.
 * Direct omitted tokenType normalizes to Bearer; peers require exact Bearer.
 * Supports header-safe opaque tokens; exactly three segments reserve the signed
 * JWT profile (canonical encoding, signed alg, no b64:false or present cnf).
 * Optional safe JWT exp clamps the response deadline. Decoding is only a
 * contract check; APIs must independently authenticate/authorize the credential.
 */
export interface BearerAccessToken {
  readonly accessToken: string;
  /** Normalized exact scheme; never inferred as a fallback from a DPoP response. */
  readonly tokenType: 'Bearer';
  /** Safe epoch milliseconds, capped by response/peer lifetime and JWT exp when present. Check before reuse, including zero-lifetime responses. */
  readonly expiresAt: number;
  /** Opaque response generation for cookie-peer coordination, not a server session handle. */
  readonly generation: string;
  readonly user?: OidcVaultUserProfile;
}

/** Mode-specific app-local credentials. Narrow tokenType before accessing the DPoP-only jkt. */
export type OidcVaultAccessToken = DpopAccessToken | BearerAccessToken;

const invalidCredentials = (): OidcVaultDpopClientError =>
  new OidcVaultDpopClientError(
    'INVALID_BOUND_CREDENTIAL_RESPONSE',
    'A matching DPoP JWT response is required. Sign in again.',
    true,
  );

const invalidBearerCredentials = (): OidcVaultDpopClientError =>
  new OidcVaultDpopClientError(
    'INVALID_BEARER_CREDENTIAL_RESPONSE',
    'An unbound Bearer credential response is required. Sign in again.',
    true,
  );

const isSafeNonnegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** Shared direct-response/peer profile check, NOT signature or claims authentication. */
const decodeBoundJwtExpiration = (accessToken: string, jkt: string): number => {
  try {
    const parts = accessToken.split('.');
    if (
      parts.length !== 3 ||
      !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part) && base64url.encode(base64url.decode(part)) === part)
    )
      throw invalidCredentials();
    const header = decodeProtectedHeader(accessToken);
    const claims = decodeJwt(accessToken);
    const cnf = claims.cnf;
    if (
      typeof header.alg !== 'string' ||
      header.alg.length === 0 ||
      header.alg === 'none' ||
      header.b64 === false ||
      typeof jkt !== 'string' ||
      jkt.length !== 43 ||
      !/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(jkt) ||
      typeof cnf !== 'object' ||
      cnf === null ||
      Array.isArray(cnf) ||
      Reflect.ownKeys(cnf).length !== 1 ||
      !Object.hasOwn(cnf, 'jkt') ||
      !('jkt' in cnf) ||
      cnf.jkt !== jkt ||
      !isSafeNonnegativeInteger(claims.exp)
    )
      throw invalidCredentials();
    const expiration = claims.exp * 1000;
    if (!isSafeNonnegativeInteger(expiration)) throw invalidCredentials();
    return expiration;
  } catch {
    throw invalidCredentials();
  }
};

const createToken = (
  accessToken: string,
  expiresAt: number,
  jkt: string,
  generation: string,
  user: unknown,
): DpopAccessToken => {
  if (
    user !== undefined &&
    (typeof user !== 'object' ||
      user === null ||
      Array.isArray(user) ||
      !('sub' in user) ||
      typeof user.sub !== 'string')
  )
    throw invalidCredentials();
  return Object.freeze({
    accessToken,
    tokenType: 'DPoP',
    expiresAt,
    jkt,
    generation,
    ...(user === undefined ? {} : { user: structuredClone(user) as OidcVaultUserProfile }),
  });
};

/** Trusted server response contract check. Retain zero-lifetime handles; JWT authentication belongs to the API. */
export const parseDpopCredentials = (
  value: unknown,
  transport: OidcVaultSessionTransport,
  jkt: string,
  now: number,
): { token: DpopAccessToken; sessionId?: string } => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalidCredentials();
  const { accessToken, tokenType, expiresIn, sessionId, user } = value as Record<string, unknown>;
  if (
    typeof accessToken !== 'string' ||
    tokenType !== 'DPoP' ||
    !isSafeNonnegativeInteger(expiresIn) ||
    !isSafeNonnegativeInteger(now) ||
    (transport === 'body' && (typeof sessionId !== 'string' || sessionId.length === 0)) ||
    (transport === 'cookie' && 'sessionId' in value)
  )
    throw invalidCredentials();
  // Validate every operand/intermediate before a smaller deadline can mask an
  // overflow, fractional clock, or invalid JWT exp through Math.min.
  const lifetimeMs = expiresIn * 1000;
  if (!isSafeNonnegativeInteger(lifetimeMs)) throw invalidCredentials();
  const responseDeadline = now + lifetimeMs;
  if (!isSafeNonnegativeInteger(responseDeadline)) throw invalidCredentials();
  const expiration = Math.min(responseDeadline, decodeBoundJwtExpiration(accessToken, jkt));
  const token = createToken(accessToken, expiration, jkt, crypto.randomUUID(), user);
  return { token, ...(transport === 'body' ? { sessionId: sessionId as string } : {}) };
};

/** BroadcastChannel is transient. Still validate its payload/key/expiry before adoption. */
export const readPeerToken = (
  value: unknown,
  jkt: string,
  generation: string,
  now: number,
): DpopAccessToken | undefined => {
  if (
    !isSafeNonnegativeInteger(now) ||
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    'sessionId' in value
  )
    return undefined;
  try {
    const {
      accessToken,
      tokenType,
      expiresAt,
      jkt: peerJkt,
      generation: peerGeneration,
      user,
    } = value as Record<string, unknown>;
    if (
      typeof accessToken !== 'string' ||
      peerJkt !== jkt ||
      peerGeneration !== generation ||
      tokenType !== 'DPoP' ||
      !isSafeNonnegativeInteger(expiresAt) ||
      expiresAt <= now
    )
      return undefined;
    // The peer already supplies milliseconds. Avoid inventing a rounded
    // expiresIn, and reject expiry only after both safe deadlines are clamped.
    const expiration = Math.min(expiresAt, decodeBoundJwtExpiration(accessToken, jkt));
    if (expiration <= now) return undefined;
    return createToken(accessToken, expiration, jkt, generation, user);
  } catch {
    return undefined;
  }
};

/** Three segments are reserved for canonical signed JWTs, never an opaque-token escape hatch. NOT authentication. */
const decodeBearerJwtExpiration = (accessToken: string): number | undefined => {
  const parts = accessToken.split('.');
  if (parts.length !== 3) return undefined;
  try {
    if (!parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part) && base64url.encode(base64url.decode(part)) === part))
      throw invalidBearerCredentials();
    const header = decodeProtectedHeader(accessToken);
    const claims = decodeJwt(accessToken);
    if (
      typeof header.alg !== 'string' ||
      header.alg.length === 0 ||
      header.alg === 'none' ||
      header.b64 === false ||
      'cnf' in claims
    )
      throw invalidBearerCredentials();
    if (!('exp' in claims)) return undefined;
    if (!isSafeNonnegativeInteger(claims.exp)) throw invalidBearerCredentials();
    const expiration = claims.exp * 1000;
    if (!isSafeNonnegativeInteger(expiration)) throw invalidBearerCredentials();
    return expiration;
  } catch {
    throw invalidBearerCredentials();
  }
};

const isHeaderSafeBearerToken = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && !/[^\x21-\x7E]|,/.test(value);

const createBearerToken = (
  accessToken: string,
  expiresAt: number,
  generation: string,
  user: unknown,
): BearerAccessToken => {
  if (
    user !== undefined &&
    (typeof user !== 'object' ||
      user === null ||
      Array.isArray(user) ||
      !('sub' in user) ||
      typeof user.sub !== 'string')
  )
    throw invalidBearerCredentials();
  return Object.freeze({
    accessToken,
    tokenType: 'Bearer',
    expiresAt,
    generation,
    ...(user === undefined ? {} : { user: structuredClone(user) as OidcVaultUserProfile }),
  });
};

/** Trusted unbound response contract check. Normalize omitted tokenType; retain rotated zero-lifetime body handles. */
export const parseBearerCredentials = (
  value: unknown,
  transport: OidcVaultSessionTransport,
  now: number,
): { token: BearerAccessToken; sessionId?: string } => {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalidBearerCredentials();
    const { accessToken, tokenType, expiresIn, sessionId, user } = value as Record<string, unknown>;
    if (
      !isHeaderSafeBearerToken(accessToken) ||
      (tokenType !== undefined && tokenType !== 'Bearer') ||
      !isSafeNonnegativeInteger(expiresIn) ||
      !isSafeNonnegativeInteger(now) ||
      (transport === 'body' && (typeof sessionId !== 'string' || sessionId.length === 0)) ||
      (transport === 'cookie' && 'sessionId' in value)
    )
      throw invalidBearerCredentials();
    // Validate operands and both intermediates before any JWT clamp can hide an overflow.
    const lifetimeMs = expiresIn * 1000;
    if (!isSafeNonnegativeInteger(lifetimeMs)) throw invalidBearerCredentials();
    const responseDeadline = now + lifetimeMs;
    if (!isSafeNonnegativeInteger(responseDeadline)) throw invalidBearerCredentials();
    const expiration = Math.min(responseDeadline, decodeBearerJwtExpiration(accessToken) ?? responseDeadline);
    const token = createBearerToken(accessToken, expiration, crypto.randomUUID(), user);
    return { token, ...(transport === 'body' ? { sessionId: sessionId as string } : {}) };
  } catch {
    throw invalidBearerCredentials();
  }
};

/** Advisory same-mode peer check; the caller must supply and recheck active cookie metadata/recognition around adoption. */
export const readBearerPeerToken = (value: unknown, generation: string, now: number): BearerAccessToken | undefined => {
  try {
    if (
      !isSafeNonnegativeInteger(now) ||
      typeof generation !== 'string' ||
      generation.length === 0 ||
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value) ||
      'jkt' in value ||
      'sessionId' in value
    )
      return undefined;
    const { accessToken, tokenType, expiresAt, generation: peerGeneration, user } = value as Record<string, unknown>;
    if (
      !isHeaderSafeBearerToken(accessToken) ||
      tokenType !== 'Bearer' ||
      peerGeneration !== generation ||
      !isSafeNonnegativeInteger(expiresAt) ||
      expiresAt <= now
    )
      return undefined;
    const expiration = Math.min(expiresAt, decodeBearerJwtExpiration(accessToken) ?? expiresAt);
    if (expiration <= now) return undefined;
    return createBearerToken(accessToken, expiration, generation, user);
  } catch {
    return undefined;
  }
};
