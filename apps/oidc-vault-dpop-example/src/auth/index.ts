// Private, copyable example APIs. No backend package/browser subpath is published.
export { getOrCreateDpopKey, type DpopKey, type DpopKeyScope } from './dpop-key-store';
export { createDpopProof, type DpopProofInput } from './dpop-proof';
export {
  createOidcVaultDpopSession,
  type OidcVaultDpopSession,
  type OidcVaultDpopSessionOptions,
} from './auth-session';
export { fetchWithDpop, type DpopFetchContext, type DpopFetchOptions, type DpopApi } from './auth-fetch';
export { createDeviceFingerprint, fingerprintJsSignalSource } from './device-fingerprint';
export { OidcVaultDpopClientError } from './errors';
