import { base64url, SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';

import { createOidcVaultDpopSession, type OidcVaultSessionOptions } from '../src/auth-session';
import { parseBearerCredentials, parseDpopCredentials, readBearerPeerToken, readPeerToken } from '../src/credentials';
import { OidcVaultDpopClientError } from '../src/errors';

const JKT = 'A'.repeat(43);
const WRONG_JKT = 'B'.repeat(42) + 'A';
const NOW = 1_800_000_000_000;
const HMAC_SECRET = new TextEncoder().encode('0123456789abcdef0123456789abcdef'); // pragma: allowlist secret

const mint = (cnf: unknown, exp: unknown): Promise<string> => {
  const claims: Record<string, unknown> = { cnf, exp };
  return new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).sign(HMAC_SECRET);
};

const responseFor = (accessToken: string, expiresIn = 60) => ({
  accessToken,
  tokenType: 'DPoP',
  expiresIn,
  sessionId: 'rotated-handle',
});

const codeOf = (fn: () => unknown): string => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(OidcVaultDpopClientError);
    return (error as OidcVaultDpopClientError).code;
  }
  throw new Error('expected OidcVaultDpopClientError');
};

describe('CLIENT-05 parseDpopCredentials', () => {
  it('body transport requires sessionId and returns it', async () => {
    const accessToken = await mint({ jkt: JKT }, 1_800_000_600);
    const parsed = parseDpopCredentials(
      { accessToken, tokenType: 'DPoP', expiresIn: 120, sessionId: 'handle' },
      'body',
      JKT,
      NOW,
    );
    expect(parsed.sessionId).toBe('handle');
    expect(parsed.token).toMatchObject({ accessToken, tokenType: 'DPoP', jkt: JKT });
    expect(Object.isFrozen(parsed.token)).toBe(true);
  });

  it('body transport without sessionId is rejected', async () => {
    const accessToken = await mint({ jkt: JKT }, 1_800_000_600);
    expect(
      codeOf(() => parseDpopCredentials({ accessToken, tokenType: 'DPoP', expiresIn: 60 }, 'body', JKT, NOW)),
    ).toBe('INVALID_BOUND_CREDENTIAL_RESPONSE');
  });

  it('cookie transport forbids sessionId', async () => {
    const accessToken = await mint({ jkt: JKT }, 1_800_000_600);
    expect(
      codeOf(() =>
        parseDpopCredentials(
          { accessToken, tokenType: 'DPoP', expiresIn: 60, sessionId: 'handle' },
          'cookie',
          JKT,
          NOW,
        ),
      ),
    ).toBe('INVALID_BOUND_CREDENTIAL_RESPONSE');
    const parsed = parseDpopCredentials({ accessToken, tokenType: 'DPoP', expiresIn: 60 }, 'cookie', JKT, NOW);
    expect(parsed.sessionId).toBeUndefined();
  });

  it.each(['Bearer', 'dpop', undefined, 'DPoP '])('requires exact tokenType DPoP (got %j)', async (tokenType) => {
    const accessToken = await mint({ jkt: JKT }, 1_800_000_600);
    expect(
      codeOf(() => parseDpopCredentials({ accessToken, tokenType, expiresIn: 60, sessionId: 'h' }, 'body', JKT, NOW)),
    ).toBe('INVALID_BOUND_CREDENTIAL_RESPONSE');
  });

  it('cnf.jkt mismatch is rejected with INVALID_BOUND_CREDENTIAL_RESPONSE', async () => {
    const accessToken = await mint({ jkt: WRONG_JKT }, 1_800_000_600);
    expect(
      codeOf(() =>
        parseDpopCredentials({ accessToken, tokenType: 'DPoP', expiresIn: 60, sessionId: 'h' }, 'body', JKT, NOW),
      ),
    ).toBe('INVALID_BOUND_CREDENTIAL_RESPONSE');
  });

  it('expiresAt is min(now+expiresIn, exp)', async () => {
    // exp earlier than now+expiresIn -> exp wins.
    const early = await mint({ jkt: JKT }, NOW / 1000 + 60);
    expect(
      parseDpopCredentials({ accessToken: early, tokenType: 'DPoP', expiresIn: 120, sessionId: 'h' }, 'body', JKT, NOW)
        .token.expiresAt,
    ).toBe(NOW + 60_000);
    // expiresIn earlier than exp -> now+expiresIn wins.
    const late = await mint({ jkt: JKT }, NOW / 1000 + 600);
    expect(
      parseDpopCredentials({ accessToken: late, tokenType: 'DPoP', expiresIn: 30, sessionId: 'h' }, 'body', JKT, NOW)
        .token.expiresAt,
    ).toBe(NOW + 30_000);
  });
});

