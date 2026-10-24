import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import http from 'node:http';

import express, { type Request, type RequestHandler, type Response } from 'express';
import { calculateJwkThumbprint, exportJWK, SignJWT } from 'jose';
import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { createMemoryOidcVaultStore } from '../../express-oidc-vault-memory-store/src/index';
import { OidcVaultHttpError } from '../src/errors';
import {
  createOidcVaultAccessTokenMiddleware,
  createOidcVaultAuthenticator,
  createOidcVaultJwtAccessTokenValidator,
  OidcVaultAuthDeniedError,
  OidcVaultInvalidAccessTokenError,
  type OidcVaultAccessTokenMiddlewareOptions,
  type OidcVaultAuthContext,
} from '../src/index';

// Extend the real JWT/proof + memory replay HTTP pattern used by dpop-api.test.ts.
const ORIGIN = 'https://api.example.com';
const SECRET = new Uint8Array(32).fill(51);
const NOW = 1_800_000_000_000;
const key = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const wrongKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
let jkt: string;
beforeAll(async () => {
  jkt = await calculateJwkThumbprint(await exportJWK(key.publicKey));
});

const tokenFor = (bound = true, claims: Record<string, unknown> = {}) =>
  new SignJWT({ sub: 'verified-user', ...(bound ? { cnf: { jkt } } : {}), ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ORIGIN)
    .setAudience('app-api')
    .setExpirationTime('15m')
    .sign(SECRET);

const proofFor = async (token: string, path = '/session', options: { wrongKey?: boolean; nonce?: string } = {}) => {
  const pair = options.wrongKey ? wrongKey : key;
  return new SignJWT({
    htm: 'GET',
    htu: `${ORIGIN}${path}`,
    iat: NOW / 1000,
    jti: randomUUID(),
    ath: createHash('sha256').update(token, 'ascii').digest('base64url'),
    ...(options.nonce ? { nonce: options.nonce } : {}),
  })
    .setProtectedHeader({ typ: 'dpop+jwt', alg: 'ES256', jwk: await exportJWK(pair.publicKey) })
    .sign(pair.privateKey);
};

const jwt = () =>
  createOidcVaultJwtAccessTokenValidator({ key: SECRET, issuer: ORIGIN, audience: 'app-api', algorithms: ['HS256'] });

const fixture = (overrides: Partial<OidcVaultAccessTokenMiddlewareOptions> = {}, before?: RequestHandler) => {
  const store = createMemoryOidcVaultStore({ now: () => NOW });
  const reserve = vi.spyOn(store, 'reserveDpopProof');
  const validator = jwt();
  const validate = vi.fn(validator.validateWithRequest);
  const onAuthContext = vi.fn(overrides.onAuthContext ?? (() => {}));
  const onError = vi.fn(overrides.onError ?? (() => {}));
  const options: OidcVaultAccessTokenMiddlewareOptions = {
    validator: { validate: validator.validate, validateWithRequest: validate },
    authentication: 'optional',
    deviceBinding: { publicOrigin: ORIGIN, replayNamespace: 'optional-auth', replayStore: store, now: () => NOW },
    ...overrides,
    onAuthContext,
    onError,
  };
  const auth = createOidcVaultAuthenticator(options);
  const app = express();
  const downstream = vi.fn<RequestHandler>((req, res) =>
    res.json(
      req.auth
        ? {
            authenticated: true,
            subject: req.auth.subject,
            confirmation: req.auth.confirmation,
            deviceBinding: req.auth.deviceBinding,
            user: res.locals.user,
          }
        : { authenticated: false },
    ),
  );
  if (before) app.use(before);
  app.use(auth.authenticate);
  app.get('/session', downstream);
  app.get('/protected', auth.requireAuth, auth.requireAuth, downstream);
  app.get('/bound', auth.requireAuth, auth.requireDeviceBinding, auth.requireDeviceBinding, downstream);
  return { app, auth, options, store, reserve, validate, onAuthContext, onError, downstream };
};

const expectAnonymous = (response: request.Response) => {
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ authenticated: false });
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['www-authenticate']).toBeUndefined();
  expect(response.headers['dpop-nonce']).toBeUndefined();
};

