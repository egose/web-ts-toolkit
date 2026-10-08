import { createHash, randomUUID } from 'node:crypto';

import express, { type RequestHandler } from 'express';
import { calculateJwkThumbprint, exportJWK, generateKeyPair, SignJWT } from 'jose';
import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMemoryOidcVaultStore } from '../../express-oidc-vault-memory-store/src/index';
import { resolveDeviceBindingOptions } from '../src/device-binding-policy';
import {
  createOidcVaultAccessTokenMiddleware,
  createOidcVaultJwtAccessTokenValidator,
  createOidcVaultMiddleware,
  type OidcVaultDeviceBindingOptions,
  type OidcVaultDpopReplayStore,
} from '../src/index';

const ORIGIN = 'https://api.example.com';
const API_PATH = '/api/profile';
const LOGIN_PATH = '/auth/oidc/login';
const FRONTEND = 'https://frontend.example.com';
const NOW = 1_800_000_000_000;
const SECRET = new Uint8Array(32).fill(37);
const CHECKS = [
  { option: 'ignoreTargetFailure', env: 'OIDC_VAULT_DPOP_IGNORE_TARGET_FAILURE', step: 6 },
  { option: 'ignoreFreshnessFailure', env: 'OIDC_VAULT_DPOP_IGNORE_FRESHNESS_FAILURE', step: 7 },
  { option: 'ignoreReplayFailure', env: 'OIDC_VAULT_DPOP_IGNORE_REPLAY_FAILURE', step: 8 },
] as const;

const makeKey = async () => {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const jwk = await exportJWK(publicKey);
  return { privateKey, jwk, jkt: await calculateJwkThumbprint(jwk) };
};
let keyA: Awaited<ReturnType<typeof makeKey>>;
let keyB: typeof keyA;
let accessToken: string;

beforeAll(async () => {
  [keyA, keyB] = await Promise.all([makeKey(), makeKey()]);
  accessToken = await new SignJWT({ sub: 'api-user', cnf: { jkt: keyA.jkt } })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ORIGIN)
    .setAudience('test-api')
    .setExpirationTime('1h')
    .sign(SECRET);
});

