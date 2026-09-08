import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createMemoryOidcVaultStore } from '../../express-oidc-vault-memory-store/src/index';
import { getSessionIdFromCookie, parseCookieHeader, parseSelectedCookieValue } from '../src/cookies';
import { OidcVaultHttpError } from '../src/errors';
import { createOidcVaultMiddleware } from '../src/index';
import type { OidcVaultOptions } from '../src/types';

const SESSION_COOKIE = 'oidc_vault_session';

const createCookieOptions = (overrides: Partial<OidcVaultOptions> = {}): OidcVaultOptions =>
  ({
    backendOrigin: 'https://api.example.com',
    sessionTransport: 'cookie',
    storeProvider: {} as OidcVaultOptions['storeProvider'],
    config: {
      issuer: 'https://issuer.example.com',
      clientId: 'client_1',
    },
    ...overrides,
  }) as OidcVaultOptions;

const fakeRequest = (cookie: string | undefined): Parameters<typeof getSessionIdFromCookie>[0] =>
  ({ headers: { cookie } }) as Parameters<typeof getSessionIdFromCookie>[0];

const createManualCookieApp = (
  storeProvider: ReturnType<typeof createMemoryOidcVaultStore>,
  overrides: Partial<OidcVaultOptions> = {},
) => {
  const app = express();

  app.use(
    createOidcVaultMiddleware({
      basePath: '/auth/oidc',
      backendOrigin: 'https://api.example.com',
      config: {
        issuer: 'https://issuer.example.com',
        clientId: 'client_1',
        authorizationEndpoint: 'https://issuer.example.com/auth',
        tokenEndpoint: 'https://issuer.example.com/token',
        jwksUri: 'https://issuer.example.com/jwks',
      },
      frontendRedirectUri: 'https://frontend.example.com/callback',
      sessionTransport: 'cookie',
      trustedOrigins: ['https://frontend.example.com'],
      storeProvider,
      ...overrides,
    } as OidcVaultOptions),
  );

  return app;
};

describe('BOV-09 parseSelectedCookieValue', () => {
  it('returns the selected value without decoding unrelated values', () => {
    expect(parseSelectedCookieValue(`analytics=%; ${SESSION_COOKIE}=sess_1`, SESSION_COOKIE)).toBe('sess_1');
  });

  it('returns undefined when the selected cookie is missing, even with malformed unrelated values', () => {
    expect(parseSelectedCookieValue('analytics=%', SESSION_COOKIE)).toBeUndefined();
    expect(parseSelectedCookieValue(undefined, SESSION_COOKIE)).toBeUndefined();
  });

  it('supports custom names and leaves decoding to the caller', () => {
    expect(parseSelectedCookieValue('custom=vault%20id; analytics=%', 'custom')).toBe('vault%20id');
  });

  it('gives the first exact-name occurrence duplicate-name priority and ignores later duplicates', () => {
    expect(parseSelectedCookieValue(`${SESSION_COOKIE}=first; ${SESSION_COOKIE}=second`, SESSION_COOKIE)).toBe('first');
  });

  it('ignores a malformed trailing duplicate when the first occurrence is valid', () => {
    expect(parseSelectedCookieValue(`${SESSION_COOKIE}=good; ${SESSION_COOKIE}=%E0%A4%A`, SESSION_COOKIE)).toBe('good');
  });

  it('keeps the malformed first occurrence so its controlled failure is preserved', () => {
    expect(parseSelectedCookieValue(`${SESSION_COOKIE}=%E0%A4%A; ${SESSION_COOKIE}=good`, SESSION_COOKIE)).toBe(
      '%E0%A4%A',
    );
  });

  it('matches names exactly and skips valueless segments', () => {
    expect(
      parseSelectedCookieValue(
        `no-value; =ignored; ${SESSION_COOKIE}X=wrong; ${SESSION_COOKIE} = sess_1 `,
        SESSION_COOKIE,
      ),
    ).toBe('sess_1');
  });
});

