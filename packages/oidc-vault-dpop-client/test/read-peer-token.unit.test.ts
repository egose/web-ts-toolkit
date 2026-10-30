import { base64url, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';

import { parseBearerCredentials, readBearerPeerToken, readPeerToken } from '../src/credentials';

const JKT = 'A'.repeat(43);
const WRONG_JKT = 'B'.repeat(42) + 'A';
const NOW = 1_800_000_000_000;
const GENERATION = '11111111-2222-4333-8444-555555555555';
const HMAC_SECRET = new TextEncoder().encode('0123456789abcdef0123456789abcdef'); // pragma: allowlist secret

const mint = (cnf: unknown, exp: unknown): Promise<string> => {
  const claims: Record<string, unknown> = { cnf, exp };
  return new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).sign(HMAC_SECRET);
};

const candidate = (accessToken: string, overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  accessToken,
  tokenType: 'DPoP',
  expiresAt: NOW + 60_000,
  jkt: JKT,
  generation: GENERATION,
  ...overrides,
});

describe('AREA-02 readPeerToken', () => {
  it('adopts a matching peer token with the channel generation', async () => {
    const accessToken = await mint({ jkt: JKT }, NOW / 1000 + 600);
    const adopted = readPeerToken(candidate(accessToken), JKT, GENERATION, NOW);
    expect(adopted).toMatchObject({ accessToken, tokenType: 'DPoP', jkt: JKT, generation: GENERATION });
    expect(Object.isFrozen(adopted)).toBe(true);
  });

  it('rejects wrong jkt', async () => {
    const accessToken = await mint({ jkt: JKT }, NOW / 1000 + 600);
    expect(readPeerToken(candidate(accessToken), WRONG_JKT, GENERATION, NOW)).toBeUndefined();
  });

  it('rejects stale generation', async () => {
    const accessToken = await mint({ jkt: JKT }, NOW / 1000 + 600);
    expect(readPeerToken(candidate(accessToken), JKT, 'other-generation', NOW)).toBeUndefined();
  });

  it('rejects expired peer expiry', async () => {
    const accessToken = await mint({ jkt: JKT }, NOW / 1000 + 600);
    expect(readPeerToken(candidate(accessToken, { expiresAt: NOW }), JKT, GENERATION, NOW)).toBeUndefined();
    expect(readPeerToken(candidate(accessToken, { expiresAt: NOW - 1 }), JKT, GENERATION, NOW)).toBeUndefined();
  });

  it('rejects non-DPoP tokenType', async () => {
    const accessToken = await mint({ jkt: JKT }, NOW / 1000 + 600);
    expect(readPeerToken(candidate(accessToken, { tokenType: 'Bearer' }), JKT, GENERATION, NOW)).toBeUndefined();
  });

  it('rejects non-object payloads', () => {
    expect(readPeerToken(null, JKT, GENERATION, NOW)).toBeUndefined();
    expect(readPeerToken('token', JKT, GENERATION, NOW)).toBeUndefined();
    expect(readPeerToken(42, JKT, GENERATION, NOW)).toBeUndefined();
  });

  it('rejects a peer JWT whose cnf.jkt does not match', async () => {
    const accessToken = await mint({ jkt: WRONG_JKT }, NOW / 1000 + 600);
    expect(readPeerToken(candidate(accessToken), JKT, GENERATION, NOW)).toBeUndefined();
  });

  it('clamps expiry to the JWT exp when the peer expiry is later', async () => {
    const accessToken = await mint({ jkt: JKT }, NOW / 1000 + 30);
    const adopted = readPeerToken(candidate(accessToken, { expiresAt: NOW + 600_000 }), JKT, GENERATION, NOW);
    expect(adopted?.expiresAt).toBe(NOW + 30_000);
  });

  it.each([NOW / 1000 - 1, NOW / 1000])('rejects expired JWT exp=%s despite a future peer envelope', async (exp) => {
    const accessToken = await mint({ jkt: JKT }, exp);
    expect(readPeerToken(candidate(accessToken), JKT, GENERATION, NOW)).toBeUndefined();
  });

  it.each([undefined, NOW / 1000 + 60.5, Math.floor(Number.MAX_SAFE_INTEGER / 1000) + 1])(
    'rejects invalid JWT expiry even with a valid shorter envelope (%s)',
    async (exp) => {
      const accessToken = await mint({ jkt: JKT }, exp);
      expect(readPeerToken(candidate(accessToken), JKT, GENERATION, NOW)).toBeUndefined();
    },
  );

  it.each([NaN, Infinity, -Infinity, -1, NOW + 0.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid peer clocks (%s)',
    async (now) => {
      const accessToken = await mint({ jkt: JKT }, NOW / 1000 + 30);
      expect(readPeerToken(candidate(accessToken), JKT, GENERATION, now)).toBeUndefined();
    },
  );

  it.each([NaN, Infinity, -1, NOW + 0.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects unsafe envelope deadlines (%s)',
    async (expiresAt) => {
      const accessToken = await mint({ jkt: JKT }, NOW / 1000 + 30);
      expect(readPeerToken(candidate(accessToken, { expiresAt }), JKT, GENERATION, NOW)).toBeUndefined();
    },
  );

  it.each([undefined, 'injected-cookie-handle'])('rejects a peer sessionId property (%s)', async (sessionId) => {
    const accessToken = await mint({ jkt: JKT }, NOW / 1000 + 600);
    expect(readPeerToken(candidate(accessToken, { sessionId }), JKT, GENERATION, NOW)).toBeUndefined();
  });

  it('requires the same exact canonical confirmation profile as direct responses', async () => {
    const extended = await mint({ jkt: JKT, extra: true }, NOW / 1000 + 600);
    expect(readPeerToken(candidate(extended), JKT, GENERATION, NOW)).toBeUndefined();
    const jkt = 'A'.repeat(42) + 'B';
    const noncanonical = await mint({ jkt }, NOW / 1000 + 600);
    expect(readPeerToken(candidate(noncanonical, { jkt }), jkt, GENERATION, NOW)).toBeUndefined();
  });

  it('preserves a live subsecond envelope deadline without rounding it up', async () => {
    const accessToken = await mint({ jkt: JKT }, NOW / 1000 + 600);
    expect(readPeerToken(candidate(accessToken, { expiresAt: NOW + 1 }), JKT, GENERATION, NOW)?.expiresAt).toBe(
      NOW + 1,
    );
  });

  it('clamps a safe far-future envelope directly without inventing an overflowing rounded lifetime', async () => {
    const accessToken = await mint({ jkt: JKT }, NOW / 1000 + 30);
    expect(
      readPeerToken(candidate(accessToken, { expiresAt: Number.MAX_SAFE_INTEGER }), JKT, GENERATION, NOW)?.expiresAt,
    ).toBe(NOW + 30_000);
  });
});

const bearerJwt = (claims: unknown = {}, header: unknown = { alg: 'HS256' }): string =>
  `${base64url.encode(JSON.stringify(header))}.${base64url.encode(JSON.stringify(claims))}.AQ`;

const bearerCandidate = (accessToken: unknown, overrides: Record<string, unknown> = {}) => ({
  accessToken,
  tokenType: 'Bearer',
  expiresAt: NOW + 60_000,
  generation: GENERATION,
  ...overrides,
});

describe('OBEAR-02 readBearerPeerToken', () => {
  it.each(['opaque', 'opaque.part', 'opaque.with.four.parts', bearerJwt(), bearerJwt({ exp: NOW / 1000 + 600 })])(
    'adopts only a live same-generation unbound token (%s)',
    (accessToken) => {
      const adopted = readBearerPeerToken(bearerCandidate(accessToken), GENERATION, NOW);
      expect(adopted).toMatchObject({
        accessToken,
        tokenType: 'Bearer',
        expiresAt: NOW + 60_000,
        generation: GENERATION,
      });
      expect(Object.isFrozen(adopted)).toBe(true);
      expect(adopted).not.toHaveProperty('jkt');
      expect(adopted).not.toHaveProperty('sessionId');
    },
  );

  it('accepts the normalized direct token, not its raw omitted-type response', () => {
    const raw = { accessToken: 'opaque', expiresIn: 60 };
    const { token } = parseBearerCredentials(raw, 'cookie', NOW);
    expect(readBearerPeerToken(token, token.generation, NOW)?.tokenType).toBe('Bearer');
    expect(
      readBearerPeerToken({ ...raw, expiresAt: NOW + 60_000, generation: GENERATION }, GENERATION, NOW),
    ).toBeUndefined();
  });

  it.each(['DPoP', 'bearer', 'BEARER', 'Bearer ', '', undefined, null, 0])(
    'requires exact peer tokenType (%j)',
    (tokenType) => {
      expect(readBearerPeerToken(bearerCandidate('opaque', { tokenType }), GENERATION, NOW)).toBeUndefined();
    },
  );

  it.each([undefined, null, '', 'stale-generation', 42])(
    'rejects absent or stale peer generations (%j)',
    (generation) => {
      expect(readBearerPeerToken(bearerCandidate('opaque', { generation }), GENERATION, NOW)).toBeUndefined();
    },
  );

  it('requires a nonempty expected current generation, not just two equal empty markers', () => {
    expect(readBearerPeerToken(bearerCandidate('opaque', { generation: '' }), '', NOW)).toBeUndefined();
  });

  it.each([undefined, null, '', JKT])('forbids any peer jkt property (%j)', (jkt) => {
    expect(readBearerPeerToken(bearerCandidate('opaque', { jkt }), GENERATION, NOW)).toBeUndefined();
  });

  it.each([undefined, null, '', 'injected-handle'])('forbids any peer sessionId property (%j)', (sessionId) => {
    expect(readBearerPeerToken(bearerCandidate('opaque', { sessionId }), GENERATION, NOW)).toBeUndefined();
  });

  it('rejects inherited peer binding/handle fields and a real DPoP envelope', async () => {
    for (const field of ['jkt', 'sessionId']) {
      const value = Object.assign(Object.create({ [field]: undefined }), bearerCandidate('opaque'));
      expect(readBearerPeerToken(value, GENERATION, NOW)).toBeUndefined();
    }
    expect(readBearerPeerToken(candidate(await mint({ jkt: JKT }, NOW / 1000 + 60)), GENERATION, NOW)).toBeUndefined();
    expect(readPeerToken(bearerCandidate('opaque'), JKT, GENERATION, NOW)).toBeUndefined();
  });

  it.each([undefined, null, [], 42, 'token'])('ignores non-object payloads (%j)', (value) => {
    expect(readBearerPeerToken(value, GENERATION, NOW)).toBeUndefined();
  });

  it.each([undefined, null, 42, '', 'a b', 'a\tb', 'a\r\nb', 'token\n', 'a\0b', 'a\x7Fb', 'a,b', 'é'])(
    'ignores header-unsafe tokens (%j)',
    (accessToken) => {
      expect(readBearerPeerToken(bearerCandidate(accessToken), GENERATION, NOW)).toBeUndefined();
    },
  );

  it.each([NaN, Infinity, -Infinity, -1, NOW + 0.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects unsafe peer clocks (%s)',
    (now) => {
      expect(readBearerPeerToken(bearerCandidate('opaque'), GENERATION, now)).toBeUndefined();
    },
  );

  it.each([
    undefined,
    null,
    '1800000060000',
    NaN,
    Infinity,
    -Infinity,
    -1,
    NOW + 0.5,
    Number.MAX_SAFE_INTEGER + 1,
    NOW - 1,
    NOW,
  ])('rejects malformed/expired envelope deadlines before JWT clamping (%s)', (expiresAt) => {
    expect(
      readBearerPeerToken(bearerCandidate(bearerJwt({ exp: NOW / 1000 + 30 }), { expiresAt }), GENERATION, NOW),
    ).toBeUndefined();
  });

  it('preserves subsecond envelopes and safe far-future deadlines without inventing a lifetime', () => {
    expect(readBearerPeerToken(bearerCandidate('opaque', { expiresAt: NOW + 1 }), GENERATION, NOW)?.expiresAt).toBe(
      NOW + 1,
    );
    expect(
      readBearerPeerToken(bearerCandidate('opaque', { expiresAt: Number.MAX_SAFE_INTEGER }), GENERATION, NOW)
        ?.expiresAt,
    ).toBe(Number.MAX_SAFE_INTEGER);
    expect(
      readBearerPeerToken(
        bearerCandidate(bearerJwt({ exp: NOW / 1000 + 30 }), { expiresAt: Number.MAX_SAFE_INTEGER }),
        GENERATION,
        NOW,
      )?.expiresAt,
    ).toBe(NOW + 30_000);
    expect(
      readBearerPeerToken(
        bearerCandidate(bearerJwt({ exp: NOW / 1000 + 600 }), { expiresAt: NOW + 1 }),
        GENERATION,
        NOW,
      )?.expiresAt,
    ).toBe(NOW + 1);
  });

  it.each([0, NOW / 1000 - 1, NOW / 1000])('rejects expired JWTs despite live envelopes (exp=%s)', (exp) => {
    expect(readBearerPeerToken(bearerCandidate(bearerJwt({ exp })), GENERATION, NOW)).toBeUndefined();
  });

  it.each([
    null,
    '1800000060',
    -1,
    NOW / 1000 + 0.5,
    Math.floor(Number.MAX_SAFE_INTEGER / 1000) + 1,
    Number.MAX_SAFE_INTEGER,
  ])('rejects present unsafe JWT expiry before the envelope clamp (%s)', (exp) => {
    expect(readBearerPeerToken(bearerCandidate(bearerJwt({ exp })), GENERATION, NOW)).toBeUndefined();
  });

  it.each([null, [], {}, false, 0, 'binding', { jkt: JKT }, { jwk: {} }])(
    'ignores every JWT with a present cnf (%j)',
    (cnf) => {
      expect(readBearerPeerToken(bearerCandidate(bearerJwt({ cnf })), GENERATION, NOW)).toBeUndefined();
    },
  );

  it.each([{}, { alg: '' }, { alg: 'none' }, { alg: 42 }, { alg: 'HS256', b64: false }])(
    'ignores invalid signed-JWT headers (%j)',
    (header) => {
      expect(readBearerPeerToken(bearerCandidate(bearerJwt({}, header)), GENERATION, NOW)).toBeUndefined();
    },
  );

  it('never treats malformed three-segment JWT candidates as opaque', () => {
    const [header, payload] = bearerJwt().split('.');
    for (const accessToken of [
      'not.a.jwt',
      '..',
      `${header}.${payload}.`,
      `${header}.${payload}.AQ=`,
      `${header}.${payload}.AR`,
      `${header}.${payload}.A`,
      `${header}.${base64url.encode('[]')}.AQ`,
    ]) {
      expect(readBearerPeerToken(bearerCandidate(accessToken), GENERATION, NOW)).toBeUndefined();
    }
  });

  it('copies profiles and treats malformed/uncloneable peer users as advisory failures', () => {
    const user = { sub: 'alice', roles: ['reader'] };
    const adopted = readBearerPeerToken(bearerCandidate('opaque', { user }), GENERATION, NOW);
    expect(adopted?.user).not.toBe(user);
    expect(adopted?.user?.roles).not.toBe(user.roles);
    user.roles.push('writer');
    expect(adopted?.user).toEqual({ sub: 'alice', roles: ['reader'] });
    for (const invalid of [null, [], {}, { sub: 42 }, { sub: 'alice', uncloneable: () => {} }]) {
      expect(readBearerPeerToken(bearerCandidate('opaque', { user: invalid }), GENERATION, NOW)).toBeUndefined();
    }
    expect(
      readBearerPeerToken(
        {
          get accessToken() {
            throw new Error('advisory');
          },
        },
        GENERATION,
        NOW,
      ),
    ).toBeUndefined();
  });
});
