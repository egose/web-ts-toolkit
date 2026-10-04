/**
 * Browser-only DPoP client (CLIENT-02 port of apps/oidc-vault-dpop-example/src/auth/*).
 * No `node:*` or `express` imports. Browser globals (crypto.subtle, indexedDB,
 * sessionStorage, navigator.locks, BroadcastChannel) only behind
 * assertDpopBrowserFeatures / lazy factory calls, never at module top-level.
 */
/** Fixed local failures; never include keys, credentials, fingerprints or URLs. */
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

const SERVER_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  OIDC_VAULT_FINGERPRINT_REAUTH_REQUIRED: 'Browser recognition changed; sign in again.',
  OIDC_VAULT_INVALID_FINGERPRINT: 'Fingerprint signal is invalid.',
  OIDC_VAULT_USE_DPOP_NONCE: 'A fresh DPoP nonce is required.',
  OIDC_VAULT_INVALID_DPOP_PROOF: 'DPoP proof validation failed.',
  OIDC_VAULT_DPOP_REQUIRED: 'DPoP authentication is required.',
  OIDC_VAULT_DEVICE_BINDING_REQUIRED: 'A device-bound login is required.',
  OIDC_VAULT_INVALID_BROWSER_BINDING: 'Login browser binding validation failed.',
  OIDC_VAULT_INVALID_SESSION: 'Session is missing or expired.',
  OIDC_VAULT_DPOP_REPLAY_UNAVAILABLE: 'DPoP replay protection is unavailable.',
});

export const serverError = (status: number, value: unknown): OidcVaultDpopClientError => {
  const code =
    typeof value === 'object' && value !== null && 'code' in value && typeof value.code === 'string'
      ? value.code
      : 'OIDC_REQUEST_FAILED';
  const requiresLogin =
    status === 401 ||
    code === 'OIDC_VAULT_FINGERPRINT_REAUTH_REQUIRED' ||
    code === 'OIDC_VAULT_INVALID_BROWSER_BINDING';
  return new OidcVaultDpopClientError(code, SERVER_MESSAGES[code] ?? 'The OIDC request failed.', requiresLogin, status);
};
