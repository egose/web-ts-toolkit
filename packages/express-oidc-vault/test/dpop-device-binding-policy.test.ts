import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { createMemoryOidcVaultStore } from '../../express-oidc-vault-memory-store/src/index';
import {
  assertDeviceBindingPolicy,
  resolveDeviceBindingOptions,
  resolveVerifiedDeviceBinding,
  snapshotDpopBinding,
  withSessionDeviceBinding,
} from '../src/device-binding-policy';
import { toErrorPayload } from '../src/errors';
import {
  createOidcVaultMiddleware,
  type OidcVaultDeviceBindingOptions,
  type OidcVaultDeviceBindingStoreProvider,
  type OidcVaultOptions,
  type OidcVaultVerifiedDpopBinding,
} from '../src/index';

const CAPABILITIES = [
  'getAuthorizationTransaction',
  'consumeAuthorizationTransactionIfMatches',
  'getExchangeCode',
  'consumeExchangeCodeIfMatches',
  'getSessionRevocationContext',
  'reserveDpopProof',
] as const;

// Construction-only doubles, not an implementation of guarded consumption or
// replay. Real provider operations/conformance belong to DBJWT-08.
const constructionStore = (): OidcVaultDeviceBindingStoreProvider =>
  Object.assign(createMemoryOidcVaultStore(), {
    getAuthorizationTransaction: vi.fn(async () => null),
    consumeAuthorizationTransactionIfMatches: vi.fn(async () => null),
    getExchangeCode: vi.fn(async () => null),
    consumeExchangeCodeIfMatches: vi.fn(async () => null),
    getSessionRevocationContext: vi.fn(async () => null),
    reserveDpopProof: vi.fn(async () => false),
  });

const options = (overrides: Partial<OidcVaultOptions> = {}): OidcVaultOptions => ({
  backendOrigin: 'https://api.example.com',
  storeProvider: constructionStore(),
  config: {
    issuer: 'https://issuer.example.com',
    clientId: 'client_1',
    authorizationEndpoint: 'https://issuer.example.com/authorize',
    tokenEndpoint: 'https://issuer.example.com/token',
    jwksUri: 'https://issuer.example.com/jwks',
  },
  deviceBinding: {},
  ...overrides,
});

