import http from 'node:http';

import express from 'express';
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createMemoryOidcVaultStore } from '../../express-oidc-vault-memory-store/src/index';
import { createOidcVaultMiddleware } from '../src/index';
import { __resetProviderClientCachesForTests } from '../src/provider-client';

const BACKEND_ORIGIN = 'https://api.example.com';
const FRONTEND_ORIGIN = 'https://frontend.example.com';

const expectNoStore = (res: request.Response): void => {
  expect(res.headers['cache-control']).toBe('no-store');
  // Legacy / referrer decisions (BOV-16): only Cache-Control: no-store is
  // emitted. Pragma/Expires add no protection once no-store is present, and
  // Referrer-Policy cannot hide the intentional redirect target itself.
  expect(res.headers.pragma).toBeUndefined();
  expect(res.headers.expires).toBeUndefined();
  expect(res.headers['referrer-policy']).toBeUndefined();
};

describe('BOV-16 credential-response cache policy', () => {
  let issuerBaseUrl = '';
  let issuerServer: http.Server | undefined;
  let publicJwk: JWK;
  let privateKey: CryptoKey;

  const createIdToken = async (nonce?: string): Promise<string> => {
    const now = Math.floor(Date.now() / 1000);
    const payload: Record<string, unknown> = { sub: 'user_1', sid: 'provider_sid_1', email: 'user@example.com' };
    if (nonce) {
      payload.nonce = nonce;
    }
    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(`${issuerBaseUrl}/issuer`)
      .setAudience('client_1')
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(privateKey);
  };

  const createLogoutToken = async (sid: string): Promise<string> => {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      sub: 'user_1',
      sid,
      jti: `logout_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      events: { 'http://schemas.openid.net/event/backchannel-logout': {} },
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key', typ: 'logout+jwt' })
      .setIssuer(`${issuerBaseUrl}/issuer`)
      .setAudience('client_1')
      .setIssuedAt(now)
      .setExpirationTime(now + 600)
      .sign(privateKey);
  };

  beforeAll(async () => {
    const issuerApp = express();
    issuerApp.use(express.urlencoded({ extended: false }));
    const keyPair = await generateKeyPair('RS256');
    publicJwk = await exportJWK(keyPair.publicKey);
    publicJwk.kid = 'test-key';
    privateKey = keyPair.privateKey;

    issuerApp.get('/issuer/.well-known/openid-configuration', (_req, res) => {
      res.json({
        issuer: `${issuerBaseUrl}/issuer`,
        authorization_endpoint: `${issuerBaseUrl}/issuer/authorize`,
        token_endpoint: `${issuerBaseUrl}/issuer/token`,
        userinfo_endpoint: `${issuerBaseUrl}/issuer/userinfo`,
        jwks_uri: `${issuerBaseUrl}/issuer/jwks`,
        end_session_endpoint: `${issuerBaseUrl}/issuer/logout`,
      });
    });
    issuerApp.get('/issuer/jwks', (_req, res) => {
      res.json({ keys: [publicJwk] });
    });
    issuerApp.post('/issuer/token', async (req, res) => {
      if (req.body.grant_type === 'authorization_code') {
        const code = String(req.body.code ?? '');
        const nonce = code.split(':')[1] ?? undefined;
        res.json({
          token_type: 'Bearer',
          expires_in: 3600,
          access_token: 'upstream_access_1',
          refresh_token: 'upstream_refresh_1',
          scope: 'openid email profile',
          id_token: await createIdToken(nonce),
        });
        return;
      }
      if (req.body.grant_type === 'refresh_token') {
        res.json({
          token_type: 'Bearer',
          expires_in: 3600,
          access_token: 'upstream_access_2',
          refresh_token: 'upstream_refresh_2',
          scope: 'openid email profile',
          id_token: await createIdToken(),
        });
        return;
      }
      res.status(400).json({ error: 'unsupported_grant_type' });
    });
    issuerApp.get('/issuer/userinfo', (_req, res) => {
      res.json({ sub: 'user_1', preferredUsername: 'vault-user' });
    });

    const server = http.createServer(issuerApp);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to determine issuer address.');
    }
    issuerServer = server;
    issuerBaseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    __resetProviderClientCachesForTests();
  });

  afterAll(async () => {
    if (issuerServer) {
      await new Promise<void>((resolve, reject) => {
        issuerServer?.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  const buildApp = (
    transport: 'body' | 'cookie',
  ): { app: express.Express; store: ReturnType<typeof createMemoryOidcVaultStore> } => {
    const app = express();
    const store = createMemoryOidcVaultStore();
    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin: BACKEND_ORIGIN,
        config: { issuer: `${issuerBaseUrl}/issuer`, clientId: 'client_1', clientSecret: 'secret_1' }, // pragma: allowlist secret
        frontendRedirectUri: `${FRONTEND_ORIGIN}/callback`,
        postLogoutRedirectUri: `${FRONTEND_ORIGIN}/logged-out`,
        sessionTransport: transport,
        ...(transport === 'cookie' ? { trustedOrigins: [FRONTEND_ORIGIN] } : {}),
        storeProvider: store,
        tokenIssuer: {
          async issue({ session }) {
            return { accessToken: `local:${session.sessionId}`, expiresIn: 900, tokenType: 'Bearer' };
          },
        },
      }),
    );
    return { app, store };
  };

  const cookieHeader = (res: request.Response, name = 'oidc_vault_session'): string | undefined => {
    const setCookie = res.headers['set-cookie'] as unknown as string[] | undefined;
    const match = setCookie?.find((entry) => entry.startsWith(`${name}=`));
    if (!match) {
      return undefined;
    }
    return match.split(';')[0];
  };

  for (const transport of ['body', 'cookie'] as const) {
    it(`sets no-store on success/error/redirect responses with ${transport} transport`, async () => {
      const { app } = buildApp(transport);

      // Login redirect (credential-bearing: state/nonce/PKCE transaction).
      const loginResponse = await request(app).get('/auth/oidc/login');
      expect(loginResponse.status).toBe(302);
      expectNoStore(loginResponse);
      expect(new URL(loginResponse.headers.location as string).origin).toBe(issuerBaseUrl);

      const authorizationUrl = new URL(loginResponse.headers.location as string);
      const state = authorizationUrl.searchParams.get('state') as string;
      const nonce = authorizationUrl.searchParams.get('nonce') as string;

      // Callback success redirect (credential-bearing: one-time exchange code).
      const callbackResponse = await request(app)
        .get('/auth/oidc/callback')
        .query({ state, code: `authcode:${nonce}` });
      expect(callbackResponse.status).toBe(302);
      expectNoStore(callbackResponse);
      const frontendUrl = new URL(callbackResponse.headers.location as string);
      expect(frontendUrl.origin).toBe(FRONTEND_ORIGIN);
      const exchangeCode = frontendUrl.searchParams.get('code') as string;
      expect(exchangeCode).toBeTruthy();

      // Exchange success JSON (credential-bearing: session/access credential).
      const exchangeResponse = await request(app).post('/auth/oidc/exchange').send({ code: exchangeCode });
      expect(exchangeResponse.status).toBe(200);
      expectNoStore(exchangeResponse);
      // Policy change adds no credential to JSON: upstream tokens never leak.
      expect(JSON.stringify(exchangeResponse.body)).not.toContain('upstream_refresh_1');
      expect(JSON.stringify(exchangeResponse.body)).not.toContain('upstream_access_1');
      expect(exchangeResponse.body.refreshToken).toBeUndefined();
      expect(exchangeResponse.body.idToken).toBeUndefined();
      if (transport === 'body') {
        expect(exchangeResponse.body.sessionId).toMatch(/^sess_/);
      } else {
        expect(exchangeResponse.body.sessionId).toBeUndefined();
        expect(cookieHeader(exchangeResponse)).toMatch(/^oidc_vault_session=sess_/);
      }

      const sessionCookie = transport === 'cookie' ? cookieHeader(exchangeResponse) : undefined;

      // Resolve the live session id for refresh/logout per transport.
      let liveSessionId: string;
      if (transport === 'body') {
        liveSessionId = exchangeResponse.body.sessionId as string;
      } else {
        // Read the session id back from the Set-Cookie value.
        const raw = cookieHeader(exchangeResponse) as string;
        liveSessionId = decodeURIComponent(raw.split('=')[1] ?? '');
      }

      // Refresh success JSON (credential-bearing: rotated session credential).
      const refreshRequest =
        transport === 'body'
          ? request(app).post('/auth/oidc/refresh').send({ sessionId: liveSessionId })
          : request(app)
              .post('/auth/oidc/refresh')
              .set('Origin', FRONTEND_ORIGIN)
              .set('Cookie', sessionCookie as string)
              .send({});
      const refreshResponse = await refreshRequest;
      expect(refreshResponse.status).toBe(200);
      expectNoStore(refreshResponse);
      expect(JSON.stringify(refreshResponse.body)).not.toContain('upstream_refresh_2');
      if (transport === 'cookie') {
        expect(cookieHeader(refreshResponse)).toMatch(/^oidc_vault_session=sess_/);
      }
      const rotatedSessionId =
        transport === 'body'
          ? (refreshResponse.body.sessionId as string)
          : decodeURIComponent((cookieHeader(refreshResponse) as string).split('=')[1] ?? '');

      // Redirected logout (credential-bearing: id_token_hint navigation).
      // Provider logout navigation still works: 302 to the upstream
      // end-session endpoint with the hint and post-logout URL intact.
      const logoutRequest =
        transport === 'body'
          ? request(app).post('/auth/oidc/logout').send({ sessionId: rotatedSessionId, redirect: true })
          : request(app)
              .post('/auth/oidc/logout')
              .set('Origin', FRONTEND_ORIGIN)
              .set('Cookie', (cookieHeader(refreshResponse) as string) ?? (sessionCookie as string))
              .send({ redirect: true });
      const logoutRedirect = await logoutRequest;
      expect(logoutRedirect.status).toBe(302);
      expectNoStore(logoutRedirect);
      const logoutUrl = new URL(logoutRedirect.headers.location as string);
      expect(logoutUrl.origin).toBe(issuerBaseUrl);
      expect(logoutUrl.pathname).toBe('/issuer/logout');
      expect(logoutUrl.searchParams.get('id_token_hint')).toBeTruthy();
      expect(logoutUrl.searchParams.get('post_logout_redirect_uri')).toBe(`${FRONTEND_ORIGIN}/logged-out`);

      // Error paths share the same no-store contract.
      const callbackError = await request(app)
        .get('/auth/oidc/callback')
        .query({ state: 'unknown-state', code: 'authcode:x' });
      expect(callbackError.status).toBe(400);
      expectNoStore(callbackError);

      const exchangeError = await request(app).post('/auth/oidc/exchange').send({ code: 'code_unknown' });
      expect(exchangeError.status).toBe(400);
      expectNoStore(exchangeError);

      const refreshError =
        transport === 'body'
          ? await request(app).post('/auth/oidc/refresh').send({ sessionId: 'sess_unknown' })
          : await request(app)
              .post('/auth/oidc/refresh')
              .set('Origin', FRONTEND_ORIGIN)
              .set('Cookie', 'oidc_vault_session=sess_unknown')
              .send({});
      expect(refreshError.status).toBe(401);
      expectNoStore(refreshError);

      // Malformed JSON body (body-parser error path) shares the contract.
      const malformed = await request(app)
        .post('/auth/oidc/exchange')
        .set('Content-Type', 'application/json')
        .send('{"code": }');
      expect(malformed.status).toBe(400);
      expectNoStore(malformed);

      // Backchannel validation error (alternate path) shares the contract.
      const backchannelError = await request(app).post('/auth/oidc/backchannel-logout').send({});
      expect(backchannelError.status).toBe(400);
      expectNoStore(backchannelError);
    });

    it(`keeps no-store on local logout JSON and backchannel success with ${transport} transport`, async () => {
      const { app, store } = buildApp(transport);
      await store.createSession({
        sessionId: `sess_bov16_${transport}`,
        subject: 'user_1',
        refreshToken: 'upstream_refresh_1',
        idToken: 'stored-id-token',
        providerSessionId: `provider_sid_bov16_${transport}`,
        provider: { issuer: `${issuerBaseUrl}/issuer`, clientId: 'client_1' },
      });

      const localLogout =
        transport === 'body'
          ? await request(app)
              .post('/auth/oidc/logout')
              .send({ sessionId: `sess_bov16_${transport}` })
          : await request(app)
              .post('/auth/oidc/logout')
              .set('Origin', FRONTEND_ORIGIN)
              .set('Cookie', `oidc_vault_session=sess_bov16_${transport}`)
              .send({});
      expect(localLogout.status).toBe(200);
      expectNoStore(localLogout);
      expect(localLogout.body).toMatchObject({ loggedOut: true });

      // Backchannel success revokes by provider sid and stays no-store.
      await store.createSession({
        sessionId: `sess_bov16_bc_${transport}`,
        subject: 'user_1',
        refreshToken: 'upstream_refresh_1',
        idToken: 'stored-id-token',
        providerSessionId: `provider_sid_bov16_${transport}`,
        provider: { issuer: `${issuerBaseUrl}/issuer`, clientId: 'client_1' },
      });
      const logoutToken = await createLogoutToken(`provider_sid_bov16_${transport}`);
      const backchannel = await request(app).post('/auth/oidc/backchannel-logout').send({ logout_token: logoutToken });
      expect(backchannel.status).toBe(200);
      expectNoStore(backchannel);
      expect(backchannel.body).toMatchObject({ loggedOut: true });
    });
  }
});
