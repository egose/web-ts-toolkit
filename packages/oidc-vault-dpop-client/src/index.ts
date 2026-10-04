/**
 * Browser-only DPoP client (CLIENT-02 port of apps/oidc-vault-dpop-example/src/auth/*).
 * No `node:*` or `express` imports. Browser globals (crypto.subtle, indexedDB,
 * sessionStorage, navigator.locks, BroadcastChannel) only behind
 * assertDpopBrowserFeatures / lazy factory calls, never at module top-level.
 *
 * Canonical consumer import (named root imports only, no default export):
 * `import { createOidcVaultDpopSession, fetchWithDpop } from
 * '@web-ts-toolkit/oidc-vault-dpop-client'`.
 *
 * Companion types needed for typed consumption (`DpopAccessToken` returned by
 * `getAccessToken`, `DpopNonceCache` accepted by `fetchWithDpop`, and the
 * `DeviceFingerprint` family accepted by session options) are also exported
 * from this root, so consumers never need deep `dist/*` or `src/*` imports.
 * Non-public coordination helpers (`withDpopDatabase`, `resolveDpopScope`,
 * cookie-version bookkeeping) stay internal on purpose; see README.
 */
// Private, copyable example APIs. No backend package/browser subpath is published.
export { getOrCreateDpopKey, type DpopKey, type DpopKeyScope } from './dpop-key-store';
export { createDpopProof, type DpopProofInput } from './dpop-proof';
export {
  createOidcVaultDpopSession,
  type OidcVaultDpopSession,
  type OidcVaultDpopSessionOptions,
} from './auth-session';
export type { DpopAccessToken } from './credentials';
export { fetchWithDpop, type DpopFetchContext, type DpopFetchOptions, type DpopApi } from './auth-fetch';
export { DpopNonceCache } from './nonce-cache';
export {
  createDeviceFingerprint,
  fingerprintJsSignalSource,
  type DeviceFingerprint,
  type DeviceFingerprintOptions,
  type DeviceFingerprintSignalSource,
  type FingerprintJsAgent,
} from './device-fingerprint';
export { OidcVaultDpopClientError } from './errors';