describe('DBJWT-03 device binding construction boundary', () => {
  it('keeps old bearer stores and HTTP origin normalization working when binding is omitted', () => {
    const input = options({
      backendOrigin: 'http://api.example.com/previously-accepted-path',
      storeProvider: createMemoryOidcVaultStore(),
      deviceBinding: undefined,
    });
    expect(() => createOidcVaultMiddleware(input)).not.toThrow();
    expect(input.backendOrigin).toBe('http://api.example.com/previously-accepted-path');
  });

  it('accepts the optional defaults and the complete explicit proof/nonce profile', () => {
    expect(() => createOidcVaultMiddleware(options())).not.toThrow();
    expect(() =>
      createOidcVaultMiddleware(
        options({
          deviceBinding: {
            mode: 'required',
            algorithms: Object.freeze(['ES256', 'PS256', 'RS256'] as const),
            proofMaxAgeSeconds: 300,
            clockSkewSeconds: 30,
            nonce: { secret: new Uint8Array(32).fill(17), lifetimeSeconds: 300 },
          },
        }),
      ),
    ).not.toThrow();
  });

  it.each(CAPABILITIES)('requires the %s capability without invoking any provider operation', (capability) => {
    const store = constructionStore();
    // Explicitly shadow a future built-in prototype implementation as well.
    Object.assign(store, { [capability]: undefined });
    expect(() => createOidcVaultMiddleware(options({ storeProvider: store }))).toThrow(capability);
    for (const name of CAPABILITIES) {
      if (name !== capability) expect(store[name]).not.toHaveBeenCalled();
    }
  });

  it('does not accept a non-function capability or install a replay fallback', () => {
    const store = constructionStore();
    Object.assign(store, { reserveDpopProof: true });
    expect(() => createOidcVaultMiddleware(options({ storeProvider: store }))).toThrow('reserveDpopProof');
    expect(store.getAuthorizationTransaction).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'null options', value: null },
    { name: 'boolean options', value: false },
    { name: 'array options', value: [] },
    { name: 'non-plain options', value: new Date() },
    { name: 'unknown mode', value: { mode: 'disabled' } },
    { name: 'null mode', value: { mode: null } },
    { name: 'empty algorithms', value: { algorithms: [] } },
    { name: 'non-array algorithms', value: { algorithms: 'ES256' } },
    { name: 'symmetric proof algorithm', value: { algorithms: ['HS256'] } },
    { name: 'unsigned proof algorithm', value: { algorithms: ['none'] } },
    { name: 'other curve algorithm', value: { algorithms: ['ES384'] } },
    { name: 'mixed invalid allowlist', value: { algorithms: ['ES256', 'EdDSA'] } },
    { name: 'zero age', value: { proofMaxAgeSeconds: 0 } },
    { name: 'negative age', value: { proofMaxAgeSeconds: -1 } },
    { name: 'fractional age', value: { proofMaxAgeSeconds: 1.5 } },
    { name: 'excessive age', value: { proofMaxAgeSeconds: 301 } },
    { name: 'nonfinite age', value: { proofMaxAgeSeconds: Infinity } },
    { name: 'null age', value: { proofMaxAgeSeconds: null } },
    { name: 'negative skew', value: { clockSkewSeconds: -1 } },
    { name: 'fractional skew', value: { clockSkewSeconds: 0.5 } },
    { name: 'excessive skew', value: { clockSkewSeconds: 31 } },
    { name: 'nonfinite skew', value: { clockSkewSeconds: NaN } },
    { name: 'null nonce', value: { nonce: null } },
    { name: 'boolean nonce', value: { nonce: true } },
    { name: 'array nonce', value: { nonce: [] } },
    { name: 'missing nonce secret', value: { nonce: {} } },
    { name: 'short nonce secret', value: { nonce: { secret: new Uint8Array(31) } } },
    { name: 'string nonce secret', value: { nonce: { secret: 'private-configuration-secret' } } }, // pragma: allowlist secret
    { name: 'zero nonce lifetime', value: { nonce: { secret: new Uint8Array(32), lifetimeSeconds: 0 } } },
    { name: 'fractional nonce lifetime', value: { nonce: { secret: new Uint8Array(32), lifetimeSeconds: 1.5 } } },
    { name: 'excessive nonce lifetime', value: { nonce: { secret: new Uint8Array(32), lifetimeSeconds: 301 } } },
  ])('fails fast for $name', ({ value }) => {
    const store = constructionStore();
    expect(() =>
      createOidcVaultMiddleware(
        options({ storeProvider: store, deviceBinding: value as OidcVaultDeviceBindingOptions }),
      ),
    ).toThrow('deviceBinding');
    expect(store.reserveDpopProof).not.toHaveBeenCalled();
  });

  it.each([
    'http://api.example.com',
    'http://0.0.0.0:3000',
    'http://localhost.example.com:3000',
    'http://127.evil.example:3000',
    'https://user:password@api.example.com', // pragma: allowlist secret
    'https://@api.example.com',
    'https://api.example.com/auth',
    'https://api.example.com/?tenant=1',
    'https://api.example.com/#fragment',
  ])('rejects an enabled binding backendOrigin that is not a secure static origin: %s', (backendOrigin) => {
    expect(() => createOidcVaultMiddleware(options({ backendOrigin }))).toThrow('backendOrigin');
  });

  it.each(['https://API.example.com:443/', 'http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000'])(
    'accepts the HTTPS or loopback development origin %s',
    (backendOrigin) => {
      expect(() => createOidcVaultMiddleware(options({ backendOrigin }))).not.toThrow();
    },
  );

  it('accepts frozen caller containers without replacing or normalizing their values', () => {
    const input = options({
      backendOrigin: 'https://API.example.com:443/',
      deviceBinding: Object.freeze({
        algorithms: Object.freeze(['ES256'] as const),
        nonce: Object.freeze({ secret: new Uint8Array(32).fill(23) }),
      }),
    });
    Object.freeze(input.config);
    Object.freeze(input);
    const binding = input.deviceBinding;
    const secret = binding?.nonce && binding.nonce.secret;
    expect(() => createOidcVaultMiddleware(input)).not.toThrow();
    expect(input.deviceBinding).toBe(binding);
    expect(binding?.nonce && binding.nonce.secret).toBe(secret);
    expect(input.backendOrigin).toBe('https://API.example.com:443/');
    expect(binding).not.toHaveProperty('mode');
  });
});

const JKT_A = createHash('sha256').update('policy-key-a').digest('base64url');
const JKT_B = createHash('sha256').update('policy-key-b').digest('base64url');
const KEY_A: OidcVaultVerifiedDpopBinding = { type: 'dpop', jkt: JKT_A, alg: 'ES256' };

