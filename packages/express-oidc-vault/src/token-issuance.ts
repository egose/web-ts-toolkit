import type { Request, Response } from 'express';
import { decodeJwt, decodeProtectedHeader } from 'jose';

import { clearSessionCookie, usesCookieTransport } from './cookies';
import {
  resolveVerifiedDeviceBinding,
  withSessionDeviceBinding,
  type ResolvedOidcVaultOptions,
} from './device-binding-policy';
import type {
  OidcVaultExchangeResult,
  OidcVaultOptions,
  OidcVaultSession,
  OidcVaultTokenIssueResult,
  OidcVaultVerifiedDpopBinding,
} from './types';
import { copyVaultSession, copyVaultUserProfile } from './vault-session';

export const createExchangeResponse = (
  options: OidcVaultOptions,
  session: OidcVaultSession,
  issuedToken: Partial<OidcVaultTokenIssueResult>,
): OidcVaultExchangeResult => ({
  sessionId: usesCookieTransport(options) ? undefined : session.sessionId,
  user: copyVaultUserProfile(session.user),
  accessToken: issuedToken.accessToken,
  expiresIn: issuedToken.expiresIn,
  tokenType: issuedToken.tokenType,
});

const isCompactSignedJwt = (token: string): boolean => {
  const parts = token.split('.');
  return (
    parts.length === 3 &&
    parts.every((part) =>
      /^[A-Za-z0-9_-]+$/.test(part) ? Buffer.from(part, 'base64url').toString('base64url') === part : false,
    )
  );
};

const assertIssuedTokenConfirmation = (accessToken: string, jkt: string): void => {
  // This is the trusted issuer's OUTPUT contract, never authentication by
  // unverified decoding. Request-aware APIs independently verify the JWT.
  if (!isCompactSignedJwt(accessToken)) {
    throw new TypeError('tokenIssuer.issue accessToken must be a compact signed JWT for bound issuance.');
  }
  let header: ReturnType<typeof decodeProtectedHeader>;
  let claims: ReturnType<typeof decodeJwt>;
  try {
    header = decodeProtectedHeader(accessToken);
    claims = decodeJwt(accessToken);
  } catch {
    throw new TypeError('tokenIssuer.issue accessToken must be a compact signed JWT for bound issuance.');
  }
  if (typeof header.alg !== 'string' || header.alg.length === 0 || header.alg === 'none' || header.b64 === false) {
    throw new TypeError('tokenIssuer.issue accessToken must use a signed JWT algorithm for bound issuance.');
  }
  const cnf: unknown = claims.cnf;
  if (typeof cnf !== 'object' || cnf === null || Array.isArray(cnf) || (cnf as Record<string, unknown>).jkt !== jkt) {
    throw new TypeError('tokenIssuer.issue accessToken cnf.jkt must match the verified device binding.');
  }
};

/**
 * Local issuance + existing rollback boundary, shared by exchange/refresh.
 * `verifiedBinding` is internal verified request context supplied by the later
 * proof-aware handlers, never reconstructed from the stored thumbprint alone.
 * Policy/key mismatch is preflight, outside issuer rollback, so it cannot
 * revoke a lineage; invalid issuer output/issuer failure stays inside rollback.
 */
export const withIssuedToken = async (
  req: Request,
  res: Response,
  options: ResolvedOidcVaultOptions,
  session: OidcVaultSession,
  verifiedBinding?: Readonly<OidcVaultVerifiedDpopBinding>,
): Promise<Partial<OidcVaultTokenIssueResult>> => {
  const binding = resolveVerifiedDeviceBinding(options.deviceBinding, session.deviceBinding, verifiedBinding);
  if (!options.tokenIssuer) return {};

  // Keep rollback authority and binding independent of mutable issuer input.
  // Plain session containers are detached without imposing structuredClone on
  // application metadata's provider-specific runtime values.
  const logicalSessionId = session.logicalSessionId ?? session.sessionId;

  try {
    const issuerSession = withSessionDeviceBinding(copyVaultSession(session, true), binding);
    const result: unknown = await options.tokenIssuer.issue({
      req,
      res,
      session: issuerSession,
      ...(binding === undefined ? {} : { deviceBinding: Object.freeze({ ...binding }) }),
    });
    if (typeof result !== 'object' || result === null || Array.isArray(result)) {
      throw new TypeError('tokenIssuer.issue must return a token result object.');
    }

    // Read only declared fields, once, inside rollback. Do not enumerate or
    // retain the issuer-owned result, including any extra property getters.
    const { accessToken, expiresIn, tokenType } = result as Record<string, unknown>;
    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      throw new TypeError('tokenIssuer.issue accessToken must be a nonempty string.');
    }
    if (typeof expiresIn !== 'number' || !Number.isSafeInteger(expiresIn) || expiresIn < 0) {
      throw new TypeError('tokenIssuer.issue expiresIn must be a finite nonnegative safe integer.');
    }
    if (tokenType !== undefined && tokenType !== 'Bearer' && tokenType !== 'DPoP') {
      throw new TypeError('tokenIssuer.issue tokenType must be the exact Bearer or DPoP literal when provided.');
    }
    if (binding === undefined) {
      if (tokenType !== undefined && tokenType !== 'Bearer') {
        throw new TypeError('tokenIssuer.issue tokenType must be Bearer when provided for unbound issuance.');
      }
    } else {
      if (tokenType !== 'DPoP') throw new TypeError('tokenIssuer.issue tokenType must be DPoP for bound issuance.');
      assertIssuedTokenConfirmation(accessToken, binding.jkt);
    }

    return { accessToken, expiresIn, ...(tokenType === undefined ? {} : { tokenType }) };
  } catch (error) {
    await options.storeProvider.deleteSessionsByLogicalSessionId({ logicalSessionId });
    if (usesCookieTransport(options)) clearSessionCookie(res, options);
    throw error;
  }
};