describe('DPH-01 bound response profile and safe deadlines', () => {
  it.each([undefined, null, [], 'cnf', {}, { jkt: JKT, extra: true }, { jkt: JKT, jwk: {} }, { jwk: { kty: 'EC' } }])(
    'requires exactly the supported cnf.jkt object (%j)',
    async (cnf) => {
      const token = await mint(cnf, NOW / 1000 + 60);
      expect(codeOf(() => parseDpopCredentials(responseFor(token), 'body', JKT, NOW))).toBe(
        'INVALID_BOUND_CREDENTIAL_RESPONSE',
      );
    },
  );

  it.each(['A'.repeat(42), 'A'.repeat(42) + 'B', `${JKT}=`, `${JKT}\n`, 'not-a-thumbprint'])(
    'rejects noncanonical jkt even when the supplied key marker matches (%j)',
    async (jkt) => {
      const token = await mint({ jkt }, NOW / 1000 + 60);
      expect(codeOf(() => parseDpopCredentials(responseFor(token), 'body', jkt, NOW))).toBe(
        'INVALID_BOUND_CREDENTIAL_RESPONSE',
      );
    },
  );

  it.each([
    undefined,
    null,
    '9999999999',
    -1,
    NOW / 1000 + 60.5,
    Number.MAX_SAFE_INTEGER + 1,
    Math.floor(Number.MAX_SAFE_INTEGER / 1000) + 1,
    Number.MAX_SAFE_INTEGER,
  ])('rejects missing/malformed or unsafe exp before a shorter lifetime can hide it (%s)', async (exp) => {
    const token = await mint({ jkt: JKT }, exp);
    expect(codeOf(() => parseDpopCredentials(responseFor(token), 'body', JKT, NOW))).toBe(
      'INVALID_BOUND_CREDENTIAL_RESPONSE',
    );
  });

  it.each([NaN, Infinity, -Infinity, -1, NOW + 0.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an invalid clock before JWT expiry can hide it (%s)',
    async (now) => {
      const token = await mint({ jkt: JKT }, NOW / 1000 + 30);
      expect(codeOf(() => parseDpopCredentials(responseFor(token), 'body', JKT, now))).toBe(
        'INVALID_BOUND_CREDENTIAL_RESPONSE',
      );
    },
  );

  it.each([
    { name: 'lifetime multiplication', now: NOW, expiresIn: Math.floor(Number.MAX_SAFE_INTEGER / 1000) + 1 },
    { name: 'deadline addition', now: NOW, expiresIn: Math.floor(Number.MAX_SAFE_INTEGER / 1000) },
    { name: 'near-limit clock addition', now: Number.MAX_SAFE_INTEGER, expiresIn: 1 },
  ])('rejects unsafe $name even when the final JWT clamp would be safe', async ({ now, expiresIn }) => {
    const token = await mint({ jkt: JKT }, NOW / 1000 + 60);
    expect(codeOf(() => parseDpopCredentials(responseFor(token, expiresIn), 'body', JKT, now))).toBe(
      'INVALID_BOUND_CREDENTIAL_RESPONSE',
    );
  });

  it.each([0, NOW / 1000 - 1, NOW / 1000 + 60])(
    'retains a zero-lifetime response handle without creating a reusable peer credential (exp=%s)',
    async (exp) => {
      const accessToken = await mint({ jkt: JKT }, exp);
      const parsed = parseDpopCredentials(responseFor(accessToken, 0), 'body', JKT, NOW);
      expect(parsed.sessionId).toBe('rotated-handle');
      expect(parsed.token.expiresAt).toBe(Math.min(NOW, exp * 1000));
      expect(readPeerToken(parsed.token, JKT, parsed.token.generation, NOW)).toBeUndefined();
    },
  );

  it('accepts safe epoch/lifetime edges without extending the deadline', async () => {
    const exp = Math.floor(Number.MAX_SAFE_INTEGER / 1000);
    const token = await mint({ jkt: JKT }, exp);
    expect(parseDpopCredentials(responseFor(token, 1), 'body', JKT, exp * 1000 - 1000).token.expiresAt).toBe(
      exp * 1000,
    );
    expect(parseDpopCredentials(responseFor(token, 0), 'body', JKT, 0).token.expiresAt).toBe(0);
  });

  it.each([{}, { alg: '' }, { alg: 42 }, { alg: ['HS256'] }, { alg: 'none' }, { alg: 'HS256', b64: false }])(
    'requires a signed JWT header profile (%j)',
    async (header) => {
      const [, payload, signature] = (await mint({ jkt: JKT }, NOW / 1000 + 60)).split('.');
      const token = `${base64url.encode(JSON.stringify(header))}.${payload}.${signature}`;
      expect(codeOf(() => parseDpopCredentials(responseFor(token), 'body', JKT, NOW))).toBe(
        'INVALID_BOUND_CREDENTIAL_RESPONSE',
      );
    },
  );

  it('rejects malformed/noncanonical compact encoding but does not authenticate signatures', async () => {
    const [header, payload] = (await mint({ jkt: JKT }, NOW / 1000 + 60)).split('.');
    for (const token of [
      'opaque-token',
      `${header}.${payload}.`,
      `${header}.${payload}.AQ=`,
      `${header}.${payload}.AR`, // Nonzero unused base64url bits: same decoded bytes as AQ.
      `${header}.${payload}.A`, // No complete signature byte.
      `${header}.${payload}.AQ\n`,
    ]) {
      expect(codeOf(() => parseDpopCredentials(responseFor(token), 'body', JKT, NOW))).toBe(
        'INVALID_BOUND_CREDENTIAL_RESPONSE',
      );
    }
    // Canonical compact shape with an invalid signature still passes decoding.
    // The protected API, never this browser contract check, authenticates JWTs.
    const unauthenticated = `${header}.${payload}.AQ`;
    expect(parseDpopCredentials(responseFor(unauthenticated), 'body', JKT, NOW).token.accessToken).toBe(
      unauthenticated,
    );
  });

  it.each([undefined, '', 'injected-handle'])('rejects any cookie JSON sessionId property (%s)', async (sessionId) => {
    const accessToken = await mint({ jkt: JKT }, NOW / 1000 + 60);
    expect(
      codeOf(() =>
        parseDpopCredentials({ accessToken, tokenType: 'DPoP', expiresIn: 60, sessionId }, 'cookie', JKT, NOW),
      ),
    ).toBe('INVALID_BOUND_CREDENTIAL_RESPONSE');
  });
});

const bearerJwt = (claims: unknown = {}, header: unknown = { alg: 'HS256' }): string =>
  `${base64url.encode(JSON.stringify(header))}.${base64url.encode(JSON.stringify(claims))}.AQ`;

const bearerResponse = (accessToken: unknown, overrides: Record<string, unknown> = {}) => ({
  accessToken,
  tokenType: 'Bearer',
  expiresIn: 60,
  sessionId: 'rotated-handle',
  ...overrides,
});

const expectInvalidBearer = (run: () => unknown): void => {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(OidcVaultDpopClientError);
    expect(error).toMatchObject({
      code: 'INVALID_BEARER_CREDENTIAL_RESPONSE',
      message: 'An unbound Bearer credential response is required. Sign in again.',
      requiresLogin: true,
    });
    return;
  }
  throw new Error('expected INVALID_BEARER_CREDENTIAL_RESPONSE');
};

