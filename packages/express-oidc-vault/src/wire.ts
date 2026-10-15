/** Public JSON profile returned by exchange/refresh. */
export interface OidcVaultUserProfile {
  sub: string;
  email?: string;
  name?: string;
  preferredUsername?: string;
  [key: string]: unknown;
}

/**
 * Local application credentials returned by `OidcVaultTokenIssuer.issue`.
 * Runtime validation copies only these fields into a fresh result; additional
 * properties are ignored and cannot override the response's session ID/user.
 */
export interface OidcVaultTokenIssueResult {
  /**
   * Nonempty opaque token for unbound issuance. Bound issuance requires a
   * compact signed JWT (canonical unpadded base64url), exactly one cnf field
   * `{ jkt }` matching the verified canonical SHA-256 thumbprint, and a
   * nonnegative safe-integer exp in seconds with safe exp * 1000 milliseconds.
   * Core checks the output shape; APIs independently authenticate the JWT.
   */
  accessToken: string;
  /**
   * Token lifetime in seconds: a finite nonnegative safe integer; bound
   * issuance also requires safe expiresIn * 1000. Zero is valid and may carry
   * a rotated session handle, but supplies no live reusable API credential.
   */
  expiresIn: number;
  /** Exact `DPoP` is required when bound. Unbound permits only `Bearer` or omission; omitted/undefined stays absent in JSON. */
  tokenType?: 'Bearer' | 'DPoP';
}

/** Exchange/refresh JSON. Local token fields are absent when no token issuer is configured. */
export interface OidcVaultExchangeResult extends Partial<OidcVaultTokenIssueResult> {
  /** Authoritative vault handle in body transport; omitted from cookie-transport JSON. */
  sessionId?: string;
  /** Session profile; extra token-issuer result properties cannot override it. */
  user?: OidcVaultUserProfile;
}

/** JSON body for opt-in `POST <basePath>/login`; proof/key and recognition signals belong in their configured headers, not the body. */
export interface OidcVaultLoginInitiationInput {
  /** Optional destination on the configured frontend origin. Query-string returnTo is ignored by POST login. */
  returnTo?: string;
}

/**
 * Exact successful POST-login JSON. Navigate to this URL after storing a proof
 * key when DPoP is enabled. Use credentials: 'include' even with body session
 * transport: initiation sets a temporary HttpOnly transaction cookie.
 */
export interface OidcVaultLoginInitiationResult {
  authorizationUrl: string;
}

/** Successful local logout; stateless application JWTs require separate revocation or expiry. */
export interface OidcVaultLogoutResult {
  /**
   * Successful logout commits revocation before upstream work and clears the
   * session cookie under cookie transport. Built-in live handles and unexpired
   * aliases authenticate the surviving lineage's provider/original binding;
   * wrong identity, missing/wrong/stale/replayed proof, or disabled acceptance
   * of a bound lineage fails without deleting or clearing. No currently live
   * target is idempotent success without deletion or proof reservation. Aliases
   * grant revocation only, not refresh authentication or upstream redirects.
   * Old custom bearer stores without revocation context retain legacy alias
   * deletion behavior. Stateless application access tokens are not invalidated.
   * Local-only logout (`redirect` unset or `false`) never contacts the provider.
   * Redirected logout (`redirect: true`)
   * treats the upstream end-session redirect as best-effort: when provider
   * discovery fails or no `endSessionEndpoint` is available, the route still
   * returns this local success. Discovery errors reach `onError` without
   * undoing revocation or skipping the live session's `onLogout` notification.
   */
  loggedOut: true;
}

/** Vault handle transport; independent of DPoP mode. Default: body. */
export type OidcVaultSessionTransport = 'body' | 'cookie';
