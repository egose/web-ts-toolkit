import http from 'node:http';

import express from 'express';
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createMemoryOidcVaultStore } from '../../express-oidc-vault-memory-store/src/index';
import { createOidcVaultMiddleware } from '../src/index';
import { __resetProviderClientCachesForTests } from '../src/provider-client';

/**
 * BOV-02 investigation fixture: two-client (attacker/victim browser) experiment.
 *
 * Models attacker and victim as isolated cookie jars issuing HTTP requests
 * against the same backend + same upstream provider fixture. The upstream
 * authorization code encodes `authcode:<nonce>:<sub>` so each browser can
 * authenticate as a distinct upstream subject.
 *
 * Transport coverage:
 * - body transport: sessionId travels in JSON bodies.
 * - cookie transport: sessionId travels in the backend-managed HttpOnly cookie.
 *
 * Each test records whether the outcome is forced login (victim ends up
 * acting as the attacker) or token theft (attacker ends up acting as the
 * victim).
 */

type StartedServer = {
  server: http.Server;
  baseUrl: string;
};

const startServer = async (app: express.Express): Promise<StartedServer> => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to determine server address.');
  }
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

/** Minimal isolated browser: its own cookie jar, no shared state. */
const createBrowser = () => {
  let jar: string[] = [];
  const cookieHeader = (): string | undefined => (jar.length > 0 ? jar.join('; ') : undefined);
  const storeCookies = (res: request.Response): void => {
    const raw = res.headers['set-cookie'] as string[] | string | undefined;
    if (!raw) return;
    const cookies = Array.isArray(raw) ? raw : [raw];
    for (const entry of cookies) {
      const pair = entry.split(';', 1)[0]?.trim();
      if (!pair) continue;
      const name = pair.split('=', 1)[0];
      jar = jar.filter((existing) => !existing.startsWith(`${name}=`));
      // A cleared cookie (empty value with Max-Age=0) still replaces the jar entry;
      // drop it so the jar reflects an empty browser.
      if (/^[^=]+=$/.test(pair)) continue;
      jar.push(pair);
    }
  };
  return { cookieHeader, storeCookies, jar: () => [...jar] };
};

const sessionIdFromSetCookie = (res: request.Response, name = 'oidc_vault_session'): string | undefined => {
  const raw = res.headers['set-cookie'] as string[] | string | undefined;
  const cookies = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  for (const entry of cookies) {
    const pair = entry.split(';', 1)[0]?.trim() ?? '';
    if (pair.startsWith(`${name}=`)) {
      const value = decodeURIComponent(pair.slice(name.length + 1));
      return value || undefined;
    }
  }
  return undefined;
};

