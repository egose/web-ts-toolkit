import { base64url, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';

import { parseDpopCredentials, readPeerToken } from '../src/credentials';
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
