import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMemoryOidcVaultStore } from '../../express-oidc-vault-memory-store/src/index';
import { createOidcVaultMiddleware, type OidcVaultOptions } from '../src/index';
import { OidcVaultHttpError } from '../src/errors';

const BACKEND = 'https://api.example.com';
const FRONTEND = 'https://frontend.example.com';
const ERROR_TARGET = 'https://help.example.net/sign-in-error?locale=en';
const BASE_PATH = '/auth/oidc';
const INVALID_STATE = { code: 'OIDC_VAULT_INVALID_STATE', message: 'OIDC state is invalid or expired.' };

const optionsFor = (overrides: Partial<OidcVaultOptions> = {}): OidcVaultOptions => ({
  backendOrigin: BACKEND,
  frontendRedirectUri: `${FRONTEND}/callback`,
  frontendErrorRedirectUri: ERROR_TARGET,
  config: {
    issuer: 'https://issuer.example.com',
    clientId: 'client_1',
    authorizationEndpoint: 'https://issuer.example.com/authorize',
    tokenEndpoint: 'https://issuer.example.com/token',
    jwksUri: 'https://issuer.example.com/jwks',
  },
  storeProvider: createMemoryOidcVaultStore(),
  ...overrides,
});

const appFor = (options: OidcVaultOptions) => {
  const app = express();
  app.use(createOidcVaultMiddleware(options));
  return app;
};

const expectRedirect = (response: request.Response, payload = INVALID_STATE, target = ERROR_TARGET) => {
  expect(response.status).toBe(302);
  expect(response.text).toBe('');
  const expected = new URL(target);
  expected.searchParams.set('error', payload.code);
  expected.searchParams.set('error_description', payload.message);
  expect(response.headers.location).toBe(expected.href);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['referrer-policy']).toBe('no-referrer');
  expect(response.headers['www-authenticate']).toBeUndefined();
  expect(response.headers['dpop-nonce']).toBeUndefined();
};

afterEach(() => vi.restoreAllMocks());

