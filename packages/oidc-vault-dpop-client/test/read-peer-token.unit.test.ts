import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';

import { readPeerToken } from '../src/credentials';

const JKT = 'a'.repeat(43);
const WRONG_JKT = 'b'.repeat(43);
const NOW = 1_800_000_000_000;
const GENERATION = '11111111-2222-4333-8444-555555555555';
const HMAC_SECRET = new TextEncoder().encode('0123456789abcdef0123456789abcdef'); // pragma: allowlist secret

const mint = (cnf: unknown, exp: number): Promise<string> =>
  new SignJWT({ cnf, exp }).setProtectedHeader({ alg: 'HS256' }).sign(HMAC_SECRET);

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
});
