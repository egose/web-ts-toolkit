/**
 * Browser-only DPoP client wire DTOs, single-sourced from the backend.
 * Type-only re-export: erased at build, no runtime `express`/`node:*` pull.
 */
export type {
  OidcVaultExchangeResult,
  OidcVaultLoginInitiationInput,
  OidcVaultLoginInitiationResult,
  OidcVaultLogoutResult,
  OidcVaultSessionTransport,
  OidcVaultTokenIssueResult,
  OidcVaultUserProfile,
} from '@web-ts-toolkit/express-oidc-vault';
