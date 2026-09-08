import http from 'node:http';

import express from 'express';
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMemoryOidcVaultStore } from '../../express-oidc-vault-memory-store/src/index';
import { createOidcVaultAccessTokenMiddleware, createOidcVaultMiddleware } from '../src/index';
import { __resetProviderClientCachesForTests } from '../src/provider-client';

/**
 * BOV-03 investigation fixture: end-to-end concurrent refresh semantics.
 *
 * Upstream model: single-use rotating refresh tokens with optional
 * reuse-detection family revocation. The token endpoint counts every
 * provider request (not only local issued tokens) so overlapping local
 * refreshes can be shown to fan out to N upstream calls.
 *
 * Covered evidence:
 * - overlapping body-transport refreshes (upstream count vs local issuance,
 *   family survival with reuse detection on/off, local store outcome);
 * - cookie response arrival orders with a browser jar (late-loser clear
 *   erases the winner cookie; stale retry clears);
 * - logout while local issuance is paused (refresh-session revocation vs
 *   stateless access-token validity);
 * - N-way provider request bound (3 concurrent => 3 upstream calls).
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

type RefreshFamily = { validToken: string; revoked: boolean };

describe('BOV-03 concurrent refresh semantics', () => {
  const backendOrigin = 'https://api.example.com';
  const frontendOrigin = 'https://frontend.example.com';
  let issuerBaseUrl = '';
  let issuerServer: http.Server | undefined;
  let publicJwk: JWK;
  let privateKey: CryptoKey;

  // Upstream single-use fixture state, reset per test.
  let refreshRequestTokens: string[] = [];
  let tokenToFamily = new Map<string, string>();
  let families = new Map<string, RefreshFamily>();
  let refreshSequence = 0;
  let reuseDetectionEnabled = true;
  // When true, the fixture models permissive providers that accept refresh
  // token reuse (today's index.test.ts behavior). When false it enforces
  // single-use tokens with optional reuse-detection family revocation.
  let permissiveReuse = false;
  // Barrier: when gateSize > 0, the first (gateSize-1) upstream refresh
  // arrivals wait until the last one arrives, forcing overlap.
  let gateSize = 0;
  let gateArrivals = 0;
  let gateRelease: (() => void) | undefined;
  let gatePromise: Promise<void> = Promise.resolve();

  const createIdToken = async (): Promise<string> => {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ sub: 'user_1', sid: 'provider_sid_1' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(`${issuerBaseUrl}/issuer`)
      .setAudience('client_1')
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(privateKey);
  };

  const resetUpstream = (options?: {
    reuseDetection?: boolean;
    gateSize?: number;
    permissiveReuse?: boolean;
  }): void => {
    refreshRequestTokens = [];
    tokenToFamily = new Map([['upstream_refresh_1', 'fam1']]);
    families = new Map([['fam1', { validToken: 'upstream_refresh_1', revoked: false }]]);
    refreshSequence = 0;
    reuseDetectionEnabled = options?.reuseDetection ?? true;
    permissiveReuse = options?.permissiveReuse ?? false;
    gateSize = options?.gateSize ?? 0;
    gateArrivals = 0;
    gatePromise = new Promise<void>((resolve) => {
      gateRelease = resolve;
    });
    if (gateSize === 0) {
      gateRelease?.();
    }
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
      if (req.body.grant_type !== 'refresh_token') {
        res.status(400).json({ error: 'unsupported_grant_type' });
        return;
      }
      const token = String(req.body.refresh_token ?? '');
      refreshRequestTokens.push(token);

      // Force overlap: hold early arrivals until the full gate has arrived.
      if (gateSize > 0) {
        gateArrivals += 1;
        if (gateArrivals >= gateSize) {
          gateRelease?.();
        } else {
          await gatePromise;
        }
        // Let all released arrivals race the single-use check together.
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      const familyId = tokenToFamily.get(token);
      if (!familyId) {
        res.status(400).json({ error: 'invalid_grant' });
        return;
      }
      const family = families.get(familyId);
      if (!family || family.revoked) {
        res.status(400).json({ error: 'invalid_grant' });
        return;
      }
      if (token !== family.validToken) {
        // Reuse of an already-consumed single-use token.
        if (permissiveReuse) {
          // Permissive provider: issue fresh tokens anyway (models the
          // pre-existing index.test.ts fixture and providers without
          // rotation). Local atomic rotation remains the only guard.
          refreshSequence += 1;
          const nextToken = `upstream_refresh_next_${refreshSequence}`;
          tokenToFamily.set(nextToken, familyId);
          family.validToken = nextToken;
          res.json({
            token_type: 'Bearer',
            expires_in: 3600,
            access_token: `upstream_access_${refreshSequence}`,
            refresh_token: nextToken,
            scope: 'openid email profile',
            id_token: await createIdToken(),
          });
          return;
        }
        if (reuseDetectionEnabled) {
          family.revoked = true;
        }
        res.status(400).json({ error: 'invalid_grant' });
        return;
      }
      refreshSequence += 1;
      const nextToken = `upstream_refresh_next_${refreshSequence}`;
      tokenToFamily.set(nextToken, familyId);
      family.validToken = nextToken;
      res.json({
        token_type: 'Bearer',
        expires_in: 3600,
        access_token: `upstream_access_${refreshSequence}`,
        refresh_token: nextToken,
        scope: 'openid email profile',
        id_token: await createIdToken(),
      });
    });
    issuerApp.get('/issuer/userinfo', (_req, res) => {
      res.json({ sub: 'user_1' });
    });

    const started = await startServer(issuerApp);
    issuerServer = started.server;
    issuerBaseUrl = started.baseUrl;
  });

  beforeEach(() => {
    __resetProviderClientCachesForTests();
    resetUpstream();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    if (issuerServer) {
      await new Promise<void>((resolve, reject) => {
        issuerServer?.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  const baseMiddlewareOptions = (storeProvider: ReturnType<typeof createMemoryOidcVaultStore>) => ({
    basePath: '/auth/oidc' as const,
    backendOrigin,
    config: {
      issuer: `${issuerBaseUrl}/issuer`,
      clientId: 'client_1',
      clientSecret: 'secret_1', // pragma: allowlist secret
    },
    frontendRedirectUri: `${frontendOrigin}/callback`,
    storeProvider,
    fetchUserInfo: false as const,
  });

  const seedSession = async (
    storeProvider: ReturnType<typeof createMemoryOidcVaultStore>,
    sessionId: string,
  ): Promise<void> => {
    await storeProvider.createSession({
      sessionId,
      subject: 'user_1',
      refreshToken: 'upstream_refresh_1',
      idToken: await createIdToken(),
      provider: { issuer: `${issuerBaseUrl}/issuer`, clientId: 'client_1' },
    });
  };

  /** Minimal browser jar: last Set-Cookie write wins, clears drop the entry. */
  const createJar = () => {
    let jar: string[] = [];
    const apply = (res: request.Response): void => {
      const raw = res.headers['set-cookie'] as string[] | string | undefined;
      if (!raw) return;
      const cookies = Array.isArray(raw) ? raw : [raw];
      for (const entry of cookies) {
        const pair = entry.split(';', 1)[0]?.trim();
        if (!pair) continue;
        const name = pair.split('=', 1)[0];
        jar = jar.filter((existing) => !existing.startsWith(`${name}=`));
        if (/^[^=]+=$/.test(pair)) continue;
        jar.push(pair);
      }
    };
    const header = (): string | undefined => (jar.length > 0 ? jar.join('; ') : undefined);
    return { apply, header, entries: () => [...jar] };
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

  it('overlapping refreshes send two upstream single-use requests; reuse detection revokes the family', async () => {
    resetUpstream({ reuseDetection: true, gateSize: 2 });
    const app = express();
    const storeProvider = createMemoryOidcVaultStore();
    const issuedTokens: string[] = [];
    await seedSession(storeProvider, 'sess_bov03_reuse');

    app.use(
      createOidcVaultMiddleware({
        ...baseMiddlewareOptions(storeProvider),
        tokenIssuer: {
          async issue({ session }) {
            const token = `local:${session.sessionId}`;
            issuedTokens.push(token);
            return { accessToken: token, expiresIn: 900, tokenType: 'Bearer' };
          },
        },
      }),
    );

    const responses = await Promise.all([
      request(app).post('/auth/oidc/refresh').send({ sessionId: 'sess_bov03_reuse' }),
      request(app).post('/auth/oidc/refresh').send({ sessionId: 'sess_bov03_reuse' }),
    ]);

    // Both overlapping requests submitted the same current refresh token.
    expect(refreshRequestTokens).toEqual(['upstream_refresh_1', 'upstream_refresh_1']);
    // The second upstream call reuses the consumed single-use token, so the
    // loser surfaces an upstream failure (502), never reaching local
    // rotation. Local issuance is still bounded to one token.
    expect(responses.map((response) => response.status).sort()).toEqual([200, 502]);
    expect(responses.find((response) => response.status === 502)?.body.code).toBe('OIDC_VAULT_TOKEN_REQUEST_FAILED');
    expect(issuedTokens).toHaveLength(1);

    // Reuse detection killed the whole family: the winner's fresh upstream
    // token is dead on next use even though the local session looks live.
    const winner = responses.find((response) => response.status === 200);
    expect(winner).toBeDefined();
    const winnerSessionId = winner?.body.sessionId as string;
    const winnerSession = await storeProvider.getSession(winnerSessionId);
    expect(winnerSession).not.toBeNull();
    expect(winnerSession?.refreshToken).toMatch(/^upstream_refresh_next_/);

    const nextRefresh = await request(app).post('/auth/oidc/refresh').send({ sessionId: winnerSessionId });
    expect(nextRefresh.status).toBe(502);
    expect(refreshRequestTokens).toHaveLength(3);
    expect(families.get('fam1')?.revoked).toBe(true);
  });

  it('without reuse detection the winner family survives; provider variance cannot be assumed away', async () => {
    resetUpstream({ reuseDetection: false, gateSize: 2 });
    const app = express();
    const storeProvider = createMemoryOidcVaultStore();
    await seedSession(storeProvider, 'sess_bov03_no_revoke');

    app.use(
      createOidcVaultMiddleware({
        ...baseMiddlewareOptions(storeProvider),
        tokenIssuer: {
          async issue({ session }) {
            return { accessToken: `local:${session.sessionId}`, expiresIn: 900, tokenType: 'Bearer' };
          },
        },
      }),
    );

    const responses = await Promise.all([
      request(app).post('/auth/oidc/refresh').send({ sessionId: 'sess_bov03_no_revoke' }),
      request(app).post('/auth/oidc/refresh').send({ sessionId: 'sess_bov03_no_revoke' }),
    ]);

    expect(refreshRequestTokens).toEqual(['upstream_refresh_1', 'upstream_refresh_1']);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 502]);
    expect(families.get('fam1')?.revoked).toBe(false);

    const winnerSessionId = responses.find((r) => r.status === 200)?.body.sessionId as string;
    const nextRefresh = await request(app).post('/auth/oidc/refresh').send({ sessionId: winnerSessionId });
    // Permissive provider accepts the winner token again: family survived.
    expect(nextRefresh.status).toBe(200);
  });

  it('three overlapping refreshes send three upstream requests for one local rotation', async () => {
    resetUpstream({ reuseDetection: false, gateSize: 3 });
    const app = express();
    const storeProvider = createMemoryOidcVaultStore();
    const issuedTokens: string[] = [];
    await seedSession(storeProvider, 'sess_bov03_bound');

    app.use(
      createOidcVaultMiddleware({
        ...baseMiddlewareOptions(storeProvider),
        tokenIssuer: {
          async issue({ session }) {
            const token = `local:${session.sessionId}`;
            issuedTokens.push(token);
            return { accessToken: token, expiresIn: 900, tokenType: 'Bearer' };
          },
        },
      }),
    );

    const responses = await Promise.all([
      request(app).post('/auth/oidc/refresh').send({ sessionId: 'sess_bov03_bound' }),
      request(app).post('/auth/oidc/refresh').send({ sessionId: 'sess_bov03_bound' }),
      request(app).post('/auth/oidc/refresh').send({ sessionId: 'sess_bov03_bound' }),
    ]);

    // Provider request bound today equals the concurrency degree.
    expect(refreshRequestTokens).toHaveLength(3);
    expect(refreshRequestTokens.every((token) => token === 'upstream_refresh_1')).toBe(true);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 502, 502]);
    expect(issuedTokens).toHaveLength(1);
  });

  it('cookie arrival order decides the jar: late loser clear erases the winner session cookie', async () => {
    // Permissive upstream (reuse accepted) so both requests pass the
    // provider and the loser reaches the local rotate-conflict path that
    // clears the session cookie (src/index.ts:695-701). The strict
    // single-use tests above show the alternate loser outcome (502 with no
    // Set-Cookie at all).
    resetUpstream({ reuseDetection: false, gateSize: 2, permissiveReuse: true });
    const app = express();
    const storeProvider = createMemoryOidcVaultStore();
    await seedSession(storeProvider, 'sess_bov03_cookie');

    app.use(
      createOidcVaultMiddleware({
        ...baseMiddlewareOptions(storeProvider),
        sessionTransport: 'cookie',
        trustedOrigins: [frontendOrigin],
        tokenIssuer: {
          async issue({ session }) {
            return { accessToken: `local:${session.sessionId}`, expiresIn: 900, tokenType: 'Bearer' };
          },
        },
      }),
    );

    const cookie = 'oidc_vault_session=sess_bov03_cookie';
    const responses = await Promise.all([
      request(app).post('/auth/oidc/refresh').set('Origin', backendOrigin).set('Cookie', cookie).send({}),
      request(app).post('/auth/oidc/refresh').set('Origin', backendOrigin).set('Cookie', cookie).send({}),
    ]);

    expect(responses.map((r) => r.status).sort()).toEqual([200, 401]);
    const winner = responses.find((r) => r.status === 200) as request.Response;
    const loser = responses.find((r) => r.status === 401) as request.Response;
    const winnerSessionId = sessionIdFromSetCookie(winner);
    expect(winnerSessionId).toMatch(/^sess_/);
    // Loser carries a stale-request clear.
    expect(loser.headers['set-cookie']).toBeDefined();
    expect(sessionIdFromSetCookie(loser)).toBeUndefined();
    // Winner session is live in the store regardless of cookie outcome.
    expect(await storeProvider.getSession(winnerSessionId as string)).not.toBeNull();

    // Arrival order 1: winner then loser -> jar ends empty despite live session.
    const jarLateLoser = createJar();
    jarLateLoser.apply(winner);
    jarLateLoser.apply(loser);
    expect(jarLateLoser.header()).toBeUndefined();

    // Arrival order 2: loser then winner -> jar holds the winner session.
    const jarLateWinner = createJar();
    jarLateWinner.apply(loser);
    jarLateWinner.apply(winner);
    expect(jarLateWinner.header()).toContain(`oidc_vault_session=${winnerSessionId}`);

    // A genuinely stale retry of the consumed session also clears the cookie.
    const stale = await request(app)
      .post('/auth/oidc/refresh')
      .set('Origin', backendOrigin)
      .set('Cookie', cookie)
      .send({});
    expect(stale.status).toBe(401);
    expect(stale.headers['set-cookie']).toBeDefined();
  });

  it('logout during paused issuance still yields a 200 refresh whose stateless access token validates', async () => {
    resetUpstream({ reuseDetection: false, gateSize: 0 });
    const app = express();
    const baseStore = createMemoryOidcVaultStore();
    await seedSession(baseStore, 'sess_bov03_logout_race');

    let releaseRotationStarted: (() => void) | undefined;
    const rotationStarted = new Promise<void>((resolve) => {
      releaseRotationStarted = resolve;
    });
    let releaseIssuance: (() => void) | undefined;
    const issuanceGate = new Promise<void>((resolve) => {
      releaseIssuance = resolve;
    });
    let issuedAccessToken = '';

    app.use(
      createOidcVaultMiddleware({
        ...baseMiddlewareOptions({
          ...baseStore,
          createAuthorizationTransaction: baseStore.createAuthorizationTransaction.bind(baseStore),
          consumeAuthorizationTransaction: baseStore.consumeAuthorizationTransaction.bind(baseStore),
          createExchangeCode: baseStore.createExchangeCode.bind(baseStore),
          consumeExchangeCode: baseStore.consumeExchangeCode.bind(baseStore),
          createSession: baseStore.createSession.bind(baseStore),
          getSession: baseStore.getSession.bind(baseStore),
          rotateSession: async (input) => {
            const rotated = await baseStore.rotateSession(input);
            releaseRotationStarted?.();
            return rotated;
          },
          deleteSession: baseStore.deleteSession.bind(baseStore),
          deleteSessionsByLogicalSessionId: baseStore.deleteSessionsByLogicalSessionId.bind(baseStore),
          consumeBackchannelLogoutTokenJti: baseStore.consumeBackchannelLogoutTokenJti.bind(baseStore),
          deleteSessionsBySubject: baseStore.deleteSessionsBySubject.bind(baseStore),
          deleteSessionsByProviderSessionId: baseStore.deleteSessionsByProviderSessionId.bind(baseStore),
        } as ReturnType<typeof createMemoryOidcVaultStore>),
        tokenIssuer: {
          async issue({ session }) {
            if (session.sessionId !== 'sess_bov03_logout_race') {
              await issuanceGate;
            }
            issuedAccessToken = `local:${session.sessionId}`;
            return { accessToken: issuedAccessToken, expiresIn: 900, tokenType: 'Bearer' };
          },
        },
      }),
    );

    // NOTE: .then() starts the supertest request; awaiting rotationStarted
    // before the request fires would deadlock.
    const refreshPromise = request(app)
      .post('/auth/oidc/refresh')
      .send({ sessionId: 'sess_bov03_logout_race' })
      .then((response) => response);
    await rotationStarted;
    const logoutResponse = await request(app).post('/auth/oidc/logout').send({ sessionId: 'sess_bov03_logout_race' });
    releaseIssuance?.();
    const refreshResponse = await refreshPromise;

    expect(logoutResponse.status).toBe(200);
    // Matches the existing race test: refresh issuance completes 200 even
    // though logout already revoked the logical lineage.
    expect(refreshResponse.status).toBe(200);
    expect(await baseStore.getSession(refreshResponse.body.sessionId as string)).toBeNull();

    // The issued access token is stateless: a generic validator that does not
    // consult session state still accepts it after logout. Refresh-session
    // revocation is therefore NOT access-token invalidation.
    const api = express();
    api.get(
      '/api/me',
      createOidcVaultAccessTokenMiddleware({
        validator: {
          async validate(token: string) {
            if (token.startsWith('local:')) {
              return { subject: 'user_1', sessionId: token.slice('local:'.length) };
            }
            throw new Error('invalid');
          },
        },
      }),
      (_req, res) => {
        res.status(200).json({ ok: true });
      },
    );
    const apiResponse = await request(api).get('/api/me').set('Authorization', `Bearer ${issuedAccessToken}`);
    expect(apiResponse.status).toBe(200);
  });
});
