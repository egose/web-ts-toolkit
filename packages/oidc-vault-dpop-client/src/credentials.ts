/**
 * Browser-only DPoP client (CLIENT-02 port of apps/oidc-vault-dpop-example/src/auth/*).
 * No `node:*` or `express` imports. Browser globals (crypto.subtle, indexedDB,
 * sessionStorage, navigator.locks, BroadcastChannel) only behind
 * assertDpopBrowserFeatures / lazy factory calls, never at module top-level.
 */
import { decodeJwt, decodeProtectedHeader } from 'jose';

import { OidcVaultDpopClientError } from './errors';
import type { OidcVaultSessionTransport, OidcVaultUserProfile } from './wire';

export interface DpopAccessToken {
  readonly accessToken: string;
  readonly tokenType: 'DPoP';
  readonly expiresAt: number;
  readonly jkt: string;
  readonly generation: string;
  readonly user?: OidcVaultUserProfile;
}

const invalidCredentials = (): OidcVaultDpopClientError =>
  new OidcVaultDpopClientError(
    'INVALID_BOUND_CREDENTIAL_RESPONSE',
    'A matching DPoP JWT response is required. Sign in again.',
    true,
  );

/** Trusted server response contract check, NOT JWT authentication (the API does that). */
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
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(accessToken) ||
    tokenType !== 'DPoP' ||
    typeof expiresIn !== 'number' ||
    !Number.isSafeInteger(expiresIn) ||
    expiresIn < 0 ||
    (transport === 'body' && (typeof sessionId !== 'string' || sessionId.length === 0)) ||
    (transport === 'cookie' && 'sessionId' in value)
  )
    throw invalidCredentials();
  let expiration: number;
  try {
    const header = decodeProtectedHeader(accessToken);
    const claims = decodeJwt(accessToken);
    const cnf = claims.cnf;
    if (
      !header.alg ||
      header.alg === 'none' ||
      header.b64 === false ||
      typeof cnf !== 'object' ||
      cnf === null ||
      Array.isArray(cnf) ||
      !('jkt' in cnf) ||
      cnf.jkt !== jkt ||
      typeof claims.exp !== 'number' ||
      !Number.isSafeInteger(claims.exp) ||
      claims.exp < 0
    )
      throw invalidCredentials();
    expiration = Math.min(now + expiresIn * 1000, claims.exp * 1000);
    if (!Number.isSafeInteger(expiration)) throw invalidCredentials();
  } catch {
    throw invalidCredentials();
  }
  if (
    user !== undefined &&
    (typeof user !== 'object' ||
      user === null ||
      Array.isArray(user) ||
      !('sub' in user) ||
      typeof user.sub !== 'string')
  )
    throw invalidCredentials();
  const token: DpopAccessToken = Object.freeze({
    accessToken,
    tokenType,
    expiresAt: expiration,
    jkt,
    generation: crypto.randomUUID(),
    ...(user === undefined ? {} : { user: structuredClone(user) as OidcVaultUserProfile }),
  });
  return { token, ...(transport === 'body' ? { sessionId: sessionId as string } : {}) };
};

/** BroadcastChannel is transient. Still validate its payload/key/expiry before adoption. */
export const readPeerToken = (
  value: unknown,
  jkt: string,
  generation: string,
  now: number,
): DpopAccessToken | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  const candidate = value as DpopAccessToken;
  if (
    candidate.jkt !== jkt ||
    candidate.generation !== generation ||
    candidate.tokenType !== 'DPoP' ||
    !Number.isSafeInteger(candidate.expiresAt) ||
    candidate.expiresAt <= now
  )
    return undefined;
  try {
    const { token } = parseDpopCredentials(
      {
        accessToken: candidate.accessToken,
        tokenType: candidate.tokenType,
        expiresIn: Math.ceil((candidate.expiresAt - now) / 1000),
        user: candidate.user,
      },
      'cookie',
      jkt,
      now,
    );
    return Object.freeze({ ...token, expiresAt: Math.min(token.expiresAt, candidate.expiresAt), generation });
  } catch {
    return undefined;
  }
};