describe('BOV-02 browser binding across login and exchange', () => {
  const backendOrigin = 'https://api.example.com';
  const frontendOrigin = 'https://frontend.example.com';
  let issuerBaseUrl = '';
  let issuerServer: http.Server | undefined;
  let publicJwk: JWK;
  let privateKey: CryptoKey;

  const createIdToken = async (nonce: string | undefined, sub: string): Promise<string> => {
    const now = Math.floor(Date.now() / 1000);
    const payload: Record<string, unknown> = { sub, sid: `provider_sid_${sub}` };
    if (nonce) payload.nonce = nonce;
    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(`${issuerBaseUrl}/issuer`)
      .setAudience('client_1')
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(privateKey);
  };

  const parseUpstreamCode = (code: string): { nonce?: string; sub: string } => {
    // Fixture code format: authcode:<nonce>:<sub>
    const parts = code.split(':');
    return { nonce: parts[1] || undefined, sub: parts[2] || 'user_1' };
  };

  beforeAll(async () => {
    const issuerApp = express();
    issuerApp.use(express.urlencoded({ extended: false }));
    issuerApp.use(express.json());

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
      });
    });
    issuerApp.get('/issuer/jwks', (_req, res) => {
      res.json({ keys: [publicJwk] });
    });
    issuerApp.post('/issuer/token', async (req, res) => {
      if (req.body.grant_type === 'authorization_code') {
        const { nonce, sub } = parseUpstreamCode(String(req.body.code ?? ''));
        res.json({
          token_type: 'Bearer',
          expires_in: 3600,
          access_token: `upstream_access_${sub}`,
          refresh_token: `upstream_refresh_${sub}`,
          scope: 'openid email profile',
          id_token: await createIdToken(nonce, sub),
        });
        return;
      }
      if (req.body.grant_type === 'refresh_token') {
        const refreshMatch = /upstream_refresh_([A-Za-z0-9_-]+)/.exec(String(req.body.refresh_token ?? ''));
        const refreshSub = refreshMatch ? refreshMatch[1] : 'user_1';
        res.json({
          token_type: 'Bearer',
          expires_in: 3600,
          access_token: `upstream_access_${refreshSub}`,
          refresh_token: `upstream_refresh_${refreshSub}`,
          scope: 'openid email profile',
          id_token: await createIdToken(undefined, refreshSub),
        });
        return;
      }
      res.status(400).json({ error: 'unsupported_grant_type' });
    });
    issuerApp.get('/issuer/userinfo', (req, res) => {
      const authorization = req.headers.authorization ?? '';
      const match = /upstream_access_([A-Za-z0-9_-]+)/.exec(authorization);
      res.json({ sub: match ? match[1] : 'user_1' });
    });

    const started = await startServer(issuerApp);
    issuerServer = started.server;
    issuerBaseUrl = started.baseUrl;
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

  const createBodyApp = () => {
    const app = express();
    const storeProvider = createMemoryOidcVaultStore();
    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
          clientSecret: 'secret_1', // pragma: allowlist secret
        },
        frontendRedirectUri: `${frontendOrigin}/callback`,
        storeProvider,
        tokenIssuer: {
          async issue({ session }) {
            return { accessToken: `local:${session.sessionId}`, expiresIn: 900, tokenType: 'Bearer' };
          },
        },
      }),
    );
    return { app, storeProvider };
  };

  const createCookieApp = () => {
    const app = express();
    const storeProvider = createMemoryOidcVaultStore();
    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin,
        config: {
          issuer: `${issuerBaseUrl}/issuer`,
          clientId: 'client_1',
          clientSecret: 'secret_1', // pragma: allowlist secret
        },
        frontendRedirectUri: `${frontendOrigin}/callback`,
        sessionTransport: 'cookie',
        trustedOrigins: [frontendOrigin],
        storeProvider,
        tokenIssuer: {
          async issue({ session }) {
            return { accessToken: `local:${session.sessionId}`, expiresIn: 900, tokenType: 'Bearer' };
          },
        },
      }),
    );
    return { app, storeProvider };
  };

  const loginFlow = async (app: express.Express) => {
    const loginResponse = await request(app).get('/auth/oidc/login');
    expect(loginResponse.status).toBe(302);
    const authorizationUrl = new URL(loginResponse.headers.location as string);
    return {
      state: authorizationUrl.searchParams.get('state') as string,
      nonce: authorizationUrl.searchParams.get('nonce') as string,
    };
  };

  it('body transport: victim completing an attacker-initiated callback URL is force-logged in as the attacker', async () => {
    const { app } = createBodyApp();
    const attacker = createBrowser();
    const victim = createBrowser();
    void attacker;
    void victim;

    // Attacker initiates login and authenticates upstream as "attacker".
    const { state: stateA, nonce: nonceA } = await loginFlow(app);
    const attackerUpstreamCode = `authcode:${nonceA}:attacker`;
    // Attacker withholds its own callback and tricks the victim into visiting it.
    const victimCallback = await request(app)
      .get('/auth/oidc/callback')
      .query({ state: stateA, code: attackerUpstreamCode });
    expect(victimCallback.status).toBe(302);
    const frontendUrl = new URL(victimCallback.headers.location as string);
    const exchangeCode = frontendUrl.searchParams.get('code');
    expect(exchangeCode).toBeTruthy();

    // Frontend callback behavior: the victim SPA reads ?code= and POSTs it to /exchange.
    const victimExchange = await request(app).post('/auth/oidc/exchange').send({ code: exchangeCode });
    expect(victimExchange.status).toBe(200);
    expect(victimExchange.body.user).toMatchObject({ sub: 'attacker' });

    // Attacker gains no victim credential from this direction: the session
    // belongs to the attacker identity but lives in the victim browser.
    // Conclusion: forced login / login CSRF, NOT token theft.
    const replay = await request(app).get('/auth/oidc/callback').query({ state: stateA, code: attackerUpstreamCode });
    expect(replay.status).toBe(400);
    expect(replay.body.code).toBe('OIDC_VAULT_INVALID_STATE');
  });

  it('body transport: attacker redeeming an unconsumed victim exchange code steals the victim session', async () => {
    const { app } = createBodyApp();

    const { state: stateV, nonce: nonceV } = await loginFlow(app);
    const victimCallback = await request(app)
      .get('/auth/oidc/callback')
      .query({ state: stateV, code: `authcode:${nonceV}:victim` });
    expect(victimCallback.status).toBe(302);
    const victimExchangeCode = new URL(victimCallback.headers.location as string).searchParams.get('code');
    expect(victimExchangeCode).toBeTruthy();

    // Attacker intercepts the unconsumed local exchange code (history, logs,
    // referer, shoulder-surfed frontend URL) and redeems it first.
    const attackerExchange = await request(app).post('/auth/oidc/exchange').send({ code: victimExchangeCode });
    expect(attackerExchange.status).toBe(200);
    expect(attackerExchange.body.user).toMatchObject({ sub: 'victim' });
    const stolenSessionId = attackerExchange.body.sessionId as string;
    expect(stolenSessionId).toMatch(/^sess_/);

    // The legitimate victim redemption now fails: single-use code is consumed.
    const victimExchange = await request(app).post('/auth/oidc/exchange').send({ code: victimExchangeCode });
    expect(victimExchange.status).toBe(400);
    expect(victimExchange.body.code).toBe('OIDC_VAULT_INVALID_EXCHANGE_CODE');

    // Stolen sessionId is fully usable (refresh proves session theft).
    const refresh = await request(app).post('/auth/oidc/refresh').send({ sessionId: stolenSessionId });
    expect(refresh.status).toBe(200);
    // Conclusion: bearer exchange code => token theft when code leaks.
  });

  it('body transport: exchange accepts cross-origin urlencoded form posts with no Origin check', async () => {
    const { app } = createBodyApp();
    const { state, nonce } = await loginFlow(app);
    const callback = await request(app)
      .get('/auth/oidc/callback')
      .query({ state, code: `authcode:${nonce}:victim` });
    const code = new URL(callback.headers.location as string).searchParams.get('code') as string;

    // Attacker page auto-submits <form method=POST action=.../exchange> with the
    // victim (or attacker) code. No CORS preflight is needed for urlencoded
    // forms, and the package emits no CORS headers of its own.
    const formExchange = await request(app)
      .post('/auth/oidc/exchange')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set('Origin', 'https://evil.example')
      .send(`code=${encodeURIComponent(code)}`);
    expect(formExchange.status).toBe(200);
    expect(formExchange.body.user).toMatchObject({ sub: 'victim' });
    expect(formExchange.headers['access-control-allow-origin']).toBeUndefined();
    // Conclusion: application CORS cannot prevent opaque form/navigation-driven
    // forced login; only browser binding of the transaction/exchange can.
  });

  it('cookie transport: transferred callback URL force-logs the victim in as the attacker', async () => {
    const { app, storeProvider } = createCookieApp();
    const victim = createBrowser();

    const { state: stateA, nonce: nonceA } = await loginFlow(app);
    const victimCallback = await request(app)
      .get('/auth/oidc/callback')
      .query({ state: stateA, code: `authcode:${nonceA}:attacker` });
    expect(victimCallback.status).toBe(302);

    // Victim frontend redeems the attacker's exchange code; the session cookie
    // lands in the victim jar.
    const frontendCode = new URL(victimCallback.headers.location as string).searchParams.get('code') as string;
    const victimExchange = await request(app).post('/auth/oidc/exchange').send({ code: frontendCode });
    victim.storeCookies(victimExchange);
    expect(victimExchange.status).toBe(200);
    expect(victimExchange.body.sessionId).toBeUndefined();
    const sessionId = sessionIdFromSetCookie(victimExchange);
    expect(sessionId).toMatch(/^sess_/);
    const stored = await storeProvider.getSession(sessionId as string);
    expect(stored?.subject).toBe('attacker');
    expect(victim.cookieHeader()).toContain('oidc_vault_session=');
    // Conclusion: forced login under cookie transport (victim cookie jar now
    // holds the attacker session); no victim credential leaks to the attacker.
  });

  it('cookie transport: stolen exchange code mints the victim session cookie in the attacker browser', async () => {
    const { app, storeProvider } = createCookieApp();
    const attacker = createBrowser();
    const victim = createBrowser();
    void victim;

    const { state: stateV, nonce: nonceV } = await loginFlow(app);
    const victimCallback = await request(app)
      .get('/auth/oidc/callback')
      .query({ state: stateV, code: `authcode:${nonceV}:victim` });
    const victimCode = new URL(victimCallback.headers.location as string).searchParams.get('code') as string;

    // Attacker redeems the unconsumed code: victim session cookie lands in the
    // attacker jar. Credentialed fetch from the attacker browser then works.
    const attackerExchange = await request(app).post('/auth/oidc/exchange').send({ code: victimCode });
    attacker.storeCookies(attackerExchange);
    expect(attackerExchange.status).toBe(200);
    const stolenSessionId = sessionIdFromSetCookie(attackerExchange);
    expect(stolenSessionId).toMatch(/^sess_/);
    expect((await storeProvider.getSession(stolenSessionId as string))?.subject).toBe('victim');

    const attackerRefresh = await request(app)
      .post('/auth/oidc/refresh')
      .set('Origin', frontendOrigin)
      .set('Cookie', attacker.cookieHeader() ?? '')
      .send({});
    expect(attackerRefresh.status).toBe(200);
    // Conclusion: token theft under cookie transport when the code leaks.
  });

  it('cookie transport: exchange ignores untrusted Origin while refresh/logout enforce it', async () => {
    const { app } = createCookieApp();
    const browser = createBrowser();

    const { state, nonce } = await loginFlow(app);
    const callback = await request(app)
      .get('/auth/oidc/callback')
      .query({ state, code: `authcode:${nonce}:victim` });
    const code = new URL(callback.headers.location as string).searchParams.get('code') as string;

    // Origin validation is NOT a substitute for binding: exchange accepts an
    // attacker Origin, refresh/logout reject it.
    const evilExchange = await request(app)
      .post('/auth/oidc/exchange')
      .set('Origin', 'https://evil.example')
      .send({ code });
    browser.storeCookies(evilExchange);
    expect(evilExchange.status).toBe(200);

    const evilRefresh = await request(app)
      .post('/auth/oidc/refresh')
      .set('Origin', 'https://evil.example')
      .set('Cookie', browser.cookieHeader() ?? '')
      .send({});
    expect(evilRefresh.status).toBe(403);
    expect(evilRefresh.body.code).toBe('OIDC_VAULT_UNTRUSTED_ORIGIN');

    const evilLogout = await request(app)
      .post('/auth/oidc/logout')
      .set('Origin', 'https://evil.example')
      .set('Cookie', browser.cookieHeader() ?? '')
      .send({});
    expect(evilLogout.status).toBe(403);
  });
});
