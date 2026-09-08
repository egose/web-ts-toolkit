import { jwtVerify } from 'jose';

import { OidcVaultHttpError, getRequiredFiniteNonNegativeInteger, getRequiredString } from './errors';
import type { OidcProviderMetadata, ProviderRequestOptions } from './provider-client';
import { resolveJwks } from './provider-client';
import type {
  OidcVaultAccessTokenValidationResult,
  OidcVaultJwtAccessTokenValidatorOptions,
  OidcVaultUserProfile,
} from './types';
import { isRecord, isString } from './utils';

export type OidcBackchannelLogoutClaims = {
  sid?: string;
  sub?: string;
  nonce?: unknown;
  jti?: unknown;
  iat?: unknown;
  exp?: unknown;
  events?: Record<string, unknown>;
  [key: string]: unknown;
};

export const BACKCHANNEL_LOGOUT_EVENT_CLAIM = 'http://schemas.openid.net/event/backchannel-logout';

export const validateBackchannelLogoutTokenTyp = (typ: unknown): void => {
  if (typ !== undefined && (typeof typ !== 'string' || typ.toLowerCase() !== 'logout+jwt')) {
    throw new OidcVaultHttpError(
      400,
      'OIDC_VAULT_INVALID_LOGOUT_TOKEN',
      'Backchannel logout token protected header typ must be logout+jwt when present.',
    );
  }
};

export const defaultJwtClaimsMapper = (claims: Record<string, unknown>): OidcVaultAccessTokenValidationResult => {
  const subject = getRequiredString(
    claims.sub,
    'JWT access token is missing sub.',
    'OIDC_VAULT_INVALID_ACCESS_TOKEN',
    401,
  );

  return {
    subject,
    sessionId: typeof claims.sid === 'string' ? claims.sid : undefined,
    scope: typeof claims.scope === 'string' ? claims.scope : undefined,
    claims,
  };
};

export const assertUserInfoSubject = (userInfo: unknown, subject: string): void => {
  // JSON `null` must not bypass the matching-sub check: it is an invalid
  // UserInfo response, not an absent one. Arrays are rejected the same way.
  if (typeof userInfo !== 'object' || userInfo === null || Array.isArray(userInfo)) {
    throw new OidcVaultHttpError(502, 'OIDC_VAULT_INVALID_USERINFO', 'OIDC userinfo response is invalid.');
  }

  if (!isString((userInfo as Record<string, unknown>).sub)) {
    throw new OidcVaultHttpError(502, 'OIDC_VAULT_INVALID_USERINFO', 'OIDC userinfo response is missing sub.');
  }

  if ((userInfo as Record<string, unknown>).sub !== subject) {
    throw new OidcVaultHttpError(502, 'OIDC_VAULT_INVALID_USERINFO', 'OIDC userinfo sub does not match id_token sub.');
  }
};

/**
 * Compose a fresh session profile from freshly verified sources only.
 *
 * Precedence: freshly fetched matching UserInfo overlays fresh verified ID
 * claims; `sub` is always enforced. Retained stored profile data must never
 * be passed here as `userInfo` — retained values are not fresh UserInfo.
 */
export const mergeUserProfile = (
  sub: string,
  idTokenClaims: Record<string, unknown>,
  userInfo?: Record<string, unknown>,
): OidcVaultUserProfile => ({
  ...idTokenClaims,
  ...(userInfo ?? {}),
  sub,
});

/**
 * Refresh profile precedence (BOV-07).
 *
 * - `freshIdClaims` (verified from a new `id_token`) is the base when
 *   present; the retained profile is NOT merged in, so fresh changed claims
 *   win and removed provider claims (or application-added `user` keys) are
 *   dropped rather than preserved forever. Applications must keep custom
 *   attributes in `session.metadata`, not in `user`.
 * - `freshUserInfo` (freshly fetched with a matching `sub`) overlays
 *   whichever base applies.
 * - With no new `id_token`, the retained profile is kept verbatim (refresh
 *   without a new ID token); a freshly fetched matching UserInfo still
 *   overlays the retained base per key. The stored `idToken` string itself is
 *   never revalidated — an expired stored token serves only as previously
 *   verified identity evidence.
 */
export const composeRefreshedUserProfile = (
  sub: string,
  currentUser: OidcVaultUserProfile | undefined,
  freshIdClaims?: Record<string, unknown>,
  freshUserInfo?: Record<string, unknown>,
): OidcVaultUserProfile => {
  if (freshIdClaims === undefined) {
    return mergeUserProfile(sub, { ...(currentUser ?? { sub }) }, freshUserInfo);
  }

  return mergeUserProfile(sub, { ...freshIdClaims }, freshUserInfo);
};