describe('BOV-09 getSessionIdFromCookie', () => {
  it('decodes the selected session value while tolerating malformed unrelated values', () => {
    expect(getSessionIdFromCookie(fakeRequest(`analytics=%; ${SESSION_COOKIE}=sess%201`), createCookieOptions())).toBe(
      'sess 1',
    );
  });

  it('reports a missing session when only malformed unrelated values are present', () => {
    expect(getSessionIdFromCookie(fakeRequest('analytics=%'), createCookieOptions())).toBeUndefined();
  });

  it('throws a sanitized error without raw values for a malformed selected cookie', () => {
    const raw = '%E0%A4%A';
    let error: unknown;

    try {
      getSessionIdFromCookie(fakeRequest(`${SESSION_COOKIE}=${raw}`), createCookieOptions());
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(OidcVaultHttpError);
    expect(error).toMatchObject({
      status: 400,
      code: 'OIDC_VAULT_MALFORMED_SESSION_COOKIE',
      message: 'OIDC vault session cookie is malformed.',
    });
    expect(String(error)).not.toContain(raw);
    expect(JSON.stringify(error)).not.toContain(raw);
  });

  it('resolves custom cookie names in isolation', () => {
    const options = createCookieOptions({ cookie: { name: 'custom' } });

    expect(getSessionIdFromCookie(fakeRequest(`analytics=%; custom=vault%20id`), options)).toBe('vault id');
    expect(getSessionIdFromCookie(fakeRequest('analytics=%'), options)).toBeUndefined();
  });

  it('preserves the generic parseCookieHeader controlled failure for a malformed selected value', () => {
    expect(() => parseCookieHeader(`${SESSION_COOKIE}=%E0%A4%A`)).toThrow(OidcVaultHttpError);
  });
});

describe('BOV-09 refresh/logout parser policy', () => {
  it('refresh and logout tolerate a malformed unrelated cookie when the session cookie is present', async () => {
    const storeProvider = createMemoryOidcVaultStore();
    const app = createManualCookieApp(storeProvider);
    const unknownSession = 'sess_unknown';

    for (const route of ['/refresh', '/logout'] as const) {
      const response = await request(app)
        .post(`/auth/oidc${route}`)
        .set('Origin', 'https://api.example.com')
        .set('Cookie', `analytics=%; ${SESSION_COOKIE}=${unknownSession}`)
        .send({});

      expect(response.body.code).not.toBe('OIDC_VAULT_MALFORMED_SESSION_COOKIE');
    }
  });

  it('refresh and logout report a missing session when only a malformed unrelated cookie is present', async () => {
    const storeProvider = createMemoryOidcVaultStore();
    const app = createManualCookieApp(storeProvider);

    for (const route of ['/refresh', '/logout'] as const) {
      const response = await request(app)
        .post(`/auth/oidc${route}`)
        .set('Origin', 'https://api.example.com')
        .set('Cookie', 'analytics=%')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        code: 'OIDC_VAULT_MISSING_SESSION_ID',
        message: `${route === '/refresh' ? 'Refresh' : 'Logout'} request is missing the session cookie.`,
      });
    }
  });

  it('refresh and logout return the sanitized 4xx without raw values for a malformed selected cookie', async () => {
    const storeProvider = createMemoryOidcVaultStore();
    const onError = vi.fn();
    const app = createManualCookieApp(storeProvider, { hooks: { onError } });
    const raw = '%E0%A4%A';

    for (const route of ['/refresh', '/logout'] as const) {
      const response = await request(app)
        .post(`/auth/oidc${route}`)
        .set('Origin', 'https://api.example.com')
        .set('Cookie', `${SESSION_COOKIE}=${raw}; analytics=ok`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        code: 'OIDC_VAULT_MALFORMED_SESSION_COOKIE',
        message: 'OIDC vault session cookie is malformed.',
      });
      expect(JSON.stringify(response.body)).not.toContain(raw);
      expect(JSON.stringify(response.text)).not.toContain(raw);
    }

    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('completes logout for a valid session plus a malformed unrelated cookie', async () => {
    const storeProvider = createMemoryOidcVaultStore();
    const sessionId = 'sess_valid';
    const onLogout = vi.fn();

    await storeProvider.createSession({
      sessionId,
      subject: 'user_1',
      refreshToken: 'upstream_refresh_1',
      idToken: 'id_token_1',
      provider: {
        issuer: 'https://issuer.example.com',
        clientId: 'client_1',
      },
    });

    const app = createManualCookieApp(storeProvider, { hooks: { onLogout } });

    const response = await request(app)
      .post('/auth/oidc/logout')
      .set('Origin', 'https://api.example.com')
      .set('Cookie', `analytics=%; ${SESSION_COOKIE}=${sessionId}`)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ loggedOut: true });
    expect(await storeProvider.getSession(sessionId)).toBeNull();
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('keeps body-transport isolation when the Cookie header holds a malformed vault name', async () => {
    const storeProvider = createMemoryOidcVaultStore();
    const app = express();

    app.use(
      createOidcVaultMiddleware({
        basePath: '/auth/oidc',
        backendOrigin: 'https://api.example.com',
        config: {
          issuer: 'https://issuer.example.com',
          clientId: 'client_1',
          authorizationEndpoint: 'https://issuer.example.com/auth',
          tokenEndpoint: 'https://issuer.example.com/token',
          jwksUri: 'https://issuer.example.com/jwks',
        },
        frontendRedirectUri: 'https://frontend.example.com/callback',
        storeProvider,
      } as OidcVaultOptions),
    );

    for (const route of ['/refresh', '/logout'] as const) {
      const response = await request(app)
        .post(`/auth/oidc${route}`)
        .set('Cookie', `${SESSION_COOKIE}=%E0%A4%A`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('OIDC_VAULT_MISSING_SESSION_ID');
    }
  });
});
