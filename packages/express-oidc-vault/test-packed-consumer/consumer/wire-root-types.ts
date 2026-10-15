import type * as Root from '@web-ts-toolkit/express-oidc-vault';
import type * as Wire from '@web-ts-toolkit/express-oidc-vault/wire';
import type { Request } from 'express';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

// All moved types remain root-importable and exactly match the pure entry.
export type PreservedRootContracts = [
  Assert<Equal<Root.OidcVaultExchangeResult, Wire.OidcVaultExchangeResult>>,
  Assert<Equal<Root.OidcVaultLoginInitiationInput, Wire.OidcVaultLoginInitiationInput>>,
  Assert<Equal<Root.OidcVaultLoginInitiationResult, Wire.OidcVaultLoginInitiationResult>>,
  Assert<Equal<Root.OidcVaultLogoutResult, Wire.OidcVaultLogoutResult>>,
  Assert<Equal<Root.OidcVaultSessionTransport, Wire.OidcVaultSessionTransport>>,
  Assert<Equal<Root.OidcVaultTokenIssueResult, Wire.OidcVaultTokenIssueResult>>,
  Assert<Equal<Root.OidcVaultUserProfile, Wire.OidcVaultUserProfile>>,
  Assert<Equal<Request['auth'], Root.OidcVaultAuthContext | undefined>>,
];