describe('FER-02 frontend error redirect option', () => {
  it('rejects a relative error destination at construction', () => {
    expect(() => createOidcVaultMiddleware(optionsFor({ frontendErrorRedirectUri: '/sign-in-error' }))).toThrow(
      /frontendErrorRedirectUri/,
    );
  });

  it('rejects a normalized backend callback loop at construction', () => {
    expect(() =>
      createOidcVaultMiddleware(
        optionsFor({
          basePath: '///Vault/Auth///',
          frontendErrorRedirectUri: 'https://API.EXAMPLE.COM:443/Vault/Auth/x/../CALLBACK/?view=error',
        }),
      ),
    ).toThrow(/frontendErrorRedirectUri/);
  });

  it('redirects opted-in HTML callback failures to the fixed configured destination', async () => {
    const app = appFor(optionsFor());
    const response = await request(app)
      .get(`${BASE_PATH}/callback`)
      .set('Accept', 'text/html')
      .query({ code: 'private-provider-code', state: 'unknown-state' });
    expectRedirect(response);
  });

  it.each([
    '',
    '//help.example.net/error',
    'not-a-url',
    'https://',
    'https:/help.example.net/error',
    'javascript:alert(1)',
    'ftp://help.example.net/error',
    ' https://help.example.net/error',
    'https://help.example.net/with space',
    'https://help.example.net/with\ttab',
    'https://help.example.net/with\nnewline',
    'https://help.example.net/with\u0000control',
    'https://help.example.net/with\u007fcontrol',
    'https://help.example.net/with\u0085control',
    'https://help.example.net/with\\backslash',
    'https://user:password@help.example.net/error', // pragma: allowlist secret
    'https://@help.example.net/error',
    'https:////@help.example.net/error',
    'https:////:@help.example.net/error',
    'https://help.example.net/error#',
    'https://help.example.net/error#fragment',
    null,
    42,
    {},
  ])('rejects invalid error destination %j at construction', (value) => {
    expect(() => createOidcVaultMiddleware(optionsFor({ frontendErrorRedirectUri: value as string }))).toThrow(
      /frontendErrorRedirectUri/,
    );
  });

  it.each([
    'code',
    'state',
    'sessionId',
    'session_id',
    'access_token',
    'accessToken',
    'refresh_token',
    'refreshToken',
    'id_token',
    'idToken',
    'id_token_hint',
    '%63ode',
    'STATE',
    'SeSsIoNiD',
  ])('rejects decoded case-insensitive reserved query name %s, including empty values', (name) => {
    for (const suffix of ['', '=', '=old']) {
      expect(() =>
        createOidcVaultMiddleware(optionsFor({ frontendErrorRedirectUri: `${ERROR_TARGET}&${name}${suffix}` })),
      ).toThrow(/frontendErrorRedirectUri/);
    }
  });

  it('accepts inclusive raw/canonical URI bounds and rejects either overflow', () => {
    const prefix = 'https://help.example.net/error?hint=';
    const asciiBoundary = prefix + 'a'.repeat(2048 - Buffer.byteLength(prefix));
    const unicodeBoundary = prefix + 'é' + 'a'.repeat(2048 - Buffer.byteLength(prefix) - 6);
    expect(Buffer.byteLength(asciiBoundary)).toBe(2048);
    expect(Buffer.byteLength(new URL(unicodeBoundary).href)).toBe(2048);
    for (const value of [asciiBoundary, unicodeBoundary]) {
      expect(() => createOidcVaultMiddleware(optionsFor({ frontendErrorRedirectUri: value }))).not.toThrow();
      expect(() => createOidcVaultMiddleware(optionsFor({ frontendErrorRedirectUri: value + 'a' }))).toThrow(
        /frontendErrorRedirectUri/,
      );
    }
    const canonicalOverflow = prefix + 'é'.repeat(400);
    expect(Buffer.byteLength(canonicalOverflow)).toBeLessThan(2048);
    expect(() => createOidcVaultMiddleware(optionsFor({ frontendErrorRedirectUri: canonicalOverflow }))).toThrow(
      /frontendErrorRedirectUri/,
    );
  });

  it.each([
    `${BACKEND}${BASE_PATH}/callback`,
    `${BACKEND}${BASE_PATH}/CALLBACK/`,
    `https://API.EXAMPLE.COM:443${BASE_PATH}/x/../callback?view=error`,
  ])('rejects callback loop %s', (target) => {
    expect(() => createOidcVaultMiddleware(optionsFor({ frontendErrorRedirectUri: target }))).toThrow(
      /frontendErrorRedirectUri/,
    );
  });

  it.each([
    'http://help.example.net/Error%23Page?locale=en&locale=fr',
    `${BACKEND}${BASE_PATH}/callback-help`,
    `https://other.example.net${BASE_PATH}/callback`,
    `${BACKEND}${BASE_PATH}/%63allback`, // No recursive decoding/guessed proxy aliases.
  ])('preserves accepted independent destinations %s without requiring a success default', async (target) => {
    const app = appFor(optionsFor({ frontendRedirectUri: undefined, frontendErrorRedirectUri: target }));
    expectRedirect(
      await request(app).get(`${BASE_PATH}/callback?code=private&state=unknown`).set('Accept', 'text/html'),
      INVALID_STATE,
      target,
    );
    const exchange = await request(app).post(`${BASE_PATH}/exchange`).set('Origin', new URL(target).origin).send({});
    expect(exchange.status).not.toBe(302);
  });

  it('captures an option getter exactly once and does not normalize or mutate frozen caller data', async () => {
    const options = optionsFor();
    const read = vi.fn(() => (read.mock.calls.length === 1 ? 'https://help.example.net' : '/invalid-reread'));
    Object.defineProperty(options, 'frontendErrorRedirectUri', { get: read, enumerable: true });
    Object.freeze(options);
    const app = appFor(options);
    expect(read).toHaveBeenCalledTimes(1);
    expectRedirect(
      await request(app).get(`${BASE_PATH}/callback?code=private&state=unknown`).set('Accept', 'text/html'),
      INVALID_STATE,
      'https://help.example.net/',
    );
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('does not add an independent error origin to trusted cookie request sources', async () => {
    const options = optionsFor({ sessionTransport: 'cookie', trustedOrigins: [FRONTEND] });
    await options.storeProvider.createSession({
      sessionId: 'established',
      subject: 'user',
      refreshToken: 'private-refresh',
      idToken: 'previously-verified-id-token',
    });
    const established = await options.storeProvider.getSession('established');
    expect(established).not.toBeNull();
    const app = appFor(options);
    const response = await request(app)
      .post(`${BASE_PATH}/refresh`)
      .set('Accept', 'text/html')
      .set('Cookie', 'oidc_vault_session=established')
      .set('Origin', new URL(ERROR_TARGET).origin)
      .send({});
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('OIDC_VAULT_UNTRUSTED_ORIGIN');
    expect(response.headers.location).toBeUndefined();
    expect(await options.storeProvider.getSession('established')).toEqual(established);
  });

  it('isolates reused options and ignores post-construction destination/basePath mutation', async () => {
    const options = optionsFor({ frontendErrorRedirectUri: 'https://help.example.net' });
    const first = appFor(options);
    expect(options.frontendErrorRedirectUri).toBe('https://help.example.net');
    options.frontendErrorRedirectUri = 'https://other.example.net/error';
    const second = appFor(options);
    options.frontendErrorRedirectUri = '/invalid-later';
    options.basePath = '/changed';
    for (const [app, target] of [
      [first, 'https://help.example.net/'],
      [second, 'https://other.example.net/error'],
    ] as const) {
      expectRedirect(
        await request(app).get(`${BASE_PATH}/callback?code=private&state=unknown`).set('Accept', 'text/html'),
        INVALID_STATE,
        target,
      );
    }
  });
});

describe.each(['//', '///', '//////'])('FER-02 R1 normalized root mount %j', (basePath) => {
  it.each([`${BACKEND}/callback`, `${BACKEND}/CALLBACK/`, 'https://API.EXAMPLE.COM:443/child/../CaLlBaCk/?view=error'])(
    'rejects the actual root callback loop %s at construction',
    (target) => {
      expect(() => createOidcVaultMiddleware(optionsFor({ basePath, frontendErrorRedirectUri: target }))).toThrow(
        /frontendErrorRedirectUri/,
      );
    },
  );

  it('recovers root callback errors to a non-loop fixed page without changing wrong/missing state processing', async () => {
    const target = `${BACKEND}/callback-help?locale=en`;
    const onError = vi.fn();
    const options = optionsFor({ basePath, frontendErrorRedirectUri: target, hooks: { onError } });
    const store = options.storeProvider;
    const now = Date.now();
    const live = {
      state: 'r1-live-state',
      nonce: 'r1-live-nonce',
      pkceVerifier: 'r1-live-verifier',
      codeChallenge: 'r1-live-challenge',
      createdAt: now,
      expiresAt: now + 60_000,
    };
    await store.createAuthorizationTransaction(live);
    const read = vi.spyOn(store, 'getAuthorizationTransaction');
    const consume = vi.spyOn(store, 'consumeAuthorizationTransaction');
    const consumeMatching = vi.spyOn(store, 'consumeAuthorizationTransactionIfMatches');
    const createSession = vi.spyOn(store, 'createSession');
    const createCode = vi.spyOn(store, 'createExchangeCode');
    const revoke = vi.spyOn(store, 'deleteSessionsByLogicalSessionId');
    const fetch = vi.spyOn(globalThis, 'fetch');
    const app = appFor(options);
    app.get('/callback-help', (_req, res) => res.status(200).send('Application retry screen'));

    for (const [query, payload] of [
      [{ code: 'private-provider-code', state: 'r1-wrong-state' }, INVALID_STATE],
      [
        { code: 'private-provider-code' },
        { code: 'OIDC_VAULT_MISSING_STATE', message: 'OIDC callback is missing state.' },
      ],
    ] as const) {
      for (const accept of ['text/html', 'application/json']) {
        const response = await request(app).get('/CaLlBaCk/').query(query).set('Accept', accept);
        expect(response.headers['set-cookie']).toBeUndefined();
        if (accept === 'text/html') {
          expectRedirect(response, payload, target);
          const location = new URL(response.headers.location as string);
          const page = await request(app)
            .get(location.pathname + location.search)
            .set('Accept', 'text/html');
          expect(page.status).toBe(200);
          expect(page.text).toBe('Application retry screen');
          expect(page.headers.location).toBeUndefined();
        } else {
          expect(response.status).toBe(400);
          expect(response.body).toEqual(payload);
          expect(response.headers.location).toBeUndefined();
          expect(response.headers['cache-control']).toBe('no-store');
          expect(response.headers['referrer-policy']).toBeUndefined();
        }
        expect(onError.mock.calls.at(-1)?.[0]).toMatchObject({
          route: 'callback',
          error: { code: payload.code, clientMessage: payload.message },
        });
      }
    }

    expect(onError).toHaveBeenCalledTimes(4);
    expect(read).toHaveBeenCalledTimes(2); // Missing state fails before the store read.
    expect(read.mock.calls).toEqual([['r1-wrong-state'], ['r1-wrong-state']]);
    expect(consume).not.toHaveBeenCalled();
    expect(consumeMatching).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
    expect(createCode).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(await store.getAuthorizationTransaction(live.state)).toEqual(live);
  });
});

describe('FER-02 route error response boundary', () => {
  it.each([
    [undefined, false],
    ['', false],
    ['*/*', false],
    ['text/*', false],
    ['application/*', false],
    ['image/png', false],
    ['text/html', true],
    ['application/xhtml+xml', true],
    ['TEXT/HTML;Q=0.8, application/json;q=0.2', true],
    ['text/html, application/json', false],
    ['application/json, text/html', false],
    ['text/html;q=0.8, application/json;q=0.9', false],
    ['text/html;q=0, */*;q=1', false],
    ['text/html;q=0.5, */*;q=1', false],
    ['text/html, */*;q=0.8', true],
    ['text/html, application/*', false],
    ['text/html, application/json;q=0, */*;q=1', true],
    ['text/html;q=0, application/xhtml+xml, */*;q=0.8', true],
    ['text/html;q=bogus', false],
    ['text/html;q=1.1', false],
    ['text/html, garbage', false],
  ] as const)('uses captured Accept %j for HTML=%s', async (accept, redirect) => {
    const onError = vi.fn();
    const app = appFor(optionsFor({ hooks: { onError } }));
    const call = request(app).get(`${BASE_PATH}/callback?code=private&state=unknown`);
    if (accept !== undefined) call.set('Accept', accept);
    const response = await call;
    if (redirect) expectRedirect(response);
    else {
      expect(response.status).toBe(400);
      expect(response.body).toEqual(INVALID_STATE);
      expect(response.headers.location).toBeUndefined();
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['referrer-policy']).toBeUndefined();
    }
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('keeps JSON when omitted even with a success destination and HTML preference', async () => {
    const app = appFor(optionsFor({ frontendErrorRedirectUri: undefined }));
    const response = await request(app)
      .get(`${BASE_PATH}/callback?code=private&state=unknown`)
      .set('Accept', 'text/html');
    expect(response.status).toBe(400);
    expect(response.body).toEqual(INVALID_STATE);
    expect(response.headers.location).toBeUndefined();
  });

  it.each([
    [{}, 'OIDC_VAULT_MISSING_CODE'],
    [{ code: 'private' }, 'OIDC_VAULT_MISSING_STATE'],
    [{ error: 'private-provider-error' }, 'OIDC_VAULT_MISSING_STATE'],
  ])('presents missing callback inputs %j without store work', async (query, code) => {
    const options = optionsFor();
    const read = vi.spyOn(options.storeProvider, 'getAuthorizationTransaction');
    const consume = vi.spyOn(options.storeProvider, 'consumeAuthorizationTransaction');
    const app = appFor(options);
    const response = await request(app).get(`${BASE_PATH}/callback`).query(query).set('Accept', 'text/html');
    expect(response.status).toBe(302);
    expect(new URL(response.headers.location as string).searchParams.get('error')).toBe(code);
    expect(read).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();
  });

  it('uses registered route identity for normalized mount/case/trailing-slash aliases, never request authority', async () => {
    const target = 'https://help.example.net/ErrorScreen?locale=en&locale=fr&ERROR=old&error=old&ERROR_DESCRIPTION=old';
    const app = appFor(optionsFor({ basePath: '///Vault/Auth///', frontendErrorRedirectUri: target }));
    app.set('trust proxy', true);
    const response = await request(app)
      .get('/vAuLt/aUtH/CALLBACK/')
      .set('Accept', 'text/html')
      .set('Host', 'evil.example')
      .set('Forwarded', 'host=evil.example;proto=http')
      .set('X-Forwarded-Host', 'evil.example')
      .set('X-Forwarded-Proto', 'http')
      .query({
        state: 'private-state',
        code: 'private-code',
        error_description: 'private-message',
        returnTo: 'https://evil.example',
      });
    expect(response.status).toBe(302);
    const url = new URL(response.headers.location as string);
    expect(url.origin).toBe('https://help.example.net');
    expect(url.pathname).toBe('/ErrorScreen');
    expect([...url.searchParams]).toEqual([
      ['locale', 'en'],
      ['locale', 'fr'],
      ['error', INVALID_STATE.code],
      ['error_description', INVALID_STATE.message],
    ]);
    expect(response.headers.location).not.toMatch(/private|evil|code=/);
  });

  it.each(['head', 'post', 'put', 'patch', 'delete'] as const)(
    'does not recover %s callback requests',
    async (method) => {
      const onError = vi.fn();
      const app = appFor(optionsFor({ hooks: { onError } }));
      const client = request(app);
      const call = client[method](`${BASE_PATH}/callback?code=private&state=unknown`);
      const response = await call.set('Accept', 'text/html');
      expect(response.status).toBe(method === 'head' ? 400 : 404);
      expect(response.headers.location).toBeUndefined();
      expect(response.headers['referrer-policy']).toBeUndefined();
      expect(onError).toHaveBeenCalledTimes(method === 'head' ? 1 : 0);
    },
  );

  it('leaves callback parser failures outside route observation/recovery', async () => {
    const onError = vi.fn();
    const app = appFor(optionsFor({ hooks: { onError } }));
    const response = await request(app)
      .get(`${BASE_PATH}/callback`)
      .set('Accept', 'text/html')
      .type('json')
      .send('{broken');
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('OIDC_VAULT_MALFORMED_REQUEST_BODY');
    expect(response.headers.location).toBeUndefined();
    expect(onError).not.toHaveBeenCalled();
  });

  it('does not add a global error handler for failures before the registered callback', async () => {
    const onError = vi.fn();
    const diagnostic = new Error('upstream middleware failure');
    const app = express();
    app.use((_req, _res, next) => next(diagnostic));
    app.use(createOidcVaultMiddleware(optionsFor({ hooks: { onError } })));
    const forwarded = vi.fn();
    app.use(((error, _req, res, next) => {
      expect(next).toBeTypeOf('function');
      forwarded(error);
      res.status(503).end();
    }) as express.ErrorRequestHandler);
    const response = await request(app).get(`${BASE_PATH}/callback`).set('Accept', 'text/html');
    expect(response.status).toBe(503);
    expect(response.headers.location).toBeUndefined();
    expect(forwarded).toHaveBeenCalledWith(diagnostic);
    expect(onError).not.toHaveBeenCalled();
  });

  it.each(['exchange', 'refresh', 'logout', 'backchannel-logout'])(
    'retains %s JSON errors for HTML clients',
    async (route) => {
      const app = appFor(optionsFor());
      const response = await request(app).post(`${BASE_PATH}/${route}`).set('Accept', 'text/html').send({});
      expect(response.status).toBe(400);
      expect(response.body.code).toMatch(/^OIDC_VAULT_/);
      expect(response.headers.location).toBeUndefined();
      expect(response.headers['referrer-policy']).toBeUndefined();
    },
  );

  it.each([false, true])('captures all redirect authority before an observer mutates/throws=%s', async (throws) => {
    const options = optionsFor();
    const onError = vi.fn<NonNullable<NonNullable<OidcVaultOptions['hooks']>['onError']>>(
      async ({ req, res, error }) => {
        await Promise.resolve();
        req.method = 'POST';
        req.headers.accept = 'application/json';
        req.headers.host = 'evil.example';
        req.originalUrl = '/not-callback';
        Object.defineProperty(req, 'query', { value: { returnTo: 'https://evil.example', error: 'private' } });
        Object.assign(error as object, { status: 299, code: 'PRIVATE', clientMessage: 'private observer message' });
        options.frontendErrorRedirectUri = 'https://evil.example';
        res.setHeader('Location', 'https://evil.example');
        res.setHeader('Cache-Control', 'public');
        res.setHeader('Referrer-Policy', 'unsafe-url');
        res.setHeader('WWW-Authenticate', 'PRIVATE');
        res.setHeader('DPoP-Nonce', 'private-nonce');
        res.setHeader('Set-Cookie', 'application_cookie=preserved; HttpOnly');
        if (throws) throw new Error('private observer failure');
      },
    );
    options.hooks = { onError };
    const response = await request(appFor(options))
      .get(`${BASE_PATH}/callback?code=private&state=unknown`)
      .set('Accept', 'text/html');
    expectRedirect(response);
    expect(response.headers['set-cookie']).toEqual(['application_cookie=preserved; HttpOnly']);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('does not let observers opt an ineligible response into redirect or replace the captured error', async () => {
    const options = optionsFor({
      hooks: {
        onError({ req, error }) {
          req.method = 'GET';
          req.headers.accept = 'text/html';
          Object.assign(error as object, { status: 299, code: 'PRIVATE', clientMessage: 'private' });
        },
      },
    });
    const response = await request(appFor(options))
      .get(`${BASE_PATH}/callback?code=private&state=unknown`)
      .set('Accept', 'application/json');
    expect(response.status).toBe(400);
    expect(response.body).toEqual(INVALID_STATE);
    expect(response.headers.location).toBeUndefined();
  });

  it('finishes URL serialization before awaiting the mutable observer', async () => {
    const options = optionsFor({
      hooks: {
        async onError() {
          await Promise.resolve();
          vi.spyOn(URLSearchParams.prototype, 'set').mockImplementation(() => {
            throw new Error('observer replaced serializer');
          });
        },
      },
    });
    const response = await request(appFor(options))
      .get(`${BASE_PATH}/callback?code=private&state=unknown`)
      .set('Accept', 'text/html');
    vi.restoreAllMocks();
    expectRedirect(response);
  });

  it.each(['message', 'code', 'location', 'exception'] as const)(
    'retains original JSON/challenge on %s preparation fallback',
    async (failure) => {
      const diagnostic = new OidcVaultHttpError(
        401,
        'OIDC_VAULT_DPOP_REQUIRED',
        'private diagnostic',
        'Public message.',
      );
      if (failure === 'message') Object.assign(diagnostic, { clientMessage: '😀'.repeat(128) + 'a' });
      if (failure === 'code') Object.assign(diagnostic, { code: 'C'.repeat(129) });
      const originalPayload = { code: diagnostic.code, message: diagnostic.clientMessage };
      const onError = vi.fn<NonNullable<NonNullable<OidcVaultOptions['hooks']>['onError']>>(({ error, req, res }) => {
        expect(error).toBe(diagnostic);
        Object.assign(error as object, { status: 299, code: 'PRIVATE', clientMessage: 'private observer replacement' });
        req.headers.accept = 'text/html';
        res.setHeader('Cache-Control', 'public');
        res.setHeader('WWW-Authenticate', 'PRIVATE');
        res.setHeader('DPoP-Nonce', 'private-nonce');
        throw new Error('observer failure');
      });
      const options = optionsFor({
        ...(failure === 'location'
          ? { frontendErrorRedirectUri: `https://help.example.net/error?hint=${'~'.repeat(1500)}` }
          : {}),
        hooks: { onError },
      });
      const read = vi.spyOn(options.storeProvider, 'getAuthorizationTransaction').mockRejectedValue(diagnostic);
      const consume = vi.spyOn(options.storeProvider, 'consumeAuthorizationTransactionIfMatches');
      const app = appFor(options);
      if (failure === 'exception') {
        const originalSet = URLSearchParams.prototype.set;
        vi.spyOn(URLSearchParams.prototype, 'set').mockImplementation(function (name, value) {
          if (name === 'error_description') throw new Error('private URL serializer failure');
          return originalSet.call(this, name, value);
        });
      }
      const response = await request(app)
        .get(`${BASE_PATH}/callback?code=private&state=known`)
        .set('Accept', 'text/html');
      expect(response.status).toBe(401);
      expect(response.body).toEqual(originalPayload);
      expect(response.headers.location).toBeUndefined();
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['www-authenticate']).toBe(
        failure === 'code' ? undefined : 'DPoP error="invalid_dpop_proof", algs="ES256"',
      );
      expect(response.headers['dpop-nonce']).toBeUndefined();
      expect(response.headers['referrer-policy']).toBeUndefined();
      expect(read).toHaveBeenCalledTimes(1);
      expect(consume).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0].error).toBe(diagnostic);
    },
  );

  it('forwards the original error when an observer has already sent headers, without a second response', async () => {
    const options = optionsFor();
    const diagnostic = new Error('private store failure');
    vi.spyOn(options.storeProvider, 'getAuthorizationTransaction').mockRejectedValue(diagnostic);
    const end = vi.fn();
    options.hooks = {
      onError({ res }) {
        res.status(202).end('observer sent');
        vi.spyOn(res, 'end').mockImplementation(end);
      },
    };
    const app = appFor(options);
    const forwarded = vi.fn();
    app.use(((error, req, res, next) => {
      expect(req.originalUrl).toContain(`${BASE_PATH}/callback`);
      expect(res.headersSent).toBe(true);
      expect(next).toBeTypeOf('function');
      forwarded(error);
    }) as express.ErrorRequestHandler);
    const response = await request(app)
      .get(`${BASE_PATH}/callback?code=private&state=known`)
      .set('Accept', 'text/html');
    expect(response.status).toBe(202);
    expect(response.text).toBe('observer sent');
    expect(response.headers.location).toBeUndefined();
    expect(forwarded).toHaveBeenCalledExactlyOnceWith(diagnostic);
    expect(end).not.toHaveBeenCalled();
  });
});
