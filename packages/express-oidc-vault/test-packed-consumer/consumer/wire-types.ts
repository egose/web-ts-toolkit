import type {
  OidcVaultExchangeResult,
  OidcVaultLoginInitiationInput,
  OidcVaultLoginInitiationResult,
  OidcVaultLogoutResult,
  OidcVaultLogoutNavigationInput,
  OidcVaultLogoutNavigationResult,
  OidcVaultSessionTransport,
  OidcVaultTokenIssueResult,
  OidcVaultUserProfile,
} from '@web-ts-toolkit/express-oidc-vault/wire';

const transport: OidcVaultSessionTransport = 'cookie';
const login: OidcVaultLoginInitiationInput = { returnTo: '/signed-in' };
const initiated: OidcVaultLoginInitiationResult = { authorizationUrl: 'https://issuer.example.com/authorize' };
const user: OidcVaultUserProfile = { sub: 'subject', name: 'Example' };
// Shape fixture; applications sign actual bound JWTs with cnf.jkt and safe exp.
const issued: OidcVaultTokenIssueResult = { accessToken: 'type-fixture', tokenType: 'DPoP', expiresIn: 0 };
const exchanged: OidcVaultExchangeResult = { ...issued, user };
const loggedOut: OidcVaultLogoutResult = { loggedOut: true };
const logoutInput: OidcVaultLogoutNavigationInput = { sessionId: 'body-handle' };
const logoutNavigation: OidcVaultLogoutNavigationResult = {
  loggedOut: true,
  navigationUrl: 'https://api.example.com/vault/logout/navigation',
};
// @ts-expect-error — request-selected destinations are never navigation authority.
const invalidLogoutInput: OidcVaultLogoutNavigationInput = { returnTo: 'https://evil.example' };
// @ts-expect-error — local success must be confirmed before a navigation result.
const invalidLogoutResult: OidcVaultLogoutNavigationResult = { loggedOut: false, navigationUrl: 'x' };
void [
  transport,
  login,
  initiated,
  exchanged,
  loggedOut,
  logoutInput,
  logoutNavigation,
  invalidLogoutInput,
  invalidLogoutResult,
];

// @ts-expect-error — only the defined transports are supported.
const invalidTransport: OidcVaultSessionTransport = 'header';
// @ts-expect-error — proof key material does not belong in login JSON.
const invalidLogin: OidcVaultLoginInitiationInput = { jkt: 'unproved' };
// @ts-expect-error — wire lifetimes are numeric seconds.
const invalidToken: OidcVaultTokenIssueResult = { accessToken: 'x', expiresIn: '60' };
void [invalidTransport, invalidLogin, invalidToken];

// @ts-expect-error — importing /wire must not introduce Node globals.
void process;
// @ts-expect-error — importing /wire must not introduce Node globals.
void Buffer;