beforeEach(() => {
  for (const { env } of CHECKS) vi.stubEnv(env, undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const proofFor = (
  options: {
    vault?: boolean;
    claims?: Record<string, unknown>;
    key?: typeof keyA;
    signingKey?: typeof keyA;
    header?: Record<string, unknown>;
  } = {},
) => {
  const key = options.key ?? keyA;
  return new SignJWT({
    htm: options.vault ? 'POST' : 'GET',
    htu: `${ORIGIN}${options.vault ? LOGIN_PATH : API_PATH}`,
    iat: NOW / 1000,
    jti: randomUUID(),
    ...(options.vault ? {} : { ath: createHash('sha256').update(accessToken, 'ascii').digest('base64url') }),
    ...options.claims,
  })
    .setProtectedHeader({ typ: 'dpop+jwt', alg: 'ES256', jwk: key.jwk, ...options.header })
    .sign((options.signingKey ?? key).privateKey);
};

const apiFixture = (
  options: {
    proofOptions?: OidcVaultDeviceBindingOptions;
    replayStore?: OidcVaultDpopReplayStore;
    maxEntries?: number;
    now?: () => number;
    before?: RequestHandler;
  } = {},
) => {
  const store =
    options.replayStore ?? createMemoryOidcVaultStore({ now: () => NOW, dpopReplayMaxEntries: options.maxEntries });
  const reserve = vi.spyOn(store, 'reserveDpopProof');
  const onAuthContext = vi.fn();
  const onError = vi.fn();
  const middleware = createOidcVaultAccessTokenMiddleware({
    validator: createOidcVaultJwtAccessTokenValidator({ key: SECRET, issuer: ORIGIN, audience: 'test-api' }),
    deviceBinding: {
      mode: 'required',
      publicOrigin: ORIGIN,
      replayNamespace: 'failure-policy-api',
      replayStore: store,
      now: options.now ?? (() => NOW),
      ...options.proofOptions,
    },
    onAuthContext,
    onError,
  });
  const app = express();
  if (options.before) app.use(options.before);
  app.use(middleware, (req, res) => res.json({ subject: req.auth?.subject, deviceBinding: req.auth?.deviceBinding }));
  const call = (proof: string) =>
    request(app).get(API_PATH).set('Authorization', `DPoP ${accessToken}`).set('DPoP', proof);
  return { call, reserve, onAuthContext, onError };
};

const expectWarning = (step: number, env: string, code = 'OIDC_VAULT_INVALID_DPOP_PROOF') => {
  expect(console.warn).toHaveBeenCalledWith(
    expect.stringMatching(new RegExp(`step ${step} .*${env}`)),
    expect.objectContaining({ code }),
  );
};

describe('independent DPoP failure configuration', () => {
  it.each(CHECKS)('enables only $option from $env and lets an explicit boolean override it', ({ option, env }) => {
    vi.stubEnv(env, 'true');
    const resolved = resolveDeviceBindingOptions({})!;
    for (const check of CHECKS) expect(resolved[check.option]).toBe(check.option === option);
    expect(resolveDeviceBindingOptions({ [option]: false })?.[option]).toBe(false);
    vi.stubEnv(env, undefined);
    expect(resolveDeviceBindingOptions({ [option]: true })?.[option]).toBe(true);
    expect(resolveDeviceBindingOptions(resolved)?.[option]).toBe(true);
    expect(Object.isFrozen(resolved)).toBe(true);
  });

  it.each(['false', '1', 'TRUE', ' true ', 'yes', ''])('keeps enforcement for env value %j', (value) => {
    for (const { env } of CHECKS) vi.stubEnv(env, value);
    const resolved = resolveDeviceBindingOptions({})!;
    for (const { option } of CHECKS) expect(resolved[option]).toBe(false);
  });

  it('captures each middleware environment default at construction', async () => {
    vi.stubEnv(CHECKS[0].env, 'true');
    const soft = apiFixture();
    vi.stubEnv(CHECKS[0].env, 'false');
    const strict = apiFixture();
    const value = await proofFor({ claims: { htm: 'POST' } });
    expect((await soft.call(value)).status).toBe(200);
    expect((await strict.call(value)).status).toBe(401);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(soft.reserve).toHaveBeenCalledTimes(1);
    expect(strict.reserve).not.toHaveBeenCalled();
  });
});

describe('step 6 target soft failure', () => {
  it.each([{ htm: 'POST' }, { htu: `${ORIGIN}/different` }, { htu: '/relative-target' }, { htu: null }])(
    'logs failed method/URL checks %j and proceeds to replay and auth',
    async (claims) => {
      vi.stubEnv(CHECKS[0].env, 'true');
      const context = apiFixture();
      const response = await context.call(await proofFor({ claims }));
      expect(response.status).toBe(200);
      expect(response.body.deviceBinding).toEqual({ type: 'dpop', jkt: keyA.jkt, alg: 'ES256' });
      expect(context.reserve).toHaveBeenCalledTimes(1);
      expect(context.onAuthContext).toHaveBeenCalledTimes(1);
      expect(context.onError).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledTimes(1);
      expectWarning(6, CHECKS[0].env);
    },
  );

  it('includes malformed captured request-target failures in step 6', async () => {
    vi.stubEnv(CHECKS[0].env, 'true');
    const context = apiFixture({
      before: (req, _res, next) => {
        req.originalUrl = '/api/%invalid';
        next();
      },
    });
    expect((await context.call(await proofFor())).status).toBe(200);
    expect(context.reserve).toHaveBeenCalledTimes(1);
    expectWarning(6, CHECKS[0].env);
  });

  it('still stops at freshness when only a target failure is ignored', async () => {
    vi.stubEnv(CHECKS[0].env, 'true');
    const context = apiFixture();
    const response = await context.call(await proofFor({ claims: { htm: 'POST', iat: NOW / 1000 - 65 } }));
    expect(response.status).toBe(401);
    expect(context.reserve).not.toHaveBeenCalled();
    expect(context.onAuthContext).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledTimes(1);
    expectWarning(6, CHECKS[0].env);
  });
});

describe('step 7 freshness soft failure', () => {
  it.each([NOW / 1000 - 65, NOW / 1000 + 6, Number.MAX_SAFE_INTEGER])(
    'logs out-of-window iat %s and retains independent bounded replay enforcement',
    async (iat) => {
      vi.stubEnv(CHECKS[1].env, 'true');
      const context = apiFixture();
      const value = await proofFor({ claims: { iat } });
      expect((await context.call(value)).status).toBe(200);
      expect(context.reserve.mock.calls[0][0].expiresAt).toBe(NOW + 65_000);
      expectWarning(7, CHECKS[1].env);
      expect((await context.call(value)).status).toBe(401);
      expect(context.reserve).toHaveBeenCalledTimes(2);
      expect(context.onAuthContext).toHaveBeenCalledTimes(1);
      expect(console.warn).toHaveBeenCalledTimes(2);
    },
  );

  it('logs a failed configured clock and continues with Date.now', async () => {
    vi.stubEnv(CHECKS[1].env, 'true');
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const cause = new Error('configured proof clock failed');
    const context = apiFixture({
      now: () => {
        throw cause;
      },
    });
    expect((await context.call(await proofFor())).status).toBe(200);
    expect(context.reserve.mock.calls[0][0].expiresAt).toBe(NOW + 65_000);
    expectWarning(7, CHECKS[1].env, 'OIDC_VAULT_DPOP_REPLAY_UNAVAILABLE');
    expect(vi.mocked(console.warn).mock.calls[0][1]).toHaveProperty('cause', cause);
  });

  it('keeps the target check enforced', async () => {
    vi.stubEnv(CHECKS[1].env, 'true');
    const context = apiFixture();
    expect((await context.call(await proofFor({ claims: { htm: 'POST' } }))).status).toBe(401);
    expect(context.reserve).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });
});

describe('step 8 replay soft failure', () => {
  it('attempts every reservation and logs reuse without extending a successful reservation', async () => {
    vi.stubEnv(CHECKS[2].env, 'true');
    const context = apiFixture();
    const value = await proofFor();
    expect((await context.call(value)).status).toBe(200);
    expect(console.warn).not.toHaveBeenCalled();
    expect((await context.call(value)).status).toBe(200);
    expect(context.reserve).toHaveBeenCalledTimes(2);
    expect(context.reserve.mock.calls[1][0]).toEqual(context.reserve.mock.calls[0][0]);
    expect(context.onAuthContext).toHaveBeenCalledTimes(2);
    expect(context.onError).not.toHaveBeenCalled();
    expectWarning(8, CHECKS[2].env);
  });

  it('logs actual capacity failures and duplicates while keeping the original reservation', async () => {
    vi.stubEnv(CHECKS[2].env, 'true');
    const store = createMemoryOidcVaultStore({ now: () => NOW, dpopReplayMaxEntries: 1 });
    const context = apiFixture({ replayStore: store });
    const original = await proofFor();
    expect((await context.call(original)).status).toBe(200);
    expect((await context.call(await proofFor())).status).toBe(200);
    expectWarning(8, CHECKS[2].env, 'OIDC_VAULT_DPOP_REPLAY_UNAVAILABLE');
    expect((await context.call(original)).status).toBe(200);
    expectWarning(8, CHECKS[2].env);
    vi.stubEnv(CHECKS[2].env, 'false');
    const strict = apiFixture({ replayStore: store });
    expect((await strict.call(original)).status).toBe(401);
    expect(console.warn).toHaveBeenCalledTimes(2);
  });

  it.each(['provider error', 'invalid result'] as const)(
    'logs a %s and continues without retrying admission',
    async (failure) => {
      vi.stubEnv(CHECKS[2].env, 'true');
      const cause = new Error('replay provider connection failed');
      const store: OidcVaultDpopReplayStore = {
        async reserveDpopProof() {
          if (failure === 'provider error') throw cause;
          return undefined as unknown as boolean;
        },
      };
      const context = apiFixture({ replayStore: store });
      expect((await context.call(await proofFor())).status).toBe(200);
      expect(context.reserve).toHaveBeenCalledTimes(1);
      expectWarning(8, CHECKS[2].env, 'OIDC_VAULT_DPOP_REPLAY_UNAVAILABLE');
      if (failure === 'provider error') expect(vi.mocked(console.warn).mock.calls[0][1]).toHaveProperty('cause', cause);
    },
  );

  it('keeps freshness enforced and permits explicit enforcement over the env default', async () => {
    vi.stubEnv(CHECKS[2].env, 'true');
    const context = apiFixture({ proofOptions: { ignoreReplayFailure: false } });
    expect((await context.call(await proofFor({ claims: { iat: NOW / 1000 - 65 } }))).status).toBe(401);
    const value = await proofFor();
    expect((await context.call(value)).status).toBe(200);
    expect((await context.call(value)).status).toBe(401);
    expect(context.reserve).toHaveBeenCalledTimes(2);
    expect(console.warn).not.toHaveBeenCalled();
  });
});

describe('combined soft failures preserve remaining verification', () => {
  beforeEach(() => {
    for (const { env } of CHECKS) vi.stubEnv(env, 'true');
  });

  it('continues through all three checks and logs each failure in pipeline order', async () => {
    const context = apiFixture();
    const value = await proofFor({ claims: { htm: 'POST', htu: `${ORIGIN}/wrong`, iat: NOW / 1000 - 65 } });
    expect((await context.call(value)).status).toBe(200);
    expect((await context.call(value)).status).toBe(200);
    expect(context.reserve).toHaveBeenCalledTimes(2);
    expect(context.onAuthContext).toHaveBeenCalledTimes(2);
    expect(vi.mocked(console.warn).mock.calls.map(([message]) => String(message).match(/step (\d)/)?.[1])).toEqual([
      '6',
      '7',
      '6',
      '7',
      '8',
    ]);
  });

  it.each([
    { name: 'signature', options: () => ({ signingKey: keyB }) },
    { name: 'original key', options: () => ({ key: keyB }) },
    { name: 'token hash', options: () => ({ claims: { ath: 'A'.repeat(43) } }) },
    { name: 'iat shape', options: () => ({ claims: { iat: '1800000000' } }) },
    { name: 'JTI shape', options: () => ({ claims: { jti: '' } }) },
    { name: 'protected header', options: () => ({ header: { typ: 'JWT' } }) },
  ])('still rejects a failed $name check', async (scenario) => {
    const context = apiFixture();
    const value = await proofFor(scenario.options());
    expect((await context.call(value)).status).toBe(401);
    expect(context.reserve).not.toHaveBeenCalled();
    expect(context.onAuthContext).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('still challenges for a nonce before replay allocation, then verifies the supplied nonce', async () => {
    const context = apiFixture({ proofOptions: { nonce: { secret: SECRET } } });
    const claims = { htm: 'POST', iat: NOW / 1000 - 65 };
    const challenge = await context.call(await proofFor({ claims }));
    expect(challenge.status).toBe(401);
    expect(challenge.body.code).toBe('OIDC_VAULT_USE_DPOP_NONCE');
    expect(context.reserve).not.toHaveBeenCalled();
    expect(context.onAuthContext).not.toHaveBeenCalled();
    const nonce: string = challenge.headers['dpop-nonce'];
    expect(nonce).toMatch(/^v1\./);
    expect((await context.call(await proofFor({ claims: { ...claims, nonce: 'invalid-nonce' } }))).status).toBe(401);
    expect(context.reserve).not.toHaveBeenCalled();
    expect((await context.call(await proofFor({ claims: { ...claims, nonce } }))).status).toBe(200);
    expect(context.reserve).toHaveBeenCalledTimes(1);
  });
});

describe('vault routes use the same independent env switches', () => {
  it.each(CHECKS)('logs and continues step $step on POST login', async ({ env, step }) => {
    vi.stubEnv(env, 'true');
    const store = createMemoryOidcVaultStore({ now: () => NOW });
    const reserve = vi.spyOn(store, 'reserveDpopProof');
    const createTransaction = vi.spyOn(store, 'createAuthorizationTransaction');
    const app = express();
    app.use(
      createOidcVaultMiddleware({
        backendOrigin: ORIGIN,
        frontendRedirectUri: `${FRONTEND}/callback`,
        trustedOrigins: [FRONTEND],
        storeProvider: store,
        config: {
          issuer: 'https://issuer.example.com',
          clientId: 'test-client',
          authorizationEndpoint: 'https://issuer.example.com/authorize',
          tokenEndpoint: 'https://issuer.example.com/token',
          jwksUri: 'https://issuer.example.com/jwks',
        },
        deviceBinding: { mode: 'required' },
        now: () => NOW,
      }),
    );
    const claims = step === 6 ? { htm: 'GET' } : step === 7 ? { iat: NOW / 1000 - 65 } : {};
    const value = await proofFor({ vault: true, claims });
    const call = () => request(app).post(LOGIN_PATH).set('Origin', FRONTEND).set('DPoP', value).send({});
    expect((await call()).status).toBe(200);
    if (step === 8) expect((await call()).status).toBe(200);
    expect(reserve).toHaveBeenCalledTimes(step === 8 ? 2 : 1);
    expect(createTransaction).toHaveBeenCalledTimes(step === 8 ? 2 : 1);
    expect(createTransaction.mock.calls[0][0].deviceBinding).toEqual({ type: 'dpop', jkt: keyA.jkt });
    expect(console.warn).toHaveBeenCalledTimes(1);
    expectWarning(step, env);
  });
});