async function rawCall(app: express.Express, headers: string[]) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try {
    return await new Promise<{ status: number; body: { code: string } }>((resolve, reject) => {
      const call = http.request(
        {
          hostname: '127.0.0.1',
          port: (server.address() as { port: number }).port,
          path: '/session',
          agent: false,
          headers: ['Host', '127.0.0.1', 'Connection', 'close', ...headers],
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('error', reject);
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode!, body: JSON.parse(Buffer.concat(chunks).toString()) });
            } catch (error) {
              reject(error);
            }
          });
        },
      );
      call.on('error', reject);
      call.end();
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

describe('OVAPP-01 optional public session and strict guards', () => {
  it('permits an anonymous public session, rejects it at the corresponding guard and clears forged prior auth', async () => {
    const context = fixture({}, (req, res, next) => {
      req.auth = { subject: 'forged', token: 'forged' };
      res.setHeader('WWW-Authenticate', 'stale');
      res.setHeader('DPoP-Nonce', 'stale');
      next();
    });
    expectAnonymous(await request(context.app).get('/session'));
    const required = await request(context.app).get('/protected');
    expect(required.status).toBe(401);
    expect(required.body.code).toBe('OIDC_VAULT_AUTHENTICATION_REQUIRED');
    expect(required.headers['www-authenticate']).toBe('Bearer, DPoP algs="ES256"');
    expect(required.headers['dpop-nonce']).toBeUndefined();
    expect(context.validate).not.toHaveBeenCalled();
    expect(context.onAuthContext).not.toHaveBeenCalled();
    expect(context.reserve).not.toHaveBeenCalled();
  });

  it('keeps authentication required by default even with optional device binding', async () => {
    const context = fixture({ authentication: undefined });
    const response = await request(context.app).get('/session');
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('OIDC_VAULT_MISSING_ACCESS_TOKEN');
    expect(context.downstream).not.toHaveBeenCalled();
  });

  it('supports optional authentication through the existing handler-only factory and legacy one-argument validator', async () => {
    const validate = vi.fn(async (token: string) => ({ subject: token }));
    const app = express();
    app.use(createOidcVaultAccessTokenMiddleware({ validator: { validate }, authentication: 'optional' }));
    app.get('/session', (req, res) => res.json({ subject: req.auth?.subject ?? null }));
    expect((await request(app).get('/session')).body).toEqual({ subject: null });
    expect((await request(app).get('/session').set('Authorization', 'Bearer legacy')).body).toEqual({
      subject: 'legacy',
    });
    expect(validate.mock.calls).toEqual([['legacy']]);
  });

  it('enriches valid Bearer once before compatible required guards', async () => {
    const context = fixture({
      onAuthContext({ auth, res }) {
        res.locals.user = { id: auth.subject };
      },
    });
    const token = await tokenFor(false);
    const response = await request(context.app).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      authenticated: true,
      subject: 'verified-user',
      confirmation: null,
      user: { id: 'verified-user' },
    });
    expect(context.validate).toHaveBeenCalledTimes(1);
    expect(context.onAuthContext).toHaveBeenCalledTimes(1);
    expect(context.reserve).not.toHaveBeenCalled();
  });

  it('reserves and enriches a bound request once through multiple required and bound guards', async () => {
    const context = fixture();
    const token = await tokenFor();
    const response = await request(context.app)
      .get('/bound')
      .set('Authorization', `DPoP ${token}`)
      .set('DPoP', await proofFor(token, '/bound'));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      authenticated: true,
      confirmation: { jkt },
      deviceBinding: { type: 'dpop', jkt, alg: 'ES256' },
    });
    expect(context.validate).toHaveBeenCalledTimes(1);
    expect(context.reserve).toHaveBeenCalledTimes(1);
    expect(context.onAuthContext).toHaveBeenCalledTimes(1);
    expect(context.onError).not.toHaveBeenCalled();
  });

  it('never upgrades an unbound Bearer token with an optional proof at a bound guard', async () => {
    const context = fixture();
    const token = await tokenFor(false);
    const response = await request(context.app)
      .get('/bound')
      .set('Authorization', `Bearer ${token}`)
      .set('DPoP', await proofFor(token, '/bound'));
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('OIDC_VAULT_DEVICE_BINDING_REQUIRED');
    expect(context.reserve).toHaveBeenCalledTimes(1);
    expect(context.onAuthContext).toHaveBeenCalledTimes(1);
    expect(context.downstream).not.toHaveBeenCalled();
  });
});

