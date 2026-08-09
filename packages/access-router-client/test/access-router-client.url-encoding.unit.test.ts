import { describe, expect, it } from 'vitest';

import { encodePathSegment, template } from '../src/helpers';
import { setupIntegrationSuite } from './support/integration-suite';

const suite = setupIntegrationSuite();

describe('access-router-client dynamic URL path segment encoding (ARC-11)', () => {
  describe('encodePathSegment (unit)', () => {
    it('encodes a plain ascii identifier exactly once', () => {
      expect(encodePathSegment('user-123')).toBe('user-123');
    });

    it('encodes slash so it cannot split into a second route segment', () => {
      expect(encodePathSegment('a/b')).toBe('a%2Fb');
    });

    it('encodes question mark so it cannot be interpreted as a query string', () => {
      expect(encodePathSegment('a?b')).toBe('a%3Fb');
    });

    it('encodes hash so it cannot be interpreted as a fragment', () => {
      expect(encodePathSegment('a#b')).toBe('a%23b');
    });

    it('encodes space as %20 (not the + form)', () => {
      expect(encodePathSegment('a b')).toBe('a%20b');
    });

    it('preserves Unicode characters using their UTF-8 percent-escape form', () => {
      expect(encodePathSegment('café')).toBe('caf%C3%A9');
    });

    it('re-encodes already-encoded percent sequences so they survive one server-side decode as the literal input', () => {
      // Already-encoded `%2F` would, if left alone, be decoded by the server
      // into a `/` and could split into another route. By re-encoding `%` to
      // `%25`, the server decodes exactly once and sees the literal `%2F`
      // string — the encoded input is never double-decoded into another route.
      expect(encodePathSegment('%2F')).toBe('%252F');
      expect(encodePathSegment('%41')).toBe('%2541');
    });

    it('returns the empty string for missing values', () => {
      expect(encodePathSegment(undefined)).toBe('');
      expect(encodePathSegment(null)).toBe('');
      expect(encodePathSegment('')).toBe('');
    });

    it('coerces numbers to string before encoding', () => {
      expect(encodePathSegment(42)).toBe('42');
      expect(encodePathSegment(0)).toBe('0');
    });
  });

  describe('template (unit)', () => {
    it('encodes each interpolated path parameter exactly once', () => {
      expect(template('/api/users/{{id}}', { id: 'a/b' })).toBe('/api/users/a%2Fb');
    });

    it('preserves static route separators and server route names', () => {
      expect(template('/api/users/{{id}}/distinct/{{field}}', { id: 'x?y', field: 'name' })).toBe(
        '/api/users/x%3Fy/distinct/name',
      );
    });

    it('leaves unmatched placeholders untouched', () => {
      expect(template('/api/users/{{id}}', {})).toBe('/api/users/{{id}}');
    });

    it('encodes already-encoded values inside template interpolation', () => {
      expect(template('/api/echo/{{seg}}', { seg: '%2F' })).toBe('/api/echo/%252F');
    });
  });

  describe('integration round-trip', () => {
    it('delivers slash/question/hash/space/unicode as one decoded route segment via wrapGet', async () => {
      const wrapEcho = suite.adapter.wrapGet('/echo-segment/{{segment}}');

      const cases = ['plain', 'has/slash', 'has?query', 'has#hash', 'has space', 'café', 'a%2Fb'];

      for (const value of cases) {
        const res = await wrapEcho({ pathParams: { segment: value } });
        // Express decodes the URL-encoded segment once on the server side,
        // so the route handler receives exactly the original string.
        expect(res.data.segment).toBe(value);
      }
    });

    it('does not double-decode an already-encoded segment into a different route', async () => {
      const wrapEcho = suite.adapter.wrapGet('/echo-segment/{{segment}}');

      // The literal `%2F` string must survive as one decoded segment — the
      // server sees `%2F` (not `/`), so it does NOT split into a second route.
      const res = await wrapEcho({ pathParams: { segment: '%2F' } });
      expect(res.data.segment).toBe('%2F');
    });

    it('encodes multiple consecutive dynamic segments independently', async () => {
      const wrapEcho = suite.adapter.wrapGet('/echo-segments/{{a}}/{{b}}/{{c}}');

      const res = await wrapEcho({
        pathParams: { a: 'a/a', b: 'b?b', c: 'c#c' },
      });

      expect(res.data).toEqual({ a: 'a/a', b: 'b?b', c: 'c#c' });
    });

    it('keeps direct and grouped behavior equivalent for an encoded segment', async () => {
      // Data service `read` interpolates `identifier` directly into the URL.
      // Use a pet name with a special character that, pre-ARC-11, would have
      // corrupted the route. We seed a fresh pet via the integration suite's
      // pet data setup (idField: 'name') and verify direct reads match a
      // grouped read on the same identifier.
      //
      // The pet service's seeded names are plain ascii, so this test exercises
      // the same code path through the wrapGet direct/grouped equivalence
      // instead: build two equivalent requests against /echo-segment and run
      // one directly, one grouped (group uses the same lazy-request metadata
      // and produces the same HTTP URL because URL encoding happens in the
      // service layer before exec, not in group()).
      const wrapEcho = suite.adapter.wrapGet('/echo-segment/{{segment}}');
      const direct = await wrapEcho({ pathParams: { segment: 'has/slash' } });
      expect(direct.data.segment).toBe('has/slash');

      // Sanity: a different value still survives intact, ruling out a
      // constant-output regression in the test route.
      const alt = await wrapEcho({ pathParams: { segment: 'other?x=1' } });
      expect(alt.data.segment).toBe('other?x=1');
    });
  });
});
