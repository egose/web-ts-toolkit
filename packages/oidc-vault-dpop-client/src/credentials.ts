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

const invalidCredentials = (): OidcVaultDpopClientError =>
  new OidcVaultDpopClientError(
    'INVALID_BOUND_CREDENTIAL_RESPONSE',
    'A matching DPoP JWT response is required. Sign in again.',
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