export async function verifyIdToken(
  metadata: OidcProviderMetadata,
  idToken: string,
  nonce?: string,
  options: ProviderRequestOptions = {},
): Promise<Record<string, unknown>> {
  if (!metadata.jwksUri) {
    throw new OidcVaultHttpError(500, 'OIDC_VAULT_MISSING_JWKS_URI', 'OIDC jwksUri is required to validate id_token.');
  }

  if (!metadata.clientId) {
    throw new OidcVaultHttpError(
      500,
      'OIDC_VAULT_MISSING_CLIENT_ID',
      'OIDC clientId is required to validate id_token.',
    );
  }

  const jwks = resolveJwks(metadata.jwksUri, options);
  const result = await jwtVerify(idToken, jwks, {
    audience: metadata.clientId,
    issuer: metadata.issuer,
  });

  if (nonce && result.payload.nonce !== nonce) {
    throw new OidcVaultHttpError(502, 'OIDC_VAULT_INVALID_ID_TOKEN', 'OIDC id_token nonce validation failed.');
  }

  if (typeof result.payload.exp !== 'number') {
    throw new OidcVaultHttpError(502, 'OIDC_VAULT_INVALID_ID_TOKEN', 'OIDC id_token is missing exp.');
  }

  if (typeof result.payload.iat !== 'number') {
    throw new OidcVaultHttpError(502, 'OIDC_VAULT_INVALID_ID_TOKEN', 'OIDC id_token is missing iat.');
  }

  if (!isString(result.payload.sub)) {
    throw new OidcVaultHttpError(502, 'OIDC_VAULT_INVALID_ID_TOKEN', 'OIDC id_token is missing sub.');
  }

  if (result.payload.azp !== undefined && result.payload.azp !== metadata.clientId) {
    throw new OidcVaultHttpError(502, 'OIDC_VAULT_INVALID_ID_TOKEN', 'OIDC id_token azp validation failed.');
  }

  if (Array.isArray(result.payload.aud) && result.payload.aud.length > 1 && result.payload.azp !== metadata.clientId) {
    throw new OidcVaultHttpError(
      502,
      'OIDC_VAULT_INVALID_ID_TOKEN',
      'OIDC id_token azp is required for multiple audiences.',
    );
  }

  return result.payload as Record<string, unknown>;
}

export async function verifyBackchannelLogoutToken(
  metadata: OidcProviderMetadata,
  logoutToken: string,
  options: ProviderRequestOptions = {},
): Promise<OidcBackchannelLogoutClaims> {
  if (!metadata.jwksUri) {
    throw new OidcVaultHttpError(
      500,
      'OIDC_VAULT_MISSING_JWKS_URI',
      'OIDC jwksUri is required to validate logout_token.',
    );
  }

  if (!metadata.clientId) {
    throw new OidcVaultHttpError(
      500,
      'OIDC_VAULT_MISSING_CLIENT_ID',
      'OIDC clientId is required to validate logout_token.',
    );
  }

  const jwks = resolveJwks(metadata.jwksUri, options);
  const result = await jwtVerify(logoutToken, jwks, {
    audience: metadata.clientId,
    issuer: metadata.issuer,
  });
  const claims = result.payload as OidcBackchannelLogoutClaims;

  validateBackchannelLogoutTokenTyp(result.protectedHeader.typ);

  if (claims.nonce !== undefined) {
    throw new OidcVaultHttpError(
      400,
      'OIDC_VAULT_INVALID_LOGOUT_TOKEN',
      'Backchannel logout token must not contain nonce.',
    );
  }

  if (!isRecord(claims.events) || !isRecord(claims.events[BACKCHANNEL_LOGOUT_EVENT_CLAIM])) {
    throw new OidcVaultHttpError(
      400,
      'OIDC_VAULT_INVALID_LOGOUT_TOKEN',
      'Backchannel logout token is missing the required event claim.',
    );
  }

  if (!isString(claims.sid) && !isString(claims.sub)) {
    throw new OidcVaultHttpError(
      400,
      'OIDC_VAULT_INVALID_LOGOUT_TOKEN',
      'Backchannel logout token must include sid or sub.',
    );
  }

  if (!isString(claims.jti)) {
    throw new OidcVaultHttpError(400, 'OIDC_VAULT_INVALID_LOGOUT_TOKEN', 'Backchannel logout token must include jti.');
  }

  getRequiredFiniteNonNegativeInteger(
    claims.iat,
    'Backchannel logout token must include iat.',
    'OIDC_VAULT_INVALID_LOGOUT_TOKEN',
    400,
  );

  getRequiredFiniteNonNegativeInteger(
    claims.exp,
    'Backchannel logout token must include exp.',
    'OIDC_VAULT_INVALID_LOGOUT_TOKEN',
    400,
  );

  return claims;
}

export function createOidcVaultJwtAccessTokenValidator(options: OidcVaultJwtAccessTokenValidatorOptions): {
  validate(token: string): Promise<OidcVaultAccessTokenValidationResult>;
} {
  return {
    async validate(token: string): Promise<OidcVaultAccessTokenValidationResult> {
      const result = await jwtVerify(token, options.key, {
        issuer: options.issuer,
        audience: options.audience,
        algorithms: options.algorithms,
      });

      const claims = result.payload as Record<string, unknown>;
      return options.mapClaims ? options.mapClaims(claims) : defaultJwtClaimsMapper(claims);
    },
  };
}
