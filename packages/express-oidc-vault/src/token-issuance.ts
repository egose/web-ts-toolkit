import type { Request, Response } from 'express';
import { decodeJwt, decodeProtectedHeader } from 'jose';

import { isCompactSignedJwt, readJwtExpirationMs, snapshotJkt } from './access-token-confirmation';
import { clearSessionCookie, usesCookieTransport } from './cookies';
import { diagnosticCorrelation, type DpopDiagnostic } from './diagnostics';
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
  OidcVaultTokenOperation,
  OidcVaultTokenOutcomeEvent,
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

/** Call only at the route's commit point, after response materialization and cookie preparation. */
export const notifyTokenOutcomes = (
  operation: OidcVaultTokenOperation,
  session: OidcVaultSession,
  issuedToken: Partial<OidcVaultTokenIssueResult>,
  notify: (event: OidcVaultTokenOutcomeEvent) => void,
  diagnostic?: DpopDiagnostic,
): void => {
  const deviceBound = session.deviceBinding !== undefined;
  const correlation = diagnosticCorrelation(
    deviceBound && !diagnostic?.hasAuthenticatedProof() ? 'candidate-session' : 'authenticated',
    session.subject,
    session.logicalSessionId ?? session.sessionId,
  );
  const tokenIssued = issuedToken.accessToken !== undefined;
  if (tokenIssued)
    notify(
      Object.freeze({
        kind: 'token-issued',
        operation,
        correlation,
        deviceBound,
        expiresIn: issuedToken.expiresIn!,
        ...(issuedToken.tokenType === undefined ? {} : { tokenType: issuedToken.tokenType }),
      }),
    );
  if (operation === 'exchange')
    notify(Object.freeze({ kind: 'exchange-succeeded', operation, correlation, deviceBound, tokenIssued }));
};

const assertIssuedBoundJwt = (accessToken: string, jkt: string): void => {
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
  const confirmation = snapshotJkt(
    claims.cnf,
    (diagnostic) => new TypeError(`tokenIssuer.issue accessToken cnf.jkt is invalid. ${diagnostic}`),
  );
  if (confirmation.jkt !== jkt) {
    throw new TypeError('tokenIssuer.issue accessToken cnf.jkt must match the verified device binding.');
  }
  if (readJwtExpirationMs(claims.exp) === undefined) {
    throw new TypeError('tokenIssuer.issue accessToken exp must be a nonnegative safe integer with safe milliseconds.');
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
  operation: OidcVaultTokenOperation,
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
      operation,
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
      if (!Number.isSafeInteger(expiresIn * 1000)) {
        throw new TypeError('tokenIssuer.issue expiresIn must have safe milliseconds for bound issuance.');
      }
      assertIssuedBoundJwt(accessToken, binding.jkt);
    }

    return { accessToken, expiresIn, ...(tokenType === undefined ? {} : { tokenType }) };
  } catch (error) {
    await options.storeProvider.deleteSessionsByLogicalSessionId({ logicalSessionId });
    if (usesCookieTransport(options)) clearSessionCookie(res, options);
    throw error;
  }
};
