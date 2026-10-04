import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';

import { parseDpopCredentials } from '../src/credentials';
import { OidcVaultDpopClientError } from '../src/errors';

const JKT = 'a'.repeat(43);
const WRONG_JKT = 'b'.repeat(43);
const NOW = 1_800_000_000_000;
const HMAC_SECRET = new TextEncoder().encode('0123456789abcdef0123456789abcdef'); // pragma: allowlist secret

const mint = (cnf: unknown, exp: number): Promise<string> =>
  new SignJWT({ cnf, exp }).setProtectedHeader({ alg: 'HS256' }).sign(HMAC_SECRET);

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