describe('DBJWT-03 policy and immutable security-context primitives (not handler activation)', () => {
  it('resolves the frozen approved defaults, including nonce off', () => {
    const resolved = resolveDeviceBindingOptions({});
    expect(resolved).toEqual({
      mode: 'optional',
      algorithms: ['ES256'],
      proofMaxAgeSeconds: 60,
      clockSkewSeconds: 5,
      nonce: false,
    });
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(resolved?.algorithms)).toBe(true);
    expect(resolveDeviceBindingOptions(undefined)).toBeUndefined();
  });

  it('keeps reused policy instances isolated from later caller/container/nonce mutations', () => {
    const algorithms: OidcVaultVerifiedDpopBinding['alg'][] = ['ES256'];
    const bytes = Buffer.alloc(64, 29);
    const secret = bytes.subarray(16, 48);
    const input: OidcVaultDeviceBindingOptions = {
      algorithms,
      proofMaxAgeSeconds: 60,
      clockSkewSeconds: 0,
      nonce: { secret, lifetimeSeconds: 1 },
    };
    const first = resolveDeviceBindingOptions(input);
    input.mode = 'required';
    input.proofMaxAgeSeconds = 300;
    algorithms[0] = 'PS256';
    bytes.fill(47);
    if (input.nonce) input.nonce.lifetimeSeconds = 300;
    const second = resolveDeviceBindingOptions(input);

    expect(first).toMatchObject({
      mode: 'optional',
      algorithms: ['ES256'],
      proofMaxAgeSeconds: 60,
      clockSkewSeconds: 0,
    });
    expect(second).toMatchObject({ mode: 'required', algorithms: ['PS256'], proofMaxAgeSeconds: 300 });
    expect(first?.nonce).toMatchObject({ secret: new Uint8Array(32).fill(29), lifetimeSeconds: 1 });
    expect(second?.nonce).toMatchObject({ secret: new Uint8Array(32).fill(47), lifetimeSeconds: 300 });
    expect(first?.nonce && Object.isFrozen(first.nonce)).toBe(true);
    expect(first?.nonce && first.nonce.secret).not.toBe(secret);
    expect(first?.nonce && first.nonce.secret.buffer).not.toBe(bytes.buffer);
  });

  it('captures allowed option/algorithm getters once and ignores extension getters', () => {
    const algorithm = vi.fn().mockReturnValueOnce('ES256').mockReturnValue('HS256');
    const mode = vi.fn(() => 'optional' as const);
    const extra = vi.fn(() => {
      throw new Error('private-extra-option');
    });
    const allowlist: OidcVaultVerifiedDpopBinding['alg'][] = [];
    Object.defineProperty(allowlist, 0, { enumerable: true, get: algorithm });
    const input = {
      get mode() {
        return mode();
      },
      algorithms: allowlist,
      get extra() {
        return extra();
      },
    };
    const resolved = resolveDeviceBindingOptions(input);
    expect(resolved?.algorithms).toEqual(['ES256']);
    expect(mode).toHaveBeenCalledTimes(1);
    expect(algorithm).toHaveBeenCalledTimes(1);
    expect(extra).not.toHaveBeenCalled();
  });

  it.each([undefined, {}, { mode: 'optional' as const }])(
    'allows unbound context under disabled/optional policy %j',
    (policy) => {
      const resolved = resolveDeviceBindingOptions(policy);
      expect(() => assertDeviceBindingPolicy(resolved, undefined)).not.toThrow();
      expect(resolveVerifiedDeviceBinding(resolved, undefined, undefined)).toBeUndefined();
    },
  );

  it('rejects required unbound context with the approved sanitized error before mutation work', () => {
    const mutate = vi.fn();
    let error: unknown;
    try {
      assertDeviceBindingPolicy(resolveDeviceBindingOptions({ mode: 'required' }), undefined);
      mutate();
    } catch (caught) {
      error = caught;
    }
    expect(mutate).not.toHaveBeenCalled();
    expect(toErrorPayload(error)).toEqual({
      status: 401,
      code: 'OIDC_VAULT_DEVICE_BINDING_REQUIRED',
      message: 'A device-bound login is required.',
    });
  });

  it.each([undefined, {}, { mode: 'required' as const }])(
    'never accepts a bound context without policy/proof %j',
    (policy) => {
      let error: unknown;
      try {
        resolveVerifiedDeviceBinding(resolveDeviceBindingOptions(policy), KEY_A, undefined);
      } catch (caught) {
        error = caught;
      }
      expect(toErrorPayload(error)).toEqual({
        status: 401,
        code: 'OIDC_VAULT_DPOP_REQUIRED',
        message: 'DPoP authentication is required.',
      });
    },
  );

  it('does not enroll an optional legacy record from an otherwise verified supplied proof', () => {
    expect(resolveVerifiedDeviceBinding(resolveDeviceBindingOptions({}), undefined, KEY_A)).toBeUndefined();
  });

  it.each(['optional', 'required'] as const)('uses immutable stored key/current algorithm context in %s', (mode) => {
    const stored = { type: 'dpop' as const, jkt: JKT_A };
    const proof = { ...KEY_A };
    const binding = resolveVerifiedDeviceBinding(resolveDeviceBindingOptions({ mode }), stored, proof);
    stored.jkt = JKT_B;
    proof.jkt = JKT_B;
    proof.alg = 'PS256';
    expect(binding).toEqual(KEY_A);
    expect(Object.isFrozen(binding)).toBe(true);
    expect(binding).not.toBe(proof);
  });

  it.each(['PS256', 'RS256'] as const)(
    'accepts verified %s context only under its explicit current allowlist',
    (alg) => {
      const binding = resolveVerifiedDeviceBinding(resolveDeviceBindingOptions({ algorithms: [alg] }), KEY_A, {
        ...KEY_A,
        alg,
      });
      expect(binding).toEqual({ ...KEY_A, alg });
      expect(snapshotDpopBinding(binding)).toEqual({ type: 'dpop', jkt: JKT_A });
    },
  );

  it.each([
    { name: 'wrong key', proof: { ...KEY_A, jkt: JKT_B } },
    { name: 'currently disabled algorithm', proof: { ...KEY_A, alg: 'PS256' } },
    { name: 'symmetric algorithm', proof: { ...KEY_A, alg: 'HS256' } },
    { name: 'missing algorithm', proof: { type: 'dpop', jkt: JKT_A } },
  ])('rejects $name without reclassifying the original binding', ({ proof }) => {
    const original = { type: 'dpop' as const, jkt: JKT_A };
    let error: unknown;
    try {
      resolveVerifiedDeviceBinding(resolveDeviceBindingOptions({}), original, proof as OidcVaultVerifiedDpopBinding);
    } catch (caught) {
      error = caught;
    }
    expect(original).toEqual({ type: 'dpop', jkt: JKT_A });
    expect(toErrorPayload(error)).toEqual({
      status: 401,
      code: 'OIDC_VAULT_INVALID_DPOP_PROOF',
      message: 'DPoP proof validation failed.',
    });
    expect(error).toHaveProperty('message', expect.not.stringContaining(JKT_B));
  });

  it.each([
    null,
    [],
    'dpop',
    { type: 'other', jkt: JKT_A },
    { type: 'dpop' },
    { type: 'dpop', jkt: null },
    { type: 'dpop', jkt: `${JKT_A}=` },
    { type: 'dpop', jkt: `${JKT_A.slice(0, -1)}B` },
  ])('treats malformed stored binding %j as invalid, never legacy', (binding) => {
    expect(() => snapshotDpopBinding(binding)).toThrow();
    try {
      snapshotDpopBinding(binding);
    } catch (error) {
      expect(toErrorPayload(error)).toMatchObject({ status: 401, code: 'OIDC_VAULT_INVALID_DPOP_PROOF' });
    }
  });

  it('restores bound precreate-hook removal/rebind attempts and strips attempted unbound enrollment', () => {
    const original = { type: 'dpop' as const, jkt: JKT_A };
    const snapshot = snapshotDpopBinding(original);
    const hookSession = { deviceBinding: original, metadata: { application: 'kept' } };
    hookSession.deviceBinding.jkt = JKT_B;
    const restored = withSessionDeviceBinding(hookSession, snapshot);
    expect(restored).toEqual({ deviceBinding: { type: 'dpop', jkt: JKT_A }, metadata: { application: 'kept' } });
    expect(Object.isFrozen(restored.deviceBinding)).toBe(true);
    expect(withSessionDeviceBinding({ metadata: hookSession.metadata }, snapshot).deviceBinding).toEqual(snapshot);
    expect(withSessionDeviceBinding(hookSession, undefined)).not.toHaveProperty('deviceBinding');
    expect(hookSession.deviceBinding.jkt).toBe(JKT_B);
  });
});
