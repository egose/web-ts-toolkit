import { randomBytes } from 'node:crypto';

import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';

import { parseDpopCredentials } from '../src/auth/credentials';

const JKT = 'a'.repeat(43);
const jwt = (cnf: unknown, exp = 1_800_000_060) =>
  new SignJWT({ cnf, exp }).setProtectedHeader({ alg: 'HS256' }).sign(randomBytes(32));

describe('DBJWT-10 strict bound wire response contract', () => {
  it.each(['body', 'cookie'] as const)(
    'requires exact DPoP + matching signed-JWT cnf and preserves memory-only token (%s)',
    async (transport) => {
      const accessToken = await jwt({ jkt: JKT });
      const parsed = parseDpopCredentials(
        {
          accessToken,
          tokenType: 'DPoP',
          expiresIn: 120,
          ...(transport === 'body' ? { sessionId: 'handle' } : {}),
          user: { sub: 'user' },
        },
        transport,
        JKT,
        1_800_000_000_000,
      );
      expect(parsed.token).toMatchObject({ accessToken, tokenType: 'DPoP', jkt: JKT, expiresAt: 1_800_000_060_000 });
      expect(Object.isFrozen(parsed.token)).toBe(true);
      expect(parsed.sessionId).toBe(transport === 'body' ? 'handle' : undefined);
    },
  );
  it.each(['Bearer', 'dpop', undefined, 'DPoP '])(
    'rejects %j token type instead of falling back',
    async (tokenType) => {
      expect(() =>
        parseDpopCredentials(
          { accessToken: 'x.y.z', tokenType, expiresIn: 60, sessionId: 'handle' },
          'body',
          JKT,
          Date.now(),
        ),
      ).toThrow('DPoP JWT');
    },
  );
  it.each([undefined, null, {}, { jkt: 'b'.repeat(43) }])('rejects absent/malformed/wrong-key cnf %#', async (cnf) => {
    const accessToken = await jwt(cnf);
    expect(() =>
      parseDpopCredentials(
        { accessToken, tokenType: 'DPoP', expiresIn: 60, sessionId: 'handle' },
        'body',
        JKT,
        Date.now(),
      ),
    ).toThrow('DPoP JWT');
  });
  it('rejects cookie JSON exposing a handle and body JSON omitting it', async () => {
    const accessToken = await jwt({ jkt: JKT });
    expect(() =>
      parseDpopCredentials(
        { accessToken, tokenType: 'DPoP', expiresIn: 60, sessionId: 'handle' },
        'cookie',
        JKT,
        Date.now(),
      ),
    ).toThrow('DPoP JWT');
    expect(() =>
      parseDpopCredentials({ accessToken, tokenType: 'DPoP', expiresIn: 60 }, 'body', JKT, Date.now()),
    ).toThrow('DPoP JWT');
  });
  it('accepts an expired JWT result for explicit refresh-after-expiry logic without bearer downgrade', async () => {
    const accessToken = await jwt({ jkt: JKT }, 1);
    expect(
      parseDpopCredentials({ accessToken, tokenType: 'DPoP', expiresIn: 0 }, 'cookie', JKT, Date.now()).token.expiresAt,
    ).toBe(1000);
  });
});