describe('OVAPP-01 explicit invalid credential policy', () => {
  it.each(['reject', 'anonymous'] as const)(
    'handles bound Bearer downgrade, missing/wrong proof and expired tokens with %s',
    async (invalidCredentials) => {
      for (const scenario of ['bound-bearer', 'missing-proof', 'wrong-proof', 'expired', 'unbound-dpop']) {
        const context = fixture({ invalidCredentials });
        const token =
          scenario === 'expired'
            ? await new SignJWT({ sub: 'expired' })
                .setProtectedHeader({ alg: 'HS256' })
                .setIssuer(ORIGIN)
                .setAudience('app-api')
                .setExpirationTime(0)
                .sign(SECRET)
            : await tokenFor(scenario !== 'unbound-dpop');
        const response = await request(context.app)
          .get('/session')
          .set('Authorization', `${scenario === 'bound-bearer' || scenario === 'expired' ? 'Bearer' : 'DPoP'} ${token}`)
          .set(
            scenario === 'missing-proof'
              ? {}
              : { DPoP: await proofFor(token, '/session', { wrongKey: scenario === 'wrong-proof' }) },
          );
        if (invalidCredentials === 'anonymous') expectAnonymous(response);
        else {
          expect(response.status).toBe(401);
          expect(response.body.code).toBe(
            scenario === 'wrong-proof'
              ? 'OIDC_VAULT_INVALID_DPOP_PROOF'
              : scenario === 'expired' || scenario === 'unbound-dpop'
                ? 'OIDC_VAULT_INVALID_ACCESS_TOKEN'
                : 'OIDC_VAULT_DPOP_REQUIRED',
          );
        }
        expect(context.reserve).not.toHaveBeenCalled();
        expect(context.onAuthContext).not.toHaveBeenCalled();
        expect(context.onError).toHaveBeenCalledTimes(1);
      }
    },
  );

  it.each(['', 'Basic abc', 'Bearer', 'Bearer abc extra', 'Bearer a,b'])(
    'treats malformed/empty Authorization %j as invalid, not missing',
    async (authorization) => {
      const context = fixture();
      const rejected = await request(context.app).get('/session').set('Authorization', authorization);
      expect(rejected.status).toBe(401);
      expect(rejected.body.code).toBe('OIDC_VAULT_INVALID_AUTHORIZATION_HEADER');
      const fallback = fixture({ invalidCredentials: 'anonymous' });
      expectAnonymous(await request(fallback.app).get('/session').set('Authorization', authorization));
    },
  );

  it.each([false, true])('rejects raw duplicate Authorization and DPoP headers (fallback %s)', async (fallback) => {
    const context = fixture({ invalidCredentials: fallback ? 'anonymous' : 'reject' });
    const token = await tokenFor();
    const proof = await proofFor(token);
    for (const headers of [
      ['Authorization', `DPoP ${token}`, 'authorization', `DPoP ${token}`, 'DPoP', proof],
      ['Authorization', `DPoP ${token}`, 'DPoP', proof, 'dpop', proof],
    ]) {
      const response = await rawCall(context.app, headers);
      expect(response.status).toBe(fallback ? 200 : 401);
      if (fallback) expect(response.body).toEqual({ authenticated: false });
      else expect(response.body.code).toMatch(/^OIDC_VAULT_INVALID_(AUTHORIZATION_HEADER|DPOP_PROOF)$/);
    }
    expect(context.reserve).not.toHaveBeenCalled();
  });

  it('does not treat proof-only credentials as missing optional authentication', async () => {
    const context = fixture();
    const response = await request(context.app).get('/session').set('DPoP', 'malformed');
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('OIDC_VAULT_MISSING_ACCESS_TOKEN');
  });

  it('allows explicit custom validator rejection, cleans observer auth/headers, and required guards still reject', async () => {
    const error = new OidcVaultInvalidAccessTokenError('private adapter diagnostic');
    const context = fixture({
      deviceBinding: undefined,
      invalidCredentials: 'anonymous',
      validator: {
        async validate() {
          throw error;
        },
      },
      onError({ req, res }) {
        req.auth = { subject: 'forged', token: 'forged' };
        res.status(503);
        res.setHeader('WWW-Authenticate', 'private');
        res.setHeader('DPoP-Nonce', 'private');
        throw new Error('observer-private');
      },
    });
    expectAnonymous(await request(context.app).get('/session').set('Authorization', 'Bearer rejected'));
    expect(context.onError.mock.calls[0][0].error).toBe(error);
    const required = await request(context.app).get('/protected').set('Authorization', 'Bearer rejected');
    expect(required.status).toBe(401);
    expect(required.body.code).toBe('OIDC_VAULT_AUTHENTICATION_REQUIRED');
    expect(required.text).not.toContain('private');
    expect(context.onAuthContext).not.toHaveBeenCalled();
  });

  it.each([
    new Error('adapter private outage'),
    Object.assign(new Error('status is not authority'), { status: 401, code: 'OIDC_VAULT_INVALID_ACCESS_TOKEN' }),
    new OidcVaultHttpError(401, 'OIDC_VAULT_INVALID_ACCESS_TOKEN', 'Controlled custom adapter failure.'),
    new OidcVaultHttpError(503, 'ADAPTER_UNAVAILABLE', 'Adapter unavailable.'),
  ])('never infers fallback from unknown validator exceptions or HTTP status: %j', async (error) => {
    const context = fixture({
      deviceBinding: undefined,
      invalidCredentials: 'anonymous',
      validator: {
        async validate() {
          throw error;
        },
      },
    });
    const response = await request(context.app).get('/session').set('Authorization', 'Bearer token');
    expect(response.status).toBe(error instanceof OidcVaultHttpError ? error.status : 401);
    expect(context.downstream).not.toHaveBeenCalled();
    expect(context.onError.mock.calls[0][0].error).toBe(error);
  });

  it('does not authorize fallback for malformed adapter output or custom JWT mapper failure', async () => {
    for (const validator of [
      {
        async validate() {
          return { subject: '' };
        },
      },
      {
        async validate() {
          return null as unknown as OidcVaultAuthContext;
        },
      },
      createOidcVaultJwtAccessTokenValidator({
        key: SECRET,
        mapClaims() {
          throw new Error('mapper private outage');
        },
      }),
      createOidcVaultJwtAccessTokenValidator({
        key: SECRET,
        mapClaims() {
          throw new OidcVaultInvalidAccessTokenError('mapper is not the verifier');
        },
      }),
    ]) {
      const context = fixture({ deviceBinding: undefined, invalidCredentials: 'anonymous', validator });
      const response = await request(context.app)
        .get('/session')
        .set('Authorization', `Bearer ${await tokenFor(false)}`);
      expect(response.status).toBe(401);
      expect(context.downstream).not.toHaveBeenCalled();
    }
    const missingConfirmation = fixture({
      invalidCredentials: 'anonymous',
      validator: {
        validate: jwt().validate,
        async validateWithRequest() {
          return { subject: 'user' } as never;
        },
      },
    });
    expect((await request(missingConfirmation.app).get('/session').set('Authorization', 'Bearer token')).status).toBe(
      401,
    );
  });

  it.each(['missing-sub', 'bad-cnf'])(
    'identifies built-in verified JWT profile/default-subject rejection: %s',
    async (scenario) => {
      const context = fixture({ invalidCredentials: 'anonymous' });
      const token = await tokenFor(
        true,
        scenario === 'missing-sub' ? { sub: undefined } : { cnf: { jkt, extra: 'unsupported' } },
      );
      expectAnonymous(await request(context.app).get('/session').set('Authorization', `Bearer ${token}`));
      expect(context.reserve).not.toHaveBeenCalled();
      expect(context.onAuthContext).not.toHaveBeenCalled();
    },
  );

  it('requires explicit valid authentication/fallback options at construction and snapshots them', async () => {
    const validator = jwt();
    expect(() => createOidcVaultAuthenticator({ validator, invalidCredentials: 'anonymous' })).toThrow(
      'optional authentication',
    );
    expect(() =>
      createOidcVaultAuthenticator({ validator, authentication: 'optional', invalidCredentials: 'ignore' as never }),
    ).toThrow('invalidCredentials');
    expect(() => createOidcVaultAuthenticator({ validator, authentication: 'maybe' as never })).toThrow(
      'authentication',
    );
    const context = fixture();
    context.options.authentication = 'required';
    context.options.invalidCredentials = 'anonymous';
    expectAnonymous(await request(context.app).get('/session'));
    expect((await request(context.app).get('/session').set('Authorization', 'Bearer invalid')).status).toBe(401);
  });
});