describe('OBEAR-02 parseBearerCredentials', () => {
  it.each(['opaque-app-token', 'opaque.part', 'opaque.with.four.parts', '!~+/=%:;[]{}()<>?\\|@#$^&*_-'])(
    'accepts header-safe opaque tokens (%s), without inventing a binding',
    (accessToken) => {
      const parsed = parseBearerCredentials(bearerResponse(accessToken), 'body', NOW);
      expect(parsed.sessionId).toBe('rotated-handle');
      expect(parsed.token).toMatchObject({ accessToken, tokenType: 'Bearer', expiresAt: NOW + 60_000 });
      expect(parsed.token.generation).not.toBe('');
      expect(Object.isFrozen(parsed.token)).toBe(true);
      expect('jkt' in parsed.token).toBe(false);
      expect('sessionId' in parsed.token).toBe(false);
    },
  );

  it('normalizes both omitted and explicitly undefined tokenType to exact Bearer without changing the input', () => {
    const omitted = { accessToken: 'opaque', expiresIn: 60, sessionId: 'handle' };
    expect(parseBearerCredentials(omitted, 'body', NOW).token.tokenType).toBe('Bearer');
    expect('tokenType' in omitted).toBe(false);
    const explicit = bearerResponse('opaque', { tokenType: undefined });
    expect(parseBearerCredentials(explicit, 'body', NOW).token.tokenType).toBe('Bearer');
    expect(explicit.tokenType).toBeUndefined();
  });

  it('accepts an unbound signed JWT with optional exp omitted, without requiring a thumbprint', async () => {
    const accessToken = await new SignJWT({ sub: 'alice' }).setProtectedHeader({ alg: 'HS256' }).sign(HMAC_SECRET);
    const parsed = parseBearerCredentials(bearerResponse(accessToken, { tokenType: undefined }), 'body', NOW);
    expect(parsed.token).toMatchObject({ accessToken, tokenType: 'Bearer', expiresAt: NOW + 60_000 });
    expect(parsed.token).not.toHaveProperty('jkt');
  });

  it.each(['DPoP', 'bearer', 'BEARER', 'Bearer ', '', null, 0, true, {}])(
    'rejects wrong/unknown direct tokenType (%j)',
    (tokenType) => {
      expectInvalidBearer(() => parseBearerCredentials(bearerResponse('opaque', { tokenType }), 'body', NOW));
    },
  );

  it.each([undefined, null, [], 42, 'response'])('rejects non-object responses (%j)', (value) => {
    expectInvalidBearer(() => parseBearerCredentials(value, 'body', NOW));
  });

  it.each([
    undefined,
    null,
    42,
    [],
    {},
    '',
    ' ',
    'a b',
    'a\tb',
    'a\r\nb',
    'token\n',
    'a\0b',
    'a\x7Fb',
    'a,b',
    'é',
    '☃',
  ])('rejects tokens unsafe for an Authorization header (%j)', (accessToken) => {
    expectInvalidBearer(() => parseBearerCredentials(bearerResponse(accessToken), 'body', NOW));
  });

  it.each([undefined, null, '', 42, []])('requires a nonempty body handle (%j)', (sessionId) => {
    expectInvalidBearer(() => parseBearerCredentials(bearerResponse('opaque', { sessionId }), 'body', NOW));
  });

  it('accepts cookie responses only without a sessionId property', () => {
    const response = { accessToken: 'opaque', expiresIn: 60 };
    const parsed = parseBearerCredentials(response, 'cookie', NOW);
    expect(parsed.token.tokenType).toBe('Bearer');
    expect('sessionId' in parsed).toBe(false);
    expectInvalidBearer(() => parseBearerCredentials(response, 'body', NOW));
  });

  it.each([undefined, null, '', 'injected-handle'])('rejects any cookie sessionId property (%j)', (sessionId) => {
    expectInvalidBearer(() => parseBearerCredentials(bearerResponse('opaque', { sessionId }), 'cookie', NOW));
  });

  it('also rejects inherited cookie handles', () => {
    const response = Object.assign(Object.create({ sessionId: undefined }), { accessToken: 'opaque', expiresIn: 60 });
    expectInvalidBearer(() => parseBearerCredentials(response, 'cookie', NOW));
  });

  it.each([undefined, null, '60', -1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects malformed lifetimes (%s)',
    (expiresIn) => {
      expectInvalidBearer(() => parseBearerCredentials(bearerResponse('opaque', { expiresIn }), 'body', NOW));
    },
  );

  it.each([NaN, Infinity, -Infinity, -1, NOW + 0.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects unsafe clocks before a JWT clamp can hide them (%s)',
    (now) => {
      expectInvalidBearer(() => parseBearerCredentials(bearerResponse(bearerJwt({ exp: 0 })), 'body', now));
    },
  );

  it.each([
    { name: 'lifetime multiplication', now: NOW, expiresIn: Math.floor(Number.MAX_SAFE_INTEGER / 1000) + 1 },
    { name: 'deadline addition', now: NOW, expiresIn: Math.floor(Number.MAX_SAFE_INTEGER / 1000) },
    { name: 'near-limit clock addition', now: Number.MAX_SAFE_INTEGER, expiresIn: 1 },
  ])('rejects unsafe $name before clamping', ({ now, expiresIn }) => {
    expectInvalidBearer(() =>
      parseBearerCredentials(bearerResponse(bearerJwt({ exp: 0 }), { expiresIn }), 'body', now),
    );
  });

  it.each([
    { accessToken: 'opaque', expiration: NOW },
    { accessToken: bearerJwt(), expiration: NOW },
    { accessToken: bearerJwt({ exp: 0 }), expiration: 0 },
    { accessToken: bearerJwt({ exp: NOW / 1000 - 1 }), expiration: NOW - 1000 },
    { accessToken: bearerJwt({ exp: NOW / 1000 + 60 }), expiration: NOW },
  ])('retains zero-lifetime rotated handles but no reusable peer token (%j)', ({ accessToken, expiration }) => {
    const parsed = parseBearerCredentials(bearerResponse(accessToken, { expiresIn: 0 }), 'body', NOW);
    expect(parsed.sessionId).toBe('rotated-handle');
    expect(parsed.token.expiresAt).toBe(expiration);
    expect(readBearerPeerToken(parsed.token, parsed.token.generation, NOW)).toBeUndefined();
  });

  it('accepts safe deadline edges and clamps only when JWT exp is present', () => {
    const exp = Math.floor(Number.MAX_SAFE_INTEGER / 1000);
    const parsed = parseBearerCredentials(
      bearerResponse(bearerJwt({ exp }), { expiresIn: 1 }),
      'body',
      exp * 1000 - 1000,
    );
    expect(parsed.token.expiresAt).toBe(exp * 1000);
    expect(parseBearerCredentials(bearerResponse('opaque', { expiresIn: 0 }), 'body', 0).token.expiresAt).toBe(0);
    expect(
      parseBearerCredentials(bearerResponse('opaque', { expiresIn: 0 }), 'body', Number.MAX_SAFE_INTEGER).token
        .expiresAt,
    ).toBe(Number.MAX_SAFE_INTEGER);
    expect(parseBearerCredentials(bearerResponse(bearerJwt()), 'body', NOW).token.expiresAt).toBe(NOW + 60_000);
    expect(
      parseBearerCredentials(bearerResponse(bearerJwt({ exp: NOW / 1000 + 30 })), 'body', NOW).token.expiresAt,
    ).toBe(NOW + 30_000);
    expect(
      parseBearerCredentials(bearerResponse(bearerJwt({ exp: NOW / 1000 + 600 })), 'body', NOW).token.expiresAt,
    ).toBe(NOW + 60_000);
  });

  it.each([
    null,
    '9999999999',
    -1,
    NOW / 1000 + 0.5,
    Number.MAX_SAFE_INTEGER + 1,
    Math.floor(Number.MAX_SAFE_INTEGER / 1000) + 1,
    Number.MAX_SAFE_INTEGER,
  ])('rejects any present unsafe JWT exp before a short response clamp (%s)', (exp) => {
    expectInvalidBearer(() =>
      parseBearerCredentials(bearerResponse(bearerJwt({ exp }), { expiresIn: 0 }), 'body', NOW),
    );
  });

  it.each([null, [], 'cnf', 0, false, {}, { jkt: JKT }, { jwk: {} }, { other: true }])(
    'rejects any present cnf, not merely recognized bindings (%j)',
    (cnf) => {
      expectInvalidBearer(() => parseBearerCredentials(bearerResponse(bearerJwt({ cnf })), 'body', NOW));
    },
  );

  it.each([{}, { alg: '' }, { alg: 42 }, { alg: ['HS256'] }, { alg: 'none' }, { alg: 'HS256', b64: false }, null, []])(
    'requires a signed JWT header profile (%j)',
    (header) => {
      expectInvalidBearer(() => parseBearerCredentials(bearerResponse(bearerJwt({}, header)), 'body', NOW));
    },
  );

  it('reserves every three-segment token for canonical signed-JWT validation, without authenticating signatures', () => {
    const [header, payload] = bearerJwt().split('.');
    for (const accessToken of [
      'opaque.not.jwt',
      '..',
      `${header}.${payload}.`,
      `${header}.${payload}.AQ=`,
      `${header}.${payload}.AR`,
      `${header}.${payload}.A`,
      `${header}.${base64url.encode('not-json')}.AQ`,
      `${header}.${base64url.encode('null')}.AQ`,
      `${header}.${base64url.encode('[]')}.AQ`,
    ]) {
      expectInvalidBearer(() => parseBearerCredentials(bearerResponse(accessToken), 'body', NOW));
    }
    // Canonical shape, deliberately invalid signature: authentication belongs to the API.
    expect(parseBearerCredentials(bearerResponse(bearerJwt()), 'body', NOW).token.accessToken).toBe(bearerJwt());
  });

  it('freezes the token and copies the profile without mutating or retaining the response user', () => {
    const user = { sub: 'alice', roles: ['reader'] };
    const input = bearerResponse('opaque', { user });
    const first = parseBearerCredentials(input, 'body', NOW).token;
    const second = parseBearerCredentials(input, 'body', NOW).token;
    expect(first.generation).not.toBe(second.generation);
    expect(first.user).toEqual(user);
    expect(first.user).not.toBe(user);
    expect(first.user?.roles).not.toBe(user.roles);
    user.sub = 'changed';
    user.roles.push('writer');
    expect(first.user).toEqual({ sub: 'alice', roles: ['reader'] });
    expect(Object.isFrozen(first)).toBe(true);
    expect(input).not.toHaveProperty('generation');
  });

  it.each([null, [], 'user', {}, { sub: 42 }, { sub: 'alice', uncloneable: () => {} }])(
    'uses fixed terminal errors for invalid/uncloneable user profiles (%j)',
    (user) => {
      expectInvalidBearer(() => parseBearerCredentials(bearerResponse('opaque', { user }), 'body', NOW));
    },
  );
});

describe('OBEAR-02 construction mode boundary', () => {
  it.each([null, 0, 1, 'false', 'true', {}, []])(
    'rejects nonboolean runtime dpop before other option/browser work (%j)',
    (dpop) => {
      const backendRead = vi.fn(() => {
        throw new Error('must not read other options');
      });
      const options = {
        dpop,
        get backendOrigin() {
          return backendRead();
        },
      } as unknown as OidcVaultSessionOptions;
      expect(() => createOidcVaultDpopSession(options)).toThrowError(new TypeError('dpop must be a boolean.'));
      expect(backendRead).not.toHaveBeenCalled();
    },
  );

  it('constructs immutable explicit false without DPoP-only browser features', () => {
    vi.stubGlobal('location', { origin: 'https://app.example.com' });
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('CryptoKey', undefined);
    vi.stubGlobal('sessionStorage', { getItem: () => null });
    const mode = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
    try {
      const session = createOidcVaultDpopSession({
        backendOrigin: 'https://api.example.com',
        get dpop() {
          return mode();
        },
      });
      expect(mode).toHaveBeenCalledTimes(1);
      expect(session.dpop).toBe(false);
      expect(Object.isFrozen(session)).toBe(true);
      session.dispose();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([undefined, true])(
    'snapshots default/true mode once and exposes an immutable true discriminator (%s)',
    (dpop) => {
      vi.stubGlobal('location', { origin: 'https://app.example.com' });
      vi.stubGlobal('isSecureContext', true);
      vi.stubGlobal('indexedDB', {});
      vi.stubGlobal('sessionStorage', { getItem: () => null });
      const mode = vi.fn().mockReturnValueOnce(dpop).mockReturnValue(false);
      try {
        const session = createOidcVaultDpopSession({
          backendOrigin: 'https://api.example.com',
          get dpop() {
            return mode();
          },
        });
        expect(mode).toHaveBeenCalledTimes(1);
        expect(session.dpop).toBe(true);
        expect(Object.isFrozen(session)).toBe(true);
        session.dispose();
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );
});
