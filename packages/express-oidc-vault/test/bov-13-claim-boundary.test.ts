import { createServer, type Server } from 'node:http';

import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resolveOidcVaultConfig } from '../src/config';
import { __resetProviderClientCachesForTests, resolveProviderMetadata } from '../src/provider-client';
import type { OidcProviderMetadata } from '../src/provider-client';
import { verifyIdToken } from '../src/token-validation';

/**
 * BOV-13: each named ID-token claim check owns a regression test that names
 * its boundary in the assertion message.
 *
 * Every negative token below is otherwise valid: correct issuer, audience,
 * signature, time window, subject, and the expected login nonce. The two
 * valid controls prove the fixture reaches the verifier (keys, issuer
 * binding, audience binding) so a rejection evidences the named check
 * rather than fixture setup.
 *
 * These tests call `verifyIdToken` directly. No route/callback logic is
 * copied into helpers; route-level nonce wiring is covered by the repaired
 * `test/index.test.ts` callback case.
 */
describe('BOV-13 ID-token claim boundaries', () => {
  const NONCE = 'login_nonce_bov13';
  const CLIENT_ID = 'client_1';

  let server: Server | undefined;
  let baseUrl = '';
  let privateKey: CryptoKey;
  let metadata: OidcProviderMetadata;

  const signToken = async (
    payload: Record<string, unknown>,
    options?: { audience?: string | string[]; omitIssuedAt?: boolean; omitExpirationTime?: boolean },
  ): Promise<string> => {
    const now = Math.floor(Date.now() / 1000);
    let jwt = new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: 'bov-13-key' })
      .setIssuer(baseUrl)
      .setAudience(options?.audience ?? CLIENT_ID);

    if (!options?.omitIssuedAt) {
      jwt = jwt.setIssuedAt(now);
    }

    if (!options?.omitExpirationTime) {
      jwt = jwt.setExpirationTime(now + 3600);
    }

    return jwt.sign(privateKey);
  };

  const validPayload = (nonce: string = NONCE): Record<string, unknown> => ({
    sub: 'user_1',
    nonce,
  });

  beforeAll(async () => {
    const keyPair = await generateKeyPair('RS256');
    const exported = await exportJWK(keyPair.publicKey);
    privateKey = keyPair.privateKey;
    const publicJwk = { ...exported, kid: 'bov-13-key', use: 'sig' };

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

    // Typed against the real contract: manual config resolves to
    // OidcVaultResolvedConfig (mode 'manual'), never a 'discovery' literal.
    const config = resolveOidcVaultConfig({
      issuer: baseUrl,
      authorizationEndpoint: `${baseUrl}/auth`,
      tokenEndpoint: `${baseUrl}/token`,
      jwksUri: `${baseUrl}/jwks`,
      clientId: CLIENT_ID,
    });

    expect(config.mode).toBe('manual');
    metadata = await resolveProviderMetadata(config);
  });

  afterAll(async () => {
    __resetProviderClientCachesForTests();

    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it('accepts an otherwise-valid single-audience token with the login nonce', async () => {
    const token = await signToken(validPayload());

    const claims = await verifyIdToken(metadata, token, NONCE);

    expect(claims.sub).toBe('user_1');
  });

  it('accepts multiple audiences when azp matches the client', async () => {
    const token = await signToken({ ...validPayload(), azp: CLIENT_ID }, { audience: [CLIENT_ID, 'client_2'] });

    const claims = await verifyIdToken(metadata, token, NONCE);

    expect(claims.azp).toBe(CLIENT_ID);
  });

  it('rejects a token missing exp at the exp boundary', async () => {
    const token = await signToken(validPayload(), { omitExpirationTime: true });

    await expect(verifyIdToken(metadata, token, NONCE)).rejects.toMatchObject({
      code: 'OIDC_VAULT_INVALID_ID_TOKEN',
      message: 'OIDC id_token is missing exp.',
    });
  });

  it('rejects a token missing iat at the iat boundary', async () => {
    const token = await signToken(validPayload(), { omitIssuedAt: true });

    await expect(verifyIdToken(metadata, token, NONCE)).rejects.toMatchObject({
      code: 'OIDC_VAULT_INVALID_ID_TOKEN',
      message: 'OIDC id_token is missing iat.',
    });
  });

  it('rejects a token missing sub at the sub boundary', async () => {
    const token = await signToken({ nonce: NONCE });

    await expect(verifyIdToken(metadata, token, NONCE)).rejects.toMatchObject({
      code: 'OIDC_VAULT_INVALID_ID_TOKEN',
      message: 'OIDC id_token is missing sub.',
    });
  });

  it('rejects a token with the wrong azp at the azp boundary', async () => {
    const token = await signToken({ ...validPayload(), azp: 'other_client' });

    await expect(verifyIdToken(metadata, token, NONCE)).rejects.toMatchObject({
      code: 'OIDC_VAULT_INVALID_ID_TOKEN',
      message: 'OIDC id_token azp validation failed.',
    });
  });

  it('rejects multiple audiences without azp at the multi-audience boundary', async () => {
    const token = await signToken(validPayload(), { audience: [CLIENT_ID, 'client_2'] });

    await expect(verifyIdToken(metadata, token, NONCE)).rejects.toMatchObject({
      code: 'OIDC_VAULT_INVALID_ID_TOKEN',
      message: 'OIDC id_token azp is required for multiple audiences.',
    });
  });

  it('rejects a wrong nonce at the nonce boundary', async () => {
    const token = await signToken(validPayload('some_other_nonce'));

    await expect(verifyIdToken(metadata, token, NONCE)).rejects.toMatchObject({
      code: 'OIDC_VAULT_INVALID_ID_TOKEN',
      message: 'OIDC id_token nonce validation failed.',
    });
  });

  it('rejects a nonce-less token when a login nonce is expected', async () => {
    const token = await signToken({ sub: 'user_1' });

    await expect(verifyIdToken(metadata, token, NONCE)).rejects.toMatchObject({
      code: 'OIDC_VAULT_INVALID_ID_TOKEN',
      message: 'OIDC id_token nonce validation failed.',
    });
  });
});