describe('OVAPP-01 nonce, replay availability and hook failure preservation', () => {
  it('retains a nonce challenge and succeeds with a fresh retry, reserving/enriching only once', async () => {
    const store = createMemoryOidcVaultStore({ now: () => NOW });
    const reserve = vi.spyOn(store, 'reserveDpopProof');
    const context = fixture({
      invalidCredentials: 'anonymous',
      deviceBinding: {
        mode: 'required',
        publicOrigin: ORIGIN,
        replayNamespace: 'nonce-optional',
        replayStore: store,
        now: () => NOW,
        nonce: { secret: SECRET },
      },
    });
    const token = await tokenFor();
    const challenge = await request(context.app)
      .get('/bound')
      .set('Authorization', `DPoP ${token}`)
      .set('DPoP', await proofFor(token, '/bound'));
    expect(challenge.status).toBe(401);
    expect(challenge.body).toEqual({ code: 'OIDC_VAULT_USE_DPOP_NONCE', message: 'A fresh DPoP nonce is required.' });
    expect(challenge.headers['www-authenticate']).toBe('DPoP error="use_dpop_nonce", algs="ES256"');
    expect(challenge.headers['cache-control']).toBe('no-store');
    expect(challenge.headers['dpop-nonce']).toMatch(/^v1\./);
    expect(reserve).not.toHaveBeenCalled();
    expect(context.onAuthContext).not.toHaveBeenCalled();
    const retried = await request(context.app)
      .get('/bound')
      .set('Authorization', `DPoP ${token}`)
      .set('DPoP', await proofFor(token, '/bound', { nonce: challenge.headers['dpop-nonce'] }));
    expect(retried.status).toBe(200);
    expect(retried.body.deviceBinding.jkt).toBe(jkt);
    expect(retried.headers['dpop-nonce']).toBeUndefined();
    expect(retried.headers['www-authenticate']).toBeUndefined();
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(context.onAuthContext).toHaveBeenCalledTimes(1);
  });

  it.each(['outage', 'capacity'])(
    'keeps replay %s as sanitized 503 with explicit fallback enabled',
    async (scenario) => {
      const store = createMemoryOidcVaultStore({ now: () => NOW, dpopReplayMaxEntries: 1 });
      const reserve = vi.spyOn(store, 'reserveDpopProof');
      const context = fixture({
        invalidCredentials: 'anonymous',
        deviceBinding: {
          publicOrigin: ORIGIN,
          replayNamespace: 'availability',
          replayStore: store,
          now: () => NOW,
        },
      });
      const token = await tokenFor();
      if (scenario === 'outage') reserve.mockRejectedValue(new Error('private replay outage'));
      else {
        expect(
          (
            await request(context.app)
              .get('/session')
              .set('Authorization', `DPoP ${token}`)
              .set('DPoP', await proofFor(token))
          ).status,
        ).toBe(200);
      }
      const response = await request(context.app)
        .get('/session')
        .set('Authorization', `DPoP ${token}`)
        .set('DPoP', await proofFor(token));
      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        code: 'OIDC_VAULT_DPOP_REPLAY_UNAVAILABLE',
        message: 'DPoP replay protection is unavailable.',
      });
      expect(response.headers['www-authenticate']).toBeUndefined();
      expect(response.headers['dpop-nonce']).toBeUndefined();
      expect(response.headers['cache-control']).toBe('no-store');
      expect(context.downstream).toHaveBeenCalledTimes(scenario === 'outage' ? 0 : 1);
      expect(context.onAuthContext).toHaveBeenCalledTimes(scenario === 'outage' ? 0 : 1);
    },
  );

  it.each([
    { error: new Error('private hook outage'), status: 500, code: 'OIDC_VAULT_AUTH_CONTEXT_FAILED' },
    {
      error: new OidcVaultInvalidAccessTokenError('not validator-stage'),
      status: 401,
      code: 'OIDC_VAULT_INVALID_ACCESS_TOKEN',
    },
    { error: new OidcVaultAuthDeniedError(), status: 403, code: 'OIDC_VAULT_AUTH_DENIED' },
    { error: new OidcVaultAuthDeniedError('Sign in again.', 401), status: 401, code: 'OIDC_VAULT_AUTH_DENIED' },
  ])('preserves hook denial/failure $status, detaches auth and consumes replay', async ({ error, status, code }) => {
    let captured: Request | undefined;
    const context = fixture({
      invalidCredentials: 'anonymous',
      onAuthContext({ req }) {
        captured = req;
        throw error;
      },
    });
    const token = await tokenFor();
    const proof = await proofFor(token);
    const response = await request(context.app)
      .get('/session')
      .set('Authorization', `DPoP ${token}`)
      .set('DPoP', proof);
    expect(response.status).toBe(status);
    expect(response.body.code).toBe(code);
    expect(response.text).not.toContain('private');
    expect(response.headers['www-authenticate']).toBe(
      status === 401 ? 'DPoP error="invalid_token", algs="ES256"' : undefined,
    );
    expect(captured?.auth).toBeUndefined();
    expect(context.downstream).not.toHaveBeenCalled();
    expect(context.reserve).toHaveBeenCalledTimes(1);
    expect(context.onAuthContext).toHaveBeenCalledTimes(1);
    expect(context.onError.mock.calls[0][0].error).toBe(error);
    expectAnonymous(
      await request(context.app).get('/session').set('Authorization', `DPoP ${token}`).set('DPoP', proof),
    );
    expect(context.onAuthContext).toHaveBeenCalledTimes(1);
  });
});

