import { describe, expect, it } from 'vitest';

import { DEFAULT_OIDC_SCOPES, resolveOidcVaultConfig, resolveOidcVaultConfigFromEnv } from '../src/config';
import type { OidcVaultConfig } from '../src/types';

describe('resolveOidcVaultConfig', () => {
  it('uses issuer discovery mode when only issuer metadata is configured', () => {
    const config = resolveOidcVaultConfig({
      issuer: ' https://issuer.example.com ',
      clientId: 'client_1',
      clientSecret: 'secret_1', // pragma: allowlist secret
    });

    expect(config).toEqual({
      mode: 'issuer',
      issuer: 'https://issuer.example.com',
      clientId: 'client_1',
      clientSecret: 'secret_1', // pragma: allowlist secret
      scopes: DEFAULT_OIDC_SCOPES,
    });
  });

  it('validates required manual endpoints and preserves explicit optional values', () => {
    const config = resolveOidcVaultConfig({
      issuer: 'https://issuer.example.com',
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
      issuer: 'https://issuer.example.com',
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
    expect(() =>
      resolveOidcVaultConfig({
        authorizationEndpoint: 'https://issuer.example.com/auth',
        clientId: 'client_1',
      }),
    ).toThrow('Missing required OIDC configuration for manual mode: issuer, tokenEndpoint, jwksUri');
  });

  it('throws when clientId is missing', () => {
    expect(() => resolveOidcVaultConfig({ issuer: 'https://issuer.example.com' })).toThrow(
      'OIDC clientId is required.',
    );
  });

  it('throws option-specific errors for invalid OIDC URLs', () => {
    expect(() =>
      resolveOidcVaultConfig({
        issuer: 'javascript:alert(1)',
        clientId: 'client_1',
      }),
    ).toThrow('config.issuer must use http or https.');

    expect(() =>
      resolveOidcVaultConfig({
        issuer: 'https://issuer.example.com',
        authorizationEndpoint: 'not a url',
        tokenEndpoint: 'https://issuer.example.com/token',
        jwksUri: 'https://issuer.example.com/jwks',
        clientId: 'client_1',
      }),
    ).toThrow('config.authorizationEndpoint must be an absolute HTTP(S) URL.');
  });
});

describe('resolveOidcVaultConfigFromEnv', () => {
  it('reads documented env vars, trims values, and defaults scopes', () => {
    const config = resolveOidcVaultConfigFromEnv({
      OIDC_AUTHORIZATION_ENDPOINT: ' https://issuer.example.com/auth ',
      OIDC_TOKEN_ENDPOINT: 'https://issuer.example.com/token',
      OIDC_JWKS_URI: 'https://issuer.example.com/jwks',
      OIDC_ISSUER: 'https://issuer.example.com',
      OIDC_USERINFO_ENDPOINT: '   ',
      OIDC_CLIENT_ID: ' client_1 ',
    });

    expect(config).toEqual({
      mode: 'manual',
      issuer: 'https://issuer.example.com',
      authorizationEndpoint: 'https://issuer.example.com/auth',
      tokenEndpoint: 'https://issuer.example.com/token',
      jwksUri: 'https://issuer.example.com/jwks',
      clientId: 'client_1',
      scopes: DEFAULT_OIDC_SCOPES,
    });
  });
});

describe.each([
  { field: 'userInfoEndpoint', envField: 'OIDC_USERINFO_ENDPOINT' },
  { field: 'endSessionEndpoint', envField: 'OIDC_END_SESSION_ENDPOINT' },
] as const)('OVH-02 optional manual selector: $field', ({ field, envField }) => {
  const endpoint = ' https://issuer.example.com/optional ';
  const manualConfig = {
    issuer: 'https://issuer.example.com',
    authorizationEndpoint: 'https://issuer.example.com/auth',
    tokenEndpoint: 'https://issuer.example.com/token',
    jwksUri: 'https://issuer.example.com/jwks',
    clientId: 'client_1',
    [field]: endpoint,
  };

  it('rejects an optional-only direct endpoint instead of silently choosing discovery', () => {
    expect(() =>
      resolveOidcVaultConfig({ issuer: manualConfig.issuer, clientId: 'client_1', [field]: endpoint }),
    ).toThrow('Missing required OIDC configuration for manual mode: authorizationEndpoint, tokenEndpoint, jwksUri');
  });

  it('rejects an optional-only environment endpoint instead of silently choosing discovery', () => {
    expect(() =>
      resolveOidcVaultConfigFromEnv({
        OIDC_ISSUER: manualConfig.issuer,
        OIDC_CLIENT_ID: 'client_1',
        [envField]: endpoint,
      }),
    ).toThrow('Missing required OIDC configuration for manual mode: authorizationEndpoint, tokenEndpoint, jwksUri');
  });

  it.each(['issuer', 'authorizationEndpoint', 'tokenEndpoint', 'jwksUri'] as const)(
    'requires %s in the complete manual set',
    (required) => {
      expect(() => resolveOidcVaultConfig({ ...manualConfig, [required]: undefined })).toThrow(
        `Missing required OIDC configuration for manual mode: ${required}`,
      );
    },
  );

  it('preserves and normalizes the optional endpoint in complete direct and env configuration', () => {
    const direct = resolveOidcVaultConfig(manualConfig);
    const fromEnv = resolveOidcVaultConfigFromEnv({
      OIDC_ISSUER: manualConfig.issuer,
      OIDC_AUTHORIZATION_ENDPOINT: manualConfig.authorizationEndpoint,
      OIDC_TOKEN_ENDPOINT: manualConfig.tokenEndpoint,
      OIDC_JWKS_URI: manualConfig.jwksUri,
      OIDC_CLIENT_ID: manualConfig.clientId,
      [envField]: endpoint,
    });
    expect(direct).toMatchObject({ mode: 'manual', [field]: endpoint.trim() });
    expect(fromEnv).toEqual(direct);
  });

  it.each(['not a url', 'ftp://issuer.example.com/optional'])(
    'validates a nonempty optional-only endpoint (%s) rather than ignoring it',
    (value) => {
      expect(() =>
        resolveOidcVaultConfig({ issuer: manualConfig.issuer, clientId: 'client_1', [field]: value }),
      ).toThrow(`config.${field} must`);
      expect(() =>
        resolveOidcVaultConfigFromEnv({
          OIDC_ISSUER: manualConfig.issuer,
          OIDC_CLIENT_ID: 'client_1',
          [envField]: value,
        }),
      ).toThrow(`config.${field} must`);
    },
  );
});

describe('OVH-02 absent optional configuration', () => {
  it.each([undefined, '', ' \t\n '])('keeps absent/blank optionals (%j) absent in both modes', (value) => {
    for (const manual of [false, true]) {
      const endpoints: OidcVaultConfig = manual
        ? {
            authorizationEndpoint: 'https://issuer.example.com/auth',
            tokenEndpoint: 'https://issuer.example.com/token',
            jwksUri: 'https://issuer.example.com/jwks',
          }
        : {};
      const direct = resolveOidcVaultConfig({
        issuer: 'https://issuer.example.com',
        clientId: 'client_1',
        ...endpoints,
        userInfoEndpoint: value,
        endSessionEndpoint: value,
      });
      const fromEnv = resolveOidcVaultConfigFromEnv({
        OIDC_ISSUER: 'https://issuer.example.com',
        OIDC_CLIENT_ID: 'client_1',
        OIDC_AUTHORIZATION_ENDPOINT: endpoints.authorizationEndpoint,
        OIDC_TOKEN_ENDPOINT: endpoints.tokenEndpoint,
        OIDC_JWKS_URI: endpoints.jwksUri,
        OIDC_USERINFO_ENDPOINT: value,
        OIDC_END_SESSION_ENDPOINT: value,
      });
      expect(direct.mode).toBe(manual ? 'manual' : 'issuer');
      expect(direct).not.toHaveProperty('userInfoEndpoint');
      expect(direct).not.toHaveProperty('endSessionEndpoint');
      expect(fromEnv).toEqual(direct);
    }
  });
});
