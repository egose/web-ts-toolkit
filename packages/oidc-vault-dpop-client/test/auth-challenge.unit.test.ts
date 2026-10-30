import { describe, expect, it } from 'vitest';

import { readBearerChallengeError, readDpopChallengeError } from '../src/auth-challenge';

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

describe('OBEAR-04 bounded Bearer authentication grammar', () => {
  it.each([
    'Bearer error="invalid_token"',
    'bEaReR   realm="api", ERROR\t=\tinvalid_token',
    'DPoP error="invalid_dpop_proof", Bearer realm="api", error=invalid_token',
    'Basic realm="caf\xe9, \\"quoted\\"", Bearer __proto__=ignored, error="invalid\\_token", DPoP',
    'Negotiate abc+/==, Bearer error="invalid_token", DPoP error="use_dpop_nonce"',
  ])('selects only the active scheme after parsing the whole field: %s', (header) => {
    expect(readBearerChallengeError(header)).toBe('invalid_token');
  });

  it.each([
    null,
    '',
    ' ',
    'DPoP error="invalid_token"',
    'DPoP error="invalid_token", Bearer realm="api"',
    'Bearer realm="literal, DPoP error=\\"invalid_token\\""',
    'DPoP realm="literal, Bearer error=\\"invalid_token\\""',
    'Bearer error="INVALID_TOKEN"',
    'Bearer error="insufficient_scope"',
    'Bearer error="use_dpop_nonce"',
    'Bearer error="invalid_dpop_proof"',
    'Bearer invalid_token',
    'Bearer error=',
    'Bearer error*=invalid_token',
    'Bearer\terror=invalid_token',
    '\xa0Bearer error="invalid_token"',
    'Bearer error="invalid_token"\xa0',
    ',Bearer error="invalid_token"',
    'Bearer error="invalid_token",',
    'Bearer error="invalid_token",, realm="api"',
    'Bearer error="invalid_token", ERROR="invalid_token"',
    'Bearer error="invalid_token", realm="api", REALM="other"',
    'Bearer error="invalid_token", Bearer error="invalid_token"',
    'Bearer error="invalid_token", bEaReR',
    'Bearer error="invalid_token"; realm="api"',
    'Bearer error="invalid_token" realm="api"',
    'Bearer error="invalid_token", realm=api other',
    'Bearer error="invalid_token", Basic realm="unterminated',
    'Bearer error="invalid_token", DPoP realm="one" trailing',
    'Bearer error="invalid_token", DPoP error="one", ERROR="two"',
    'Bearer error="invalid_token", Basic abc==, error="invalid_token"',
    'Bearer error="invalid_token", broken=@',
    'Bearer error="invalid_token", realm="unterminated\\',
  ])('does not recover from unrelated, ambiguous or malformed whole fields: %j', (header) => {
    expect(readBearerChallengeError(header)).toBeUndefined();
  });

  it.each(['\0', '\r', '\n', '\v', '\f', '\x7f', '\u0100'])('rejects forbidden quoted bytes %j', (character) => {
    expect(readBearerChallengeError(`Bearer error="invalid_token", realm="${character}"`)).toBeUndefined();
  });

  it('keeps the exact 8,192-character bound for the entire mixed field', () => {
    const prefix = 'DPoP error="invalid_token", Bearer error="invalid_token", realm="';
    const header = `${prefix}${'x'.repeat(8192 - prefix.length - 1)}"`;
    expect(readBearerChallengeError(header)).toBe('invalid_token');
    expect(readBearerChallengeError(`${header} `)).toBeUndefined();
    expect(readDpopChallengeError(header)).toBe('invalid_token');
    expect(readDpopChallengeError(`${header} `)).toBeUndefined();
  });

  it('isolates selected errors in both directions without substring recovery', () => {
    const header = 'Bearer error="insufficient_scope", DPoP error="invalid_token"';
    expect(readBearerChallengeError(header)).toBeUndefined();
    expect(readDpopChallengeError(header)).toBe('invalid_token');
    const inverse = 'DPoP error="invalid_dpop_proof", Bearer error="invalid_token"';
    expect(readBearerChallengeError(inverse)).toBe('invalid_token');
    expect(readDpopChallengeError(inverse)).toBeUndefined();
  });
});