describe('OVAPP-01 private request-scoped evidence', () => {
  it('rejects plain forged auth even when its fields describe a bound credential', async () => {
    const auth = createOidcVaultAuthenticator({ validator: jwt() });
    const app = express();
    app.get(
      '/forged',
      (req, _res, next) => {
        req.auth = {
          subject: 'forged',
          token: 'forged',
          confirmation: { jkt },
          deviceBinding: { type: 'dpop', jkt, alg: 'ES256' },
        };
        next();
      },
      auth.requireDeviceBinding,
      (_req, res) => res.json({ authorized: true }),
    );
    const response = await request(app).get('/forged');
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('OIDC_VAULT_AUTHENTICATION_REQUIRED');
  });

  it.each(['copy', 'subject', 'token', 'add-binding', 'getter'])(
    'rejects replaced or mutated completed context: %s',
    async (change) => {
      const context = fixture();
      const getter = vi.fn(() => {
        throw new Error('must not evaluate forged getter');
      });
      context.app.get(
        '/changed',
        (req, _res, next) => {
          if (change === 'copy') req.auth = { ...req.auth! };
          else if (change === 'subject') req.auth!.subject = 'forged';
          else if (change === 'token') req.auth!.token = 'forged';
          else if (change === 'add-binding') req.auth!.deviceBinding = { type: 'dpop', jkt, alg: 'ES256' };
          else Object.defineProperty(req, 'auth', { get: getter, configurable: true });
          next();
        },
        context.auth.requireAuth,
        context.downstream,
      );
      const response = await request(context.app)
        .get('/changed')
        .set('Authorization', `Bearer ${await tokenFor(false)}`);
      expect(response.status).toBe(401);
      expect(context.downstream).not.toHaveBeenCalled();
      expect(context.validate).toHaveBeenCalledTimes(1);
      expect(context.onAuthContext).toHaveBeenCalledTimes(1);
      expect(getter).not.toHaveBeenCalled();
    },
  );

  it.each(['identical', 'different-validator', 'required-binding'])(
    'rejects evidence at another authenticator: %s',
    async (policy) => {
      const context = fixture();
      const other = createOidcVaultAuthenticator({
        ...context.options,
        ...(policy === 'different-validator'
          ? {
              validator: {
                async validate() {
                  return { subject: 'other' };
                },
                validateWithRequest: jwt().validateWithRequest,
              },
            }
          : {}),
        deviceBinding: {
          ...context.options.deviceBinding!,
          ...(policy === 'required-binding' ? { mode: 'required' } : {}),
        },
      });
      context.app.get('/other', other.requireAuth, context.downstream);
      const response = await request(context.app)
        .get('/other')
        .set('Authorization', `Bearer ${await tokenFor(false)}`);
      expect(response.status).toBe(401);
      expect(context.downstream).not.toHaveBeenCalled();
      expect(context.validate).toHaveBeenCalledTimes(1);
      expect(context.reserve).not.toHaveBeenCalled();
    },
  );

  it('cannot copy completed auth into a different HTTP request', async () => {
    let previous: OidcVaultAuthContext | undefined;
    const context = fixture();
    context.app.get('/capture', (req, res) => {
      previous = req.auth;
      res.json({ captured: true });
    });
    context.app.get(
      '/copy',
      (req, _res, next) => {
        req.auth = previous;
        next();
      },
      context.auth.requireAuth,
      context.downstream,
    );
    expect(
      (
        await request(context.app)
          .get('/capture')
          .set('Authorization', `Bearer ${await tokenFor(false)}`)
      ).status,
    ).toBe(200);
    const response = await request(context.app).get('/copy');
    expect(response.status).toBe(401);
    expect(context.downstream).not.toHaveBeenCalled();
    expect(context.validate).toHaveBeenCalledTimes(1);
  });

  it('rejects the original Request when paired with another HTTP Response', async () => {
    let original: Request;
    const context = fixture();
    context.app.get('/capture', (req, res) => {
      original = req;
      res.json({ captured: true });
    });
    context.app.get('/reuse', (_req, res, next) => context.auth.requireAuth(original, res, next), context.downstream);
    expect(
      (
        await request(context.app)
          .get('/capture')
          .set('Authorization', `Bearer ${await tokenFor(false)}`)
      ).status,
    ).toBe(200);
    const response = await request(context.app).get('/reuse');
    expect(response.status).toBe(401);
    expect(context.downstream).not.toHaveBeenCalled();
    expect(original!.auth).toBeUndefined();
  });

  it.each([
    'validator-authenticate',
    'validator-guard',
    'hook-authenticate',
    'hook-guard',
    'validator-foreign-guard',
    'hook-foreign-guard',
  ])('invalidates pending work on concurrent %s re-entry', async (mode) => {
    let currentRes: Response;
    let captured: Request;
    const nestedNext = vi.fn();
    const validator = jwt();
    const context = fixture(
      {
        invalidCredentials: 'anonymous',
        validator: {
          validate: validator.validate,
          async validateWithRequest(input) {
            const result = await validator.validateWithRequest(input);
            if (mode.startsWith('validator')) await reenter(input.req, currentRes, nestedNext);
            return result;
          },
        },
        async onAuthContext({ req, res }) {
          if (mode.startsWith('hook')) await reenter(req, res, nestedNext);
        },
      },
      (req, res, next) => {
        captured = req;
        currentRes = res;
        next();
      },
    );
    const other = createOidcVaultAuthenticator(context.options);
    const reenter = mode.includes('foreign')
      ? other.requireAuth
      : mode.endsWith('guard')
        ? context.auth.requireAuth
        : context.auth.authenticate;
    const token = await tokenFor();
    const response = await request(context.app)
      .get('/session')
      .set('Authorization', `DPoP ${token}`)
      .set('DPoP', await proofFor(token));
    expect(response.status).toBe(500);
    expect(response.body.code).toBe('OIDC_VAULT_AUTHENTICATION_REENTRY');
    expect(response.headers['www-authenticate']).toBeUndefined();
    expect(captured!.auth).toBeUndefined();
    expect(nestedNext).not.toHaveBeenCalled();
    expect(context.downstream).not.toHaveBeenCalled();
    expect(context.reserve).toHaveBeenCalledTimes(mode.startsWith('hook') ? 1 : 0);
    expect(context.onAuthContext).toHaveBeenCalledTimes(mode.startsWith('hook') ? 1 : 0);
    expect(context.onError).toHaveBeenCalledTimes(1);
  });
});
