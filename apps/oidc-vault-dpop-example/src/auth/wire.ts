// Copied wire DTOs, checked against installed backend declarations in
// test/wire-contract.test.ts. This browser graph has no Express/Node import.
export interface OidcVaultUserProfile {
  sub: string;
  email?: string;
  name?: string;
  preferredUsername?: string;
  [key: string]: unknown;
}

export interface OidcVaultTokenIssueResult {
  accessToken: string;
  expiresIn: number;
  tokenType?: 'Bearer' | 'DPoP';
}

export interface OidcVaultExchangeResult extends Partial<OidcVaultTokenIssueResult> {
  sessionId?: string;
  user?: OidcVaultUserProfile;
}

export interface OidcVaultLoginInitiationInput {
  returnTo?: string;
}
export interface OidcVaultLoginInitiationResult {
  authorizationUrl: string;
}
export interface OidcVaultLogoutResult {
  loggedOut: true;
}
export type OidcVaultSessionTransport = 'body' | 'cookie';

export interface OidcVaultErrorResult {
  code: string;
  message: string;
}
