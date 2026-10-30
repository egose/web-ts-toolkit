import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMemoryOidcVaultStore } from '../../express-oidc-vault-memory-store/src/index';
import { createOidcVaultMiddleware } from '../src/index';
import { requestToken } from '../src/provider-client';

const metadata = {
  authorizationEndpoint: 'https://idp.example/authorize',
  tokenEndpoint: 'https://idp.example/token',
  jwksUri: 'https://idp.example/jwks',
  clientId: 'client',
  scopes: 'openid',
};

afterEach(() => vi.unstubAllGlobals());

describe('OVAR-02 refresh rejection classification', () => {
  it('recognizes only a confirmed refresh grant rejection and sanitizes its description', async () => {
    const request = vi.fn(async () =>
      Response.json(
        {
          error: 'invalid_grant',
          error_description: 'private upstream detail',
        },
        { status: 400 },
      ),
    );
    vi.stubGlobal('fetch', request);
    await expect(
      requestToken(metadata, { grant_type: 'refresh_token', refresh_token: 'private-token' }),
    ).rejects.toMatchObject({
      status: 401,
      code: 'OIDC_VAULT_REFRESH_REJECTED',
      message: 'OIDC refresh was rejected. Sign in again.',
      clientMessage: 'OIDC refresh was rejected. Sign in again.',
    });
    expect(request).toHaveBeenCalledOnce();
  });

  it.each([
    [400, 'authorization_code', '{"error":"invalid_grant"}'],
    [401, 'refresh_token', '{"error":"invalid_grant"}'],
    [429, 'refresh_token', '{"error":"invalid_grant"}'],
    [503, 'refresh_token', '{"error":"invalid_grant"}'],
    [302, 'refresh_token', '{"error":"invalid_grant"}'],
    [400, 'refresh_token', '{"error":"invalid_client"}'],
    [400, 'refresh_token', '{"error_description":"invalid_grant"}'],
    [400, 'refresh_token', '{"error":["invalid_grant"]}'],
    [400, 'refresh_token', '[{"error":"invalid_grant"}]'],
    [400, 'refresh_token', 'null'],
    [400, 'refresh_token', '{"error":"invalid_grant"'],
    [400, 'refresh_token', '<html>invalid_grant</html>'],
  ] as const)('retains generic failure for status %s / grant %s / body %s', async (status, grant, body) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, { status })),
    );
    await expect(requestToken(metadata, { grant_type: grant })).rejects.toMatchObject({
      status: 502,
      code: 'OIDC_VAULT_TOKEN_REQUEST_FAILED',
      message: 'OIDC token request failed.',
    });
  });

  it('does not classify a valid prefix of an oversized response as a confirmed rejection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":"invalid_grant"}' + ' '.repeat(1024 * 1024), { status: 400 })),
    );
    await expect(requestToken(metadata, { grant_type: 'refresh_token' })).rejects.toMatchObject({
      status: 502,
      code: 'OIDC_VAULT_TOKEN_REQUEST_FAILED',
    });
  });

  it.each(['body', 'cookie'] as const)(
    'retains %s server state and never clears cookies on confirmed rejection',
    async (sessionTransport) => {
      const store = createMemoryOidcVaultStore();
      await store.createSession({
        sessionId: 'original',
        subject: 'user',
        refreshToken: 'refresh',
        idToken: 'identity',
      });
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Response.json({ error: 'invalid_grant' }, { status: 400 })),
      );
      const app = express();
      app.use(
        createOidcVaultMiddleware({
          backendOrigin: 'https://api.example',
          frontendRedirectUri: 'https://app.example/callback',
          trustedOrigins: ['https://app.example'],
          sessionTransport,
          config: { ...metadata, issuer: 'https://idp.example' },
          storeProvider: store,
        }),
      );
      const response = await request(app)
        .post('/auth/oidc/refresh')
        .set('Origin', 'https://app.example')
        .set('Cookie', 'oidc_vault_session=original')
        .send(sessionTransport === 'body' ? { sessionId: 'original' } : {});
      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        code: 'OIDC_VAULT_REFRESH_REJECTED',
        message: 'OIDC refresh was rejected. Sign in again.',
      });
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(await store.getSession('original')).not.toBeNull();
    },
  );

  it('downgrades an obsolete rejection after a deterministic concurrent rotation without deleting its winner', async () => {
    const store = createMemoryOidcVaultStore();
    await store.createSession({ sessionId: 'original', subject: 'user', refreshToken: 'refresh', idToken: 'identity' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const original = (await store.getSession('original'))!;
        await store.rotateSession({
          sessionId: 'original',
          nextSession: { ...original, sessionId: 'winner', refreshToken: 'next' },
        });
        return Response.json({ error: 'invalid_grant' }, { status: 400 });
      }),
    );
    const app = express();
    app.use(
      createOidcVaultMiddleware({
        backendOrigin: 'https://api.example',
        frontendRedirectUri: 'https://app.example/callback',
        config: { ...metadata, issuer: 'https://idp.example' },
        storeProvider: store,
      }),
    );
    const response = await request(app).post('/auth/oidc/refresh').send({ sessionId: 'original' });
    expect(response.status).toBe(502);
    expect(response.body.code).toBe('OIDC_VAULT_TOKEN_REQUEST_FAILED');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(await store.getSession('winner')).toMatchObject({ refreshToken: 'next' });
  });
});
