import { describe, expect, it } from 'vitest';

import { readDpopChallengeError } from '../src/auth-challenge';

describe('DPH-04 bounded HTTP authentication grammar', () => {
  it.each([
    '\xa0DPoP error="invalid_token"',
    'DPoP error="invalid_token"\xa0',
    'DPoP error="invalid_token",\xa0Bearer',
  ])('does not normalize non-HTTP whitespace into an actionable challenge: %j', (header) => {
    expect(readDpopChallengeError(header)).toBeUndefined();
  });

  it('permits HTTP OWS and quoted-string escapes/obs-text without interpreting a quoted scheme', () => {
    expect(
      readDpopChallengeError(
        '\t Basic realm="caf\xe9, \\"DPoP\\"", DPoP __proto__=ignored, ALGS\t=\tES256, error="invalid\\_token" \t',
      ),
    ).toBe('invalid_token');
    expect(readDpopChallengeError('Bearer realm="literal, DPoP error=\\"invalid_token\\""')).toBeUndefined();
  });

  it.each(['\0', '\r', '\n', '\v', '\f', '\x7f', '\u0100'])('rejects forbidden quoted bytes %j', (character) => {
    expect(readDpopChallengeError(`DPoP error="invalid_token", realm="${character}"`)).toBeUndefined();
  });

  it('accepts exactly 8,192 characters and rejects one over the bound', () => {
    const prefix = 'DPoP error="invalid_token", realm="';
    const header = `${prefix}${'x'.repeat(8192 - prefix.length - 1)}"`;
    expect(readDpopChallengeError(header)).toBe('invalid_token');
    expect(readDpopChallengeError(`${header} `)).toBeUndefined();
  });

  it.each([
    null,
    '',
    ' ',
    ',DPoP error=invalid_token',
    'DPoP\terror=invalid_token',
    'DPoP error="invalid_token", realm="unterminated\\',
    'DPoP error="invalid_token", Bearer abc==, error="invalid_token"',
    'DPoP error="invalid_token", Bearer error="unterminated',
    'Bearer error="invalid_token", DPoP error*=invalid_token',
    'DPoP error="invalid_token", algs=ES256 ES384',
  ])('rejects incomplete or ambiguous lists: %j', (header) => {
    expect(readDpopChallengeError(header)).toBeUndefined();
  });
});
