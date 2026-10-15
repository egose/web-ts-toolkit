/**
 * Browser-only DPoP client wire DTOs, single-sourced from the backend.
 * The pure backend entry has no server types or augmentation. Its declarations
 * are bundled into this client; the import is erased from browser JavaScript.
 */
export type {
  OidcVaultExchangeResult,
  OidcVaultLoginInitiationInput,
  OidcVaultLoginInitiationResult,
  OidcVaultLogoutResult,
  OidcVaultSessionTransport,
  OidcVaultTokenIssueResult,
  OidcVaultUserProfile,
} from '@web-ts-toolkit/express-oidc-vault/wire';
