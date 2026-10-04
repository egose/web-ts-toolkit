import { createHash } from 'node:crypto';

import { calculateJwkThumbprint, exportJWK, generateKeyPair, jwtVerify, SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';

import { createMemoryOidcVaultStore } from '../../express-oidc-vault-memory-store/src/index';
import { resolveDeviceBindingOptions } from '../src/device-binding-policy';
import { createDpopNoncePolicy } from '../src/dpop-nonce';
import {
  createDpopReplayKey,
  createDpopReplayPolicy,
  getDpopReplayExpiresAt,
  resolveDpopEffectiveNamespace,
  toDpopNonceChallengeResponse,
  toDpopReplayErrorResponse,
  type DpopProofVerificationResult,
  type DpopProtectionSpace,
  type DpopReplayResult,
} from '../src/dpop-replay';
import { OidcVaultHttpError, toErrorPayload } from '../src/errors';
import {
  OidcVaultDpopReplayCapacityError,
  type OidcVaultDeviceBindingOptions,
  type OidcVaultDpopReplayStore,
} from '../src/types';

const NOW = 1_800_000_000_000;
const JKT = createHash('sha256').update('replay-key-a').digest('base64url');
const OTHER_JKT = createHash('sha256').update('replay-key-b').digest('base64url');
const SECRET = new Uint8Array(32).fill(53);
const API_SPACE = { type: 'api', publicOrigin: 'https://api.example.com', replayNamespace: 'shared-api' } as const;
const VAULT_SPACE = {
  type: 'vault',
  backendOrigin: 'https://api.example.com',
  basePath: '/auth/oidc',
  issuer: 'https://issuer.example.com/tenant',
  clientId: 'spa-client',
} as const;
const INVALID = { status: 401, code: 'OIDC_VAULT_INVALID_DPOP_PROOF', message: 'DPoP proof validation failed.' };
const UNAVAILABLE = {
  status: 503,
  code: 'OIDC_VAULT_DPOP_REPLAY_UNAVAILABLE',
  message: 'DPoP replay protection is unavailable.',
};
const resolved = (options: OidcVaultDeviceBindingOptions = {}) => resolveDeviceBindingOptions(options)!;

// Unit-only trusted callback fixtures isolate shape/time/nonce/replay policy.
// They make no signature-authentication claim. The multi-instance test below
// uses real signed/verified proofs and access tokens across this trust boundary.
const prechecked =
  (overrides: Partial<DpopProofVerificationResult> = {}) =>
  () =>
    ({
      binding: { type: 'dpop', jkt: JKT, alg: 'ES256' },
      iat: NOW / 1000,
      jti: 'fresh-proof',
      ...overrides,
    }) satisfies DpopProofVerificationResult;
const fixture = (
  options: {
    proofOptions?: OidcVaultDeviceBindingOptions;
    protectionSpace?: DpopProtectionSpace;
    maxEntries?: number;
  } = {},
) => {
  const clock = { value: NOW };
  const store = createMemoryOidcVaultStore({
    now: () => clock.value,
    dpopReplayMaxEntries: options.maxEntries ?? 100_000,
  });
  const originalReserve = store.reserveDpopProof.bind(store);
  const reserve = vi.spyOn(store, 'reserveDpopProof');
  const policy = createDpopReplayPolicy({
    protectionSpace: options.protectionSpace ?? API_SPACE,
    proofOptions: resolved(options.proofOptions),
    replayStore: store,
    now: () => clock.value,
  });
  return { clock, store, reserve, policy, originalReserve };
};
const getChallenge = (result: DpopReplayResult): string => {
  expect(result.type).toBe('nonce-challenge');
  if (result.type !== 'nonce-challenge') throw new Error('Expected a nonce challenge.');
  return result.nonce;
};

describe('DBJWT-07 canonical static protection spaces and opaque replay keys', () => {
  it('hashes precisely JSON([effectiveNamespace,jkt,jti]) with the fixed version prefix', () => {
    const namespace = resolveDpopEffectiveNamespace(VAULT_SPACE);
    expect(namespace).toEqual([
      'vault',
      VAULT_SPACE.backendOrigin,
      VAULT_SPACE.basePath,
      VAULT_SPACE.issuer,
      VAULT_SPACE.clientId,
    ]);
    const jti = 'quote" slash\\ : [] , jti';
    const expected = `dpop:v1:${createHash('sha256')
      .update(JSON.stringify([namespace, JKT, jti]))
      .digest('base64url')}`;
    const key = createDpopReplayKey(namespace, JKT, jti);
    expect(key).toBe(expected);
    expect(key).toMatch(/^dpop:v1:[A-Za-z0-9_-]{43}$/);
    expect(key).toHaveLength(51);
    expect(key).not.toContain(JKT);
    expect(key).not.toContain(jti);
    expect(key).not.toContain(VAULT_SPACE.issuer);
  });

  it('normalizes pinned origins/mount paths while retaining exact resolved issuer/client identifiers', () => {
    const first = resolveDpopEffectiveNamespace({
      ...VAULT_SPACE,
      backendOrigin: 'https://API.example.com:443/',
      basePath: 'mount/a/../%7eoidc///',
    });
    const second = resolveDpopEffectiveNamespace({ ...VAULT_SPACE, basePath: '/mount/~oidc' });
    expect(first).toEqual(second);
    expect(first).toEqual([
      'vault',
      'https://api.example.com',
      '/mount/~oidc',
      VAULT_SPACE.issuer,
      VAULT_SPACE.clientId,
    ]);
    expect(Object.isFrozen(first)).toBe(true);
    expect(resolveDpopEffectiveNamespace({ ...VAULT_SPACE, basePath: '/' })[2]).toBe('/auth/oidc');
    expect(resolveDpopEffectiveNamespace({ ...VAULT_SPACE, basePath: '/mount/%2f/%7A' })[2]).toBe('/mount/%2F/z');
    expect(resolveDpopEffectiveNamespace({ ...API_SPACE, publicOrigin: 'http://LOCALHOST:80/' })[1]).toBe(
      'http://localhost',
    );
  });

  it.each([
    { ...VAULT_SPACE, backendOrigin: 'https://other.example.com' },
    { ...VAULT_SPACE, basePath: '/different' },
    { ...VAULT_SPACE, issuer: `${VAULT_SPACE.issuer}/` },
    { ...VAULT_SPACE, issuer: 'https://ISSUER.example.com/tenant' },
    { ...VAULT_SPACE, clientId: 'other-client' },
    API_SPACE,
  ] satisfies DpopProtectionSpace[])('isolates the verification context %j', (space) => {
    const original = createDpopReplayKey(resolveDpopEffectiveNamespace(VAULT_SPACE), JKT, 'same-jti');
    expect(createDpopReplayKey(resolveDpopEffectiveNamespace(space), JKT, 'same-jti')).not.toBe(original);
  });

  it('isolates key/JTI/API namespace and avoids tuple-delimiter collisions', () => {
    const namespace = resolveDpopEffectiveNamespace(API_SPACE);
    const original = createDpopReplayKey(namespace, JKT, 'same-jti');
    expect(createDpopReplayKey(namespace, OTHER_JKT, 'same-jti')).not.toBe(original);
    expect(createDpopReplayKey(namespace, JKT, 'other-jti')).not.toBe(original);
    expect(
      createDpopReplayKey(
        resolveDpopEffectiveNamespace({ ...API_SPACE, replayNamespace: 'other-api' }),
        JKT,
        'same-jti',
      ),
    ).not.toBe(original);
    const left = resolveDpopEffectiveNamespace({ ...VAULT_SPACE, issuer: 'a:b', clientId: 'c' });
    const right = resolveDpopEffectiveNamespace({ ...VAULT_SPACE, issuer: 'a', clientId: 'b:c' });
    expect(createDpopReplayKey(left, JKT, 'd')).not.toBe(createDpopReplayKey(right, JKT, 'd'));
  });

  it.each(['', 'x'.repeat(129), 'line\nbreak', 'tab\t', 'é', '\x7f'])(
    'rejects invalid API namespace %j before store use',
    (replayNamespace) => {
      const store = { reserveDpopProof: vi.fn(async () => true) };
      expect(() =>
        createDpopReplayPolicy({
          protectionSpace: { ...API_SPACE, replayNamespace },
          proofOptions: resolved(),
          replayStore: store,
        }),
      ).toThrow('replayNamespace');
      expect(store.reserveDpopProof).not.toHaveBeenCalled();
    },
  );

  it.each(['/auth?query', '/auth#fragment', '/auth\\path', '/auth/%x', '/auth path'])(
    'rejects invalid vault mount %s',
    (basePath) => {
      expect(() => resolveDpopEffectiveNamespace({ ...VAULT_SPACE, basePath })).toThrow('basePath');
    },
  );

  it('requires explicit capabilities/configuration, permits the exact API namespace bounds, and never installs fallback state', () => {
    expect(resolveDpopEffectiveNamespace({ ...API_SPACE, replayNamespace: ' ' })[2]).toBe(' ');
    expect(resolveDpopEffectiveNamespace({ ...API_SPACE, replayNamespace: 'x'.repeat(128) })[2]).toHaveLength(128);
    expect(() => resolveDpopEffectiveNamespace({ ...VAULT_SPACE, issuer: '' })).toThrow('issuer');
    expect(() => resolveDpopEffectiveNamespace({ ...VAULT_SPACE, clientId: '' })).toThrow('clientId');
    expect(() => resolveDpopEffectiveNamespace({ type: 'other' } as unknown as DpopProtectionSpace)).toThrow(
      'protection space',
    );
    expect(() =>
      createDpopReplayPolicy({
        protectionSpace: API_SPACE,
        proofOptions: resolved(),
        replayStore: {} as OidcVaultDpopReplayStore,
      }),
    ).toThrow('replay store');
    expect(() =>
      createDpopReplayPolicy({
        protectionSpace: API_SPACE,
        proofOptions: undefined as never,
        replayStore: { reserveDpopProof: async () => true },
      }),
    ).toThrow('enabled proof');
  });
});

describe('DBJWT-07 strict bounded signed-iat replay window (no authentication by decoding)', () => {
  it.each([
    { name: 'default', iat: NOW / 1000, now: NOW, age: 60, skew: 5, ttl: 65_000 },
    { name: 'maximum future-skew/default retention', iat: NOW / 1000 + 5, now: NOW, age: 60, skew: 5, ttl: 70_000 },
    { name: 'maximum age plus twice skew', iat: NOW / 1000 + 30, now: NOW, age: 300, skew: 30, ttl: 360_000 },
    { name: 'last millisecond', iat: NOW / 1000 - 64, now: NOW + 999, age: 60, skew: 5, ttl: 1 },
    { name: 'exact lower boundary', iat: NOW / 1000 - 65, now: NOW, age: 60, skew: 5, ttl: null },
    { name: 'exact expiry', iat: NOW / 1000, now: NOW + 65_000, age: 60, skew: 5, ttl: null },
    { name: 'future beyond skew', iat: NOW / 1000 + 6, now: NOW + 999, age: 60, skew: 5, ttl: null },
    { name: 'no skew', iat: NOW / 1000, now: NOW, age: 1, skew: 0, ttl: 1000 },
    { name: 'future with no skew', iat: NOW / 1000 + 1, now: NOW, age: 1, skew: 0, ttl: null },
    { name: 'epoch zero', iat: 0, now: 0, age: 1, skew: 0, ttl: 1000 },
    {
      name: 'safe high epoch, future by 1ms',
      iat: 9_007_199_253_000,
      now: 9_007_199_252_999_999,
      age: 1,
      skew: 0,
      ttl: null,
    },
    {
      name: 'safe high epoch, last valid millisecond',
      iat: 9_007_199_253_000,
      now: 9_007_199_253_000_999,
      age: 1,
      skew: 0,
      ttl: 1,
    },
  ])('computes $name without clamping or renewal', ({ iat, now, age, skew, ttl }) => {
    expect(getDpopReplayExpiresAt({ iat, now, proofMaxAgeSeconds: age, clockSkewSeconds: skew })).toBe(
      ttl === null ? null : now + ttl,
    );
  });

  it.each([
    undefined,
    null,
    '1800000000',
    -1,
    0.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER + 1,
  ])('rejects invalid/overflowing signed iat %j', (iat) => {
    expect(getDpopReplayExpiresAt({ iat, now: NOW, proofMaxAgeSeconds: 60, clockSkewSeconds: 5 })).toBeNull();
  });

  it.each([
    { now: NOW + 0.5 },
    { now: NaN },
    { now: Infinity },
    { now: -1 },
    { now: Number.MAX_SAFE_INTEGER + 1 },
    { proofMaxAgeSeconds: 0 },
    { proofMaxAgeSeconds: 301 },
    { proofMaxAgeSeconds: 1.5 },
    { proofMaxAgeSeconds: Infinity },
    { clockSkewSeconds: -1 },
    { clockSkewSeconds: 31 },
    { clockSkewSeconds: 0.5 },
  ])('rejects invalid epoch/policy bounds %j without allocation', (overrides) => {
    expect(
      getDpopReplayExpiresAt({ iat: NOW / 1000, now: NOW, proofMaxAgeSeconds: 60, clockSkewSeconds: 5, ...overrides }),
    ).toBeNull();
  });
});

describe('DBJWT-07 preconditions, reserve-once and fail-closed sanitized mapping', () => {
  it('waits for the trusted preflight to finish and samples time after verification, before any challenge or reservation', async () => {
    const { clock, policy, reserve } = fixture({ proofOptions: { nonce: { secret: SECRET } } });
    let finish!: (value: DpopProofVerificationResult) => void;
    const gate = new Promise<DpopProofVerificationResult>((resolve) => {
      finish = resolve;
    });
    const verify = vi.fn(() => gate);
    const pending = policy.verifyAndReserve(verify);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(reserve).not.toHaveBeenCalled();
    clock.value += 65_000;
    finish(prechecked()());
    await expect(pending).rejects.toSatisfy((error: unknown) => toErrorPayload(error).code === INVALID.code);
    expect(reserve).not.toHaveBeenCalled();
  });

  it.each([
    'signature',
    'method',
    'public URL',
    'expected key',
    'access token/ath',
    'target identity',
    'browser cookie',
  ])('preserves a private %s preflight error before nonce issuance or reservation', async (stage) => {
    const { policy, reserve } = fixture({ proofOptions: { nonce: { secret: SECRET } } });
    const error = new OidcVaultHttpError(
      401,
      'OIDC_VAULT_INVALID_DPOP_PROOF',
      `Private ${stage} failure at https://private.example/${JKT}`,
      INVALID.message,
    );
    const verify = vi.fn(async () => {
      throw error;
    });
    await expect(policy.verifyAndReserve(verify)).rejects.toBe(error);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(reserve).not.toHaveBeenCalled();
    const response = toDpopReplayErrorResponse(error, ['ES256']);
    expect(response).toEqual({
      status: 401,
      body: { code: INVALID.code, message: INVALID.message },
      headers: { 'Cache-Control': 'no-store', 'WWW-Authenticate': 'DPoP error="invalid_dpop_proof", algs="ES256"' },
    });
    expect(JSON.stringify(response)).not.toContain('private.example');
    expect(JSON.stringify(response)).not.toContain(JKT);
  });

  it.each([
    undefined,
    null,
    '1800000000',
    -1,
    0.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER,
    NOW / 1000 - 65,
    NOW / 1000 + 6,
  ])('never calls the store or challenges for an invalid window %j, even with a live nonce', async (iat) => {
    const { policy, reserve } = fixture({ proofOptions: { nonce: { secret: SECRET } }, maxEntries: 1 });
    const nonce = createDpopNoncePolicy({ secret: SECRET, namespace: JSON.stringify(policy.effectiveNamespace) }).issue(
      JKT,
      NOW,
    );
    await expect(policy.verifyAndReserve(prechecked({ iat, nonce }))).rejects.toSatisfy(
      (error: unknown) => JSON.stringify(toErrorPayload(error)) === JSON.stringify(INVALID),
    );
    expect(reserve).not.toHaveBeenCalled();
    await expect(policy.verifyAndReserve(prechecked({ nonce, jti: 'valid-capacity-probe' }))).resolves.toMatchObject({
      type: 'accepted',
    });
    expect(reserve).toHaveBeenCalledTimes(1);
  });

  it.each(['', 'x'.repeat(129), 'line\nbreak', 'tab\t', 'é', '\x7f', null, 123])(
    'rejects malformed bounded JTI %j before reservation',
    async (jti) => {
      const { policy, reserve } = fixture();
      await expect(policy.verifyAndReserve(prechecked({ jti }))).rejects.toSatisfy(
        (error: unknown) => toErrorPayload(error).code === INVALID.code,
      );
      expect(reserve).not.toHaveBeenCalled();
    },
  );

  it.each(['a', ' '.repeat(128)])('accepts the exact printable JTI bound %j', async (jti) => {
    const { policy, reserve } = fixture();
    await expect(policy.verifyAndReserve(prechecked({ jti }))).resolves.toMatchObject({ type: 'accepted' });
    expect(reserve).toHaveBeenCalledTimes(1);
  });

  it.each([
    { type: 'dpop', jkt: `${JKT}=`, alg: 'ES256' },
    { type: 'dpop', jkt: `${JKT.slice(0, -1)}B`, alg: 'ES256' },
    { type: 'dpop', jkt: JKT, alg: 'HS256' },
    { type: 'dpop', jkt: JKT, alg: 'PS256' },
    { type: 'other', jkt: JKT, alg: 'ES256' },
    null,
  ])('does not elevate malformed/disallowed callback binding %j into authenticated context', async (binding) => {
    const { policy, reserve } = fixture();
    await expect(
      policy.verifyAndReserve(prechecked({ binding: binding as DpopProofVerificationResult['binding'] })),
    ).rejects.toSatisfy((error: unknown) => toErrorPayload(error).code === INVALID.code);
    expect(reserve).not.toHaveBeenCalled();
  });

  it('captures signed fields once and returns a frozen detached binding despite mutation during provider work', async () => {
    const binding = { type: 'dpop' as const, jkt: JKT, alg: 'ES256' as const };
    const getters = {
      binding: vi.fn(() => binding),
      iat: vi.fn(() => NOW / 1000),
      jti: vi.fn(() => 'captured-proof'),
      nonce: vi.fn(() => undefined),
    };
    const reserve = vi.fn(async () => {
      binding.jkt = OTHER_JKT;
      return true;
    });
    const now = vi.fn(() => NOW);
    const policy = createDpopReplayPolicy({
      protectionSpace: API_SPACE,
      proofOptions: resolved(),
      replayStore: { reserveDpopProof: reserve },
      now,
    });
    const result = await policy.verifyAndReserve(() => ({
      get binding() {
        return getters.binding();
      },
      get iat() {
        return getters.iat();
      },
      get jti() {
        return getters.jti();
      },
      get nonce() {
        return getters.nonce();
      },
    }));
    expect(result).toEqual({
      type: 'accepted',
      binding: { type: 'dpop', jkt: JKT, alg: 'ES256' },
      expiresAt: NOW + 65_000,
    });
    expect(Object.isFrozen(result)).toBe(true);
    if (result.type === 'accepted') expect(Object.isFrozen(result.binding)).toBe(true);
    for (const getter of Object.values(getters)) expect(getter).toHaveBeenCalledTimes(1);
    expect(now).toHaveBeenCalledTimes(1);
    expect(reserve).toHaveBeenCalledExactlyOnceWith({
      replayKey: createDpopReplayKey(policy.effectiveNamespace, JKT, 'captured-proof'),
      expiresAt: NOW + 65_000,
    });
  });

  it.each([
    new OidcVaultDpopReplayCapacityError('private capacity/key details'),
    new Error(`private store error at mongodb://secret-host/${JKT}`),
    new OidcVaultHttpError(418, 'PRIVATE_STORE_CODE', 'private store diagnostic', 'private store client message'),
    'private non-Error failure',
    null,
    { secret: 'private store credentials' }, // pragma: allowlist secret
  ])('maps every provider/capacity failure %j to the same 503 with its original cause private', async (cause) => {
    const reserve = vi.fn(async () => {
      throw cause;
    });
    const policy = createDpopReplayPolicy({
      protectionSpace: API_SPACE,
      proofOptions: resolved(),
      replayStore: { reserveDpopProof: reserve },
      now: () => NOW,
    });
    let caught: unknown;
    try {
      await policy.verifyAndReserve(prechecked());
    } catch (error) {
      caught = error;
    }
    expect(toErrorPayload(caught)).toEqual(UNAVAILABLE);
    expect(caught).toHaveProperty('cause', cause);
    expect(Object.getOwnPropertyDescriptor(caught, 'cause')?.enumerable).toBe(false);
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(toDpopReplayErrorResponse(caught, ['ES256'])).toEqual({
      status: 503,
      body: { code: UNAVAILABLE.code, message: UNAVAILABLE.message },
      headers: { 'Cache-Control': 'no-store' },
    });
    expect(JSON.stringify(toDpopReplayErrorResponse(caught, ['ES256']))).not.toContain('private');
  });

  it.each([undefined, null, 1, 'true', {}])(
    'fails closed on a non-boolean store result %j without retry',
    async (result) => {
      const reserve = vi.fn(async () => result as boolean);
      const policy = createDpopReplayPolicy({
        protectionSpace: API_SPACE,
        proofOptions: resolved(),
        replayStore: { reserveDpopProof: reserve },
        now: () => NOW,
      });
      await expect(policy.verifyAndReserve(prechecked())).rejects.toSatisfy(
        (error: unknown) => toErrorPayload(error).code === UNAVAILABLE.code,
      );
      expect(reserve).toHaveBeenCalledTimes(1);
    },
  );

  it.each([NaN, Infinity, NOW + 0.5, -1, Number.MAX_SAFE_INTEGER + 1])(
    'fails closed with no reservation on an invalid operational clock %j',
    async (now) => {
      const { clock, policy, reserve } = fixture();
      clock.value = now;
      await expect(policy.verifyAndReserve(prechecked())).rejects.toSatisfy(
        (error: unknown) => toErrorPayload(error).code === UNAVAILABLE.code,
      );
      expect(reserve).not.toHaveBeenCalled();
    },
  );

  it('preserves a thrown clock diagnostic privately and maps unknown policy errors without leaking raw details', async () => {
    const cause = new Error('private clock failure');
    const store = { reserveDpopProof: vi.fn(async () => true) };
    const policy = createDpopReplayPolicy({
      protectionSpace: API_SPACE,
      proofOptions: resolved(),
      replayStore: store,
      now: () => {
        throw cause;
      },
    });
    let caught: unknown;
    try {
      await policy.verifyAndReserve(prechecked());
    } catch (error) {
      caught = error;
    }
    expect(toErrorPayload(caught)).toEqual(UNAVAILABLE);
    expect(caught).toHaveProperty('cause', cause);
    expect(store.reserveDpopProof).not.toHaveBeenCalled();
    expect(toDpopReplayErrorResponse(new Error('private crypto/verifier details'), ['ES256'])).toEqual({
      status: 500,
      body: { code: 'OIDC_VAULT_INTERNAL_ERROR', message: 'Unexpected OIDC vault error.' },
      headers: { 'Cache-Control': 'no-store' },
    });
  });

  it('passes the exact maximum TTL to the real provider without clamping it', async () => {
    const { policy, reserve } = fixture({ proofOptions: { proofMaxAgeSeconds: 300, clockSkewSeconds: 30 } });
    await expect(policy.verifyAndReserve(prechecked({ iat: NOW / 1000 + 30 }))).resolves.toMatchObject({
      type: 'accepted',
      expiresAt: NOW + 360_000,
    });
    expect(reserve).toHaveBeenCalledExactlyOnceWith({
      replayKey: createDpopReplayKey(policy.effectiveNamespace, JKT, 'fresh-proof'),
      expiresAt: NOW + 360_000,
    });
  });

  it('maps actual capacity to 503, duplicates to invalid-proof, and never evicts a live reservation', async () => {
    const { policy, reserve } = fixture({ maxEntries: 1 });
    await expect(policy.verifyAndReserve(prechecked({ jti: 'reserved' }))).resolves.toMatchObject({ type: 'accepted' });
    await expect(policy.verifyAndReserve(prechecked({ jti: 'new-proof' }))).rejects.toSatisfy(
      (error: unknown) => toErrorPayload(error).code === UNAVAILABLE.code,
    );
    await expect(policy.verifyAndReserve(prechecked({ jti: 'reserved' }))).rejects.toSatisfy(
      (error: unknown) => toErrorPayload(error).code === INVALID.code,
    );
    expect(reserve).toHaveBeenCalledTimes(3);
  });

  it('keeps the reservation through downstream failure and requires a new proof rather than release/renewal', async () => {
    const { policy, reserve } = fixture();
    await policy.verifyAndReserve(prechecked());
    const downstream = vi.fn(async () => {
      throw new Error('provider/consume/issuer failure after reservation');
    });
    await expect(downstream()).rejects.toThrow('after reservation');
    await expect(policy.verifyAndReserve(prechecked())).rejects.toSatisfy(
      (error: unknown) => toErrorPayload(error).code === INVALID.code,
    );
    await expect(policy.verifyAndReserve(prechecked({ jti: 'fresh-retry' }))).resolves.toMatchObject({
      type: 'accepted',
    });
    expect(reserve).toHaveBeenCalledTimes(3);
    expect(Object.keys(policy)).toEqual(['effectiveNamespace', 'verifyAndReserve']);
  });

  it('does not extend duplicate expiry and readmits the same key/JTI only with a fresh live proof after expiry', async () => {
    const { clock, policy, reserve } = fixture({ maxEntries: 1 });
    await policy.verifyAndReserve(prechecked());
    clock.value += 2000;
    await expect(policy.verifyAndReserve(prechecked({ iat: clock.value / 1000 }))).rejects.toSatisfy(
      (error: unknown) => toErrorPayload(error).code === INVALID.code,
    );
    clock.value = NOW + 65_000;
    await expect(policy.verifyAndReserve(prechecked())).rejects.toSatisfy(
      (error: unknown) => toErrorPayload(error).code === INVALID.code,
    );
    expect(reserve).toHaveBeenCalledTimes(2);
    await expect(policy.verifyAndReserve(prechecked({ iat: clock.value / 1000 }))).resolves.toMatchObject({
      type: 'accepted',
      expiresAt: clock.value + 65_000,
    });
    expect(reserve).toHaveBeenCalledTimes(3);
  });

  it('maps response-time store expiry to invalid-proof and never retries an uncertain committed store failure', async () => {
    const { clock, store, reserve, originalReserve: original } = fixture();
    reserve.mockImplementationOnce(async (input) => {
      clock.value = input.expiresAt;
      return original(input);
    });
    const policy = createDpopReplayPolicy({
      protectionSpace: API_SPACE,
      proofOptions: resolved(),
      replayStore: store,
      now: () => NOW,
    });
    await expect(policy.verifyAndReserve(prechecked())).rejects.toSatisfy(
      (error: unknown) => toErrorPayload(error).code === INVALID.code,
    );
    expect(reserve).toHaveBeenCalledTimes(1);
    clock.value = NOW;
    reserve.mockImplementationOnce(async (input) => {
      await original(input);
      throw new Error('connection lost after commit');
    });
    await expect(policy.verifyAndReserve(prechecked())).rejects.toSatisfy(
      (error: unknown) => toErrorPayload(error).code === UNAVAILABLE.code,
    );
    await expect(policy.verifyAndReserve(prechecked())).rejects.toSatisfy(
      (error: unknown) => toErrorPayload(error).code === INVALID.code,
    );
    expect(reserve).toHaveBeenCalledTimes(3);
  });
});

describe('DBJWT-07 multi-instance-emulated atomic orchestration with a real shared provider', () => {
  it('gives real signed proofs with the same key/JTI exactly one winner across independent contexts, tokens and routes', async () => {
    const { privateKey, publicKey } = await generateKeyPair('ES256');
    const jwk = await exportJWK(publicKey);
    const jkt = await calculateJwkThumbprint(jwk);
    const tokenKey = new Uint8Array(32).fill(83);
    const store = createMemoryOidcVaultStore({ now: () => NOW });
    const reserve = vi.spyOn(store, 'reserveDpopProof');
    // Separate clients/closures share only the provider object, not policy state.
    const contexts = Array.from({ length: 12 }, () =>
      createDpopReplayPolicy({
        protectionSpace: API_SPACE,
        proofOptions: resolved(),
        now: () => NOW,
        replayStore: {
          reserveDpopProof: async (input) => {
            await Promise.resolve();
            return store.reserveDpopProof(input);
          },
        },
      }),
    );
    const presentations = await Promise.all(
      contexts.map(async (_, index) => {
        const target = `https://api.example.com/resource/${index}`;
        const token = await new SignJWT({ cnf: { jkt }, fixtureTokenId: index })
          .setProtectedHeader({ alg: 'HS256' })
          .setSubject('fixture-user')
          .setIssuer('fixture-issuer')
          .setAudience('fixture-api')
          .sign(tokenKey);
        const proof = await new SignJWT({
          iat: NOW / 1000,
          jti: 'shared-authenticated-jti',
          htm: 'GET',
          htu: target,
          ath: createHash('sha256').update(token, 'ascii').digest('base64url'),
        })
          .setProtectedHeader({ typ: 'dpop+jwt', alg: 'ES256', jwk })
          .sign(privateKey);
        return { target, token, proof };
      }),
    );
    const verified = vi.fn(async ({ target, token, proof }: (typeof presentations)[number]) => {
      // Test-only known-key verification exercises the explicit trust boundary.
      // It is not the full RFC/header/request verifier owned by DBJWT-06.
      const access = await jwtVerify(token, tokenKey, {
        algorithms: ['HS256'],
        issuer: 'fixture-issuer',
        audience: 'fixture-api',
      });
      const dpop = await jwtVerify(proof, publicKey, { algorithms: ['ES256'] });
      expect(access.payload.cnf).toEqual({ jkt });
      expect(dpop.payload).toMatchObject({
        htm: 'GET',
        htu: target,
        ath: createHash('sha256').update(token, 'ascii').digest('base64url'),
      });
      return {
        binding: { type: 'dpop' as const, jkt, alg: 'ES256' as const },
        iat: dpop.payload.iat,
        jti: dpop.payload.jti,
      };
    });
    const attacker = await generateKeyPair('ES256');
    const invalidSignature = await new SignJWT({ iat: NOW / 1000, jti: 'shared-authenticated-jti' })
      .setProtectedHeader({ typ: 'dpop+jwt', alg: 'ES256', jwk })
      .sign(attacker.privateKey);
    await expect(
      contexts[0]!.verifyAndReserve(() => verified({ ...presentations[0]!, proof: invalidSignature })),
    ).rejects.toThrow('signature verification failed');
    expect(reserve).not.toHaveBeenCalled();
    verified.mockClear();
    const results = await Promise.allSettled(
      contexts.map((context, index) => context.verifyAndReserve(() => verified(presentations[index]!))),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const losers = results.filter((result) => result.status === 'rejected');
    expect(losers).toHaveLength(11);
    for (const loser of losers) if (loser.status === 'rejected') expect(toErrorPayload(loser.reason)).toEqual(INVALID);
    expect(verified).toHaveBeenCalledTimes(12);
    expect(reserve).toHaveBeenCalledTimes(12);
    expect(new Set(reserve.mock.calls.map(([input]) => input.replayKey))).toHaveLength(1);
    expect(new Set(presentations.map(({ token }) => token))).toHaveLength(12);
    expect(new Set(presentations.map(({ target }) => target))).toHaveLength(12);
  });

  it('shares vault replay across different live code/session targets before any one-time consume', async () => {
    const { store, policy, reserve } = fixture({ protectionSpace: VAULT_SPACE });
    const other = createDpopReplayPolicy({
      protectionSpace: VAULT_SPACE,
      proofOptions: resolved(),
      replayStore: store,
      now: () => NOW,
    });
    for (const id of ['first', 'second']) {
      await store.createSession({
        sessionId: id,
        subject: 'same-user',
        refreshToken: `refresh-${id}`,
        idToken: `id-${id}`,
        provider: { issuer: VAULT_SPACE.issuer, clientId: VAULT_SPACE.clientId },
        deviceBinding: { type: 'dpop', jkt: JKT },
      });
      await store.createExchangeCode({
        code: `code-${id}`,
        sessionId: id,
        createdAt: NOW,
        expiresAt: NOW + 30_000,
        deviceBinding: { type: 'dpop', jkt: JKT },
        browserBindingHash: JKT,
      });
    }
    const preflight = (id: string) => async () => {
      const code = await store.getExchangeCode(`code-${id}`);
      const session = await store.getSession(id);
      expect(code?.sessionId).toBe(id);
      expect(session?.provider).toEqual({ issuer: VAULT_SPACE.issuer, clientId: VAULT_SPACE.clientId });
      expect(session?.deviceBinding).toEqual(code?.deviceBinding);
      return prechecked()(); // Unit prechecked proof; target preflight is real and non-consuming.
    };
    const results = await Promise.allSettled([
      policy.verifyAndReserve(preflight('first')),
      other.verifyAndReserve(preflight('second')),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(reserve).toHaveBeenCalledTimes(2);
    expect(await store.getExchangeCode('code-first')).not.toBeNull();
    expect(await store.getExchangeCode('code-second')).not.toBeNull();
    expect(await store.getSession('first')).not.toBeNull();
    expect(await store.getSession('second')).not.toBeNull();
  });

  it('allows separate protection spaces but demonstrates that independent memory stores cannot reject cross-process replay', async () => {
    const { store, policy } = fixture();
    const separateSpace = createDpopReplayPolicy({
      protectionSpace: { ...API_SPACE, replayNamespace: 'other-api' },
      proofOptions: resolved(),
      replayStore: store,
      now: () => NOW,
    });
    await expect(policy.verifyAndReserve(prechecked())).resolves.toMatchObject({ type: 'accepted' });
    await expect(separateSpace.verifyAndReserve(prechecked())).resolves.toMatchObject({ type: 'accepted' });
    await expect(fixture().policy.verifyAndReserve(prechecked())).resolves.toMatchObject({ type: 'accepted' });
  });
});

describe('DBJWT-07 nonce orchestration before replay, and sanitized data for later HTTP integration', () => {
  it('is off by default and accepts bounded optional nonce strings without issuing a challenge', async () => {
    const { policy, reserve } = fixture();
    const accepted = await policy.verifyAndReserve(prechecked());
    expect(accepted.type).toBe('accepted');
    expect(accepted).not.toHaveProperty('nonce');
    await expect(
      policy.verifyAndReserve(prechecked({ nonce: 'x'.repeat(512), jti: 'nonce-off' })),
    ).resolves.toMatchObject({ type: 'accepted' });
    expect(reserve).toHaveBeenCalledTimes(2);
  });

  it.each([null, 123, {}, 'x'.repeat(513), 'é'.repeat(257)])(
    'rejects invalid nonce type/byte bounds %j even when nonce policy is off',
    async (nonce) => {
      const { policy, reserve } = fixture();
      await expect(policy.verifyAndReserve(prechecked({ nonce }))).rejects.toSatisfy(
        (error: unknown) => toErrorPayload(error).code === INVALID.code,
      );
      expect(reserve).not.toHaveBeenCalled();
    },
  );

  it.each(['vault-post', 'api'] as const)(
    'maps a %s challenge to one nonce, fixed JSON, correct status/challenge and no-store',
    async (endpoint) => {
      const { policy, reserve } = fixture({
        proofOptions: { algorithms: ['ES256', 'PS256', 'RS256'], nonce: { secret: SECRET } },
      });
      const result = await policy.verifyAndReserve(prechecked());
      const nonce = getChallenge(result);
      if (result.type !== 'nonce-challenge') throw new Error('Expected challenge.');
      const mapped = toDpopNonceChallengeResponse(result, endpoint, ['ES256', 'PS256', 'RS256']);
      expect(mapped).toEqual({
        status: endpoint === 'api' ? 401 : 400,
        body: { code: 'OIDC_VAULT_USE_DPOP_NONCE', message: 'A fresh DPoP nonce is required.' },
        headers: {
          'Cache-Control': 'no-store',
          'DPoP-Nonce': nonce,
          ...(endpoint === 'api'
            ? { 'WWW-Authenticate': 'DPoP error="use_dpop_nonce", algs="ES256 PS256 RS256"' }
            : {}),
        },
      });
      expect(Object.keys(mapped.headers).filter((key) => key.toLowerCase() === 'dpop-nonce')).toHaveLength(1);
      expect(JSON.stringify(mapped)).not.toContain('error_description');
      expect(reserve).not.toHaveBeenCalled();
      expect(Object.isFrozen(mapped.body)).toBe(true);
      expect(Object.isFrozen(mapped.headers)).toBe(true);
    },
  );

  it.each(['', 'x'.repeat(513), 'v1.malformed.mac', 'nonce\r\nInjected: true', 'é'.repeat(256)])(
    'refuses an unsafe/arbitrary nonce response value %j instead of writing it into a header',
    (nonce) => {
      expect(() => toDpopNonceChallengeResponse({ type: 'nonce-challenge', nonce }, 'api', ['ES256'])).toThrow(
        'server-issued',
      );
    },
  );

  it('refuses unsupported challenge algorithms and endpoint values before HTTP writing', async () => {
    const { policy } = fixture({ proofOptions: { nonce: { secret: SECRET } } });
    const result = await policy.verifyAndReserve(prechecked());
    if (result.type !== 'nonce-challenge') throw new Error('Expected challenge.');
    expect(() => toDpopNonceChallengeResponse(result, 'api', ['HS256'] as never)).toThrow('algorithm allowlist');
    expect(() => toDpopNonceChallengeResponse(result, 'api', [])).toThrow('algorithm allowlist');
    expect(() => toDpopNonceChallengeResponse(result, 'callback' as never, ['ES256'])).toThrow('endpoint');
  });

  it('accepts any live nonce across instances for parallel fresh proofs, issues only on challenges, and still consumes each JTI once', async () => {
    const { policy, store, reserve } = fixture({ proofOptions: { nonce: { secret: SECRET } } });
    const other = createDpopReplayPolicy({
      protectionSpace: API_SPACE,
      proofOptions: resolved({ nonce: { secret: Uint8Array.from(SECRET) } }),
      replayStore: store,
      now: () => NOW,
    });
    const older = getChallenge(await policy.verifyAndReserve(prechecked()));
    const newer = getChallenge(await other.verifyAndReserve(prechecked()));
    expect(older).not.toBe(newer);
    expect(reserve).not.toHaveBeenCalled();
    const results = await Promise.all(
      Array.from({ length: 16 }, (_, index) =>
        (index % 2 ? policy : other).verifyAndReserve(
          prechecked({ nonce: index % 2 ? older : newer, jti: `parallel-${index}` }),
        ),
      ),
    );
    expect(results.every((result) => result.type === 'accepted')).toBe(true);
    expect(results.every((result) => !('nonce' in result))).toBe(true);
    expect(reserve).toHaveBeenCalledTimes(16);
    await expect(other.verifyAndReserve(prechecked({ nonce: older, jti: 'parallel-0' }))).rejects.toSatisfy(
      (error: unknown) => toErrorPayload(error).code === INVALID.code,
    );
  });

  it.each(['missing', 'expired', 'wrong key', 'wrong context', 'wrong secret', 'malformed', 'oversized', 'non-string'])(
    'challenges an otherwise-valid proof with %s nonce without replay allocation',
    async (kind) => {
      const { clock, policy, reserve } = fixture({ proofOptions: { nonce: { secret: SECRET } }, maxEntries: 1 });
      const signer = createDpopNoncePolicy({ secret: SECRET, namespace: JSON.stringify(policy.effectiveNamespace) });
      const nonce: unknown =
        kind === 'missing'
          ? undefined
          : kind === 'expired'
            ? signer.issue(JKT, NOW - 60_000)
            : kind === 'wrong key'
              ? signer.issue(OTHER_JKT, NOW)
              : kind === 'wrong context'
                ? createDpopNoncePolicy({
                    secret: SECRET,
                    namespace: JSON.stringify(resolveDpopEffectiveNamespace(VAULT_SPACE)),
                  }).issue(JKT, NOW)
                : kind === 'wrong secret'
                  ? createDpopNoncePolicy({
                      secret: new Uint8Array(32).fill(79),
                      namespace: JSON.stringify(policy.effectiveNamespace),
                    }).issue(JKT, NOW)
                  : kind === 'malformed'
                    ? 'v1.malformed.mac'
                    : kind === 'oversized'
                      ? 'x'.repeat(513)
                      : { nonce: 'not-a-string' };
      const challenge = getChallenge(await policy.verifyAndReserve(prechecked({ nonce })));
      expect(reserve).not.toHaveBeenCalled();
      expect(signer.verify(challenge, JKT, clock.value)).toBe(true);
      await expect(
        policy.verifyAndReserve(prechecked({ nonce: challenge, jti: 'fresh-capacity-probe' })),
      ).resolves.toMatchObject({ type: 'accepted' });
      expect(reserve).toHaveBeenCalledTimes(1);
    },
  );

  it('snapshots mutable namespace/resolved secret data and challenges after secret rotation without retaining the old secret', async () => {
    const space = { ...API_SPACE };
    const proofOptions = resolved({ nonce: { secret: SECRET } });
    const store = createMemoryOidcVaultStore({ now: () => NOW });
    const reserve = vi.spyOn(store, 'reserveDpopProof');
    const policy = createDpopReplayPolicy({ protectionSpace: space, proofOptions, replayStore: store, now: () => NOW });
    space.replayNamespace = 'mutated-api' as typeof space.replayNamespace;
    if (proofOptions.nonce) proofOptions.nonce.secret.fill(113);
    const nonce = getChallenge(await policy.verifyAndReserve(prechecked()));
    expect(
      createDpopNoncePolicy({
        secret: SECRET,
        namespace: JSON.stringify(resolveDpopEffectiveNamespace(API_SPACE)),
      }).verify(nonce, JKT, NOW),
    ).toBe(true);
    const rotated = createDpopReplayPolicy({
      protectionSpace: API_SPACE,
      proofOptions,
      replayStore: store,
      now: () => NOW,
    });
    const newNonce = getChallenge(await rotated.verifyAndReserve(prechecked({ nonce })));
    expect(reserve).not.toHaveBeenCalled();
    await expect(
      rotated.verifyAndReserve(prechecked({ nonce: newNonce, jti: 'rotated-secret-fresh-proof' })),
    ).resolves.toMatchObject({ type: 'accepted' });
  });
});
