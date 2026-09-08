import { createServer, type Server } from 'node:http';

import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { resolveOidcVaultConfig } from '../src/config';
import { __resetProviderClientCachesForTests, resolveProviderMetadata } from '../src/provider-client';
import { verifyBackchannelLogoutToken, verifyIdToken } from '../src/token-validation';

const originalFetch = globalThis.fetch;

afterEach(() => {
  __resetProviderClientCachesForTests();
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

describe('BOV-05 issuer identifier preservation (config)', () => {
  it('preserves a slashless root issuer exactly', () => {
    const config = resolveOidcVaultConfig({
      issuer: 'https://issuer.example.com',
      clientId: 'client_1',
    });

    expect(config.mode).toBe('issuer');
    expect(config.issuer).toBe('https://issuer.example.com');
  });

  it('keeps /tenant, /tenant/, and /tenant// distinct', () => {
    for (const issuer of [
      'https://issuer.example.com/tenant',
      'https://issuer.example.com/tenant/',
      'https://issuer.example.com/tenant//',
    ]) {
      const config = resolveOidcVaultConfig({ issuer, clientId: 'client_1' });

      expect(config.issuer).toBe(issuer);
    }
  });

  it('trims surrounding whitespace then preserves the identifier', () => {
    const config = resolveOidcVaultConfig({
      issuer: ' https://issuer.example.com/tenant ',
      clientId: 'client_1',
    });

    expect(config.issuer).toBe('https://issuer.example.com/tenant');
  });

  it('rejects issuer query, fragment, and userinfo without weakening http local-test support', () => {
    expect(() => resolveOidcVaultConfig({ issuer: 'https://issuer.example.com/?x=1', clientId: 'client_1' })).toThrow(
      'config.issuer must not include query or fragment.',
    );

    expect(() => resolveOidcVaultConfig({ issuer: 'https://issuer.example.com/#frag', clientId: 'client_1' })).toThrow(
      'config.issuer must not include query or fragment.',
    );

    expect(
      () => resolveOidcVaultConfig({ issuer: 'https://user:pass@issuer.example.com/', clientId: 'client_1' }), // pragma: allowlist secret
    ).toThrow('config.issuer must not include userinfo.');

    // Intentional HTTP local-test support is preserved.
    const httpConfig = resolveOidcVaultConfig({
      issuer: 'http://127.0.0.1:8080/tenant',
      clientId: 'client_1',
    });

    expect(httpConfig.issuer).toBe('http://127.0.0.1:8080/tenant');
  });

  it('normalizes endpoint URLs separately while preserving the issuer', () => {
    const config = resolveOidcVaultConfig({
      issuer: 'https://issuer.example.com',
      authorizationEndpoint: 'https://issuer.example.com/auth',
      tokenEndpoint: 'https://issuer.example.com/token',
      jwksUri: 'https://issuer.example.com/jwks',
      clientId: 'client_1',
    });

    expect(config.mode).toBe('manual');
    expect(config.issuer).toBe('https://issuer.example.com');
    expect(config.authorizationEndpoint).toBe('https://issuer.example.com/auth');
  });

  it('selects manual mode when any manual endpoint is present (discovery is not used)', () => {
    const config = resolveOidcVaultConfig({
      issuer: 'https://issuer.example.com',
      authorizationEndpoint: 'https://issuer.example.com/auth',
      tokenEndpoint: 'https://issuer.example.com/token',
      jwksUri: 'https://issuer.example.com/jwks',
      clientId: 'client_1',
    });

    expect(config.mode).toBe('manual');

    const discoveryOnly = resolveOidcVaultConfig({
      issuer: 'https://issuer.example.com',
      clientId: 'client_1',
    });

    expect(discoveryOnly.mode).toBe('issuer');
  });
});

describe('BOV-05 exact discovered-issuer equality', () => {
  const discoveryDocument = (issuer: string): Record<string, string> => ({
    issuer,
    authorization_endpoint: 'https://issuer.example.com/authorize',
    token_endpoint: 'https://issuer.example.com/token',
    jwks_uri: 'https://issuer.example.com/jwks',
  });

  const mockDiscovery = (discoveredIssuer: string): void => {
    globalThis.fetch = vi.fn(async () => Response.json(discoveryDocument(discoveredIssuer))) as typeof fetch;
  };

  it.each([
    ['https://issuer.example.com/tenant', 'https://issuer.example.com/tenant/'],
    ['https://issuer.example.com/tenant/', 'https://issuer.example.com/tenant'],
    ['https://issuer.example.com/tenant', 'https://issuer.example.com/tenant//'],
    ['https://issuer.example.com/tenant/', 'https://issuer.example.com/tenant//'],
    ['https://issuer.example.com', 'https://issuer.example.com/'],
  ])('rejects %s vs %s as non-interchangeable', async (configured, discovered) => {
    mockDiscovery(discovered);

    await expect(
      resolveProviderMetadata({ mode: 'issuer', issuer: configured, clientId: 'client_1', scopes: 'openid' }),
    ).rejects.toMatchObject({ code: 'OIDC_VAULT_DISCOVERY_INVALID' });
  });

  it.each([
    'https://issuer.example.com',
    'https://issuer.example.com/',
    'https://issuer.example.com/tenant',
    'https://issuer.example.com/tenant/',
    'https://issuer.example.com/tenant//',
  ])('accepts exact match for %s', async (issuer) => {
    mockDiscovery(issuer);

    const metadata = await resolveProviderMetadata({
      mode: 'issuer',
      issuer,
      clientId: 'client_1',
      scopes: 'openid',
    });

    expect(metadata.issuer).toBe(issuer);
  });

  it('rejects discovered issuers with forbidden components', async () => {
    for (const discovered of [
      'https://issuer.example.com/tenant?x=1',
      'https://issuer.example.com/tenant#frag',
      'https://user:pass@issuer.example.com/tenant', // pragma: allowlist secret
    ]) {
      __resetProviderClientCachesForTests();
      mockDiscovery(discovered);

      await expect(
        resolveProviderMetadata({
          mode: 'issuer',
          issuer: 'https://issuer.example.com/tenant',
          clientId: 'client_1',
          scopes: 'openid',
        }),
      ).rejects.toMatchObject({ code: 'OIDC_VAULT_DISCOVERY_INVALID' });
    }
  });
});

describe('BOV-05 manual signed-token validation with slashless root issuer', () => {
  let server: Server | undefined;
  let baseUrl = '';
  let privateKey: CryptoKey;
  let publicJwk: Record<string, unknown>;

  beforeAll(async () => {
    const keyPair = await generateKeyPair('RS256');
    const exported = await exportJWK(keyPair.publicKey);
    privateKey = keyPair.privateKey;
    publicJwk = { ...exported, kid: 'bov-05-key', use: 'sig' };

    const httpServer = createServer((req, res) => {
      if (req.url === '/jwks') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ keys: [publicJwk] }));
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    server = httpServer;
    const address = httpServer.address();

    if (typeof address !== 'object' || address === null) {
      throw new Error('Test server did not bind to a port.');
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it('validates ID and logout tokens against the exact slashless issuer', async () => {
    // baseUrl is a slashless root issuer (http allowed for local tests).
    const config = resolveOidcVaultConfig({
      issuer: baseUrl,
      authorizationEndpoint: `${baseUrl}/auth`,
      tokenEndpoint: `${baseUrl}/token`,
      jwksUri: `${baseUrl}/jwks`,
      clientId: 'client_1',
    });

    expect(config.mode).toBe('manual');
    expect(config.issuer).toBe(baseUrl);

    const metadata = await resolveProviderMetadata(config);

    expect(metadata.issuer).toBe(baseUrl);

    const now = Math.floor(Date.now() / 1000);
    const idToken = await new SignJWT({ sub: 'user_1' })
      .setProtectedHeader({ alg: 'RS256', kid: 'bov-05-key' })
      .setIssuer(baseUrl)
      .setAudience('client_1')
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(privateKey);

    const idClaims = await verifyIdToken(metadata, idToken);
    expect(idClaims.sub).toBe('user_1');

    const logoutToken = await new SignJWT({
      sid: 'provider_sid_1',
      jti: `logout_${Date.now()}`,
      events: { 'http://schemas.openid.net/event/backchannel-logout': {} },
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'bov-05-key' })
      .setIssuer(baseUrl)
      .setAudience('client_1')
      .setIssuedAt(now)
      .setExpirationTime(now + 300)
      .sign(privateKey);

    const logoutClaims = await verifyBackchannelLogoutToken(metadata, logoutToken);
    expect(logoutClaims.sid).toBe('provider_sid_1');
  });

  it('rejects a trailing-slash token issuer against a slashless configured issuer', async () => {
    const config = resolveOidcVaultConfig({
      issuer: baseUrl,
      authorizationEndpoint: `${baseUrl}/auth`,
      tokenEndpoint: `${baseUrl}/token`,
      jwksUri: `${baseUrl}/jwks`,
      clientId: 'client_1',
    });
    const metadata = await resolveProviderMetadata(config);

    const now = Math.floor(Date.now() / 1000);
    const mismatched = await new SignJWT({ sub: 'user_1' })
      .setProtectedHeader({ alg: 'RS256', kid: 'bov-05-key' })
      .setIssuer(`${baseUrl}/`)
      .setAudience('client_1')
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(privateKey);

    await expect(verifyIdToken(metadata, mismatched)).rejects.toThrow();
  });
});
