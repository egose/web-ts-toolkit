/**
 * Built-in failures use fixed codes/messages, never server text or credentials.
 * requiresLogin identifies terminal session/binding/recognition or local key
 * failures, not every HTTP 401. Non-terminal errors retain auth and do not by
 * themselves authorize an automatic retry. Unknown vault codes are sanitized to
 * OIDC_REQUEST_FAILED with requiresLogin: false; status remains available.
 */
export class OidcVaultDpopClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly requiresLogin = false,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'OidcVaultDpopClientError';
  }
}

export const keyLost = (): OidcVaultDpopClientError =>
  new OidcVaultDpopClientError('DPOP_KEY_LOST', 'The browser login key is missing or changed. Sign in again.', true);

export const loginRequired = (): OidcVaultDpopClientError =>
  new OidcVaultDpopClientError('LOGIN_REQUIRED', 'Sign in to continue.', true);

export const vaultRequestTimeout = (): OidcVaultDpopClientError =>
  new OidcVaultDpopClientError('DPOP_REQUEST_TIMEOUT', 'The vault request timed out.');

export const vaultResponseTooLarge = (): OidcVaultDpopClientError =>
  new OidcVaultDpopClientError('DPOP_RESPONSE_TOO_LARGE', 'The vault response exceeded the size limit.');

// These failures identify unusable session/login authority, including the
// companion server's HTTP-400 cookie/exchange contracts (not just its 401s).
const TERMINAL_SERVER_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  OIDC_VAULT_FINGERPRINT_REAUTH_REQUIRED: 'Browser recognition changed; sign in again.',
  OIDC_VAULT_DEVICE_BINDING_REQUIRED: 'A device-bound login is required.',
  OIDC_VAULT_INVALID_BROWSER_BINDING: 'Login browser binding validation failed.',
  OIDC_VAULT_INVALID_SESSION: 'Session is missing or expired.',
  OIDC_VAULT_REFRESH_REJECTED: 'OIDC refresh was rejected. Sign in again.',
  OIDC_VAULT_MISSING_SESSION_ID: 'Session handle is missing.',
  OIDC_VAULT_MALFORMED_SESSION_COOKIE: 'Session cookie is malformed.',
  OIDC_VAULT_INVALID_EXCHANGE_CODE: 'Exchange code is invalid or expired.',
});

// A bad/missing proof does not prove the underlying session is unusable.
// Request/configuration/provider failures also retain auth, but may require
// application/operator recovery. This list never authorizes mutation retries.
const NON_TERMINAL_SERVER_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  OIDC_VAULT_INVALID_FINGERPRINT: 'Fingerprint signal is invalid.',
  OIDC_VAULT_USE_DPOP_NONCE: 'A fresh DPoP nonce is required.',
  OIDC_VAULT_INVALID_DPOP_PROOF: 'DPoP proof validation failed.',
  OIDC_VAULT_DPOP_REQUIRED: 'DPoP authentication is required.',
  OIDC_VAULT_DPOP_REPLAY_UNAVAILABLE: 'DPoP replay protection is unavailable.',
  OIDC_VAULT_UNTRUSTED_ORIGIN: 'The request origin is not trusted.',
  OIDC_VAULT_INVALID_RETURN_TO: 'The login return target is invalid.',
  OIDC_VAULT_MISSING_EXCHANGE_CODE: 'The exchange request is missing a code.',
  OIDC_VAULT_REQUEST_BODY_TOO_LARGE: 'The vault request body exceeds the size limit.',
  OIDC_VAULT_REQUEST_BODY_PARAMETER_LIMIT_EXCEEDED: 'The vault request has too many parameters.',
  OIDC_VAULT_UNSUPPORTED_REQUEST_BODY_ENCODING: 'The vault request body encoding is unsupported.',
  OIDC_VAULT_UNSUPPORTED_REQUEST_BODY_TYPE: 'The vault request body type is unsupported.',
  OIDC_VAULT_MALFORMED_REQUEST_BODY: 'The vault request body is malformed.',
  OIDC_VAULT_INVALID_REQUEST_BODY: 'The vault request body is invalid.',
  OIDC_VAULT_INTERNAL_ERROR: 'The OIDC request failed.',
  OIDC_VAULT_INVALID_CONFIG: 'The OIDC configuration is invalid.',
  OIDC_VAULT_MISSING_CLIENT_ID: 'The OIDC client configuration is incomplete.',
  OIDC_VAULT_MISSING_JWKS_URI: 'The OIDC signing-key configuration is incomplete.',
  OIDC_VAULT_DISCOVERY_FAILED: 'OIDC discovery failed.',
  OIDC_VAULT_DISCOVERY_INVALID: 'OIDC discovery metadata is invalid.',
  OIDC_VAULT_JWKS_FAILED: 'OIDC signing keys are unavailable.',
  OIDC_VAULT_TOKEN_REQUEST_FAILED: 'OIDC token request failed.',
  OIDC_VAULT_INVALID_TOKEN_RESPONSE: 'OIDC token response is invalid.',
  OIDC_VAULT_INVALID_ID_TOKEN: 'OIDC ID token validation failed.',
  OIDC_VAULT_USERINFO_FAILED: 'OIDC userinfo request failed.',
  OIDC_VAULT_INVALID_USERINFO: 'OIDC userinfo response is invalid.',
});

export const serverError = (status: number, value: unknown): OidcVaultDpopClientError => {
  // JSON supplies own data properties. Do not read inherited codes, accessors,
  // or server messages, and never expose an unrecognized code verbatim.
  const code: unknown =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? Object.getOwnPropertyDescriptor(value, 'code')?.value
      : undefined;
  if (typeof code === 'string') {
    if (Object.hasOwn(TERMINAL_SERVER_MESSAGES, code))
      return new OidcVaultDpopClientError(code, TERMINAL_SERVER_MESSAGES[code], true, status);
    if (Object.hasOwn(NON_TERMINAL_SERVER_MESSAGES, code))
      return new OidcVaultDpopClientError(code, NON_TERMINAL_SERVER_MESSAGES[code], false, status);
  }
  return new OidcVaultDpopClientError('OIDC_REQUEST_FAILED', 'The OIDC request failed.', false, status);
};
