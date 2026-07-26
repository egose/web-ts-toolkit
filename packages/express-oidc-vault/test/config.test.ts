import { describe, expect, it } from 'vitest';

import { DEFAULT_OIDC_SCOPES, resolveOidcVaultConfig, resolveOidcVaultConfigFromEnv } from '../src/config';

describe('resolveOidcVaultConfig', () => {
  it('uses issuer discovery mode and ignores manual endpoints when issuer is present', () => {
    const config = resolveOidcVaultConfig({
      issuer: ' https://issuer.example.com ',
      authorizationEndpoint: 'https://issuer.example.com/auth',
      tokenEndpoint: 'https://issuer.example.com/token',
      jwksUri: 'https://issuer.example.com/jwks',
      endSessionEndpoint: 'https://issuer.example.com/logout',
      clientId: 'client_1',
      clientSecret: 'secret_1',
    });

    expect(config).toEqual({
      mode: 'issuer',
      issuer: 'https://issuer.example.com',
      clientId: 'client_1',
      clientSecret: 'secret_1',
      scopes: DEFAULT_OIDC_SCOPES,
    });
  });

  it('validates required manual endpoints and preserves explicit optional values', () => {
    const config = resolveOidcVaultConfig({
      authorizationEndpoint: 'https://issuer.example.com/auth',
      tokenEndpoint: 'https://issuer.example.com/token',
      userInfoEndpoint: 'https://issuer.example.com/userinfo',
      jwksUri: 'https://issuer.example.com/jwks',
      endSessionEndpoint: 'https://issuer.example.com/logout',
      clientId: 'client_1',
      scopes: 'openid profile',
    });

    expect(config).toEqual({
      mode: 'manual',
      authorizationEndpoint: 'https://issuer.example.com/auth',
      tokenEndpoint: 'https://issuer.example.com/token',
      userInfoEndpoint: 'https://issuer.example.com/userinfo',
      jwksUri: 'https://issuer.example.com/jwks',
      endSessionEndpoint: 'https://issuer.example.com/logout',
      clientId: 'client_1',
      scopes: 'openid profile',
    });
  });

  it('throws when manual mode is missing required endpoint configuration', () => {
    expect(() => resolveOidcVaultConfig({ authorizationEndpoint: 'https://issuer.example.com/auth' })).toThrow(
      'Missing required OIDC configuration for manual mode: tokenEndpoint, jwksUri',
    );
  });
});

describe('resolveOidcVaultConfigFromEnv', () => {
  it('reads documented env vars, trims values, and defaults scopes', () => {
    const config = resolveOidcVaultConfigFromEnv({
      OIDC_AUTHORIZATION_ENDPOINT: ' https://issuer.example.com/auth ',
      OIDC_TOKEN_ENDPOINT: 'https://issuer.example.com/token',
      OIDC_JWKS_URI: 'https://issuer.example.com/jwks',
      OIDC_USERINFO_ENDPOINT: '   ',
      OIDC_CLIENT_ID: ' client_1 ',
    });

    expect(config).toEqual({
      mode: 'manual',
      authorizationEndpoint: 'https://issuer.example.com/auth',
      tokenEndpoint: 'https://issuer.example.com/token',
      jwksUri: 'https://issuer.example.com/jwks',
      clientId: 'client_1',
      scopes: DEFAULT_OIDC_SCOPES,
    });
  });
});
