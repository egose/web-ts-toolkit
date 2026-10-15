import type {
  OidcVaultExchangeResult,
  OidcVaultLoginInitiationInput,
  OidcVaultLoginInitiationResult,
  OidcVaultLogoutResult,
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
void [transport, login, initiated, exchanged, loggedOut];

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
